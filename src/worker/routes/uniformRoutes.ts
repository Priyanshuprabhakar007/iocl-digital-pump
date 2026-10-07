import { Hono } from 'hono';
import { getDb } from '../../db';
import { UniformRepository } from '../repositories/uniformRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { UniformService, UniformError } from '../services/uniformService';
import { ScopeService } from '../services/scopeService';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../../shared/constants';

export const uniformRoutes = new Hono<{ Bindings: EnvBindings }>();

uniformRoutes.use('*', requireAuth as any);

async function verifyOutletAuthority(
  c: AppContext,
  outletId: string,
  outletRepo: OutletRepository
): Promise<boolean> {
  const userCtx = c.var.user;
  if (!userCtx) return false;
  return ScopeService.canAccessOutlet(userCtx, outletId, outletRepo);
}

function getServices(c: AppContext) {
  const db = getDb(c.env.DB);
  const uniformService = new UniformService(db);
  const uniformRepo = new UniformRepository(db);
  const outletRepo = new OutletRepository(db);
  return { uniformService, uniformRepo, outletRepo };
}

function handleUniformError(c: AppContext, err: any) {
  if (err instanceof UniformError) {
    return c.json({
      success: false,
      data: null,
      error: { code: err.code, message: err.message },
    }, err.status as any);
  }
  if (err?.name === 'ZodError') {
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

  console.error('[Uniform Controller Server Error]:', err);
  return c.json({
    success: false,
    data: null,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected server error occurred.',
    },
  }, 500);
}

// ============================================================================
// UNIFORM ITEMS
// ============================================================================

uniformRoutes.get(
  '/outlets/:outletId/hr/uniform/items',
  requirePermission(PERMISSIONS.HR_UNIFORM_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { uniformService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const query = c.req.query();
      const items = await uniformService.getItems(outletId, query);
      return c.json({ success: true, data: items, error: null });
    } catch (err) {
      return handleUniformError(c, err);
    }
  }
);

uniformRoutes.post(
  '/outlets/:outletId/hr/uniform/items',
  requirePermission(PERMISSIONS.HR_UNIFORM_INVENTORY_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const user = c.var.user!.user;
    const { uniformService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const body = await c.req.json();
      const item = await uniformService.createItem(outletId, user.id, body);
      return c.json({ success: true, data: item, error: null }, 201);
    } catch (err) {
      return handleUniformError(c, err);
    }
  }
);

uniformRoutes.put(
  '/outlets/:outletId/hr/uniform/items/:itemId',
  requirePermission(PERMISSIONS.HR_UNIFORM_INVENTORY_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const itemId = c.req.param('itemId')!;
    const user = c.var.user!.user;
    const { uniformService, uniformRepo, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const existing = await uniformRepo.getItemById(itemId);
      if (!existing || existing.outletId !== outletId) {
        return c.json({ success: false, data: null, error: { code: 'HR_UNIFORM_ITEM_NOT_FOUND', message: 'Uniform item not found' } }, 404);
      }

      const body = await c.req.json();
      const updated = await uniformService.updateItem(outletId, itemId, user.id, body);
      return c.json({ success: true, data: updated, error: null });
    } catch (err) {
      return handleUniformError(c, err);
    }
  }
);

// ============================================================================
// UNIFORM VARIANTS
// ============================================================================

uniformRoutes.get(
  '/outlets/:outletId/hr/uniform/variants',
  requirePermission(PERMISSIONS.HR_UNIFORM_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { uniformService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const itemId = c.req.query('itemId');
      const variants = await uniformService.getVariants(outletId, itemId);
      return c.json({ success: true, data: variants, error: null });
    } catch (err) {
      return handleUniformError(c, err);
    }
  }
);

uniformRoutes.post(
  '/outlets/:outletId/hr/uniform/variants',
  requirePermission(PERMISSIONS.HR_UNIFORM_INVENTORY_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const user = c.var.user!.user;
    const { uniformService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const body = await c.req.json();
      const variant = await uniformService.createVariant(outletId, user.id, body);
      return c.json({ success: true, data: variant, error: null }, 201);
    } catch (err) {
      return handleUniformError(c, err);
    }
  }
);

uniformRoutes.put(
  '/outlets/:outletId/hr/uniform/variants/:variantId',
  requirePermission(PERMISSIONS.HR_UNIFORM_INVENTORY_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const variantId = c.req.param('variantId')!;
    const user = c.var.user!.user;
    const { uniformService, uniformRepo, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const existing = await uniformRepo.getVariantById(variantId);
      if (!existing || existing.outletId !== outletId) {
        return c.json({ success: false, data: null, error: { code: 'HR_UNIFORM_VARIANT_NOT_FOUND', message: 'Uniform variant not found' } }, 404);
      }

      const body = await c.req.json();
      const updated = await uniformService.updateVariant(outletId, variantId, user.id, body);
      return c.json({ success: true, data: updated, error: null });
    } catch (err) {
      return handleUniformError(c, err);
    }
  }
);

// ============================================================================
// UNIFORM STOCK & TRANSACTIONS
// ============================================================================

uniformRoutes.get(
  '/outlets/:outletId/hr/uniform/stock-summary',
  requirePermission(PERMISSIONS.HR_UNIFORM_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { uniformService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const summary = await uniformService.getStockSummary(outletId);
      return c.json({ success: true, data: summary, error: null });
    } catch (err) {
      return handleUniformError(c, err);
    }
  }
);

