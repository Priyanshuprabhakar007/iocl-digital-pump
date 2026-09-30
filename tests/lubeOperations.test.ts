import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import * as schema from '../src/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import fs from 'fs';
import {
  parseLubeQuantity,
  formatLubeQuantity,
  calculateLubeRevenuePaise,
} from '../src/shared/lubeUtils';

const TEST_DB_PATH = './.sqlite/test_lube_operations.db';

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

describe('Phase 3B-1 Lube & Auxiliary Inventory Core Backend Suite', () => {
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

  async function openShift(cookie: string, outletId = 'ro-1001', businessDate = '2026-11-20') {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${outletId}/shifts/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate }),
      }),
      env
    );
    const json: any = await res.json();
    return json.data.id;
  }

  // 1. MIGRATION & PERMISSIONS
  it('1. Migration creates all 4 lube tables', async () => {
    const db = getDb(localD1);
    const tables = ['lube_skus', 'lube_sku_prices', 'lube_stock_transactions', 'lube_shift_sales'];
    for (const t of tables) {
      const rows = await db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${t}`);
      expect(rows.length).toBe(1);
    }
  });

  it('2. Lube permissions created', async () => {
    const db = getDb(localD1);
    const codes = ['lube_operations.read', 'lube_inventory.write', 'lube_sales.write', 'lube_prices.write'];
    for (const code of codes) {
      const [perm] = await db.select().from(schema.permissions).where(eq(schema.permissions.code, code));
      expect(perm).toBeDefined();
    }
  });

  it('3. Default role permissions: Admin has all 4, SO has read, Dealer has read/inv/sales but NOT prices', async () => {
    const db = getDb(localD1);
    
    // Check ADMIN
    const [adminRole] = await db.select().from(schema.roles).where(eq(schema.roles.code, 'ADMIN'));
    const adminPerms = await db
      .select({ code: schema.permissions.code })
      .from(schema.rolePermissions)
      .innerJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id))
      .where(eq(schema.rolePermissions.roleId, adminRole.id));
    const adminCodes = adminPerms.map(p => p.code);
    expect(adminCodes).toContain('lube_operations.read');
    expect(adminCodes).toContain('lube_inventory.write');
    expect(adminCodes).toContain('lube_sales.write');
    expect(adminCodes).toContain('lube_prices.write');

    // Check DEALER
    const [dealerRole] = await db.select().from(schema.roles).where(eq(schema.roles.code, 'DEALER'));
    const dealerPerms = await db
      .select({ code: schema.permissions.code })
      .from(schema.rolePermissions)
      .innerJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id))
      .where(eq(schema.rolePermissions.roleId, dealerRole.id));
    const dealerCodes = dealerPerms.map(p => p.code);
    expect(dealerCodes).toContain('lube_operations.read');
    expect(dealerCodes).toContain('lube_inventory.write');
    expect(dealerCodes).toContain('lube_sales.write');
    expect(dealerCodes).not.toContain('lube_prices.write');

    // Check STATE_OFFICE
    const [soRole] = await db.select().from(schema.roles).where(eq(schema.roles.code, 'STATE_OFFICE'));
    const soPerms = await db
      .select({ code: schema.permissions.code })
      .from(schema.rolePermissions)
      .innerJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id))
      .where(eq(schema.rolePermissions.roleId, soRole.id));
    const soCodes = soPerms.map(p => p.code);
    expect(soCodes).toContain('lube_operations.read');
    expect(soCodes).not.toContain('lube_inventory.write');
    expect(soCodes).not.toContain('lube_sales.write');
    expect(soCodes).not.toContain('lube_prices.write');
  });

  it('4. Unauthenticated lube route returns 401', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        headers: { Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(res.status).toBe(401);
  });

  it('5. Dealer own-outlet read allowed, other-outlet rejected with 403', async () => {
    const { cookie } = await loginAs('dealer.parkstreet@iocl.in');
    
    // Own outlet ro-1001
    const resOwn = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(resOwn.status).toBe(200);

    // Other outlet ro-1002
    const resOther = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1002/lube/skus', {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(resOther.status).toBe(403);
  });

  // 2. SKU MANAGEMENT
  it('6. Create LITRE SKU with decimal threshold succeeds', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-FUT-5W30',
          name: 'SERVO Futura Synth 5W-30',
          category: 'ENGINE_OIL',
          stockUnit: 'LITRE',
          reorderThreshold: '25.500',
        }),
      }),
      env
    );

    expect(res.status).toBe(201);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.skuCode).toBe('SERVO-FUT-5W30');
    expect(json.data.stockUnit).toBe('LITRE');
    expect(json.data.reorderThresholdSubunits).toBe(25500);
    expect(json.data.reorderThreshold).toBe('25.500');
  });

  it('7. Create PACK SKU with integer threshold succeeds', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-4T-1L',
          name: 'SERVO 4T 20W-40 1L Pack',
          category: 'ENGINE_OIL',
          stockUnit: 'PACK',
          reorderThreshold: '10',
        }),
      }),
      env
    );

    expect(res.status).toBe(201);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.skuCode).toBe('SERVO-4T-1L');
    expect(json.data.stockUnit).toBe('PACK');
    expect(json.data.reorderThresholdSubunits).toBe(10);
    expect(json.data.reorderThreshold).toBe('10');
  });

  it('8. Duplicate skuCode in same outlet rejected with 409', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    // First creation
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-GREASE-500G',
          name: 'SERVO Grease MP 500g',
          category: 'GREASE',
          stockUnit: 'PACK',
          reorderThreshold: '5',
        }),
      }),
      env
    );

    // Duplicate creation
    const res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-GREASE-500G',
          name: 'Duplicate',
          category: 'GREASE',
          stockUnit: 'PACK',
          reorderThreshold: '10',
        }),
      }),
      env
    );
    expect(res.status).toBe(409);
    const json: any = await res.json();
    expect(json.error.code).toBe('DUPLICATE_SKU_CODE');
  });

  it('9. Same skuCode in different outlet allowed', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const res1 = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-COOLANT-1L',
          name: 'SERVO Kool Plus 1L',
          category: 'COOLANT',
          stockUnit: 'PACK',
          reorderThreshold: '5',
        }),
      }),
      env
    );
    expect(res1.status).toBe(201);

    const res2 = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1002/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-COOLANT-1L',
          name: 'SERVO Kool Plus 1L (Salt Lake)',
          category: 'COOLANT',
          stockUnit: 'PACK',
          reorderThreshold: '8',
        }),
      }),
      env
    );
    expect(res2.status).toBe(201);
  });

  it('10. Invalid stockUnit rejected with 400', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-BAD-UNIT',
          name: 'Bad Unit Test',
          category: 'OTHER',
          stockUnit: 'BOTTLE',
          reorderThreshold: '10',
        }),
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it('11. PACK threshold rejects fractional string like "10.5"', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-FRAC-PACK',
          name: 'Fractional Pack Test',
          category: 'ENGINE_OIL',
          stockUnit: 'PACK',
          reorderThreshold: '10.5',
        }),
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it('12. LITRE threshold supports max 3 decimal places', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    // 4 decimal places should be rejected
    const res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-4-DEC',
          name: '4 Decimals Test',
          category: 'ENGINE_OIL',
          stockUnit: 'LITRE',
          reorderThreshold: '10.1234',
        }),
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  // 3. PRICING & RANGE INTEGRITY
  it('13. Price create succeeds with positive decimal money string', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    // Create SKU
    const skuRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-PRICE-1',
          name: 'Price Test SKU',
          category: 'ENGINE_OIL',
          stockUnit: 'PACK',
          reorderThreshold: '5',
        }),
      }),
      env
    );
    const sku: any = ((await skuRes.json()) as any).data;

    // Create Price
    const priceRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          pricePaisePerUnit: '385.50',
          effectiveFrom: '2026-10-01',
          effectiveTo: null,
          status: 'ACTIVE',
        }),
      }),
      env
    );

    expect(priceRes.status).toBe(201);
    const json: any = await priceRes.json();
    expect(json.data.pricePaisePerUnit).toBe(38550);
    expect(json.data.pricePerUnitStr).toBe('385.50');
  });

  it('14. Zero price is rejected with 400', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const skuRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-ZERO-P',
          name: 'Zero Price Test',
          category: 'OTHER',
          stockUnit: 'PACK',
          reorderThreshold: '0',
        }),
      }),
      env
    );
    const sku: any = ((await skuRes.json()) as any).data;

    const res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          pricePaisePerUnit: '0.00',
          effectiveFrom: '2026-10-01',
        }),
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it('15. Overlapping active price returns 409 OVERLAPPING_LUBE_PRICE', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const skuRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-OVERLAP',
          name: 'Overlap Test',
          category: 'ENGINE_OIL',
          stockUnit: 'PACK',
          reorderThreshold: '5',
        }),
      }),
      env
    );
    const sku: any = ((await skuRes.json()) as any).data;

    // Price 1: 2026-10-01 to 2026-10-15
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          pricePaisePerUnit: '400.00',
          effectiveFrom: '2026-10-01',
          effectiveTo: '2026-10-15',
        }),
      }),
      env
    );

    // Price 2: Overlapping 2026-10-10 to 2026-10-20
    const res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          pricePaisePerUnit: '420.00',
          effectiveFrom: '2026-10-10',
          effectiveTo: '2026-10-20',
        }),
      }),
      env
    );
    expect(res.status).toBe(409);
    const json: any = await res.json();
    expect(json.error.code).toBe('OVERLAPPING_LUBE_PRICE');
  });

  it('16. effectiveTo earlier than effectiveFrom is rejected with 400', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const skuRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-DATE-INV',
          name: 'Invalid Date Test',
          category: 'ENGINE_OIL',
          stockUnit: 'PACK',
          reorderThreshold: '5',
        }),
      }),
      env
    );
    const sku: any = ((await skuRes.json()) as any).data;

    const res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          pricePaisePerUnit: '400.00',
          effectiveFrom: '2026-10-15',
          effectiveTo: '2026-10-10',
        }),
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  // 4. STOCK MOVEMENTS & LEDGER
  it('17. Stock receipt exact for LITRE and PACK', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    // Litre SKU
    const lSkuRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'COOLANT-BULK-1',
          name: 'Coolant Bulk Litres',
          category: 'COOLANT',
          stockUnit: 'LITRE',
          reorderThreshold: '50.000',
        }),
      }),
      env
    );
    const lSku: any = ((await lSkuRes.json()) as any).data;

    const txRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/stock-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: lSku.id,
          transactionType: 'RECEIPT',
          quantity: '100.250',
          occurredAt: '2026-10-01T10:00:00Z',
          referenceNumber: 'INV-101',
          notes: 'Initial delivery',
        }),
      }),
      env
    );

    expect(txRes.status).toBe(201);
    const txJson: any = await txRes.json();
    expect(txJson.data.quantitySubunits).toBe(100250);
    expect(txJson.data.quantity).toBe('100.250');
  });

  it('18. PACK fractional receipt rejected with 400', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const pSkuRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-FRAC-REC',
          name: 'Frac Receipt Test',
          category: 'ENGINE_OIL',
          stockUnit: 'PACK',
          reorderThreshold: '10',
        }),
      }),
      env
    );
    const pSku: any = ((await pSkuRes.json()) as any).data;

    const txRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/stock-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: pSku.id,
          transactionType: 'RECEIPT',
          quantity: '5.5',
          occurredAt: '2026-10-01T10:00:00Z',
        }),
      }),
      env
    );
    expect(txRes.status).toBe(400);
  });

  it('19. ADJUSTMENT_OUT requires notes and fails if stock insufficient', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const skuRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-ADJ-TEST',
          name: 'Adjustment Test',
          category: 'ENGINE_OIL',
          stockUnit: 'PACK',
          reorderThreshold: '2',
        }),
      }),
      env
    );
    const sku: any = ((await skuRes.json()) as any).data;

    // Receipt of 10 packs
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/stock-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          transactionType: 'RECEIPT',
          quantity: '10',
          occurredAt: '2026-10-01T10:00:00Z',
        }),
      }),
      env
    );

    // Missing notes on ADJUSTMENT_OUT
    const noNotesRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/stock-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          transactionType: 'ADJUSTMENT_OUT',
          quantity: '2',
          occurredAt: '2026-10-01T11:00:00Z',
        }),
      }),
      env
    );
    expect(noNotesRes.status).toBe(400);

    // Excessive ADJUSTMENT_OUT (15 packs when only 10 in stock)
    const excessRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/stock-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          transactionType: 'ADJUSTMENT_OUT',
          quantity: '15',
          occurredAt: '2026-10-01T11:00:00Z',
          notes: 'Damaged stock discard',
        }),
      }),
      env
    );
    expect(excessRes.status).toBe(409);
    const excessJson: any = await excessRes.json();
    expect(excessJson.error.code).toBe('INSUFFICIENT_LUBE_STOCK');

    // Valid ADJUSTMENT_OUT of 3 packs
    const validAdj = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/stock-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          transactionType: 'ADJUSTMENT_OUT',
          quantity: '3',
          occurredAt: '2026-10-01T11:00:00Z',
          notes: 'Damaged bottles discarded',
        }),
      }),
      env
    );
    expect(validAdj.status).toBe(201);
  });

  // 5. CURRENT STOCK & LOW-STOCK ALERTING
  it('20. Current stock calculation and low-stock equality condition', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const skuRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-LOW-STOCK',
          name: 'Low Stock Test',
          category: 'ENGINE_OIL',
          stockUnit: 'PACK',
          reorderThreshold: '5',
        }),
      }),
      env
    );
    const sku: any = ((await skuRes.json()) as any).data;

    // Initially 0 stock -> isLowStock should be true (0 <= 5)
    const sum1 = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/stock-summary', {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    const json1: any = await sum1.json();
    const item1 = json1.data.find((i: any) => i.lubeSkuId === sku.id);
    expect(item1.currentStockSubunits).toBe(0);
    expect(item1.isLowStock).toBe(true);

    // Receipt of 10 packs -> stock = 10 -> isLowStock should be false (10 > 5)
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/stock-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          transactionType: 'RECEIPT',
          quantity: '10',
          occurredAt: '2026-10-01T10:00:00Z',
        }),
      }),
      env
    );

    const sum2 = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/stock-summary', {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    const json2: any = await sum2.json();
    const item2 = json2.data.find((i: any) => i.lubeSkuId === sku.id);
    expect(item2.currentStockSubunits).toBe(10);
    expect(item2.isLowStock).toBe(false);

    // Adjustment out of 5 packs -> stock = 5 == threshold 5 -> isLowStock MUST BE TRUE (equality counts as low stock)
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/stock-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          transactionType: 'ADJUSTMENT_OUT',
          quantity: '5',
          occurredAt: '2026-10-01T12:00:00Z',
          notes: 'Transfer out',
        }),
      }),
      env
    );

    const sum3 = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/stock-summary', {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    const json3: any = await sum3.json();
    const item3 = json3.data.find((i: any) => i.lubeSkuId === sku.id);
    expect(item3.currentStockSubunits).toBe(5);
    expect(item3.isLowStock).toBe(true);

    // GET /low-stock endpoint includes this SKU
    const lowStockRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/low-stock', {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    const lowStockJson: any = await lowStockRes.json();
    const found = lowStockJson.data.some((i: any) => i.lubeSkuId === sku.id);
    expect(found).toBe(true);
  });

  // 6. SHIFT LUBE SALES & SNAPSHOTS
  it('21. Create LITRE and PACK sales against OPEN shift snapshot price and calculate revenue', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const shiftId = await openShift(cookie, 'ro-1001', '2026-10-15');

    // 1. Create Pack SKU
    const packSkuRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-SALE-PACK',
          name: 'SERVO Pride 4T 1L',
          category: 'ENGINE_OIL',
          stockUnit: 'PACK',
          reorderThreshold: '2',
        }),
      }),
      env
    );
    const packSku: any = ((await packSkuRes.json()) as any).data;

    // Price: ₹450.00 / pack
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: packSku.id,
          pricePaisePerUnit: '450.00',
          effectiveFrom: '2026-10-01',
        }),
      }),
      env
    );

    // Initial stock receipt: 20 packs
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/stock-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: packSku.id,
          transactionType: 'RECEIPT',
          quantity: '20',
          occurredAt: '2026-10-15T08:00:00Z',
        }),
      }),
      env
    );

    // 2. Create Litre SKU
    const litreSkuRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-SALE-LITRE',
          name: 'SERVO Super 15W-40 Bulk',
          category: 'ENGINE_OIL',
          stockUnit: 'LITRE',
          reorderThreshold: '10.000',
        }),
      }),
      env
    );
    const litreSku: any = ((await litreSkuRes.json()) as any).data;

    // Price: ₹320.00 / Litre
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: litreSku.id,
          pricePaisePerUnit: '320.00',
          effectiveFrom: '2026-10-01',
        }),
      }),
      env
    );

    // Initial stock receipt: 100.000 Litres
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/stock-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: litreSku.id,
          transactionType: 'RECEIPT',
          quantity: '100.000',
          occurredAt: '2026-10-15T08:00:00Z',
        }),
      }),
      env
    );

    // Sell 3 Packs (3 × ₹450 = ₹1350.00)
    const packSaleRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/lube-sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: packSku.id,
          quantity: '3',
          soldAt: '2026-10-15T10:30:00Z',
          notes: 'Customer walk-in',
        }),
      }),
      env
    );
    expect(packSaleRes.status).toBe(201);
    const packSaleJson: any = await packSaleRes.json();
    expect(packSaleJson.data.skuCode).toBe('SERVO-SALE-PACK');
    expect(packSaleJson.data.skuName).toBe('SERVO Pride 4T 1L');
    expect(packSaleJson.data.unitPricePaise).toBe(45000);
    expect(packSaleJson.data.unitPriceStr).toBe('450.00');
    expect(packSaleJson.data.quantitySubunits).toBe(3);
    expect(packSaleJson.data.revenuePaise).toBe(135000);
    expect(packSaleJson.data.revenueStr).toBe('1350.00');

    // Sell 2.500 Litres (2.500 × ₹320 = ₹800.00)
    const litreSaleRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/lube-sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: litreSku.id,
          quantity: '2.500',
          soldAt: '2026-10-15T11:00:00Z',
        }),
      }),
      env
    );
    expect(litreSaleRes.status).toBe(201);
    const litreSaleJson: any = await litreSaleRes.json();
    expect(litreSaleJson.data.skuCode).toBe('SERVO-SALE-LITRE');
    expect(litreSaleJson.data.unitPricePaise).toBe(32000);
    expect(litreSaleJson.data.quantitySubunits).toBe(2500);
    expect(litreSaleJson.data.revenuePaise).toBe(80000);
    expect(litreSaleJson.data.revenueStr).toBe('800.00');

    // Check shift summary
    const summaryRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/lube-summary`, {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(summaryRes.status).toBe(200);
    const summaryJson: any = await summaryRes.json();
    expect(summaryJson.data.totalRevenuePaise).toBe(135000 + 80000); // 215000
    expect(summaryJson.data.totalRevenueStr).toBe('2150.00');
    expect(summaryJson.data.quantitiesByUnit.pack).toBe('3');
    expect(summaryJson.data.quantitiesByUnit.litre).toBe('2.500');
  });

  it('22. Missing price for shift date blocks sale with 409 LUBE_PRICE_NOT_CONFIGURED', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const shiftId = await openShift(cookie, 'ro-1001', '2026-10-15');

    const skuRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-NO-PRICE',
          name: 'No Price SKU',
          category: 'ENGINE_OIL',
          stockUnit: 'PACK',
          reorderThreshold: '2',
        }),
      }),
      env
    );
    const sku: any = ((await skuRes.json()) as any).data;

    // Put stock
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/stock-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          transactionType: 'RECEIPT',
          quantity: '10',
          occurredAt: '2026-10-15T08:00:00Z',
        }),
      }),
      env
    );

    // Try sale without price
    const saleRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/lube-sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          quantity: '1',
          soldAt: '2026-10-15T10:00:00Z',
        }),
      }),
      env
    );
    expect(saleRes.status).toBe(409);
    const json: any = await saleRes.json();
    expect(json.error.code).toBe('LUBE_PRICE_NOT_CONFIGURED');
  });

  it('23. Inactive SKU blocks sale create', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const shiftId = await openShift(cookie, 'ro-1001', '2026-10-15');

    const skuRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-INACT',
          name: 'Inactive SKU',
          category: 'ENGINE_OIL',
          stockUnit: 'PACK',
          reorderThreshold: '2',
          status: 'INACTIVE',
        }),
      }),
      env
    );
    const sku: any = ((await skuRes.json()) as any).data;

    const saleRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/lube-sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          quantity: '1',
          soldAt: '2026-10-15T10:00:00Z',
        }),
      }),
      env
    );
    expect(saleRes.status).toBe(409);
    const json: any = await saleRes.json();
    expect(json.error.code).toBe('LUBE_SKU_INACTIVE');
  });

  it('24. Insufficient stock blocks sale with 409 INSUFFICIENT_LUBE_STOCK and no partial insert', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const shiftId = await openShift(cookie, 'ro-1001', '2026-10-15');

    const skuRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-INSUFF',
          name: 'Insufficient Stock SKU',
          category: 'ENGINE_OIL',
          stockUnit: 'PACK',
          reorderThreshold: '1',
        }),
      }),
      env
    );
    const sku: any = ((await skuRes.json()) as any).data;

    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          pricePaisePerUnit: '100.00',
          effectiveFrom: '2026-10-01',
        }),
      }),
      env
    );

    // Stock = 2 packs
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/stock-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          transactionType: 'RECEIPT',
          quantity: '2',
          occurredAt: '2026-10-15T08:00:00Z',
        }),
      }),
      env
    );

    // Attempt to sell 5 packs
    const saleRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/lube-sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          quantity: '5',
          soldAt: '2026-10-15T10:00:00Z',
        }),
      }),
      env
    );
    expect(saleRes.status).toBe(409);
    const json: any = await saleRes.json();
    expect(json.error.code).toBe('INSUFFICIENT_LUBE_STOCK');

    // Confirm no sale record was created
    const salesListRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/lube-sales`, {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    const salesList: any = await salesListRes.json();
    expect(salesList.data.length).toBe(0);
  });

  it('25. Master price change or SKU edit after sale does NOT alter historical sale', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const shiftId = await openShift(cookie, 'ro-1001', '2026-10-15');

    const skuRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-HIST-1',
          name: 'Original SKU Name',
          category: 'ENGINE_OIL',
          stockUnit: 'PACK',
          reorderThreshold: '2',
        }),
      }),
      env
    );
    const sku: any = ((await skuRes.json()) as any).data;

    // Price: ₹100.00
    const priceRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          pricePaisePerUnit: '100.00',
          effectiveFrom: '2026-10-01',
          effectiveTo: '2026-10-19',
        }),
      }),
      env
    );
    const price: any = ((await priceRes.json()) as any).data;

    // Stock: 10
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/stock-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          transactionType: 'RECEIPT',
          quantity: '10',
          occurredAt: '2026-10-15T08:00:00Z',
        }),
      }),
      env
    );

    // Record sale: 2 packs @ ₹100 = ₹200.00
    const saleRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/lube-sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          quantity: '2',
          soldAt: '2026-10-15T09:00:00Z',
        }),
      }),
      env
    );
    const sale: any = ((await saleRes.json()) as any).data;
    expect(sale.revenuePaise).toBe(20000);
    expect(sale.skuName).toBe('Original SKU Name');

    // 1. Rename SKU
    await app.fetch(
      new Request(`http://localhost/api/v1/lube/skus/${sku.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          name: 'Renamed Brand New Name',
        }),
      }),
      env
    );

    // 2. Add new price in master (₹150.00)
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          pricePaisePerUnit: '150.00',
          effectiveFrom: '2026-10-20',
        }),
      }),
      env
    );

    // Re-fetch historical sale
    const fetchedSaleRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/lube-sales`, {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    const fetchedSales: any = ((await fetchedSaleRes.json()) as any).data;
    const historical = fetchedSales.find((s: any) => s.id === sale.id);
    expect(historical.skuName).toBe('Original SKU Name'); // preserved
    expect(historical.unitPricePaise).toBe(10000);        // preserved ₹100
    expect(historical.revenuePaise).toBe(20000);          // preserved ₹200
  });

  it('26. Sale quantity update recalculates revenue using original snapshot price', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const shiftId = await openShift(cookie, 'ro-1001', '2026-10-15');

    const skuRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-UPDATE-P',
          name: 'Update Sale Test',
          category: 'ENGINE_OIL',
          stockUnit: 'PACK',
          reorderThreshold: '2',
        }),
      }),
      env
    );
    const sku: any = ((await skuRes.json()) as any).data;

    // Price: ₹200.00
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          pricePaisePerUnit: '200.00',
          effectiveFrom: '2026-10-01',
        }),
      }),
      env
    );

    // Stock: 10
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/stock-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          transactionType: 'RECEIPT',
          quantity: '10',
          occurredAt: '2026-10-15T08:00:00Z',
        }),
      }),
      env
    );

    // Initial sale: 2 packs @ ₹200 = ₹400
    const saleRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/lube-sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          quantity: '2',
          soldAt: '2026-10-15T09:00:00Z',
        }),
      }),
      env
    );
    const sale: any = ((await saleRes.json()) as any).data;

    // Update quantity to 4 packs -> should recalculate at ₹200/pack = ₹800.00
    const updateRes = await app.fetch(
      new Request(`http://localhost/api/v1/lube-sales/${sale.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          quantity: '4',
        }),
      }),
      env
    );
    expect(updateRes.status).toBe(200);
    const updatedSale: any = ((await updateRes.json()) as any).data;
    expect(updatedSale.quantitySubunits).toBe(4);
    expect(updatedSale.unitPricePaise).toBe(20000);
    expect(updatedSale.revenuePaise).toBe(80000);
    expect(updatedSale.revenueStr).toBe('800.00');

    // Attempt update to 12 packs (only 10 in stock) -> rejected with 409
    const oversellRes = await app.fetch(
      new Request(`http://localhost/api/v1/lube-sales/${sale.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          quantity: '12',
        }),
      }),
      env
    );
    expect(oversellRes.status).toBe(409);
    const oversellJson: any = await oversellRes.json();
    expect(oversellJson.error.code).toBe('INSUFFICIENT_LUBE_STOCK');
  });

  it('27. Sale delete restores stock', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const shiftId = await openShift(cookie, 'ro-1001', '2026-10-15');

    const skuRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-DEL-RESTORE',
          name: 'Delete Restore Test',
          category: 'ENGINE_OIL',
          stockUnit: 'PACK',
          reorderThreshold: '1',
        }),
      }),
      env
    );
    const sku: any = ((await skuRes.json()) as any).data;

    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          pricePaisePerUnit: '100.00',
          effectiveFrom: '2026-10-01',
        }),
      }),
      env
    );

    // Stock: 5
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/stock-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          transactionType: 'RECEIPT',
          quantity: '5',
          occurredAt: '2026-10-15T08:00:00Z',
        }),
      }),
      env
    );

    // Sale of 3 -> current stock becomes 2
    const saleRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/lube-sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          quantity: '3',
          soldAt: '2026-10-15T09:00:00Z',
        }),
      }),
      env
    );
    const sale: any = ((await saleRes.json()) as any).data;

    let summaryRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/stock-summary', {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    let item = (await summaryRes.json() as any).data.find((i: any) => i.lubeSkuId === sku.id);
    expect(item.currentStockSubunits).toBe(2);

    // Delete sale -> current stock restores to 5
    const delRes = await app.fetch(
      new Request(`http://localhost/api/v1/lube-sales/${sale.id}`, {
        method: 'DELETE',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(delRes.status).toBe(200);

    summaryRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/stock-summary', {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    item = (await summaryRes.json() as any).data.find((i: any) => i.lubeSkuId === sku.id);
    expect(item.currentStockSubunits).toBe(5);
  });

  // 7. EXACT ARITHMETIC & OVERFLOW GUARDS
  it('28. Exact HALF-UP rounding at 0.5 paise boundary for LITRE', () => {
    // 1 milli-litre (0.001 L) @ ₹4.50 (450 paise / L)
    // 1 * 450 = 450. Quotient 0, remainder 450 (< 500). Expected 0 paise.
    expect(calculateLubeRevenuePaise('LITRE', 1, 450)).toBe(0);

    // 1 milli-litre (0.001 L) @ ₹5.00 (500 paise / L)
    // 1 * 500 = 500. Remainder 500 (>= 500). Half-up rounding => Expected 1 paise!
    expect(calculateLubeRevenuePaise('LITRE', 1, 500)).toBe(1);

    // 3 milli-litres @ ₹450.00 / L (45000 paise / L)
    // 3 * 45000 = 135000. 135000 / 1000 = 135 paise. Remainder 0.
    expect(calculateLubeRevenuePaise('LITRE', 3, 45000)).toBe(135);
  });

  it('29. PACK integer multiplication exact and overflow protected', () => {
    // 12 packs @ ₹350.50 (35050 paise) = 420600 paise
    expect(calculateLubeRevenuePaise('PACK', 12, 35050)).toBe(420600);

    // Overflow protection
    expect(() => {
      calculateLubeRevenuePaise('PACK', Number.MAX_SAFE_INTEGER, 100);
    }).toThrow('FINANCIAL_AMOUNT_OVERFLOW');
  });

  // 8. AUDIT LOGGING
  it('30. Audit events emitted for stock transactions and shift sales', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const shiftId = await openShift(cookie, 'ro-1001', '2026-10-15');

    const skuRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          skuCode: 'SERVO-AUDIT',
          name: 'Audit Test SKU',
          category: 'ENGINE_OIL',
          stockUnit: 'PACK',
          reorderThreshold: '1',
        }),
      }),
      env
    );
    const sku: any = ((await skuRes.json()) as any).data;

    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          pricePaisePerUnit: '100.00',
          effectiveFrom: '2026-10-01',
        }),
      }),
      env
    );

    // Stock transaction
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/lube/stock-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          transactionType: 'RECEIPT',
          quantity: '10',
          occurredAt: '2026-10-15T08:00:00Z',
        }),
      }),
      env
    );

    // Sale
    const saleRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/lube-sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          lubeSkuId: sku.id,
          quantity: '2',
          soldAt: '2026-10-15T09:00:00Z',
        }),
      }),
      env
    );
    const sale: any = ((await saleRes.json()) as any).data;

    // Check audit logs
    const db = getDb(localD1);
    const logs = await db.select().from(schema.auditLogs);
    const actions = logs.map(l => l.action);
    expect(actions).toContain('LUBE_SKU_CREATE');
    expect(actions).toContain('LUBE_PRICE_CREATE');
    expect(actions).toContain('LUBE_STOCK_TRANSACTION_CREATE');
    expect(actions).toContain('LUBE_SALE_CREATE');
  });

  // 9. SQL TRIGGER & CONCURRENT SAFETY
  it('31. SQLite trigger enforces stock balance and aborts direct negative insert', async () => {
    const db = getDb(localD1);
    const [adminUser] = await db.select().from(schema.users).limit(1);

    // Create SKU directly in DB
    const skuId = 'test-trigger-sku';
    await db.insert(schema.lubeSkus).values({
      id: skuId,
      outletId: 'ro-1001',
      skuCode: 'TRIG-TEST',
      name: 'Trigger Test SKU',
      category: 'ENGINE_OIL',
      stockUnit: 'PACK',
      reorderThresholdSubunits: 1,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: adminUser.id,
    });

    // Initial receipt: 5 packs
    await db.insert(schema.lubeStockTransactions).values({
      id: 'tx-trig-1',
      outletId: 'ro-1001',
      lubeSkuId: skuId,
      transactionType: 'RECEIPT',
      quantitySubunits: 5,
      occurredAt: new Date().toISOString(),
      createdBy: adminUser.id,
      createdAt: new Date().toISOString(),
    });

    // Direct SQL insert of ADJUSTMENT_OUT exceeding stock (e.g. 10 packs) must be aborted by trigger!
    expect(async () => {
      await db.insert(schema.lubeStockTransactions).values({
        id: 'tx-trig-bad',
        outletId: 'ro-1001',
        lubeSkuId: skuId,
        transactionType: 'ADJUSTMENT_OUT',
        quantitySubunits: 10,
        occurredAt: new Date().toISOString(),
        notes: 'Excessive adjustment',
        createdBy: adminUser.id,
        createdAt: new Date().toISOString(),
      });
    }).toThrow();
  });

  it('32. SQLite trigger aborts direct sale insert exceeding stock', async () => {
    const db = getDb(localD1);
    const [adminUser] = await db.select().from(schema.users).limit(1);

    // Open a shift in DB
    const shiftId = 'shift-trig-test';
    await db.insert(schema.operationalShifts).values({
      id: shiftId,
      outletId: 'ro-1001',
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-10-15',
      startedAt: new Date().toISOString(),
      openedByUserId: adminUser.id,
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const skuId = 'test-sale-trigger-sku';
    await db.insert(schema.lubeSkus).values({
      id: skuId,
      outletId: 'ro-1001',
      skuCode: 'TRIG-SALE',
      name: 'Trigger Sale Test',
      category: 'ENGINE_OIL',
      stockUnit: 'PACK',
      reorderThresholdSubunits: 1,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: adminUser.id,
    });

    // 3 packs received
    await db.insert(schema.lubeStockTransactions).values({
      id: 'tx-trig-s1',
      outletId: 'ro-1001',
      lubeSkuId: skuId,
      transactionType: 'RECEIPT',
      quantitySubunits: 3,
      occurredAt: new Date().toISOString(),
      createdBy: adminUser.id,
      createdAt: new Date().toISOString(),
    });

    // Direct SQL insert of sale with 5 packs (exceeds stock 3) must be aborted by trigger!
    expect(async () => {
      await db.insert(schema.lubeShiftSales).values({
        id: 'sale-trig-bad',
        operationalShiftId: shiftId,
        outletId: 'ro-1001',
        lubeSkuId: skuId,
        skuCode: 'TRIG-SALE',
        skuName: 'Trigger Sale Test',
        category: 'ENGINE_OIL',
        stockUnit: 'PACK',
        quantitySubunits: 5,
        unitPricePaise: 10000,
        revenuePaise: 50000,
        soldAt: new Date().toISOString(),
        recordedByUserId: adminUser.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }).toThrow();
  });
});
