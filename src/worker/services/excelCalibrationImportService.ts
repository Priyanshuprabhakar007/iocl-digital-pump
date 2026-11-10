import * as XLSX from 'xlsx';
import { AppDatabase } from '../../db';
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
  requiresEngineeringReview: boolean;
  requiresDimensionVerification: boolean;
  reviewStatusLabel: string;
  status: 'ELIGIBLE_DRAFT' | 'DRAFT_DIMENSION_VERIFICATION' | 'DRAFT_ENGINEERING_REVIEW' | 'BLOCKED';
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
  engineeringReviewChartsCount: number;
  dimensionVerificationChartsCount: number;
  blockedChartsCount: number;
  skippedNonCalibrationSheets: string[];
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
   * Reads an uploaded Excel workbook buffer, identifies the 10KL, 15KL, and 20KL calibration sheets
   * without duplicating templates across auxiliary sheets or misclassifying unrelated sheets as 20KL,
   * extracts dip (cm -> mm) and volume data, validates monotonicity, adds derived 0 mm = 0 L point,
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

    const candidateReportsByCode = new Map<string, ExtractedChartReport[]>();
    const skippedNonCalibrationSheets: string[] = [];
    const workbookWarnings: string[] = [];
    const workbookErrors: string[] = [];

    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const classification = this.classifyWorksheet(sheet, sheetName, sheetNames.length);
      if (!classification) {
        skippedNonCalibrationSheets.push(sheetName);
        continue;
      }

      const report = this.extractChartSheet(sheet, sheetName, classification);
      // If workbook has multiple sheets and this sheet yielded almost no calibration points (< 10),
      // treat it as an auxiliary/notes tab rather than a calibration table.
      if (sheetNames.length > 1 && report.actualPointCount < 10) {
        skippedNonCalibrationSheets.push(sheetName);
        continue;
      }

      const list = candidateReportsByCode.get(report.templateCode) || [];
      list.push(report);
      candidateReportsByCode.set(report.templateCode, list);
    }

    // Deduplicate by templateCode so 6-sheet workbooks never produce duplicate template entries
    const charts: ExtractedChartReport[] = [];
    for (const [templateCode, candidates] of candidateReportsByCode.entries()) {
      if (candidates.length === 1) {
        charts.push(candidates[0]);
      } else if (candidates.length > 1) {
        candidates.sort((a, b) => this.scoreCandidateChart(b) - this.scoreCandidateChart(a));
        const chosen = candidates[0];
        charts.push(chosen);
        const skippedNames = candidates.slice(1).map((c) => c.sheetName);
        skippedNonCalibrationSheets.push(...skippedNames);
        workbookWarnings.push(
          `Retained canonical sheet '${chosen.sheetName}' for ${templateCode}; skipped secondary/duplicate sheet(s): ${skippedNames.join(', ')}.`
        );
      }
    }

    if (charts.length === 0) {
      throw new Error(
        `NO_CALIBRATION_SHEETS:No 10 KL, 15 KL or 20 KL calibration sheets could be identified in workbook '${fileName}'.`
      );
    }

    // Sort charts in ascending capacity order: 10 KL, 15 KL, 20 KL
    charts.sort((a, b) => {
      const order: Record<string, number> = {
        EXCEL_10KL_REFERENCE: 1,
        EXCEL_15KL_REFERENCE: 2,
        EXCEL_20KL_REFERENCE: 3,
      };
      return (order[a.templateCode] || 99) - (order[b.templateCode] || 99);
    });

    const eligibleCount = charts.filter((c) => c.eligibleForDraftImport).length;
    const engineeringReviewCount = charts.filter((c) => c.requiresEngineeringReview).length;
    const dimensionVerificationCount = charts.filter((c) => c.requiresDimensionVerification).length;
    const blockedCount = charts.filter((c) => !c.eligibleForDraftImport).length;

    return {
      workbookName: fileName,
      workbookSha256: sha256,
      totalSheets: sheetNames.length,
      identifiedChartsCount: charts.length,
      eligibleChartsCount: eligibleCount,
      engineeringReviewChartsCount: engineeringReviewCount,
      dimensionVerificationChartsCount: dimensionVerificationCount,
      blockedChartsCount: blockedCount,
      skippedNonCalibrationSheets,
      charts,
      warnings: workbookWarnings,
      errors: workbookErrors,
    };
  }

  private static scoreCandidateChart(report: ExtractedChartReport): number {
    let score = 0;
    if (report.errors.length === 0) score += 1000;
    if (report.actualPointCount === report.expectedPointCount) score += 500;
    if (Math.abs(report.maxVolumeLitres - report.expectedMaxVolumeLitres) < 0.05) score += 500;
    if (report.isMonotonic) score += 200;
    score += report.actualPointCount;
    return score;
  }

  /**
   * Classifies a worksheet as '20KL' | '15KL' | '10KL' | null without mislabeling
   * summary/auxiliary sheets that mention multiple capacities as 20KL.
   */
  private static classifyWorksheet(
    sheet: XLSX.WorkSheet,
    sheetName: string,
    totalSheetsInWorkbook: number
  ): '20KL' | '15KL' | '10KL' | null {
    const normName = sheetName.toUpperCase().replace(/\s+/g, '');

    // Ignore obvious auxiliary/note/summary tab names
    if (
      /SUMMARY|OVERVIEW|WORKING|NOTE|SUBNOTE|CALC|INDEX|README|META/i.test(sheetName) &&
      totalSheetsInWorkbook > 1
    ) {
      return null;
    }

    // 1. Check actual dip-to-volume table signature first
    const probe = this.parseDipVolumePairs(sheet, '20KL', 210);
    if (probe.points.length >= 150) {
      const maxDipCm = probe.points[probe.points.length - 1].dipCm;
      const maxVol = probe.points[probe.points.length - 1].volumeLitres;
      if (maxDipCm === 210 && maxVol >= 19000 && maxVol <= 23000) {
        return '20KL';
      }
      if (maxDipCm === 194 && maxVol >= 14000 && maxVol <= 17500) {
        return '15KL';
      }
      if (maxDipCm === 194 && maxVol >= 9500 && maxVol <= 12500) {
        return '10KL';
      }
    }

    // 2. Check explicit single-capacity sheet tab name
    const has20 = normName.includes('20KL') || normName === '20000L' || normName === '20000';
    const has15 = normName.includes('15KL') || normName === '15000L' || normName === '15000';
    const has10 = normName.includes('10KL') || normName === '10000L' || normName === '10000';
    const matchCount = [has20, has15, has10].filter(Boolean).length;

    if (matchCount === 1) {
      if (probe.points.length < 2 && totalSheetsInWorkbook > 1) {
        return null;
      }
      if (has20) return '20KL';
      if (has15) return '15KL';
      if (has10) return '10KL';
    }

    // 3. Inspect top header rows ONLY if the sheet has a calibration table AND mentions a single capacity
    if (probe.points.length >= 10) {
      const textSample = this.extractSheetTextSample(sheet);
      const textHas20 = /EXCEL_20KL_REFERENCE|\b20\s*KL\b/i.test(textSample);
      const textHas15 = /EXCEL_15KL_REFERENCE|\b15\s*KL\b/i.test(textSample);
      const textHas10 = /EXCEL_10KL_REFERENCE|\b10\s*KL\b/i.test(textSample);
      const textMatches = [textHas20, textHas15, textHas10].filter(Boolean).length;
      if (textMatches === 1) {
        if (textHas20) return '20KL';
        if (textHas15) return '15KL';
        if (textHas10) return '10KL';
      }
    }

    return null;
  }

  /**
   * Extracts text from top rows of a worksheet for classification
   */
  private static extractSheetTextSample(sheet: XLSX.WorkSheet): string {
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z30');
    const parts: string[] = [];
    const maxRow = Math.min(range.e.r, 15);
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
    let requiresDimensionVerification = false;

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
      requiresDimensionVerification = true;
      conflictingAnnotation =
        'DRAFT / DIMENSION VERIFICATION REQUIRED: Conflicting 3,750 mm length annotation in worksheet (main sheet length: 5,500 mm) requires engineering verification before approval.';
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

    // Add explicitly documented derived synthetic zero point (0 mm = 0 L)
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

    // Operational +10% capacity ceiling check:
    const maxCapacityCeiling = nominalCapacityLitres * 1.1;
    const requiresEngineeringReview = maxVolumeLitres > maxCapacityCeiling;
    const eligibleForDraftImport = errors.length === 0;

    let status: ExtractedChartReport['status'] = 'ELIGIBLE_DRAFT';
    let reviewStatusLabel = 'DRAFT / PENDING VERIFICATION';

    if (!eligibleForDraftImport) {
      status = 'BLOCKED';
      reviewStatusLabel = 'BLOCKED';
    } else if (requiresEngineeringReview) {
      status = 'DRAFT_ENGINEERING_REVIEW';
      reviewStatusLabel = 'DRAFT / ENGINEERING REVIEW REQUIRED';
      const ceilingMsg = `DRAFT / ENGINEERING REVIEW REQUIRED: Source maximum volume ${maxVolumeLitres.toFixed(
        2
      )} L exceeds the nominal-capacity +10% ceiling of ${maxCapacityCeiling.toLocaleString()} L (${maxCapacityCeiling.toFixed(
        2
      )} L, nominal ${nominalCapacityLitres.toLocaleString()} L). Retained as a DRAFT reference only; cannot be approved, assigned, activated, or used in DSR calculations until verified by an authorised engineer.`;
      warnings.push(ceilingMsg);
    } else if (requiresDimensionVerification) {
      status = 'DRAFT_DIMENSION_VERIFICATION';
      reviewStatusLabel = 'DRAFT / DIMENSION VERIFICATION REQUIRED';
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
      requiresEngineeringReview,
      requiresDimensionVerification,
      reviewStatusLabel,
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
    _chartType: '20KL' | '15KL' | '10KL',
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

    for (let c = range.s.c; c <= range.e.c; c++) {
      for (let r = range.s.r; r <= range.e.r; r++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (!cell || cell.v === undefined) continue;

        if (cell.t === 'e' || (typeof cell.v === 'string' && cell.v.startsWith('#'))) {
          continue;
        }

        const val = Number(cell.v);
        if (Number.isInteger(val) && val >= 1 && val <= expectedMaxDipCm) {
          // Verify that this cell is part of a vertical dip column (either r-1 has val-1 or r+1 has val+1, or small table)
          const prevCell = r > range.s.r ? sheet[XLSX.utils.encode_cell({ r: r - 1, c })] : undefined;
          const nextCell = r < range.e.r ? sheet[XLSX.utils.encode_cell({ r: r + 1, c })] : undefined;
          const prevVal = prevCell && prevCell.v !== undefined ? Number(prevCell.v) : NaN;
          const nextVal = nextCell && nextCell.v !== undefined ? Number(nextCell.v) : NaN;
          const isVerticalDipSequence =
            prevVal === val - 1 ||
            nextVal === val + 1 ||
            prevVal === val - 2 ||
            nextVal === val + 2;

          if (!isVerticalDipSequence) {
            continue;
          }

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
   * Imports all three calibration reference charts (or requested target codes) as DRAFT into the database.
   * - Retains already-imported DRAFT templates (15 KL, 20 KL, 10 KL) without duplicating or overwriting readings when identical.
   * - Uses narrowly scoped engineering-review reference storage for 10 KL (11,073.41 L > 11,000 L +10% ceiling).
   * - Never overwrites STANDARD_20KL or STANDARD_50KL.
   * - Never automatically approves or activates calibrations.
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
      reviewStatusLabel: string;
      requiresEngineeringReview: boolean;
      requiresDimensionVerification: boolean;
      pointsCount: number;
      maxVolumeLitres: number;
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
      if (options?.targetCodes && !options.targetCodes.includes(chart.templateCode)) {
        continue;
      }

      // 1. Strict protection: Never overwrite STANDARD_20KL or STANDARD_50KL
      if (chart.templateCode === 'STANDARD_20KL' || chart.templateCode === 'STANDARD_50KL') {
        throw new Error(
          `PROTECTED_TEMPLATE:The standard template '${chart.templateCode}' is approved and permanently protected against Excel overwrite.`
        );
      }

      // 2. If chart has data corruption / missing dips / non-monotonic errors, skip
      if (!chart.eligibleForDraftImport) {
        skippedCharts.push({
          templateCode: chart.templateCode,
          reason:
            chart.errors[0] ||
            chart.warnings[0] ||
            'Chart is blocked due to validation errors.',
        });
        continue;
      }

      const repoPoints = chart.points.map((p) => ({
        dipMillimetresMilliunits: Math.round(p.dipMm * 1000),
        volumeMilliunits: Math.round(p.volumeLitres * 1000),
      }));

      const noteDetails = [
        `Imported from Excel workbook '${extractedResult.workbookName}' (SHA-256: ${extractedResult.workbookSha256.slice(0, 16)}...).`,
        `Sheet: ${chart.sheetName}.`,
        `Status: ${chart.reviewStatusLabel}.`,
        ...chart.warnings,
      ]
        .filter(Boolean)
        .join(' ');

      const existing = await pumpRepo.findGlobalTankCalibrationTemplateByCode(chart.templateCode);

      if (existing) {
        if (existing.status !== 'DRAFT') {
          skippedCharts.push({
            templateCode: chart.templateCode,
            reason: `Template '${chart.templateCode}' exists with status '${existing.status}' and cannot be overwritten.`,
          });
          continue;
        }

        // Check if existing DRAFT already has identical readings -> retain without overwriting or duplicating
        const existingPts: Array<{ dipMillimetresMilliunits: number; volumeMilliunits: number }> =
          existing.points || [];
        const hasIdenticalReadings =
          existingPts.length === repoPoints.length &&
          existingPts.every(
            (pt, idx) =>
              pt.dipMillimetresMilliunits === repoPoints[idx].dipMillimetresMilliunits &&
              pt.volumeMilliunits === repoPoints[idx].volumeMilliunits
          );

        if (hasIdenticalReadings) {
          importedTemplates.push({
            id: existing.id,
            code: existing.code,
            name: existing.name,
            status: 'DRAFT',
            reviewStatusLabel: chart.reviewStatusLabel,
            requiresEngineeringReview: Boolean(chart.requiresEngineeringReview),
            requiresDimensionVerification: Boolean(chart.requiresDimensionVerification),
            pointsCount: existingPts.length,
            maxVolumeLitres: chart.maxVolumeLitres,
            action: 'UNCHANGED' as const,
          });
          continue;
        }

        const updated = await pumpRepo.importGlobalTankCalibrationTemplatePoints(
          existing.id,
          repoPoints,
          actor.userId,
          {
            status: 'DRAFT',
            allowOverCapacity: true,
            allowEngineeringReviewReference: Boolean(chart.requiresEngineeringReview),
            sourceFileName: extractedResult.workbookName,
            referenceDocument: `IOCL-${chart.templateCode}-EXCEL`,
            notes: noteDetails,
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
            reviewStatusLabel: chart.reviewStatusLabel,
            requiresEngineeringReview: Boolean(chart.requiresEngineeringReview),
            requiresDimensionVerification: Boolean(chart.requiresDimensionVerification),
            pointsCount: updated.pointsCount ?? repoPoints.length,
            maxVolumeLitres: chart.maxVolumeLitres,
            workbookName: extractedResult.workbookName,
            workbookSha256: extractedResult.workbookSha256,
            sheetName: chart.sheetName,
            warnings: chart.warnings,
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
          reviewStatusLabel: chart.reviewStatusLabel,
          requiresEngineeringReview: Boolean(chart.requiresEngineeringReview),
          requiresDimensionVerification: Boolean(chart.requiresDimensionVerification),
          pointsCount: updated.pointsCount ?? repoPoints.length,
          maxVolumeLitres: chart.maxVolumeLitres,
          action: 'UPDATED_DRAFT' as const,
        });
      } else {
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
            notes: noteDetails,
            createdBy: actor.userId,
            createdAt: nowIso,
            approvedBy: null,
            approvedAt: null,
            allowOverCapacity: true,
            allowEngineeringReviewReference: Boolean(chart.requiresEngineeringReview),
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
            reviewStatusLabel: chart.reviewStatusLabel,
            requiresEngineeringReview: Boolean(chart.requiresEngineeringReview),
            requiresDimensionVerification: Boolean(chart.requiresDimensionVerification),
            pointsCount: created.pointsCount ?? repoPoints.length,
            maxVolumeLitres: chart.maxVolumeLitres,
            workbookName: extractedResult.workbookName,
            workbookSha256: extractedResult.workbookSha256,
            sheetName: chart.sheetName,
            warnings: chart.warnings,
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
          reviewStatusLabel: chart.reviewStatusLabel,
          requiresEngineeringReview: Boolean(chart.requiresEngineeringReview),
          requiresDimensionVerification: Boolean(chart.requiresDimensionVerification),
          pointsCount: created.pointsCount ?? repoPoints.length,
          maxVolumeLitres: chart.maxVolumeLitres,
          action: 'CREATED' as const,
        });
      }
    }

    return { importedTemplates, skippedCharts };
  }
}
