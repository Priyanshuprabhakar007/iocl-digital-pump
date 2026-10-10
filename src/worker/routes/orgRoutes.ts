import { Hono } from 'hono';
import { getDb } from '../../db';
import { OrgService, OrgError } from '../services/orgService';
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

// Departments
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
  try {
    const body = await c.req.json();
    const user = c.var.user;
    const service = getService(c);
    const department = await service.createDepartment(body, user.user.id);
    return c.json({ success: true, data: department, error: null }, 201);
  } catch (err) {
    return handleOrgError(c, err);
  }
});

orgRoutes.put('/departments/:id', requirePermission(PERMISSIONS.ORG_MASTERS_WRITE) as any, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const user = c.var.user;
    const service = getService(c);
    const department = await service.updateDepartment(id, body, user.user.id);
    return c.json({ success: true, data: department, error: null });
  } catch (err) {
    return handleOrgError(c, err);
  }
});

// Officers
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
  try {
    const body = await c.req.json();
    const user = c.var.user;
    const service = getService(c);
    const officer = await service.createOfficer(body, user.user.id);
    return c.json({ success: true, data: officer, error: null }, 201);
  } catch (err) {
    return handleOrgError(c, err);
  }
});

orgRoutes.put('/officers/:id', requirePermission(PERMISSIONS.ORG_MASTERS_WRITE) as any, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const user = c.var.user;
    const service = getService(c);
    const officer = await service.updateOfficer(id, body, user.user.id);
    return c.json({ success: true, data: officer, error: null });
  } catch (err) {
    return handleOrgError(c, err);
  }
});

// Officer Postings
orgRoutes.get('/officers/:officerId/postings', requirePermission(PERMISSIONS.ORG_MASTERS_READ) as any, async (c) => {
  try {
    const officerId = c.req.param('officerId');
    const service = getService(c);
    const postings = await service.listOfficerPostings(officerId);
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
    const service = getService(c);
    const posting = await service.createOfficerPosting(officerId, body, user.user.id);
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
    const service = getService(c);
    const posting = await service.updateOfficerPosting(postingId, body, user.user.id);
    return c.json({ success: true, data: posting, error: null });
  } catch (err) {
    return handleOrgError(c, err);
  }
});

// Service Providers
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
  try {
    const body = await c.req.json();
    const user = c.var.user;
    const service = getService(c);
    const provider = await service.createServiceProvider(body, user.user.id);
    return c.json({ success: true, data: provider, error: null }, 201);
  } catch (err) {
    return handleOrgError(c, err);
  }
});

orgRoutes.put('/service-providers/:id', requirePermission(PERMISSIONS.ORG_MASTERS_WRITE) as any, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const user = c.var.user;
    const service = getService(c);
    const provider = await service.updateServiceProvider(id, body, user.user.id);
    return c.json({ success: true, data: provider, error: null });
  } catch (err) {
    return handleOrgError(c, err);
  }
});

// Outlet Service Provider Assignments
orgRoutes.get('/outlets/:outletId/service-providers', requirePermission(PERMISSIONS.ORG_MASTERS_READ) as any, async (c) => {
  try {
    const outletId = c.req.param('outletId');
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
    const body = await c.req.json();
    const user = c.var.user;
    const service = getService(c);
    const assignment = await service.assignServiceProviderToOutlet(outletId, body, user.user.id);
    return c.json({ success: true, data: assignment, error: null }, 201);
  } catch (err) {
    return handleOrgError(c, err);
  }
});

orgRoutes.put('/outlet-service-provider-assignments/:id', requirePermission(PERMISSIONS.ORG_MASTERS_WRITE) as any, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const user = c.var.user;
    const service = getService(c);
    const assignment = await service.updateOutletServiceProviderAssignment(id, body, user.user.id);
    return c.json({ success: true, data: assignment, error: null });
  } catch (err) {
    return handleOrgError(c, err);
  }
});
