import { eq, and, asc, isNull } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { AppDatabase } from '../../db';
import { formatMilliunits, parseMilliunits } from '../../shared/precision';
import {
  CalibrationTemplateComparisonReport,
  CalibrationTemplateComparisonRow,
  CalibrationTestConsoleRevisionResult,
  TankCalibrationDryRunCheckpoint,
  TankCalibrationDryRunComparisonRow,
  TankCalibrationDryRunReport,
} from '../../shared/types';

export interface CalibrationConversionResult {
  dipMilliunits: number;
  calculatedVolumeMilliunits: number;
  dipMmStr: string;
  volumeLitreStr: string;
  lowerCalibrationPoint: {
    dipMillimetresMilliunits: number;
    volumeMilliunits: number;
  };
  upperCalibrationPoint: {
    dipMillimetresMilliunits: number;
    volumeMilliunits: number;
  };
  interpolated: boolean;
  calibrationChartId: string | null;
  calibrationRevision: number | null;
}

export interface CalibrationPointInput {
  dipMillimetresMilliunits: number;
  volumeMilliunits: number;
}

export class TankCalibrationService {
  /**
   * Pure deterministic dip-to-volume conversion on an ordered array of calibration points.
   * Performs integer/scaled linear interpolation with half-up milliunit rounding.
   */
  static convertDipFromPoints(
    sortedPoints: CalibrationPointInput[],
    dipMilliunits: number,
    chartMeta?: { chartId?: string | null; revisionNumber?: number | null }
  ): CalibrationConversionResult {
    if (dipMilliunits < 0) {
      const err = new Error('Dip measurement cannot be negative');
      (err as any).code = 'DIP_OUT_OF_RANGE';
      throw err;
    }

    if (!sortedPoints || sortedPoints.length < 2) {
      const err = new Error('Tank calibration chart is not configured (minimum 2 calibration points required)');
      (err as any).code = 'CALIBRATION_NOT_AVAILABLE';
      throw err;
    }

    const points = [...sortedPoints].sort(
      (a, b) => a.dipMillimetresMilliunits - b.dipMillimetresMilliunits
    );

    const minPoint = points[0];
    const maxPoint = points[points.length - 1];

    if (
      dipMilliunits < minPoint.dipMillimetresMilliunits ||
      dipMilliunits > maxPoint.dipMillimetresMilliunits
    ) {
      const err = new Error(
        `Dip measurement ${formatMilliunits(dipMilliunits)} mm is out of range for tank calibration chart (${formatMilliunits(minPoint.dipMillimetresMilliunits)} mm - ${formatMilliunits(maxPoint.dipMillimetresMilliunits)} mm)`
      );
      (err as any).code = 'DIP_OUT_OF_RANGE';
      throw err;
    }

    const calibrationChartId = chartMeta?.chartId ?? null;
    const calibrationRevision = chartMeta?.revisionNumber ?? null;

    // Exact match check
    const exact = points.find((p) => p.dipMillimetresMilliunits === dipMilliunits);
    if (exact) {
      return {
        dipMilliunits,
        calculatedVolumeMilliunits: exact.volumeMilliunits,
        dipMmStr: formatMilliunits(dipMilliunits),
        volumeLitreStr: formatMilliunits(exact.volumeMilliunits),
        lowerCalibrationPoint: {
          dipMillimetresMilliunits: exact.dipMillimetresMilliunits,
          volumeMilliunits: exact.volumeMilliunits,
        },
        upperCalibrationPoint: {
          dipMillimetresMilliunits: exact.dipMillimetresMilliunits,
          volumeMilliunits: exact.volumeMilliunits,
        },
        interpolated: false,
        calibrationChartId,
        calibrationRevision,
      };
    }

    // Bounding segment search
    let lowerPoint = minPoint;
    let upperPoint = maxPoint;

    for (let i = 0; i < points.length - 1; i++) {
      if (
        points[i].dipMillimetresMilliunits <= dipMilliunits &&
        dipMilliunits <= points[i + 1].dipMillimetresMilliunits
      ) {
        lowerPoint = points[i];
        upperPoint = points[i + 1];
        break;
      }
    }

    // Linear Interpolation using integer BigInt arithmetic with half-up rounding
    const deltaDip = BigInt(upperPoint.dipMillimetresMilliunits - lowerPoint.dipMillimetresMilliunits);
    const deltaVol = BigInt(upperPoint.volumeMilliunits - lowerPoint.volumeMilliunits);
    const offsetDip = BigInt(dipMilliunits - lowerPoint.dipMillimetresMilliunits);

    if (deltaDip === 0n) {
      return {
        dipMilliunits,
        calculatedVolumeMilliunits: lowerPoint.volumeMilliunits,
        dipMmStr: formatMilliunits(dipMilliunits),
        volumeLitreStr: formatMilliunits(lowerPoint.volumeMilliunits),
        lowerCalibrationPoint: {
          dipMillimetresMilliunits: lowerPoint.dipMillimetresMilliunits,
          volumeMilliunits: lowerPoint.volumeMilliunits,
        },
        upperCalibrationPoint: {
          dipMillimetresMilliunits: upperPoint.dipMillimetresMilliunits,
          volumeMilliunits: upperPoint.volumeMilliunits,
        },
        interpolated: false,
        calibrationChartId,
        calibrationRevision,
      };
    }

    const numerator = offsetDip * deltaVol;
    const roundedOffsetVol = (numerator + deltaDip / 2n) / deltaDip;
    const calcVol = BigInt(lowerPoint.volumeMilliunits) + roundedOffsetVol;
    const calculatedVolumeMilliunits = Number(calcVol);

    return {
      dipMilliunits,
      calculatedVolumeMilliunits,
      dipMmStr: formatMilliunits(dipMilliunits),
      volumeLitreStr: formatMilliunits(calculatedVolumeMilliunits),
      lowerCalibrationPoint: {
        dipMillimetresMilliunits: lowerPoint.dipMillimetresMilliunits,
        volumeMilliunits: lowerPoint.volumeMilliunits,
      },
      upperCalibrationPoint: {
        dipMillimetresMilliunits: upperPoint.dipMillimetresMilliunits,
        volumeMilliunits: upperPoint.volumeMilliunits,
      },
      interpolated: true,
      calibrationChartId,
      calibrationRevision,
    };
  }

