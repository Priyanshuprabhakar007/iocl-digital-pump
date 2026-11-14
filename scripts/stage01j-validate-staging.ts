/**
 * Stage 01J — LOCAL/OFFLINE D1 staging configuration guard.
 *
 * Does not call Wrangler, Cloudflare, GitHub or any network service.
 * Passing is NOT proof of database ownership, emptiness or approval.
 *
 * Usage (only with a locally prepared config, not committed secrets):
 * bun scripts/stage01j-validate-staging.ts path/to/staging.jsonc EXPECTED_STAGING_UUID
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type RecordValue = Record<string, unknown>;
const isObject = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type Stage01JValidation = { ok: boolean; issues: string[] };

export function validateStagingConfig(
  production: unknown,
  staging: unknown,
  expectedStagingDatabaseId: string,
): Stage01JValidation {
  const issues: string[] = [];
  if (!isObject(production) || !isObject(staging)) {
    return { ok: false, issues: ['Both configurations must be JSON objects'] };
  }

  const expected = expectedStagingDatabaseId.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(expected)) {
    issues.push('Expected staging D1 database UUID is missing or malformed');
  }

  const prodD1 = Array.isArray(production.d1_databases) ? production.d1_databases : [];
  const stageD1 = Array.isArray(staging.d1_databases) ? staging.d1_databases : [];
  const prodBindings = prodD1.filter(isObject);
  const stageBindings = stageD1.filter(isObject);
  const productionIds = new Set(prodBindings.map(x => String(x.database_id || '').toLowerCase()));
  const productionNames = new Set(prodBindings.map(x => String(x.database_name || '')));
  const productionBucketNames = new Set(
    (Array.isArray(production.r2_buckets) ? production.r2_buckets : [])
      .filter(isObject).map(x => String(x.bucket_name || '')),
  );
  if (prodBindings.length === 0) issues.push('Production D1 reference is missing; comparison is unsafe');
  if (stageBindings.length !== 1 || stageD1.length !== 1) {
    issues.push('Staging must declare exactly one D1 database binding');
  }

  const db = stageBindings[0];
  if (db) {
    if (db.binding !== 'DB') issues.push('Staging D1 binding must be DB');
    if (typeof db.database_id !== 'string' || db.database_id.toLowerCase() !== expected) {
      issues.push('Staging D1 UUID does not match independently supplied expected UUID');
    }
    if (productionIds.has(String(db.database_id || '').toLowerCase())) {
      issues.push('Staging D1 UUID matches a production D1 UUID');
    }
    if (typeof db.database_name !== 'string' || !db.database_name.trim()) {
      issues.push('Staging D1 database name is missing');
    } else if (productionNames.has(db.database_name)) {
      issues.push('Staging D1 database name matches production');
    }
  }

  const vars = isObject(staging.vars) ? staging.vars : {};
  if (vars.ENVIRONMENT !== 'staging') issues.push('ENVIRONMENT must be staging');
  if (typeof staging.name !== 'string' || !/stag(e|ing)/i.test(staging.name)) {
    issues.push('Worker name must clearly identify staging');
  }
  if (staging.name === production.name) issues.push('Worker name matches production');
  if (staging.route !== undefined || staging.routes !== undefined) {
    issues.push('Staging routes are not permitted by this verification gate');
  }
  if (stageBindings.length > 0 && db?.preview_database_id !== undefined) {
    issues.push('Preview D1 ID is not permitted in this stage');
  }
  const buckets = Array.isArray(staging.r2_buckets) ? staging.r2_buckets : [];
  if (buckets.length > 0) {
    issues.push('R2 bindings must be excluded from this D1-only verification stage');
    if (buckets.some(x => isObject(x) && productionBucketNames.has(String(x.bucket_name || '')))) {
      issues.push('R2 binding references a production bucket');
    }
  }
  for (const key of ['kv_namespaces', 'services', 'queues', 'durable_objects', 'send_email']) {
    if (staging[key] !== undefined) issues.push(`Unexpected staging resource binding: ${key}`);
  }
  if (typeof vars.ALLOWED_ORIGINS === 'string' &&
      isObject(production.vars) && vars.ALLOWED_ORIGINS === production.vars.ALLOWED_ORIGINS) {
    issues.push('Staging ALLOWED_ORIGINS must not equal production');
  }
  return { ok: issues.length === 0, issues };
}

function main(): void {
  const [, , stagingPath, expectedId] = process.argv;
  if (!stagingPath || !expectedId) {
    process.stderr.write('Usage: bun scripts/stage01j-validate-staging.ts <local-staging-config> <expected-staging-D1-UUID>\n');
    process.exitCode = 2;
    return;
  }
  const prodPath = resolve('wrangler.jsonc');
  const stagePath = resolve(stagingPath);
  if (stagePath === prodPath) {
    process.stderr.write('FAIL: Staging config path must differ from production wrangler.jsonc\n');
    process.exitCode = 1;
    return;
  }
  try {
    const production = JSON.parse(readFileSync(prodPath, 'utf-8'));
    const staging = JSON.parse(readFileSync(stagePath, 'utf-8'));
    const result = validateStagingConfig(production, staging, expectedId);
    if (!result.ok) {
      process.stderr.write('FAIL: Staging configuration check rejected:\n');
      result.issues.forEach(x => process.stderr.write(`- ${x}\n`));
      process.exitCode = 1;
      return;
    }
    process.stdout.write('PASS: Local configuration checks only. Dashboard identity, authorization and synthetic-data verification still required. No remote operations performed.\n');
  } catch {
    process.stderr.write('FAIL: Cannot read or parse both configuration files as JSON. No remote operation performed.\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
