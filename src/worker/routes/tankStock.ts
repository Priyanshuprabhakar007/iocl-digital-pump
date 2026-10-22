import { Hono } from 'hono';
import { getDb } from '../../db';
import { PumpRepository } from '../repositories/pumpRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { ScopeService } from '../services/scopeService';
import { TankCalibrationService } from '../services/tankCalibrationService';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { TankStockReadingSchema, BatchTankStockReadingSchema } from '../../shared/validators';
import { PERMISSIONS } from '../../shared/constants';
import { parseMilliunits, formatMilliunits } from '../../shared/precision';

export const tankStock = new Hono<{ Bindings: EnvBindings }>();

tankStock.use('*', requireAuth as any);

async function verifyOutletAuthority(c: AppContext, outletId: string, outletRepo: OutletRepository): Promise<boolean> {
  const userCtx = c.var.user;
  if (!userCtx) return false;
  return ScopeService.canAccessOutlet(userCtx, outletId, outletRepo);
}

// GET /api/v1/shifts/:shiftId/tank-snapshots - List tank snapshots for shift
tankStock.get('/shifts/:shiftId/tank-snapshots', requirePermission(PERMISSIONS.TANK_STOCK_READ) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId');
  if (!shiftId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'shiftId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Operational shift not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this shift outlet' } }, 403);
  }

  const snapshots = await pumpRepo.listShiftTankSnapshots(shiftId);
  return c.json({ success: true, data: snapshots, error: null });
});

// GET /api/v1/shifts/:shiftId/tank-readings - List all tank stock readings for shift
tankStock.get('/shifts/:shiftId/tank-readings', requirePermission(PERMISSIONS.TANK_STOCK_READ) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId');
  if (!shiftId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'shiftId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Operational shift not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this shift outlet' } }, 403);
  }

  const readings = await pumpRepo.listShiftTankReadings(shiftId);
  return c.json({ success: true, data: readings, error: null });
});

// GET /api/v1/shifts/:shiftId/tanks/:tankId/readings - List readings for specific tank
tankStock.get('/shifts/:shiftId/tanks/:tankId/readings', requirePermission(PERMISSIONS.TANK_STOCK_READ) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId');
  const tankId = c.req.param('tankId');
  if (!shiftId || !tankId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'shiftId and tankId are required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Operational shift not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this shift outlet' } }, 403);
  }

  const all = await pumpRepo.listShiftTankReadings(shiftId);
  const filtered = all.filter(r => r.tankId === tankId);
  return c.json({ success: true, data: filtered, error: null });
});

// GET /api/v1/outlets/:outletId/tanks/:tankId/previous-closing - Suggest opening stock from prior closed shift
tankStock.get('/outlets/:outletId/tanks/:tankId/previous-closing', requirePermission(PERMISSIONS.TANK_STOCK_READ) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId');
  const tankId = c.req.param('tankId');
  if (!outletId || !tankId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'outletId and tankId are required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const prev = await pumpRepo.findPreviousShiftClosingStock(outletId, tankId);
  return c.json({
    success: true,
    data: prev ? {
      suggestedOpeningStockMilliunits: prev.closingStockMilliunits,
      suggestedOpeningStockStr: prev.closingStockStr,
      previousShiftId: prev.shiftId,
      previousBusinessDate: prev.businessDate,
    } : null,
    error: null,
  });
});

