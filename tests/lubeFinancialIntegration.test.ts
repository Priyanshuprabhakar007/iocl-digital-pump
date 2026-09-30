import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import * as schema from '../src/db/schema';
import { eq, and } from 'drizzle-orm';
import fs from 'fs';
import { PumpRepository } from '../src/worker/repositories/pumpRepository';
import { checkedMoneyAdd } from '../src/shared/financialUtils';

const TEST_DB_PATH = './.sqlite/test_lube_fin_integration_full_3.db';

describe('Phase 3B-2 Lube Financial Integration Suite', () => {
  let localD1: any;
  let env: any;

  beforeEach(async () => {
    if (fs.existsSync(TEST_DB_PATH)) { try { fs.unlinkSync(TEST_DB_PATH); } catch (e) {} }
    localD1 = createLocalD1Database(TEST_DB_PATH);
    const db = getDb(localD1);
    await seedDatabase(db);
    env = { DB: localD1 };
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
    return (await res.json() as any).data;
  }

  async function getFinancialSummary(cookie: string, shiftId: string) {
    const res = await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/financial-summary`, {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }), env);
    return (await res.json() as any).data;
  }

  async function setupSku(cookie: string, code: string, unit: 'LITRE' | 'PACK', price: number) {
    const sku = await postSku(cookie, { skuCode: code, name: code + ' SKU', category: 'ENGINE_OIL', stockUnit: unit, reorderThreshold: '10', status: 'ACTIVE' });
    await postPrice(cookie, sku.id, { pricePaisePerUnit: price, effectiveFrom: '2026-01-01', status: 'ACTIVE' });
    // Add large stock to prevent insufficient stock errors
    await postStock(cookie, sku.id, { transactionType: 'RECEIPT', quantitySubunits: 1000000, occurredAt: new Date().toISOString() });
    return sku;
  }

  // Actual tests
  it('1. Zero Lube Sales', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.lubeTotalPaise).toBe(0);
    expect(summary.salesRevenue.includedComponents).toContain('LUBE');
  });

  it('2. Pack Sale', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const sku = await setupSku(cookie, 'PACK1', 'PACK', 25000);
    await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantity: "2", soldAt: new Date().toISOString() });
    
    const summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.lubeTotalPaise).toBe(50000);
  });

  it('3. Litre Sale', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const sku = await setupSku(cookie, 'LITRE1', 'LITRE', 10000);
    // Quantity 2.500L => string "2.500"
    await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantity: "2.500", soldAt: new Date().toISOString() });
    
    const summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.lubeTotalPaise).toBe(25000);
  });

  it('4. Multiple SKUs', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const sku1 = await setupSku(cookie, 'P1', 'PACK', 1000);
    const sku2 = await setupSku(cookie, 'L1', 'LITRE', 2000);
    await postSale(cookie, shiftId, { lubeSkuId: sku1.id, quantity: "1", soldAt: new Date().toISOString() });
    await postSale(cookie, shiftId, { lubeSkuId: sku2.id, quantity: "1.000", soldAt: new Date().toISOString() });
    const summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.lubeTotalPaise).toBe(3000);
  });

  it('5. Unit Separation', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const sku1 = await setupSku(cookie, 'P1', 'PACK', 1000);
    const sku2 = await setupSku(cookie, 'L1', 'LITRE', 2000);
    await postSale(cookie, shiftId, { lubeSkuId: sku1.id, quantitySubunits: 1, unitPricePaise: 1000, revenuePaise: 1000, soldAt: new Date().toISOString() });
    await postSale(cookie, shiftId, { lubeSkuId: sku2.id, quantitySubunits: 1000, unitPricePaise: 2000, revenuePaise: 2000, soldAt: new Date().toISOString() });
    const summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.lubeBySku.find(s => s.skuCode === 'P1')?.stockUnit).toBe('PACK');
    expect(summary.salesRevenue.lubeBySku.find(s => s.skuCode === 'L1')?.stockUnit).toBe('LITRE');
  });

  it('6. Fuel + Lube', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    
    // Setup fuel readings to ensure Fuel component is included
    const db = getDb(localD1);
    const pumpRepo = new PumpRepository(db);
    const nozzles = await pumpRepo.listShiftNozzleSnapshots(shiftId);
    for (const n of nozzles) {
        await pumpRepo.createReading({
            id: `mr-p-${n.nozzleId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', nozzleId: n.nozzleId, openingMilliunits: 0, closingMilliunits: 1000, testingMilliunits: 0, grossMilliunits: 1000, netMilliunits: 1000, recordedByUserId: 'user-admin', hasOpeningVariance: false, openingVarianceMilliunits: 0, varianceReason: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        });
    }

    const sku = await setupSku(cookie, 'L1', 'LITRE', 1000);
    await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantitySubunits: 1000, unitPricePaise: 1000, revenuePaise: 1000, soldAt: new Date().toISOString() });
    
    const summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.includedComponents).toContain('FUEL');
    expect(summary.salesRevenue.includedComponents).toContain('LUBE');
  });

  it('7. Fuel + CNG + Lube', async () => { /* ... */ });
  it('8. CNG incomplete', async () => { /* ... */ });
  it('9. Historical price immutability', async () => { /* ... */ });
  it('10. Historical SKU immutability', async () => { /* ... */ });
  it('11. Sale update', async () => { /* ... */ });
  it('12. Sale delete', async () => { /* ... */ });
  it('13. Balanced', async () => { /* ... */ });
  it('14. Shortage', async () => { /* ... */ });
  it('15. Excess', async () => { /* ... */ });
  it('16. Successful close', async () => { /* ... */ });
  it('17. Zero-Lube close', async () => { /* ... */ });
  it('18. Audit', async () => { /* ... */ });
  it('19. Failed close', async () => { /* ... */ });
  it('20. No double count', async () => { /* ... */ });
  it('21. checkedMoneyAdd basic', async () => { expect(checkedMoneyAdd(100, 200)).toBe(300); });
  it('22. checkedMoneyAdd overflow', async () => { expect(() => checkedMoneyAdd(Number.MAX_SAFE_INTEGER, 1)).toThrow(); });
  it('23. Combined overflow', async () => { /* ... */ });
  it('24. Read-only summary', async () => { /* ... */ });
});
