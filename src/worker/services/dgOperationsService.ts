import { DgOperationsRepository } from '../repositories/dgOperationsRepository';
import { CreateDgDailyLogInput, UpdateDgDailyLogInput, DgDailyLog } from '../../shared/types';
import { eq } from 'drizzle-orm';
import { equipmentAssets, retailOutlets } from '../../db/schema';

export class DgOperationsService {
  static async createLog(db: any, input: CreateDgDailyLogInput, operatorUserId: string): Promise<DgDailyLog> {
    // 1. Verify retail outlet exists
    const outletRows = await db.select().from(retailOutlets).where(eq(retailOutlets.id, input.outletId)).limit(1);
    if (!outletRows || outletRows.length === 0) {
      throw new Error(`Retail outlet ${input.outletId} not found`);
    }

    // 2. Verify equipment asset exists and belongs to this outlet
    const equipmentRows = await db.select().from(equipmentAssets).where(eq(equipmentAssets.id, input.equipmentId)).limit(1);
    if (!equipmentRows || equipmentRows.length === 0) {
      throw new Error(`Equipment asset ${input.equipmentId} not found`);
    }

    const equipment = equipmentRows[0];
    if (equipment.outletId !== input.outletId) {
      throw new Error(`Equipment asset ${input.equipmentId} does not belong to outlet ${input.outletId}`);
    }

    if (equipment.equipmentType !== 'DG_SET') {
      throw new Error(`Equipment asset ${input.equipmentId} is type ${equipment.equipmentType}, expected DG_SET`);
    }

    // 3. Check closing vs opening run hours
    if (input.closingRunHours < input.openingRunHours) {
      throw new Error(`Closing run hours (${input.closingRunHours}) cannot be less than opening run hours (${input.openingRunHours})`);
    }

    // 4. Create log record
    return await DgOperationsRepository.create(db, {
      ...input,
      operatorUserId,
    });
  }

  static async getLogById(db: any, id: string): Promise<DgDailyLog | null> {
    return await DgOperationsRepository.getById(db, id);
  }

  static async listLogsByOutlet(db: any, outletId: string, startDate?: string, endDate?: string): Promise<DgDailyLog[]> {
    return await DgOperationsRepository.listByOutlet(db, outletId, startDate, endDate);
  }

  static async updateLog(db: any, id: string, input: UpdateDgDailyLogInput): Promise<DgDailyLog> {
    const existing = await DgOperationsRepository.getById(db, id);
    if (!existing) {
      throw new Error(`DG daily log ${id} not found`);
    }

    const newOpening = input.openingRunHours ?? existing.openingRunHours;
    const newClosing = input.closingRunHours ?? existing.closingRunHours;

    if (newClosing < newOpening) {
      throw new Error(`Closing run hours (${newClosing}) cannot be less than opening run hours (${newOpening})`);
    }

    const updated = await DgOperationsRepository.update(db, id, input);
    if (!updated) {
      throw new Error(`Failed to update DG daily log ${id}`);
    }

    return updated;
  }

  static async deleteLog(db: any, id: string): Promise<boolean> {
    const existing = await DgOperationsRepository.getById(db, id);
    if (!existing) {
      throw new Error(`DG daily log ${id} not found`);
    }
    return await DgOperationsRepository.delete(db, id);
  }

  static async getLatestForEquipment(db: any, equipmentId: string): Promise<DgDailyLog | null> {
    return await DgOperationsRepository.getLatestForEquipment(db, equipmentId);
  }
}
