import { EquipmentRepository } from '../repositories/equipmentRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { AppDatabase } from '../../db';
import { 
  CreateEquipmentAssetSchema, 
  UpdateEquipmentAssetSchema, 
  CreateEquipmentTicketSchema,
  AssignTicketSchema,
  ResolveTicketSchema,
  SignoffTicketSchema,
  CancelTicketSchema
} from '../../shared/validators';
import { EquipmentAsset, EquipmentBreakdownTicket, EquipmentTarget, EquipmentTicketStatus, EquipmentAssetType, EquipmentType, EquipmentAssetStatus } from '../../shared/types';

export class EquipmentError extends Error {
    constructor(public code: string, message: string, public status: number = 400) {
        super(message);
        this.name = 'EquipmentError';
    }
}

export class EquipmentService {
  constructor(private db: AppDatabase) {}

  async createAsset(outletId: string, userId: string, data: unknown): Promise<EquipmentAsset> {
    const validated = CreateEquipmentAssetSchema.parse(data);
    const repo = new EquipmentRepository(this.db);
    try {
      const asset = await repo.createAsset({
        ...validated,
        id: crypto.randomUUID(),
        outletId,
        equipmentType: validated.equipmentType as EquipmentAssetType,
        status: validated.status as EquipmentAssetStatus,
        createdBy: userId,
        manufacturer: validated.manufacturer ?? null,
        model: validated.model ?? null,
        serialNumber: validated.serialNumber ?? null,
        commissionedAt: validated.commissionedAt ? new Date(validated.commissionedAt).toISOString() : null,
        notes: validated.notes ?? null,
      });
      await new AuditRepository(this.db).logAction({
          id: crypto.randomUUID(),
          userId,
          action: 'EQUIPMENT_ASSET_CREATE',
          entityType: 'EQUIPMENT_ASSET',
          entityId: asset.id,
          newValue: asset as unknown as Record<string, unknown>,
          createdAt: new Date().toISOString()
      });
      return asset as EquipmentAsset;
    } catch (err: unknown) {
      if (err instanceof EquipmentError) throw err;
      const errorObj = err as { message?: string; cause?: unknown };
      const msg = errorObj.message || '';
      const causeMsg = errorObj.cause ? String(errorObj.cause) : '';
      const fullStr = `${msg} ${causeMsg}`;
      if (fullStr.includes('equipment_assets.outlet_id, equipment_assets.asset_code') || fullStr.includes('idx_eq_assets_outlet_code_unique')) {
        throw new EquipmentError('EQUIPMENT_ASSET_CODE_EXISTS', 'Asset code already exists in this outlet', 409);
      }
      if (fullStr.includes('equipment_assets.outlet_id, equipment_assets.serial_number') || fullStr.includes('idx_eq_assets_outlet_serial_unique')) {
        throw new EquipmentError('EQUIPMENT_ASSET_SERIAL_EXISTS', 'Serial number already exists in this outlet', 409);
      }
      if (fullStr.includes('UNIQUE constraint failed')) {
        if (fullStr.includes('serial_number')) {
          throw new EquipmentError('EQUIPMENT_ASSET_SERIAL_EXISTS', 'Serial number already exists in this outlet', 409);
        }
        throw new EquipmentError('EQUIPMENT_ASSET_CODE_EXISTS', 'Asset code already exists in this outlet', 409);
      }
      throw err;
    }
  }

