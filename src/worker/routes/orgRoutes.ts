import { Hono } from 'hono';
import { getDb } from '../../db';
import { OrgService, OrgError, AuditContext } from '../services/orgService';
import { ScopeService } from '../services/scopeService';
import { HierarchyRepository } from '../repositories/hierarchyRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../../shared/constants';

export const orgRoutes = new Hono<{
  Bindings: EnvBindings;
  Variables: { user: any; sessionToken: string };
}>();

orgRoutes.use('*', requireAuth as any);

function getService(c: AppContext) {
  const db = getDb(c.env.DB);
  return new OrgService(db);
}

function getAuditContext(c: AppContext): AuditContext {
  return {
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
  };
}

function handleOrgError(c: AppContext, err: any) {
  if (err instanceof OrgError) {
    return c.json({
      success: false,
      data: null,
      error: { code: err.code, message: err.message },
    }, err.status as any);
  }
  console.error('[Org Operation Error]:', err);
  return c.json({
    success: false,
    data: null,
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'Unable to complete the organization management request.' },
  }, 500);
}

// -------------------------------------------------------------------------
// Departments
// -------------------------------------------------------------------------
orgRoutes.get('/departments', requirePermission(PERMISSIONS.ORG_MASTERS_READ) as any, async (c) => {
  try {
    const service = getService(c);
    const departments = await service.listDepartments();
    return c.json({ success: true, data: departments, error: null });
  } catch (err) {
    return handleOrgError(c, err);
  }
});

orgRoutes.post('/departments', requirePermission(PERMISSIONS.ORG_MASTERS_WRITE) as any, async (c) => {
  if (!c.var.user.isGlobalScope) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'Global scope is required to manage organization master records.' },
    }, 403);
  }

  try {
    const body = await c.req.json();
    const user = c.var.user;
    const service = getService(c);
    const department = await service.createDepartment(body, user.user.id, getAuditContext(c));
    return c.json({ success: true, data: department, error: null }, 201);
  } catch (err) {
    return handleOrgError(c, err);
  }
});

orgRoutes.put('/departments/:id', requirePermission(PERMISSIONS.ORG_MASTERS_WRITE) as any, async (c) => {
  if (!c.var.user.isGlobalScope) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'Global scope is required to manage organization master records.' },
    }, 403);
  }

  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const user = c.var.user;
    const service = getService(c);
    const department = await service.updateDepartment(id, body, user.user.id, getAuditContext(c));
    return c.json({ success: true, data: department, error: null });
  } catch (err) {
    return handleOrgError(c, err);
  }
});

// -------------------------------------------------------------------------
// Officers
// -------------------------------------------------------------------------
orgRoutes.get('/officers', requirePermission(PERMISSIONS.ORG_MASTERS_READ) as any, async (c) => {
  try {
    const departmentId = c.req.query('departmentId');
    const service = getService(c);
    const officers = await service.listOfficers(departmentId);
    return c.json({ success: true, data: officers, error: null });
  } catch (err) {
    return handleOrgError(c, err);
  }
});

orgRoutes.post('/officers', requirePermission(PERMISSIONS.ORG_MASTERS_WRITE) as any, async (c) => {
  if (!c.var.user.isGlobalScope) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'Global scope is required to manage organization master records.' },
    }, 403);
  }

  try {
    const body = await c.req.json();
    const user = c.var.user;
    const service = getService(c);
    const officer = await service.createOfficer(body, user.user.id, getAuditContext(c));
    return c.json({ success: true, data: officer, error: null }, 201);
  } catch (err) {
    return handleOrgError(c, err);
  }
});

orgRoutes.put('/officers/:id', requirePermission(PERMISSIONS.ORG_MASTERS_WRITE) as any, async (c) => {
  if (!c.var.user.isGlobalScope) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'Global scope is required to manage organization master records.' },
    }, 403);
  }

  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const user = c.var.user;
    const service = getService(c);
    const officer = await service.updateOfficer(id, body, user.user.id, getAuditContext(c));
    return c.json({ success: true, data: officer, error: null });
  } catch (err) {
    return handleOrgError(c, err);
  }
});

// -------------------------------------------------------------------------
// Officer Postings
// -------------------------------------------------------------------------
orgRoutes.get('/officers/:officerId/postings', requirePermission(PERMISSIONS.ORG_MASTERS_READ) as any, async (c) => {
  try {
    const officerId = c.req.param('officerId');
    const user = c.var.user;
    const service = getService(c);
    const postings = await service.listOfficerPostings(officerId, user);
    return c.json({ success: true, data: postings, error: null });
  } catch (err) {
    return handleOrgError(c, err);
  }
});

