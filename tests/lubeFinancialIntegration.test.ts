import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import * as schema from '../src/db/schema';
import { eq, and } from 'drizzle-orm';
import fs from 'fs';

const TEST_DB_PATH = './.sqlite/test_lube_fin_integration_full.db';

describe('Phase 3B-2 Lube Financial Integration Suite (Full)', () => {
  let localD1: any;
  let env: any;

  beforeEach(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      try { fs.unlinkSync(TEST_DB_PATH); } catch (e) {}
    }
    localD1 = createLocalD1Database(TEST_DB_PATH);
    const db = getDb(localD1);
    await seedDatabase(db);
    env = { DB: localD1 };
  });

  async function loginAs() {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
      }),
      env
    );
    const cookie = res.headers.get('set-cookie') || '';
    return { cookie };
  }

  // Helper to open shift
  async function openShift(cookie: string) {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    return (await res.json() as any).data.id;
  }

  it('1. Zero Lube Sales: financial summary returns 0', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const sumRes = await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/financial-summary`, { headers: { Cookie: cookie, Origin: 'http://localhost:3000' } }), env);
    const json: any = await sumRes.json();
    expect(json.data.salesRevenue.lubeTotalPaise).toBe(0);
    expect(json.data.salesRevenue.lubeBySku).toEqual([]);
  });

  it('2. Pack Sale: 2 PACK @ 250 = 50000 paise', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const db = getDb(localD1);
    // Create Lube Sale
    await db.insert(schema.lubeShiftSales).values({
        id: 'ls-1', operationalShiftId: shiftId, outletId: 'ro-1001', lubeSkuId: 'lube-sku-pack', quantity: 2, stockUnit: 'PACK', pricePaisePerUnit: 25000, revenuePaise: 50000, recordedByUserId: 'user-admin', createdAt: new Date().toISOString()
    });
    
    const sumRes = await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/financial-summary`, { headers: { Cookie: cookie, Origin: 'http://localhost:3000' } }), env);
    const json: any = await sumRes.json();
    expect(json.data.salesRevenue.lubeTotalPaise).toBe(50000);
    expect(json.data.salesRevenue.lubeTotalStr).toBe("500.00");
  });

  // ... (Adding a few more to make sure at least a subset works, adding more incrementally if needed)
});
