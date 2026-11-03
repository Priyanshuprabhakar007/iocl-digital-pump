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
              effectiveFrom: metadata.effectiveFrom ?? undefined,
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
        effectiveFrom: parseResult.data.effectiveFrom ?? undefined,
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

// ==========================================
// GLOBAL TANK CALIBRATION TEMPLATE ROUTES
// ==========================================

// GET /api/v1/calibration-templates - List global calibration templates
tankCalibration.get('/calibration-templates', requirePermission(PERMISSIONS.TANK_CALIBRATION_READ) as any, async (c: AppContext) => {
  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);

  const status = c.req.query('status');
  const capacityStr = c.req.query('capacity');
  const capacity = capacityStr ? Number(capacityStr) : undefined;

  const templates = await pumpRepo.listGlobalTankCalibrationTemplates({
    status: status || undefined,
    nominalCapacityLitres: capacity,
  });

  return c.json({
    success: true,
    data: templates,
    error: null,
  });
});

// GET /api/v1/calibration-templates/audit-logs - List audit trail for global calibration templates
tankCalibration.get('/calibration-templates/audit-logs', requirePermission(PERMISSIONS.TANK_CALIBRATION_READ) as any, async (c: AppContext) => {
  const db = getDb(c.env.DB);
  const auditRepo = new AuditRepository(db);

  const limitParam = c.req.query('limit');
  const entityId = c.req.query('entityId') || undefined;
  const limit = limitParam !== undefined ? Math.min(200, Math.max(1, parseInt(limitParam, 10) || 50)) : 50;

  const logs = await auditRepo.listLogs(limit, 0, {
    entityType: 'GLOBAL_TANK_CALIBRATION_TEMPLATE',
    entityId,
  });

  return c.json({
    success: true,
    data: logs,
    error: null,
  });
});

// GET /api/v1/calibration-templates/:id/eligible-tanks - List eligible COCO tanks by capacity and physical dimensions
tankCalibration.get('/calibration-templates/:id/eligible-tanks', requirePermission(PERMISSIONS.TANK_CALIBRATION_READ) as any, async (c: AppContext) => {
  const id = c.req.param('id') || '';
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'Template ID is required' } }, 400);

  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);

  const outletId = c.req.query('outletId') || undefined;
  const includeNonMatching = c.req.query('includeNonMatching') === 'true';

  try {
    const result = await pumpRepo.listEligibleCocoTanksForTemplate(id, {
      outletId,
      includeNonMatching,
    });
    return c.json({
      success: true,
      data: result,
      error: null,
    });
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: { code: err.code || 'NOT_FOUND', message: err.message },
    }, 404);
  }
});

// GET /api/v1/calibration-templates/:id - Get global template details with points
tankCalibration.get('/calibration-templates/:id', requirePermission(PERMISSIONS.TANK_CALIBRATION_READ) as any, async (c: AppContext) => {
  const id = c.req.param('id') || '';
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'Template ID is required' } }, 400);

  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);

  const template = await pumpRepo.findGlobalTankCalibrationTemplateById(id);
  if (!template) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Global calibration template not found' } }, 404);
  }

  return c.json({
    success: true,
    data: template,
    error: null,
  });
});

