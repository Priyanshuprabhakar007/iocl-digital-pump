import { Next } from 'hono';
import { AppContext } from './auth';
import { getDb } from '../../db';
import { OutletRepository } from '../repositories/outletRepository';
import { ScopeService } from '../services/scopeService';

export function requireOutletAccess(paramName = 'id', options?: { allowArchivedForAdmin?: boolean }) {
  return async (c: AppContext, next: Next) => {
    const userCtx = c.var.user;
    if (!userCtx) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      }, 401);
    }

    const paramVal = c.req.param(paramName);
    const pathParts = c.req.path.split('/').filter(Boolean);
    const pathVal = pathParts[pathParts.length - 1];
    const outletId = paramVal || (pathVal !== 'outlets' ? pathVal : undefined);

    if (!outletId) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'BAD_REQUEST', message: 'Outlet ID parameter is required' }
      }, 400);
    }

    const db = getDb(c.env.DB);
    const outletRepo = new OutletRepository(db);

    const existing = await outletRepo.findById(outletId);
    if (existing && OutletRepository.isOutletArchived(existing)) {
      if (!(options?.allowArchivedForAdmin && userCtx.isGlobalScope)) {
        return c.json({
          success: false,
          data: null,
          error: {
            code: 'OUTLET_ARCHIVED',
            message: 'Access denied. This retail outlet is archived and inactive.'
          }
        }, 403);
      }
    }

    const hasAccess = await ScopeService.canAccessOutlet(userCtx, outletId, outletRepo, options);
    if (!hasAccess) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied. You do not have organizational scope access for this retail outlet.'
        }
      }, 403);
    }

    await next();
  };
}
