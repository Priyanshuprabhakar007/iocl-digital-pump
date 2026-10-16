import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import { MonthlyOperationsReportService } from '../src/worker/services/monthlyOperationsReportService';
import { DgOperationsService } from '../src/worker/services/dgOperationsService';

describe('Monthly Operations Report Suite', () => {
  let localD1: any;
  let testDbPath: string;

  beforeAll(async () => {
    testDbPath = `./.sqlite/test_rep_ops_${Date.now()}.db`;
    localD1 = createLocalD1Database(testDbPath);
    const db = getDb(localD1);
    await seedDatabase(db);
  });

  afterAll(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  it('generates a report with aggregated DG data', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const month = '2026-10';
    
    // Setup log
    const equipment = await db.query.equipmentAssets.findFirst({
        where: (table, {eq, and}) => and(eq(table.outletId, outletId), eq(table.equipmentType, 'DG_SET'))
    });

    await DgOperationsService.createLog(db, {
      outletId,
      equipmentId: equipment!.id,
      logDate: '2026-10-15',
      openingRunHours: 0,
      closingRunHours: 5,
      dieselConsumedLitres: 10,
      openingDieselBalanceLitres: 100
    }, 'user-admin');

    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month);
    expect(report.outletId).toBe(outletId);
    expect(report.dgSummary.totalRunHours).toBe(5);
    expect(report.dgSummary.totalDieselConsumedLitres).toBe(10);
  });
});
