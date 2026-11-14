import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const EXPECTED_STAGING_ACCOUNT_ID = '93888554ef9d9e0b8c18b322683a9652';
export const EXPECTED_FULL_STAGING_UUID = 'daf55190-af65-4b72-b5f6-8c87b70c4d35';
export const PRODUCTION_UUID = '305f76c6-c940-443f-86a9-33c309a55578';
export const STAGE01K_SCRATCH_UUID = '9025eb32-4ea8-4bb9-a6e1-ab8ba55bf782';

export type MigrationRisk = {
  name: string;
  sha256: string;
  bytes: number;
  flags: string[];
};
export type OfflineMigrationPreflight = {
  valid: boolean;
  reason?: string;
  databaseName: string;
  databaseUuid: string;
  migrationCount: number;
  migrationNames: string[];
  findings: MigrationRisk[];
};

/**
 * Offline inventory only. Regex flags are a human review queue, NOT a SQL parser
 * or evidence that any listed migration is safe to execute.
 * NEVER runs Wrangler, SQL, API requests, migrations, or deployment.
 */
export function assessOfflineBaselineMigrations(
  projectRoot: string,
  configRelativePath = 'scripts/stage01x/wrangler.phase1-staging.jsonc',
): OfflineMigrationPreflight {
  const configPath = path.resolve(projectRoot, configRelativePath);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const binding = config.d1_databases?.[0];
  const uuid = binding?.database_id;
  const databaseName = binding?.database_name ?? '';
  const migrationsPath = path.resolve(path.dirname(configPath), binding?.migrations_dir ?? '');
  const expectedMigrationsPath = path.resolve(projectRoot, 'migrations');
  const failure = (reason: string): OfflineMigrationPreflight => ({
    valid: false, reason, databaseName, databaseUuid: uuid ?? '',
    migrationCount: 0, migrationNames: [], findings: [],
  });
  if (config.d1_databases?.length !== 1 || binding.binding !== 'DB' ||
      uuid !== EXPECTED_FULL_STAGING_UUID || uuid === PRODUCTION_UUID ||
      uuid === STAGE01K_SCRATCH_UUID || databaseName !== 'iocl-phase1-full-staging' ||
      config.vars?.ENVIRONMENT !== 'staging' || config.r2_buckets ||
      migrationsPath !== expectedMigrationsPath) {
    return failure('Staging database binding or local migration path mismatch');
  }
  const migrations = fs.readdirSync(migrationsPath)
    .filter(name => name.endsWith('.sql'))
    .sort();
  const numbers = migrations.map(name => Number(name.slice(0, 4)));
  if (migrations.length !== 35 ||
      numbers.some((n, index) => !Number.isInteger(n) || n !== index + 1) ||
      migrations.some(name => !/^\d{4}_[\w-]+\.sql$/.test(name))) {
    return failure('Expected exactly baseline 0001–0035 with sequential file names');
  }
  const findings = migrations.map(name => {
    const body = fs.readFileSync(path.join(migrationsPath, name), 'utf8');
    const checks: Array<[string, RegExp]> = [
      ['TABLE_DROP', /\bDROP\s+TABLE\b/i],
      ['TABLE_ALTER', /\bALTER\s+TABLE\b/i],
      ['DATA_UPDATE', /\bUPDATE\s+[\w\"\x60]+\s+SET\b/i],
      ['DATA_DELETE', /\bDELETE\s+FROM\b/i],
      ['PRAGMA', /\bPRAGMA\b/i],
      ['TRIGGER', /\bCREATE\s+TRIGGER\b/i],
      ['TRANSACTION', /\bBEGIN\s+TRANSACTION\b|\bCOMMIT\s*;/i],
    ];
    return {
      name,
      bytes: Buffer.byteLength(body, 'utf8'),
      sha256: createHash('sha256').update(body, 'utf8').digest('hex'),
      flags: checks.filter(([, regex]) => regex.test(body)).map(([flag]) => flag),
    };
  });
  return {
    valid: true, databaseName, databaseUuid: uuid,
    migrationCount: migrations.length,
    migrationNames: migrations, findings,
  };
}
