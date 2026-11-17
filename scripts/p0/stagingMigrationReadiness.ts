import { inspectHostedD1MigrationCompatibility } from '../stage01z/inspectHostedD1MigrationCompatibility';
import { assessOfflineBaselineMigrations } from '../stage01y/offlineBaselineMigrationPreflight';

export type StagingRiskDecision = {
  migration: string;
  severity: 'BLOCKER' | 'REVIEW';
  issues: string[];
  requiredChecks: string[];
};

const REQUIRED_BLOCKER_FILES = [
  '0004_phase2a_integrity.sql',
  '0007_phase2b_final_integrity.sql',
  '0011_phase2c_completion.sql',
  '0032_global_designation_and_shift_masters.sql',
] as const;

/**
 * Read-only, fail-closed migration triage. No network, SQL mutations,
 * Cloudflare tokens, Wrangler or deployment. Never represents a GO approval.
 */
export function assessP0StagingMigrationReadiness(root: string) {
  const baseline = assessOfflineBaselineMigrations(root);
  const compatibility = inspectHostedD1MigrationCompatibility(root);
  const risks = new Map<string, { severity: 'BLOCKER' | 'REVIEW'; issues: Set<string> }>();
  for (const finding of compatibility.findings) {
    const row = risks.get(finding.migration) ?? { severity: 'REVIEW' as const, issues: new Set<string>() };
    row.issues.add(finding.risk);
    if (finding.risk === 'TABLE_REBUILD_WITH_DROP' ||
        finding.risk === 'D1_FOREIGN_KEYS_OFF_IGNORED') row.severity = 'BLOCKER';
    risks.set(finding.migration, row);
  }
  const decisions: StagingRiskDecision[] = [...risks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([migration, row]) => ({
      migration,
      severity: row.severity,
      issues: [...row.issues].sort(),
      requiredChecks: row.severity === 'BLOCKER'
        ? [
            'Review exact SQL, table dependencies and foreign-key consequences',
            'Rehearse on an isolated hosted-compatible throwaway copy with backup',
            'Check row counts, foreign-key integrity and critical sample hashes before/after',
            'Document authorized rollback and reviewer sign-off',
          ]
        : ['Review existing-row modifications and compare before/after data samples'],
    }));
  const identifiedBlockers = REQUIRED_BLOCKER_FILES.every(name =>
    decisions.some(row => row.migration === name && row.severity === 'BLOCKER'));
  return {
    databaseTargetVerified: baseline.valid,
    targetDatabaseName: baseline.databaseName,
    baselineCount: baseline.migrationCount,
    baselineIdentityAndHashesVerified: baseline.valid && baseline.findings.length === 35,
    identifiedBlockers,
    pendingReviews: decisions,
    // A passing test means the dangerous operations were identified, NOT
    // that they may now execute against hosted D1.
    safeForRemoteMigration: false as const,
    authorizedToDeploy: false as const,
    decision: 'NO_GO_MANUAL_REVIEW_REQUIRED' as const,
  };
}
