import { DgOperationsRepository, CalculatedIntervalData } from '../repositories/dgOperationsRepository';
import { CreateDgDailyLogInput, UpdateDgDailyLogInput, DgDailyLog, DgRunIntervalInput } from '../../shared/types';
import { eq } from 'drizzle-orm';
import { equipmentAssets, retailOutlets } from '../../db/schema';

export class DgOperationsService {
  private static parseTimeToMinutes(timeStr: string): number {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeStr);
    if (!match) {
      throw new Error(`Invalid time format '${timeStr}'. Expected HH:MM`);
    }
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  static validateAndCalculateIntervals(
    intervals?: DgRunIntervalInput[]
  ): {
    calculatedIntervals: CalculatedIntervalData[];
    totalRunningMinutes: number;
    totalRunningHoursStr: string;
  } {
    if (!intervals || intervals.length === 0) {
      return {
        calculatedIntervals: [],
        totalRunningMinutes: 0,
        totalRunningHoursStr: '0:00',
      };
    }

    if (intervals.length > 8) {
      throw new Error('Maximum 8 intervals allowed');
    }

    const calculatedIntervals: CalculatedIntervalData[] = [];
    const rangesList: Array<Array<{ start: number; end: number }>> = [];

    for (let i = 0; i < intervals.length; i++) {
      const iv = intervals[i];
      const startMin = this.parseTimeToMinutes(iv.startTime);
      const endMin = this.parseTimeToMinutes(iv.endTime);

      if (endMin === startMin) {
        throw new Error(`Interval ${i + 1} duration must be greater than 0`);
      }

      let durationMinutes: number;
      const subRanges: Array<{ start: number; end: number }> = [];

      if (endMin > startMin) {
        durationMinutes = endMin - startMin;
        subRanges.push({ start: startMin, end: endMin });
      } else {
        // Overnight duration e.g. 23:30 (1410) -> 00:30 (30) = 60 min
        durationMinutes = endMin + 1440 - startMin;
        subRanges.push({ start: startMin, end: 1440 });
        subRanges.push({ start: 0, end: endMin });
      }

      if (durationMinutes <= 0) {
        throw new Error(`Interval ${i + 1} duration must be greater than 0`);
      }
      if (durationMinutes > 1440) {
        throw new Error(`Interval ${i + 1} duration cannot exceed 1440 minutes`);
      }

      // Check overlap against all previous intervals
      for (let prevIdx = 0; prevIdx < rangesList.length; prevIdx++) {
        const prevSubRanges = rangesList[prevIdx];
        for (const prevR of prevSubRanges) {
          for (const currR of subRanges) {
            const overlapStart = Math.max(prevR.start, currR.start);
            const overlapEnd = Math.min(prevR.end, currR.end);
            if (overlapStart < overlapEnd) {
              throw new Error(
                `Overlapping intervals detected between interval ${prevIdx + 1} and interval ${i + 1}`
              );
            }
          }
        }
      }

      rangesList.push(subRanges);
      calculatedIntervals.push({
        sequenceNo: iv.sequenceNo ?? i + 1,
        startTime: iv.startTime,
        endTime: iv.endTime,
        durationMinutes,
        remarks: iv.remarks ?? null,
      });
    }

    const totalRunningMinutes = calculatedIntervals.reduce(
      (sum, iv) => sum + iv.durationMinutes,
      0
    );
    const runHours = Math.floor(totalRunningMinutes / 60);
    const runMins = totalRunningMinutes % 60;
    const totalRunningHoursStr = `${runHours}:${runMins.toString().padStart(2, '0')}`;

    return {
      calculatedIntervals,
      totalRunningMinutes,
      totalRunningHoursStr,
    };
  }

  static calculateHsdAmount(
    hsdConsumedMilliunits: number,
    hsdRatePaisePerLitre: number | null | undefined
  ): {
    amountPaise: number | null;
    hsdConsumedStr: string;
    hsdRateStr: string | null;
    amountStr: string | null;
  } {
    const amountPaise =
      hsdRatePaisePerLitre != null
        ? Math.round((hsdConsumedMilliunits * hsdRatePaisePerLitre) / 1000)
        : null;
    const hsdConsumedStr = (hsdConsumedMilliunits / 1000).toFixed(3);
    const hsdRateStr =
      hsdRatePaisePerLitre != null
        ? (hsdRatePaisePerLitre / 100).toFixed(2)
        : null;
    const amountStr =
      amountPaise != null ? (amountPaise / 100).toFixed(2) : null;

    return {
      amountPaise,
      hsdConsumedStr,
      hsdRateStr,
      amountStr,
    };
  }

