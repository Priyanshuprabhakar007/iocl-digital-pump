import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import { app } from '../src/worker/app';
import {
  getGlobalTemplateStatusBadge,
  formatGlobalTemplateDimensions,
  generateVerifiedCylindricalCalibrationCsv,
  buildGlobalTemplateImportPreview,
  canApproveGlobalTemplate,
  formatGlobalCalibrationAuditLogEntry,
  partitionCocoTanksByEligibility,
  getSelectableEligibleTankIds,
  isCocoTankSelectionDisabled,
  getCocoTankEligibilityBadge,
} from '../src/frontend/components/pump/pumpInfrastructureUi';

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
    beforeAll(() => {
      const sqlite = localD1.getNativeDb();
      const nowIso = '2026-10-20T08:00:00Z';
      sqlite.exec(`
        INSERT OR IGNORE INTO tanks (
          id, outlet_id, tank_number, name, product_id,
          capacity_litres, safe_fill_capacity_litres, minimum_operating_level_litres,
          status, commissioned_at, created_at, created_by, updated_at
        ) VALUES
          ('tank-ro1-std20-1', 'ro-1001', 4, 'Tank 4 - MS (Verified 20 KL)', 'prod-ms', 20000, 19000, 1000, 'ACTIVE', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'),
          ('tank-ro1-std20-2', 'ro-1001', 5, 'Tank 5 - HSD (Verified 20 KL)', 'prod-hsd', 20000, 19000, 1000, 'ACTIVE', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}');

        INSERT OR IGNORE INTO tank_calibration_charts (
          id, tank_id, revision_number, status, chart_unit_dip, chart_unit_volume,
          tank_diameter_mm_milliunits, tank_length_mm_milliunits, max_dip_mm_milliunits, chart_capacity_milliunits,
          source_file_name, reference_document, effective_from, notes, created_by, created_at, updated_at, approved_by, approved_at
        ) VALUES
          ('tcc-ro1-std20-1-r1', 'tank-ro1-std20-1', 1, 'ACTIVE', 'MM', 'LITRES', 2100000, 6250000, 2100000, 20000000, 'IOCL-STD20-T4.csv', 'CERT-RO1-T4-20KL', '2026-01-01', 'Verified 20 KL chart', 'user-admin', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'),
          ('tcc-ro1-std20-2-r1', 'tank-ro1-std20-2', 1, 'ACTIVE', 'MM', 'LITRES', 2100000, 6250000, 2100000, 20000000, 'IOCL-STD20-T5.csv', 'CERT-RO1-T5-20KL', '2026-01-01', 'Verified 20 KL chart', 'user-admin', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}');

        INSERT OR IGNORE INTO tank_calibration_points (id, tank_id, chart_id, dip_millimetres_milliunits, volume_milliunits, created_by, created_at) VALUES
          ('tcp-ro1-std20-1-0', 'tank-ro1-std20-1', 'tcc-ro1-std20-1-r1', 0, 0, 'user-admin', '${nowIso}'),
          ('tcp-ro1-std20-1-1', 'tank-ro1-std20-1', 'tcc-ro1-std20-1-r1', 2100000, 20000000, 'user-admin', '${nowIso}'),
          ('tcp-ro1-std20-2-0', 'tank-ro1-std20-2', 'tcc-ro1-std20-2-r1', 0, 0, 'user-admin', '${nowIso}'),
          ('tcp-ro1-std20-2-1', 'tank-ro1-std20-2', 'tcc-ro1-std20-2-r1', 2100000, 20000000, 'user-admin', '${nowIso}');
      `);
    });

    it('4.1 suggests STANDARD_20KL template only for a verified 20 KL underground tank with matching 2100x6250x2100 mm dimensions', async () => {
      const res = await app.request('/api/v1/tanks/tank-ro1-std20-1/suggested-template', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { DB: localD1 });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.suggestedTemplate).toBeDefined();
      expect(json.data.suggestedTemplate.code).toBe('STANDARD_20KL');
      expect(json.data.eligibilityStatus).toBe('ELIGIBLE');
    });

    it('4.2 previews assignment of STANDARD_20KL template to verified 20 KL COCO tanks', async () => {
      const res = await app.request('/api/v1/calibration-templates/gtct-std-20kl/assign-preview', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tankIds: ['tank-ro1-std20-1', 'tank-ro1-std20-2'],
        }),
      }, { DB: localD1 });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.totalTanksSelected).toBe(2);
      expect(json.data.previews[0].isCompatible).toBe(true);
      expect(json.data.previews[0].targetStatus).toBe('DRAFT');
    });

    it('4.3 assigns STANDARD_20KL template to verified 20 KL COCO tank as Revision 2 DRAFT only (preserving Revision 1 ACTIVE chart)', async () => {
      const res = await app.request('/api/v1/calibration-templates/gtct-std-20kl/assign', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tankIds: ['tank-ro1-std20-1'],
          activateImmediately: true, // Even if passed true, backend strictly keeps assignment DRAFT only
          notes: 'Standardized operational calibration via Global Calibration Master',
        }),
      }, { DB: localD1 });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.assignments.length).toBe(1);

      const assignment = json.data.assignments[0];
      expect(assignment.tankId).toBe('tank-ro1-std20-1');
      expect(assignment.status).toBe('DRAFT');
      expect(assignment.revisionNumber).toBe(2);
      expect(assignment.pointsCount).toBe(211);

      // Verify tank chart list still has Revision 1 ACTIVE untouched and Revision 2 as DRAFT
      const chartsRes = await app.request('/api/v1/tanks/tank-ro1-std20-1/calibration/charts', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { DB: localD1 });
      const chartsJson = await chartsRes.json() as any;
      expect(chartsJson.data.charts.length).toBeGreaterThanOrEqual(2);

      const activeChart = chartsJson.data.activeChart;
      expect(activeChart.id).toBe('tcc-ro1-std20-1-r1');
      expect(activeChart.revisionNumber).toBe(1);
      expect(activeChart.status).toBe('ACTIVE');

      const draftChart = chartsJson.data.charts.find((c: any) => c.revisionNumber === 2);
      expect(draftChart).toBeDefined();
      expect(draftChart.sourceTemplateId).toBe('gtct-std-20kl');
      expect(draftChart.status).toBe('DRAFT');
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

        const fkViolations = sqlite.prepare('PRAGMA foreign_key_check;').all() as any[];
        expect(fkViolations.length).toBe(0);
      } finally {
        preD1.close();
        try {
          if (fs.existsSync(stagingDbPath)) fs.unlinkSync(stagingDbPath);
        } catch (e) {}
      }
    });
  });

  describe('7. Complete Global Calibration Master UI & Safe Assignment Workflow', () => {
    it('7.1 validates Global Calibration Master UI helpers for status badges, dimensions, CSV preview, and approval gating', () => {
      const draftZeroBadge = getGlobalTemplateStatusBadge('DRAFT', 0);
      expect(draftZeroBadge.label).toBe('DRAFT');
      expect(draftZeroBadge.isApproved).toBe(false);
      expect(draftZeroBadge.hasValidatedPoints).toBe(false);

      const draftPopulatedBadge = getGlobalTemplateStatusBadge('DRAFT', 211);
      expect(draftPopulatedBadge.label).toBe('DRAFT');
      expect(draftPopulatedBadge.hasValidatedPoints).toBe(true);

      const approvedBadge = getGlobalTemplateStatusBadge('APPROVED', 211);
      expect(approvedBadge.isApproved).toBe(true);

      const dims20 = formatGlobalTemplateDimensions({
        tankDiameterMm: 2100,
        tankLengthMm: 6250,
        maxDipMm: 2100,
      });
      expect(dims20.summaryLabel).toContain('2,100 mm Dia');
      expect(dims20.summaryLabel).toContain('6,250 mm Len');
      expect(dims20.summaryLabel).toContain('Max Dip 2,100 mm');

      const csv20 = generateVerifiedCylindricalCalibrationCsv(2100, 20000, 10);
      const preview20 = buildGlobalTemplateImportPreview(csv20, {
        code: 'STANDARD_20KL',
        nominalCapacityLitres: 20000,
        tankDiameterMm: 2100,
        maxDipMm: 2100,
      });
      expect(preview20.valid).toBe(true);
      expect(preview20.startsAtZero).toBe(true);
      expect(preview20.reachesMaxDip).toBe(true);
      expect(preview20.saveStatusDefault).toBe('DRAFT');
      expect(preview20.diagnostics.pointsCount).toBe(211);

      const incompletePreview = buildGlobalTemplateImportPreview(
        'dip_mm,volume_litres\n0,0\n1500,14000',
        {
          code: 'STANDARD_20KL',
          nominalCapacityLitres: 20000,
          tankDiameterMm: 2100,
          maxDipMm: 2100,
        }
      );
      expect(incompletePreview.valid).toBe(false);
      expect(incompletePreview.error).toContain('Max Dip 2100.000 mm');

      expect(canApproveGlobalTemplate({ status: 'DRAFT', pointsCount: 0 }, true).allowed).toBe(false);
      expect(canApproveGlobalTemplate({ status: 'DRAFT', pointsCount: 211 }, false).allowed).toBe(false);
      expect(canApproveGlobalTemplate({ status: 'DRAFT', pointsCount: 211 }, true).allowed).toBe(true);

      const auditEntry = formatGlobalCalibrationAuditLogEntry({
        action: 'GLOBAL_CALIBRATION_TEMPLATE_IMPORT',
        createdAt: '2026-11-02T10:00:00Z',
        userName: 'System Admin',
        newValueJson: JSON.stringify({
          code: 'STANDARD_20KL',
          status: 'DRAFT',
          pointsCount: 211,
          sourceFileName: 'IOCL_STANDARD_20KL.csv',
        }),
      });
      expect(auditEntry.actionBadge).toBe('CSV IMPORT');
      expect(auditEntry.summary).toContain('STANDARD_20KL');
      expect(auditEntry.summary).toContain('DRAFT');
    });

    it('7.2 saves imported CSV points as DRAFT by default when status is omitted, then supports separate authorised approval', async () => {
      // Revert STANDARD_20KL to DRAFT and re-import without specifying status
      const csv20kl = generateVerifiedCylindricalCsv(2100, 20000, 10);
      const importRes = await app.request('/api/v1/calibration-templates/STANDARD_20KL/import', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csvText: csv20kl,
          sourceFileName: 'IOCL_STANDARD_20KL_DRAFT_DEFAULT.csv',
          referenceDocument: 'IOCL-ENGG-STD-20KL-DRAFT',
        }),
      }, { DB: localD1 });

      expect(importRes.status).toBe(200);
      const importJson = await importRes.json() as any;
      expect(importJson.success).toBe(true);
      expect(importJson.data.status).toBe('DRAFT');
      expect(importJson.data.pointsCount).toBe(211);
      expect(importJson.data.approvedBy).toBeNull();

      // Separate authorised approval action
      const approveRes = await app.request('/api/v1/calibration-templates/STANDARD_20KL/status', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'APPROVED' }),
      }, { DB: localD1 });

      expect(approveRes.status).toBe(200);
      const approveJson = await approveRes.json() as any;
      expect(approveJson.success).toBe(true);
      expect(approveJson.data.status).toBe('APPROVED');
      expect(approveJson.data.approvedBy).toBeDefined();
    });

    it('7.3 lists eligible COCO tanks by capacity and physical dimensions, defaults assignment to DRAFT (never replacing ACTIVE charts), and preserves COCO 22 Tank #1 Revision #2 DRAFT', async () => {
      const sqlite = localD1.getNativeDb();
      const nowIso = '2026-10-25T08:00:00Z';
      const coco22OutletId = 'ro-coco22-ui-test';

      sqlite.exec(`
        INSERT OR IGNORE INTO retail_outlets (
          id, ro_code, name, outlet_type, state_id, division_id, sales_area_id,
          address, city, district, pincode, status, created_at, updated_at
        ) VALUES (
          '${coco22OutletId}', '396187', 'COCO 22', 'COCO', 'state-wb', 'div-kol', 'sa-cen',
          'COCO 22 Highway Plot', 'Kolkata', 'Kolkata', '700022', 'ACTIVE', '${nowIso}', '${nowIso}'
        );

        INSERT OR IGNORE INTO tanks (
          id, outlet_id, tank_number, name, product_id,
          capacity_litres, safe_fill_capacity_litres, minimum_operating_level_litres,
          status, commissioned_at, created_at, created_by, updated_at
        ) VALUES
          ('tank-coco22-1', '${coco22OutletId}', 1, 'Tank 1 - MS', 'prod-ms', 20000, 19000, 1000, 'ACTIVE', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'),
          ('tank-coco22-2', '${coco22OutletId}', 2, 'Tank 2 - HSD', 'prod-hsd', 20000, 19000, 1000, 'ACTIVE', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}');

        INSERT OR IGNORE INTO tank_calibration_charts (
          id, tank_id, revision_number, status, chart_unit_dip, chart_unit_volume,
          tank_diameter_mm_milliunits, tank_length_mm_milliunits, max_dip_mm_milliunits, chart_capacity_milliunits,
          source_file_name, reference_document, effective_from, notes, created_by, created_at, updated_at, approved_by, approved_at
        ) VALUES
          ('tcc-coco22-1-r1', 'tank-coco22-1', 1, 'ACTIVE', 'MM', 'LITRES', 2100000, 6250000, 2100000, 20000000, 'COCO22-T1-R1.csv', 'CERT-COCO22-T1-R1', '2026-01-01', 'COCO 22 Tank 1 Active Rev 1', 'user-admin', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'),
          ('tcc-coco22-1-r2-draft', 'tank-coco22-1', 2, 'DRAFT', 'MM', 'LITRES', 2100000, 6250000, 2100000, 20000000, 'COCO22-T1-R2.csv', 'CERT-COCO22-T1-R2', '2026-03-01', 'COCO 22 Tank #1 Revision #2 DRAFT', 'user-admin', '${nowIso}', '${nowIso}', NULL, NULL),
          ('tcc-coco22-2-r1', 'tank-coco22-2', 1, 'ACTIVE', 'MM', 'LITRES', 2100000, 6250000, 2100000, 20000000, 'COCO22-T2-R1.csv', 'CERT-COCO22-T2-R1', '2026-01-01', 'COCO 22 Tank 2 Active Rev 1', 'user-admin', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}');

        INSERT OR IGNORE INTO tank_calibration_points (id, tank_id, chart_id, dip_millimetres_milliunits, volume_milliunits, created_by, created_at) VALUES
          ('tcp-coco22-1-r1-0', 'tank-coco22-1', 'tcc-coco22-1-r1', 0, 0, 'user-admin', '${nowIso}'),
          ('tcp-coco22-1-r1-1', 'tank-coco22-1', 'tcc-coco22-1-r1', 2000000, 20000000, 'user-admin', '${nowIso}'),
          ('tcp-coco22-1-r2-0', 'tank-coco22-1', 'tcc-coco22-1-r2-draft', 0, 0, 'user-admin', '${nowIso}'),
          ('tcp-coco22-1-r2-1', 'tank-coco22-1', 'tcc-coco22-1-r2-draft', 2100000, 20000000, 'user-admin', '${nowIso}'),
          ('tcp-coco22-2-r1-0', 'tank-coco22-2', 'tcc-coco22-2-r1', 0, 0, 'user-admin', '${nowIso}'),
          ('tcp-coco22-2-r1-1', 'tank-coco22-2', 'tcc-coco22-2-r1', 2000000, 20000000, 'user-admin', '${nowIso}');
      `);

      // 1. Fetch eligible COCO tanks for STANDARD_20KL
      const eligibleRes = await app.request(
        `/api/v1/calibration-templates/STANDARD_20KL/eligible-tanks?outletId=${coco22OutletId}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        { DB: localD1 }
      );
      expect(eligibleRes.status).toBe(200);
      const eligibleJson = await eligibleRes.json() as any;
      expect(eligibleJson.success).toBe(true);
      expect(eligibleJson.data.tanks.length).toBe(2);

      const tank1Item = eligibleJson.data.tanks.find((t: any) => t.tankId === 'tank-coco22-1');
      expect(tank1Item).toBeDefined();
      expect(tank1Item.hasProtectedDraft).toBe(true);
      expect(tank1Item.existingDraftChart.id).toBe('tcc-coco22-1-r2-draft');
      expect(tank1Item.existingDraftChart.revisionNumber).toBe(2);
      expect(tank1Item.physicalDimensions.diameterMm).toBe(2100);
      expect(tank1Item.physicalDimensions.lengthMm).toBe(6250);

      // 2. Preview assignment for both COCO 22 Tank 1 and Tank 2
      const previewRes = await app.request(
        '/api/v1/calibration-templates/STANDARD_20KL/assign-preview',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tankIds: ['tank-coco22-1', 'tank-coco22-2'],
          }),
        },
        { DB: localD1 }
      );
      expect(previewRes.status).toBe(200);
      const previewJson = await previewRes.json() as any;
      expect(previewJson.data.previews[0].hasProtectedDraft).toBe(true);
      expect(previewJson.data.previews[0].targetStatus).toBe('DRAFT');
      expect(previewJson.data.previews[1].hasProtectedDraft).toBe(false);
      expect(previewJson.data.previews[1].targetRevisionNumber).toBe(2);

      // 3. Assign without activateImmediately (default safe mode: activateImmediately = false)
      const assignRes = await app.request(
        '/api/v1/calibration-templates/STANDARD_20KL/assign',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tankIds: ['tank-coco22-1', 'tank-coco22-2'],
            notes: 'Safe UI assignment as DRAFT',
          }),
        },
        { DB: localD1 }
      );
      expect(assignRes.status).toBe(200);
      const assignJson = await assignRes.json() as any;
      expect(assignJson.success).toBe(true);

      const a1 = assignJson.data.assignments.find((a: any) => a.tankId === 'tank-coco22-1');
      expect(a1.preservedExistingDraft).toBe(true);
      expect(a1.chartId).toBe('tcc-coco22-1-r2-draft');
      expect(a1.revisionNumber).toBe(2);
      expect(a1.status).toBe('DRAFT');

      const a2 = assignJson.data.assignments.find((a: any) => a.tankId === 'tank-coco22-2');
      expect(a2.preservedExistingDraft).toBe(false);
      expect(a2.revisionNumber).toBe(2);
      expect(a2.status).toBe('DRAFT');
      expect(a2.pointsCount).toBe(211);

      // Verify Tank 1 Rev 1 ACTIVE and Rev 2 DRAFT are 100% preserved
      const t1Rev1 = sqlite.prepare("SELECT * FROM tank_calibration_charts WHERE id = 'tcc-coco22-1-r1'").get() as any;
      expect(t1Rev1.status).toBe('ACTIVE');
      const t1Rev2 = sqlite.prepare("SELECT * FROM tank_calibration_charts WHERE id = 'tcc-coco22-1-r2-draft'").get() as any;
      expect(t1Rev2.status).toBe('DRAFT');
      expect(t1Rev2.notes).toBe('COCO 22 Tank #1 Revision #2 DRAFT');

      // Verify Tank 2 Rev 1 ACTIVE is still ACTIVE (never auto-replaced)
      const t2Rev1 = sqlite.prepare("SELECT * FROM tank_calibration_charts WHERE id = 'tcc-coco22-2-r1'").get() as any;
      expect(t2Rev1.status).toBe('ACTIVE');

      // 4. Verify Global Calibration Master audit trail endpoint
      const auditRes = await app.request(
        '/api/v1/calibration-templates/audit-logs',
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        { DB: localD1 }
      );
      expect(auditRes.status).toBe(200);
      const auditJson = await auditRes.json() as any;
      expect(auditJson.success).toBe(true);
      expect(auditJson.data.length).toBeGreaterThanOrEqual(3);
      expect(
        auditJson.data.every((l: any) => l.entityType === 'GLOBAL_TANK_CALIBRATION_TEMPLATE')
      ).toBe(true);
    });
  });

  describe('8. Scanned IOCL 20 KL Chart (21,648.3 L Max Volume, 210 Printed Readings + Inferred 0 mm / 0 L) & +10% Ceiling Regression', () => {
    function generateScanned20klPrintedReadingsCsv(
      maxPrintedVolumeLitres: number,
      includeExplicitZeroPoint: boolean
    ): string {
      const maxDip = 2100;
      const radius = maxDip / 2;
      const fullArea = Math.PI * radius * radius;
      const lines = ['dip_mm,volume_litres'];
      const startDip = includeExplicitZeroPoint ? 0 : 10;

      for (let h = startDip; h <= maxDip; h += 10) {
        if (h === 0) {
          lines.push('0.000,0.000');
        } else if (h === maxDip) {
          lines.push(`${maxDip.toFixed(3)},${maxPrintedVolumeLitres.toFixed(3)}`);
        } else {
          const term1 = radius * radius * Math.acos((radius - h) / radius);
          const term2 = (radius - h) * Math.sqrt(Math.max(0, 2 * radius * h - h * h));
          const ratio = (term1 - term2) / fullArea;
          const vol = Math.min(maxPrintedVolumeLitres, Math.max(0, ratio * maxPrintedVolumeLitres));
          lines.push(`${h.toFixed(3)},${vol.toFixed(3)}`);
        }
      }
      return lines.join('\n');
    }

    it('8.1 validates UI preview for 210 printed readings (21,648.3 L max + inferred 0 mm / 0 L) and rejects volumes above the +10% ceiling (22,000 L)', () => {
      const templateMeta = {
        code: 'STANDARD_20KL',
        nominalCapacityLitres: 20000,
        tankDiameterMm: 2100,
        maxDipMm: 2100,
      };

      // 210 printed readings (10 mm .. 2100 mm) with max volume 21,648.3 L
      const csv210Printed = generateScanned20klPrintedReadingsCsv(21648.3, false);
      const rawLineCount = csv210Printed.trim().split('\n').length - 1;
      expect(rawLineCount).toBe(210);

      // 1. Rejected when allowOverCapacity is false
      const previewWithoutOverCap = buildGlobalTemplateImportPreview(csv210Printed, templateMeta, {
        allowOverCapacity: false,
      });
      expect(previewWithoutOverCap.valid).toBe(false);
      expect(previewWithoutOverCap.error).toContain('exceeds tank capacity of 20,000 L');

      // 2. Accepted when allowOverCapacity is true: infers 0 mm / 0 L point -> 211 points total
      const previewWithOverCap = buildGlobalTemplateImportPreview(csv210Printed, templateMeta, {
        allowOverCapacity: true,
      });
      expect(previewWithOverCap.valid).toBe(true);
      expect(previewWithOverCap.inferredZeroPoint).toBe(true);
      expect(previewWithOverCap.startsAtZero).toBe(true);
      expect(previewWithOverCap.reachesMaxDip).toBe(true);
      expect(previewWithOverCap.isOverNominalCapacity).toBe(true);
      expect(previewWithOverCap.maxOverCapacityCeilingLitres).toBe(22000);
      expect(previewWithOverCap.diagnostics.pointsCount).toBe(211);
      expect(previewWithOverCap.diagnostics.minDipMm).toBe(0);
      expect(previewWithOverCap.diagnostics.maxDipMm).toBe(2100);
      expect(previewWithOverCap.diagnostics.maxVolumeLitres).toBe(21648.3);
      expect(previewWithOverCap.saveStatusDefault).toBe('DRAFT');

      // 3. Rejected when volume exceeds the +10% ceiling (22,000.1 L > 22,000 L) even with allowOverCapacity: true
      const csvAboveCeiling = generateScanned20klPrintedReadingsCsv(22000.1, true);
      const previewAboveCeiling = buildGlobalTemplateImportPreview(csvAboveCeiling, templateMeta, {
        allowOverCapacity: true,
      });
      expect(previewAboveCeiling.valid).toBe(false);
      expect(previewAboveCeiling.error).toContain('+10% over-capacity ceiling of 22,000 L');

      // 4. Approval helper requires explicit confirmation when maxVolumeLitres > nominalCapacityLitres
      const draftOverCapTemplate = {
        status: 'DRAFT',
        pointsCount: 211,
        nominalCapacityLitres: 20000,
        maxVolumeLitres: 21648.3,
        isOverNominalCapacity: true,
      };
      const unconfirmedCheck = canApproveGlobalTemplate(draftOverCapTemplate, true, {
        confirmOverCapacity: false,
      });
      expect(unconfirmedCheck.allowed).toBe(false);
      expect(unconfirmedCheck.requiresOverCapacityConfirmation).toBe(true);

      const confirmedCheck = canApproveGlobalTemplate(draftOverCapTemplate, true, {
        confirmOverCapacity: true,
      });
      expect(confirmedCheck.allowed).toBe(true);

      const ceilingExceededCheck = canApproveGlobalTemplate(
        {
          ...draftOverCapTemplate,
          maxVolumeLitres: 22000.1,
        },
        true,
        { confirmOverCapacity: true }
      );
      expect(ceilingExceededCheck.allowed).toBe(false);
      expect(ceilingExceededCheck.reason).toContain('+10% over-capacity ceiling');
    });

    it('8.2 imports STANDARD_20KL with 21,648.3 L maximum (210 printed readings + inferred 0 mm / 0 L) as DRAFT when allowOverCapacity is true, rejects > +10% ceiling, and requires explicit confirmation on approval', async () => {
      const csv210Printed21648 = generateScanned20klPrintedReadingsCsv(21648.3, false);

      // 1. Import without allowOverCapacity -> must fail with 400 CAPACITY_CONFLICT
      const rejectNoFlagRes = await app.request(
        '/api/v1/calibration-templates/STANDARD_20KL/import',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            csvText: csv210Printed21648,
            status: 'DRAFT',
            allowOverCapacity: false,
            sourceFileName: 'IOCL_20KL_SCANNED_21648_3L.csv',
          }),
        },
        { DB: localD1 }
      );
      expect(rejectNoFlagRes.status).toBe(400);
      const rejectNoFlagJson = (await rejectNoFlagRes.json()) as any;
      expect(rejectNoFlagJson.error.code).toBe('CAPACITY_CONFLICT');

      // 2. Import above +10% ceiling (22,000.1 L and 25,000 L) with allowOverCapacity: true -> must fail with OVER_CAPACITY_CEILING_EXCEEDED
      const csv22000_1 = generateScanned20klPrintedReadingsCsv(22000.1, true);
      const rejectCeilingRes = await app.request(
        '/api/v1/calibration-templates/STANDARD_20KL/import',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            csvText: csv22000_1,
            status: 'DRAFT',
            allowOverCapacity: true,
            sourceFileName: 'IOCL_20KL_OVER_CEILING.csv',
          }),
        },
        { DB: localD1 }
      );
      expect(rejectCeilingRes.status).toBe(400);
      const rejectCeilingJson = (await rejectCeilingRes.json()) as any;
      expect(rejectCeilingJson.error.code).toBe('OVER_CAPACITY_CEILING_EXCEEDED');

      // 3. Import 210 printed readings (10..2100 mm, max 21,648.3 L) with allowOverCapacity: true -> succeeds as DRAFT with 211 points (0 mm / 0 L inferred)
      const importDraftRes = await app.request(
        '/api/v1/calibration-templates/STANDARD_20KL/import',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            csvText: csv210Printed21648,
            status: 'DRAFT',
            allowOverCapacity: true,
            sourceFileName: 'IOCL_20KL_SCANNED_21648_3L.csv',
            referenceDocument: 'IOCL-20KL-D2100-L6250-21648.3L',
          }),
        },
        { DB: localD1 }
      );
      expect(importDraftRes.status).toBe(200);
      const importDraftJson = (await importDraftRes.json()) as any;
      expect(importDraftJson.success).toBe(true);
      expect(importDraftJson.data.status).toBe('DRAFT');
      expect(importDraftJson.data.pointsCount).toBe(211);
      expect(importDraftJson.data.maxVolumeLitres).toBe(21648.3);
      expect(importDraftJson.data.maxVolumeLitresStr).toBe('21648.300');
      expect(importDraftJson.data.isOverNominalCapacity).toBe(true);
      expect(importDraftJson.data.points[0].dipMmStr).toBe('0.000');
      expect(importDraftJson.data.points[0].volumeLitreStr).toBe('0.000');
      expect(importDraftJson.data.points[210].dipMmStr).toBe('2100.000');
      expect(importDraftJson.data.points[210].volumeLitreStr).toBe('21648.300');

      // 4. Separate authorised approval WITHOUT confirmOverCapacity / allowOverCapacity -> must fail with 400 OVER_CAPACITY_CONFIRMATION_REQUIRED
      const approveUnconfirmedRes = await app.request(
        '/api/v1/calibration-templates/STANDARD_20KL/status',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'APPROVED',
          }),
        },
        { DB: localD1 }
      );
      expect(approveUnconfirmedRes.status).toBe(400);
      const approveUnconfirmedJson = (await approveUnconfirmedRes.json()) as any;
      expect(approveUnconfirmedJson.error.code).toBe('OVER_CAPACITY_CONFIRMATION_REQUIRED');

      // Verify template remained DRAFT
      const checkDraftRes = await app.request(
        '/api/v1/calibration-templates/STANDARD_20KL',
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        { DB: localD1 }
      );
      expect(((await checkDraftRes.json()) as any).data.status).toBe('DRAFT');

      // 5. Separate authorised approval WITH confirmOverCapacity: true -> succeeds and marks template APPROVED
      const approveConfirmedRes = await app.request(
        '/api/v1/calibration-templates/STANDARD_20KL/status',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'APPROVED',
            confirmOverCapacity: true,
          }),
        },
        { DB: localD1 }
      );
      expect(approveConfirmedRes.status).toBe(200);
      const approveConfirmedJson = (await approveConfirmedRes.json()) as any;
      expect(approveConfirmedJson.success).toBe(true);
      expect(approveConfirmedJson.data.status).toBe('APPROVED');
      expect(approveConfirmedJson.data.pointsCount).toBe(211);
      expect(approveConfirmedJson.data.maxVolumeLitres).toBe(21648.3);
    });
  });

  describe('9. Unsafe Tank Eligibility Fix: 15 KL, 20 KL, 25 KL, 50 KL & Missing-Dimension (UNVERIFIED) Tanks', () => {
    const eligibilityOutletId = 'ro-coco-eligibility-matrix';

    beforeAll(() => {
      const sqlite = localD1.getNativeDb();
      const nowIso = '2026-10-28T08:00:00Z';

      sqlite.exec(`
        INSERT OR IGNORE INTO retail_outlets (
          id, ro_code, name, outlet_type, state_id, division_id, sales_area_id,
          address, city, district, pincode, status, created_at, updated_at
        ) VALUES (
          '${eligibilityOutletId}', '396199', 'COCO Matrix Test Station', 'COCO', 'state-wb', 'div-kol', 'sa-cen',
          'NH-2 Bypass', 'Kolkata', 'Kolkata', '700099', 'ACTIVE', '${nowIso}', '${nowIso}'
        );

        INSERT OR IGNORE INTO tanks (
          id, outlet_id, tank_number, name, product_id,
          capacity_litres, safe_fill_capacity_litres, minimum_operating_level_litres,
          status, commissioned_at, created_at, created_by, updated_at
        ) VALUES
          ('tank-elig-15kl', '${eligibilityOutletId}', 1, 'Tank 1 - XP95 (15 KL)', 'prod-xp95', 15000, 14250, 1000, 'ACTIVE', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'),
          ('tank-elig-20kl-verified', '${eligibilityOutletId}', 2, 'Tank 2 - MS (20 KL Verified)', 'prod-ms', 20000, 19000, 1000, 'ACTIVE', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'),
          ('tank-elig-20kl-unverified', '${eligibilityOutletId}', 3, 'Tank 3 - MS (20 KL Missing Dims)', 'prod-ms', 20000, 19000, 1000, 'ACTIVE', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'),
          ('tank-elig-20kl-uncertified', '${eligibilityOutletId}', 4, 'Tank 4 - MS (20 KL Missing Cert)', 'prod-ms', 20000, 19000, 1000, 'ACTIVE', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'),
          ('tank-elig-25kl', '${eligibilityOutletId}', 5, 'Tank 5 - HSD (25 KL)', 'prod-hsd', 25000, 23750, 1500, 'ACTIVE', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'),
          ('tank-elig-50kl-verified', '${eligibilityOutletId}', 6, 'Tank 6 - HSD (50 KL Verified)', 'prod-hsd', 50000, 47500, 2500, 'ACTIVE', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'),
          ('tank-elig-50kl-unverified', '${eligibilityOutletId}', 7, 'Tank 7 - HSD (50 KL Missing Dims)', 'prod-hsd', 50000, 47500, 2500, 'ACTIVE', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}');

        INSERT OR IGNORE INTO tank_calibration_charts (
          id, tank_id, revision_number, status, chart_unit_dip, chart_unit_volume,
          tank_diameter_mm_milliunits, tank_length_mm_milliunits, max_dip_mm_milliunits, chart_capacity_milliunits,
          source_file_name, reference_document, effective_from, notes, created_by, created_at, updated_at, approved_by, approved_at
        ) VALUES
          -- 15 KL with legacy NULL length (must never infer 2100x6250)
          ('tcc-elig-15kl-r1', 'tank-elig-15kl', 1, 'ACTIVE', 'MM', 'LITRES', 2000000, NULL, 2000000, 15000000, 'legacy-d1-preserved', NULL, '2026-01-01', 'Legacy 15 KL', 'user-admin', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'),
          -- 20 KL with verified 2100x6250x2100 mm & certification
          ('tcc-elig-20kl-ver-r1', 'tank-elig-20kl-verified', 1, 'ACTIVE', 'MM', 'LITRES', 2100000, 6250000, 2100000, 20000000, 'IOCL_20KL_VERIFIED.csv', 'CERT-20KL-D2100-L6250', '2026-01-01', 'Verified 20 KL', 'user-admin', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'),
          -- 20 KL with missing dimensions (NULL diameter/length)
          ('tcc-elig-20kl-unver-r1', 'tank-elig-20kl-unverified', 1, 'ACTIVE', 'MM', 'LITRES', NULL, NULL, 2000000, 20000000, 'legacy-d1-preserved', NULL, '2026-01-01', 'Unverified 20 KL', 'user-admin', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'),
          -- 20 KL with dimensions but missing certification / reference document
          ('tcc-elig-20kl-uncert-r1', 'tank-elig-20kl-uncertified', 1, 'DRAFT', 'MM', 'LITRES', 2100000, 6250000, 2100000, 20000000, NULL, NULL, '2026-01-01', 'Uncertified 20 KL', 'user-admin', '${nowIso}', '${nowIso}', NULL, NULL),
          -- 25 KL with legacy NULL length (must never infer 2100x6250)
          ('tcc-elig-25kl-r1', 'tank-elig-25kl', 1, 'ACTIVE', 'MM', 'LITRES', 2200000, NULL, 2200000, 25000000, 'legacy-d1-preserved', NULL, '2026-01-01', 'Legacy 25 KL', 'user-admin', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'),
          -- 50 KL with verified 3000x7500x3000 mm & certification
          ('tcc-elig-50kl-ver-r1', 'tank-elig-50kl-verified', 1, 'ACTIVE', 'MM', 'LITRES', 3000000, 7500000, 3000000, 50000000, 'IOCL_50KL_VERIFIED.csv', 'CERT-50KL-D3000-L7500', '2026-01-01', 'Verified 50 KL', 'user-admin', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}'),
          -- 50 KL with missing dimensions (NULL length)
          ('tcc-elig-50kl-unver-r1', 'tank-elig-50kl-unverified', 1, 'ACTIVE', 'MM', 'LITRES', 3000000, NULL, 3000000, 50000000, 'legacy-d1-preserved', NULL, '2026-01-01', 'Unverified 50 KL', 'user-admin', '${nowIso}', '${nowIso}', 'user-admin', '${nowIso}');
      `);
    });

    it('9.1 enforces exact nominal capacity (no ±5,000 L tolerance) and verified tank-specific dimensions for 15 KL, 20 KL, 25 KL, 50 KL, and missing-dimension tanks', async () => {
      // 1. Evaluate against STANDARD_20KL (20,000 L, 2100x6250x2100 mm)
      const res20 = await app.request(
        `/api/v1/calibration-templates/STANDARD_20KL/eligible-tanks?outletId=${eligibilityOutletId}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        { DB: localD1 }
      );
      expect(res20.status).toBe(200);
      const json20 = (await res20.json()) as any;
      expect(json20.success).toBe(true);

      const tanks20: any[] = json20.data.tanks;
      const byId20 = new Map(tanks20.map(t => [t.tankId, t]));

      // 15 KL tank -> INELIGIBLE (capacity mismatch, dimensions NOT inferred as 2100x6250)
      const t15 = byId20.get('tank-elig-15kl');
      expect(t15).toBeDefined();
      expect(t15.isCapacityMatch).toBe(false);
      expect(t15.isCompatible).toBe(false);
      expect(t15.eligibilityStatus).toBe('INELIGIBLE');
      expect(t15.physicalDimensions.diameterMm).toBeNull();
      expect(t15.physicalDimensions.lengthMm).toBeNull();
      expect(t15.ineligibilityReason).toContain('Nominal capacity mismatch: Tank is 15,000 L');

      // 25 KL tank -> INELIGIBLE (capacity mismatch, dimensions NOT inferred as 2100x6250)
      const t25 = byId20.get('tank-elig-25kl');
      expect(t25).toBeDefined();
      expect(t25.isCapacityMatch).toBe(false);
      expect(t25.isCompatible).toBe(false);
      expect(t25.eligibilityStatus).toBe('INELIGIBLE');
      expect(t25.physicalDimensions.diameterMm).toBeNull();
      expect(t25.physicalDimensions.lengthMm).toBeNull();
      expect(t25.ineligibilityReason).toContain('Nominal capacity mismatch: Tank is 25,000 L');

      // 50 KL tank -> INELIGIBLE for STANDARD_20KL
      const t50On20 = byId20.get('tank-elig-50kl-verified');
      expect(t50On20).toBeDefined();
      expect(t50On20.isCapacityMatch).toBe(false);
      expect(t50On20.isCompatible).toBe(false);
      expect(t50On20.eligibilityStatus).toBe('INELIGIBLE');

      // 20 KL missing dimensions -> UNVERIFIED (blocked from assignment)
      const t20Unver = byId20.get('tank-elig-20kl-unverified');
      expect(t20Unver).toBeDefined();
      expect(t20Unver.isCapacityMatch).toBe(true);
      expect(t20Unver.isDimensionVerified).toBe(false);
      expect(t20Unver.isCompatible).toBe(false);
      expect(t20Unver.eligibilityStatus).toBe('UNVERIFIED');
      expect(t20Unver.physicalDimensions.diameterMm).toBeNull();
      expect(t20Unver.physicalDimensions.lengthMm).toBeNull();
      expect(t20Unver.ineligibilityReason).toContain('UNVERIFIED: Missing verified tank-specific physical dimensions');

      // 20 KL missing certification -> UNVERIFIED (blocked from assignment)
      const t20Uncert = byId20.get('tank-elig-20kl-uncertified');
      expect(t20Uncert).toBeDefined();
      expect(t20Uncert.isCapacityMatch).toBe(true);
      expect(t20Uncert.isDimensionVerified).toBe(true);
      expect(t20Uncert.isCertified).toBe(false);
      expect(t20Uncert.isCompatible).toBe(false);
      expect(t20Uncert.eligibilityStatus).toBe('UNVERIFIED');
      expect(t20Uncert.ineligibilityReason).toContain('UNVERIFIED: Missing calibration certification');

      // 20 KL verified (2100x6250x2100 mm + certification) -> ELIGIBLE
      const t20Ver = byId20.get('tank-elig-20kl-verified');
      expect(t20Ver).toBeDefined();
      expect(t20Ver.isCapacityMatch).toBe(true);
      expect(t20Ver.isDimensionVerified).toBe(true);
      expect(t20Ver.isCertified).toBe(true);
      expect(t20Ver.isDimensionMatch).toBe(true);
      expect(t20Ver.isCompatible).toBe(true);
      expect(t20Ver.eligibilityStatus).toBe('ELIGIBLE');
      expect(t20Ver.ineligibilityReason).toBeNull();

      // Verify seeded Park Street RO (ro-1001) master data was NOT silently altered:
      // tank-ro1-1 (20 KL, 2500x4500x2500 mm), tank-ro1-2 (25 KL), tank-ro1-3 (15 KL) are all INELIGIBLE for STANDARD_20KL
      const ro1Res = await app.request(
        '/api/v1/calibration-templates/STANDARD_20KL/eligible-tanks?outletId=ro-1001',
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        { DB: localD1 }
      );
      const ro1Tanks: any[] = ((await ro1Res.json()) as any).data.tanks;
      const ro1ById = new Map(ro1Tanks.map(t => [t.tankId, t]));

      const seededT1 = ro1ById.get('tank-ro1-1');
      expect(seededT1.capacityLitres).toBe(20000);
      expect(seededT1.physicalDimensions.diameterMm).toBe(2500);
      expect(seededT1.physicalDimensions.lengthMm).toBe(4500);
      expect(seededT1.isCompatible).toBe(false);
      expect(seededT1.eligibilityStatus).toBe('INELIGIBLE');
      expect(seededT1.ineligibilityReason).toContain('Physical dimension mismatch');

      expect(ro1ById.get('tank-ro1-2').isCompatible).toBe(false);
      expect(ro1ById.get('tank-ro1-2').eligibilityStatus).toBe('INELIGIBLE');
      expect(ro1ById.get('tank-ro1-3').isCompatible).toBe(false);
      expect(ro1ById.get('tank-ro1-3').eligibilityStatus).toBe('INELIGIBLE');

      // 2. Evaluate against STANDARD_50KL (50,000 L, 3000x7500x3000 mm)
      const res50 = await app.request(
        `/api/v1/calibration-templates/STANDARD_50KL/eligible-tanks?outletId=${eligibilityOutletId}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        { DB: localD1 }
      );
      expect(res50.status).toBe(200);
      const json50 = (await res50.json()) as any;
      const byId50 = new Map(json50.data.tanks.map((t: any) => [t.tankId, t]));

      const t50Ver: any = byId50.get('tank-elig-50kl-verified');
      expect(t50Ver.isCapacityMatch).toBe(true);
      expect(t50Ver.isDimensionVerified).toBe(true);
      expect(t50Ver.isDimensionMatch).toBe(true);
      expect(t50Ver.isCompatible).toBe(true);
      expect(t50Ver.eligibilityStatus).toBe('ELIGIBLE');

      const t50Unver: any = byId50.get('tank-elig-50kl-unverified');
      expect(t50Unver.isCapacityMatch).toBe(true);
      expect(t50Unver.isDimensionVerified).toBe(false);
      expect(t50Unver.isCompatible).toBe(false);
      expect(t50Unver.eligibilityStatus).toBe('UNVERIFIED');

      const t20On50: any = byId50.get('tank-elig-20kl-verified');
      expect(t20On50.isCapacityMatch).toBe(false);
      expect(t20On50.isCompatible).toBe(false);
      expect(t20On50.eligibilityStatus).toBe('INELIGIBLE');
    });

    it('9.2 partitions eligible vs ineligible/unverified tanks in UI, disables checkboxes for ineligible/unverified/protected-draft tanks, and selects only verified compatible tanks without protected draft', async () => {
      const res20 = await app.request(
        '/api/v1/calibration-templates/STANDARD_20KL/eligible-tanks',
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        { DB: localD1 }
      );
      const allTanks: any[] = ((await res20.json()) as any).data.tanks;

      const { eligibleTanks, ineligibleOrUnverifiedTanks } =
        partitionCocoTanksByEligibility(allTanks);

      // Eligible tanks must ONLY contain verified 20 KL tanks with 2100x6250x2100 mm dimensions
      expect(eligibleTanks.length).toBeGreaterThanOrEqual(2);
      expect(
        eligibleTanks.every(
          t =>
            t.capacityLitres === 20000 &&
            t.physicalDimensions.diameterMm === 2100 &&
            t.physicalDimensions.lengthMm === 6250 &&
            t.isDimensionVerified &&
            t.isCertified &&
            t.isCompatible &&
            t.eligibilityStatus === 'ELIGIBLE'
        )
      ).toBe(true);

      // Ineligible or unverified tanks must include 15 KL, 25 KL, 50 KL, dimension-mismatched 20 KL (tank-ro1-1), and missing-dimension 20 KL
      const ineligibleIds = new Set(ineligibleOrUnverifiedTanks.map(t => t.tankId));
      expect(ineligibleIds.has('tank-elig-15kl')).toBe(true);
      expect(ineligibleIds.has('tank-elig-25kl')).toBe(true);
      expect(ineligibleIds.has('tank-elig-50kl-verified')).toBe(true);
      expect(ineligibleIds.has('tank-elig-20kl-unverified')).toBe(true);
      expect(ineligibleIds.has('tank-elig-20kl-uncertified')).toBe(true);
      expect(ineligibleIds.has('tank-ro1-1')).toBe(true);
      expect(ineligibleIds.has('tank-ro1-2')).toBe(true);
      expect(ineligibleIds.has('tank-ro1-3')).toBe(true);

      // Every ineligible or unverified tank must have its checkbox disabled and a clear badge reason
      for (const t of ineligibleOrUnverifiedTanks) {
        expect(isCocoTankSelectionDisabled(t)).toBe(true);
        const badge = getCocoTankEligibilityBadge(t);
        expect(['UNVERIFIED', 'INELIGIBLE']).toContain(badge.label);
        expect(badge.reason.length).toBeGreaterThan(10);
      }

      // Select Eligible Tanks must ONLY select verified compatible tanks WITHOUT an existing protected DRAFT
      const selectableIds = getSelectableEligibleTankIds(allTanks);
      expect(selectableIds).toContain('tank-elig-20kl-verified');
      // COCO 22 Tank #1 (tank-coco22-1) has protected Rev #2 DRAFT, so it must NOT be selected by Select Eligible Tanks
      expect(selectableIds).not.toContain('tank-coco22-1');
      expect(selectableIds).not.toContain('tank-elig-15kl');
      expect(selectableIds).not.toContain('tank-elig-25kl');
      expect(selectableIds).not.toContain('tank-elig-20kl-unverified');
      expect(selectableIds).not.toContain('tank-ro1-1');
    });

    it('9.3 enforces user authorisation and tank compatibility on backend for both assignment preview and final assignment', async () => {
      // 1. Unauthorised user (Field Officer without TANKS_WRITE / ADMIN) is blocked with 403 FORBIDDEN on BOTH preview and assign
      const foPreviewRes = await app.request(
        '/api/v1/calibration-templates/STANDARD_20KL/assign-preview',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${fieldOfficerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tankIds: ['tank-elig-20kl-verified'] }),
        },
        { DB: localD1 }
      );
      expect(foPreviewRes.status).toBe(403);

      const foAssignRes = await app.request(
        '/api/v1/calibration-templates/STANDARD_20KL/assign',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${fieldOfficerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tankIds: ['tank-elig-20kl-verified'] }),
        },
        { DB: localD1 }
      );
      expect(foAssignRes.status).toBe(403);

      // 2. Submitting 15 KL, 25 KL, 50 KL, or dimension-mismatched 20 KL tank IDs directly to /assign-preview or /assign is rejected with 400 INCOMPATIBLE_TANK
      for (const badTankId of [
        'tank-elig-15kl',
        'tank-elig-25kl',
        'tank-elig-50kl-verified',
        'tank-ro1-1',
        'tank-ro1-2',
        'tank-ro1-3',
      ]) {
        const prevBad = await app.request(
          '/api/v1/calibration-templates/STANDARD_20KL/assign-preview',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${adminToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ tankIds: [badTankId] }),
          },
          { DB: localD1 }
        );
        expect(prevBad.status).toBe(400);
        const prevBadJson = (await prevBad.json()) as any;
        expect(prevBadJson.error.code).toBe('INCOMPATIBLE_TANK');

        const assignBad = await app.request(
          '/api/v1/calibration-templates/STANDARD_20KL/assign',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${adminToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ tankIds: [badTankId] }),
          },
          { DB: localD1 }
        );
        expect(assignBad.status).toBe(400);
        const assignBadJson = (await assignBad.json()) as any;
        expect(assignBadJson.error.code).toBe('INCOMPATIBLE_TANK');
      }

      // 3. Submitting UNVERIFIED (missing-dimension or missing-certification) tank IDs directly to /assign-preview or /assign is rejected with 400 UNVERIFIED_TANK_DIMENSIONS
      for (const unverifiedTankId of ['tank-elig-20kl-unverified', 'tank-elig-20kl-uncertified']) {
        const prevUnver = await app.request(
          '/api/v1/calibration-templates/STANDARD_20KL/assign-preview',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${adminToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ tankIds: [unverifiedTankId] }),
          },
          { DB: localD1 }
        );
        expect(prevUnver.status).toBe(400);
        const prevUnverJson = (await prevUnver.json()) as any;
        expect(prevUnverJson.error.code).toBe('UNVERIFIED_TANK_DIMENSIONS');

        const assignUnver = await app.request(
          '/api/v1/calibration-templates/STANDARD_20KL/assign',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${adminToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ tankIds: [unverifiedTankId] }),
          },
          { DB: localD1 }
        );
        expect(assignUnver.status).toBe(400);
        const assignUnverJson = (await assignUnver.json()) as any;
        expect(assignUnverJson.error.code).toBe('UNVERIFIED_TANK_DIMENSIONS');
      }

      // 4. Valid assignment to verified 20 KL tank creates DRAFT only and preserves ACTIVE chart
      const validAssignRes = await app.request(
        '/api/v1/calibration-templates/STANDARD_20KL/assign',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tankIds: ['tank-elig-20kl-verified'],
            activateImmediately: true,
          }),
        },
        { DB: localD1 }
      );
      expect(validAssignRes.status).toBe(200);
      const validAssignJson = (await validAssignRes.json()) as any;
      expect(validAssignJson.data.assignments[0].status).toBe('DRAFT');
      expect(validAssignJson.data.assignments[0].revisionNumber).toBe(2);
    });
  });
});



