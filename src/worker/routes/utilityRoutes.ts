import { Hono } from 'hono';
import { getDb } from '../../db';
import { UtilityRepository } from '../repositories/utilityRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { UtilityService, UtilityError } from '../services/utilityService';
import { ScopeService } from '../services/scopeService';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../../shared/constants';

export const utilityRoutes = new Hono<{ Bindings: EnvBindings }>();

utilityRoutes.use('*', requireAuth as any);

async function verifyOutletAuthority(c: AppContext, outletId: string, outletRepo: OutletRepository): Promise<boolean> {
  const userCtx = c.var.user;
  if (!userCtx) return false;
  return ScopeService.canAccessOutlet(userCtx, outletId, outletRepo);
}

function getServices(c: AppContext) {
  const db = getDb(c.env.DB);
  const utilityRepo = new UtilityRepository(db);
  const outletRepo = new OutletRepository(db);
  const utilityService = new UtilityService(db);
  return { utilityService, utilityRepo, outletRepo };
}

function handleUtilityError(c: AppContext, err: any) {
  if (err instanceof UtilityError) {
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
  console.error('[Utility Operation Error]:', err);
  return c.json({
    success: false,
    data: null,
    error: { code: 'INTERNAL_SERVER_ERROR', message: err.message || 'An unexpected error occurred' },
  }, 500);
}

// ============================================================================
// Electricity Accounts
// ============================================================================

// List electricity accounts for outlet
utilityRoutes.get(
  '/outlets/:outletId/utilities/electricity-accounts',
  requirePermission(PERMISSIONS.UTILITIES_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { utilityService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const accounts = await utilityService.listElectricityAccounts(outletId);
      return c.json({ success: true, data: accounts, error: null });
    } catch (err) {
      return handleUtilityError(c, err);
    }
  }
);

// Create electricity account
utilityRoutes.post(
  '/outlets/:outletId/utilities/electricity-accounts',
  requirePermission(PERMISSIONS.UTILITY_ACCOUNTS_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { utilityService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const body = await c.req.json();
      const account = await utilityService.createElectricityAccount(outletId, c.var.user.user.id, body);
      return c.json({ success: true, data: account, error: null }, 201);
    } catch (err) {
      return handleUtilityError(c, err);
    }
  }
);

// Update electricity account
utilityRoutes.put(
  '/utilities/electricity-accounts/:id',
  requirePermission(PERMISSIONS.UTILITY_ACCOUNTS_WRITE) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const { utilityService, utilityRepo, outletRepo } = getServices(c);

    const account = await utilityRepo.getElectricityAccountById(id);
    if (!account) {
      return c.json({ success: false, data: null, error: { code: 'UTILITY_ELECTRICITY_ACCOUNT_NOT_FOUND', message: 'Electricity account not found' } }, 404);
    }

    if (!(await verifyOutletAuthority(c, account.outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const body = await c.req.json();
      const updated = await utilityService.updateElectricityAccount(id, c.var.user.user.id, body);
      return c.json({ success: true, data: updated, error: null });
    } catch (err) {
      return handleUtilityError(c, err);
    }
  }
);

// ============================================================================
// Electricity Bills
// ============================================================================

// List electricity bills for outlet
utilityRoutes.get(
  '/outlets/:outletId/utilities/electricity-bills',
  requirePermission(PERMISSIONS.UTILITIES_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { utilityService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const query = c.req.query();
      const bills = await utilityService.listElectricityBills(outletId, query);
      return c.json({ success: true, data: bills, error: null });
    } catch (err) {
      return handleUtilityError(c, err);
    }
  }
);

// Create electricity bill
utilityRoutes.post(
  '/outlets/:outletId/utilities/electricity-bills',
  requirePermission(PERMISSIONS.UTILITY_BILLS_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { utilityService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const body = await c.req.json();
      const bill = await utilityService.createElectricityBill(outletId, c.var.user.user.id, body);
      return c.json({ success: true, data: bill, error: null }, 201);
    } catch (err) {
      return handleUtilityError(c, err);
    }
  }
);

// Get electricity bill detail
utilityRoutes.get(
  '/utilities/electricity-bills/:id',
  requirePermission(PERMISSIONS.UTILITIES_READ) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const { utilityService, utilityRepo, outletRepo } = getServices(c);

    const bill = await utilityRepo.getElectricityBillById(id);
    if (!bill) {
      return c.json({ success: false, data: null, error: { code: 'UTILITY_ELECTRICITY_BILL_NOT_FOUND', message: 'Electricity bill not found' } }, 404);
    }

    if (!(await verifyOutletAuthority(c, bill.outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const detail = await utilityService.getElectricityBill(id);
      return c.json({ success: true, data: detail, error: null });
    } catch (err) {
      return handleUtilityError(c, err);
    }
  }
);

// Update electricity bill
utilityRoutes.put(
  '/utilities/electricity-bills/:id',
  requirePermission(PERMISSIONS.UTILITY_BILLS_WRITE) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const { utilityService, utilityRepo, outletRepo } = getServices(c);

    const bill = await utilityRepo.getElectricityBillById(id);
    if (!bill) {
      return c.json({ success: false, data: null, error: { code: 'UTILITY_ELECTRICITY_BILL_NOT_FOUND', message: 'Electricity bill not found' } }, 404);
    }

    if (!(await verifyOutletAuthority(c, bill.outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const body = await c.req.json();
      const updated = await utilityService.updateElectricityBill(id, c.var.user.user.id, body);
      return c.json({ success: true, data: updated, error: null });
    } catch (err) {
      return handleUtilityError(c, err);
    }
  }
);

// Mark electricity bill paid
utilityRoutes.post(
  '/utilities/electricity-bills/:id/mark-paid',
  requirePermission(PERMISSIONS.UTILITY_PAYMENTS_WRITE) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const { utilityService, utilityRepo, outletRepo } = getServices(c);

    const bill = await utilityRepo.getElectricityBillById(id);
    if (!bill) {
      return c.json({ success: false, data: null, error: { code: 'UTILITY_ELECTRICITY_BILL_NOT_FOUND', message: 'Electricity bill not found' } }, 404);
    }

    if (!(await verifyOutletAuthority(c, bill.outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const body = await c.req.json();
      const paidBill = await utilityService.markElectricityBillPaid(id, c.var.user.user.id, body);
      return c.json({ success: true, data: paidBill, error: null });
    } catch (err) {
      return handleUtilityError(c, err);
    }
  }
);

// Electricity summary
utilityRoutes.get(
  '/outlets/:outletId/utilities/electricity-summary',
  requirePermission(PERMISSIONS.UTILITIES_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { utilityService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const summary = await utilityService.getElectricitySummary(outletId);
      return c.json({ success: true, data: summary, error: null });
    } catch (err) {
      return handleUtilityError(c, err);
    }
  }
);

// ============================================================================
// Sub-Meters
// ============================================================================

// List sub-meters for outlet
utilityRoutes.get(
  '/outlets/:outletId/utilities/sub-meters',
  requirePermission(PERMISSIONS.UTILITIES_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { utilityService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const query = c.req.query();
      const subMeters = await utilityService.listSubMeters(outletId, query);
      return c.json({ success: true, data: subMeters, error: null });
    } catch (err) {
      return handleUtilityError(c, err);
    }
  }
);

// Create sub-meter
utilityRoutes.post(
  '/outlets/:outletId/utilities/sub-meters',
  requirePermission(PERMISSIONS.UTILITY_SUB_METERS_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { utilityService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const body = await c.req.json();
      const subMeter = await utilityService.createSubMeter(outletId, c.var.user.user.id, body);
      return c.json({ success: true, data: subMeter, error: null }, 201);
    } catch (err) {
      return handleUtilityError(c, err);
    }
  }
);

// Get sub-meter detail
utilityRoutes.get(
  '/utilities/sub-meters/:id',
  requirePermission(PERMISSIONS.UTILITIES_READ) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const { utilityService, utilityRepo, outletRepo } = getServices(c);

    const subMeter = await utilityRepo.getSubMeterById(id);
    if (!subMeter) {
      return c.json({ success: false, data: null, error: { code: 'UTILITY_SUB_METER_NOT_FOUND', message: 'Sub-meter not found' } }, 404);
    }

    if (!(await verifyOutletAuthority(c, subMeter.outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const detail = await utilityService.getSubMeter(id);
      return c.json({ success: true, data: detail, error: null });
    } catch (err) {
      return handleUtilityError(c, err);
    }
  }
);

// Update sub-meter
utilityRoutes.put(
  '/utilities/sub-meters/:id',
  requirePermission(PERMISSIONS.UTILITY_SUB_METERS_WRITE) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const { utilityService, utilityRepo, outletRepo } = getServices(c);

    const subMeter = await utilityRepo.getSubMeterById(id);
    if (!subMeter) {
      return c.json({ success: false, data: null, error: { code: 'UTILITY_SUB_METER_NOT_FOUND', message: 'Sub-meter not found' } }, 404);
    }

    if (!(await verifyOutletAuthority(c, subMeter.outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const body = await c.req.json();
      const updated = await utilityService.updateSubMeter(id, c.var.user.user.id, body);
      return c.json({ success: true, data: updated, error: null });
    } catch (err) {
      return handleUtilityError(c, err);
    }
  }
);

// ============================================================================
// Sub-Meter Readings
// ============================================================================

// List readings for a sub-meter
utilityRoutes.get(
  '/utilities/sub-meters/:id/readings',
  requirePermission(PERMISSIONS.UTILITIES_READ) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const { utilityService, utilityRepo, outletRepo } = getServices(c);

    const subMeter = await utilityRepo.getSubMeterById(id);
    if (!subMeter) {
      return c.json({ success: false, data: null, error: { code: 'UTILITY_SUB_METER_NOT_FOUND', message: 'Sub-meter not found' } }, 404);
    }

    if (!(await verifyOutletAuthority(c, subMeter.outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const readings = await utilityService.listSubMeterReadings(id);
      return c.json({ success: true, data: readings, error: null });
    } catch (err) {
      return handleUtilityError(c, err);
    }
  }
);

// Record sub-meter reading
utilityRoutes.post(
  '/utilities/sub-meters/:id/readings',
  requirePermission(PERMISSIONS.UTILITY_SUB_METER_READINGS_WRITE) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const { utilityService, utilityRepo, outletRepo } = getServices(c);

    const subMeter = await utilityRepo.getSubMeterById(id);
    if (!subMeter) {
      return c.json({ success: false, data: null, error: { code: 'UTILITY_SUB_METER_NOT_FOUND', message: 'Sub-meter not found' } }, 404);
    }

    if (!(await verifyOutletAuthority(c, subMeter.outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const body = await c.req.json();
      const reading = await utilityService.createSubMeterReading(id, c.var.user.user.id, body);
      return c.json({ success: true, data: reading, error: null }, 201);
    } catch (err) {
      return handleUtilityError(c, err);
    }
  }
);

// ============================================================================
// Sub-Meter Charge Summary
// ============================================================================

utilityRoutes.get(
  '/outlets/:outletId/utilities/sub-meter-charge-summary',
  requirePermission(PERMISSIONS.UTILITIES_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { utilityService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const query = c.req.query();
      const summary = await utilityService.getSubMeterChargeSummary(outletId, query);
      return c.json({ success: true, data: summary, error: null });
    } catch (err) {
      return handleUtilityError(c, err);
    }
  }
);
