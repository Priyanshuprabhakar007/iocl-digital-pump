import { describe, expect, it } from 'vitest';
import { assessP0StagingMigrationReadiness } from '../scripts/p0/stagingMigrationReadiness';

describe('P0 hosted staging release gate — read-only migration triage', () => {
  const report = assessP0StagingMigrationReadiness(process.cwd());
  it('identifies the exact isolated staging target and all 35 existing baseline migrations', () => {
    expect(report.databaseTargetVerified).toBe(true);
    expect(report.targetDatabaseName).toBe('iocl-phase1-full-staging');
    expect(report.baselineIdentityAndHashesVerified).toBe(true);
    expect(report.baselineCount).toBe(35);
  });
  it('preserves the migration NO-GO decision even when integration CI passes', () => {
    expect(report.safeForRemoteMigration).toBe(false);
    expect(report.authorizedToDeploy).toBe(false);
    expect(report.decision).toBe('NO_GO_MANUAL_REVIEW_REQUIRED');
  });
  it('flags all known table-rebuild and foreign-key compatibility blockers', () => {
    expect(report.identifiedBlockers).toBe(true);
    for (const name of [
      '0004_phase2a_integrity.sql', '0007_phase2b_final_integrity.sql',
      '0011_phase2c_completion.sql', '0032_global_designation_and_shift_masters.sql',
    ]) {
      const risk = report.pendingReviews.find(r => r.migration === name);
      expect(risk?.severity).toBe('BLOCKER');
      expect(risk?.issues.length).toBeGreaterThan(0);
      expect(risk?.requiredChecks).toContain(
        'Check row counts, foreign-key integrity and critical sample hashes before/after',
      );
    }
    expect(report.pendingReviews.find(x => x.migration === '0007_phase2b_final_integrity.sql')?.issues)
      .toContain('D1_FOREIGN_KEYS_OFF_IGNORED');
    expect(report.pendingReviews.find(x => x.migration === '0032_global_designation_and_shift_masters.sql')?.issues)
      .toContain('TABLE_REBUILD_WITH_DROP');
  });
});
