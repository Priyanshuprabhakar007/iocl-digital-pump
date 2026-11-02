import { Hono } from 'hono';
import { getDb } from '../../db';
import { PumpRepository } from '../repositories/pumpRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { ScopeService } from '../services/scopeService';
import { TankCalibrationService } from '../services/tankCalibrationService';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import {
  TankCalibrationPointSchema,
  TankCalibrationBulkSchema,
  TankCalibrationChartStatusUpdateSchema,
  TankCalibrationDryRunSchema,
} from '../../shared/validators';
import { PERMISSIONS, ROLES } from '../../shared/constants';
import { parseMilliunits, formatMilliunits } from '../../shared/precision';

export const tankCalibration = new Hono<{ Bindings: EnvBindings }>();

tankCalibration.use('*', requireAuth as any);

async function verifyOutletAuthority(c: AppContext, outletId: string, outletRepo: OutletRepository): Promise<boolean> {
  const userCtx = c.var.user;
  if (!userCtx) return false;
  return ScopeService.canAccessOutlet(userCtx, outletId, outletRepo);
}

function canAuthorizeCalibrationActivation(c: AppContext): boolean {
  const userCtx = c.var.user;
  if (!userCtx) return false;
  return (
    userCtx.permissions.includes(PERMISSIONS.TANK_CALIBRATION_WRITE) &&
    (userCtx.permissions.includes(PERMISSIONS.TANKS_WRITE) ||
      userCtx.roles.includes(ROLES.ADMIN))
  );
}

// GET /api/v1/tanks/:tankId/calibration - List calibration points (plus versioned chart metadata)
tankCalibration.get('/tanks/:tankId/calibration', requirePermission(PERMISSIONS.TANK_CALIBRATION_READ) as any, async (c: AppContext) => {
  const tankId = c.req.param('tankId');
  if (!tankId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'tankId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  const tank = await pumpRepo.findTankById(tankId);
  if (!tank) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Tank not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, tank.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this tank outlet' } }, 403);
  }

  const queryChartId = c.req.query('chartId') || null;
  const queryRevStr = c.req.query('revision');
  const queryRev = queryRevStr ? Number(queryRevStr) : null;

  const charts = await pumpRepo.listCalibrationCharts(tankId);
  const activeChart = charts.find(ch => ch.status === 'ACTIVE') || null;

  let selectedChart = activeChart;
  if (queryChartId) {
    selectedChart = charts.find(ch => ch.id === queryChartId) || null;
  } else if (queryRev != null && Number.isFinite(queryRev)) {
    selectedChart = charts.find(ch => ch.revisionNumber === queryRev) || null;
  } else if (!selectedChart && charts.length > 0) {
    selectedChart = charts[0];
  }

  const points =
    queryChartId || queryRev != null
      ? await pumpRepo.listCalibrationPoints(tankId, {
          chartId: queryChartId,
          revisionNumber: queryRev,
        })
      : await pumpRepo.listCalibrationPoints(tankId, {
          chartId: selectedChart?.id || null,
        });

  return c.json({
    success: true,
    data: points,
    activeChart,
    selectedChart,
    charts,
    error: null,
  });
});

// GET /api/v1/tanks/:tankId/calibration/charts - List all chart revisions & metadata for a tank
tankCalibration.get('/tanks/:tankId/calibration/charts', requirePermission(PERMISSIONS.TANK_CALIBRATION_READ) as any, async (c: AppContext) => {
  const tankId = c.req.param('tankId');
  if (!tankId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'tankId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  const tank = await pumpRepo.findTankById(tankId);
  if (!tank) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Tank not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, tank.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this tank outlet' } }, 403);
  }

  const charts = await pumpRepo.listCalibrationCharts(tankId);
  const activeChart = charts.find(ch => ch.status === 'ACTIVE') || null;

  return c.json({
    success: true,
    data: {
      tankId,
      activeChart,
      charts,
    },
    error: null,
  });
});