function parseGlobalTemplateCsvOrPoints(body: any): {
  parsedPoints: { dipMillimetresMilliunits: number; volumeMilliunits: number }[];
  parseErrors: string[];
} {
  const parseErrors: string[] = [];
  const parsedPoints: { dipMillimetresMilliunits: number; volumeMilliunits: number }[] = [];

  const rawText = typeof body?.csvText === 'string'
    ? body.csvText
    : typeof body?.csvData === 'string'
      ? body.csvData
      : typeof body?.rawText === 'string'
        ? body.rawText
        : null;

  if (rawText !== null && rawText.trim().length > 0) {
    const lines = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Skip header line
      if (/^(dip|height|depth|mm|level)/i.test(trimmed) && /(vol|lit|ltr|cap)/i.test(trimmed)) {
        continue;
      }

      if (/\b(cm|centimet|inch|in\b|ft|feet|gal|gallon|bbl|barrel|\bkl\b|kilolit)/i.test(trimmed)) {
        parseErrors.push(`Line ${lineNum}: Invalid unit detected. Only dip in mm and volume in Litres are permitted.`);
        continue;
      }

      const tokens = trimmed.split(/[\t,;]+|\s{2,}/).map((t: string) => t.trim()).filter(Boolean);
      const parts = tokens.length === 1 && trimmed.includes(' ')
        ? trimmed.split(/\s+/).map((t: string) => t.trim()).filter(Boolean)
        : tokens;

      if (parts.length < 2) {
        parseErrors.push(`Line ${lineNum}: Expected 2 columns (Dip mm, Volume Litres).`);
        continue;
      }

      const cleanDip = parts[0].replace(/mm$/i, '').trim();
      const cleanVol = parts[1].replace(/(litres|litre|ltrs|ltr|l)$/i, '').trim();
      const dipVal = Number(cleanDip);
      const volVal = Number(cleanVol);

      if (!Number.isFinite(dipVal) || !Number.isFinite(volVal) || cleanDip === '' || cleanVol === '') {
        parseErrors.push(`Line ${lineNum}: Invalid numeric values ('${parts[0]}', '${parts[1]}').`);
        continue;
      }

      parsedPoints.push({
        dipMillimetresMilliunits: Math.round(dipVal * 1000),
        volumeMilliunits: Math.round(volVal * 1000),
      });
    }
  } else if (Array.isArray(body?.points)) {
    for (let i = 0; i < body.points.length; i++) {
      const pt = body.points[i];
      const rawDip = pt?.dipMillimetres ?? pt?.dipMm ?? pt?.dip_mm;
      const rawVol = pt?.volumeLitres ?? pt?.volumeLitre ?? pt?.volume_litres;
      if (rawDip === undefined || rawDip === null || rawVol === undefined || rawVol === null) {
        parseErrors.push(`Point ${i + 1}: dipMillimetres and volumeLitres are required.`);
        continue;
      }
      const dipVal = Number(rawDip);
      const volVal = Number(rawVol);
      if (!Number.isFinite(dipVal) || !Number.isFinite(volVal)) {
        parseErrors.push(`Point ${i + 1}: Invalid numeric values ('${rawDip}', '${rawVol}').`);
        continue;
      }
      parsedPoints.push({
        dipMillimetresMilliunits: parseMilliunits(rawDip),
        volumeMilliunits: parseMilliunits(rawVol),
      });
    }
  }

  return { parsedPoints, parseErrors };
}

