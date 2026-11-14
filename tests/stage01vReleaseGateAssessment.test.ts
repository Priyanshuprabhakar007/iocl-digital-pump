import { describe, expect, it } from 'vitest';
import {
  PHASE1_GATES, assessPhase1ReleaseEvidence, currentStage01VBaseline,
  type ReleaseEvidence,
} from '../src/worker/services/phase1ReleaseGateAssessment';

describe('Stage 01V: Phase 1 must fail closed unless all release gates have evidence', () => {
  it('reports NO_GO with no hosted verification or approvals', () => {
    const result = assessPhase1ReleaseEvidence(currentStage01VBaseline);
    expect(result.verdict).toBe('NO_GO');
    expect(result.blockingGates).toEqual([...PHASE1_GATES]);
  });
  it('a passing local CI alone cannot authorize release', () => {
    const result = assessPhase1ReleaseEvidence({
      STACKED_DRAFT_REVIEW_AND_MERGE_PLAN: {
        status: 'PASS', evidenceUrl: 'https://github.com/example/review', approvedBy: 'Reviewer',
      },
    });
    expect(result.readyForReleaseReview).toBe(false);
    expect(result.blockingGates).toContain('FULL_HOSTED_WORKER_D1_CLOSE_UAT');
  });
  it('a FAIL always blocks even with an evidence URL and reviewer', () => {
    const input: ReleaseEvidence = {
      FULL_HOSTED_WORKER_D1_CLOSE_UAT: {
        status: 'FAIL', evidenceUrl: 'https://example.com/test', approvedBy: 'Reviewer',
      },
    };
    expect(assessPhase1ReleaseEvidence(input).blockingGates).toContain('FULL_HOSTED_WORKER_D1_CLOSE_UAT');
  });
  it('NOT_RUN can never be treated as passed', () => {
    const input: ReleaseEvidence = {
      BACKUP_AND_RESTORE_DRILL: {
        status: 'NOT_RUN', evidenceUrl: 'https://example.com/plan', approvedBy: 'Reviewer',
      },
    };
    expect(assessPhase1ReleaseEvidence(input).blockingGates).toContain('BACKUP_AND_RESTORE_DRILL');
  });
  it('rejects PASS with missing reviewer or non-HTTPS evidence', () => {
    const input: ReleaseEvidence = {
      FINANCE_AND_AUDIT_RECONCILIATION_SIGNOFF: {
        status: 'PASS', evidenceUrl: 'http://example.com', approvedBy: 'Finance',
      },
      OPERATIONS_END_TO_END_UAT_SIGNOFF: {
        status: 'PASS', evidenceUrl: 'https://example.com/uat', approvedBy: '   ',
      },
    };
    const result = assessPhase1ReleaseEvidence(input);
    expect(result.blockingGates).toContain('FINANCE_AND_AUDIT_RECONCILIATION_SIGNOFF');
    expect(result.blockingGates).toContain('OPERATIONS_END_TO_END_UAT_SIGNOFF');
  });
  it('only all evidence-backed approvals yield ELIGIBLE, never auto-deploy', () => {
    const complete = Object.fromEntries(
      PHASE1_GATES.map(gate => [gate, {
        status: 'PASS',
        evidenceUrl: 'https://example.com/approved-evidence',
        approvedBy: 'Authorized reviewer',
      }]),
    ) as ReleaseEvidence;
    const result = assessPhase1ReleaseEvidence(complete);
    expect(result.verdict).toBe('ELIGIBLE_FOR_MANUAL_RELEASE_REVIEW');
    expect(result.readyForReleaseReview).toBe(true);
    expect(result.blockingGates).toEqual([]);
  });
});
