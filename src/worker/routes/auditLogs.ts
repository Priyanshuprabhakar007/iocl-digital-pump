import { Hono } from 'hono';
import { getDb } from '../../db';
import { AuditRepository } from '../repositories/auditRepository';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../../shared/constants';

const auditLogs = new Hono<{ Bindings: EnvBindings }>();

auditLogs.use('*', requireAuth as any);

auditLogs.get('/', requirePermission(PERMISSIONS.AUDIT_READ) as any, async (c: AppContext) => {
  const db = getDb(c.env.DB);
  const repo = new AuditRepository(db);

  const limitParam = c.req.query('limit');
  const offsetParam = c.req.query('offset');
  const limit = limitParam !== undefined ? Math.min(200, Math.max(1, parseInt(limitParam, 10) || 50)) : 100;
  const offset = offsetParam !== undefined ? Math.max(0, parseInt(offsetParam, 10) || 0) : 0;

  const logs = await repo.listLogs(limit, offset);

  return c.json({
    success: true,
    data: logs,
    error: null,
  });
});

export default auditLogs;
