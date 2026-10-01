import { Hono } from 'hono';
import { getDb } from '../../db';
import { EquipmentRepository } from '../repositories/equipmentRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { EquipmentService, EquipmentError } from '../services/equipmentService';
import { ScopeService } from '../services/scopeService';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../../shared/constants';
import { EquipmentTicketFilterSchema } from '../../shared/validators';

export const equipmentRoutes = new Hono<{ Bindings: EnvBindings }>();

equipmentRoutes.use('*', requireAuth as any);

async function verifyOutletAuthority(c: AppContext, outletId: string, outletRepo: OutletRepository): Promise<boolean> {
  const userCtx = c.var.user;
  if (!userCtx) return false;
  return ScopeService.canAccessOutlet(userCtx, outletId, outletRepo);
}

function getServices(c: AppContext) {
  const db = getDb(c.env.DB);
  const equipmentRepo = new EquipmentRepository(db);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);
  const equipmentService = new EquipmentService(db);
  return { equipmentService, equipmentRepo, outletRepo };
}

function handleEquipmentError(c: AppContext, err: any) {
  if (err instanceof EquipmentError) {
    return c.json({
      success: false,
      data: null,
      error: { code: err.code, message: err.message },
    }, err.status as any);
  }
  if (err.name === 'ZodError') {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: err.errors?.[0]?.message || 'Validation error', details: err.format?.() },
    }, 400);
  }
  console.error('[Equipment Operation Error]:', err);
  return c.json({
    success: false,
    data: null,
    error: { code: 'INTERNAL_SERVER_ERROR', message: err.message || 'An error occurred' },
  }, 500);
}

// ASSETS
equipmentRoutes.get('/outlets/:outletId/equipment/assets', requirePermission(PERMISSIONS.EQUIPMENT_READ) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId')!;
  const { equipmentRepo, outletRepo } = getServices(c);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const equipmentType = c.req.query('equipmentType');
  const status = c.req.query('status');

  const assets = await equipmentRepo.listAssets(outletId, { equipmentType, status });
  return c.json({ success: true, data: assets, error: null });
});

equipmentRoutes.post('/outlets/:outletId/equipment/assets', requirePermission(PERMISSIONS.EQUIPMENT_ASSETS_WRITE) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId')!;
  const userId = c.var.user.user.id;
  const { equipmentService, outletRepo } = getServices(c);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const data = await c.req.json();
  try {
      const asset = await equipmentService.createAsset(outletId, userId, data);
      return c.json({ success: true, data: asset, error: null }, 201);
  } catch (err) {
      return handleEquipmentError(c, err);
  }
});

equipmentRoutes.put('/equipment/assets/:id', requirePermission(PERMISSIONS.EQUIPMENT_ASSETS_WRITE) as any, async (c: AppContext) => {
  const assetId = c.req.param('id')!;
  const userId = c.var.user.user.id;
  const { equipmentService, equipmentRepo, outletRepo } = getServices(c);

  const asset = await equipmentRepo.getAssetById(assetId);
  if (!asset) {
    return c.json({ success: false, data: null, error: { code: 'EQUIPMENT_ASSET_NOT_FOUND', message: 'Asset not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, asset.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const data = await c.req.json();
  try {
      const updated = await equipmentService.updateAsset(assetId, userId, data);
      return c.json({ success: true, data: updated, error: null });
  } catch (err) {
      return handleEquipmentError(c, err);
  }
});

// TARGETS
equipmentRoutes.get('/outlets/:outletId/equipment/targets', requirePermission(PERMISSIONS.EQUIPMENT_READ) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId')!;
  const { equipmentService, outletRepo } = getServices(c);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const targets = await equipmentService.listTargets(outletId);
  return c.json({ success: true, data: targets, error: null });
});

// TICKETS
equipmentRoutes.post('/outlets/:outletId/equipment/tickets', requirePermission(PERMISSIONS.EQUIPMENT_TICKETS_CREATE) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId')!;
  const userId = c.var.user.user.id;
  const { equipmentService, outletRepo } = getServices(c);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const data = await c.req.json();
  try {
      const ticket = await equipmentService.createTicket(outletId, userId, data);
      return c.json({ success: true, data: ticket, error: null }, 201);
  } catch (err) {
      return handleEquipmentError(c, err);
  }
});

equipmentRoutes.get('/outlets/:outletId/equipment/tickets', requirePermission(PERMISSIONS.EQUIPMENT_READ) as any, async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { equipmentRepo, outletRepo } = getServices(c);

    if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    const query = {
      status: c.req.query('status'),
      priority: c.req.query('priority'),
      equipmentType: c.req.query('equipmentType'),
    };
    const parsed = EquipmentTicketFilterSchema.safeParse(query);
    if (!parsed.success) {
      return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid filters' } }, 400);
    }

    const tickets = await equipmentRepo.listTickets(outletId, parsed.data as any);
    return c.json({ success: true, data: tickets, error: null });
});

equipmentRoutes.get('/equipment/tickets/:id', requirePermission(PERMISSIONS.EQUIPMENT_READ) as any, async (c: AppContext) => {
    const ticketId = c.req.param('id')!;
    const { equipmentRepo, outletRepo } = getServices(c);

    const ticket = await equipmentRepo.getTicketById(ticketId);
    if (!ticket) {
        return c.json({ success: false, data: null, error: { code: 'EQUIPMENT_TICKET_NOT_FOUND', message: 'Ticket not found' } }, 404);
    }

    if (!await verifyOutletAuthority(c, ticket.outletId, outletRepo)) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    return c.json({ success: true, data: ticket, error: null });
});

equipmentRoutes.get('/equipment/tickets/:id/events', requirePermission(PERMISSIONS.EQUIPMENT_READ) as any, async (c: AppContext) => {
    const ticketId = c.req.param('id')!;
    const { equipmentRepo, outletRepo } = getServices(c);

    const ticket = await equipmentRepo.getTicketById(ticketId);
    if (!ticket) {
        return c.json({ success: false, data: null, error: { code: 'EQUIPMENT_TICKET_NOT_FOUND', message: 'Ticket not found' } }, 404);
    }

    if (!await verifyOutletAuthority(c, ticket.outletId, outletRepo)) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    const events = await equipmentRepo.listEvents(ticketId);
    return c.json({ success: true, data: events, error: null });
});

equipmentRoutes.post('/equipment/tickets/:id/assign', requirePermission(PERMISSIONS.EQUIPMENT_TICKETS_MANAGE) as any, async (c: AppContext) => {
    const ticketId = c.req.param('id')!;
    const userId = c.var.user.user.id;
    const { equipmentService, equipmentRepo, outletRepo } = getServices(c);

    const ticket = await equipmentRepo.getTicketById(ticketId);
    if (!ticket) {
        return c.json({ success: false, data: null, error: { code: 'EQUIPMENT_TICKET_NOT_FOUND', message: 'Ticket not found' } }, 404);
    }

    if (!await verifyOutletAuthority(c, ticket.outletId, outletRepo)) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    const data = await c.req.json();
    try {
        const updated = await equipmentService.assignTicket(ticketId, userId, data);
        return c.json({ success: true, data: updated, error: null });
    } catch (err) {
        return handleEquipmentError(c, err);
    }
});

equipmentRoutes.post('/equipment/tickets/:id/start', requirePermission(PERMISSIONS.EQUIPMENT_TICKETS_MANAGE) as any, async (c: AppContext) => {
    const ticketId = c.req.param('id')!;
    const userId = c.var.user.user.id;
    const { equipmentService, equipmentRepo, outletRepo } = getServices(c);

    const ticket = await equipmentRepo.getTicketById(ticketId);
    if (!ticket) {
        return c.json({ success: false, data: null, error: { code: 'EQUIPMENT_TICKET_NOT_FOUND', message: 'Ticket not found' } }, 404);
    }

    if (!await verifyOutletAuthority(c, ticket.outletId, outletRepo)) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
        const updated = await equipmentService.startTicket(ticketId, userId);
        return c.json({ success: true, data: updated, error: null });
    } catch (err) {
        return handleEquipmentError(c, err);
    }
});

