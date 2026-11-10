import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../../db';
import * as schema from '../../db/schema';
import { PumpRepository } from '../repositories/pumpRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { ScopeService } from '../services/scopeService';
import { TankCalibrationService } from '../services/tankCalibrationService';
import { ExcelCalibrationImportService } from '../services/excelCalibrationImportService';
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

  // Validate capacity conflict when allowOverCapacity is explicitly false, and +10% ceiling when true
  const tankCapacityMilliunits = Math.round(tank.capacityLitres * 1000);
  const maxOverCapacityMilliunits = Math.round(tankCapacityMilliunits * 1.1);
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
  if (allowOverCapacity === true && maxPointVolMilli > maxOverCapacityMilliunits) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'OVER_CAPACITY_CEILING_EXCEEDED',
        message: `Chart maximum volume ${formatMilliunits(maxPointVolMilli)} L exceeds the maximum permitted +10% over-capacity ceiling of ${formatMilliunits(maxOverCapacityMilliunits)} L (nominal ${tank.capacityLitres.toLocaleString()} L)`,
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

  // Enforce explicit confirmation and upstream lifecycle verification when activating template-assigned charts
  if (parseResult.data.status === 'ACTIVE') {
    const isTemplateAssigned = Boolean((existingChart as any).sourceTemplateId);
    if (body?.confirmActivation === false || (isTemplateAssigned && body?.confirmActivation !== true)) {
      return c.json(
        {
          success: false,
          data: null,
          error: {
            code: 'ACTIVATION_CONFIRMATION_REQUIRED',
            message:
              'Explicit administrator confirmation (confirmActivation: true) is required before activating a tank calibration chart revision.',
          },
        },
        400
      );
    }

    if (isTemplateAssigned) {
      const srcTemplate = await pumpRepo.findGlobalTankCalibrationTemplateById(
        String((existingChart as any).sourceTemplateId)
      );
      if (srcTemplate) {
        if (srcTemplate.requiresEngineeringReview || srcTemplate.requiresDimensionVerification) {
          return c.json(
            {
              success: false,
              data: null,
              error: {
                code: 'ENGINEERING_REVIEW_REQUIRED',
                message: `Cannot activate chart revision #${existingChart.revisionNumber}: source template ${srcTemplate.code} has unresolved engineering review or dimensional verification requirements.`,
              },
            },
            400
          );
        }
        if (srcTemplate.status !== 'APPROVED' && srcTemplate.status !== 'ACTIVE') {
          return c.json(
            {
              success: false,
              data: null,
              error: {
                code: 'SOURCE_TEMPLATE_NOT_APPROVED',
                message: `Cannot activate chart revision #${existingChart.revisionNumber}: source template ${srcTemplate.code} is in ${srcTemplate.status} status and must be APPROVED first.`,
              },
            },
            400
          );
        }
      }
    }
  }

  const allChartsBefore = await pumpRepo.listCalibrationCharts(tankId);
  const previousActiveChart = allChartsBefore.find(ch => ch.status === 'ACTIVE' && ch.id !== chartId) || null;

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
      action:
        parseResult.data.status === 'ACTIVE'
          ? 'TANK_CALIBRATION_CONTROLLED_ACTIVATION'
          : 'TANK_CALIBRATION_CHART_STATUS_UPDATE',
      entityType: 'TANK_CALIBRATION',
      entityId: chartId,
      oldValue: {
        status: existingChart.status,
        revisionNumber: existingChart.revisionNumber,
        previousActiveChartId: previousActiveChart?.id ?? null,
        previousActiveRevisionNumber: previousActiveChart?.revisionNumber ?? null,
      },
      newValue: {
        status: updatedChart.status,
        revisionNumber: updatedChart.revisionNumber,
        effectiveFrom: updatedChart.effectiveFrom,
        effectiveTo: updatedChart.effectiveTo,
        approvedBy: updatedChart.approvedBy,
        supersededChartId: parseResult.data.status === 'ACTIVE' ? previousActiveChart?.id ?? null : null,
      },
      ipAddress: c.req.header('cf-connecting-ip') || null,
      userAgent: c.req.header('user-agent') || null,
      createdAt: new Date().toISOString(),
    });

    const allCharts = await pumpRepo.listCalibrationCharts(tankId);
    const supersededChart = previousActiveChart
      ? allCharts.find(ch => ch.id === previousActiveChart.id) || null
      : null;

    return c.json({
      success: true,
      data: updatedChart,
      supersededChart,
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

// POST /api/v1/tanks/:tankId/calibration/charts/:chartId/activate - Controlled tank-specific activation requiring explicit administrator confirmation
tankCalibration.post('/tanks/:tankId/calibration/charts/:chartId/activate', requirePermission(PERMISSIONS.TANK_CALIBRATION_WRITE) as any, async (c: AppContext) => {
  const tankId = c.req.param('tankId');
  const chartId = c.req.param('chartId');
  if (!tankId || !chartId) {
    return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'tankId and chartId are required' } }, 400);
  }

  if (!canAuthorizeCalibrationActivation(c)) {
    return c.json(
      {
        success: false,
        data: null,
        error: {
          code: 'CALIBRATION_ACTIVATION_FORBIDDEN',
          message:
            'Activating a tank calibration chart revision requires explicit tank infrastructure authorization (TANKS_WRITE or ADMIN).',
        },
      },
      403
    );
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
  if (body?.confirmActivation !== true) {
    return c.json(
      {
        success: false,
        data: null,
        error: {
          code: 'ACTIVATION_CONFIRMATION_REQUIRED',
          message:
            'Explicit administrator confirmation (confirmActivation: true) is required before activating a tank calibration chart revision.',
        },
      },
      400
    );
  }

  const existingChart = await pumpRepo.findCalibrationChartById(chartId);
  if (!existingChart || existingChart.tankId !== tankId) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Calibration chart revision not found' } }, 404);
  }

  if ((existingChart as any).sourceTemplateId) {
    const srcTemplate = await pumpRepo.findGlobalTankCalibrationTemplateById(
      String((existingChart as any).sourceTemplateId)
    );
    if (srcTemplate) {
      if (srcTemplate.requiresEngineeringReview || srcTemplate.requiresDimensionVerification) {
        return c.json(
          {
            success: false,
            data: null,
            error: {
              code: 'ENGINEERING_REVIEW_REQUIRED',
              message: `Cannot activate chart revision #${existingChart.revisionNumber}: source template ${srcTemplate.code} has unresolved engineering review or dimensional verification requirements.`,
            },
          },
          400
        );
      }
      if (srcTemplate.status !== 'APPROVED' && srcTemplate.status !== 'ACTIVE') {
        return c.json(
          {
            success: false,
            data: null,
            error: {
              code: 'SOURCE_TEMPLATE_NOT_APPROVED',
              message: `Cannot activate chart revision #${existingChart.revisionNumber}: source template ${srcTemplate.code} is in ${srcTemplate.status} status and must be APPROVED first.`,
            },
          },
          400
        );
      }
    }
  }

  const allChartsBefore = await pumpRepo.listCalibrationCharts(tankId);
  const previousActiveChart = allChartsBefore.find(ch => ch.status === 'ACTIVE' && ch.id !== chartId) || null;
  const effectiveFrom =
    typeof body?.effectiveFrom === 'string' && body.effectiveFrom.trim()
      ? body.effectiveFrom.trim()
      : new Date().toISOString().slice(0, 10);
  const notes = typeof body?.notes === 'string' ? body.notes : undefined;

  try {
    const updatedChart = await pumpRepo.updateCalibrationChartStatus(
      tankId,
      chartId,
      'ACTIVE',
      c.var.user!.user.id,
      {
        effectiveFrom,
        notes,
      }
    );

    await auditRepo.logAction({
      id: `aud-${crypto.randomUUID()}`,
      userId: c.var.user!.user.id,
      action: 'TANK_CALIBRATION_CONTROLLED_ACTIVATION',
      entityType: 'TANK_CALIBRATION',
      entityId: chartId,
      oldValue: {
        status: existingChart.status,
        revisionNumber: existingChart.revisionNumber,
        previousActiveChartId: previousActiveChart?.id ?? null,
        previousActiveRevisionNumber: previousActiveChart?.revisionNumber ?? null,
      },
      newValue: {
        status: updatedChart.status,
        revisionNumber: updatedChart.revisionNumber,
        effectiveFrom: updatedChart.effectiveFrom,
        approvedBy: updatedChart.approvedBy,
        supersededChartId: previousActiveChart?.id ?? null,
        supersededRevisionNumber: previousActiveChart?.revisionNumber ?? null,
      },
      ipAddress: c.req.header('cf-connecting-ip') || null,
      userAgent: c.req.header('user-agent') || null,
      createdAt: new Date().toISOString(),
    });

    const allCharts = await pumpRepo.listCalibrationCharts(tankId);
    const supersededChart = previousActiveChart
      ? allCharts.find(ch => ch.id === previousActiveChart.id) || null
      : null;

    return c.json({
      success: true,
      data: updatedChart,
      supersededChart,
      charts: allCharts,
      error: null,
    });
  } catch (err: any) {
    const status = err.code === 'CALIBRATION_CHART_LOCKED_HISTORICAL_REFERENCE' ? 409 : 400;
    return c.json({
      success: false,
      data: null,
      error: { code: err.code || 'ACTIVATION_FAILED', message: err.message },
    }, status);
  }
});

