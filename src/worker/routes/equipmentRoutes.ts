import { Hono } from 'hono';
import { EquipmentService } from '../services/equipmentService';
import { EquipmentRepository } from '../repositories/equipmentRepository';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../../shared/constants';
import { EquipmentError } from '../services/equipmentService';
import { getDb } from '../../db';

export const equipmentRoutes = new Hono();

equipmentRoutes.use('*', requireAuth);

equipmentRoutes.get('/outlets/:outletId/equipment/assets', requirePermission(PERMISSIONS.EQUIPMENT_READ), async (c) => {
  const outletId = c.req.param('outletId') as string;
  const db = getDb(c.env.DB);
  const assets = await new EquipmentRepository(db).listAssets(outletId);
  return c.json({ success: true, data: assets, error: null });
});

equipmentRoutes.post('/outlets/:outletId/equipment/assets', requirePermission(PERMISSIONS.EQUIPMENT_ASSETS_WRITE), async (c) => {
  const outletId = c.req.param('outletId') as string;
  const userId = c.get('user').user.id;
  const db = getDb(c.env.DB);
  const data = await c.req.json();
  const asset = await new EquipmentService(db).createAsset(outletId, userId, data);
  return c.json({ success: true, data: asset, error: null }, 201);
});

equipmentRoutes.post('/outlets/:outletId/equipment/tickets', requirePermission(PERMISSIONS.EQUIPMENT_TICKETS_CREATE), async (c) => {
  const outletId = c.req.param('outletId') as string;
  const userId = c.get('user').user.id;
  const db = getDb(c.env.DB);
  const data = await c.req.json();
  try {
      const ticket = await new EquipmentService(db).createTicket(outletId, userId, data);
      return c.json({ success: true, data: ticket, error: null }, 201);
  } catch (e) {
      if (e instanceof EquipmentError) return c.json({ success: false, data: null, error: { code: e.code, message: e.message } }, e.status as any);
      throw e;
  }
});

equipmentRoutes.get('/outlets/:outletId/equipment/tickets', requirePermission(PERMISSIONS.EQUIPMENT_READ), async (c) => {
    const outletId = c.req.param('outletId') as string;
    const db = getDb(c.env.DB);
    const tickets = await new EquipmentRepository(db).listTickets(outletId);
    return c.json({ success: true, data: tickets, error: null });
});

equipmentRoutes.get('/outlets/:outletId/equipment/health-summary', requirePermission(PERMISSIONS.EQUIPMENT_READ), async (c) => {
    const outletId = c.req.param('outletId') as string;
    const db = getDb(c.env.DB);
    const summary = await new EquipmentService(db).getHealthSummary(outletId);
    return c.json({ success: true, data: summary, error: null });
});
