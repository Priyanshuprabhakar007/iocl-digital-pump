import { Hono } from 'hono';
import { getDb } from '../../db';
import { EnvBindings, requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { CreateDgDailyLogSchema, UpdateDgDailyLogSchema } from '../../shared/validators';
import { DgOperationsService } from '../services/dgOperationsService';
import { ScopeService } from '../services/scopeService';
import { OutletRepository } from '../repositories/outletRepository';
import { equipmentAssets } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { PERMISSIONS } from '../../shared/constants';

export const dgOperationsRoutes = new Hono<{ Bindings: EnvBindings }>();

dgOperationsRoutes.use('*', requireAuth);

// 1. GET /outlets/:outletId/dg-logs?month=YYYY-MM - List DG logs for outlet
dgOperationsRoutes.get('/outlets/:outletId/dg-logs', requirePermission(PERMISSIONS.DG_OPERATIONS_READ), async (c) => {
  const db = getDb(c.env.DB);
  const userCtx = c.var.user;
  const outletId = c.req.param('outletId')!;
  const outletRepo = new OutletRepository(db);

  if (!await ScopeService.canAccessOutlet(userCtx, outletId, outletRepo)) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'You do not have access to this outlet' },
    }, 403);
  }

  const month = c.req.query('month');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  try {
    const logs = await DgOperationsService.listLogsByOutlet(db, outletId, {
      month,
      startDate,
      endDate,
    });
    return c.json({
      success: true,
      data: logs,
      error: null,
    });
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'OPERATION_FAILED', message: err.message || 'Failed to list DG logs' },
    }, 400);
  }
});

// 2. GET /outlets/:outletId/dg-logs/:businessDate - Get DG log for specific date
dgOperationsRoutes.get('/outlets/:outletId/dg-logs/:businessDate', requirePermission(PERMISSIONS.DG_OPERATIONS_READ), async (c) => {
  const db = getDb(c.env.DB);
  const userCtx = c.var.user;
  const outletId = c.req.param('outletId')!;
  const businessDate = c.req.param('businessDate')!;
  const outletRepo = new OutletRepository(db);

  if (!await ScopeService.canAccessOutlet(userCtx, outletId, outletRepo)) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'You do not have access to this outlet' },
    }, 403);
  }

  try {
    const log = await DgOperationsService.getLogByBusinessDate(db, outletId, businessDate);
    if (!log) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: `No DG daily log found for date ${businessDate}` },
      }, 404);
    }
    return c.json({
      success: true,
      data: log,
      error: null,
    });
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'OPERATION_FAILED', message: err.message || 'Failed to get DG log' },
    }, 400);
  }
});

// 3. POST /outlets/:outletId/dg-logs - Create DG log for outlet
dgOperationsRoutes.post('/outlets/:outletId/dg-logs', requirePermission(PERMISSIONS.DG_OPERATIONS_WRITE), async (c) => {
  const db = getDb(c.env.DB);
  const userCtx = c.var.user;
  const outletId = c.req.param('outletId')!;
  const outletRepo = new OutletRepository(db);

  if (!await ScopeService.canAccessOutlet(userCtx, outletId, outletRepo)) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'You do not have access to this outlet' },
    }, 403);
  }

  const body = await c.req.json();
  const parseResult = CreateDgDailyLogSchema.safeParse({
    ...body,
    outletId,
  });

  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input parameters for DG daily log',
        details: parseResult.error.format(),
      },
    }, 400);
  }

  try {
    const log = await DgOperationsService.createLog(
      db,
      {
        ...parseResult.data,
        outletId,
      },
      userCtx.user.id
    );
    return c.json({
      success: true,
      data: log,
      error: null,
    }, 201);
  } catch (err: any) {
    const isConflict = err.message?.includes('already exists');
    return c.json({
      success: false,
      data: null,
      error: {
        code: isConflict ? 'ALREADY_EXISTS' : 'OPERATION_FAILED',
        message: err.message || 'Failed to create DG daily log',
      },
    }, isConflict ? 409 : 400);
  }
});

// 4. PUT /dg-logs/:id - Update DG daily log
dgOperationsRoutes.put('/dg-logs/:id', requirePermission(PERMISSIONS.DG_OPERATIONS_WRITE), async (c) => {
  const db = getDb(c.env.DB);
  const userCtx = c.var.user;
  const id = c.req.param('id')!;
  const outletRepo = new OutletRepository(db);

  const existing = await DgOperationsService.getLogById(db, id);
  if (!existing) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: `DG daily log ${id} not found` },
    }, 404);
  }

  if (!await ScopeService.canAccessOutlet(userCtx, existing.outletId, outletRepo)) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'You do not have access to this outlet' },
    }, 403);
  }

  const body = await c.req.json();
  const parseResult = UpdateDgDailyLogSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input parameters for DG daily log update',
        details: parseResult.error.format(),
      },
    }, 400);
  }

  try {
    const updated = await DgOperationsService.updateLog(
      db,
      id,
      parseResult.data,
      userCtx.user.id
    );
    return c.json({
      success: true,
      data: updated,
      error: null,
    });
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'OPERATION_FAILED', message: err.message || 'Failed to update DG daily log' },
    }, 400);
  }
});

// 5. GET /dg-logs/latest/:equipmentAssetId or /dg-operations/latest/:equipmentId - Scoped latest log
const handleLatest = async (c: any) => {
  const db = getDb(c.env.DB);
  const userCtx = c.var.user;
  const equipmentAssetId = c.req.param('equipmentAssetId') || c.req.param('equipmentId') || '';
  const outletRepo = new OutletRepository(db);

  const equipmentRows = await db
    .select({ id: equipmentAssets.id, outletId: equipmentAssets.outletId })
    .from(equipmentAssets)
    .where(eq(equipmentAssets.id, equipmentAssetId))
    .limit(1);

  if (!equipmentRows || equipmentRows.length === 0) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: `Equipment asset ${equipmentAssetId} not found` },
    }, 404);
  }

  const equipment = equipmentRows[0];
  if (!await ScopeService.canAccessOutlet(userCtx, equipment.outletId, outletRepo)) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'You do not have access to this outlet' },
    }, 403);
  }

  try {
    const latest = await DgOperationsService.getLatestForEquipment(db, equipmentAssetId);
    return c.json({
      success: true,
      data: latest,
      error: null,
    });
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'OPERATION_FAILED', message: err.message || 'Failed to fetch latest DG log' },
    }, 400);
  }
};

dgOperationsRoutes.get('/dg-logs/latest/:equipmentAssetId', requirePermission(PERMISSIONS.DG_OPERATIONS_READ), handleLatest);
dgOperationsRoutes.get('/dg-operations/latest/:equipmentId', requirePermission(PERMISSIONS.DG_OPERATIONS_READ), handleLatest);