// POST /api/v1/tanks/:tankId/calibration - Create a single calibration point
tankCalibration.post('/tanks/:tankId/calibration', requirePermission(PERMISSIONS.TANK_CALIBRATION_WRITE) as any, async (c: AppContext) => {
  const tankId = c.req.param('tankId');
  if (!tankId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'tankId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const tank = await pumpRepo.findTankById(tankId);
  if (!tank) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Tank not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, tank.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this tank outlet' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = TankCalibrationPointSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid calibration point payload', details: parseResult.error.flatten() },
    }, 400);
  }

  const { dipMillimetres, volumeLitres, chartId } = parseResult.data;
  const dipMilli = parseMilliunits(dipMillimetres);
  const volMilli = parseMilliunits(volumeLitres);

  // Verify target chart is not locked by historical readings before mutating
  let editableChart;
  try {
    editableChart = await pumpRepo.resolveEditableChartForSinglePoint(
      tankId,
      c.var.user!.user.id,
      chartId
    );
  } catch (err: any) {
    const status = err.code === 'CALIBRATION_CHART_LOCKED_HISTORICAL_REFERENCE' ? 409 : 400;
    return c.json({
      success: false,
      data: null,
      error: { code: err.code || 'CALIBRATION_LOCKED', message: err.message },
    }, status);
  }

  // Check monotonic consistency with existing points in this chart revision
  const existingPoints = await pumpRepo.listCalibrationPoints(tankId, {
    chartId: editableChart.id,
  });
  for (const pt of existingPoints) {
    if (pt.dipMillimetresMilliunits === dipMilli) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'DUPLICATE_DIP', message: `Calibration point for dip ${dipMillimetres} mm already exists` },
      }, 409);
    }
    if (pt.dipMillimetresMilliunits < dipMilli && pt.volumeMilliunits > volMilli) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'NON_MONOTONIC_CALIBRATION',
          message: `Volume ${volumeLitres} L at ${dipMillimetres} mm is less than ${pt.volumeLitreStr} L at ${pt.dipMmStr} mm`,
        },
      }, 400);
    }
    if (pt.dipMillimetresMilliunits > dipMilli && pt.volumeMilliunits < volMilli) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'NON_MONOTONIC_CALIBRATION',
          message: `Volume ${volumeLitres} L at ${dipMillimetres} mm is greater than ${pt.volumeLitreStr} L at ${pt.dipMmStr} mm`,
        },
      }, 400);
    }
  }

  const nowIso = new Date().toISOString();
  const pointId = `tcp-${crypto.randomUUID()}`;
  const created = await pumpRepo.createCalibrationPoint({
    id: pointId,
    chartId: editableChart.id,
    tankId,
    dipMillimetresMilliunits: dipMilli,
    volumeMilliunits: volMilli,
    createdAt: nowIso,
    createdBy: c.var.user!.user.id,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'TANK_CALIBRATION_POINT_CREATE',
    entityType: 'TANK_CALIBRATION',
    entityId: created.id,
    newValue: created as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: created, error: null }, 201);
});

