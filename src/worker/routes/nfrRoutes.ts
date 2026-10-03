import { Hono } from 'hono';
import { getDb } from '../../db';
import { NfrRepository } from '../repositories/nfrRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { NfrService, NfrError } from '../services/nfrService';
import { ScopeService } from '../services/scopeService';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../../shared/constants';

export const nfrRoutes = new Hono<{ Bindings: EnvBindings }>();

nfrRoutes.use('*', requireAuth as any);

async function verifyOutletAuthority(c: AppContext, outletId: string, outletRepo: OutletRepository): Promise<boolean> {
  const userCtx = c.var.user;
  if (!userCtx) return false;
  return ScopeService.canAccessOutlet(userCtx, outletId, outletRepo);
}

function getServices(c: AppContext) {
  const db = getDb(c.env.DB);
  const nfrRepo = new NfrRepository(db);
  const outletRepo = new OutletRepository(db);
  const nfrService = new NfrService(db);
  return { nfrService, nfrRepo, outletRepo };
}

function handleNfrError(c: AppContext, err: any) {
  if (err instanceof NfrError) {
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

  // Handle direct message patterns
  const msg = err?.message || String(err);
  if (msg.includes('NFR_SPACE_NOT_ACTIVE')) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'NFR_SPACE_NOT_ACTIVE', message: 'The selected NFR space is inactive and cannot be assigned to a new lease.' },
    }, 409);
  }
  if (msg.includes('NFR_VENDOR_NOT_ACTIVE')) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'NFR_VENDOR_NOT_ACTIVE', message: 'The selected NFR vendor is inactive and cannot be assigned to a new lease.' },
    }, 409);
  }
  if (msg.includes('NFR_SUMMARY_OVERFLOW')) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'NFR_SUMMARY_OVERFLOW', message: 'NFR summary calculation exceeded financial ceiling' },
    }, 400);
  }
  if (msg.includes('NFR_SPACE_LEASE_OVERLAP')) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'NFR_SPACE_LEASE_OVERLAP', message: 'This space already has an active lease for the specified period.' },
    }, 409);
  }
  if (msg.includes('NFR_RENT_OVERPAYMENT')) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'NFR_RENT_OVERPAYMENT', message: 'Payment amount exceeds the outstanding balance for this rent due.' },
    }, 409);
  }
  if (msg.includes('NFR_RENT_ALREADY_PAID')) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'NFR_RENT_ALREADY_PAID', message: 'This statutory rent due has already been fully paid.' },
    }, 409);
  }

  console.error('[NFR Operation Error]:', err);
  return c.json({
    success: false,
    data: null,
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected server error occurred.' },
  }, 500);
}

// ============================================================================
// SPACES
// ============================================================================

// List spaces in outlet
nfrRoutes.get(
  '/outlets/:outletId/nfr/spaces',
  requirePermission(PERMISSIONS.NFR_READ) as any,
  async (c: AppContext) => {
    try {
      const outletId = c.req.param('outletId')!;
      const { nfrService, outletRepo } = getServices(c);

      if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Unauthorized outlet access' } }, 403);
      }

      const queryParams = c.req.query();
      const spaces = await nfrService.listSpaces(outletId, queryParams);
      return c.json({ success: true, data: spaces, error: null });
    } catch (err: any) {
      return handleNfrError(c, err);
    }
  }
);

// Create space in outlet
nfrRoutes.post(
  '/outlets/:outletId/nfr/spaces',
  requirePermission(PERMISSIONS.NFR_MASTER_WRITE) as any,
  async (c: AppContext) => {
    try {
      const outletId = c.req.param('outletId')!;
      const user = c.var.user!.user;
      const { nfrService, outletRepo } = getServices(c);

      if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Unauthorized outlet access' } }, 403);
      }

      const body = await c.req.json();
      const space = await nfrService.createSpace(outletId, user.id, body);
      return c.json({ success: true, data: space, error: null }, 201);
    } catch (err: any) {
      return handleNfrError(c, err);
    }
  }
);