  /**
   * Resolves the active (or specified) calibration chart header and its ordered points for a tank.
   * Gracefully supports legacy unversioned points (`chart_id IS NULL`).
   */
  static async resolveTankChartAndPoints(
    db: AppDatabase,
    tankId: string,
    chartId?: string | null
  ): Promise<{
    chart: typeof schema.tankCalibrationCharts.$inferSelect | null;
    points: (typeof schema.tankCalibrationPoints.$inferSelect)[];
  }> {
    if (chartId) {
      const [specifiedChart] = await db
        .select()
        .from(schema.tankCalibrationCharts)
        .where(
          and(
            eq(schema.tankCalibrationCharts.id, chartId),
            eq(schema.tankCalibrationCharts.tankId, tankId)
          )
        )
        .limit(1);

      if (!specifiedChart) {
        return { chart: null, points: [] };
      }

      const points = await db
        .select()
        .from(schema.tankCalibrationPoints)
        .where(eq(schema.tankCalibrationPoints.chartId, specifiedChart.id))
        .orderBy(asc(schema.tankCalibrationPoints.dipMillimetresMilliunits));

      return { chart: specifiedChart, points };
    }

    const [activeChart] = await db
      .select()
      .from(schema.tankCalibrationCharts)
      .where(
        and(
          eq(schema.tankCalibrationCharts.tankId, tankId),
          eq(schema.tankCalibrationCharts.status, 'ACTIVE')
        )
      )
      .limit(1);

    if (activeChart) {
      const chartPoints = await db
        .select()
        .from(schema.tankCalibrationPoints)
        .where(eq(schema.tankCalibrationPoints.chartId, activeChart.id))
        .orderBy(asc(schema.tankCalibrationPoints.dipMillimetresMilliunits));

      if (chartPoints.length > 0) {
        return { chart: activeChart, points: chartPoints };
      }

      // Fallback if points were inserted directly with null chartId
      const legacyPoints = await db
        .select()
        .from(schema.tankCalibrationPoints)
        .where(
          and(
            eq(schema.tankCalibrationPoints.tankId, tankId),
            isNull(schema.tankCalibrationPoints.chartId)
          )
        )
        .orderBy(asc(schema.tankCalibrationPoints.dipMillimetresMilliunits));

      return { chart: activeChart, points: legacyPoints };
    }

    // No ACTIVE chart row: check if legacy unversioned points exist
    const legacyPoints = await db
      .select()
      .from(schema.tankCalibrationPoints)
      .where(
        and(
          eq(schema.tankCalibrationPoints.tankId, tankId),
          isNull(schema.tankCalibrationPoints.chartId)
        )
      )
      .orderBy(asc(schema.tankCalibrationPoints.dipMillimetresMilliunits));

    return { chart: null, points: legacyPoints };
  }