// POST /api/v1/shifts/:shiftId/tank-readings - Record physical tank dip reading
tankStock.post('/shifts/:shiftId/tank-readings', requirePermission(PERMISSIONS.TANK_STOCK_WRITE) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId');
  if (!shiftId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'shiftId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Operational shift not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this shift outlet' } }, 403);
  }

  if (shift.status === 'CLOSED' || shift.status === 'LOCKED') {
    return c.json({
      success: false,
      data: null,
      error: { code: 'SHIFT_CLOSED', message: `Operational shift is ${shift.status}. Modifying tank readings on a closed shift is prohibited.` },
    }, 409);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = TankStockReadingSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid tank reading payload', details: parseResult.error.flatten() },
    }, 400);
  }

  const { tankId, readingType, source, productDipMm, waterDipMm, notes } = parseResult.data;

  // Validate tank belongs to snapshot for this shift
  const tankSnap = await pumpRepo.findShiftTankSnapshot(shiftId, tankId);
  if (!tankSnap) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'INVALID_TANK', message: 'Tank is not part of the active snapshot for this operational shift' },
    }, 400);
  }

  // Check single OPENING and single CLOSING constraint
  if (readingType === 'OPENING' || readingType === 'CLOSING') {
    const existing = await pumpRepo.findShiftTankReadingByType(shiftId, tankId, readingType);
    if (existing) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'DUPLICATE_READING_TYPE',
          message: `An ${readingType} reading has already been recorded for Tank #${tankSnap.tankNumber} in this shift`,
        },
      }, 409);
    }
  }

  const productDipMilli = parseMilliunits(productDipMm);
  const waterDipMilli = parseMilliunits(waterDipMm || '0.000');

  if (waterDipMilli > productDipMilli) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Water dip cannot exceed product dip' },
    }, 400);
  }

  // Authoritative volume derivation via calibration service
  let grossObservedVolumeMilliunits: number;
  let waterVolumeMilliunits = 0;

  try {
    const grossResult = await TankCalibrationService.convertDipToVolume(db, tankId, productDipMilli);
    grossObservedVolumeMilliunits = grossResult.calculatedVolumeMilliunits;

    if (waterDipMilli > 0) {
      const waterResult = await TankCalibrationService.convertDipToVolume(db, tankId, waterDipMilli);
      waterVolumeMilliunits = waterResult.calculatedVolumeMilliunits;
    }
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: { code: err.code || 'CALIBRATION_ERROR', message: err.message },
    }, 400);
  }

  if (waterVolumeMilliunits > grossObservedVolumeMilliunits) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Derived water volume exceeds gross observed volume' },
    }, 400);
  }

  const netProductVolumeMilliunits = grossObservedVolumeMilliunits - waterVolumeMilliunits;
  if (netProductVolumeMilliunits < 0) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Net product volume cannot be negative' },
    }, 400);
  }

  const nowIso = new Date().toISOString();
  const readingId = `tsr-${crypto.randomUUID()}`;

  const result = await pumpRepo.createTankReadingConditional({
    id: readingId,
    operationalShiftId: shiftId,
    outletId: shift.outletId,
    tankId,
    productId: tankSnap.productId,
    readingType,
    source,
    productDipMmMilliunits: productDipMilli,
    waterDipMmMilliunits: waterDipMilli,
    grossObservedVolumeMilliunits,
    waterVolumeMilliunits,
    netProductVolumeMilliunits,
    recordedAt: nowIso,
    recordedByUserId: c.var.user!.user.id,
    notes: notes || null,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  if (!result.success || !result.reading) {
    if (result.shiftClosed) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'SHIFT_CLOSED', message: 'Operational shift is CLOSED. Modifying tank readings on a closed shift is prohibited.' },
      }, 409);
    }
    return c.json({
      success: false,
      data: null,
      error: { code: 'CONFLICT', message: 'Could not record tank stock reading due to a conflicting record' },
    }, 409);
  }

  const created = result.reading;

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'TANK_STOCK_READING_RECORD',
    entityType: 'TANK_STOCK_READING',
    entityId: created.id,
    newValue: created as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: created, error: null }, 201);
});

