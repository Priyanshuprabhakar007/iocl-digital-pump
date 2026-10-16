import { Hono } from 'hono';
import { getDb } from '../../db';
import { EnvBindings, requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { MonthlyOperationsReportQuerySchema } from '../../shared/validators';
import { MonthlyOperationsReportService } from '../services/monthlyOperationsReportService';
import { PERMISSIONS } from '../../shared/constants';

export const reportRoutes = new Hono<{ Bindings: EnvBindings }>();

reportRoutes.use('*', requireAuth);

// GET /api/v1/reports/monthly-operations - Get monthly operations report
reportRoutes.get('/reports/monthly-operations', requirePermission(PERMISSIONS.REPORTS_READ), async (c) => {
  const db = getDb(c.env.DB);
  const outletId = c.req.query('outletId');
  const month = c.req.query('month');

  const parseResult = MonthlyOperationsReportQuerySchema.safeParse({ outletId, month });
  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid report parameters. outletId and month (YYYY-MM) are required.',
        details: parseResult.error.format(),
      },
    }, 400);
  }

  try {
    const report = await MonthlyOperationsReportService.generateReport(db, parseResult.data.outletId, parseResult.data.month);
    return c.json({
      success: true,
      data: report,
      error: null,
    });
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'OPERATION_FAILED',
        message: err.message || 'Failed to generate monthly operations report',
      },
    }, 400);
  }
});
