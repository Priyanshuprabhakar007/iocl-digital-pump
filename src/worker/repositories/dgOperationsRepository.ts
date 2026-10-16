import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { dgDailyLogs, retailOutlets, equipmentAssets, users } from '../../db/schema';
import { DgDailyLog, CreateDgDailyLogInput, UpdateDgDailyLogInput } from '../../shared/types';

export class DgOperationsRepository {
  static async create(db: any, input: CreateDgDailyLogInput & { operatorUserId: string }): Promise<DgDailyLog> {
    const id = `dgl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const totalRunHours = input.closingRunHours - input.openingRunHours;
    const dieselAdded = input.dieselAddedLitres ?? 0;
    const closingBalance = input.openingDieselBalanceLitres + dieselAdded - input.dieselConsumedLitres;

    const row = {
      id,
      outletId: input.outletId,
      equipmentId: input.equipmentId,
      logDate: input.logDate,
      openingRunHours: input.openingRunHours,
      closingRunHours: input.closingRunHours,
      totalRunHours,
      dieselConsumedLitres: input.dieselConsumedLitres,
      unitsGeneratedKwh: input.unitsGeneratedKwh ?? null,
      openingDieselBalanceLitres: input.openingDieselBalanceLitres,
      dieselAddedLitres: dieselAdded,
      closingDieselBalanceLitres: Math.max(0, closingBalance),
      gridFailureDurationMinutes: input.gridFailureDurationMinutes ?? 0,
      powerCutEventsCount: input.powerCutEventsCount ?? 0,
      operatorUserId: input.operatorUserId,
      remarks: input.remarks ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(dgDailyLogs).values(row);
    return (await this.getById(db, id))!;
  }

  static async getById(db: any, id: string): Promise<DgDailyLog | null> {
    const rows = await db
      .select({
        id: dgDailyLogs.id,
        outletId: dgDailyLogs.outletId,
        equipmentId: dgDailyLogs.equipmentId,
        logDate: dgDailyLogs.logDate,
        openingRunHours: dgDailyLogs.openingRunHours,
        closingRunHours: dgDailyLogs.closingRunHours,
        totalRunHours: dgDailyLogs.totalRunHours,
        dieselConsumedLitres: dgDailyLogs.dieselConsumedLitres,
        unitsGeneratedKwh: dgDailyLogs.unitsGeneratedKwh,
        openingDieselBalanceLitres: dgDailyLogs.openingDieselBalanceLitres,
        dieselAddedLitres: dgDailyLogs.dieselAddedLitres,
        closingDieselBalanceLitres: dgDailyLogs.closingDieselBalanceLitres,
        gridFailureDurationMinutes: dgDailyLogs.gridFailureDurationMinutes,
        powerCutEventsCount: dgDailyLogs.powerCutEventsCount,
        operatorUserId: dgDailyLogs.operatorUserId,
        remarks: dgDailyLogs.remarks,
        createdAt: dgDailyLogs.createdAt,
        updatedAt: dgDailyLogs.updatedAt,
        outletName: retailOutlets.name,
        equipmentName: equipmentAssets.name,
        equipmentCode: equipmentAssets.assetCode,
        operatorName: users.name,
      })
      .from(dgDailyLogs)
      .leftJoin(retailOutlets, eq(dgDailyLogs.outletId, retailOutlets.id))
      .leftJoin(equipmentAssets, eq(dgDailyLogs.equipmentId, equipmentAssets.id))
      .leftJoin(users, eq(dgDailyLogs.operatorUserId, users.id))
      .where(eq(dgDailyLogs.id, id));

    return rows[0] || null;
  }

  static async listByOutlet(
    db: any,
    outletId: string,
    startDate?: string,
    endDate?: string
  ): Promise<DgDailyLog[]> {
    const conditions = [eq(dgDailyLogs.outletId, outletId)];
    if (startDate) conditions.push(gte(dgDailyLogs.logDate, startDate));
    if (endDate) conditions.push(lte(dgDailyLogs.logDate, endDate));

    const rows = await db
      .select({
        id: dgDailyLogs.id,
        outletId: dgDailyLogs.outletId,
        equipmentId: dgDailyLogs.equipmentId,
        logDate: dgDailyLogs.logDate,
        openingRunHours: dgDailyLogs.openingRunHours,
        closingRunHours: dgDailyLogs.closingRunHours,
        totalRunHours: dgDailyLogs.totalRunHours,
        dieselConsumedLitres: dgDailyLogs.dieselConsumedLitres,
        unitsGeneratedKwh: dgDailyLogs.unitsGeneratedKwh,
        openingDieselBalanceLitres: dgDailyLogs.openingDieselBalanceLitres,
        dieselAddedLitres: dgDailyLogs.dieselAddedLitres,
        closingDieselBalanceLitres: dgDailyLogs.closingDieselBalanceLitres,
        gridFailureDurationMinutes: dgDailyLogs.gridFailureDurationMinutes,
        powerCutEventsCount: dgDailyLogs.powerCutEventsCount,
        operatorUserId: dgDailyLogs.operatorUserId,
        remarks: dgDailyLogs.remarks,
        createdAt: dgDailyLogs.createdAt,
        updatedAt: dgDailyLogs.updatedAt,
        outletName: retailOutlets.name,
        equipmentName: equipmentAssets.name,
        equipmentCode: equipmentAssets.assetCode,
        operatorName: users.name,
      })
      .from(dgDailyLogs)
      .leftJoin(retailOutlets, eq(dgDailyLogs.outletId, retailOutlets.id))
      .leftJoin(equipmentAssets, eq(dgDailyLogs.equipmentId, equipmentAssets.id))
      .leftJoin(users, eq(dgDailyLogs.operatorUserId, users.id))
      .where(and(...conditions))
      .orderBy(desc(dgDailyLogs.logDate), desc(dgDailyLogs.createdAt));

    return rows;
  }

  static async update(db: any, id: string, input: UpdateDgDailyLogInput): Promise<DgDailyLog | null> {
    const existing = await this.getById(db, id);
    if (!existing) return null;

    const opening = input.openingRunHours ?? existing.openingRunHours;
    const closing = input.closingRunHours ?? existing.closingRunHours;
    const totalRunHours = closing - opening;

    const openingDiesel = input.openingDieselBalanceLitres ?? existing.openingDieselBalanceLitres;
    const dieselAdded = input.dieselAddedLitres ?? existing.dieselAddedLitres;
    const dieselConsumed = input.dieselConsumedLitres ?? existing.dieselConsumedLitres;
    const closingBalance = Math.max(0, openingDiesel + dieselAdded - dieselConsumed);

    const now = new Date().toISOString();

    await db
      .update(dgDailyLogs)
      .set({
        ...(input.openingRunHours !== undefined && { openingRunHours: input.openingRunHours }),
        ...(input.closingRunHours !== undefined && { closingRunHours: input.closingRunHours }),
        totalRunHours,
        ...(input.dieselConsumedLitres !== undefined && { dieselConsumedLitres: input.dieselConsumedLitres }),
        ...(input.unitsGeneratedKwh !== undefined && { unitsGeneratedKwh: input.unitsGeneratedKwh }),
        ...(input.openingDieselBalanceLitres !== undefined && { openingDieselBalanceLitres: input.openingDieselBalanceLitres }),
        ...(input.dieselAddedLitres !== undefined && { dieselAddedLitres: input.dieselAddedLitres }),
        closingDieselBalanceLitres: closingBalance,
        ...(input.gridFailureDurationMinutes !== undefined && { gridFailureDurationMinutes: input.gridFailureDurationMinutes }),
        ...(input.powerCutEventsCount !== undefined && { powerCutEventsCount: input.powerCutEventsCount }),
        ...(input.remarks !== undefined && { remarks: input.remarks }),
        updatedAt: now,
      })
      .where(eq(dgDailyLogs.id, id));

    return await this.getById(db, id);
  }

  static async delete(db: any, id: string): Promise<boolean> {
    const existing = await this.getById(db, id);
    if (!existing) return false;
    await db.delete(dgDailyLogs).where(eq(dgDailyLogs.id, id));
    return true;
  }

  static async getLatestForEquipment(db: any, equipmentId: string): Promise<DgDailyLog | null> {
    const rows = await db
      .select({
        id: dgDailyLogs.id,
        outletId: dgDailyLogs.outletId,
        equipmentId: dgDailyLogs.equipmentId,
        logDate: dgDailyLogs.logDate,
        openingRunHours: dgDailyLogs.openingRunHours,
        closingRunHours: dgDailyLogs.closingRunHours,
        totalRunHours: dgDailyLogs.totalRunHours,
        dieselConsumedLitres: dgDailyLogs.dieselConsumedLitres,
        unitsGeneratedKwh: dgDailyLogs.unitsGeneratedKwh,
        openingDieselBalanceLitres: dgDailyLogs.openingDieselBalanceLitres,
        dieselAddedLitres: dgDailyLogs.dieselAddedLitres,
        closingDieselBalanceLitres: dgDailyLogs.closingDieselBalanceLitres,
        gridFailureDurationMinutes: dgDailyLogs.gridFailureDurationMinutes,
        powerCutEventsCount: dgDailyLogs.powerCutEventsCount,
        operatorUserId: dgDailyLogs.operatorUserId,
        remarks: dgDailyLogs.remarks,
        createdAt: dgDailyLogs.createdAt,
        updatedAt: dgDailyLogs.updatedAt,
      })
      .from(dgDailyLogs)
      .where(eq(dgDailyLogs.equipmentId, equipmentId))
      .orderBy(desc(dgDailyLogs.logDate), desc(dgDailyLogs.createdAt))
      .limit(1);

    return rows[0] || null;
  }
}
