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
      expect(indexNames).toContain('idx_hr_leave_outlet_status');
      
      const triggers = await localD1.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='hr_leave_requests';").all();
      const triggerNames = triggers.results.map((r: any) => r.name);
      expect(triggerNames).toContain('trg_hr_leave_insert_integrity');
      expect(triggerNames).toContain('trg_hr_leave_update_integrity');
    });
  });
});
