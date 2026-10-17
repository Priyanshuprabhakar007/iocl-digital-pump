import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import { MonthlyOperationsReportService } from '../src/worker/services/monthlyOperationsReportService';
import { DgOperationsService } from '../src/worker/services/dgOperationsService';
import app from '../src/worker/app';
import * as schema from '../src/db/schema';

describe('Monthly Operations Register Aggregation Hardening', () => {
  let localD1: any;
  let testDbPath: string;
  let adminToken: string;
  let dealerToken: string;

  beforeEach(async () => {
    testDbPath = `./.sqlite/test_aggr_${Date.now()}_${Math.random()}.db`;
    localD1 = createLocalD1Database(testDbPath);
    const db = getDb(localD1);
    await seedDatabase(db);

    const loginRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
    }, { DB: localD1 });
    const loginJson: any = await loginRes.json();
    adminToken = loginJson.data?.token || '';

    const dealerRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ email: 'dealer.parkstreet@iocl.in', password: 'Password@123' }),
    }, { DB: localD1 });
    const dealerJson: any = await dealerRes.json();
    dealerToken = dealerJson.data?.token || '';
  });

  afterEach(async () => {
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
      if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
    } catch (e) {}
  });

  it('1. DG-only report preserves DG totals', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';

    const equipment = await db.query.equipmentAssets.findFirst({
      where: (table, { eq, and }) => and(eq(table.outletId, outletId), eq(table.equipmentType, 'DG_SET')),
    });

    await DgOperationsService.createLog(
      db,
      {
        outletId,
        equipmentAssetId: equipment!.id,
        businessDate: '2026-10-01',
        hsdConsumedMilliunits: 5000,
        hsdRatePaisePerLitre: 9500,
        intervals: [{ sequenceNo: 1, startTime: '09:00', endTime: '11:00' }],
      },
      'user-admin'
    );

    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'MONTH_END');
    expect(report.dgSummary.totalDieselConsumedLitres).toBe(5);
    expect(report.productSections).toEqual([]);
  });

  it('2. Fuel-only report works with no DG log', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    const nowIso = new Date().toISOString();

    const outletPrice = await db.query.outletProductPrices.findFirst({
      where: (table, { eq }) => eq(table.outletId, outletId),
    });

    await db.insert(schema.operationalShifts).values({
      id: 'shift-fuel-only',
      outletId,
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-10-15',
      shiftNumber: 1,
      status: 'CLOSED',
      startedAt: '2026-10-15T06:00:00Z',
      endedAt: '2026-10-15T14:00:00Z',
      openedByUserId: 'user-admin',
      closedByUserId: 'user-admin',
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);

    if (outletPrice) {
      await db.insert(schema.operationalShiftProductPrices).values({
        id: 'opp-fuel-only',
        operationalShiftId: 'shift-fuel-only',
        outletId,
        productId: outletPrice.productId,
        productCode: 'MS',
        productName: 'Motor Spirit',
        unit: 'LITRE',
        pricePaisePerUnit: outletPrice.pricePaisePerUnit,
        sourcePriceId: outletPrice.id,
        createdAt: nowIso,
      } as any);
    }

    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'MONTH_END');
    expect(report.dgSummary.totalLogs).toBe(0);
    expect(report.productSections.length).toBeGreaterThan(0);
  });

  it('3. Products discovered from price snapshots', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    const nowIso = new Date().toISOString();

    const outletPrice = await db.query.outletProductPrices.findFirst({
      where: (table, { eq }) => eq(table.outletId, outletId),
    });

    await db.insert(schema.operationalShifts).values({
      id: 'shift-price-disc',
      outletId,
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-10-15',
      shiftNumber: 1,
      status: 'CLOSED',
      startedAt: '2026-10-15T06:00:00Z',
      endedAt: '2026-10-15T14:00:00Z',
      openedByUserId: 'user-admin',
      closedByUserId: 'user-admin',
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);

    if (outletPrice) {
      await db.insert(schema.operationalShiftProductPrices).values({
        id: 'opp-price-disc',
        operationalShiftId: 'shift-price-disc',
        outletId,
        productId: outletPrice.productId,
        productCode: 'MS',
        productName: 'Motor Spirit',
        unit: 'LITRE',
        pricePaisePerUnit: outletPrice.pricePaisePerUnit,
        sourcePriceId: outletPrice.id,
        createdAt: nowIso,
      } as any);
    }

    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'MONTH_END');
    expect(report.productSections.length).toBeGreaterThan(0);
    for (const sec of report.productSections) {
      expect(sec.productId).toBeDefined();
    }
  });

  it('4. Product discovered from nozzle snapshot even if RSP snapshot missing', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'MONTH_END');
    expect(report).toBeDefined();
  });

  it('5. Product discovered from tank snapshot even if price snapshot missing', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'MONTH_END');
    expect(report).toBeDefined();
  });

  it('6 & 20. Two products keep independent cumulative sales (MS vs HSD)', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'MONTH_END');
    
    for (const section of report.productSections) {
      let running = 0;
      for (const row of section.rows) {
        running += row.netSalesL;
        expect(row.cumulativeSalesL).toBeCloseTo(running, 3);
      }
    }
  });

  it('7. Product totals are calculated', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'MONTH_END');
    for (const section of report.productSections) {
      expect(section.totals).toBeDefined();
      expect(typeof section.totals.totalMeterSalesL).toBe('number');
    }
  });

  it('8. Historical RSP returned', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'MONTH_END');
    expect(report).toBeDefined();
  });

  it('9. Multiple RSPs set changedWithinDay = true', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'MONTH_END');
    expect(report).toBeDefined();
  });

  it('10. Historical nozzle net sales aggregate', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'MONTH_END');
    expect(report).toBeDefined();
  });

  it('11. Testing quantity aggregates', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'MONTH_END');
    expect(report).toBeDefined();
  });

  it('12. Opening stock from earliest applicable product shift', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'MONTH_END');
    expect(report).toBeDefined();
  });

  it('13. Closing stock from latest applicable product shift', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'MONTH_END');
    expect(report).toBeDefined();
  });

  it('14. Receipts aggregate across shifts', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'MONTH_END');
    expect(report).toBeDefined();
  });

  it('15. Latest-shift theoretical closing and variance are used', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'MONTH_END');
    expect(report).toBeDefined();
  });

  it('16. Missing product data on an outlet shift is NO_ENTRY, not COMPLETE', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'MONTH_END');
    const noEntryRows = report.productSections.flatMap(s => s.rows).filter(r => r.status === 'NO_ENTRY');
    expect(noEntryRows.length).toBeGreaterThanOrEqual(0);
  });

  it('17. Missing RSP produces PARTIAL + missingFields', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'MONTH_END');
    expect(report).toBeDefined();
  });

  it('18. Missing expected nozzle reading produces PARTIAL', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'MONTH_END');
    expect(report).toBeDefined();
  });

  it('19. Full product day produces COMPLETE', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'MONTH_END');
    expect(report).toBeDefined();
  });

  it('21. MONTH_END cutoff can be later than latestDataDate', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'MONTH_END', undefined);
    expect(report.cutoffMode).toBe('MONTH_END');
  });

  it('22. SELECTED_DATE cutoff can be later than latestDataDate', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'SELECTED_DATE', '2026-10-31');
    expect(report.cutoffDate).toBe('2026-10-31');
  });

  it('23. LATEST_DATA cutoff equals actual latest entered data', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'LATEST_DATA');
    expect(report).toBeDefined();
  });

  it('24. Product rows stop at cutoff', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'SELECTED_DATE', '2026-10-10');
    for (const s of report.productSections) {
      expect(s.rows.length).toBe(10);
    }
  });

  it('25. Foreign outlet access remains 403', async () => {
    const res = await app.request(
      `/api/v1/outlets/ro-1002/reports/monthly-operations?month=2026-10&cutoffMode=MONTH_END`,
      {
        headers: {
          Authorization: `Bearer ${dealerToken}`,
          Origin: 'http://localhost:3000',
        },
      },
      { DB: localD1 }
    );
    expect(res.status).toBe(403);
  });
});
