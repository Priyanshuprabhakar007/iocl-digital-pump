import { Hono } from 'hono';
import { getDb } from '../../db';
import { MunicipalTaxRepository } from '../repositories/municipalTaxRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { MunicipalTaxService, MunicipalTaxError } from '../services/municipalTaxService';
import { ScopeService } from '../services/scopeService';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../../shared/constants';

export const municipalTaxRoutes = new Hono<{ Bindings: EnvBindings }>();

municipalTaxRoutes.use('*', requireAuth as any);

async function verifyOutletAuthority(c: AppContext, outletId: string, outletRepo: OutletRepository): Promise<boolean> {
  const userCtx = c.var.user;
  if (!userCtx) return false;
  return ScopeService.canAccessOutlet(userCtx, outletId, outletRepo);
}

function getServices(c: AppContext) {
  const db = getDb(c.env.DB);
  const municipalTaxRepo = new MunicipalTaxRepository(db);
  const outletRepo = new OutletRepository(db);
  const municipalTaxService = new MunicipalTaxService(db);
  return { municipalTaxService, municipalTaxRepo, outletRepo };
}

function handleMunicipalTaxError(c: AppContext, err: any) {
  if (err instanceof MunicipalTaxError) {
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
      error: {
        code: 'VALIDATION_ERROR',
        message: err.errors?.[0]?.message || 'Validation error',
        details: err.format?.(),
      },
    }, 400);
  }
  if (err.message && err.message.includes('MUNICIPAL_TAX_SUMMARY_OVERFLOW')) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'MUNICIPAL_TAX_SUMMARY_OVERFLOW', message: 'Statutory due summary amounts exceed safe calculation limits' },
    }, 400);
  }
  if (err.message && err.message.includes('MUNICIPAL_TAX_DOCUMENT_OUTLET_MISMATCH')) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'MUNICIPAL_TAX_DOCUMENT_OUTLET_MISMATCH', message: 'The assessment document does not belong to this outlet' },
    }, 400);
  }
  if (err.message && err.message.includes('MUNICIPAL_TAX_RECEIPT_OUTLET_MISMATCH')) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'MUNICIPAL_TAX_RECEIPT_OUTLET_MISMATCH', message: 'The payment receipt document does not belong to this outlet' },
    }, 400);
  }
  if (err.message && err.message.includes('MUNICIPAL_TAX_PAID_IMMUTABLE')) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'MUNICIPAL_TAX_PAID_IMMUTABLE', message: 'Paid statutory dues cannot be modified' },
    }, 409);
  }
  if (err.message && err.message.includes('MUNICIPAL_TAX_DUE_EXISTS')) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'MUNICIPAL_TAX_DUE_EXISTS', message: 'A statutory due for this assessment period already exists' },
    }, 409);
  }
  if (
    err.message &&
    (err.message.includes('OVERFLOW') ||
      err.message.includes('INVALID_') ||
      err.message.includes('EMPTY_'))
  ) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: err.message },
    }, 400);
  }

  console.error('[Municipal Tax Operation Error]:', err);
  return c.json({
    success: false,
    data: null,
    error: { code: 'INTERNAL_SERVER_ERROR', message: err.message || 'An unexpected error occurred' },
  }, 500);
}

// ============================================================================
// Municipal Tax Routes
// ============================================================================

// 1. List municipal tax dues for outlet
municipalTaxRoutes.get(
  '/outlets/:outletId/municipal-taxes',
  requirePermission(PERMISSIONS.MUNICIPAL_TAXES_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { municipalTaxService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const query = c.req.query();
      const dues = await municipalTaxService.listDues(outletId, Object.keys(query).length > 0 ? query : undefined);
      return c.json({ success: true, data: dues, error: null });
    } catch (err) {
      return handleMunicipalTaxError(c, err);
    }
  }
);

// 2. Create municipal tax due
municipalTaxRoutes.post(
  '/outlets/:outletId/municipal-taxes',
  requirePermission(PERMISSIONS.MUNICIPAL_TAXES_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const user = c.var.user!.user;
    const { municipalTaxService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const body = await c.req.json();
      const due = await municipalTaxService.createDue(outletId, user.id, body);
      return c.json({ success: true, data: due, error: null }, 201);
    } catch (err) {
      return handleMunicipalTaxError(c, err);
    }
  }
);

// 3. Get municipal tax summary for outlet
municipalTaxRoutes.get(
  '/outlets/:outletId/municipal-tax-summary',
  requirePermission(PERMISSIONS.MUNICIPAL_TAXES_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { municipalTaxService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const summary = await municipalTaxService.getSummary(outletId);
      return c.json({ success: true, data: summary, error: null });
    } catch (err) {
      return handleMunicipalTaxError(c, err);
    }
  }
);

// 4. Get municipal tax due detail by ID
municipalTaxRoutes.get(
  '/municipal-taxes/:id',
  requirePermission(PERMISSIONS.MUNICIPAL_TAXES_READ) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const { municipalTaxService, municipalTaxRepo, outletRepo } = getServices(c);

    try {
      const existing = await municipalTaxRepo.getById(id);
      if (!existing) {
        return c.json({ success: false, data: null, error: { code: 'MUNICIPAL_TAX_DUE_NOT_FOUND', message: 'The statutory due could not be found' } }, 404);
      }

      if (!(await verifyOutletAuthority(c, existing.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
      }

      const due = await municipalTaxService.getDueById(id, existing.outletId);
      return c.json({ success: true, data: due, error: null });
    } catch (err) {
      return handleMunicipalTaxError(c, err);
    }
  }
);

// 5. Update pending municipal tax due
municipalTaxRoutes.put(
  '/municipal-taxes/:id',
  requirePermission(PERMISSIONS.MUNICIPAL_TAXES_WRITE) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const user = c.var.user!.user;
    const { municipalTaxService, municipalTaxRepo, outletRepo } = getServices(c);

    try {
      const existing = await municipalTaxRepo.getById(id);
      if (!existing) {
        return c.json({ success: false, data: null, error: { code: 'MUNICIPAL_TAX_DUE_NOT_FOUND', message: 'The statutory due could not be found' } }, 404);
      }

      if (!(await verifyOutletAuthority(c, existing.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
      }

      const body = await c.req.json();
      const updated = await municipalTaxService.updatePendingDue(id, existing.outletId, user.id, body);
      return c.json({ success: true, data: updated, error: null });
    } catch (err) {
      return handleMunicipalTaxError(c, err);
    }
  }
);

// 6. Mark municipal tax due paid
municipalTaxRoutes.post(
  '/municipal-taxes/:id/mark-paid',
  requirePermission(PERMISSIONS.MUNICIPAL_TAX_PAYMENTS_WRITE) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const user = c.var.user!.user;
    const { municipalTaxService, municipalTaxRepo, outletRepo } = getServices(c);

    try {
      const existing = await municipalTaxRepo.getById(id);
      if (!existing) {
        return c.json({ success: false, data: null, error: { code: 'MUNICIPAL_TAX_DUE_NOT_FOUND', message: 'The statutory due could not be found' } }, 404);
      }

      if (!(await verifyOutletAuthority(c, existing.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
      }

      const body = await c.req.json();
      const paid = await municipalTaxService.markPaid(id, existing.outletId, user.id, body);
      return c.json({ success: true, data: paid, error: null });
    } catch (err) {
      return handleMunicipalTaxError(c, err);
    }
  }
);
