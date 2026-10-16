import { Hono } from 'hono';
import { getDb } from '../../db';
import { EnvBindings, requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { CreateDgDailyLogSchema, UpdateDgDailyLogSchema } from '../../shared/validators';
import { DgOperationsService } from '../services/dgOperationsService';
import { PERMISSIONS } from '../../shared/constants';

export const dgOperationsRoutes = new Hono<{ Bindings: EnvBindings }>();

dgOperationsRoutes.use('*', requireAuth);

// POST /api/v1/dg-operations/logs - Create DG Daily Log
dgOperationsRoutes.post('/dg-operations/logs', requirePermission(PERMISSIONS.DG_OPERATIONS_WRITE), async (c) => {
  const db = getDb(c.env.DB);
  const userCtx = c.var.user;
  const body = await c.req.json();

  const parseResult = CreateDgDailyLogSchema.safeParse(body);
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
    const input = {
        ...parseResult.data,
        remarks: parseResult.data.remarks ?? undefined
    };
    const log = await DgOperationsService.createLog(db, input, userCtx.user.id);
    return c.json({
      success: true,
      data: log,
      error: null,
    }, 201);
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'OPERATION_FAILED',
        message: err.message || 'Failed to create DG daily log',
      },
    }, 400);
  }
});

// GET /api/v1/dg-operations/logs - List DG Daily Logs for an Outlet
dgOperationsRoutes.get('/dg-operations/logs', requirePermission(PERMISSIONS.DG_OPERATIONS_READ), async (c) => {
  const db = getDb(c.env.DB);
  const outletId = c.req.query('outletId');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  if (!outletId) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'MISSING_PARAM',
        message: 'outletId query parameter is required',
      },
    }, 400);
  }

  try {
    const logs = await DgOperationsService.listLogsByOutlet(db, outletId, startDate, endDate);
    return c.json({
      success: true,
      data: logs,
      error: null,
    });
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'OPERATION_FAILED',
        message: err.message || 'Failed to fetch DG daily logs',
      },
    }, 400);
  }
});

// GET /api/v1/dg-operations/logs/:id - Get single DG log
dgOperationsRoutes.get('/dg-operations/logs/:id', requirePermission(PERMISSIONS.DG_OPERATIONS_READ), async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param('id') ?? '';

  try {
    const log = await DgOperationsService.getLogById(db, id);
    if (!log) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'NOT_FOUND',
          message: `DG daily log ${id} not found`,
        },
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
      error: {
        code: 'OPERATION_FAILED',
        message: err.message || 'Failed to fetch DG daily log',
      },
    }, 400);
  }
});

// PUT /api/v1/dg-operations/logs/:id - Update DG log
dgOperationsRoutes.put('/dg-operations/logs/:id', requirePermission(PERMISSIONS.DG_OPERATIONS_WRITE), async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
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
    const input = {
        ...parseResult.data,
        remarks: parseResult.data.remarks ?? undefined
    };
    const updated = await DgOperationsService.updateLog(db, id ?? '', input);
    return c.json({
      success: true,
      data: updated,
      error: null,
    });
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'OPERATION_FAILED',
        message: err.message || 'Failed to update DG daily log',
      },
    }, 400);
  }
});

// DELETE /api/v1/dg-operations/logs/:id - Delete DG log
dgOperationsRoutes.delete('/dg-operations/logs/:id', requirePermission(PERMISSIONS.DG_OPERATIONS_WRITE), async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param('id');

  try {
    await DgOperationsService.deleteLog(db, id ?? '');
    return c.json({
      success: true,
      data: { message: `DG daily log ${id} successfully deleted` },
      error: null,
    });
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'OPERATION_FAILED',
        message: err.message || 'Failed to delete DG daily log',
      },
    }, 400);
  }
});

// GET /api/v1/dg-operations/latest/:equipmentId - Get latest DG log
dgOperationsRoutes.get('/dg-operations/latest/:equipmentId', requirePermission(PERMISSIONS.DG_OPERATIONS_READ), async (c) => {
  const db = getDb(c.env.DB);
  const equipmentId = c.req.param('equipmentId') ?? '';

  try {
    const latest = await DgOperationsService.getLatestForEquipment(db, equipmentId);
    return c.json({
      success: true,
      data: latest,
      error: null,
    });
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'OPERATION_FAILED',
        message: err.message || 'Failed to fetch latest DG log',
      },
    }, 400);
  }
});