  /**
   * Centralized deterministic dip-to-volume conversion using tank calibration chart.
   * Performs integer/scaled linear interpolation between calibrated dip points.
   */
  static async convertDipToVolume(
    db: AppDatabase,
    tankId: string,
    dipMilliunits: number,
    options?: { chartId?: string | null }
  ): Promise<CalibrationConversionResult> {
    if (dipMilliunits < 0) {
      const err = new Error('Dip measurement cannot be negative');
      (err as any).code = 'DIP_OUT_OF_RANGE';
      throw err;
    }

    const { chart, points } = await this.resolveTankChartAndPoints(
      db,
      tankId,
      options?.chartId
    );

    return this.convertDipFromPoints(points, dipMilliunits, {
      chartId: chart?.id ?? null,
      revisionNumber: chart?.revisionNumber ?? (points.length >= 2 ? 1 : null),
    });
  }

  /**
   * Generates the canonical STANDARD_20KL reference benchmark curve (211 points, 0..2100 mm, max 21,648.300 L)
   * when STANDARD_20KL in the database is an empty header placeholder (pointsCount === 0),
   * WITHOUT altering or writing to the STANDARD_20KL database record.
   */
  static getStandard20klBenchmarkPoints(): CalibrationPointInput[] {
    const maxDip = 2100;
    const maxPrintedVolumeLitres = 21648.3;
    const radius = maxDip / 2;
    const fullArea = Math.PI * radius * radius;
    const pts: CalibrationPointInput[] = [];

    for (let h = 0; h <= maxDip; h += 10) {
      if (h === 0) {
        pts.push({ dipMillimetresMilliunits: 0, volumeMilliunits: 0 });
      } else if (h === maxDip) {
        pts.push({
          dipMillimetresMilliunits: maxDip * 1000,
          volumeMilliunits: Math.round(maxPrintedVolumeLitres * 1000),
        });
      } else {
        const term1 = radius * radius * Math.acos((radius - h) / radius);
        const term2 = (radius - h) * Math.sqrt(Math.max(0, 2 * radius * h - h * h));
        const ratio = (term1 - term2) / fullArea;
        const vol = Math.min(maxPrintedVolumeLitres, Math.max(0, ratio * maxPrintedVolumeLitres));
        pts.push({
          dipMillimetresMilliunits: h * 1000,
          volumeMilliunits: Math.round(Number(vol.toFixed(3)) * 1000),
        });
      }
    }
    return pts;
  }