  async updateAsset(assetId: string, userId: string, data: unknown): Promise<EquipmentAsset> {
    const validated = UpdateEquipmentAssetSchema.parse(data);
    const repo = new EquipmentRepository(this.db);
    const existing = await repo.getAssetById(assetId);
    if (!existing) throw new EquipmentError('EQUIPMENT_ASSET_NOT_FOUND', 'Asset not found', 404);

    try {
      const updated = await repo.updateAsset(assetId, {
        ...validated,
        equipmentType: (validated as Record<string, unknown>).equipmentType ? ((validated as Record<string, unknown>).equipmentType as EquipmentAssetType) : (existing.equipmentType as EquipmentAssetType),
        manufacturer: validated.manufacturer !== undefined ? validated.manufacturer : existing.manufacturer,
        model: validated.model !== undefined ? validated.model : existing.model,
        serialNumber: validated.serialNumber !== undefined ? validated.serialNumber : existing.serialNumber,
        status: validated.status !== undefined ? (validated.status as EquipmentAssetStatus) : (existing.status as EquipmentAssetStatus),
        commissionedAt: validated.commissionedAt !== undefined ? (validated.commissionedAt ? new Date(validated.commissionedAt).toISOString() : null) : existing.commissionedAt,
        notes: validated.notes !== undefined ? validated.notes : existing.notes,
      });

      await new AuditRepository(this.db).logAction({
          id: crypto.randomUUID(),
          userId,
          action: 'EQUIPMENT_ASSET_UPDATE',
          entityType: 'EQUIPMENT_ASSET',
          entityId: assetId,
          oldValue: existing as unknown as Record<string, unknown>,
          newValue: updated as unknown as Record<string, unknown>,
          createdAt: new Date().toISOString()
      });
      return updated as EquipmentAsset;
    } catch (err: unknown) {
      if (err instanceof EquipmentError) throw err;
      const errorObj = err as { message?: string; cause?: unknown };
      const msg = errorObj.message || '';
      const causeMsg = errorObj.cause ? String(errorObj.cause) : '';
      const fullStr = `${msg} ${causeMsg}`;
      if (fullStr.includes('equipment_assets.outlet_id, equipment_assets.asset_code') || fullStr.includes('idx_eq_assets_outlet_code_unique')) {
        throw new EquipmentError('EQUIPMENT_ASSET_CODE_EXISTS', 'Asset code already exists in this outlet', 409);
      }
      if (fullStr.includes('equipment_assets.outlet_id, equipment_assets.serial_number') || fullStr.includes('idx_eq_assets_outlet_serial_unique')) {
        throw new EquipmentError('EQUIPMENT_ASSET_SERIAL_EXISTS', 'Serial number already exists in this outlet', 409);
      }
      if (fullStr.includes('UNIQUE constraint failed')) {
        if (fullStr.includes('serial_number')) {
          throw new EquipmentError('EQUIPMENT_ASSET_SERIAL_EXISTS', 'Serial number already exists in this outlet', 409);
        }
        throw new EquipmentError('EQUIPMENT_ASSET_CODE_EXISTS', 'Asset code already exists in this outlet', 409);
      }
      throw err;
    }
  }

  async listTargets(outletId: string): Promise<EquipmentTarget[]> {
    const repo = new EquipmentRepository(this.db);
    const dispensers = await repo.listDispensers(outletId);
    const assets = await repo.listAssets(outletId);

    const targets: EquipmentTarget[] = [];

    for (const d of dispensers) {
      targets.push({
        targetType: 'DISPENSER',
        targetId: d.id,
        equipmentType: 'DISPENSER',
        label: d.name,
        status: d.status as EquipmentAssetStatus,
      });
    }

    for (const a of assets) {
      targets.push({
        targetType: 'ASSET',
        targetId: a.id,
        equipmentType: a.equipmentType as EquipmentType,
        label: a.name,
        status: a.status as EquipmentAssetStatus,
      });
    }

    return targets;
  }

