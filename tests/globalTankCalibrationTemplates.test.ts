import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import { app } from '../src/worker/app';

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

  describe('1. Global Template Inventory & Seeding', () => {
    it('1.1 retrieves seeded STANDARD_20KL and STANDARD_50KL global templates', async () => {
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
      expect(std20.status).toBe('APPROVED');
      expect(std20.pointsCount).toBe(201);

      const std50 = templates.find((t: any) => t.code === 'STANDARD_50KL');
      expect(std50).toBeDefined();
      expect(std50.nominalCapacityLitres).toBe(50000);
      expect(std50.status).toBe('APPROVED');
      expect(std50.pointsCount).toBe(301);
    });

    it('1.2 fetches full points dataset for STANDARD_20KL template', async () => {
      const res = await app.request('/api/v1/calibration-templates/gtct-std-20kl', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { DB: localD1 });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.code).toBe('STANDARD_20KL');
      expect(json.data.points.length).toBe(201);
      expect(json.data.points[0].dipMillimetres).toBe(0);
      expect(json.data.points[0].volumeLitres).toBe(0);
      expect(json.data.points[200].dipMillimetres).toBe(2000);
      expect(json.data.points[200].volumeLitres).toBe(20000);
    });
  });

  describe('2. Custom Template Creation & Approval', () => {
    it('2.1 allows creating a new global tank calibration template', async () => {
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

    it('2.2 updates status of a template from DRAFT to APPROVED', async () => {
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

  describe('3. Template Matching & Suggestion', () => {
    it('3.1 suggests STANDARD_20KL template for a 20 KL underground tank', async () => {
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
  });

  describe('4. Multi-Tank Preview & Bulk Assignment', () => {
    it('4.1 previews assignment of STANDARD_20KL template to COCO 22 tanks', async () => {
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

    it('4.2 assigns STANDARD_20KL template to COCO 22 Tank 1, creating Revision 2 and preserving historical chart', async () => {
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
      expect(assignment.pointsCount).toBe(201);

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
});