// POST /api/v1/tanks/:tankId/calibration/engineering-verify - Record engineering verification & certification for a physical tank
tankCalibration.post('/tanks/:tankId/calibration/engineering-verify', requirePermission(PERMISSIONS.TANK_CALIBRATION_WRITE) as any, async (c: AppContext) => {
  const tankId = c.req.param('tankId');
  if (!tankId) {
    return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'tankId is required' } }, 400);
  }

  if (!canAuthorizeCalibrationActivation(c)) {
    return c.json(
      {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'Recording physical tank engineering verification requires ADMIN or tank infrastructure authority.',
        },
      },
      403
    );
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
  try {
    const result = await pumpRepo.recordTankEngineeringVerification(
      tankId,
      {
        decision: body.decision || 'VERIFIED',
        tankIdentifier: body.tankIdentifier,
        tankSerialNumber: body.tankSerialNumber,
        verifiedCapacityLitres: Number(body.verifiedCapacityLitres),
        verifiedDiameterMm: Number(body.verifiedDiameterMm),
        verifiedLengthMm: Number(body.verifiedLengthMm),
        verifiedMaxDipMm: Number(body.verifiedMaxDipMm),
        issuingAuthority: body.issuingAuthority,
        certificateNumber: body.certificateNumber,
        verificationDate: body.verificationDate,
        engineeringApprover: body.engineeringApprover,
        supportingDocumentId: body.supportingDocumentId,
        notes: body.notes ?? null,
      },
      c.var.user!.user.id
    );

    return c.json({
      success: true,
      data: result,
      error: null,
    });
  } catch (err: any) {
    const status = err.code === 'NOT_FOUND' ? 404 : 400;
    return c.json({
      success: false,
      data: null,
      error: { code: err.code || 'VERIFICATION_FAILED', message: err.message },
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

async function loadBundledSampleWorkbook(): Promise<Uint8Array | null> {
  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const candidatePaths = [
      path.resolve(process.cwd(), 'public/20KL_15KL_10KL_calibration_Dip_chart.xlsx'),
      path.resolve(process.cwd(), 'tests/fixtures/20KL_15KL_10KL_calibration_Dip_chart.xlsx'),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        return new Uint8Array(fs.readFileSync(p));
      }
    }
  } catch {
    // ignore
  }
  return null;
}

// POST /api/v1/calibration-templates/excel-preview - ADMIN-only extraction & validation of Excel calibration workbook
tankCalibration.post('/calibration-templates/excel-preview', async (c: AppContext) => {
  const user = c.var.user;
  if (!user || !user.roles?.includes(ROLES.ADMIN)) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'FORBIDDEN',
        message: 'Global ADMIN authority is required to access Excel Calibration Import.'
      }
    }, 403);
  }

  let buffer: Uint8Array | null = null;
  let fileName = '20KL_15KL_10KL_calibration_Dip_chart.xlsx';

  const contentType = c.req.header('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.parseBody();
    const file = formData['file'];
    const loadDefault = formData['loadDefault'] === 'true';

    if (file && typeof file === 'object' && 'arrayBuffer' in file) {
      const ab = await (file as any).arrayBuffer();
      buffer = new Uint8Array(ab);
      if ('name' in file && (file as any).name) {
        fileName = (file as any).name;
      }
    } else if (loadDefault) {
      buffer = await loadBundledSampleWorkbook();
    }
  } else {
    const body = await c.req.json().catch(() => ({}));
    if (body.fileBase64) {
      const binaryString = atob(body.fileBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      buffer = bytes;
      if (body.fileName) fileName = body.fileName;
    } else if (body.loadDefault) {
      buffer = await loadBundledSampleWorkbook();
    }
  }

  if (!buffer || buffer.length === 0) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'BAD_REQUEST',
        message: 'No Excel file provided. Upload a valid workbook or click Load Sample Workbook.'
      }
    }, 400);
  }

  try {
    const result = await ExcelCalibrationImportService.extractWorkbook(buffer, fileName);
    return c.json({
      success: true,
      data: result,
      error: null
    });
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: err.code || 'EXCEL_EXTRACTION_ERROR',
        message: err.message || 'Failed to extract calibration data from workbook.'
      }
    }, 400);
  }
});

