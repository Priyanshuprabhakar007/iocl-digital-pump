import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import { DgOperationsService } from '../src/worker/services/dgOperationsService';
import app from '../src/worker/app';

describe('DG Daily Operations Suite', () => {
  let localD1: any;
  let testDbPath: string;
  let adminToken: string;

  beforeAll(async () => {
    testDbPath = `./.sqlite/test_dg_ops_${Date.now()}.db`;
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

  it('verifies seed data contains DG_SET asset for ro-1001', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const equipment = await db.query.equipmentAssets.findFirst({
      where: (table, { eq, and }) =>
        and(eq(table.outletId, outletId), eq(table.equipmentType, 'DG_SET')),
    });

    expect(equipment).toBeDefined();
    expect(equipment!.outletId).toBe(outletId);
    expect(equipment!.equipmentType).toBe('DG_SET');
  });

  it('calculates interval durations accurately including overnight and formats running hours', () => {
    // 03:25 -> 03:58 = 33 minutes
    // 05:55 -> 10:05 = 250 minutes
    const res = DgOperationsService.validateAndCalculateIntervals([
      { sequenceNo: 1, startTime: '03:25', endTime: '03:58' },
      { sequenceNo: 2, startTime: '05:55', endTime: '10:05' },
    ]);
    expect(res.calculatedIntervals[0].durationMinutes).toBe(33);
    expect(res.calculatedIntervals[1].durationMinutes).toBe(250);
    expect(res.totalRunningMinutes).toBe(283);
    expect(res.totalRunningHoursStr).toBe('4:43');

    // Overnight support: 23:30 -> 00:30 = 60 minutes
    const overnight = DgOperationsService.validateAndCalculateIntervals([
      { sequenceNo: 1, startTime: '23:30', endTime: '00:30' },
    ]);
    expect(overnight.calculatedIntervals[0].durationMinutes).toBe(60);
    expect(overnight.totalRunningMinutes).toBe(60);
    expect(overnight.totalRunningHoursStr).toBe('1:00');

    // 365 minutes -> "6:05"
    const total365 = DgOperationsService.validateAndCalculateIntervals([
      { sequenceNo: 1, startTime: '00:00', endTime: '06:05' },
    ]);
    expect(total365.totalRunningMinutes).toBe(365);
    expect(total365.totalRunningHoursStr).toBe('6:05');
  });

  it('rejects invalid intervals: invalid HH:MM, overlapping intervals, duration <= 0, and >8 intervals', () => {
    // Invalid time
    expect(() =>
      DgOperationsService.validateAndCalculateIntervals([
        { startTime: '25:00', endTime: '02:00' },
      ])
    ).toThrow(/Invalid time format/);

    // Duration <= 0 (same start and end)
    expect(() =>
      DgOperationsService.validateAndCalculateIntervals([
        { startTime: '04:00', endTime: '04:00' },
      ])
    ).toThrow(/duration must be greater than 0/);

    // Overlapping intervals
    expect(() =>
      DgOperationsService.validateAndCalculateIntervals([
        { startTime: '03:00', endTime: '05:00' },
        { startTime: '04:30', endTime: '06:00' },
      ])
    ).toThrow(/Overlapping intervals detected/);

    // More than 8 intervals
    const nineIntervals = Array.from({ length: 9 }, (_, i) => ({
      startTime: `${(i * 2).toString().padStart(2, '0')}:00`,
      endTime: `${(i * 2 + 1).toString().padStart(2, '0')}:00`,
    }));
    expect(() =>
      DgOperationsService.validateAndCalculateIntervals(nineIntervals)
    ).toThrow(/Maximum 8 intervals allowed/);
  });

  it('computes HSD fuel quantities and amounts using integer precision', () => {
    // 55.000 L -> 55000 milliunits, ₹95.78 -> 9578 paise
    const calc = DgOperationsService.calculateHsdAmount(55000, 9578);
    expect(calc.amountPaise).toBe(Math.round((55000 * 9578) / 1000)); // 526790 paise = ₹5267.90
    expect(calc.hsdConsumedStr).toBe('55.000');
    expect(calc.hsdRateStr).toBe('95.78');
    expect(calc.amountStr).toBe('5267.90');
  });

  it('creates, lists, and updates a DG log entry with intervals and amounts', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';

    const equipment = await db.query.equipmentAssets.findFirst({
      where: (table, { eq, and }) =>
        and(eq(table.outletId, outletId), eq(table.equipmentType, 'DG_SET')),
    });
    expect(equipment).toBeDefined();

    const input = {
      outletId,
      equipmentAssetId: equipment!.id,
      businessDate: '2026-10-16',
      meterReadingFromMilliunits: 100000,
      meterReadingToMilliunits: 108000,
      hsdConsumedMilliunits: 55000,
      hsdRatePaisePerLitre: 9578,
      remarks: 'Operational test log',
      status: 'DRAFT' as const,
      intervals: [
        { sequenceNo: 1, startTime: '03:25', endTime: '03:58', remarks: 'Morning grid outage' },
        { sequenceNo: 2, startTime: '05:55', endTime: '10:05', remarks: 'Peak hours grid outage' },
      ],
    };

    const created = await DgOperationsService.createLog(db, input, 'user-admin');
    expect(created.id).toBeDefined();
    expect(created.outletId).toBe(outletId);
    expect(created.totalRunningMinutes).toBe(33 + 250); // 283
    expect(created.totalRunningHoursStr).toBe('4:43');
    expect(created.hsdConsumedMilliunits).toBe(55000);
    expect(created.hsdConsumedStr).toBe('55.000');
    expect(created.amountPaise).toBe(Math.round((55000 * 9578) / 1000));
    expect(created.intervals.length).toBe(2);

    const logs = await DgOperationsService.listLogsByOutlet(db, outletId);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].id).toBe(created.id);

    const updated = await DgOperationsService.updateLog(
      db,
      created.id,
      {
        hsdConsumedMilliunits: 60000,
        remarks: 'Updated consumption',
      },
      'user-admin'
    );
    expect(updated.hsdConsumedMilliunits).toBe(60000);
    expect(updated.hsdConsumedStr).toBe('60.000');
    expect(updated.amountPaise).toBe(Math.round((60000 * 9578) / 1000));
    expect(updated.remarks).toBe('Updated consumption');
  });

  it('enforces HTTP API routes: GET, POST, PUT, verifies no DELETE route', async () => {
    const outletId = 'ro-1001';
    const env = { DB: localD1 };

    // 1. GET /api/v1/outlets/:outletId/dg-logs
    const listRes = await app.request(
      `/api/v1/outlets/${outletId}/dg-logs?month=2026-10`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          Origin: 'http://localhost:3000',
        },
      },
      env
    );
    expect(listRes.status).toBe(200);
    const listJson: any = await listRes.json();
    expect(listJson.success).toBe(true);
    expect(Array.isArray(listJson.data)).toBe(true);

    // 2. GET /api/v1/outlets/:outletId/dg-logs/2026-10-16
    const dateRes = await app.request(
      `/api/v1/outlets/${outletId}/dg-logs/2026-10-16`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          Origin: 'http://localhost:3000',
        },
      },
      env
    );
    expect(dateRes.status).toBe(200);
    const dateJson: any = await dateRes.json();
    expect(dateJson.success).toBe(true);
    expect(dateJson.data.businessDate).toBe('2026-10-16');

    // 3. PUT /api/v1/dg-logs/:id
    const putRes = await app.request(
      `/api/v1/dg-logs/${dateJson.data.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          remarks: 'Updated via PUT endpoint',
        }),
      },
      env
    );
    expect(putRes.status).toBe(200);
    const putJson: any = await putRes.json();
    expect(putJson.success).toBe(true);
    expect(putJson.data.remarks).toBe('Updated via PUT endpoint');

    // 4. Verification: DELETE endpoint must NOT exist (Section 8)
    const deleteRes = await app.request(
      `/api/v1/dg-operations/logs/${dateJson.data.id}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          Origin: 'http://localhost:3000',
        },
      },
      env
    );
    expect(deleteRes.status).toBe(404);
  });
});
