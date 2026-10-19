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
  let dealerToken: string;

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

    const dealerRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ email: 'dealer.parkstreet@iocl.in', password: 'Password@123' }),
    }, { DB: localD1 });
    const dealerJson: any = await dealerRes.json();
    dealerToken = dealerJson.data?.token || '';
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

    const equipment = await db.query.equipmentAssets.findFirst({
      where: (table, { eq, and }) =>
        and(eq(table.outletId, outletId), eq(table.equipmentType, 'DG_SET')),
    });
    expect(equipment).toBeDefined();

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
  });

  it('GET /api/v1/outlets/:outletId/reports/monthly-operations returns 200 JSON with canonical outlet ID', async () => {
    const res = await app.request(
      '/api/v1/outlets/ro-1001/reports/monthly-operations?month=2026-10&cutoffMode=MONTH_END',
      { headers: { Authorization: `Bearer ${adminToken}` } },
      { DB: localD1 }
    );
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.outletId).toBe('ro-1001');
    expect(json.data.outletName).toContain('Park Street');
  });

  it('GET /api/v1/outlets/:roCode/reports/monthly-operations accepts roCode (RO-110023)', async () => {
    const res = await app.request(
      '/api/v1/outlets/RO-110023/reports/monthly-operations?month=2026-10',
      { headers: { Authorization: `Bearer ${adminToken}` } },
      { DB: localD1 }
    );
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.outletId).toBe('ro-1001');
  });

  it('GET /api/v1/outlets/:outletId/reports/monthly-operations/pdf returns 200 with application/pdf', async () => {
    const res = await app.request(
      '/api/v1/outlets/ro-1001/reports/monthly-operations/pdf?month=2026-10',
      { headers: { Authorization: `Bearer ${adminToken}` } },
      { DB: localD1 }
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('attachment; filename=');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('%PDF');
  });

  it('GET /api/v1/outlets/:roCode/reports/monthly-operations/pdf accepts roCode (RO-110023)', async () => {
    const res = await app.request(
      '/api/v1/outlets/RO-110023/reports/monthly-operations/pdf?month=2026-10',
      { headers: { Authorization: `Bearer ${adminToken}` } },
      { DB: localD1 }
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  });

  it('supports year=2026, month=10, period=complete-month parameter format', async () => {
    const res = await app.request(
      '/api/v1/outlets/ro-1001/reports/monthly-operations?year=2026&month=10&period=complete-month',
      { headers: { Authorization: `Bearer ${adminToken}` } },
      { DB: localD1 }
    );
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.month).toBe('2026-10');
    expect(json.data.cutoffMode).toBe('MONTH_END');
  });

  it('rejects foreign scoped outlet access with 403', async () => {
    const res = await app.request(
      '/api/v1/outlets/ro-1002/reports/monthly-operations?month=2026-10',
      { headers: { Authorization: `Bearer ${dealerToken}` } },
      { DB: localD1 }
    );
    expect(res.status).toBe(403);
    const json: any = await res.json();
    expect(json.error?.code).toBe('FORBIDDEN');
  });

  it('rejects invalid month format with 400 validation error', async () => {
    const res = await app.request(
      '/api/v1/outlets/ro-1001/reports/monthly-operations?month=invalid-month',
      { headers: { Authorization: `Bearer ${adminToken}` } },
      { DB: localD1 }
    );
    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.error?.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for unknown invalid outlet identifier', async () => {
    const res = await app.request(
      '/api/v1/outlets/non-existent-outlet-id/reports/monthly-operations?month=2026-10',
      { headers: { Authorization: `Bearer ${adminToken}` } },
      { DB: localD1 }
    );
    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.error?.code).toBe('OPERATION_FAILED');
    expect(json.error?.message).toContain('not found');
  });
});
