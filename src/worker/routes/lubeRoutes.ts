import { Hono } from 'hono';
import { getDb } from '../../db';
import { LubeRepository } from '../repositories/lubeRepository';
import { PumpRepository } from '../repositories/pumpRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { LubeService, LubeError } from '../services/lubeService';
import { ScopeService } from '../services/scopeService';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import {
  CreateLubeSkuSchema,
  UpdateLubeSkuSchema,
  CreateLubeSkuPriceSchema,
  UpdateLubeSkuPriceSchema,
  CreateLubeStockTransactionSchema,
  CreateLubeShiftSaleSchema,
  UpdateLubeShiftSaleSchema,
} from '../../shared/validators';
import { PERMISSIONS } from '../../shared/constants';

export const lubeRoutes = new Hono<{ Bindings: EnvBindings }>();

lubeRoutes.use('*', requireAuth as any);

async function verifyOutletAuthority(c: AppContext, outletId: string, outletRepo: OutletRepository): Promise<boolean> {
  const userCtx = c.var.user;
  if (!userCtx) return false;
  return ScopeService.canAccessOutlet(userCtx, outletId, outletRepo);
}

function getServices(c: AppContext) {
  const db = getDb(c.env.DB);
  const lubeRepo = new LubeRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);
  const outletRepo = new OutletRepository(db);
  const lubeService = new LubeService(lubeRepo, pumpRepo, auditRepo);
  return { lubeService, lubeRepo, pumpRepo, outletRepo };
}

function handleLubeError(c: AppContext, err: any) {
  if (err instanceof LubeError) {
    return c.json({
      success: false,
      data: null,
      error: { code: err.code, message: err.message },
    }, err.status as any);
  }
  console.error('[Lube Operation Error]:', err);
  return c.json({
    success: false,
    data: null,
    error: { code: 'INTERNAL_SERVER_ERROR', message: err.message || 'An error occurred' },
  }, 500);
}

// ==========================================
// SKU ROUTES
// ==========================================

// GET /outlets/:outletId/lube/skus
lubeRoutes.get('/outlets/:outletId/lube/skus', requirePermission(PERMISSIONS.LUBE_OPERATIONS_READ) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId')!;
  const { lubeService, outletRepo } = getServices(c);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const skus = await lubeService.listSkus(outletId);
  return c.json({ success: true, data: skus, error: null });
});

// POST /outlets/:outletId/lube/skus
lubeRoutes.post('/outlets/:outletId/lube/skus', requirePermission(PERMISSIONS.LUBE_INVENTORY_WRITE) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId')!;
  const { lubeService, outletRepo } = getServices(c);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const body = await c.req.json();
  const parsed = CreateLubeSkuSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Validation error', details: parsed.error.format() },
    }, 400);
  }

  try {
    const sku = await lubeService.createSku(c.var.user.user.id, outletId, parsed.data as any);
    return c.json({ success: true, data: sku, error: null }, 201);
  } catch (err) {
    return handleLubeError(c, err);
  }
});

// PUT /lube/skus/:id
lubeRoutes.put('/lube/skus/:id', requirePermission(PERMISSIONS.LUBE_INVENTORY_WRITE) as any, async (c: AppContext) => {
  const skuId = c.req.param('id')!;
  const { lubeService, lubeRepo, outletRepo } = getServices(c);

  const existing = await lubeRepo.findSkuById(skuId);
  if (!existing) {
    return c.json({ success: false, data: null, error: { code: 'LUBE_SKU_NOT_FOUND', message: 'Lube SKU not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, existing.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const body = await c.req.json();
  const parsed = UpdateLubeSkuSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Validation error', details: parsed.error.format() },
    }, 400);
  }

  try {
    const updated = await lubeService.updateSku(c.var.user.user.id, skuId, parsed.data);
    return c.json({ success: true, data: updated, error: null });
  } catch (err) {
    return handleLubeError(c, err);
  }
});

// ==========================================
// PRICE ROUTES
// ==========================================

// GET /outlets/:outletId/lube/prices
lubeRoutes.get('/outlets/:outletId/lube/prices', requirePermission(PERMISSIONS.LUBE_OPERATIONS_READ) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId')!;
  const skuId = c.req.query('skuId');
  const { lubeService, outletRepo } = getServices(c);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const prices = await lubeService.listPrices(outletId, skuId);
  return c.json({ success: true, data: prices, error: null });
});

