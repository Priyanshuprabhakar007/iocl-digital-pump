import { Hono } from 'hono';
import { getDb } from '../../db';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { DailyOperationsTestDataResetService } from '../services/dailyOperationsTestDataResetService';

export const dailyOpsResetRoutes = new Hono<{ Bindings: EnvBindings }>();

dailyOpsResetRoutes.use('*', requireAuth as any);

function mapServiceErrorToHttp(err: unknown): {
  status: number;
  code: string;
  message: string;
} {
  const raw = err instanceof Error ? err.message : String(err);
  const colonIdx = raw.indexOf(':');
  if (colonIdx > 0) {
    const code = raw.slice(0, colonIdx).trim();
    const message = raw.slice(colonIdx + 1).trim();
    switch (code) {
      case 'VALIDATION_ERROR':
        return { status: 400, code, message };
      case 'OUTLET_NOT_FOUND':
      case 'BACKUP_NOT_FOUND':
      case 'APPROVAL_NOT_FOUND':
        return { status: 404, code, message };
      case 'NO_SHIFTS_IN_SCOPE':
      case 'OFFICIAL_DATA_BLOCKER_UNREVIEWED':
      case 'UNREVIEWED_OFFICIAL_DATA_BLOCKERS':
      case 'LOCKED_SHIFT_RESET_FORBIDDEN':
      case 'CLOSED_SHIFT_CONFIRMATION_REQUIRED':
      case 'SCOPE_DRIFT_DETECTED':
      case 'BACKUP_SCOPE_DRIFT_DETECTED':
      case 'SCOPE_MISMATCH':
      case 'BACKUP_MISMATCH':
      case 'BACKUP_INTEGRITY_FAILED':
      case 'RESET_ALREADY_EXECUTED':
      case 'RESTORE_CONFLICT':
        return { status: 409, code, message };
    }
  }
  return {
    status: 500,
    code: 'RESET_WORKFLOW_ERROR',
    message: raw || 'Unexpected error in Daily Operations Test Data Reset workflow.',
  };
}

function enforceGlobalAdmin(c: AppContext) {
  const userCtx = c.var.user;
  const check = DailyOperationsTestDataResetService.assertGlobalAdminAuthority(userCtx);
  if (!check.allowed) {
    return c.json(
      {
        success: false,
        data: null,
        error: {
          code: check.errorCode || 'FORBIDDEN',
          message:
            check.errorMessage ||
            'Access denied. Daily Operations Test Data Reset requires Global Administrator authority.',
        },
      },
      (check.errorCode === 'UNAUTHORIZED' ? 401 : 403) as any
    );
  }
  return null;
}

// 1. Dry-Run Preview (GET & POST)
dailyOpsResetRoutes.get('/admin/daily-ops-reset/preview', async (c: AppContext) => {
  const denied = enforceGlobalAdmin(c);
  if (denied) return denied;

  const outletId = c.req.query('outletId') || undefined;
  const roCode = c.req.query('roCode') || undefined;
  const fromBusinessDate = c.req.query('fromBusinessDate') || '2026-10-23';
  const toBusinessDate = c.req.query('toBusinessDate') || '2026-11-07';

  try {
    const db = getDb(c.env.DB);
    const user = c.var.user!.user;
    const preview = await DailyOperationsTestDataResetService.generateDryRunPreview(db, {
      outletId,
      roCode,
      fromBusinessDate,
      toBusinessDate,
      actor: { userId: user.id, name: user.name, email: user.email },
    });
    return c.json({ success: true, data: preview, error: null });
  } catch (err) {
    const mapped = mapServiceErrorToHttp(err);
    return c.json(
      { success: false, data: null, error: { code: mapped.code, message: mapped.message } },
      mapped.status as any
    );
  }
});

dailyOpsResetRoutes.post('/admin/daily-ops-reset/preview', async (c: AppContext) => {
  const denied = enforceGlobalAdmin(c);
  if (denied) return denied;

  const body = await c.req.json().catch(() => ({}));
  const outletId = body.outletId || undefined;
  const roCode = body.roCode || undefined;
  const fromBusinessDate = body.fromBusinessDate || '2026-10-23';
  const toBusinessDate = body.toBusinessDate || '2026-11-07';

  try {
    const db = getDb(c.env.DB);
    const user = c.var.user!.user;
    const preview = await DailyOperationsTestDataResetService.generateDryRunPreview(db, {
      outletId,
      roCode,
      fromBusinessDate,
      toBusinessDate,
      actor: { userId: user.id, name: user.name, email: user.email },
    });
    return c.json({ success: true, data: preview, error: null });
  } catch (err) {
    const mapped = mapServiceErrorToHttp(err);
    return c.json(
      { success: false, data: null, error: { code: mapped.code, message: mapped.message } },
      mapped.status as any
    );
  }
});

