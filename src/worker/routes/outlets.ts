import { Hono } from 'hono';
import { getDb } from '../../db';
import { OutletRepository } from '../repositories/outletRepository';
import { HierarchyRepository } from '../repositories/hierarchyRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { requireOutletAccess } from '../middleware/scope';
import { ScopeService } from '../services/scopeService';
import { RetailOutletSchema, UpdateRetailOutletSchema, OutletUserAssignmentSchema } from '../../shared/validators';
import { PERMISSIONS } from '../../shared/constants';

const outlets = new Hono<{ Bindings: EnvBindings }>();

outlets.use('*', requireAuth as any);

outlets.get('/', requirePermission(PERMISSIONS.OUTLETS_READ) as any, async (c: AppContext) => {
  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const userCtx = c.var.user;

  const includeHiddenParam = c.req.query('includeHidden') === 'true';
  const includeArchivedParam = c.req.query('includeArchived') === 'true';
  const onlyArchivedParam =
    c.req.query('onlyArchived') === 'true' ||
    c.req.query('lifecycleStatus') === 'ARCHIVED';

  const canManageArchive =
    userCtx.isGlobalScope && userCtx.permissions.includes(PERMISSIONS.OUTLETS_UPDATE);

  let targetOutlets;
  if (canManageArchive && (includeHiddenParam || includeArchivedParam || onlyArchivedParam)) {
    const allWithArchived = await outletRepo.listAllOutlets({ includeArchived: true });
    targetOutlets = onlyArchivedParam
      ? allWithArchived.filter(o => OutletRepository.isOutletArchived(o))
      : allWithArchived;
  } else {
    targetOutlets = await ScopeService.getAccessibleOutlets(userCtx, outletRepo);
  }

  const listWithAssignments = await Promise.all(
    targetOutlets.map(async (o) => {
      const assignments = await outletRepo.listOutletAssignments(o.id);
      return {
        ...o,
        assignedUsersCount: assignments.length,
        assignments,
      };
    })
  );

  return c.json({
    success: true,
    data: listWithAssignments,
    error: null,
  });
});

outlets.get('/:id', requirePermission(PERMISSIONS.OUTLETS_READ) as any, requireOutletAccess('id') as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) {
    return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'ID required' } }, 400);
  }
  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);

  const outlet = await outletRepo.findById(id);
  if (!outlet) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'Retail outlet not found' },
    }, 404);
  }

  const assignments = await outletRepo.listOutletAssignments(id);

  return c.json({
    success: true,
    data: {
      ...outlet,
      assignments,
    },
    error: null,
  });
});

outlets.post('/', requirePermission(PERMISSIONS.OUTLETS_CREATE) as any, async (c: AppContext) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = RetailOutletSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid retail outlet payload',
        details: parseResult.error.flatten(),
      },
    }, 400);
  }

  const payload = parseResult.data;
  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const hierarchyRepo = new HierarchyRepository(db);
  const auditRepo = new AuditRepository(db);

  // Validate organizational parent chain
  const sa = await hierarchyRepo.findSalesAreaById(payload.salesAreaId);
  if (!sa || sa.divisionId !== payload.divisionId || sa.stateId !== payload.stateId) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'INVALID_HIERARCHY',
        message: 'The selected Sales Area does not match the provided State and Division hierarchy.',
      },
    }, 400);
  }

  if (!await ScopeService.canAccessSalesArea(c.var.user, payload.salesAreaId, hierarchyRepo)) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'Cannot register outlet outside your assigned Sales Area.' },
    }, 403);
  }

  const normalizedRoCode = payload.roCode?.trim().toUpperCase();
  if (!normalizedRoCode) {
    return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'RO Code is required.' } }, 400);
  }
  const existingByCode = await outletRepo.findByIdOrCode(normalizedRoCode);
  if (existingByCode) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'RO_CODE_EXISTS',
        message: `Retail outlet with RO Code '${normalizedRoCode}' already exists.`,
      },
    }, 409);
  }

  const nowIso = new Date().toISOString();
  let created;
  try {
    created = await outletRepo.createOutlet({
      id: `ro-${crypto.randomUUID()}`,
      roCode: normalizedRoCode,
      name: payload.name,
      outletType: payload.outletType,
      stateId: payload.stateId,
      divisionId: payload.divisionId,
      salesAreaId: payload.salesAreaId,
      address: payload.address,
      city: payload.city,
      district: payload.district,
      pincode: payload.pincode,
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      status: payload.status,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  } catch (err: any) {
    if (String(err?.message || '').includes('UNIQUE constraint failed')) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'RO_CODE_EXISTS',
          message: `Retail outlet with RO Code '${normalizedRoCode}' already exists.`,
        },
      }, 409);
    }
    throw err;
  }

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user.user.id,
    action: 'OUTLET_CREATE',
    entityType: 'RETAIL_OUTLET',
    entityId: created.id,
    newValue: created as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({
    success: true,
    data: created,
    error: null,
  });
});

