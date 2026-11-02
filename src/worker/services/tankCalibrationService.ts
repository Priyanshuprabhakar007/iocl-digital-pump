import { eq, and, asc, isNull } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { AppDatabase } from '../../db';
import { formatMilliunits, parseMilliunits } from '../../shared/precision';
import {
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

