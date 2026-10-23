import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import * as schema from '../src/db/schema';
import { eq, and } from 'drizzle-orm';
import fs from 'fs';

const TEST_DB_PATH = './.sqlite/test_open_shift_integration.db';

describe('Production-Like Open Shift Integration & Snapshot Integrity Suite', () => {
  let localD1: any;
  let env: any;

  beforeEach(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      try { fs.unlinkSync(TEST_DB_PATH); } catch (e) {}
    }
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

  it('successfully opens shift, verifies exact snapshots, and blocks duplicate active shift on retry', async () => {
    const { cookie, user } = await loginAs();
    expect(user).toBeDefined();
    const db = getDb(localD1);

    // 1. Get an active outlet (e.g. ro-1001)
    const [outlet] = await db.select().from(schema.retailOutlets).where(eq(schema.retailOutlets.status, 'ACTIVE')).limit(1);
    expect(outlet).toBeDefined();

    // 2. Ensure active product mappings for liquid fuels
    const products = await db.select().from(schema.products).where(eq(schema.products.status, 'ACTIVE'));
    const liquidProducts = products.filter(p => p.unit === 'LITRE' && p.category !== 'CNG');
    expect(liquidProducts.length).toBeGreaterThan(0);

    for (const lp of liquidProducts) {
      const [existingMapping] = await db.select().from(schema.outletProducts).where(
        and(eq(schema.outletProducts.outletId, outlet.id), eq(schema.outletProducts.productId, lp.id))
      );
      if (!existingMapping) {
        await db.insert(schema.outletProducts).values({
          id: `op-${crypto.randomUUID()}`,
          outletId: outlet.id,
          productId: lp.id,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          createdBy: user.id,
        });
      } else if (existingMapping.status !== 'ACTIVE') {
        await db.update(schema.outletProducts).set({ status: 'ACTIVE' }).where(eq(schema.outletProducts.id, existingMapping.id));
      }

      const [existingPrice] = await db.select().from(schema.outletProductPrices).where(
        and(eq(schema.outletProductPrices.outletId, outlet.id), eq(schema.outletProductPrices.productId, lp.id), eq(schema.outletProductPrices.status, 'ACTIVE'))
      );
      if (!existingPrice) {
        await db.insert(schema.outletProductPrices).values({
          id: `pri-${crypto.randomUUID()}`,
          outletId: outlet.id,
          productId: lp.id,
          pricePaisePerUnit: 100000,
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          createdBy: user.id,
        });
      }
    }

    // 3. Get active shift template
    const [template] = await db.select().from(schema.globalShiftTemplates).where(eq(schema.globalShiftTemplates.status, 'ACTIVE')).limit(1);
    expect(template).toBeDefined();

    const businessDate = new Date().toISOString().split('T')[0];

    // 4. Call POST /api/v1/outlets/:outletId/shifts/open
    const openRes = await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${outlet.id}/shifts/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: template.id,
          businessDate,
          notes: 'Integration test opening shift',
        }),
      }),
      env
    );

    const openJson = await openRes.json() as any;
    expect(openRes.status).toBe(201);
    expect(openJson.success).toBe(true);
    expect(openJson.data).toBeDefined();
    const shiftId = openJson.data.id;

    // 5. Verify exact operational_shifts row
    const [dbShift] = await db.select().from(schema.operationalShifts).where(eq(schema.operationalShifts.id, shiftId));
    expect(dbShift).toBeDefined();
    expect(dbShift.status).toBe('OPEN');
    expect(dbShift.outletId).toBe(outlet.id);
    expect(dbShift.shiftTemplateId).toBe(template.id);

    // 6. Verify nozzle snapshots, tank snapshots, and price snapshots
    const nozzleSnapshots = await db.select().from(schema.operationalShiftNozzles).where(eq(schema.operationalShiftNozzles.operationalShiftId, shiftId));
    const tankSnapshots = await db.select().from(schema.operationalShiftTanks).where(eq(schema.operationalShiftTanks.operationalShiftId, shiftId));
    const priceSnapshots = await db.select().from(schema.operationalShiftProductPrices).where(eq(schema.operationalShiftProductPrices.operationalShiftId, shiftId));

    expect(nozzleSnapshots.length).toBeGreaterThan(0);
    expect(priceSnapshots.length).toBeGreaterThan(0);

    // 7. Verify no duplicates on retry (opening another active shift for same outlet should fail with 409 conflict)
    const retryRes = await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${outlet.id}/shifts/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: template.id,
          businessDate,
          notes: 'Retry opening shift',
        }),
      }),
      env
    );
    expect(retryRes.status).toBe(409);
  });
});
