import { Hono } from 'hono';
import { getDb } from '../../db';
import { HrRepository } from '../repositories/hrRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { HrService, HrError } from '../services/hrService';
import { ScopeService } from '../services/scopeService';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../../shared/constants';
import { mapDatabaseUniqueError } from '../services/duplicateErrorMapper';
import { GlobalHrDesignationStatusSchema } from '../../shared/validators';

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
  const mappedUnique = mapDatabaseUniqueError(err);
  if (mappedUnique) {
    return c.json({
      success: false,
      data: null,
      error: { code: mappedUnique.code, message: mappedUnique.message },
    }, 409);
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

// In-memory cache with 60s TTL
interface CacheStore<T> {
  [key: string]: { data: T; expiresAt: number };
}
const globalDesignationCache: CacheStore<any> = {};

export function invalidateGlobalDesignationCache() {
  for (const k of Object.keys(globalDesignationCache)) {
    delete globalDesignationCache[k];
  }
}

// ============================================================================
// GLOBAL DESIGNATION ROUTES (CENTRAL MASTER)
// ============================================================================

// 1. List global designations (supports optional ?status=ACTIVE|INACTIVE)
hrRoutes.get(
  '/hr/designations',
  requirePermission(PERMISSIONS.HR_READ) as any,
  async (c: AppContext) => {
    const { hrService } = getServices(c);
    const statusParam = c.req.query('status') as 'ACTIVE' | 'INACTIVE' | undefined;
    const cacheKey = `list_${statusParam || 'ALL'}`;
    const now = Date.now();

    if (globalDesignationCache[cacheKey] && globalDesignationCache[cacheKey].expiresAt > now) {
      return c.json({ success: true, data: globalDesignationCache[cacheKey].data, error: null });
    }

    try {
      const designations = await hrService.listGlobalDesignations(statusParam);
      globalDesignationCache[cacheKey] = {
        data: designations,
        expiresAt: now + 60_000,
      };
      return c.json({ success: true, data: designations, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// 2. Create global designation
hrRoutes.post(
  '/hr/designations',
  requirePermission(PERMISSIONS.HR_STAFF_WRITE) as any,
  async (c: AppContext) => {
    const user = c.var.user!.user;
    const { hrService } = getServices(c);

    try {
      const body = await c.req.json();
      const created = await hrService.createGlobalDesignation(user.id, body);
      invalidateGlobalDesignationCache();
      return c.json({ success: true, data: created, error: null }, 201);
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// 3. Get global or legacy designation by ID
hrRoutes.get(
  '/hr/designations/:id',
  requirePermission(PERMISSIONS.HR_READ) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const { hrService, hrRepo, outletRepo } = getServices(c);

    try {
      const legacy = await hrRepo.getDesignationById(id);
      if (legacy && legacy.outletId) {
        if (!(await verifyOutletAuthority(c, legacy.outletId, outletRepo))) {
          return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
        }
        return c.json({ success: true, data: legacy, error: null });
      }

      const designation = await hrService.getGlobalDesignationById(id);
      return c.json({ success: true, data: designation, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// 4. Update global or legacy designation by ID
hrRoutes.put(
  '/hr/designations/:id',
  requirePermission(PERMISSIONS.HR_STAFF_WRITE) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const user = c.var.user!.user;
    const { hrService, hrRepo, outletRepo } = getServices(c);

    try {
      const body = await c.req.json();
      const legacy = await hrRepo.getDesignationById(id);
      const globalDesig = await hrRepo.getGlobalDesignationById(id);

      if (legacy && !globalDesig && legacy.outletId) {
        if (!(await verifyOutletAuthority(c, legacy.outletId, outletRepo))) {
          return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
        }
        const updated = await hrService.updateDesignation(id, legacy.outletId, user.id, body);
        invalidateGlobalDesignationCache();
        return c.json({ success: true, data: updated, error: null });
      }

      const updated = await hrService.updateGlobalDesignation(id, user.id, body);
      invalidateGlobalDesignationCache();
      return c.json({ success: true, data: updated, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// 5. Update global designation status
hrRoutes.patch(
  '/hr/designations/:id/status',
  requirePermission(PERMISSIONS.HR_STAFF_WRITE) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const user = c.var.user!.user;
    const { hrService } = getServices(c);

    try {
      const body = await c.req.json();
      const parsed = GlobalHrDesignationStatusSchema.parse(body);
      const updated = await hrService.updateGlobalDesignationStatus(id, user.id, parsed.status);
      invalidateGlobalDesignationCache();
      return c.json({ success: true, data: updated, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// 6. Compatibility aliases for legacy outlet designation management (DEPRECATED)
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
      const statusParam = c.req.query('status') as HrDesignationStatus | undefined;
      const skillCategory = c.req.query('skillCategory') as any;
      const search = c.req.query('search');
      const designations = await hrService.listDesignations(outletId, {
        status: statusParam || 'ACTIVE',
        skillCategory,
        search,
      });
      c.header('X-Deprecated', 'This endpoint is deprecated. Use GET /api/v1/hr/designations instead.');
      return c.json({ success: true, data: designations, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

hrRoutes.post(
  '/outlets/:outletId/hr/designations',
  requirePermission(PERMISSIONS.HR_STAFF_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const user = c.var.user!.user;
    const { hrService, hrRepo, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const body = await c.req.json();
      if (body?.code && typeof body.code === 'string' && body.code.trim()) {
        const legacyDup = await hrRepo.findDesignationByCode(outletId, body.code.trim().toUpperCase());
        if (legacyDup && (!legacyDup.outletId || legacyDup.outletId === outletId)) {
          return c.json({
            success: false,
            data: null,
            error: { code: 'HR_DESIGNATION_CODE_EXISTS', message: `A designation with code '${body.code.trim().toUpperCase()}' already exists` },
          }, 409);
        }
      }
      const created = await hrService.createGlobalDesignation(user.id, body);
      invalidateGlobalDesignationCache();
      c.header('X-Deprecated', 'This endpoint is deprecated. Use POST /api/v1/hr/designations instead.');
      return c.json({ success: true, data: { ...created, outletId }, error: null }, 201);
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

hrRoutes.get(
  '/outlets/:outletId/hr/designations/:id',
  requirePermission(PERMISSIONS.HR_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const id = c.req.param('id')!;
    const { hrService, hrRepo, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const legacy = await hrRepo.getDesignationById(id);
      if (legacy && legacy.outletId && legacy.outletId !== outletId) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this designation' } }, 403);
      }
      const designation = (await hrService.getGlobalDesignationById(id)) || legacy;
      if (!designation) {
        return c.json({ success: false, data: null, error: { code: 'HR_DESIGNATION_NOT_FOUND', message: 'Designation not found' } }, 404);
      }
      c.header('X-Deprecated', 'This endpoint is deprecated. Use GET /api/v1/hr/designations/:id instead.');
      return c.json({ success: true, data: designation, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

hrRoutes.put(
  '/outlets/:outletId/hr/designations/:id',
  requirePermission(PERMISSIONS.HR_STAFF_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const id = c.req.param('id')!;
    const user = c.var.user!.user;
    const { hrService, hrRepo, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const legacy = await hrRepo.getDesignationById(id);
      if (legacy && legacy.outletId && legacy.outletId !== outletId) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this designation' } }, 403);
      }
      const body = await c.req.json();
      const globalDesig = await hrRepo.getGlobalDesignationById(id);
      const updated = (legacy && !globalDesig)
        ? await hrService.updateDesignation(id, outletId, user.id, body)
        : await hrService.updateGlobalDesignation(id, user.id, body);
      invalidateGlobalDesignationCache();
      c.header('X-Deprecated', 'This endpoint is deprecated. Use PUT /api/v1/hr/designations/:id instead.');
      return c.json({ success: true, data: updated, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

hrRoutes.delete(
  '/outlets/:outletId/hr/designations/:id',
  requirePermission(PERMISSIONS.HR_STAFF_WRITE) as any,
  async (c: AppContext) => {
    return c.json({
      success: false,
      data: null,
      error: { code: 'HR_DESIGNATION_DELETE_FORBIDDEN', message: 'Physical deletion of designations is prohibited. Use status=INACTIVE instead.' },
    }, 409);
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

// ============================================================================
// GEOFENCE POLICY ROUTES
// ============================================================================

hrRoutes.get(
  '/outlets/:outletId/hr/geofence-policy',
  requirePermission(PERMISSIONS.HR_ATTENDANCE_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { hrService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const policy = await hrService.getGeofencePolicy(outletId);
      return c.json({ success: true, data: policy, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

hrRoutes.put(
  '/outlets/:outletId/hr/geofence-policy',
  requirePermission(PERMISSIONS.HR_GEOFENCE_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const user = c.var.user!.user;
    const { hrService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const body = await c.req.json();
      const policy = await hrService.upsertGeofencePolicy(outletId, user.id, body);
      return c.json({ success: true, data: policy, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// ============================================================================
// ATTENDANCE ROUTES
// ============================================================================

hrRoutes.post(
  '/outlets/:outletId/hr/attendance/check-in',
  requirePermission(PERMISSIONS.HR_ATTENDANCE_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const user = c.var.user!.user;
    const { hrService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const body = await c.req.json();
      const record = await hrService.checkInAttendance(outletId, user.id, body);
      return c.json({ success: true, data: record, error: null }, 201);
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

hrRoutes.post(
  '/outlets/:outletId/hr/attendance/:attendanceId/check-out',
  requirePermission(PERMISSIONS.HR_ATTENDANCE_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const attendanceId = c.req.param('attendanceId')!;
    const user = c.var.user!.user;
    const { hrService, hrRepo, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const existing = await hrRepo.getAttendanceById(attendanceId);
      if (!existing || existing.outletId !== outletId) {
        return c.json({ success: false, data: null, error: { code: 'HR_ATTENDANCE_NOT_FOUND', message: 'Attendance record not found' } }, 404);
      }

      const body = await c.req.json();
      const record = await hrService.checkOutAttendance(outletId, attendanceId, user.id, body);
      return c.json({ success: true, data: record, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

hrRoutes.get(
  '/outlets/:outletId/hr/attendance',
  requirePermission(PERMISSIONS.HR_ATTENDANCE_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { hrService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const query = c.req.query();
      const records = await hrService.listAttendance(
        outletId,
        Object.keys(query).length > 0 ? query : undefined
      );
      return c.json({ success: true, data: records, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// ============================================================================
// NOZZLE ASSIGNMENT ROUTES
// ============================================================================

hrRoutes.get(
  '/outlets/:outletId/hr/nozzle-assignments',
  requirePermission(PERMISSIONS.HR_ATTENDANCE_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { hrService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const query = c.req.query();
      const assignments = await hrService.listNozzleAssignments(
        outletId,
        Object.keys(query).length > 0 ? query : undefined
      );
      return c.json({ success: true, data: assignments, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

hrRoutes.post(
  '/outlets/:outletId/hr/nozzle-assignments',
  requirePermission(PERMISSIONS.HR_NOZZLE_ASSIGNMENT_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const user = c.var.user!.user;
    const { hrService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const body = await c.req.json();
      const assignment = await hrService.createNozzleAssignment(outletId, user.id, body);
      return c.json({ success: true, data: assignment, error: null }, 201);
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

hrRoutes.patch(
  '/outlets/:outletId/hr/nozzle-assignments/:assignmentId/cancel',
  requirePermission(PERMISSIONS.HR_NOZZLE_ASSIGNMENT_WRITE) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const assignmentId = c.req.param('assignmentId')!;
    const user = c.var.user!.user;
    const { hrService, hrRepo, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const existing = await hrRepo.getNozzleAssignmentById(assignmentId);
      if (!existing || existing.outletId !== outletId) {
        return c.json({ success: false, data: null, error: { code: 'HR_NOZZLE_ASSIGNMENT_NOT_FOUND', message: 'Nozzle assignment not found' } }, 404);
      }

      const cancelled = await hrService.cancelNozzleAssignment(assignmentId, outletId, user.id);
      return c.json({ success: true, data: cancelled, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

// ============================================================================
// LEAVE REQUEST ROUTES
// ============================================================================

hrRoutes.get(
  '/outlets/:outletId/hr/leave-requests',
  requirePermission(PERMISSIONS.HR_LEAVE_READ) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const { hrService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const query = c.req.query();
      const leaves = await hrService.listLeaveRequests(
        outletId,
        Object.keys(query).length > 0 ? query : undefined
      );
      return c.json({ success: true, data: leaves, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

hrRoutes.post(
  '/outlets/:outletId/hr/leave-requests',
  requirePermission(PERMISSIONS.HR_LEAVE_REQUEST) as any,
  async (c: AppContext) => {
    const outletId = c.req.param('outletId')!;
    const user = c.var.user!.user;
    const { hrService, outletRepo } = getServices(c);

    if (!(await verifyOutletAuthority(c, outletId, outletRepo))) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
    }

    try {
      const body = await c.req.json();
      const leave = await hrService.createLeaveRequest(outletId, user.id, body);
      return c.json({ success: true, data: leave, error: null }, 201);
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

hrRoutes.get(
  '/hr/leave-requests/:id',
  requirePermission(PERMISSIONS.HR_LEAVE_READ) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const { hrService, hrRepo, outletRepo } = getServices(c);

    try {
      const existing = await hrRepo.getLeaveRequestById(id);
      if (!existing) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'HR_LEAVE_NOT_FOUND', message: 'Leave request not found' },
        }, 404);
      }

      if (!(await verifyOutletAuthority(c, existing.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
      }

      const leave = await hrService.getLeaveRequestById(id, existing.outletId);
      return c.json({ success: true, data: leave, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

hrRoutes.post(
  '/hr/leave-requests/:id/approve',
  requirePermission(PERMISSIONS.HR_LEAVE_APPROVE) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const user = c.var.user!.user;
    const { hrService, hrRepo, outletRepo } = getServices(c);

    try {
      const existing = await hrRepo.getLeaveRequestById(id);
      if (!existing) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'HR_LEAVE_NOT_FOUND', message: 'Leave request not found' },
        }, 404);
      }

      if (!(await verifyOutletAuthority(c, existing.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
      }

      const body = await c.req.json();
      const approved = await hrService.approveLeaveRequest(id, existing.outletId, user.id, body);
      return c.json({ success: true, data: approved, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

hrRoutes.post(
  '/hr/leave-requests/:id/reject',
  requirePermission(PERMISSIONS.HR_LEAVE_APPROVE) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const user = c.var.user!.user;
    const { hrService, hrRepo, outletRepo } = getServices(c);

    try {
      const existing = await hrRepo.getLeaveRequestById(id);
      if (!existing) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'HR_LEAVE_NOT_FOUND', message: 'Leave request not found' },
        }, 404);
      }

      if (!(await verifyOutletAuthority(c, existing.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
      }

      const body = await c.req.json();
      const rejected = await hrService.rejectLeaveRequest(id, existing.outletId, user.id, body);
      return c.json({ success: true, data: rejected, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);

hrRoutes.post(
  '/hr/leave-requests/:id/cancel',
  requirePermission(PERMISSIONS.HR_LEAVE_REQUEST) as any,
  async (c: AppContext) => {
    const id = c.req.param('id')!;
    const user = c.var.user!.user;
    const { hrService, hrRepo, outletRepo } = getServices(c);

    try {
      const existing = await hrRepo.getLeaveRequestById(id);
      if (!existing) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'HR_LEAVE_NOT_FOUND', message: 'Leave request not found' },
        }, 404);
      }

      if (!(await verifyOutletAuthority(c, existing.outletId, outletRepo))) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
      }

      const body = await c.req.json();
      const cancelled = await hrService.cancelLeaveRequest(id, existing.outletId, user.id, body);
      return c.json({ success: true, data: cancelled, error: null });
    } catch (err) {
      return handleHrError(c, err);
    }
  }
);