// POST /api/v1/calibration-templates - Create a new global calibration template (or import into an unpopulated DRAFT template)
tankCalibration.post('/calibration-templates', requirePermission(PERMISSIONS.TANK_CALIBRATION_WRITE) as any, async (c: AppContext) => {
  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);
  const userCtx = c.var.user!;

  const body = await c.req.json().catch(() => ({}));
  const { code, name, nominalCapacityLitres, tankDiameterMm, tankLengthMm, maxDipMm, sourceFileName, referenceDocument, notes, status, overwrite, upsert } = body;

  if (!code || !name || !nominalCapacityLitres) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'BAD_REQUEST', message: 'code, name, and nominalCapacityLitres are required' },
    }, 400);
  }

  const { parsedPoints, parseErrors } = parseGlobalTemplateCsvOrPoints(body);
  if (parseErrors.length > 0) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'CSV_PARSE_ERROR', message: parseErrors.slice(0, 5).join(' ') },
    }, 400);
  }

  const requestedStatus = status || 'DRAFT';
  if ((requestedStatus === 'APPROVED' || requestedStatus === 'ACTIVE') && parsedPoints.length < 2) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'TEMPLATE_POINTS_NOT_VALIDATED',
        message: 'Reference templates cannot be marked APPROVED unless actual dip-to-volume points (at least 2 points) are imported and validated.',
      },
    }, 400);
  }

  const existing = await pumpRepo.findGlobalTankCalibrationTemplateByCode(code);
  if (existing) {
    const canPopulateExistingDraft = existing.status === 'DRAFT' && (existing.pointsCount || 0) === 0 && parsedPoints.length >= 2;
    if (overwrite === true || upsert === true || canPopulateExistingDraft) {
      try {
        const imported = await pumpRepo.importGlobalTankCalibrationTemplatePoints(
          existing.id,
          parsedPoints,
          userCtx.user.id,
          {
            status: requestedStatus === 'ACTIVE' ? 'ACTIVE' : requestedStatus === 'APPROVED' ? 'APPROVED' : 'DRAFT',
            sourceFileName,
            referenceDocument,
            notes,
            tankDiameterMmMilliunits: tankDiameterMm ? parseMilliunits(tankDiameterMm) : undefined,
            tankLengthMmMilliunits: tankLengthMm ? parseMilliunits(tankLengthMm) : undefined,
            maxDipMmMilliunits: maxDipMm ? parseMilliunits(maxDipMm) : undefined,
          }
        );

        const nowIso = new Date().toISOString();
        await auditRepo.logAction({
          id: `audit-gtct-import-${Date.now()}`,
          userId: userCtx.user.id,
          action: 'GLOBAL_CALIBRATION_TEMPLATE_IMPORT',
          entityType: 'GLOBAL_TANK_CALIBRATION_TEMPLATE',
          entityId: existing.id,
          newValue: { code: existing.code, status: imported.status, pointsCount: parsedPoints.length, sourceFileName },
          ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
          userAgent: c.req.header('user-agent') || 'Worker API',
          createdAt: nowIso,
        });

        return c.json({
          success: true,
          data: imported,
          error: null,
        }, 200);
      } catch (err: any) {
        return c.json({
          success: false,
          data: null,
          error: { code: err.code || 'VALIDATION_ERROR', message: err.message },
        }, 400);
      }
    }

    return c.json({
      success: false,
      data: null,
      error: { code: 'DUPLICATE_CODE', message: `Global template with code '${code}' already exists` },
    }, 409);
  }

  const templateId = `gtct-${code.toLowerCase().replace(/[^a-z0-9_-]/g, '')}-${Date.now().toString(36)}`;
  const nowIso = new Date().toISOString();

  try {
    const created = await pumpRepo.createGlobalTankCalibrationTemplate(
      {
        id: templateId,
        code,
        name,
        nominalCapacityLitres: Number(nominalCapacityLitres),
        tankDiameterMmMilliunits: tankDiameterMm ? parseMilliunits(tankDiameterMm) : null,
        tankLengthMmMilliunits: tankLengthMm ? parseMilliunits(tankLengthMm) : null,
        maxDipMmMilliunits: maxDipMm ? parseMilliunits(maxDipMm) : null,
        status: requestedStatus,
        sourceFileName,
        referenceDocument,
        notes,
        createdBy: userCtx.user.id,
        createdAt: nowIso,
        approvedBy: requestedStatus === 'APPROVED' || requestedStatus === 'ACTIVE' ? userCtx.user.id : null,
        approvedAt: requestedStatus === 'APPROVED' || requestedStatus === 'ACTIVE' ? nowIso : null,
      },
      parsedPoints
    );

    await auditRepo.logAction({
      id: `audit-gtct-create-${Date.now()}`,
      userId: userCtx.user.id,
      action: 'GLOBAL_CALIBRATION_TEMPLATE_CREATE',
      entityType: 'GLOBAL_TANK_CALIBRATION_TEMPLATE',
      entityId: templateId,
      newValue: { code, name, nominalCapacityLitres, status: created.status, pointsCount: parsedPoints.length },
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent') || 'Worker API',
      createdAt: nowIso,
    });

    return c.json({
      success: true,
      data: created,
      error: null,
    }, 201);
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: { code: err.code || 'VALIDATION_ERROR', message: err.message },
    }, 400);
  }
});

// POST /api/v1/calibration-templates/:id/import (and PUT /api/v1/calibration-templates/:id/points)
// Import complete verified CSV or JSON dip-to-volume calibration points into STANDARD_20KL, STANDARD_50KL, or any global template.
// Saves imported templates as DRAFT by default unless status: 'APPROVED' is explicitly provided.
const handleGlobalTemplateImport = async (c: AppContext) => {
  const id = c.req.param('id') || '';
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'Template ID or code is required' } }, 400);

  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);
  const userCtx = c.var.user!;

  const existing = await pumpRepo.findGlobalTankCalibrationTemplateById(id);
  if (!existing) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: `Global calibration template '${id}' not found` } }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const { parsedPoints, parseErrors } = parseGlobalTemplateCsvOrPoints(body);

  if (parseErrors.length > 0) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'CSV_PARSE_ERROR', message: parseErrors.slice(0, 5).join(' ') },
    }, 400);
  }

  if (parsedPoints.length < 2) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'BAD_REQUEST',
        message: 'Complete verified calibration data (csvText or points array with at least 2 dip-to-volume rows) is required for import.',
      },
    }, 400);
  }

  const targetStatus: 'DRAFT' | 'APPROVED' | 'ACTIVE' =
    body.status && ['DRAFT', 'APPROVED', 'ACTIVE'].includes(body.status)
      ? body.status
      : body.approveImmediately === true
        ? 'APPROVED'
        : 'DRAFT';

  if ((targetStatus === 'APPROVED' || targetStatus === 'ACTIVE') && !canAuthorizeCalibrationActivation(c)) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'FORBIDDEN',
        message: 'Only authorized calibration administrators can mark a global template as APPROVED',
      },
    }, 403);
  }

  try {
    const updated = await pumpRepo.importGlobalTankCalibrationTemplatePoints(
      existing.id,
      parsedPoints,
      userCtx.user.id,
      {
        status: targetStatus,
        sourceFileName: body.sourceFileName,
        referenceDocument: body.referenceDocument,
        notes: body.notes,
        tankDiameterMmMilliunits: body.tankDiameterMm ? parseMilliunits(body.tankDiameterMm) : undefined,
        tankLengthMmMilliunits: body.tankLengthMm ? parseMilliunits(body.tankLengthMm) : undefined,
        maxDipMmMilliunits: body.maxDipMm ? parseMilliunits(body.maxDipMm) : undefined,
      }
    );

    const nowIso = new Date().toISOString();
    await auditRepo.logAction({
      id: `audit-gtct-import-${Date.now()}`,
      userId: userCtx.user.id,
      action: 'GLOBAL_CALIBRATION_TEMPLATE_IMPORT',
      entityType: 'GLOBAL_TANK_CALIBRATION_TEMPLATE',
      entityId: existing.id,
      newValue: {
        code: existing.code,
        status: updated.status,
        pointsCount: parsedPoints.length,
        sourceFileName: updated.sourceFileName,
        referenceDocument: updated.referenceDocument,
      },
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent') || 'Worker API',
      createdAt: nowIso,
    });

    return c.json({
      success: true,
      data: updated,
      error: null,
    }, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: { code: err.code || 'VALIDATION_ERROR', message: err.message },
    }, 400);
  }
};

