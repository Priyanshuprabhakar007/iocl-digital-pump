import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import fs from 'fs';
import {
  hrDesignations,
  hrStaff,
  shiftTemplates,
  hrRosterAssignments,
  nozzles,
  dispensers,
  products,
  tanks,
  auditLogs,
  hrNozzleAssignments,
} from '../src/db/schema';
import { eq } from 'drizzle-orm';

describe('Phase 5B Comprehensive Nozzle Assignments Suite', () => {
  let localD1: any;
  let env: any;
  let testDbPath: string;

  const OUTLET_1_ID = 'ro-1001';
  const OUTLET_2_ID = 'ro-1002';

  beforeEach(async () => {
    testDbPath = `./.sqlite/test_nozzle_full_${Math.random().toString(36).substring(2)}_${Date.now()}.db`;
    if (fs.existsSync(testDbPath)) { try { fs.unlinkSync(testDbPath); } catch (e) {} }
    localD1 = createLocalD1Database(testDbPath);
    await seedDatabase(getDb(localD1));

    env = {
      DB: localD1,
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

  async function setupNozzleAndRoster(db: any, outletId: string, rosterDate = '2026-10-15') {
    const now = new Date().toISOString();
    const desigId = `desig-${Math.random().toString(36).substring(2)}`;
    const staffId = `staff-${Math.random().toString(36).substring(2)}`;
    const shiftId = `shift-${Math.random().toString(36).substring(2)}`;
    const rosterId = `roster-${Math.random().toString(36).substring(2)}`;
    const tankId = `tank-${Math.random().toString(36).substring(2)}`;
    const dispId = `disp-${Math.random().toString(36).substring(2)}`;
    const nozzId = `nozz-${Math.random().toString(36).substring(2)}`;

    await db.insert(hrDesignations).values({
      id: desigId,
      outletId,
      code: 'ATT',
      name: 'Attendant',
      status: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    await db.insert(hrStaff).values({
      id: staffId,
      outletId,
      employeeCode: 'EMP101',
      fullName: 'Nozzle Operator',
      designationId: desigId,
      aadhaarLast4: '5678',
      emergencyContactName: 'Contact',
      emergencyContactPhone: '9876543210',
      joiningDate: '2025-01-01',
      employmentStatus: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    await db.insert(shiftTemplates).values({
      id: shiftId,
      outletId,
      code: 'SHIFT_A',
      name: 'Shift A',
      startTime: '06:00',
      endTime: '14:00',
      sequence: 1,
      status: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    await db.insert(hrRosterAssignments).values({
      id: rosterId,
      outletId,
      staffId,
      rosterDate,
      shiftTemplateId: shiftId,
      status: 'SCHEDULED',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    const prod = await db.select().from(products).get();
    const productId = prod ? prod.id : 'prod-ms';

    const suffix = Math.floor(Math.random() * 10000);
    await db.insert(tanks).values({
      id: tankId,
      outletId,
      tankNumber: suffix,
      name: `Test Tank ${suffix}`,
      productId,
      capacityLitres: 20000,
      safeFillCapacityLitres: 18000,
      minimumOperatingLevelLitres: 1000,
      status: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    await db.insert(dispensers).values({
      id: dispId,
      outletId,
      dispenserNumber: suffix,
      name: `Test Dispenser ${suffix}`,
      status: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    await db.insert(nozzles).values({
      id: nozzId,
      outletId,
      dispenserId: dispId,
      nozzleNumber: suffix,
      productId,
      tankId,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-admin',
    }).run();

    return { staffId, shiftId, rosterId, nozzId };
  }

  it('should successfully create nozzle assignment, prevent duplicate assignment, handle repeated cancellation', async () => {
    const cookie = await loginAs('dealer.parkstreet@iocl.in');
    const db = getDb(localD1);
    const { rosterId, nozzId } = await setupNozzleAndRoster(db, OUTLET_1_ID);

    // 1. Successful assignment
    const res1 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/nozzle-assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ rosterAssignmentId: rosterId, nozzleId: nozzId, notes: 'Primary' }),
    }, env);

    expect(res1.status).toBe(201);
    const json1 = await res1.json() as any;
    const assignmentId = json1.data.id;

    // 2. Duplicate assignment for same shift/date rejected with 409
    const res2 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/nozzle-assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ rosterAssignmentId: rosterId, nozzleId: nozzId }),
    }, env);
    expect(res2.status).toBe(409);
    expect((await res2.json() as any).error.code).toBe('HR_NOZZLE_ALREADY_ASSIGNED');

    // 3. Cancel assignment
    const cancelRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/nozzle-assignments/${assignmentId}/cancel`, {
      method: 'PATCH',
      headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
    }, env);
    expect(cancelRes.status).toBe(200);

    // 4. Repeated cancellation should be rejected consistently with HR_NOZZLE_ASSIGNMENT_ALREADY_CANCELLED
    const repeatCancelRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/nozzle-assignments/${assignmentId}/cancel`, {
      method: 'PATCH',
      headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
    }, env);
    expect(repeatCancelRes.status).toBe(409);
    expect((await repeatCancelRes.json() as any).error.code).toBe('HR_NOZZLE_ASSIGNMENT_ALREADY_CANCELLED');

    // 5. Reassign same nozzle after cancellation
    const res3 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/nozzle-assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ rosterAssignmentId: rosterId, nozzleId: nozzId }),
    }, env);
    expect(res3.status).toBe(201);
  });

  it('should reject mismatched URL outlet on nozzle cancellation', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const db = getDb(localD1);
    const { rosterId, nozzId } = await setupNozzleAndRoster(db, OUTLET_1_ID);

    const res1 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/nozzle-assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ rosterAssignmentId: rosterId, nozzleId: nozzId }),
    }, env);
    const assignmentId = (await res1.json() as any).data.id;

    const mismatchRes = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/hr/nozzle-assignments/${assignmentId}/cancel`, {
      method: 'PATCH',
      headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
    }, env);
    expect(mismatchRes.status).toBe(404);
  });

  it('should verify direct DB physical delete block trigger for nozzle assignments', async () => {
    const db = getDb(localD1);
    const { rosterId, staffId, shiftId, nozzId } = await setupNozzleAndRoster(db, OUTLET_1_ID);
    const now = new Date().toISOString();

    const nozzAssignId = `nozz-db-${Math.random()}`;
    await db.insert(hrNozzleAssignments).values({
      id: nozzAssignId,
      outletId: OUTLET_1_ID,
      rosterAssignmentId: rosterId,
      staffId,
      nozzleId: nozzId,
      assignmentDate: '2026-10-15',
      shiftTemplateId: shiftId,
      status: 'ASSIGNED',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    await expect(
      db.delete(hrNozzleAssignments).where(eq(hrNozzleAssignments.id, nozzAssignId)).run()
    ).rejects.toThrow();
  });
});
