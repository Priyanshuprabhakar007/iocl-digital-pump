import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import * as schema from '../src/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import fs from 'fs';
import { calculateRevenuePaise, parseMoneyToPaise } from '../src/shared/financialUtils';
import { PumpRepository } from '../src/worker/repositories/pumpRepository';

const TEST_DB_PATH = './.sqlite/test_cng_fin_integration.db';
const MIGRATION_DB_PATH = './.sqlite/test_migration_0013.db';

class MockR2Bucket {
  private store = new Map<string, { data: Uint8Array; metadata: Record<string, string> }>();
  async get(key: string) {
    const item = this.store.get(key);
    if (!item) return null;
    return {
      body: item.data,
      arrayBuffer: async () => item.data.buffer,
      customMetadata: item.metadata,
    };
  }
  async put(key: string, value: ArrayBuffer | Uint8Array, options?: any) {
    const data = value instanceof Uint8Array ? value : new Uint8Array(value);
    this.store.set(key, { data, metadata: options?.customMetadata || {} });
    return { key, size: data.byteLength };
  }
  async delete(key: string) {
    this.store.delete(key);
  }
}

describe('Phase 3A-2 CNG Financial Integration & Migration Suite', () => {
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

    env = {
      DB: localD1,
      DOCUMENTS_BUCKET: new MockR2Bucket(),
      SESSION_SECRET: 'test-session-secret-key-12345678901234567890',
      ENVIRONMENT: 'development',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    };
  });

  afterEach(async () => {
    if (localD1) {
      localD1.close();
    }
    if (fs.existsSync(TEST_DB_PATH)) {
      try { fs.unlinkSync(TEST_DB_PATH); } catch (e) {}
    }
    if (fs.existsSync(MIGRATION_DB_PATH)) {
      try { fs.unlinkSync(MIGRATION_DB_PATH); } catch (e) {}
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
    return { cookie, user: json.data?.user };
  }

  it('1 & 2. Migration 0013 uses dedicated pre-0013 fixture and backfills product_category', async () => {
    if (fs.existsSync(MIGRATION_DB_PATH)) {
      try { fs.unlinkSync(MIGRATION_DB_PATH); } catch (e) {}
    }
    const walPath = `${MIGRATION_DB_PATH}-wal`;
    const shmPath = `${MIGRATION_DB_PATH}-shm`;
    if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch (e) {} }
    if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch (e) {} }

    // A. create isolated DB through 0012 only
    const migDbConn = createLocalD1Database(MIGRATION_DB_PATH, {
      throughMigration: '0012_phase3a_cng_operations.sql',
    });

    // B. verify via: PRAGMA table_info(operational_shift_product_prices) that product_category DOES NOT exist
    const columnsBeforeResult = await migDbConn.prepare('PRAGMA table_info(operational_shift_product_prices)').all<{ name: string }>();
    const columnNamesBefore = columnsBeforeResult.results.map((c) => c.name);
    expect(columnNamesBefore).not.toContain('product_category');

    // C. insert all minimum FK-dependent fixture data needed for a legacy operational_shift_product_prices row
    await migDbConn.exec(`
      INSERT INTO states (id, code, name, status, created_at, updated_at)
      VALUES ('state-mig-test', 'ST-MIG', 'State Mig', 'ACTIVE', datetime('now'), datetime('now'));

      INSERT INTO divisions (id, state_id, code, name, status, created_at, updated_at)
      VALUES ('div-mig-test', 'state-mig-test', 'DIV-MIG', 'Division Mig', 'ACTIVE', datetime('now'), datetime('now'));

      INSERT INTO sales_areas (id, division_id, code, name, status, created_at, updated_at)
      VALUES ('sa-mig-test', 'div-mig-test', 'SA-MIG', 'Sales Area Mig', 'ACTIVE', datetime('now'), datetime('now'));

      INSERT INTO retail_outlets (id, ro_code, name, outlet_type, state_id, division_id, sales_area_id, address, city, district, pincode, status, created_at, updated_at)
      VALUES ('ro-mig-test', 'RO-MIG', 'Outlet Mig', 'COCO', 'state-mig-test', 'div-mig-test', 'sa-mig-test', '1 Main St', 'Kolkata', 'Kolkata', '700001', 'ACTIVE', datetime('now'), datetime('now'));

      INSERT INTO users (id, emp_code, name, email, phone, password_hash, status, created_at, updated_at)
      VALUES ('user-mig-test', 'EMP-MIG', 'User Mig', 'usermig@iocl.in', '9800000000', 'hash', 'ACTIVE', datetime('now'), datetime('now'));

      INSERT INTO products (id, code, name, category, unit, status, created_at, updated_at)
      VALUES ('prod-mig-test', 'MS', 'Motor Spirit', 'FUEL', 'LITRE', 'ACTIVE', datetime('now'), datetime('now'));

      INSERT INTO shift_templates (id, outlet_id, code, name, start_time, end_time, sequence, status, created_at, updated_at, created_by)
      VALUES ('st-mig-test', 'ro-mig-test', 'ST-1', 'Shift 1', '06:00', '14:00', 1, 'ACTIVE', datetime('now'), datetime('now'), 'user-mig-test');

      INSERT INTO operational_shifts (id, outlet_id, shift_template_id, business_date, started_at, status, opened_by_user_id, created_at, updated_at)
      VALUES ('shift-mig-test', 'ro-mig-test', 'st-mig-test', '2026-11-20', datetime('now'), 'OPEN', 'user-mig-test', datetime('now'), datetime('now'));

      INSERT INTO outlet_product_prices (id, outlet_id, product_id, price_paise_per_unit, effective_from, status, created_at, created_by)
      VALUES ('opp-mig-test', 'ro-mig-test', 'prod-mig-test', 9500, '2026-11-20', 'ACTIVE', datetime('now'), 'user-mig-test');

      INSERT INTO operational_shift_product_prices (
        id,
        operational_shift_id,
        outlet_id,
        product_id,
        product_code,
        product_name,
        unit,
        price_paise_per_unit,
        source_price_id,
        created_at
      ) VALUES (
        'ospp-legacy-1',
        'shift-mig-test',
        'ro-mig-test',
        'prod-mig-test',
        'MS',
        'Motor Spirit',
        'LITRE',
        9500,
        'opp-mig-test',
        datetime('now')
      );
    `);

    // D. verify legacy snapshot row exists
    const legacyRow = await migDbConn.prepare('SELECT * FROM operational_shift_product_prices WHERE id = ?').bind('ospp-legacy-1').first<any>();
    expect(legacyRow).toBeDefined();
    expect(legacyRow?.id).toBe('ospp-legacy-1');
    expect(legacyRow?.product_category).toBeUndefined();

    // E. execute migrations/0013_cng_financial_integration.sql exactly ONCE
    const migrationSql = fs.readFileSync('./migrations/0013_cng_financial_integration.sql', 'utf8');
    await migDbConn.exec(migrationSql);

    // F. verify:
    // product_category now exists
    const columnsAfterResult = await migDbConn.prepare('PRAGMA table_info(operational_shift_product_prices)').all<{ name: string }>();
    const columnNamesAfter = columnsAfterResult.results.map((c) => c.name);
    expect(columnNamesAfter).toContain('product_category');

    // legacy snapshot still exists
    const migratedRow = await migDbConn
      .prepare(`
        SELECT
          id,
          product_id,
          price_paise_per_unit,
          source_price_id,
          product_category
        FROM operational_shift_product_prices
        WHERE id = ?
      `)
      .bind('ospp-legacy-1')
      .first<any>();
    expect(migratedRow).toBeDefined();
    expect(migratedRow?.id).toBe('ospp-legacy-1');

    // product_category equals the referenced product.category
    expect(migratedRow?.product_category).toBe('FUEL');

    // price_paise_per_unit unchanged
    expect(migratedRow?.price_paise_per_unit).toBe(9500);

    // source_price_id unchanged
    expect(migratedRow?.source_price_id).toBe('opp-mig-test');

    // product_id unchanged
    expect(migratedRow?.product_id).toBe('prod-mig-test');

    migDbConn.close();
    if (fs.existsSync(MIGRATION_DB_PATH)) {
      try { fs.unlinkSync(MIGRATION_DB_PATH); } catch (e) {}
    }
  });

  it('Migration cutoff throws LOCAL_D1_MIGRATION_CUTOFF_NOT_FOUND when cutoff file does not exist', () => {
    const invalidDbPath = './.sqlite/test_invalid_cutoff.db';
    expect(() => {
      createLocalD1Database(invalidDbPath, {
        throughMigration: '9999_non_existent_migration.sql',
      });
    }).toThrow('LOCAL_D1_MIGRATION_CUTOFF_NOT_FOUND');
    if (fs.existsSync(invalidDbPath)) {
      try { fs.unlinkSync(invalidDbPath); } catch (e) {}
    }
  });

  it('3 & 4. CNG/KG product price CREATE and UPDATE succeed (isolated from seeded data)', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);

    // Delete seeded CNG price for ro-1001 / prod-cng
    await db.delete(schema.outletProductPrices).where(and(eq(schema.outletProductPrices.outletId, 'ro-1001'), eq(schema.outletProductPrices.productId, 'prod-cng')));

    // Ensure outlet_products mapping for prod-cng
    await db.delete(schema.outletProducts).where(and(eq(schema.outletProducts.outletId, 'ro-1001'), eq(schema.outletProducts.productId, 'prod-cng')));
    await db.insert(schema.outletProducts).values({
      id: `op-cng-ro1-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      outletId: 'ro-1001',
      productId: 'prod-cng',
      status: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: new Date().toISOString(),
    });

    const res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );
    expect(res.status).toBe(201);
    const json: any = await res.json();
    const priceId = json.data.id;

    // Update
    const updateRes = await app.fetch(
      new Request(`http://localhost/api/v1/product-prices/${priceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '88.00', effectiveFrom: '2026-11-01' }),
      }),
      env
    );
    expect(updateRes.status).toBe(200);
  });

  it('5. non-CNG KG price rejected', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.insert(schema.products).values({
      id: 'prod-lube-kg', code: 'LUBE_KG', name: 'Lube KG', category: 'LUBE', unit: 'KG', status: 'ACTIVE', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-lube', outletId: 'ro-1001', productId: 'prod-lube-kg', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });

    const res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-lube-kg', pricePaisePerUnit: '500.00', effectiveFrom: '2026-11-01' }),
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it('6. CNG/LITRE invalid as CNG configuration', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.insert(schema.products).values({
      id: 'prod-cng-l', code: 'CNG_L', name: 'CNG Litre', category: 'CNG', unit: 'LITRE', status: 'ACTIVE', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng-l', outletId: 'ro-1001', productId: 'prod-cng-l', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });

    const res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng-l', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it('7, 8, 9, 10, 11, 12, 13. Shift open with CNG captures historical price snapshot with correct category and unit', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.delete(schema.outletProductPrices).where(and(eq(schema.outletProductPrices.outletId, 'ro-1001'), eq(schema.outletProductPrices.productId, 'prod-cng')));
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });
    
    const pricePostRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );
    expect(pricePostRes.status).toBe(201);
    const priceJson: any = await pricePostRes.json();
    const createdPriceId = priceJson.data.id;

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    expect(openRes.status).toBe(201);
    const shiftId = (await openRes.json() as any).data.id;

    const snapshots = await db.select().from(schema.operationalShiftProductPrices).where(eq(schema.operationalShiftProductPrices.operationalShiftId, shiftId));
    const cngSnap = snapshots.find(s => s.productId === 'prod-cng');
    expect(cngSnap).toBeDefined();
    expect(cngSnap?.productCategory).toBe('CNG');
    expect(cngSnap?.unit).toBe('KG');
    expect(cngSnap?.pricePaisePerUnit).toBe(8550);
    expect(cngSnap?.sourcePriceId).toBe(createdPriceId);
  });

  it('14, 15, 16. CNG mapping without price blocks open with no partial rows; >1 active CNG mapping returns AMBIGUOUS_CNG_PRODUCT_CONFIGURATION', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.delete(schema.outletProductPrices).where(and(eq(schema.outletProductPrices.outletId, 'ro-1001'), eq(schema.outletProductPrices.productId, 'prod-cng')));
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });

    // 1. Missing price blocks open
    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    expect(openRes.status).toBe(409);
    const shiftsCount = await db.select().from(schema.operationalShifts);
    expect(shiftsCount.length).toBe(0);

    // 2. >1 active CNG mappings -> AMBIGUOUS_CNG_PRODUCT_CONFIGURATION
    await db.insert(schema.products).values({
      id: 'prod-cng-2', code: 'CNG2', name: 'CNG 2', category: 'CNG', unit: 'KG', status: 'ACTIVE', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng2', outletId: 'ro-1001', productId: 'prod-cng-2', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });

    const openRes2 = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    expect(openRes2.status).toBe(409);
    const json: any = await openRes2.json();
    expect(json.error.code).toBe('AMBIGUOUS_CNG_PRODUCT_CONFIGURATION');
  });

  it('21, 22, 23, 24. revenue helper validation and overflow guards', async () => {
    expect(() => calculateRevenuePaise(1000, 100)).not.toThrow();
    expect(() => calculateRevenuePaise(-10, 100)).toThrow('INVALID_INPUT_VALUES');
    expect(() => calculateRevenuePaise(10.5, 100)).toThrow('INVALID_INPUT_VALUES');
    expect(() => calculateRevenuePaise(Number.MAX_SAFE_INTEGER + 1, 100)).toThrow('INVALID_INPUT_VALUES');
    expect(() => calculateRevenuePaise(Number.MAX_SAFE_INTEGER, 1000000000)).toThrow('FINANCIAL_AMOUNT_OVERFLOW');
  });

  it('25, 26, 27, 28, 29. calculateShiftCngRevenue states A, B, C, D, E', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.delete(schema.outletProductPrices).where(and(eq(schema.outletProductPrices.outletId, 'ro-1001'), eq(schema.outletProductPrices.productId, 'prod-cng')));
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });
    const priceRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );
    expect(priceRes.status).toBe(201);

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    expect(openRes.status).toBe(201);
    const shiftId = (await openRes.json() as any).data.id;

    // State C: Snapshot + no log -> cngApplicable=true, cngComplete=false
    const sumRes1 = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/financial-summary`, {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(sumRes1.status).toBe(200);
    const json1: any = await sumRes1.json();
    expect(json1.data.salesRevenue.cngApplicable).toBe(true);
    expect(json1.data.salesRevenue.cngComplete).toBe(false);

    // Add log -> State B
    const logRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '0.000', mfmClosingKg: '100.000' }),
      }),
      env
    );
    expect(logRes.status).toBe(200);

    const sumRes2 = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/financial-summary`, {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    const json2: any = await sumRes2.json();
    expect(json2.data.salesRevenue.cngApplicable).toBe(true);
    expect(json2.data.salesRevenue.cngComplete).toBe(true);
    expect(json2.data.salesRevenue.cngTotalPaise).toBe(855000); // 100.000 kg * 85.50 = 855000 paise
  });

  it('30, 31, 32. CNG log without snapshot throws CNG_PRICE_SNAPSHOT_UNAVAILABLE', async () => {
    const { cookie } = await loginAs();
    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    expect(openRes.status).toBe(201);
    const shiftId = (await openRes.json() as any).data.id;
    const db = getDb(localD1);

    // Create CNG log manually without snapshot
    await db.insert(schema.cngShiftLogs).values({
      id: 'cnglog-legacy',
      operationalShiftId: shiftId,
      outletId: 'ro-1001',
      mfmOpeningKgMilliunits: 0,
      mfmClosingKgMilliunits: 100000,
      netSalesKgMilliunits: 100000,
      recordedByUserId: 'user-admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const sumRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/financial-summary`, {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(sumRes.status).toBe(409);
    const json: any = await sumRes.json();
    expect(json.error.code).toBe('CNG_PRICE_SNAPSHOT_UNAVAILABLE');
  });

  it('53, 54, 55. Successful CNG shift closes CLOSED and audit contains cngRevenuePaise', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.delete(schema.outletProductPrices).where(and(eq(schema.outletProductPrices.outletId, 'ro-1001'), eq(schema.outletProductPrices.productId, 'prod-cng')));
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });
    const priceRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );
    expect(priceRes.status).toBe(201);

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    expect(openRes.status).toBe(201);
    const shiftId = (await openRes.json() as any).data.id;

    // Add CNG log
    const logRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '0.000', mfmClosingKg: '100.000' }),
      }),
      env
    );
    expect(logRes.status).toBe(200);

    // Setup tank & readings to allow close
    const pumpRepo = new PumpRepository(db);
    const nozzles = await pumpRepo.listShiftNozzleSnapshots(shiftId);
    for (const n of nozzles) {
      await pumpRepo.createReading({
        id: `mr-${n.nozzleId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', nozzleId: n.nozzleId, openingMilliunits: 1000, closingMilliunits: 1000, testingMilliunits: 0, grossMilliunits: 0, netMilliunits: 0, recordedByUserId: 'user-admin', hasOpeningVariance: false, openingVarianceMilliunits: 0, varianceReason: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }
    const tanks = await pumpRepo.listShiftTankSnapshots(shiftId);
    for (const t of tanks) {
      await pumpRepo.createTankReading({
        id: `tsr-open-${t.tankId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', tankId: t.tankId, productId: t.productId, readingType: 'OPENING', source: 'MANUAL', productDipMmMilliunits: 1000000, waterDipMmMilliunits: 0, grossObservedVolumeMilliunits: 8500000, waterVolumeMilliunits: 0, netProductVolumeMilliunits: 8500000, recordedAt: new Date().toISOString(), recordedByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
      await pumpRepo.createTankReading({
        id: `tsr-close-${t.tankId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', tankId: t.tankId, productId: t.productId, readingType: 'CLOSING', source: 'MANUAL', productDipMmMilliunits: 950000, waterDipMmMilliunits: 0, grossObservedVolumeMilliunits: 8400000, waterVolumeMilliunits: 0, netProductVolumeMilliunits: 8400000, recordedAt: new Date().toISOString(), recordedByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }

    // Close with variance reason to satisfy Phase 2C variance rule
    const closeRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ varianceReason: 'Integration test: collections intentionally omitted' }),
      }),
      env
    );
    expect(closeRes.status).toBe(200);

    const [audit] = await db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.action, 'FINANCIAL_RECONCILIATION'), eq(schema.auditLogs.entityId, shiftId)));
    expect(audit).toBeDefined();
    const newValue = JSON.parse(audit.newValueJson || '{}');
    expect(newValue.cngRevenuePaise).toBe(855000);
    expect(newValue.authoritativeSalesRevenuePaise).toBe(newValue.fuelRevenuePaise + 855000);
  });
});