orgRoutes.post('/officers/:officerId/postings', requirePermission(PERMISSIONS.ORG_MASTERS_WRITE) as any, async (c) => {
  try {
    const officerId = c.req.param('officerId');
    const body = await c.req.json();
    const user = c.var.user;
    const db = getDb(c.env.DB);
    const hierarchyRepo = new HierarchyRepository(db);
    const outletRepo = new OutletRepository(db);

    // Enforce target scope authority
    const scopeLevel = body?.scopeLevel;
    if (scopeLevel === 'GLOBAL') {
      if (!user.isGlobalScope) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'FORBIDDEN', message: 'Global scope authority is required to assign GLOBAL officer postings.' },
        }, 403);
      }
    } else if (scopeLevel === 'STATE') {
      if (body.stateId && !(await ScopeService.canAccessState(user, body.stateId))) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'FORBIDDEN', message: 'Insufficient scope authority for the specified state.' },
        }, 403);
      }
    } else if (scopeLevel === 'DIVISION') {
      if (body.divisionId && !(await ScopeService.canAccessDivision(user, body.divisionId, hierarchyRepo))) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'FORBIDDEN', message: 'Insufficient scope authority for the specified division.' },
        }, 403);
      }
    } else if (scopeLevel === 'SALES_AREA') {
      if (body.salesAreaId && !(await ScopeService.canAccessSalesArea(user, body.salesAreaId, hierarchyRepo))) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'FORBIDDEN', message: 'Insufficient scope authority for the specified sales area.' },
        }, 403);
      }
    } else if (scopeLevel === 'OUTLET') {
      if (body.outletId && !(await ScopeService.canAccessOutlet(user, body.outletId, outletRepo))) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'FORBIDDEN', message: 'Insufficient scope authority for the specified outlet.' },
        }, 403);
      }
    }

    const service = getService(c);
    const posting = await service.createOfficerPosting(officerId, body, user.user.id, getAuditContext(c));
    return c.json({ success: true, data: posting, error: null }, 201);
  } catch (err) {
    return handleOrgError(c, err);
  }
});

orgRoutes.put('/officer-postings/:postingId', requirePermission(PERMISSIONS.ORG_MASTERS_WRITE) as any, async (c) => {
  try {
    const postingId = c.req.param('postingId');
    const body = await c.req.json();
    const user = c.var.user;
    const db = getDb(c.env.DB);
    const hierarchyRepo = new HierarchyRepository(db);
    const outletRepo = new OutletRepository(db);
    const service = getService(c);

    // Look up existing posting to verify authority over target scope
    const existingPosting = await service.getPostingById(postingId);
    if (!existingPosting) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'POSTING_NOT_FOUND', message: 'Officer posting not found' },
      }, 404);
    }

    if (existingPosting.scopeLevel === 'GLOBAL') {
      if (!user.isGlobalScope) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'FORBIDDEN', message: 'Global scope authority is required to update GLOBAL officer postings.' },
        }, 403);
      }
    } else if (existingPosting.scopeLevel === 'STATE') {
      if (!existingPosting.stateId || !(await ScopeService.canAccessState(user, existingPosting.stateId))) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'FORBIDDEN', message: 'Insufficient scope authority for the specified state.' },
        }, 403);
      }
    } else if (existingPosting.scopeLevel === 'DIVISION') {
      if (!existingPosting.divisionId || !(await ScopeService.canAccessDivision(user, existingPosting.divisionId, hierarchyRepo))) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'FORBIDDEN', message: 'Insufficient scope authority for the specified division.' },
        }, 403);
      }
    } else if (existingPosting.scopeLevel === 'SALES_AREA') {
      if (!existingPosting.salesAreaId || !(await ScopeService.canAccessSalesArea(user, existingPosting.salesAreaId, hierarchyRepo))) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'FORBIDDEN', message: 'Insufficient scope authority for the specified sales area.' },
        }, 403);
      }
    } else if (existingPosting.scopeLevel === 'OUTLET') {
      if (!existingPosting.outletId || !(await ScopeService.canAccessOutlet(user, existingPosting.outletId, outletRepo))) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'FORBIDDEN', message: 'Insufficient scope authority for the specified outlet.' },
        }, 403);
      }
    }

    const posting = await service.updateOfficerPosting(postingId, body, user.user.id, getAuditContext(c));
    return c.json({ success: true, data: posting, error: null });
  } catch (err) {
    return handleOrgError(c, err);
  }
});

