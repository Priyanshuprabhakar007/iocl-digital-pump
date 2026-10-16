import { eq, and, gte, lte, desc, asc, inArray } from 'drizzle-orm';
import { dgDailyLogs, dgRunIntervals, retailOutlets, equipmentAssets, users } from '../../db/schema';
import {
  DgDailyLog,
  DgRunInterval,
  CreateDgDailyLogInput,
  UpdateDgDailyLogInput,
} from '../../shared/types';

export interface CalculatedIntervalData {
  sequenceNo: number;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  remarks?: string | null;
}

export class DgOperationsRepository {
  private static formatLogWithIntervals(
    logRow: any,
    intervals: DgRunInterval[]
  ): DgDailyLog {
    const totalRunningMinutes = intervals.reduce(
      (sum, iv) => sum + (iv.durationMinutes || 0),
      0
    );
    const runHours = Math.floor(totalRunningMinutes / 60);
    const runMins = totalRunningMinutes % 60;
    const totalRunningHoursStr = `${runHours}:${runMins.toString().padStart(2, '0')}`;

    const hsdConsumedMilliunits = logRow.hsdConsumedMilliunits ?? 0;
    const hsdConsumedStr = (hsdConsumedMilliunits / 1000).toFixed(3);
    const hsdRateStr =
      logRow.hsdRatePaisePerLitre != null
        ? (logRow.hsdRatePaisePerLitre / 100).toFixed(2)
        : null;
    const amountStr =
      logRow.amountPaise != null
        ? (logRow.amountPaise / 100).toFixed(2)
        : null;

    return {
      id: logRow.id,
      outletId: logRow.outletId,
      equipmentAssetId: logRow.equipmentAssetId,
      businessDate: logRow.businessDate,
      meterReadingFromMilliunits: logRow.meterReadingFromMilliunits ?? null,
      meterReadingToMilliunits: logRow.meterReadingToMilliunits ?? null,
      hsdConsumedMilliunits,
      hsdRatePaisePerLitre: logRow.hsdRatePaisePerLitre ?? null,
      amountPaise: logRow.amountPaise ?? null,
      remarks: logRow.remarks ?? null,
      status: logRow.status as 'DRAFT' | 'FINAL',
      recordedByUserId: logRow.recordedByUserId,
      updatedByUserId: logRow.updatedByUserId,
      createdAt: logRow.createdAt,
      updatedAt: logRow.updatedAt,
      intervals,
      totalRunningMinutes,
      totalRunningHoursStr,
      hsdConsumedStr,
      hsdRateStr,
      amountStr,
      equipmentName: logRow.equipmentName ?? undefined,
      equipmentCode: logRow.equipmentCode ?? undefined,
      outletName: logRow.outletName ?? undefined,
      recordedByName: logRow.recordedByName ?? undefined,
    };
  }