// 2. Authorised Owner Review of Official/Protected Data Blockers
dailyOpsResetRoutes.post('/admin/daily-ops-reset/review-blockers', async (c: AppContext) => {
  const denied = enforceGlobalAdmin(c);
  if (denied) return denied;

  const body = await c.req.json().catch(() => ({}));
  try {
    const db = getDb(c.env.DB);
    const user = c.var.user!.user;
    const result = await DailyOperationsTestDataResetService.reviewOfficialDataBlockers(db, {
      outletId: body.outletId,
      roCode: body.roCode,
      fromBusinessDate: body.fromBusinessDate || '2026-10-23',
      toBusinessDate: body.toBusinessDate || '2026-11-07',
      blockerIds: body.blockerIds || [],
      reviewNotes: body.reviewNotes || '',
      attestConfirmedUatTestData: Boolean(body.attestConfirmedUatTestData),
      actor: { userId: user.id, name: user.name, email: user.email },
      ipAddress: c.req.header('cf-connecting-ip') || null,
      userAgent: c.req.header('user-agent') || null,
    });
    return c.json({ success: true, data: result, error: null });
  } catch (err) {
    const mapped = mapServiceErrorToHttp(err);
    return c.json(
      { success: false, data: null, error: { code: mapped.code, message: mapped.message } },
      mapped.status as any
    );
  }
});

// 3. List Backups
dailyOpsResetRoutes.get('/admin/daily-ops-reset/backups', async (c: AppContext) => {
  const denied = enforceGlobalAdmin(c);
  if (denied) return denied;

  const outletId = c.req.query('outletId') || undefined;
  const db = getDb(c.env.DB);
  const backups = await DailyOperationsTestDataResetService.listBackups(db, outletId);
  return c.json({ success: true, data: backups, error: null });
});

// 4. Create Restorable Backup
dailyOpsResetRoutes.post('/admin/daily-ops-reset/backups', async (c: AppContext) => {
  const denied = enforceGlobalAdmin(c);
  if (denied) return denied;

  const body = await c.req.json().catch(() => ({}));
  try {
    const db = getDb(c.env.DB);
    const user = c.var.user!.user;
    const backup = await DailyOperationsTestDataResetService.createResetBackup(
      db,
      c.env.DOCUMENTS_BUCKET,
      {
        outletId: body.outletId,
        roCode: body.roCode,
        fromBusinessDate: body.fromBusinessDate || '2026-10-23',
        toBusinessDate: body.toBusinessDate || '2026-11-07',
        reason: body.reason || '',
        actor: { userId: user.id, name: user.name, email: user.email },
        ipAddress: c.req.header('cf-connecting-ip') || null,
        userAgent: c.req.header('user-agent') || null,
      }
    );
    return c.json({ success: true, data: backup, error: null }, 201);
  } catch (err) {
    const mapped = mapServiceErrorToHttp(err);
    return c.json(
      { success: false, data: null, error: { code: mapped.code, message: mapped.message } },
      mapped.status as any
    );
  }
});

// 5. Get Backup Payload by ID
dailyOpsResetRoutes.get('/admin/daily-ops-reset/backups/:backupId', async (c: AppContext) => {
  const denied = enforceGlobalAdmin(c);
  if (denied) return denied;

  const backupId = c.req.param('backupId') || '';
  const db = getDb(c.env.DB);
  const backup = await DailyOperationsTestDataResetService.getBackupById(
    db,
    c.env.DOCUMENTS_BUCKET,
    backupId
  );
  if (!backup) {
    return c.json(
      {
        success: false,
        data: null,
        error: { code: 'BACKUP_NOT_FOUND', message: `Backup ${backupId} not found.` },
      },
      404
    );
  }
  return c.json({ success: true, data: backup, error: null });
});

// 6. Verify Backup Integrity
dailyOpsResetRoutes.post(
  '/admin/daily-ops-reset/backups/:backupId/verify',
  async (c: AppContext) => {
    const denied = enforceGlobalAdmin(c);
    if (denied) return denied;

    const backupId = c.req.param('backupId') || '';
    const db = getDb(c.env.DB);
    const verification = await DailyOperationsTestDataResetService.verifyBackupIntegrity(
      db,
      c.env.DOCUMENTS_BUCKET,
      backupId
    );
    if (!verification.verified) {
      return c.json(
        {
          success: false,
          data: verification,
          error: {
            code: 'BACKUP_INTEGRITY_FAILED',
            message: verification.errorMessage || 'Backup integrity verification failed.',
          },
        },
        409
      );
    }
    return c.json({ success: true, data: verification, error: null });
  }
);