  async createTicket(outletId: string, userId: string, data: unknown): Promise<EquipmentBreakdownTicket> {
    const validated = CreateEquipmentTicketSchema.parse(data);
    const repo = new EquipmentRepository(this.db);
    
    let equipmentTypeSnapshot: EquipmentType = 'DISPENSER';
    let equipmentLabelSnapshot = '';

    if (validated.dispenserId) {
        const dispenser = await repo.getDispenserById(validated.dispenserId);
        if (!dispenser || dispenser.outletId !== outletId) throw new EquipmentError('EQUIPMENT_TARGET_NOT_FOUND', 'Dispenser not found', 404);
        if (dispenser.status === 'INACTIVE' || dispenser.status === 'DECOMMISSIONED') {
            throw new EquipmentError('EQUIPMENT_TARGET_INACTIVE', 'Target is inactive or decommissioned', 400);
        }
        equipmentTypeSnapshot = 'DISPENSER' as EquipmentType;
        equipmentLabelSnapshot = dispenser.name;
    } else if (validated.equipmentAssetId) {
        const asset = await repo.getAssetById(validated.equipmentAssetId);
        if (!asset || asset.outletId !== outletId) throw new EquipmentError('EQUIPMENT_TARGET_NOT_FOUND', 'Asset not found', 404);
        if (asset.status === 'INACTIVE' || asset.status === 'DECOMMISSIONED') {
            throw new EquipmentError('EQUIPMENT_TARGET_INACTIVE', 'Target is inactive or decommissioned', 400);
        }
        equipmentTypeSnapshot = asset.equipmentType as EquipmentType;
        equipmentLabelSnapshot = asset.name;
    } else {
        throw new EquipmentError('EQUIPMENT_TARGET_NOT_FOUND', 'Target required');
    }

    const ticket = await repo.createTicket({
        ...validated,
        id: crypto.randomUUID(),
        outletId,
        equipmentTypeSnapshot,
        equipmentLabelSnapshot,
        status: 'OPEN',
        breakdownAt: new Date(validated.breakdownAt).toISOString(),
        technicianName: null,
        technicianPhone: null,
        assignedAt: null,
        assignedByUserId: null,
        resolutionNotes: null,
        resolvedAt: null,
        resolvedByUserId: null,
        downtimeSeconds: null,
        signoffNotes: null,
        signedOffAt: null,
        signedOffByUserId: null,
        cancelReason: null,
        cancelledAt: null,
        cancelledByUserId: null,
        createdBy: userId,
        dispenserId: validated.dispenserId ?? null,
        equipmentAssetId: validated.equipmentAssetId ?? null,
    });
    
    await repo.createEvent({
        ticketId: ticket.id,
        eventType: 'CREATED',
        fromStatus: null,
        toStatus: 'OPEN',
        notes: null,
        actorUserId: userId,
    });

    await new AuditRepository(this.db).logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'EQUIPMENT_TICKET_CREATE',
        entityType: 'EQUIPMENT_BREAKDOWN_TICKET',
        entityId: ticket.id,
        newValue: ticket as unknown as Record<string, unknown>,
        createdAt: new Date().toISOString()
    });
    return ticket as EquipmentBreakdownTicket;
  }

  async assignTicket(ticketId: string, userId: string, data: unknown): Promise<EquipmentBreakdownTicket> {
    const validated = AssignTicketSchema.parse(data);
    const repo = new EquipmentRepository(this.db);
    const ticket = await repo.getTicketById(ticketId);
    if (!ticket) throw new EquipmentError('EQUIPMENT_TICKET_NOT_FOUND', 'Ticket not found', 404);

    if (ticket.status !== 'OPEN' && ticket.status !== 'ASSIGNED') {
        throw new EquipmentError('INVALID_EQUIPMENT_TICKET_TRANSITION', 'Invalid transition', 409);
    }

    const isReassign = ticket.status === 'ASSIGNED';
    const assignedAt = new Date().toISOString();

    const updated = await repo.updateTicketStatusConditional(ticketId, ticket.status, 'ASSIGNED', {
        technicianName: validated.technicianName,
        technicianPhone: validated.technicianPhone ?? null,
        assignedAt,
        assignedByUserId: userId,
    });

    if (!updated) {
        throw new EquipmentError('EQUIPMENT_TICKET_STATE_CHANGED', 'Ticket state changed concurrently', 409);
    }

    await repo.createEvent({
        ticketId,
        eventType: isReassign ? 'REASSIGNED' : 'ASSIGNED',
        fromStatus: ticket.status as EquipmentTicketStatus,
        toStatus: 'ASSIGNED',
        notes: `Assigned to ${validated.technicianName}`,
        actorUserId: userId,
    });

    await new AuditRepository(this.db).logAction({
        id: crypto.randomUUID(),
        userId,
        action: isReassign ? 'EQUIPMENT_TICKET_REASSIGN' : 'EQUIPMENT_TICKET_ASSIGN',
        entityType: 'EQUIPMENT_BREAKDOWN_TICKET',
        entityId: ticketId,
        oldValue: ticket as unknown as Record<string, unknown>,
        newValue: updated as unknown as Record<string, unknown>,
        createdAt: new Date().toISOString()
    });

    return updated as EquipmentBreakdownTicket;
  }

  async startTicket(ticketId: string, userId: string): Promise<EquipmentBreakdownTicket> {
    const repo = new EquipmentRepository(this.db);
    const ticket = await repo.getTicketById(ticketId);
    if (!ticket) throw new EquipmentError('EQUIPMENT_TICKET_NOT_FOUND', 'Ticket not found', 404);

    if (ticket.status !== 'ASSIGNED') {
        throw new EquipmentError('INVALID_EQUIPMENT_TICKET_TRANSITION', 'Invalid transition', 409);
    }

    const updated = await repo.updateTicketStatusConditional(ticketId, 'ASSIGNED', 'IN_PROGRESS', {});
    if (!updated) {
        throw new EquipmentError('EQUIPMENT_TICKET_STATE_CHANGED', 'Ticket state changed concurrently', 409);
    }

    await repo.createEvent({
        ticketId,
        eventType: 'WORK_STARTED',
        fromStatus: 'ASSIGNED',
        toStatus: 'IN_PROGRESS',
        notes: null,
        actorUserId: userId,
    });

    await new AuditRepository(this.db).logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'EQUIPMENT_TICKET_START',
        entityType: 'EQUIPMENT_BREAKDOWN_TICKET',
        entityId: ticketId,
        oldValue: ticket as unknown as Record<string, unknown>,
        newValue: updated as unknown as Record<string, unknown>,
        createdAt: new Date().toISOString()
    });

    return updated as EquipmentBreakdownTicket;
  }

  async resolveTicket(ticketId: string, userId: string, data: unknown): Promise<EquipmentBreakdownTicket> {
    const validated = ResolveTicketSchema.parse(data);
    const repo = new EquipmentRepository(this.db);
    const ticket = await repo.getTicketById(ticketId);
    if (!ticket) throw new EquipmentError('EQUIPMENT_TICKET_NOT_FOUND', 'Ticket not found', 404);

    if (ticket.status !== 'IN_PROGRESS') {
        throw new EquipmentError('INVALID_EQUIPMENT_TICKET_TRANSITION', 'Invalid transition', 409);
    }

    const resolvedAt = validated.resolvedAt ? new Date(validated.resolvedAt).toISOString() : new Date().toISOString();
    if (new Date(resolvedAt).getTime() < new Date(ticket.breakdownAt).getTime()) {
        throw new EquipmentError('INVALID_RESOLUTION_TIMESTAMP', 'Resolved at cannot be earlier than breakdown at', 400);
    }

    const downtimeSeconds = Math.floor((new Date(resolvedAt).getTime() - new Date(ticket.breakdownAt).getTime()) / 1000);
    if (!Number.isSafeInteger(downtimeSeconds) || downtimeSeconds < 0) {
        throw new EquipmentError('DOWNTIME_OVERFLOW', 'Invalid downtime calculation', 400);
    }

    const updated = await repo.updateTicketStatusConditional(ticketId, 'IN_PROGRESS', 'RESOLVED', {
        resolutionNotes: validated.resolutionNotes,
        resolvedAt,
        resolvedByUserId: userId,
        downtimeSeconds,
    });

    if (!updated) {
        throw new EquipmentError('EQUIPMENT_TICKET_STATE_CHANGED', 'Ticket state changed concurrently', 409);
    }

    await repo.createEvent({
        ticketId,
        eventType: 'RESOLVED',
        fromStatus: 'IN_PROGRESS',
        toStatus: 'RESOLVED',
        notes: validated.resolutionNotes,
        actorUserId: userId,
    });

    await new AuditRepository(this.db).logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'EQUIPMENT_TICKET_RESOLVE',
        entityType: 'EQUIPMENT_BREAKDOWN_TICKET',
        entityId: ticketId,
        oldValue: ticket as unknown as Record<string, unknown>,
        newValue: updated as unknown as Record<string, unknown>,
        createdAt: new Date().toISOString()
    });

    return updated as EquipmentBreakdownTicket;
  }

  async signoffTicket(ticketId: string, userId: string, data: unknown): Promise<EquipmentBreakdownTicket> {
    const validated = SignoffTicketSchema.parse(data);
    const repo = new EquipmentRepository(this.db);
    const ticket = await repo.getTicketById(ticketId);
    if (!ticket) throw new EquipmentError('EQUIPMENT_TICKET_NOT_FOUND', 'Ticket not found', 404);

    if (ticket.status !== 'RESOLVED') {
        throw new EquipmentError('INVALID_EQUIPMENT_TICKET_TRANSITION', 'Invalid transition', 409);
    }

    const signedOffAt = new Date().toISOString();
    const updated = await repo.updateTicketStatusConditional(ticketId, 'RESOLVED', 'CLOSED', {
        signoffNotes: validated.signoffNotes ?? null,
        signedOffAt,
        signedOffByUserId: userId,
    });

    if (!updated) {
        throw new EquipmentError('EQUIPMENT_TICKET_STATE_CHANGED', 'Ticket state changed concurrently', 409);
    }

    await repo.createEvent({
        ticketId,
        eventType: 'SIGNED_OFF',
        fromStatus: 'RESOLVED',
        toStatus: 'CLOSED',
        notes: validated.signoffNotes ?? null,
        actorUserId: userId,
    });

    await new AuditRepository(this.db).logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'EQUIPMENT_TICKET_SIGNOFF',
        entityType: 'EQUIPMENT_BREAKDOWN_TICKET',
        entityId: ticketId,
        oldValue: ticket as unknown as Record<string, unknown>,
        newValue: updated as unknown as Record<string, unknown>,
        createdAt: new Date().toISOString()
    });

    return updated as EquipmentBreakdownTicket;
  }

  async cancelTicket(ticketId: string, userId: string, data: unknown): Promise<EquipmentBreakdownTicket> {
    const validated = CancelTicketSchema.parse(data);
    const repo = new EquipmentRepository(this.db);
    const ticket = await repo.getTicketById(ticketId);
    if (!ticket) throw new EquipmentError('EQUIPMENT_TICKET_NOT_FOUND', 'Ticket not found', 404);

    if (ticket.status !== 'OPEN' && ticket.status !== 'ASSIGNED') {
        throw new EquipmentError('INVALID_EQUIPMENT_TICKET_TRANSITION', 'Invalid transition', 409);
    }

    const cancelledAt = new Date().toISOString();
    const updated = await repo.updateTicketStatusConditional(ticketId, ticket.status, 'CANCELLED', {
        cancelReason: validated.reason,
        cancelledAt,
        cancelledByUserId: userId,
    });

    if (!updated) {
        throw new EquipmentError('EQUIPMENT_TICKET_STATE_CHANGED', 'Ticket state changed concurrently', 409);
    }

    await repo.createEvent({
        ticketId,
        eventType: 'CANCELLED',
        fromStatus: ticket.status as EquipmentTicketStatus,
        toStatus: 'CANCELLED',
        notes: validated.reason,
        actorUserId: userId,
    });

    await new AuditRepository(this.db).logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'EQUIPMENT_TICKET_CANCEL',
        entityType: 'EQUIPMENT_BREAKDOWN_TICKET',
        entityId: ticketId,
        oldValue: ticket as unknown as Record<string, unknown>,
        newValue: updated as unknown as Record<string, unknown>,
        createdAt: new Date().toISOString()
    });

    return updated as EquipmentBreakdownTicket;
  }
  
  async getHealthSummary(outletId: string) {
    const tickets = await new EquipmentRepository(this.db).listTickets(outletId);
    
    let activeTicketCount = 0;
    let criticalActiveCount = 0;
    let resolvedAwaitingSignoffCount = 0;
    const activeTargets = new Set<string>();
    const countsByEquipmentType: Record<string, number> = {};
    const countsByStatus: Record<string, number> = {};

    for (const ticket of tickets) {
        countsByStatus[ticket.status] = (countsByStatus[ticket.status] || 0) + 1;
        countsByEquipmentType[ticket.equipmentTypeSnapshot] = (countsByEquipmentType[ticket.equipmentTypeSnapshot] || 0) + 1;
        
        if (['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(ticket.status)) {
            activeTicketCount++;
            if (ticket.priority === 'CRITICAL') criticalActiveCount++;
            if (ticket.dispenserId) {
                activeTargets.add(`DISPENSER:${ticket.dispenserId}`);
            } else if (ticket.equipmentAssetId) {
                activeTargets.add(`ASSET:${ticket.equipmentAssetId}`);
            }
        } else if (ticket.status === 'RESOLVED') {
            resolvedAwaitingSignoffCount++;
        }
    }
    const currentlyDownTargetCount = activeTargets.size;

    return {
        activeTicketCount,
        criticalActiveCount,
        resolvedAwaitingSignoffCount,
        currentlyDownTargetCount,
        countsByEquipmentType,
        countsByStatus,
    };
  }
}