  static async create(
    db: any,
    params: {
      outletId: string;
      equipmentAssetId: string;
      businessDate: string;
      meterReadingFromMilliunits?: number | null;
      meterReadingToMilliunits?: number | null;
      hsdConsumedMilliunits?: number;
      hsdRatePaisePerLitre?: number | null;
      amountPaise?: number | null;
      remarks?: string | null;
      status?: 'DRAFT' | 'FINAL';
      intervals?: CalculatedIntervalData[];
      recordedByUserId: string;
    }
  ): Promise<DgDailyLog> {
    const id = `dgl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const insertLogRow = {
      id,
      outletId: params.outletId,
      equipmentAssetId: params.equipmentAssetId,
      businessDate: params.businessDate,
      meterReadingFromMilliunits: params.meterReadingFromMilliunits ?? null,
      meterReadingToMilliunits: params.meterReadingToMilliunits ?? null,
      hsdConsumedMilliunits: params.hsdConsumedMilliunits ?? 0,
      hsdRatePaisePerLitre: params.hsdRatePaisePerLitre ?? null,
      amountPaise: params.amountPaise ?? null,
      remarks: params.remarks ?? null,
      status: params.status ?? 'DRAFT',
      recordedByUserId: params.recordedByUserId,
      updatedByUserId: params.recordedByUserId,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(dgDailyLogs).values(insertLogRow);

    if (params.intervals && params.intervals.length > 0) {
      const intervalRows = params.intervals.map((iv, idx) => ({
        id: `dgri_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
        dgDailyLogId: id,
        sequenceNo: iv.sequenceNo ?? idx + 1,
        startTime: iv.startTime,
        endTime: iv.endTime,
        durationMinutes: iv.durationMinutes,
        remarks: iv.remarks ?? null,
        createdAt: now,
      }));
      await db.insert(dgRunIntervals).values(intervalRows);
    }

    return (await this.getById(db, id))!;
  }

  static async getById(db: any, id: string): Promise<DgDailyLog | null> {
    const rows = await db
      .select({
        id: dgDailyLogs.id,
        outletId: dgDailyLogs.outletId,
        equipmentAssetId: dgDailyLogs.equipmentAssetId,
        businessDate: dgDailyLogs.businessDate,
        meterReadingFromMilliunits: dgDailyLogs.meterReadingFromMilliunits,
        meterReadingToMilliunits: dgDailyLogs.meterReadingToMilliunits,
        hsdConsumedMilliunits: dgDailyLogs.hsdConsumedMilliunits,
        hsdRatePaisePerLitre: dgDailyLogs.hsdRatePaisePerLitre,
        amountPaise: dgDailyLogs.amountPaise,
        remarks: dgDailyLogs.remarks,
        status: dgDailyLogs.status,
        recordedByUserId: dgDailyLogs.recordedByUserId,
        updatedByUserId: dgDailyLogs.updatedByUserId,
        createdAt: dgDailyLogs.createdAt,
        updatedAt: dgDailyLogs.updatedAt,
        outletName: retailOutlets.name,
        equipmentName: equipmentAssets.name,
        equipmentCode: equipmentAssets.assetCode,
        recordedByName: users.name,
      })
      .from(dgDailyLogs)
      .leftJoin(retailOutlets, eq(dgDailyLogs.outletId, retailOutlets.id))
      .leftJoin(equipmentAssets, eq(dgDailyLogs.equipmentAssetId, equipmentAssets.id))
      .leftJoin(users, eq(dgDailyLogs.recordedByUserId, users.id))
      .where(eq(dgDailyLogs.id, id));

    if (!rows || rows.length === 0) return null;

    const intervalRows = await db
      .select()
      .from(dgRunIntervals)
      .where(eq(dgRunIntervals.dgDailyLogId, id))
      .orderBy(asc(dgRunIntervals.sequenceNo));

    return this.formatLogWithIntervals(rows[0], intervalRows);
  }

  static async getByAssetAndDate(
    db: any,
    equipmentAssetId: string,
    businessDate: string
  ): Promise<DgDailyLog | null> {
    const rows = await db
      .select({ id: dgDailyLogs.id })
      .from(dgDailyLogs)
      .where(
        and(
          eq(dgDailyLogs.equipmentAssetId, equipmentAssetId),
          eq(dgDailyLogs.businessDate, businessDate)
        )
      )
      .limit(1);

    if (!rows || rows.length === 0) return null;
    return this.getById(db, rows[0].id);
  }

  static async getByOutletAndDate(
    db: any,
    outletId: string,
    businessDate: string
  ): Promise<DgDailyLog | null> {
    const rows = await db
      .select({ id: dgDailyLogs.id })
      .from(dgDailyLogs)
      .where(
        and(
          eq(dgDailyLogs.outletId, outletId),
          eq(dgDailyLogs.businessDate, businessDate)
        )
      )
      .limit(1);

    if (!rows || rows.length === 0) return null;
    return this.getById(db, rows[0].id);
  }

  static async listByOutlet(
    db: any,
    outletId: string,
    options?: {
      month?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<DgDailyLog[]> {
    const conditions = [eq(dgDailyLogs.outletId, outletId)];

    if (options?.month) {
      const monthStart = `${options.month}-01`;
      const [yearStr, monthStr] = options.month.split('-');
      const y = parseInt(yearStr, 10);
      const m = parseInt(monthStr, 10);
      const lastDay = new Date(y, m, 0).getDate();
      const monthEnd = `${options.month}-${lastDay.toString().padStart(2, '0')}`;
      conditions.push(gte(dgDailyLogs.businessDate, monthStart));
      conditions.push(lte(dgDailyLogs.businessDate, monthEnd));
    } else {
      if (options?.startDate) conditions.push(gte(dgDailyLogs.businessDate, options.startDate));
      if (options?.endDate) conditions.push(lte(dgDailyLogs.businessDate, options.endDate));
    }

    const logRows = await db
      .select({
        id: dgDailyLogs.id,
        outletId: dgDailyLogs.outletId,
        equipmentAssetId: dgDailyLogs.equipmentAssetId,
        businessDate: dgDailyLogs.businessDate,
        meterReadingFromMilliunits: dgDailyLogs.meterReadingFromMilliunits,
        meterReadingToMilliunits: dgDailyLogs.meterReadingToMilliunits,
        hsdConsumedMilliunits: dgDailyLogs.hsdConsumedMilliunits,
        hsdRatePaisePerLitre: dgDailyLogs.hsdRatePaisePerLitre,
        amountPaise: dgDailyLogs.amountPaise,
        remarks: dgDailyLogs.remarks,
        status: dgDailyLogs.status,
        recordedByUserId: dgDailyLogs.recordedByUserId,
        updatedByUserId: dgDailyLogs.updatedByUserId,
        createdAt: dgDailyLogs.createdAt,
        updatedAt: dgDailyLogs.updatedAt,
        outletName: retailOutlets.name,
        equipmentName: equipmentAssets.name,
        equipmentCode: equipmentAssets.assetCode,
        recordedByName: users.name,
      })
      .from(dgDailyLogs)
      .leftJoin(retailOutlets, eq(dgDailyLogs.outletId, retailOutlets.id))
      .leftJoin(equipmentAssets, eq(dgDailyLogs.equipmentAssetId, equipmentAssets.id))
      .leftJoin(users, eq(dgDailyLogs.recordedByUserId, users.id))
      .where(and(...conditions))
      .orderBy(desc(dgDailyLogs.businessDate));

    if (logRows.length === 0) return [];

    const logIds = logRows.map((r: any) => r.id);
    const allIntervals = await db
      .select()
      .from(dgRunIntervals)
      .where(inArray(dgRunIntervals.dgDailyLogId, logIds))
      .orderBy(asc(dgRunIntervals.sequenceNo));

    const intervalMap = new Map<string, DgRunInterval[]>();
    for (const iv of allIntervals) {
      const list = intervalMap.get(iv.dgDailyLogId) || [];
      list.push(iv);
      intervalMap.set(iv.dgDailyLogId, list);
    }

    return logRows.map((r: any) =>
      this.formatLogWithIntervals(r, intervalMap.get(r.id) || [])
    );
  }

  static async update(
    db: any,
    id: string,
    params: {
      equipmentAssetId?: string;
      meterReadingFromMilliunits?: number | null;
      meterReadingToMilliunits?: number | null;
      hsdConsumedMilliunits?: number;
      hsdRatePaisePerLitre?: number | null;
      amountPaise?: number | null;
      remarks?: string | null;
      status?: 'DRAFT' | 'FINAL';
      intervals?: CalculatedIntervalData[];
      updatedByUserId: string;
    }
  ): Promise<DgDailyLog | null> {
    const existing = await this.getById(db, id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updateValues: Record<string, any> = {
      updatedByUserId: params.updatedByUserId,
      updatedAt: now,
    };

    if (params.equipmentAssetId !== undefined) updateValues.equipmentAssetId = params.equipmentAssetId;
    if (params.meterReadingFromMilliunits !== undefined) updateValues.meterReadingFromMilliunits = params.meterReadingFromMilliunits;
    if (params.meterReadingToMilliunits !== undefined) updateValues.meterReadingToMilliunits = params.meterReadingToMilliunits;
    if (params.hsdConsumedMilliunits !== undefined) updateValues.hsdConsumedMilliunits = params.hsdConsumedMilliunits;
    if (params.hsdRatePaisePerLitre !== undefined) updateValues.hsdRatePaisePerLitre = params.hsdRatePaisePerLitre;
    if (params.amountPaise !== undefined) updateValues.amountPaise = params.amountPaise;
    if (params.remarks !== undefined) updateValues.remarks = params.remarks;
    if (params.status !== undefined) updateValues.status = params.status;

    await db.update(dgDailyLogs).set(updateValues).where(eq(dgDailyLogs.id, id));

    if (params.intervals !== undefined) {
      await db.delete(dgRunIntervals).where(eq(dgRunIntervals.dgDailyLogId, id));

      if (params.intervals.length > 0) {
        const intervalRows = params.intervals.map((iv, idx) => ({
          id: `dgri_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
          dgDailyLogId: id,
          sequenceNo: iv.sequenceNo ?? idx + 1,
          startTime: iv.startTime,
          endTime: iv.endTime,
          durationMinutes: iv.durationMinutes,
          remarks: iv.remarks ?? null,
          createdAt: now,
        }));
        await db.insert(dgRunIntervals).values(intervalRows);
      }
    }

    return await this.getById(db, id);
  }

  static async getLatestForEquipment(
    db: any,
    equipmentAssetId: string
  ): Promise<DgDailyLog | null> {
    const rows = await db
      .select({ id: dgDailyLogs.id })
      .from(dgDailyLogs)
      .where(eq(dgDailyLogs.equipmentAssetId, equipmentAssetId))
      .orderBy(desc(dgDailyLogs.businessDate))
      .limit(1);

    if (!rows || rows.length === 0) return null;
    return this.getById(db, rows[0].id);
  }
}