// PUT /api/v1/tanks/:tankId/calibration/:pointId - Update a calibration point
tankCalibration.put('/tanks/:tankId/calibration/:pointId', requirePermission(PERMISSIONS.TANK_CALIBRATION_WRITE) as any, async (c: AppContext) => {
  const tankId = c.req.param('tankId');
  const pointId = c.req.param('pointId');
  if (!tankId || !pointId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'tankId and pointId are required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const tank = await pumpRepo.findTankById(tankId);
  if (!tank) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Tank not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, tank.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this tank outlet' } }, 403);
  }

  const existing = await pumpRepo.findCalibrationPointById(pointId);
  if (!existing || existing.tankId !== tankId) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Calibration point not found' } }, 404);
  }

  // Verify the chart owning this point is not locked by historical readings
  try {
    await pumpRepo.resolveEditableChartForSinglePoint(
      tankId,
      c.var.user!.user.id,
      existing.chartId
    );
  } catch (err: any) {
    const status = err.code === 'CALIBRATION_CHART_LOCKED_HISTORICAL_REFERENCE' ? 409 : 400;
    return c.json({
      success: false,
      data: null,
      error: { code: err.code || 'CALIBRATION_LOCKED', message: err.message },
    }, status);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = TankCalibrationPointSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid calibration point payload', details: parseResult.error.flatten() },
    }, 400);
  }

  const { dipMillimetres, volumeLitres } = parseResult.data;
  const dipMilli = parseMilliunits(dipMillimetres);
  const volMilli = parseMilliunits(volumeLitres);

  // Check monotonic consistency with all other points in the same chart revision
  const allPoints = await pumpRepo.listCalibrationPoints(tankId, {
    chartId: existing.chartId,
  });
  for (const pt of allPoints) {
    if (pt.id === pointId) continue;
    if (pt.dipMillimetresMilliunits === dipMilli) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'DUPLICATE_DIP', message: `Calibration point for dip ${dipMillimetres} mm already exists` },
      }, 409);
    }
    if (pt.dipMillimetresMilliunits < dipMilli && pt.volumeMilliunits > volMilli) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'NON_MONOTONIC_CALIBRATION',
          message: `Volume ${volumeLitres} L at ${dipMillimetres} mm is less than ${pt.volumeLitreStr} L at ${pt.dipMmStr} mm`,
        },
      }, 400);
    }
    if (pt.dipMillimetresMilliunits > dipMilli && pt.volumeMilliunits < volMilli) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'NON_MONOTONIC_CALIBRATION',
          message: `Volume ${volumeLitres} L at ${dipMillimetres} mm is greater than ${pt.volumeLitreStr} L at ${pt.dipMmStr} mm`,
        },
      }, 400);
    }
  }

  const updated = await pumpRepo.updateCalibrationPoint(
    pointId,
    {
      dipMillimetresMilliunits: dipMilli,
      volumeMilliunits: volMilli,
    },
    c.var.user!.user.id
  );

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'TANK_CALIBRATION_POINT_UPDATE',
    entityType: 'TANK_CALIBRATION',
    entityId: pointId,
    oldValue: existing as unknown as Record<string, unknown>,
    newValue: updated as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: new Date().toISOString(),
  });

  return c.json({ success: true, data: updated, error: null });
});

// DELETE /api/v1/tanks/:tankId/calibration/:pointId - Delete a calibration point
tankCalibration.delete('/tanks/:tankId/calibration/:pointId', requirePermission(PERMISSIONS.TANK_CALIBRATION_WRITE) as any, async (c: AppContext) => {
  const tankId = c.req.param('tankId');
  const pointId = c.req.param('pointId');
  if (!tankId || !pointId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'tankId and pointId are required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const tank = await pumpRepo.findTankById(tankId);
  if (!tank) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Tank not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, tank.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this tank outlet' } }, 403);
  }

  const existing = await pumpRepo.findCalibrationPointById(pointId);
  if (!existing || existing.tankId !== tankId) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Calibration point not found' } }, 404);
  }

  try {
    await pumpRepo.deleteCalibrationPoint(pointId, c.var.user!.user.id);
  } catch (err: any) {
    const status = err.code === 'CALIBRATION_CHART_LOCKED_HISTORICAL_REFERENCE' ? 409 : 400;
    return c.json({
      success: false,
      data: null,
      error: { code: err.code || 'CALIBRATION_LOCKED', message: err.message },
    }, status);
  }

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'TANK_CALIBRATION_POINT_DELETE',
    entityType: 'TANK_CALIBRATION',
    entityId: pointId,
    oldValue: existing as unknown as Record<string, unknown>,
    newValue: null,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: new Date().toISOString(),
  });

  return c.json({ success: true, data: { message: 'Calibration point deleted' }, error: null });
});

