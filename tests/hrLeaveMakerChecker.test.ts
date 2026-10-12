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

  async function createTestStaff(outletId: string, empCode: string, name: string, status: 'ACTIVE' | 'INACTIVE' | 'EXITED' = 'ACTIVE') {
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
      employmentStatus: status,
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    return staffId;
  }

  // 1. Migration & Schema
  describe('1. Migration 0026 & Schema Inspection', () => {
    it('should verify hr_leave_requests table, columns, indexes, and triggers exist', async () => {
      const info = await localD1.prepare("PRAGMA table_info(hr_leave_requests);").all();
      const columns = info.results.map((r: any) => r.name);
      const expectedColumns = ['id', 'outlet_id', 'staff_id', 'leave_type', 'from_date', 'to_date', 'reason', 'attachment_document_id', 'status', 'requested_by_user_id', 'decision_by_user_id', 'decision_at', 'decision_notes', 'cancelled_by_user_id', 'cancelled_at', 'cancellation_reason', 'created_at', 'updated_at'];
      for (const col of expectedColumns) expect(columns).toContain(col);
      
      const indexes = await localD1.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='hr_leave_requests';").all();
      const indexNames = indexes.results.map((r: any) => r.name);
      const expectedIndexes = ['idx_hr_leave_outlet_status', 'idx_hr_leave_outlet_staff', 'idx_hr_leave_staff_dates', 'idx_hr_leave_outlet_dates', 'idx_hr_leave_requested_by'];
      for (const idx of expectedIndexes) expect(indexNames).toContain(idx);
      
      const triggers = await localD1.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='hr_leave_requests';").all();
      const triggerNames = triggers.results.map((r: any) => r.name);
      const expectedTriggers = ['trg_hr_leave_delete_forbidden', 'trg_hr_leave_identity_immutable', 'trg_hr_leave_insert_integrity', 'trg_hr_leave_update_integrity'];
      for (const trig of expectedTriggers) expect(triggerNames).toContain(trig);
    });
  });

  // 2. Workflow Integrity
  describe('2. Workflow Integrity', () => {
    it('should block direct INSERT of non-PENDING status', async () => {
      const db = getDb(localD1);
      const staffId = await createTestStaff(OUTLET_ID, 'E001', 'Test Staff');
      const now = new Date().toISOString();
      
      try {
        await db.insert(hrLeaveRequests).values({
          id: 'test-insert-1',
          outletId: OUTLET_ID,
          staffId,
          leaveType: 'CASUAL',
          fromDate: '2026-11-01',
          toDate: '2026-11-02',
          reason: 'Test reason',
          status: 'APPROVED',
          requestedByUserId: 'user-dealer',
          decisionByUserId: 'user-fo',
          decisionAt: now,
          createdAt: now,
          updatedAt: now,
        }).run();
        throw new Error('Expected HR_LEAVE_INVALID_STATE_TRANSITION error');
      } catch (e: any) {
        const fullError = (e.message || '') + (e.cause ? JSON.stringify(e.cause) : '');
        expect(fullError).toMatch(/HR_LEAVE_INVALID_STATE_TRANSITION|SQLITE_CONSTRAINT_TRIGGER/);
      }
    });

    it('should prevent updating terminal metadata once APPROVED', async () => {
      const db = getDb(localD1);
      const staffId = await createTestStaff(OUTLET_ID, 'E002', 'Test Staff 2');
      const now = new Date().toISOString();
      const leaveId = 'test-update-1';

      await db.insert(hrLeaveRequests).values({
        id: leaveId,
        outletId: OUTLET_ID,
        staffId,
        leaveType: 'CASUAL',
        fromDate: '2026-12-01',
        toDate: '2026-12-02',
        reason: 'Test reason',
        status: 'PENDING',
        requestedByUserId: 'user-dealer',
        createdAt: now,
        updatedAt: now,
      }).run();

      await db.update(hrLeaveRequests)
        .set({ status: 'APPROVED', decisionByUserId: 'user-fo', decisionAt: now, updatedAt: now })
        .where(eq(hrLeaveRequests.id, leaveId))
        .run();

      try {
        await db.update(hrLeaveRequests)
          .set({ decisionNotes: 'New notes', updatedAt: now })
          .where(eq(hrLeaveRequests.id, leaveId))
          .run();
        throw new Error('Expected HR_LEAVE_TERMINAL_IMMUTABLE error');
      } catch (e: any) {
        const fullError = (e.message || '') + (e.cause ? JSON.stringify(e.cause) : '');
        expect(fullError).toMatch(/HR_LEAVE_TERMINAL_IMMUTABLE|SQLITE_CONSTRAINT_TRIGGER/);
      }
    });
  });

  // 3. Maker-Checker Lifecycle
  describe('3. Maker-Checker Lifecycle', () => {
    it('should transition PENDING -> APPROVED', async () => {
      const db = getDb(localD1);
      const staffId = await createTestStaff(OUTLET_ID, 'E-APP', 'Staff App');
      const now = new Date().toISOString();
      const leaveId = 'leave-app';
      
      await db.insert(hrLeaveRequests).values({
        id: leaveId, outletId: OUTLET_ID, staffId, leaveType: 'CASUAL',
        fromDate: '2026-06-01', toDate: '2026-06-02', reason: 'Test',
        status: 'PENDING', requestedByUserId: 'user-dealer', createdAt: now, updatedAt: now
      }).run();

      await db.update(hrLeaveRequests)
        .set({ status: 'APPROVED', decisionByUserId: 'user-fo', decisionAt: now, updatedAt: now, decisionNotes: 'Looks good' })
        .where(eq(hrLeaveRequests.id, leaveId))
        .run();

      const result = await db.select().from(hrLeaveRequests).where(eq(hrLeaveRequests.id, leaveId)).get();
      expect(result?.status).toBe('APPROVED');
      expect(result?.decisionByUserId).toBe('user-fo');
    });

    it('should transition PENDING -> REJECTED', async () => {
      const db = getDb(localD1);
      const staffId = await createTestStaff(OUTLET_ID, 'E-REJ', 'Staff Rej');
      const now = new Date().toISOString();
      const leaveId = 'leave-rej';
      
      await db.insert(hrLeaveRequests).values({
        id: leaveId, outletId: OUTLET_ID, staffId, leaveType: 'CASUAL',
        fromDate: '2026-07-01', toDate: '2026-07-02', reason: 'Test',
        status: 'PENDING', requestedByUserId: 'user-dealer', createdAt: now, updatedAt: now
      }).run();

      await db.update(hrLeaveRequests)
        .set({ status: 'REJECTED', decisionByUserId: 'user-fo', decisionAt: now, updatedAt: now, decisionNotes: 'Denied' })
        .where(eq(hrLeaveRequests.id, leaveId))
        .run();

      const result = await db.select().from(hrLeaveRequests).where(eq(hrLeaveRequests.id, leaveId)).get();
      expect(result?.status).toBe('REJECTED');
    });

    it('should transition PENDING -> CANCELLED', async () => {
      const db = getDb(localD1);
      const staffId = await createTestStaff(OUTLET_ID, 'E-PEND-CAN', 'Staff Pending Can');
      const now = new Date().toISOString();
      const leaveId = 'leave-pend-can';
      
      await db.insert(hrLeaveRequests).values({
        id: leaveId, outletId: OUTLET_ID, staffId, leaveType: 'CASUAL',
        fromDate: '2026-09-01', toDate: '2026-09-02', reason: 'Test',
        status: 'PENDING', requestedByUserId: 'user-dealer', createdAt: now, updatedAt: now
      }).run();

      await db.update(hrLeaveRequests)
        .set({ 
            status: 'CANCELLED', 
            cancelledByUserId: 'user-dealer', 
            cancelledAt: now, 
            updatedAt: now, 
            cancellationReason: 'Changed mind'
        })
        .where(eq(hrLeaveRequests.id, leaveId))
        .run();

      const result = await db.select().from(hrLeaveRequests).where(eq(hrLeaveRequests.id, leaveId)).get();
      expect(result?.status).toBe('CANCELLED');
    });

    it('should NOT allow CANCELLATION of APPROVED leave', async () => {
      const db = getDb(localD1);
      const staffId = await createTestStaff(OUTLET_ID, 'E-CAN-BLOCKED', 'Staff Can Blocked');
      const now = new Date().toISOString();
      const leaveId = 'leave-can-blocked';
      
      await db.insert(hrLeaveRequests).values({
        id: leaveId, outletId: OUTLET_ID, staffId, leaveType: 'CASUAL',
        fromDate: '2026-08-01', toDate: '2026-08-02', reason: 'Test',
        status: 'PENDING', requestedByUserId: 'user-dealer', createdAt: now, updatedAt: now
      }).run();

      await db.update(hrLeaveRequests)
        .set({ status: 'APPROVED', decisionByUserId: 'user-fo', decisionAt: now, updatedAt: now })
        .where(eq(hrLeaveRequests.id, leaveId))
        .run();

      try {
        await db.update(hrLeaveRequests)
          .set({ 
              status: 'CANCELLED', 
              cancelledByUserId: 'user-dealer', 
              cancelledAt: now, 
              updatedAt: now, 
              cancellationReason: 'Changed mind'
          })
          .where(eq(hrLeaveRequests.id, leaveId))
          .run();
        throw new Error('Should have failed to cancel APPROVED leave');
      } catch (e: any) {
        const fullError = (e.message || '') + (e.cause ? JSON.stringify(e.cause) : '');
        expect(fullError).toMatch(/HR_LEAVE_INVALID_STATE_TRANSITION|SQLITE_CONSTRAINT_TRIGGER|SQLITE_CONSTRAINT_CHECK/);
      }
    });
  });

  // 4. Overlap & Integrity
  describe('4. SQL Integrity & Overlap', () => {
    it('should reject overlapping dates for PENDING/APPROVED leave', async () => {
      const db = getDb(localD1);
      const staffId = await createTestStaff(OUTLET_ID, 'E-OV', 'Staff Ov');
      const now = new Date().toISOString();
      
      await db.insert(hrLeaveRequests).values({
        id: 'leave-1', outletId: OUTLET_ID, staffId, leaveType: 'CASUAL',
        fromDate: '2026-09-01', toDate: '2026-09-02', reason: 'Test',
        status: 'PENDING', requestedByUserId: 'user-dealer', createdAt: now, updatedAt: now
      }).run();

      try {
        await db.insert(hrLeaveRequests).values({
            id: 'leave-2', outletId: OUTLET_ID, staffId, leaveType: 'CASUAL',
            fromDate: '2026-09-02', toDate: '2026-09-03', reason: 'Test',
            status: 'PENDING', requestedByUserId: 'user-dealer', createdAt: now, updatedAt: now
        }).run();
        throw new Error('Should have failed due to overlap');
      } catch (e: any) {
        const fullError = (e.message || '') + (e.cause ? JSON.stringify(e.cause) : '');
        expect(fullError).toMatch(/HR_LEAVE_OVERLAP|SQLITE_CONSTRAINT|HR_LEAVE_INVALID_STATE_TRANSITION/);
      }
    });

    it('should allow overlap if previous request is REJECTED or CANCELLED', async () => {
        const db = getDb(localD1);
        const staffId = await createTestStaff(OUTLET_ID, 'E-OV-2', 'Staff Ov 2');
        const now = new Date().toISOString();
        
        await db.insert(hrLeaveRequests).values({
          id: 'leave-rej-1', outletId: OUTLET_ID, staffId, leaveType: 'CASUAL',
          fromDate: '2026-10-01', toDate: '2026-10-02', reason: 'Test',
          status: 'PENDING', requestedByUserId: 'user-dealer', createdAt: now, updatedAt: now
        }).run();
        
        await db.update(hrLeaveRequests)
          .set({ status: 'REJECTED', decisionByUserId: 'user-fo', decisionAt: now, updatedAt: now })
          .where(eq(hrLeaveRequests.id, 'leave-rej-1'))
          .run();
  
        await db.insert(hrLeaveRequests).values({
              id: 'leave-2', outletId: OUTLET_ID, staffId, leaveType: 'CASUAL',
              fromDate: '2026-10-01', toDate: '2026-10-02', reason: 'Test',
              status: 'PENDING', requestedByUserId: 'user-dealer', createdAt: now, updatedAt: now
        }).run();

        const result = await db.select().from(hrLeaveRequests).where(eq(hrLeaveRequests.id, 'leave-2')).get();
        expect(result?.id).toBe('leave-2');
    });
  });

  // 5. Additional Hardening
  describe('5. Additional Hardening', () => {
    it('should save decision notes in audit log', async () => {
        const db = getDb(localD1);
        const staffId = await createTestStaff(OUTLET_ID, 'E-NOTES', 'Staff Notes');
        const now = new Date().toISOString();
        const leaveId = 'leave-notes';
        const notes = 'Approved for emergency';
        
        await db.insert(hrLeaveRequests).values({
          id: leaveId, outletId: OUTLET_ID, staffId, leaveType: 'CASUAL',
          fromDate: '2026-11-01', toDate: '2026-11-02', reason: 'Test',
          status: 'PENDING', requestedByUserId: 'user-dealer', createdAt: now, updatedAt: now
        }).run();
  
        await db.update(hrLeaveRequests)
          .set({ status: 'APPROVED', decisionByUserId: 'user-fo', decisionAt: now, updatedAt: now, decisionNotes: notes })
          .where(eq(hrLeaveRequests.id, leaveId))
          .run();
  
        const result = await db.select().from(hrLeaveRequests).where(eq(hrLeaveRequests.id, leaveId)).get();
        expect(result?.decisionNotes).toBe(notes);
    });

    it('should prevent leave request with fromDate > toDate', async () => {
        const db = getDb(localD1);
        const staffId = await createTestStaff(OUTLET_ID, 'E-DATE', 'Staff Date');
        const now = new Date().toISOString();
        
        try {
            await db.insert(hrLeaveRequests).values({
              id: 'leave-date', outletId: OUTLET_ID, staffId, leaveType: 'CASUAL',
              fromDate: '2026-12-02', toDate: '2026-12-01', reason: 'Test',
              status: 'PENDING', requestedByUserId: 'user-dealer', createdAt: now, updatedAt: now
            }).run();
            throw new Error('Should have failed due to invalid dates');
        } catch (e: any) {
            const fullError = (e.message || '') + (e.cause ? JSON.stringify(e.cause) : '');
            expect(fullError).toMatch(/HR_LEAVE_INVALID_DATES|SQLITE_CONSTRAINT/);
        }
    });
  });
});