// POST /api/v1/calibration-templates/excel-import - ADMIN-only import of eligible charts as DRAFT
tankCalibration.post('/calibration-templates/excel-import', async (c: AppContext) => {
  const user = c.var.user;
  if (!user || !user.roles?.includes(ROLES.ADMIN)) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'FORBIDDEN',
        message: 'Global ADMIN authority is required to access Excel Calibration Import.'
      }
    }, 403);
  }

  let confirmImport = false;
  let targetCodes: string[] | undefined;
  let buffer: Uint8Array | null = null;
  let fileName = '20KL_15KL_10KL_calibration_Dip_chart.xlsx';

  const contentType = c.req.header('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.parseBody();
    confirmImport = formData['confirmImport'] === 'true';
    if (formData['targetCodes']) {
      try {
        targetCodes = JSON.parse(String(formData['targetCodes']));
      } catch {
        targetCodes = [String(formData['targetCodes'])];
      }
    }
    const file = formData['file'];
    const loadDefault = formData['loadDefault'] === 'true';
    if (file && typeof file === 'object' && 'arrayBuffer' in file) {
      const ab = await (file as any).arrayBuffer();
      buffer = new Uint8Array(ab);
      if ('name' in file && (file as any).name) fileName = (file as any).name;
    } else if (loadDefault) {
      buffer = await loadBundledSampleWorkbook();
    }
  } else {
    const body = await c.req.json().catch(() => ({}));
    confirmImport = Boolean(body.confirmImport);
    targetCodes = Array.isArray(body.targetCodes) ? body.targetCodes : undefined;
    if (body.fileBase64) {
      const binaryString = atob(body.fileBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      buffer = bytes;
      if (body.fileName) fileName = body.fileName;
    } else if (body.loadDefault) {
      buffer = await loadBundledSampleWorkbook();
    }
  }

  // Explicit confirmation check
  if (!confirmImport) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'CONFIRMATION_REQUIRED',
        message: 'Explicit administrator confirmation (confirmImport: true) is required before importing calibration templates.'
      }
    }, 400);
  }

  if (!buffer || buffer.length === 0) {
    buffer = await loadBundledSampleWorkbook();
  }

  if (!buffer || buffer.length === 0) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'BAD_REQUEST',
        message: 'No Excel file provided for import.'
      }
    }, 400);
  }

  try {
    const extracted = await ExcelCalibrationImportService.extractWorkbook(buffer, fileName);
    const db = getDb(c.env.DB);
    const ipAddress = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Excel Importer UI';

    const result = await ExcelCalibrationImportService.importEligibleCharts(
      db,
      extracted,
      { userId: user.user.id },
      { confirmImport: true, targetCodes, ipAddress, userAgent }
    );

    return c.json({
      success: true,
      data: {
        workbookName: extracted.workbookName,
        workbookSha256: extracted.workbookSha256,
        importedTemplates: result.importedTemplates,
        skippedCharts: result.skippedCharts,
        eligibleChartsCount: extracted.eligibleChartsCount,
        blockedChartsCount: extracted.blockedChartsCount,
      },
      error: null
    });
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: err.code || 'EXCEL_IMPORT_ERROR',
        message: err.message || 'Failed to import eligible charts from workbook.'
      }
    }, 400);
  }
});

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

async function ensureThreeExcelReferenceTemplatesExist(db: any, userId: string): Promise<void> {
  try {
    const pumpRepo = new PumpRepository(db);
    const tpl10 = await pumpRepo.findGlobalTankCalibrationTemplateByCode('EXCEL_10KL_REFERENCE');
    const tpl15 = await pumpRepo.findGlobalTankCalibrationTemplateByCode('EXCEL_15KL_REFERENCE');
    const tpl20 = await pumpRepo.findGlobalTankCalibrationTemplateByCode('EXCEL_20KL_REFERENCE');
    if (tpl10 && tpl15 && tpl20) {
      return;
    }
    const buffer = await loadBundledSampleWorkbook();
    if (!buffer || buffer.length === 0) return;
    const extracted = await ExcelCalibrationImportService.extractWorkbook(
      buffer,
      '20KL_15KL_10KL_calibration_Dip_chart.xlsx'
    );
    await ExcelCalibrationImportService.importEligibleCharts(
      db,
      extracted,
      { userId: userId || 'user-admin' },
      { confirmImport: true }
    );
  } catch {
    // ignore if sample workbook unavailable in isolated test
  }
}

// GET /api/v1/calibration-templates/compare-20kl - Compare EXCEL_20KL_REFERENCE against STANDARD_20KL across all 211 dip points
tankCalibration.get('/calibration-templates/compare-20kl', requirePermission(PERMISSIONS.TANK_CALIBRATION_READ) as any, async (c: AppContext) => {
  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);
  const userId = c.var.user?.user?.id || 'user-admin';

  await ensureThreeExcelReferenceTemplatesExist(db, userId);

  const excel20 = await pumpRepo.findGlobalTankCalibrationTemplateById('EXCEL_20KL_REFERENCE');
  const std20 = await pumpRepo.findGlobalTankCalibrationTemplateById('STANDARD_20KL');

  if (!excel20 || !std20) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'NOT_FOUND',
        message: 'EXCEL_20KL_REFERENCE or STANDARD_20KL template not found.',
      },
    }, 404);
  }

  const report = TankCalibrationService.compareCalibrationTemplates(
    {
      code: excel20.code,
      name: excel20.name,
      nominalCapacityLitres: excel20.nominalCapacityLitres,
      tankDiameterMm: excel20.tankDiameterMm,
      tankLengthMm: excel20.tankLengthMm,
      maxDipMm: excel20.maxDipMm,
      points: excel20.points || [],
    },
    {
      code: std20.code,
      name: std20.name,
      nominalCapacityLitres: std20.nominalCapacityLitres,
      tankDiameterMm: std20.tankDiameterMm,
      tankLengthMm: std20.tankLengthMm,
      maxDipMm: std20.maxDipMm,
      points: std20.points || [],
    }
  );

  return c.json({
    success: true,
    data: report,
    error: null,
  });
});