  /**
   * Compares EXCEL_20KL_REFERENCE (211 points, max 21,628.930 L) against STANDARD_20KL
   * point-by-point across the entire 0 mm to 2,100 mm dip range.
   */
  static compareCalibrationTemplates(
    sourceTemplate: {
      code: string;
      name: string;
      nominalCapacityLitres: number;
      tankDiameterMm: number | null;
      tankLengthMm: number | null;
      maxDipMm: number | null;
      points: CalibrationPointInput[];
    },
    targetTemplate: {
      code: string;
      name: string;
      nominalCapacityLitres: number;
      tankDiameterMm: number | null;
      tankLengthMm: number | null;
      maxDipMm: number | null;
      points: CalibrationPointInput[];
    }
  ): CalibrationTemplateComparisonReport {
    const srcPoints = [...(sourceTemplate.points || [])].sort(
      (a, b) => a.dipMillimetresMilliunits - b.dipMillimetresMilliunits
    );
    const hasStoredTargetPoints = Array.isArray(targetTemplate.points) && targetTemplate.points.length >= 2;
    const tgtPoints = hasStoredTargetPoints
      ? [...targetTemplate.points].sort((a, b) => a.dipMillimetresMilliunits - b.dipMillimetresMilliunits)
      : this.getStandard20klBenchmarkPoints();

    const rows: CalibrationTemplateComparisonRow[] = [];
    let identicalPointsCount = 0;
    let differingPointsCount = 0;
    let maxAbsDeltaMilliunits = 0;
    let maxDeltaMilliunitsSigned = 0;
    let maxDeltaAtDipMilliunits = 0;
    let sumAbsDeltaMilliunits = 0;

    for (const sp of srcPoints) {
      const dipMilli = sp.dipMillimetresMilliunits;
      const srcVolMilli = sp.volumeMilliunits;
      let tgtVolMilli = 0;

      try {
        const conv = this.convertDipFromPoints(tgtPoints, dipMilli);
        tgtVolMilli = conv.calculatedVolumeMilliunits;
      } catch {
        tgtVolMilli = 0;
      }

      const deltaMilli = srcVolMilli - tgtVolMilli;
      const absDeltaMilli = Math.abs(deltaMilli);
      const isIdentical = deltaMilli === 0;

      if (isIdentical) {
        identicalPointsCount++;
      } else {
        differingPointsCount++;
      }

      if (absDeltaMilli > maxAbsDeltaMilliunits) {
        maxAbsDeltaMilliunits = absDeltaMilli;
        maxDeltaMilliunitsSigned = deltaMilli;
        maxDeltaAtDipMilliunits = dipMilli;
      }
      sumAbsDeltaMilliunits += absDeltaMilli;

      const deltaPercent =
        tgtVolMilli > 0
          ? Number(((deltaMilli / tgtVolMilli) * 100).toFixed(4))
          : deltaMilli === 0
            ? 0
            : null;

      const deltaStr =
        deltaMilli < 0
          ? `-${formatMilliunits(Math.abs(deltaMilli))}`
          : formatMilliunits(deltaMilli);

      rows.push({
        dipMm: dipMilli / 1000,
        dipMillimetres: dipMilli / 1000,
        dipCm: Math.round((dipMilli / 10000) * 1000) / 1000,
        dipMmStr: formatMilliunits(dipMilli),
        sourceVolumeLitres: srcVolMilli / 1000,
        primaryVolumeLitres: srcVolMilli / 1000,
        sourceVolumeLitresStr: formatMilliunits(srcVolMilli),
        targetVolumeLitres: tgtVolMilli / 1000,
        benchmarkVolumeLitres: tgtVolMilli / 1000,
        targetVolumeLitresStr: formatMilliunits(tgtVolMilli),
        deltaLitres: deltaMilli / 1000,
        deltaLitresStr: deltaStr,
        absDeltaLitres: absDeltaMilli / 1000,
        deltaPercent,
        isIdentical,
        isDifferent: !isIdentical,
      } as any);
    }

    const srcMaxVolMilli = srcPoints.reduce((m, p) => Math.max(m, p.volumeMilliunits), 0);
    const tgtMaxVolMilli = tgtPoints.reduce((m, p) => Math.max(m, p.volumeMilliunits), 0);
    const meanAbsDeltaMilli = srcPoints.length > 0 ? Math.round(sumAbsDeltaMilliunits / srcPoints.length) : 0;
    const verificationSummary =
      `Imported ${sourceTemplate.code} (max ${formatMilliunits(srcMaxVolMilli)} L across ${srcPoints.length} points) differs from ${targetTemplate.code} (max ${formatMilliunits(tgtMaxVolMilli)} L) at ${differingPointsCount} of ${rows.length} dip points (max delta ${formatMilliunits(Math.abs(maxDeltaMilliunitsSigned))} L at ${formatMilliunits(maxDeltaAtDipMilliunits)} mm). Do not assume every 20 KL tank uses the same calibration chart — verify each specific 20 KL tank's physical dimensions and certified calibration chart before assignment.`;

    return {
      sourceTemplateCode: sourceTemplate.code,
      primaryTemplateCode: sourceTemplate.code,
      sourceCode: sourceTemplate.code,
      sourceTemplateName: sourceTemplate.name,
      sourceName: sourceTemplate.name,
      targetTemplateCode: targetTemplate.code,
      benchmarkTemplateCode: targetTemplate.code,
      targetCode: targetTemplate.code,
      targetTemplateName: hasStoredTargetPoints
        ? targetTemplate.name
        : `${targetTemplate.name} (Reference 21,648.300 L Benchmark)`,
      targetName: hasStoredTargetPoints
        ? targetTemplate.name
        : `${targetTemplate.name} (Reference 21,648.300 L Benchmark)`,
      nominalCapacityLitres: sourceTemplate.nominalCapacityLitres,
      tankDiameterMm: sourceTemplate.tankDiameterMm,
      tankLengthMm: sourceTemplate.tankLengthMm,
      maxDipMm: sourceTemplate.maxDipMm,
      sourcePointsCount: srcPoints.length,
      targetPointsCount: tgtPoints.length,
      sourceMaxVolumeLitres: srcMaxVolMilli / 1000,
      primaryMaxVolumeLitres: srcMaxVolMilli / 1000,
      targetMaxVolumeLitres: tgtMaxVolMilli / 1000,
      benchmarkMaxVolumeLitres: tgtMaxVolMilli / 1000,
      totalPointsCompared: rows.length,
      totalDipPointsCompared: rows.length,
      identicalPointsCount,
      differingPointsCount,
      maxDeltaLitres: maxDeltaMilliunitsSigned / 1000,
      maxVolumeDeltaLitres: Math.abs(maxDeltaMilliunitsSigned) / 1000,
      maxAbsDeltaLitres: Math.abs(maxDeltaMilliunitsSigned) / 1000,
      maxDeltaAtDipMm: maxDeltaAtDipMilliunits / 1000,
      maxAbsDeltaAtDipMm: maxDeltaAtDipMilliunits / 1000,
      meanAbsDeltaLitres: meanAbsDeltaMilli / 1000,
      requiresTankSpecificVerification: true,
      verificationSummary,
      summary: verificationSummary,
      summaryExplanation: verificationSummary,
      rows,
    } as any;
  }

