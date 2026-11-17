import fs from 'node:fs';
import path from 'node:path';

export type MigrationCompatibilityFinding = {
  migration: string;
  risk: 'D1_FOREIGN_KEYS_OFF_IGNORED' | 'TABLE_REBUILD_WITH_DROP' | 'MIGRATION_UPDATES_EXISTING_ROWS';
  evidenceLines: number[];
};

/**
 * Offline fail-closed static gate for applying existing 0001–0035 to hosted D1.
 *
 * A PRAGMA foreign_keys=OFF statement cannot turn enforcement off inside D1
 * implicit migration transactions. A table rebuild with DROP TABLE may require
 * a reviewed defer_foreign_keys strategy; this does not rewrite SQL or
 * claim that defer_foreign_keys is universally sufficient.
 */
export function inspectHostedD1MigrationCompatibility(root: string): {
  safeForUnsupervisedRemoteMigration: false;
  findings: MigrationCompatibilityFinding[];
  numberOfBaselineFiles: number;
} {
  const dir = path.join(root, 'migrations');
  const names = fs.readdirSync(dir).filter(name => /^\d{4}_[\w-]+\.sql$/.test(name)).sort();
  const findings: MigrationCompatibilityFinding[] = [];
  for (const name of names) {
    const lines = fs.readFileSync(path.join(dir, name), 'utf8').split(/\r?\n/);
    const locations = (pattern: RegExp) =>
      lines.flatMap((line, index) => pattern.test(line) ? [index + 1] : []);
    const ignoringFk = locations(/^\s*PRAGMA\s+foreign_keys\s*=\s*(OFF|0)\s*;/i);
    if (ignoringFk.length) findings.push({
      migration: name, risk: 'D1_FOREIGN_KEYS_OFF_IGNORED', evidenceLines: ignoringFk,
    });
    const droppingTables = locations(/^\s*DROP\s+TABLE\b/i);
    if (droppingTables.length) findings.push({
      migration: name, risk: 'TABLE_REBUILD_WITH_DROP', evidenceLines: droppingTables,
    });
    const updating = locations(/^\s*UPDATE\s+["\x60\w]+\b/i);
    if (updating.length) findings.push({
      migration: name, risk: 'MIGRATION_UPDATES_EXISTING_ROWS', evidenceLines: updating,
    });
  }
  return {
    safeForUnsupervisedRemoteMigration: false,
    numberOfBaselineFiles: names.length,
    findings,
  };
}