uniformRoutes.get(
  '/outlets/:outletId/hr/uniform/stock-transactions',
  requirePermission(PERMISSIONS.HR_UNIFORM_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { uniformService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const query = c.req.query();
      const txs = await uniformService.getStockTransactions(outletId, query);
      return c.json({ success: true, data: txs, error: null });
    } catch (err) {
      return handleUniformError(c, err);
    }
  }
);

uniformRoutes.post(
  '/outlets/:outletId/hr/uniform/stock-transactions',
  requirePermission(PERMISSIONS.HR_UNIFORM_INVENTORY_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const user = c.var.user!.user;
    const { uniformService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const body = await c.req.json();
      const tx = await uniformService.createStockTransaction(outletId, user.id, body);
      return c.json({ success: true, data: tx, error: null }, 201);
    } catch (err) {
      return handleUniformError(c, err);
    }
  }
);

// ============================================================================
// UNIFORM ISSUES & LIFECYCLE
// ============================================================================

uniformRoutes.get(
  '/outlets/:outletId/hr/uniform/issues',
  requirePermission(PERMISSIONS.HR_UNIFORM_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { uniformService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const query = c.req.query();
      const issues = await uniformService.getIssues(outletId, query);
      return c.json({ success: true, data: issues, error: null });
    } catch (err) {
      return handleUniformError(c, err);
    }
  }
);

uniformRoutes.get(
  '/outlets/:outletId/hr/uniform/issues/:issueId',
  requirePermission(PERMISSIONS.HR_UNIFORM_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const issueId = c.req.param('issueId')!;
    const { uniformService, uniformRepo, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const issue = await uniformRepo.getIssueById(issueId);
      if (!issue || issue.outletId !== outletId) {
        return c.json({ success: false, data: null, error: { code: 'HR_UNIFORM_ISSUE_NOT_FOUND', message: 'Uniform issue not found' } }, 404);
      }
      return c.json({ success: true, data: issue, error: null });
    } catch (err) {
      return handleUniformError(c, err);
    }
  }
);

uniformRoutes.post(
  '/outlets/:outletId/hr/uniform/issues',
  requirePermission(PERMISSIONS.HR_UNIFORM_ISSUE_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const user = c.var.user!.user;
    const { uniformService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const body = await c.req.json();
      const issue = await uniformService.issueUniform(outletId, user.id, body);
      return c.json({ success: true, data: issue, error: null }, 201);
    } catch (err) {
      return handleUniformError(c, err);
    }
  }
);

uniformRoutes.post(
  '/outlets/:outletId/hr/uniform/issues/:issueId/return',
  requirePermission(PERMISSIONS.HR_UNIFORM_ISSUE_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const issueId = c.req.param('issueId')!;
    const user = c.var.user!.user;
    const { uniformService, uniformRepo, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const existing = await uniformRepo.getIssueById(issueId);
      if (!existing || existing.outletId !== outletId) {
        return c.json({ success: false, data: null, error: { code: 'HR_UNIFORM_ISSUE_NOT_FOUND', message: 'Uniform issue not found' } }, 404);
      }

      const body = await c.req.json();
      const updated = await uniformService.returnUniform(outletId, issueId, user.id, body);
      return c.json({ success: true, data: updated, error: null });
    } catch (err) {
      return handleUniformError(c, err);
    }
  }
);

uniformRoutes.post(
  '/outlets/:outletId/hr/uniform/issues/:issueId/replace',
  requirePermission(PERMISSIONS.HR_UNIFORM_ISSUE_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const issueId = c.req.param('issueId')!;
    const user = c.var.user!.user;
    const { uniformService, uniformRepo, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const existing = await uniformRepo.getIssueById(issueId);
      if (!existing || existing.outletId !== outletId) {
        return c.json({ success: false, data: null, error: { code: 'HR_UNIFORM_ISSUE_NOT_FOUND', message: 'Uniform issue not found' } }, 404);
      }

      const body = await c.req.json();
      const res = await uniformService.replaceUniform(outletId, issueId, user.id, body);
      return c.json({ success: true, data: res, error: null });
    } catch (err) {
      return handleUniformError(c, err);
    }
  }
);

// ============================================================================
// UNIFORM REPORTS
// ============================================================================

uniformRoutes.get(
  '/outlets/:outletId/hr/uniform/reports/staff-history',
  requirePermission(PERMISSIONS.HR_UNIFORM_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { uniformService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const query = c.req.query();
      const staffId = query.staffId;
      const fromDate = query.fromDate;
      const toDate = query.toDate;
      const history = await uniformService.getStaffIssueHistory(outletId, staffId, fromDate, toDate);
      return c.json({ success: true, data: history, error: null });
    } catch (err) {
      return handleUniformError(c, err);
    }
  }
);

uniformRoutes.get(
  '/outlets/:outletId/hr/uniform/reports/summary',
  requirePermission(PERMISSIONS.HR_UNIFORM_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { uniformService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const summary = await uniformService.getReportSummary(outletId);
      return c.json({ success: true, data: summary, error: null });
    } catch (err) {
      return handleUniformError(c, err);
    }
  }
);