// GET /api/v1/calibration-templates/management-dashboard - Complete End-to-End ADMIN Calibration Management Dashboard
tankCalibration.get('/calibration-templates/management-dashboard', requirePermission(PERMISSIONS.TANK_CALIBRATION_READ) as any, async (c: AppContext) => {
  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);
  const userId = c.var.user?.user?.id || 'user-admin';

  const autoImport = c.req.query('ensureExcelReferences') !== 'false';
  if (autoImport) {
    await ensureThreeExcelReferenceTemplatesExist(db, userId);
  }

  const allTemplates = await pumpRepo.listGlobalTankCalibrationTemplates();
  const referenceTemplates = allTemplates.filter(t =>
    ['EXCEL_10KL_REFERENCE', 'EXCEL_15KL_REFERENCE', 'EXCEL_20KL_REFERENCE'].includes(
      String(t.code || '').toUpperCase()
    )
  );
  const standardTemplates = allTemplates.filter(t =>
    ['STANDARD_20KL', 'STANDARD_50KL'].includes(String(t.code || '').toUpperCase())
  );

  let comparison20kl = null;
  const excel20Header = referenceTemplates.find(t => t.code === 'EXCEL_20KL_REFERENCE');
  const std20Header = standardTemplates.find(t => t.code === 'STANDARD_20KL');
  if (excel20Header && std20Header) {
    const excel20Full = await pumpRepo.findGlobalTankCalibrationTemplateById(excel20Header.id);
    const std20Full = await pumpRepo.findGlobalTankCalibrationTemplateById(std20Header.id);
    if (excel20Full && std20Full) {
      comparison20kl = TankCalibrationService.compareCalibrationTemplates(
        {
          code: excel20Full.code,
          name: excel20Full.name,
          nominalCapacityLitres: excel20Full.nominalCapacityLitres,
          tankDiameterMm: excel20Full.tankDiameterMm,
          tankLengthMm: excel20Full.tankLengthMm,
          maxDipMm: excel20Full.maxDipMm,
          points: excel20Full.points || [],
        },
        {
          code: std20Full.code,
          name: std20Full.name,
          nominalCapacityLitres: std20Full.nominalCapacityLitres,
          tankDiameterMm: std20Full.tankDiameterMm,
          tankLengthMm: std20Full.tankLengthMm,
          maxDipMm: std20Full.maxDipMm,
          points: std20Full.points || [],
        }
      );
    }
  }

  // Evaluate COCO tank compatibility (preferring COCO 22 / 396187 or all COCO outlets)
  const outletIdFilter = c.req.query('outletId') || undefined;
  let cocoTanks: any[] = [];
  const primaryTemplateForTanks =
    excel20Header || referenceTemplates[0] || standardTemplates[0] || allTemplates[0];
  if (primaryTemplateForTanks) {
    try {
      const eligRes = await pumpRepo.listEligibleCocoTanksForTemplate(primaryTemplateForTanks.id, {
        outletId: outletIdFilter,
        includeNonMatching: true,
      });
      cocoTanks = eligRes.tanks || [];
    } catch {
      cocoTanks = [];
    }
  }

  // Enrich each COCO tank with per-template compatibility for 10KL, 15KL, 20KL
  const compatibilityByTemplate: Record<string, Record<string, any>> = {};
  for (const tpl of referenceTemplates) {
    try {
      const res = await pumpRepo.listEligibleCocoTanksForTemplate(tpl.id, {
        outletId: outletIdFilter,
        includeNonMatching: true,
      });
      const map: Record<string, any> = {};
      for (const t of res.tanks || []) {
        map[t.tankId] = {
          isCompatible: t.isCompatible,
          eligibilityStatus: t.eligibilityStatus,
          ineligibilityReason: t.ineligibilityReason,
          isCapacityMatch: t.isCapacityMatch,
          isDimensionVerified: t.isDimensionVerified,
          isCertified: t.isCertified,
          isDimensionMatch: t.isDimensionMatch,
        };
      }
      compatibilityByTemplate[tpl.code] = map;
    } catch {
      // ignore
    }
  }

  const enrichedCocoTanks = cocoTanks.map(t => ({
    ...t,
    templateCompatibility: {
      EXCEL_10KL_REFERENCE: compatibilityByTemplate['EXCEL_10KL_REFERENCE']?.[t.tankId] || null,
      EXCEL_15KL_REFERENCE: compatibilityByTemplate['EXCEL_15KL_REFERENCE']?.[t.tankId] || null,
      EXCEL_20KL_REFERENCE: compatibilityByTemplate['EXCEL_20KL_REFERENCE']?.[t.tankId] || null,
    },
  }));

  // Fetch available supporting documents in Document Vault
  const rawDocRows = await db
    .select({
      id: schema.documents.id,
      name: schema.documents.name,
      mimeType: schema.documents.mimeType,
      r2Key: schema.documents.r2Key,
      sizeBytes: schema.documents.sizeBytes,
      outletId: schema.documents.outletId,
      uploadedByUserId: schema.documents.uploadedByUserId,
      createdAt: schema.documents.createdAt,
    })
    .from(schema.documents)
    .orderBy(desc(schema.documents.createdAt))
    .limit(100);

  const docRows = rawDocRows.map(d => ({
    id: d.id,
    name: d.name,
    title: d.name,
    fileName: d.name,
    category: 'TANK_CALIBRATION_CHART',
    mimeType: d.mimeType,
    r2Key: d.r2Key,
    sizeBytes: d.sizeBytes,
    outletId: d.outletId,
    createdAt: d.createdAt,
  }));

  const importedCount = referenceTemplates.filter(
    t => t.referenceDataStatus === 'REFERENCE DATA IMPORTED' || (t.pointsCount ?? 0) >= 2
  ).length;
  const verifiedCount = referenceTemplates.filter(
    t =>
      t.engineeringVerificationStatus === 'ENGINEERING VERIFIED' ||
      t.engineeringVerification?.decision === 'VERIFIED'
  ).length;
  const activeCount = referenceTemplates.filter(
    t =>
      t.operationalActivationStatus === 'OPERATIONALLY ACTIVE' ||
      (t.activeAssignedTanksCount ?? 0) > 0
  ).length;

  const blockingReasons: string[] = [];
  for (const tpl of referenceTemplates) {
    if (tpl.blockingReason) {
      blockingReasons.push(`[${tpl.code}] ${tpl.blockingReason}`);
    } else if (Array.isArray((tpl as any).blockingReasons) && (tpl as any).blockingReasons.length > 0) {
      for (const r of (tpl as any).blockingReasons) {
        blockingReasons.push(`[${tpl.code}] ${r}`);
      }
    }
  }

  const unverifiedTanks = enrichedCocoTanks.filter(t => !t.isDimensionVerified || !t.isCertified);
  if (unverifiedTanks.length > 0) {
    blockingReasons.push(
      `${unverifiedTanks.length} COCO tank(s) are missing verified physical dimensions or Document Vault calibration certification.`
    );
  }

  const totalCocoTanksCount = enrichedCocoTanks.length;
  const activeCocoTanksCount = enrichedCocoTanks.filter(t => Boolean(t.activeChartId)).length;

  const operationallyComplete =
    referenceTemplates.length === 3 &&
    importedCount === 3 &&
    verifiedCount === 3 &&
    activeCount > 0 &&
    blockingReasons.length === 0;

  const recentAuditLogs = await auditRepo.listLogs(40, 0, {
    entityType: 'GLOBAL_TANK_CALIBRATION_TEMPLATE',
  });

  const statusSummary = {
    referenceDataImported: {
      status: 'REFERENCE DATA IMPORTED' as const,
      complete: importedCount === 3,
      isComplete: importedCount === 3,
      importedTemplatesCount: importedCount,
      importedExcelChartsCount: importedCount,
      expectedExcelChartsCount: 3,
      summary: `${importedCount}/3 Excel reference calibration charts imported (10 KL: 195 pts, 15 KL: 195 pts, 20 KL: 211 pts).`,
      details: `${importedCount}/3 Excel reference calibration charts imported.`,
    },
    engineeringVerified: {
      status: 'ENGINEERING VERIFIED' as const,
      complete: verifiedCount === 3 && referenceTemplates.length === 3,
      isComplete: verifiedCount === 3 && referenceTemplates.length === 3,
      verifiedTemplatesCount: verifiedCount,
      verifiedExcelChartsCount: verifiedCount,
      totalExcelChartsCount: 3,
      summary:
        verifiedCount === 3
          ? 'All 3 Excel reference calibration templates have completed formal engineering verification.'
          : `${verifiedCount}/3 Excel reference templates verified. Awaiting Document Vault certification & formal engineering sign-off.`,
      details: `${verifiedCount}/3 reference charts engineering verified.`,
    },
    operationallyActive: {
      status: 'OPERATIONALLY ACTIVE' as const,
      complete: operationallyComplete,
      isComplete: operationallyComplete,
      activeTanksCount: activeCocoTanksCount,
      totalTanksCount: totalCocoTanksCount,
      activeAssignedTanksCount: referenceTemplates.reduce(
        (acc, t) => acc + (t.activeAssignedTanksCount || 0),
        0
      ),
      stagedDraftTanksCount: referenceTemplates.reduce(
        (acc, t) => acc + (t.stagedDraftTanksCount || 0),
        0
      ),
      summary: operationallyComplete
        ? 'All compatible tanks verified and operationally active.'
        : 'Existing ACTIVE calibrations and Tank #1 Rev #2 DRAFT preserved. Unverified tanks remain pending.',
      details: `${activeCocoTanksCount}/${totalCocoTanksCount} COCO tanks have active calibrations.`,
    },
    isOperationallyComplete: operationallyComplete,
    overallStatusLabel: operationallyComplete
      ? 'OPERATIONALLY ACTIVE & VERIFIED'
      : verifiedCount > 0
        ? 'REFERENCE DATA IMPORTED — PARTIAL ENGINEERING VERIFICATION (ACTIVATION PENDING)'
        : 'REFERENCE DATA IMPORTED — ENGINEERING VERIFICATION & ACTIVATION PENDING',
    blockingReasons,
  };

  return c.json({
    success: true,
    data: {
      statusSummary,
      summaryStatuses: statusSummary,
      summary: {
        referenceDataImported: importedCount === 3,
        importedReferenceChartsCount: importedCount,
        engineeringVerified: verifiedCount === 3 && referenceTemplates.length === 3,
        verifiedReferenceChartsCount: verifiedCount,
        operationallyActive: activeCount > 0,
        activeTankAssignmentsCount: referenceTemplates.reduce(
          (acc, t) => acc + (t.activeAssignedTanksCount || 0),
          0
        ),
        draftTankAssignmentsCount: referenceTemplates.reduce(
          (acc, t) => acc + (t.stagedDraftTanksCount || 0),
          0
        ),
        operationallyComplete,
        overallStatusLabel: statusSummary.overallStatusLabel,
        blockingReasons,
      },
      templates: referenceTemplates,
      referenceTemplates,
      standardTemplates,
      comparison20kl,
      coco22Tanks: enrichedCocoTanks,
      cocoTanks: enrichedCocoTanks,
      documents: docRows,
      availableDocuments: docRows,
      auditLogs: recentAuditLogs,
      recentAuditLogs,
    },
    error: null,
  });
});

