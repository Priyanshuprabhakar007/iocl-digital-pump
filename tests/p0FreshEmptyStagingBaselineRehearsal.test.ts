import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { assessP0StagingMigrationReadiness } from '../scripts/p0/stagingMigrationReadiness';

/**
 * Rehearses the real baseline SQL on a clean in-memory SQLite DB.
 * Each file executes as one transaction with foreign_keys=ON, approximating
 * an implicit transactional migration runner (NOT a hosted D1 emulator).
 * No networking, Cloudflare binding, remote writes, demo seed or deploy.
 *
 * A completed local rehearsal is NOT a hosted staging migration approval.
 */
describe('P0 empty staging schema — transactional local baseline rehearsal', () => {
  it('applies 0001–0035 in order or fails at first unsafe operation without partial file commit', () => {
    const root = process.cwd();
    const offline = assessP0StagingMigrationReadiness(root);
    expect(offline.databaseTargetVerified).toBe(true);
    expect(offline.baselineCount).toBe(35);
    expect(offline.authorizedToDeploy).toBe(false);

    const migrations = fs.readdirSync(path.join(root, 'migrations'))
      .filter(name => /^\\d{4}_[\\w-]+\\.sql$/.test(name))
      .sort();
    expect(migrations).toHaveLength(35);

    const db = new Database(':memory:');
    try {
      db.pragma('foreign_keys = ON');
      db.exec(`CREATE TABLE _d1_migrations(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      );`);
      let failure: { name: string; error: string } | null = null;
      let committed = 0;
      for (const migration of migrations) {
        const sql = fs.readFileSync(path.join(root, 'migrations', migration), 'utf8');
        const beforeTables = (db.prepare(
          "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'",
        ).get() as { n: number }).n;
        try {
          db.transaction(() => {
            db.exec(sql);
            // Keep an exact journal only for migrations committed on this copy.
            db.prepare('INSERT INTO _d1_migrations (name) VALUES (?)').run(migration);
            const fkProblems = db.pragma('foreign_key_check') as unknown[];
            if (fkProblems.length !== 0) throw new Error(
              `FOREIGN_KEY_VIOLATIONS_AFTER_${migration}: ${fkProblems.length}`,
            );
          })();
          committed += 1;
        } catch (error) {
          failure = { name: migration, error: String(error) };
          const afterTables = (db.prepare(
            "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'",
          ).get() as { n: number }).n;
          expect(afterTables).toBe(beforeTables);
          expect((db.prepare(
            'SELECT COUNT(*) AS n FROM _d1_migrations',
          ).get() as { n: number }).n).toBe(committed);
          break;
        }
      }
      const recorded = db.prepare(
        'SELECT name FROM _d1_migrations ORDER BY id',
      ).all() as Array<{ name: string }>;
      expect(recorded.map(r => r.name)).toEqual(migrations.slice(0, committed));
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(db.pragma('foreign_key_check') as unknown[]).toHaveLength(0);
      if (failure) {
        expect(committed).toBeLessThan(35);
        expect(failure.name).toBe(migrations[committed]);
        // A failure is a meaningful NO-GO finding, not a green light.
        console.log('LOCAL_TRANSACTIONAL_BASELINE_BLOCKER', failure);
      } else {
        expect(committed).toBe(35);
        const tables = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        ).all() as Array<{ name: string }>;
        expect(tables.length).toBeGreaterThan(35);
        for (const required of [
          'operational_shifts', 'tank_calibration_charts', 'tank_stock_readings',
          'nozzle_meter_readings', 'shift_financial_reconciliations',
        ]) expect(tables.map(t => t.name)).toContain(required);
        console.log('LOCAL_BASELINE_35_FILES_COMPLETED_NOT_HOSTED_D1_APPROVAL');
      }
      expect(offline.safeForRemoteMigration).toBe(false);
      expect(offline.decision).toBe('NO_GO_MANUAL_REVIEW_REQUIRED');
    } finally {
      db.close();
    }
  });
});
