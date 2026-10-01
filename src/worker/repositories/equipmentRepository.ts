import { eq, and, sql, desc, asc } from 'drizzle-orm';
import { AppDatabase } from '../../db';
import { equipmentAssets, equipmentBreakdownTickets, equipmentBreakdownEvents, dispensers } from '../../db/schema';
import { EquipmentAsset, EquipmentBreakdownTicket, EquipmentBreakdownEvent, EquipmentTicketStatus } from '../../shared/types';

export class EquipmentRepository {
  constructor(private db: AppDatabase) {}

  async getAssetById(id: string) {
    return await this.db.select().from(equipmentAssets).where(eq(equipmentAssets.id, id)).get();
  }

  async listAssets(outletId: string, filters: { equipmentType?: string, status?: string } = {}) {
    const conditions = [eq(equipmentAssets.outletId, outletId)];
    if (filters.equipmentType) conditions.push(eq(equipmentAssets.equipmentType, filters.equipmentType));
    if (filters.status) conditions.push(eq(equipmentAssets.status, filters.status));
    return await this.db.select().from(equipmentAssets).where(and(...conditions)).all();
  }

  async createAsset(asset: Omit<EquipmentAsset, 'createdAt' | 'updatedAt'>) {
    return await this.db.insert(equipmentAssets).values({
      ...asset,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).returning().get();
  }

  async updateAsset(id: string, updates: Partial<Omit<EquipmentAsset, 'id' | 'outletId' | 'createdAt' | 'createdBy'>>) {
    return await this.db.update(equipmentAssets)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(equipmentAssets.id, id))
      .returning().get();
  }

  async getTicketById(id: string) {
    return await this.db.select().from(equipmentBreakdownTickets).where(eq(equipmentBreakdownTickets.id, id)).get();
  }

  async listTickets(outletId: string, filters: { status?: EquipmentTicketStatus, priority?: string, equipmentType?: string } = {}) {
    const conditions = [eq(equipmentBreakdownTickets.outletId, outletId)];
    if (filters.status) conditions.push(eq(equipmentBreakdownTickets.status, filters.status));
    if (filters.priority) conditions.push(eq(equipmentBreakdownTickets.priority, filters.priority));
    if (filters.equipmentType) conditions.push(eq(equipmentBreakdownTickets.equipmentTypeSnapshot, filters.equipmentType));
    return await this.db.select().from(equipmentBreakdownTickets).where(and(...conditions)).orderBy(desc(equipmentBreakdownTickets.createdAt)).all();
  }

  async createTicket(ticket: Omit<EquipmentBreakdownTicket, 'createdAt' | 'updatedAt'>) {
    return await this.db.insert(equipmentBreakdownTickets).values({
      ...ticket,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).returning().get();
  }

  async updateTicketStatusConditional(id: string, expectedStatus: EquipmentTicketStatus, status: EquipmentTicketStatus, updates: Partial<EquipmentBreakdownTicket>) {
    const res = await this.db.update(equipmentBreakdownTickets)
      .set({ status, ...updates, updatedAt: new Date().toISOString() })
      .where(and(eq(equipmentBreakdownTickets.id, id), eq(equipmentBreakdownTickets.status, expectedStatus)))
      .returning().get();
    return res;
  }

  async createEvent(event: Omit<EquipmentBreakdownEvent, 'id' | 'createdAt'>) {
    return await this.db.insert(equipmentBreakdownEvents).values({
      ...event,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  async listEvents(ticketId: string) {
    return await this.db.select().from(equipmentBreakdownEvents).where(eq(equipmentBreakdownEvents.ticketId, ticketId)).orderBy(asc(equipmentBreakdownEvents.createdAt)).all();
  }
  
  async getDispenserById(id: string) {
    return await this.db.select().from(dispensers).where(eq(dispensers.id, id)).get();
  }

  async listDispensers(outletId: string) {
    return await this.db.select().from(dispensers).where(eq(dispensers.outletId, outletId)).all();
  }
}
