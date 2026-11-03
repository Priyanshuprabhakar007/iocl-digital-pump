import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import { app } from '../src/worker/app';

function generateVerifiedCylindricalCsv(maxDipMm: number, nominalCapacityLitres: number, stepMm = 10): string {
  const lines = ['dip_mm,volume_litres'];
  const radius = maxDipMm / 2;
  const fullArea = Math.PI * radius * radius;
  for (let h = 0; h <= maxDipMm; h += stepMm) {
    let ratio = 0;
    if (h <= 0) {
      ratio = 0;
    } else if (h >= maxDipMm) {
      ratio = 1;
    } else {
      const term1 = radius * radius * Math.acos((radius - h) / radius);
      const term2 = (radius - h) * Math.sqrt(Math.max(0, 2 * radius * h - h * h));
      ratio = (term1 - term2) / fullArea;
    }
    const vol = Math.min(nominalCapacityLitres, Math.max(0, ratio * nominalCapacityLitres));
    lines.push(`${h.toFixed(3)},${vol.toFixed(3)}`);
  }
  return lines.join('\n');
}

describe('Centralised Tank Calibration Master Suite (Migration 0034)', () => {
  let localD1: any;
  let testDbPath: string;
  let adminToken: string;
  let fieldOfficerToken: string;

  beforeAll(async () => {
    testDbPath = `./.sqlite/test_global_calibration_${Date.now()}.db`;
    const dir = path.dirname(testDbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    localD1 = createLocalD1Database(testDbPath);
    const db = getDb(localD1);
    await seedDatabase(db);

    // Login Admin
    const adminRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
    }, { DB: localD1 });
    const adminData = await adminRes.json() as any;
    expect(adminRes.status).toBe(200);
    adminToken = adminData.data.token;

    // Login Field Officer
    const foRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fo.central@iocl.in', password: 'Password@123' }),
    }, { DB: localD1 });
    const foData = await foRes.json() as any;
    expect(foRes.status).toBe(200);
    fieldOfficerToken = foData.data.token;
  });

  afterAll(async () => {
    try {
      if (localD1?.close) localD1.close();
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
      if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
    } catch (e) {}
  });

  describe('1. Global Template Reference Headers & IOCL Dimensions (DRAFT before CSV import)', () => {
    it('1.1 initializes STANDARD_20KL (2100x6250x2100 mm) and STANDARD_50KL (3000x7500x3000 mm) in DRAFT status with 0 points', async () => {
      const res = await app.request('/api/v1/calibration-templates', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { DB: localD1 });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);

      const templates = json.data;
      expect(templates.length).toBeGreaterThanOrEqual(2);

      const std20 = templates.find((t: any) => t.code === 'STANDARD_20KL');
      expect(std20).toBeDefined();
      expect(std20.nominalCapacityLitres).toBe(20000);
      expect(std20.tankDiameterMm).toBe(2100);
      expect(std20.tankLengthMm).toBe(6250);
      expect(std20.maxDipMm).toBe(2100);
      expect(std20.status).toBe('DRAFT');
      expect(std20.pointsCount).toBe(0);
      expect(std20.approvedBy).toBeNull();
      expect(std20.approvedAt).toBeNull();

      const std50 = templates.find((t: any) => t.code === 'STANDARD_50KL');
      expect(std50).toBeDefined();
      expect(std50.nominalCapacityLitres).toBe(50000);
      expect(std50.tankDiameterMm).toBe(3000);
      expect(std50.tankLengthMm).toBe(7500);
      expect(std50.maxDipMm).toBe(3000);
      expect(std50.status).toBe('DRAFT');
      expect(std50.pointsCount).toBe(0);
      expect(std50.approvedBy).toBeNull();
      expect(std50.approvedAt).toBeNull();
    });

    it('1.2 prevents marking STANDARD_20KL or STANDARD_50KL as APPROVED before dip-to-volume points are imported', async () => {
      const statusRes = await app.request('/api/v1/calibration-templates/gtct-std-20kl/status', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'APPROVED' }),
      }, { DB: localD1 });

      expect(statusRes.status).toBe(400);
      const statusJson = await statusRes.json() as any;
      expect(statusJson.success).toBe(false);
      expect(statusJson.error.code).toBe('TEMPLATE_POINTS_NOT_VALIDATED');

      // Also verify a DRAFT template with 0 points cannot be assigned to tanks
      const assignRes = await app.request('/api/v1/calibration-templates/gtct-std-20kl/assign', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tankIds: ['tank-ro1-1'],
          activateImmediately: true,
        }),
      }, { DB: localD1 });

      expect(assignRes.status).toBe(400);
      const assignJson = await assignRes.json() as any;
      expect(assignJson.success).toBe(false);
    });

    it('1.3 rejects CSV import with out-of-range dip or incomplete calibration range for STANDARD_20KL', async () => {
      // Out of bounds dip (2200 mm > 2100 mm max dip)
      const invalidCsv = 'dip_mm,volume_litres\n0.000,0.000\n2200.000,20000.000';
      const res = await app.request('/api/v1/calibration-templates/STANDARD_20KL/import', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csvText: invalidCsv,
          status: 'APPROVED',
        }),
      }, { DB: localD1 });

      expect(res.status).toBe(400);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('MAX_DIP_RANGE_EXCEEDED');
    });
  });

  describe('2. Complete Verified CSV Import for STANDARD_20KL and STANDARD_50KL', () => {
    it('2.1 imports complete verified CSV data for STANDARD_20KL (0..2100 mm, 0..20000 L) and marks it APPROVED', async () => {
      const csv20kl = generateVerifiedCylindricalCsv(2100, 20000, 10);

      const res = await app.request('/api/v1/calibration-templates/STANDARD_20KL/import', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csvText: csv20kl,
          status: 'APPROVED',
          sourceFileName: 'IOCL_STANDARD_20KL_2100x6250.csv',
          referenceDocument: 'IOCL-ENGG-STD-20KL-REV1',
          notes: 'Verified 20 KL horizontal cylindrical calibration table (2100 mm Dia x 6250 mm Len)',
        }),
      }, { DB: localD1 });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.code).toBe('STANDARD_20KL');
      expect(json.data.status).toBe('APPROVED');
      expect(json.data.tankDiameterMm).toBe(2100);
      expect(json.data.tankLengthMm).toBe(6250);
      expect(json.data.maxDipMm).toBe(2100);
      expect(json.data.pointsCount).toBe(211);
      expect(json.data.points.length).toBe(211);
      expect(json.data.points[0].dipMillimetres).toBe(0);
      expect(json.data.points[0].volumeLitres).toBe(0);
      expect(json.data.points[210].dipMillimetres).toBe(2100);
      expect(json.data.points[210].volumeLitres).toBe(20000);
    });

    it('2.2 imports complete verified CSV data for STANDARD_50KL (0..3000 mm, 0..50000 L) and marks it APPROVED', async () => {
      const csv50kl = generateVerifiedCylindricalCsv(3000, 50000, 10);

      const res = await app.request('/api/v1/calibration-templates/STANDARD_50KL/import', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csvText: csv50kl,
          status: 'APPROVED',
          sourceFileName: 'IOCL_STANDARD_50KL_3000x7500.csv',
          referenceDocument: 'IOCL-ENGG-STD-50KL-REV1',
          notes: 'Verified 50 KL horizontal cylindrical calibration table (3000 mm Dia x 7500 mm Len)',
        }),
      }, { DB: localD1 });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.code).toBe('STANDARD_50KL');
      expect(json.data.status).toBe('APPROVED');
      expect(json.data.tankDiameterMm).toBe(3000);
      expect(json.data.tankLengthMm).toBe(7500);
      expect(json.data.maxDipMm).toBe(3000);
      expect(json.data.pointsCount).toBe(301);
      expect(json.data.points.length).toBe(301);
      expect(json.data.points[0].dipMillimetres).toBe(0);
      expect(json.data.points[0].volumeLitres).toBe(0);
      expect(json.data.points[300].dipMillimetres).toBe(3000);
      expect(json.data.points[300].volumeLitres).toBe(50000);
    });

    it('2.3 fetches full points dataset for STANDARD_20KL template by ID', async () => {
      const res = await app.request('/api/v1/calibration-templates/gtct-std-20kl', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { DB: localD1 });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.code).toBe('STANDARD_20KL');
      expect(json.data.status).toBe('APPROVED');
      expect(json.data.points.length).toBe(211);
      expect(json.data.points[0].dipMillimetres).toBe(0);
      expect(json.data.points[0].volumeLitres).toBe(0);
      expect(json.data.points[210].dipMillimetres).toBe(2100);
      expect(json.data.points[210].volumeLitres).toBe(20000);
    });
  });

  describe('3. Custom Template Creation & Approval', () => {
    it('3.1 allows creating a new global tank calibration template', async () => {
      const payload = {
        code: 'CUSTOM_30KL',
        name: 'Custom 30,000 Litre High Precision Calibration',
        nominalCapacityLitres: 30000,
        tankDiameterMm: '2400.000',
        tankLengthMm: '6800.000',
        maxDipMm: '2400.000',
        points: [
          { dipMillimetres: '0.000', volumeLitres: '0.000' },
          { dipMillimetres: '1200.000', volumeLitres: '15000.000' },
          { dipMillimetres: '2400.000', volumeLitres: '30000.000' },
        ],
        sourceFileName: 'custom_30kl_chart.pdf',
        referenceDocument: 'REF-30KL-2026',
        notes: 'Custom 30 KL chart for regional outlets',
        status: 'DRAFT',
      };

      const res = await app.request('/api/v1/calibration-templates', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }, { DB: localD1 });

      expect(res.status).toBe(201);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.code).toBe('CUSTOM_30KL');
      expect(json.data.status).toBe('DRAFT');
      expect(json.data.points.length).toBe(3);
    });

    it('3.2 updates status of a validated template from DRAFT to APPROVED', async () => {
      const listRes = await app.request('/api/v1/calibration-templates', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { DB: localD1 });
      const list = (await listRes.json() as any).data;
      const custom = list.find((t: any) => t.code === 'CUSTOM_30KL');

      const res = await app.request(`/api/v1/calibration-templates/${custom.id}/status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'APPROVED' }),
      }, { DB: localD1 });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('APPROVED');
      expect(json.data.approvedBy).toBeDefined();
    });
  });

  describe('4. Template Matching, Multi-Tank Preview & Bulk Assignment', () => {
    it('4.1 suggests STANDARD_20KL template for a 20 KL underground tank after approval', async () => {
      const res = await app.request('/api/v1/tanks/tank-ro1-1/suggested-template', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { DB: localD1 });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.suggestedTemplate).toBeDefined();
      expect(json.data.suggestedTemplate.code).toBe('STANDARD_20KL');
    });

    it('4.2 previews assignment of STANDARD_20KL template to COCO 22 tanks', async () => {
      const res = await app.request('/api/v1/calibration-templates/gtct-std-20kl/assign-preview', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tankIds: ['tank-ro1-1', 'tank-ro1-2'],
        }),
      }, { DB: localD1 });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.totalTanksSelected).toBe(2);
      expect(json.data.previews[0].isCompatible).toBe(true);
    });

    it('4.3 assigns STANDARD_20KL template to COCO 22 Tank 1, creating Revision 2 and preserving historical chart', async () => {
      const res = await app.request('/api/v1/calibration-templates/gtct-std-20kl/assign', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tankIds: ['tank-ro1-1'],
          activateImmediately: true,
          notes: 'Standardized operational calibration via Global Calibration Master',
        }),
      }, { DB: localD1 });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.assignments.length).toBe(1);

      const assignment = json.data.assignments[0];
      expect(assignment.tankId).toBe('tank-ro1-1');
      expect(assignment.status).toBe('ACTIVE');
      expect(assignment.pointsCount).toBe(211);

      // Verify tank chart list now has Revision 2 ACTIVE and Revision 1 SUPERSEDED
      const chartsRes = await app.request('/api/v1/tanks/tank-ro1-1/calibration/charts', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { DB: localD1 });
      const chartsJson = await chartsRes.json() as any;
      expect(chartsJson.data.charts.length).toBeGreaterThanOrEqual(2);

      const activeChart = chartsJson.data.activeChart;
      expect(activeChart.sourceTemplateId).toBe('gtct-std-20kl');
      expect(activeChart.status).toBe('ACTIVE');

      const superseded = chartsJson.data.charts.find((c: any) => c.status === 'SUPERSEDED');
      expect(superseded).toBeDefined();
    });
  });

  describe('5. Audit Trail Integration', () => {
    it('5.1 verifies audit trail logs for global calibration template operations', async () => {
      const res = await app.request('/api/v1/audit-logs?entityType=GLOBAL_TANK_CALIBRATION_TEMPLATE', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { DB: localD1 });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('6. Production Staging Preservation for Migration 0034', () => {
    it('6.1 preserves all COCO tanks, Revision 1 historical calibrations, Tank #1 Revision 2 DRAFT, and historical shift data when applying Migration 0034', () => {
      const stagingDbPath = `./.sqlite/test_staging_0034_${Date.now()}.db`;
      const preD1 = createLocalD1Database(stagingDbPath, {
        throughMigration: '0033_tank_calibration_chart_versioning.sql',
      });
      const sqlite = preD1.getNativeDb();

      try {
        const absSeededPath = path.resolve(process.cwd(), testDbPath).replace(/'/g, "''");
        const nowIso = '2026-10-23T06:00:00Z';
        const closeIso = '2026-10-23T14:00:00Z';
        const coco22OutletId = 'ro-dabd3ff8-f023-4ef5-85ef-1bf100719a20';
        const coco22ShiftId = 'ops-62ee14f1-134d-4f6e-aa19-39dab0aa5df5';

        sqlite.exec(`
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

          INSERT INTO retail_outlets (
            id, ro_code, name, outlet_type, state_id, division_id, sales_area_id,
            address, city, district, pincode, status, created_at, updated_at
          ) VALUES (
            '${coco22OutletId}', '396187', 'COCO 22', 'COCO', 'state-wb', 'div-kol', 'sa-cen',
            'COCO 22 Highway Plot', 'Kolkata', 'Kolkata', '700022', 'ACTIVE', '${nowIso}', '${nowIso}'
          );

          INSERT INTO tanks (
            id, outlet_id, tank_number, name, product_id,
            capacity_litres, safe_fill_capacity_litres, minimum_operating_level_litres,
            status, commissioned_at, created_at, created_by, updated_at
          ) VALUES
            ('tank-396187-1', '${coco22OutletId}', 1, 'Tank 1 - MS', 'prod-ms', 20000, 19000, 1000, 'ACTIVE', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'),
            ('tank-396187-2', '${coco22OutletId}', 2, 'Tank 2 - MS', 'prod-ms', 20000, 19000, 1000, 'ACTIVE', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'),
            ('tank-396187-3', '${coco22OutletId}', 3, 'Tank 3 - HSD', 'prod-hsd', 20000, 19000, 1000, 'ACTIVE', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'),
            ('tank-396187-4', '${coco22OutletId}', 4, 'Tank 4 - HSD', 'prod-hsd', 20000, 19000, 1000, 'ACTIVE', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}');

          INSERT INTO tank_calibration_charts (
            id, tank_id, revision_number, status, effective_from, notes, created_by, created_at, updated_at, approved_by, approved_at
          ) VALUES
            ('tcc-tank-396187-1-r1', 'tank-396187-1', 1, 'ACTIVE', '2026-01-01', 'Initial Rev 1', 'user-admin', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'),
            ('tcc-tank-396187-2-r1', 'tank-396187-2', 1, 'ACTIVE', '2026-01-01', 'Initial Rev 1', 'user-admin', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'),
            ('tcc-tank-396187-3-r1', 'tank-396187-3', 1, 'ACTIVE', '2026-01-01', 'Initial Rev 1', 'user-admin', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'),
            ('tcc-tank-396187-4-r1', 'tank-396187-4', 1, 'ACTIVE', '2026-01-01', 'Initial Rev 1', 'user-admin', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'),
            ('tcc-tank-396187-1-r2-draft', 'tank-396187-1', 2, 'DRAFT', '2026-03-01', 'Tank #1 Revision 2 DRAFT in progress', 'user-admin', '${nowIso}', '${nowIso}', NULL, NULL);

          INSERT INTO tank_calibration_points (id, tank_id, chart_id, dip_millimetres_milliunits, volume_milliunits, created_by, created_at) VALUES
            ('tcp-1-r1-0', 'tank-396187-1', 'tcc-tank-396187-1-r1', 0, 0, 'user-admin', '${nowIso}'),
            ('tcp-1-r1-1', 'tank-396187-1', 'tcc-tank-396187-1-r1', 2000000, 20000000, 'user-admin', '${nowIso}'),
            ('tcp-1-r2-0', 'tank-396187-1', 'tcc-tank-396187-1-r2-draft', 0, 0, 'user-admin', '${nowIso}'),
            ('tcp-1-r2-1', 'tank-396187-1', 'tcc-tank-396187-1-r2-draft', 2100000, 20000000, 'user-admin', '${nowIso}');

          INSERT INTO operational_shifts (
            id, outlet_id, shift_template_id, business_date, status,
            opened_by_user_id, started_at, closed_by_user_id, closed_at,
            notes, created_at, updated_at
          ) VALUES (
            '${coco22ShiftId}', '${coco22OutletId}', 'st-ro1-1', '2026-10-23', 'CLOSED',
            'user-admin', '${nowIso}', 'user-admin', '${closeIso}',
            'COCO 22 historical shift', '${nowIso}', '${closeIso}'
          );

          INSERT INTO operational_shift_tanks (
            id, operational_shift_id, outlet_id, tank_id, tank_number, tank_name,
            product_id, product_code, product_name, product_unit,
            capacity_milliunits, safe_fill_capacity_milliunits,
            calibration_chart_id, calibration_revision, created_at
          ) VALUES (
            'ost-hist-1', '${coco22ShiftId}', '${coco22OutletId}', 'tank-396187-1', 1, 'Tank 1 - MS',
            'prod-ms', 'MS', 'Motor Spirit (Petrol)', 'LITRE',
            20000000, 19000000, 'tcc-tank-396187-1-r1', 1, '${nowIso}'
          );

          INSERT INTO tank_stock_readings (
            id, operational_shift_id, outlet_id, tank_id, product_id, reading_type, source,
            product_dip_mm_milliunits, water_dip_mm_milliunits, gross_observed_volume_milliunits,
            water_volume_milliunits, net_product_volume_milliunits,
            calibration_chart_id, calibration_revision,
            recorded_at, recorded_by_user_id, created_at, updated_at
          ) VALUES (
            'tsr-open-396187-1', '${coco22ShiftId}', '${coco22OutletId}', 'tank-396187-1', 'prod-ms', 'OPENING', 'MANUAL',
            1000000, 0, 10000000, 0, 10000000,
            'tcc-tank-396187-1-r1', 1,
            '${nowIso}', 'user-admin', '${nowIso}', '${nowIso}'
          );
        `);

        // Apply Migration 0034
        const migrationsDir = path.resolve(process.cwd(), 'migrations');
        const sql0034 = fs.readFileSync(path.join(migrationsDir, '0034_global_tank_calibration_templates.sql'), 'utf-8');
        sqlite.exec(sql0034);

        // Verify COCO tanks preserved
        const tanksCount = (sqlite.prepare('SELECT COUNT(*) as cnt FROM tanks WHERE outlet_id = ?').get(coco22OutletId) as any).cnt;
        expect(tanksCount).toBe(4);

        // Verify Revision 1 ACTIVE charts preserved
        const rev1Charts = sqlite.prepare("SELECT c.* FROM tank_calibration_charts c JOIN tanks t ON c.tank_id = t.id WHERE t.outlet_id = ? AND c.revision_number = 1 AND c.status = 'ACTIVE'").all(coco22OutletId) as any[];
        expect(rev1Charts.length).toBe(4);

        // Verify Tank #1 Revision 2 DRAFT chart and its points preserved
        const rev2Draft = sqlite.prepare("SELECT * FROM tank_calibration_charts WHERE id = 'tcc-tank-396187-1-r2-draft'").get() as any;
        expect(rev2Draft).toBeDefined();
        expect(rev2Draft.tank_id).toBe('tank-396187-1');
        expect(rev2Draft.revision_number).toBe(2);
        expect(rev2Draft.status).toBe('DRAFT');

        const rev2Points = sqlite.prepare("SELECT * FROM tank_calibration_points WHERE chart_id = 'tcc-tank-396187-1-r2-draft'").all() as any[];
        expect(rev2Points.length).toBe(2);

        // Verify historical shift and stock readings preserved
        const shiftTank = sqlite.prepare("SELECT * FROM operational_shift_tanks WHERE operational_shift_id = ?").get(coco22ShiftId) as any;
        expect(shiftTank).toBeDefined();
        expect(shiftTank.calibration_chart_id).toBe('tcc-tank-396187-1-r1');
        expect(shiftTank.calibration_revision).toBe(1);

        const stockReading = sqlite.prepare("SELECT * FROM tank_stock_readings WHERE operational_shift_id = ?").get(coco22ShiftId) as any;
        expect(stockReading).toBeDefined();
        expect(stockReading.calibration_chart_id).toBe('tcc-tank-396187-1-r1');
        expect(stockReading.calibration_revision).toBe(1);
        expect(stockReading.net_product_volume_milliunits).toBe(10000000);

        // Verify Migration 0034 reference templates have exact IOCL dimensions and DRAFT status
        const std20 = sqlite.prepare("SELECT * FROM global_tank_calibration_templates WHERE code = 'STANDARD_20KL'").get() as any;
        expect(std20.tank_diameter_mm_milliunits).toBe(2100000);
        expect(std20.tank_length_mm_milliunits).toBe(6250000);
        expect(std20.max_dip_mm_milliunits).toBe(2100000);
        expect(std20.status).toBe('DRAFT');

        const std50 = sqlite.prepare("SELECT * FROM global_tank_calibration_templates WHERE code = 'STANDARD_50KL'").get() as any;
        expect(std50.tank_diameter_mm_milliunits).toBe(3000000);
        expect(std50.tank_length_mm_milliunits).toBe(7500000);
        expect(std50.max_dip_mm_milliunits).toBe(3000000);
        expect(std50.status).toBe('DRAFT');

        const fkViolations = sqlite.pragma('foreign_key_check') as any[];
        expect(fkViolations.length).toBe(0);
      } finally {
        preD1.close();
        try {
          if (fs.existsSync(stagingDbPath)) fs.unlinkSync(stagingDbPath);
        } catch (e) {}
      }
    });
  });
});
