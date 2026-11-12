/**
 * Stage 01G: PURE, READ-ONLY incident triage classifier.
 *
 * Not connected to API routes, not an authorization decision, and never
 * performs recovery, retries, writes or changes existing shift-close policy.
 * The caller must obtain a consistent snapshot from its own data source.
 */
export type RecoveryShiftStatus = 'OPEN' | 'CLOSING' | 'CLOSED' | 'LOCKED';
export type RecoveryDisposition =
  | 'READY_FOR_NORMAL_WORKFLOW'
  | 'CLOSE_IN_PROGRESS_REVIEW'
  | 'CLOSED_EVIDENCE_COMPLETE'
  | 'INTEGRITY_REVIEW_REQUIRED';

export interface ShiftCloseEvidenceSnapshot {
  status: RecoveryShiftStatus;
  stockReconciliationCount: number;
  financialReconciliationCount: number;
  shiftCloseAuditCount: number;
  /** True means a close attempt may have an uncertain result; false is verified absence. */
  uncertainAttempt: boolean;
}

export interface ShiftCloseRecoveryAssessment {
  disposition: RecoveryDisposition;
  /** True is an advisory HOLD: never initiate another close based on this assessment alone. */
  holdFurtherClose: boolean;
  reasons: readonly string[];
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Conservative triage policy for reviewers. Reject malformed snapshots.
 * LOCKED is handled as a terminal status: no automatic resubmission.
 */
export function assessShiftCloseEvidence(snapshot: ShiftCloseEvidenceSnapshot): ShiftCloseRecoveryAssessment {
  const { status, stockReconciliationCount: stock, financialReconciliationCount: finance,
    shiftCloseAuditCount: audit, uncertainAttempt } = snapshot;

  if (!['OPEN', 'CLOSING', 'CLOSED', 'LOCKED'].includes(status) ||
      ![stock, finance, audit].every(isNonNegativeInteger) ||
      typeof uncertainAttempt !== 'boolean') {
    throw new Error('Invalid shift-close evidence snapshot');
  }

  const complete = stock > 0 && finance === 1 && audit === 1;
  if (status === 'CLOSING') {
    return { disposition: 'CLOSE_IN_PROGRESS_REVIEW', holdFurtherClose: true,
      reasons: ['CLOSING_STATE_REQUIRES_REVIEW'] };
  }
  if (status === 'CLOSED' || status === 'LOCKED') {
    if (complete && !uncertainAttempt) {
      return { disposition: 'CLOSED_EVIDENCE_COMPLETE', holdFurtherClose: true, reasons: [] };
    }
    const reasons: string[] = [];
    if (stock === 0) reasons.push('MISSING_STOCK_RECONCILIATION');
    if (finance !== 1) reasons.push('FINANCIAL_RECONCILIATION_COUNT_MISMATCH');
    if (audit !== 1) reasons.push('SHIFT_CLOSE_AUDIT_COUNT_MISMATCH');
    if (uncertainAttempt) reasons.push('UNCERTAIN_CLOSE_ATTEMPT');
    return { disposition: 'INTEGRITY_REVIEW_REQUIRED', holdFurtherClose: true, reasons };
  }

  // OPEN with any close artifacts is not safe for automatic cleanup/resubmit.
  if (stock > 0 || finance > 0 || audit > 0 || uncertainAttempt) {
    const reasons: string[] = [];
    if (stock > 0 || finance > 0 || audit > 0) reasons.push('OPEN_SHIFT_HAS_CLOSE_EVIDENCE');
    if (uncertainAttempt) reasons.push('UNCERTAIN_CLOSE_ATTEMPT');
    return { disposition: 'INTEGRITY_REVIEW_REQUIRED', holdFurtherClose: true, reasons };
  }
  return { disposition: 'READY_FOR_NORMAL_WORKFLOW', holdFurtherClose: false, reasons: [] };
}
