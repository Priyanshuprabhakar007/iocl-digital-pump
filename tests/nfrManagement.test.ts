import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import fs from 'fs';
import { eq } from 'drizzle-orm';
import {
  nfrSpaces,
  nfrVendors,
  nfrLeases,
  nfrRentDues,
  nfrRentPayments,
  documents,
  utilitySubMeters,
  auditLogs,
  permissions,
  rolePermissions,
  roles,
} from '../src/db/schema';
import { PERMISSIONS, ROLES } from '../src/shared/constants';

const SAFE_MONEY_LIMIT_PAISE = 9_000_000_000_000_000; // 9e15 paise

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

describe('Phase 4C-1 NFR / Vendor Lease & Rent Core Backend Suite', () => {
  let localD1: any;
  let env: any;
  let testDbPath: string;

  const OUTLET_1_ID = 'ro-1001'; // Park Street IOCL (Kolkata DO, Central SA)
  const OUTLET_2_ID = 'ro-1002'; // Salt Lake IOCL (Kolkata DO, North SA)
  const OUTLET_3_ID = 'ro-1003'; // GT Road Ludhiana (Ludhiana DO, Central SA)

  beforeEach(async () => {
    testDbPath = `./.sqlite/test_nfr_${Math.random().toString(36).substring(2)}_${Date.now()}.db`;
    if (fs.existsSync(testDbPath)) { try { fs.unlinkSync(testDbPath); } catch (e) {} }
    const walPath = `${testDbPath}-wal`;
    const shmPath = `${testDbPath}-shm`;
    if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch (e) {} }
    if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch (e) {} }

    localD1 = createLocalD1Database(testDbPath);
    await seedDatabase(getDb(localD1));

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
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3000' },
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
      name: 'agreement-doc.pdf',
      sizeBytes: 1024,
      mimeType: 'application/pdf',
      r2Key: `outlets/${outletId}/${id}.pdf`,
      uploadedByUserId: 'user-admin',
      createdAt: new Date().toISOString(),
    }).run();
    return id;
  }

  async function createTestUtilitySubMeter(outletId: string, beneficiaryType: 'NFR_VENDOR' | 'CNG_FACILITY' | 'OTHER' = 'NFR_VENDOR') {
    const db = getDb(localD1);
    const subMeterId = `subm-${Math.random().toString(36).substring(2)}`;
    const now = new Date().toISOString();

    await db.insert(utilitySubMeters).values({
      id: subMeterId,
      outletId,
      meterCode: `SUB-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      name: 'NFR Vendor Sub-meter',
      beneficiaryType,
      beneficiaryName: 'Test Beneficiary',
      serialNumber: `SN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      ratePaisePerKwh: 850,
      status: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    return { subMeterId };
  }

  // =========================================================================
  // 1. MIGRATION, SCHEMA STRUCTURE & TRIGGERS
  // =========================================================================
  describe('1. Migration, Schema & Constraint Verification', () => {
    it('1.1 should create nfr_spaces table with all expected columns', async () => {
      const db = getDb(localD1);
      const rows = await db.all<{ name: string; type: string }>("PRAGMA table_info(nfr_spaces);");
      const cols = rows.map(r => r.name);
      expect(cols).toContain('id');
      expect(cols).toContain('outlet_id');
      expect(cols).toContain('space_code');
      expect(cols).toContain('name');
      expect(cols).toContain('nfr_type');
      expect(cols).toContain('location_description');
      expect(cols).toContain('status');
      expect(cols).toContain('notes');
      expect(cols).toContain('created_by');
      expect(cols).toContain('created_at');
      expect(cols).toContain('updated_at');
    });

    it('1.2 should create nfr_vendors table with all expected columns', async () => {
      const db = getDb(localD1);
      const rows = await db.all<{ name: string; type: string }>("PRAGMA table_info(nfr_vendors);");
      const cols = rows.map(r => r.name);
      expect(cols).toContain('id');
      expect(cols).toContain('outlet_id');
      expect(cols).toContain('vendor_name');
      expect(cols).toContain('owner_contact_name');
      expect(cols).toContain('owner_contact_phone');
      expect(cols).toContain('owner_contact_email');
      expect(cols).toContain('address');
      expect(cols).toContain('status');
      expect(cols).toContain('notes');
      expect(cols).toContain('created_by');
      expect(cols).toContain('created_at');
      expect(cols).toContain('updated_at');
    });

    it('1.3 should create nfr_leases table with all expected columns', async () => {
      const db = getDb(localD1);
      const rows = await db.all<{ name: string; type: string }>("PRAGMA table_info(nfr_leases);");
      const cols = rows.map(r => r.name);
      expect(cols).toContain('id');
      expect(cols).toContain('outlet_id');
      expect(cols).toContain('space_id');
      expect(cols).toContain('vendor_id');
      expect(cols).toContain('agreement_number');
      expect(cols).toContain('lease_start_date');
      expect(cols).toContain('lease_end_date');
      expect(cols).toContain('monthly_rent_paise');
      expect(cols).toContain('security_deposit_paise');
      expect(cols).toContain('monthly_due_day');
      expect(cols).toContain('agreement_document_id');
      expect(cols).toContain('sub_meter_id');
      expect(cols).toContain('status');
      expect(cols).toContain('terminated_at');
      expect(cols).toContain('termination_reason');
      expect(cols).toContain('terminated_by_user_id');
      expect(cols).toContain('notes');
      expect(cols).toContain('created_by');
      expect(cols).toContain('created_at');
      expect(cols).toContain('updated_at');
    });

    it('1.4 should create nfr_rent_dues table with all expected columns', async () => {
      const db = getDb(localD1);
      const rows = await db.all<{ name: string; type: string }>("PRAGMA table_info(nfr_rent_dues);");
      const cols = rows.map(r => r.name);
      expect(cols).toContain('id');
      expect(cols).toContain('outlet_id');
      expect(cols).toContain('lease_id');
      expect(cols).toContain('billing_month');
      expect(cols).toContain('rent_period_start');
      expect(cols).toContain('rent_period_end');
      expect(cols).toContain('due_date');
      expect(cols).toContain('monthly_rent_paise_snapshot');
      expect(cols).toContain('created_by');
      expect(cols).toContain('created_at');
    });

    it('1.5 should create nfr_rent_payments table with all expected columns', async () => {
      const db = getDb(localD1);
      const rows = await db.all<{ name: string; type: string }>("PRAGMA table_info(nfr_rent_payments);");
      const cols = rows.map(r => r.name);
      expect(cols).toContain('id');
      expect(cols).toContain('outlet_id');
      expect(cols).toContain('rent_due_id');
      expect(cols).toContain('amount_paise');
      expect(cols).toContain('receipt_document_id');
      expect(cols).toContain('payment_reference');
      expect(cols).toContain('paid_at');
      expect(cols).toContain('recorded_by_user_id');
      expect(cols).toContain('notes');
      expect(cols).toContain('created_at');
    });

    it('1.6 should seed all 5 NFR permissions in permissions table', async () => {
      const db = getDb(localD1);
      const perms = await db.select().from(permissions);
      const codes = perms.map(p => p.code);
      expect(codes).toContain(PERMISSIONS.NFR_READ);
      expect(codes).toContain(PERMISSIONS.NFR_MASTER_WRITE);
      expect(codes).toContain(PERMISSIONS.NFR_LEASES_WRITE);
      expect(codes).toContain(PERMISSIONS.NFR_RENT_DUES_WRITE);
      expect(codes).toContain(PERMISSIONS.NFR_RENT_PAYMENTS_WRITE);
    });

    it('1.7 should verify exact role permission mapping for all system roles', async () => {
      const db = getDb(localD1);
      const mappings = await db
        .select({
          roleCode: roles.code,
          permCode: permissions.code,
        })
        .from(rolePermissions)
        .innerJoin(roles, eq(rolePermissions.roleId, roles.id))
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id));

      const getPermsForRole = (role: string) => mappings.filter(m => m.roleCode === role).map(m => m.permCode);

      // Admin has all 5
      const adminPerms = getPermsForRole(ROLES.ADMIN);
      expect(adminPerms).toContain(PERMISSIONS.NFR_READ);
      expect(adminPerms).toContain(PERMISSIONS.NFR_MASTER_WRITE);
      expect(adminPerms).toContain(PERMISSIONS.NFR_LEASES_WRITE);
      expect(adminPerms).toContain(PERMISSIONS.NFR_RENT_DUES_WRITE);
      expect(adminPerms).toContain(PERMISSIONS.NFR_RENT_PAYMENTS_WRITE);

      // State Office & Divisional Office: READ only
      const soPerms = getPermsForRole(ROLES.STATE_OFFICE);
      expect(soPerms).toContain(PERMISSIONS.NFR_READ);
      expect(soPerms).not.toContain(PERMISSIONS.NFR_MASTER_WRITE);
      expect(soPerms).not.toContain(PERMISSIONS.NFR_LEASES_WRITE);
      expect(soPerms).not.toContain(PERMISSIONS.NFR_RENT_DUES_WRITE);
      expect(soPerms).not.toContain(PERMISSIONS.NFR_RENT_PAYMENTS_WRITE);

      const doPerms = getPermsForRole(ROLES.DIVISIONAL_OFFICE);
      expect(doPerms).toContain(PERMISSIONS.NFR_READ);
      expect(doPerms).not.toContain(PERMISSIONS.NFR_MASTER_WRITE);
      expect(doPerms).not.toContain(PERMISSIONS.NFR_LEASES_WRITE);
      expect(doPerms).not.toContain(PERMISSIONS.NFR_RENT_DUES_WRITE);
      expect(doPerms).not.toContain(PERMISSIONS.NFR_RENT_PAYMENTS_WRITE);

      // Business Manager & Field Officer: Full access
      const bmPerms = getPermsForRole(ROLES.BUSINESS_MANAGER);
      expect(bmPerms).toContain(PERMISSIONS.NFR_READ);
      expect(bmPerms).toContain(PERMISSIONS.NFR_MASTER_WRITE);
      expect(bmPerms).toContain(PERMISSIONS.NFR_LEASES_WRITE);
      expect(bmPerms).toContain(PERMISSIONS.NFR_RENT_DUES_WRITE);
      expect(bmPerms).toContain(PERMISSIONS.NFR_RENT_PAYMENTS_WRITE);

      const foPerms = getPermsForRole(ROLES.FIELD_OFFICER);
      expect(foPerms).toContain(PERMISSIONS.NFR_READ);
      expect(foPerms).toContain(PERMISSIONS.NFR_MASTER_WRITE);
      expect(foPerms).toContain(PERMISSIONS.NFR_LEASES_WRITE);
      expect(foPerms).toContain(PERMISSIONS.NFR_RENT_DUES_WRITE);
      expect(foPerms).toContain(PERMISSIONS.NFR_RENT_PAYMENTS_WRITE);

      // Dealer & CSP: NFR_READ and NFR_RENT_PAYMENTS_WRITE only
      const dealerPerms = getPermsForRole(ROLES.DEALER);
      expect(dealerPerms).toContain(PERMISSIONS.NFR_READ);
      expect(dealerPerms).toContain(PERMISSIONS.NFR_RENT_PAYMENTS_WRITE);
      expect(dealerPerms).not.toContain(PERMISSIONS.NFR_MASTER_WRITE);
      expect(dealerPerms).not.toContain(PERMISSIONS.NFR_LEASES_WRITE);
      expect(dealerPerms).not.toContain(PERMISSIONS.NFR_RENT_DUES_WRITE);

      const cspPerms = getPermsForRole(ROLES.CSP);
      expect(cspPerms).toContain(PERMISSIONS.NFR_READ);
      expect(cspPerms).toContain(PERMISSIONS.NFR_RENT_PAYMENTS_WRITE);
      expect(cspPerms).not.toContain(PERMISSIONS.NFR_MASTER_WRITE);
      expect(cspPerms).not.toContain(PERMISSIONS.NFR_LEASES_WRITE);
      expect(cspPerms).not.toContain(PERMISSIONS.NFR_RENT_DUES_WRITE);
    });

    it('1.8 should verify all DB triggers are registered in sqlite_master', async () => {
      const db = getDb(localD1);
      const rows = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'trigger';");
      const names = rows.map(r => r.name);

      expect(names).toContain('trg_nfr_spaces_delete_forbidden');
      expect(names).toContain('trg_nfr_vendors_delete_forbidden');
      expect(names).toContain('trg_nfr_leases_delete_forbidden');
      expect(names).toContain('trg_nfr_leases_identity_immutable');
      expect(names).toContain('trg_nfr_leases_terminated_immutable');
      expect(names).toContain('trg_nfr_leases_insert_integrity');
      expect(names).toContain('trg_nfr_leases_update_integrity');
      expect(names).toContain('trg_nfr_rent_dues_delete_forbidden');
      expect(names).toContain('trg_nfr_rent_dues_update_forbidden');
      expect(names).toContain('trg_nfr_rent_dues_insert_integrity');
      expect(names).toContain('trg_nfr_rent_payments_delete_forbidden');
      expect(names).toContain('trg_nfr_rent_payments_update_forbidden');
      expect(names).toContain('trg_nfr_rent_payments_overpayment_insert');
    });
  });

  // =========================================================================
  // 2. NFR SPACES TESTS
  // =========================================================================
  describe('2. NFR Space Master Operations', () => {
    it('2.1 should allow creating spaces with all six valid NfrTypes', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const types = ['ATM', 'CONVENIENCE_STORE', 'QSR', 'CAR_WASH', 'EV_CHARGING', 'CANOPY_ADVERTISING'] as const;

      for (let i = 0; i < types.length; i++) {
        const type = types[i];
        const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
          body: JSON.stringify({
            spaceCode: `SPC-${type}-${i}`,
            name: `${type} Space`,
            nfrType: type,
            locationDescription: `Near entry gate #${i + 1}`,
          }),
        }, env);

        expect(res.status).toBe(201);
        const body = await jsonOf(res);
        expect(body.success).toBe(true);
        expect(body.data.nfrType).toBe(type);
        expect(body.data.status).toBe('ACTIVE');
      }
    });

    it('2.2 should reject creating space with invalid NFR type', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceCode: 'SPC-INVALID',
          name: 'Invalid Space',
          nfrType: 'HOTEL_ROOM',
        }),
      }, env);

      expect(res.status).toBe(400);
      const body = await jsonOf(res);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('2.3 should list spaces and filter by status and nfrType', async () => {
      const cookie = await loginAs('admin@iocl.in');
      await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'SPC-ATM-01', name: 'ATM Kiosk 1', nfrType: 'ATM' }),
      }, env);
      await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'SPC-QSR-01', name: 'Burger Kiosk', nfrType: 'QSR' }),
      }, env);

      const listRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        headers: { 'Cookie': cookie },
      }, env);
      expect(listRes.status).toBe(200);
      const listBody = await jsonOf(listRes);
      expect(listBody.data.length).toBe(2);

      const filterRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces?nfrType=ATM`, {
        headers: { 'Cookie': cookie },
      }, env);
      const filterBody = await jsonOf(filterRes);
      expect(filterBody.data.length).toBe(1);
      expect(filterBody.data[0].spaceCode).toBe('SPC-ATM-01');
    });

    it('2.4 should get space detail and update mutable fields while spaceCode remains immutable', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceCode: 'SPC-EV-01',
          name: 'Fast Charger 1',
          nfrType: 'EV_CHARGING',
          locationDescription: 'North Bay',
        }),
      }, env);
      const space = (await jsonOf(createRes)).data;

      const getRes = await app.request(`/api/v1/nfr/spaces/${space.id}`, {
        headers: { 'Cookie': cookie },
      }, env);
      expect(getRes.status).toBe(200);
      const getBody = await jsonOf(getRes);
      expect(getBody.data.id).toBe(space.id);
      expect(getBody.data.isCurrentlyLeased).toBe(false);

      const updateRes = await app.request(`/api/v1/nfr/spaces/${space.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          name: 'Ultra Fast Charger 1',
          locationDescription: 'North Bay Pillar 4',
          status: 'INACTIVE',
        }),
      }, env);
      expect(updateRes.status).toBe(200);
      const updateBody = await jsonOf(updateRes);
      expect(updateBody.data.name).toBe('Ultra Fast Charger 1');
      expect(updateBody.data.status).toBe('INACTIVE');
      expect(updateBody.data.spaceCode).toBe('SPC-EV-01');
    });

    it('2.5 should reject duplicate spaceCode in same outlet but allow in different outlet', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res1 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'ATM-COMMON', name: 'Common ATM', nfrType: 'ATM' }),
      }, env);
      expect(res1.status).toBe(201);

      const dupRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'ATM-COMMON', name: 'Another ATM', nfrType: 'ATM' }),
      }, env);
      expect(dupRes.status).toBe(409);
      expect((await jsonOf(dupRes)).error.code).toBe('NFR_SPACE_CODE_EXISTS');

      const res2 = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/nfr/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'ATM-COMMON', name: 'Outlet 2 ATM', nfrType: 'ATM' }),
      }, env);
      expect(res2.status).toBe(201);
    });

    it('2.6 should prevent direct SQL deletion of nfr_spaces via database trigger', async () => {
      const db = getDb(localD1);
      const spaceId = 'space-del-test';
      const now = new Date().toISOString();
      await db.insert(nfrSpaces).values({
        id: spaceId,
        outletId: OUTLET_1_ID,
        spaceCode: 'SPC-NODEL',
        name: 'No Delete Space',
        nfrType: 'ATM',
        status: 'ACTIVE',
        createdBy: 'user-admin',
        createdAt: now,
        updatedAt: now,
      }).run();

      await expect(
        db.delete(nfrSpaces).where(eq(nfrSpaces.id, spaceId)).run()
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // 3. NFR VENDORS TESTS
  // =========================================================================
  describe('3. NFR Vendor Master Operations', () => {
    it('3.1 should create vendor and validate owner contact phone format', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          vendorName: 'State Bank of India',
          ownerContactName: 'Rajesh Kumar',
          ownerContactPhone: '+91 (033) 2282-1234',
          ownerContactEmail: 'rajesh.kumar@sbi.co.in',
          address: 'Samriddhi Bhavan, Kolkata',
        }),
      }, env);

      expect(res.status).toBe(201);
      const body = await jsonOf(res);
      expect(body.success).toBe(true);
      expect(body.data.vendorName).toBe('State Bank of India');
      expect(body.data.status).toBe('ACTIVE');
    });

    it('3.2 should reject vendor creation with empty contact name or invalid phone', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res1 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          vendorName: 'HDFC Bank',
          ownerContactName: '   ',
          ownerContactPhone: '9830012345',
        }),
      }, env);
      expect(res1.status).toBe(400);

      const res2 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          vendorName: 'HDFC Bank',
          ownerContactName: 'Amit Sharma',
          ownerContactPhone: 'CALL-MY-PHONE',
        }),
      }, env);
      expect(res2.status).toBe(400);
    });

    it('3.3 should list vendors and update vendor details', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          vendorName: 'Cafe Coffee Day',
          ownerContactName: 'Sunil Rao',
          ownerContactPhone: '9845012345',
        }),
      }, env);
      const vendor = (await jsonOf(createRes)).data;

      const updateRes = await app.request(`/api/v1/nfr/vendors/${vendor.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          vendorName: 'CCD Enterprises Pvt Ltd',
          ownerContactPhone: '+91 9845012345',
          status: 'INACTIVE',
        }),
      }, env);

      expect(updateRes.status).toBe(200);
      const updateBody = await jsonOf(updateRes);
      expect(updateBody.data.vendorName).toBe('CCD Enterprises Pvt Ltd');
      expect(updateBody.data.status).toBe('INACTIVE');
    });

    it('3.4 should prevent direct SQL deletion of nfr_vendors via trigger', async () => {
      const db = getDb(localD1);
      const vendorId = 'vendor-del-test';
      const now = new Date().toISOString();
      await db.insert(nfrVendors).values({
        id: vendorId,
        outletId: OUTLET_1_ID,
        vendorName: 'Permanent Vendor',
        ownerContactName: 'Contact Person',
        ownerContactPhone: '9830000000',
        status: 'ACTIVE',
        createdBy: 'user-admin',
        createdAt: now,
        updatedAt: now,
      }).run();

      await expect(
        db.delete(nfrVendors).where(eq(nfrVendors.id, vendorId)).run()
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // 4. LEASE AGREEMENT MANAGEMENT & OVERLAP PROTECTION
  // =========================================================================
  describe('4. Lease Agreement Management & Overlap Protection', () => {
    let spaceId1: string;
    let spaceId2: string;
    let vendorId1: string;
    let docId1: string;
    let subMeterId1: string;

    beforeEach(async () => {
      const cookie = await loginAs('admin@iocl.in');
      const sRes1 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'ATM-1', name: 'ATM Space 1', nfrType: 'ATM' }),
      }, env);
      spaceId1 = (await jsonOf(sRes1)).data.id;

      const sRes2 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'QSR-1', name: 'Food Court Kiosk', nfrType: 'QSR' }),
      }, env);
      spaceId2 = (await jsonOf(sRes2)).data.id;

      const vRes1 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          vendorName: 'SBI ATM Operations',
          ownerContactName: 'Anil Gupta',
          ownerContactPhone: '9831122334',
        }),
      }, env);
      vendorId1 = (await jsonOf(vRes1)).data.id;

      docId1 = await createTestDocument(OUTLET_1_ID);
      const { subMeterId } = await createTestUtilitySubMeter(OUTLET_1_ID, 'NFR_VENDOR');
      subMeterId1 = subMeterId;
    });

    it('4.1 should create a valid lease agreement with document and NFR submeter', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: spaceId1,
          vendorId: vendorId1,
          agreementNumber: 'AGR/2026/001',
          leaseStartDate: '2026-01-01',
          leaseEndDate: '2026-12-31',
          monthlyRent: '35000.00',
          securityDeposit: '105000.00',
          monthlyDueDay: 5,
          agreementDocumentId: docId1,
          subMeterId: subMeterId1,
        }),
      }, env);

      expect(res.status).toBe(201);
      const body = await jsonOf(res);
      expect(body.success).toBe(true);
      expect(body.data.monthlyRentPaise).toBe(3500000);
      expect(body.data.monthlyRentStr).toBe('35000.00');
      expect(body.data.securityDepositPaise).toBe(10500000);
      expect(body.data.securityDepositStr).toBe('105000.00');
      expect(body.data.status).toBe('ACTIVE');
      expect(body.data.isExpired).toBe(false);
    });

    it('4.2 should reject lease when agreement document belongs to foreign outlet', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const foreignDocId = await createTestDocument(OUTLET_2_ID);

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: spaceId1,
          vendorId: vendorId1,
          agreementNumber: 'AGR/2026/DOC-ERR',
          leaseStartDate: '2026-01-01',
          leaseEndDate: '2026-12-31',
          monthlyRent: '35000.00',
          monthlyDueDay: 5,
          agreementDocumentId: foreignDocId,
        }),
      }, env);

      expect(res.status).toBe(400);
      expect((await jsonOf(res)).error.code).toBe('NFR_LEASE_DOCUMENT_OUTLET_MISMATCH');
    });

    it('4.3 should reject lease when linked sub-meter has non-NFR beneficiary type', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const { subMeterId: cngSubMeter } = await createTestUtilitySubMeter(OUTLET_1_ID, 'CNG_FACILITY');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: spaceId1,
          vendorId: vendorId1,
          agreementNumber: 'AGR/2026/CNG-ERR',
          leaseStartDate: '2026-01-01',
          leaseEndDate: '2026-12-31',
          monthlyRent: '35000.00',
          monthlyDueDay: 5,
          subMeterId: cngSubMeter,
        }),
      }, env);

      expect(res.status).toBe(400);
      expect((await jsonOf(res)).error.code).toBe('NFR_LEASE_SUB_METER_NOT_NFR');
    });

    it('4.4 should reject lease when sub-meter belongs to a foreign outlet', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const { subMeterId: foreignSubMeter } = await createTestUtilitySubMeter(OUTLET_2_ID, 'NFR_VENDOR');

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: spaceId1,
          vendorId: vendorId1,
          agreementNumber: 'AGR/2026/OUTLET-ERR',
          leaseStartDate: '2026-01-01',
          leaseEndDate: '2026-12-31',
          monthlyRent: '35000.00',
          monthlyDueDay: 5,
          subMeterId: foreignSubMeter,
        }),
      }, env);

      expect(res.status).toBe(400);
      expect((await jsonOf(res)).error.code).toBe('NFR_LEASE_SUB_METER_OUTLET_MISMATCH');
    });

    it('4.5 should reject invalid dates, end < start, due day 0 or 32, zero rent, negative deposit', async () => {
      const cookie = await loginAs('admin@iocl.in');

      const res1 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: spaceId1, vendorId: vendorId1, agreementNumber: 'AGR-1',
          leaseStartDate: '2026-02-31', leaseEndDate: '2026-12-31',
          monthlyRent: '1000.00', monthlyDueDay: 5,
        }),
      }, env);
      expect(res1.status).toBe(400);

      const res2 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: spaceId1, vendorId: vendorId1, agreementNumber: 'AGR-2',
          leaseStartDate: '2026-12-31', leaseEndDate: '2026-01-01',
          monthlyRent: '1000.00', monthlyDueDay: 5,
        }),
      }, env);
      expect(res2.status).toBe(400);

      const res3 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: spaceId1, vendorId: vendorId1, agreementNumber: 'AGR-3',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
          monthlyRent: '1000.00', monthlyDueDay: 0,
        }),
      }, env);
      expect(res3.status).toBe(400);

      const res4 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: spaceId1, vendorId: vendorId1, agreementNumber: 'AGR-4',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
          monthlyRent: '1000.00', monthlyDueDay: 32,
        }),
      }, env);
      expect(res4.status).toBe(400);

      const res5 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: spaceId1, vendorId: vendorId1, agreementNumber: 'AGR-5',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
          monthlyRent: '0.00', monthlyDueDay: 5,
        }),
      }, env);
      expect(res5.status).toBe(400);

      const res6 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: spaceId1, vendorId: vendorId1, agreementNumber: 'AGR-6',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
          monthlyRent: '1000.00', securityDeposit: '-500.00', monthlyDueDay: 5,
        }),
      }, env);
      expect(res6.status).toBe(400);
    });

    it('4.6 should reject overlapping lease periods for the same physical space', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res1 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: spaceId1,
          vendorId: vendorId1,
          agreementNumber: 'AGR-BASE',
          leaseStartDate: '2026-03-01',
          leaseEndDate: '2026-08-31',
          monthlyRent: '25000.00',
          monthlyDueDay: 1,
        }),
      }, env);
      expect(res1.status).toBe(201);

      // Exact overlap
      const resOverlap1 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: spaceId1, vendorId: vendorId1, agreementNumber: 'AGR-OV-1',
          leaseStartDate: '2026-03-01', leaseEndDate: '2026-08-31',
          monthlyRent: '25000.00', monthlyDueDay: 1,
        }),
      }, env);
      expect(resOverlap1.status).toBe(409);
      expect((await jsonOf(resOverlap1)).error.code).toBe('NFR_SPACE_LEASE_OVERLAP');

      // Start earlier, end during
      const resOverlap2 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: spaceId1, vendorId: vendorId1, agreementNumber: 'AGR-OV-2',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-04-15',
          monthlyRent: '25000.00', monthlyDueDay: 1,
        }),
      }, env);
      expect(resOverlap2.status).toBe(409);

      // Start during, end later
      const resOverlap3 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: spaceId1, vendorId: vendorId1, agreementNumber: 'AGR-OV-3',
          leaseStartDate: '2026-07-01', leaseEndDate: '2026-11-30',
          monthlyRent: '25000.00', monthlyDueDay: 1,
        }),
      }, env);
      expect(resOverlap3.status).toBe(409);

      // Contained inside
      const resOverlap4 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: spaceId1, vendorId: vendorId1, agreementNumber: 'AGR-OV-4',
          leaseStartDate: '2026-04-01', leaseEndDate: '2026-05-31',
          monthlyRent: '25000.00', monthlyDueDay: 1,
        }),
      }, env);
      expect(resOverlap4.status).toBe(409);

      // Enclosing outside
      const resOverlap5 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: spaceId1, vendorId: vendorId1, agreementNumber: 'AGR-OV-5',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
          monthlyRent: '25000.00', monthlyDueDay: 1,
        }),
      }, env);
      expect(resOverlap5.status).toBe(409);

      // Back-to-back non-overlapping: ALLOWED
      const resAllowed = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: spaceId1, vendorId: vendorId1, agreementNumber: 'AGR-NEXT',
          leaseStartDate: '2026-09-01', leaseEndDate: '2026-12-31',
          monthlyRent: '25000.00', monthlyDueDay: 1,
        }),
      }, env);
      expect(resAllowed.status).toBe(201);

      // Different space: ALLOWED
      const resDiffSpace = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: spaceId2, vendorId: vendorId1, agreementNumber: 'AGR-DIFF-SPACE',
          leaseStartDate: '2026-03-01', leaseEndDate: '2026-08-31',
          monthlyRent: '25000.00', monthlyDueDay: 1,
        }),
      }, env);
      expect(resDiffSpace.status).toBe(201);
    });

    it('4.7 should reject direct SQL overlap via database trigger trg_nfr_lease_overlap_insert', async () => {
      const db = getDb(localD1);
      const now = new Date().toISOString();

      await db.insert(nfrLeases).values({
        id: 'lease-db-1',
        outletId: OUTLET_1_ID,
        spaceId: spaceId1,
        vendorId: vendorId1,
        agreementNumber: 'AGR-SQL-1',
        leaseStartDate: '2026-01-01',
        leaseEndDate: '2026-06-30',
        monthlyRentPaise: 2000000,
        securityDepositPaise: 6000000,
        monthlyDueDay: 1,
        status: 'ACTIVE',
        createdBy: 'user-admin',
        createdAt: now,
        updatedAt: now,
      }).run();

      await expect(
        db.insert(nfrLeases).values({
          id: 'lease-db-2',
          outletId: OUTLET_1_ID,
          spaceId: spaceId1,
          vendorId: vendorId1,
          agreementNumber: 'AGR-SQL-2',
          leaseStartDate: '2026-05-01',
          leaseEndDate: '2026-10-31',
          monthlyRentPaise: 2000000,
          securityDepositPaise: 6000000,
          monthlyDueDay: 1,
          status: 'ACTIVE',
          createdBy: 'user-admin',
          createdAt: now,
          updatedAt: now,
        }).run()
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // 5. LEASE TERMINATION & IMMUTABILITY TESTS
  // =========================================================================
  describe('5. Lease Termination Lifecycle & Immutability', () => {
    let leaseId1: string;

    beforeEach(async () => {
      const cookie = await loginAs('admin@iocl.in');
      const sRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'ATM-TERM', name: 'Termination Test Space', nfrType: 'ATM' }),
      }, env);
      const spaceId = (await jsonOf(sRes)).data.id;

      const vRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'Term Vendor', ownerContactName: 'Contact', ownerContactPhone: '9830000000' }),
      }, env);
      const vendorId = (await jsonOf(vRes)).data.id;

      const lRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId,
          vendorId,
          agreementNumber: 'AGR-TERM-01',
          leaseStartDate: '2026-01-01',
          leaseEndDate: '2026-12-31',
          monthlyRent: '30000.00',
          monthlyDueDay: 10,
        }),
      }, env);
      leaseId1 = (await jsonOf(lRes)).data.id;
    });

    it('5.1 should terminate active lease with server actor, timestamp, and reason', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/nfr/leases/${leaseId1}/terminate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ terminationReason: 'Mutual agreement to vacate kiosk early' }),
      }, env);

      expect(res.status).toBe(200);
      const body = await jsonOf(res);
      expect(body.data.status).toBe('TERMINATED');
      expect(body.data.terminationReason).toBe('Mutual agreement to vacate kiosk early');
      expect(body.data.terminatedAt).toBeDefined();
      expect(body.data.terminatedByUserId).toBe('user-admin');
    });

    it('5.2 should reject terminating an already terminated lease with 409', async () => {
      const cookie = await loginAs('admin@iocl.in');
      await app.request(`/api/v1/nfr/leases/${leaseId1}/terminate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ terminationReason: 'First termination' }),
      }, env);

      const res2 = await app.request(`/api/v1/nfr/leases/${leaseId1}/terminate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ terminationReason: 'Second termination' }),
      }, env);

      expect(res2.status).toBe(409);
      expect((await jsonOf(res2)).error.code).toBe('NFR_LEASE_ALREADY_TERMINATED');
    });

    it('5.3 should reject modifying a terminated lease with 409', async () => {
      const cookie = await loginAs('admin@iocl.in');
      await app.request(`/api/v1/nfr/leases/${leaseId1}/terminate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ terminationReason: 'Terminated' }),
      }, env);

      const updateRes = await app.request(`/api/v1/nfr/leases/${leaseId1}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ monthlyRent: '40000.00' }),
      }, env);

      expect(updateRes.status).toBe(409);
      expect((await jsonOf(updateRes)).error.code).toBe('NFR_LEASE_TERMINATED_IMMUTABLE');
    });

    it('5.4 should reject direct SQL update on terminated lease via trigger trg_nfr_lease_terminated_immutable', async () => {
      const db = getDb(localD1);
      await db.update(nfrLeases)
        .set({ status: 'TERMINATED', terminatedAt: new Date().toISOString(), terminatedByUserId: 'user-admin' })
        .where(eq(nfrLeases.id, leaseId1))
        .run();

      await expect(
        db.update(nfrLeases)
          .set({ notes: 'Trying to sneak a note' })
          .where(eq(nfrLeases.id, leaseId1))
          .run()
      ).rejects.toThrow();
    });

    it('5.5 should reject direct SQL delete of nfr_leases via trigger trg_nfr_lease_delete_forbidden', async () => {
      const db = getDb(localD1);
      await expect(
        db.delete(nfrLeases).where(eq(nfrLeases.id, leaseId1)).run()
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // 6. RENT DUE GENERATION & SNAPSHOT IMMUTABILITY TESTS
  // =========================================================================
  describe('6. Rent Due Generation, Calendar Math & Snapshot Integrity', () => {
    let leaseId: string;

    beforeEach(async () => {
      const cookie = await loginAs('admin@iocl.in');
      const sRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'ATM-DUE', name: 'Rent Due Space', nfrType: 'ATM' }),
      }, env);
      const spaceId = (await jsonOf(sRes)).data.id;

      const vRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'Due Vendor', ownerContactName: 'Vendor Owner', ownerContactPhone: '9830001111' }),
      }, env);
      const vendorId = (await jsonOf(vRes)).data.id;

      const lRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId,
          vendorId,
          agreementNumber: 'AGR-DUE-31',
          leaseStartDate: '2026-01-01',
          leaseEndDate: '2028-12-31',
          monthlyRent: '35000.00',
          monthlyDueDay: 31,
        }),
      }, env);
      leaseId = (await jsonOf(lRes)).data.id;
    });

    it('6.1 should generate rent due for 31-day month (January 2026)', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/nfr/leases/${leaseId}/rent-dues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2026-01' }),
      }, env);

      expect(res.status).toBe(201);
      const body = await jsonOf(res);
      expect(body.data.billingMonth).toBe('2026-01');
      expect(body.data.rentPeriodStart).toBe('2026-01-01');
      expect(body.data.rentPeriodEnd).toBe('2026-01-31');
      expect(body.data.dueDate).toBe('2026-01-31');
      expect(body.data.monthlyRentPaiseSnapshot).toBe(3500000);
      expect(body.data.paymentStatus).toBe('PENDING');
      expect(body.data.totalPaidPaise).toBe(0);
      expect(body.data.outstandingPaise).toBe(3500000);
    });

    it('6.2 should clamp due date to 30 for 30-day month (April 2026)', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/nfr/leases/${leaseId}/rent-dues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2026-04' }),
      }, env);

      expect(res.status).toBe(201);
      const body = await jsonOf(res);
      expect(body.data.rentPeriodStart).toBe('2026-04-01');
      expect(body.data.rentPeriodEnd).toBe('2026-04-30');
      expect(body.data.dueDate).toBe('2026-04-30');
    });

    it('6.3 should clamp due date to 28 in non-leap year (February 2027)', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/nfr/leases/${leaseId}/rent-dues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2027-02' }),
      }, env);

      expect(res.status).toBe(201);
      const body = await jsonOf(res);
      expect(body.data.rentPeriodStart).toBe('2027-02-01');
      expect(body.data.rentPeriodEnd).toBe('2027-02-28');
      expect(body.data.dueDate).toBe('2027-02-28');
    });

    it('6.4 should clamp due date to 29 in leap year (February 2028)', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/nfr/leases/${leaseId}/rent-dues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2028-02' }),
      }, env);

      expect(res.status).toBe(201);
      const body = await jsonOf(res);
      expect(body.data.rentPeriodStart).toBe('2028-02-01');
      expect(body.data.rentPeriodEnd).toBe('2028-02-29');
      expect(body.data.dueDate).toBe('2028-02-29');
    });

    it('6.5 should preserve historical rent snapshot when lease rent is subsequently increased', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const octRes = await app.request(`/api/v1/nfr/leases/${leaseId}/rent-dues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2026-10' }),
      }, env);
      const octDueId = (await jsonOf(octRes)).data.id;

      await app.request(`/api/v1/nfr/leases/${leaseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ monthlyRent: '40000.00' }),
      }, env);

      const novRes = await app.request(`/api/v1/nfr/leases/${leaseId}/rent-dues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2026-11' }),
      }, env);
      const novDue = (await jsonOf(novRes)).data;

      const octCheckRes = await app.request(`/api/v1/nfr/rent-dues/${octDueId}`, {
        headers: { 'Cookie': cookie },
      }, env);
      const octCheck = (await jsonOf(octCheckRes)).data;
      expect(octCheck.monthlyRentPaiseSnapshot).toBe(3500000);
      expect(octCheck.monthlyRentStr).toBe('35000.00');

      expect(novDue.monthlyRentPaiseSnapshot).toBe(4000000);
      expect(novDue.monthlyRentStr).toBe('40000.00');
    });

    it('6.6 should reject duplicate rent due generation for same billing month with 409', async () => {
      const cookie = await loginAs('admin@iocl.in');
      await app.request(`/api/v1/nfr/leases/${leaseId}/rent-dues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2026-05' }),
      }, env);

      const dupRes = await app.request(`/api/v1/nfr/leases/${leaseId}/rent-dues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2026-05' }),
      }, env);

      expect(dupRes.status).toBe(409);
      expect((await jsonOf(dupRes)).error.code).toBe('NFR_RENT_DUE_EXISTS');
    });

    it('6.7 should reject invalid YYYY-MM format like 2026-00 or 2026-13', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res1 = await app.request(`/api/v1/nfr/leases/${leaseId}/rent-dues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2026-00' }),
      }, env);
      expect(res1.status).toBe(400);

      const res2 = await app.request(`/api/v1/nfr/leases/${leaseId}/rent-dues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2026-13' }),
      }, env);
      expect(res2.status).toBe(400);
    });

    it('6.8 should reject generating rent due for month outside contractual lease period', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res1 = await app.request(`/api/v1/nfr/leases/${leaseId}/rent-dues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2025-12' }),
      }, env);
      expect(res1.status).toBe(400);

      const res2 = await app.request(`/api/v1/nfr/leases/${leaseId}/rent-dues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2029-01' }),
      }, env);
      expect(res2.status).toBe(400);
    });

    it('6.9 should reject direct SQL update and delete of nfr_rent_dues via triggers', async () => {
      const db = getDb(localD1);
      const dueId = 'due-sql-immutability';
      const now = new Date().toISOString();

      await db.insert(nfrRentDues).values({
        id: dueId,
        outletId: OUTLET_1_ID,
        leaseId,
        billingMonth: '2026-06',
        rentPeriodStart: '2026-06-01',
        rentPeriodEnd: '2026-06-30',
        dueDate: '2026-06-30',
        monthlyRentPaiseSnapshot: 3500000,
        createdBy: 'user-admin',
        createdAt: now,
      }).run();

      await expect(
        db.update(nfrRentDues)
          .set({ monthlyRentPaiseSnapshot: 5000000 })
          .where(eq(nfrRentDues.id, dueId))
          .run()
      ).rejects.toThrow();

      await expect(
        db.delete(nfrRentDues).where(eq(nfrRentDues.id, dueId)).run()
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // 7. RENT PAYMENTS, PARTIAL PAYMENTS & OVERPAYMENT PROTECTION
  // =========================================================================
  describe('7. Rent Payments, Overpayment Protection & Concurrency', () => {
    let dueId: string;
    let receiptDocId: string;

    beforeEach(async () => {
      const cookie = await loginAs('admin@iocl.in');
      const sRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'ATM-PAY', name: 'Pay Space', nfrType: 'ATM' }),
      }, env);
      const spaceId = (await jsonOf(sRes)).data.id;

      const vRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'Pay Vendor', ownerContactName: 'Owner', ownerContactPhone: '9830002222' }),
      }, env);
      const vendorId = (await jsonOf(vRes)).data.id;

      const lRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId,
          vendorId,
          agreementNumber: 'AGR-PAY-01',
          leaseStartDate: '2026-01-01',
          leaseEndDate: '2026-12-31',
          monthlyRent: '35000.00',
          monthlyDueDay: 5,
        }),
      }, env);
      const leaseId = (await jsonOf(lRes)).data.id;

      const dRes = await app.request(`/api/v1/nfr/leases/${leaseId}/rent-dues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2026-01' }),
      }, env);
      dueId = (await jsonOf(dRes)).data.id;

      receiptDocId = await createTestDocument(OUTLET_1_ID);
    });

    it('7.1 should record partial payment and transition status PENDING -> PARTIAL', async () => {
      const cookie = await loginAs('dealer.parkstreet@iocl.in');
      const res = await app.request(`/api/v1/nfr/rent-dues/${dueId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          amount: '15000.00',
          receiptDocumentId: receiptDocId,
          paymentReference: 'UPI/2026/01/15000',
        }),
      }, env);

      expect(res.status).toBe(201);
      const body = await jsonOf(res);
      expect(body.data.payment.amountPaise).toBe(1500000);
      expect(body.data.payment.amountStr).toBe('15000.00');
      expect(body.data.due.paymentStatus).toBe('PARTIAL');
      expect(body.data.due.totalPaidPaise).toBe(1500000);
      expect(body.data.due.outstandingPaise).toBe(2000000);
    });

    it('7.2 should record second payment completing the due: PARTIAL -> PAID', async () => {
      const cookie = await loginAs('dealer.parkstreet@iocl.in');
      await app.request(`/api/v1/nfr/rent-dues/${dueId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ amount: '15000.00', receiptDocumentId: receiptDocId }),
      }, env);

      const doc2 = await createTestDocument(OUTLET_1_ID);
      const res2 = await app.request(`/api/v1/nfr/rent-dues/${dueId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ amount: '20000.00', receiptDocumentId: doc2 }),
      }, env);

      expect(res2.status).toBe(201);
      const body = await jsonOf(res2);
      expect(body.data.due.paymentStatus).toBe('PAID');
      expect(body.data.due.totalPaidPaise).toBe(3500000);
      expect(body.data.due.outstandingPaise).toBe(0);
      expect(body.data.due.isOverdue).toBe(false);
    });

    it('7.3 should reject overpayment exceeding outstanding balance with 409', async () => {
      const cookie = await loginAs('dealer.parkstreet@iocl.in');
      const res = await app.request(`/api/v1/nfr/rent-dues/${dueId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ amount: '40000.00', receiptDocumentId: receiptDocId }),
      }, env);

      expect(res.status).toBe(409);
      expect((await jsonOf(res)).error.code).toBe('NFR_RENT_OVERPAYMENT');
    });

    it('7.4 should reject payment on already fully paid due with 409', async () => {
      const cookie = await loginAs('dealer.parkstreet@iocl.in');
      await app.request(`/api/v1/nfr/rent-dues/${dueId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ amount: '35000.00', receiptDocumentId: receiptDocId }),
      }, env);

      const doc2 = await createTestDocument(OUTLET_1_ID);
      const res2 = await app.request(`/api/v1/nfr/rent-dues/${dueId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ amount: '1000.00', receiptDocumentId: doc2 }),
      }, env);

      expect(res2.status).toBe(409);
      expect((await jsonOf(res2)).error.code).toBe('NFR_RENT_ALREADY_PAID');
    });

    it('7.5 should enforce DB overpayment trigger trg_nfr_rent_payment_overpayment on direct SQL inserts', async () => {
      const db = getDb(localD1);
      const now = new Date().toISOString();

      await db.insert(nfrRentPayments).values({
        id: 'pay-sql-1',
        outletId: OUTLET_1_ID,
        rentDueId: dueId,
        amountPaise: 3500000,
        receiptDocumentId: receiptDocId,
        paidAt: now,
        recordedByUserId: 'user-admin',
        createdAt: now,
      }).run();

      await expect(
        db.insert(nfrRentPayments).values({
          id: 'pay-sql-2',
          outletId: OUTLET_1_ID,
          rentDueId: dueId,
          amountPaise: 100,
          receiptDocumentId: receiptDocId,
          paidAt: now,
          recordedByUserId: 'user-admin',
          createdAt: now,
        }).run()
      ).rejects.toThrow();
    });

    it('7.6 should reject payment with receipt document belonging to foreign outlet', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const foreignReceiptDoc = await createTestDocument(OUTLET_2_ID);

      const res = await app.request(`/api/v1/nfr/rent-dues/${dueId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          amount: '10000.00',
          receiptDocumentId: foreignReceiptDoc,
        }),
      }, env);

      expect(res.status).toBe(400);
      expect((await jsonOf(res)).error.code).toBe('NFR_RENT_RECEIPT_OUTLET_MISMATCH');
    });

    it('7.7 should reject direct SQL update and delete of payments via triggers', async () => {
      const db = getDb(localD1);
      const payId = 'pay-immutability-test';
      const now = new Date().toISOString();

      await db.insert(nfrRentPayments).values({
        id: payId,
        outletId: OUTLET_1_ID,
        rentDueId: dueId,
        amountPaise: 1000000,
        receiptDocumentId: receiptDocId,
        paidAt: now,
        recordedByUserId: 'user-admin',
        createdAt: now,
      }).run();

      await expect(
        db.update(nfrRentPayments)
          .set({ amountPaise: 500000 })
          .where(eq(nfrRentPayments.id, payId))
          .run()
      ).rejects.toThrow();

      await expect(
        db.delete(nfrRentPayments).where(eq(nfrRentPayments.id, payId)).run()
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // 8. OVERDUE DERIVATION TESTS
  // =========================================================================
  describe('8. Dynamic Overdue Status Derivation', () => {
    it('8.1 should correctly derive isOverdue for past, today, and future due dates', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const sRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'ATM-OD', name: 'Overdue Test Space', nfrType: 'ATM' }),
      }, env);
      const spaceId = (await jsonOf(sRes)).data.id;

      const vRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'OD Vendor', ownerContactName: 'OD Contact', ownerContactPhone: '9830003333' }),
      }, env);
      const vendorId = (await jsonOf(vRes)).data.id;

      const lRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId,
          vendorId,
          agreementNumber: 'AGR-OD-01',
          leaseStartDate: '2025-01-01',
          leaseEndDate: '2028-12-31',
          monthlyRent: '20000.00',
          monthlyDueDay: 15,
        }),
      }, env);
      const leaseId = (await jsonOf(lRes)).data.id;

      // Past due (January 2025) -> unpaid -> isOverdue = true
      const duePastRes = await app.request(`/api/v1/nfr/leases/${leaseId}/rent-dues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2025-01' }),
      }, env);
      const duePast = (await jsonOf(duePastRes)).data;
      expect(duePast.isOverdue).toBe(true);

      // Pay past due fully -> isOverdue = false
      const docId = await createTestDocument(OUTLET_1_ID);
      const payRes = await app.request(`/api/v1/nfr/rent-dues/${duePast.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ amount: '20000.00', receiptDocumentId: docId }),
      }, env);
      const paidDue = (await jsonOf(payRes)).data.due;
      expect(paidDue.paymentStatus).toBe('PAID');
      expect(paidDue.isOverdue).toBe(false);

      // Future due (December 2028) -> unpaid -> isOverdue = false
      const dueFutureRes = await app.request(`/api/v1/nfr/leases/${leaseId}/rent-dues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2028-12' }),
      }, env);
      const dueFuture = (await jsonOf(dueFutureRes)).data;
      expect(dueFuture.isOverdue).toBe(false);
    });
  });

  // =========================================================================
  // 9. NFR SUMMARY & FINANCIAL ARITHMETIC TESTS
  // =========================================================================
  describe('9. Financial Summary Calculations & Overflow Protection', () => {
    it('9.1 should return accurate aggregate metrics and nextDueDate in NFR summary', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const s1 = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'S-SUM-1', name: 'Sum Space 1', nfrType: 'ATM' }),
      }, env))).data;
      const s2 = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'S-SUM-2', name: 'Sum Space 2', nfrType: 'CONVENIENCE_STORE' }),
      }, env))).data;

      const v1 = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'Sum Vendor', ownerContactName: 'Owner', ownerContactPhone: '9830004444' }),
      }, env))).data;

      const l1 = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: s1.id, vendorId: v1.id, agreementNumber: 'AGR-SUM-1',
          leaseStartDate: '2025-01-01', leaseEndDate: '2027-12-31',
          monthlyRent: '50000.00', monthlyDueDay: 10,
        }),
      }, env))).data;

      // Due 1 (Past, Jan 2025: 50,000): Partially paid 20,000 -> Overdue Outstanding = 30,000
      const d1 = (await jsonOf(await app.request(`/api/v1/nfr/leases/${l1.id}/rent-dues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2025-01' }),
      }, env))).data;
      const doc = await createTestDocument(OUTLET_1_ID);
      await app.request(`/api/v1/nfr/rent-dues/${d1.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ amount: '20000.00', receiptDocumentId: doc }),
      }, env);

      // Due 2 (Past, Feb 2025: 50,000): Unpaid -> Overdue Outstanding = 50,000
      const d2 = (await jsonOf(await app.request(`/api/v1/nfr/leases/${l1.id}/rent-dues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2025-02' }),
      }, env))).data;

      // Due 3 (Future, Dec 2027: 50,000): Fully paid 50,000
      const d3 = (await jsonOf(await app.request(`/api/v1/nfr/leases/${l1.id}/rent-dues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2027-12' }),
      }, env))).data;
      await app.request(`/api/v1/nfr/rent-dues/${d3.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ amount: '50000.00', receiptDocumentId: doc }),
      }, env);

      const sumRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/summary`, {
        headers: { 'Cookie': cookie },
      }, env);

      expect(sumRes.status).toBe(200);
      const summary = (await jsonOf(sumRes)).data;

      expect(summary.spaceCount).toBe(2);
      expect(summary.activeSpaceCount).toBe(2);
      expect(summary.vendorCount).toBe(1);
      expect(summary.leaseCount).toBe(1);
      expect(summary.activeLeaseCount).toBe(1);
      expect(summary.rentDueCount).toBe(3);
      expect(summary.pendingDueCount).toBe(1);
      expect(summary.partialDueCount).toBe(1);
      expect(summary.paidDueCount).toBe(1);
      expect(summary.overdueDueCount).toBe(2);

      expect(summary.totalRentDuePaise).toBe(15000000);
      expect(summary.totalRentDueStr).toBe('150000.00');

      expect(summary.totalCollectedPaise).toBe(7000000);
      expect(summary.totalCollectedStr).toBe('70000.00');

      expect(summary.totalOutstandingPaise).toBe(8000000);
      expect(summary.totalOutstandingStr).toBe('80000.00');

      expect(summary.overdueOutstandingPaise).toBe(8000000);
      expect(summary.overdueOutstandingStr).toBe('80000.00');

      expect(summary.nextDueDate).toBe('2025-01-10');
    });

    it('9.2 should reject summary computation with 400 NFR_SUMMARY_OVERFLOW if totals exceed ceiling', async () => {
      const db = getDb(localD1);
      const now = new Date().toISOString();

      await db.insert(nfrSpaces).values({
        id: 'spc-oflow', outletId: OUTLET_1_ID, spaceCode: 'SPC-OFLOW', name: 'Oversized',
        nfrType: 'ATM', status: 'ACTIVE', createdBy: 'user-admin', createdAt: now, updatedAt: now,
      }).run();
      await db.insert(nfrVendors).values({
        id: 'vnd-oflow', outletId: OUTLET_1_ID, vendorName: 'Oversized Vendor',
        ownerContactName: 'Contact', ownerContactPhone: '9830005555', status: 'ACTIVE',
        createdBy: 'user-admin', createdAt: now, updatedAt: now,
      }).run();
      await db.insert(nfrLeases).values({
        id: 'lse-oflow', outletId: OUTLET_1_ID, spaceId: 'spc-oflow', vendorId: 'vnd-oflow',
        agreementNumber: 'AGR-OFLOW', leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
        monthlyRentPaise: 1000, securityDepositPaise: 0, monthlyDueDay: 1, status: 'ACTIVE',
        createdBy: 'user-admin', createdAt: now, updatedAt: now,
      }).run();

      await db.insert(nfrRentDues).values({
        id: 'due-oflow-1', outletId: OUTLET_1_ID, leaseId: 'lse-oflow', billingMonth: '2026-01',
        rentPeriodStart: '2026-01-01', rentPeriodEnd: '2026-01-31', dueDate: '2026-01-01',
        monthlyRentPaiseSnapshot: SAFE_MONEY_LIMIT_PAISE - 100, createdBy: 'user-admin', createdAt: now,
      }).run();
      await db.insert(nfrRentDues).values({
        id: 'due-oflow-2', outletId: OUTLET_1_ID, leaseId: 'lse-oflow', billingMonth: '2026-02',
        rentPeriodStart: '2026-02-01', rentPeriodEnd: '2026-02-28', dueDate: '2026-02-01',
        monthlyRentPaiseSnapshot: 200, createdBy: 'user-admin', createdAt: now,
      }).run();

      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/summary`, {
        headers: { 'Cookie': cookie },
      }, env);

      expect(res.status).toBe(400);
      expect((await jsonOf(res)).error.code).toBe('NFR_SUMMARY_OVERFLOW');
    });
  });

  // =========================================================================
  // 10. RBAC MATRIX & ROLE AUTHORIZATION TESTS
  // =========================================================================
  describe('10. Granular RBAC Matrix Verification', () => {
    let spaceId: string;
    let vendorId: string;
    let leaseId: string;
    let dueId: string;
    let docId: string;

    beforeEach(async () => {
      const cookie = await loginAs('admin@iocl.in');
      const sRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'ATM-RBAC', name: 'RBAC Space', nfrType: 'ATM' }),
      }, env);
      spaceId = (await jsonOf(sRes)).data.id;

      const vRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'RBAC Vendor', ownerContactName: 'Contact', ownerContactPhone: '9830006666' }),
      }, env);
      vendorId = (await jsonOf(vRes)).data.id;

      const lRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId, vendorId, agreementNumber: 'AGR-RBAC-01',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
          monthlyRent: '25000.00', monthlyDueDay: 1,
        }),
      }, env);
      leaseId = (await jsonOf(lRes)).data.id;

      const dRes = await app.request(`/api/v1/nfr/leases/${leaseId}/rent-dues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2026-01' }),
      }, env);
      dueId = (await jsonOf(dRes)).data.id;

      docId = await createTestDocument(OUTLET_1_ID);
    });

    it('10.1 DEALER and CSP should have read access and rent payment write access, but not master/lease/due write access', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const cspCookie = await loginAs('csp.parkstreet@iocl.in');

      for (const cookie of [dealerCookie, cspCookie]) {
        const getSpaces = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, { headers: { 'Cookie': cookie } }, env);
        expect(getSpaces.status).toBe(200);

        const getLeases = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, { headers: { 'Cookie': cookie } }, env);
        expect(getLeases.status).toBe(200);

        const postSpace = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
          body: JSON.stringify({ spaceCode: 'FORBIDDEN-S', name: 'Test', nfrType: 'ATM' }),
        }, env);
        expect(postSpace.status).toBe(403);

        const postLease = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
          body: JSON.stringify({
            spaceId, vendorId, agreementNumber: 'AGR-FBD',
            leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
            monthlyRent: '1000.00', monthlyDueDay: 1,
          }),
        }, env);
        expect(postLease.status).toBe(403);

        const postDue = await app.request(`/api/v1/nfr/leases/${leaseId}/rent-dues`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
          body: JSON.stringify({ billingMonth: '2026-02' }),
        }, env);
        expect(postDue.status).toBe(403);
      }
    });

    it('10.2 STATE_OFFICE and DIVISIONAL_OFFICE should have read-only access to NFR', async () => {
      const soCookie = await loginAs('wbso@iocl.in');
      const doCookie = await loginAs('kolkatado@iocl.in');

      for (const cookie of [soCookie, doCookie]) {
        const getSpaces = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, { headers: { 'Cookie': cookie } }, env);
        expect(getSpaces.status).toBe(200);

        const postPay = await app.request(`/api/v1/nfr/rent-dues/${dueId}/payments`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
          body: JSON.stringify({ amount: '5000.00', receiptDocumentId: docId }),
        }, env);
        expect(postPay.status).toBe(403);
      }
    });

    it('10.3 FIELD_OFFICER and ADMIN should have full read/write access to all NFR capabilities', async () => {
      const foCookie = await loginAs('fo.central@iocl.in');

      const postSpace = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': foCookie },
        body: JSON.stringify({ spaceCode: 'FO-SPACE-1', name: 'FO Space', nfrType: 'CAR_WASH' }),
      }, env);
      expect(postSpace.status).toBe(201);

      const postDue = await app.request(`/api/v1/nfr/leases/${leaseId}/rent-dues`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': foCookie },
        body: JSON.stringify({ billingMonth: '2026-02' }),
      }, env);
      expect(postDue.status).toBe(201);
    });
  });

  // =========================================================================
  // 11. OUTLET SCOPE & MULTI-TENANT ISOLATION TESTS
  // =========================================================================
  describe('11. ScopeService Outlet Isolation', () => {
    let outlet1LeaseId: string;
    let outlet1DueId: string;
    let outlet2LeaseId: string;
    let outlet2DueId: string;

    beforeEach(async () => {
      const cookie = await loginAs('admin@iocl.in');
      const s1 = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'RO1-S1', name: 'Space 1', nfrType: 'ATM' }),
      }, env))).data;
      const v1 = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'V1', ownerContactName: 'C1', ownerContactPhone: '9830007777' }),
      }, env))).data;
      const l1 = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: s1.id, vendorId: v1.id, agreementNumber: 'AGR-RO1',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
          monthlyRent: '10000.00', monthlyDueDay: 1,
        }),
      }, env))).data;
      outlet1LeaseId = l1.id;
      const d1 = (await jsonOf(await app.request(`/api/v1/nfr/leases/${l1.id}/rent-dues`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2026-01' }),
      }, env))).data;
      outlet1DueId = d1.id;

      const s3 = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_3_ID}/nfr/spaces`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'RO3-S1', name: 'Space 3', nfrType: 'ATM' }),
      }, env))).data;
      const v3 = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_3_ID}/nfr/vendors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'V3', ownerContactName: 'C3', ownerContactPhone: '9810008888' }),
      }, env))).data;
      const l3 = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_3_ID}/nfr/leases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: s3.id, vendorId: v3.id, agreementNumber: 'AGR-RO3',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
          monthlyRent: '10000.00', monthlyDueDay: 1,
        }),
      }, env))).data;
      outlet2LeaseId = l3.id;
      const d3 = (await jsonOf(await app.request(`/api/v1/nfr/leases/${l3.id}/rent-dues`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2026-01' }),
      }, env))).data;
      outlet2DueId = d3.id;
    });

    it('11.1 Dealer cannot access spaces, leases, rent dues or summary of another outlet', async () => {
      const parkStreetDealer = await loginAs('dealer.parkstreet@iocl.in');

      const res1 = await app.request(`/api/v1/outlets/${OUTLET_3_ID}/nfr/spaces`, {
        headers: { 'Cookie': parkStreetDealer },
      }, env);
      expect(res1.status).toBe(403);

      const res2 = await app.request(`/api/v1/outlets/${OUTLET_3_ID}/nfr/summary`, {
        headers: { 'Cookie': parkStreetDealer },
      }, env);
      expect(res2.status).toBe(403);

      const res3 = await app.request(`/api/v1/nfr/leases/${outlet2LeaseId}`, {
        headers: { 'Cookie': parkStreetDealer },
      }, env);
      expect(res3.status).toBe(403);

      const doc = await createTestDocument(OUTLET_1_ID);
      const res4 = await app.request(`/api/v1/nfr/rent-dues/${outlet2DueId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': parkStreetDealer },
        body: JSON.stringify({ amount: '5000.00', receiptDocumentId: doc }),
      }, env);
      expect(res4.status).toBe(403);
    });

    it('11.2 Kolkata Divisional Office user cannot access Ludhiana outlet resources', async () => {
      const kolkataDo = await loginAs('kolkatado@iocl.in');

      const res1 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        headers: { 'Cookie': kolkataDo },
      }, env);
      expect(res1.status).toBe(200);

      const res2 = await app.request(`/api/v1/outlets/${OUTLET_3_ID}/nfr/spaces`, {
        headers: { 'Cookie': kolkataDo },
      }, env);
      expect(res2.status).toBe(403);
    });
  });

  // =========================================================================
  // 12. AUDIT TRAIL LOGGING TESTS
  // =========================================================================
  describe('12. Comprehensive Audit Trail Verification', () => {
    it('12.1 should log audit entries with exact action codes for all mutations', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const sRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'ATM-AUD', name: 'Audit Space', nfrType: 'ATM' }),
      }, env);
      const spaceId = (await jsonOf(sRes)).data.id;

      await app.request(`/api/v1/nfr/spaces/${spaceId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ name: 'Audit Space Renamed' }),
      }, env);

      const vRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'Audit Vendor', ownerContactName: 'Contact', ownerContactPhone: '9830009999' }),
      }, env);
      const vendorId = (await jsonOf(vRes)).data.id;

      await app.request(`/api/v1/nfr/vendors/${vendorId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'Audit Vendor Updated' }),
      }, env);

      const lRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId, vendorId, agreementNumber: 'AGR-AUD-01',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
          monthlyRent: '10000.00', monthlyDueDay: 1,
        }),
      }, env);
      const leaseId = (await jsonOf(lRes)).data.id;

      await app.request(`/api/v1/nfr/leases/${leaseId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ notes: 'Updated lease notes' }),
      }, env);

      const dRes = await app.request(`/api/v1/nfr/leases/${leaseId}/rent-dues`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2026-01' }),
      }, env);
      const dueId = (await jsonOf(dRes)).data.id;

      const docId = await createTestDocument(OUTLET_1_ID);
      await app.request(`/api/v1/nfr/rent-dues/${dueId}/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ amount: '5000.00', receiptDocumentId: docId }),
      }, env);

      await app.request(`/api/v1/nfr/leases/${leaseId}/terminate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ terminationReason: 'Audit test termination' }),
      }, env);

      const db = getDb(localD1);
      const logs = await db.select().from(auditLogs);
      const actions = logs.map(l => l.action);

      expect(actions).toContain('NFR_SPACE_CREATE');
      expect(actions).toContain('NFR_SPACE_UPDATE');
      expect(actions).toContain('NFR_VENDOR_CREATE');
      expect(actions).toContain('NFR_VENDOR_UPDATE');
      expect(actions).toContain('NFR_LEASE_CREATE');
      expect(actions).toContain('NFR_LEASE_UPDATE');
      expect(actions).toContain('NFR_RENT_DUE_GENERATE');
      expect(actions).toContain('NFR_RENT_PAYMENT_CREATE');
      expect(actions).toContain('NFR_LEASE_TERMINATE');
    });
  });

  // =========================================================================
  // 13. DIRECT DB TRIGGER INTEGRITY VIOLATION TESTS
  // =========================================================================
  describe('13. Direct SQL DB Trigger Foreign & Outlet Integrity Protections', () => {
    let space1Id: string;
    let vendor1Id: string;
    let space2Id: string;
    let vendor2Id: string;

    beforeEach(async () => {
      const db = getDb(localD1);
      const now = new Date().toISOString();
      space1Id = 'spc-trg-1';
      vendor1Id = 'vnd-trg-1';
      space2Id = 'spc-trg-2';
      vendor2Id = 'vnd-trg-2';

      await db.insert(nfrSpaces).values([
        { id: space1Id, outletId: OUTLET_1_ID, spaceCode: 'SP-T1', name: 'Space T1', nfrType: 'ATM', status: 'ACTIVE', createdBy: 'user-admin', createdAt: now, updatedAt: now },
        { id: space2Id, outletId: OUTLET_2_ID, spaceCode: 'SP-T2', name: 'Space T2', nfrType: 'ATM', status: 'ACTIVE', createdBy: 'user-admin', createdAt: now, updatedAt: now },
      ]).run();

      await db.insert(nfrVendors).values([
        { id: vendor1Id, outletId: OUTLET_1_ID, vendorName: 'Vendor T1', ownerContactName: 'C1', ownerContactPhone: '9830011111', status: 'ACTIVE', createdBy: 'user-admin', createdAt: now, updatedAt: now },
        { id: vendor2Id, outletId: OUTLET_2_ID, vendorName: 'Vendor T2', ownerContactName: 'C2', ownerContactPhone: '9830022222', status: 'ACTIVE', createdBy: 'user-admin', createdAt: now, updatedAt: now },
      ]).run();
    });

    it('13.1 should reject direct SQL lease insertion with foreign space', async () => {
      const db = getDb(localD1);
      const now = new Date().toISOString();

      await expect(
        db.insert(nfrLeases).values({
          id: 'lse-bad-space',
          outletId: OUTLET_1_ID,
          spaceId: space2Id, // foreign space
          vendorId: vendor1Id,
          agreementNumber: 'AGR-BAD-SPACE',
          leaseStartDate: '2026-01-01',
          leaseEndDate: '2026-12-31',
          monthlyRentPaise: 1000000,
          securityDepositPaise: 0,
          monthlyDueDay: 1,
          status: 'ACTIVE',
          createdBy: 'user-admin',
          createdAt: now,
          updatedAt: now,
        }).run()
      ).rejects.toThrow();
    });

    it('13.2 should reject direct SQL lease insertion with foreign vendor', async () => {
      const db = getDb(localD1);
      const now = new Date().toISOString();

      await expect(
        db.insert(nfrLeases).values({
          id: 'lse-bad-vendor',
          outletId: OUTLET_1_ID,
          spaceId: space1Id,
          vendorId: vendor2Id, // foreign vendor
          agreementNumber: 'AGR-BAD-VENDOR',
          leaseStartDate: '2026-01-01',
          leaseEndDate: '2026-12-31',
          monthlyRentPaise: 1000000,
          securityDepositPaise: 0,
          monthlyDueDay: 1,
          status: 'ACTIVE',
          createdBy: 'user-admin',
          createdAt: now,
          updatedAt: now,
        }).run()
      ).rejects.toThrow();
    });

    it('13.3 should reject direct SQL lease insertion with foreign agreement document', async () => {
      const db = getDb(localD1);
      const now = new Date().toISOString();
      const foreignDoc = await createTestDocument(OUTLET_2_ID);

      await expect(
        db.insert(nfrLeases).values({
          id: 'lse-bad-doc',
          outletId: OUTLET_1_ID,
          spaceId: space1Id,
          vendorId: vendor1Id,
          agreementNumber: 'AGR-BAD-DOC',
          leaseStartDate: '2026-01-01',
          leaseEndDate: '2026-12-31',
          monthlyRentPaise: 1000000,
          securityDepositPaise: 0,
          monthlyDueDay: 1,
          agreementDocumentId: foreignDoc,
          status: 'ACTIVE',
          createdBy: 'user-admin',
          createdAt: now,
          updatedAt: now,
        }).run()
      ).rejects.toThrow();
    });

    it('13.4 should reject direct SQL lease insertion with foreign sub-meter', async () => {
      const db = getDb(localD1);
      const now = new Date().toISOString();
      const { subMeterId: foreignSubMeter } = await createTestUtilitySubMeter(OUTLET_2_ID, 'NFR_VENDOR');

      await expect(
        db.insert(nfrLeases).values({
          id: 'lse-bad-submeter',
          outletId: OUTLET_1_ID,
          spaceId: space1Id,
          vendorId: vendor1Id,
          agreementNumber: 'AGR-BAD-SUB',
          leaseStartDate: '2026-01-01',
          leaseEndDate: '2026-12-31',
          monthlyRentPaise: 1000000,
          securityDepositPaise: 0,
          monthlyDueDay: 1,
          subMeterId: foreignSubMeter,
          status: 'ACTIVE',
          createdBy: 'user-admin',
          createdAt: now,
          updatedAt: now,
        }).run()
      ).rejects.toThrow();
    });

    it('13.5 should reject direct SQL lease insertion with non-NFR sub-meter', async () => {
      const db = getDb(localD1);
      const now = new Date().toISOString();
      const { subMeterId: nonNfrSubMeter } = await createTestUtilitySubMeter(OUTLET_1_ID, 'CNG_FACILITY');

      await expect(
        db.insert(nfrLeases).values({
          id: 'lse-non-nfr-meter',
          outletId: OUTLET_1_ID,
          spaceId: space1Id,
          vendorId: vendor1Id,
          agreementNumber: 'AGR-NON-NFR',
          leaseStartDate: '2026-01-01',
          leaseEndDate: '2026-12-31',
          monthlyRentPaise: 1000000,
          securityDepositPaise: 0,
          monthlyDueDay: 1,
          subMeterId: nonNfrSubMeter,
          status: 'ACTIVE',
          createdBy: 'user-admin',
          createdAt: now,
          updatedAt: now,
        }).run()
      ).rejects.toThrow();
    });

    it('13.6 should reject direct SQL rent payment with foreign receipt document', async () => {
      const db = getDb(localD1);
      const now = new Date().toISOString();

      const lse = await db.insert(nfrLeases).values({
        id: 'lse-pay-doc-test', outletId: OUTLET_1_ID, spaceId: space1Id, vendorId: vendor1Id,
        agreementNumber: 'AGR-PAY-DOC-TEST', leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
        monthlyRentPaise: 1000000, securityDepositPaise: 0, monthlyDueDay: 1, status: 'ACTIVE',
        createdBy: 'user-admin', createdAt: now, updatedAt: now,
      }).returning().get();

      const due = await db.insert(nfrRentDues).values({
        id: 'due-pay-doc-test', outletId: OUTLET_1_ID, leaseId: lse.id, billingMonth: '2026-01',
        rentPeriodStart: '2026-01-01', rentPeriodEnd: '2026-01-31', dueDate: '2026-01-01',
        monthlyRentPaiseSnapshot: 1000000, createdBy: 'user-admin', createdAt: now,
      }).returning().get();

      const foreignReceipt = await createTestDocument(OUTLET_2_ID);

      await expect(
        db.insert(nfrRentPayments).values({
          id: 'pay-foreign-receipt',
          outletId: OUTLET_1_ID,
          rentDueId: due.id,
          amountPaise: 500000,
          receiptDocumentId: foreignReceipt,
          paidAt: now,
          recordedByUserId: 'user-admin',
          createdAt: now,
        }).run()
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // 14. GRANULAR FILTERS & QUERY PARAMETERS
  // =========================================================================
  describe('14. Granular Filters & Query Parameters', () => {
    let lease1Id: string;
    let lease2Id: string;
    let space1Id: string;
    let space2Id: string;
    let vendor1Id: string;

    beforeEach(async () => {
      const cookie = await loginAs('admin@iocl.in');
      const s1 = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'FLT-S1', name: 'ATM Kiosk', nfrType: 'ATM', status: 'ACTIVE' }),
      }, env))).data;
      space1Id = s1.id;

      const s2 = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'FLT-S2', name: 'EV Charger', nfrType: 'EV_CHARGING', status: 'INACTIVE' }),
      }, env))).data;
      space2Id = s2.id;

      const v1 = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'Filter Vendor', ownerContactName: 'Contact', ownerContactPhone: '9830005555', status: 'ACTIVE' }),
      }, env))).data;
      vendor1Id = v1.id;

      // Lease 1 (Active)
      const l1 = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: space1Id, vendorId: vendor1Id, agreementNumber: 'AGR-FLT-1',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
          monthlyRent: '10000.00', monthlyDueDay: 5,
        }),
      }, env))).data;
      lease1Id = l1.id;

      // Lease 2 (Terminated)
      const l2 = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: space2Id, vendorId: vendor1Id, agreementNumber: 'AGR-FLT-2',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
          monthlyRent: '15000.00', monthlyDueDay: 10,
        }),
      }, env))).data;
      lease2Id = l2.id;
      await app.request(`/api/v1/nfr/leases/${lease2Id}/terminate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
      }, env);

      // Create rent dues for Lease 1: Jan, Feb, Mar 2026
      for (const m of ['2026-01', '2026-02', '2026-03']) {
        await app.request(`/api/v1/nfr/leases/${lease1Id}/rent-dues`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
          body: JSON.stringify({ billingMonth: m }),
        }, env);
      }
    });

    it('14.1 should filter spaces by status=INACTIVE', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces?status=INACTIVE`, {
        headers: { 'Cookie': cookie },
      }, env);
      expect(res.status).toBe(200);
      const data = (await jsonOf(res)).data;
      expect(data.length).toBe(1);
      expect(data[0].id).toBe(space2Id);
    });

    it('14.2 should filter leases by status=TERMINATED', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases?status=TERMINATED`, {
        headers: { 'Cookie': cookie },
      }, env);
      expect(res.status).toBe(200);
      const data = (await jsonOf(res)).data;
      expect(data.length).toBe(1);
      expect(data[0].id).toBe(lease2Id);
    });

    it('14.3 should filter rent dues by fromDate and toDate range', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/rent-dues?fromDate=2026-02-01&toDate=2026-02-28`, {
        headers: { 'Cookie': cookie },
      }, env);
      expect(res.status).toBe(200);
      const data = (await jsonOf(res)).data;
      expect(data.length).toBe(1);
      expect(data[0].billingMonth).toBe('2026-02');
    });

    it('14.4 should reject filter with invalid fromDate > toDate', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/rent-dues?fromDate=2026-03-01&toDate=2026-01-01`, {
        headers: { 'Cookie': cookie },
      }, env);
      expect(res.status).toBe(400);
      expect((await jsonOf(res)).error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // 15. CONCURRENCY-SAFE PAYMENT PROTECTION
  // =========================================================================
  describe('15. Concurrency Race & Atomic Overpayment Guards', () => {
    it('15.1 should handle concurrent payment inserts and prevent race condition overpayments', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const s = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'ATM-RACE', name: 'Race Space', nfrType: 'ATM' }),
      }, env))).data;

      const v = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'Race Vendor', ownerContactName: 'Owner', ownerContactPhone: '9830006666' }),
      }, env))).data;

      const l = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: s.id, vendorId: v.id, agreementNumber: 'AGR-RACE',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
          monthlyRent: '30000.00', monthlyDueDay: 1,
        }),
      }, env))).data;

      const d = (await jsonOf(await app.request(`/api/v1/nfr/leases/${l.id}/rent-dues`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2026-01' }),
      }, env))).data;

      const doc = await createTestDocument(OUTLET_1_ID);

      // Send two simultaneous payment requests of ₹20,000 each against ₹30,000 due
      const [res1, res2] = await Promise.all([
        app.request(`/api/v1/nfr/rent-dues/${d.id}/payments`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
          body: JSON.stringify({ amount: '20000.00', receiptDocumentId: doc }),
        }, env),
        app.request(`/api/v1/nfr/rent-dues/${d.id}/payments`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
          body: JSON.stringify({ amount: '20000.00', receiptDocumentId: doc }),
        }, env),
      ]);

      const statuses = [res1.status, res2.status];
      // Exactly one must succeed (201) and one must be rejected (409)
      expect(statuses).toContain(201);
      expect(statuses).toContain(409);

      // Verify total payments do not exceed 30,000
      const listRes = await app.request(`/api/v1/nfr/rent-dues/${d.id}/payments`, {
        headers: { 'Cookie': cookie },
      }, env);
      const payments = (await jsonOf(listRes)).data;
      expect(payments.length).toBe(1);
      expect(payments[0].amountPaise).toBe(2000000);
    });
  });

  // =========================================================================
  // 16. MONEY PARSING, DECIMAL PRECISION & BOUNDARY VALIDATIONS
  // =========================================================================
  describe('16. Money Parsing & Boundary Validations', () => {
    it('16.1 should accept valid 2-decimal string money', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const s = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'MNY-S1', name: 'Money Space', nfrType: 'ATM' }),
      }, env))).data;
      const v = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'Money Vendor', ownerContactName: 'Contact', ownerContactPhone: '9830007777' }),
      }, env))).data;

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: s.id, vendorId: v.id, agreementNumber: 'AGR-MNY-1',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
          monthlyRent: '12500.50', securityDeposit: '25000.00', monthlyDueDay: 1,
        }),
      }, env);
      expect(res.status).toBe(201);
      const data = (await jsonOf(res)).data;
      expect(data.monthlyRentPaise).toBe(1250050);
      expect(data.monthlyRentStr).toBe('12500.50');
    });

    it('16.2 should accept whole number string money e.g. 50000', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const s = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'MNY-S2', name: 'Money Space 2', nfrType: 'ATM' }),
      }, env))).data;
      const v = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'Money Vendor 2', ownerContactName: 'Contact', ownerContactPhone: '9830007777' }),
      }, env))).data;

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: s.id, vendorId: v.id, agreementNumber: 'AGR-MNY-2',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
          monthlyRent: '50000', monthlyDueDay: 1,
        }),
      }, env);
      expect(res.status).toBe(201);
      expect((await jsonOf(res)).data.monthlyRentPaise).toBe(5000000);
    });

    it('16.3 should reject negative money strings e.g. -100.00', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const s = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'MNY-S3', name: 'Money Space 3', nfrType: 'ATM' }),
      }, env))).data;
      const v = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'Money Vendor 3', ownerContactName: 'Contact', ownerContactPhone: '9830007777' }),
      }, env))).data;

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: s.id, vendorId: v.id, agreementNumber: 'AGR-MNY-3',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
          monthlyRent: '-100.00', monthlyDueDay: 1,
        }),
      }, env);
      expect(res.status).toBe(400);
    });

    it('16.4 should reject invalid formatted strings e.g. 12.345 or currency symbols', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const s = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'MNY-S4', name: 'Money Space 4', nfrType: 'ATM' }),
      }, env))).data;
      const v = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'Money Vendor 4', ownerContactName: 'Contact', ownerContactPhone: '9830007777' }),
      }, env))).data;

      const res1 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: s.id, vendorId: v.id, agreementNumber: 'AGR-MNY-4A',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
          monthlyRent: '12.345', monthlyDueDay: 1,
        }),
      }, env);
      expect(res1.status).toBe(400);

      const res2 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: s.id, vendorId: v.id, agreementNumber: 'AGR-MNY-4B',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
          monthlyRent: '₹5000', monthlyDueDay: 1,
        }),
      }, env);
      expect(res2.status).toBe(400);
    });

    it('16.5 should reject lease rent exceeding safe money limit', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const s = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'MNY-S5', name: 'Money Space 5', nfrType: 'ATM' }),
      }, env))).data;
      const v = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'Money Vendor 5', ownerContactName: 'Contact', ownerContactPhone: '9830007777' }),
      }, env))).data;

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: s.id, vendorId: v.id, agreementNumber: 'AGR-MNY-5',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
          monthlyRent: '999999999999999.00', monthlyDueDay: 1,
        }),
      }, env);
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // 17. STRICT DATE & YEAR-MONTH VALIDATIONS
  // =========================================================================
  describe('17. Strict Date & Year-Month Schema Validations', () => {
    it('17.1 should reject invalid billing month schemas e.g. 2026/05 or 2026-5', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const s = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'DTE-S1', name: 'Date Space', nfrType: 'ATM' }),
      }, env))).data;
      const v = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'Date Vendor', ownerContactName: 'Contact', ownerContactPhone: '9830008888' }),
      }, env))).data;
      const l = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: s.id, vendorId: v.id, agreementNumber: 'AGR-DTE-1',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
          monthlyRent: '10000.00', monthlyDueDay: 1,
        }),
      }, env))).data;

      const res1 = await app.request(`/api/v1/nfr/leases/${l.id}/rent-dues`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2026/05' }),
      }, env);
      expect(res1.status).toBe(400);

      const res2 = await app.request(`/api/v1/nfr/leases/${l.id}/rent-dues`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2026-5' }),
      }, env);
      expect(res2.status).toBe(400);
    });

    it('17.2 should reject impossible calendar dates e.g. 2026-04-31', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const s = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'DTE-S2', name: 'Date Space 2', nfrType: 'ATM' }),
      }, env))).data;
      const v = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'Date Vendor 2', ownerContactName: 'Contact', ownerContactPhone: '9830008888' }),
      }, env))).data;

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: s.id, vendorId: v.id, agreementNumber: 'AGR-DTE-2',
          leaseStartDate: '2026-04-01', leaseEndDate: '2026-04-31',
          monthlyRent: '10000.00', monthlyDueDay: 1,
        }),
      }, env);
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // 18. FINE-GRAINED RBAC & MUTATION DENIALS
  // =========================================================================
  describe('18. Granular RBAC Role Denials', () => {
    let spaceId: string;
    let vendorId: string;
    let leaseId: string;

    beforeEach(async () => {
      const cookie = await loginAs('admin@iocl.in');
      const s = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'DEN-S1', name: 'Denial Space', nfrType: 'ATM' }),
      }, env))).data;
      spaceId = s.id;

      const v = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'Denial Vendor', ownerContactName: 'Contact', ownerContactPhone: '9830009999' }),
      }, env))).data;
      vendorId = v.id;

      const l = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: s.id, vendorId: v.id, agreementNumber: 'AGR-DEN-1',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
          monthlyRent: '10000.00', monthlyDueDay: 1,
        }),
      }, env))).data;
      leaseId = l.id;
    });

    it('18.1 Dealer cannot update space', async () => {
      const cookie = await loginAs('dealer.parkstreet@iocl.in');
      const res = await app.request(`/api/v1/nfr/spaces/${spaceId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ name: 'Hacked Name' }),
      }, env);
      expect(res.status).toBe(403);
    });

    it('18.2 Dealer cannot update vendor', async () => {
      const cookie = await loginAs('dealer.parkstreet@iocl.in');
      const res = await app.request(`/api/v1/nfr/vendors/${vendorId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'Hacked Vendor' }),
      }, env);
      expect(res.status).toBe(403);
    });

    it('18.3 Dealer cannot update lease', async () => {
      const cookie = await loginAs('dealer.parkstreet@iocl.in');
      const res = await app.request(`/api/v1/nfr/leases/${leaseId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ monthlyRent: '500.00' }),
      }, env);
      expect(res.status).toBe(403);
    });

    it('18.4 Dealer cannot terminate lease', async () => {
      const cookie = await loginAs('dealer.parkstreet@iocl.in');
      const res = await app.request(`/api/v1/nfr/leases/${leaseId}/terminate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ terminationReason: 'Dealer tries to terminate' }),
      }, env);
      expect(res.status).toBe(403);
    });

    it('18.5 CSP cannot create vendor', async () => {
      const cookie = await loginAs('csp.parkstreet@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'CSP Vendor', ownerContactName: 'Contact', ownerContactPhone: '9830009999' }),
      }, env);
      expect(res.status).toBe(403);
    });

    it('18.6 CSP cannot update lease', async () => {
      const cookie = await loginAs('csp.parkstreet@iocl.in');
      const res = await app.request(`/api/v1/nfr/leases/${leaseId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ monthlyRent: '500.00' }),
      }, env);
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 19. ADDITIONAL EDGE CASES & RESOURCE NOT FOUND HANDLING
  // =========================================================================
  describe('19. Resource Lookup & Not Found Handlers', () => {
    it('19.1 should return 404 NFR_SPACE_NOT_FOUND when space is not found', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/nfr/spaces/non-existent-space-id`, {
        headers: { 'Cookie': cookie },
      }, env);
      expect(res.status).toBe(404);
      expect((await jsonOf(res)).error.code).toBe('NFR_SPACE_NOT_FOUND');
    });

    it('19.2 should return 404 NFR_VENDOR_NOT_FOUND when vendor is not found', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/nfr/vendors/non-existent-vendor-id`, {
        headers: { 'Cookie': cookie },
      }, env);
      expect(res.status).toBe(404);
      expect((await jsonOf(res)).error.code).toBe('NFR_VENDOR_NOT_FOUND');
    });

    it('19.3 should return 404 NFR_LEASE_NOT_FOUND when lease is not found', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/nfr/leases/non-existent-lease-id`, {
        headers: { 'Cookie': cookie },
      }, env);
      expect(res.status).toBe(404);
      expect((await jsonOf(res)).error.code).toBe('NFR_LEASE_NOT_FOUND');
    });

    it('19.4 should return 404 NFR_RENT_DUE_NOT_FOUND when rent due is not found', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/nfr/rent-dues/non-existent-due-id`, {
        headers: { 'Cookie': cookie },
      }, env);
      expect(res.status).toBe(404);
      expect((await jsonOf(res)).error.code).toBe('NFR_RENT_DUE_NOT_FOUND');
    });

    it('19.5 should return 404 when recording payment on non-existent rent due', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const doc = await createTestDocument(OUTLET_1_ID);
      const res = await app.request(`/api/v1/nfr/rent-dues/non-existent-due-id/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ amount: '1000.00', receiptDocumentId: doc }),
      }, env);
      expect(res.status).toBe(404);
      expect((await jsonOf(res)).error.code).toBe('NFR_RENT_DUE_NOT_FOUND');
    });

    it('19.6 should create minimal lease without optional fields (deposit, doc, submeter, notes)', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const s = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'MIN-S1', name: 'Minimal Space', nfrType: 'ATM' }),
      }, env))).data;
      const v = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'Minimal Vendor', ownerContactName: 'Contact', ownerContactPhone: '9830001234' }),
      }, env))).data;

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: s.id, vendorId: v.id, agreementNumber: 'AGR-MIN-1',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
          monthlyRent: '10000.00', monthlyDueDay: 1,
        }),
      }, env);
      expect(res.status).toBe(201);
      const data = (await jsonOf(res)).data;
      expect(data.securityDepositPaise).toBe(0);
      expect(data.securityDepositStr).toBe('0.00');
      expect(data.agreementDocumentId).toBeNull();
      expect(data.subMeterId).toBeNull();
    });

    it('19.7 should support custom paidAt ISO datetime and paymentReference when recording rent payment', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const s = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ spaceCode: 'CUS-S1', name: 'Custom Space', nfrType: 'ATM' }),
      }, env))).data;
      const v = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/vendors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ vendorName: 'Custom Vendor', ownerContactName: 'Contact', ownerContactPhone: '9830001234' }),
      }, env))).data;
      const l = (await jsonOf(await app.request(`/api/v1/outlets/${OUTLET_1_ID}/nfr/leases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          spaceId: s.id, vendorId: v.id, agreementNumber: 'AGR-CUS-1',
          leaseStartDate: '2026-01-01', leaseEndDate: '2026-12-31',
          monthlyRent: '10000.00', monthlyDueDay: 1,
        }),
      }, env))).data;
      const d = (await jsonOf(await app.request(`/api/v1/nfr/leases/${l.id}/rent-dues`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({ billingMonth: '2026-01' }),
      }, env))).data;

      const doc = await createTestDocument(OUTLET_1_ID);
      const customPaidAt = '2026-01-05T14:30:00.000Z';
      const res = await app.request(`/api/v1/nfr/rent-dues/${d.id}/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          amount: '10000.00',
          receiptDocumentId: doc,
          paymentReference: 'NEFT-AXIS-20260105',
          paidAt: customPaidAt,
          notes: 'Bank transfer confirmed by dealer',
        }),
      }, env);

      expect(res.status).toBe(201);
      const data = (await jsonOf(res)).data;
      expect(data.payment.paidAt).toBe(customPaidAt);
      expect(data.payment.paymentReference).toBe('NEFT-AXIS-20260105');
      expect(data.payment.notes).toBe('Bank transfer confirmed by dealer');
    });
  });
});