// POST /api/v1/tanks/:tankId/calibration/bulk - Bulk import calibration chart (version-safe)
tankCalibration.post('/tanks/:tankId/calibration/bulk', requirePermission(PERMISSIONS.TANK_CALIBRATION_WRITE) as any, async (c: AppContext) => {
  const tankId = c.req.param('tankId');
  if (!tankId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'tankId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const tank = await pumpRepo.findTankById(tankId);
  if (!tank) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Tank not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, tank.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this tank outlet' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = TankCalibrationBulkSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid bulk calibration payload', details: parseResult.error.flatten() },
    }, 400);
  }

  const {
    points: rawPoints,
    metadata,
    activateImmediately,
    saveMode,
    createNewRevision,
    allowOverCapacity,
    chartId,
  } = parseResult.data;

  const resolvedSaveMode: 'ACTIVE' | 'DRAFT' | 'APPROVED' =
    activateImmediately === true || saveMode === 'ACTIVE'
      ? 'ACTIVE'
      : saveMode === 'APPROVED'
        ? 'APPROVED'
        : 'DRAFT';

  if (
    (resolvedSaveMode === 'ACTIVE' || resolvedSaveMode === 'APPROVED') &&
    !canAuthorizeCalibrationActivation(c)
  ) {
    return c.json(
      {
        success: false,
        data: null,
        error: {
          code: 'CALIBRATION_ACTIVATION_FORBIDDEN',
          message:
            'Immediate activation or approval of a tank calibration chart requires explicit tank infrastructure authorization (TANKS_WRITE or ADMIN). Save as DRAFT instead.',
        },
      },
      403
    );
  }

  const parsedPoints: Array<{ dipMillimetresMilliunits: number; volumeMilliunits: number }> = [];

  for (const pt of rawPoints) {
    parsedPoints.push({
      dipMillimetresMilliunits: parseMilliunits(pt.dipMillimetres),
      volumeMilliunits: parseMilliunits(pt.volumeLitres),
    });
  }

  const sortedPoints = [...parsedPoints].sort(
    (a, b) => a.dipMillimetresMilliunits - b.dipMillimetresMilliunits
  );

  // Validate duplicates and monotonicity before DB execution
  for (let i = 0; i < sortedPoints.length - 1; i++) {
    if (sortedPoints[i].dipMillimetresMilliunits === sortedPoints[i + 1].dipMillimetresMilliunits) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'DUPLICATE_DIP',
          message: `Duplicate dip height ${formatMilliunits(sortedPoints[i].dipMillimetresMilliunits)} mm in calibration chart`,
        },
      }, 409);
    }
    if (sortedPoints[i].volumeMilliunits > sortedPoints[i + 1].volumeMilliunits) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'NON_MONOTONIC_CALIBRATION',
          message: `Non-monotonic calibration chart: volume ${formatMilliunits(sortedPoints[i].volumeMilliunits)} L at ${formatMilliunits(sortedPoints[i].dipMillimetresMilliunits)} mm is greater than volume ${formatMilliunits(sortedPoints[i + 1].volumeMilliunits)} L at ${formatMilliunits(sortedPoints[i + 1].dipMillimetresMilliunits)} mm`,
        },
      }, 400);
    }
  }

  const maxPointDipMilli = sortedPoints[sortedPoints.length - 1].dipMillimetresMilliunits;
  const maxPointVolMilli = sortedPoints[sortedPoints.length - 1].volumeMilliunits;

  // Validate physical dimensions / maximum dip range when provided
  const tankDiameterMmMilliunits = metadata?.tankDiameterMm
    ? parseMilliunits(metadata.tankDiameterMm)
    : null;
  const tankLengthMmMilliunits = metadata?.tankLengthMm
    ? parseMilliunits(metadata.tankLengthMm)
    : null;
  const declaredMaxDipMmMilliunits = metadata?.maxDipMm
    ? parseMilliunits(metadata.maxDipMm)
    : null;
  const declaredChartCapacityMilliunits = metadata?.chartCapacityLitres
    ? parseMilliunits(metadata.chartCapacityLitres)
    : null;

  if (declaredMaxDipMmMilliunits != null && maxPointDipMilli > declaredMaxDipMmMilliunits) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'MAX_DIP_RANGE_EXCEEDED',
        message: `Chart point dip ${formatMilliunits(maxPointDipMilli)} mm exceeds declared maximum dip range ${formatMilliunits(declaredMaxDipMmMilliunits)} mm`,
      },
    }, 400);
  }

  if (tankDiameterMmMilliunits != null && maxPointDipMilli > tankDiameterMmMilliunits) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'MAX_DIP_EXCEEDS_DIAMETER',
        message: `Chart maximum dip ${formatMilliunits(maxPointDipMilli)} mm exceeds internal tank diameter ${formatMilliunits(tankDiameterMmMilliunits)} mm`,
      },
    }, 400);
  }

  // Validate capacity conflict when allowOverCapacity is explicitly false
  const tankCapacityMilliunits = Math.round(tank.capacityLitres * 1000);
  if (allowOverCapacity === false && maxPointVolMilli > tankCapacityMilliunits) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'CAPACITY_CONFLICT',
        message: `Chart maximum volume ${formatMilliunits(maxPointVolMilli)} L exceeds nominal tank capacity ${tank.capacityLitres.toLocaleString()} L`,
      },
    }, 400);
  }

  try {
    const imported = await pumpRepo.bulkImportCalibrationPoints(
      tankId,
      parsedPoints,
      c.var.user!.user.id,
      {
        saveMode: resolvedSaveMode,
        activateImmediately: resolvedSaveMode === 'ACTIVE',
        createNewRevision,
        chartId,
        metadata: metadata
          ? {
              chartUnitDip: metadata.chartUnitDip,
              chartUnitVolume: metadata.chartUnitVolume,
              tankDiameterMmMilliunits,
              tankLengthMmMilliunits,
              maxDipMmMilliunits: declaredMaxDipMmMilliunits ?? maxPointDipMilli,
              chartCapacityMilliunits: declaredChartCapacityMilliunits ?? maxPointVolMilli,
              sourceFileName: metadata.sourceFileName ?? null,
              referenceDocument: metadata.referenceDocument ?? null,
              notes: metadata.notes ?? null,
              effectiveFrom: metadata.effectiveFrom,
              effectiveTo: metadata.effectiveTo ?? null,
            }
          : undefined,
      }
    );

    const savedChartId = imported[0]?.chartId || null;
    const savedChart = savedChartId
      ? await pumpRepo.findCalibrationChartById(savedChartId)
      : null;
    const allCharts = await pumpRepo.listCalibrationCharts(tankId);

    await auditRepo.logAction({
      id: `aud-${crypto.randomUUID()}`,
      userId: c.var.user!.user.id,
      action: 'TANK_CALIBRATION_BULK_IMPORT',
      entityType: 'TANK_CALIBRATION',
      entityId: tankId,
      newValue: {
        count: imported.length,
        chartId: savedChart?.id ?? null,
        revisionNumber: savedChart?.revisionNumber ?? 1,
        status: savedChart?.status ?? resolvedSaveMode,
        activateImmediately: resolvedSaveMode === 'ACTIVE',
        sourceFileName: savedChart?.sourceFileName ?? null,
        effectiveFrom: savedChart?.effectiveFrom ?? null,
      } as Record<string, unknown>,
      ipAddress: c.req.header('cf-connecting-ip') || null,
      userAgent: c.req.header('user-agent') || null,
      createdAt: new Date().toISOString(),
    });

    return c.json(
      {
        success: true,
        data: imported,
        importedCount: imported.length,
        chart: savedChart,
        charts: allCharts,
        error: null,
      },
      201
    );
  } catch (err: any) {
    const status = err.code === 'CALIBRATION_CHART_LOCKED_HISTORICAL_REFERENCE' ? 409 : 400;
    return c.json({
      success: false,
      data: null,
      error: { code: err.code || 'CALIBRATION_IMPORT_FAILED', message: err.message },
    }, status);
  }
});