// -------------------------------------------------------------------------
// Service Providers
// -------------------------------------------------------------------------
orgRoutes.get('/service-providers', requirePermission(PERMISSIONS.ORG_MASTERS_READ) as any, async (c) => {
  try {
    const status = c.req.query('status');
    const service = getService(c);
    const providers = await service.listServiceProviders(status);
    return c.json({ success: true, data: providers, error: null });
  } catch (err) {
    return handleOrgError(c, err);
  }
});

orgRoutes.post('/service-providers', requirePermission(PERMISSIONS.ORG_MASTERS_WRITE) as any, async (c) => {
  if (!c.var.user.isGlobalScope) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'Global scope is required to manage organization master records.' },
    }, 403);
  }

  try {
    const body = await c.req.json();
    const user = c.var.user;
    const service = getService(c);
    const provider = await service.createServiceProvider(body, user.user.id, getAuditContext(c));
    return c.json({ success: true, data: provider, error: null }, 201);
  } catch (err) {
    return handleOrgError(c, err);
  }
});

orgRoutes.put('/service-providers/:id', requirePermission(PERMISSIONS.ORG_MASTERS_WRITE) as any, async (c) => {
  if (!c.var.user.isGlobalScope) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'Global scope is required to manage organization master records.' },
    }, 403);
  }

  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const user = c.var.user;
    const service = getService(c);
    const provider = await service.updateServiceProvider(id, body, user.user.id, getAuditContext(c));
    return c.json({ success: true, data: provider, error: null });
  } catch (err) {
    return handleOrgError(c, err);
  }
});

// -------------------------------------------------------------------------
// Outlet Service Provider Assignments
// -------------------------------------------------------------------------
orgRoutes.get('/outlets/:outletId/service-providers', requirePermission(PERMISSIONS.ORG_MASTERS_READ) as any, async (c) => {
  try {
    const outletId = c.req.param('outletId');
    const user = c.var.user;
    const db = getDb(c.env.DB);
    const outletRepo = new OutletRepository(db);

    if (!(await ScopeService.canAccessOutlet(user, outletId, outletRepo))) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'Insufficient scope authority for the specified outlet.' },
      }, 403);
    }

    const service = getService(c);
    const assignments = await service.listOutletServiceProviders(outletId);
    return c.json({ success: true, data: assignments, error: null });
  } catch (err) {
    return handleOrgError(c, err);
  }
});

orgRoutes.post('/outlets/:outletId/service-providers', requirePermission(PERMISSIONS.ORG_MASTERS_WRITE) as any, async (c) => {
  try {
    const outletId = c.req.param('outletId');
    const user = c.var.user;
    const db = getDb(c.env.DB);
    const outletRepo = new OutletRepository(db);

    if (!(await ScopeService.canAccessOutlet(user, outletId, outletRepo))) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'Insufficient scope authority for the specified outlet.' },
      }, 403);
    }

    const body = await c.req.json();
    const service = getService(c);
    const assignment = await service.assignServiceProviderToOutlet(outletId, body, user.user.id, getAuditContext(c));
    return c.json({ success: true, data: assignment, error: null }, 201);
  } catch (err) {
    return handleOrgError(c, err);
  }
});

orgRoutes.put('/outlet-service-provider-assignments/:id', requirePermission(PERMISSIONS.ORG_MASTERS_WRITE) as any, async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.var.user;
    const db = getDb(c.env.DB);
    const outletRepo = new OutletRepository(db);
    const service = getService(c);

    const existingAssignment = await service.getAssignmentById(id);
    if (!existingAssignment) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'ASSIGNMENT_NOT_FOUND', message: 'Outlet service provider assignment not found' },
      }, 404);
    }

    if (!(await ScopeService.canAccessOutlet(user, existingAssignment.outletId, outletRepo))) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'Insufficient scope authority for the specified outlet.' },
      }, 403);
    }

    const body = await c.req.json();
    const assignment = await service.updateOutletServiceProviderAssignment(id, body, user.user.id, getAuditContext(c));
    return c.json({ success: true, data: assignment, error: null });
  } catch (err) {
    return handleOrgError(c, err);
  }
});
