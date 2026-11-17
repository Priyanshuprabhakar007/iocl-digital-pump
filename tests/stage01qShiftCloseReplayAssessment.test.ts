import { describe, expect, it } from 'vitest';
import { assessCloseRequestReplay, type ReplayAttempt, type ReplayRequest } from '../src/worker/services/shiftCloseReplayAssessment';

const req: ReplayRequest = {
  outletId: 'synthetic-outlet', shiftId: 'synthetic-shift',
  requestKey: 'synthetic-key-1', payloadFingerprint: 'server-verified-fingerprint',
};
const attempt = (state: ReplayAttempt['state']): ReplayAttempt => ({ ...req, state });

describe('Stage 01Q: read-only replay contract (not wired into backend)', () => {
  it('allows new request identity only when no existing attempt is supplied', () => {
    expect(assessCloseRequestReplay(req).decision).toBe('ALLOW_NEW_ATTEMPT');
  });
  it('never blindly retries a claimed attempt', () => {
    expect(assessCloseRequestReplay(req, attempt('CLAIMED')).decision).toBe('HOLD_FOR_AUTHORIZED_REVIEW');
  });
  it('does not retry after stock/finance PREPARED', () => {
    expect(assessCloseRequestReplay(req, attempt('PREPARED')).decision).toBe('HOLD_FOR_AUTHORIZED_REVIEW');
  });
  it('requires independent evidence check for committed replay', () => {
    expect(assessCloseRequestReplay(req, attempt('COMMITTED')).decision)
      .toBe('RETURN_RECORDED_SUCCESS_AFTER_EVIDENCE_CHECK');
  });
  it('rejects same key with a different payload', () => {
    expect(assessCloseRequestReplay({ ...req, payloadFingerprint: 'different' }, attempt('COMMITTED')).decision)
      .toBe('REJECT_REQUEST_KEY_CONFLICT');
  });
  it('rejects different request key when a shift attempt exists', () => {
    expect(assessCloseRequestReplay({ ...req, requestKey: 'another-key' }, attempt('PREPARED')).decision)
      .toBe('REJECT_REQUEST_KEY_CONFLICT');
  });
  it('rejects cross-outlet or cross-shift replay', () => {
    expect(assessCloseRequestReplay({ ...req, outletId: 'other' }, attempt('COMMITTED')).reason)
      .toBe('REQUEST_SCOPE_MISMATCH');
    expect(assessCloseRequestReplay({ ...req, shiftId: 'other' }, attempt('COMMITTED')).reason)
      .toBe('REQUEST_SCOPE_MISMATCH');
  });
  it('requires review for prior validation-rejected and review-required states', () => {
    expect(assessCloseRequestReplay(req, attempt('VALIDATION_REJECTED')).decision)
      .toBe('HOLD_FOR_AUTHORIZED_REVIEW');
    expect(assessCloseRequestReplay(req, attempt('REVIEW_REQUIRED')).decision)
      .toBe('HOLD_FOR_AUTHORIZED_REVIEW');
  });
  it('rejects malformed request and malformed stored journal state', () => {
    expect(assessCloseRequestReplay({ ...req, requestKey: '' }).reason).toBe('INVALID_REQUEST_IDENTITY');
    expect(assessCloseRequestReplay(req, { ...attempt('COMMITTED'), state: 'BROKEN' as ReplayAttempt['state'] }).reason)
      .toBe('INVALID_STORED_ATTEMPT');
  });
});
