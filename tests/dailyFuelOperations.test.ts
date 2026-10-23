import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import { MonthlyOperationsReportService } from '../src/worker/services/monthlyOperationsReportService';
import app from '../src/worker/app';
import * as schema from '../src/db/schema';

describe('Phase 3: Daily Fuel Operations + DSR Workflow', () => {
  let localD1: any;
  let testDbPath: string;
  let adminToken: string;
  let dealerToken: string;
  const nowIso = '2026-10-15T06:00:00.000Z';

  beforeEach(async () => {
    testDbPath = `./.sqlite/test_daily_fuel_${Date.now()}_${Math.random()}.db`;
    localD1 = createLocalD1Database(testDbPath);
    const db = getDb(localD1);
    await seedDatabase(db);

    // Add nozzles 3 & 4 to MPD 1 and nozzles 3 & 4 to MPD 2 (so 2 dispensers have 6 nozzles, and adding MPD 3 with 6 nozzles = 12 nozzles)
    await db.insert(schema.nozzles).values([
      {
        id: 'nozz-ro1-1-3',
        outletId: 'ro-1001',
        dispenserId: 'disp-ro1-1',
        nozzleNumber: 3,
        productId: 'prod-xp95',
        tankId: 'tank-ro1-3',
        status: 'ACTIVE',
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: 'user-admin',
      },
      {
        id: 'nozz-ro1-1-4',
        outletId: 'ro-1001',
        dispenserId: 'disp-ro1-1',
        nozzleNumber: 4,
        productId: 'prod-hsd',
        tankId: 'tank-ro1-2',
        status: 'ACTIVE',
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: 'user-admin',
      },
      {
        id: 'nozz-ro1-2-3',
        outletId: 'ro-1001',
        dispenserId: 'disp-ro1-2',
        nozzleNumber: 3,
        productId: 'prod-xp95',
        tankId: 'tank-ro1-3',
        status: 'ACTIVE',
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: 'user-admin',
      },
      {
        id: 'nozz-ro1-2-4',
        outletId: 'ro-1001',
        dispenserId: 'disp-ro1-2',
        nozzleNumber: 4,
        productId: 'prod-hsd',
        tankId: 'tank-ro1-2',
        status: 'ACTIVE',
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: 'user-admin',
      },
    ] as any);

    // Seed a prior CLOSED shift on 2026-10-14 for continuity & immutability tests
    await db.insert(schema.operationalShifts).values({
      id: 'shift-seed-closed-1',
      outletId: 'ro-1001',
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-10-14',
      status: 'CLOSED',
      startedAt: '2026-10-14T06:00:00Z',
      closedAt: '2026-10-14T14:00:00Z',
      openedByUserId: 'user-admin',
      closedByUserId: 'user-admin',
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);

    await db.insert(schema.nozzleMeterReadings).values({
      id: 'nmr-seed-closed-1',
      operationalShiftId: 'shift-seed-closed-1',
      outletId: 'ro-1001',
      nozzleId: 'nozz-ro1-1-1',
      openingTotalizerMilliunits: 125000000,
      closingTotalizerMilliunits: 125540250,
      grossSalesQuantityMilliunits: 540250,
      testingQuantityMilliunits: 0,
      netSalesQuantityMilliunits: 540250,
      hasOpeningVariance: false,
      recordedByUserId: 'user-admin',
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);

    const loginRes = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
      },
      { DB: localD1 }
    );
    const loginJson: any = await loginRes.json();
    adminToken = loginJson.data?.token || '';

    const dealerRes = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'dealer.parkstreet@iocl.in', password: 'Password@123' }),
      },
      { DB: localD1 }
    );
    const dealerJson: any = await dealerRes.json();
    dealerToken = dealerJson.data?.token || '';
  });

  afterEach(async () => {
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
      if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
    } catch {}
  });

  async function req(path: string, method = 'GET', body?: any, token = adminToken) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Origin: 'http://localhost:3000',
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    return app.request(
      path,
      {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      { DB: localD1 }
    );
  }

  it('1. daily-summary for date with no shifts -> NOT_STARTED', async () => {
    const res = await req('/api/v1/outlets/ro-1001/fuel/daily-summary?businessDate=2026-11-01');
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('NOT_STARTED');
    expect(json.data.dayEntryStatus).toBe('NO_ENTRY');
    expect(json.data.shiftsCount).toBe(0);
    expect(json.data.byProduct).toEqual([]);
    expect(json.data.byDispenser).toEqual([]);
  });

  it('2. daily-summary for open shift with partial readings -> IN_PROGRESS', async () => {
    // Open a shift on 2026-10-15
    const openRes = await req('/api/v1/outlets/ro-1001/shifts/open', 'POST', {
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-10-15',
    });
    expect(openRes.status).toBe(201);
    const shift = ((await openRes.json()) as any).data;

    // Enter only 1 nozzle reading (partial)
    const readRes = await req(`/api/v1/shifts/${shift.id}/readings`, 'POST', {
      nozzleId: 'nozz-ro1-1-1',
      openingTotalizer: '125540.250',
      closingTotalizer: '125640.250',
      testingQuantity: '0.000',
    });
    expect(readRes.status).toBe(201);

    const sumRes = await req('/api/v1/outlets/ro-1001/fuel/daily-summary?businessDate=2026-10-15');
    expect(sumRes.status).toBe(200);
    const summary = ((await sumRes.json()) as any).data;
    expect(summary.status).toBe('IN_PROGRESS');
    expect(summary.shiftsCount).toBe(1);
    expect(summary.completion.nozzleMeterReadings).toBe(1);
    expect(summary.completion.expectedNozzles).toBeGreaterThan(1);
    expect(summary.missingFields.length).toBeGreaterThan(0);
  });

  it('3. daily-summary for complete shift -> COMPLETE', async () => {
    const openRes = await req('/api/v1/outlets/ro-1001/shifts/open', 'POST', {
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-10-15',
    });
    expect(openRes.status).toBe(201);
    const shift = ((await openRes.json()) as any).data;

    // Bootstrap to get all tanks and nozzles
    const bootRes = await req('/api/v1/outlets/ro-1001/daily-operations?businessDate=2026-10-15');
    expect(bootRes.status).toBe(200);
    const boot = ((await bootRes.json()) as any).data;
    const ws = boot.shifts[0];

    // Record OPENING and CLOSING tank dips via batch
    const tankBatchPayload = ws.tanks.flatMap((t: any) => [
      {
        tankId: t.tankId,
        readingType: 'OPENING',
        source: 'MANUAL',
        productDipMm: '1000.000',
        waterDipMm: '0.000',
      },
      {
        tankId: t.tankId,
        readingType: 'CLOSING',
        source: 'MANUAL',
        productDipMm: '900.000',
        waterDipMm: '0.000',
      },
    ]);
    const tbRes = await req(`/api/v1/shifts/${shift.id}/tank-readings/batch`, 'POST', {
      readings: tankBatchPayload,
    });
    expect(tbRes.status).toBe(200);

    // Record all nozzle meter readings via batch
    const nozzleBatchPayload = ws.nozzles.map((n: any) => {
      const openVal = n.suggestedOpeningTotalizer || '0.000';
      const openNum = Number(openVal);
      return {
        nozzleId: n.nozzleId,
        openingTotalizer: openVal,
        closingTotalizer: (openNum + 100).toFixed(3),
        testingQuantity: '0.000',
      };
    });
    const nbRes = await req(`/api/v1/shifts/${shift.id}/readings/batch`, 'POST', {
      readings: nozzleBatchPayload,
    });
    expect(nbRes.status).toBe(200);

    // Compute reconciliation
    const reconRes = await req(`/api/v1/shifts/${shift.id}/stock-reconciliation/compute`, 'POST', {});
    expect(reconRes.status).toBe(200);

    const sumRes = await req('/api/v1/outlets/ro-1001/fuel/daily-summary?businessDate=2026-10-15');
    expect(sumRes.status).toBe(200);
    const summary = ((await sumRes.json()) as any).data;
    expect(summary.status).toBe('COMPLETE');
    expect(summary.dayEntryStatus).toBe('COMPLETE');
    expect(summary.completion.reconciliationComplete).toBe(true);
    expect(summary.missingFields).toEqual([]);
  });

  it('4. tank opening dip converts to volume using calibration chart', async () => {
    const openRes = await req('/api/v1/outlets/ro-1001/shifts/open', 'POST', {
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-10-15',
    });
    const shift = ((await openRes.json()) as any).data;

    // Tank 1 (tank-ro1-1) has 1250mm = 11500L (11,500,000 milliunits) in calibration table
    const tbRes = await req(`/api/v1/shifts/${shift.id}/tank-readings/batch`, 'POST', {
      readings: [
        {
          tankId: 'tank-ro1-1',
          readingType: 'OPENING',
          source: 'MANUAL',
          productDipMm: '1250.000',
          waterDipMm: '0.000',
        },
      ],
    });
    expect(tbRes.status).toBe(200);
    const tbJson: any = await tbRes.json();
    const reading = tbJson.data.readings[0];
    expect(reading.grossObservedVolumeMilliunits).toBe(11500000);
    expect(reading.netProductVolumeMilliunits).toBe(11500000);
    expect(reading.netProductVolumeStr).toBe('11500.000');
  });

  it('5. tank closing dip converts to volume using calibration chart', async () => {
    const openRes = await req('/api/v1/outlets/ro-1001/shifts/open', 'POST', {
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-10-15',
    });
    const shift = ((await openRes.json()) as any).data;

    // Tank 1 at 1000mm => 8500L (8,500,000 milliunits)
    const tbRes = await req(`/api/v1/shifts/${shift.id}/tank-readings/batch`, 'POST', {
      readings: [
        {
          tankId: 'tank-ro1-1',
          readingType: 'CLOSING',
          source: 'MANUAL',
          productDipMm: '1000.000',
          waterDipMm: '0.000',
        },
      ],
    });
    expect(tbRes.status).toBe(200);
    const tbJson: any = await tbRes.json();
    const reading = tbJson.data.readings[0];
    expect(reading.readingType).toBe('CLOSING');
    expect(reading.grossObservedVolumeMilliunits).toBe(8500000);
    expect(reading.netProductVolumeMilliunits).toBe(8500000);
  });

  it('6. water dip subtracts water volume correctly', async () => {
    const openRes = await req('/api/v1/outlets/ro-1001/shifts/open', 'POST', {
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-10-15',
    });
    const shift = ((await openRes.json()) as any).data;

    // Tank 1: 250mm water dip = 1200L (1,200,000 milliunits)
    // Product dip 1000mm = 8500L (8,500,000 milliunits)
    // Net product volume = 8,500,000 - 1,200,000 = 7,300,000 milliunits (7300.000 L)
    const tbRes = await req(`/api/v1/shifts/${shift.id}/tank-readings/batch`, 'POST', {
      readings: [
        {
          tankId: 'tank-ro1-1',
          readingType: 'OPENING',
          source: 'MANUAL',
          productDipMm: '1000.000',
          waterDipMm: '250.000',
        },
      ],
    });
    expect(tbRes.status).toBe(200);
    const reading = ((await tbRes.json()) as any).data.readings[0];
    expect(reading.grossObservedVolumeMilliunits).toBe(8500000);
    expect(reading.waterVolumeMilliunits).toBe(1200000);
    expect(reading.netProductVolumeMilliunits).toBe(7300000);
    expect(reading.netProductVolumeStr).toBe('7300.000');
  });

  it('7. missing calibration chart blocks volume conversion and sets BLOCKED status', async () => {
    const db = getDb(localD1);
    const openRes = await req('/api/v1/outlets/ro-1001/shifts/open', 'POST', {
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-10-15',
    });
    const shift = ((await openRes.json()) as any).data;

    // Delete calibration points for tank-ro1-1
    await db
      .delete(schema.tankCalibrationPoints)
      .where(eq(schema.tankCalibrationPoints.tankId, 'tank-ro1-1'));

    // Summary must show BLOCKED and TANK CALIBRATION REQUIRED
    const sumRes = await req('/api/v1/outlets/ro-1001/fuel/daily-summary?businessDate=2026-10-15');
    expect(sumRes.status).toBe(200);
    const summary = ((await sumRes.json()) as any).data;
    expect(summary.status).toBe('BLOCKED');
    expect(summary.completion.uncalibratedTanksCount).toBe(1);
    expect(summary.missingFields.some((m: string) => m.includes('TANK CALIBRATION REQUIRED'))).toBe(
      true
    );

    // Attempting to convert dip to volume must fail with CALIBRATION_CHART_MISSING
    const tbRes = await req(`/api/v1/shifts/${shift.id}/tank-readings/batch`, 'POST', {
      readings: [
        {
          tankId: 'tank-ro1-1',
          readingType: 'OPENING',
          source: 'MANUAL',
          productDipMm: '1000.000',
          waterDipMm: '0.000',
        },
      ],
    });
    expect(tbRes.status).toBe(400);
    const tbErr = (await tbRes.json()) as any;
    expect(tbErr.error.code).toBe('CALIBRATION_NOT_AVAILABLE');
  });

  it('8. all shift snapshot nozzles appear in entry grid (12 nozzles when 12 configured)', async () => {
    const db = getDb(localD1);
    // ro-1001 has 6 nozzles seeded on 2 dispensers. Add 1 more dispenser with 6 nozzles = 12 nozzles total
    await db.insert(schema.dispensers).values({
      id: 'disp-ro1-3',
      outletId: 'ro-1001',
      dispenserNumber: 3,
      name: 'MPD 3 - Highway',
      manufacturer: 'Gilbarco',
      model: 'Encore 500S',
      serialNumber: 'GVR-RO1-003',
      nozzleCapacity: 6,
      status: 'ACTIVE',
      commissionedAt: '2020-01-01',
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: 'user-admin',
    });

    for (let n = 1; n <= 4; n++) {
      await db.insert(schema.nozzles).values({
        id: `nozz-ro1-3-${n}`,
        outletId: 'ro-1001',
        dispenserId: 'disp-ro1-3',
        nozzleNumber: n,
        productId: n <= 2 ? 'prod-ms' : 'prod-hsd',
        tankId: n <= 2 ? 'tank-ro1-1' : 'tank-ro1-2',
        status: 'ACTIVE',
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: 'user-admin',
      });
    }

    const openRes = await req('/api/v1/outlets/ro-1001/shifts/open', 'POST', {
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-10-15',
    });
    expect(openRes.status).toBe(201);

    const bootRes = await req('/api/v1/outlets/ro-1001/daily-operations?businessDate=2026-10-15');
    expect(bootRes.status).toBe(200);
    const boot = ((await bootRes.json()) as any).data;
    expect(boot.shifts[0].nozzles.length).toBe(12);
    expect(boot.dailySummary.completion.expectedNozzles).toBe(12);
  });

  it('9. nozzle gross sales = closing - opening', async () => {
    const openRes = await req('/api/v1/outlets/ro-1001/shifts/open', 'POST', {
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-10-15',
    });
    const shift = ((await openRes.json()) as any).data;

    const rRes = await req(`/api/v1/shifts/${shift.id}/readings`, 'POST', {
      nozzleId: 'nozz-ro1-1-1',
      openingTotalizer: '125540.250',
      closingTotalizer: '125790.750',
      testingQuantity: '0.000',
    });
    expect(rRes.status).toBe(201);
    const r = ((await rRes.json()) as any).data;
    expect(r.grossSalesQuantityMilliunits).toBe(250500);
    expect(r.grossSalesQuantityStr).toBe('250.500');
  });

  it('10. nozzle net sales = gross - testing', async () => {
    const openRes = await req('/api/v1/outlets/ro-1001/shifts/open', 'POST', {
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-10-15',
    });
    const shift = ((await openRes.json()) as any).data;

    const rRes = await req(`/api/v1/shifts/${shift.id}/readings`, 'POST', {
      nozzleId: 'nozz-ro1-1-1',
      openingTotalizer: '125540.250',
      closingTotalizer: '125790.750',
      testingQuantity: '5.250',
    });
    expect(rRes.status).toBe(201);
    const r = ((await rRes.json()) as any).data;
    expect(r.grossSalesQuantityMilliunits).toBe(250500);
    expect(r.testingQuantityMilliunits).toBe(5250);
    expect(r.netSalesQuantityMilliunits).toBe(245250);
    expect(r.netSalesQuantityStr).toBe('245.250');
  });

  it('11. closing < opening rejected', async () => {
    const openRes = await req('/api/v1/outlets/ro-1001/shifts/open', 'POST', {
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-10-15',
    });
    const shift = ((await openRes.json()) as any).data;

    const rRes = await req(`/api/v1/shifts/${shift.id}/readings`, 'POST', {
      nozzleId: 'nozz-ro1-1-1',
      openingTotalizer: '125540.250',
      closingTotalizer: '125500.000',
      testingQuantity: '0.000',
    });
    expect(rRes.status).toBe(400);
    const err = (await rRes.json()) as any;
    expect(err.error.code).toBe('VALIDATION_ERROR');
  });

  it('12. testing > gross rejected', async () => {
    const openRes = await req('/api/v1/outlets/ro-1001/shifts/open', 'POST', {
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-10-15',
    });
    const shift = ((await openRes.json()) as any).data;

    const rRes = await req(`/api/v1/shifts/${shift.id}/readings`, 'POST', {
      nozzleId: 'nozz-ro1-1-1',
      openingTotalizer: '125540.250',
      closingTotalizer: '125550.250',
      testingQuantity: '15.000',
    });
    expect(rRes.status).toBe(400);
    const err = (await rRes.json()) as any;
    expect(err.error.code).toBe('VALIDATION_ERROR');
  });

  it('13. opening continuity auto-suggests from previous closed shift', async () => {
    const openRes = await req('/api/v1/outlets/ro-1001/shifts/open', 'POST', {
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-10-15',
    });
    expect(openRes.status).toBe(201);

    // Seeded closed shift has nozz-ro1-1-1 closing totalizer = 125540.250
    const bootRes = await req('/api/v1/outlets/ro-1001/daily-operations?businessDate=2026-10-15');
    expect(bootRes.status).toBe(200);
    const boot = ((await bootRes.json()) as any).data;
    const nozz1 = boot.shifts[0].nozzles.find((n: any) => n.nozzleId === 'nozz-ro1-1-1');
    expect(nozz1.suggestedOpeningTotalizer).toBe('125540.250');
    expect(nozz1.suggestedOpeningTotalizerMilliunits).toBe(125540250);
  });

  it('14. opening variance requires varianceReason', async () => {
    const openRes = await req('/api/v1/outlets/ro-1001/shifts/open', 'POST', {
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-10-15',
    });
    const shift = ((await openRes.json()) as any).data;

    // Seeded previous closing for nozz-ro1-1-1 is 125540.250; send 125545.000 without varianceReason
    const rRes = await req(`/api/v1/shifts/${shift.id}/readings`, 'POST', {
      nozzleId: 'nozz-ro1-1-1',
      openingTotalizer: '125545.000',
      closingTotalizer: '125645.000',
      testingQuantity: '0.000',
    });
    expect(rRes.status).toBe(400);
    const err = (await rRes.json()) as any;
    expect(err.error.code).toBe('VARIANCE_REASON_REQUIRED');
  });

  it('15. opening variance with reason succeeds and records variance', async () => {
    const openRes = await req('/api/v1/outlets/ro-1001/shifts/open', 'POST', {
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-10-15',
    });
    const shift = ((await openRes.json()) as any).data;

    const rRes = await req(`/api/v1/shifts/${shift.id}/readings`, 'POST', {
      nozzleId: 'nozz-ro1-1-1',
      openingTotalizer: '125545.000',
      closingTotalizer: '125645.000',
      testingQuantity: '0.000',
      varianceReason: 'Weights and Measures calibration run between shifts',
    });
    expect(rRes.status).toBe(201);
    const r = ((await rRes.json()) as any).data;
    expect(r.hasOpeningVariance).toBe(true);
    expect(r.openingVarianceMilliunits).toBe(4750);
    expect(r.varianceReason).toBe('Weights and Measures calibration run between shifts');
  });

  it('16. DU/MPD total equals sum of nozzle net sales and groups by product', async () => {
    const openRes = await req('/api/v1/outlets/ro-1001/shifts/open', 'POST', {
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-10-15',
    });
    const shift = ((await openRes.json()) as any).data;

    // Dispenser 1 has nozz-ro1-1-1 (MS), nozz-ro1-1-2 (MS), nozz-ro1-1-3 (XP95), nozz-ro1-1-4 (HSD)
    // Net sales: N1=120L, N2=110L, N3=90L, N4=130L => MPD #1 Total = 450L
    const batchRes = await req(`/api/v1/shifts/${shift.id}/readings/batch`, 'POST', {
      readings: [
        {
          nozzleId: 'nozz-ro1-1-1',
          openingTotalizer: '125540.250',
          closingTotalizer: '125660.250',
          testingQuantity: '0.000',
        },
        {
          nozzleId: 'nozz-ro1-1-2',
          openingTotalizer: '88320.000',
          closingTotalizer: '88430.000',
          testingQuantity: '0.000',
        },
        {
          nozzleId: 'nozz-ro1-1-3',
          openingTotalizer: '44225.750',
          closingTotalizer: '44315.750',
          testingQuantity: '0.000',
        },
        {
          nozzleId: 'nozz-ro1-1-4',
          openingTotalizer: '211450.500',
          closingTotalizer: '211580.500',
          testingQuantity: '0.000',
        },
      ],
    });
    expect(batchRes.status).toBe(200);

    const sumRes = await req('/api/v1/outlets/ro-1001/fuel/daily-summary?businessDate=2026-10-15');
    expect(sumRes.status).toBe(200);
    const summary = ((await sumRes.json()) as any).data;
    const mpd1 = summary.byDispenser.find((d: any) => d.dispenserId === 'disp-ro1-1');
    expect(mpd1).toBeDefined();
    expect(mpd1.netSalesMilliunits).toBe(450000);
    expect(mpd1.netSalesL).toBe(450);

    // Check product sub-totals within MPD #1:
    // nozz-ro1-1-1 is MS (120L), nozz-ro1-1-2 is HSD (110L), nozz-ro1-1-3 is XP95 (90L), nozz-ro1-1-4 is HSD (130L)
    const msSub = mpd1.byProduct.find((p: any) => p.productCode === 'MS');
    const xp95Sub = mpd1.byProduct.find((p: any) => p.productCode === 'XP95');
    const hsdSub = mpd1.byProduct.find((p: any) => p.productCode === 'HSD');
    expect(msSub.netSalesL).toBe(120);
    expect(xp95Sub.netSalesL).toBe(90);
    expect(hsdSub.netSalesL).toBe(240);
  });

  it('17. product total equals sum of product nozzle net sales across dispensers', async () => {
    const openRes = await req('/api/v1/outlets/ro-1001/shifts/open', 'POST', {
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-10-15',
    });
    const shift = ((await openRes.json()) as any).data;

    // MS nozzles: nozz-ro1-1-1 on MPD 1 (120L) and nozz-ro1-2-1 on MPD 2 (110L) => total MS = 230L
    // HSD nozzles: nozz-ro1-1-4 on MPD 1 (130L) and nozz-ro1-2-2 on MPD 2 (170L) => total HSD = 300L
    const batchRes = await req(`/api/v1/shifts/${shift.id}/readings/batch`, 'POST', {
      readings: [
        {
          nozzleId: 'nozz-ro1-1-1',
          openingTotalizer: '125540.250',
          closingTotalizer: '125660.250',
          testingQuantity: '0.000',
        },
        {
          nozzleId: 'nozz-ro1-2-1',
          openingTotalizer: '88320.000',
          closingTotalizer: '88430.000',
          testingQuantity: '0.000',
        },
        {
          nozzleId: 'nozz-ro1-1-4',
          openingTotalizer: '211450.500',
          closingTotalizer: '211580.500',
          testingQuantity: '0.000',
        },
        {
          nozzleId: 'nozz-ro1-2-2',
          openingTotalizer: '311200.000',
          closingTotalizer: '311370.000',
          testingQuantity: '0.000',
        },
      ],
    });
    expect(batchRes.status).toBe(200);

    const sumRes = await req('/api/v1/outlets/ro-1001/fuel/daily-summary?businessDate=2026-10-15');
    const summary = ((await sumRes.json()) as any).data;

    const msProd = summary.byProduct.find((p: any) => p.productCode === 'MS');
    const hsdProd = summary.byProduct.find((p: any) => p.productCode === 'HSD');
    expect(msProd.netSalesMilliunits).toBe(230000);
    expect(msProd.netSalesL).toBe(230);
    expect(hsdProd.netSalesMilliunits).toBe(300000);
    expect(hsdProd.netSalesL).toBe(300);
  });

  it('18, 19, 20, 21, 22. multi-shift day uses earliest shift opening stock, latest shift closing stock, sums receipts once, and computes theoretical closing & variance accurately', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const businessDate = '2026-10-20';

    // Insert 2 chronological shifts on 2026-10-20
    await db.insert(schema.operationalShifts).values([
      {
        id: 'shift-ms-1',
        outletId,
        shiftTemplateId: 'st-ro1-1',
        businessDate,
        status: 'CLOSED',
        startedAt: '2026-10-20T06:00:00Z',
        closedAt: '2026-10-20T14:00:00Z',
        openedByUserId: 'user-admin',
        closedByUserId: 'user-admin',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 'shift-ms-2',
        outletId,
        shiftTemplateId: 'st-ro1-2',
        businessDate,
        status: 'CLOSED',
        startedAt: '2026-10-20T14:00:00Z',
        closedAt: '2026-10-20T22:00:00Z',
        openedByUserId: 'user-admin',
        closedByUserId: 'user-admin',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ] as any);

    await db.insert(schema.operationalShiftProductPrices).values([
      {
        id: 'ospp-ms-1',
        operationalShiftId: 'shift-ms-1',
        outletId,
        productId: 'prod-ms',
        productCode: 'MS',
        productName: 'Motor Spirit (Petrol)',
        productCategory: 'MS',
        unit: 'LITRE',
        pricePaisePerUnit: 10000,
        sourcePriceId: 'opp-seed-1',
        createdAt: nowIso,
      },
      {
        id: 'ospp-ms-2',
        operationalShiftId: 'shift-ms-2',
        outletId,
        productId: 'prod-ms',
        productCode: 'MS',
        productName: 'Motor Spirit (Petrol)',
        productCategory: 'MS',
        unit: 'LITRE',
        pricePaisePerUnit: 10000,
        sourcePriceId: 'opp-seed-1',
        createdAt: nowIso,
      },
    ] as any);

    await db.insert(schema.operationalShiftNozzles).values([
      {
        id: 'osn-ms-1',
        operationalShiftId: 'shift-ms-1',
        outletId,
        nozzleId: 'nozz-ro1-1-1',
        dispenserId: 'disp-ro1-1',
        dispenserNumber: 1,
        dispenserName: 'MPD 1',
        nozzleNumber: 1,
        productId: 'prod-ms',
        productCode: 'MS',
        productName: 'Motor Spirit (Petrol)',
        productCategory: 'MS',
        productUnit: 'LITRE',
        tankId: 'tank-ro1-1',
        tankNumber: 1,
        snapshotStatus: 'ACTIVE',
        createdAt: nowIso,
      },
      {
        id: 'osn-ms-2',
        operationalShiftId: 'shift-ms-2',
        outletId,
        nozzleId: 'nozz-ro1-1-1',
        dispenserId: 'disp-ro1-1',
        dispenserNumber: 1,
        dispenserName: 'MPD 1',
        nozzleNumber: 1,
        productId: 'prod-ms',
        productCode: 'MS',
        productName: 'Motor Spirit (Petrol)',
        productCategory: 'MS',
        productUnit: 'LITRE',
        tankId: 'tank-ro1-1',
        tankNumber: 1,
        snapshotStatus: 'ACTIVE',
        createdAt: nowIso,
      },
    ] as any);

    // Shift 1 net sales: 400 L; Shift 2 net sales: 600 L => Total net sales = 1000 L
    await db.insert(schema.nozzleMeterReadings).values([
      {
        id: 'nmr-ms-1',
        operationalShiftId: 'shift-ms-1',
        outletId,
        nozzleId: 'nozz-ro1-1-1',
        openingTotalizerMilliunits: 1000000,
        closingTotalizerMilliunits: 1405000,
        grossSalesQuantityMilliunits: 405000,
        testingQuantityMilliunits: 5000,
        netSalesQuantityMilliunits: 400000,
        recordedByUserId: 'user-admin',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 'nmr-ms-2',
        operationalShiftId: 'shift-ms-2',
        outletId,
        nozzleId: 'nozz-ro1-1-1',
        openingTotalizerMilliunits: 1405000,
        closingTotalizerMilliunits: 2005000,
        grossSalesQuantityMilliunits: 600000,
        testingQuantityMilliunits: 0,
        netSalesQuantityMilliunits: 600000,
        recordedByUserId: 'user-admin',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ] as any);

    // Shift 1: opening = 10,000L, receipts = 3,000L, sales = 400L, theoretical = 12,600L, physical = 12,600L
    // Shift 2: opening = 12,600L, receipts = 2,000L, sales = 600L, theoretical = 14,000L, physical = 13,985L (variance = -15L)
    await db.insert(schema.shiftStockReconciliations).values([
      {
        id: 'ssr-ms-1',
        operationalShiftId: 'shift-ms-1',
        outletId,
        tankId: 'tank-ro1-1',
        productId: 'prod-ms',
        openingStockMilliunits: 10000000,
        receiptQuantityMilliunits: 3000000,
        salesQuantityMilliunits: 400000,
        theoreticalClosingStockMilliunits: 12600000,
        physicalClosingStockMilliunits: 12600000,
        varianceMilliunits: 0,
        varianceStatus: 'BALANCED',
        calculatedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 'ssr-ms-2',
        operationalShiftId: 'shift-ms-2',
        outletId,
        tankId: 'tank-ro1-1',
        productId: 'prod-ms',
        openingStockMilliunits: 12600000,
        receiptQuantityMilliunits: 2000000,
        salesQuantityMilliunits: 600000,
        theoreticalClosingStockMilliunits: 14000000,
        physicalClosingStockMilliunits: 13985000,
        varianceMilliunits: -15000,
        varianceStatus: 'LOSS',
        calculatedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ] as any);

    const sumRes = await req(`/api/v1/outlets/${outletId}/fuel/daily-summary?businessDate=${businessDate}`);
    expect(sumRes.status).toBe(200);
    const summary = ((await sumRes.json()) as any).data;
    const ms = summary.byProduct.find((p: any) => p.productId === 'prod-ms');

    // 18. earliest shift opening stock (10,000 L, NOT 10,000 + 12,600)
    expect(ms.openingStockMilliunits).toBe(10000000);
    expect(ms.openingStockL).toBe(10000);

    // 19. latest shift closing stock (13,985 L, NOT 12,600 + 13,985)
    expect(ms.physicalClosingMilliunits).toBe(13985000);
    expect(ms.physicalClosingL).toBe(13985);

    // 20. sums receipts once across shifts (3,000 + 2,000 = 5,000 L)
    expect(ms.receiptsMilliunits).toBe(5000000);
    expect(ms.receiptsL).toBe(5000);
    expect(ms.availableStockMilliunits).toBe(15000000);
    expect(ms.availableStockL).toBe(15000);

    // 21. theoretical closing = opening (10,000) + receipts (5,000) - net sales (1,000) = 14,000 L
    expect(ms.netSalesMilliunits).toBe(1000000);
    expect(ms.theoreticalClosingMilliunits).toBe(14000000);
    expect(ms.theoreticalClosingL).toBe(14000);

    // 22. variance = physical closing (13,985) - theoretical closing (14,000) = -15 L
    expect(ms.varianceMilliunits).toBe(-15000);
    expect(ms.varianceL).toBe(-15);
  });

  it('23. daily summary matches monthly report daily row exactly', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    const businessDate = '2026-10-25';

    // Open shift and complete full cycle
    const openRes = await req(`/api/v1/outlets/${outletId}/shifts/open`, 'POST', {
      shiftTemplateId: 'st-ro1-1',
      businessDate,
    });
    const shift = ((await openRes.json()) as any).data;

    const bootRes = await req(`/api/v1/outlets/${outletId}/daily-operations?businessDate=${businessDate}`);
    const ws = ((await bootRes.json()) as any).data.shifts[0];

    await req(`/api/v1/shifts/${shift.id}/tank-readings/batch`, 'POST', {
      readings: ws.tanks.flatMap((t: any) => [
        {
          tankId: t.tankId,
          readingType: 'OPENING',
          source: 'MANUAL',
          productDipMm: '1200.000',
          waterDipMm: '0.000',
        },
        {
          tankId: t.tankId,
          readingType: 'CLOSING',
          source: 'MANUAL',
          productDipMm: '1100.000',
          waterDipMm: '0.000',
        },
      ]),
    });

    await req(`/api/v1/shifts/${shift.id}/readings/batch`, 'POST', {
      readings: ws.nozzles.map((n: any) => ({
        nozzleId: n.nozzleId,
        openingTotalizer: n.suggestedOpeningTotalizer || '0.000',
        closingTotalizer: (Number(n.suggestedOpeningTotalizer || '0') + 150).toFixed(3),
        testingQuantity: '5.000',
      })),
    });

    await req(`/api/v1/shifts/${shift.id}/stock-reconciliation/compute`, 'POST', {});

    const dailyRes = await req(
      `/api/v1/outlets/${outletId}/fuel/daily-summary?businessDate=${businessDate}`
    );
    const dailySummary = ((await dailyRes.json()) as any).data;

    const monthlyReport = await MonthlyOperationsReportService.generateReport(
      db,
      outletId,
      '2026-10',
      'MONTH_END'
    );

    for (const dailyProd of dailySummary.byProduct) {
      const monthlySection = monthlyReport.productSections.find(
        (s) => s.productId === dailyProd.productId
      );
      expect(monthlySection).toBeDefined();
      const monthlyRow = monthlySection!.rows.find((r) => r.businessDate === businessDate);
      expect(monthlyRow).toBeDefined();

      expect(dailyProd.openingStockL).toBe(monthlyRow!.tankOpeningStockL);
      expect(dailyProd.closingStockL).toBe(monthlyRow!.tankClosingStockL);
      expect(dailyProd.receiptsL).toBe(monthlyRow!.receiptsL);
      expect(dailyProd.availableStockL).toBe(monthlyRow!.availableStockL);
      expect(dailyProd.grossSalesL).toBe(monthlyRow!.grossSalesL);
      expect(dailyProd.testingL).toBe(monthlyRow!.testingL);
      expect(dailyProd.netSalesL).toBe(monthlyRow!.netSalesL);
      expect(dailyProd.theoreticalClosingL).toBe(monthlyRow!.theoreticalClosingL);
      expect(dailyProd.physicalClosingL).toBe(monthlyRow!.physicalClosingL);
      expect(dailyProd.varianceL).toBe(monthlyRow!.varianceL);
      expect(dailyProd.status).toBe(monthlyRow!.status);
    }
  });

  it("24. dealer cannot access another outlet's daily summary or daily-operations bootstrap (403)", async () => {
    // dealerToken is scoped to ro-1001, requesting ro-1002 must return 403
    const sumRes = await req(
      '/api/v1/outlets/ro-1002/fuel/daily-summary?businessDate=2026-10-15',
      'GET',
      undefined,
      dealerToken
    );
    expect(sumRes.status).toBe(403);

    const bootRes = await req(
      '/api/v1/outlets/ro-1002/daily-operations?businessDate=2026-10-15',
      'GET',
      undefined,
      dealerToken
    );
    expect(bootRes.status).toBe(403);
  });

  it('25. closed shift readings remain immutable across single and batch endpoints (409 SHIFT_CLOSED)', async () => {
    // shift-seed-closed-1 is a seeded CLOSED shift on ro-1001
    const closedShiftId = 'shift-seed-closed-1';

    const batchNozzleRes = await req(`/api/v1/shifts/${closedShiftId}/readings/batch`, 'POST', {
      readings: [
        {
          nozzleId: 'nozz-ro1-1-1',
          openingTotalizer: '125540.250',
          closingTotalizer: '125600.250',
          testingQuantity: '0.000',
        },
      ],
    });
    expect(batchNozzleRes.status).toBe(409);
    expect(((await batchNozzleRes.json()) as any).error.code).toBe('SHIFT_CLOSED');

    const batchTankRes = await req(`/api/v1/shifts/${closedShiftId}/tank-readings/batch`, 'POST', {
      readings: [
        {
          tankId: 'tank-ro1-1',
          readingType: 'OPENING',
          source: 'MANUAL',
          productDipMm: '1200.000',
          waterDipMm: '0.000',
        },
      ],
    });
    expect(batchTankRes.status).toBe(409);
    expect(((await batchTankRes.json()) as any).error.code).toBe('SHIFT_CLOSED');
  });

  it('26. DailyOperationsPage form controls explicitly define light-form foreground, background, placeholder, caret, and disabled classes', () => {
    const pageSource = fs.readFileSync('src/frontend/pages/DailyOperationsPage.tsx', 'utf8');

    const inputBlocks = pageSource.match(/<input\b[\s\S]*?\/>/g) || [];
    const selectBlocks = pageSource.match(/<select\b[\s\S]*?>\s*\{/g) || [];
    const controlBlocks = [...inputBlocks, ...selectBlocks];
    expect(controlBlocks.length).toBe(11);

    for (const block of controlBlocks) {
      expect(block).toContain('text-slate-900');
      expect(block).toContain('bg-white');
      expect(block).toContain('disabled:bg-slate-100');
      expect(block).toContain('disabled:text-slate-500');
      expect(block).toContain('disabled:cursor-not-allowed');
      expect(block).toContain('focus:outline-none');
      expect(block).toContain('focus:ring-2');
      expect(block).toContain('focus:ring-[#003366]');

      if (block.startsWith('<input')) {
        expect(block).toContain('caret-slate-900');
        if (!block.includes('type="date"')) {
          expect(block).toContain('placeholder:text-slate-400');
        }
      }
    }

    // Conditional amber opening totalizer retains amber state while keeping dark text & caret
    expect(pageSource).toContain("hasContinuityDiff\n                                    ? 'border-amber-400 bg-amber-50/40'\n                                    : 'border-slate-300 bg-white'");
  });
});