// POST /api/v1/tanks/:tankId/calibration/charts/:chartId/status - Transition chart revision status (DRAFT -> APPROVED / ACTIVE / ARCHIVED)
tankCalibration.post('/tanks/:tankId/calibration/charts/:chartId/status', requirePermission(PERMISSIONS.TANK_CALIBRATION_WRITE) as any, async (c: AppContext) => {
  const tankId = c.req.param('tankId');
  const chartId = c.req.param('chartId');
  if (!tankId || !chartId) {
    return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'tankId and chartId are required' } }, 400);
  }

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const tank = await pumpRepo.findTankById(tankId);
  if (!tank) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Tank not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, tank.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this tank outlet' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = TankCalibrationChartStatusUpdateSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid chart status update payload', details: parseResult.error.flatten() },
    }, 400);
  }

  const existingChart = await pumpRepo.findCalibrationChartById(chartId);
  if (!existingChart || existingChart.tankId !== tankId) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Calibration chart revision not found' } }, 404);
  }

  if (
    (parseResult.data.status === 'ACTIVE' || parseResult.data.status === 'APPROVED') &&
    !canAuthorizeCalibrationActivation(c)
  ) {
    return c.json(
      {
        success: false,
        data: null,
        error: {
          code: 'CALIBRATION_ACTIVATION_FORBIDDEN',
          message:
            'Approving or activating a tank calibration chart revision requires explicit tank infrastructure authorization (TANKS_WRITE or ADMIN).',
        },
      },
      403
    );
  }

  try {
    const updatedChart = await pumpRepo.updateCalibrationChartStatus(
      tankId,
      chartId,
      parseResult.data.status,
      c.var.user!.user.id,
      {
        effectiveFrom: parseResult.data.effectiveFrom,
        effectiveTo: parseResult.data.effectiveTo,
        notes: parseResult.data.notes,
      }
    );

    await auditRepo.logAction({
      id: `aud-${crypto.randomUUID()}`,
      userId: c.var.user!.user.id,
      action: 'TANK_CALIBRATION_CHART_STATUS_UPDATE',
      entityType: 'TANK_CALIBRATION',
      entityId: chartId,
      oldValue: { status: existingChart.status, revisionNumber: existingChart.revisionNumber },
      newValue: {
        status: updatedChart.status,
        revisionNumber: updatedChart.revisionNumber,
        effectiveFrom: updatedChart.effectiveFrom,
        effectiveTo: updatedChart.effectiveTo,
      },
      ipAddress: c.req.header('cf-connecting-ip') || null,
      userAgent: c.req.header('user-agent') || null,
      createdAt: new Date().toISOString(),
    });

    const allCharts = await pumpRepo.listCalibrationCharts(tankId);
    return c.json({
      success: true,
      data: updatedChart,
      charts: allCharts,
      error: null,
    });
  } catch (err: any) {
    const status = err.code === 'CALIBRATION_CHART_LOCKED_HISTORICAL_REFERENCE' ? 409 : 400;
    return c.json({
      success: false,
      data: null,
      error: { code: err.code || 'STATUS_UPDATE_FAILED', message: err.message },
    }, status);
  }
});