// 7. Separate Administrator Approval
dailyOpsResetRoutes.post('/admin/daily-ops-reset/approvals', async (c: AppContext) => {
  const denied = enforceGlobalAdmin(c);
  if (denied) return denied;

  const body = await c.req.json().catch(() => ({}));
  try {
    const db = getDb(c.env.DB);
    const user = c.var.user!.user;
    const approval = await DailyOperationsTestDataResetService.approveResetRequest(
      db,
      c.env.DOCUMENTS_BUCKET,
      {
        backupId: body.backupId || '',
        outletId: body.outletId,
        roCode: body.roCode,
        fromBusinessDate: body.fromBusinessDate || '2026-10-23',
        toBusinessDate: body.toBusinessDate || '2026-11-07',
        approvalReason: body.approvalReason || body.reason || '',
        confirmIrreversibleReset: Boolean(body.confirmIrreversibleReset),
        confirmClosedShiftReset: Boolean(
          body.confirmClosedShiftReset ?? body.confirmClosedShiftsIncluded
        ),
        confirmationPhrase: body.confirmationPhrase || '',
        actor: { userId: user.id, name: user.name, email: user.email },
        ipAddress: c.req.header('cf-connecting-ip') || null,
        userAgent: c.req.header('user-agent') || null,
      }
    );
    return c.json({ success: true, data: approval, error: null }, 201);
  } catch (err) {
    const mapped = mapServiceErrorToHttp(err);
    return c.json(
      { success: false, data: null, error: { code: mapped.code, message: mapped.message } },
      mapped.status as any
    );
  }
});

// 8. Execute Authorised Reset
dailyOpsResetRoutes.post('/admin/daily-ops-reset/execute', async (c: AppContext) => {
  const denied = enforceGlobalAdmin(c);
  if (denied) return denied;

  const body = await c.req.json().catch(() => ({}));
  try {
    const db = getDb(c.env.DB);
    const user = c.var.user!.user;
    const result = await DailyOperationsTestDataResetService.executeApprovedReset(
      c.env.DB,
      db,
      c.env.DOCUMENTS_BUCKET,
      {
        approvalId: body.approvalId || '',
        backupId: body.backupId || '',
        confirmationPhrase: body.confirmationPhrase || '',
        executionNotes: body.executionNotes || body.reason,
        simulateFailureAfterDeletesForTest: Boolean(body.simulateFailureAfterDeletesForTest),
        actor: { userId: user.id, name: user.name, email: user.email },
        ipAddress: c.req.header('cf-connecting-ip') || null,
        userAgent: c.req.header('user-agent') || null,
      }
    );
    return c.json({ success: true, data: result, error: null });
  } catch (err) {
    const mapped = mapServiceErrorToHttp(err);
    return c.json(
      { success: false, data: null, error: { code: mapped.code, message: mapped.message } },
      mapped.status as any
    );
  }
});

// 9. Authorised Restoration from Verified Backup
dailyOpsResetRoutes.post(
  '/admin/daily-ops-reset/backups/:backupId/restore',
  async (c: AppContext) => {
    const denied = enforceGlobalAdmin(c);
    if (denied) return denied;

    const backupId = c.req.param('backupId') || '';
    const body = await c.req.json().catch(() => ({}));
    try {
      const db = getDb(c.env.DB);
      const user = c.var.user!.user;
      const result = await DailyOperationsTestDataResetService.restoreFromBackup(
        c.env.DB,
        db,
        c.env.DOCUMENTS_BUCKET,
        {
          backupId,
          restoreReason: body.restoreReason || body.reason || '',
          actor: { userId: user.id, name: user.name, email: user.email },
          ipAddress: c.req.header('cf-connecting-ip') || null,
          userAgent: c.req.header('user-agent') || null,
        }
      );
      return c.json({ success: true, data: result, error: null });
    } catch (err) {
      const mapped = mapServiceErrorToHttp(err);
      return c.json(
        { success: false, data: null, error: { code: mapped.code, message: mapped.message } },
        mapped.status as any
      );
    }
  }
);

// 10. Audit History
dailyOpsResetRoutes.get('/admin/daily-ops-reset/audit-history', async (c: AppContext) => {
  const denied = enforceGlobalAdmin(c);
  if (denied) return denied;

  const outletId = c.req.query('outletId') || undefined;
  const db = getDb(c.env.DB);
  const history = await DailyOperationsTestDataResetService.listResetAuditHistory(db, outletId);
  return c.json({ success: true, data: history, error: null });
});

export default dailyOpsResetRoutes;