// POST /api/v1/calibration-templates/test-console - ADMIN-only read-only simulation tool
tankCalibration.post('/calibration-templates/test-console', async (c: AppContext) => {
  const user = c.var.user;
  if (!user || !user.roles?.includes(ROLES.ADMIN)) {
    return c.json(
      {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'Global ADMIN authority is required to access the Calibration Test Console.',
        },
      },
      403
    );
  }

  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);
  const body = await c.req.json().catch(() => ({}));

  const tankId = typeof body?.tankId === 'string' ? body.tankId.trim() : '';
  const dipMmRaw = body?.dipMm ?? body?.dipMillimetres;
  const waterDipMmRaw = body?.waterDipMm ?? body?.waterDipMillimetres ?? 0;
  const proposedChartId = typeof body?.proposedChartId === 'string' ? body.proposedChartId.trim() : null;
  const proposedTemplateId = typeof body?.proposedTemplateId === 'string' ? body.proposedTemplateId.trim() : null;

  if (!tankId || dipMmRaw === undefined || dipMmRaw === null || String(dipMmRaw).trim() === '') {
    return c.json(
      {
        success: false,
        data: null,
        error: {
          code: 'BAD_REQUEST',
          message: 'tankId and dipMm are required for Calibration Test Console simulation.',
        },
      },
      400
    );
  }

  const tank = await pumpRepo.findTankById(tankId);
  if (!tank) {
    return c.json(
      {
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: `Tank not found: ${tankId}` },
      },
      404
    );
  }

  const [outlet] = await db
    .select()
    .from(schema.retailOutlets)
    .where(eq(schema.retailOutlets.id, tank.outletId))
    .limit(1);

  let dipMilliunits: number;
  let waterDipMilliunits: number;
  try {
    const rawDipNum = Number(dipMmRaw);
    const rawWaterNum = Number(waterDipMmRaw ?? 0);
    if (!Number.isFinite(rawDipNum) || rawDipNum < 0) {
      const err = new Error('Dip measurement cannot be negative or non-numeric');
      (err as any).code = 'DIP_OUT_OF_RANGE';
      throw err;
    }
    if (!Number.isFinite(rawWaterNum) || rawWaterNum < 0) {
      const err = new Error('Water dip measurement cannot be negative or non-numeric');
      (err as any).code = 'DIP_OUT_OF_RANGE';
      throw err;
    }
    dipMilliunits = parseMilliunits(dipMmRaw);
    waterDipMilliunits = parseMilliunits(waterDipMmRaw ?? 0);
  } catch (err: any) {
    return c.json(
      {
        success: false,
        data: null,
        error: {
          code: err.code || 'DIP_OUT_OF_RANGE',
          message: err.message || 'Invalid dip value',
        },
      },
      400
    );
  }

  if (waterDipMilliunits > dipMilliunits) {
    return c.json(
      {
        success: false,
        data: null,
        error: {
          code: 'WATER_DIP_EXCEEDS_PRODUCT_DIP',
          message: `Water dip (${formatMilliunits(waterDipMilliunits)} mm) cannot exceed total product dip (${formatMilliunits(dipMilliunits)} mm).`,
        },
      },
      400
    );
  }

  const charts = await pumpRepo.listCalibrationCharts(tankId);
  const activeChart = charts.find(ch => ch.status === 'ACTIVE') || null;
  const draftChart = charts.find(ch => ch.status === 'DRAFT') || null;

  let activeResult = null;
  let activeError: any = null;
  if (activeChart) {
    try {
      const resolvedActive = await TankCalibrationService.resolveTankChartAndPoints(
        db,
        tankId,
        activeChart.id
      );
      activeResult = TankCalibrationService.evaluateRevisionSimulation(
        resolvedActive.points,
        {
          chartId: activeChart.id,
          revisionNumber: activeChart.revisionNumber,
          status: activeChart.status,
          sourceCode: activeChart.referenceDocument || activeChart.sourceFileName || `Rev #${activeChart.revisionNumber}`,
        },
        dipMilliunits,
        waterDipMilliunits
      );
    } catch (err: any) {
      activeError = err;
    }
  }

  let proposedResult = null;
  let proposedError: any = null;

  if (proposedTemplateId) {
    const tpl = await pumpRepo.findGlobalTankCalibrationTemplateById(proposedTemplateId);
    if (!tpl) {
      return c.json(
        {
          success: false,
          data: null,
          error: { code: 'NOT_FOUND', message: `Proposed template not found: ${proposedTemplateId}` },
        },
        404
      );
    }
    try {
      proposedResult = TankCalibrationService.evaluateRevisionSimulation(
        tpl.points || [],
        {
          chartId: tpl.id,
          revisionNumber: tpl.revisionNumber,
          status: tpl.status,
          sourceCode: tpl.code,
        },
        dipMilliunits,
        waterDipMilliunits
      );
    } catch (err: any) {
      proposedError = err;
    }
  } else {
    const targetProposedChart = proposedChartId
      ? charts.find(ch => ch.id === proposedChartId) || null
      : draftChart;
    if (targetProposedChart) {
      try {
        const resolvedProp = await TankCalibrationService.resolveTankChartAndPoints(
          db,
          tankId,
          targetProposedChart.id
        );
        proposedResult = TankCalibrationService.evaluateRevisionSimulation(
          resolvedProp.points,
          {
            chartId: targetProposedChart.id,
            revisionNumber: targetProposedChart.revisionNumber,
            status: targetProposedChart.status,
            sourceCode:
              targetProposedChart.referenceDocument ||
              targetProposedChart.sourceFileName ||
              `Rev #${targetProposedChart.revisionNumber}`,
          },
          dipMilliunits,
          waterDipMilliunits
        );
      } catch (err: any) {
        proposedError = err;
      }
    }
  }

  // If the explicitly requested proposed chart/template failed (e.g., DIP_OUT_OF_RANGE), or if active failed when no proposed was requested, reject out-of-range dip
  if ((proposedTemplateId || proposedChartId) && proposedError) {
    return c.json(
      {
        success: false,
        data: null,
        error: {
          code: proposedError.code || 'DIP_OUT_OF_RANGE',
          message: proposedError.message,
        },
      },
      400
    );
  }

  if (!activeResult && !proposedResult) {
    const primaryErr = proposedError || activeError;
    return c.json(
      {
        success: false,
        data: null,
        error: {
          code: primaryErr?.code || 'DIP_OUT_OF_RANGE',
          message: primaryErr?.message || 'Dip measurement is out of range for tank calibration chart.',
        },
      },
      400
    );
  }

  let comparison = null;
  let beforeAfterComparison = null;
  if (activeResult && proposedResult) {
    const grossDeltaMilli =
      Math.round(proposedResult.grossVolumeLitres * 1000) -
      Math.round(activeResult.grossVolumeLitres * 1000);
    const waterDeltaMilli =
      Math.round(proposedResult.waterVolumeLitres * 1000) -
      Math.round(activeResult.waterVolumeLitres * 1000);
    const netDeltaMilli =
      Math.round(proposedResult.netProductVolumeLitres * 1000) -
      Math.round(activeResult.netProductVolumeLitres * 1000);

    const fmtSigned = (m: number) =>
      m < 0 ? `-${formatMilliunits(Math.abs(m))}` : formatMilliunits(m);

    const grossDeltaPercent =
      activeResult.grossVolumeLitres > 0
        ? Number(((grossDeltaMilli / 1000 / activeResult.grossVolumeLitres) * 100).toFixed(4))
        : grossDeltaMilli === 0
          ? 0
          : null;

    comparison = {
      grossDeltaLitres: grossDeltaMilli / 1000,
      grossDeltaLitresStr: fmtSigned(grossDeltaMilli),
      waterDeltaLitres: waterDeltaMilli / 1000,
      waterDeltaLitresStr: fmtSigned(waterDeltaMilli),
      netDeltaLitres: netDeltaMilli / 1000,
      netDeltaLitresStr: fmtSigned(netDeltaMilli),
      netProductDeltaLitres: netDeltaMilli / 1000,
      netProductDeltaLitresStr: fmtSigned(netDeltaMilli),
      grossDeltaPercent,
    };

    beforeAfterComparison = {
      grossVolumeDeltaLitres: grossDeltaMilli / 1000,
      netProductVolumeDeltaLitres: netDeltaMilli / 1000,
      percentageDelta: grossDeltaPercent,
    };
  }

  return c.json({
    success: true,
    data: {
      simulationMode: 'READ_ONLY_SIMULATION',
      isReadOnlySimulation: true,
      readOnlySimulation: true,
      simulatedAt: new Date().toISOString(),
      outlet: outlet
        ? {
            id: outlet.id,
            roCode: outlet.roCode,
            name: outlet.name,
          }
        : null,
      tank: {
        id: tank.id,
        tankNumber: tank.tankNumber,
        name: tank.name,
        outletId: tank.outletId,
        outletCode: outlet?.roCode || '',
        outletName: outlet?.name || '',
        productCode: tank.productCode || '',
        productName: tank.productName || '',
        capacityLitres: tank.capacityLitres,
      },
      enteredDipMm: dipMilliunits / 1000,
      enteredWaterDipMm: waterDipMilliunits / 1000,
      productDipMm: dipMilliunits / 1000,
      dipMm: dipMilliunits / 1000,
      dipMmStr: formatMilliunits(dipMilliunits),
      waterDipMm: waterDipMilliunits / 1000,
      waterDipMmStr: formatMilliunits(waterDipMilliunits),
      activeRevision: activeResult,
      proposedRevision: proposedResult,
      activeResult,
      proposedResult,
      beforeAfterComparison,
      comparison,
    },
    error: null,
  });
});

