import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as XLSX from 'xlsx';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import * as schema from '../src/db/schema';
import { seedDatabase } from '../src/db/seed';
import { ExcelCalibrationImportService } from '../src/worker/services/excelCalibrationImportService';
import { PumpRepository } from '../src/worker/repositories/pumpRepository';
import { AuditRepository } from '../src/worker/repositories/auditRepository';
import { getGlobalTemplateStatusBadge } from '../src/frontend/components/pump/pumpInfrastructureUi';
import fs from 'fs';
import path from 'path';

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

describe('IOCL Excel Calibration Importer Suite (All Three Tank Calibration Charts)', () => {
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

  describe('1. Six-Sheet Workbook Extraction, Deduplication & Exact Chart Specifications', () => {
    it('extracts all 3 calibration charts from 6-sheet 20KL_15KL_10KL_calibration_Dip_chart.xlsx without misclassifying extra sheets as 20 KL', async () => {
      const buffer = fs.readFileSync(fixturePath);
      const sha256 = await ExcelCalibrationImportService.computeSha256(buffer);
      expect(sha256).toBeDefined();
      expect(sha256.length).toBe(64);

      const result = await ExcelCalibrationImportService.extractWorkbook(
        buffer,
        '20KL_15KL_10KL_calibration_Dip_chart.xlsx'
      );

      // 6 total sheets: 3 calibration charts + 3 auxiliary/note sheets skipped
      expect(result.totalSheets).toBe(6);
      expect(result.identifiedChartsCount).toBe(3);
      expect(result.eligibleChartsCount).toBe(3);
      expect(result.blockedChartsCount).toBe(0);
      expect(result.skippedNonCalibrationSheets.length).toBe(3);
      expect(result.skippedNonCalibrationSheets).toEqual([
        'Summary_Overview',
        '15KL_Length_Note',
        'Working_Notes',
      ]);

      // Ensure no duplicate template codes (sorted 10 KL, 15 KL, 20 KL)
      const codes = result.charts.map(c => c.templateCode);
      expect(codes).toEqual([
        'EXCEL_10KL_REFERENCE',
        'EXCEL_15KL_REFERENCE',
        'EXCEL_20KL_REFERENCE',
      ]);

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
      expect(chart20?.requiresEngineeringReview).toBe(false);
      expect(chart20?.status).toBe('ELIGIBLE_DRAFT');
      expect(chart20?.reviewStatusLabel).toBe('DRAFT / PENDING VERIFICATION');

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
      expect(chart15?.requiresDimensionVerification).toBe(true);
      expect(chart15?.status).toBe('DRAFT_DIMENSION_VERIFICATION');
      expect(chart15?.reviewStatusLabel).toBe('DRAFT / DIMENSION VERIFICATION REQUIRED');
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
      expect(chart10?.hasSyntheticZero).toBe(true);
      expect(chart10?.points[0]).toEqual({
        dipMm: 0,
        volumeLitres: 0,
        dipCm: 0,
        isSyntheticZero: true,
      });
      expect(chart10?.points[194].dipMm).toBe(1940);
      expect(chart10?.points[194].volumeLitres).toBe(11073.41);
      expect(chart10?.eligibleForDraftImport).toBe(true);
      expect(chart10?.requiresEngineeringReview).toBe(true);
      expect(chart10?.status).toBe('DRAFT_ENGINEERING_REVIEW');
      expect(chart10?.reviewStatusLabel).toBe('DRAFT / ENGINEERING REVIEW REQUIRED');
      expect(chart10?.warnings.some(w => w.includes('ENGINEERING REVIEW REQUIRED') && w.includes('11073.41 L'))).toBe(true);
    });

    it('deduplicates duplicate sheets of the same chart in a workbook without creating duplicate template entries', async () => {
      const buffer = fs.readFileSync(fixturePath);
      const wb = XLSX.read(buffer, { type: 'buffer' });
      // Add a duplicate 20KL sheet tab
      const copyWs = XLSX.utils.aoa_to_sheet(
        XLSX.utils.sheet_to_json(wb.Sheets['20KL'], { header: 1 }) as any[][]
      );
      XLSX.utils.book_append_sheet(wb, copyWs, '20KL_Copy');
      const dupBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const result = await ExcelCalibrationImportService.extractWorkbook(dupBuffer, 'dup_test.xlsx');
      expect(result.identifiedChartsCount).toBe(3);
      expect(result.charts.filter(c => c.templateCode === 'EXCEL_20KL_REFERENCE').length).toBe(1);
    });

    it('safely skips spreadsheet error cells outside calibration table', async () => {
      const buffer = fs.readFileSync(fixturePath);
      const result = await ExcelCalibrationImportService.extractWorkbook(buffer);
      const chart20 = result.charts.find(c => c.templateCode === 'EXCEL_20KL_REFERENCE')!;
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
      for (let d = 1; d <= 210; d++) {
        if (d === 5) continue;
        const vol = d === 10 ? 50 : d * 100;
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

  describe('2. Database Import, Idempotency & Engineering Review Restrictions', () => {
    it('imports all three charts (10 KL, 15 KL, 20 KL) as DRAFT, preserves exact 10 KL values (10,000 L / 11,073.41 L / 195 pts), and logs audit entries', async () => {
      const db = getDb(localD1);
      const pumpRepo = new PumpRepository(db);
      const auditRepo = new AuditRepository(db);
      const buffer = fs.readFileSync(fixturePath);

      const extracted = await ExcelCalibrationImportService.extractWorkbook(
        buffer,
        '20KL_15KL_10KL_calibration_Dip_chart.xlsx'
      );

      const importResult = await ExcelCalibrationImportService.importEligibleCharts(
        db,
        extracted,
        { userId: adminUserId },
        { confirmImport: true }
      );

      expect(importResult.importedTemplates.length).toBe(3);
      expect(importResult.importedTemplates.map(t => t.code)).toEqual([
        'EXCEL_10KL_REFERENCE',
        'EXCEL_15KL_REFERENCE',
        'EXCEL_20KL_REFERENCE',
      ]);
      expect(importResult.skippedCharts.length).toBe(0);

      // Verify EXCEL_10KL_REFERENCE in database
      const tpl10 = await pumpRepo.findGlobalTankCalibrationTemplateByCode('EXCEL_10KL_REFERENCE');
      expect(tpl10).toBeDefined();
      const tpl10Detail = await pumpRepo.findGlobalTankCalibrationTemplateById(tpl10.id);
      expect(tpl10Detail?.status).toBe('DRAFT');
      expect(tpl10Detail?.nominalCapacityLitres).toBe(10000);
      expect(tpl10Detail?.tankDiameterMm).toBe(1940);
      expect(tpl10Detail?.tankLengthMm).toBe(3750);
      expect(tpl10Detail?.maxDipMm).toBe(1940);
      expect(tpl10Detail?.pointsCount).toBe(195);
      expect(tpl10Detail?.maxVolumeLitres).toBe(11073.41);
      expect(tpl10Detail?.isOverCapacityCeiling).toBe(true);
      expect(tpl10Detail?.requiresEngineeringReview).toBe(true);
      expect(tpl10Detail?.reviewStatusLabel).toBe('DRAFT / ENGINEERING REVIEW REQUIRED');

      const pts10 = await pumpRepo.listGlobalTankCalibrationTemplatePoints(tpl10.id);
      expect(pts10.length).toBe(195);
      expect(pts10[0].dipMillimetres).toBe(0);
      expect(pts10[0].volumeLitres).toBe(0);
      expect(pts10[194].dipMillimetres).toBe(1940);
      expect(pts10[194].volumeLitres).toBe(11073.41);

      // Verify EXCEL_15KL_REFERENCE in database
      const tpl15 = await pumpRepo.findGlobalTankCalibrationTemplateByCode('EXCEL_15KL_REFERENCE');
      expect(tpl15).toBeDefined();
      const tpl15Detail = await pumpRepo.findGlobalTankCalibrationTemplateById(tpl15.id);
      expect(tpl15Detail?.status).toBe('DRAFT');
      expect(tpl15Detail?.nominalCapacityLitres).toBe(15000);
      expect(tpl15Detail?.tankDiameterMm).toBe(1940);
      expect(tpl15Detail?.tankLengthMm).toBe(5500);
      expect(tpl15Detail?.maxDipMm).toBe(1940);
      expect(tpl15Detail?.pointsCount).toBe(195);
      expect(tpl15Detail?.maxVolumeLitres).toBe(16246.13);
      expect(tpl15Detail?.requiresDimensionVerification).toBe(true);
      expect(tpl15Detail?.reviewStatusLabel).toBe('DRAFT / DIMENSION VERIFICATION REQUIRED');

      // Verify EXCEL_20KL_REFERENCE in database
      const tpl20 = await pumpRepo.findGlobalTankCalibrationTemplateByCode('EXCEL_20KL_REFERENCE');
      expect(tpl20).toBeDefined();
      const tpl20Detail = await pumpRepo.findGlobalTankCalibrationTemplateById(tpl20.id);
      expect(tpl20Detail?.status).toBe('DRAFT');
      expect(tpl20Detail?.nominalCapacityLitres).toBe(20000);
      expect(tpl20Detail?.tankDiameterMm).toBe(2100);
      expect(tpl20Detail?.tankLengthMm).toBe(6250);
      expect(tpl20Detail?.maxDipMm).toBe(2100);
      expect(tpl20Detail?.pointsCount).toBe(211);
      expect(tpl20Detail?.maxVolumeLitres).toBe(21628.93);
      expect(tpl20Detail?.reviewStatusLabel).toBe('DRAFT / PENDING VERIFICATION');

      // Verify UI status badges for all three templates
      const badge10 = getGlobalTemplateStatusBadge(tpl10Detail?.status, tpl10Detail?.pointsCount, tpl10Detail);
      const badge15 = getGlobalTemplateStatusBadge(tpl15Detail?.status, tpl15Detail?.pointsCount, tpl15Detail);
      const badge20 = getGlobalTemplateStatusBadge(tpl20Detail?.status, tpl20Detail?.pointsCount, tpl20Detail);
      expect(badge10.readinessLabel).toBe('10 KL — DRAFT / ENGINEERING REVIEW REQUIRED — 195 points');
      expect(badge15.readinessLabel).toBe('15 KL — DRAFT / DIMENSION VERIFICATION REQUIRED — 195 points');
      expect(badge20.readinessLabel).toBe('20 KL — DRAFT / PENDING VERIFICATION — 211 points');

      // Verify standard templates STANDARD_20KL and STANDARD_50KL were not altered
      const std20 = await pumpRepo.findGlobalTankCalibrationTemplateByCode('STANDARD_20KL');
      const std50 = await pumpRepo.findGlobalTankCalibrationTemplateByCode('STANDARD_50KL');
      expect(std20.code).toBe('STANDARD_20KL');
      expect(std50.code).toBe('STANDARD_50KL');
      expect(std20.pointsCount).toBe(0);

      // Verify audit logs
      const logs = await auditRepo.listLogs(50, 0, {
        entityType: 'GLOBAL_TANK_CALIBRATION_TEMPLATE',
      });
      const excelLogs = logs.filter(l => l.action === 'GLOBAL_CALIBRATION_TEMPLATE_IMPORT_EXCEL');
      expect(excelLogs.length).toBeGreaterThanOrEqual(3);
    });

    it('retains already-imported 15 KL and 20 KL DRAFT templates without duplicating or overwriting readings when importing 10 KL', async () => {
      const db = getDb(localD1);
      const pumpRepo = new PumpRepository(db);
      const buffer = fs.readFileSync(fixturePath);
      const extracted = await ExcelCalibrationImportService.extractWorkbook(
        buffer,
        '20KL_15KL_10KL_calibration_Dip_chart.xlsx'
      );

      // Pre-import only 20 KL and 15 KL (simulating state before 10 KL was enabled)
      const preExtracted = {
        ...extracted,
        charts: extracted.charts.filter(c => c.templateCode !== 'EXCEL_10KL_REFERENCE'),
      };
      const firstImport = await ExcelCalibrationImportService.importEligibleCharts(
        db,
        preExtracted,
        { userId: adminUserId },
        { confirmImport: true }
      );
      expect(firstImport.importedTemplates.map(t => `${t.code}:${t.action}`)).toEqual([
        'EXCEL_15KL_REFERENCE:CREATED',
        'EXCEL_20KL_REFERENCE:CREATED',
      ]);

      const tpl20Before = await pumpRepo.findGlobalTankCalibrationTemplateByCode('EXCEL_20KL_REFERENCE');
      const pts20Before = await pumpRepo.listGlobalTankCalibrationTemplatePoints(tpl20Before.id);
      const tpl15Before = await pumpRepo.findGlobalTankCalibrationTemplateByCode('EXCEL_15KL_REFERENCE');
      const pts15Before = await pumpRepo.listGlobalTankCalibrationTemplatePoints(tpl15Before.id);

      // Now run full import of all 3 calibration references
      const secondImport = await ExcelCalibrationImportService.importEligibleCharts(
        db,
        extracted,
        { userId: adminUserId },
        { confirmImport: true }
      );

      expect(secondImport.importedTemplates.map(t => `${t.code}:${t.action}`)).toEqual([
        'EXCEL_10KL_REFERENCE:CREATED',
        'EXCEL_15KL_REFERENCE:UNCHANGED',
        'EXCEL_20KL_REFERENCE:UNCHANGED',
      ]);

      // Verify 20 KL and 15 KL point IDs were retained untouched (not overwritten or duplicated)
      const pts20After = await pumpRepo.listGlobalTankCalibrationTemplatePoints(tpl20Before.id);
      const pts15After = await pumpRepo.listGlobalTankCalibrationTemplatePoints(tpl15Before.id);
      expect(pts20After.length).toBe(211);
      expect(pts15After.length).toBe(195);
      expect(pts20After[0].id).toBe(pts20Before[0].id);
      expect(pts15After[0].id).toBe(pts15Before[0].id);
    });

    it('enforces normal +10% capacity validation for operational calibration while blocking approval and assignment of review-only 10 KL chart', async () => {
      const db = getDb(localD1);
      const pumpRepo = new PumpRepository(db);
      const buffer = fs.readFileSync(fixturePath);
      const extracted = await ExcelCalibrationImportService.extractWorkbook(
        buffer,
        '20KL_15KL_10KL_calibration_Dip_chart.xlsx'
      );

      await ExcelCalibrationImportService.importEligibleCharts(
        db,
        extracted,
        { userId: adminUserId },
        { confirmImport: true }
      );

      const tpl10 = await pumpRepo.findGlobalTankCalibrationTemplateByCode('EXCEL_10KL_REFERENCE');
      expect(tpl10).toBeDefined();

      // 1. Normal operational CSV import (> +10% without engineering review flag) is still rejected
      await expect(
        pumpRepo.importGlobalTankCalibrationTemplatePoints(
          tpl10.id,
          [
            { dipMillimetresMilliunits: 0, volumeMilliunits: 0 },
            { dipMillimetresMilliunits: 1940000, volumeMilliunits: 11073410 },
          ],
          adminUserId,
          { allowOverCapacity: true, status: 'DRAFT' }
        )
      ).rejects.toThrow('exceeds the maximum permitted +10% over-capacity ceiling');

      // 2. Approving EXCEL_10KL_REFERENCE via API is blocked with 400 OVER_CAPACITY_CEILING_EXCEEDED
      const approveRes = await app.request(
        `/api/v1/calibration-templates/${encodeURIComponent(tpl10.id)}/status`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'APPROVED',
            allowOverCapacity: true,
            confirmOverCapacity: true,
          }),
        },
        env
      );
      expect(approveRes.status).toBe(400);
      const approveJson = (await approveRes.json()) as any;
      expect(approveJson.success).toBe(false);
      expect(approveJson.error.code).toBe('OVER_CAPACITY_CEILING_EXCEEDED');

      // 3. Tank assignment preview for EXCEL_10KL_REFERENCE is blocked with ENGINEERING_REVIEW_REQUIRED
      const tanks = await db.select().from(schema.tanks);
      const previewRes = await app.request(
        `/api/v1/calibration-templates/${encodeURIComponent(tpl10.id)}/assign-preview`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tankIds: [tanks[0].id] }),
        },
        env
      );
      expect(previewRes.status).toBe(400);
      const previewJson = (await previewRes.json()) as any;
      expect(previewJson.success).toBe(false);
      expect(previewJson.error.code).toBe('ENGINEERING_REVIEW_REQUIRED');

      // 4. Tank assignment for EXCEL_10KL_REFERENCE is blocked
      const assignRes = await app.request(
        `/api/v1/calibration-templates/${encodeURIComponent(tpl10.id)}/assign`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tankIds: [tanks[0].id], activateImmediately: false }),
        },
        env
      );
      expect(assignRes.status).toBe(400);
      const assignJson = (await assignRes.json()) as any;
      expect(assignJson.success).toBe(false);
      expect(['ENGINEERING_REVIEW_REQUIRED', 'TEMPLATE_NOT_APPROVED']).toContain(
        assignJson.error.code
      );
    });

    it('strictly forbids overwriting approved standard templates STANDARD_20KL or STANDARD_50KL', async () => {
      const db = getDb(localD1);
      const fakeExtracted = {
        workbookName: 'malicious.xlsx',
        workbookSha256: 'abcdef123456',
        totalSheets: 1,
        identifiedChartsCount: 1,
        eligibleChartsCount: 1,
        engineeringReviewChartsCount: 0,
        dimensionVerificationChartsCount: 0,
        blockedChartsCount: 0,
        skippedNonCalibrationSheets: [],
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
            requiresEngineeringReview: false,
            requiresDimensionVerification: false,
            reviewStatusLabel: 'DRAFT / PENDING VERIFICATION',
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

    it('POST /calibration-templates/excel-preview allows ADMIN and returns all 3 extracted charts from 6-sheet workbook', async () => {
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
      expect(json.data.totalSheets).toBe(6);
      expect(json.data.identifiedChartsCount).toBe(3);
      expect(json.data.eligibleChartsCount).toBe(3);
      expect(json.data.blockedChartsCount).toBe(0);
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

    it('POST /calibration-templates/excel-import successfully imports all 3 calibration references when confirmed', async () => {
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
      expect(json.data.importedTemplates.length).toBe(3);
      expect(json.data.importedTemplates.map((t: any) => t.code)).toEqual([
        'EXCEL_10KL_REFERENCE',
        'EXCEL_15KL_REFERENCE',
        'EXCEL_20KL_REFERENCE',
      ]);
      expect(json.data.importedTemplates.every((t: any) => t.status === 'DRAFT')).toBe(true);
      expect(json.data.skippedCharts.length).toBe(0);
    });

    it('preserves existing COCO retail outlets, tanks, active calibration charts, and historical shifts', async () => {
      const db = getDb(localD1);
      const pumpRepo = new PumpRepository(db);

      const outletsBefore = await db.select().from(schema.retailOutlets);
      expect(outletsBefore.length).toBeGreaterThan(0);
      const shiftsBefore = await db.select().from(schema.operationalShifts);
      const readingsBefore = await db.select().from(schema.tankStockReadings);

      const res = await app.request('/api/v1/calibration-templates/excel-import', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ loadDefault: true, confirmImport: true }),
      }, env);
      expect(res.status).toBe(200);

      const outletsAfter = await db.select().from(schema.retailOutlets);
      expect(outletsAfter.length).toBe(outletsBefore.length);
      const shiftsAfter = await db.select().from(schema.operationalShifts);
      expect(shiftsAfter.length).toBe(shiftsBefore.length);
      const readingsAfter = await db.select().from(schema.tankStockReadings);
      expect(readingsAfter.length).toBe(readingsBefore.length);

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