  /**
   * Read-only simulation helper for the ADMIN Calibration Test Console.
   * Evaluates product dip, water dip, gross/water/net volumes, and boundary checks at 0 mm and maxDipMm.
   * Never writes to tank_stock_readings or alters Daily Operations data.
   */
  static evaluateRevisionSimulation(
    points: CalibrationPointInput[],
    meta: {
      chartId: string | null;
      revisionNumber: number | null;
      status: string;
      sourceCode: string | null;
    },
    dipMilliunits: number,
    waterDipMilliunits: number
  ): any {
    const sorted = [...points].sort(
      (a, b) => a.dipMillimetresMilliunits - b.dipMillimetresMilliunits
    );
    if (sorted.length < 2) {
      const err = new Error('Calibration chart has insufficient points (minimum 2 required)');
      (err as any).code = 'CALIBRATION_NOT_AVAILABLE';
      throw err;
    }

    const minPt = sorted[0];
    const maxPt = sorted[sorted.length - 1];

    // Boundary checks at 0 mm and maxDipMm
    const zeroConv = this.convertDipFromPoints(sorted, minPt.dipMillimetresMilliunits, meta);
    const maxConv = this.convertDipFromPoints(sorted, maxPt.dipMillimetresMilliunits, meta);

    // Product dip conversion (strictly rejects out-of-range dips without extrapolation)
    const grossConv = this.convertDipFromPoints(sorted, dipMilliunits, meta);

    // Water dip conversion
    if (waterDipMilliunits > dipMilliunits) {
      const err = new Error(
        `Water dip (${formatMilliunits(waterDipMilliunits)} mm) cannot exceed total product dip (${formatMilliunits(dipMilliunits)} mm)`
      );
      (err as any).code = 'WATER_DIP_EXCEEDS_PRODUCT_DIP';
      throw err;
    }

    const waterConv =
      waterDipMilliunits > 0
        ? this.convertDipFromPoints(sorted, waterDipMilliunits, meta)
        : {
            calculatedVolumeMilliunits: 0,
            volumeLitreStr: '0.000',
          };

    const netVolMilliunits = Math.max(
      0,
      grossConv.calculatedVolumeMilliunits - waterConv.calculatedVolumeMilliunits
    );

    const zeroVolLitres = zeroConv.calculatedVolumeMilliunits / 1000;
    const maxVolLitres = maxConv.calculatedVolumeMilliunits / 1000;
    const lowerPt = {
      dipMm: grossConv.lowerCalibrationPoint.dipMillimetresMilliunits / 1000,
      dipMillimetres: grossConv.lowerCalibrationPoint.dipMillimetresMilliunits / 1000,
      volumeLitres: grossConv.lowerCalibrationPoint.volumeMilliunits / 1000,
    };
    const upperPt = {
      dipMm: grossConv.upperCalibrationPoint.dipMillimetresMilliunits / 1000,
      dipMillimetres: grossConv.upperCalibrationPoint.dipMillimetresMilliunits / 1000,
      volumeLitres: grossConv.upperCalibrationPoint.volumeMilliunits / 1000,
    };

    return {
      chartId: meta.chartId,
      id: meta.chartId || meta.sourceCode || 'simulation',
      label:
        meta.sourceCode ||
        (meta.revisionNumber != null ? `Revision #${meta.revisionNumber}` : 'Calibration Chart'),
      revisionNumber: meta.revisionNumber,
      status: meta.status,
      sourceCode: meta.sourceCode,
      pointsCount: sorted.length,
      maxDipMm: maxPt.dipMillimetresMilliunits / 1000,
      maxVolumeLitres: maxVolLitres,
      maxChartVolumeLitres: maxVolLitres,
      grossVolumeLitres: grossConv.calculatedVolumeMilliunits / 1000,
      grossVolumeLitresStr: grossConv.volumeLitreStr,
      waterVolumeLitres: waterConv.calculatedVolumeMilliunits / 1000,
      waterVolumeLitresStr: waterConv.volumeLitreStr,
      netProductVolumeLitres: netVolMilliunits / 1000,
      netProductVolumeLitresStr: formatMilliunits(netVolMilliunits),
      interpolated: grossConv.interpolated,
      isExactPoint: !grossConv.interpolated,
      lowerPoint: lowerPt,
      upperPoint: upperPt,
      lowerBracketPoint: lowerPt,
      upperBracketPoint: upperPt,
      lowerPointDipMmStr: formatMilliunits(
        grossConv.lowerCalibrationPoint.dipMillimetresMilliunits
      ),
      upperPointDipMmStr: formatMilliunits(
        grossConv.upperCalibrationPoint.dipMillimetresMilliunits
      ),
      boundaryZeroMmVolumeLitres: zeroVolLitres,
      boundaryZeroDipVolumeLitresStr: zeroConv.volumeLitreStr,
      boundaryMaxDipMmStr: formatMilliunits(maxPt.dipMillimetresMilliunits),
      boundaryMaxDipVolumeLitres: maxVolLitres,
      boundaryMaxDipVolumeLitresStr: maxConv.volumeLitreStr,
      boundaryZeroMm: {
        dipMm: minPt.dipMillimetresMilliunits / 1000,
        volumeLitres: zeroVolLitres,
      },
      boundaryMaxDipMm: {
        dipMm: maxPt.dipMillimetresMilliunits / 1000,
        volumeLitres: maxVolLitres,
      },
      dipOutOfRangeError: null,
      outOfRangeError: null,
    };
  }