// POST /api/v1/calibration-templates/:id/interpolate - Interpolate dip & water dip on a global calibration template without modifying stored values
tankCalibration.post('/calibration-templates/:id/interpolate', requirePermission(PERMISSIONS.TANK_CALIBRATION_READ) as any, async (c: AppContext) => {
  const id = c.req.param('id') || '';
  if (!id) {
    return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'Template ID is required' } }, 400);
  }

  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);
  const template = await pumpRepo.findGlobalTankCalibrationTemplateById(id);
  if (!template) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Global calibration template not found' } }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const dipMmRaw = body?.dipMm ?? body?.dipMillimetres;
  const waterDipMmRaw = body?.waterDipMm ?? body?.waterDipMillimetres ?? 0;

  if (dipMmRaw === undefined || dipMmRaw === null || String(dipMmRaw).trim() === '') {
    return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'dipMm is required' } }, 400);
  }

  try {
    const rawDipNum = Number(dipMmRaw);
    const rawWaterNum = Number(waterDipMmRaw ?? 0);
    if (!Number.isFinite(rawDipNum) || rawDipNum < 0) {
      const err = new Error('Dip measurement cannot be negative');
      (err as any).code = 'DIP_OUT_OF_RANGE';
      throw err;
    }
    if (!Number.isFinite(rawWaterNum) || rawWaterNum < 0) {
      const err = new Error('Water dip measurement cannot be negative');
      (err as any).code = 'DIP_OUT_OF_RANGE';
      throw err;
    }
    const dipMilliunits = parseMilliunits(dipMmRaw);
    const waterDipMilliunits = parseMilliunits(waterDipMmRaw ?? 0);

    const sim = TankCalibrationService.evaluateRevisionSimulation(
      template.points || [],
      {
        chartId: template.id,
        revisionNumber: template.revisionNumber,
        status: template.status,
        sourceCode: template.code,
      },
      dipMilliunits,
      waterDipMilliunits
    );

    return c.json({
      success: true,
      data: {
        templateCode: template.code,
        templateName: template.name,
        nominalCapacityLitres: template.nominalCapacityLitres,
        dipMillimetres: dipMilliunits / 1000,
        dipMm: dipMilliunits / 1000,
        dipMmStr: formatMilliunits(dipMilliunits),
        waterDipMm: waterDipMilliunits / 1000,
        waterDipMmStr: formatMilliunits(waterDipMilliunits),
        interpolatedVolumeLitres: sim.grossVolumeLitres,
        lowerBound: sim.lowerBracketPoint,
        upperBound: sim.upperBracketPoint,
        ...sim,
      },
      error: null,
    });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        data: null,
        error: {
          code: err.code || 'DIP_OUT_OF_RANGE',
          message: err.message,
        },
      },
      400
    );
  }
});

