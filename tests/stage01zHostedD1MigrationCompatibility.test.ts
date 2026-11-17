import { describe, expect, it } from 'vitest';
import { inspectHostedD1MigrationCompatibility } from '../scripts/stage01z/inspectHostedD1MigrationCompatibility';

const report = inspectHostedD1MigrationCompatibility(process.cwd());
describe('Stage 01Z: Cloudflare D1 baseline migration compatibility gate', () => {
  it('records all 35 existing baseline files and defaults to NO-GO', () => {
    expect(report.numberOfBaselineFiles).toBe(35);
    expect(report.safeForUnsupervisedRemoteMigration).toBe(false);
  });
  it('explicitly flags both migrations that attempt to disable foreign keys', () => {
    const flagged = report.findings.filter(f => f.risk === 'D1_FOREIGN_KEYS_OFF_IGNORED');
    expect(flagged.map(f => f.migration)).toContain('0007_phase2b_final_integrity.sql');
    expect(flagged.map(f => f.migration)).toContain('0032_global_designation_and_shift_masters.sql');
    expect(flagged.every(f => f.evidenceLines.length > 0)).toBe(true);
  });
  it('identifies dangerous schema rebuilds requiring independent review', () => {
    const dropped = report.findings.filter(f => f.risk === 'TABLE_REBUILD_WITH_DROP');
    expect(dropped.map(f => f.migration)).toContain('0004_phase2a_integrity.sql');
    expect(dropped.map(f => f.migration)).toContain('0011_phase2c_completion.sql');
    expect(dropped.map(f => f.migration)).toContain('0032_global_designation_and_shift_masters.sql');
  });
  it('flags existing-row updates separate from DDL and rejects false safety claims', () => {
    expect(report.findings.some(f => f.risk === 'MIGRATION_UPDATES_EXISTING_ROWS' &&
      f.migration === '0032_global_designation_and_shift_masters.sql')).toBe(true);
    expect(report.safeForUnsupervisedRemoteMigration).toBe(false);
  });
});
