import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import * as schema from '../src/db/schema';
import { eq } from 'drizzle-orm';
import {
  buildCalibrationImportPreview,
  analyzeCalibrationChartDiagnostics,
  parseDryRunCheckpointsText,
  evaluateCalibrationDryRunClient,
  getPumpInfrastructureErrorMessage,
} from '../src/frontend/components/pump/pumpInfrastructureUi';

const ROOT_DIR = path.resolve(__dirname, '..');
const MIGRATION_0033_PATH = path.resolve(
  ROOT_DIR,
  'migrations/0033_tank_calibration_chart_versioning.sql'
);

class MockR2Bucket {
  private store = new Map<string, { data: Uint8Array; metadata: Record<string, string> }>();
  async get(key: string) {
    const item = this.store.get(key);
    if (!item) return null;
    return {
      body: item.data,
      arrayBuffer: async () => item.data.buffer,
      customMetadata: item.metadata,
    };
  }
  async put(key: string, value: ArrayBuffer | Uint8Array, options?: any) {
    const data = value instanceof Uint8Array ? value : new Uint8Array(value);
    this.store.set(key, { data, metadata: options?.customMetadata || {} });
    return { key, size: data.byteLength };
  }
  async delete(key: string) {
    this.store.delete(key);
  }
}

/**
 * Generates a realistic non-linear horizontal cylindrical IOCL tank calibration table
 * using circular segment area formula:
 * A(h) = R^2 * arccos((R - h) / R) - (R - h) * sqrt(2*R*h - h^2)
 */
function generateCylindricalTankChartPoints(options: {
  diameterMm: number;
  capacityLitres: number;
  stepMm: number;
}): Array<{ dipMillimetres: string; volumeLitres: string }> {
  const { diameterMm, capacityLitres, stepMm } = options;
  const R = diameterMm / 2;
  const fullArea = Math.PI * R * R;
  const points: Array<{ dipMillimetres: string; volumeLitres: string }> = [];

  for (let h = 0; h <= diameterMm; h += stepMm) {
    if (h === 0) {
      points.push({ dipMillimetres: '0.000', volumeLitres: '0.000' });
    } else if (h >= diameterMm) {
      points.push({
        dipMillimetres: diameterMm.toFixed(3),
        volumeLitres: capacityLitres.toFixed(3),
      });
    } else {
      const cosArg = Math.max(-1, Math.min(1, (R - h) / R));
      const area = R * R * Math.acos(cosArg) - (R - h) * Math.sqrt(Math.max(0, 2 * R * h - h * h));
      const vol = (area / fullArea) * capacityLitres;
      points.push({
        dipMillimetres: h.toFixed(3),
        volumeLitres: (Math.round(vol * 1000) / 1000).toFixed(3),
      });
    }
  }
  return points;
}