outlets.patch('/:id', requirePermission(PERMISSIONS.OUTLETS_UPDATE) as any, requireOutletAccess('id') as any, async (c: AppContext) => {
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));
  const parseResult = UpdateRetailOutletSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid retail outlet update payload',
        details: parseResult.error.flatten(),
      },
    }, 400);
  }

  const payload = parseResult.data;
  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const hierarchyRepo = new HierarchyRepository(db);
  const auditRepo = new AuditRepository(db);

  const currentOutlet = await outletRepo.findById(id);
  if (!currentOutlet) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'Retail outlet not found' },
    }, 404);
  }

  const salesAreaId = payload.salesAreaId;
  const divisionId = payload.divisionId;
  const stateId = payload.stateId;

  if (salesAreaId && divisionId && stateId) {
    const sa = await hierarchyRepo.findSalesAreaById(salesAreaId);
    if (!sa || sa.divisionId !== divisionId || sa.stateId !== stateId) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'INVALID_HIERARCHY',
          message: 'The selected Sales Area does not match the selected State Office and Division Office.',
        },
      }, 400);
    }

    if (!await ScopeService.canAccessSalesArea(c.var.user, salesAreaId, hierarchyRepo)) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'Cannot move outlet outside your authorized Sales Area hierarchy.' },
      }, 403);
    }
  }

  const nowIso = new Date().toISOString();
  await outletRepo.updateOutlet(id, {
    ...payload,
    updatedAt: nowIso,
  });

  const updatedOutlet = await outletRepo.findById(id);

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user.user.id,
    action: 'OUTLET_UPDATE',
    entityType: 'RETAIL_OUTLET',
    entityId: id,
    oldValue: currentOutlet as unknown as Record<string, unknown>,
    newValue: updatedOutlet as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({
    success: true,
    data: updatedOutlet,
    error: null,
  });
});

async function performOutletLifecycleTransition(
  c: AppContext,
  id: string,
  archive: boolean
) {
  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);

  const currentOutlet = await outletRepo.findById(id);
  if (!currentOutlet) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'Retail outlet not found' },
    }, 404);
  }

  const nowIso = new Date().toISOString();
  const userId = c.var.user.user.id;

  const updatedOutlet = archive
    ? await outletRepo.archiveOutlet(id, userId, nowIso)
    : await outletRepo.restoreOutlet(id, nowIso);

  const primaryAuditAction = archive ? 'OUTLET_ARCHIVED' : 'OUTLET_RESTORED';
  const legacyAuditAction = archive ? 'OUTLET_DIRECTORY_HIDE' : 'OUTLET_DIRECTORY_RESTORE';

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId,
    action: primaryAuditAction,
    entityType: 'RETAIL_OUTLET',
    entityId: id,
    oldValue: currentOutlet as unknown as Record<string, unknown>,
    newValue: updatedOutlet as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId,
    action: legacyAuditAction,
    entityType: 'RETAIL_OUTLET',
    entityId: id,
    oldValue: currentOutlet as unknown as Record<string, unknown>,
    newValue: updatedOutlet as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({
    success: true,
    data: updatedOutlet,
    error: null,
  });
}

