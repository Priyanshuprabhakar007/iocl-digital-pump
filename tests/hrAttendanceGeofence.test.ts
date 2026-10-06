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
  hrOutletGeofencePolicies,
  retailOutlets,
} from '../src/db/schema';
import { eq } from 'drizzle-orm';

describe('Phase 5B Attendance & Geofencing Suite', () => {
  let localD1: any;
  let env: any;
  let testDbPath: string;

  const OUTLET_1_ID = 'ro-1001'; // Park Street (Lat ~ 22.55, Lon ~ 88.35)

  beforeEach(async () => {
    testDbPath = `./.sqlite/test_attendance_${Math.random().toString(36).substring(2)}_${Date.now()}.db`;
    if (fs.existsSync(testDbPath)) { try { fs.unlinkSync(testDbPath); } catch (e) {} }
    localD1 = createLocalD1Database(testDbPath);
    await seedDatabase(getDb(localD1));

    // Set known coordinates for outlet 1
    const dbInstance = getDb(localD1);
    await dbInstance.update(retailOutlets)
      .set({ latitude: 22.5500, longitude: 88.3500 })
      .where(eq(retailOutlets.id, OUTLET_1_ID))
      .run();

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

  async function createTestSetup(db: any, outletId: string) {
    const desigId = `desig-${Math.random().toString(36).substring(2)}`;
    const staffId = `staff-${Math.random().toString(36).substring(2)}`;
    const shiftId = `shift-${Math.random().toString(36).substring(2)}`;
    const rosterId = `roster-${Math.random().toString(36).substring(2)}`;
    const now = new Date().toISOString();

    await db.insert(hrDesignations).values({
      id: desigId,
      outletId,
      code: 'ATT_MGR',
      name: 'Attendance Manager',
      status: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    await db.insert(hrStaff).values({
      id: staffId,
      outletId,
      employeeCode: 'EMP999',
      fullName: 'Test Attendant',
      designationId: desigId,
      aadhaarLast4: '1234',
      emergencyContactName: 'Emergency',
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
      code: 'S_MORNING',
      name: 'Morning Shift',
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
      rosterDate: '2026-10-10',
      shiftTemplateId: shiftId,
      status: 'SCHEDULED',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    return { desigId, staffId, shiftId, rosterId };
  }

  it('should manage geofence policy via PUT and GET', async () => {
    const cookie = await loginAs('admin@iocl.in');

    const putRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/geofence-policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({
        radiusMetres: 150,
        maxAccuracyMetres: 30,
        attendanceGeofenceRequired: true,
        status: 'ACTIVE',
      }),
    }, env);

    expect(putRes.status).toBe(200);
    const putJson = await putRes.json() as any;
    expect(putJson.success).toBe(true);
    expect(putJson.data.radiusMetres).toBe(150);

    const getRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/geofence-policy`, {
      method: 'GET',
      headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
    }, env);

    expect(getRes.status).toBe(200);
    const getJson = await getRes.json() as any;
    expect(getJson.success).toBe(true);
    expect(getJson.data.maxAccuracyMetres).toBe(30);
  });

  it('should allow successful check-in within geofence and block outside geofence', async () => {
    const cookie = await loginAs('dealer.parkstreet@iocl.in');
    const db = getDb(localD1);
    const { rosterId } = await createTestSetup(db, OUTLET_1_ID);

    // Set active geofence policy (100m radius, 50m accuracy, required)
    const now = new Date().toISOString();
    await db.insert(hrOutletGeofencePolicies).values({
      id: 'geo-1',
      outletId: OUTLET_1_ID,
      radiusMetres: 100,
      maxAccuracyMetres: 50,
      attendanceGeofenceRequired: 1,
      status: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    // 1. Outside geofence test (~1.5 km away)
    const outsideRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/attendance/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({
        rosterAssignmentId: rosterId,
        latitude: 22.5650,
        longitude: 88.3500,
        accuracyMetres: 10,
      }),
    }, env);

    expect(outsideRes.status).toBe(400);
    const outsideJson = await outsideRes.json() as any;
    expect(outsideJson.error.code).toBe('HR_OUTSIDE_GEOFENCE');

    // 2. Inside geofence test (~5 metres away)
    const insideRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/attendance/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({
        rosterAssignmentId: rosterId,
        latitude: 22.5500,
        longitude: 88.3501,
        accuracyMetres: 10,
      }),
    }, env);

    expect(insideRes.status).toBe(201);
    const insideJson = await insideRes.json() as any;
    expect(insideJson.success).toBe(true);
    expect(insideJson.data.status).toBe('CHECKED_IN');
    expect(insideJson.data.checkInInsideGeofence).toBe(1);

    const attendanceId = insideJson.data.id;

    // 3. Duplicate check-in should be rejected with 409
    const dupRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/attendance/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({
        rosterAssignmentId: rosterId,
        latitude: 22.5500,
        longitude: 88.3501,
        accuracyMetres: 10,
      }),
    }, env);

    expect(dupRes.status).toBe(409);
    const dupJson = await dupRes.json() as any;
    expect(dupJson.error.code).toBe('HR_ATTENDANCE_ALREADY_EXISTS');

    // 4. Successful check-out
    const outRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/attendance/${attendanceId}/check-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({
        latitude: 22.5500,
        longitude: 88.3501,
        accuracyMetres: 10,
      }),
    }, env);

    expect(outRes.status).toBe(200);
    const outJson = await outRes.json() as any;
    expect(outJson.success).toBe(true);
    expect(outJson.data.status).toBe('CHECKED_OUT');
  });

  it('should reject low GPS accuracy requests with HR_GPS_ACCURACY_TOO_LOW', async () => {
    const cookie = await loginAs('dealer.parkstreet@iocl.in');
    const db = getDb(localD1);
    const { rosterId } = await createTestSetup(db, OUTLET_1_ID);

    const now = new Date().toISOString();
    await db.insert(hrOutletGeofencePolicies).values({
      id: 'geo-2',
      outletId: OUTLET_1_ID,
      radiusMetres: 200,
      maxAccuracyMetres: 20, // strict accuracy
      attendanceGeofenceRequired: 1,
      status: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/attendance/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({
        rosterAssignmentId: rosterId,
        latitude: 22.5500,
        longitude: 88.3500,
        accuracyMetres: 80, // poor accuracy > 20
      }),
    }, env);

    expect(res.status).toBe(400);
    const json = await res.json() as any;
    expect(json.error.code).toBe('HR_GPS_ACCURACY_TOO_LOW');
  });
});