// POST /api/v1/tanks/:tankId/calibration/charts/fork - Fork a locked/existing revision into a new editable revision
tankCalibration.post('/tanks/:tankId/calibration/charts/fork', requirePermission(PERMISSIONS.TANK_CALIBRATION_WRITE) as any, async (c: AppContext) => {
  const tankId = c.req.param('tankId');
  if (!tankId) {
    return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'tankId is required' } }, 400);
  }

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const tank = await pumpRepo.findTankById(tankId);
  if (!tank) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Tank not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, tank.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this tank outlet' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const sourceChartId = typeof body?.sourceChartId === 'string' ? body.sourceChartId : null;
  const saveMode =
    body?.activateImmediately === true || body?.saveMode === 'ACTIVE'
      ? 'ACTIVE'
      : 'DRAFT';
  if (saveMode === 'ACTIVE' && !canAuthorizeCalibrationActivation(c)) {
    return c.json(
      {
        success: false,
        data: null,
        error: {
          code: 'CALIBRATION_ACTIVATION_FORBIDDEN',
          message:
            'Immediate activation of a forked calibration chart requires explicit tank infrastructure authorization (TANKS_WRITE or ADMIN).',
        },
      },
      403
    );
  }
  const notes = typeof body?.notes === 'string' ? body.notes : null;
  const effectiveFrom = typeof body?.effectiveFrom === 'string' ? body.effectiveFrom : undefined;

  try {
    const forked = await pumpRepo.forkCalibrationChartRevision(
      tankId,
      sourceChartId,
      c.var.user!.user.id,
      { saveMode, notes, effectiveFrom }
    );

    await auditRepo.logAction({
      id: `aud-${crypto.randomUUID()}`,
      userId: c.var.user!.user.id,
      action: 'TANK_CALIBRATION_CHART_FORK',
      entityType: 'TANK_CALIBRATION',
      entityId: forked.chart.id,
      newValue: {
        tankId,
        sourceChartId,
        newChartId: forked.chart.id,
        revisionNumber: forked.chart.revisionNumber,
        status: forked.chart.status,
      },
      ipAddress: c.req.header('cf-connecting-ip') || null,
      userAgent: c.req.header('user-agent') || null,
      createdAt: new Date().toISOString(),
    });

    const charts = await pumpRepo.listCalibrationCharts(tankId);
    return c.json({
      success: true,
      data: forked,
      charts,
      error: null,
    }, 201);
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: { code: err.code || 'FORK_REVISION_FAILED', message: err.message },
    }, 400);
  }
});

