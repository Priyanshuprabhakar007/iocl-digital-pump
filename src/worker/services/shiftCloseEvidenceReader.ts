import { sql } from 'drizzle-orm';
import type { AppDatabase } from '../../db';
import type { RecoveryShiftStatus, ShiftCloseEvidenceSnapshot } from './shiftCloseRecoveryAssessment';

/**
 * Stage 01I: read-only evidence snapshot, deliberately NOT registered as an API.
 *
 * All counts and shift status are fetched in ONE parameterized SELECT to avoid
 * merging observations captured at different times. This does not establish
 * Cloudflare hosted D1 transaction guarantees, authorisation, or audit policy.
 * A caller MUST independently enforce outlet/RBAC permissions.
 *
 * uncertainAttempt is REQUIRED from a separately verified source; absence of
 * a durable close-attempt ledger must never be silently interpreted as false.
 */
export async function readShiftCloseEvidenceSnapshot(
  db: AppDatabase,
  shiftId: string,
  uncertainAttempt: boolean,
): Promise<ShiftCloseEvidenceSnapshot | null> {
  if (typeof shiftId !== 'string' || !shiftId.trim()) {
    throw new Error('SHIFT_CLOSE_EVIDENCE_SHIFT_ID_REQUIRED');
  }
  if (typeof uncertainAttempt !== 'boolean') {
    throw new Error('SHIFT_CLOSE_EVIDENCE_ATTEMPT_VERIFICATION_REQUIRED');
  }

  const rows = await db.all<{
    status: string;
    stock_count: number;
    finance_count: number;
    close_audit_count: number;
  }>(sql`
    SELECT s.status AS status,
      (SELECT count(*) FROM shift_stock_reconciliations AS stock
        WHERE stock.operational_shift_id = s.id) AS stock_count,
      (SELECT count(*) FROM shift_financial_reconciliations AS finance
        WHERE finance.operational_shift_id = s.id) AS finance_count,
      (SELECT count(*) FROM audit_logs AS audit
        WHERE audit.entity_type = 'OPERATIONAL_SHIFT'
          AND audit.entity_id = s.id
          AND audit.action = 'SHIFT_CLOSE') AS close_audit_count
    FROM operational_shifts AS s
    WHERE s.id = ${shiftId}
    LIMIT 1
  `);

  const row = rows[0];
  if (!row) return null;

  const validStatus = ['OPEN', 'CLOSING', 'CLOSED', 'LOCKED'].includes(row.status);
  const counts = [row.stock_count, row.finance_count, row.close_audit_count];
  if (!validStatus || counts.some(n => !Number.isSafeInteger(n) || n < 0)) {
    throw new Error('SHIFT_CLOSE_EVIDENCE_CORRUPT_SNAPSHOT');
  }
  return {
    status: row.status as RecoveryShiftStatus,
    stockReconciliationCount: row.stock_count,
    financialReconciliationCount: row.finance_count,
    shiftCloseAuditCount: row.close_audit_count,
    uncertainAttempt,
  };
}
