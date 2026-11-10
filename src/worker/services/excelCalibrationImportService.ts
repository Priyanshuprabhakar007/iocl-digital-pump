import * as XLSX from 'xlsx';
import { eq } from 'drizzle-orm';
import { AppDatabase } from '../../db';
import * as schema from '../../db/schema';
import { PumpRepository } from '../repositories/pumpRepository';
import { AuditRepository } from '../repositories/auditRepository';

export interface CalibrationPointExtracted {
  dipMm: number;
  volumeLitres: number;
  dipCm?: number;
  isSyntheticZero?: boolean;
}

export interface ExtractedChartReport {
  sheetName: string;
  templateCode: 'EXCEL_20KL_REFERENCE' | 'EXCEL_15KL_REFERENCE' | 'EXCEL_10KL_REFERENCE' | string;
  templateName: string;
  nominalCapacityLitres: number;
  tankDiameterMm: number;
  tankLengthMm: number;
  maxDipMm: number;
  expectedPointCount: number;
  actualPointCount: number;
  maxVolumeLitres: number;
  expectedMaxVolumeLitres: number;
  startsAtZero: boolean;
  isMonotonic: boolean;
  hasSyntheticZero: boolean;
  eligibleForDraftImport: boolean;
  status: 'ELIGIBLE_DRAFT' | 'BLOCKED';
  warnings: string[];
  errors: string[];
  points: CalibrationPointExtracted[];
  conflictingAnnotation?: string | null;
}

export interface ExcelWorkbookExtractionResult {
  workbookName: string;
  workbookSha256: string;
  totalSheets: number;
  identifiedChartsCount: number;
  eligibleChartsCount: number;
  blockedChartsCount: number;
  charts: ExtractedChartReport[];
  warnings: string[];
  errors: string[];
}

export class ExcelCalibrationImportService {
  /**
   * Computes SHA-256 hash of a binary buffer
   */
  static async computeSha256(buffer: Uint8Array | ArrayBuffer): Promise<string> {
    const raw = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const data = new Uint8Array(raw);
    const digest = await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Reads an uploaded Excel workbook buffer, identifies the 20KL, 15KL, 10KL calibration sheets,
   * extracts dip (cm -> mm) and volume data, validates monotonicity, adds synthetic zero,
   * and verifies specifications.
   */
  static async extractWorkbook(
    buffer: Uint8Array | ArrayBuffer,
    fileName = '20KL_15KL_10KL_calibration_Dip_chart.xlsx'
  ): Promise<ExcelWorkbookExtractionResult> {
    const uint8Data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (!uint8Data || uint8Data.length === 0) {
      throw new Error(
        'EMPTY_WORKBOOK:Uploaded workbook buffer is empty. Please provide a valid Excel workbook file.'
      );
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(uint8Data, { type: 'array', cellFormula: true, cellHTML: false });
    } catch (err: any) {
      throw new Error(
        `CORRUPTED_WORKBOOK:Failed to parse Excel workbook (${err.message || 'Invalid binary format'}).`
      );
    }

    const sha256 = await this.computeSha256(uint8Data);
    const sheetNames = workbook.SheetNames || [];
    if (sheetNames.length === 0) {
      throw new Error('NO_SHEETS_FOUND:The uploaded workbook contains no worksheet sheets.');
    }

    const charts: ExtractedChartReport[] = [];
    const workbookWarnings: string[] = [];
    const workbookErrors: string[] = [];

    // Check each sheet to identify matching calibration charts
    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const normName = sheetName.toUpperCase().replace(/\s+/g, '');
      let chartType: '20KL' | '15KL' | '10KL' | null = null;

      if (normName.includes('20KL') || normName.includes('20000')) {
        chartType = '20KL';
      } else if (normName.includes('15KL') || normName.includes('15000')) {
        chartType = '15KL';
      } else if (normName.includes('10KL') || normName.includes('10000')) {
        chartType = '10KL';
      } else {
        // Also inspect top 10 rows for content matching 20KL, 15KL, 10KL
        const textSample = this.extractSheetTextSample(sheet);
        if (/20\s*KL|20,?000\s*L/i.test(textSample)) {
          chartType = '20KL';
        } else if (/15\s*KL|15,?000\s*L/i.test(textSample)) {
          chartType = '15KL';
        } else if (/10\s*KL|10,?000\s*L/i.test(textSample)) {
          chartType = '10KL';
        }
      }

      if (chartType) {
        const report = this.extractChartSheet(sheet, sheetName, chartType);
        charts.push(report);
      }
    }

    if (charts.length === 0) {
      throw new Error(
        `NO_CALIBRATION_SHEETS:No 10 KL, 15 KL or 20 KL calibration sheets could be identified in workbook '${fileName}'.`
      );
    }

    // Sort charts logically: 20KL, 15KL, 10KL
    charts.sort((a, b) => {
      const order: Record<string, number> = {
        EXCEL_20KL_REFERENCE: 1,
        EXCEL_15KL_REFERENCE: 2,
        EXCEL_10KL_REFERENCE: 3,
      };
      return (order[a.templateCode] || 99) - (order[b.templateCode] || 99);
    });

    const eligibleCount = charts.filter((c) => c.eligibleForDraftImport).length;
    const blockedCount = charts.filter((c) => !c.eligibleForDraftImport).length;

    return {
      workbookName: fileName,
      workbookSha256: sha256,
      totalSheets: sheetNames.length,
      identifiedChartsCount: charts.length,
      eligibleChartsCount: eligibleCount,
      blockedChartsCount: blockedCount,
      charts,
      warnings: workbookWarnings,
      errors: workbookErrors,
    };
  }