// POST /api/v1/tanks/:tankId/calibration/dry-run - Dry-run comparison against original printed IOCL chart checkpoints
tankCalibration.post('/tanks/:tankId/calibration/dry-run', requirePermission(PERMISSIONS.TANK_CALIBRATION_READ) as any, async (c: AppContext) => {
  const tankId = c.req.param('tankId');
  if (!tankId) {
    return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'tankId is required' } }, 400);
  }

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  const tank = await pumpRepo.findTankById(tankId);
  if (!tank) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Tank not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, tank.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this tank outlet' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = TankCalibrationDryRunSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid dry-run comparison payload', details: parseResult.error.flatten() },
    }, 400);
  }

  const { chartId, candidatePoints, checkpoints, toleranceLitres } = parseResult.data;
  const toleranceMilliunits = toleranceLitres ? parseMilliunits(toleranceLitres) : 2000;

  let pointsToEvaluate: Array<{ dipMillimetresMilliunits: number; volumeMilliunits: number }> = [];
  let resolvedChartId: string | null = chartId || null;
  let resolvedRevisionNumber: number | null = null;

  if (candidatePoints && candidatePoints.length >= 2) {
    pointsToEvaluate = candidatePoints.map(pt => ({
      dipMillimetresMilliunits: parseMilliunits(pt.dipMillimetres),
      volumeMilliunits: parseMilliunits(pt.volumeLitres),
    }));
  } else {
    const resolved = await TankCalibrationService.resolveTankChartAndPoints(
      db,
      tankId,
      chartId
    );
    pointsToEvaluate = resolved.points.map(p => ({
      dipMillimetresMilliunits: p.dipMillimetresMilliunits,
      volumeMilliunits: p.volumeMilliunits,
    }));
    resolvedChartId = resolved.chart?.id ?? null;
    resolvedRevisionNumber = resolved.chart?.revisionNumber ?? null;
  }

  if (pointsToEvaluate.length < 2) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'CALIBRATION_NOT_AVAILABLE',
        message: 'At least 2 calibration chart points are required to run a dry-run comparison',
      },
    }, 400);
  }

  const report = TankCalibrationService.compareAgainstPrintedChart(
    tankId,
    pointsToEvaluate,
    checkpoints,
    {
      chartId: resolvedChartId,
      revisionNumber: resolvedRevisionNumber,
      toleranceMilliunits,
    }
  );

  return c.json({
    success: true,
    data: report,
    error: null,
  });
});

// POST /api/v1/tanks/:tankId/convert-dip - Single dip-to-volume conversion
tankCalibration.post('/tanks/:tankId/convert-dip', requirePermission(PERMISSIONS.TANK_CALIBRATION_READ) as any, async (c: AppContext) => {
  const tankId = c.req.param('tankId');
  if (!tankId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'tankId is required' } }, 400);

  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({}));
  const dipMmStr = body?.dipMillimetres;
  const chartId = typeof body?.chartId === 'string' ? body.chartId : undefined;
  if (!dipMmStr) {
    return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'dipMillimetres is required' } }, 400);
  }

  try {
    const dipMilli = parseMilliunits(dipMmStr);
    const result = await TankCalibrationService.convertDipToVolume(db, tankId, dipMilli, {
      chartId,
    });
    return c.json({ success: true, data: result, error: null });
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: { code: err.code || 'CONVERSION_ERROR', message: err.message },
    }, 400);
  }
});

export default tankCalibration;