outlets.patch(
  '/:id/directory-visibility',
  requirePermission(PERMISSIONS.OUTLETS_UPDATE) as any,
  requireOutletAccess('id', { allowArchivedForAdmin: true }) as any,
  async (c: AppContext) => {
    const id = c.req.param('id') as string;
    const body = await c.req.json().catch(() => ({}));

    const archiveFlag =
      typeof body.hidden === 'boolean'
        ? body.hidden
        : typeof body.isArchived === 'boolean'
          ? body.isArchived
          : body.lifecycleStatus === 'ARCHIVED'
            ? true
            : body.lifecycleStatus === 'ACTIVE'
              ? false
              : undefined;

    if (typeof archiveFlag !== 'boolean') {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid payload: "hidden" boolean is required.',
        },
      }, 400);
    }

    return performOutletLifecycleTransition(c, id, archiveFlag);
  }
);

outlets.post(
  '/:id/archive',
  requirePermission(PERMISSIONS.OUTLETS_UPDATE) as any,
  requireOutletAccess('id', { allowArchivedForAdmin: true }) as any,
  async (c: AppContext) => {
    const id = c.req.param('id') as string;
    return performOutletLifecycleTransition(c, id, true);
  }
);

outlets.post(
  '/:id/restore',
  requirePermission(PERMISSIONS.OUTLETS_UPDATE) as any,
  requireOutletAccess('id', { allowArchivedForAdmin: true }) as any,
  async (c: AppContext) => {
    const id = c.req.param('id') as string;
    return performOutletLifecycleTransition(c, id, false);
  }
);

outlets.get(
  '/:id/assignments',
  requirePermission(PERMISSIONS.OUTLETS_READ) as any,
  requireOutletAccess('id') as any,
  async (c: AppContext) => {
    const id = c.req.param('id') as string;
    const db = getDb(c.env.DB);
    const outletRepo = new OutletRepository(db);
    const assignments = await outletRepo.listOutletAssignments(id);
    return c.json({
      success: true,
      data: assignments,
      error: null,
    });
  }
);

outlets.post('/:id/assignments', requirePermission(PERMISSIONS.OUTLETS_UPDATE) as any, requireOutletAccess('id') as any, async (c: AppContext) => {
  const outletId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parseResult = OutletUserAssignmentSchema.safeParse({ ...body, outletId });

  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid assignment payload',
        details: parseResult.error.flatten(),
      },
    }, 400);
  }

  const payload = parseResult.data;
  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);

  const nowIso = new Date().toISOString();
  let createdAssignment;
  try {
    createdAssignment = await outletRepo.createOutletUserAssignment({
      id: `oua-${crypto.randomUUID()}`,
      outletId: payload.outletId,
      userId: payload.userId,
      assignmentType: payload.assignmentType,
      effectiveFrom: payload.effectiveFrom || nowIso,
      effectiveTo: payload.effectiveTo || null,
      isActive: true,
      createdAt: nowIso,
      createdBy: c.var.user.user.id,
    });
  } catch (err: any) {
    if (String(err?.message || '').includes('UNIQUE constraint failed')) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'OUTLET_ASSIGNMENT_EXISTS',
          message: 'User already has this assignment type for this retail outlet.',
        },
      }, 409);
    }
    throw err;
  }

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user.user.id,
    action: 'OUTLET_USER_ASSIGNMENT_CREATE',
    entityType: 'OUTLET_USER_ASSIGNMENT',
    entityId: createdAssignment.id,
    newValue: createdAssignment as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({
    success: true,
    data: createdAssignment,
    error: null,
  });
});

export default outlets;