equipmentRoutes.post('/equipment/tickets/:id/resolve', requirePermission(PERMISSIONS.EQUIPMENT_TICKETS_MANAGE) as any, async (c: AppContext) => {
    const ticketId = c.req.param('id')!;
    const userId = c.var.user.user.id;
    const { equipmentService, equipmentRepo, outletRepo } = getServices(c);

    const ticket = await equipmentRepo.getTicketById(ticketId);
    if (!ticket) {
        return c.json({ success: false, data: null, error: { code: 'EQUIPMENT_TICKET_NOT_FOUND', message: 'Ticket not found' } }, 404);
    }

    if (!await verifyOutletAuthority(c, ticket.outletId, outletRepo)) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    const data = await c.req.json();
    try {
        const updated = await equipmentService.resolveTicket(ticketId, userId, data);
        return c.json({ success: true, data: updated, error: null });
    } catch (err) {
        return handleEquipmentError(c, err);
    }
});

equipmentRoutes.post('/equipment/tickets/:id/signoff', requirePermission(PERMISSIONS.EQUIPMENT_TICKETS_SIGNOFF) as any, async (c: AppContext) => {
    const ticketId = c.req.param('id')!;
    const userId = c.var.user.user.id;
    const { equipmentService, equipmentRepo, outletRepo } = getServices(c);

    const ticket = await equipmentRepo.getTicketById(ticketId);
    if (!ticket) {
        return c.json({ success: false, data: null, error: { code: 'EQUIPMENT_TICKET_NOT_FOUND', message: 'Ticket not found' } }, 404);
    }

    if (!await verifyOutletAuthority(c, ticket.outletId, outletRepo)) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    const data = await c.req.json();
    try {
        const updated = await equipmentService.signoffTicket(ticketId, userId, data);
        return c.json({ success: true, data: updated, error: null });
    } catch (err) {
        return handleEquipmentError(c, err);
    }
});

equipmentRoutes.post('/equipment/tickets/:id/cancel', requirePermission(PERMISSIONS.EQUIPMENT_TICKETS_MANAGE) as any, async (c: AppContext) => {
    const ticketId = c.req.param('id')!;
    const userId = c.var.user.user.id;
    const { equipmentService, equipmentRepo, outletRepo } = getServices(c);

    const ticket = await equipmentRepo.getTicketById(ticketId);
    if (!ticket) {
        return c.json({ success: false, data: null, error: { code: 'EQUIPMENT_TICKET_NOT_FOUND', message: 'Ticket not found' } }, 404);
    }

    if (!await verifyOutletAuthority(c, ticket.outletId, outletRepo)) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    const data = await c.req.json();
    try {
        const updated = await equipmentService.cancelTicket(ticketId, userId, data);
        return c.json({ success: true, data: updated, error: null });
    } catch (err) {
        return handleEquipmentError(c, err);
    }
});

equipmentRoutes.get('/outlets/:outletId/equipment/health-summary', requirePermission(PERMISSIONS.EQUIPMENT_READ) as any, async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { equipmentService, outletRepo } = getServices(c);

    if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    const summary = await equipmentService.getHealthSummary(outletId);
    return c.json({ success: true, data: summary, error: null });
});
