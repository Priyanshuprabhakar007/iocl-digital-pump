import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import app from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import * as schema from '../src/db/schema';
import { eq, and } from 'drizzle-orm';
import fs from 'fs';
import { PERMISSIONS } from '../src/shared/constants';
import { filterTanksForEditNozzle, findTankProduct } from '../src/frontend/components/pump/pumpInfrastructureUi';
import { Tank } from '../src/shared/types';

describe('Phase 1 IOCL Operational Correction Program - Nozzle & Infrastructure Remapping', () => {
  let env: { DB: any; DOCUMENTS_BUCKET: any };
  let dbPath: string;
  let localD1: any;

  beforeEach(async () => {
    dbPath = `./.sqlite/test_phase1_correction_${Math.random().toString(36).substring(7)}.db`;
    localD1 = createLocalD1Database(dbPath);
    const db = getDb(localD1);
    await seedDatabase(db);

    env = { DB: localD1, DOCUMENTS_BUCKET: null as any };
  });

  afterEach(() => {
    try {
      localD1.close();
    } catch (e) {}

    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
      if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
    } catch (e) {}
  });

  const getCookie = (res: Response) => {
    const setCookie = res.headers.get('set-cookie');
    if (!setCookie) return '';
    return setCookie.split(';')[0];
  };

  const loginAs = async (email: string) => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email, password: 'Password@123' }),
      }),
      env
    );
    const cookie = getCookie(res);
    const json = (await res.json()) as any;
    return { res, cookie, json };
  };

  // 1. Successful Nozzle Remap
  it('1. Successfully remaps nozzle to another active tank with matching fuel product', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // Initially nozz-ro1-1-1 is on tank-ro1-1 (MS)
    // Create an additional active MS tank at ro-1001 to remap to
    const createTankRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/tanks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          tankNumber: 99,
          name: 'Tank 99 (Reserve MS)',
          productId: 'prod-ms',
          capacityLitres: 25000,
          safeFillCapacityLitres: 24000,
          minimumOperatingLevelLitres: 1000,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(createTankRes.status).toBe(201);
    const newTank = ((await createTankRes.json()) as any).data;

    // Remap nozz-ro1-1-1 to Tank 99
    const remapRes = await app.fetch(
      new Request('http://localhost/api/v1/nozzles/nozz-ro1-1-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          productId: 'prod-ms',
          tankId: newTank.id,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(remapRes.status).toBe(200);
    const remapJson = (await remapRes.json()) as any;
    expect(remapJson.success).toBe(true);
    expect(remapJson.data.tankId).toBe(newTank.id);

    // Verify database state
    const db = getDb(localD1);
    const [dbNozzle] = await db.select().from(schema.nozzles).where(eq(schema.nozzles.id, 'nozz-ro1-1-1'));
    expect(dbNozzle.tankId).toBe(newTank.id);
  });

  // 2. Reject Cross-Outlet Tank Remap
  it('2. Rejects remap to a tank belonging to another retail outlet (400 INVALID_TANK)', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // Create a tank in another outlet ro-1002
    const db = getDb(localD1);
    await db.insert(schema.tanks).values({
      id: 'tank-cross-outlet-test',
      outletId: 'ro-1002',
      tankNumber: 999,
      name: 'Tank Salt Lake Other',
      productId: 'prod-ms',
      capacityLitres: 20000,
      safeFillCapacityLitres: 19000,
      minimumOperatingLevelLitres: 1000,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'user-admin',
    });

    const remapRes = await app.fetch(
      new Request('http://localhost/api/v1/nozzles/nozz-ro1-1-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          productId: 'prod-ms',
          tankId: 'tank-cross-outlet-test',
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(remapRes.status).toBe(400);
    const json = (await remapRes.json()) as any;
    expect(json.error.code).toBe('INVALID_TANK');
  });

  // 3. Reject Product Mismatch
  it('3. Rejects remap where tank fuel product does not match nozzle product (400 PRODUCT_MISMATCH)', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // tank-ro1-2 is HSD, nozzle nozz-ro1-1-1 is MS
    const remapRes = await app.fetch(
      new Request('http://localhost/api/v1/nozzles/nozz-ro1-1-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          productId: 'prod-ms',
          tankId: 'tank-ro1-2', // HSD tank
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(remapRes.status).toBe(400);
    const json = (await remapRes.json()) as any;
    expect(json.error.code).toBe('PRODUCT_MISMATCH');
  });

  // 4. Reject Inactive Tank
  it('4. Rejects setting active nozzle to an INACTIVE tank (400 INACTIVE_TANK)', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // Create an INACTIVE tank
    const createTankRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/tanks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          tankNumber: 88,
          name: 'Tank 88 Inactive',
          productId: 'prod-ms',
          capacityLitres: 20000,
          safeFillCapacityLitres: 19000,
          minimumOperatingLevelLitres: 1000,
          status: 'INACTIVE',
        }),
      }),
      env
    );
    expect(createTankRes.status).toBe(201);
    const inactiveTank = ((await createTankRes.json()) as any).data;

    // Try to map ACTIVE nozzle to INACTIVE tank
    const remapRes = await app.fetch(
      new Request('http://localhost/api/v1/nozzles/nozz-ro1-1-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          productId: 'prod-ms',
          tankId: inactiveTank.id,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(remapRes.status).toBe(400);
    const json = (await remapRes.json()) as any;
    expect(json.error.code).toBe('INACTIVE_TANK');
  });

  // 5. Unauthorized Rejection
  it('5. Rejects unauthorized nozzle update by user without NOZZLES_WRITE permission (403 FORBIDDEN)', async () => {
    // CSP at parkstreet has NOZZLES_READ but NOT NOZZLES_WRITE
    const { cookie: cspCookie } = await loginAs('csp.parkstreet@iocl.in');

    const remapRes = await app.fetch(
      new Request('http://localhost/api/v1/nozzles/nozz-ro1-1-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cspCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          productId: 'prod-ms',
          tankId: 'tank-ro1-1',
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(remapRes.status).toBe(403);
    const json = (await remapRes.json()) as any;
    expect(json.error.code).toBe('FORBIDDEN');
  });

  // 6. Historical Shift Snapshot Immutability
  it('6. Changing live nozzle mapping preserves immutable historical shift snapshots (operational_shift_nozzles untouched)', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');
    const db = getDb(localD1);

    // Open a shift for ro-1001 with st-ro1-1
    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate: '2026-10-22',
        }),
      }),
      env
    );
    expect(openRes.status).toBe(201);
    const openJson = (await openRes.json()) as any;
    const shiftId = openJson.data.id;

    // Check shift nozzle snapshot for nozz-ro1-1-1
    const [snapshotBefore] = await db
      .select()
      .from(schema.operationalShiftNozzles)
      .where(
        and(
          eq(schema.operationalShiftNozzles.operationalShiftId, shiftId),
          eq(schema.operationalShiftNozzles.nozzleId, 'nozz-ro1-1-1')
        )
      );
    expect(snapshotBefore).toBeDefined();
    expect(snapshotBefore.tankId).toBe('tank-ro1-1');
    expect(snapshotBefore.tankNumber).toBe(1);

    // Create a new active MS tank and remap live nozzle
    const createTankRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/tanks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          tankNumber: 77,
          name: 'Tank 77 Modernized',
          productId: 'prod-ms',
          capacityLitres: 30000,
          safeFillCapacityLitres: 28000,
          minimumOperatingLevelLitres: 1000,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(createTankRes.status).toBe(201);
    const tank77 = ((await createTankRes.json()) as any).data;

    const remapRes = await app.fetch(
      new Request('http://localhost/api/v1/nozzles/nozz-ro1-1-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          productId: 'prod-ms',
          tankId: tank77.id,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(remapRes.status).toBe(200);

    // Verify historical shift snapshot is COMPLETELY UNTOUCHED
    const [snapshotAfter] = await db
      .select()
      .from(schema.operationalShiftNozzles)
      .where(
        and(
          eq(schema.operationalShiftNozzles.operationalShiftId, shiftId),
          eq(schema.operationalShiftNozzles.nozzleId, 'nozz-ro1-1-1')
        )
      );
    expect(snapshotAfter.tankId).toBe('tank-ro1-1'); // STILL Tank 1!
    expect(snapshotAfter.tankNumber).toBe(1); // STILL Tank 1!
  });

  // 7. Historical Meter Readings Immutability
  it('7. Changing live nozzle mapping preserves historical nozzle meter readings untouched', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');
    const db = getDb(localD1);

    // Open shift
    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate: '2026-10-23',
        }),
      }),
      env
    );
    expect(openRes.status).toBe(201);
    const shiftId = ((await openRes.json()) as any).data.id;

    // Record meter reading
    const readingRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          nozzleId: 'nozz-ro1-1-1',
          openingTotalizer: '1000.000',
          closingTotalizer: '1250.000',
          testingQuantity: '5.000',
        }),
      }),
      env
    );
    expect(readingRes.status).toBe(201);

    // Remap nozzle
    const remapRes = await app.fetch(
      new Request('http://localhost/api/v1/nozzles/nozz-ro1-1-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          status: 'MAINTENANCE',
        }),
      }),
      env
    );
    expect(remapRes.status).toBe(200);

    // Verify reading in database is unchanged
    const [dbReading] = await db
      .select()
      .from(schema.nozzleMeterReadings)
      .where(
        and(
          eq(schema.nozzleMeterReadings.operationalShiftId, shiftId),
          eq(schema.nozzleMeterReadings.nozzleId, 'nozz-ro1-1-1')
        )
      );
    expect(dbReading).toBeDefined();
    expect(dbReading.grossSalesQuantityMilliunits).toBe(250000);
  });

  // 8. Audit Logging Records Old & New Values with Actor
  it('8. Audit log is created recording actor, entity, old mapping, and new mapping on nozzle update', async () => {
    const { cookie: dealerCookie, json: userJson } = await loginAs('dealer.parkstreet@iocl.in');
    const db = getDb(localD1);
    const userId = userJson.data.user.id;

    // Update nozzle
    const updateRes = await app.fetch(
      new Request('http://localhost/api/v1/nozzles/nozz-ro1-1-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          status: 'MAINTENANCE',
        }),
      }),
      env
    );
    expect(updateRes.status).toBe(200);

    // Verify audit log
    const [audit] = await db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.action, 'NOZZLE_UPDATE'),
          eq(schema.auditLogs.entityId, 'nozz-ro1-1-1')
        )
      )
      .orderBy(schema.auditLogs.createdAt);

    expect(audit).toBeDefined();
    expect(audit.userId).toBe(userId);
    expect(audit.entityType).toBe('NOZZLE');
    expect(audit.oldValueJson).toContain('"status":"ACTIVE"');
    expect(audit.newValueJson).toContain('"status":"MAINTENANCE"');
  });

  // 9. Tank Product Change Rejection with controlled 409 TANK_PRODUCT_CHANGE_BLOCKED
  it('9. Rejects unsafe tank product change with 409 TANK_PRODUCT_CHANGE_BLOCKED when tank has dependent nozzles', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // Attempt to change product of Tank 1 (which is referenced by active nozzles)
    const changeProdRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          productId: 'prod-hsd',
        }),
      }),
      env
    );
    expect(changeProdRes.status).toBe(409);
    const changeProdJson = (await changeProdRes.json()) as any;
    expect(changeProdJson.error.code).toBe('TANK_PRODUCT_CHANGE_BLOCKED');
    expect(changeProdJson.error.message).toContain('nozzle');
  });

  // 10. UI Tank/Product Dependency Filtering Logic
  it('10. UI helper functions correctly filter tanks by product and extract tank product', () => {
    const mockTanks: Tank[] = [
      {
        id: 't-1',
        outletId: 'ro-1',
        tankNumber: 1,
        name: 'Tank 1',
        productId: 'prod-ms',
        capacityLitres: 20000,
        safeFillCapacityLitres: 19000,
        minimumOperatingLevelLitres: 1000,
        status: 'ACTIVE',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        createdBy: 'u-1',
      },
      {
        id: 't-2',
        outletId: 'ro-1',
        tankNumber: 2,
        name: 'Tank 2',
        productId: 'prod-ms',
        capacityLitres: 20000,
        safeFillCapacityLitres: 19000,
        minimumOperatingLevelLitres: 1000,
        status: 'INACTIVE', // Inactive, should be filtered out
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        createdBy: 'u-1',
      },
      {
        id: 't-3',
        outletId: 'ro-1',
        tankNumber: 3,
        name: 'Tank 3',
        productId: 'prod-hsd',
        capacityLitres: 20000,
        safeFillCapacityLitres: 19000,
        minimumOperatingLevelLitres: 1000,
        status: 'ACTIVE',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        createdBy: 'u-1',
      },
    ];

    // filterTanksForEditNozzle returns only active tanks matching selected product
    const msTanks = filterTanksForEditNozzle(mockTanks, 'prod-ms');
    expect(msTanks.length).toBe(1);
    expect(msTanks[0].id).toBe('t-1');

    const hsdTanks = filterTanksForEditNozzle(mockTanks, 'prod-hsd');
    expect(hsdTanks.length).toBe(1);
    expect(hsdTanks[0].id).toBe('t-3');

    // findTankProduct returns the associated product
    expect(findTankProduct(mockTanks, 't-1')).toBe('prod-ms');
    expect(findTankProduct(mockTanks, 't-3')).toBe('prod-hsd');
    expect(findTankProduct(mockTanks, 'non-existent')).toBeNull();
  });

  // 11. Permission Constants Guarding Actions
  it('11. Standard permission constants properly define NOZZLES_WRITE, TANKS_WRITE, and DISPENSERS_WRITE', () => {
    expect(PERMISSIONS.NOZZLES_WRITE).toBe('nozzles.write');
    expect(PERMISSIONS.TANKS_WRITE).toBe('tanks.write');
    expect(PERMISSIONS.DISPENSERS_WRITE).toBe('dispensers.write');
  });

  // 12. Duplicate Submission Idempotency
  it('12. Handles duplicate consecutive submissions idempotently without corruption or failure', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    const payload = {
      status: 'MAINTENANCE',
    };

    // First request
    const res1 = await app.fetch(
      new Request('http://localhost/api/v1/nozzles/nozz-ro1-1-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify(payload),
      }),
      env
    );
    expect(res1.status).toBe(200);

    // Rapid duplicate second request
    const res2 = await app.fetch(
      new Request('http://localhost/api/v1/nozzles/nozz-ro1-1-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify(payload),
      }),
      env
    );
    expect(res2.status).toBe(200);

    const json2 = (await res2.json()) as any;
    expect(json2.success).toBe(true);
    expect(json2.data.status).toBe('MAINTENANCE');
  });
});