// POST /api/v1/calibration-templates/:id/engineering-verify - Record engineering verification & supporting Document Vault evidence for a global reference template
tankCalibration.post('/calibration-templates/:id/engineering-verify', requirePermission(PERMISSIONS.TANK_CALIBRATION_WRITE) as any, async (c: AppContext) => {
  const id = c.req.param('id') || '';
  if (!id) {
    return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'Template ID is required' } }, 400);
  }

  if (!canAuthorizeCalibrationActivation(c)) {
    return c.json(
      {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'Recording engineering verification requires ADMIN or calibration approval authority.',
        },
      },
      403
    );
  }

  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);
  const body = await c.req.json().catch(() => ({}));

  try {
    const result = await pumpRepo.recordGlobalTemplateEngineeringVerification(
      id,
      {
        decision: body.decision || 'VERIFIED',
        tankIdentifier: body.tankIdentifier,
        tankSerialNumber: body.tankSerialNumber,
        verifiedCapacityLitres: Number(body.verifiedCapacityLitres),
        verifiedDiameterMm: Number(body.verifiedDiameterMm),
        verifiedLengthMm: Number(body.verifiedLengthMm),
        verifiedMaxDipMm: Number(body.verifiedMaxDipMm),
        issuingAuthority: body.issuingAuthority,
        certificateNumber: body.certificateNumber,
        verificationDate: body.verificationDate,
        engineeringApprover: body.engineeringApprover,
        supportingDocumentId: body.supportingDocumentId,
        resolveLengthConflict: Boolean(body.resolveLengthConflict),
        confirmedLengthMm: body.confirmedLengthMm != null ? Number(body.confirmedLengthMm) : null,
        lengthResolutionNotes: body.lengthResolutionNotes ?? null,
        allowScopedPolicyException: Boolean(body.allowScopedPolicyException),
        governingPolicyReference: body.governingPolicyReference ?? null,
        discrepancyResolutionNote: body.discrepancyResolutionNote ?? null,
        comparedAgainstStandard20kl: Boolean(body.comparedAgainstStandard20kl),
        notes: body.notes ?? null,
      },
      c.var.user!.user.id
    );

    return c.json({
      success: true,
      data: result,
      error: null,
    });
  } catch (err: any) {
    const status = err.code === 'NOT_FOUND' ? 404 : 400;
    return c.json(
      {
        success: false,
        data: null,
        error: {
          code: err.code || 'VERIFICATION_FAILED',
          message: err.message,
        },
      },
      status
    );
  }
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
            allowOverCapacity: Boolean(body.allowOverCapacity),
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
          newValue: {
            code: existing.code,
            status: imported.status,
            pointsCount: imported.pointsCount ?? parsedPoints.length,
            sourceFileName,
            allowOverCapacity: Boolean(body.allowOverCapacity),
          },
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
        allowOverCapacity: Boolean(body.allowOverCapacity),
      },
      parsedPoints
    );

    await auditRepo.logAction({
      id: `audit-gtct-create-${Date.now()}`,
      userId: userCtx.user.id,
      action: 'GLOBAL_CALIBRATION_TEMPLATE_CREATE',
      entityType: 'GLOBAL_TANK_CALIBRATION_TEMPLATE',
      entityId: templateId,
      newValue: {
        code,
        name,
        nominalCapacityLitres,
        status: created.status,
        pointsCount: created.pointsCount ?? parsedPoints.length,
        allowOverCapacity: Boolean(body.allowOverCapacity),
      },
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
        allowOverCapacity: Boolean(body.allowOverCapacity),
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
        pointsCount: updated.pointsCount ?? parsedPoints.length,
        maxVolumeLitres: updated.maxVolumeLitres ?? null,
        allowOverCapacity: Boolean(body.allowOverCapacity),
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
  const { status, allowOverCapacity, confirmOverCapacity } = body;

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
  const overCapacityConfirmed = Boolean(allowOverCapacity || confirmOverCapacity);
  try {
    const updated = await pumpRepo.updateGlobalTankCalibrationTemplateStatus(
      id,
      status,
      userCtx.user.id,
      nowIso,
      {
        allowOverCapacity: overCapacityConfirmed,
        confirmOverCapacity: overCapacityConfirmed,
      }
    );
    if (!updated) {
      return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Global template not found' } }, 404);
    }

    await auditRepo.logAction({
      id: `audit-gtct-status-${Date.now()}`,
      userId: userCtx.user.id,
      action: 'GLOBAL_CALIBRATION_TEMPLATE_STATUS_UPDATE',
      entityType: 'GLOBAL_TANK_CALIBRATION_TEMPLATE',
      entityId: updated.id,
      newValue: {
        code: updated.code,
        status,
        pointsCount: updated.pointsCount,
        maxVolumeLitres: updated.maxVolumeLitres ?? null,
        confirmOverCapacity: overCapacityConfirmed,
      },
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
const handleGlobalTemplateAssignPreview = async (c: AppContext) => {
  const id = c.req.param('id') || '';
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'Template ID is required' } }, 400);

  if (!canAuthorizeCalibrationActivation(c)) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'FORBIDDEN',
        message: 'Only authorized calibration administrators can preview or assign global calibration templates',
      },
    }, 403);
  }

  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);
  const outletRepo = new OutletRepository(db);

  const body = await c.req.json().catch(() => ({}));
  const { tankIds } = body;
  if (!Array.isArray(tankIds) || tankIds.length === 0) {
    return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'tankIds array is required' } }, 400);
  }

  for (const tankId of tankIds) {
    const tank = await pumpRepo.findTankById(tankId);
    if (!tank) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'INVALID_TANK', message: `Tank not found: ${tankId}` },
      }, 400);
    }
    if (!await verifyOutletAuthority(c, tank.outletId, outletRepo)) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: `No authority over outlet for tank ${tankId}` },
      }, 403);
    }
  }

  try {
    const previewData = await pumpRepo.previewGlobalTemplateAssignment(id, tankIds);
    return c.json({
      success: true,
      data: previewData,
      error: null,
    });
  } catch (err: any) {
    const status = err.code === 'NOT_FOUND' ? 404 : 400;
    return c.json({
      success: false,
      data: null,
      error: { code: err.code || 'INCOMPATIBLE_TANK', message: err.message },
    }, status);
  }
};

