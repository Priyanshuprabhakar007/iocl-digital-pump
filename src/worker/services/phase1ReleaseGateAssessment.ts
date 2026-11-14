/**
 * Stage 01V — fail-closed Phase 1 release readiness assessment.
 * Offline, pure and informational. NEVER deploys or grants approval.
 *
 * All evidence is to be independently verified; CI alone is insufficient.
 * An approved release requires explicit operational ownership and change control.
 */
export const PHASE1_GATES = [
  'STACKED_DRAFT_REVIEW_AND_MERGE_PLAN',
  'SOURCE_VERSION_FENCE_ENFORCED_IN_ATOMIC_DB_BATCH',
  'COMPLETE_SOURCE_DOMAIN_INVENTORY',
  'APPROVED_D1_MIGRATION_AND_ROLLBACK_PLAN',
  'ISOLATED_HOSTED_D1_IDENTITY_VERIFIED',
  'FULL_HOSTED_WORKER_D1_CLOSE_UAT',
  'MULTI_WORKER_CONCURRENCY_AND_NETWORK_TIMEOUT_UAT',
  'DURABLE_JOURNAL_AND_IDEMPOTENCY_INTEGRATED',
  'ADMIN_EMPTY_AUDIT_ATOMICITY_VERIFIED_ON_HOSTED_D1',
  'AUTHORIZATION_AND_RBAC_SECURITY_UAT',
  'FINANCE_AND_AUDIT_RECONCILIATION_SIGNOFF',
  'OPERATIONS_END_TO_END_UAT_SIGNOFF',
  'BACKUP_AND_RESTORE_DRILL',
  'CHANGE_OWNER_PRODUCTION_RELEASE_APPROVAL',
] as const;

export type Phase1Gate = (typeof PHASE1_GATES)[number];
export type GateStatus = 'PASS' | 'FAIL' | 'NOT_RUN';
export type GateRecord = {
  status: GateStatus;
  evidenceUrl: string | null;
  approvedBy: string | null;
};
export type ReleaseEvidence = Partial<Record<Phase1Gate, GateRecord>>;
export type ReleaseDecision = {
  readyForReleaseReview: boolean;
  verdict: 'NO_GO' | 'ELIGIBLE_FOR_MANUAL_RELEASE_REVIEW';
  blockingGates: Phase1Gate[];
};

const validEvidence = (record: GateRecord | undefined): boolean =>
  record?.status === 'PASS' &&
  typeof record.evidenceUrl === 'string' &&
  /^https:\/\//.test(record.evidenceUrl) &&
  !/\s/.test(record.evidenceUrl) &&
  typeof record.approvedBy === 'string' &&
  record.approvedBy.trim().length > 0;

/** PASS must have an HTTPS evidence link and named approving reviewer. */
export function assessPhase1ReleaseEvidence(evidence: ReleaseEvidence): ReleaseDecision {
  const blockingGates = PHASE1_GATES.filter(key => !validEvidence(evidence[key]));
  return {
    readyForReleaseReview: blockingGates.length === 0,
    verdict: blockingGates.length === 0 ? 'ELIGIBLE_FOR_MANUAL_RELEASE_REVIEW' : 'NO_GO',
    blockingGates,
  };
}

/** Real status as of Stage 01U: local CI passed but unverified release gates. */
export const currentStage01VBaseline: ReleaseEvidence = {};