tankCalibration.post('/calibration-templates/:id/import', requirePermission(PERMISSIONS.TANK_CALIBRATION_WRITE) as any, handleGlobalTemplateImport as any);
tankCalibration.put('/calibration-templates/:id/points', requirePermission(PERMISSIONS.TANK_CALIBRATION_WRITE) as any, handleGlobalTemplateImport as any);

// POST /api/v1/calibration-templates/:id/status - Separate authorised approval action after chart verification
tankCalibration.post('/calibration-templates/:id/status', requirePermission(PERMISSIONS.TANK_CALIBRATION_WRITE) as any, async (c: AppContext) => {
  const id = c.req.param('id') || '';
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'Template ID is required' } }, 400);

  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);
  const userCtx = c.var.user!;

  const body = await c.req.json().catch(() => ({}));
  const { status } = body;

  if (!status || !['DRAFT', 'APPROVED', 'ACTIVE', 'SUPERSEDED', 'ARCHIVED'].includes(status)) {
    return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'Valid status is required' } }, 400);
  }

  if ((status === 'APPROVED' || status === 'ACTIVE') && !canAuthorizeCalibrationActivation(c)) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'Only authorized calibration administrators can approve global calibration templates' },
    }, 403);
  }

  const nowIso = new Date().toISOString();
  try {
    const updated = await pumpRepo.updateGlobalTankCalibrationTemplateStatus(id, status, userCtx.user.id, nowIso);
    if (!updated) {
      return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Global template not found' } }, 404);
    }

    await auditRepo.logAction({
      id: `audit-gtct-status-${Date.now()}`,
      userId: userCtx.user.id,
      action: 'GLOBAL_CALIBRATION_TEMPLATE_STATUS_UPDATE',
      entityType: 'GLOBAL_TANK_CALIBRATION_TEMPLATE',
      entityId: updated.id,
      newValue: { code: updated.code, status, pointsCount: updated.pointsCount },
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent') || 'Worker API',
      createdAt: nowIso,
    });

    return c.json({ success: true, data: updated, error: null });
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: { code: err.code || 'VALIDATION_ERROR', message: err.message },
    }, 400);
  }
});

// GET /api/v1/tanks/:tankId/suggested-template - Get matching global template for a tank
tankCalibration.get('/tanks/:tankId/suggested-template', requirePermission(PERMISSIONS.TANK_CALIBRATION_READ) as any, async (c: AppContext) => {
  const tankId = c.req.param('tankId') || '';
  if (!tankId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'Tank ID is required' } }, 400);

  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);

  try {
    const suggestion = await pumpRepo.suggestGlobalTemplateForTank(tankId);
    return c.json({ success: true, data: suggestion, error: null });
  } catch (err: any) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: err.message } }, 404);
  }
});

