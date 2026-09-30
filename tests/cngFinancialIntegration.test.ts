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

  it('CNG Revenue State A: NO CNG price snapshot and NO CNG log', async () => {
    const { cookie } = await loginAs();
    // ro-1001 with default seed has no CNG price active
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

    const sumRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/financial-summary`, {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(sumRes.status).toBe(200);
    const json: any = await sumRes.json();
    const salesRev = json.data.salesRevenue;

    expect(salesRev.cngApplicable).toBe(false);
    expect(salesRev.cngComplete).toBe(true);
    expect(salesRev.cngTotalPaise).toBeNull();
    expect(salesRev.cngTotalStr).toBeNull();
    expect(salesRev.cngProduct).toBeNull();
    expect(salesRev.lubeTotalPaise).toBe(0);
    expect(salesRev.lubeTotalStr).toBe("0.00");
    expect(salesRev.includedComponents).toContain('FUEL');
    expect(salesRev.includedComponents).toContain('LUBE');
    expect(salesRev.pendingComponents).not.toContain('LUBE');
    expect(salesRev.pendingComponents).not.toContain('CNG');
  });

  it('CNG Snapshot without log (State C): cngApplicable=true, cngComplete=false, pending components has CNG and LUBE', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.delete(schema.outletProductPrices).where(and(eq(schema.outletProductPrices.outletId, 'ro-1001'), eq(schema.outletProductPrices.productId, 'prod-cng')));
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng-snap', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
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

    // No cng_shift_log exists
    const sumRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/financial-summary`, {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(sumRes.status).toBe(200);
    const json: any = await sumRes.json();
    const salesRev = json.data.salesRevenue;

    expect(salesRev.cngApplicable).toBe(true);
    expect(salesRev.cngComplete).toBe(false);
    expect(salesRev.cngTotalPaise).toBeNull();
    expect(salesRev.cngProduct).toBeNull();
    expect(salesRev.includedComponents).toEqual(['FUEL', 'LUBE']);
    expect(salesRev.pendingComponents).toContain('CNG');
    expect(salesRev.pendingComponents).not.toContain('LUBE');
  });

  it('Multiple historical CNG snapshots returns controlled 409 CNG_PRICE_SNAPSHOT_AMBIGUOUS', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);

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

    // Insert second CNG product
    await db.insert(schema.products).values({
      id: 'prod-cng-ambig-2', code: 'CNG_AMB', name: 'CNG Ambig', category: 'CNG', unit: 'KG', status: 'ACTIVE', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    await db.insert(schema.outletProductPrices).values([
      { id: 'opp-amb-1', outletId: 'ro-1001', productId: 'prod-cng', pricePaisePerUnit: 8550, effectiveFrom: '2026-11-01', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin' },
      { id: 'opp-amb-2', outletId: 'ro-1001', productId: 'prod-cng-ambig-2', pricePaisePerUnit: 8600, effectiveFrom: '2026-11-01', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin' },
    ]);

    // Insert two valid historical CNG/KG snapshots into the shift
    await db.insert(schema.operationalShiftProductPrices).values([
      { id: 'ospp-amb-1', operationalShiftId: shiftId, outletId: 'ro-1001', productId: 'prod-cng', productCode: 'CNG', productName: 'CNG Gas', unit: 'KG', productCategory: 'CNG', pricePaisePerUnit: 8550, sourcePriceId: 'opp-amb-1', createdAt: new Date().toISOString() },
      { id: 'ospp-amb-2', operationalShiftId: shiftId, outletId: 'ro-1001', productId: 'prod-cng-ambig-2', productCode: 'CNG_AMB', productName: 'CNG Ambig', unit: 'KG', productCategory: 'CNG', pricePaisePerUnit: 8600, sourcePriceId: 'opp-amb-2', createdAt: new Date().toISOString() },
    ]);

    const sumRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/financial-summary`, {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(sumRes.status).toBe(409);
    const json: any = await sumRes.json();
    expect(json.error.code).toBe('CNG_PRICE_SNAPSHOT_AMBIGUOUS');
  });

  it('Malformed CNG/LITRE snapshot is not accepted and with CNG log returns CNG_PRICE_SNAPSHOT_UNAVAILABLE', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);

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

    // Insert fake price and malformed snapshot (CNG + LITRE)
    await db.insert(schema.outletProductPrices).values({
      id: 'opp-cng-litre-bad', outletId: 'ro-1001', productId: 'prod-cng', pricePaisePerUnit: 8550, effectiveFrom: '2026-11-01', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });
    await db.insert(schema.operationalShiftProductPrices).values({
      id: 'ospp-malformed-litre', operationalShiftId: shiftId, outletId: 'ro-1001', productId: 'prod-cng', productCode: 'CNG', productName: 'CNG Litre', unit: 'LITRE', productCategory: 'CNG', pricePaisePerUnit: 8550, sourcePriceId: 'opp-cng-litre-bad', createdAt: new Date().toISOString()
    });

    // Insert CNG log
    await db.insert(schema.cngShiftLogs).values({
      id: 'cnglog-malformed',
      operationalShiftId: shiftId,
      outletId: 'ro-1001',
      mfmOpeningKgMilliunits: 0,
      mfmClosingKgMilliunits: 50000,
      netSalesKgMilliunits: 50000,
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

  it('Exact HALF-UP CNG rounding boundary (remainder 500 rounds up, remainder 499 does not)', () => {
    // We want (quantityMilliunits * pricePaisePerUnit) % 1000 === 500
    // Example: quantity = 1001, price = 500 => 1001 * 500 = 500500 => quotient = 500, remainder = 500 => rounds UP to 501
    const qty1 = 1001;
    const price1 = 500;
    expect((qty1 * price1) % 1000).toBe(500);
    expect(calculateRevenuePaise(qty1, price1)).toBe(501);

    // Remainder === 499:
    // Example: quantity = 1001, price = 499 => 1001 * 499 = 499499 => quotient = 499, remainder = 499 => rounds down (no round up) to 499
    const qty2 = 1001;
    const price2 = 499;
    expect((qty2 * price2) % 1000).toBe(499);
    expect(calculateRevenuePaise(qty2, price2)).toBe(499);
  });

  it('CNG historical price immutability: master price change after shift open does not alter shift revenue', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.delete(schema.outletProductPrices).where(and(eq(schema.outletProductPrices.outletId, 'ro-1001'), eq(schema.outletProductPrices.productId, 'prod-cng')));
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng-immut', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });

    // 1. Configure CNG price A (85.50 = 8550 paise)
    const priceRes1 = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );
    expect(priceRes1.status).toBe(201);
    const priceAId = (await priceRes1.json() as any).data.id;

    // 2. Open shift
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

    // 3. Verify snapshot is price A
    const [snap] = await db.select().from(schema.operationalShiftProductPrices).where(
      and(eq(schema.operationalShiftProductPrices.operationalShiftId, shiftId), eq(schema.operationalShiftProductPrices.productId, 'prod-cng'))
    );
    expect(snap.pricePaisePerUnit).toBe(8550);

    // 4. Update master CNG price to B (92.00)
    const updateRes = await app.fetch(
      new Request(`http://localhost/api/v1/product-prices/${priceAId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '92.00', effectiveFrom: '2026-11-01' }),
      }),
      env
    );
    expect(updateRes.status).toBe(200);

    // 5. Record CNG MFM sales: 100.000 kg
    const logRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '0.000', mfmClosingKg: '100.000' }),
      }),
      env
    );
    expect(logRes.status).toBe(200);

    // 6. Get financial summary: must still use price A (85.50 * 100 = 855000 paise)
    const sumRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/financial-summary`, {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(sumRes.status).toBe(200);
    const json: any = await sumRes.json();
    expect(json.data.salesRevenue.cngTotalPaise).toBe(855000);
    expect(json.data.salesRevenue.cngProduct.pricePaisePerUnit).toBe(8550);
  });

  it('Outlet product mapping deactivation after open does not affect financial summary calculation', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.delete(schema.outletProductPrices).where(and(eq(schema.outletProductPrices.outletId, 'ro-1001'), eq(schema.outletProductPrices.productId, 'prod-cng')));
    const mappingId = 'op-ro1-cng-deact';
    await db.insert(schema.outletProducts).values({
      id: mappingId, outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );

    // 1. Open shift
    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    const shiftId = (await openRes.json() as any).data.id;

    // 2. Record valid CNG log
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '0.000', mfmClosingKg: '50.000' }),
      }),
      env
    );

    // 3. Deactivate current outlet_products mapping
    await db.update(schema.outletProducts).set({ status: 'INACTIVE' }).where(eq(schema.outletProducts.id, mappingId));

    // 4. Financial summary continues to calculate from snapshot and existing log
    const sumRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/financial-summary`, {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(sumRes.status).toBe(200);
    const json: any = await sumRes.json();
    expect(json.data.salesRevenue.cngTotalPaise).toBe(427500); // 50 * 8550
  });

  it('Authoritative Fuel + CNG Total: fuel + cng = authoritativeTotalPaise with correct components', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.delete(schema.outletProductPrices).where(and(eq(schema.outletProductPrices.outletId, 'ro-1001'), eq(schema.outletProductPrices.productId, 'prod-cng')));
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng-auth-tot', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    const shiftId = (await openRes.json() as any).data.id;

    // Record fuel reading: 10.000 L of MS (price in ro-1001 snapshot: 95.20 = 9520 paise/L => 95200 paise)
    const pumpRepo = new PumpRepository(db);
    const nozzles = await pumpRepo.listShiftNozzleSnapshots(shiftId);
    const msNozzle = nozzles.find(n => n.productCode === 'MS')!;
    await pumpRepo.createReading({
      id: `mr-auth-${msNozzle.nozzleId}`,
      operationalShiftId: shiftId,
      outletId: 'ro-1001',
      nozzleId: msNozzle.nozzleId,
      openingMilliunits: 0,
      closingMilliunits: 10000,
      testingMilliunits: 0,
      grossMilliunits: 10000,
      netMilliunits: 10000,
      recordedByUserId: 'user-admin',
      hasOpeningVariance: false,
      openingVarianceMilliunits: 0,
      varianceReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Record CNG reading: 20.000 KG @ 85.50 => 171000 paise
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '0.000', mfmClosingKg: '20.000' }),
      }),
      env
    );

    const sumRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/financial-summary`, {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(sumRes.status).toBe(200);
    const json: any = await sumRes.json();
    const salesRev = json.data.salesRevenue;

    expect(salesRev.fuelTotalPaise).toBe(95200);
    expect(salesRev.cngTotalPaise).toBe(171000);
    expect(salesRev.authoritativeTotalPaise).toBe(266200);
    expect(salesRev.lubeTotalPaise).toBe(0);
    expect(salesRev.lubeTotalStr).toBe("0.00");
    expect(salesRev.includedComponents).toEqual(['FUEL', 'CNG', 'LUBE']);
    expect(salesRev.pendingComponents).toEqual([]);
  });

  it('Financial reconciliation DB persistence contains correct fuel, cng and authoritative total', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.delete(schema.outletProductPrices).where(and(eq(schema.outletProductPrices.outletId, 'ro-1001'), eq(schema.outletProductPrices.productId, 'prod-cng')));
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng-persist', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    const shiftId = (await openRes.json() as any).data.id;

    // Fuel readings: 0 net sales for all nozzles
    const pumpRepo = new PumpRepository(db);
    const nozzles = await pumpRepo.listShiftNozzleSnapshots(shiftId);
    for (const n of nozzles) {
      await pumpRepo.createReading({
        id: `mr-p-${n.nozzleId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', nozzleId: n.nozzleId, openingMilliunits: 1000, closingMilliunits: 1000, testingMilliunits: 0, grossMilliunits: 0, netMilliunits: 0, recordedByUserId: 'user-admin', hasOpeningVariance: false, openingVarianceMilliunits: 0, varianceReason: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }
    const tanks = await pumpRepo.listShiftTankSnapshots(shiftId);
    for (const t of tanks) {
      await pumpRepo.createTankReading({
        id: `tsr-open-p-${t.tankId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', tankId: t.tankId, productId: t.productId, readingType: 'OPENING', source: 'MANUAL', productDipMmMilliunits: 1000000, waterDipMmMilliunits: 0, grossObservedVolumeMilliunits: 8500000, waterVolumeMilliunits: 0, netProductVolumeMilliunits: 8500000, recordedAt: new Date().toISOString(), recordedByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
      await pumpRepo.createTankReading({
        id: `tsr-close-p-${t.tankId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', tankId: t.tankId, productId: t.productId, readingType: 'CLOSING', source: 'MANUAL', productDipMmMilliunits: 950000, waterDipMmMilliunits: 0, grossObservedVolumeMilliunits: 8400000, waterVolumeMilliunits: 0, netProductVolumeMilliunits: 8400000, recordedAt: new Date().toISOString(), recordedByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }

    // CNG reading: 10.000 KG @ 85.50 = 85500 paise
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '0.000', mfmClosingKg: '10.000' }),
      }),
      env
    );

    const closeRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ varianceReason: 'Test persistence' }),
      }),
      env
    );
    expect(closeRes.status).toBe(200);

    // Verify DB record directly
    const [reconcil] = await db.select().from(schema.shiftFinancialReconciliations).where(eq(schema.shiftFinancialReconciliations.operationalShiftId, shiftId));
    expect(reconcil).toBeDefined();
    expect(reconcil.fuelSalesRevenuePaise).toBe(0);
    expect(reconcil.cngSalesRevenuePaise).toBe(85500);
    expect(reconcil.lubeSalesRevenuePaise).toBeNull();
    expect(reconcil.authoritativeSalesRevenuePaise).toBe(85500);
  });

  it('Balanced Fuel + CNG reconciliation closes without varianceReason when collections match sales', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.delete(schema.outletProductPrices).where(and(eq(schema.outletProductPrices.outletId, 'ro-1001'), eq(schema.outletProductPrices.productId, 'prod-cng')));
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng-bal', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    const shiftId = (await openRes.json() as any).data.id;

    // Complete nozzle readings (0 fuel sales)
    const pumpRepo = new PumpRepository(db);
    const nozzles = await pumpRepo.listShiftNozzleSnapshots(shiftId);
    for (const n of nozzles) {
      await pumpRepo.createReading({
        id: `mr-bal-${n.nozzleId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', nozzleId: n.nozzleId, openingMilliunits: 1000, closingMilliunits: 1000, testingMilliunits: 0, grossMilliunits: 0, netMilliunits: 0, recordedByUserId: 'user-admin', hasOpeningVariance: false, openingVarianceMilliunits: 0, varianceReason: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }
    const tanks = await pumpRepo.listShiftTankSnapshots(shiftId);
    for (const t of tanks) {
      await pumpRepo.createTankReading({
        id: `tsr-open-b-${t.tankId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', tankId: t.tankId, productId: t.productId, readingType: 'OPENING', source: 'MANUAL', productDipMmMilliunits: 1000000, waterDipMmMilliunits: 0, grossObservedVolumeMilliunits: 8500000, waterVolumeMilliunits: 0, netProductVolumeMilliunits: 8500000, recordedAt: new Date().toISOString(), recordedByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
      await pumpRepo.createTankReading({
        id: `tsr-close-b-${t.tankId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', tankId: t.tankId, productId: t.productId, readingType: 'CLOSING', source: 'MANUAL', productDipMmMilliunits: 950000, waterDipMmMilliunits: 0, grossObservedVolumeMilliunits: 8400000, waterVolumeMilliunits: 0, netProductVolumeMilliunits: 8400000, recordedAt: new Date().toISOString(), recordedByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }

    // 10.000 KG @ 85.50 = 85500 paise (855.00 INR)
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '0.000', mfmClosingKg: '10.000' }),
      }),
      env
    );

    // Record exact matching collections: 855.00
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ collectionType: 'CASH', amount: '855.00', collectedAt: new Date().toISOString() }),
      }),
      env
    );

    // Close without varianceReason must succeed because variance is 0
    const closeRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({}),
      }),
      env
    );
    expect(closeRes.status).toBe(200);

    const [reconcil] = await db.select().from(schema.shiftFinancialReconciliations).where(eq(schema.shiftFinancialReconciliations.operationalShiftId, shiftId));
    expect(reconcil.salesCollectionVariancePaise).toBe(0);
    expect(reconcil.varianceStatus).toBe('BALANCED');
    expect(reconcil.varianceReason).toBeNull();
  });

  it('CNG SHORTAGE requires varianceReason to close, closing with reason succeeds', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.delete(schema.outletProductPrices).where(and(eq(schema.outletProductPrices.outletId, 'ro-1001'), eq(schema.outletProductPrices.productId, 'prod-cng')));
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng-short', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    const shiftId = (await openRes.json() as any).data.id;

    // Complete nozzle readings (0 fuel sales)
    const pumpRepo = new PumpRepository(db);
    const nozzles = await pumpRepo.listShiftNozzleSnapshots(shiftId);
    for (const n of nozzles) {
      await pumpRepo.createReading({
        id: `mr-sh-${n.nozzleId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', nozzleId: n.nozzleId, openingMilliunits: 1000, closingMilliunits: 1000, testingMilliunits: 0, grossMilliunits: 0, netMilliunits: 0, recordedByUserId: 'user-admin', hasOpeningVariance: false, openingVarianceMilliunits: 0, varianceReason: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }
    const tanks = await pumpRepo.listShiftTankSnapshots(shiftId);
    for (const t of tanks) {
      await pumpRepo.createTankReading({
        id: `tsr-open-sh-${t.tankId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', tankId: t.tankId, productId: t.productId, readingType: 'OPENING', source: 'MANUAL', productDipMmMilliunits: 1000000, waterDipMmMilliunits: 0, grossObservedVolumeMilliunits: 8500000, waterVolumeMilliunits: 0, netProductVolumeMilliunits: 8500000, recordedAt: new Date().toISOString(), recordedByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
      await pumpRepo.createTankReading({
        id: `tsr-close-sh-${t.tankId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', tankId: t.tankId, productId: t.productId, readingType: 'CLOSING', source: 'MANUAL', productDipMmMilliunits: 950000, waterDipMmMilliunits: 0, grossObservedVolumeMilliunits: 8400000, waterVolumeMilliunits: 0, netProductVolumeMilliunits: 8400000, recordedAt: new Date().toISOString(), recordedByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }

    // CNG 10.000 KG @ 85.50 = 85500 paise
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '0.000', mfmClosingKg: '10.000' }),
      }),
      env
    );

    // Collections: 500.00 (50000 paise) => Shortage = 35500 paise (> 0)
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ collectionType: 'CASH', amount: '500.00', collectedAt: new Date().toISOString() }),
      }),
      env
    );

    // Close without varianceReason must fail with 400 VARIANCE_REASON_REQUIRED
    const failClose = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({}),
      }),
      env
    );
    expect(failClose.status).toBe(400);
    const failJson: any = await failClose.json();
    expect(failJson.error.code).toBe('VARIANCE_REASON_REQUIRED');

    // Close with variance reason succeeds
    const successClose = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ varianceReason: 'Cash shortage investigated' }),
      }),
      env
    );
    expect(successClose.status).toBe(200);

    const [reconcil] = await db.select().from(schema.shiftFinancialReconciliations).where(eq(schema.shiftFinancialReconciliations.operationalShiftId, shiftId));
    expect(reconcil.varianceStatus).toBe('SHORTAGE');
    expect(reconcil.salesCollectionVariancePaise).toBe(35500);
    expect(reconcil.varianceReason).toBe('Cash shortage investigated');
  });

  it('CNG EXCESS requires varianceReason to close', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.delete(schema.outletProductPrices).where(and(eq(schema.outletProductPrices.outletId, 'ro-1001'), eq(schema.outletProductPrices.productId, 'prod-cng')));
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng-exc', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    const shiftId = (await openRes.json() as any).data.id;

    // Complete nozzle readings (0 fuel sales)
    const pumpRepo = new PumpRepository(db);
    const nozzles = await pumpRepo.listShiftNozzleSnapshots(shiftId);
    for (const n of nozzles) {
      await pumpRepo.createReading({
        id: `mr-ex-${n.nozzleId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', nozzleId: n.nozzleId, openingMilliunits: 1000, closingMilliunits: 1000, testingMilliunits: 0, grossMilliunits: 0, netMilliunits: 0, recordedByUserId: 'user-admin', hasOpeningVariance: false, openingVarianceMilliunits: 0, varianceReason: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }
    const tanks = await pumpRepo.listShiftTankSnapshots(shiftId);
    for (const t of tanks) {
      await pumpRepo.createTankReading({
        id: `tsr-open-ex-${t.tankId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', tankId: t.tankId, productId: t.productId, readingType: 'OPENING', source: 'MANUAL', productDipMmMilliunits: 1000000, waterDipMmMilliunits: 0, grossObservedVolumeMilliunits: 8500000, waterVolumeMilliunits: 0, netProductVolumeMilliunits: 8500000, recordedAt: new Date().toISOString(), recordedByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
      await pumpRepo.createTankReading({
        id: `tsr-close-ex-${t.tankId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', tankId: t.tankId, productId: t.productId, readingType: 'CLOSING', source: 'MANUAL', productDipMmMilliunits: 950000, waterDipMmMilliunits: 0, grossObservedVolumeMilliunits: 8400000, waterVolumeMilliunits: 0, netProductVolumeMilliunits: 8400000, recordedAt: new Date().toISOString(), recordedByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }

    // CNG 10.000 KG @ 85.50 = 85500 paise
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '0.000', mfmClosingKg: '10.000' }),
      }),
      env
    );

    // Collections: 1000.00 (100000 paise) => Excess = -14500 paise (< 0)
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ collectionType: 'CASH', amount: '1000.00', collectedAt: new Date().toISOString() }),
      }),
      env
    );

    // Close without varianceReason fails
    const failClose = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({}),
      }),
      env
    );
    expect(failClose.status).toBe(400);
    const failJson: any = await failClose.json();
    expect(failJson.error.code).toBe('VARIANCE_REASON_REQUIRED');

    // Close with variance reason succeeds
    const successClose = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ varianceReason: 'Excess collection from previous shift' }),
      }),
      env
    );
    expect(successClose.status).toBe(200);

    const [reconcil] = await db.select().from(schema.shiftFinancialReconciliations).where(eq(schema.shiftFinancialReconciliations.operationalShiftId, shiftId));
    expect(reconcil.varianceStatus).toBe('EXCESS');
    expect(reconcil.salesCollectionVariancePaise).toBe(-14500);
  });

  it('Incomplete CNG close rolls back: returns 409 INCOMPLETE_CNG_DATA, restores shift to OPEN, cleans up reconciliations', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.delete(schema.outletProductPrices).where(and(eq(schema.outletProductPrices.outletId, 'ro-1001'), eq(schema.outletProductPrices.productId, 'prod-cng')));
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng-incomp', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    const shiftId = (await openRes.json() as any).data.id;

    // Complete all fuel and tank close data
    const pumpRepo = new PumpRepository(db);
    const nozzles = await pumpRepo.listShiftNozzleSnapshots(shiftId);
    for (const n of nozzles) {
      await pumpRepo.createReading({
        id: `mr-inc-${n.nozzleId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', nozzleId: n.nozzleId, openingMilliunits: 1000, closingMilliunits: 1000, testingMilliunits: 0, grossMilliunits: 0, netMilliunits: 0, recordedByUserId: 'user-admin', hasOpeningVariance: false, openingVarianceMilliunits: 0, varianceReason: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }
    const tanks = await pumpRepo.listShiftTankSnapshots(shiftId);
    for (const t of tanks) {
      await pumpRepo.createTankReading({
        id: `tsr-open-inc-${t.tankId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', tankId: t.tankId, productId: t.productId, readingType: 'OPENING', source: 'MANUAL', productDipMmMilliunits: 1000000, waterDipMmMilliunits: 0, grossObservedVolumeMilliunits: 8500000, waterVolumeMilliunits: 0, netProductVolumeMilliunits: 8500000, recordedAt: new Date().toISOString(), recordedByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
      await pumpRepo.createTankReading({
        id: `tsr-close-inc-${t.tankId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', tankId: t.tankId, productId: t.productId, readingType: 'CLOSING', source: 'MANUAL', productDipMmMilliunits: 950000, waterDipMmMilliunits: 0, grossObservedVolumeMilliunits: 8400000, waterVolumeMilliunits: 0, netProductVolumeMilliunits: 8400000, recordedAt: new Date().toISOString(), recordedByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }

    // NO CNG log recorded! Attempt close:
    const closeRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ varianceReason: 'Attempt close without CNG log' }),
      }),
      env
    );
    expect(closeRes.status).toBe(409);
    const json: any = await closeRes.json();
    expect(json.error.code).toBe('INCOMPLETE_CNG_DATA');

    // Assert shift status restored to OPEN
    const [shift] = await db.select().from(schema.operationalShifts).where(eq(schema.operationalShifts.id, shiftId));
    expect(shift.status).toBe('OPEN');

    // Assert stock reconciliation created during attempt was deleted/cleaned up
    const stockRecon = await db.select().from(schema.shiftStockReconciliations).where(eq(schema.shiftStockReconciliations.operationalShiftId, shiftId));
    expect(stockRecon.length).toBe(0);

    // Assert financial reconciliation does not exist
    const finRecon = await db.select().from(schema.shiftFinancialReconciliations).where(eq(schema.shiftFinancialReconciliations.operationalShiftId, shiftId));
    expect(finRecon.length).toBe(0);
  });

  it('CNG price snapshot unavailable during close: returns 409 CNG_PRICE_SNAPSHOT_UNAVAILABLE and cleans up', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    const shiftId = (await openRes.json() as any).data.id;

    // Complete fuel & tank requirements
    const pumpRepo = new PumpRepository(db);
    const nozzles = await pumpRepo.listShiftNozzleSnapshots(shiftId);
    for (const n of nozzles) {
      await pumpRepo.createReading({
        id: `mr-unav-${n.nozzleId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', nozzleId: n.nozzleId, openingMilliunits: 1000, closingMilliunits: 1000, testingMilliunits: 0, grossMilliunits: 0, netMilliunits: 0, recordedByUserId: 'user-admin', hasOpeningVariance: false, openingVarianceMilliunits: 0, varianceReason: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }
    const tanks = await pumpRepo.listShiftTankSnapshots(shiftId);
    for (const t of tanks) {
      await pumpRepo.createTankReading({
        id: `tsr-open-unav-${t.tankId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', tankId: t.tankId, productId: t.productId, readingType: 'OPENING', source: 'MANUAL', productDipMmMilliunits: 1000000, waterDipMmMilliunits: 0, grossObservedVolumeMilliunits: 8500000, waterVolumeMilliunits: 0, netProductVolumeMilliunits: 8500000, recordedAt: new Date().toISOString(), recordedByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
      await pumpRepo.createTankReading({
        id: `tsr-close-unav-${t.tankId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', tankId: t.tankId, productId: t.productId, readingType: 'CLOSING', source: 'MANUAL', productDipMmMilliunits: 950000, waterDipMmMilliunits: 0, grossObservedVolumeMilliunits: 8400000, waterVolumeMilliunits: 0, netProductVolumeMilliunits: 8400000, recordedAt: new Date().toISOString(), recordedByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }

    // Legacy/inconsistent state: Insert CNG log without any CNG price snapshot
    await db.insert(schema.cngShiftLogs).values({
      id: 'cnglog-no-snap',
      operationalShiftId: shiftId,
      outletId: 'ro-1001',
      mfmOpeningKgMilliunits: 0,
      mfmClosingKgMilliunits: 10000,
      netSalesKgMilliunits: 10000,
      recordedByUserId: 'user-admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const closeRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ varianceReason: 'Test snapshot unavailable' }),
      }),
      env
    );
    expect(closeRes.status).toBe(409);
    const json: any = await closeRes.json();
    expect(json.error.code).toBe('CNG_PRICE_SNAPSHOT_UNAVAILABLE');

    // Assert restored OPEN and no reconciliations
    const [shift] = await db.select().from(schema.operationalShifts).where(eq(schema.operationalShifts.id, shiftId));
    expect(shift.status).toBe('OPEN');
    const stockReconUnav = await db.select().from(schema.shiftStockReconciliations).where(eq(schema.shiftStockReconciliations.operationalShiftId, shiftId));
    expect(stockReconUnav.length).toBe(0);
    const finRecon = await db.select().from(schema.shiftFinancialReconciliations).where(eq(schema.shiftFinancialReconciliations.operationalShiftId, shiftId));
    expect(finRecon.length).toBe(0);
  });

  it('Ambiguous CNG snapshot during close: returns 409 CNG_PRICE_SNAPSHOT_AMBIGUOUS and restores OPEN', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    const shiftId = (await openRes.json() as any).data.id;

    // Complete fuel & tank requirements
    const pumpRepo = new PumpRepository(db);
    const nozzles = await pumpRepo.listShiftNozzleSnapshots(shiftId);
    for (const n of nozzles) {
      await pumpRepo.createReading({
        id: `mr-amb-${n.nozzleId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', nozzleId: n.nozzleId, openingMilliunits: 1000, closingMilliunits: 1000, testingMilliunits: 0, grossMilliunits: 0, netMilliunits: 0, recordedByUserId: 'user-admin', hasOpeningVariance: false, openingVarianceMilliunits: 0, varianceReason: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }
    const tanks = await pumpRepo.listShiftTankSnapshots(shiftId);
    for (const t of tanks) {
      await pumpRepo.createTankReading({
        id: `tsr-open-amb-${t.tankId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', tankId: t.tankId, productId: t.productId, readingType: 'OPENING', source: 'MANUAL', productDipMmMilliunits: 1000000, waterDipMmMilliunits: 0, grossObservedVolumeMilliunits: 8500000, waterVolumeMilliunits: 0, netProductVolumeMilliunits: 8500000, recordedAt: new Date().toISOString(), recordedByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
      await pumpRepo.createTankReading({
        id: `tsr-close-amb-${t.tankId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', tankId: t.tankId, productId: t.productId, readingType: 'CLOSING', source: 'MANUAL', productDipMmMilliunits: 950000, waterDipMmMilliunits: 0, grossObservedVolumeMilliunits: 8400000, waterVolumeMilliunits: 0, netProductVolumeMilliunits: 8400000, recordedAt: new Date().toISOString(), recordedByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }

    // Insert 2 CNG snapshots directly into shift
    await db.insert(schema.products).values({
      id: 'prod-cng-close-amb', code: 'CNG_CL_AMB', name: 'CNG Close Amb', category: 'CNG', unit: 'KG', status: 'ACTIVE', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    await db.insert(schema.outletProductPrices).values([
      { id: 'opp-cl-amb-1', outletId: 'ro-1001', productId: 'prod-cng', pricePaisePerUnit: 8550, effectiveFrom: '2026-11-01', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin' },
      { id: 'opp-cl-amb-2', outletId: 'ro-1001', productId: 'prod-cng-close-amb', pricePaisePerUnit: 8600, effectiveFrom: '2026-11-01', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin' },
    ]);
    await db.insert(schema.operationalShiftProductPrices).values([
      { id: 'ospp-cl-amb-1', operationalShiftId: shiftId, outletId: 'ro-1001', productId: 'prod-cng', productCode: 'CNG', productName: 'CNG 1', unit: 'KG', productCategory: 'CNG', pricePaisePerUnit: 8550, sourcePriceId: 'opp-cl-amb-1', createdAt: new Date().toISOString() },
      { id: 'ospp-cl-amb-2', operationalShiftId: shiftId, outletId: 'ro-1001', productId: 'prod-cng-close-amb', productCode: 'CNG_CL_AMB', productName: 'CNG 2', unit: 'KG', productCategory: 'CNG', pricePaisePerUnit: 8600, sourcePriceId: 'opp-cl-amb-2', createdAt: new Date().toISOString() },
    ]);

    // Insert CNG log
    await db.insert(schema.cngShiftLogs).values({
      id: 'cnglog-ambig-close',
      operationalShiftId: shiftId,
      outletId: 'ro-1001',
      mfmOpeningKgMilliunits: 0,
      mfmClosingKgMilliunits: 10000,
      netSalesKgMilliunits: 10000,
      recordedByUserId: 'user-admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const closeRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ varianceReason: 'Test ambiguous snapshot' }),
      }),
      env
    );
    expect(closeRes.status).toBe(409);
    const json: any = await closeRes.json();
    expect(json.error.code).toBe('CNG_PRICE_SNAPSHOT_AMBIGUOUS');

    // Verify OPEN restoration and cleanup
    const [shift] = await db.select().from(schema.operationalShifts).where(eq(schema.operationalShifts.id, shiftId));
    expect(shift.status).toBe('OPEN');
    const stockReconAmb = await db.select().from(schema.shiftStockReconciliations).where(eq(schema.shiftStockReconciliations.operationalShiftId, shiftId));
    expect(stockReconAmb.length).toBe(0);
  });

  it('Audit content for successful CNG close includes fuelRevenuePaise, cngRevenuePaise, authoritativeSalesRevenuePaise, totalCollectionsPaise, variancePaise, varianceStatus, varianceReason', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.delete(schema.outletProductPrices).where(and(eq(schema.outletProductPrices.outletId, 'ro-1001'), eq(schema.outletProductPrices.productId, 'prod-cng')));
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng-aud', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    const shiftId = (await openRes.json() as any).data.id;

    // Fuel readings: 0 net sales
    const pumpRepo = new PumpRepository(db);
    const nozzles = await pumpRepo.listShiftNozzleSnapshots(shiftId);
    for (const n of nozzles) {
      await pumpRepo.createReading({
        id: `mr-aud-${n.nozzleId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', nozzleId: n.nozzleId, openingMilliunits: 1000, closingMilliunits: 1000, testingMilliunits: 0, grossMilliunits: 0, netMilliunits: 0, recordedByUserId: 'user-admin', hasOpeningVariance: false, openingVarianceMilliunits: 0, varianceReason: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }
    const tanks = await pumpRepo.listShiftTankSnapshots(shiftId);
    for (const t of tanks) {
      await pumpRepo.createTankReading({
        id: `tsr-open-aud-${t.tankId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', tankId: t.tankId, productId: t.productId, readingType: 'OPENING', source: 'MANUAL', productDipMmMilliunits: 1000000, waterDipMmMilliunits: 0, grossObservedVolumeMilliunits: 8500000, waterVolumeMilliunits: 0, netProductVolumeMilliunits: 8500000, recordedAt: new Date().toISOString(), recordedByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
      await pumpRepo.createTankReading({
        id: `tsr-close-aud-${t.tankId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', tankId: t.tankId, productId: t.productId, readingType: 'CLOSING', source: 'MANUAL', productDipMmMilliunits: 950000, waterDipMmMilliunits: 0, grossObservedVolumeMilliunits: 8400000, waterVolumeMilliunits: 0, netProductVolumeMilliunits: 8400000, recordedAt: new Date().toISOString(), recordedByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }

    // CNG 10.000 KG @ 85.50 = 85500 paise
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '0.000', mfmClosingKg: '10.000' }),
      }),
      env
    );

    // Collections: 800.00 (80000 paise) => Shortage = 5500 paise
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ collectionType: 'CASH', amount: '800.00', collectedAt: new Date().toISOString() }),
      }),
      env
    );

    const closeRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ varianceReason: 'Audited shortage' }),
      }),
      env
    );
    expect(closeRes.status).toBe(200);

    const [audit] = await db.select().from(schema.auditLogs).where(
      and(eq(schema.auditLogs.action, 'FINANCIAL_RECONCILIATION'), eq(schema.auditLogs.entityId, shiftId))
    );
    expect(audit).toBeDefined();
    const nv = JSON.parse(audit.newValueJson || '{}');
    expect(nv.fuelRevenuePaise).toBe(0);
    expect(nv.cngRevenuePaise).toBe(85500);
    expect(nv.authoritativeSalesRevenuePaise).toBe(85500);
    expect(nv.totalCollectionsPaise).toBe(80000);
    expect(nv.variancePaise).toBe(5500);
    expect(nv.varianceStatus).toBe('SHORTAGE');
    expect(nv.varianceReason).toBe('Audited shortage');
  });

  it('Non-CNG regression: fuel-only shift maintains cngApplicable=false, cngComplete=true, and authoritative revenue equals fuel revenue', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);

    // Open shift without any CNG configuration
    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    const shiftId = (await openRes.json() as any).data.id;

    // Record fuel reading: 5.000 L of MS (50000 paise)
    const pumpRepo = new PumpRepository(db);
    const nozzles = await pumpRepo.listShiftNozzleSnapshots(shiftId);
    const msNozzle = nozzles.find(n => n.productCode === 'MS')!;
    await pumpRepo.createReading({
      id: `mr-reg-${msNozzle.nozzleId}`,
      operationalShiftId: shiftId,
      outletId: 'ro-1001',
      nozzleId: msNozzle.nozzleId,
      openingMilliunits: 0,
      closingMilliunits: 5000,
      testingMilliunits: 0,
      grossMilliunits: 5000,
      netMilliunits: 5000,
      recordedByUserId: 'user-admin',
      hasOpeningVariance: false,
      openingVarianceMilliunits: 0,
      varianceReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const sumRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/financial-summary`, {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(sumRes.status).toBe(200);
    const json: any = await sumRes.json();
    const salesRev = json.data.salesRevenue;

    expect(salesRev.cngApplicable).toBe(false);
    expect(salesRev.cngComplete).toBe(true);
    expect(salesRev.cngTotalPaise).toBeNull();
    expect(salesRev.authoritativeTotalPaise).toBe(salesRev.fuelTotalPaise);
    expect(salesRev.pendingComponents).not.toContain('CNG');
  });

  it('CNG price overlap rejected with 409 OVERLAPPING_PRODUCT_PRICE', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.delete(schema.outletProductPrices).where(and(eq(schema.outletProductPrices.outletId, 'ro-1001'), eq(schema.outletProductPrices.productId, 'prod-cng')));
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng-ovlp', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });

    // 1. Post price effective from 2026-11-01 (open-ended)
    const price1 = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );
    expect(price1.status).toBe(201);

    // 2. Attempt overlapping price starting 2026-11-10
    const price2 = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '87.00', effectiveFrom: '2026-11-10' }),
      }),
      env
    );
    expect(price2.status).toBe(409);
    const json: any = await price2.json();
    expect(json.error.code).toBe('OVERLAPPING_PRODUCT_PRICE');
  });
});
