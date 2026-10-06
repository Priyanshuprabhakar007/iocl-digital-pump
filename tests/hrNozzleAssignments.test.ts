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
  retailOutlets,
} from '../src/db/schema';
import { eq } from 'drizzle-orm';

describe('Phase 5B Nozzle Assignments Suite', () => {
  let localD1: any;
  let env: any;
  let testDbPath: string;

  const OUTLET_1_ID = 'ro-1001';

  beforeEach(async () => {
    testDbPath = `./.sqlite/test_nozzle_assign_${Math.random().toString(36).substring(2)}_${Date.now()}.db`;
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

  async function setupNozzleAndRoster(db: any, outletId: string) {
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
      rosterDate: '2026-10-15',
      shiftTemplateId: shiftId,
      status: 'SCHEDULED',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    const prod = await db.select().from(products).get();
    const productId = prod ? prod.id : 'prod-ms';

    await db.insert(tanks).values({
      id: tankId,
      outletId,
      tankNumber: 99,
      name: 'Test Tank 99',
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
      dispenserNumber: 99,
      name: 'Test Dispenser 99',
      status: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    await db.insert(nozzles).values({
      id: nozzId,
      outletId,
      dispenserId: dispId,
      nozzleNumber: 99,
      productId,
      tankId,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-admin',
    }).run();

    return { staffId, shiftId, rosterId, nozzId };
  }

  it('should successfully create nozzle assignment and prevent duplicate nozzle assignment for same shift and date', async () => {
    const cookie = await loginAs('dealer.parkstreet@iocl.in');
    const db = getDb(localD1);
    const { rosterId, nozzId } = await setupNozzleAndRoster(db, OUTLET_1_ID);

    // 1. Successful assignment
    const res1 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/nozzle-assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({
        rosterAssignmentId: rosterId,
        nozzleId: nozzId,
        notes: 'Primary nozzle',
      }),
    }, env);

    expect(res1.status).toBe(201);
    const json1 = await res1.json() as any;
    expect(json1.success).toBe(true);
    expect(json1.data.status).toBe('ASSIGNED');
    const assignmentId = json1.data.id;

    // 2. Duplicate assignment for same nozzle, shift, and date should fail with 409
    const res2 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/nozzle-assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({
        rosterAssignmentId: rosterId,
        nozzleId: nozzId,
      }),
    }, env);

    expect(res2.status).toBe(409);
    const json2 = await res2.json() as any;
    expect(json2.error.code).toBe('HR_NOZZLE_ALREADY_ASSIGNED');

    // 3. Cancel assignment
    const cancelRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/nozzle-assignments/${assignmentId}/cancel`, {
      method: 'PATCH',
      headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
    }, env);

    expect(cancelRes.status).toBe(200);
    const cancelJson = await cancelRes.json() as any;
    expect(cancelJson.success).toBe(true);
    expect(cancelJson.data.status).toBe('CANCELLED');

    // 4. After cancellation, assigning same nozzle again should succeed
    const res3 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/nozzle-assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({
        rosterAssignmentId: rosterId,
        nozzleId: nozzId,
      }),
    }, env);

    expect(res3.status).toBe(201);
  });
});
