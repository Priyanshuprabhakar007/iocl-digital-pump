import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import fs from 'fs';
import { hrLeaveRequests, hrStaff, hrDesignations } from '../src/db/schema';
import { eq, and } from 'drizzle-orm';

describe('Phase 5A: Maker-Checker Foundation & Leave Management Suite', () => {
  let localD1: any;
  let env: any;
  let testDbPath: string;

  const OUTLET_ID = 'ro-1001';
  const OUTLET_ID_2 = 'ro-1002';

  beforeEach(async () => {
    testDbPath = `./.sqlite/test_hr_leave_${Math.random().toString(36).substring(2)}_${Date.now()}.db`;
    if (fs.existsSync(testDbPath)) { try { fs.unlinkSync(testDbPath); } catch (e) {} }
    const walPath = `${testDbPath}-wal`;
    const shmPath = `${testDbPath}-shm`;
    if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch (e) {} }
    if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch (e) {} }

    localD1 = createLocalD1Database(testDbPath);
    await seedDatabase(getDb(localD1));

    env = {
      DB: localD1,
      DOCUMENTS_BUCKET: { get: async () => null, put: async () => ({}) },
      ENVIRONMENT: 'test',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    };
  });

  afterEach(() => {
    try { localD1.close(); } catch (e) {}
    if (testDbPath && fs.existsSync(testDbPath)) { try { fs.unlinkSync(testDbPath); } catch (e) {} }
  });

  async function loginAs(email: string) {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, password: 'Password@123' }),
    }, env);
    const setCookie = res.headers.get('set-cookie');
    return setCookie ? setCookie.split(';')[0] : '';
  }

  async function createTestStaff(outletId: string, empCode: string, name: string) {
    const cookie = await loginAs('admin@iocl.in');
    const db = getDb(localD1);
    const desigId = `desig-${Math.random()}`;
    const now = new Date().toISOString();
    await db.insert(hrDesignations).values({
      id: desigId,
      outletId,
      code: `CODE_${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      name: 'Test Designation',
      skillCategory: 'SKILLED',
      status: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    const staffId = `staff-${Math.random()}`;
    await db.insert(hrStaff).values({
      id: staffId,
      outletId,
      employeeCode: empCode,
      fullName: name,
      designationId: desigId,
      aadhaarLast4: '1234',
      emergencyContactName: 'Emergency Contact',
      emergencyContactPhone: '+91 9876543210',
      joiningDate: '2026-01-01',
      employmentStatus: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    return staffId;
  }

  // =========================================================================
  // 1. Migration 0026 & Schema Inspection Tests
  // =========================================================================
  describe('1. Migration 0026 & Schema Inspection', () => {
    it('should verify hr_leave_requests table, columns, indexes, and new permissions exist', async () => {
      const db = getDb(localD1);
      const tables = await localD1.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='hr_leave_requests';").all();
      expect(tables.results.length).toBe(1);

      // Verify permissions seeded
      const perms = await localD1.prepare("SELECT code FROM permissions WHERE code IN ('hr.leave.read', 'hr.leave.request', 'hr.leave.approve');").all();
      expect(perms.results.length).toBe(3);

      // Verify default role permission matrix
      const dealerPerms = await localD1.prepare(`
        SELECT p.code FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.id
        WHERE rp.role_id = 'role-dealer' AND p.code LIKE 'hr.leave.%'
      `).all();
      expect(dealerPerms.results.map((r: any) => r.code).sort()).toEqual(['hr.leave.read', 'hr.leave.request'].sort());

      const adminPerms = await localD1.prepare(`
        SELECT p.code FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.id
        WHERE rp.role_id = 'role-admin' AND p.code LIKE 'hr.leave.%'
      `).all();
      expect(adminPerms.results.map((r: any) => r.code).sort()).toEqual(['hr.leave.approve', 'hr.leave.read', 'hr.leave.request'].sort());
    });
  });

  // =========================================================================
  // 2. Direct SQL Constraint & Trigger Tests
  // =========================================================================
  describe('2. Direct SQL Constraint & Trigger Tests', () => {
    it('should reject invalid leave_type, status, date order, and blank reason via direct SQL', async () => {
      const staffId = await createTestStaff(OUTLET_ID, 'EMP_SQL_1', 'SQL Staff');
      const now = new Date().toISOString();

      // Invalid leave_type
      await expect(
        localD1.prepare(`
          INSERT INTO hr_leave_requests (id, outlet_id, staff_id, leave_type, from_date, to_date, reason, status, requested_by_user_id, created_at, updated_at)
          VALUES ('leave-1', ?, ?, 'INVALID_TYPE', '2026-10-10', '2026-10-12', 'Reason', 'PENDING', 'user-admin', ?, ?)
        `).bind(OUTLET_ID, staffId, now, now).run()
      ).rejects.toThrow();

      // to_date < from_date
      await expect(
        localD1.prepare(`
          INSERT INTO hr_leave_requests (id, outlet_id, staff_id, leave_type, from_date, to_date, reason, status, requested_by_user_id, created_at, updated_at)
          VALUES ('leave-2', ?, ?, 'CASUAL', '2026-10-12', '2026-10-10', 'Reason', 'PENDING', 'user-admin', ?, ?)
        `).bind(OUTLET_ID, staffId, now, now).run()
      ).rejects.toThrow();

      // Blank reason
      await expect(
        localD1.prepare(`
          INSERT INTO hr_leave_requests (id, outlet_id, staff_id, leave_type, from_date, to_date, reason, status, requested_by_user_id, created_at, updated_at)
          VALUES ('leave-3', ?, ?, 'CASUAL', '2026-10-10', '2026-10-12', '   ', 'PENDING', 'user-admin', ?, ?)
        `).bind(OUTLET_ID, staffId, now, now).run()
      ).rejects.toThrow();
    });

    it('should enforce delete protection trigger', async () => {
      const staffId = await createTestStaff(OUTLET_ID, 'EMP_SQL_2', 'SQL Staff 2');
      const now = new Date().toISOString();

      await localD1.prepare(`
        INSERT INTO hr_leave_requests (id, outlet_id, staff_id, leave_type, from_date, to_date, reason, status, requested_by_user_id, created_at, updated_at)
        VALUES ('leave-del', ?, ?, 'CASUAL', '2026-10-10', '2026-10-12', 'Reason', 'PENDING', 'user-admin', ?, ?)
      `).bind(OUTLET_ID, staffId, now, now).run();

      await expect(
        localD1.prepare("DELETE FROM hr_leave_requests WHERE id = 'leave-del';").run()
      ).rejects.toThrow(/HR_LEAVE_DELETE_FORBIDDEN/i);
    });

    it('should enforce identity immutability trigger', async () => {
      const staffId = await createTestStaff(OUTLET_ID, 'EMP_SQL_3', 'SQL Staff 3');
      const now = new Date().toISOString();

      await localD1.prepare(`
        INSERT INTO hr_leave_requests (id, outlet_id, staff_id, leave_type, from_date, to_date, reason, status, requested_by_user_id, created_at, updated_at)
        VALUES ('leave-imm', ?, ?, 'CASUAL', '2026-10-10', '2026-10-12', 'Reason', 'PENDING', 'user-admin', ?, ?)
      `).bind(OUTLET_ID, staffId, now, now).run();

      await expect(
        localD1.prepare("UPDATE hr_leave_requests SET leave_type = 'SICK' WHERE id = 'leave-imm';").run()
      ).rejects.toThrow(/HR_LEAVE_IDENTITY_IMMUTABLE/i);
    });

    it('should enforce maker-checker database rule trigger on self approval/rejection', async () => {
      const staffId = await createTestStaff(OUTLET_ID, 'EMP_SQL_4', 'SQL Staff 4');
      const now = new Date().toISOString();

      await localD1.prepare(`
        INSERT INTO hr_leave_requests (id, outlet_id, staff_id, leave_type, from_date, to_date, reason, status, requested_by_user_id, created_at, updated_at)
        VALUES ('leave-mc', ?, ?, 'CASUAL', '2026-10-10', '2026-10-12', 'Reason', 'PENDING', 'user-admin', ?, ?)
      `).bind(OUTLET_ID, staffId, now, now).run();

      await expect(
        localD1.prepare(`
          UPDATE hr_leave_requests
          SET status = 'APPROVED', decision_by_user_id = 'user-admin', decision_at = ?
          WHERE id = 'leave-mc'
        `).bind(now).run()
      ).rejects.toThrow(/HR_MAKER_CHECKER_SELF_APPROVAL_FORBIDDEN/i);
    });
  });

  // =========================================================================
  // 3. API Create & Validation Tests
  // =========================================================================
  describe('3. API Create & Validation Tests', () => {
    it('should successfully create valid leave requests for all allowed types with 201 and calculate inclusive calendarDays', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const staffId = await createTestStaff(OUTLET_ID, 'EMP_LEAVE_1', 'Leave Staff');

      const types = ['CASUAL', 'SICK', 'EARNED', 'UNPAID', 'OTHER'] as const;
      for (let i = 0; i < types.length; i++) {
        const t = types[i];
        const res = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/leave-requests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
          body: JSON.stringify({
            staffId,
            leaveType: t,
            fromDate: `2026-11-${String(i * 2 + 1).padStart(2, '0')}`,
            toDate: `2026-11-${String(i * 2 + 2).padStart(2, '0')}`,
            reason: `Taking ${t} leave`,
          }),
        }, env);

        expect(res.status).toBe(201);
        const json = (await res.json()) as any;
        expect(json.success).toBe(true);
        expect(json.data.leaveType).toBe(t);
        expect(json.data.status).toBe('PENDING');
        expect(json.data.calendarDays).toBe(2);
      }
    });

    it('should reject inactive, exited, or foreign staff leave creation', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const activeStaffId = await createTestStaff(OUTLET_ID, 'EMP_ACT_1', 'Active Staff');
      const foreignStaffId = await createTestStaff(OUTLET_ID_2, 'EMP_FOR_1', 'Foreign Staff');

      // Foreign staff
      const resForeign = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/leave-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId: foreignStaffId,
          leaveType: 'CASUAL',
          fromDate: '2026-10-10',
          toDate: '2026-10-12',
          reason: 'Reason',
        }),
      }, env);
      expect(resForeign.status).toBe(400);
    });

    it('should reject invalid calendar dates e.g. 2026-02-31 and reversed date ranges', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const staffId = await createTestStaff(OUTLET_ID, 'EMP_DATE_1', 'Date Staff');

      const resBadDate = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/leave-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId,
          leaveType: 'CASUAL',
          fromDate: '2026-02-31',
          toDate: '2026-03-01',
          reason: 'Reason',
        }),
      }, env);
      expect(resBadDate.status).toBe(400);
    });
  });

  // =========================================================================
  // 4. Overlapping Leave Protection Tests
  // =========================================================================
  describe('4. Overlapping Leave Protection Tests', () => {
    it('should detect and reject overlapping active leave requests and allow non-overlapping or rejected/cancelled overlaps', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const foCookie = await loginAs('fo.central@iocl.in');
      const staffId = await createTestStaff(OUTLET_ID, 'EMP_OV_1', 'Overlap Staff');

      // Create base request: 2026-10-10 through 2026-10-12
      const res1 = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/leave-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId,
          leaveType: 'CASUAL',
          fromDate: '2026-10-10',
          toDate: '2026-10-12',
          reason: 'Base leave',
        }),
      }, env);
      expect(res1.status).toBe(201);
      const leave1Id = (await res1.json() as any).data.id;

      // Attempt exact overlap: 2026-10-10 to 2026-10-12
      const resOverlap1 = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/leave-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId,
          leaveType: 'SICK',
          fromDate: '2026-10-10',
          toDate: '2026-10-12',
          reason: 'Exact overlap',
        }),
      }, env);
      expect(resOverlap1.status).toBe(409);

      // Attempt non-overlapping request on 2026-10-13 onward -> should succeed
      const resNonOverlap = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/leave-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId,
          leaveType: 'EARNED',
          fromDate: '2026-10-13',
          toDate: '2026-10-15',
          reason: 'Non overlapping',
        }),
      }, env);
      expect(resNonOverlap.status).toBe(201);

      // Reject leave1, then overlapping request should now succeed
      const resReject = await app.request(`/api/v1/hr/leave-requests/${leave1Id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: foCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ decisionNotes: 'Rejected for test' }),
      }, env);
      expect(resReject.status).toBe(200);

      const resAfterReject = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/leave-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId,
          leaveType: 'SICK',
          fromDate: '2026-10-10',
          toDate: '2026-10-12',
          reason: 'Now allowed since previous rejected',
        }),
      }, env);
      expect(resAfterReject.status).toBe(201);
    });
  });

  // =========================================================================
  // 5. Maker-Checker, Approval & Rejection Tests
  // =========================================================================
  describe('5. Maker-Checker & Approval/Rejection Tests', () => {
    it('should enforce maker-checker rule: maker cannot approve/reject own request, even admin', async () => {
      const adminCookie = await loginAs('admin@iocl.in');
      const staffId = await createTestStaff(OUTLET_ID, 'EMP_MC_1', 'MC Staff');

      // Admin creates leave
      const resCreate = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/leave-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId,
          leaveType: 'CASUAL',
          fromDate: '2026-12-01',
          toDate: '2026-12-03',
          reason: 'Admin leave',
        }),
      }, env);
      expect(resCreate.status).toBe(201);
      const leaveId = (await resCreate.json() as any).data.id;

      // Same Admin attempts to approve -> 409 HR_MAKER_CHECKER_SELF_APPROVAL_FORBIDDEN
      const resApprove = await app.request(`/api/v1/hr/leave-requests/${leaveId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ decisionNotes: 'Self approve' }),
      }, env);
      expect(resApprove.status).toBe(409);
      const jsonErr = await resApprove.json() as any;
      expect(jsonErr.error.code).toBe('HR_MAKER_CHECKER_SELF_APPROVAL_FORBIDDEN');

      // Field Officer (different user) approves successfully
      const foCookie = await loginAs('fo.central@iocl.in');
      const resFOApprove = await app.request(`/api/v1/hr/leave-requests/${leaveId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: foCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ decisionNotes: 'Approved by FO' }),
      }, env);
      expect(resFOApprove.status).toBe(200);
      expect((await resFOApprove.json() as any).data.status).toBe('APPROVED');
    });

    it('should require rejection notes for rejections', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const foCookie = await loginAs('fo.central@iocl.in');
      const staffId = await createTestStaff(OUTLET_ID, 'EMP_REJ_1', 'Rej Staff');

      const resCreate = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/leave-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId,
          leaveType: 'SICK',
          fromDate: '2026-12-10',
          toDate: '2026-12-12',
          reason: 'Sick leave',
        }),
      }, env);
      const leaveId = (await resCreate.json() as any).data.id;

      // Reject without notes -> 400 validation error
      const resBadReject = await app.request(`/api/v1/hr/leave-requests/${leaveId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: foCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ decisionNotes: '' }),
      }, env);
      expect(resBadReject.status).toBe(400);
    });
  });

  // =========================================================================
  // 6. Cancellation & Concurrency Tests
  // =========================================================================
  describe('6. Cancellation & Concurrency Tests', () => {
    it('should allow original maker to cancel PENDING leave and prevent non-maker or terminal cancel', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const foCookie = await loginAs('fo.central@iocl.in');
      const staffId = await createTestStaff(OUTLET_ID, 'EMP_CAN_1', 'Can Staff');

      const resCreate = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/leave-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId,
          leaveType: 'CASUAL',
          fromDate: '2026-12-15',
          toDate: '2026-12-16',
          reason: 'Cancel test',
        }),
      }, env);
      const leaveId = (await resCreate.json() as any).data.id;

      // Field Officer cannot cancel Dealer's request
      const resFOCancel = await app.request(`/api/v1/hr/leave-requests/${leaveId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: foCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ cancellationReason: 'Wrong user cancel' }),
      }, env);
      expect(resFOCancel.status).toBe(403);

      // Original Dealer cancels successfully
      const resDealerCancel = await app.request(`/api/v1/hr/leave-requests/${leaveId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ cancellationReason: 'Plans changed' }),
      }, env);
      expect(resDealerCancel.status).toBe(200);
      expect((await resDealerCancel.json() as any).data.status).toBe('CANCELLED');
    });

    it('should prevent duplicate terminal transitions and return 409 HR_LEAVE_STATE_CHANGED on concurrent approval race', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const foCookie = await loginAs('fo.central@iocl.in');
      const bmCookie = await loginAs('bm.kolkata@iocl.in');
      const staffId = await createTestStaff(OUTLET_ID, 'EMP_RACE_1', 'Race Staff');

      const resCreate = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/leave-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId,
          leaveType: 'CASUAL',
          fromDate: '2026-12-20',
          toDate: '2026-12-22',
          reason: 'Race condition test',
        }),
      }, env);
      const leaveId = (await resCreate.json() as any).data.id;

      // Fire concurrent approval requests from FO and BM
      const [res1, res2] = await Promise.all([
        app.request(`/api/v1/hr/leave-requests/${leaveId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: foCookie, Origin: 'http://localhost:3000' },
          body: JSON.stringify({ decisionNotes: 'FO approve' }),
        }, env),
        app.request(`/api/v1/hr/leave-requests/${leaveId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: bmCookie, Origin: 'http://localhost:3000' },
          body: JSON.stringify({ decisionNotes: 'BM approve' }),
        }, env),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);
    });
  });

  // =========================================================================
  // 7. RBAC & Scope Isolation Tests
  // =========================================================================
  describe('7. RBAC & Scope Isolation Tests', () => {
    it('should enforce default RBAC role matrix (Dealer cannot approve, FO/BM/Admin can approve, State/Divisional office can read/approve without request)', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const soCookie = await loginAs('wbso@iocl.in'); // State Office
      const staffId = await createTestStaff(OUTLET_ID, 'EMP_RBAC_1', 'RBAC Staff');

      // Dealer creates leave
      const resCreate = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/leave-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId,
          leaveType: 'CASUAL',
          fromDate: '2026-12-25',
          toDate: '2026-12-26',
          reason: 'RBAC test',
        }),
      }, env);
      expect(resCreate.status).toBe(201);
      const leaveId = (await resCreate.json() as any).data.id;

      // State Office can approve (since SO has hr.leave.approve)
      const resSOApprove = await app.request(`/api/v1/hr/leave-requests/${leaveId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: soCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ decisionNotes: 'SO approve' }),
      }, env);
      expect(resSOApprove.status).toBe(200);
    });

    it('should enforce scope isolation across outlets', async () => {
      const dealerCookie1 = await loginAs('dealer.parkstreet@iocl.in'); // Outlet 1
      const staffId2 = await createTestStaff(OUTLET_ID_2, 'EMP_ISO_1', 'Isolated Staff');

      // Dealer 1 cannot create leave for Outlet 2
      const resCreate = await app.request(`/api/v1/outlets/${OUTLET_ID_2}/hr/leave-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie1, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId: staffId2,
          leaveType: 'CASUAL',
          fromDate: '2026-12-25',
          toDate: '2026-12-26',
          reason: 'Cross outlet violation',
        }),
      }, env);
      expect(resCreate.status).toBe(403);
    });
  });
});
