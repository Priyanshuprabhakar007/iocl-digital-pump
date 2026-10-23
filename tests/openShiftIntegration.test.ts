import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import { chunkArray, SNAPSHOT_INSERT_CHUNK_SIZE } from '../src/worker/repositories/pumpRepository';
import * as schema from '../src/db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';

const TEST_DB_PATH = './.sqlite/test_open_shift_integration.db';
const D1_MAX_BOUND_VARIABLES = 100;

describe('Production-Like Open Shift Integration & D1 Chunked Batch Suite', () => {
  let localD1: any;
  let env: any;

  beforeEach(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      try { fs.unlinkSync(TEST_DB_PATH); } catch (e) {}
    }
    const walPath = `${TEST_DB_PATH}-wal`;
    const shmPath = `${TEST_DB_PATH}-shm`;
    if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch (e) {} }
    if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch (e) {} }

    localD1 = createLocalD1Database(TEST_DB_PATH);
    const db = getDb(localD1);
    await seedDatabase(db);
    env = { DB: localD1, ENVIRONMENT: 'development' };
  });

  afterEach(() => {
    if (localD1) {
      try { localD1.close(); } catch (e) {}
    }
    if (fs.existsSync(TEST_DB_PATH)) {
      try { fs.unlinkSync(TEST_DB_PATH); } catch (e) {}
    }
    const walPath = `${TEST_DB_PATH}-wal`;
    const shmPath = `${TEST_DB_PATH}-shm`;
    if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch (e) {} }
    if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch (e) {} }
  });

  async function loginAs(email = 'admin@iocl.in', password = 'Password@123') {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email, password }),
      }),
      env
    );
    const cookie = res.headers.get('set-cookie') || '';
    const json: any = await res.json();
    return { cookie, user: json.data?.user || json.data };
  }

  async function setupCustomOutletTopology(
    db: ReturnType<typeof getDb>,
    userId: string,
    config: {
      outletId: string;
      roCode: string;
      productCount: number;
      tankCount: number;
      nozzleCount: number;
    }
  ) {
    const now = new Date().toISOString();
    const [existingOutlet] = await db.select().from(schema.retailOutlets).limit(1);

    await db.insert(schema.retailOutlets).values({
      ...existingOutlet,
      id: config.outletId,
      roCode: config.roCode,
      name: `Test Outlet ${config.roCode}`,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });

    const baseProducts = [
      { id: `prod-${config.roCode}-ms`, code: `MS_${config.roCode}`, name: 'Motor Spirit', category: 'PETROL', unit: 'LITRE' as const },
      { id: `prod-${config.roCode}-hsd`, code: `HSD_${config.roCode}`, name: 'High Speed Diesel', category: 'DIESEL', unit: 'LITRE' as const },
      { id: `prod-${config.roCode}-xp95`, code: `XP95_${config.roCode}`, name: 'XtraPremium 95', category: 'PETROL', unit: 'LITRE' as const },
      { id: `prod-${config.roCode}-xg`, code: `XG_${config.roCode}`, name: 'XtraGreen', category: 'DIESEL', unit: 'LITRE' as const },
      { id: `prod-${config.roCode}-xp100`, code: `XP100_${config.roCode}`, name: 'XtraPremium 100', category: 'PETROL', unit: 'LITRE' as const },
    ].slice(0, config.productCount);

    for (const p of baseProducts) {
      await db.insert(schema.products).values({
        id: p.id,
        code: p.code,
        name: p.name,
        category: p.category,
        unit: p.unit,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(schema.outletProducts).values({
        id: `op-${config.roCode}-${p.id}`,
        outletId: config.outletId,
        productId: p.id,
        status: 'ACTIVE',
        createdAt: now,
        createdBy: userId,
      });

      await db.insert(schema.outletProductPrices).values({
        id: `pri-${config.roCode}-${p.id}`,
        outletId: config.outletId,
        productId: p.id,
        pricePaisePerUnit: 9650,
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        status: 'ACTIVE',
        createdAt: now,
        createdBy: userId,
      });
    }

    const tankIds: { id: string; productId: string }[] = [];
    for (let t = 1; t <= config.tankCount; t++) {
      const prod = baseProducts[(t - 1) % baseProducts.length];
      const tankId = `tank-${config.roCode}-${t}`;
      await db.insert(schema.tanks).values({
        id: tankId,
        outletId: config.outletId,
        productId: prod.id,
        tankNumber: t,
        name: `Tank ${t} (${prod.code})`,
        capacityLitres: 20000,
        safeFillCapacityLitres: 19000,
        minimumOperatingLevelLitres: 500,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
      });
      tankIds.push({ id: tankId, productId: prod.id });
    }

    const dispenserCount = Math.ceil(config.nozzleCount / 4);
    const dispenserIds: string[] = [];
    for (let d = 1; d <= dispenserCount; d++) {
      const dispId = `disp-${config.roCode}-${d}`;
      await db.insert(schema.dispensers).values({
        id: dispId,
        outletId: config.outletId,
        dispenserNumber: d,
        name: `Dispenser ${d}`,
        manufacturer: 'Gilbarco',
        model: 'Encore',
        serialNumber: `SN-${config.roCode}-${d}`,
        nozzleCapacity: 6,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
      });
      dispenserIds.push(dispId);
    }

    for (let n = 1; n <= config.nozzleCount; n++) {
      const dispId = dispenserIds[Math.floor((n - 1) / 4)];
      const tank = tankIds[(n - 1) % tankIds.length];
      const nozzleNumInDisp = ((n - 1) % 4) + 1;
      await db.insert(schema.nozzles).values({
        id: `noz-${config.roCode}-${n}`,
        outletId: config.outletId,
        dispenserId: dispId,
        tankId: tank.id,
        productId: tank.productId,
        nozzleNumber: nozzleNumInDisp,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
      });
    }
  }

  it('1. chunkArray splits arrays into conservative chunks of size 5 and handles empty arrays safely', () => {
    expect(SNAPSHOT_INSERT_CHUNK_SIZE).toBe(5);
    expect(chunkArray([], SNAPSHOT_INSERT_CHUNK_SIZE)).toEqual([]);
    const sixteen = Array.from({ length: 16 }, (_, i) => i + 1);
    const chunks = chunkArray(sixteen, SNAPSHOT_INSERT_CHUNK_SIZE);
    expect(chunks.length).toBe(4);
    expect(chunks.map(c => c.length)).toEqual([5, 5, 5, 1]);
  });

  it('2. realistic production outlet (16 nozzles, 5 tanks, 4 products) opens shift within D1 variable limits and prevents duplicates on retry', async () => {
    const { cookie, user } = await loginAs();
    const db = getDb(localD1);
    const outletId = 'ro-prod-16-5-4';

    await setupCustomOutletTopology(db, user.id, {
      outletId,
      roCode: 'P1654',
      productCount: 4,
      tankCount: 5,
      nozzleCount: 16,
    });

    // Enforce Cloudflare D1 strict 100-variable limit per statement in batch()
    const originalBatch = localD1.batch.bind(localD1);
    let batchCalls = 0;
    let capturedStatementCount = 0;
    let maxVariablesInAnyStatement = 0;

    localD1.batch = async (statements: any[]) => {
      batchCalls++;
      capturedStatementCount = statements.length;
      for (const stmt of statements) {
        const paramCount = Array.isArray(stmt.params) ? stmt.params.length : 0;
        if (paramCount > maxVariablesInAnyStatement) {
          maxVariablesInAnyStatement = paramCount;
        }
        if (paramCount > D1_MAX_BOUND_VARIABLES) {
          throw new Error(`D1_ERROR: too many SQL variables at offset ${paramCount}: SQLITE_ERROR`);
        }
      }
      return originalBatch(statements);
    };

    const [template] = await db.select().from(schema.globalShiftTemplates).where(eq(schema.globalShiftTemplates.status, 'ACTIVE')).limit(1);
    const businessDate = '2026-10-23';

    const openRes = await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${outletId}/shifts/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: template.id,
          businessDate,
          notes: 'Realistic 16/5/4 topology shift open',
        }),
      }),
      env
    );

    const openJson = await openRes.json() as any;
    expect(openRes.status).toBe(201);
    expect(openJson.success).toBe(true);
    const shiftId = openJson.data.id;

    // Verify atomic single batch call and exact statement count:
    // 1 shift + 4 nozzle chunks (5,5,5,1) + 1 price chunk (4) + 1 tank chunk (5) = 7 statements
    expect(batchCalls).toBe(1);
    expect(capturedStatementCount).toBe(7);
    expect(maxVariablesInAnyStatement).toBeLessThanOrEqual(D1_MAX_BOUND_VARIABLES);

    // Verify exact snapshot counts in DB
    const shifts = await db.select().from(schema.operationalShifts).where(eq(schema.operationalShifts.outletId, outletId));
    const nozzleSnapshots = await db.select().from(schema.operationalShiftNozzles).where(eq(schema.operationalShiftNozzles.operationalShiftId, shiftId));
    const tankSnapshots = await db.select().from(schema.operationalShiftTanks).where(eq(schema.operationalShiftTanks.operationalShiftId, shiftId));
    const priceSnapshots = await db.select().from(schema.operationalShiftProductPrices).where(eq(schema.operationalShiftProductPrices.operationalShiftId, shiftId));

    expect(shifts.length).toBe(1);
    expect(nozzleSnapshots.length).toBe(16);
    expect(tankSnapshots.length).toBe(5);
    expect(priceSnapshots.length).toBe(4);

    // Verify retry does not duplicate anything
    const retryRes = await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${outletId}/shifts/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: template.id,
          businessDate,
          notes: 'Retry shift open',
        }),
      }),
      env
    );
    expect(retryRes.status).toBe(409);

    const shiftsAfterRetry = await db.select().from(schema.operationalShifts).where(eq(schema.operationalShifts.outletId, outletId));
    const nozzlesAfterRetry = await db.select().from(schema.operationalShiftNozzles).where(eq(schema.operationalShiftNozzles.operationalShiftId, shiftId));
    expect(shiftsAfterRetry.length).toBe(1);
    expect(nozzlesAfterRetry.length).toBe(16);
  });

  it('3. large topology outlet (40 nozzles, 10 tanks, 5 products) succeeds using chunked atomic batch inserts', async () => {
    const { cookie, user } = await loginAs();
    const db = getDb(localD1);
    const outletId = 'ro-large-40-10-5';

    await setupCustomOutletTopology(db, user.id, {
      outletId,
      roCode: 'L40105',
      productCount: 5,
      tankCount: 10,
      nozzleCount: 40,
    });

    const originalBatch = localD1.batch.bind(localD1);
    let batchCalls = 0;
    let capturedStatementCount = 0;

    localD1.batch = async (statements: any[]) => {
      batchCalls++;
      capturedStatementCount = statements.length;
      for (const stmt of statements) {
        const paramCount = Array.isArray(stmt.params) ? stmt.params.length : 0;
        if (paramCount > D1_MAX_BOUND_VARIABLES) {
          throw new Error(`D1_ERROR: too many SQL variables at offset ${paramCount}: SQLITE_ERROR`);
        }
      }
      return originalBatch(statements);
    };

    const [template] = await db.select().from(schema.globalShiftTemplates).where(eq(schema.globalShiftTemplates.status, 'ACTIVE')).limit(1);

    const openRes = await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${outletId}/shifts/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: template.id,
          businessDate: '2026-10-24',
          notes: 'Large 40/10/5 topology shift open',
        }),
      }),
      env
    );

    const openJson = await openRes.json() as any;
    expect(openRes.status).toBe(201);
    expect(openJson.success).toBe(true);
    const shiftId = openJson.data.id;

    // 1 shift + 8 nozzle chunks + 1 price chunk + 2 tank chunks = 12 statements
    expect(batchCalls).toBe(1);
    expect(capturedStatementCount).toBe(12);

    const nozzleSnapshots = await db.select().from(schema.operationalShiftNozzles).where(eq(schema.operationalShiftNozzles.operationalShiftId, shiftId));
    const tankSnapshots = await db.select().from(schema.operationalShiftTanks).where(eq(schema.operationalShiftTanks.operationalShiftId, shiftId));
    const priceSnapshots = await db.select().from(schema.operationalShiftProductPrices).where(eq(schema.operationalShiftProductPrices.operationalShiftId, shiftId));

    expect(nozzleSnapshots.length).toBe(40);
    expect(tankSnapshots.length).toBe(10);
    expect(priceSnapshots.length).toBe(5);
  });

  it('4. preserves full transactional atomicity if any chunked statement in D1 batch fails', async () => {
    const { cookie, user } = await loginAs();
    const db = getDb(localD1);
    const outletId = 'ro-atomic-rollback';

    await setupCustomOutletTopology(db, user.id, {
      outletId,
      roCode: 'ATMC1',
      productCount: 4,
      tankCount: 5,
      nozzleCount: 16,
    });

    // Inject a broken statement at the end of the batch to verify full rollback
    const originalBatch = localD1.batch.bind(localD1);
    localD1.batch = async (statements: any[]) => {
      const failingStmt = localD1.prepare('INSERT INTO non_existent_table VALUES (1)');
      return originalBatch([...statements, failingStmt]);
    };

    const [template] = await db.select().from(schema.globalShiftTemplates).where(eq(schema.globalShiftTemplates.status, 'ACTIVE')).limit(1);

    const openRes = await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${outletId}/shifts/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: template.id,
          businessDate: '2026-10-25',
        }),
      }),
      env
    );

    expect(openRes.status).toBe(500);

    // Verify 0 rows were persisted for this outlet
    const shifts = await db.select().from(schema.operationalShifts).where(eq(schema.operationalShifts.outletId, outletId));
    const nozzles = await db.select().from(schema.operationalShiftNozzles).where(eq(schema.operationalShiftNozzles.outletId, outletId));
    const tanks = await db.select().from(schema.operationalShiftTanks).where(eq(schema.operationalShiftTanks.outletId, outletId));
    const prices = await db.select().from(schema.operationalShiftProductPrices).where(eq(schema.operationalShiftProductPrices.outletId, outletId));

    expect(shifts.length).toBe(0);
    expect(nozzles.length).toBe(0);
    expect(tanks.length).toBe(0);
    expect(prices.length).toBe(0);
  });
});
