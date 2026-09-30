import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import * as schema from '../src/db/schema';
import { eq, and } from 'drizzle-orm';
import fs from 'fs';
import { LubeShiftSummarySkuItem } from '../src/shared/types';
import { checkedMoneyAdd } from '../src/shared/financialUtils';
import { PumpRepository } from '../src/worker/repositories/pumpRepository';

const TEST_DB_PATH = './.sqlite/test_lube_fin_integration_full_3.db';

describe('Phase 3B-2 Lube Financial Integration Suite', () => {
  let localD1: any;
  let env: any;

  beforeEach(async () => {
    if (fs.existsSync(TEST_DB_PATH)) { try { fs.unlinkSync(TEST_DB_PATH); } catch (e) {} }
    localD1 = createLocalD1Database(TEST_DB_PATH);
    const db = getDb(localD1);
    await seedDatabase(db);
    env = { 
      DB: localD1,
      SESSION_SECRET: 'test-session-secret-key-12345678901234567890',
      ENVIRONMENT: 'development',
      ALLOWED_ORIGINS: 'http://localhost:3000'
    };
  });

  async function loginAs() {
    const res = await app.fetch(new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
      }), env);
    const cookie = res.headers.get('set-cookie') || '';
    return { cookie };
  }

  async function openShift(cookie: string) {
    const res = await app.fetch(new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }), env);
    return (await res.json() as any).data.id;
  }

  async function postSku(cookie: string, data: any) {
    const res = await app.fetch(new Request('http://localhost/api/v1/outlets/ro-1001/lube/skus', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify(data),
      }), env);
    return (await res.json() as any).data;
  }

  async function postPrice(cookie: string, skuId: string, data: any) {
    const res = await app.fetch(new Request('http://localhost/api/v1/outlets/ro-1001/lube/prices', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ ...data, lubeSkuId: skuId }),
      }), env);
    return (await res.json() as any).data;
  }

  async function postStock(cookie: string, skuId: string, data: any) {
    const res = await app.fetch(new Request('http://localhost/api/v1/outlets/ro-1001/lube/stock-transactions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ ...data, lubeSkuId: skuId }),
      }), env);
    return (await res.json() as any).data;
  }

  async function postSale(cookie: string, shiftId: string, data: any) {
    const res = await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/lube-sales`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify(data),
      }), env);
    const json = await res.json() as any;
    return json.data;
  }

  async function getFinancialSummary(cookie: string, shiftId: string) {
    const res = await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/financial-summary`, {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }), env);
    return (await res.json() as any).data;
  }

  async function setupSku(cookie: string, code: string, unit: 'LITRE' | 'PACK', price: number) {
    const sku = await postSku(cookie, { skuCode: code, name: code + ' SKU', category: 'ENGINE_OIL', stockUnit: unit, reorderThreshold: '10', status: 'ACTIVE' });
    await postPrice(cookie, sku.id, { pricePaisePerUnit: (price / 100).toFixed(2), effectiveFrom: '2025-01-01', effectiveTo: '2026-12-31', status: 'ACTIVE' });
    await postStock(cookie, sku.id, { transactionType: 'RECEIPT', quantity: "1000", occurredAt: new Date().toISOString() });
    return sku;
  }

  async function setupFuelReadings(db: any, shiftId: string, quantityMilliunits = 10000) {
    const pumpRepo = new PumpRepository(db);
    const nozzles = await pumpRepo.listShiftNozzleSnapshots(shiftId);
    const msNozzle = nozzles.find(n => n.productCode === 'MS')!;
    
    await pumpRepo.createReading({
      id: `mr-auth-${msNozzle.nozzleId}-${shiftId}`,
      operationalShiftId: shiftId,
      outletId: 'ro-1001',
      nozzleId: msNozzle.nozzleId,
      openingMilliunits: 0,
      closingMilliunits: quantityMilliunits,
      testingMilliunits: 0,
      grossMilliunits: quantityMilliunits,
      netMilliunits: quantityMilliunits,
      recordedByUserId: 'user-admin',
      hasOpeningVariance: false,
      openingVarianceMilliunits: 0,
      varianceReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    for (const n of nozzles) {
      if (n.nozzleId !== msNozzle.nozzleId) {
        await pumpRepo.createReading({
          id: `mr-auth-${n.nozzleId}-${shiftId}`,
          operationalShiftId: shiftId,
          outletId: 'ro-1001',
          nozzleId: n.nozzleId,
          openingMilliunits: 1000,
          closingMilliunits: 1000,
          testingMilliunits: 0,
          grossMilliunits: 0,
          netMilliunits: 0,
          recordedByUserId: 'user-admin',
          hasOpeningVariance: false,
          openingVarianceMilliunits: 0,
          varianceReason: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    }


    const shiftTanks = await pumpRepo.listShiftTankSnapshots(shiftId);
    for (const t of shiftTanks) {
      await pumpRepo.createTankReading({
        id: `tsr-open-b-${t.tankId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', tankId: t.tankId, productId: t.productId, readingType: 'OPENING', source: 'MANUAL', productDipMmMilliunits: 1000000, waterDipMmMilliunits: 0, grossObservedVolumeMilliunits: 8500000, waterVolumeMilliunits: 0, netProductVolumeMilliunits: 8500000, recordedAt: new Date().toISOString(), recordedByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
      await pumpRepo.createTankReading({
        id: `tsr-close-b-${t.tankId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', tankId: t.tankId, productId: t.productId, readingType: 'CLOSING', source: 'MANUAL', productDipMmMilliunits: 950000, waterDipMmMilliunits: 0, grossObservedVolumeMilliunits: 8400000, waterVolumeMilliunits: 0, netProductVolumeMilliunits: 8400000, recordedAt: new Date().toISOString(), recordedByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }
  }

  // =========================================================================
  // 1. Zero Lube Sales
  // =========================================================================
  it('1. Zero Lube Sales', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.lubeTotalPaise).toBe(0);
    expect(summary.salesRevenue.includedComponents).toContain('LUBE');
    expect(summary.salesRevenue.pendingComponents).not.toContain('LUBE');
  });

  // =========================================================================
  // 2. Pack Sale
  // =========================================================================
  it('2. Pack Sale', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const sku = await setupSku(cookie, 'PACK1', 'PACK', 25000);
    await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantity: "2", soldAt: new Date().toISOString() });
    const summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.lubeTotalPaise).toBe(50000);
  });

  // =========================================================================
  // 3. Litre Sale
  // =========================================================================
  it('3. Litre Sale', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const sku = await setupSku(cookie, 'LITRE1', 'LITRE', 10000);
    await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantity: "2.500", soldAt: new Date().toISOString() });
    const summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.lubeTotalPaise).toBe(25000);
  });

  // =========================================================================
  // 4. Real Multiple SKU
  // =========================================================================
  it('4. Real Multiple SKU', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const sku1 = await setupSku(cookie, 'PACK_M1', 'PACK', 1000);
    const sku2 = await setupSku(cookie, 'LITRE_M1', 'LITRE', 2000);
    const sku3 = await setupSku(cookie, 'PACK_M2', 'PACK', 3000);
    
    await postSale(cookie, shiftId, { lubeSkuId: sku1.id, quantity: "2", soldAt: new Date().toISOString() });
    await postSale(cookie, shiftId, { lubeSkuId: sku2.id, quantity: "1.000", soldAt: new Date().toISOString() });
    await postSale(cookie, shiftId, { lubeSkuId: sku3.id, quantity: "1", soldAt: new Date().toISOString() });

    const summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.lubeTotalPaise).toBe(2000 + 2000 + 3000);
    expect(summary.salesRevenue.lubeBySku.length).toBe(3);
  });

  // =========================================================================
  // 5. Real Unit Separation
  // =========================================================================
  it('5. Real Unit Separation', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const sku1 = await setupSku(cookie, 'P2', 'PACK', 1000);
    const sku2 = await setupSku(cookie, 'L2', 'LITRE', 2000);
    await postSale(cookie, shiftId, { lubeSkuId: sku1.id, quantity: "1", soldAt: new Date().toISOString() });
    await postSale(cookie, shiftId, { lubeSkuId: sku2.id, quantity: "1.000", soldAt: new Date().toISOString() });
    const summary = await getFinancialSummary(cookie, shiftId);
    
    const packSale = summary.salesRevenue.lubeBySku.find((s: LubeShiftSummarySkuItem) => s.skuCode === 'P2');
    const litreSale = summary.salesRevenue.lubeBySku.find((s: LubeShiftSummarySkuItem) => s.skuCode === 'L2');
    
    expect(packSale?.stockUnit).toBe('PACK');
    expect(litreSale?.stockUnit).toBe('LITRE');
  });

  // =========================================================================
  // 6. FUEL + LUBE AUTHORITATIVE TOTAL
  // =========================================================================
  it('6. FUEL + LUBE AUTHORITATIVE TOTAL', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    const shiftId = await openShift(cookie);
    
    await setupFuelReadings(db, shiftId, 10000); // 10.000 L of MS -> 95200 paise

    const sku = await setupSku(cookie, 'PACK_AUTH_6', 'PACK', 25000);
    await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantity: "2", soldAt: new Date().toISOString() });

    const summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.fuelTotalPaise).toBe(95200);
    expect(summary.salesRevenue.lubeTotalPaise).toBe(50000);
    expect(summary.salesRevenue.authoritativeTotalPaise).toBe(95200 + 50000);
    expect(summary.salesRevenue.includedComponents).toContain('FUEL');
    expect(summary.salesRevenue.includedComponents).toContain('LUBE');
    expect(summary.salesRevenue.pendingComponents).toEqual([]);
  });

  // =========================================================================
  // 7. FUEL + CNG + LUBE
  // =========================================================================
  it('7. FUEL + CNG + LUBE', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);

    // Setup CNG mapping and price
    await db.delete(schema.outletProductPrices).where(and(eq(schema.outletProductPrices.outletId, 'ro-1001'), eq(schema.outletProductPrices.productId, 'prod-cng')));
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng-auth-tot-7', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );

    const shiftId = await openShift(cookie);
    await setupFuelReadings(db, shiftId, 10000); // Fuel: 95200 paise

    // Write CNG shift log (20.000 KG @ 85.50 = 171000 paise)
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '0.000', mfmClosingKg: '20.000' }),
      }),
      env
    );

    const sku = await setupSku(cookie, 'L1_7', 'LITRE', 10000);
    await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantity: "1.000", soldAt: new Date().toISOString() }); // Lube: 10000 paise
    
    const summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.fuelTotalPaise).toBe(95200);
    expect(summary.salesRevenue.cngTotalPaise).toBe(171000);
    expect(summary.salesRevenue.lubeTotalPaise).toBe(10000);
    expect(summary.salesRevenue.authoritativeTotalPaise).toBe(95200 + 171000 + 10000);
    expect(summary.salesRevenue.includedComponents).toContain('FUEL');
    expect(summary.salesRevenue.includedComponents).toContain('CNG');
    expect(summary.salesRevenue.includedComponents).toContain('LUBE');
    expect(summary.salesRevenue.pendingComponents).toEqual([]);
  });

  // =========================================================================
  // 8. CNG INCOMPLETE + LUBE PRESENT
  // =========================================================================
  it('8. CNG INCOMPLETE + LUBE PRESENT', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);

    await db.delete(schema.outletProductPrices).where(and(eq(schema.outletProductPrices.outletId, 'ro-1001'), eq(schema.outletProductPrices.productId, 'prod-cng')));
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng-auth-tot-8', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );

    const shiftId = await openShift(cookie);
    await setupFuelReadings(db, shiftId, 10000); // Fuel: 95200 paise

    const sku = await setupSku(cookie, 'L1_8', 'LITRE', 10000);
    await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantity: "1.000", soldAt: new Date().toISOString() }); // Lube: 10000 paise

    const summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.includedComponents).toContain('FUEL');
    expect(summary.salesRevenue.includedComponents).toContain('LUBE');
    expect(summary.salesRevenue.pendingComponents).toContain('CNG');

    const res = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ varianceReason: 'Attempt close without CNG log' }),
      }),
      env
    );
    expect(res.status).toBe(409);
    const json: any = await res.json();
    expect(json.error.code).toBe('INCOMPLETE_CNG_DATA');

    // Assert shift status remains OPEN
    const [shift] = await db.select().from(schema.operationalShifts).where(eq(schema.operationalShifts.id, shiftId));
    expect(shift.status).toBe('OPEN');

    // Assert financial reconciliation table is empty
    const finRecon = await db.select().from(schema.shiftFinancialReconciliations).where(eq(schema.shiftFinancialReconciliations.operationalShiftId, shiftId));
    expect(finRecon.length).toBe(0);

    // Lube sale is intact
    const sales = await db.select().from(schema.lubeShiftSales).where(eq(schema.lubeShiftSales.operationalShiftId, shiftId));
    expect(sales.length).toBe(1);
  });

  // =========================================================================
  // 9. HISTORICAL LUBE PRICE IMMUTABILITY
  // =========================================================================
  it('9. HISTORICAL LUBE PRICE IMMUTABILITY', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    const shiftId = await openShift(cookie);
    const sku = await setupSku(cookie, 'PACK_IMM_9', 'PACK', 25000); // Price: 25000 paise (250.00 INR)
    await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantity: "2", soldAt: new Date().toISOString() }); // Total: 50000

    // Direct update to lubeSkuPrices to change the master price to 30000 paise
    await db.update(schema.lubeSkuPrices)
      .set({ pricePaisePerUnit: 30000 })
      .where(eq(schema.lubeSkuPrices.lubeSkuId, sku.id));

    const summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.lubeTotalPaise).toBe(50000);
  });

  // =========================================================================
  // 10. HISTORICAL SKU SNAPSHOT IMMUTABILITY
  // =========================================================================
  it('10. HISTORICAL SKU SNAPSHOT IMMUTABILITY', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    const shiftId = await openShift(cookie);
    const sku = await setupSku(cookie, 'PACK_IMM_10', 'PACK', 25000);
    await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantity: "1", soldAt: new Date().toISOString() });

    // Direct update to lubeSkus to change name, category and deactivate
    await db.update(schema.lubeSkus)
      .set({ name: 'CHANGED NAME', category: 'CHANGED CAT', status: 'INACTIVE' })
      .where(eq(schema.lubeSkus.id, sku.id));

    const summary = await getFinancialSummary(cookie, shiftId);
    const item = summary.salesRevenue.lubeBySku[0];
    expect(item.skuCode).toBe('PACK_IMM_10');
    expect(item.skuName).toBe('PACK_IMM_10 SKU');
    expect(item.category).toBe('ENGINE_OIL');
    expect(item.stockUnit).toBe('PACK');
  });

  // =========================================================================
  // 11. SALE UPDATE CHANGES FINANCIAL SUMMARY
  // =========================================================================
  it('11. SALE UPDATE CHANGES FINANCIAL SUMMARY', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const sku = await setupSku(cookie, 'PACK_IMM_11', 'PACK', 25000);
    const sale = await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantity: "2", soldAt: new Date().toISOString() });

    let summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.lubeTotalPaise).toBe(50000);

    // Update sale to 3 PACK
    const res = await app.fetch(new Request(`http://localhost/api/v1/lube-sales/${sale.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ quantity: "3" }),
    }), env);
    expect(res.status).toBe(200);

    summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.lubeTotalPaise).toBe(75000);
  });

  // =========================================================================
  // 12. SALE DELETE CHANGES FINANCIAL SUMMARY
  // =========================================================================
  it('12. SALE DELETE CHANGES FINANCIAL SUMMARY', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const sku = await setupSku(cookie, 'PACK_IMM_12', 'PACK', 25000);
    const sale = await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantity: "2", soldAt: new Date().toISOString() });

    let summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.lubeTotalPaise).toBe(50000);

    // Delete sale
    const res = await app.fetch(new Request(`http://localhost/api/v1/lube-sales/${sale.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
    }), env);
    expect(res.status).toBe(200);

    summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.lubeTotalPaise).toBe(0);
    expect(summary.salesRevenue.lubeTotalStr).toBe("0.00");
    expect(summary.salesRevenue.lubeBySku).toEqual([]);
  });

  // =========================================================================
  // 13. BALANCED — FUEL + LUBE
  // =========================================================================
  it('13. BALANCED — FUEL + LUBE', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    const shiftId = await openShift(cookie);
    await setupFuelReadings(db, shiftId, 10000); // MS: 95200 paise (952.00 INR)

    const sku = await setupSku(cookie, 'PACK_13', 'PACK', 25000);
    await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantity: "2", soldAt: new Date().toISOString() }); // Lube: 50000 paise (500.00 INR)

    // Match total: 95200 + 50000 = 145200 paise (1452.00 INR)
    await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ collectionType: 'CASH', amount: '1452.00', collectedAt: new Date().toISOString() }),
    }), env);

    const closeRes = await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({}),
    }), env);
    expect(closeRes.status).toBe(200);

    const [reconcil] = await db.select().from(schema.shiftFinancialReconciliations).where(eq(schema.shiftFinancialReconciliations.operationalShiftId, shiftId));
    expect(reconcil.salesCollectionVariancePaise).toBe(0);
    expect(reconcil.varianceStatus).toBe('BALANCED');
    expect(reconcil.varianceReason).toBeNull();
  });

  // =========================================================================
  // 14. BALANCED — FUEL + CNG + LUBE
  // =========================================================================
  it('14. BALANCED — FUEL + CNG + LUBE', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);

    await db.delete(schema.outletProductPrices).where(and(eq(schema.outletProductPrices.outletId, 'ro-1001'), eq(schema.outletProductPrices.productId, 'prod-cng')));
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng-auth-tot-14', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );

    const shiftId = await openShift(cookie);
    await setupFuelReadings(db, shiftId, 10000); // 95200

    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '0.000', mfmClosingKg: '20.000' }), // 171000
      }),
      env
    );

    const sku = await setupSku(cookie, 'PACK_14', 'PACK', 25000);
    await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantity: "1", soldAt: new Date().toISOString() }); // 25000

    // Match total: 95200 + 171000 + 25000 = 291200 paise (2912.00 INR)
    await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ collectionType: 'CASH', amount: '2912.00', collectedAt: new Date().toISOString() }),
    }), env);

    const closeRes = await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({}),
    }), env);
    expect(closeRes.status).toBe(200);

    const [reconcil] = await db.select().from(schema.shiftFinancialReconciliations).where(eq(schema.shiftFinancialReconciliations.operationalShiftId, shiftId));
    expect(reconcil.salesCollectionVariancePaise).toBe(0);
    expect(reconcil.varianceStatus).toBe('BALANCED');
  });

  // =========================================================================
  // 15. SHORTAGE
  // =========================================================================
  it('15. SHORTAGE', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    const shiftId = await openShift(cookie);
    await setupFuelReadings(db, shiftId, 10000); // 95200

    const sku = await setupSku(cookie, 'PACK_15', 'PACK', 25000);
    await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantity: "2", soldAt: new Date().toISOString() }); // 50000
    // Total Auth: 145200 paise (1452.00 INR)

    // Collection: 1000.00 INR -> Shortage of 45200 paise
    await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ collectionType: 'CASH', amount: '1000.00', collectedAt: new Date().toISOString() }),
    }), env);

    // Close without varianceReason fails
    const closeRes = await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({}),
    }), env);
    expect(closeRes.status).toBe(400);
    const json: any = await closeRes.json();
    expect(json.error.code).toBe('VARIANCE_REASON_REQUIRED');
  });

  // =========================================================================
  // 16. SHORTAGE WITH REASON
  // =========================================================================
  it('16. SHORTAGE WITH REASON', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    const shiftId = await openShift(cookie);
    await setupFuelReadings(db, shiftId, 10000); // 95200

    const sku = await setupSku(cookie, 'PACK_16', 'PACK', 25000);
    await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantity: "2", soldAt: new Date().toISOString() }); // 50000

    await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ collectionType: 'CASH', amount: '1000.00', collectedAt: new Date().toISOString() }),
    }), env);

    // Close with varianceReason succeeds
    const closeRes = await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ varianceReason: 'Shortage investigated' }),
    }), env);
    expect(closeRes.status).toBe(200);

    const [reconcil] = await db.select().from(schema.shiftFinancialReconciliations).where(eq(schema.shiftFinancialReconciliations.operationalShiftId, shiftId));
    expect(reconcil.salesCollectionVariancePaise).toBe(45200);
    expect(reconcil.varianceStatus).toBe('SHORTAGE');
    expect(reconcil.varianceReason).toBe('Shortage investigated');
  });

  // =========================================================================
  // 17. EXCESS
  // =========================================================================
  it('17. EXCESS', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    const shiftId = await openShift(cookie);
    await setupFuelReadings(db, shiftId, 10000); // 95200

    const sku = await setupSku(cookie, 'PACK_17', 'PACK', 25000);
    await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantity: "2", soldAt: new Date().toISOString() }); // 50000
    // Total Auth: 145200 paise

    // Collection: 2000.00 INR -> Excess of 54800 paise
    await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ collectionType: 'CASH', amount: '2000.00', collectedAt: new Date().toISOString() }),
    }), env);

    // Close without varianceReason fails
    const closeRes = await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({}),
    }), env);
    expect(closeRes.status).toBe(400);
    const json: any = await closeRes.json();
    expect(json.error.code).toBe('VARIANCE_REASON_REQUIRED');
  });

  // =========================================================================
  // 18. EXCESS WITH REASON
  // =========================================================================
  it('18. EXCESS WITH REASON', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    const shiftId = await openShift(cookie);
    await setupFuelReadings(db, shiftId, 10000); // 95200

    const sku = await setupSku(cookie, 'PACK_18', 'PACK', 25000);
    await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantity: "2", soldAt: new Date().toISOString() }); // 50000

    await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ collectionType: 'CASH', amount: '2000.00', collectedAt: new Date().toISOString() }),
    }), env);

    const closeRes = await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ varianceReason: 'Excess investigated' }),
    }), env);
    expect(closeRes.status).toBe(200);

    const [reconcil] = await db.select().from(schema.shiftFinancialReconciliations).where(eq(schema.shiftFinancialReconciliations.operationalShiftId, shiftId));
    expect(reconcil.salesCollectionVariancePaise).toBe(-54800);
    expect(reconcil.varianceStatus).toBe('EXCESS');
  });

  // =========================================================================
  // 19. SUCCESSFUL CLOSE PERSISTS LUBE REVENUE
  // =========================================================================
  it('19. SUCCESSFUL CLOSE PERSISTS LUBE REVENUE', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    const shiftId = await openShift(cookie);
    await setupFuelReadings(db, shiftId, 10000); // 95200

    const sku = await setupSku(cookie, 'PACK_19', 'PACK', 25000);
    await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantity: "2", soldAt: new Date().toISOString() }); // 50000

    await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ collectionType: 'CASH', amount: '1452.00', collectedAt: new Date().toISOString() }),
    }), env);

    const closeRes = await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({}),
    }), env);
    expect(closeRes.status).toBe(200);

    const [reconcil] = await db.select().from(schema.shiftFinancialReconciliations).where(eq(schema.shiftFinancialReconciliations.operationalShiftId, shiftId));
    expect(reconcil.fuelSalesRevenuePaise).toBe(95200);
    expect(reconcil.cngSalesRevenuePaise).toBeNull();
    expect(reconcil.lubeSalesRevenuePaise).toBe(50000);
    expect(reconcil.authoritativeSalesRevenuePaise).toBe(145200);
    expect(reconcil.totalCollectionsPaise).toBe(145200);
    expect(reconcil.salesCollectionVariancePaise).toBe(0);
    expect(reconcil.varianceStatus).toBe('BALANCED');
  });

  // =========================================================================
  // 20. ZERO-LUBE CLOSE PERSISTS ZERO
  // =========================================================================
  it('20. ZERO-LUBE CLOSE PERSISTS ZERO', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    const shiftId = await openShift(cookie);
    await setupFuelReadings(db, shiftId, 10000); // 95200

    await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ collectionType: 'CASH', amount: '952.00', collectedAt: new Date().toISOString() }),
    }), env);

    const closeRes = await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({}),
    }), env);
    expect(closeRes.status).toBe(200);

    const [reconcil] = await db.select().from(schema.shiftFinancialReconciliations).where(eq(schema.shiftFinancialReconciliations.operationalShiftId, shiftId));
    expect(reconcil.lubeSalesRevenuePaise).toBe(0);
  });

  // =========================================================================
  // 21. FINANCIAL RECONCILIATION AUDIT
  // =========================================================================
  it('21. FINANCIAL RECONCILIATION AUDIT', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    const shiftId = await openShift(cookie);
    await setupFuelReadings(db, shiftId, 10000); // 95200

    await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ collectionType: 'CASH', amount: '952.00', collectedAt: new Date().toISOString() }),
    }), env);

    const closeRes = await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({}),
    }), env);
    expect(closeRes.status).toBe(200);

    const [audit] = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, 'FINANCIAL_RECONCILIATION'));
    expect(audit).toBeDefined();
    const val = JSON.parse(audit.newValueJson || '{}');
    expect(val.fuelRevenuePaise).toBe(95200);
    expect(val.lubeRevenuePaise).toBe(0);
    expect(val.authoritativeSalesRevenuePaise).toBe(95200);
    expect(val.totalCollectionsPaise).toBe(95200);
    expect(val.variancePaise).toBe(0);
    expect(val.varianceStatus).toBe('BALANCED');
  });

  // =========================================================================
  // 22. FAILED CLOSE PRESERVES LUBE SOURCE DATA
  // =========================================================================
  it('22. FAILED CLOSE PRESERVES LUBE SOURCE DATA', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    const shiftId = await openShift(cookie);
    const sku = await setupSku(cookie, 'PACK_22', 'PACK', 25000);
    await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantity: "2", soldAt: new Date().toISOString() });

    // Induce shortage without reason
    await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ collectionType: 'CASH', amount: '10.00', collectedAt: new Date().toISOString() }),
    }), env);

    const closeRes = await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({}),
    }), env);
    expect(closeRes.status).toBe(400);

    // Rollback checks
    const [shift] = await db.select().from(schema.operationalShifts).where(eq(schema.operationalShifts.id, shiftId));
    expect(shift.status).toBe('OPEN');

    const sales = await db.select().from(schema.lubeShiftSales).where(eq(schema.lubeShiftSales.operationalShiftId, shiftId));
    expect(sales.length).toBe(1);

    const finRecon = await db.select().from(schema.shiftFinancialReconciliations).where(eq(schema.shiftFinancialReconciliations.operationalShiftId, shiftId));
    expect(finRecon.length).toBe(0);

    const stockRecon = await db.select().from(schema.shiftStockReconciliations).where(eq(schema.shiftStockReconciliations.operationalShiftId, shiftId));
    expect(stockRecon.length).toBe(0);
  });

  // =========================================================================
  // 23. INVENTORY TRANSACTIONS DO NOT COUNT AS REVENUE
  // =========================================================================
  it('23. INVENTORY TRANSACTIONS DO NOT COUNT AS REVENUE', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const sku = await postSku(cookie, { skuCode: 'PACK_23', name: 'PACK_23 SKU', category: 'ENGINE_OIL', stockUnit: 'PACK', reorderThreshold: '10', status: 'ACTIVE' });
    await postPrice(cookie, sku.id, { pricePaisePerUnit: "250.00", effectiveFrom: '2025-01-01', effectiveTo: '2026-12-31', status: 'ACTIVE' });

    // Inventory operations only (no sale)
    await postStock(cookie, sku.id, { transactionType: 'OPENING_BALANCE', quantity: "100", occurredAt: new Date().toISOString() });
    await postStock(cookie, sku.id, { transactionType: 'RECEIPT', quantity: "50", occurredAt: new Date().toISOString() });
    await postStock(cookie, sku.id, { transactionType: 'ADJUSTMENT_IN', quantity: "10", notes: "Audit adjustment", occurredAt: new Date().toISOString() });

    const summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.lubeTotalPaise).toBe(0);
  });

  // =========================================================================
  // 24. READ-ONLY FINANCIAL SUMMARY
  // =========================================================================
  it('24. READ-ONLY FINANCIAL SUMMARY', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    const shiftId = await openShift(cookie);
    const sku = await setupSku(cookie, 'PACK_24', 'PACK', 25000);
    await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantity: "1", soldAt: new Date().toISOString() });

    const summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.lubeTotalPaise).toBe(25000);

    const finRecon = await db.select().from(schema.shiftFinancialReconciliations).where(eq(schema.shiftFinancialReconciliations.operationalShiftId, shiftId));
    expect(finRecon.length).toBe(0);
  });

  // =========================================================================
  // 25. checkedMoneyAdd BASIC
  // =========================================================================
  it('25. checkedMoneyAdd BASIC', () => {
    expect(checkedMoneyAdd(100, 200, 300)).toBe(600);
  });

  // =========================================================================
  // 26. checkedMoneyAdd SAFE BOUNDARY
  // =========================================================================
  it('26. checkedMoneyAdd SAFE BOUNDARY', () => {
    expect(checkedMoneyAdd(Number.MAX_SAFE_INTEGER, 0)).toBe(Number.MAX_SAFE_INTEGER);
    expect(checkedMoneyAdd(Number.MAX_SAFE_INTEGER - 10, 10)).toBe(Number.MAX_SAFE_INTEGER);
  });

  // =========================================================================
  // 27. checkedMoneyAdd OVERFLOW
  // =========================================================================
  it('27. checkedMoneyAdd OVERFLOW', () => {
    expect(() => checkedMoneyAdd(Number.MAX_SAFE_INTEGER, 1)).toThrow('FINANCIAL_AMOUNT_OVERFLOW');
  });

  // =========================================================================
  // 28. checkedMoneyAdd UNSAFE INPUT
  // =========================================================================
  it('28. checkedMoneyAdd UNSAFE INPUT', () => {
    expect(() => checkedMoneyAdd(Number.MAX_SAFE_INTEGER + 1, 0)).toThrow('FINANCIAL_AMOUNT_OVERFLOW');
  });

  // =========================================================================
  // 29. COMBINED SALES OVERFLOW
  // =========================================================================
  it('29. COMBINED SALES OVERFLOW', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    const shiftId = await openShift(cookie);

    // Setup a Lube sale
    const sku = await setupSku(cookie, 'PACK_29', 'PACK', 25000);
    await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantity: "1", soldAt: new Date().toISOString() }); // 25000 paise

    // Set Fuel snapshot price to extreme safe value (8000000000000000 paise)
    await db.update(schema.operationalShiftProductPrices)
      .set({ pricePaisePerUnit: 8000000000000000 })
      .where(eq(schema.operationalShiftProductPrices.operationalShiftId, shiftId));

    // Setup fuel reading matching MS nozzle (10.000 L of MS)
    await setupFuelReadings(db, shiftId, 1000); // 1.000 L of MS -> 8000000000000000 * 1 = 8000000000000000 paise

    // Lube revenue set to safe extreme (2000000000000000 paise)
    await db.update(schema.lubeShiftSales)
      .set({ unitPricePaise: 2000000000000000, revenuePaise: 2000000000000000 })
      .where(eq(schema.lubeShiftSales.operationalShiftId, shiftId));

    // 8000000000000000 + 2000000000000000 = 10000000000000000 > MAX_SAFE_INTEGER (9007199254740991)
    const sumRes = await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/financial-summary`, {
      headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
    }), env);
    expect(sumRes.status).toBe(400);
    const json: any = await sumRes.json();
    expect(json.error.code).toBe('FINANCIAL_AMOUNT_OVERFLOW');

    // Close must also throw and not persist
    const closeRes = await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({}),
    }), env);
    expect(closeRes.status).toBe(400);
    const closeJson: any = await closeRes.json();
    expect(closeJson.error.code).toBe('FINANCIAL_AMOUNT_OVERFLOW');

    const finRecon = await db.select().from(schema.shiftFinancialReconciliations).where(eq(schema.shiftFinancialReconciliations.operationalShiftId, shiftId));
    expect(finRecon.length).toBe(0);
  });

  // =========================================================================
  // 30. CNG REGRESSION
  // =========================================================================
  it('30. CNG REGRESSION', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    const shiftId = await openShift(cookie);
    
    const summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.cngApplicable).toBe(false);
    expect(summary.salesRevenue.cngComplete).toBe(true);
    expect(summary.salesRevenue.cngTotalPaise).toBeNull();
  });
});
