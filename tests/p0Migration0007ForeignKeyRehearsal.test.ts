import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import Database from 'better-sqlite3';

/**
 * Minimal local SQLite characterization of the precise 0007 baseline SQL.
 * It demonstrates WHY a table-rebuild needs independent hosted-D1 rehearsal,
 * rather than claiming this SQLite outcome is identical to Cloudflare D1.
 *
 * Test must never connect to staging or production.
 */
describe('P0 0007 foreign-key drop rehearsal — disposable in-memory SQLite', () => {
  it('detects lost dependent shift data when FK-disable PRAGMA is ineffective inside a transaction, and rolls back', () => {
    const db = new Database(':memory:');
    try {
      db.pragma('foreign_keys = ON');
      db.exec(`
        CREATE TABLE retail_outlets(id TEXT PRIMARY KEY);
        CREATE TABLE shift_templates(id TEXT PRIMARY KEY);
        CREATE TABLE users(id TEXT PRIMARY KEY);
        CREATE TABLE operational_shifts (
          id TEXT PRIMARY KEY, outlet_id TEXT NOT NULL REFERENCES retail_outlets(id),
          shift_template_id TEXT NOT NULL REFERENCES shift_templates(id),
          business_date TEXT NOT NULL, started_at TEXT NOT NULL, closed_at TEXT,
          status TEXT NOT NULL, opened_by_user_id TEXT NOT NULL REFERENCES users(id),
          closed_by_user_id TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE shift_child (
          id TEXT PRIMARY KEY,
          operational_shift_id TEXT NOT NULL REFERENCES operational_shifts(id) ON DELETE CASCADE
        );
        INSERT INTO retail_outlets VALUES ('outlet1');
        INSERT INTO shift_templates VALUES ('template1');
        INSERT INTO users VALUES ('user1');
        INSERT INTO operational_shifts VALUES (
          'shift1','outlet1','template1','2026-11-16','2026-11-16T08:00:00Z',
          NULL,'OPEN','user1',NULL,NULL,'2026-11-16T08:00:00Z','2026-11-16T08:00:00Z'
        );
        INSERT INTO shift_child VALUES ('child1','shift1');
      `);
      const originalParentCount = (db.prepare('SELECT COUNT(*) AS n FROM operational_shifts').get() as { n: number }).n;
      const originalChildCount = (db.prepare('SELECT COUNT(*) AS n FROM shift_child').get() as { n: number }).n;
      expect(originalParentCount).toBe(1);
      expect(originalChildCount).toBe(1);

      // Simulates a provider applying migration statements inside a single
      // implicit transaction. SQLite ignores PRAGMA foreign_keys=OFF in it.
      const sql = fs.readFileSync('migrations/0007_phase2b_final_integrity.sql', 'utf8');
      let observedChildLoss = false;
      expect(() => db.transaction(() => {
        db.exec(sql);
        const childrenAfter = (db.prepare('SELECT COUNT(*) AS n FROM shift_child').get() as { n: number }).n;
        observedChildLoss = childrenAfter !== originalChildCount;
        // Stop the rehearsal rather than calling a successful DDL run safe.
        if (observedChildLoss) throw new Error('REHEARSAL_DATA_LOSS_BLOCKER');
      })()).toThrow('REHEARSAL_DATA_LOSS_BLOCKER');
      expect(observedChildLoss).toBe(true);
      // One failed atomic rehearsal transaction must not damage its own
      // baseline fixture. Never run blind "undo" SQL against hosted D1.
      expect((db.prepare('SELECT COUNT(*) AS n FROM operational_shifts').get() as { n: number }).n)
        .toBe(originalParentCount);
      expect((db.prepare('SELECT COUNT(*) AS n FROM shift_child').get() as { n: number }).n)
        .toBe(originalChildCount);
      expect((db.pragma('foreign_key_check') as unknown[]).length).toBe(0);
    } finally {
      db.close();
    }
  });
});