// Get space by ID
nfrRoutes.get(
  '/nfr/spaces/:id',
  requirePermission(PERMISSIONS.NFR_READ) as any,
  async (c: AppContext) => {
    try {
      const spaceId = c.req.param('id')!;
      const { nfrService, nfrRepo, outletRepo } = getServices(c);

      const space = await nfrRepo.getSpaceById(spaceId);
      if (!space) {
        return c.json({ success: false, data: null, error: { code: 'NFR_SPACE_NOT_FOUND', message: 'NFR space not found.' } }, 404);
      }

      if (!(await verifyOutletAuthority(c, space.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Unauthorized outlet access' } }, 403);
      }

      const result = await nfrService.getSpace(space.outletId, spaceId);
      return c.json({ success: true, data: result, error: null });
    } catch (err: any) {
      return handleNfrError(c, err);
    }
  }
);

// Update space by ID
nfrRoutes.put(
  '/nfr/spaces/:id',
  requirePermission(PERMISSIONS.NFR_MASTER_WRITE) as any,
  async (c: AppContext) => {
    try {
      const spaceId = c.req.param('id')!;
      const user = c.var.user!.user;
      const { nfrService, nfrRepo, outletRepo } = getServices(c);

      const space = await nfrRepo.getSpaceById(spaceId);
      if (!space) {
        return c.json({ success: false, data: null, error: { code: 'NFR_SPACE_NOT_FOUND', message: 'NFR space not found.' } }, 404);
      }

      if (!(await verifyOutletAuthority(c, space.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Unauthorized outlet access' } }, 403);
      }

      const body = await c.req.json();
      const updated = await nfrService.updateSpace(space.outletId, spaceId, user.id, body);
      return c.json({ success: true, data: updated, error: null });
    } catch (err: any) {
      return handleNfrError(c, err);
    }
  }
);

// ============================================================================
// VENDORS
// ============================================================================

// List vendors in outlet
nfrRoutes.get(
  '/outlets/:outletId/nfr/vendors',
  requirePermission(PERMISSIONS.NFR_READ) as any,
  async (c: AppContext) => {
    try {
      const outletId = c.req.param('outletId')!;
      const { nfrService, outletRepo } = getServices(c);

      if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Unauthorized outlet access' } }, 403);
      }

      const queryParams = c.req.query();
      const vendors = await nfrService.listVendors(outletId, queryParams);
      return c.json({ success: true, data: vendors, error: null });
    } catch (err: any) {
      return handleNfrError(c, err);
    }
  }
);

// Create vendor in outlet
nfrRoutes.post(
  '/outlets/:outletId/nfr/vendors',
  requirePermission(PERMISSIONS.NFR_MASTER_WRITE) as any,
  async (c: AppContext) => {
    try {
      const outletId = c.req.param('outletId')!;
      const user = c.var.user!.user;
      const { nfrService, outletRepo } = getServices(c);

      if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Unauthorized outlet access' } }, 403);
      }

      const body = await c.req.json();
      const vendor = await nfrService.createVendor(outletId, user.id, body);
      return c.json({ success: true, data: vendor, error: null }, 201);
    } catch (err: any) {
      return handleNfrError(c, err);
    }
  }
);

// Get vendor by ID
nfrRoutes.get(
  '/nfr/vendors/:id',
  requirePermission(PERMISSIONS.NFR_READ) as any,
  async (c: AppContext) => {
    try {
      const vendorId = c.req.param('id')!;
      const { nfrService, nfrRepo, outletRepo } = getServices(c);

      const vendor = await nfrRepo.getVendorById(vendorId);
      if (!vendor) {
        return c.json({ success: false, data: null, error: { code: 'NFR_VENDOR_NOT_FOUND', message: 'NFR vendor not found.' } }, 404);
      }

      if (!(await verifyOutletAuthority(c, vendor.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Unauthorized outlet access' } }, 403);
      }

      const result = await nfrService.getVendor(vendor.outletId, vendorId);
      return c.json({ success: true, data: result, error: null });
    } catch (err: any) {
      return handleNfrError(c, err);
    }
  }
);

// Update vendor by ID
nfrRoutes.put(
  '/nfr/vendors/:id',
  requirePermission(PERMISSIONS.NFR_MASTER_WRITE) as any,
  async (c: AppContext) => {
    try {
      const vendorId = c.req.param('id')!;
      const user = c.var.user!.user;
      const { nfrService, nfrRepo, outletRepo } = getServices(c);

      const vendor = await nfrRepo.getVendorById(vendorId);
      if (!vendor) {
        return c.json({ success: false, data: null, error: { code: 'NFR_VENDOR_NOT_FOUND', message: 'NFR vendor not found.' } }, 404);
      }

      if (!(await verifyOutletAuthority(c, vendor.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Unauthorized outlet access' } }, 403);
      }

      const body = await c.req.json();
      const updated = await nfrService.updateVendor(vendor.outletId, vendorId, user.id, body);
      return c.json({ success: true, data: updated, error: null });
    } catch (err: any) {
      return handleNfrError(c, err);
    }
  }
);

// ============================================================================
// LEASES
// ============================================================================

// List leases in outlet
nfrRoutes.get(
  '/outlets/:outletId/nfr/leases',
  requirePermission(PERMISSIONS.NFR_READ) as any,
  async (c: AppContext) => {
    try {
      const outletId = c.req.param('outletId')!;
      const { nfrService, outletRepo } = getServices(c);

      if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Unauthorized outlet access' } }, 403);
      }

      const queryParams = c.req.query();
      const leases = await nfrService.listLeases(outletId, queryParams);
      return c.json({ success: true, data: leases, error: null });
    } catch (err: any) {
      return handleNfrError(c, err);
    }
  }
);

// Create lease in outlet
nfrRoutes.post(
  '/outlets/:outletId/nfr/leases',
  requirePermission(PERMISSIONS.NFR_LEASES_WRITE) as any,
  async (c: AppContext) => {
    try {
      const outletId = c.req.param('outletId')!;
      const user = c.var.user!.user;
      const { nfrService, outletRepo } = getServices(c);

      if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Unauthorized outlet access' } }, 403);
      }

      const body = await c.req.json();
      const lease = await nfrService.createLease(outletId, user.id, body);
      return c.json({ success: true, data: lease, error: null }, 201);
    } catch (err: any) {
      return handleNfrError(c, err);
    }
  }
);

// Get lease by ID
nfrRoutes.get(
  '/nfr/leases/:id',
  requirePermission(PERMISSIONS.NFR_READ) as any,
  async (c: AppContext) => {
    try {
      const leaseId = c.req.param('id')!;
      const { nfrService, nfrRepo, outletRepo } = getServices(c);

      const lease = await nfrRepo.getLeaseById(leaseId);
      if (!lease) {
        return c.json({ success: false, data: null, error: { code: 'NFR_LEASE_NOT_FOUND', message: 'NFR lease not found.' } }, 404);
      }

      if (!(await verifyOutletAuthority(c, lease.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Unauthorized outlet access' } }, 403);
      }

      const result = await nfrService.getLease(lease.outletId, leaseId);
      return c.json({ success: true, data: result, error: null });
    } catch (err: any) {
      return handleNfrError(c, err);
    }
  }
);

// Update lease by ID
nfrRoutes.put(
  '/nfr/leases/:id',
  requirePermission(PERMISSIONS.NFR_LEASES_WRITE) as any,
  async (c: AppContext) => {
    try {
      const leaseId = c.req.param('id')!;
      const user = c.var.user!.user;
      const { nfrService, nfrRepo, outletRepo } = getServices(c);

      const lease = await nfrRepo.getLeaseById(leaseId);
      if (!lease) {
        return c.json({ success: false, data: null, error: { code: 'NFR_LEASE_NOT_FOUND', message: 'NFR lease not found.' } }, 404);
      }

      if (!(await verifyOutletAuthority(c, lease.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Unauthorized outlet access' } }, 403);
      }

      const body = await c.req.json();
      const updated = await nfrService.updateLease(lease.outletId, leaseId, user.id, body);
      return c.json({ success: true, data: updated, error: null });
    } catch (err: any) {
      return handleNfrError(c, err);
    }
  }
);

// Terminate lease
nfrRoutes.post(
  '/nfr/leases/:id/terminate',
  requirePermission(PERMISSIONS.NFR_LEASES_WRITE) as any,
  async (c: AppContext) => {
    try {
      const leaseId = c.req.param('id')!;
      const user = c.var.user!.user;
      const { nfrService, nfrRepo, outletRepo } = getServices(c);

      const lease = await nfrRepo.getLeaseById(leaseId);
      if (!lease) {
        return c.json({ success: false, data: null, error: { code: 'NFR_LEASE_NOT_FOUND', message: 'NFR lease not found.' } }, 404);
      }

      if (!(await verifyOutletAuthority(c, lease.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Unauthorized outlet access' } }, 403);
      }

      const body = await c.req.json().catch(() => ({}));
      const terminated = await nfrService.terminateLease(lease.outletId, leaseId, user.id, body);
      return c.json({ success: true, data: terminated, error: null });
    } catch (err: any) {
      return handleNfrError(c, err);
    }
  }
);

// ============================================================================
// RENT DUES
// ============================================================================

// Generate rent due from lease
nfrRoutes.post(
  '/nfr/leases/:id/rent-dues',
  requirePermission(PERMISSIONS.NFR_RENT_DUES_WRITE) as any,
  async (c: AppContext) => {
    try {
      const leaseId = c.req.param('id')!;
      const user = c.var.user!.user;
      const { nfrService, nfrRepo, outletRepo } = getServices(c);

      const lease = await nfrRepo.getLeaseById(leaseId);
      if (!lease) {
        return c.json({ success: false, data: null, error: { code: 'NFR_LEASE_NOT_FOUND', message: 'NFR lease not found.' } }, 404);
      }

      if (!(await verifyOutletAuthority(c, lease.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Unauthorized outlet access' } }, 403);
      }

      const body = await c.req.json();
      const due = await nfrService.generateRentDue(lease.outletId, leaseId, user.id, body);
      return c.json({ success: true, data: due, error: null }, 201);
    } catch (err: any) {
      return handleNfrError(c, err);
    }
  }
);

// List rent dues in outlet
nfrRoutes.get(
  '/outlets/:outletId/nfr/rent-dues',
  requirePermission(PERMISSIONS.NFR_READ) as any,
  async (c: AppContext) => {
    try {
      const outletId = c.req.param('outletId')!;
      const { nfrService, outletRepo } = getServices(c);

      if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Unauthorized outlet access' } }, 403);
      }

      const queryParams = c.req.query();
      const dues = await nfrService.listRentDues(outletId, queryParams);
      return c.json({ success: true, data: dues, error: null });
    } catch (err: any) {
      return handleNfrError(c, err);
    }
  }
);

// Get rent due by ID
nfrRoutes.get(
  '/nfr/rent-dues/:id',
  requirePermission(PERMISSIONS.NFR_READ) as any,
  async (c: AppContext) => {
    try {
      const dueId = c.req.param('id')!;
      const { nfrService, nfrRepo, outletRepo } = getServices(c);

      const due = await nfrRepo.getRentDueById(dueId);
      if (!due) {
        return c.json({ success: false, data: null, error: { code: 'NFR_RENT_DUE_NOT_FOUND', message: 'NFR rent due not found.' } }, 404);
      }

      if (!(await verifyOutletAuthority(c, due.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Unauthorized outlet access' } }, 403);
      }

      const result = await nfrService.getRentDue(due.outletId, dueId);
      return c.json({ success: true, data: result, error: null });
    } catch (err: any) {
      return handleNfrError(c, err);
    }
  }
);

// ============================================================================
// RENT PAYMENTS
// ============================================================================

// List payments for rent due
nfrRoutes.get(
  '/nfr/rent-dues/:id/payments',
  requirePermission(PERMISSIONS.NFR_READ) as any,
  async (c: AppContext) => {
    try {
      const dueId = c.req.param('id')!;
      const { nfrService, nfrRepo, outletRepo } = getServices(c);

      const due = await nfrRepo.getRentDueById(dueId);
      if (!due) {
        return c.json({ success: false, data: null, error: { code: 'NFR_RENT_DUE_NOT_FOUND', message: 'NFR rent due not found.' } }, 404);
      }

      if (!(await verifyOutletAuthority(c, due.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Unauthorized outlet access' } }, 403);
      }

      const payments = await nfrService.listRentPayments(due.outletId, dueId);
      return c.json({ success: true, data: payments, error: null });
    } catch (err: any) {
      return handleNfrError(c, err);
    }
  }
);

// Record payment for rent due
nfrRoutes.post(
  '/nfr/rent-dues/:id/payments',
  requirePermission(PERMISSIONS.NFR_RENT_PAYMENTS_WRITE) as any,
  async (c: AppContext) => {
    try {
      const dueId = c.req.param('id')!;
      const user = c.var.user!.user;
      const { nfrService, nfrRepo, outletRepo } = getServices(c);

      const due = await nfrRepo.getRentDueById(dueId);
      if (!due) {
        return c.json({ success: false, data: null, error: { code: 'NFR_RENT_DUE_NOT_FOUND', message: 'NFR rent due not found.' } }, 404);
      }

      if (!(await verifyOutletAuthority(c, due.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Unauthorized outlet access' } }, 403);
      }

      const body = await c.req.json();
      const result = await nfrService.recordRentPayment(due.outletId, dueId, user.id, body);
      return c.json({ success: true, data: result, error: null }, 201);
    } catch (err: any) {
      return handleNfrError(c, err);
    }
  }
);

// ============================================================================
// SUMMARY
// ============================================================================

// Get NFR summary for outlet
nfrRoutes.get(
  '/outlets/:outletId/nfr/summary',
  requirePermission(PERMISSIONS.NFR_READ) as any,
  async (c: AppContext) => {
    try {
      const outletId = c.req.param('outletId')!;
      const { nfrService, outletRepo } = getServices(c);

      if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Unauthorized outlet access' } }, 403);
      }

      const summary = await nfrService.getSummary(outletId);
      return c.json({ success: true, data: summary, error: null });
    } catch (err: any) {
      return handleNfrError(c, err);
    }
  }
);
