import { describe, expect, it } from 'vitest';
import { assessShiftCloseEvidence, type ShiftCloseEvidenceSnapshot } from '../src/worker/services/shiftCloseRecoveryAssessment';

const evidence = (changes: Partial<ShiftCloseEvidenceSnapshot> = {}): ShiftCloseEvidenceSnapshot => ({
  status: 'OPEN',
  stockReconciliationCount: 0,
  financialReconciliationCount: 0,
  shiftCloseAuditCount: 0,
  uncertainAttempt: false,
  ...changes,
});

describe('Stage 01G: pure read-only recovery assessment (not API-integrated)', () => {
  it('allows normal workflow only when OPEN has no close artifacts or uncertain attempt', () => {
    expect(assessShiftCloseEvidence(evidence())).toEqual({
      disposition: 'READY_FOR_NORMAL_WORKFLOW', holdFurtherClose: false, reasons: [],
    });
  });

  it('quarantines every CLOSING state even with no artifacts', () => {
    const result = assessShiftCloseEvidence(evidence({ status: 'CLOSING' }));
    expect(result.holdFurtherClose).toBe(true);
    expect(result.disposition).toBe('CLOSE_IN_PROGRESS_REVIEW');
  });

  it('recognizes CLOSED complete evidence but never allows reopening', () => {
    const result = assessShiftCloseEvidence(evidence({
      status: 'CLOSED', stockReconciliationCount: 3, financialReconciliationCount: 1, shiftCloseAuditCount: 1,
    }));
    expect(result.disposition).toBe('CLOSED_EVIDENCE_COMPLETE');
    expect(result.holdFurtherClose).toBe(true);
  });

  it('detects closed shift missing mandatory audit (Stage 01E E-04)', () => {
    const result = assessShiftCloseEvidence(evidence({
      status: 'CLOSED', stockReconciliationCount: 3, financialReconciliationCount: 1,
    }));
    expect(result.disposition).toBe('INTEGRITY_REVIEW_REQUIRED');
    expect(result.reasons).toContain('SHIFT_CLOSE_AUDIT_COUNT_MISMATCH');
  });

  it('detects pre-existing evidence in an OPEN shift (Stage 01E E-06)', () => {
    const result = assessShiftCloseEvidence(evidence({ stockReconciliationCount: 3 }));
    expect(result.holdFurtherClose).toBe(true);
    expect(result.reasons).toContain('OPEN_SHIFT_HAS_CLOSE_EVIDENCE');
  });

  it('treats uncertain results as review-required even when otherwise complete', () => {
    const result = assessShiftCloseEvidence(evidence({
      status: 'CLOSED', stockReconciliationCount: 2, financialReconciliationCount: 1,
      shiftCloseAuditCount: 1, uncertainAttempt: true,
    }));
    expect(result.disposition).toBe('INTEGRITY_REVIEW_REQUIRED');
  });

  it('holds LOCKED shifts and flags missing evidence', () => {
    expect(assessShiftCloseEvidence(evidence({ status: 'LOCKED' })).disposition)
      .toBe('INTEGRITY_REVIEW_REQUIRED');
  });

  it('rejects corrupt/negative/non-integer evidence counts rather than making a safety decision', () => {
    expect(() => assessShiftCloseEvidence(evidence({ stockReconciliationCount: -1 }))).toThrow();
    expect(() => assessShiftCloseEvidence(evidence({ financialReconciliationCount: 1.5 }))).toThrow();
    expect(() => assessShiftCloseEvidence(evidence({ shiftCloseAuditCount: Number.NaN }))).toThrow();
  });

  it('flags duplicate financial or audit rows as an integrity incident', () => {
    const result = assessShiftCloseEvidence(evidence({
      status: 'CLOSED', stockReconciliationCount: 3, financialReconciliationCount: 2, shiftCloseAuditCount: 2,
    }));
    expect(result.reasons).toContain('FINANCIAL_RECONCILIATION_COUNT_MISMATCH');
    expect(result.reasons).toContain('SHIFT_CLOSE_AUDIT_COUNT_MISMATCH');
  });
});
