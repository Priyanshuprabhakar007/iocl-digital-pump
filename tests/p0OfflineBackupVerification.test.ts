import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { verifyOfflineStagingBackup } from '../scripts/p0/offlineBackupVerification';
import { EXPECTED_FULL_STAGING_UUID, PRODUCTION_UUID } from '../scripts/stage01y/offlineBaselineMigrationPreflight';

describe('P0 offline backup evidence gate (synthetic SQLite only)', () => {
  it('checks checksum, SQLite integrity, foreign keys and exact table inventory; rejects tampering', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-backup-'));
    const backup = path.join(folder, 'backup.sqlite');
    try {
      const db = new Database(backup);
      db.exec(`PRAGMA foreign_keys = ON;
        CREATE TABLE outlets (id INTEGER PRIMARY KEY);
        CREATE TABLE shifts (id INTEGER PRIMARY KEY, outlet_id INTEGER NOT NULL REFERENCES outlets(id));
        INSERT INTO outlets(id) VALUES (1);
        INSERT INTO shifts(id,outlet_id) VALUES (1,1),(2,1);`);
      db.close();
      const sha = () => createHash('sha256').update(fs.readFileSync(backup)).digest('hex');
      const manifest = {
        sourceDatabaseUuid: EXPECTED_FULL_STAGING_UUID,
        sha256: sha(),
        expectedTableCounts: { outlets: 1, shifts: 2 },
      };
      const good = verifyOfflineStagingBackup(backup, manifest);
      expect(good.verified).toBe(true);
      expect(Object.values(good.checks).every(Boolean)).toBe(true);
      expect(good.reason).toContain('NOT_HOSTED_ROLLOUT_APPROVAL');

      expect(verifyOfflineStagingBackup(backup, { ...manifest, sourceDatabaseUuid: PRODUCTION_UUID }).verified).toBe(false);
      expect(verifyOfflineStagingBackup(backup, { ...manifest, expectedTableCounts: { outlets: 1, shifts: 3 } }).reason)
        .toBe('BACKUP_TABLE_COUNT_MISMATCH');
      expect(verifyOfflineStagingBackup(backup, { ...manifest, expectedTableCounts: { 'outlets;DROP_TABLE': 1 } }).reason)
        .toBe('BACKUP_TABLE_INVENTORY_INVALID');
      fs.appendFileSync(backup, 'tampered');
      expect(verifyOfflineStagingBackup(backup, manifest).reason).toBe('BACKUP_SHA256_MISMATCH');
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('refuses a missing backup and uncheckpointed sidecar evidence', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-backup-missing-'));
    const backup = path.join(folder, 'backup.sqlite');
    const evidence = {
      sourceDatabaseUuid: EXPECTED_FULL_STAGING_UUID,
      sha256: '0'.repeat(64),
      expectedTableCounts: { outlets: 0 },
    };
    try {
      expect(verifyOfflineStagingBackup(backup, evidence).reason).toBe('BACKUP_FILE_NOT_FOUND');
      fs.writeFileSync(backup, 'example');
      fs.writeFileSync(backup + '-wal', 'uncheckpointed');
      expect(verifyOfflineStagingBackup(backup, evidence).reason).toBe('BACKUP_HAS_SQLITE_SIDECAR_FILES');
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});