  /**
   * Extracts text from top rows of a worksheet for classification
   */
  private static extractSheetTextSample(sheet: XLSX.WorkSheet): string {
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z30');
    const parts: string[] = [];
    const maxRow = Math.min(range.e.r, 20);
    for (let r = range.s.r; r <= maxRow; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.v !== undefined) {
          parts.push(String(cell.v));
        }
      }
    }
    return parts.join(' ');
  }

  /**
   * Extracts and validates an individual calibration chart sheet (20KL, 15KL, or 10KL)
   */
  private static extractChartSheet(
    sheet: XLSX.WorkSheet,
    sheetName: string,
    chartType: '20KL' | '15KL' | '10KL'
  ): ExtractedChartReport {
    const warnings: string[] = [];
    const errors: string[] = [];

    let templateCode = '';
    let templateName = '';
    let nominalCapacityLitres = 0;
    let tankDiameterMm = 0;
    let tankLengthMm = 0;
    let maxDipMm = 0;
    let expectedPointCount = 0;
    let expectedMaxVolumeLitres = 0;
    let conflictingAnnotation: string | null = null;

    if (chartType === '20KL') {
      templateCode = 'EXCEL_20KL_REFERENCE';
      templateName = 'Excel Reference 20,000 Litre Tank Calibration Chart';
      nominalCapacityLitres = 20000;
      tankDiameterMm = 2100;
      tankLengthMm = 6250;
      maxDipMm = 2100;
      expectedPointCount = 211;
      expectedMaxVolumeLitres = 21628.93;
    } else if (chartType === '15KL') {
      templateCode = 'EXCEL_15KL_REFERENCE';
      templateName = 'Excel Reference 15,000 Litre Tank Calibration Chart';
      nominalCapacityLitres = 15000;
      tankDiameterMm = 1940;
      tankLengthMm = 5500;
      maxDipMm = 1940;
      expectedPointCount = 195;
      expectedMaxVolumeLitres = 16246.13;
      conflictingAnnotation =
        'Conflicting 3,750 mm length annotation in worksheet requires engineering verification before approval.';
      warnings.push(conflictingAnnotation);
    } else {
      templateCode = 'EXCEL_10KL_REFERENCE';
      templateName = 'Excel Reference 10,000 Litre Tank Calibration Chart';
      nominalCapacityLitres = 10000;
      tankDiameterMm = 1940;
      tankLengthMm = 3750;
      maxDipMm = 1940;
      expectedPointCount = 195;
      expectedMaxVolumeLitres = 11073.41;
    }

    // Extract raw dip points from tabular cells
    const rawPairs = this.parseDipVolumePairs(sheet, chartType, maxDipMm / 10);

    if (rawPairs.errors.length > 0) {
      errors.push(...rawPairs.errors);
    }
    if (rawPairs.warnings.length > 0) {
      warnings.push(...rawPairs.warnings);
    }

    // Add synthetic zero point (0 mm = 0 L)
    const points: CalibrationPointExtracted[] = [
      {
        dipMm: 0,
        volumeLitres: 0,
        dipCm: 0,
        isSyntheticZero: true,
      },
    ];

    for (const p of rawPairs.points) {
      points.push({
        dipMm: Math.round(p.dipCm * 10),
        volumeLitres: p.volumeLitres,
        dipCm: p.dipCm,
        isSyntheticZero: false,
      });
    }

    // Sort by dipMm
    points.sort((a, b) => a.dipMm - b.dipMm);

    // Validation checks
    let isMonotonic = true;
    for (let i = 1; i < points.length; i++) {
      if (points[i].volumeLitres <= points[i - 1].volumeLitres) {
        isMonotonic = false;
        errors.push(
          `Non-monotonic volume detected at dip ${points[i].dipMm} mm: volume ${points[i].volumeLitres} L <= previous ${points[i - 1].volumeLitres} L.`
        );
        break;
      }
      if (points[i].dipMm === points[i - 1].dipMm) {
        errors.push(`Duplicate dip measurement at ${points[i].dipMm} mm.`);
      }
    }

    // Check step continuity: every 10 mm from 0 to maxDipMm
    const expectedDips = Array.from({ length: maxDipMm / 10 + 1 }, (_, i) => i * 10);
    const actualDips = new Set(points.map((p) => p.dipMm));
    const missingDips = expectedDips.filter((d) => !actualDips.has(d));
    if (missingDips.length > 0) {
      errors.push(
        `Missing dip points in calibration sequence: ${missingDips.slice(0, 5).join(', ')}${
          missingDips.length > 5 ? `... (${missingDips.length} missing)` : ''
        }`
      );
    }

    const maxVolumeLitres = points[points.length - 1]?.volumeLitres || 0;
    const actualPointCount = points.length;

    // Check point count
    if (actualPointCount !== expectedPointCount) {
      errors.push(
        `Point count mismatch: expected ${expectedPointCount} points (including synthetic zero), found ${actualPointCount}.`
      );
    }

    // Capacity ceiling check:
    // Existing rule: nominalCapacityLitres * 1.10 (+10% ceiling)
    const maxCapacityCeiling = nominalCapacityLitres * 1.1;
    let eligibleForDraftImport = errors.length === 0;
    let status: 'ELIGIBLE_DRAFT' | 'BLOCKED' = eligibleForDraftImport ? 'ELIGIBLE_DRAFT' : 'BLOCKED';

    if (maxVolumeLitres > maxCapacityCeiling) {
      eligibleForDraftImport = false;
      status = 'BLOCKED';
      const ceilingMsg = `BLOCKED / REQUIRES ENGINEERING REVIEW: Source maximum volume ${maxVolumeLitres.toFixed(
        2
      )} L exceeds the nominal-capacity +10% ceiling of ${maxCapacityCeiling.toLocaleString()} L (${maxCapacityCeiling.toFixed(
        2
      )} L, nominal ${nominalCapacityLitres.toLocaleString()} L). Chart cannot be imported until source capacity and calibration policy are verified by engineering.`;
      warnings.push(ceilingMsg);
    }

    return {
      sheetName,
      templateCode,
      templateName,
      nominalCapacityLitres,
      tankDiameterMm,
      tankLengthMm,
      maxDipMm,
      expectedPointCount,
      actualPointCount,
      maxVolumeLitres,
      expectedMaxVolumeLitres,
      startsAtZero: points[0]?.dipMm === 0,
      isMonotonic,
      hasSyntheticZero: true,
      eligibleForDraftImport,
      status,
      warnings,
      errors,
      points,
      conflictingAnnotation,
    };
  }

  /**
   * Scans a worksheet for pairs of Dip (cm) and Volume (Litres)
   */
  private static parseDipVolumePairs(
    sheet: XLSX.WorkSheet,
    chartType: '20KL' | '15KL' | '10KL',
    expectedMaxDipCm: number
  ): {
    points: Array<{ dipCm: number; volumeLitres: number }>;
    warnings: string[];
    errors: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];
    const foundPointsMap = new Map<number, number>();

    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z300');

    // First scan to locate column pairs containing dips (1..expectedMaxDipCm)
    for (let c = range.s.c; c <= range.e.c; c++) {
      for (let r = range.s.r; r <= range.e.r; r++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (!cell || cell.v === undefined) continue;

        // Check if cell is an error string outside or inside table
        if (cell.t === 'e' || (typeof cell.v === 'string' && cell.v.startsWith('#'))) {
          // Spreadsheet error cell
          continue;
        }

        const val = Number(cell.v);
        // Look for dip values from 1 to expectedMaxDipCm
        if (Number.isInteger(val) && val >= 1 && val <= expectedMaxDipCm) {
          // Look for volume in the next column (c + 1)
          const volCell = sheet[XLSX.utils.encode_cell({ r, c: c + 1 })];
          if (volCell && volCell.v !== undefined) {
            if (volCell.t === 'e' || (typeof volCell.v === 'string' && volCell.v.startsWith('#'))) {
              errors.push(
                `Formula error cell '${volCell.v}' found at row ${r + 1}, column ${XLSX.utils.encode_col(
                  c + 1
                )} for dip ${val} cm.`
              );
              continue;
            }

            const volNum = Number(volCell.v);
            if (Number.isFinite(volNum) && volNum > 0) {
              if (foundPointsMap.has(val)) {
                // If duplicate, verify match
                const prev = foundPointsMap.get(val)!;
                if (Math.abs(prev - volNum) > 0.01) {
                  errors.push(
                    `Inconsistent volume readings for dip ${val} cm: ${prev} vs ${volNum}.`
                  );
                }
              } else {
                foundPointsMap.set(val, volNum);
              }
            }
          }
        }
      }
    }

    const points: Array<{ dipCm: number; volumeLitres: number }> = [];
    for (const [dipCm, volumeLitres] of foundPointsMap.entries()) {
      points.push({ dipCm, volumeLitres });
    }

    points.sort((a, b) => a.dipCm - b.dipCm);

    return { points, warnings, errors };
  }

  /**
   * Imports all eligible charts from an extracted workbook result as DRAFT into the database.
   * Never overwrites STANDARD_20KL or STANDARD_50KL.
   * Never automatically approves or activates calibrations.
   */
  static async importEligibleCharts(
    db: AppDatabase,
    extractedResult: ExcelWorkbookExtractionResult,
    actor: { userId: string; name?: string; email?: string },
    options?: {
      targetCodes?: string[];
      confirmImport: boolean;
      ipAddress?: string | null;
      userAgent?: string | null;
    }
  ): Promise<{
    importedTemplates: Array<{
      id: string;
      code: string;
      name: string;
      status: string;
      pointsCount: number;
      action: 'CREATED' | 'UPDATED_DRAFT' | 'UNCHANGED';
    }>;
    skippedCharts: Array<{
      templateCode: string;
      reason: string;
    }>;
  }> {
    if (!options?.confirmImport) {
      throw new Error(
        'CONFIRMATION_REQUIRED:Administrator confirmation is required before importing calibration charts.'
      );
    }

    const pumpRepo = new PumpRepository(db);
    const auditRepo = new AuditRepository(db);
    const importedTemplates = [];
    const skippedCharts = [];

    const nowIso = new Date().toISOString();

    for (const chart of extractedResult.charts) {
      // Check if this chart was requested
      if (options?.targetCodes && !options.targetCodes.includes(chart.templateCode)) {
        continue;
      }

      // 1. If chart is not eligible (e.g. 10 KL over capacity), skip and record reason
      if (!chart.eligibleForDraftImport) {
        skippedCharts.push({
          templateCode: chart.templateCode,
          reason: chart.warnings[0] || 'Chart is blocked due to validation or capacity ceiling constraints.',
        });
        continue;
      }

      // 2. Strict protection: Never overwrite STANDARD_20KL or STANDARD_50KL
      if (chart.templateCode === 'STANDARD_20KL' || chart.templateCode === 'STANDARD_50KL') {
        throw new Error(
          `PROTECTED_TEMPLATE:The standard template '${chart.templateCode}' is approved and permanently protected against Excel overwrite.`
        );
      }

      // Convert extracted points into repository format (dip in milliunits, vol in milliunits)
      const repoPoints = chart.points.map((p) => ({
        dipMillimetresMilliunits: Math.round(p.dipMm * 1000),
        volumeMilliunits: Math.round(p.volumeLitres * 1000),
      }));

      // Check if template code already exists
      const existing = await pumpRepo.findGlobalTankCalibrationTemplateByCode(chart.templateCode);

      if (existing) {
        // If it already exists as DRAFT, check points
        if (existing.status !== 'DRAFT') {
          skippedCharts.push({
            templateCode: chart.templateCode,
            reason: `Template '${chart.templateCode}' exists with status '${existing.status}' and cannot be overwritten.`,
          });
          continue;
        }

        // Idempotent update of DRAFT template points
        const updated = await pumpRepo.importGlobalTankCalibrationTemplatePoints(
          existing.id,
          repoPoints,
          actor.userId,
          {
            status: 'DRAFT',
            allowOverCapacity: true,
            sourceFileName: extractedResult.workbookName,
            referenceDocument: `IOCL-${chart.templateCode}-EXCEL`,
            notes: `Imported from Excel workbook '${extractedResult.workbookName}' (SHA-256: ${extractedResult.workbookSha256.slice(
              0,
              16
            )}...). Sheet: ${chart.sheetName}. ${chart.conflictingAnnotation || ''}`.trim(),
            tankDiameterMmMilliunits: Math.round(chart.tankDiameterMm * 1000),
            tankLengthMmMilliunits: Math.round(chart.tankLengthMm * 1000),
            maxDipMmMilliunits: Math.round(chart.maxDipMm * 1000),
          }
        );

        await auditRepo.logAction({
          id: `audit-gtct-excel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          userId: actor.userId,
          action: 'GLOBAL_CALIBRATION_TEMPLATE_IMPORT_EXCEL',
          entityType: 'GLOBAL_TANK_CALIBRATION_TEMPLATE',
          entityId: existing.id,
          newValue: {
            code: chart.templateCode,
            status: 'DRAFT',
            pointsCount: updated.pointsCount ?? repoPoints.length,
            workbookName: extractedResult.workbookName,
            workbookSha256: extractedResult.workbookSha256,
            sheetName: chart.sheetName,
            conflictingAnnotation: chart.conflictingAnnotation ?? null,
          },
          ipAddress: options?.ipAddress || '127.0.0.1',
          userAgent: options?.userAgent || 'Excel Importer',
          createdAt: nowIso,
        });

        importedTemplates.push({
          id: existing.id,
          code: existing.code,
          name: existing.name,
          status: 'DRAFT',
          pointsCount: updated.pointsCount ?? repoPoints.length,
          action: 'UPDATED_DRAFT' as const,
        });
      } else {
        // Create new global calibration template in DRAFT status
        const templateId = `gtct-${chart.templateCode.toLowerCase().replace(/[^a-z0-9_-]/g, '')}`;

        const created = await pumpRepo.createGlobalTankCalibrationTemplate(
          {
            id: templateId,
            code: chart.templateCode,
            name: chart.templateName,
            nominalCapacityLitres: chart.nominalCapacityLitres,
            tankDiameterMmMilliunits: Math.round(chart.tankDiameterMm * 1000),
            tankLengthMmMilliunits: Math.round(chart.tankLengthMm * 1000),
            maxDipMmMilliunits: Math.round(chart.maxDipMm * 1000),
            status: 'DRAFT',
            sourceFileName: extractedResult.workbookName,
            referenceDocument: `IOCL-${chart.templateCode}-EXCEL`,
            notes: `Imported from Excel workbook '${extractedResult.workbookName}' (SHA-256: ${extractedResult.workbookSha256.slice(
              0,
              16
            )}...). Sheet: ${chart.sheetName}. ${chart.conflictingAnnotation || ''}`.trim(),
            createdBy: actor.userId,
            createdAt: nowIso,
            approvedBy: null,
            approvedAt: null,
            allowOverCapacity: true,
          },
          repoPoints
        );

        await auditRepo.logAction({
          id: `audit-gtct-excel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          userId: actor.userId,
          action: 'GLOBAL_CALIBRATION_TEMPLATE_IMPORT_EXCEL',
          entityType: 'GLOBAL_TANK_CALIBRATION_TEMPLATE',
          entityId: created.id,
          newValue: {
            code: chart.templateCode,
            status: 'DRAFT',
            pointsCount: created.pointsCount ?? repoPoints.length,
            workbookName: extractedResult.workbookName,
            workbookSha256: extractedResult.workbookSha256,
            sheetName: chart.sheetName,
            conflictingAnnotation: chart.conflictingAnnotation ?? null,
          },
          ipAddress: options?.ipAddress || '127.0.0.1',
          userAgent: options?.userAgent || 'Excel Importer',
          createdAt: nowIso,
        });

        importedTemplates.push({
          id: created.id,
          code: created.code,
          name: created.name,
          status: 'DRAFT',
          pointsCount: created.pointsCount ?? repoPoints.length,
          action: 'CREATED' as const,
        });
      }
    }

    return { importedTemplates, skippedCharts };
  }
}