// POST /outlets/:outletId/lube/prices
lubeRoutes.post('/outlets/:outletId/lube/prices', requirePermission(PERMISSIONS.LUBE_PRICES_WRITE) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId')!;
  const { lubeService, outletRepo } = getServices(c);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const body = await c.req.json();
  const parsed = CreateLubeSkuPriceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Validation error', details: parsed.error.format() },
    }, 400);
  }

  try {
    const price = await lubeService.createPrice(c.var.user.user.id, outletId, parsed.data);
    return c.json({ success: true, data: price, error: null }, 201);
  } catch (err) {
    return handleLubeError(c, err);
  }
});

// PUT /lube/prices/:id
lubeRoutes.put('/lube/prices/:id', requirePermission(PERMISSIONS.LUBE_PRICES_WRITE) as any, async (c: AppContext) => {
  const priceId = c.req.param('id')!;
  const { lubeService, lubeRepo, outletRepo } = getServices(c);

  const existing = await lubeRepo.findPriceById(priceId);
  if (!existing) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Price record not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, existing.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const body = await c.req.json();
  const parsed = UpdateLubeSkuPriceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Validation error', details: parsed.error.format() },
    }, 400);
  }

  try {
    const updated = await lubeService.updatePrice(c.var.user.user.id, priceId, parsed.data);
    return c.json({ success: true, data: updated, error: null });
  } catch (err) {
    return handleLubeError(c, err);
  }
});

// ==========================================
// STOCK ROUTES
// ==========================================

// GET /outlets/:outletId/lube/stock-summary
lubeRoutes.get('/outlets/:outletId/lube/stock-summary', requirePermission(PERMISSIONS.LUBE_OPERATIONS_READ) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId')!;
  const { lubeService, outletRepo } = getServices(c);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const summary = await lubeService.getStockSummary(outletId);
  return c.json({ success: true, data: summary, error: null });
});

// GET /outlets/:outletId/lube/low-stock
lubeRoutes.get('/outlets/:outletId/lube/low-stock', requirePermission(PERMISSIONS.LUBE_OPERATIONS_READ) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId')!;
  const { lubeService, outletRepo } = getServices(c);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const lowStock = await lubeService.getLowStock(outletId);
  return c.json({ success: true, data: lowStock, error: null });
});

// GET /outlets/:outletId/lube/stock-transactions
lubeRoutes.get('/outlets/:outletId/lube/stock-transactions', requirePermission(PERMISSIONS.LUBE_OPERATIONS_READ) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId')!;
  const skuId = c.req.query('skuId');
  const { lubeService, outletRepo } = getServices(c);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const txs = await lubeService.listStockTransactions(outletId, skuId);
  return c.json({ success: true, data: txs, error: null });
});

// POST /outlets/:outletId/lube/stock-transactions
lubeRoutes.post('/outlets/:outletId/lube/stock-transactions', requirePermission(PERMISSIONS.LUBE_INVENTORY_WRITE) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId')!;
  const { lubeService, outletRepo } = getServices(c);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const body = await c.req.json();
  const parsed = CreateLubeStockTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Validation error', details: parsed.error.format() },
    }, 400);
  }

  try {
    const tx = await lubeService.createStockTransaction(c.var.user.user.id, outletId, parsed.data as any);
    return c.json({ success: true, data: tx, error: null }, 201);
  } catch (err) {
    return handleLubeError(c, err);
  }
});

