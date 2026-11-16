import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import app from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';

/** Isolated seeded local D1 end-to-end day; never imports or activates real calibration charts. */
describe('P0 one-day fuel, calibrated stock and financial reconciliation', () => {
  it('cross-checks persisted nozzle quantities, tank conversion, DSR and collections in integer paise', async () => {
    const dbPath = `./.sqlite/test_p0_daily_finance_${crypto.randomUUID()}.db`;
    const d1 = createLocalD1Database(dbPath);
    try {
      await seedDatabase(getDb(d1));
      const env: any = { DB: d1, ENVIRONMENT: 'development', ALLOWED_ORIGINS: 'http://localhost:3000' };
      const login = await app.fetch(new Request('http://localhost/api/v1/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
      }), env);
      expect(login.status).toBe(200);
      const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
      const req = (url: string, method = 'GET', body?: unknown) => app.fetch(
        new Request('http://localhost' + url, {
          method,
          headers: { Cookie: cookie, Origin: 'http://localhost:3000', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
          body: body === undefined ? undefined : JSON.stringify(body),
        }), env
      );
      const businessDate = '2026-11-20';
      const open = await req('/api/v1/outlets/ro-1001/shifts/open', 'POST', {
        shiftTemplateId: 'st-ro1-1', businessDate,
      });
      expect(open.status).toBe(201);
      const shiftId = (await open.json() as any).data.id;
      const bootstrap = await req(`/api/v1/outlets/ro-1001/daily-operations?businessDate=${businessDate}`);
      expect(bootstrap.status).toBe(200);
      const workday = (await bootstrap.json() as any).data.shifts[0];
      expect(workday.tanks.length).toBeGreaterThan(0);
      expect(workday.nozzles.length).toBeGreaterThan(0);

      // Use only synthetic calibration tables configured by seedDatabase.
      const tankWrite = await req(`/api/v1/shifts/${shiftId}/tank-readings/batch`, 'POST', {
        readings: workday.tanks.flatMap((tank: any) => [
          { tankId: tank.tankId, readingType: 'OPENING', source: 'MANUAL', productDipMm: '1000.000', waterDipMm: '0.000' },
          { tankId: tank.tankId, readingType: 'CLOSING', source: 'MANUAL', productDipMm: '900.000', waterDipMm: '0.000' },
        ]),
      });
      expect(tankWrite.status).toBe(200);
      const tankData = (await tankWrite.json() as any).data.readings;
      expect(tankData).toHaveLength(workday.tanks.length * 2);
      for (const row of tankData) {
        expect(row.netProductVolumeMilliunits).toBeGreaterThan(0);
        expect(row.calculatedVolumeMilliunits ?? row.grossObservedVolumeMilliunits).toBeGreaterThan(0);
      }

      const nozzleWrite = await req(`/api/v1/shifts/${shiftId}/readings/batch`, 'POST', {
        readings: workday.nozzles.map((nozzle: any, index: number) => {
          const opening = Number(nozzle.suggestedOpeningTotalizer || '0.000');
          const sales = index % 2 ? 10 : 20;
          return {
            nozzleId: nozzle.nozzleId,
            openingTotalizer: opening.toFixed(3),
            closingTotalizer: (opening + sales).toFixed(3),
            testingQuantity: '0.000',
          };
        }),
      });
      expect(nozzleWrite.status).toBe(200);

      const stockRes = await req(`/api/v1/shifts/${shiftId}/stock-reconciliation/compute`, 'POST', {});
      expect(stockRes.status).toBe(200);

      const dayRes = await req(`/api/v1/outlets/ro-1001/fuel/daily-summary?businessDate=${businessDate}`);
      expect(dayRes.status).toBe(200);
      const day = (await dayRes.json() as any).data;
      expect(day.status).toBe('COMPLETE');
      expect(day.completion.reconciliationComplete).toBe(true);

      const financeRes = await req(`/api/v1/shifts/${shiftId}/financial-summary`);
      expect(financeRes.status).toBe(200);
      const firstFinance = (await financeRes.json() as any).data;
      expect(firstFinance.salesRevenue.readingCoverage.status).toBe('COMPLETE');
      for (const product of firstFinance.salesRevenue.byProduct) {
        const matchingDaily = day.byProduct.find((p: any) => p.productCode === product.productCode);
        expect(matchingDaily?.netSalesMilliunits).toBe(product.quantityMilliunits);
      }

      // Split collected revenue into cash and UPI without losing a paise.
      const totalPaise = firstFinance.salesRevenue.authoritativeTotalPaise;
      expect(totalPaise).toBeGreaterThan(0);
      const cashPaise = Math.floor(totalPaise / 2);
      const upiPaise = totalPaise - cashPaise;
      const asMoney = (p: number) => `${Math.floor(p / 100)}.${String(p % 100).padStart(2, '0')}`;
      for (const [mode, amount] of [['CASH', cashPaise], ['UPI', upiPaise]] as const) {
        const posted = await req(`/api/v1/shifts/${shiftId}/collections`, 'POST', {
          collectionType: mode, amount: asMoney(amount), collectedAt: '2026-11-20T12:00:00.000Z',
        });
        expect(posted.status).toBe(201);
      }

      const afterRes = await req(`/api/v1/shifts/${shiftId}/financial-summary`);
      expect(afterRes.status).toBe(200);
      const after = (await afterRes.json() as any).data;
      expect(after.collections.cashPaise).toBe(cashPaise);
      expect(after.collections.upiPaise).toBe(upiPaise);
      expect(after.collections.totalPaise).toBe(totalPaise);
      expect(after.variancePaise).toBe(0);
      expect(after.varianceStatus).toBe('BALANCED');
      const count = await d1.prepare('SELECT COUNT(*) AS n FROM shift_collections WHERE operational_shift_id = ?').bind(shiftId).first<{n:number}>();
      expect(count?.n).toBe(2);
    } finally {
      d1.close();
      for (const suffix of ['', '-wal', '-shm']) {
        try { fs.unlinkSync(dbPath + suffix); } catch {}
      }
    }
  });
});
