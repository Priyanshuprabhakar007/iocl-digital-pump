import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import * as schema from '../src/db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import { LubeShiftSummarySkuItem } from '../src/shared/types';
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

  it('1. Zero Lube Sales', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.lubeTotalPaise).toBe(0);
    expect(summary.salesRevenue.includedComponents).toContain('LUBE');
    expect(summary.salesRevenue.pendingComponents).not.toContain('LUBE');
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
    await postSale(cookie, shiftId, { lubeSkuId: sku.id, quantity: "2.500", soldAt: new Date().toISOString() });
    const summary = await getFinancialSummary(cookie, shiftId);
    expect(summary.salesRevenue.lubeTotalPaise).toBe(25000);
  });

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

});
