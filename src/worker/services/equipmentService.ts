import { EquipmentRepository } from '../repositories/equipmentRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { AppDatabase } from '../../db';
import { CreateEquipmentAssetSchema, CreateEquipmentTicketSchema } from '../../shared/validators';
import { EquipmentAsset, EquipmentBreakdownTicket, TicketStatus } from '../../shared/types';

export class EquipmentError extends Error {
    constructor(public code: string, message: string, public status: number = 400) {
        super(message);
        this.name = 'EquipmentError';
    }
}

export class EquipmentService {
  constructor(private db: AppDatabase) {}

  async createAsset(outletId: string, userId: string, data: any) {
    const validated = CreateEquipmentAssetSchema.parse(data);
    const repo = new EquipmentRepository(this.db);
    const asset = await repo.createAsset({
      ...validated,
      id: crypto.randomUUID(),
      outletId,
      createdBy: userId,
      manufacturer: validated.manufacturer ?? null,
      model: validated.model ?? null,
      serialNumber: validated.serialNumber ?? null,
      commissionedAt: validated.commissionedAt ?? null,
      notes: validated.notes ?? null,
    });
    await new AuditRepository(this.db).logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'EQUIPMENT_ASSET_CREATE',
        entityType: 'EQUIPMENT_ASSET',
        entityId: asset.id,
        newValue: asset as any,
        createdAt: new Date().toISOString()
    });
    return asset;
  }

  async createTicket(outletId: string, userId: string, data: any) {
    const validated = CreateEquipmentTicketSchema.parse(data);
    const repo = new EquipmentRepository(this.db);
    
    let equipmentTypeSnapshot = '';
    let equipmentLabelSnapshot = '';

    if (validated.dispenserId) {
        const dispenser = await repo.getDispenserById(validated.dispenserId);
        if (!dispenser || dispenser.outletId !== outletId) throw new EquipmentError('EQUIPMENT_TARGET_NOT_FOUND', 'Dispenser not found', 404);
        equipmentTypeSnapshot = 'DISPENSER';
        equipmentLabelSnapshot = dispenser.name;
    } else if (validated.equipmentAssetId) {
        const asset = await repo.getAssetById(validated.equipmentAssetId);
        if (!asset || asset.outletId !== outletId) throw new EquipmentError('EQUIPMENT_TARGET_NOT_FOUND', 'Asset not found', 404);
        equipmentTypeSnapshot = asset.equipmentType;
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
    
    await new AuditRepository(this.db).logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'EQUIPMENT_TICKET_CREATE',
        entityType: 'EQUIPMENT_BREAKDOWN_TICKET',
        entityId: ticket.id,
        newValue: ticket as any,
        createdAt: new Date().toISOString()
    });
    return ticket;
  }
  
  async getHealthSummary(outletId: string) {
    const tickets = await new EquipmentRepository(this.db).listTickets(outletId);
    
    const summary = {
        activeTicketCount: 0,
        criticalActiveCount: 0,
        resolvedAwaitingSignoffCount: 0,
        currentlyDownTargetCount: 0,
        countsByEquipmentType: {} as Record<string, number>,
        countsByStatus: {} as Record<string, number>,
        activeTargets: new Set<string>(),
    };

    for (const ticket of tickets) {
        summary.countsByStatus[ticket.status] = (summary.countsByStatus[ticket.status] || 0) + 1;
        summary.countsByEquipmentType[ticket.equipmentTypeSnapshot] = (summary.countsByEquipmentType[ticket.equipmentTypeSnapshot] || 0) + 1;
        
        if (['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(ticket.status)) {
            summary.activeTicketCount++;
            if (ticket.priority === 'CRITICAL') summary.criticalActiveCount++;
            const targetId = ticket.dispenserId || ticket.equipmentAssetId;
            if(targetId) summary.activeTargets.add(targetId);
        } else if (ticket.status === 'RESOLVED') {
            summary.resolvedAwaitingSignoffCount++;
        }
    }
    summary.currentlyDownTargetCount = summary.activeTargets.size;
    // @ts-ignore
    delete summary.activeTargets;
    return summary;
  }
}
