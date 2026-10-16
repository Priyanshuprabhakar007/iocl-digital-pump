import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import { MonthlyOperationsReportService } from '../src/worker/services/monthlyOperationsReportService';
import { DgOperationsService } from '../src/worker/services/dgOperationsService';
import app from '../src/worker/app';

describe('Monthly Operations Report Suite', () => {
  let localD1: any;
  let testDbPath: string;
  let adminToken: string;

  beforeAll(async () => {
    testDbPath = `./.sqlite/test_rep_ops_${Date.now()}.db`;
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
  });

  afterAll(async () => {
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
      if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
    } catch (e) {}
  });

  it('generates a report with aggregated DG data', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';

    // Verify DG equipment asset fixture from seed
    const equipment = await db.query.equipmentAssets.findFirst({
      where: (table, { eq, and }) =>
        and(eq(table.outletId, outletId), eq(table.equipmentType, 'DG_SET')),
    });
    expect(equipment).toBeDefined();

    // Create a 5-hour log (08:00 to 13:00 = 300 minutes) with 10 L (10000 milliunits) consumed
    await DgOperationsService.createLog(
      db,
      {
        outletId,
        equipmentAssetId: equipment!.id,
        businessDate: '2026-10-15',
        hsdConsumedMilliunits: 10000,
        hsdRatePaisePerLitre: 9500,
        intervals: [{ sequenceNo: 1, startTime: '08:00', endTime: '13:00' }],
      },
      'user-admin'
    );

    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, 'MONTH_END');
    expect(report.outletId).toBe(outletId);
    expect(report.dgSummary.totalRunHours).toBe(5);
    expect(report.dgSummary.totalDieselConsumedLitres).toBe(10);
    expect(report.dgSection.rows.length).toBeGreaterThanOrEqual(28);
    expect(report.dgSection.totals.totalRunningMinutes).toBe(300);
    expect(report.dgSection.totals.totalRunningHoursStr).toBe('5:00');
    expect(report.dgSection.totals.totalHsdConsumedStr).toBe('10.000');

    // Test API route with new parameters
    const res = await app.request(
      `/api/v1/outlets/${outletId}/reports/monthly-operations?month=${month}&cutoffMode=MONTH_END`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          Origin: 'http://localhost:3000',
        },
      },
      { DB: localD1 }
    );
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.outletId).toBe(outletId);
    expect(json.data.dgSummary.totalRunHours).toBe(5);
  });
});
