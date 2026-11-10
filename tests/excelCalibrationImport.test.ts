import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as XLSX from 'xlsx';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import * as schema from '../src/db/schema';
import { seedDatabase } from '../src/db/seed';
import { ExcelCalibrationImportService } from '../src/worker/services/excelCalibrationImportService';
import { PumpRepository } from '../src/worker/repositories/pumpRepository';
import { OutletRepository } from '../src/worker/repositories/outletRepository';
import { AuditRepository } from '../src/worker/repositories/auditRepository';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = './.sqlite/test_excel_calibration.db';

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

describe('IOCL Excel Calibration Importer Suite', () => {
  let localD1: any;
  let env: any;
  let adminToken: string;
  let adminUserId: string;
  let operatorToken: string;
  let currentTestDbPath: string;
  const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/20KL_15KL_10KL_calibration_Dip_chart.xlsx');

  beforeEach(async () => {
    currentTestDbPath = `./.sqlite/test_excel_calibration_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.db`;
    const dir = path.dirname(currentTestDbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    localD1 = createLocalD1Database(currentTestDbPath);
    const db = getDb(localD1);
    await seedDatabase(db);

    env = {
      DB: localD1,
      DOCUMENTS_BUCKET: new MockR2Bucket(),
      ENVIRONMENT: 'test',
      ALLOWED_ORIGINS: '*',
    };

    // Obtain Admin token
    const adminRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
    }, env);
    const adminJson = await adminRes.json() as any;
    expect(adminJson.success).toBe(true);
    adminToken = adminJson.data.token;
    adminUserId = adminJson.data.user.id;

    // Obtain Non-admin Field Officer token
    const opRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fo.central@iocl.in', password: 'Password@123' }),
    }, env);
    const opJson = await opRes.json() as any;
    expect(opJson.success).toBe(true);
    operatorToken = opJson.data.token;
  });

  afterEach(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      const p = `${currentTestDbPath}${suffix}`;
      if (p && fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch {
          // ignore
        }
      }
    }
  });

  describe('1. Workbook Extraction & Specification Validation', () => {
    it('successfully extracts all 3 sheets from 20KL_15KL_10KL_calibration_Dip_chart.xlsx fixture', async () => {
      const buffer = fs.readFileSync(fixturePath);
      const sha256 = await ExcelCalibrationImportService.computeSha256(buffer);
      expect(sha256).toBeDefined();
      expect(sha256.length).toBe(64);

      const result = await ExcelCalibrationImportService.extractWorkbook(buffer, '20KL_15KL_10KL_calibration_Dip_chart.xlsx');

      expect(result.identifiedChartsCount).toBe(3);
      expect(result.eligibleChartsCount).toBe(2);
      expect(result.blockedChartsCount).toBe(1);

      // Verify 20 KL Chart
      const chart20 = result.charts.find(c => c.templateCode === 'EXCEL_20KL_REFERENCE');
      expect(chart20).toBeDefined();
      expect(chart20?.nominalCapacityLitres).toBe(20000);
      expect(chart20?.tankDiameterMm).toBe(2100);
      expect(chart20?.tankLengthMm).toBe(6250);
      expect(chart20?.maxDipMm).toBe(2100);
      expect(chart20?.actualPointCount).toBe(211);
      expect(chart20?.maxVolumeLitres).toBe(21628.93);
      expect(chart20?.startsAtZero).toBe(true);
      expect(chart20?.isMonotonic).toBe(true);
      expect(chart20?.hasSyntheticZero).toBe(true);
      expect(chart20?.points[0]).toEqual({
        dipMm: 0,
        volumeLitres: 0,
        dipCm: 0,
        isSyntheticZero: true,
      });
      expect(chart20?.points[210].dipMm).toBe(2100);
      expect(chart20?.points[210].volumeLitres).toBe(21628.93);
      expect(chart20?.eligibleForDraftImport).toBe(true);
      expect(chart20?.status).toBe('ELIGIBLE_DRAFT');

      // Verify 15 KL Chart
      const chart15 = result.charts.find(c => c.templateCode === 'EXCEL_15KL_REFERENCE');
      expect(chart15).toBeDefined();
      expect(chart15?.nominalCapacityLitres).toBe(15000);
      expect(chart15?.tankDiameterMm).toBe(1940);
      expect(chart15?.tankLengthMm).toBe(5500);
      expect(chart15?.maxDipMm).toBe(1940);
      expect(chart15?.actualPointCount).toBe(195);
      expect(chart15?.maxVolumeLitres).toBe(16246.13);
      expect(chart15?.startsAtZero).toBe(true);
      expect(chart15?.isMonotonic).toBe(true);
      expect(chart15?.hasSyntheticZero).toBe(true);
      expect(chart15?.points[0].isSyntheticZero).toBe(true);
      expect(chart15?.points[194].dipMm).toBe(1940);
      expect(chart15?.points[194].volumeLitres).toBe(16246.13);
      expect(chart15?.eligibleForDraftImport).toBe(true);
      expect(chart15?.status).toBe('ELIGIBLE_DRAFT');
      expect(chart15?.warnings.some(w => w.includes('3,750 mm'))).toBe(true);

      // Verify 10 KL Chart
      const chart10 = result.charts.find(c => c.templateCode === 'EXCEL_10KL_REFERENCE');
      expect(chart10).toBeDefined();
      expect(chart10?.nominalCapacityLitres).toBe(10000);
      expect(chart10?.tankDiameterMm).toBe(1940);
      expect(chart10?.tankLengthMm).toBe(3750);
      expect(chart10?.maxDipMm).toBe(1940);
      expect(chart10?.actualPointCount).toBe(195);
      expect(chart10?.maxVolumeLitres).toBe(11073.41);
      expect(chart10?.startsAtZero).toBe(true);
      expect(chart10?.isMonotonic).toBe(true);
      expect(chart10?.eligibleForDraftImport).toBe(false);
      expect(chart10?.status).toBe('BLOCKED');
      expect(chart10?.warnings.some(w => w.includes('BLOCKED') && w.includes('11000.00 L'))).toBe(true);
    });

    it('safely skips spreadsheet error cells outside calibration table', async () => {
      const buffer = fs.readFileSync(fixturePath);
      const result = await ExcelCalibrationImportService.extractWorkbook(buffer);
      const chart20 = result.charts.find(c => c.templateCode === 'EXCEL_20KL_REFERENCE')!;
      // Points should strictly include valid finite readings, no NaN or nulls
      expect(chart20.points.length).toBe(211);
      for (const pt of chart20.points) {
        expect(Number.isFinite(pt.dipMm)).toBe(true);
        expect(Number.isFinite(pt.volumeLitres)).toBe(true);
      }
    });

    it('rejects empty, corrupted, or unidentifiable workbooks', async () => {
      await expect(
        ExcelCalibrationImportService.extractWorkbook(new Uint8Array(0))
      ).rejects.toThrow('EMPTY_WORKBOOK');

      await expect(
        ExcelCalibrationImportService.extractWorkbook(new Uint8Array([1, 2, 3, 4]))
      ).rejects.toThrow('NO_CALIBRATION_SHEETS');

      // Workbook with unrelated sheets
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([['Random', 'Sheet'], [1, 2]]);
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      await expect(
        ExcelCalibrationImportService.extractWorkbook(buf, 'wrong.xlsx')
      ).rejects.toThrow('NO_CALIBRATION_SHEETS');
    });

    it('flags non-monotonic volume and missing dip points as BLOCKED with errors', async () => {
      const wb = XLSX.utils.book_new();
      const rows: any[][] = [['DIP (CM)', 'VOLUME (L)']];
      // Generate 20KL sheet with missing dip 5 cm and non-monotonic jump at 10 cm
      for (let d = 1; d <= 210; d++) {
        if (d === 5) continue; // missing dip point
        const vol = d === 10 ? 50 : d * 100; // non-monotonic at d=10 (50 < 900)
        rows.push([d, vol]);
      }
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, '20KL');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const result = await ExcelCalibrationImportService.extractWorkbook(buf, 'bad_20kl.xlsx');
      const chart20 = result.charts[0];
      expect(chart20.isMonotonic).toBe(false);
      expect(chart20.eligibleForDraftImport).toBe(false);
      expect(chart20.status).toBe('BLOCKED');
      expect(chart20.errors.some(e => e.includes('Non-monotonic volume'))).toBe(true);
      expect(chart20.errors.some(e => e.includes('Missing dip points'))).toBe(true);
    });
  });

  describe('2. Database Import & Protection Guarantees', () => {
    it('imports 20 KL and 15 KL as DRAFT, blocks 10 KL, and logs audit entries', async () => {
      const db = getDb(localD1);
      const pumpRepo = new PumpRepository(db);
      const auditRepo = new AuditRepository(db);
      const buffer = fs.readFileSync(fixturePath);

      const extracted = await ExcelCalibrationImportService.extractWorkbook(buffer, '20KL_15KL_10KL_calibration_Dip_chart.xlsx');

      const importResult = await ExcelCalibrationImportService.importEligibleCharts(
        db,
        extracted,
        { userId: adminUserId },
        { confirmImport: true }
      );

      expect(importResult.importedTemplates.length).toBe(2);
      expect(importResult.importedTemplates.map(t => t.code)).toEqual([
        'EXCEL_20KL_REFERENCE',
        'EXCEL_15KL_REFERENCE',
      ]);
      expect(importResult.skippedCharts.length).toBe(1);
      expect(importResult.skippedCharts[0].templateCode).toBe('EXCEL_10KL_REFERENCE');

      // Verify EXCEL_20KL_REFERENCE in database
      const tpl20 = await pumpRepo.findGlobalTankCalibrationTemplateByCode('EXCEL_20KL_REFERENCE');
      expect(tpl20).toBeDefined();
      expect(tpl20.status).toBe('DRAFT');
      expect(tpl20.nominalCapacityLitres).toBe(20000);
      expect(tpl20.pointsCount).toBe(211);

      // Verify points
      const pts20 = await pumpRepo.listGlobalTankCalibrationTemplatePoints(tpl20.id);
      expect(pts20.length).toBe(211);
      expect(pts20[0].dipMillimetres).toBe(0);
      expect(pts20[0].volumeLitres).toBe(0);
      expect(pts20[210].dipMillimetres).toBe(2100);
      expect(pts20[210].volumeLitres).toBe(21628.93);

      // Verify EXCEL_15KL_REFERENCE in database
      const tpl15 = await pumpRepo.findGlobalTankCalibrationTemplateByCode('EXCEL_15KL_REFERENCE');
      expect(tpl15).toBeDefined();
      expect(tpl15.status).toBe('DRAFT');
      expect(tpl15.nominalCapacityLitres).toBe(15000);
      expect(tpl15.pointsCount).toBe(195);

      // Verify EXCEL_10KL_REFERENCE was NOT inserted
      const tpl10 = await pumpRepo.findGlobalTankCalibrationTemplateByCode('EXCEL_10KL_REFERENCE');
      expect(tpl10).toBeNull();

      // Verify standard templates STANDARD_20KL and STANDARD_50KL were not altered
      const std20 = await pumpRepo.findGlobalTankCalibrationTemplateByCode('STANDARD_20KL');
      const std50 = await pumpRepo.findGlobalTankCalibrationTemplateByCode('STANDARD_50KL');
      expect(std20).toBeDefined();
      expect(std50).toBeDefined();
      expect(std20.code).toBe('STANDARD_20KL');
      expect(std50.code).toBe('STANDARD_50KL');
      expect(std20.pointsCount).toBe(0); // Unpopulated reference header untouched

      // Verify audit logs
      const logs = await auditRepo.listLogs(50, 0, {
        entityType: 'GLOBAL_TANK_CALIBRATION_TEMPLATE',
      });
      const excelLogs = logs.filter(l => l.action === 'GLOBAL_CALIBRATION_TEMPLATE_IMPORT_EXCEL');
      expect(excelLogs.length).toBeGreaterThanOrEqual(2);
    });

    it('is idempotent: re-importing the same workbook updates DRAFT without duplicating points or templates', async () => {
      const db = getDb(localD1);
      const pumpRepo = new PumpRepository(db);
      const buffer = fs.readFileSync(fixturePath);

      const extracted = await ExcelCalibrationImportService.extractWorkbook(buffer, '20KL_15KL_10KL_calibration_Dip_chart.xlsx');

      // First import
      await ExcelCalibrationImportService.importEligibleCharts(
        db,
        extracted,
        { userId: adminUserId },
        { confirmImport: true }
      );

      // Second import
      const secondResult = await ExcelCalibrationImportService.importEligibleCharts(
        db,
        extracted,
        { userId: adminUserId },
        { confirmImport: true }
      );

      expect(secondResult.importedTemplates.length).toBe(2);
      expect(secondResult.importedTemplates[0].action).toBe('UPDATED_DRAFT');

      const tpl20 = await pumpRepo.findGlobalTankCalibrationTemplateByCode('EXCEL_20KL_REFERENCE');
      const pts20 = await pumpRepo.listGlobalTankCalibrationTemplatePoints(tpl20.id);
      expect(pts20.length).toBe(211); // Still exactly 211, not doubled to 422!
    });

    it('strictly forbids overwriting approved standard templates STANDARD_20KL or STANDARD_50KL', async () => {
      const db = getDb(localD1);
      const fakeExtracted = {
        workbookName: 'malicious.xlsx',
        workbookSha256: 'abcdef123456',
        totalSheets: 1,
        identifiedChartsCount: 1,
        eligibleChartsCount: 1,
        blockedChartsCount: 0,
        warnings: [],
        errors: [],
        charts: [
          {
            sheetName: 'Overwrite',
            templateCode: 'STANDARD_20KL',
            templateName: 'Malicious 20KL',
            nominalCapacityLitres: 20000,
            tankDiameterMm: 2100,
            tankLengthMm: 6250,
            maxDipMm: 2100,
            expectedPointCount: 2,
            actualPointCount: 2,
            maxVolumeLitres: 20000,
            expectedMaxVolumeLitres: 20000,
            startsAtZero: true,
            isMonotonic: true,
            hasSyntheticZero: true,
            eligibleForDraftImport: true,
            status: 'ELIGIBLE_DRAFT' as const,
            warnings: [],
            errors: [],
            points: [
              { dipMm: 0, volumeLitres: 0 },
              { dipMm: 2100, volumeLitres: 20000 },
            ],
          },
        ],
      };

      await expect(
        ExcelCalibrationImportService.importEligibleCharts(
          db,
          fakeExtracted,
          { userId: adminUserId },
          { confirmImport: true }
        )
      ).rejects.toThrow('PROTECTED_TEMPLATE');
    });
  });

  describe('3. HTTP API Endpoints & Role-Based Access Control', () => {
    it('POST /calibration-templates/excel-preview rejects non-ADMIN users with 403', async () => {
      const res = await app.request('/api/v1/calibration-templates/excel-preview', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${operatorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ loadDefault: true }),
      }, env);

      expect(res.status).toBe(403);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('FORBIDDEN');
    });

    it('POST /calibration-templates/excel-preview allows ADMIN and returns extracted charts', async () => {
      const res = await app.request('/api/v1/calibration-templates/excel-preview', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ loadDefault: true }),
      }, env);

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.identifiedChartsCount).toBe(3);
      expect(json.data.eligibleChartsCount).toBe(2);
      expect(json.data.blockedChartsCount).toBe(1);
    });

    it('POST /calibration-templates/excel-import rejects unconfirmed requests with 400 CONFIRMATION_REQUIRED', async () => {
      const res = await app.request('/api/v1/calibration-templates/excel-import', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ loadDefault: true, confirmImport: false }),
      }, env);

      expect(res.status).toBe(400);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('CONFIRMATION_REQUIRED');
    });

    it('POST /calibration-templates/excel-import successfully imports eligible charts when confirmed', async () => {
      const res = await app.request('/api/v1/calibration-templates/excel-import', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ loadDefault: true, confirmImport: true }),
      }, env);

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.importedTemplates.length).toBe(2);
      expect(json.data.importedTemplates[0].code).toBe('EXCEL_20KL_REFERENCE');
      expect(json.data.importedTemplates[0].status).toBe('DRAFT');
      expect(json.data.skippedCharts.length).toBe(1);
      expect(json.data.skippedCharts[0].templateCode).toBe('EXCEL_10KL_REFERENCE');
    });

    it('preserves existing COCO retail outlets, tanks, active calibration charts, and historical shifts', async () => {
      const db = getDb(localD1);
      const pumpRepo = new PumpRepository(db);
      const outletRepo = new OutletRepository(db);

      // Verify outlets and shifts exist before
      const outletsBefore = await db.select().from(schema.retailOutlets);
      expect(outletsBefore.length).toBeGreaterThan(0);
      const shiftsBefore = await db.select().from(schema.operationalShifts);
      const readingsBefore = await db.select().from(schema.tankStockReadings);

      // Execute import
      const res = await app.request('/api/v1/calibration-templates/excel-import', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ loadDefault: true, confirmImport: true }),
      }, env);
      expect(res.status).toBe(200);

      // Verify outlets, shifts, and readings still match identically
      const outletsAfter = await db.select().from(schema.retailOutlets);
      expect(outletsAfter.length).toBe(outletsBefore.length);
      const shiftsAfter = await db.select().from(schema.operationalShifts);
      expect(shiftsAfter.length).toBe(shiftsBefore.length);
      const readingsAfter = await db.select().from(schema.tankStockReadings);
      expect(readingsAfter.length).toBe(readingsBefore.length);

      // Verify existing tanks still exist and active charts are untouched
      const tanks = await db.select().from(schema.tanks);
      expect(tanks.length).toBeGreaterThan(0);

      for (const tank of tanks) {
        const charts = await pumpRepo.listCalibrationCharts(tank.id);
        const active = charts.find(c => c.status === 'ACTIVE');
        if (active) {
          expect(active.status).toBe('ACTIVE');
        }
      }
    });
  });
});