// POST /api/v1/shifts/:shiftId/tank-readings/batch - Safe idempotent batch tank stock reading entry
tankStock.post('/shifts/:shiftId/tank-readings/batch', requirePermission(PERMISSIONS.TANK_STOCK_WRITE) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId');
  if (!shiftId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'shiftId is required' } }, 400);

  const body = await c.req.json().catch(() => null);
  const validation = BatchTankStockReadingSchema.safeParse(body);
  if (!validation.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid batch tank stock reading data', details: validation.error.flatten() },
    }, 400);
  }

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Operational shift not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this shift outlet' } }, 403);
  }

  if (shift.status !== 'OPEN') {
    return c.json({
      success: false,
      data: null,
      error: { code: 'SHIFT_CLOSED', message: 'Cannot record tank readings on a CLOSED shift. Shift records are immutable.' },
    }, 409);
  }

  const tankSnapshots = await pumpRepo.listShiftTankSnapshots(shiftId);
  const snapByTankId = new Map(tankSnapshots.map(t => [t.tankId, t]));

  // Pre-validate all rows before writing so batch is all-or-nothing
  const seenKeys = new Set<string>();
  const preparedRows: Array<{
    tankId: string;
    productId: string;
    readingType: 'OPENING' | 'CLOSING' | 'PRE_RECEIPT' | 'POST_RECEIPT' | 'ADHOC';
    source: 'MANUAL' | 'ATG';
    productDipMilli: number;
    waterDipMilli: number;
    grossObservedVolumeMilliunits: number;
    waterVolumeMilliunits: number;
    netProductVolumeMilliunits: number;
    notes: string | null;
  }> = [];

  for (const row of validation.data.readings) {
    const dedupeKey = `${row.tankId}:${row.readingType}`;
    if (seenKeys.has(dedupeKey)) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'DUPLICATE_BATCH_ROW', message: `Duplicate (${row.tankId}, ${row.readingType}) in batch payload` },
      }, 400);
    }
    seenKeys.add(dedupeKey);

    const tankSnap = snapByTankId.get(row.tankId);
    if (!tankSnap) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'TANK_NOT_IN_SNAPSHOT', message: `Tank ${row.tankId} is not part of this shift snapshot` },
      }, 400);
    }

    const productDipMilli = parseMilliunits(row.productDipMm);
    const waterDipMilli = row.waterDipMm ? parseMilliunits(row.waterDipMm) : 0;

    if (productDipMilli < 0 || waterDipMilli < 0) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Dip values cannot be negative' },
      }, 400);
    }

    if (waterDipMilli > productDipMilli) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Water dip cannot exceed product dip' },
      }, 400);
    }

    let grossObservedVolumeMilliunits = 0;
    let waterVolumeMilliunits = 0;
    try {
      const grossResult = await TankCalibrationService.convertDipToVolume(db, row.tankId, productDipMilli);
      grossObservedVolumeMilliunits = grossResult.calculatedVolumeMilliunits;

      if (waterDipMilli > 0) {
        const waterResult = await TankCalibrationService.convertDipToVolume(db, row.tankId, waterDipMilli);
        waterVolumeMilliunits = waterResult.calculatedVolumeMilliunits;
      }
    } catch (err: any) {
      return c.json({
        success: false,
        data: null,
        error: { code: err.code || 'CALIBRATION_ERROR', message: err.message },
      }, 400);
    }

    if (waterVolumeMilliunits > grossObservedVolumeMilliunits) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Derived water volume exceeds gross observed volume' },
      }, 400);
    }

    const netProductVolumeMilliunits = grossObservedVolumeMilliunits - waterVolumeMilliunits;
    if (netProductVolumeMilliunits < 0) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Net product volume cannot be negative' },
      }, 400);
    }

    preparedRows.push({
      tankId: row.tankId,
      productId: tankSnap.productId,
      readingType: row.readingType,
      source: row.source || 'MANUAL',
      productDipMilli,
      waterDipMilli,
      grossObservedVolumeMilliunits,
      waterVolumeMilliunits,
      netProductVolumeMilliunits,
      notes: row.notes || null,
    });
  }

  const existingReadings = await pumpRepo.listShiftTankReadings(shiftId);
  const nowIso = new Date().toISOString();
  const savedReadings = [];
  const results = [];

  for (const prep of preparedRows) {
    const existing = existingReadings.find(
      r => r.tankId === prep.tankId && r.readingType === prep.readingType && (prep.readingType === 'OPENING' || prep.readingType === 'CLOSING')
    );

    if (existing) {
      const updRes = await pumpRepo.updateTankReadingConditional(existing.id, shiftId, {
        source: prep.source,
        productDipMmMilliunits: prep.productDipMilli,
        waterDipMmMilliunits: prep.waterDipMilli,
        grossObservedVolumeMilliunits: prep.grossObservedVolumeMilliunits,
        waterVolumeMilliunits: prep.waterVolumeMilliunits,
        netProductVolumeMilliunits: prep.netProductVolumeMilliunits,
        recordedAt: nowIso,
        recordedByUserId: c.var.user!.user.id,
        notes: prep.notes,
        updatedAt: nowIso,
      });

      if (!updRes.success || !updRes.reading) {
        if (updRes.shiftClosed) {
          return c.json({
            success: false,
            data: null,
            error: { code: 'SHIFT_CLOSED', message: 'Operational shift is CLOSED.' },
          }, 409);
        }
        return c.json({
          success: false,
          data: null,
          error: { code: 'CONFLICT', message: `Failed to update tank reading for ${prep.tankId}` },
        }, 409);
      }

      savedReadings.push(updRes.reading);
      results.push({
        tankId: prep.tankId,
        readingType: prep.readingType,
        action: 'UPDATED' as const,
        reading: updRes.reading,
      });
    } else {
      const readingId = `tsr-${crypto.randomUUID()}`;
      const createRes = await pumpRepo.createTankReadingConditional({
        id: readingId,
        operationalShiftId: shiftId,
        outletId: shift.outletId,
        tankId: prep.tankId,
        productId: prep.productId,
        readingType: prep.readingType,
        source: prep.source,
        productDipMmMilliunits: prep.productDipMilli,
        waterDipMmMilliunits: prep.waterDipMilli,
        grossObservedVolumeMilliunits: prep.grossObservedVolumeMilliunits,
        waterVolumeMilliunits: prep.waterVolumeMilliunits,
        netProductVolumeMilliunits: prep.netProductVolumeMilliunits,
        recordedAt: nowIso,
        recordedByUserId: c.var.user!.user.id,
        notes: prep.notes,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      if (!createRes.success || !createRes.reading) {
        if (createRes.shiftClosed) {
          return c.json({
            success: false,
            data: null,
            error: { code: 'SHIFT_CLOSED', message: 'Operational shift is CLOSED.' },
          }, 409);
        }
        return c.json({
          success: false,
          data: null,
          error: { code: 'CONFLICT', message: `Failed to create tank reading for ${prep.tankId}` },
        }, 409);
      }

      savedReadings.push(createRes.reading);
      results.push({
        tankId: prep.tankId,
        readingType: prep.readingType,
        action: 'CREATED' as const,
        reading: createRes.reading,
      });
    }
  }

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'TANK_STOCK_READING_BATCH_RECORD',
    entityType: 'OPERATIONAL_SHIFT',
    entityId: shiftId,
    newValue: { count: savedReadings.length, shiftId },
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({
    success: true,
    data: {
      shiftId,
      processedCount: savedReadings.length,
      readings: savedReadings,
      results,
    },
    error: null,
  }, 200);
});

export default tankStock;
