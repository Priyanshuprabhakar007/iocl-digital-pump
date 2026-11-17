import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { EXPECTED_FULL_STAGING_UUID } from '../stage01y/offlineBaselineMigrationPreflight';

export type OfflineBackupEvidence = {
  /** Claimed source identity; not cryptographic proof of hosted provenance. */
  sourceDatabaseUuid: string;
  sha256: string;
  expectedTableCounts: Record<string, number>;
};

export type OfflineBackupCheck = {
  verified: boolean;
  reason: string;
  checks: { checksum: boolean; integrity: boolean; foreignKeys: boolean; tableCounts: boolean };
};

/**
 * Strictly local verification of an existing, independently supplied SQLite
 * backup copy. It never exports a hosted D1 database, runs migrations, repairs
 * data, writes to the backup or authorizes a rollout.
 *
 * IMPORTANT: a matching manifest is NOT proof that hosted D1 produced the
 * backup; independently verify origin and restore rehearsal before approval.
 */
export function verifyOfflineStagingBackup(
  backupPath: string,
  evidence: OfflineBackupEvidence,
): OfflineBackupCheck {
  const checks = { checksum: false, integrity: false, foreignKeys: false, tableCounts: false };
  const fail = (reason: string): OfflineBackupCheck => ({ verified: false, reason, checks });
  if (!evidence || evidence.sourceDatabaseUuid !== EXPECTED_FULL_STAGING_UUID ||
      !/^[a-f0-9]{64}$/.test(evidence.sha256 ?? '') ||
      !evidence.expectedTableCounts ||
      Object.keys(evidence.expectedTableCounts).length === 0) {
    return fail('BACKUP_EVIDENCE_INVALID_OR_WRONG_DATABASE');
  }
  const tableNames = Object.keys(evidence.expectedTableCounts);
  if (tableNames.some(name => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
      !Number.isSafeInteger(evidence.expectedTableCounts[name]) ||
      evidence.expectedTableCounts[name] < 0)) {
    return fail('BACKUP_TABLE_INVENTORY_INVALID');
  }
  if (!backupPath || !fs.existsSync(backupPath) || !fs.statSync(backupPath).isFile()) {
    return fail('BACKUP_FILE_NOT_FOUND');
  }
  const resolved = path.resolve(backupPath);
  // SQLite's WAL journals may contain uncheckpointed data. This verifier
  // accepts standalone backups only, not a live DB with sidecar journal files.
  if (fs.existsSync(resolved + '-wal') || fs.existsSync(resolved + '-shm')) {
    return fail('BACKUP_HAS_SQLITE_SIDECAR_FILES');
  }
  const actualSha = createHash('sha256').update(fs.readFileSync(resolved)).digest('hex');
  if (actualSha !== evidence.sha256) return fail('BACKUP_SHA256_MISMATCH');
  checks.checksum = true;
  let db: Database.Database | undefined;
  try {
    db = new Database(resolved, { readonly: true, fileMustExist: true });
    const integrity = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') {
      return fail('BACKUP_SQLITE_INTEGRITY_FAILED');
    }
    checks.integrity = true;
    const fkErrors = db.pragma('foreign_key_check') as unknown[];
    if (fkErrors.length !== 0) return fail('BACKUP_FOREIGN_KEY_VIOLATIONS');
    checks.foreignKeys = true;
    for (const table of tableNames) {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number } | undefined;
      if (row?.n !== evidence.expectedTableCounts[table]) {
        return fail('BACKUP_TABLE_COUNT_MISMATCH');
      }
    }
    checks.tableCounts = true;
    return { verified: true, reason: 'OFFLINE_COPY_ONLY_VERIFIED_NOT_HOSTED_ROLLOUT_APPROVAL', checks };
  } catch {
    return fail('BACKUP_SQLITE_READ_OR_SCHEMA_FAILED');
  } finally {
    db?.close();
  }
}