  static async createLog(
    db: any,
    input: CreateDgDailyLogInput,
    recordedByUserId: string
  ): Promise<DgDailyLog> {
    if (!input.outletId) {
      throw new Error('Outlet ID is required');
    }

    // 1. Verify outlet
    const outletRows = await db
      .select()
      .from(retailOutlets)
      .where(eq(retailOutlets.id, input.outletId))
      .limit(1);
    if (!outletRows || outletRows.length === 0) {
      throw new Error(`Retail outlet ${input.outletId} not found`);
    }

    // 2. Verify equipment asset
    const equipmentRows = await db
      .select()
      .from(equipmentAssets)
      .where(eq(equipmentAssets.id, input.equipmentAssetId))
      .limit(1);
    if (!equipmentRows || equipmentRows.length === 0) {
      throw new Error(`Equipment asset ${input.equipmentAssetId} not found`);
    }

    const equipment = equipmentRows[0];
    if (equipment.outletId !== input.outletId) {
      throw new Error(
        `Equipment asset ${input.equipmentAssetId} does not belong to outlet ${input.outletId}`
      );
    }

    if (equipment.equipmentType !== 'DG_SET') {
      throw new Error(
        `Equipment asset ${input.equipmentAssetId} is type ${equipment.equipmentType}, expected DG_SET`
      );
    }

    // 3. Unique check for equipment asset + business date
    const existingLog = await DgOperationsRepository.getByAssetAndDate(
      db,
      input.equipmentAssetId,
      input.businessDate
    );
    if (existingLog) {
      throw new Error(
        `DG daily log already exists for equipment ${input.equipmentAssetId} on date ${input.businessDate}`
      );
    }

    // 4. Validate meter readings
    if (
      input.meterReadingFromMilliunits != null &&
      input.meterReadingToMilliunits != null &&
      input.meterReadingToMilliunits < input.meterReadingFromMilliunits
    ) {
      throw new Error(
        'Closing meter reading cannot be less than opening meter reading'
      );
    }

    // 5. Validate and calculate intervals
    const { calculatedIntervals } = this.validateAndCalculateIntervals(
      input.intervals
    );

    // 6. Calculate HSD amount
    const hsdConsumedMilliunits = input.hsdConsumedMilliunits ?? 0;
    const { amountPaise } = this.calculateHsdAmount(
      hsdConsumedMilliunits,
      input.hsdRatePaisePerLitre
    );

    return await DgOperationsRepository.create(db, {
      outletId: input.outletId,
      equipmentAssetId: input.equipmentAssetId,
      businessDate: input.businessDate,
      meterReadingFromMilliunits: input.meterReadingFromMilliunits,
      meterReadingToMilliunits: input.meterReadingToMilliunits,
      hsdConsumedMilliunits,
      hsdRatePaisePerLitre: input.hsdRatePaisePerLitre,
      amountPaise,
      remarks: input.remarks,
      status: input.status ?? 'DRAFT',
      intervals: calculatedIntervals,
      recordedByUserId,
    });
  }

  static async getLogById(db: any, id: string): Promise<DgDailyLog | null> {
    return await DgOperationsRepository.getById(db, id);
  }

  static async getLogByBusinessDate(
    db: any,
    outletId: string,
    businessDate: string
  ): Promise<DgDailyLog | null> {
    return await DgOperationsRepository.getByOutletAndDate(db, outletId, businessDate);
  }

  static async listLogsByOutlet(
    db: any,
    outletId: string,
    options?: {
      month?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<DgDailyLog[]> {
    return await DgOperationsRepository.listByOutlet(db, outletId, options);
  }

  static async updateLog(
    db: any,
    id: string,
    input: UpdateDgDailyLogInput,
    updatedByUserId: string
  ): Promise<DgDailyLog> {
    const existing = await DgOperationsRepository.getById(db, id);
    if (!existing) {
      throw new Error(`DG daily log ${id} not found`);
    }

    const fromMilli =
      input.meterReadingFromMilliunits !== undefined
        ? input.meterReadingFromMilliunits
        : existing.meterReadingFromMilliunits;
    const toMilli =
      input.meterReadingToMilliunits !== undefined
        ? input.meterReadingToMilliunits
        : existing.meterReadingToMilliunits;

    if (fromMilli != null && toMilli != null && toMilli < fromMilli) {
      throw new Error(
        'Closing meter reading cannot be less than opening meter reading'
      );
    }

    let calculatedIntervals: CalculatedIntervalData[] | undefined;
    if (input.intervals !== undefined) {
      const calcResult = this.validateAndCalculateIntervals(input.intervals);
      calculatedIntervals = calcResult.calculatedIntervals;
    }

    const hsdConsumedMilli =
      input.hsdConsumedMilliunits !== undefined
        ? input.hsdConsumedMilliunits
        : existing.hsdConsumedMilliunits;
    const hsdRate =
      input.hsdRatePaisePerLitre !== undefined
        ? input.hsdRatePaisePerLitre
        : existing.hsdRatePaisePerLitre;

    let amountPaise: number | null | undefined;
    if (
      input.hsdConsumedMilliunits !== undefined ||
      input.hsdRatePaisePerLitre !== undefined
    ) {
      const calcAmount = this.calculateHsdAmount(hsdConsumedMilli, hsdRate);
      amountPaise = calcAmount.amountPaise;
    }

    const updated = await DgOperationsRepository.update(db, id, {
      ...input,
      amountPaise,
      intervals: calculatedIntervals,
      updatedByUserId,
    });

    if (!updated) {
      throw new Error(`Failed to update DG daily log ${id}`);
    }

    return updated;
  }

  static async getLatestForEquipment(
    db: any,
    equipmentAssetId: string
  ): Promise<DgDailyLog | null> {
    return await DgOperationsRepository.getLatestForEquipment(db, equipmentAssetId);
  }
}