describe('Tank Calibration Chart Versioning, Non-Linear Tables, CSV Preview, Dry-Run & Historical Consistency Suite', () => {
  let dbPath: string;
  let localD1: any;
  let env: any;

  beforeEach(async () => {
    dbPath = `./.sqlite/test_tank_cal_ver_${Date.now()}_${Math.random().toString(36).substring(7)}.db`;
    localD1 = createLocalD1Database(dbPath);
    const db = getDb(localD1);
    await seedDatabase(db);

    env = {
      DB: localD1,
      DOCUMENTS_BUCKET: new MockR2Bucket(),
      SESSION_SECRET: 'test-session-secret-key-12345678901234567890',
      ENVIRONMENT: 'development',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    };
  });

  afterEach(() => {
    try {
      if (localD1) localD1.close();
    } catch {}
    try {
      if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (dbPath && fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`);
      if (dbPath && fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`);
    } catch {}
  });

  async function loginAs(email: string, password = 'Password@123') {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email, password }),
      }),
      env
    );
    const cookie = res.headers.get('set-cookie') || '';
    const json: any = await res.json();
    return { cookie, user: json.data?.user };
  }

  // =========================================================================
  // 1. Migration 0033 Compatibility & Legacy Data Preservation
  // =========================================================================
  it('1. Migration 0033 preserves existing tank_calibration_points, backfills Revision 1 ACTIVE charts, and links historical readings', () => {
    const migDbPath = `./.sqlite/test_0033_compat_${Date.now()}_${Math.random().toString(36).substring(7)}.db`;
    const migD1 = createLocalD1Database(migDbPath, {
      throughMigration: '0032_global_designation_and_shift_masters.sql',
    });
    const rawDb = migD1.getNativeDb();

    try {
      // Seed pre-0033 hierarchy, tank, legacy calibration points (without chart_id), shift snapshot, and tank stock reading
      rawDb.exec(`
        INSERT INTO states (id, code, name, status, created_at, updated_at)
        VALUES ('st-1', 'WB', 'West Bengal', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

        INSERT INTO divisions (id, state_id, code, name, status, created_at, updated_at)
        VALUES ('div-1', 'st-1', 'KOL', 'Kolkata DO', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

        INSERT INTO sales_areas (id, division_id, code, name, status, created_at, updated_at)
        VALUES ('sa-1', 'div-1', 'KOL_C', 'Kolkata Central', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

        INSERT INTO retail_outlets (id, ro_code, name, outlet_type, state_id, division_id, sales_area_id, address, city, district, pincode, status, created_at, updated_at)
        VALUES ('ro-leg', '100001', 'Legacy RO', 'COCO', 'st-1', 'div-1', 'sa-1', 'Addr', 'Kolkata', 'Kolkata', '700001', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

        INSERT INTO users (id, emp_code, name, email, phone, password_hash, status, created_at, updated_at)
        VALUES ('usr-1', 'EMP1', 'Admin', 'adm@iocl.in', '9000000000', 'hash', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

        INSERT INTO products (id, code, name, category, unit, status, created_at, updated_at)
        VALUES ('prod-ms', 'MS', 'Motor Spirit', 'MS', 'LITRE', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

        INSERT INTO tanks (id, outlet_id, tank_number, name, product_id, capacity_litres, safe_fill_capacity_litres, minimum_operating_level_litres, status, created_at, created_by, updated_at)
        VALUES ('tank-leg-1', 'ro-leg', 1, 'Tank 1 MS', 'prod-ms', 20000, 19000, 1000, 'ACTIVE', '2026-01-01T00:00:00Z', 'usr-1', '2026-01-01T00:00:00Z');

        INSERT INTO tank_calibration_points (id, tank_id, dip_millimetres_milliunits, volume_milliunits, created_at, created_by)
        VALUES
          ('tcp-leg-1', 'tank-leg-1', 0, 0, '2026-01-01T00:00:00Z', 'usr-1'),
          ('tcp-leg-2', 'tank-leg-1', 1000000, 10000000, '2026-01-01T00:00:00Z', 'usr-1'),
          ('tcp-leg-3', 'tank-leg-1', 2000000, 20000000, '2026-01-01T00:00:00Z', 'usr-1');

        INSERT INTO operational_shifts (id, outlet_id, shift_template_id, business_date, started_at, status, opened_by_user_id, created_at, updated_at)
        VALUES ('sh-leg-1', 'ro-leg', 'gst-morning', '2026-03-01', '2026-03-01T06:00:00Z', 'CLOSED', 'usr-1', '2026-03-01T06:00:00Z', '2026-03-01T14:00:00Z');

        INSERT INTO operational_shift_tanks (id, operational_shift_id, outlet_id, tank_id, tank_number, tank_name, product_id, product_code, product_name, product_unit, capacity_milliunits, safe_fill_capacity_milliunits, created_at)
        VALUES ('ost-leg-1', 'sh-leg-1', 'ro-leg', 'tank-leg-1', 1, 'Tank 1 MS', 'prod-ms', 'MS', 'Motor Spirit', 'LITRE', 20000000, 19000000, '2026-03-01T06:00:00Z');

        INSERT INTO tank_stock_readings (id, operational_shift_id, outlet_id, tank_id, product_id, reading_type, source, product_dip_mm_milliunits, water_dip_mm_milliunits, gross_observed_volume_milliunits, water_volume_milliunits, net_product_volume_milliunits, recorded_at, recorded_by_user_id, created_at, updated_at)
        VALUES ('tsr-leg-1', 'sh-leg-1', 'ro-leg', 'tank-leg-1', 'prod-ms', 'OPENING', 'MANUAL', 1000000, 0, 10000000, 0, 10000000, '2026-03-01T06:05:00Z', 'usr-1', '2026-03-01T06:05:00Z', '2026-03-01T06:05:00Z');
      `);

      // Apply Migration 0033
      const sql0033 = fs.readFileSync(MIGRATION_0033_PATH, 'utf-8');
      expect(() => rawDb.exec(sql0033)).not.toThrow();

      // Verify Revision 1 ACTIVE chart was created for tank-leg-1
      const charts = rawDb
        .prepare(`SELECT * FROM tank_calibration_charts WHERE tank_id = 'tank-leg-1'`)
        .all() as any[];
      expect(charts.length).toBe(1);
      expect(charts[0].id).toBe('tcc-legacy-tank-leg-1-r1');
      expect(charts[0].revision_number).toBe(1);
      expect(charts[0].status).toBe('ACTIVE');
      expect(charts[0].max_dip_mm_milliunits).toBe(2000000);
      expect(charts[0].chart_capacity_milliunits).toBe(20000000);

      // Verify all 3 calibration points were preserved and linked to Revision 1
      const points = rawDb
        .prepare(`SELECT * FROM tank_calibration_points WHERE tank_id = 'tank-leg-1' ORDER BY dip_millimetres_milliunits ASC`)
        .all() as any[];
      expect(points.length).toBe(3);
      expect(points.every((p: any) => p.chart_id === 'tcc-legacy-tank-leg-1-r1')).toBe(true);

      // Verify historical operational_shift_tanks and tank_stock_readings were backfilled with Revision 1
      const shiftTanks = rawDb
        .prepare(`SELECT * FROM operational_shift_tanks WHERE id = 'ost-leg-1'`)
        .all() as any[];
      expect(shiftTanks[0].calibration_chart_id).toBe('tcc-legacy-tank-leg-1-r1');
      expect(shiftTanks[0].calibration_revision).toBe(1);

      const readings = rawDb
        .prepare(`SELECT * FROM tank_stock_readings WHERE id = 'tsr-leg-1'`)
        .all() as any[];
      expect(readings[0].calibration_chart_id).toBe('tcc-legacy-tank-leg-1-r1');
      expect(readings[0].calibration_revision).toBe(1);
      expect(readings[0].net_product_volume_milliunits).toBe(10000000);

      const fkErrors = rawDb.prepare('PRAGMA foreign_key_check;').all() as any[];
      expect(fkErrors.length).toBe(0);
    } finally {
      migD1.close();
      try {
        if (fs.existsSync(migDbPath)) fs.unlinkSync(migDbPath);
        if (fs.existsSync(`${migDbPath}-wal`)) fs.unlinkSync(`${migDbPath}-wal`);
        if (fs.existsSync(`${migDbPath}-shm`)) fs.unlinkSync(`${migDbPath}-shm`);
      } catch {}
    }
  });

  // =========================================================================
  // 2. Complete Non-Linear Cylindrical Tank Table (201 Points) & Metadata
  // =========================================================================
  it('2. Supports importing complete 201-point non-linear cylindrical IOCL calibration chart with dimensions, source file, and effective dates', async () => {
    const { cookie } = await loginAs('admin@iocl.in');

    // Generate 201-point non-linear cylindrical chart (0 to 2000 mm in 10 mm steps)
    const nonLinearPoints = generateCylindricalTankChartPoints({
      diameterMm: 2000,
      capacityLitres: 20000,
      stepMm: 10,
    });
    expect(nonLinearPoints.length).toBe(201);

    // Verify diagnostics detect non-linearity and uniform 10 mm steps with 0 missing step warnings
    const diag = analyzeCalibrationChartDiagnostics(nonLinearPoints, {
      tankCapacityLitres: 20000,
      safeFillCapacityLitres: 19000,
    });
    expect(diag.pointsCount).toBe(201);
    expect(diag.isNonLinear).toBe(true);
    expect(diag.dominantStepMm).toBe(10);
    expect(diag.isUniformStep).toBe(true);
    expect(diag.missingStepWarnings.length).toBe(0);

    // Import into Tank #1 (tank-ro1-1) with full chart metadata
    const bulkRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          points: nonLinearPoints,
          metadata: {
            chartUnitDip: 'MM',
            chartUnitVolume: 'LITRE',
            tankDiameterMm: '2000.000',
            tankLengthMm: '6366.200',
            maxDipMm: '2000.000',
            sourceFileName: 'IOCL_20KL_TANK1_SCAN.csv',
            referenceDocument: 'W&M/KOL/2026/CERT-01',
            effectiveFrom: '2026-04-01',
            notes: '20 KL Horizontal Cylindrical Calibration Table',
          },
          saveMode: 'ACTIVE',
        }),
      }),
      env
    );

    expect(bulkRes.status).toBe(201);
    const bulkJson: any = await bulkRes.json();
    expect(bulkJson.success).toBe(true);
    expect(bulkJson.importedCount).toBe(201);
    expect(bulkJson.data.length).toBe(201);
    expect(bulkJson.chart).toBeDefined();
    expect(bulkJson.chart.status).toBe('ACTIVE');
    expect(bulkJson.chart.tankDiameterMmStr).toBe('2000.000');
    expect(bulkJson.chart.tankLengthMmStr).toBe('6366.200');
    expect(bulkJson.chart.maxDipMmStr).toBe('2000.000');
    expect(bulkJson.chart.sourceFileName).toBe('IOCL_20KL_TANK1_SCAN.csv');
    expect(bulkJson.chart.referenceDocument).toBe('W&M/KOL/2026/CERT-01');
    expect(bulkJson.chart.effectiveFrom).toBe('2026-04-01');

    // Verify GET /api/v1/tanks/tank-ro1-1/calibration returns activeChart, charts, and 201 points
    const getRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration', {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(getRes.status).toBe(200);
    const getJson: any = await getRes.json();
    expect(getJson.data.length).toBe(201);
    expect(getJson.activeChart.sourceFileName).toBe('IOCL_20KL_TANK1_SCAN.csv');
    // At quarter height (500 mm) of a horizontal cylinder, volume is ~19.55% of 20,000 L (~3910.022 L), NOT 5000 L!
    const pt500 = getJson.data.find((p: any) => p.dipMmStr === '500.000');
    expect(pt500).toBeDefined();
    expect(Number(pt500.volumeLitreStr)).toBeGreaterThan(3900);
    expect(Number(pt500.volumeLitreStr)).toBeLessThan(3920);
    // At half height (1000 mm) of a horizontal cylinder, volume is exactly 50% (10,000 L)
    const pt1000 = getJson.data.find((p: any) => p.dipMmStr === '1000.000');
    expect(pt1000.volumeLitreStr).toBe('10000.000');
  });

  // =========================================================================
  // 3. Validation of Duplicate Dips, Missing Steps, Monotonicity, Capacity, Units & Max Dip Range
  // =========================================================================
  it('3. Validates duplicate dips, missing step gaps, monotonicity, capacity conflicts, units, and max dip / diameter bounds', async () => {
    const { cookie } = await loginAs('admin@iocl.in');

    // 3a. CSV unit validation: reject cm or gallons in header or values
    const badHeaderPreview = buildCalibrationImportPreview(
      'dip_cm,volume_gallons\n0,0\n100,5000\n200,10000',
      { tankCapacityLitres: 20000 }
    );
    expect(badHeaderPreview.valid).toBe(false);
    expect(badHeaderPreview.error).toContain('Invalid units in CSV header');

    const badRowUnitPreview = buildCalibrationImportPreview(
      'dip_mm,volume_litres\n0 mm,0 L\n100 cm,5000 L\n2000 mm,10000 L',
      { tankCapacityLitres: 20000 }
    );
    expect(badRowUnitPreview.valid).toBe(false);
    expect(badRowUnitPreview.error).toContain('Unsupported unit detected');

    // 3b. Missing step gap detection in CSV preview (10 mm steps with missing 30 mm row)
    const gapPreview = buildCalibrationImportPreview(
      'dip_mm,volume_litres\n0,0\n10,100\n20,200\n40,400\n50,500',
      { tankCapacityLitres: 20000 }
    );
    expect(gapPreview.valid).toBe(true);
    expect(gapPreview.diagnostics.dominantStepMm).toBe(10);
    expect(gapPreview.diagnostics.missingStepWarnings.length).toBe(1);
    expect(gapPreview.diagnostics.missingStepWarnings[0].fromDipMm).toBe(20);
    expect(gapPreview.diagnostics.missingStepWarnings[0].toDipMm).toBe(40);
    expect(gapPreview.diagnostics.missingStepWarnings[0].missingCountEstimate).toBe(1);

    // 3c. Max dip exceeding tank diameter rejected on both frontend and backend
    const diaConflictPreview = buildCalibrationImportPreview(
      '0,0\n1000,10000\n2200,20000',
      { tankCapacityLitres: 20000, tankDiameterMm: 2000, maxDipMm: 2000 }
    );
    expect(diaConflictPreview.valid).toBe(false);
    expect(diaConflictPreview.error).toContain('exceeds configured maximum dip range');

    const backendMaxDipRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          points: [
            { dipMillimetres: '0.000', volumeLitres: '0.000' },
            { dipMillimetres: '1000.000', volumeLitres: '10000.000' },
            { dipMillimetres: '2150.000', volumeLitres: '19500.000' },
          ],
          metadata: {
            tankDiameterMm: '2000.000',
            maxDipMm: '2000.000',
          },
        }),
      }),
      env
    );
    expect(backendMaxDipRes.status).toBe(400);
    const maxDipErr: any = await backendMaxDipRes.json();
    expect(maxDipErr.error.code).toBe('MAX_DIP_RANGE_EXCEEDED');

    // 3d. Capacity conflict rejected when allowOverCapacity is false, allowed when true
    const backendCapConflictRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          points: [
            { dipMillimetres: '0.000', volumeLitres: '0.000' },
            { dipMillimetres: '1000.000', volumeLitres: '10000.000' },
            { dipMillimetres: '2000.000', volumeLitres: '20450.000' }, // > 20,000 L nominal
          ],
          allowOverCapacity: false,
        }),
      }),
      env
    );
    expect(backendCapConflictRes.status).toBe(400);
    const capConflictJson: any = await backendCapConflictRes.json();
    expect(capConflictJson.error.code).toBe('CAPACITY_CONFLICT');
  });

  // =========================================================================
  // 4. Controlled Versioning, Immutability When Referenced & Historical Reconciliation Consistency
  // =========================================================================
  it('4. Locks referenced calibration chart versions, creates Revision 2 on update, and preserves historical dip readings and reconciliations', async () => {
    const { cookie } = await loginAs('admin@iocl.in');

    // Step 1: Open Shift #1 at Park Street RO (ro-1001, st-ro1-1 on 2026-04-10)
    const openShift1Res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate: '2026-04-10',
          notes: 'Calibration Versioning Test Shift',
        }),
      }),
      env
    );
    expect(openShift1Res.status).toBe(201);
    const shift1Json: any = await openShift1Res.json();
    const shift1Id = shift1Json.data.id;

    // Fetch shift tank snapshots to verify Revision #1 was captured
    const snapRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shift1Id}/tank-snapshots`, {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(snapRes.status).toBe(200);
    const snapJson: any = await snapRes.json();
    const tank1Snap = snapJson.data.find((s: any) => s.tankId === 'tank-ro1-1');
    expect(tank1Snap).toBeDefined();
    expect(tank1Snap.calibrationChartId).toBe('tcc-legacy-tank-ro1-1-r1');
    expect(tank1Snap.calibrationRevision).toBe(1);

    // Step 2: Record OPENING (1500 mm -> 14,400 L in Rev #1) and CLOSING (1000 mm -> 8,500 L in Rev #1) readings for Tank #1
    const openDipRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shift1Id}/tank-readings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          tankId: 'tank-ro1-1',
          readingType: 'OPENING',
          source: 'MANUAL',
          productDipMm: '1500.000',
          waterDipMm: '0.000',
        }),
      }),
      env
    );
    expect(openDipRes.status).toBe(201);
    const openDipJson: any = await openDipRes.json();
    expect(openDipJson.data.netProductVolumeStr).toBe('14400.000');
    expect(openDipJson.data.calibrationChartId).toBe('tcc-legacy-tank-ro1-1-r1');
    expect(openDipJson.data.calibrationRevision).toBe(1);

    const closeDipRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shift1Id}/tank-readings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          tankId: 'tank-ro1-1',
          readingType: 'CLOSING',
          source: 'MANUAL',
          productDipMm: '1000.000',
          waterDipMm: '0.000',
        }),
      }),
      env
    );
    expect(closeDipRes.status).toBe(201);
    const closeDipJson: any = await closeDipRes.json();
    expect(closeDipJson.data.netProductVolumeStr).toBe('8500.000');
    expect(closeDipJson.data.calibrationChartId).toBe('tcc-legacy-tank-ro1-1-r1');
    expect(closeDipJson.data.calibrationRevision).toBe(1);

    // Step 3: Verify Revision #1 is now locked against in-place single-point edits or deletes
    const chartsRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration', {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    const chartsJson: any = await chartsRes.json();
    expect(chartsJson.activeChart.id).toBe('tcc-legacy-tank-ro1-1-r1');
    expect(chartsJson.activeChart.isReferenced).toBe(true);

    const ptToEdit = chartsJson.data.find((p: any) => p.dipMmStr === '1000.000');
    const editPointRes = await app.fetch(
      new Request(`http://localhost/api/v1/tanks/tank-ro1-1/calibration/${ptToEdit.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          dipMillimetres: '1000.000',
          volumeLitres: '9999.000',
        }),
      }),
      env
    );
    expect(editPointRes.status).toBe(409);
    const editErrJson: any = await editPointRes.json();
    expect(editErrJson.error.code).toBe('CALIBRATION_CHART_LOCKED_HISTORICAL_REFERENCE');
    expect(getPumpInfrastructureErrorMessage(editErrJson.error)).toContain('cannot be overwritten in place');
    expect(
      getPumpInfrastructureErrorMessage({ code: 'CALIBRATION_CHART_LOCKED_HISTORICAL_REFERENCE' })
    ).toContain('referenced by historical');

    const delPointRes = await app.fetch(
      new Request(`http://localhost/api/v1/tanks/tank-ro1-1/calibration/${ptToEdit.id}`, {
        method: 'DELETE',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(delPointRes.status).toBe(409);

    // Step 4: Import a new chart in DRAFT mode -> creates Revision #2 without touching Revision #1
    const draftImportRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          points: [
            { dipMillimetres: '0.000', volumeLitres: '0.000' },
            { dipMillimetres: '500.000', volumeLitres: '4200.000' },
            { dipMillimetres: '1000.000', volumeLitres: '9200.000' }, // Changed from 8500 L to 9200 L
            { dipMillimetres: '1500.000', volumeLitres: '15200.000' }, // Changed from 14400 L to 15200 L
            { dipMillimetres: '2000.000', volumeLitres: '20000.000' },
          ],
          metadata: {
            sourceFileName: 'recalibrated_2026_r2.csv',
            referenceDocument: 'CERT-2026-R2',
            effectiveFrom: '2026-04-11',
          },
          saveMode: 'DRAFT',
        }),
      }),
      env
    );
    expect(draftImportRes.status).toBe(201);
    const draftJson: any = await draftImportRes.json();
    expect(draftJson.chart.revisionNumber).toBe(2);
    expect(draftJson.chart.status).toBe('DRAFT');
    const rev2ChartId = draftJson.chart.id;

    // While Revision #2 is still DRAFT, Revision #1 remains ACTIVE
    const checkActiveRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration', {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    const checkActiveJson: any = await checkActiveRes.json();
    expect(checkActiveJson.activeChart.revisionNumber).toBe(1);
    expect(checkActiveJson.charts.length).toBe(2);

    // Step 5: Approve Revision #2, then Activate Revision #2
    const approveRes = await app.fetch(
      new Request(`http://localhost/api/v1/tanks/tank-ro1-1/calibration/charts/${rev2ChartId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ status: 'APPROVED' }),
      }),
      env
    );
    expect(approveRes.status).toBe(200);
    const approveJson: any = await approveRes.json();
    expect(approveJson.data.status).toBe('APPROVED');
    expect(approveJson.data.approvedBy).toBeDefined();

    const activateRes = await app.fetch(
      new Request(`http://localhost/api/v1/tanks/tank-ro1-1/calibration/charts/${rev2ChartId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ status: 'ACTIVE', effectiveFrom: '2026-04-11' }),
      }),
      env
    );
    expect(activateRes.status).toBe(200);
    const activateJson: any = await activateRes.json();
    expect(activateJson.data.status).toBe('ACTIVE');

    // Step 6: Verify Revision #1 is now SUPERSEDED with all 11 of its original points intact!
    const rev1GetRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration?revision=1', {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    const rev1GetJson: any = await rev1GetRes.json();
    expect(rev1GetJson.selectedChart.revisionNumber).toBe(1);
    expect(rev1GetJson.selectedChart.status).toBe('SUPERSEDED');
    const rev1Pt1000 = rev1GetJson.data.find((p: any) => p.dipMmStr === '1000.000');
    expect(rev1Pt1000.volumeLitreStr).toBe('8500.000'); // Unchanged!

    // Step 7: Verify Shift #1 historical readings still retain 14400.000 L and 8500.000 L and Revision #1
    const shift1ReadingsRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shift1Id}/tank-readings`, {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    const shift1ReadingsJson: any = await shift1ReadingsRes.json();
    const s1Open = shift1ReadingsJson.data.find(
      (r: any) => r.tankId === 'tank-ro1-1' && r.readingType === 'OPENING'
    );
    const s1Close = shift1ReadingsJson.data.find(
      (r: any) => r.tankId === 'tank-ro1-1' && r.readingType === 'CLOSING'
    );
    expect(s1Open.netProductVolumeStr).toBe('14400.000');
    expect(s1Open.calibrationRevision).toBe(1);
    expect(s1Close.netProductVolumeStr).toBe('8500.000');
    expect(s1Close.calibrationRevision).toBe(1);

    // Step 8: Record a new ADHOC reading after Revision #2 activation and verify it uses Revision #2 (1000 mm -> 9200.000 L)
    const adhocRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shift1Id}/tank-readings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          tankId: 'tank-ro1-1',
          readingType: 'ADHOC',
          source: 'MANUAL',
          productDipMm: '1000.000',
          waterDipMm: '0.000',
        }),
      }),
      env
    );
    expect(adhocRes.status).toBe(201);
    const adhocJson: any = await adhocRes.json();
    expect(adhocJson.data.netProductVolumeStr).toBe('9200.000');
    expect(adhocJson.data.calibrationChartId).toBe(rev2ChartId);
    expect(adhocJson.data.calibrationRevision).toBe(2);
  });

  // =========================================================================
  // 5. Dry-Run Comparison Against Original Printed IOCL Chart
  // =========================================================================
  it('5. Evaluates dry-run comparison against printed IOCL chart checkpoints (exact, interpolated, and out-of-range)', async () => {
    const { cookie } = await loginAs('admin@iocl.in');

    // Run backend dry-run comparison against Tank #1's chart (0->0, 250->1200, 500->3100, 750->5600, 1000->8500, 1250->11500, ..., 2500->20000)
    const dryRunRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration/dry-run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          checkpoints: [
            { dipMm: '0.000', printedVolumeLitres: '0.000' }, // Exact match
            { dipMm: '500.000', printedVolumeLitres: '3100.000' }, // Exact match
            { dipMm: '625.000', printedVolumeLitres: '4350.000' }, // Interpolated midpoint between 500mm (3100L) and 750mm (5600L) -> 4350L
            { dipMm: '1125.000', printedVolumeLitres: '10005.000' }, // Interpolated between 1000mm (8500L) and 1250mm (11500L) is 10000L -> -5L delta (> 0.5L tolerance)
            { dipMm: '2700.000', printedVolumeLitres: '21000.000' }, // Out of range (> 2500mm)
          ],
          toleranceLitres: '0.500',
        }),
      }),
      env
    );

    expect(dryRunRes.status).toBe(200);
    const dryRunJson: any = await dryRunRes.json();
    expect(dryRunJson.success).toBe(true);
    const report = dryRunJson.data;
    expect(report.checkpointsCount).toBe(5);
    expect(report.passedCount).toBe(3);
    expect(report.failedCount).toBe(2);

    expect(report.rows[0].matchType).toBe('EXACT_POINT');
    expect(report.rows[0].withinTolerance).toBe(true);
    expect(report.rows[0].deltaLitres).toBe('0.000');

    expect(report.rows[2].matchType).toBe('INTERPOLATED');
    expect(report.rows[2].calculatedVolumeLitres).toBe('4350.000');
    expect(report.rows[2].deltaLitres).toBe('0.000');
    expect(report.rows[2].withinTolerance).toBe(true);

    expect(report.rows[3].matchType).toBe('INTERPOLATED');
    expect(report.rows[3].calculatedVolumeLitres).toBe('10000.000');
    expect(report.rows[3].deltaLitres).toBe('-5.000');
    expect(report.rows[3].withinTolerance).toBe(false);

    expect(report.rows[4].matchType).toBe('OUT_OF_RANGE');
    expect(report.rows[4].withinTolerance).toBe(false);

    // Also verify client-side checkpoint parser & dry-run evaluator match
    const parsedCp = parseDryRunCheckpointsText('dip_mm,printed_volume_litres\n0,0\n750,6000');
    expect(parsedCp.valid).toBe(true);
    expect(parsedCp.checkpoints.length).toBe(2);
    const clientReport = evaluateCalibrationDryRunClient(
      [
        { dipMillimetres: '0.000', volumeLitres: '0.000' },
        { dipMillimetres: '500.000', volumeLitres: '3500.000' },
        { dipMillimetres: '1000.000', volumeLitres: '8500.000' },
      ],
      parsedCp.checkpoints,
      0.5
    );
    expect(clientReport.passedCount).toBe(2);
    expect(clientReport.maxAbsDeltaLitres).toBe('0.000');
  });

  // =========================================================================
  // 6. RBAC, Cross-Outlet Isolation, and Audit Logging
  // =========================================================================
  it('6. Enforces RBAC (TANK_CALIBRATION_READ vs WRITE), outlet scoping, and writes audit logs', async () => {
    // CSP at Park Street RO (csp.parkstreet@iocl.in) has TANK_CALIBRATION_READ but not TANK_CALIBRATION_WRITE
    const { cookie: cspCookie } = await loginAs('csp.parkstreet@iocl.in');

    const cspReadRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration', {
        method: 'GET',
        headers: { Cookie: cspCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(cspReadRes.status).toBe(200);

    const cspForkRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration/charts/fork', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cspCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ status: 'DRAFT' }),
      }),
      env
    );
    expect(cspForkRes.status).toBe(403);

    // Admin forks a new draft revision -> verify audit log entry
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');
    const adminForkRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration/charts/fork', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ status: 'DRAFT', notes: 'Audit test fork' }),
      }),
      env
    );
    expect(adminForkRes.status).toBe(201);

    const db = getDb(localD1);
    const logs = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.action, 'TANK_CALIBRATION_CHART_FORK'));
    expect(logs.length).toBe(1);
    expect(logs[0].entityType).toBe('TANK_CALIBRATION');
  });

  // =========================================================================
  // 7. Single ACTIVE Revision Constraint & Immutability of SUPERSEDED Revisions
  // =========================================================================
  it('7. Enforces that a tank cannot have multiple ACTIVE chart revisions simultaneously and blocks mutating SUPERSEDED charts', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const rawDb = localD1.getNativeDb();

    // Verify DB partial unique index uq_tcc_single_active_per_tank rejects a second ACTIVE chart for tank-ro1-1
    expect(() =>
      rawDb
        .prepare(
          `INSERT INTO tank_calibration_charts (
            id, tank_id, revision_number, status, chart_unit_dip, chart_unit_volume,
            max_dip_mm_milliunits, chart_capacity_milliunits, effective_from, created_at, created_by, updated_at
          ) VALUES (
            'tcc-duplicate-active', 'tank-ro1-1', 99, 'ACTIVE', 'MM', 'LITRES',
            2500000, 20000000, '2026-04-12', '2026-04-12T00:00:00Z', 'user-admin', '2026-04-12T00:00:00Z'
          )`
        )
        .run()
    ).toThrow(/UNIQUE constraint failed/i);

    // Import and activate Revision #2 -> Revision #1 becomes SUPERSEDED
    const rev2Res = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          points: [
            { dipMillimetres: '0.000', volumeLitres: '0.000' },
            { dipMillimetres: '1000.000', volumeLitres: '9000.000' },
            { dipMillimetres: '2500.000', volumeLitres: '20000.000' },
          ],
          activateImmediately: true,
          createNewRevision: true,
        }),
      }),
      env
    );
    expect(rev2Res.status).toBe(201);
    const rev2Json: any = await rev2Res.json();
    expect(rev2Json.chart.revisionNumber).toBe(2);
    expect(rev2Json.chart.status).toBe('ACTIVE');

    // Count ACTIVE charts in DB for tank-ro1-1 -> must be strictly 1
    const activeCountRow = rawDb
      .prepare(
        `SELECT COUNT(*) AS cnt FROM tank_calibration_charts WHERE tank_id = 'tank-ro1-1' AND status = 'ACTIVE'`
      )
      .get() as { cnt: number };
    expect(activeCountRow.cnt).toBe(1);

    // Attempting to transition SUPERSEDED Revision #1 back to ACTIVE or DRAFT or ARCHIVED must fail with 409
    const reactivateSupersededRes = await app.fetch(
      new Request(
        'http://localhost/api/v1/tanks/tank-ro1-1/calibration/charts/tcc-legacy-tank-ro1-1-r1/status',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: cookie,
            Origin: 'http://localhost:3000',
          },
          body: JSON.stringify({ status: 'ACTIVE' }),
        }
      ),
      env
    );
    expect(reactivateSupersededRes.status).toBe(409);
    const reactivateErr: any = await reactivateSupersededRes.json();
    expect(reactivateErr.error.code).toBe('CALIBRATION_CHART_LOCKED_HISTORICAL_REFERENCE');

    // Attempting to overwrite SUPERSEDED Revision #1 in place with createNewRevision: false must fail with 409
    const overwriteSupersededRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          chartId: 'tcc-legacy-tank-ro1-1-r1',
          createNewRevision: false,
          points: [
            { dipMillimetres: '0.000', volumeLitres: '0.000' },
            { dipMillimetres: '2500.000', volumeLitres: '20000.000' },
          ],
        }),
      }),
      env
    );
    expect(overwriteSupersededRes.status).toBe(409);
    const overwriteErr: any = await overwriteSupersededRes.json();
    expect(overwriteErr.error.code).toBe('CALIBRATION_CHART_LOCKED_HISTORICAL_REFERENCE');
  });

  // =========================================================================
  // 8. Default DRAFT Mode, Live Daily Operations Isolation & Explicit Activation Authorisation
  // =========================================================================
  it('8. Ensures activateImmediately is disabled by default (saves as DRAFT), DRAFT charts cannot affect live Daily Operations, and activation requires explicit authorisation', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    // Step 1: Bulk import WITHOUT specifying activateImmediately or saveMode -> must default to DRAFT
    const defaultImportRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          points: [
            { dipMillimetres: '0.000', volumeLitres: '0.000' },
            { dipMillimetres: '1000.000', volumeLitres: '12345.000' }, // radically different volume in DRAFT
            { dipMillimetres: '2500.000', volumeLitres: '20000.000' },
          ],
          metadata: {
            sourceFileName: 'draft_unapproved_chart.csv',
          },
        }),
      }),
      env
    );
    expect(defaultImportRes.status).toBe(201);
    const defaultImportJson: any = await defaultImportRes.json();
    expect(defaultImportJson.chart.revisionNumber).toBe(2);
    expect(defaultImportJson.chart.status).toBe('DRAFT');
    const draftChartId = defaultImportJson.chart.id;

    // Step 2: Open a shift and record a live Daily Operations tank dip at 1000 mm
    // It MUST use Revision #1 ACTIVE (1000 mm -> 8500.000 L), NOT the DRAFT Revision #2 (12345.000 L)!
    const openShiftRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate: '2026-04-15',
        }),
      }),
      env
    );
    expect(openShiftRes.status).toBe(201);
    const shiftId = ((await openShiftRes.json()) as any).data.id;

    const liveDipRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-readings/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          readings: [
            {
              tankId: 'tank-ro1-1',
              readingType: 'OPENING',
              productDipMm: '1000.000',
              waterDipMm: '0.000',
            },
          ],
        }),
      }),
      env
    );
    expect(liveDipRes.status).toBe(200);
    const liveDipJson: any = await liveDipRes.json();
    expect(liveDipJson.data.processedCount).toBe(1);
    expect(liveDipJson.data.readings[0].netProductVolumeStr).toBe('8500.000');
    expect(liveDipJson.data.readings[0].calibrationRevision).toBe(1);
    expect(liveDipJson.data.readings[0].calibrationChartId).toBe('tcc-legacy-tank-ro1-1-r1');

    // Step 3: Verify explicit authorisation for immediate activation / approval
    // Grant CSP role ('role-csp') TANK_CALIBRATION_WRITE ('perm-tcal-w') without TANKS_WRITE to test a user who can write drafts but is not authorised to activate charts
    const db = getDb(localD1);
    await db
      .insert(schema.rolePermissions)
      .values({ roleId: 'role-csp', permissionId: 'perm-tcal-w' })
      .onConflictDoNothing();

    const { cookie: cspCookie } = await loginAs('csp.parkstreet@iocl.in');

    // CSP can save a DRAFT chart
    const cspDraftRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cspCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          points: [
            { dipMillimetres: '0.000', volumeLitres: '0.000' },
            { dipMillimetres: '2500.000', volumeLitres: '20000.000' },
          ],
        }),
      }),
      env
    );
    expect(cspDraftRes.status).toBe(201);
    expect(((await cspDraftRes.json()) as any).chart.status).toBe('DRAFT');

    // CSP CANNOT pass activateImmediately: true (403 CALIBRATION_ACTIVATION_FORBIDDEN)
    const cspActivateImmediateRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cspCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          points: [
            { dipMillimetres: '0.000', volumeLitres: '0.000' },
            { dipMillimetres: '2500.000', volumeLitres: '20000.000' },
          ],
          activateImmediately: true,
        }),
      }),
      env
    );
    expect(cspActivateImmediateRes.status).toBe(403);
    const cspActErr: any = await cspActivateImmediateRes.json();
    expect(cspActErr.error.code).toBe('CALIBRATION_ACTIVATION_FORBIDDEN');

    // CSP CANNOT transition DRAFT revision to ACTIVE via status endpoint (403 CALIBRATION_ACTIVATION_FORBIDDEN)
    const cspStatusActRes = await app.fetch(
      new Request(`http://localhost/api/v1/tanks/tank-ro1-1/calibration/charts/${draftChartId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cspCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ status: 'ACTIVE' }),
      }),
      env
    );
    expect(cspStatusActRes.status).toBe(403);
  });

  // =========================================================================
  // 9. 50 KL Non-Linear Chart, 210 & 300 Point Bulk Imports (D1 Variable Limit) & Atomic Rollback
  // =========================================================================
  it('9. Validates 50 KL non-linear chart import, 210-point and 300-point bulk imports under D1 SQL variable limits, and atomic rollback on failure', async () => {
    const { cookie } = await loginAs('admin@iocl.in');

    // Create a 50 KL HSD tank on ro-1001 to test 50 KL non-linear chart & large point imports
    const create50klRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/tanks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          tankNumber: 5,
          name: 'Tank 5 - HSD (50 KL)',
          productId: 'prod-hsd',
          capacityLitres: 50000,
          safeFillCapacityLitres: 48500,
          minimumOperatingLevelLitres: 2500,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(create50klRes.status).toBe(201);
    const tank50klId = ((await create50klRes.json()) as any).data.id;

    // 9a. Import 210 calibration points for 50 KL non-linear horizontal cylindrical tank (diameter 2985.714 mm -> 209 intervals = 210 points)
    const points210: Array<{ dipMillimetres: string; volumeLitres: string }> = [];
    const maxDip210 = 2750;
    const R210 = maxDip210 / 2;
    const fullArea210 = Math.PI * R210 * R210;
    for (let i = 0; i < 210; i++) {
      const h = (i / 209) * maxDip210;
      const cosArg = Math.max(-1, Math.min(1, (R210 - h) / R210));
      const area =
        R210 * R210 * Math.acos(cosArg) -
        (R210 - h) * Math.sqrt(Math.max(0, 2 * R210 * h - h * h));
      const vol = i === 0 ? 0 : i === 209 ? 50000 : (area / fullArea210) * 50000;
      points210.push({
        dipMillimetres: h.toFixed(3),
        volumeLitres: (Math.round(vol * 1000) / 1000).toFixed(3),
      });
    }
    expect(points210.length).toBe(210);

    // Spy on localD1.batch to verify statement count and bound SQL variable count per statement (Cloudflare D1 limit <= 100 vars)
    const batchSpyCalls: Array<{ statementsCount: number; maxVarsInSingleStatement: number }> = [];
    const origBatch = localD1.batch.bind(localD1);
    localD1.batch = async (statements: any[]) => {
      let maxVars = 0;
      for (const stmt of statements) {
        const varCount = Array.isArray(stmt.params) ? stmt.params.length : 0;
        if (varCount > maxVars) maxVars = varCount;
      }
      batchSpyCalls.push({
        statementsCount: statements.length,
        maxVarsInSingleStatement: maxVars,
      });
      return origBatch(statements);
    };

    const import210Res = await app.fetch(
      new Request(`http://localhost/api/v1/tanks/${tank50klId}/calibration/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          points: points210,
          activateImmediately: true,
          metadata: {
            chartUnitDip: 'MM',
            chartUnitVolume: 'LITRE',
            tankDiameterMm: '2750.000',
            tankLengthMm: '8825.000',
            maxDipMm: '2750.000',
            chartCapacityLitres: '50000.000',
            sourceFileName: 'IOCL_50KL_NONLINEAR_210PT.csv',
            referenceDocument: 'W&M/IOCL/50KL/2026',
            effectiveFrom: '2026-04-01',
          },
        }),
      }),
      env
    );
    expect(import210Res.status).toBe(201);
    const import210Json: any = await import210Res.json();
    expect(import210Json.importedCount).toBe(210);
    expect(import210Json.chart.status).toBe('ACTIVE');
    expect(import210Json.chart.chartCapacityLitreStr).toBe('50000.000');

    // Verify D1 SQL variable bound limit was strictly respected (chunk size 5 * 7 columns = 35 vars <= 100 limit)
    expect(batchSpyCalls.length).toBeGreaterThanOrEqual(1);
    expect(batchSpyCalls[batchSpyCalls.length - 1].maxVarsInSingleStatement).toBeLessThanOrEqual(35);

    // Dry-run comparison against 50 KL chart
    const midPt = points210[105];
    const dryRun50klRes = await app.fetch(
      new Request(`http://localhost/api/v1/tanks/${tank50klId}/calibration/dry-run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          checkpoints: [
            { dipMm: '0.000', printedVolumeLitres: '0.000' },
            { dipMm: midPt.dipMillimetres, printedVolumeLitres: midPt.volumeLitres },
            { dipMm: '2750.000', printedVolumeLitres: '50000.000' },
          ],
          toleranceLitres: '0.500',
        }),
      }),
      env
    );
    expect(dryRun50klRes.status).toBe(200);
    const dryRun50klJson: any = await dryRun50klRes.json();
    expect(dryRun50klJson.data.passedCount).toBe(3);
    expect(dryRun50klJson.data.failedCount).toBe(0);

    // 9b. Import 300 calibration points for 50 KL tank -> verify 300 points succeed within D1 SQL variable limits
    const points300 = generateCylindricalTankChartPoints({
      diameterMm: 2990,
      capacityLitres: 50000,
      stepMm: 10,
    });
    expect(points300.length).toBe(300);

    const import300Res = await app.fetch(
      new Request(`http://localhost/api/v1/tanks/${tank50klId}/calibration/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          points: points300,
          activateImmediately: true,
          createNewRevision: true,
          metadata: {
            tankDiameterMm: '2990.000',
            maxDipMm: '2990.000',
            sourceFileName: 'IOCL_50KL_NONLINEAR_300PT.csv',
          },
        }),
      }),
      env
    );
    expect(import300Res.status).toBe(201);
    const import300Json: any = await import300Res.json();
    expect(import300Json.importedCount).toBe(300);
    expect(import300Json.chart.revisionNumber).toBe(2);
    expect(batchSpyCalls[batchSpyCalls.length - 1].maxVarsInSingleStatement).toBeLessThanOrEqual(35);

    // 9c. Atomic Rollback Verification: simulate a mid-batch failure on the 15th statement and confirm 0 partial points are left
    const rawDb = localD1.getNativeDb();
    const countBeforeRollback = (
      rawDb
        .prepare(`SELECT COUNT(*) AS cnt FROM tank_calibration_points WHERE tank_id = ?`)
        .get(tank50klId) as { cnt: number }
    ).cnt;
    const chartsBeforeRollback = (
      rawDb
        .prepare(`SELECT COUNT(*) AS cnt FROM tank_calibration_charts WHERE tank_id = ?`)
        .get(tank50klId) as { cnt: number }
    ).cnt;

    localD1.batch = async (statements: any[]) => {
      // Inject a failing statement mid-batch to simulate a mid-batch DB failure inside D1 transaction
      const brokenStatements = [...statements];
      const badStmt = localD1.prepare(
        `INSERT INTO tank_calibration_points (id, chart_id, tank_id, dip_millimetres_milliunits, volume_milliunits, created_at, created_by)
         VALUES ('bad', 'non-existent-fk-chart', ?, -999, -999, '2026-01-01', 'usr-admin-1')`
      ).bind(tank50klId);
      brokenStatements.splice(Math.min(5, brokenStatements.length), 0, badStmt);
      return origBatch(brokenStatements);
    };

    const failedBatchRes = await app.fetch(
      new Request(`http://localhost/api/v1/tanks/${tank50klId}/calibration/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          points: points210,
          createNewRevision: true,
        }),
      }),
      env
    );
    expect(failedBatchRes.status).toBe(400);

    // Restore original batch
    localD1.batch = origBatch;

    const countAfterRollback = (
      rawDb
        .prepare(`SELECT COUNT(*) AS cnt FROM tank_calibration_points WHERE tank_id = ?`)
        .get(tank50klId) as { cnt: number }
    ).cnt;
    const chartsAfterRollback = (
      rawDb
        .prepare(`SELECT COUNT(*) AS cnt FROM tank_calibration_charts WHERE tank_id = ?`)
        .get(tank50klId) as { cnt: number }
    ).cnt;

    expect(countAfterRollback).toBe(countBeforeRollback);
    expect(chartsAfterRollback).toBe(chartsBeforeRollback);
  });

  // =========================================================================
  // 10. Staging Backup, Migration 0033 & COCO 22 5-Tank / 16-Nozzle UAT Regression
  //     (Shift ID: ops-62ee14f1-134d-4f6e-aa19-39dab0aa5df5, Date: 2026-10-23)
  // =========================================================================
  it('10. [Staging Replica of Production COCO 22] Creates pre-0033 backup, applies Migration 0033 to isolated staging copy, and preserves shift ops-62ee14f1-134d-4f6e-aa19-39dab0aa5df5 (5 opening dips = 50,000 L, 5 closing dips = 48,590 L, 16 nozzle readings = 1,410 L net sales, 0 L stock variance) even after activating Revision 2', async () => {
    /**
     * NOTE ON DATA PROVENANCE:
     * This test constructs a local pre-0033 SQLite/D1 staging database matching the verified
     * production topology and aggregate figures for COCO 22 (`ro-dabd3ff8-f023-4ef5-85ef-1bf100719a20`),
     * business date `2026-10-23`, shift ID `ops-62ee14f1-134d-4f6e-aa19-39dab0aa5df5`:
     *   - 5 active tanks with 5 opening tank readings (total Opening Stock = 50,000.000 L)
     *   - 5 closing tank readings (total Closing Stock = 48,590.000 L)
     *   - 16 active nozzles with 16 nozzle meter readings (total Net Fuel Sales = 1,410.000 L)
     *   - Stock Variance = 0.000 L (BALANCED)
     */
    const ts = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const pre0033MasterPath = `./.sqlite/test_coco22_pre0033_master_${ts}.db`;
    const backupDbPath = `./.sqlite/test_coco22_pre0033_backup_${ts}.db`;
    const stagingDbPath = `./.sqlite/test_coco22_staging_${ts}.db`;

    const coco22OutletId = 'ro-dabd3ff8-f023-4ef5-85ef-1bf100719a20';
    const coco22ShiftId = 'ops-62ee14f1-134d-4f6e-aa19-39dab0aa5df5';
    const uatDate = '2026-10-23';
    const nowIso = '2026-10-23T06:00:00.000Z';
    const closeIso = '2026-10-23T22:00:00.000Z';

    let stagingD1: any = null;

    try {
      // Step 1: Create pre-0033 database (migrations 0001..0032 only) and copy base master data
      const preD1 = createLocalD1Database(pre0033MasterPath, {
        throughMigration: '0032_global_designation_and_shift_masters.sql',
      });
      const preRaw = preD1.getNativeDb();

      // Copy pre-0033 master tables (states, divisions, sales_areas, roles, permissions, role_permissions, users, user_roles, user_scope_assignments, products, shift_templates, global_shift_templates) from the seeded localD1 without touching 0033 tables
      const absSeededPath = path.resolve(ROOT_DIR, dbPath).replace(/'/g, "''");
      preRaw.exec(`
        ATTACH DATABASE '${absSeededPath}' AS seeded;
        INSERT OR IGNORE INTO main.states SELECT * FROM seeded.states;
        INSERT OR IGNORE INTO main.divisions SELECT * FROM seeded.divisions;
        INSERT OR IGNORE INTO main.sales_areas SELECT * FROM seeded.sales_areas;
        INSERT OR IGNORE INTO main.retail_outlets SELECT * FROM seeded.retail_outlets;
        INSERT OR IGNORE INTO main.roles SELECT * FROM seeded.roles;
        INSERT OR IGNORE INTO main.permissions SELECT * FROM seeded.permissions;
        INSERT OR IGNORE INTO main.role_permissions SELECT * FROM seeded.role_permissions;
        INSERT OR IGNORE INTO main.users SELECT * FROM seeded.users;
        INSERT OR IGNORE INTO main.user_roles SELECT * FROM seeded.user_roles;
        INSERT OR IGNORE INTO main.user_scope_assignments SELECT * FROM seeded.user_scope_assignments;
        INSERT OR IGNORE INTO main.products SELECT * FROM seeded.products;
        INSERT OR IGNORE INTO main.global_shift_templates SELECT * FROM seeded.global_shift_templates;
        INSERT OR IGNORE INTO main.shift_templates SELECT * FROM seeded.shift_templates;
        DETACH DATABASE seeded;
      `);

      // Insert COCO 22 outlet (`ro-dabd3ff8-f023-4ef5-85ef-1bf100719a20`)
      preRaw.exec(`
        INSERT INTO retail_outlets (
          id, ro_code, name, outlet_type, state_id, division_id, sales_area_id,
          address, city, district, pincode, status, created_at, updated_at
        ) VALUES (
          '${coco22OutletId}', '220022', 'COCO 22', 'COCO', 'state-wb', 'div-kol', 'sa-cen',
          'COCO 22 Highway Plot', 'Kolkata', 'Kolkata', '700022', 'ACTIVE', '${nowIso}', '${nowIso}'
        );

        INSERT INTO outlet_products (id, outlet_id, product_id, status, created_at, created_by)
        VALUES
          ('op-coco22-1', '${coco22OutletId}', 'prod-ms', 'ACTIVE', '${nowIso}', 'user-admin'),
          ('op-coco22-2', '${coco22OutletId}', 'prod-hsd', 'ACTIVE', '${nowIso}', 'user-admin'),
          ('op-coco22-3', '${coco22OutletId}', 'prod-xp95', 'ACTIVE', '${nowIso}', 'user-admin'),
          ('op-coco22-4', '${coco22OutletId}', 'prod-xtragreen', 'ACTIVE', '${nowIso}', 'user-admin');

        INSERT INTO outlet_product_prices (id, outlet_id, product_id, price_paise_per_unit, effective_from, status, created_at, created_by)
        VALUES
          ('opp-coco22-1', '${coco22OutletId}', 'prod-ms', 10541, '2026-10-01', 'ACTIVE', '${nowIso}', 'user-admin'),
          ('opp-coco22-2', '${coco22OutletId}', 'prod-hsd', 9276, '2026-10-01', 'ACTIVE', '${nowIso}', 'user-admin'),
          ('opp-coco22-3', '${coco22OutletId}', 'prod-xp95', 11250, '2026-10-01', 'ACTIVE', '${nowIso}', 'user-admin'),
          ('opp-coco22-4', '${coco22OutletId}', 'prod-xtragreen', 9650, '2026-10-01', 'ACTIVE', '${nowIso}', 'user-admin');
      `);

      // Configure 5 Active Tanks for COCO 22:
      // Tank 1: MS (20 KL), Opening = 10,000 L (1000 mm), Closing = 9,650 L (965 mm) -> Depletion = 350 L
      // Tank 2: MS (20 KL), Opening = 10,000 L (1000 mm), Closing = 9,650 L (965 mm) -> Depletion = 350 L
      // Tank 3: HSD (20 KL), Opening = 10,000 L (1000 mm), Closing = 9,700 L (970 mm) -> Depletion = 300 L
      // Tank 4: XP95 (20 KL), Opening = 10,000 L (1000 mm), Closing = 9,790 L (979 mm) -> Depletion = 210 L
      // Tank 5: XTRAGREEN (20 KL), Opening = 10,000 L (1000 mm), Closing = 9,800 L (980 mm) -> Depletion = 200 L
      // Total Opening Stock = 50,000 L; Total Closing Stock = 48,590 L; Total Depletion = 1,410 L
      const tankConfigs = [
        { num: 1, id: 'tank-coco22-1', name: 'Tank 1 - MS', productId: 'prod-ms', productCode: 'MS', productName: 'Motor Spirit (Petrol)', closeDipMm: 965000, closeVolMilli: 9650000, salesMilli: 350000 },
        { num: 2, id: 'tank-coco22-2', name: 'Tank 2 - MS', productId: 'prod-ms', productCode: 'MS', productName: 'Motor Spirit (Petrol)', closeDipMm: 965000, closeVolMilli: 9650000, salesMilli: 350000 },
        { num: 3, id: 'tank-coco22-3', name: 'Tank 3 - HSD', productId: 'prod-hsd', productCode: 'HSD', productName: 'High Speed Diesel', closeDipMm: 970000, closeVolMilli: 9700000, salesMilli: 300000 },
        { num: 4, id: 'tank-coco22-4', name: 'Tank 4 - XP95', productId: 'prod-xp95', productCode: 'XP95', productName: 'XP95 Premium Petrol', closeDipMm: 979000, closeVolMilli: 9790000, salesMilli: 210000 },
        { num: 5, id: 'tank-coco22-5', name: 'Tank 5 - XTRAGREEN', productId: 'prod-xtragreen', productCode: 'XTRAGREEN', productName: 'XTRAGREEN Diesel', closeDipMm: 980000, closeVolMilli: 9800000, salesMilli: 200000 },
      ];

      for (const tc of tankConfigs) {
        preRaw.exec(`
          INSERT INTO tanks (
            id, outlet_id, tank_number, name, product_id,
            capacity_litres, safe_fill_capacity_litres, minimum_operating_level_litres,
            status, commissioned_at, created_at, created_by, updated_at
          ) VALUES (
            '${tc.id}', '${coco22OutletId}', ${tc.num}, '${tc.name}', '${tc.productId}',
            20000, 19000, 1000, 'ACTIVE', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'
          );

          INSERT INTO tank_calibration_points (id, tank_id, dip_millimetres_milliunits, volume_milliunits, created_at, created_by)
          VALUES
            ('tcp-${tc.id}-0',    '${tc.id}', 0,       0,        '${nowIso}', 'user-admin'),
            ('tcp-${tc.id}-500',  '${tc.id}', 500000,  5000000,  '${nowIso}', 'user-admin'),
            ('tcp-${tc.id}-1000', '${tc.id}', 1000000, 10000000, '${nowIso}', 'user-admin'),
            ('tcp-${tc.id}-1500', '${tc.id}', 1500000, 15000000, '${nowIso}', 'user-admin'),
            ('tcp-${tc.id}-2000', '${tc.id}', 2000000, 20000000, '${nowIso}', 'user-admin');
        `);
      }

      // Configure 4 Dispensers & 16 Active Nozzles for COCO 22:
      for (let d = 1; d <= 4; d++) {
        preRaw.exec(`
          INSERT INTO dispensers (
            id, outlet_id, dispenser_number, name, manufacturer, model, serial_number,
            nozzle_capacity, status, commissioned_at, created_at, created_by, updated_at
          ) VALUES (
            'du-coco22-${d}', '${coco22OutletId}', ${d}, 'Dispenser ${d}', 'Gilbarco', 'Encore', 'SN-COCO22-DU${d}',
            4, 'ACTIVE', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'
          );
        `);
      }

      // 16 nozzles with net sales summing to 1,410.000 L matching each tank's depletion:
      // Nozzles 1..4  -> Tank 1 (MS):        90 + 90 + 85 + 85 = 350 L
      // Nozzles 5..8  -> Tank 2 (MS):        90 + 90 + 85 + 85 = 350 L (Total MS = 700 L)
      // Nozzles 9..12 -> Tank 3 (HSD):       80 + 80 + 70 + 70 = 300 L (Total HSD = 300 L)
      // Nozzles 13..14 -> Tank 4 (XP95):     110 + 100         = 210 L (Total XP95 = 210 L)
      // Nozzles 15..16 -> Tank 5 (XTRAGREEN): 100 + 100        = 200 L (Total XTRAGREEN = 200 L)
      // Grand Total across 16 nozzles = 1,410 L
      const nozzleSpecs = [
        { num: 1, du: 1, tankId: 'tank-coco22-1', tankNum: 1, productId: 'prod-ms', productCode: 'MS', productName: 'Motor Spirit (Petrol)', salesLitres: 90 },
        { num: 2, du: 1, tankId: 'tank-coco22-1', tankNum: 1, productId: 'prod-ms', productCode: 'MS', productName: 'Motor Spirit (Petrol)', salesLitres: 90 },
        { num: 3, du: 1, tankId: 'tank-coco22-1', tankNum: 1, productId: 'prod-ms', productCode: 'MS', productName: 'Motor Spirit (Petrol)', salesLitres: 85 },
        { num: 4, du: 1, tankId: 'tank-coco22-1', tankNum: 1, productId: 'prod-ms', productCode: 'MS', productName: 'Motor Spirit (Petrol)', salesLitres: 85 },
        { num: 5, du: 2, tankId: 'tank-coco22-2', tankNum: 2, productId: 'prod-ms', productCode: 'MS', productName: 'Motor Spirit (Petrol)', salesLitres: 90 },
        { num: 6, du: 2, tankId: 'tank-coco22-2', tankNum: 2, productId: 'prod-ms', productCode: 'MS', productName: 'Motor Spirit (Petrol)', salesLitres: 90 },
        { num: 7, du: 2, tankId: 'tank-coco22-2', tankNum: 2, productId: 'prod-ms', productCode: 'MS', productName: 'Motor Spirit (Petrol)', salesLitres: 85 },
        { num: 8, du: 2, tankId: 'tank-coco22-2', tankNum: 2, productId: 'prod-ms', productCode: 'MS', productName: 'Motor Spirit (Petrol)', salesLitres: 85 },
        { num: 9, du: 3, tankId: 'tank-coco22-3', tankNum: 3, productId: 'prod-hsd', productCode: 'HSD', productName: 'High Speed Diesel', salesLitres: 80 },
        { num: 10, du: 3, tankId: 'tank-coco22-3', tankNum: 3, productId: 'prod-hsd', productCode: 'HSD', productName: 'High Speed Diesel', salesLitres: 80 },
        { num: 11, du: 3, tankId: 'tank-coco22-3', tankNum: 3, productId: 'prod-hsd', productCode: 'HSD', productName: 'High Speed Diesel', salesLitres: 70 },
        { num: 12, du: 3, tankId: 'tank-coco22-3', tankNum: 3, productId: 'prod-hsd', productCode: 'HSD', productName: 'High Speed Diesel', salesLitres: 70 },
        { num: 13, du: 4, tankId: 'tank-coco22-4', tankNum: 4, productId: 'prod-xp95', productCode: 'XP95', productName: 'XP95 Premium Petrol', salesLitres: 110 },
        { num: 14, du: 4, tankId: 'tank-coco22-4', tankNum: 4, productId: 'prod-xp95', productCode: 'XP95', productName: 'XP95 Premium Petrol', salesLitres: 100 },
        { num: 15, du: 4, tankId: 'tank-coco22-5', tankNum: 5, productId: 'prod-xtragreen', productCode: 'XTRAGREEN', productName: 'XTRAGREEN Diesel', salesLitres: 100 },
        { num: 16, du: 4, tankId: 'tank-coco22-5', tankNum: 5, productId: 'prod-xtragreen', productCode: 'XTRAGREEN', productName: 'XTRAGREEN Diesel', salesLitres: 100 },
      ];

      for (const ns of nozzleSpecs) {
        const duNozzleNum = ((ns.num - 1) % 4) + 1;
        preRaw.exec(`
          INSERT INTO nozzles (
            id, outlet_id, dispenser_id, nozzle_number, product_id, tank_id,
            status, created_at, created_by, updated_at
          ) VALUES (
            'noz-coco22-${ns.num}', '${coco22OutletId}', 'du-coco22-${ns.du}', ${duNozzleNum},
            '${ns.productId}', '${ns.tankId}', 'ACTIVE', '${nowIso}', 'user-admin', '${nowIso}'
          );
        `);
      }

      // Create Operational Shift `ops-62ee14f1-134d-4f6e-aa19-39dab0aa5df5` on `2026-10-23` (pre-0033 schema)
      preRaw.exec(`
        INSERT INTO operational_shifts (
          id, outlet_id, shift_template_id, business_date, status,
          opened_by_user_id, started_at, closed_by_user_id, closed_at,
          notes, created_at, updated_at
        ) VALUES (
          '${coco22ShiftId}', '${coco22OutletId}', 'st-ro1-1', '${uatDate}', 'CLOSED',
          'user-admin', '${nowIso}', 'user-admin', '${closeIso}',
          'COCO 22 23 October UAT Shift (5 tanks, 16 nozzles)', '${nowIso}', '${closeIso}'
        );

        INSERT INTO operational_shift_product_prices (
          id, operational_shift_id, outlet_id, product_id, product_code, product_name,
          unit, product_category, price_paise_per_unit, source_price_id, created_at
        ) VALUES
          ('ospp-coco22-ms',   '${coco22ShiftId}', '${coco22OutletId}', 'prod-ms',        'MS',        'Motor Spirit (Petrol)', 'LITRE', 'MS',        10541, 'opp-coco22-1', '${nowIso}'),
          ('ospp-coco22-hsd',  '${coco22ShiftId}', '${coco22OutletId}', 'prod-hsd',       'HSD',       'High Speed Diesel',     'LITRE', 'HSD',       9276,  'opp-coco22-2', '${nowIso}'),
          ('ospp-coco22-xp95', '${coco22ShiftId}', '${coco22OutletId}', 'prod-xp95',      'XP95',      'XP95 Premium Petrol',   'LITRE', 'XP95',      11250, 'opp-coco22-3', '${nowIso}'),
          ('ospp-coco22-xg',   '${coco22ShiftId}', '${coco22OutletId}', 'prod-xtragreen', 'XTRAGREEN', 'XTRAGREEN Diesel',      'LITRE', 'XTRAGREEN', 9650,  'opp-coco22-4', '${nowIso}');
      `);

      // Insert 5 shift tank snapshots, 10 tank stock readings (5 OPENING + 5 CLOSING), & 5 tank stock reconciliations in pre-0033 format
      for (const tc of tankConfigs) {
        preRaw.exec(`
          INSERT INTO operational_shift_tanks (
            id, operational_shift_id, outlet_id, tank_id, tank_number, tank_name,
            product_id, product_code, product_name, product_unit,
            capacity_milliunits, safe_fill_capacity_milliunits, created_at
          ) VALUES (
            'ost-${tc.id}', '${coco22ShiftId}', '${coco22OutletId}', '${tc.id}', ${tc.num}, '${tc.name}',
            '${tc.productId}', '${tc.productCode}', '${tc.productName}', 'LITRE',
            20000000, 19000000, '${nowIso}'
          );

          INSERT INTO tank_stock_readings (
            id, operational_shift_id, outlet_id, tank_id, product_id, reading_type, source,
            product_dip_mm_milliunits, water_dip_mm_milliunits, gross_observed_volume_milliunits,
            water_volume_milliunits, net_product_volume_milliunits,
            recorded_at, recorded_by_user_id, created_at, updated_at
          ) VALUES
            (
              'tsr-open-${tc.id}', '${coco22ShiftId}', '${coco22OutletId}', '${tc.id}', '${tc.productId}', 'OPENING', 'MANUAL',
              1000000, 0, 10000000, 0, 10000000,
              '${nowIso}', 'user-admin', '${nowIso}', '${nowIso}'
            ),
            (
              'tsr-close-${tc.id}', '${coco22ShiftId}', '${coco22OutletId}', '${tc.id}', '${tc.productId}', 'CLOSING', 'MANUAL',
              ${tc.closeDipMm}, 0, ${tc.closeVolMilli}, 0, ${tc.closeVolMilli},
              '${closeIso}', 'user-admin', '${closeIso}', '${closeIso}'
            );

          INSERT INTO shift_stock_reconciliations (
            id, operational_shift_id, outlet_id, tank_id, product_id,
            opening_stock_milliunits, receipt_quantity_milliunits, sales_quantity_milliunits,
            theoretical_closing_stock_milliunits, physical_closing_stock_milliunits,
            variance_milliunits, variance_status, calculated_at, created_at, updated_at
          ) VALUES (
            'ssr-${tc.id}', '${coco22ShiftId}', '${coco22OutletId}', '${tc.id}', '${tc.productId}',
            10000000, 0, ${tc.salesMilli}, ${tc.closeVolMilli}, ${tc.closeVolMilli},
            0, 'BALANCED', '${closeIso}', '${closeIso}', '${closeIso}'
          );
        `);
      }

      // Insert 16 shift nozzle snapshots & 16 nozzle meter readings
      for (const ns of nozzleSpecs) {
        const duNozzleNum = ((ns.num - 1) % 4) + 1;
        const openMilli = ns.num * 1000000; // e.g., 1000.000 L
        const salesMilli = ns.salesLitres * 1000;
        const closeMilli = openMilli + salesMilli;
        preRaw.exec(`
          INSERT INTO operational_shift_nozzles (
            id, operational_shift_id, outlet_id, nozzle_id, dispenser_id,
            dispenser_number, dispenser_name, nozzle_number,
            product_id, product_code, product_name, product_category, product_unit,
            tank_id, tank_number, snapshot_status, created_at
          ) VALUES (
            'osn-coco22-${ns.num}', '${coco22ShiftId}', '${coco22OutletId}', 'noz-coco22-${ns.num}', 'du-coco22-${ns.du}',
            ${ns.du}, 'Dispenser ${ns.du}', ${duNozzleNum},
            '${ns.productId}', '${ns.productCode}', '${ns.productName}', '${ns.productCode}', 'LITRE',
            '${ns.tankId}', ${ns.tankNum}, 'ACTIVE', '${nowIso}'
          );

          INSERT INTO nozzle_meter_readings (
            id, operational_shift_id, outlet_id, nozzle_id,
            opening_totalizer_milliunits, closing_totalizer_milliunits, testing_quantity_milliunits,
            gross_sales_quantity_milliunits, net_sales_quantity_milliunits, opening_variance_milliunits,
            recorded_by_user_id, has_opening_variance, created_at, updated_at
          ) VALUES (
            'nmr-coco22-${ns.num}', '${coco22ShiftId}', '${coco22OutletId}', 'noz-coco22-${ns.num}',
            ${openMilli}, ${closeMilli}, 0,
            ${salesMilli}, ${salesMilli}, 0,
            'user-admin', 0, '${closeIso}', '${closeIso}'
          );
        `);
      }

      // Capture pre-migration baseline counts & aggregates before closing preD1
      const preCalPointsSnapshot = preRaw
        .prepare(
          `SELECT id, tank_id, dip_millimetres_milliunits, volume_milliunits
           FROM tank_calibration_points
           WHERE tank_id LIKE 'tank-coco22-%'
           ORDER BY tank_id, dip_millimetres_milliunits`
        )
        .all();
      expect(preCalPointsSnapshot.length).toBe(25); // 5 tanks * 5 points

      preD1.close();

      // =====================================================================
      // Staging Step 1: Create backup copy and isolated staging copy of DB
      // =====================================================================
      fs.copyFileSync(pre0033MasterPath, backupDbPath);
      fs.copyFileSync(pre0033MasterPath, stagingDbPath);
      expect(fs.existsSync(backupDbPath)).toBe(true);
      expect(fs.existsSync(stagingDbPath)).toBe(true);

      // =====================================================================
      // Staging Step 2: Apply migration 0033 ONLY to the isolated staging copy
      // =====================================================================
      stagingD1 = createLocalD1Database(stagingDbPath, {
        throughMigration: '0032_global_designation_and_shift_masters.sql',
      });
      const stagingRaw = stagingD1.getNativeDb();
      const migration0033Sql = fs.readFileSync(MIGRATION_0033_PATH, 'utf-8');
      stagingRaw.exec(migration0033Sql);
      const migration0034Path = path.resolve(ROOT_DIR, 'migrations/0034_global_tank_calibration_templates.sql');
      if (fs.existsSync(migration0034Path)) {
        stagingRaw.exec(fs.readFileSync(migration0034Path, 'utf-8'));
      }

      // Verify backup DB was NOT modified (still at 0032, no tank_calibration_charts table)
      const backupCheckD1 = createLocalD1Database(backupDbPath, {
        throughMigration: '0032_global_designation_and_shift_masters.sql',
      });
      const backupTables = backupCheckD1
        .getNativeDb()
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='tank_calibration_charts'`)
        .all();
      expect(backupTables.length).toBe(0);
      backupCheckD1.close();

      // =====================================================================
      // Staging Step 3 & 6: Verify all existing calibration points & valid revision references
      // =====================================================================
      const postCalPointsSnapshot = stagingRaw
        .prepare(
          `SELECT id, tank_id, dip_millimetres_milliunits, volume_milliunits
           FROM tank_calibration_points
           WHERE tank_id LIKE 'tank-coco22-%'
           ORDER BY tank_id, dip_millimetres_milliunits`
        )
        .all();
      expect(postCalPointsSnapshot).toEqual(preCalPointsSnapshot);

      // Confirm zero orphan or null calibration chart references across the entire staging DB
      const nullPointChartCount = (
        stagingRaw
          .prepare(`SELECT COUNT(*) AS cnt FROM tank_calibration_points WHERE chart_id IS NULL`)
          .get() as { cnt: number }
      ).cnt;
      expect(nullPointChartCount).toBe(0);

      const invalidPointFkCount = (
        stagingRaw
          .prepare(
            `SELECT COUNT(*) AS cnt FROM tank_calibration_points tcp
             LEFT JOIN tank_calibration_charts tcc ON tcc.id = tcp.chart_id
             WHERE tcc.id IS NULL`
          )
          .get() as { cnt: number }
      ).cnt;
      expect(invalidPointFkCount).toBe(0);

      const invalidReadingFkCount = (
        stagingRaw
          .prepare(
            `SELECT COUNT(*) AS cnt FROM tank_stock_readings tsr
             LEFT JOIN tank_calibration_charts tcc ON tcc.id = tsr.calibration_chart_id
             WHERE tsr.calibration_chart_id IS NULL OR tcc.id IS NULL OR tsr.calibration_revision IS NULL`
          )
          .get() as { cnt: number }
      ).cnt;
      expect(invalidReadingFkCount).toBe(0);

      const invalidShiftTankFkCount = (
        stagingRaw
          .prepare(
            `SELECT COUNT(*) AS cnt FROM operational_shift_tanks ost
             LEFT JOIN tank_calibration_charts tcc ON tcc.id = ost.calibration_chart_id
             WHERE ost.operational_shift_id = ? AND (ost.calibration_chart_id IS NULL OR tcc.id IS NULL OR ost.calibration_revision != 1)`
          )
          .get(coco22ShiftId) as { cnt: number }
      ).cnt;
      expect(invalidShiftTankFkCount).toBe(0);

      // =====================================================================
      // Staging Step 4: Confirm Historical COCO 22 Figures on Shift ops-62ee14f1-134d-4f6e-aa19-39dab0aa5df5
      // =====================================================================
      const stagingEnv = {
        DB: stagingD1,
        DOCUMENTS_BUCKET: new MockR2Bucket(),
        SESSION_SECRET: 'test-session-secret-key-12345678901234567890',
        ENVIRONMENT: 'development',
        ALLOWED_ORIGINS: 'http://localhost:3000',
      };

      const loginRes = await app.fetch(
        new Request('http://localhost/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
          body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
        }),
        stagingEnv
      );
      const stagingCookie = loginRes.headers.get('set-cookie') || '';

      const verifyCoco22ShiftAndDsr = async () => {
        const dailyOpsRes = await app.fetch(
          new Request(
            `http://localhost/api/v1/outlets/${coco22OutletId}/daily-operations?businessDate=${uatDate}`,
            { headers: { Cookie: stagingCookie, Origin: 'http://localhost:3000' } }
          ),
          stagingEnv
        );
        expect(dailyOpsRes.status).toBe(200);
        const dailyOpsJson: any = await dailyOpsRes.json();
        const shift = dailyOpsJson.data.shifts.find(
          (s: any) => s.shift?.id === coco22ShiftId || s.id === coco22ShiftId
        );
        expect(shift).toBeDefined();

        // 5 tanks with 5 opening readings and 5 closing readings
        expect(shift.tanks.length).toBe(5);
        const openingReadings = shift.tanks.map((t: any) => t.openingReading).filter(Boolean);
        const closingReadings = shift.tanks.map((t: any) => t.closingReading).filter(Boolean);
        expect(openingReadings.length).toBe(5);
        expect(closingReadings.length).toBe(5);

        // Every historical reading references Revision 1
        for (const r of [...openingReadings, ...closingReadings]) {
          expect(r.calibrationRevision).toBe(1);
          expect(r.calibrationChartId).toMatch(/^tcc-legacy-tank-coco22-[1-5]-r1$/);
        }

        // Sum of 5 opening tank readings = 50,000 L; sum of 5 closing tank readings = 48,590 L
        const totalOpeningL = openingReadings.reduce(
          (acc: number, r: any) => acc + parseFloat(r.netProductVolumeStr),
          0
        );
        const totalClosingL = closingReadings.reduce(
          (acc: number, r: any) => acc + parseFloat(r.netProductVolumeStr),
          0
        );
        expect(totalOpeningL).toBe(50000);
        expect(totalClosingL).toBe(48590);

        // 16 nozzle meter readings summing to 1,410 L net sales
        expect(shift.nozzles.length).toBe(16);
        const nozzleReadings = shift.nozzles.map((n: any) => n.reading).filter(Boolean);
        expect(nozzleReadings.length).toBe(16);
        const totalNozzleNetSalesL = nozzleReadings.reduce(
          (acc: number, r: any) => acc + parseFloat(r.netSalesQuantityStr ?? r.netSalesStr),
          0
        );
        expect(totalNozzleNetSalesL).toBe(1410);

        // Verify DSR endpoint for 2026-10-23
        const dsrRes = await app.fetch(
          new Request(
            `http://localhost/api/v1/outlets/${coco22OutletId}/fuel/daily-summary?businessDate=${uatDate}`,
            { headers: { Cookie: stagingCookie, Origin: 'http://localhost:3000' } }
          ),
          stagingEnv
        );
        expect(dsrRes.status).toBe(200);
        const dsrJson: any = await dsrRes.json();
        const totalDsrOpeningL = dsrJson.data.byProduct.reduce(
          (acc: number, p: any) => acc + p.openingStockL,
          0
        );
        const totalDsrClosingL = dsrJson.data.byProduct.reduce(
          (acc: number, p: any) => acc + p.physicalClosingL,
          0
        );
        expect(totalDsrOpeningL).toBe(50000);
        expect(totalDsrClosingL).toBe(48590);
        expect(dsrJson.data.totals.netSalesL).toBe(1410);
        expect(dsrJson.data.totals.varianceL).toBe(0);
      };

      await verifyCoco22ShiftAndDsr();

      // =====================================================================
      // Staging Step 5: Test chart revision activation without changing past DSR calculations
      // =====================================================================
      const rev2ImportRes = await app.fetch(
        new Request('http://localhost/api/v1/tanks/tank-coco22-1/calibration/bulk', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: stagingCookie,
            Origin: 'http://localhost:3000',
          },
          body: JSON.stringify({
            points: generateCylindricalTankChartPoints({
              diameterMm: 2100,
              capacityLitres: 20000,
              stepMm: 50,
            }),
            activateImmediately: true,
            createNewRevision: true,
            metadata: {
              tankDiameterMm: '2100.000',
              tankLengthMm: '6250.000',
              maxDipMm: '2100.000',
              chartCapacityLitres: '20000.000',
              sourceFileName: 'coco22_tank1_rev2_20kl.csv',
              effectiveFrom: '2026-11-01',
            },
          }),
        }),
        stagingEnv
      );
      expect(rev2ImportRes.status).toBe(201);
      const rev2ImportJson: any = await rev2ImportRes.json();
      expect(rev2ImportJson.chart.revisionNumber).toBe(2);
      expect(rev2ImportJson.chart.status).toBe('ACTIVE');

      // Re-verify historical COCO 22 shift ops-62ee14f1-134d-4f6e-aa19-39dab0aa5df5 & 2026-10-23 DSR
      // -> Must still report 50,000 L opening, 48,590 L closing, 1,410 L net sales, 0 L variance!
      await verifyCoco22ShiftAndDsr();
    } finally {
      try {
        if (stagingD1) stagingD1.close();
      } catch {}
      for (const p of [pre0033MasterPath, backupDbPath, stagingDbPath]) {
        try {
          if (fs.existsSync(p)) fs.unlinkSync(p);
          if (fs.existsSync(`${p}-wal`)) fs.unlinkSync(`${p}-wal`);
          if (fs.existsSync(`${p}-shm`)) fs.unlinkSync(`${p}-shm`);
        } catch {}
      }
    }
  });

  // =========================================================================
  // 11. Scanned IOCL Reference Chart Dimensions Acceptance Tests
  //     (20 KL: D = 2,100 mm, L = 6,250 mm; 50 KL: D = 3,000 mm, L = 7,500 mm)
  // =========================================================================
  it('11. Validates uploaded IOCL scanned chart reference dimensions (20 KL: D=2,100 mm, L=6,250 mm; 50 KL: D=3,000 mm, L=7,500 mm), boundary constraints, and dry-run comparison', async () => {
    /**
     * NOTE ON SCANNED CHART VERIFICATION SCOPE:
     * The uploaded IOCL reference charts specify:
     *   - 20 KL Tank Chart: Diameter = 2,100 mm, Length = 6,250 mm
     *   - 50 KL Tank Chart: Diameter = 3,000 mm, Length = 7,500 mm
     * This test validates these exact tank dimensions, maximum dip range rules,
     * metadata persistence, and dry-run checkpoint deltas. Full row-by-row PDF
     * transcription of the physical strapping tables must be validated via the
     * Dry-Run Comparison tool before activating a chart on a live tank.
     */
    const { cookie } = await loginAs('admin@iocl.in');

    // 11a. 20 KL Tank Chart (Diameter: 2,100 mm, Length: 6,250 mm) on tank-ro1-1 (20,000 L capacity)
    const points20kl = generateCylindricalTankChartPoints({
      diameterMm: 2100,
      capacityLitres: 20000,
      stepMm: 10, // 211 points from 0 mm to 2,100 mm
    });
    expect(points20kl.length).toBe(211);
    expect(points20kl[0]).toEqual({ dipMillimetres: '0.000', volumeLitres: '0.000' });
    expect(points20kl[105]).toEqual({ dipMillimetres: '1050.000', volumeLitres: '10000.000' }); // Half-diameter = 50% capacity
    expect(points20kl[210]).toEqual({ dipMillimetres: '2100.000', volumeLitres: '20000.000' });

    // Verify client preview & diagnostics flag any dip exceeding the 2,100 mm diameter
    const previewExceed2100 = buildCalibrationImportPreview(
      '0,0\n1050,10000\n2110,20000',
      {
        tankCapacityLitres: 20000,
        safeFillCapacityLitres: 19000,
        tankDiameterMm: 2100,
        maxDipMm: 2100,
      }
    );
    expect(previewExceed2100.valid).toBe(false);
    expect(previewExceed2100.error).toContain('exceeds configured maximum dip range');

    const diag20kl = analyzeCalibrationChartDiagnostics(points20kl, {
      tankCapacityLitres: 20000,
      safeFillCapacityLitres: 19000,
      tankDiameterMm: 2100,
      maxDipMm: 2100,
    });
    expect(diag20kl.dominantStepMm).toBe(10);
    expect(diag20kl.missingStepWarnings.length).toBe(0);

    const import20klRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          points: points20kl,
          createNewRevision: true,
          metadata: {
            chartUnitDip: 'MM',
            chartUnitVolume: 'LITRE',
            tankDiameterMm: '2100.000',
            tankLengthMm: '6250.000',
            maxDipMm: '2100.000',
            chartCapacityLitres: '20000.000',
            sourceFileName: 'IOCL_20KL_D2100_L6250.csv',
            referenceDocument: 'IOCL-20KL-D2100-L6250',
            effectiveFrom: '2026-10-25',
          },
        }),
      }),
      env
    );
    expect(import20klRes.status).toBe(201);
    const import20klJson: any = await import20klRes.json();
    expect(import20klJson.importedCount).toBe(211);
    expect(import20klJson.chart.status).toBe('DRAFT'); // Default safe DRAFT mode
    expect(import20klJson.chart.tankDiameterMmStr).toBe('2100.000');
    expect(import20klJson.chart.tankLengthMmStr).toBe('6250.000');
    expect(import20klJson.chart.maxDipMmStr).toBe('2100.000');
    expect(import20klJson.chart.chartCapacityLitreStr).toBe('20000.000');

    // Run dry-run comparison against the 20 KL (D=2,100 mm, L=6,250 mm) draft revision
    const dryRun20klRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration/dry-run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          chartId: import20klJson.chart.id,
          checkpoints: [
            { dipMm: '0.000', printedVolumeLitres: '0.000' },
            { dipMm: points20kl[52].dipMillimetres, printedVolumeLitres: points20kl[52].volumeLitres },
            { dipMm: '1050.000', printedVolumeLitres: '10000.000' },
            { dipMm: '2100.000', printedVolumeLitres: '20000.000' },
          ],
          toleranceLitres: '0.500',
        }),
      }),
      env
    );
    expect(dryRun20klRes.status).toBe(200);
    const dryRun20klJson: any = await dryRun20klRes.json();
    expect(dryRun20klJson.data.passedCount).toBe(4);
    expect(dryRun20klJson.data.failedCount).toBe(0);

    // 11b. 50 KL Tank Chart (Diameter: 3,000 mm, Length: 7,500 mm)
    const create50klTankRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/tanks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          tankNumber: 6,
          name: 'Tank 6 - HSD (50 KL D3000xL7500)',
          productId: 'prod-hsd',
          capacityLitres: 50000,
          safeFillCapacityLitres: 48500,
          minimumOperatingLevelLitres: 2500,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(create50klTankRes.status).toBe(201);
    const tank50klId = ((await create50klTankRes.json()) as any).data.id;

    const points50kl = generateCylindricalTankChartPoints({
      diameterMm: 3000,
      capacityLitres: 50000,
      stepMm: 10, // 301 points from 0 mm to 3,000 mm
    });
    expect(points50kl.length).toBe(301);
    expect(points50kl[0]).toEqual({ dipMillimetres: '0.000', volumeLitres: '0.000' });
    expect(points50kl[150]).toEqual({ dipMillimetres: '1500.000', volumeLitres: '25000.000' }); // Half-diameter = 25,000 L
    expect(points50kl[300]).toEqual({ dipMillimetres: '3000.000', volumeLitres: '50000.000' });

    const import50klRes = await app.fetch(
      new Request(`http://localhost/api/v1/tanks/${tank50klId}/calibration/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          points: points50kl,
          metadata: {
            chartUnitDip: 'MM',
            chartUnitVolume: 'LITRE',
            tankDiameterMm: '3000.000',
            tankLengthMm: '7500.000',
            maxDipMm: '3000.000',
            chartCapacityLitres: '50000.000',
            sourceFileName: 'IOCL_50KL_D3000_L7500.csv',
            referenceDocument: 'IOCL-50KL-D3000-L7500',
            effectiveFrom: '2026-10-25',
          },
        }),
      }),
      env
    );
    expect(import50klRes.status).toBe(201);
    const import50klJson: any = await import50klRes.json();
    expect(import50klJson.importedCount).toBe(301);
    expect(import50klJson.chart.status).toBe('DRAFT');
    expect(import50klJson.chart.tankDiameterMmStr).toBe('3000.000');
    expect(import50klJson.chart.tankLengthMmStr).toBe('7500.000');
    expect(import50klJson.chart.maxDipMmStr).toBe('3000.000');
    expect(import50klJson.chart.chartCapacityLitreStr).toBe('50000.000');

    const dryRun50klRes = await app.fetch(
      new Request(`http://localhost/api/v1/tanks/${tank50klId}/calibration/dry-run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          chartId: import50klJson.chart.id,
          checkpoints: [
            { dipMm: '0.000', printedVolumeLitres: '0.000' },
            { dipMm: points50kl[75].dipMillimetres, printedVolumeLitres: points50kl[75].volumeLitres },
            { dipMm: '1500.000', printedVolumeLitres: '25000.000' },
            { dipMm: '3000.000', printedVolumeLitres: '50000.000' },
          ],
          toleranceLitres: '0.500',
        }),
      }),
      env
    );
    expect(dryRun50klRes.status).toBe(200);
    const dryRun50klJson: any = await dryRun50klRes.json();
    expect(dryRun50klJson.data.passedCount).toBe(4);
    expect(dryRun50klJson.data.failedCount).toBe(0);
  });

  // =========================================================================
  // 12. Interrupted / Failed Migration 0033 Atomic Rollback Verification
  // =========================================================================
  it('12. Ensures an interrupted or failed Migration 0033 execution rolls back atomically without leaving partial schema or data changes', () => {
    const migRollbackPath = `./.sqlite/test_0033_interrupted_${Date.now()}_${Math.random().toString(36).substring(7)}.db`;
    const migD1 = createLocalD1Database(migRollbackPath, {
      throughMigration: '0032_global_designation_and_shift_masters.sql',
    });
    const rawDb = migD1.getNativeDb();

    try {
      rawDb.exec(`
        INSERT INTO states (id, code, name, status, created_at, updated_at)
        VALUES ('st-1', 'WB', 'West Bengal', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
        INSERT INTO divisions (id, state_id, code, name, status, created_at, updated_at)
        VALUES ('div-1', 'st-1', 'KOL', 'Kolkata DO', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
        INSERT INTO sales_areas (id, division_id, code, name, status, created_at, updated_at)
        VALUES ('sa-1', 'div-1', 'KOL_C', 'Kolkata Central', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
        INSERT INTO retail_outlets (id, ro_code, name, outlet_type, state_id, division_id, sales_area_id, address, city, district, pincode, status, created_at, updated_at)
        VALUES ('ro-rb', '100099', 'Rollback RO', 'COCO', 'st-1', 'div-1', 'sa-1', 'Addr', 'Kolkata', 'Kolkata', '700001', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
        INSERT INTO users (id, emp_code, name, email, phone, password_hash, status, created_at, updated_at)
        VALUES ('usr-1', 'EMP1', 'Admin', 'adm@iocl.in', '9000000000', 'hash', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
        INSERT INTO products (id, code, name, category, unit, status, created_at, updated_at)
        VALUES ('prod-ms', 'MS', 'Motor Spirit', 'MS', 'LITRE', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
        INSERT INTO tanks (id, outlet_id, tank_number, name, product_id, capacity_litres, safe_fill_capacity_litres, minimum_operating_level_litres, status, created_at, created_by, updated_at)
        VALUES ('tank-rb-1', 'ro-rb', 1, 'Tank 1 MS', 'prod-ms', 20000, 19000, 1000, 'ACTIVE', '2026-01-01T00:00:00Z', 'usr-1', '2026-01-01T00:00:00Z');
        INSERT INTO tank_calibration_points (id, tank_id, dip_millimetres_milliunits, volume_milliunits, created_at, created_by)
        VALUES
          ('tcp-rb-0', 'tank-rb-1', 0, 0, '2026-01-01T00:00:00Z', 'usr-1'),
          ('tcp-rb-1000', 'tank-rb-1', 1000000, 10000000, '2026-01-01T00:00:00Z', 'usr-1');
      `);

      const migration0033Sql = fs.readFileSync(MIGRATION_0033_PATH, 'utf-8');

      // Simulate an interruption / syntax failure at the end of Migration 0033 inside an atomic transaction
      expect(() => {
        rawDb.exec(`
          BEGIN TRANSACTION;
          ${migration0033Sql}
          INSERT INTO non_existent_interruption_table VALUES (1);
          COMMIT;
        `);
      }).toThrow();

      if (rawDb.inTransaction) {
        rawDb.exec('ROLLBACK;');
      }

      // Verify zero partial schema changes remain
      const chartsTable = rawDb
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='tank_calibration_charts'`)
        .all();
      expect(chartsTable.length).toBe(0);

      const tcpColumns = rawDb.prepare(`PRAGMA table_info(tank_calibration_points)`).all() as Array<{
        name: string;
      }>;
      expect(tcpColumns.some((c) => c.name === 'chart_id')).toBe(false);

      // Verify original calibration points are 100% intact
      const remainingPoints = rawDb
        .prepare(`SELECT id, dip_millimetres_milliunits, volume_milliunits FROM tank_calibration_points ORDER BY dip_millimetres_milliunits`)
        .all();
      expect(remainingPoints.length).toBe(2);
    } finally {
      try {
        migD1.close();
      } catch {}
      try {
        if (fs.existsSync(migRollbackPath)) fs.unlinkSync(migRollbackPath);
        if (fs.existsSync(`${migRollbackPath}-wal`)) fs.unlinkSync(`${migRollbackPath}-wal`);
        if (fs.existsSync(`${migRollbackPath}-shm`)) fs.unlinkSync(`${migRollbackPath}-shm`);
      } catch {}
    }
  });
});