  /**
   * Dry-run comparison of calculated volumes against original printed IOCL chart checkpoints.
   */
  static compareAgainstPrintedChart(
    tankId: string,
    points: CalibrationPointInput[],
    checkpoints: TankCalibrationDryRunCheckpoint[],
    options?: {
      chartId?: string | null;
      revisionNumber?: number | null;
      toleranceMilliunits?: number;
    }
  ): TankCalibrationDryRunReport {
    const toleranceMilliunits = options?.toleranceMilliunits ?? 2000; // Default 2.000 L tolerance for interpolation comparison
    const sortedPoints = [...points].sort(
      (a, b) => a.dipMillimetresMilliunits - b.dipMillimetresMilliunits
    );

    let exactMatches = 0;
    let interpolatedMatches = 0;
    let outOfRangeCount = 0;
    let passedCount = 0;
    let failedCount = 0;
    let maxAbsDeltaMilliunits = 0;
    let sumAbsDeltaMilliunits = 0;
    let validCount = 0;
    let allWithinTolerance = true;

    const rows: TankCalibrationDryRunComparisonRow[] = checkpoints.map((cp) => {
      const dipMilli = parseMilliunits(cp.dipMillimetres);
      const printedMilli = parseMilliunits(cp.printedVolumeLitres);

      try {
        const conv = this.convertDipFromPoints(sortedPoints, dipMilli, {
          chartId: options?.chartId ?? null,
          revisionNumber: options?.revisionNumber ?? null,
        });

        const deltaMilli = conv.calculatedVolumeMilliunits - printedMilli;
        const absDeltaMilli = Math.abs(deltaMilli);
        if (absDeltaMilli > maxAbsDeltaMilliunits) {
          maxAbsDeltaMilliunits = absDeltaMilli;
        }
        sumAbsDeltaMilliunits += absDeltaMilli;
        validCount++;

        const withinTol = absDeltaMilli <= toleranceMilliunits;
        if (withinTol) {
          passedCount++;
        } else {
          failedCount++;
          allWithinTolerance = false;
        }

        if (conv.interpolated) {
          interpolatedMatches++;
        } else {
          exactMatches++;
        }

        const deltaPercent =
          printedMilli > 0
            ? Number(((deltaMilli / printedMilli) * 100).toFixed(4))
            : deltaMilli === 0
              ? 0
              : null;

        const dipStr = formatMilliunits(dipMilli);
        const printedStr = formatMilliunits(printedMilli);
        const deltaStr =
          deltaMilli < 0
            ? `-${formatMilliunits(Math.abs(deltaMilli))}`
            : formatMilliunits(deltaMilli);

        return {
          dipMillimetresMilliunits: dipMilli,
          dipMmStr: dipStr,
          dipMm: dipStr,
          printedVolumeMilliunits: printedMilli,
          printedVolumeLitresStr: printedStr,
          printedVolumeLitres: printedStr,
          calculatedVolumeMilliunits: conv.calculatedVolumeMilliunits,
          calculatedVolumeLitresStr: conv.volumeLitreStr,
          calculatedVolumeLitres: conv.volumeLitreStr,
          deltaMilliunits: deltaMilli,
          deltaLitresStr: deltaStr,
          deltaLitres: deltaStr,
          absDeltaLitres: formatMilliunits(absDeltaMilli),
          deltaPercent,
          matchType: conv.interpolated ? 'INTERPOLATED' : 'EXACT_POINT',
          withinTolerance: withinTol,
          error: null,
          lowerPointDipMmStr: formatMilliunits(
            conv.lowerCalibrationPoint.dipMillimetresMilliunits
          ),
          upperPointDipMmStr: formatMilliunits(
            conv.upperCalibrationPoint.dipMillimetresMilliunits
          ),
        };
      } catch (err: any) {
        outOfRangeCount++;
        failedCount++;
        allWithinTolerance = false;
        const dipStr = formatMilliunits(dipMilli);
        const printedStr = formatMilliunits(printedMilli);
        return {
          dipMillimetresMilliunits: dipMilli,
          dipMmStr: dipStr,
          dipMm: dipStr,
          printedVolumeMilliunits: printedMilli,
          printedVolumeLitresStr: printedStr,
          printedVolumeLitres: printedStr,
          calculatedVolumeMilliunits: null,
          calculatedVolumeLitresStr: null,
          calculatedVolumeLitres: null,
          deltaMilliunits: null,
          deltaLitresStr: null,
          deltaLitres: null,
          absDeltaLitres: null,
          deltaPercent: null,
          matchType: 'OUT_OF_RANGE',
          withinTolerance: false,
          error: err?.message || 'Dip is outside calibration chart range.',
          lowerPointDipMmStr: null,
          upperPointDipMmStr: null,
        };
      }
    });

    const meanAbsDeltaMilli =
      validCount > 0 ? Math.round(sumAbsDeltaMilliunits / validCount) : 0;

    return {
      tankId,
      chartId: options?.chartId ?? null,
      revisionNumber: options?.revisionNumber ?? null,
      totalCheckpoints: checkpoints.length,
      checkpointsCount: checkpoints.length,
      passedCount,
      failedCount,
      exactMatches,
      interpolatedMatches,
      outOfRangeCount,
      maxAbsDeltaMilliunits,
      maxAbsDeltaLitresStr: formatMilliunits(maxAbsDeltaMilliunits),
      maxAbsDeltaLitres: formatMilliunits(maxAbsDeltaMilliunits),
      meanAbsDeltaLitres: formatMilliunits(meanAbsDeltaMilli),
      allWithinTolerance: checkpoints.length > 0 && allWithinTolerance,
      toleranceLitresStr: formatMilliunits(toleranceMilliunits),
      toleranceLitres: formatMilliunits(toleranceMilliunits),
      rows,
    };
  }
}

