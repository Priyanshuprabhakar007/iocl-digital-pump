/**
 * Stage 01Q — PURE, NOT WIRED TO ROUTES.
 *
 * Conservative classification for a future request-idempotency contract.
 * A stored fingerprint must be generated using an approved canonicalization
 * and cryptographic hash; never trust an unverified client-provided hash.
 * This helper does not query a database, grant permission or retry closing.
 */
export type JournalState =
  | 'CLAIMED' | 'PREPARED' | 'COMMITTED'
  | 'VALIDATION_REJECTED' | 'REVIEW_REQUIRED';
export type ReplayDecision =
  | 'ALLOW_NEW_ATTEMPT'
  | 'RETURN_RECORDED_SUCCESS_AFTER_EVIDENCE_CHECK'
  | 'REJECT_REQUEST_KEY_CONFLICT'
  | 'HOLD_FOR_AUTHORIZED_REVIEW';

export interface ReplayAttempt {
  outletId: string;
  shiftId: string;
  requestKey: string;
  payloadFingerprint: string;
  state: JournalState;
}
export interface ReplayRequest {
  outletId: string;
  shiftId: string;
  requestKey: string;
  payloadFingerprint: string;
}
export interface ReplayAssessment {
  decision: ReplayDecision;
  reason: string;
}
const validToken = (s: unknown): s is string =>
  typeof s === 'string' && s.length > 0 && s.length <= 256 && s.trim() === s;

/**
 * The caller must first authenticate/authorize the user and atomically
 * resolve requestKey uniqueness in the authoritative outlet+shift scope.
 * ExistingAttempts is either undefined or the single authoritative attempt.
 * A COMMITTED decision is NOT a completed API response until authoritative
 * CLOSED, audit and reconciliation evidence has been checked.
 */
export function assessCloseRequestReplay(
  request: ReplayRequest,
  existingAttempt?: ReplayAttempt,
): ReplayAssessment {
  if (!validToken(request.outletId) || !validToken(request.shiftId) ||
      !validToken(request.requestKey) || !validToken(request.payloadFingerprint)) {
    return { decision: 'HOLD_FOR_AUTHORIZED_REVIEW', reason: 'INVALID_REQUEST_IDENTITY' };
  }
  if (!existingAttempt) {
    return { decision: 'ALLOW_NEW_ATTEMPT', reason: 'NO_MATCHING_ATTEMPT_FOUND' };
  }
  if (!validToken(existingAttempt.outletId) || !validToken(existingAttempt.shiftId) ||
      !validToken(existingAttempt.requestKey) ||
      !validToken(existingAttempt.payloadFingerprint) ||
      !['CLAIMED', 'PREPARED', 'COMMITTED', 'VALIDATION_REJECTED', 'REVIEW_REQUIRED'].includes(existingAttempt.state)) {
    return { decision: 'HOLD_FOR_AUTHORIZED_REVIEW', reason: 'INVALID_STORED_ATTEMPT' };
  }
  if (existingAttempt.outletId !== request.outletId || existingAttempt.shiftId !== request.shiftId) {
    return { decision: 'REJECT_REQUEST_KEY_CONFLICT', reason: 'REQUEST_SCOPE_MISMATCH' };
  }
  if (existingAttempt.requestKey !== request.requestKey ||
      existingAttempt.payloadFingerprint !== request.payloadFingerprint) {
    return { decision: 'REJECT_REQUEST_KEY_CONFLICT', reason: 'REQUEST_IDENTITY_MISMATCH' };
  }
  if (existingAttempt.state === 'COMMITTED') {
    return {
      decision: 'RETURN_RECORDED_SUCCESS_AFTER_EVIDENCE_CHECK',
      reason: 'COMMITTED_REQUIRES_PERSISTED_STATUS_AUDIT_AND_RECONCILIATION_VERIFICATION',
    };
  }
  return {
    decision: 'HOLD_FOR_AUTHORIZED_REVIEW',
    reason: existingAttempt.state === 'VALIDATION_REJECTED'
      ? 'VALIDATION_REJECTION_REQUIRES_NEW_AUTHORIZED_ATTEMPT'
      : 'EXISTING_ATTEMPT_NOT_CONFIRMED_COMMITTED',
  };
}
