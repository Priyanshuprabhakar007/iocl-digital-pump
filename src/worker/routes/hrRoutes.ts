import { Hono } from 'hono';
import { getDb } from '../../db';
import { HrRepository } from '../repositories/hrRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { HrService, HrError } from '../services/hrService';
import { ScopeService } from '../services/scopeService';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../../shared/constants';

export const hrRoutes = new Hono<{ Bindings: EnvBindings }>();

hrRoutes.use('*', requireAuth as any);

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
  const hrRepo = new HrRepository(db);
  const outletRepo = new OutletRepository(db);
  const hrService = new HrService(db);
  return { hrService, hrRepo, outletRepo };
}

function handleHrError(c: AppContext, err: any) {
  if (err instanceof HrError) {
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

  console.error('[HR Controller Server Error]:', err);
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
// DESIGNATION ROUTES
// ============================================================================

// 1. List designations for outlet
hrRoutes.get(
  '/outlets/:outletId/hr/designations',
  requirePermission(PERMISSIONS.HR_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { hrService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const query = c.req.query();
      const designations = await hrService.listDesignations(
        outletId,
        Object.keys(query).length > 0 ? query : undefined
      );
      return c.json({ success: true, data: designations, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// 2. Create designation for outlet
hrRoutes.post(
  '/outlets/:outletId/hr/designations',
  requirePermission(PERMISSIONS.HR_STAFF_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const user = c.var.user!.user;
    const { hrService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const body = await c.req.json();
      const designation = await hrService.createDesignation(outletId, user.id, body);
      return c.json({ success: true, data: designation, error: null }, 201);
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// 3. Get designation by ID
hrRoutes.get(
  '/hr/designations/:id',
  requirePermission(PERMISSIONS.HR_READ) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const { hrService, hrRepo, outletRepo } = getServices(c);

    try {
      const existing = await hrRepo.getDesignationById(id);
      if (!existing) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'HR_DESIGNATION_NOT_FOUND', message: 'The designation could not be found' },
        }, 404);
      }

      if (!(await verifyOutletAuthority(c, existing.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
      }

      const designation = await hrService.getDesignationById(id, existing.outletId);
      return c.json({ success: true, data: designation, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// 4. Update designation by ID
hrRoutes.put(
  '/hr/designations/:id',
  requirePermission(PERMISSIONS.HR_STAFF_WRITE) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const user = c.var.user!.user;
    const { hrService, hrRepo, outletRepo } = getServices(c);

    try {
      const existing = await hrRepo.getDesignationById(id);
      if (!existing) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'HR_DESIGNATION_NOT_FOUND', message: 'The designation could not be found' },
        }, 404);
      }

      if (!(await verifyOutletAuthority(c, existing.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
      }

      const body = await c.req.json();
      const updated = await hrService.updateDesignation(id, existing.outletId, user.id, body);
      return c.json({ success: true, data: updated, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// ============================================================================
// STAFF ROUTES
// ============================================================================

// 5. List staff for outlet
hrRoutes.get(
  '/outlets/:outletId/hr/staff',
  requirePermission(PERMISSIONS.HR_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { hrService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const query = c.req.query();
      const staffList = await hrService.listStaff(
        outletId,
        Object.keys(query).length > 0 ? query : undefined
      );
      return c.json({ success: true, data: staffList, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// 6. Create staff profile for outlet
hrRoutes.post(
  '/outlets/:outletId/hr/staff',
  requirePermission(PERMISSIONS.HR_STAFF_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const user = c.var.user!.user;
    const { hrService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const body = await c.req.json();
      const staff = await hrService.createStaff(outletId, user.id, body);
      return c.json({ success: true, data: staff, error: null }, 201);
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// 7. Get staff profile by ID
hrRoutes.get(
  '/hr/staff/:id',
  requirePermission(PERMISSIONS.HR_READ) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const { hrService, hrRepo, outletRepo } = getServices(c);

    try {
      const existing = await hrRepo.getStaffById(id);
      if (!existing) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'HR_STAFF_NOT_FOUND', message: 'The staff profile could not be found' },
        }, 404);
      }

      if (!(await verifyOutletAuthority(c, existing.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
      }

      const staff = await hrService.getStaffById(id, existing.outletId);
      return c.json({ success: true, data: staff, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// 8. Update staff profile by ID
hrRoutes.put(
  '/hr/staff/:id',
  requirePermission(PERMISSIONS.HR_STAFF_WRITE) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const user = c.var.user!.user;
    const { hrService, hrRepo, outletRepo } = getServices(c);

    try {
      const existing = await hrRepo.getStaffById(id);
      if (!existing) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'HR_STAFF_NOT_FOUND', message: 'The staff profile could not be found' },
        }, 404);
      }

      if (!(await verifyOutletAuthority(c, existing.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
      }

      const body = await c.req.json();
      const updated = await hrService.updateStaff(id, existing.outletId, user.id, body);
      return c.json({ success: true, data: updated, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// ============================================================================
// MANPOWER SANCTIONS & SUMMARY ROUTES
// ============================================================================

// 9. List manpower sanctions for outlet
hrRoutes.get(
  '/outlets/:outletId/hr/manpower-sanctions',
  requirePermission(PERMISSIONS.HR_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { hrService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const sanctions = await hrService.listManpowerSanctions(outletId);
      return c.json({ success: true, data: sanctions, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// 10. Create manpower sanction for outlet
hrRoutes.post(
  '/outlets/:outletId/hr/manpower-sanctions',
  requirePermission(PERMISSIONS.HR_MANPOWER_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const user = c.var.user!.user;
    const { hrService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const body = await c.req.json();
      const sanction = await hrService.createManpowerSanction(outletId, user.id, body);
      return c.json({ success: true, data: sanction, error: null }, 201);
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// 11. Update manpower sanction by ID
hrRoutes.put(
  '/hr/manpower-sanctions/:id',
  requirePermission(PERMISSIONS.HR_MANPOWER_WRITE) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const user = c.var.user!.user;
    const { hrService, hrRepo, outletRepo } = getServices(c);

    try {
      const existing = await hrRepo.getManpowerSanctionById(id);
      if (!existing) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'HR_MANPOWER_SANCTION_NOT_FOUND', message: 'The manpower sanction could not be found' },
        }, 404);
      }

      if (!(await verifyOutletAuthority(c, existing.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
      }

      const body = await c.req.json();
      const updated = await hrService.updateManpowerSanction(id, existing.outletId, user.id, body);
      return c.json({ success: true, data: updated, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// 12. Get manpower summary for outlet
hrRoutes.get(
  '/outlets/:outletId/hr/manpower-summary',
  requirePermission(PERMISSIONS.HR_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { hrService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const summary = await hrService.getManpowerSummary(outletId);
      return c.json({ success: true, data: summary, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// ============================================================================
// SHIFT ROSTER ROUTES
// ============================================================================

// 13. List roster assignments for outlet
hrRoutes.get(
  '/outlets/:outletId/hr/roster',
  requirePermission(PERMISSIONS.HR_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { hrService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const query = c.req.query();
      const rosterList = await hrService.listRoster(
        outletId,
        Object.keys(query).length > 0 ? query : undefined
      );
      return c.json({ success: true, data: rosterList, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// 14. Create roster assignment for outlet
hrRoutes.post(
  '/outlets/:outletId/hr/roster',
  requirePermission(PERMISSIONS.HR_ROSTER_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const user = c.var.user!.user;
    const { hrService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const body = await c.req.json();
      const roster = await hrService.createRoster(outletId, user.id, body);
      return c.json({ success: true, data: roster, error: null }, 201);
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// 15. Get roster assignment by ID
hrRoutes.get(
  '/hr/roster/:id',
  requirePermission(PERMISSIONS.HR_READ) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const { hrService, hrRepo, outletRepo } = getServices(c);

    try {
      const existing = await hrRepo.getRosterById(id);
      if (!existing) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'HR_ROSTER_NOT_FOUND', message: 'The roster assignment could not be found' },
        }, 404);
      }

      if (!(await verifyOutletAuthority(c, existing.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
      }

      const roster = await hrService.getRosterById(id, existing.outletId);
      return c.json({ success: true, data: roster, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// 16. Update roster assignment by ID
hrRoutes.put(
  '/hr/roster/:id',
  requirePermission(PERMISSIONS.HR_ROSTER_WRITE) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const user = c.var.user!.user;
    const { hrService, hrRepo, outletRepo } = getServices(c);

    try {
      const existing = await hrRepo.getRosterById(id);
      if (!existing) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'HR_ROSTER_NOT_FOUND', message: 'The roster assignment could not be found' },
        }, 404);
      }

      if (!(await verifyOutletAuthority(c, existing.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
      }

      const body = await c.req.json();
      const updated = await hrService.updateRoster(id, existing.outletId, user.id, body);
      return c.json({ success: true, data: updated, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);
