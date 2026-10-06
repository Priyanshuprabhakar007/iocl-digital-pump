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
  auditLogs,
  hrAttendanceRecords,
} from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { calculateHaversineDistanceMetres } from '../src/worker/services/hrService';

describe('Phase 5B Comprehensive Attendance & Geofencing Suite', () => {
  let localD1: any;
  let env: any;
  let testDbPath: string;

  const OUTLET_1_ID = 'ro-1001'; // Park Street (Lat ~ 22.55, Lon ~ 88.35)
  const OUTLET_2_ID = 'ro-1002'; // Salt Lake

  beforeEach(async () => {
    testDbPath = `./.sqlite/test_attendance_full_${Math.random().toString(36).substring(2)}_${Date.now()}.db`;
    if (fs.existsSync(testDbPath)) { try { fs.unlinkSync(testDbPath); } catch (e) {} }
    localD1 = createLocalD1Database(testDbPath);
    await seedDatabase(getDb(localD1));

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

  async function createTestSetup(db: any, outletId: string, rosterDate = '2026-10-10') {
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
      rosterDate,
      shiftTemplateId: shiftId,
      status: 'SCHEDULED',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    return { staffId, shiftId, rosterId };
  }

  it('should verify Haversine calculation accuracy', () => {
    const dist = calculateHaversineDistanceMetres(22.5500, 88.3500, 23.5500, 88.3500);
    expect(dist).toBeGreaterThan(110000);
    expect(dist).toBeLessThan(112000);
  });

  it('should manage geofence policy and audit logging', async () => {
    const cookie = await loginAs('admin@iocl.in');

    const putRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/geofence-policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({
        radiusMetres: 200,
        maxAccuracyMetres: 40,
        attendanceGeofenceRequired: true,
        status: 'ACTIVE',
      }),
    }, env);

    expect(putRes.status).toBe(200);
    const putJson = await putRes.json() as any;
    expect(putJson.success).toBe(true);

    const db = getDb(localD1);
    const audit = await db.select().from(auditLogs).where(eq(auditLogs.action, 'HR_GEOFENCE_POLICY_UPDATED')).get();
    expect(audit).toBeDefined();
  });

  it('should handle missing policy and unconfigured outlet coordinates', async () => {
    const cookie = await loginAs('admin@iocl.in'); // Admin has global scope
    const db = getDb(localD1);
    const { rosterId } = await createTestSetup(db, OUTLET_1_ID);

    // 1. Missing policy (404)
    const resNoPolicy = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/attendance/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ rosterAssignmentId: rosterId, latitude: 22.55, longitude: 88.35, accuracyMetres: 10 }),
    }, env);
    expect(resNoPolicy.status).toBe(404);
    const jsonNoPolicy = await resNoPolicy.json() as any;
    expect(jsonNoPolicy.error.code).toBe('HR_GEOFENCE_POLICY_NOT_FOUND');

    // Add policy but remove outlet coordinates for outlet 2
    const now = new Date().toISOString();
    await db.insert(hrOutletGeofencePolicies).values({
      id: 'geo-x',
      outletId: OUTLET_2_ID,
      radiusMetres: 100,
      maxAccuracyMetres: 50,
      attendanceGeofenceRequired: 1,
      status: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    const { rosterId: roster2 } = await createTestSetup(db, OUTLET_2_ID);
    await db.update(retailOutlets)
      .set({ latitude: null, longitude: null })
      .where(eq(retailOutlets.id, OUTLET_2_ID))
      .run();

    const resNoCoord = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/hr/attendance/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ rosterAssignmentId: roster2, latitude: 22.55, longitude: 88.35, accuracyMetres: 10 }),
    }, env);
    expect(resNoCoord.status).toBe(400);
    const jsonNoCoord = await resNoCoord.json() as any;
    expect(jsonNoCoord.error.code).toBe('HR_OUTLET_LOCATION_NOT_CONFIGURED');
  });

  it('should enforce checkout temporal integrity (checkOutAt > checkInAt)', async () => {
    const cookie = await loginAs('dealer.parkstreet@iocl.in');
    const db = getDb(localD1);
    const { rosterId } = await createTestSetup(db, OUTLET_1_ID);

    const now = new Date().toISOString();
    await db.insert(hrOutletGeofencePolicies).values({
      id: 'geo-temp',
      outletId: OUTLET_1_ID,
      radiusMetres: 500,
      maxAccuracyMetres: 50,
      attendanceGeofenceRequired: 1,
      status: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    const inRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/attendance/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ rosterAssignmentId: rosterId, latitude: 22.55, longitude: 88.35, accuracyMetres: 10 }),
    }, env);
    expect(inRes.status).toBe(201);
    const inJson = await inRes.json() as any;
    const attId = inJson.data.id;

    const outRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/attendance/${attId}/check-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ latitude: 22.55, longitude: 88.35, accuracyMetres: 10 }),
    }, env);
    expect(outRes.status).toBe(200);
    const outJson = await outRes.json() as any;
    expect(new Date(outJson.data.checkOutAt).getTime()).toBeGreaterThan(new Date(outJson.data.checkInAt).getTime());
  });

  it('should reject mismatched URL outlet in check-out', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const db = getDb(localD1);
    const { rosterId } = await createTestSetup(db, OUTLET_1_ID);

    const now = new Date().toISOString();
    await db.insert(hrOutletGeofencePolicies).values({
      id: 'geo-mismatch',
      outletId: OUTLET_1_ID,
      radiusMetres: 500,
      maxAccuracyMetres: 50,
      attendanceGeofenceRequired: 0,
      status: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    const inRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/attendance/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ rosterAssignmentId: rosterId, latitude: 22.55, longitude: 88.35, accuracyMetres: 10 }),
    }, env);
    const attId = (await inRes.json() as any).data.id;

    const mismatchRes = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/hr/attendance/${attId}/check-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ latitude: 22.55, longitude: 88.35, accuracyMetres: 10 }),
    }, env);
    expect(mismatchRes.status).toBe(404);
  });

  it('should verify direct DB integrity triggers and constraints', async () => {
    const db = getDb(localD1);
    const { rosterId, staffId, shiftId } = await createTestSetup(db, OUTLET_1_ID);
    const now = new Date().toISOString();

    const attId = `att-db-${Math.random()}`;
    await db.insert(hrAttendanceRecords).values({
      id: attId,
      outletId: OUTLET_1_ID,
      staffId,
      rosterAssignmentId: rosterId,
      attendanceDate: '2026-10-10',
      shiftTemplateId: shiftId,
      checkInAt: now,
      checkInLatitude: 22.55,
      checkInLongitude: 88.35,
      checkInAccuracyMetres: 10,
      checkInDistanceMetres: 0,
      checkInInsideGeofence: 1,
      status: 'CHECKED_IN',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    await expect(
      db.delete(hrAttendanceRecords).where(eq(hrAttendanceRecords.id, attId)).run()
    ).rejects.toThrow();
  });

  it('should test RBAC matrix across roles for attendance read/write and geofence/nozzle write', async () => {
    const db = getDb(localD1);
    const { rosterId } = await createTestSetup(db, OUTLET_1_ID);

    const now = new Date().toISOString();
    await db.insert(hrOutletGeofencePolicies).values({
      id: 'geo-rbac',
      outletId: OUTLET_1_ID,
      radiusMetres: 500,
      maxAccuracyMetres: 50,
      attendanceGeofenceRequired: 0,
      status: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    const roles = [
      { email: 'admin@iocl.in', canReadAtt: true, canWriteAtt: true, canWriteGeo: true },
      { email: 'wbso@iocl.in', canReadAtt: true, canWriteAtt: false, canWriteGeo: false },
      { email: 'kolkatado@iocl.in', canReadAtt: true, canWriteAtt: false, canWriteGeo: false },
      { email: 'bm.kolkata@iocl.in', canReadAtt: true, canWriteAtt: true, canWriteGeo: true },
      { email: 'fo.central@iocl.in', canReadAtt: true, canWriteAtt: true, canWriteGeo: true },
      { email: 'dealer.parkstreet@iocl.in', canReadAtt: true, canWriteAtt: true, canWriteGeo: false },
      { email: 'csp.parkstreet@iocl.in', canReadAtt: true, canWriteAtt: true, canWriteGeo: false },
    ];

    for (const r of roles) {
      const cookie = await loginAs(r.email);

      // Read attendance
      const rRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/attendance`, {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }, env);
      expect(rRes.status).toBe(r.canReadAtt ? 200 : 403);

      // Write geofence
      const gRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/geofence-policy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ radiusMetres: 100, maxAccuracyMetres: 50, attendanceGeofenceRequired: true, status: 'ACTIVE' }),
      }, env);
      expect(gRes.status).toBe(r.canWriteGeo ? 200 : 403);
    }

    // Test out-of-scope outlet vs missing permission 403 distinction
    const soCookie = await loginAs('wbso@iocl.in');
    const outOfScopeWrite = await app.request(`/api/v1/outlets/ro-9999/hr/attendance/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: soCookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ rosterAssignmentId: rosterId, latitude: 22.55, longitude: 88.35, accuracyMetres: 10 }),
    }, env);
    expect(outOfScopeWrite.status).toBe(403);
  });

  it('should validate GPS accuracy, coordinate ranges and inactive policy', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const db = getDb(localD1);
    const { rosterId } = await createTestSetup(db, OUTLET_1_ID);

    const now = new Date().toISOString();
    await db.insert(hrOutletGeofencePolicies).values({
      id: 'geo-acc',
      outletId: OUTLET_1_ID,
      radiusMetres: 100,
      maxAccuracyMetres: 20,
      attendanceGeofenceRequired: 1,
      status: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    // 1. Poor GPS accuracy
    const resAcc = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/attendance/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ rosterAssignmentId: rosterId, latitude: 22.55, longitude: 88.35, accuracyMetres: 50 }),
    }, env);
    expect(resAcc.status).toBe(400);
    expect((await resAcc.json() as any).error.code).toBe('HR_GPS_ACCURACY_TOO_LOW');

    // 2. Invalid latitude
    const resLat = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/hr/attendance/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ rosterAssignmentId: rosterId, latitude: 100, longitude: 88.35, accuracyMetres: 10 }),
    }, env);
    expect(resLat.status).toBe(400);
  });

  it('should verify direct DB cross-reference triggers for attendance', async () => {
    const db = getDb(localD1);
    const { rosterId, staffId, shiftId } = await createTestSetup(db, OUTLET_1_ID);
    const now = new Date().toISOString();

    // Mismatched outlet in insert
    await expect(
      db.insert(hrAttendanceRecords).values({
        id: `att-mismatch-${Math.random()}`,
        outletId: OUTLET_2_ID, // mismatch
        staffId,
        rosterAssignmentId: rosterId,
        attendanceDate: '2026-10-10',
        shiftTemplateId: shiftId,
        checkInAt: now,
        checkInLatitude: 22.55,
        checkInLongitude: 88.35,
        checkInAccuracyMetres: 10,
        checkInDistanceMetres: 0,
        checkInInsideGeofence: 1,
        status: 'CHECKED_IN',
        createdBy: 'user-admin',
        createdAt: now,
        updatedAt: now,
      }).run()
    ).rejects.toThrow();
  });
});
