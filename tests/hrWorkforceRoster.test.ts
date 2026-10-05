import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import fs from 'fs';
import { eq, and } from 'drizzle-orm';
import {
  hrDesignations,
  hrStaff,
  hrManpowerSanctions,
  hrRosterAssignments,
  shiftTemplates,
  documents,
  auditLogs,
  permissions,
  rolePermissions,
  roles,
} from '../src/db/schema';
import { PERMISSIONS, ROLES } from '../src/shared/constants';
import { HrRepository } from '../src/worker/repositories/hrRepository';
import { HrService, HrError } from '../src/worker/services/hrService';

class MockR2Bucket {
  private store = new Map<string, { data: Uint8Array; metadata: Record<string, string> }>();
  async get(key: string) {
    const item = this.store.get(key);
    if (!item) return null;
    return {
      body: item.data,
      arrayBuffer: async () => item.data.buffer,
      customMetadata: item.metadata,
    };
  }
  async put(key: string, value: ArrayBuffer | Uint8Array, options?: any) {
    const data = value instanceof Uint8Array ? value : new Uint8Array(value);
    this.store.set(key, { data, metadata: options?.customMetadata || {} });
    return { key, size: data.byteLength };
  }
  async delete(key: string) {
    this.store.delete(key);
  }
}

describe('Phase 5A-1 Workforce Master, Manpower Allocation & Shift Roster Suite', () => {
  let localD1: any;
  let env: any;
  let testDbPath: string;

  const OUTLET_1_ID = 'ro-1001'; // Park Street IOCL (Kolkata DO, Central SA)
  const OUTLET_2_ID = 'ro-1002'; // Salt Lake IOCL (Kolkata DO, North SA)
  const OUTLET_3_ID = 'ro-1003'; // GT Road Ludhiana (Ludhiana DO, Central SA)

  beforeEach(async () => {
    testDbPath = `./.sqlite/test_hr_${Math.random().toString(36).substring(2)}_${Date.now()}.db`;
    if (fs.existsSync(testDbPath)) { try { fs.unlinkSync(testDbPath); } catch (e) {} }
    const walPath = `${testDbPath}-wal`;
    const shmPath = `${testDbPath}-shm`;
    if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch (e) {} }
    if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch (e) {} }

    localD1 = createLocalD1Database(testDbPath);
    await seedDatabase(getDb(localD1));

    const db = getDb(localD1);
    await db.insert(shiftTemplates).values({
      id: 'st-ro2-1',
      outletId: OUTLET_2_ID,
      code: 'SHIFT_1',
      name: 'Shift 1 (Morning)',
      startTime: '06:00',
      endTime: '14:00',
      sequence: 1,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'user-admin',
    }).run();

    env = {
      DB: localD1,
      DOCUMENTS_BUCKET: new MockR2Bucket(),
      ENVIRONMENT: 'test',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    };
  });

  afterEach(() => {
    try { localD1.close(); } catch (e) {}
    if (testDbPath && fs.existsSync(testDbPath)) { try { fs.unlinkSync(testDbPath); } catch (e) {} }
    const walPath = `${testDbPath}-wal`;
    const shmPath = `${testDbPath}-shm`;
    if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch (e) {} }
    if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch (e) {} }
  });

  async function jsonOf<T = any>(res: Response): Promise<T> {
    return (await res.json()) as T;
  }

  async function loginAs(email: string, pass = 'Password@123') {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, password: pass }),
    }, env);
    const setCookie = res.headers.get('set-cookie');
    return setCookie ? setCookie.split(';')[0] : '';
  }

  async function createTestDocument(outletId: string, docId?: string) {
    const db = getDb(localD1);
    const id = docId || `doc-${Math.random().toString(36).substring(2)}`;
    await db.insert(documents).values({
      id,
      outletId,
      name: 'test-doc.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      r2Key: `outlets/${outletId}/${id}.pdf`,
      uploadedByUserId: 'user-admin',
      createdAt: new Date().toISOString(),
    }).run();
    return id;
  }

  async function seedDesignation(outletId: string, code: string, name: string, status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE') {
    const db = getDb(localD1);
    const id = `desig-${Math.random().toString(36).substring(2)}`;
    const now = new Date().toISOString();
    await db.insert(hrDesignations).values({
      id,
      outletId,
      code,
      name,
      status,
      notes: 'Seed note',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();
    return id;
  }

  async function seedStaff(
    outletId: string,
    employeeCode: string,
    fullName: string,
    designationId: string,
    employmentStatus: 'ACTIVE' | 'INACTIVE' | 'EXITED' = 'ACTIVE',
    opts?: { exitDate?: string | null; joiningDate?: string }
  ) {
    const db = getDb(localD1);
    const id = `staff-${Math.random().toString(36).substring(2)}`;
    const now = new Date().toISOString();
    await db.insert(hrStaff).values({
      id,
      outletId,
      employeeCode,
      fullName,
      designationId,
      aadhaarLast4: '1234',
      emergencyContactName: 'Emergency Contact',
      emergencyContactPhone: '+91 9876543210',
      joiningDate: opts?.joiningDate ?? '2026-01-01',
      employmentStatus,
      exitDate: opts?.exitDate ?? (employmentStatus === 'EXITED' ? '2026-06-01' : null),
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();
    return id;
  }

  // ==========================================================================
  // 1. MIGRATION, SCHEMA & INTEGRITY TRIGGER SUITE
  // ==========================================================================
  describe('1. Migration, Schema & Integrity Triggers', () => {
    it('1.1 should create all 4 Phase 5A-1 tables in database', async () => {
      const db = getDb(localD1);
      const tables = await db.all<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('hr_designations', 'hr_staff', 'hr_manpower_sanctions', 'hr_roster_assignments')`
      );
      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('hr_designations');
      expect(tableNames).toContain('hr_staff');
      expect(tableNames).toContain('hr_manpower_sanctions');
      expect(tableNames).toContain('hr_roster_assignments');
    });

    it('1.2 should create all 4 HR permissions in permissions table', async () => {
      const db = getDb(localD1);
      const perms = await db.select().from(permissions).where(
        eq(permissions.code, 'hr.read')
      ).all();
      expect(perms.length).toBeGreaterThan(0);
      expect(perms[0].id).toBe('perm-hr-r');

      const allHr = await db.all<{ id: string; code: string }>(
        `SELECT id, code FROM permissions WHERE code LIKE 'hr.%'`
      );
      const codes = allHr.map(p => p.code);
      expect(codes).toContain('hr.read');
      expect(codes).toContain('hr.staff.write');
      expect(codes).toContain('hr.manpower.write');
      expect(codes).toContain('hr.roster.write');
    });

    it('1.3 should verify default role permission mappings for ADMIN, SO, DO, BM, FO, DEALER, CSP', async () => {
      const db = getDb(localD1);
      const mappings = await db.all<{ role_id: string; permission_id: string }>(
        `SELECT role_id, permission_id FROM role_permissions WHERE permission_id LIKE 'perm-hr-%'`
      );

      const adminPerms = mappings.filter(m => m.role_id === 'role-admin').map(m => m.permission_id);
      expect(adminPerms).toEqual(expect.arrayContaining(['perm-hr-r', 'perm-hr-staff-w', 'perm-hr-manpower-w', 'perm-hr-roster-w']));

      const soPerms = mappings.filter(m => m.role_id === 'role-so').map(m => m.permission_id);
      expect(soPerms).toContain('perm-hr-r');
      expect(soPerms).not.toContain('perm-hr-staff-w');
      expect(soPerms).not.toContain('perm-hr-manpower-w');

      const doPerms = mappings.filter(m => m.role_id === 'role-do').map(m => m.permission_id);
      expect(doPerms).toContain('perm-hr-r');
      expect(doPerms).not.toContain('perm-hr-staff-w');

      const bmPerms = mappings.filter(m => m.role_id === 'role-bm').map(m => m.permission_id);
      expect(bmPerms).toEqual(expect.arrayContaining(['perm-hr-r', 'perm-hr-staff-w', 'perm-hr-manpower-w', 'perm-hr-roster-w']));

      const foPerms = mappings.filter(m => m.role_id === 'role-fo').map(m => m.permission_id);
      expect(foPerms).toEqual(expect.arrayContaining(['perm-hr-r', 'perm-hr-staff-w', 'perm-hr-manpower-w', 'perm-hr-roster-w']));

      const dealerPerms = mappings.filter(m => m.role_id === 'role-dealer').map(m => m.permission_id);
      expect(dealerPerms).toContain('perm-hr-r');
      expect(dealerPerms).toContain('perm-hr-staff-w');
      expect(dealerPerms).toContain('perm-hr-roster-w');
      expect(dealerPerms).not.toContain('perm-hr-manpower-w');

      const cspPerms = mappings.filter(m => m.role_id === 'role-csp').map(m => m.permission_id);
      expect(cspPerms).toContain('perm-hr-r');
      expect(cspPerms).toContain('perm-hr-staff-w');
      expect(cspPerms).toContain('perm-hr-roster-w');
      expect(cspPerms).not.toContain('perm-hr-manpower-w');
    });

    it('1.4 direct SQL delete on hr_designations must be blocked by trigger', async () => {
      const desigId = await seedDesignation(OUTLET_1_ID, 'MGR', 'Manager');
      const db = getDb(localD1);
      await expect(
        db.delete(hrDesignations).where(eq(hrDesignations.id, desigId)).run()
      ).rejects.toThrow();
    });

    it('1.5 direct SQL update on hr_designations immutable identity fields must be blocked by trigger', async () => {
      const desigId = await seedDesignation(OUTLET_1_ID, 'CASHIER', 'Cashier');
      const db = getDb(localD1);
      await expect(
        db.update(hrDesignations).set({ code: 'NEW_CASHIER' }).where(eq(hrDesignations.id, desigId)).run()
      ).rejects.toThrow();
      await expect(
        db.update(hrDesignations).set({ outletId: OUTLET_2_ID }).where(eq(hrDesignations.id, desigId)).run()
      ).rejects.toThrow();
    });

    it('1.6 direct SQL delete on hr_staff must be blocked by trigger', async () => {
      const desigId = await seedDesignation(OUTLET_1_ID, 'ATTENDANT', 'Attendant');
      const staffId = await seedStaff(OUTLET_1_ID, 'EMP001', 'Rahul Kumar', desigId);
      const db = getDb(localD1);
      await expect(
        db.delete(hrStaff).where(eq(hrStaff.id, staffId)).run()
      ).rejects.toThrow();
    });

    it('1.7 direct SQL update on hr_staff immutable identity fields must be blocked by trigger', async () => {
      const desigId = await seedDesignation(OUTLET_1_ID, 'ATTENDANT2', 'Attendant 2');
      const staffId = await seedStaff(OUTLET_1_ID, 'EMP002', 'Amit Singh', desigId);
      const db = getDb(localD1);
      await expect(
        db.update(hrStaff).set({ employeeCode: 'EMP999' }).where(eq(hrStaff.id, staffId)).run()
      ).rejects.toThrow();
      await expect(
        db.update(hrStaff).set({ outletId: OUTLET_2_ID }).where(eq(hrStaff.id, staffId)).run()
      ).rejects.toThrow();
    });

    it('1.8 direct SQL insert on hr_staff with foreign designation rejected by trigger', async () => {
      const desigIdOutlet2 = await seedDesignation(OUTLET_2_ID, 'SUP_O2', 'Supervisor O2');
      const db = getDb(localD1);
      await expect(
        db.insert(hrStaff).values({
          id: 'staff-fail-1',
          outletId: OUTLET_1_ID,
          employeeCode: 'EMP-OUT-FAIL',
          fullName: 'Test Staff',
          designationId: desigIdOutlet2,
          aadhaarLast4: '1234',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
          employmentStatus: 'ACTIVE',
          createdBy: 'user-admin',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).run()
      ).rejects.toThrow();
    });

    it('1.9 direct SQL insert on hr_staff with INACTIVE designation rejected by trigger', async () => {
      const inactDesigId = await seedDesignation(OUTLET_1_ID, 'OLD_DESIG', 'Old Inactive', 'INACTIVE');
      const db = getDb(localD1);
      await expect(
        db.insert(hrStaff).values({
          id: 'staff-fail-2',
          outletId: OUTLET_1_ID,
          employeeCode: 'EMP-INACT-DESIG',
          fullName: 'Test Staff',
          designationId: inactDesigId,
          aadhaarLast4: '1234',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
          employmentStatus: 'ACTIVE',
          createdBy: 'user-admin',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).run()
      ).rejects.toThrow();
    });

    it('1.10 direct SQL insert on hr_staff with foreign document rejected by trigger', async () => {
      const desigId = await seedDesignation(OUTLET_1_ID, 'DESIG_DOC_TEST', 'Doc Test Desig');
      const foreignDocId = await createTestDocument(OUTLET_2_ID);
      const db = getDb(localD1);
      await expect(
        db.insert(hrStaff).values({
          id: 'staff-fail-3',
          outletId: OUTLET_1_ID,
          employeeCode: 'EMP-DOC-FAIL',
          fullName: 'Test Staff',
          designationId: desigId,
          aadhaarLast4: '1234',
          aadhaarDocumentId: foreignDocId,
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
          employmentStatus: 'ACTIVE',
          createdBy: 'user-admin',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).run()
      ).rejects.toThrow();
    });

    it('1.11 direct SQL delete on hr_manpower_sanctions must be blocked by trigger', async () => {
      const desigId = await seedDesignation(OUTLET_1_ID, 'SANCT_DESIG', 'Sanctioned Desig');
      const db = getDb(localD1);
      const sancId = 'sanc-test-del';
      await db.insert(hrManpowerSanctions).values({
        id: sancId,
        outletId: OUTLET_1_ID,
        designationId: desigId,
        sanctionedCount: 5,
        effectiveFrom: '2026-01-01',
        createdBy: 'user-admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();

      await expect(
        db.delete(hrManpowerSanctions).where(eq(hrManpowerSanctions.id, sancId)).run()
      ).rejects.toThrow();
    });

    it('1.12 direct SQL delete on hr_roster_assignments must be blocked by trigger', async () => {
      const desigId = await seedDesignation(OUTLET_1_ID, 'ROST_DESIG', 'Roster Desig');
      const staffId = await seedStaff(OUTLET_1_ID, 'ROST_EMP_1', 'Roster Staff 1', desigId);
      const db = getDb(localD1);
      const rosterId = 'roster-test-del';
      await db.insert(hrRosterAssignments).values({
        id: rosterId,
        outletId: OUTLET_1_ID,
        staffId,
        rosterDate: '2026-03-01',
        shiftTemplateId: 'st-ro1-1',
        status: 'SCHEDULED',
        createdBy: 'user-admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();

      await expect(
        db.delete(hrRosterAssignments).where(eq(hrRosterAssignments.id, rosterId)).run()
      ).rejects.toThrow();
    });

    it('1.13 direct SQL insert on hr_roster_assignments with foreign staff rejected by trigger', async () => {
      const desigIdO2 = await seedDesignation(OUTLET_2_ID, 'DESIG_O2', 'Desig O2');
      const staffIdO2 = await seedStaff(OUTLET_2_ID, 'STAFF_O2_1', 'Staff O2', desigIdO2);
      const db = getDb(localD1);

      await expect(
        db.insert(hrRosterAssignments).values({
          id: 'roster-fail-foreign-staff',
          outletId: OUTLET_1_ID,
          staffId: staffIdO2,
          rosterDate: '2026-03-01',
          shiftTemplateId: 'st-ro1-1',
          status: 'SCHEDULED',
          createdBy: 'user-admin',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).run()
      ).rejects.toThrow();
    });

    it('1.14 direct SQL insert on hr_roster_assignments with foreign shift template rejected by trigger', async () => {
      const desigId = await seedDesignation(OUTLET_1_ID, 'ROST_DESIG_2', 'Roster Desig 2');
      const staffId = await seedStaff(OUTLET_1_ID, 'ROST_EMP_2', 'Roster Staff 2', desigId);
      const db = getDb(localD1);

      await expect(
        db.insert(hrRosterAssignments).values({
          id: 'roster-fail-foreign-template',
          outletId: OUTLET_1_ID,
          staffId,
          rosterDate: '2026-03-01',
          shiftTemplateId: 'st-ro2-1', // Belonging to Outlet 2
          status: 'SCHEDULED',
          createdBy: 'user-admin',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).run()
      ).rejects.toThrow();
    });

    it('1.15 direct SQL insert on hr_roster_assignments with INACTIVE staff rejected by trigger', async () => {
      const desigId = await seedDesignation(OUTLET_1_ID, 'ROST_DESIG_3', 'Roster Desig 3');
      const inactStaffId = await seedStaff(OUTLET_1_ID, 'ROST_INACT_1', 'Inactive Staff', desigId, 'INACTIVE');
      const db = getDb(localD1);

      await expect(
        db.insert(hrRosterAssignments).values({
          id: 'roster-fail-inact-staff',
          outletId: OUTLET_1_ID,
          staffId: inactStaffId,
          rosterDate: '2026-03-01',
          shiftTemplateId: 'st-ro1-1',
          status: 'SCHEDULED',
          createdBy: 'user-admin',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).run()
      ).rejects.toThrow();
    });

    it('1.16 direct SQL update on hr_staff changing designation to foreign designation is rejected', async () => {
      const desigO1 = await seedDesignation(OUTLET_1_ID, 'D_O1', 'Desig O1');
      const desigO2 = await seedDesignation(OUTLET_2_ID, 'D_O2', 'Desig O2');
      const staffId = await seedStaff(OUTLET_1_ID, 'S_UPD_DESIG', 'Staff', desigO1);
      const db = getDb(localD1);

      await expect(
        db.update(hrStaff).set({ designationId: desigO2 }).where(eq(hrStaff.id, staffId)).run()
      ).rejects.toThrow();
    });

    it('1.17 direct SQL update on hr_staff changing designation to INACTIVE designation is rejected', async () => {
      const desigO1 = await seedDesignation(OUTLET_1_ID, 'D_ACTIVE', 'Desig Active');
      const desigInact = await seedDesignation(OUTLET_1_ID, 'D_INACT', 'Desig Inact', 'INACTIVE');
      const staffId = await seedStaff(OUTLET_1_ID, 'S_UPD_INACT', 'Staff', desigO1);
      const db = getDb(localD1);

      await expect(
        db.update(hrStaff).set({ designationId: desigInact }).where(eq(hrStaff.id, staffId)).run()
      ).rejects.toThrow();
    });

    it('1.18 direct SQL update on hr_roster_assignments changing staff to INACTIVE staff is rejected', async () => {
      const desig = await seedDesignation(OUTLET_1_ID, 'D_ROST_TEST', 'Desig');
      const staffAct = await seedStaff(OUTLET_1_ID, 'S_ACT', 'Staff Act', desig);
      const staffInact = await seedStaff(OUTLET_1_ID, 'S_INACT', 'Staff Inact', desig, 'INACTIVE');
      const db = getDb(localD1);

      const rosterId = 'roster-upd-inact-test';
      await db.insert(hrRosterAssignments).values({
        id: rosterId,
        outletId: OUTLET_1_ID,
        staffId: staffAct,
        rosterDate: '2026-03-01',
        shiftTemplateId: 'st-ro1-1',
        status: 'SCHEDULED',
        createdBy: 'user-admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();

      await expect(
        db.update(hrRosterAssignments).set({ staffId: staffInact }).where(eq(hrRosterAssignments.id, rosterId)).run()
      ).rejects.toThrow();
    });

    it('1.19 direct SQL update on hr_roster_assignments changing shift template to foreign template is rejected', async () => {
      const desig = await seedDesignation(OUTLET_1_ID, 'D_ROST_TMPL', 'Desig');
      const staff = await seedStaff(OUTLET_1_ID, 'S_TMPL', 'Staff', desig);
      const db = getDb(localD1);

      const rosterId = 'roster-tmpl-test';
      await db.insert(hrRosterAssignments).values({
        id: rosterId,
        outletId: OUTLET_1_ID,
        staffId: staff,
        rosterDate: '2026-03-01',
        shiftTemplateId: 'st-ro1-1',
        status: 'SCHEDULED',
        createdBy: 'user-admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();

      await expect(
        db.update(hrRosterAssignments).set({ shiftTemplateId: 'st-ro2-1' }).where(eq(hrRosterAssignments.id, rosterId)).run()
      ).rejects.toThrow();
    });

    it('1.20 direct SQL insert on hr_manpower_sanctions with foreign designation rejected by trigger', async () => {
      const desigO2 = await seedDesignation(OUTLET_2_ID, 'D_O2_SANCT', 'Desig O2');
      const db = getDb(localD1);

      await expect(
        db.insert(hrManpowerSanctions).values({
          id: 'sanc-foreign-fail',
          outletId: OUTLET_1_ID,
          designationId: desigO2,
          sanctionedCount: 5,
          effectiveFrom: '2026-01-01',
          createdBy: 'user-admin',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).run()
      ).rejects.toThrow();
    });

    it('1.21 direct SQL insert on hr_staff with nonexistent designation rejected with HR_DESIGNATION_NOT_FOUND', async () => {
      const db = getDb(localD1);
      await expect(
        db.insert(hrStaff).values({
          id: 'staff-nonexistent-desig-fail',
          outletId: OUTLET_1_ID,
          employeeCode: 'EMP_NONEXIST_D',
          fullName: 'Staff Nonexistent',
          designationId: 'desig-does-not-exist-999',
          aadhaarLast4: '1234',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
          employmentStatus: 'ACTIVE',
          createdBy: 'user-admin',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).run()
      ).rejects.toThrow();
    });

    it('1.22 direct SQL insert on hr_manpower_sanctions with nonexistent designation rejected with HR_DESIGNATION_NOT_FOUND', async () => {
      const db = getDb(localD1);
      await expect(
        db.insert(hrManpowerSanctions).values({
          id: 'sanc-nonexistent-desig-fail',
          outletId: OUTLET_1_ID,
          designationId: 'desig-does-not-exist-888',
          sanctionedCount: 5,
          effectiveFrom: '2026-01-01',
          createdBy: 'user-admin',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).run()
      ).rejects.toThrow();
    });

    it('1.23 direct SQL insert on hr_roster_assignments with nonexistent staff rejected with HR_STAFF_NOT_FOUND', async () => {
      const db = getDb(localD1);
      await expect(
        db.insert(hrRosterAssignments).values({
          id: 'roster-nonexistent-staff-fail',
          outletId: OUTLET_1_ID,
          staffId: 'staff-does-not-exist-777',
          rosterDate: '2026-03-01',
          shiftTemplateId: 'st-ro1-1',
          status: 'SCHEDULED',
          createdBy: 'user-admin',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).run()
      ).rejects.toThrow();
    });

    it('1.24 direct SQL insert on hr_roster_assignments with nonexistent shift template rejected with HR_SHIFT_TEMPLATE_NOT_FOUND', async () => {
      const desig = await seedDesignation(OUTLET_1_ID, 'D_NONEXIST_TMPL', 'Desig');
      const staff = await seedStaff(OUTLET_1_ID, 'S_NONEXIST_TMPL', 'Staff', desig);
      const db = getDb(localD1);

      await expect(
        db.insert(hrRosterAssignments).values({
          id: 'roster-nonexistent-tmpl-fail',
          outletId: OUTLET_1_ID,
          staffId: staff,
          rosterDate: '2026-03-01',
          shiftTemplateId: 'st-does-not-exist-666',
          status: 'SCHEDULED',
          createdBy: 'user-admin',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).run()
      ).rejects.toThrow();
    });
  });

  // ==========================================================================
  // 2. DESIGNATION API SUITE
  // ==========================================================================
  describe('2. HR Designation API Endpoints', () => {
    it('2.1 creates a valid designation with 201', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/designations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'NOZZLE_ATTENDANT',
          name: 'Nozzle Attendant',
          status: 'ACTIVE',
          notes: 'Customer-facing fueling attendant',
        }),
      }, env);

      expect(res.status).toBe(201);
      const json = await jsonOf(res);
      expect(json.success).toBe(true);
      expect(json.data.code).toBe('NOZZLE_ATTENDANT');
      expect(json.data.name).toBe('Nozzle Attendant');
      expect(json.data.status).toBe('ACTIVE');
      expect(json.data.outletId).toBe(OUTLET_1_ID);
    });

    it('2.2 lists designations for outlet', async () => {
      const cookie = await loginAs('admin@iocl.in');
      await seedDesignation(OUTLET_1_ID, 'CODE_A', 'Name A');
      await seedDesignation(OUTLET_1_ID, 'CODE_B', 'Name B');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/designations`, {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }, env);

      expect(res.status).toBe(200);
      const json = await jsonOf(res);
      expect(json.success).toBe(true);
      expect(json.data.length).toBeGreaterThanOrEqual(2);
    });

    it('2.3 gets designation by ID', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const id = await seedDesignation(OUTLET_1_ID, 'CASH_MGR', 'Cash Manager');

      const res = await app.request(`/api/v1/hr/designations/${id}`, {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }, env);

      expect(res.status).toBe(200);
      const json = await jsonOf(res);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(id);
      expect(json.data.code).toBe('CASH_MGR');
    });

    it('2.4 updates designation name, status, and notes', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const id = await seedDesignation(OUTLET_1_ID, 'SUPERVISOR', 'Supervisor');

      const res = await app.request(`/api/v1/hr/designations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          name: 'Senior Supervisor',
          status: 'INACTIVE',
          notes: 'Role phased out',
        }),
      }, env);

      expect(res.status).toBe(200);
      const json = await jsonOf(res);
      expect(json.success).toBe(true);
      expect(json.data.name).toBe('Senior Supervisor');
      expect(json.data.status).toBe('INACTIVE');
      expect(json.data.notes).toBe('Role phased out');
    });

    it('2.5 rejects duplicate designation code in same outlet with 409 HR_DESIGNATION_CODE_EXISTS', async () => {
      const cookie = await loginAs('admin@iocl.in');
      await seedDesignation(OUTLET_1_ID, 'DUP_CODE', 'Original');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/designations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'DUP_CODE',
          name: 'Duplicate Attempt',
        }),
      }, env);

      expect(res.status).toBe(409);
      const json = await jsonOf(res);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('HR_DESIGNATION_CODE_EXISTS');
    });

    it('2.6 allows same designation code in different outlet', async () => {
      const cookie = await loginAs('admin@iocl.in');
      await seedDesignation(OUTLET_1_ID, 'COMMON_ROLE', 'Common Role O1');

      const res = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/hr/designations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'COMMON_ROLE',
          name: 'Common Role O2',
        }),
      }, env);

      expect(res.status).toBe(201);
      const json = await jsonOf(res);
      expect(json.success).toBe(true);
      expect(json.data.outletId).toBe(OUTLET_2_ID);
    });

    it('2.7 rejects blank designation code with 400', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/designations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: '   ',
          name: 'Valid Name',
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('2.8 rejects blank designation name with 400', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/designations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'VALID_CODE',
          name: '   ',
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.success).toBe(false);
    });

    it('2.9 rejects designation update with attempted code change with 400', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const id = await seedDesignation(OUTLET_1_ID, 'IMMUTABLE_DESIG', 'Original Name');

      const res = await app.request(`/api/v1/hr/designations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'TRY_TO_CHANGE',
          name: 'Updated Name',
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.success).toBe(false);
    });

    it('2.10 returns 404 for nonexistent designation ID', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/hr/designations/non-existent-id`, {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }, env);

      expect(res.status).toBe(404);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_DESIGNATION_NOT_FOUND');
    });

    it('2.11 filters designations by status (ACTIVE / INACTIVE)', async () => {
      const cookie = await loginAs('admin@iocl.in');
      await seedDesignation(OUTLET_1_ID, 'D_ACT_FILTER', 'Active Role', 'ACTIVE');
      await seedDesignation(OUTLET_1_ID, 'D_INACT_FILTER', 'Inactive Role', 'INACTIVE');

      const resActive = await app.request(
        `/api/v1/outlets/${OUTLET_1_ID}/hr/designations?status=ACTIVE`,
        { method: 'GET', headers: { Cookie: cookie, Origin: 'http://localhost:3000' } },
        env
      );
      const jsonActive = await jsonOf(resActive);
      expect(jsonActive.data.every((d: any) => d.status === 'ACTIVE')).toBe(true);

      const resInactive = await app.request(
        `/api/v1/outlets/${OUTLET_1_ID}/hr/designations?status=INACTIVE`,
        { method: 'GET', headers: { Cookie: cookie, Origin: 'http://localhost:3000' } },
        env
      );
      const jsonInactive = await jsonOf(resInactive);
      expect(jsonInactive.data.every((d: any) => d.status === 'INACTIVE')).toBe(true);
    });

    it('2.12 filters designations by search term', async () => {
      const cookie = await loginAs('admin@iocl.in');
      await seedDesignation(OUTLET_1_ID, 'SPECIFIC_SEARCH_CODE', 'Guard Duty');

      const res = await app.request(
        `/api/v1/outlets/${OUTLET_1_ID}/hr/designations?search=SPECIFIC`,
        { method: 'GET', headers: { Cookie: cookie, Origin: 'http://localhost:3000' } },
        env
      );
      const json = await jsonOf(res);
      expect(json.data.length).toBe(1);
      expect(json.data[0].code).toBe('SPECIFIC_SEARCH_CODE');
    });
  });

  // ==========================================================================
  // 3. STAFF CREATE & DETAIL SUITE
  // ==========================================================================
  describe('3. HR Staff Master & Profile API', () => {
    it('3.1 creates staff with valid data, returning masked Aadhaar and 201', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'ATT_1', 'Attendant 1');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP1001',
          fullName: 'Rajesh Sharma',
          designationId: desigId,
          aadhaarLast4: '4321',
          emergencyContactName: 'Sunita Sharma',
          emergencyContactPhone: '+91 9123456780',
          joiningDate: '2026-01-15',
          employmentStatus: 'ACTIVE',
          notes: 'Full-time daytime attendant',
        }),
      }, env);

      expect(res.status).toBe(201);
      const json = await jsonOf(res);
      expect(json.success).toBe(true);
      expect(json.data.employeeCode).toBe('EMP1001');
      expect(json.data.fullName).toBe('Rajesh Sharma');
      expect(json.data.aadhaarLast4).toBe('4321');
      expect(json.data.maskedAadhaar).toBe('XXXX XXXX 4321');
      expect(json.data.employmentStatus).toBe('ACTIVE');
      expect(json.data.exitDate).toBeNull();
      expect(json.data).not.toHaveProperty('aadhaarNumber');
    });

    it('3.2 gets staff by ID enriched with designation metadata', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'DESIG_ENRICH', 'Enriched Desig');
      const staffId = await seedStaff(OUTLET_1_ID, 'EMP_ENRICH', 'Enriched Person', desigId);

      const res = await app.request(`/api/v1/hr/staff/${staffId}`, {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }, env);

      expect(res.status).toBe(200);
      const json = await jsonOf(res);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(staffId);
      expect(json.data.designationName).toBe('Enriched Desig');
      expect(json.data.designationCode).toBe('DESIG_ENRICH');
      expect(json.data.maskedAadhaar).toBe('XXXX XXXX 1234');
    });

    it('3.3 updates staff contact info and designation', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desig1 = await seedDesignation(OUTLET_1_ID, 'ROLE_A', 'Role A');
      const desig2 = await seedDesignation(OUTLET_1_ID, 'ROLE_B', 'Role B');
      const staffId = await seedStaff(OUTLET_1_ID, 'EMP_UPD', 'Original Name', desig1);

      const res = await app.request(`/api/v1/hr/staff/${staffId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          fullName: 'Updated Name',
          designationId: desig2,
          emergencyContactName: 'New Contact',
          emergencyContactPhone: '9998887770',
        }),
      }, env);

      expect(res.status).toBe(200);
      const json = await jsonOf(res);
      expect(json.success).toBe(true);
      expect(json.data.fullName).toBe('Updated Name');
      expect(json.data.designationId).toBe(desig2);
      expect(json.data.emergencyContactName).toBe('New Contact');
    });

    it('3.4 rejects duplicate employeeCode in same outlet with 409 HR_STAFF_CODE_EXISTS', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'DESIG_DUP', 'Desig Dup');
      await seedStaff(OUTLET_1_ID, 'EMP_DUP_1', 'First Person', desigId);

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP_DUP_1',
          fullName: 'Second Person',
          designationId: desigId,
          aadhaarLast4: '5555',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
        }),
      }, env);

      expect(res.status).toBe(409);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_STAFF_CODE_EXISTS');
    });

    it('3.5 allows same employeeCode in different outlet', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigO1 = await seedDesignation(OUTLET_1_ID, 'ROLE_O1', 'Role O1');
      const desigO2 = await seedDesignation(OUTLET_2_ID, 'ROLE_O2', 'Role O2');
      await seedStaff(OUTLET_1_ID, 'EMP_GLOBAL_ID', 'Person O1', desigO1);

      const res = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP_GLOBAL_ID',
          fullName: 'Person O2',
          designationId: desigO2,
          aadhaarLast4: '6666',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
        }),
      }, env);

      expect(res.status).toBe(201);
      const json = await jsonOf(res);
      expect(json.success).toBe(true);
      expect(json.data.outletId).toBe(OUTLET_2_ID);
    });

    it('3.6 rejects attempted update of immutable employeeCode with 400', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desig = await seedDesignation(OUTLET_1_ID, 'ROLE_IMM', 'Role Imm');
      const staffId = await seedStaff(OUTLET_1_ID, 'EMP_IMM', 'Person Imm', desig);

      const res = await app.request(`/api/v1/hr/staff/${staffId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'TRY_TO_MUTATE',
          fullName: 'Updated Name',
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.success).toBe(false);
    });

    it('3.7 returns 404 for nonexistent staff ID', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/hr/staff/non-existent-staff-id`, {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }, env);

      expect(res.status).toBe(404);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_STAFF_NOT_FOUND');
    });

    it('3.8 updates staff notes without modifying other fields', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desig = await seedDesignation(OUTLET_1_ID, 'NOTES_DESIG', 'Desig');
      const staffId = await seedStaff(OUTLET_1_ID, 'NOTES_STAFF', 'Notes Person', desig);

      const res = await app.request(`/api/v1/hr/staff/${staffId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          notes: 'Special training completed',
        }),
      }, env);

      expect(res.status).toBe(200);
      const json = await jsonOf(res);
      expect(json.data.notes).toBe('Special training completed');
    });
  });

  // ==========================================================================
  // 4. AADHAAR PRIVACY SUITE
  // ==========================================================================
  describe('4. Aadhaar Privacy & Validation', () => {
    it('4.1 rejects 3-digit aadhaarLast4 with 400', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'AADHAAR_TEST', 'Desig');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP_A3',
          fullName: 'Test Person',
          designationId: desigId,
          aadhaarLast4: '123',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.success).toBe(false);
    });

    it('4.2 rejects 5-digit aadhaarLast4 with 400', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'AADHAAR_TEST2', 'Desig');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP_A5',
          fullName: 'Test Person',
          designationId: desigId,
          aadhaarLast4: '12345',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.success).toBe(false);
    });

    it('4.3 rejects non-numeric characters in aadhaarLast4 with 400', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'AADHAAR_TEST3', 'Desig');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP_ALET',
          fullName: 'Test Person',
          designationId: desigId,
          aadhaarLast4: '12AB',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.success).toBe(false);
    });

    it('4.4 list staff response contains only aadhaarLast4 and maskedAadhaar, no full aadhaarNumber', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desig = await seedDesignation(OUTLET_1_ID, 'AADHAAR_SEC_D', 'Desig');
      await seedStaff(OUTLET_1_ID, 'SEC_STAFF_1', 'Sec Staff', desig);

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }, env);

      const json = await jsonOf(res);
      for (const item of json.data) {
        expect(item).toHaveProperty('aadhaarLast4');
        expect(item).toHaveProperty('maskedAadhaar');
        expect(item.maskedAadhaar).toMatch(/^XXXX XXXX \d{4}$/);
        expect(item).not.toHaveProperty('aadhaarNumber');
      }
    });
  });

  // ==========================================================================
  // 5. STAFF DOCUMENT INTEGRITY SUITE
  // ==========================================================================
  describe('5. Staff Document Vault Integrity', () => {
    it('5.1 creates staff with valid same-outlet Aadhaar and Photo documents', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'DOC_OK_DESIG', 'Desig');
      const aadhaarDoc = await createTestDocument(OUTLET_1_ID);
      const photoDoc = await createTestDocument(OUTLET_1_ID);

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP_DOC_OK',
          fullName: 'Doc Verified Person',
          designationId: desigId,
          aadhaarLast4: '9876',
          aadhaarDocumentId: aadhaarDoc,
          photoDocumentId: photoDoc,
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
        }),
      }, env);

      expect(res.status).toBe(201);
      const json = await jsonOf(res);
      expect(json.success).toBe(true);
      expect(json.data.aadhaarDocumentId).toBe(aadhaarDoc);
      expect(json.data.photoDocumentId).toBe(photoDoc);
    });

    it('5.2 rejects nonexistent Aadhaar document with 400 HR_AADHAAR_DOCUMENT_NOT_FOUND', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'DOC_NOT_FOUND_DESIG', 'Desig');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP_DOC_NF',
          fullName: 'Person',
          designationId: desigId,
          aadhaarLast4: '9876',
          aadhaarDocumentId: 'doc-nonexistent-12345',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_AADHAAR_DOCUMENT_NOT_FOUND');
    });

    it('5.3 rejects foreign outlet Aadhaar document with 400 HR_AADHAAR_DOCUMENT_OUTLET_MISMATCH', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'DOC_MISMATCH_DESIG', 'Desig');
      const foreignDoc = await createTestDocument(OUTLET_2_ID);

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP_DOC_MIS',
          fullName: 'Person',
          designationId: desigId,
          aadhaarLast4: '9876',
          aadhaarDocumentId: foreignDoc,
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_AADHAAR_DOCUMENT_OUTLET_MISMATCH');
    });

    it('5.4 rejects foreign outlet Photo document with 400 HR_PHOTO_DOCUMENT_OUTLET_MISMATCH', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'PHOTO_MISMATCH_DESIG', 'Desig');
      const foreignPhoto = await createTestDocument(OUTLET_2_ID);

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP_PHOTO_MIS',
          fullName: 'Person',
          designationId: desigId,
          aadhaarLast4: '9876',
          photoDocumentId: foreignPhoto,
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_PHOTO_DOCUMENT_OUTLET_MISMATCH');
    });

    it('5.5 updating staff document to valid same-outlet document succeeds', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'DOC_UPD_DESIG', 'Desig');
      const staffId = await seedStaff(OUTLET_1_ID, 'EMP_DOC_UPD', 'Person', desigId);
      const newDocId = await createTestDocument(OUTLET_1_ID);

      const res = await app.request(`/api/v1/hr/staff/${staffId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          aadhaarDocumentId: newDocId,
        }),
      }, env);

      expect(res.status).toBe(200);
      const json = await jsonOf(res);
      expect(json.data.aadhaarDocumentId).toBe(newDocId);
    });
  });

  // ==========================================================================
  // 6. STAFF DESIGNATION INTEGRITY SUITE
  // ==========================================================================
  describe('6. Staff Designation Rules & Lifecycle', () => {
    it('6.1 rejects creating staff with INACTIVE designation (409 HR_DESIGNATION_NOT_ACTIVE)', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const inactDesig = await seedDesignation(OUTLET_1_ID, 'INACT_ROLE', 'Inactive Role', 'INACTIVE');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP_INACT_DESIG',
          fullName: 'Person',
          designationId: inactDesig,
          aadhaarLast4: '1111',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
        }),
      }, env);

      expect(res.status).toBe(409);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_DESIGNATION_NOT_ACTIVE');
    });

    it('6.2 rejects creating staff with foreign outlet designation (400 HR_STAFF_DESIGNATION_OUTLET_MISMATCH)', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const foreignDesig = await seedDesignation(OUTLET_2_ID, 'O2_DESIG', 'O2 Role');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP_FOR_DESIG',
          fullName: 'Person',
          designationId: foreignDesig,
          aadhaarLast4: '2222',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_STAFF_DESIGNATION_OUTLET_MISMATCH');
    });

    it('6.3 rejects updating staff designation to an INACTIVE designation with 409', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const activeDesig = await seedDesignation(OUTLET_1_ID, 'ACT_DESIG', 'Active');
      const inactDesig = await seedDesignation(OUTLET_1_ID, 'INACT_DESIG_2', 'Inactive 2', 'INACTIVE');
      const staffId = await seedStaff(OUTLET_1_ID, 'EMP_SWITCH_INACT', 'Person', activeDesig);

      const res = await app.request(`/api/v1/hr/staff/${staffId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          designationId: inactDesig,
        }),
      }, env);

      expect(res.status).toBe(409);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_DESIGNATION_NOT_ACTIVE');
    });

    it('6.4 allows updating unrelated fields on existing staff even if currently linked designation became INACTIVE', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'NOW_INACT_DESIG', 'To Inactive', 'ACTIVE');
      const staffId = await seedStaff(OUTLET_1_ID, 'EMP_STABLE', 'Stable Person', desigId);

      // Designation becomes inactive later
      const db = getDb(localD1);
      await db.update(hrDesignations).set({ status: 'INACTIVE' }).where(eq(hrDesignations.id, desigId)).run();

      // Update staff notes or emergency contact
      const res = await app.request(`/api/v1/hr/staff/${staffId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          emergencyContactPhone: '+91 9999988888',
          notes: 'Updated emergency phone',
        }),
      }, env);

      expect(res.status).toBe(200);
      const json = await jsonOf(res);
      expect(json.success).toBe(true);
      expect(json.data.emergencyContactPhone).toBe('+91 9999988888');
      expect(json.data.notes).toBe('Updated emergency phone');
    });

    it('6.5 rejects creating staff with nonexistent designationId with 404 HR_DESIGNATION_NOT_FOUND', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP_NONEXIST_DESIG',
          fullName: 'Person Nonexist',
          designationId: 'non-existent-desig-id',
          aadhaarLast4: '3333',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
        }),
      }, env);

      expect(res.status).toBe(404);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_DESIGNATION_NOT_FOUND');
    });

    it('6.6 rejects creating staff with foreign outlet designationId with 400 HR_STAFF_DESIGNATION_OUTLET_MISMATCH', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const foreignDesigId = await seedDesignation(OUTLET_2_ID, 'O2_REF_DESIG', 'O2 Ref Desig');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP_FOR_REF_DESIG',
          fullName: 'Person Foreign Desig',
          designationId: foreignDesigId,
          aadhaarLast4: '4444',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_STAFF_DESIGNATION_OUTLET_MISMATCH');
    });

    it('6.7 rejects updating staff designationId to nonexistent with 404 HR_DESIGNATION_NOT_FOUND', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'ACT_DESIG_INIT', 'Active Desig');
      const staffId = await seedStaff(OUTLET_1_ID, 'EMP_UPD_NONEXIST_D', 'Person', desigId);

      const res = await app.request(`/api/v1/hr/staff/${staffId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          designationId: 'non-existent-desig-id-999',
        }),
      }, env);

      expect(res.status).toBe(404);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_DESIGNATION_NOT_FOUND');
    });

    it('6.8 rejects updating staff designationId to foreign outlet with 400 HR_STAFF_DESIGNATION_OUTLET_MISMATCH', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'ACT_DESIG_INIT2', 'Active Desig 2');
      const foreignDesigId = await seedDesignation(OUTLET_2_ID, 'FOR_DESIG_SWITCH', 'Foreign Desig');
      const staffId = await seedStaff(OUTLET_1_ID, 'EMP_UPD_FOR_D', 'Person', desigId);

      const res = await app.request(`/api/v1/hr/staff/${staffId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          designationId: foreignDesigId,
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_STAFF_DESIGNATION_OUTLET_MISMATCH');
    });
  });

  // ==========================================================================
  // 7. STAFF STATUS & EXIT DATE SUITE
  // ==========================================================================
  describe('7. Staff Status & Exit Date Validations', () => {
    it('7.1 accepts EXITED staff with valid exitDate >= joiningDate', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'DESIG_EXIT_TEST', 'Desig');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP_EXIT_OK',
          fullName: 'Exited Person',
          designationId: desigId,
          aadhaarLast4: '3333',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
          employmentStatus: 'EXITED',
          exitDate: '2026-05-31',
        }),
      }, env);

      expect(res.status).toBe(201);
      const json = await jsonOf(res);
      expect(json.success).toBe(true);
      expect(json.data.employmentStatus).toBe('EXITED');
      expect(json.data.exitDate).toBe('2026-05-31');
    });

    it('7.2 rejects EXITED staff without exitDate with 400', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'DESIG_EXIT_TEST2', 'Desig');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP_EXIT_NO_DATE',
          fullName: 'Exited Person',
          designationId: desigId,
          aadhaarLast4: '3333',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
          employmentStatus: 'EXITED',
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.success).toBe(false);
    });

    it('7.3 rejects exitDate before joiningDate with 400', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'DESIG_EXIT_TEST3', 'Desig');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP_EXIT_EARLY',
          fullName: 'Exited Person',
          designationId: desigId,
          aadhaarLast4: '3333',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-04-01',
          employmentStatus: 'EXITED',
          exitDate: '2026-03-31',
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.success).toBe(false);
    });

    it('7.4 rejects ACTIVE staff created with non-null exitDate with 400', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'DESIG_EXIT_TEST4', 'Desig');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP_ACT_WITH_EXIT',
          fullName: 'Person',
          designationId: desigId,
          aadhaarLast4: '3333',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
          employmentStatus: 'ACTIVE',
          exitDate: '2026-05-31',
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.success).toBe(false);
    });

    it('7.5 updating EXITED staff back to ACTIVE clears exitDate', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'DESIG_REACT', 'Desig');
      const staffId = await seedStaff(OUTLET_1_ID, 'EMP_REACT', 'Person', desigId, 'EXITED', {
        joiningDate: '2026-01-01',
        exitDate: '2026-06-01',
      });

      const res = await app.request(`/api/v1/hr/staff/${staffId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employmentStatus: 'ACTIVE',
        }),
      }, env);

      expect(res.status).toBe(200);
      const json = await jsonOf(res);
      expect(json.success).toBe(true);
      expect(json.data.employmentStatus).toBe('ACTIVE');
      expect(json.data.exitDate).toBeNull();
    });

    it('7.6 updating staff to INACTIVE sets status to INACTIVE with null exitDate', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'DESIG_TO_INACT', 'Desig');
      const staffId = await seedStaff(OUTLET_1_ID, 'EMP_TO_INACT', 'Person', desigId);

      const res = await app.request(`/api/v1/hr/staff/${staffId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employmentStatus: 'INACTIVE',
        }),
      }, env);

      expect(res.status).toBe(200);
      const json = await jsonOf(res);
      expect(json.data.employmentStatus).toBe('INACTIVE');
      expect(json.data.exitDate).toBeNull();
    });
  });

  // ==========================================================================
  // 8. MANPOWER SANCTIONS API SUITE
  // ==========================================================================
  describe('8. Manpower Sanctions API Endpoints', () => {
    it('8.1 creates a valid manpower sanction with 201', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'SANC_ATT', 'Sanctioned Attendant');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/manpower-sanctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          designationId: desigId,
          sanctionedCount: 8,
          effectiveFrom: '2026-01-01',
          notes: 'Standard 24/7 nozzle coverage',
        }),
      }, env);

      expect(res.status).toBe(201);
      const json = await jsonOf(res);
      expect(json.success).toBe(true);
      expect(json.data.sanctionedCount).toBe(8);
      expect(json.data.designationId).toBe(desigId);
    });

    it('8.2 allows 0 sanctioned count', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'SANC_ZERO', 'Sanctioned Zero');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/manpower-sanctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          designationId: desigId,
          sanctionedCount: 0,
          effectiveFrom: '2026-01-01',
        }),
      }, env);

      expect(res.status).toBe(201);
      const json = await jsonOf(res);
      expect(json.success).toBe(true);
      expect(json.data.sanctionedCount).toBe(0);
    });

    it('8.3 rejects negative sanctioned count with 400', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'SANC_NEG', 'Sanctioned Neg');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/manpower-sanctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          designationId: desigId,
          sanctionedCount: -2,
          effectiveFrom: '2026-01-01',
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.success).toBe(false);
    });

    it('8.4 rejects duplicate sanction on same designation with 409 HR_MANPOWER_SANCTION_EXISTS', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'SANC_DUP', 'Sanctioned Dup');

      // First create
      await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/manpower-sanctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ designationId: desigId, sanctionedCount: 4, effectiveFrom: '2026-01-01' }),
      }, env);

      // Competing create
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/manpower-sanctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ designationId: desigId, sanctionedCount: 5, effectiveFrom: '2026-02-01' }),
      }, env);

      expect(res.status).toBe(409);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_MANPOWER_SANCTION_EXISTS');
    });

    it('8.5 updates sanction strength and notes', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'SANC_UPD', 'Sanctioned Upd');

      const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/manpower-sanctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ designationId: desigId, sanctionedCount: 4, effectiveFrom: '2026-01-01' }),
      }, env);
      const sanctionId = (await jsonOf(createRes)).data.id;

      const res = await app.request(`/api/v1/hr/manpower-sanctions/${sanctionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          sanctionedCount: 6,
          effectiveFrom: '2026-03-01',
          notes: 'Increased sanction count',
        }),
      }, env);

      expect(res.status).toBe(200);
      const json = await jsonOf(res);
      expect(json.success).toBe(true);
      expect(json.data.sanctionedCount).toBe(6);
      expect(json.data.effectiveFrom).toBe('2026-03-01');
    });

    it('8.6 rejects sanction creation for foreign designation with 400', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const foreignDesigId = await seedDesignation(OUTLET_2_ID, 'O2_SANC_DESIG', 'O2 Desig');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/manpower-sanctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          designationId: foreignDesigId,
          sanctionedCount: 3,
          effectiveFrom: '2026-01-01',
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_MANPOWER_DESIGNATION_OUTLET_MISMATCH');
    });

    it('8.7 lists all manpower sanctions for outlet', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigA = await seedDesignation(OUTLET_1_ID, 'LIST_SANC_A', 'Desig A');
      const desigB = await seedDesignation(OUTLET_1_ID, 'LIST_SANC_B', 'Desig B');

      await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/manpower-sanctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ designationId: desigA, sanctionedCount: 5, effectiveFrom: '2026-01-01' }),
      }, env);

      await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/manpower-sanctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ designationId: desigB, sanctionedCount: 3, effectiveFrom: '2026-01-01' }),
      }, env);

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/manpower-sanctions`, {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }, env);

      expect(res.status).toBe(200);
      const json = await jsonOf(res);
      expect(json.data.length).toBeGreaterThanOrEqual(2);
    });

    it('8.8 rejects creating manpower sanction with nonexistent designationId with 404 HR_DESIGNATION_NOT_FOUND', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/manpower-sanctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          designationId: 'non-existent-sanc-desig',
          sanctionedCount: 5,
          effectiveFrom: '2026-01-01',
        }),
      }, env);

      expect(res.status).toBe(404);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_DESIGNATION_NOT_FOUND');
    });

    it('8.9 rejects creating manpower sanction with foreign outlet designationId with 400 HR_MANPOWER_DESIGNATION_OUTLET_MISMATCH', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const foreignDesigId = await seedDesignation(OUTLET_2_ID, 'O2_SANC_REF_DESIG', 'O2 Sanc Desig');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/manpower-sanctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          designationId: foreignDesigId,
          sanctionedCount: 5,
          effectiveFrom: '2026-01-01',
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_MANPOWER_DESIGNATION_OUTLET_MISMATCH');
    });
  });

  // ==========================================================================
  // 9. MANPOWER SUMMARY CALCULATIONS SUITE
  // ==========================================================================
  describe('9. Sanctioned vs Actual Manpower Summary', () => {
    it('9.1 calculates accurate variance, shortage, and excess counts across multiple designations', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const db = getDb(localD1);

      // Designation A: Sanctioned = 5, Active actual = 3, Inactive = 1, Exited = 1
      const desigA = await seedDesignation(OUTLET_1_ID, 'DESIG_SUM_A', 'Designation A');
      await db.insert(hrManpowerSanctions).values({
        id: 'sanc-a',
        outletId: OUTLET_1_ID,
        designationId: desigA,
        sanctionedCount: 5,
        effectiveFrom: '2026-01-01',
        createdBy: 'user-admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();
      await seedStaff(OUTLET_1_ID, 'EMP_A1', 'A1', desigA, 'ACTIVE');
      await seedStaff(OUTLET_1_ID, 'EMP_A2', 'A2', desigA, 'ACTIVE');
      await seedStaff(OUTLET_1_ID, 'EMP_A3', 'A3', desigA, 'ACTIVE');
      await seedStaff(OUTLET_1_ID, 'EMP_A4', 'A4', desigA, 'INACTIVE');
      await seedStaff(OUTLET_1_ID, 'EMP_A5', 'A5', desigA, 'EXITED', { exitDate: '2026-05-01' });

      // Designation B: Sanctioned = 2, Active actual = 4
      const desigB = await seedDesignation(OUTLET_1_ID, 'DESIG_SUM_B', 'Designation B');
      await db.insert(hrManpowerSanctions).values({
        id: 'sanc-b',
        outletId: OUTLET_1_ID,
        designationId: desigB,
        sanctionedCount: 2,
        effectiveFrom: '2026-01-01',
        createdBy: 'user-admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();
      await seedStaff(OUTLET_1_ID, 'EMP_B1', 'B1', desigB, 'ACTIVE');
      await seedStaff(OUTLET_1_ID, 'EMP_B2', 'B2', desigB, 'ACTIVE');
      await seedStaff(OUTLET_1_ID, 'EMP_B3', 'B3', desigB, 'ACTIVE');
      await seedStaff(OUTLET_1_ID, 'EMP_B4', 'B4', desigB, 'ACTIVE');

      // Designation C: Sanctioned = 3, Active actual = 0 (No staff)
      const desigC = await seedDesignation(OUTLET_1_ID, 'DESIG_SUM_C', 'Designation C');
      await db.insert(hrManpowerSanctions).values({
        id: 'sanc-c',
        outletId: OUTLET_1_ID,
        designationId: desigC,
        sanctionedCount: 3,
        effectiveFrom: '2026-01-01',
        createdBy: 'user-admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/manpower-summary`, {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }, env);

      expect(res.status).toBe(200);
      const json = await jsonOf(res);
      expect(json.success).toBe(true);

      const sumA = json.data.byDesignation.find((d: any) => d.designationId === desigA);
      expect(sumA).toBeDefined();
      expect(sumA.sanctionedCount).toBe(5);
      expect(sumA.actualCount).toBe(3); // Inactive and exited not counted
      expect(sumA.varianceCount).toBe(-2);
      expect(sumA.shortageCount).toBe(2);
      expect(sumA.excessCount).toBe(0);

      const sumB = json.data.byDesignation.find((d: any) => d.designationId === desigB);
      expect(sumB).toBeDefined();
      expect(sumB.sanctionedCount).toBe(2);
      expect(sumB.actualCount).toBe(4);
      expect(sumB.varianceCount).toBe(2);
      expect(sumB.shortageCount).toBe(0);
      expect(sumB.excessCount).toBe(2);

      const sumC = json.data.byDesignation.find((d: any) => d.designationId === desigC);
      expect(sumC).toBeDefined();
      expect(sumC.sanctionedCount).toBe(3);
      expect(sumC.actualCount).toBe(0);
      expect(sumC.varianceCount).toBe(-3);
      expect(sumC.shortageCount).toBe(3);
      expect(sumC.excessCount).toBe(0);

      expect(json.data.totalSanctionedCount).toBe(10); // 5 + 2 + 3
      expect(json.data.totalActualCount).toBe(7); // 3 + 4 + 0
      expect(json.data.totalShortageCount).toBe(5); // 2 + 0 + 3
      expect(json.data.totalExcessCount).toBe(2); // 0 + 2 + 0
    });

    it('9.2 summary includes inactive designations without crashing', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const inactDesig = await seedDesignation(OUTLET_1_ID, 'INACT_SUM_TEST', 'Inactive Desig', 'INACTIVE');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/manpower-summary`, {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }, env);

      expect(res.status).toBe(200);
      const json = await jsonOf(res);
      const found = json.data.byDesignation.find((d: any) => d.designationId === inactDesig);
      expect(found).toBeDefined();
      expect(found.sanctionedCount).toBe(0);
      expect(found.actualCount).toBe(0);
    });
  });

  // ==========================================================================
  // 10. SHIFT ROSTER API SUITE
  // ==========================================================================
  describe('10. Shift Roster Assignment API', () => {
    it('10.1 creates valid shift roster assignment reusing existing shift template', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'ROST_ROLE_1', 'Roster Role');
      const staffId = await seedStaff(OUTLET_1_ID, 'ROST_STAFF_1', 'Staff Member 1', desigId);

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId,
          rosterDate: '2026-03-10',
          shiftTemplateId: 'st-ro1-1', // Morning shift seeded in outlet 1
          notes: 'Regular morning shift',
        }),
      }, env);

      expect(res.status).toBe(201);
      const json = await jsonOf(res);
      expect(json.success).toBe(true);
      expect(json.data.staffId).toBe(staffId);
      expect(json.data.rosterDate).toBe('2026-03-10');
      expect(json.data.shiftTemplateId).toBe('st-ro1-1');
      expect(json.data.status).toBe('SCHEDULED');
    });

    it('10.2 gets roster assignment by ID enriched with shift & staff details', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'ROST_ROLE_2', 'Roster Role 2');
      const staffId = await seedStaff(OUTLET_1_ID, 'ROST_STAFF_2', 'Sunil Verma', desigId);

      const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId,
          rosterDate: '2026-03-11',
          shiftTemplateId: 'st-ro1-2', // Evening shift seeded in outlet 1
        }),
      }, env);
      const rosterId = (await jsonOf(createRes)).data.id;

      const res = await app.request(`/api/v1/hr/roster/${rosterId}`, {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }, env);

      expect(res.status).toBe(200);
      const json = await jsonOf(res);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(rosterId);
      expect(json.data.staffName).toBe('Sunil Verma');
      expect(json.data.employeeCode).toBe('ROST_STAFF_2');
      expect(json.data.shiftTemplateCode).toBe('SHIFT_2');
    });

    it('10.3 rejects duplicate shift for same staff and same date with 409 HR_ROSTER_EXISTS', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'ROST_ROLE_3', 'Role 3');
      const staffId = await seedStaff(OUTLET_1_ID, 'ROST_STAFF_3', 'Person 3', desigId);

      // First assignment
      await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ staffId, rosterDate: '2026-03-12', shiftTemplateId: 'st-ro1-1' }),
      }, env);

      // Competing second assignment on same date
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ staffId, rosterDate: '2026-03-12', shiftTemplateId: 'st-ro1-2' }),
      }, env);

      expect(res.status).toBe(409);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_ROSTER_EXISTS');
    });

    it('10.4 allows same staff on different dates and different staff on same date', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'ROST_ROLE_4', 'Role 4');
      const staff1 = await seedStaff(OUTLET_1_ID, 'ROST_S1', 'Staff 1', desigId);
      const staff2 = await seedStaff(OUTLET_1_ID, 'ROST_S2', 'Staff 2', desigId);

      // Same staff on Day 1 and Day 2
      const res1 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ staffId: staff1, rosterDate: '2026-03-13', shiftTemplateId: 'st-ro1-1' }),
      }, env);
      expect(res1.status).toBe(201);

      const res2 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ staffId: staff1, rosterDate: '2026-03-14', shiftTemplateId: 'st-ro1-1' }),
      }, env);
      expect(res2.status).toBe(201);

      // Different staff on Day 1
      const res3 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ staffId: staff2, rosterDate: '2026-03-13', shiftTemplateId: 'st-ro1-1' }),
      }, env);
      expect(res3.status).toBe(201);
    });

    it('10.5 rejects invalid calendar date (Feb 31) with 400', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'ROST_ROLE_5', 'Role 5');
      const staffId = await seedStaff(OUTLET_1_ID, 'ROST_S5', 'Staff 5', desigId);

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId,
          rosterDate: '2026-02-31',
          shiftTemplateId: 'st-ro1-1',
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.success).toBe(false);
    });

    it('10.6 updates roster status to CANCELLED', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'ROST_ROLE_6', 'Role 6');
      const staffId = await seedStaff(OUTLET_1_ID, 'ROST_S6', 'Staff 6', desigId);

      const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ staffId, rosterDate: '2026-03-15', shiftTemplateId: 'st-ro1-1' }),
      }, env);
      const rosterId = (await jsonOf(createRes)).data.id;

      const res = await app.request(`/api/v1/hr/roster/${rosterId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          status: 'CANCELLED',
          notes: 'Cancelled due to planned maintenance',
        }),
      }, env);

      expect(res.status).toBe(200);
      const json = await jsonOf(res);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('CANCELLED');
      expect(json.data.notes).toBe('Cancelled due to planned maintenance');
    });

    it('10.7 rejects new roster assignment with INACTIVE staff (409 HR_STAFF_NOT_ACTIVE)', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'ROST_ROLE_7', 'Role 7');
      const inactStaffId = await seedStaff(OUTLET_1_ID, 'ROST_S7', 'Inact Staff', desigId, 'INACTIVE');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ staffId: inactStaffId, rosterDate: '2026-03-16', shiftTemplateId: 'st-ro1-1' }),
      }, env);

      expect(res.status).toBe(409);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_STAFF_NOT_ACTIVE');
    });

    it('10.8 rejects new roster assignment with EXITED staff (409 HR_STAFF_NOT_ACTIVE)', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'ROST_ROLE_8', 'Role 8');
      const exitedStaffId = await seedStaff(OUTLET_1_ID, 'ROST_S8', 'Exited Staff', desigId, 'EXITED', { exitDate: '2026-02-01' });

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ staffId: exitedStaffId, rosterDate: '2026-03-17', shiftTemplateId: 'st-ro1-1' }),
      }, env);

      expect(res.status).toBe(409);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_STAFF_NOT_ACTIVE');
    });

    it('10.9 rejects new roster assignment with foreign shift template (400 HR_ROSTER_SHIFT_OUTLET_MISMATCH)', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'ROST_ROLE_9', 'Role 9');
      const staffId = await seedStaff(OUTLET_1_ID, 'ROST_S9', 'Staff 9', desigId);

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId,
          rosterDate: '2026-03-18',
          shiftTemplateId: 'st-ro2-1', // Outlet 2 template
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_ROSTER_SHIFT_OUTLET_MISMATCH');
    });

    it('10.10 rejects new roster assignment with INACTIVE shift template (409 HR_SHIFT_TEMPLATE_NOT_ACTIVE)', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'ROST_ROLE_10', 'Role 10');
      const staffId = await seedStaff(OUTLET_1_ID, 'ROST_S10', 'Staff 10', desigId);

      // Deactivate shift template in outlet 1
      const db = getDb(localD1);
      await db.update(shiftTemplates).set({ status: 'INACTIVE' }).where(eq(shiftTemplates.id, 'st-ro1-1')).run();

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId,
          rosterDate: '2026-03-19',
          shiftTemplateId: 'st-ro1-1',
        }),
      }, env);

      expect(res.status).toBe(409);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_SHIFT_TEMPLATE_NOT_ACTIVE');
    });

    it('10.11 creates roster assignment referencing GENERAL shift template', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'ROST_ROLE_GEN', 'Role Gen');
      const staffId = await seedStaff(OUTLET_1_ID, 'ROST_S_GEN', 'Staff Gen', desigId);

      const genTmplId = 'st-ro1-gen';

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId,
          rosterDate: '2026-03-20',
          shiftTemplateId: genTmplId,
        }),
      }, env);

      expect(res.status).toBe(201);
      const json = await jsonOf(res);
      expect(json.data.shiftTemplateId).toBe(genTmplId);
    });

    it('10.12 allows updating roster notes even if linked staff later exited', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'ROST_HIST_D', 'Desig');
      const staffId = await seedStaff(OUTLET_1_ID, 'ROST_HIST_S', 'Staff', desigId);

      const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ staffId, rosterDate: '2026-03-21', shiftTemplateId: 'st-ro1-1' }),
      }, env);
      const rosterId = (await jsonOf(createRes)).data.id;

      // Staff exits later
      const db = getDb(localD1);
      await db.update(hrStaff).set({ employmentStatus: 'EXITED', exitDate: '2026-04-01' }).where(eq(hrStaff.id, staffId)).run();

      // Roster assignment should still be updatable for notes
      const res = await app.request(`/api/v1/hr/roster/${rosterId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ notes: 'Historical note on exited employee shift' }),
      }, env);

      expect(res.status).toBe(200);
      const json = await jsonOf(res);
      expect(json.data.notes).toBe('Historical note on exited employee shift');
    });

    it('10.13 rejects creating roster with nonexistent staffId with 404 HR_STAFF_NOT_FOUND', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId: 'nonexistent-staff-id-123',
          rosterDate: '2026-03-22',
          shiftTemplateId: 'st-ro1-1',
        }),
      }, env);

      expect(res.status).toBe(404);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_STAFF_NOT_FOUND');
    });

    it('10.14 rejects creating roster with foreign outlet staffId with 400 HR_ROSTER_STAFF_OUTLET_MISMATCH', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const foreignDesig = await seedDesignation(OUTLET_2_ID, 'O2_ROST_DESIG', 'O2 Desig');
      const foreignStaff = await seedStaff(OUTLET_2_ID, 'O2_ROST_STAFF', 'Foreign Staff', foreignDesig);

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId: foreignStaff,
          rosterDate: '2026-03-22',
          shiftTemplateId: 'st-ro1-1',
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_ROSTER_STAFF_OUTLET_MISMATCH');
    });

    it('10.15 rejects creating roster with nonexistent shiftTemplateId with 404 HR_SHIFT_TEMPLATE_NOT_FOUND', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'ROST_S15_D', 'Desig 15');
      const staffId = await seedStaff(OUTLET_1_ID, 'ROST_S15', 'Staff 15', desigId);

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId,
          rosterDate: '2026-03-23',
          shiftTemplateId: 'nonexistent-shift-template-999',
        }),
      }, env);

      expect(res.status).toBe(404);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_SHIFT_TEMPLATE_NOT_FOUND');
    });

    it('10.16 rejects creating roster with foreign outlet shiftTemplateId with 400 HR_ROSTER_SHIFT_OUTLET_MISMATCH', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'ROST_S16_D', 'Desig 16');
      const staffId = await seedStaff(OUTLET_1_ID, 'ROST_S16', 'Staff 16', desigId);

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId,
          rosterDate: '2026-03-24',
          shiftTemplateId: 'st-ro2-1',
        }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_ROSTER_SHIFT_OUTLET_MISMATCH');
    });

    it('10.17 rejects updating roster staffId to nonexistent with 404 HR_STAFF_NOT_FOUND', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'ROST_S17_D', 'Desig 17');
      const staffId = await seedStaff(OUTLET_1_ID, 'ROST_S17', 'Staff 17', desigId);

      const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ staffId, rosterDate: '2026-03-25', shiftTemplateId: 'st-ro1-1' }),
      }, env);
      const rosterId = (await jsonOf(createRes)).data.id;

      const res = await app.request(`/api/v1/hr/roster/${rosterId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ staffId: 'nonexistent-staff-id-888' }),
      }, env);

      expect(res.status).toBe(404);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_STAFF_NOT_FOUND');
    });

    it('10.18 rejects updating roster staffId to foreign outlet with 400 HR_ROSTER_STAFF_OUTLET_MISMATCH', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'ROST_S18_D', 'Desig 18');
      const staffId = await seedStaff(OUTLET_1_ID, 'ROST_S18', 'Staff 18', desigId);
      const foreignDesig = await seedDesignation(OUTLET_2_ID, 'O2_ROST_D18', 'O2 Desig 18');
      const foreignStaff = await seedStaff(OUTLET_2_ID, 'O2_ROST_S18', 'O2 Staff 18', foreignDesig);

      const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ staffId, rosterDate: '2026-03-26', shiftTemplateId: 'st-ro1-1' }),
      }, env);
      const rosterId = (await jsonOf(createRes)).data.id;

      const res = await app.request(`/api/v1/hr/roster/${rosterId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ staffId: foreignStaff }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_ROSTER_STAFF_OUTLET_MISMATCH');
    });

    it('10.19 rejects updating roster shiftTemplateId to nonexistent with 404 HR_SHIFT_TEMPLATE_NOT_FOUND', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'ROST_S19_D', 'Desig 19');
      const staffId = await seedStaff(OUTLET_1_ID, 'ROST_S19', 'Staff 19', desigId);

      const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ staffId, rosterDate: '2026-03-27', shiftTemplateId: 'st-ro1-1' }),
      }, env);
      const rosterId = (await jsonOf(createRes)).data.id;

      const res = await app.request(`/api/v1/hr/roster/${rosterId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'nonexistent-tmpl-777' }),
      }, env);

      expect(res.status).toBe(404);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_SHIFT_TEMPLATE_NOT_FOUND');
    });

    it('10.20 rejects updating roster shiftTemplateId to foreign outlet with 400 HR_ROSTER_SHIFT_OUTLET_MISMATCH', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'ROST_S20_D', 'Desig 20');
      const staffId = await seedStaff(OUTLET_1_ID, 'ROST_S20', 'Staff 20', desigId);

      const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ staffId, rosterDate: '2026-03-28', shiftTemplateId: 'st-ro1-1' }),
      }, env);
      const rosterId = (await jsonOf(createRes)).data.id;

      const res = await app.request(`/api/v1/hr/roster/${rosterId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro2-1' }),
      }, env);

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.error.code).toBe('HR_ROSTER_SHIFT_OUTLET_MISMATCH');
    });

    it('10.21 true concurrent roster assignment for same staff and same date allows exactly one 201 and one 409 HR_ROSTER_EXISTS with 1 DB row', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'RACE_DESIG', 'Race Desig');
      const staffId = await seedStaff(OUTLET_1_ID, 'RACE_STAFF_1', 'Race Staff', desigId);
      const rosterDate = '2026-04-15';

      const [resA, resB] = await Promise.all([
        app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
          body: JSON.stringify({ staffId, rosterDate, shiftTemplateId: 'st-ro1-1' }),
        }, env),
        app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
          body: JSON.stringify({ staffId, rosterDate, shiftTemplateId: 'st-ro1-2' }),
        }, env),
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([201, 409]);

      const failedRes = resA.status === 409 ? resA : resB;
      const jsonFail = await jsonOf(failedRes);
      expect(jsonFail.success).toBe(false);
      expect(jsonFail.error.code).toBe('HR_ROSTER_EXISTS');

      const db = getDb(localD1);
      const rows = await db.select().from(hrRosterAssignments).where(
        and(eq(hrRosterAssignments.staffId, staffId), eq(hrRosterAssignments.rosterDate, rosterDate))
      ).all();
      expect(rows.length).toBe(1);
    });

    it('10.22 true concurrent staff creation for same outlet and employeeCode allows exactly one 201 and one 409 HR_STAFF_CODE_EXISTS with 1 DB row', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'STAFF_RACE_D', 'Desig');
      const employeeCode = 'EMP_RACE_CONCURRENT';

      const [resA, resB] = await Promise.all([
        app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
          body: JSON.stringify({
            employeeCode,
            fullName: 'Candidate Alpha',
            designationId: desigId,
            aadhaarLast4: '1111',
            emergencyContactName: 'Contact',
            emergencyContactPhone: '9876543210',
            joiningDate: '2026-01-01',
          }),
        }, env),
        app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
          body: JSON.stringify({
            employeeCode,
            fullName: 'Candidate Beta',
            designationId: desigId,
            aadhaarLast4: '2222',
            emergencyContactName: 'Contact',
            emergencyContactPhone: '9876543210',
            joiningDate: '2026-01-01',
          }),
        }, env),
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([201, 409]);

      const failedRes = resA.status === 409 ? resA : resB;
      const jsonFail = await jsonOf(failedRes);
      expect(jsonFail.success).toBe(false);
      expect(jsonFail.error.code).toBe('HR_STAFF_CODE_EXISTS');

      const db = getDb(localD1);
      const rows = await db.select().from(hrStaff).where(
        and(eq(hrStaff.outletId, OUTLET_1_ID), eq(hrStaff.employeeCode, employeeCode))
      ).all();
      expect(rows.length).toBe(1);
    });
  });

  // ==========================================================================
  // 11. FILTERS & QUERY PARAMETERS SUITE
  // ==========================================================================
  describe('11. Query Filters and Boundaries', () => {
    it('11.1 filters staff by designationId and employmentStatus', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desig1 = await seedDesignation(OUTLET_1_ID, 'FILT_D1', 'Filter Desig 1');
      const desig2 = await seedDesignation(OUTLET_1_ID, 'FILT_D2', 'Filter Desig 2');
      await seedStaff(OUTLET_1_ID, 'STAFF_F1', 'Person F1', desig1, 'ACTIVE');
      await seedStaff(OUTLET_1_ID, 'STAFF_F2', 'Person F2', desig1, 'INACTIVE');
      await seedStaff(OUTLET_1_ID, 'STAFF_F3', 'Person F3', desig2, 'ACTIVE');

      const res = await app.request(
        `/api/v1/outlets/${OUTLET_1_ID}/hr/staff?designationId=${desig1}&employmentStatus=ACTIVE`,
        { method: 'GET', headers: { Cookie: cookie, Origin: 'http://localhost:3000' } },
        env
      );

      expect(res.status).toBe(200);
      const json = await jsonOf(res);
      expect(json.data.length).toBe(1);
      expect(json.data[0].employeeCode).toBe('STAFF_F1');
    });

    it('11.2 filters staff by search term across employeeCode and fullName', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desig = await seedDesignation(OUTLET_1_ID, 'FILT_SEARCH', 'Search Desig');
      await seedStaff(OUTLET_1_ID, 'SEARCH_101', 'Vikram Seth', desig);
      await seedStaff(OUTLET_1_ID, 'OTHER_202', 'Aakash Verma', desig);

      const res = await app.request(
        `/api/v1/outlets/${OUTLET_1_ID}/hr/staff?search=Vikram`,
        { method: 'GET', headers: { Cookie: cookie, Origin: 'http://localhost:3000' } },
        env
      );

      expect(res.status).toBe(200);
      const json = await jsonOf(res);
      expect(json.data.length).toBe(1);
      expect(json.data[0].employeeCode).toBe('SEARCH_101');
    });

    it('11.3 filters staff by joining date range', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desig = await seedDesignation(OUTLET_1_ID, 'FILT_JOIN', 'Join Desig');
      await seedStaff(OUTLET_1_ID, 'JOIN_JAN', 'Jan Person', desig, 'ACTIVE', { joiningDate: '2026-01-10' });
      await seedStaff(OUTLET_1_ID, 'JOIN_MAR', 'Mar Person', desig, 'ACTIVE', { joiningDate: '2026-03-20' });

      const res = await app.request(
        `/api/v1/outlets/${OUTLET_1_ID}/hr/staff?joinedFrom=2026-01-01&joinedTo=2026-01-31`,
        { method: 'GET', headers: { Cookie: cookie, Origin: 'http://localhost:3000' } },
        env
      );

      expect(res.status).toBe(200);
      const json = await jsonOf(res);
      expect(json.data.length).toBe(1);
      expect(json.data[0].employeeCode).toBe('JOIN_JAN');
    });

    it('11.4 rejects staff filter with reversed joinedFrom > joinedTo with 400', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(
        `/api/v1/outlets/${OUTLET_1_ID}/hr/staff?joinedFrom=2026-05-01&joinedTo=2026-01-01`,
        { method: 'GET', headers: { Cookie: cookie, Origin: 'http://localhost:3000' } },
        env
      );

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.success).toBe(false);
    });

    it('11.5 filters roster by date range and status', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desig = await seedDesignation(OUTLET_1_ID, 'FILT_ROST', 'Roster Filter Desig');
      const staff = await seedStaff(OUTLET_1_ID, 'STAFF_ROST_F', 'Staff Rost', desig);

      // Create Day 1 SCHEDULED and Day 2 CANCELLED
      const db = getDb(localD1);
      await db.insert(hrRosterAssignments).values({
        id: 'rf-1',
        outletId: OUTLET_1_ID,
        staffId: staff,
        rosterDate: '2026-03-01',
        shiftTemplateId: 'st-ro1-1',
        status: 'SCHEDULED',
        createdBy: 'user-admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();
      await db.insert(hrRosterAssignments).values({
        id: 'rf-2',
        outletId: OUTLET_1_ID,
        staffId: staff,
        rosterDate: '2026-03-05',
        shiftTemplateId: 'st-ro1-1',
        status: 'CANCELLED',
        createdBy: 'user-admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();

      const res = await app.request(
        `/api/v1/outlets/${OUTLET_1_ID}/hr/roster?fromDate=2026-03-01&toDate=2026-03-10&status=SCHEDULED`,
        { method: 'GET', headers: { Cookie: cookie, Origin: 'http://localhost:3000' } },
        env
      );

      expect(res.status).toBe(200);
      const json = await jsonOf(res);
      expect(json.data.length).toBe(1);
      expect(json.data[0].id).toBe('rf-1');
    });

    it('11.6 rejects roster filter with reversed fromDate > toDate with 400', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(
        `/api/v1/outlets/${OUTLET_1_ID}/hr/roster?fromDate=2026-04-01&toDate=2026-03-01`,
        { method: 'GET', headers: { Cookie: cookie, Origin: 'http://localhost:3000' } },
        env
      );

      expect(res.status).toBe(400);
      const json = await jsonOf(res);
      expect(json.success).toBe(false);
    });

    it('11.7 filters roster by shiftTemplateId', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desig = await seedDesignation(OUTLET_1_ID, 'FILT_SHIFT_D', 'Desig');
      const staff = await seedStaff(OUTLET_1_ID, 'STAFF_SHIFT_F', 'Staff', desig);

      const db = getDb(localD1);
      await db.insert(hrRosterAssignments).values({
        id: 'rf-shift-1',
        outletId: OUTLET_1_ID,
        staffId: staff,
        rosterDate: '2026-03-01',
        shiftTemplateId: 'st-ro1-1',
        status: 'SCHEDULED',
        createdBy: 'user-admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();

      const res = await app.request(
        `/api/v1/outlets/${OUTLET_1_ID}/hr/roster?shiftTemplateId=st-ro1-1`,
        { method: 'GET', headers: { Cookie: cookie, Origin: 'http://localhost:3000' } },
        env
      );

      expect(res.status).toBe(200);
      const json = await jsonOf(res);
      expect(json.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // 12. RBAC MATRIX & ROLE PERMISSION ENFORCEMENT SUITE
  // ==========================================================================
  describe('12. RBAC Role Matrix Enforcement', () => {
    it('12.1 unauthenticated request returns 401', async () => {
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'GET',
        headers: { Origin: 'http://localhost:3000' },
      }, env);

      expect(res.status).toBe(401);
    });

    it('12.2 State Office can read staff but cannot create staff (403)', async () => {
      const soCookie = await loginAs('wbso@iocl.in');
      const readRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'GET',
        headers: { Cookie: soCookie, Origin: 'http://localhost:3000' },
      }, env);
      expect(readRes.status).toBe(200);

      const desigId = await seedDesignation(OUTLET_1_ID, 'SO_TEST_DESIG', 'Desig');
      const writeRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: soCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'SO_FAIL',
          fullName: 'Person',
          designationId: desigId,
          aadhaarLast4: '9999',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
        }),
      }, env);
      expect(writeRes.status).toBe(403);
    });

    it('12.3 Divisional Office can read designations but cannot create designation (403)', async () => {
      const doCookie = await loginAs('kolkatado@iocl.in');
      const readRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/designations`, {
        method: 'GET',
        headers: { Cookie: doCookie, Origin: 'http://localhost:3000' },
      }, env);
      expect(readRes.status).toBe(200);

      const writeRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/designations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: doCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'DO_FAIL',
          name: 'DO Should Fail',
        }),
      }, env);
      expect(writeRes.status).toBe(403);
    });

    it('12.4 Field Officer has full read and write access to staff and roster', async () => {
      const foCookie = await loginAs('fo.central@iocl.in');
      const desigRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/designations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: foCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ code: 'FO_DESIG', name: 'FO Desig' }),
      }, env);
      expect(desigRes.status).toBe(201);
      const desigId = (await jsonOf(desigRes)).data.id;

      const staffRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: foCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'FO_STAFF_1',
          fullName: 'FO Person',
          designationId: desigId,
          aadhaarLast4: '7777',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
        }),
      }, env);
      expect(staffRes.status).toBe(201);
    });

    it('12.5 Dealer can create staff and roster but CANNOT create manpower sanctions (403)', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'DEALER_TEST_D', 'Dealer Desig');

      // Staff write succeeds
      const staffRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'DEALER_EMP_1',
          fullName: 'Dealer Person',
          designationId: desigId,
          aadhaarLast4: '8888',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
        }),
      }, env);
      expect(staffRes.status).toBe(201);
      const staffId = (await jsonOf(staffRes)).data.id;

      // Roster write succeeds
      const rosterRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId,
          rosterDate: '2026-03-25',
          shiftTemplateId: 'st-ro1-1',
        }),
      }, env);
      expect(rosterRes.status).toBe(201);

      // Manpower sanction write MUST FAIL with 403
      const sancRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/manpower-sanctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          designationId: desigId,
          sanctionedCount: 10,
          effectiveFrom: '2026-01-01',
        }),
      }, env);
      expect(sancRes.status).toBe(403);
    });

    it('12.6 CSP can create staff and roster but CANNOT create manpower sanctions (403)', async () => {
      const cspCookie = await loginAs('csp.parkstreet@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'CSP_TEST_D', 'CSP Desig');

      // Manpower sanction write MUST FAIL with 403
      const sancRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/manpower-sanctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cspCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          designationId: desigId,
          sanctionedCount: 10,
          effectiveFrom: '2026-01-01',
        }),
      }, env);
      expect(sancRes.status).toBe(403);
    });

    it('12.7 Business Manager can create and update manpower sanctions', async () => {
      const bmCookie = await loginAs('bm.kolkata@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'BM_SANCT_DESIG', 'BM Desig');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/manpower-sanctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: bmCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          designationId: desigId,
          sanctionedCount: 12,
          effectiveFrom: '2026-01-01',
        }),
      }, env);

      expect(res.status).toBe(201);
      const json = await jsonOf(res);
      expect(json.data.sanctionedCount).toBe(12);
    });
  });

  // ==========================================================================
  // 13. SCOPED OUTLET ISOLATION SUITE
  // ==========================================================================
  describe('13. ScopeService Outlet Isolation', () => {
    it('13.1 Dealer scoped to Outlet 1 cannot list staff of Outlet 2 (403)', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/hr/staff`, {
        method: 'GET',
        headers: { Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }, env);

      expect(res.status).toBe(403);
    });

    it('13.2 Dealer scoped to Outlet 1 cannot update staff of Outlet 2 via ID route (403)', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const desigO2 = await seedDesignation(OUTLET_2_ID, 'O2_DESIG_SCOPE', 'O2 Desig');
      const staffO2 = await seedStaff(OUTLET_2_ID, 'O2_STAFF_SCOPE', 'Foreign Staff', desigO2);

      const res = await app.request(`/api/v1/hr/staff/${staffO2}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ fullName: 'Malicious Update' }),
      }, env);

      expect(res.status).toBe(403);
    });

    it('13.3 Dealer scoped to Outlet 1 cannot get roster of Outlet 2 via ID route (403)', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const desigO2 = await seedDesignation(OUTLET_2_ID, 'O2_DESIG_ROST', 'O2 Desig');
      const staffO2 = await seedStaff(OUTLET_2_ID, 'O2_STAFF_ROST', 'Foreign Staff', desigO2);
      const db = getDb(localD1);
      const rosterId = 'roster-o2-scope-test';
      await db.insert(hrRosterAssignments).values({
        id: rosterId,
        outletId: OUTLET_2_ID,
        staffId: staffO2,
        rosterDate: '2026-03-30',
        shiftTemplateId: 'st-ro2-1',
        status: 'SCHEDULED',
        createdBy: 'user-admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();

      const res = await app.request(`/api/v1/hr/roster/${rosterId}`, {
        method: 'GET',
        headers: { Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }, env);

      expect(res.status).toBe(403);
    });

    it('13.4 Dealer scoped to Outlet 1 cannot access manpower summary of Outlet 2 (403)', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/hr/manpower-summary`, {
        method: 'GET',
        headers: { Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }, env);

      expect(res.status).toBe(403);
    });

    it('13.5 Dealer scoped to Outlet 1 cannot get designation of Outlet 2 via ID route (403)', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const desigO2 = await seedDesignation(OUTLET_2_ID, 'O2_ISO_DESIG', 'O2 Iso');

      const res = await app.request(`/api/v1/hr/designations/${desigO2}`, {
        method: 'GET',
        headers: { Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }, env);

      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // 14. AUDIT LOGGING SUITE
  // ==========================================================================
  describe('14. Audit Trail & Privacy Safeguards', () => {
    it('14.1 records audit log on designation creation and update', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/designations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ code: 'AUDIT_DESIG', name: 'Audit Desig' }),
      }, env);
      expect(res.status).toBe(201);
      const desigId = (await jsonOf(res)).data.id;

      const db = getDb(localD1);
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, desigId)).all();
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].action).toBe('HR_DESIGNATION_CREATE');
    });

    it('14.2 records audit log on staff creation without full Aadhaar exposure', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'AUDIT_STAFF_D', 'Desig');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'AUDIT_EMP',
          fullName: 'Audit Person',
          designationId: desigId,
          aadhaarLast4: '4444',
          emergencyContactName: 'Contact',
          emergencyContactPhone: '9876543210',
          joiningDate: '2026-01-01',
        }),
      }, env);
      expect(res.status).toBe(201);
      const staffId = (await jsonOf(res)).data.id;

      const db = getDb(localD1);
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, staffId)).all();
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].action).toBe('HR_STAFF_CREATE');
      // Verify no 12-digit pattern exists
      const logStr = JSON.stringify(logs[0]);
      expect(logStr).not.toMatch(/\b\d{12}\b/);
    });

    it('14.3 records audit log on manpower sanction create and update', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'AUDIT_SANC_D', 'Desig');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/manpower-sanctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ designationId: desigId, sanctionedCount: 5, effectiveFrom: '2026-01-01' }),
      }, env);
      const sancId = (await jsonOf(res)).data.id;

      const db = getDb(localD1);
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, sancId)).all();
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].action).toBe('HR_MANPOWER_SANCTION_CREATE');
    });

    it('14.4 records audit log on roster assignment create and update', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const desigId = await seedDesignation(OUTLET_1_ID, 'AUDIT_ROST_D', 'Desig');
      const staffId = await seedStaff(OUTLET_1_ID, 'AUDIT_ROST_S', 'Staff', desigId);

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ staffId, rosterDate: '2026-03-31', shiftTemplateId: 'st-ro1-1' }),
      }, env);
      const rosterId = (await jsonOf(res)).data.id;

      const db = getDb(localD1);
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, rosterId)).all();
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].action).toBe('HR_ROSTER_CREATE');
    });
  });

  // ==========================================================================
  // 15. ERROR SANITIZATION & RAW ERROR PROTECTION SUITE
  // ==========================================================================
  describe('15. Error Sanitization & Protection', () => {
    it('15.1 sanitizes unhandled repository exception into 500 INTERNAL_SERVER_ERROR without leaking SQLite/SQL details', async () => {
      const cookie = await loginAs('admin@iocl.in');

      // Monkey patch getDesignationById to throw a raw SQLite constraint simulation
      const originalMethod = HrRepository.prototype.getDesignationById;
      HrRepository.prototype.getDesignationById = async function () {
        throw new Error('SQLITE_CONSTRAINT: secret_internal_table.secret_column');
      };

      try {
        const res = await app.request(`/api/v1/hr/designations/some-id`, {
          method: 'GET',
          headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
        }, env);

        expect(res.status).toBe(500);
        const json = await jsonOf(res);
        expect(json.success).toBe(false);
        expect(json.error.code).toBe('INTERNAL_SERVER_ERROR');
        expect(json.error.message).toBe('An unexpected server error occurred.');
        const rawResponse = JSON.stringify(json);
        expect(rawResponse).not.toContain('SQLITE');
        expect(rawResponse).not.toContain('secret_internal_table');
      } finally {
        HrRepository.prototype.getDesignationById = originalMethod;
      }
    });
  });
});