// POST /api/v1/calibration-templates/:id/assign-preview - Preview assignment of global template to tanks
tankCalibration.post('/calibration-templates/:id/assign-preview', requirePermission(PERMISSIONS.TANK_CALIBRATION_READ) as any, async (c: AppContext) => {
  const id = c.req.param('id') || '';
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'Template ID is required' } }, 400);

  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);

  const template = await pumpRepo.findGlobalTankCalibrationTemplateById(id);
  if (!template) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Global calibration template not found' } }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const { tankIds } = body;
  if (!Array.isArray(tankIds) || tankIds.length === 0) {
    return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'tankIds array is required' } }, 400);
  }

  const previews = [];
  for (const tankId of tankIds) {
    const tank = await pumpRepo.findTankById(tankId);
    if (!tank) continue;

    const charts = await pumpRepo.listCalibrationCharts(tankId);
    const activeChart = charts.find(ch => ch.status === 'ACTIVE') || null;
    const draftChart = charts.find(ch => ch.status === 'DRAFT') || null;

    const capDiff = Math.abs(tank.capacityLitres - template.nominalCapacityLitres);
    const isCompatible = capDiff <= 5000;
    const nextRev = (charts.reduce((m, c) => Math.max(m, c.revisionNumber), 0)) + 1;

    previews.push({
      tankId: tank.id,
      tankNumber: tank.tankNumber,
      tankName: tank.name,
      outletId: tank.outletId,
      productCode: tank.productCode,
      productName: tank.productName,
      capacityLitres: tank.capacityLitres,
      physicalDimensions: {
        diameterMm: template.tankDiameterMm,
        lengthMm: template.tankLengthMm,
        maxDipMm: template.maxDipMm,
      },
      currentActiveChart: activeChart ? {
        id: activeChart.id,
        revisionNumber: activeChart.revisionNumber,
        pointsCount: activeChart.pointsCount,
        status: activeChart.status,
      } : null,
      existingDraftChart: draftChart ? {
        id: draftChart.id,
        revisionNumber: draftChart.revisionNumber,
        pointsCount: draftChart.pointsCount,
        status: draftChart.status,
        notes: draftChart.notes,
      } : null,
      hasProtectedDraft: Boolean(draftChart),
      targetRevisionNumber: draftChart ? draftChart.revisionNumber : nextRev,
      targetStatus: 'DRAFT',
      isCompatible,
      capacityDifferenceLitres: capDiff,
      recommendation: draftChart
        ? `Existing Rev #${draftChart.revisionNumber} DRAFT is preserved (will not overwrite)`
        : isCompatible
          ? `Compatible standard tank capacity — will create Rev #${nextRev} DRAFT (ACTIVE chart preserved)`
          : `Capacity variance of ${capDiff} L requires technical verification`,
    });
  }

  return c.json({
    success: true,
    data: {
      template,
      totalTanksSelected: previews.length,
      previews,
    },
    error: null,
  });
});

// POST /api/v1/calibration-templates/:id/assign - Assign global template to multiple tanks (with explicit tank-wise confirmation)
// Never automatically replaces ACTIVE tank charts or historical revisions unless activateImmediately: true is explicitly requested.
tankCalibration.post('/calibration-templates/:id/assign', requirePermission(PERMISSIONS.TANK_CALIBRATION_WRITE) as any, async (c: AppContext) => {
  const id = c.req.param('id') || '';
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'Template ID is required' } }, 400);

  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);
  const userCtx = c.var.user!;

  if (!canAuthorizeCalibrationActivation(c)) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'Only authorized calibration administrators can bulk assign global calibration templates' },
    }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const { tankIds, activateImmediately, preserveExistingDraft, notes } = body;

  if (!Array.isArray(tankIds) || tankIds.length === 0) {
    return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'tankIds array is required' } }, 400);
  }

  const shouldActivateImmediately = activateImmediately === true;

  try {
    const result = await pumpRepo.assignGlobalTemplateToTanks(id, tankIds, userCtx.user.id, {
      activateImmediately: shouldActivateImmediately,
      preserveExistingDraft: preserveExistingDraft !== false,
      notes,
    });

    const nowIso = new Date().toISOString();
    await auditRepo.logAction({
      id: `audit-gtct-assign-${Date.now()}`,
      userId: userCtx.user.id,
      action: 'GLOBAL_CALIBRATION_TEMPLATE_ASSIGN',
      entityType: 'GLOBAL_TANK_CALIBRATION_TEMPLATE',
      entityId: result.template.id,
      newValue: {
        templateCode: result.template.code,
        tanksCount: result.assignments.length,
        tankIds,
        activateImmediately: shouldActivateImmediately,
        preservedDraftsCount: result.assignments.filter((a: any) => a.preservedExistingDraft).length,
      },
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent') || 'Worker API',
      createdAt: nowIso,
    });

    return c.json({
      success: true,
      data: result,
      error: null,
    });
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'ASSIGNMENT_FAILED', message: err.message },
    }, 400);
  }
});

export default tankCalibration;