tankCalibration.post(
  '/calibration-templates/:id/assign-preview',
  requirePermission(PERMISSIONS.TANK_CALIBRATION_WRITE) as any,
  handleGlobalTemplateAssignPreview as any
);
tankCalibration.post(
  '/calibration-templates/:id/preview-assignment',
  requirePermission(PERMISSIONS.TANK_CALIBRATION_WRITE) as any,
  handleGlobalTemplateAssignPreview as any
);

// POST /api/v1/calibration-templates/:id/assign - Assign global template to multiple tanks as DRAFT only
// Enforces tank compatibility, verified dimensions, and user authorisation. Preserves ACTIVE tank charts and existing DRAFT revisions.
tankCalibration.post('/calibration-templates/:id/assign', requirePermission(PERMISSIONS.TANK_CALIBRATION_WRITE) as any, async (c: AppContext) => {
  const id = c.req.param('id') || '';
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'Template ID is required' } }, 400);

  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);
  const outletRepo = new OutletRepository(db);
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
  const { tankIds, notes } = body;

  if (!Array.isArray(tankIds) || tankIds.length === 0) {
    return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'tankIds array is required' } }, 400);
  }

  for (const tankId of tankIds) {
    const tank = await pumpRepo.findTankById(tankId);
    if (!tank) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'INVALID_TANK', message: `Tank not found: ${tankId}` },
      }, 400);
    }
    if (!await verifyOutletAuthority(c, tank.outletId, outletRepo)) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: `No authority over outlet for tank ${tankId}` },
      }, 403);
    }
  }

  try {
    // Requirement 7: Keep all assignments DRAFT only. Preserve existing ACTIVE charts and existing DRAFT revisions.
    const result = await pumpRepo.assignGlobalTemplateToTanks(id, tankIds, userCtx.user.id, {
      activateImmediately: false,
      preserveExistingDraft: true,
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
        activateImmediately: false,
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
    const status = err.code === 'NOT_FOUND' ? 404 : 400;
    return c.json({
      success: false,
      data: null,
      error: { code: err.code || 'ASSIGNMENT_FAILED', message: err.message },
    }, status);
  }
});

export default tankCalibration;