// ==========================================
// SHIFT SALES ROUTES
// ==========================================

// GET /shifts/:shiftId/lube-sales
lubeRoutes.get('/shifts/:shiftId/lube-sales', requirePermission(PERMISSIONS.LUBE_OPERATIONS_READ) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId')!;
  const { lubeService, pumpRepo, outletRepo } = getServices(c);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Operational shift not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const sales = await lubeService.listShiftSales(shiftId);
  return c.json({ success: true, data: sales, error: null });
});

// POST /shifts/:shiftId/lube-sales
lubeRoutes.post('/shifts/:shiftId/lube-sales', requirePermission(PERMISSIONS.LUBE_SALES_WRITE) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId')!;
  const { lubeService, pumpRepo, outletRepo } = getServices(c);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Operational shift not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const body = await c.req.json();
  const parsed = CreateLubeShiftSaleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Validation error', details: parsed.error.format() },
    }, 400);
  }

  try {
    const sale = await lubeService.createShiftSale(c.var.user.user.id, shiftId, parsed.data as any);
    return c.json({ success: true, data: sale, error: null }, 201);
  } catch (err) {
    return handleLubeError(c, err);
  }
});

// PUT /lube-sales/:id
lubeRoutes.put('/lube-sales/:id', requirePermission(PERMISSIONS.LUBE_SALES_WRITE) as any, async (c: AppContext) => {
  const saleId = c.req.param('id')!;
  const { lubeService, lubeRepo, outletRepo } = getServices(c);

  const existing = await lubeRepo.findShiftSaleById(saleId);
  if (!existing) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Lube shift sale not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, existing.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const body = await c.req.json();
  const parsed = UpdateLubeShiftSaleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Validation error', details: parsed.error.format() },
    }, 400);
  }

  try {
    const updated = await lubeService.updateShiftSale(c.var.user.user.id, saleId, parsed.data);
    return c.json({ success: true, data: updated, error: null });
  } catch (err) {
    return handleLubeError(c, err);
  }
});

// DELETE /lube-sales/:id
lubeRoutes.delete('/lube-sales/:id', requirePermission(PERMISSIONS.LUBE_SALES_WRITE) as any, async (c: AppContext) => {
  const saleId = c.req.param('id')!;
  const { lubeService, lubeRepo, outletRepo } = getServices(c);

  const existing = await lubeRepo.findShiftSaleById(saleId);
  if (!existing) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Lube shift sale not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, existing.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  try {
    await lubeService.deleteShiftSale(c.var.user.user.id, saleId);
    return c.json({ success: true, data: { message: 'Sale deleted successfully' }, error: null });
  } catch (err) {
    return handleLubeError(c, err);
  }
});

// GET /shifts/:shiftId/lube-summary
lubeRoutes.get('/shifts/:shiftId/lube-summary', requirePermission(PERMISSIONS.LUBE_OPERATIONS_READ) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId')!;
  const { lubeService, pumpRepo, outletRepo } = getServices(c);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Operational shift not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  try {
    const summary = await lubeService.getShiftSummary(shiftId);
    return c.json({ success: true, data: summary, error: null });
  } catch (err) {
    return handleLubeError(c, err);
  }
});

// ==========================================
// DAILY SUMMARY ROUTE
// ==========================================

// GET /outlets/:outletId/lube/daily-summary?businessDate=YYYY-MM-DD
lubeRoutes.get('/outlets/:outletId/lube/daily-summary', requirePermission(PERMISSIONS.LUBE_OPERATIONS_READ) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId')!;
  const businessDate = c.req.query('businessDate');

  if (!businessDate || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'businessDate query parameter in YYYY-MM-DD format is required' },
    }, 400);
  }

  const { lubeService, outletRepo } = getServices(c);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  try {
    const summary = await lubeService.getDailySummary(outletId, businessDate);
    return c.json({ success: true, data: summary, error: null });
  } catch (err) {
    return handleLubeError(c, err);
  }
});
