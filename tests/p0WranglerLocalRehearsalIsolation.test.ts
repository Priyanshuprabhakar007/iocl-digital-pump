import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  EXPECTED_FULL_STAGING_UUID, PRODUCTION_UUID, STAGE01K_SCRATCH_UUID,
} from '../scripts/stage01y/offlineBaselineMigrationPreflight';

describe('P0 Wrangler local-only migration rehearsal isolation', () => {
  const configFile = 'scripts/p0/wrangler.disposable-local-d1.jsonc';
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  it('targets a deliberately fictitious D1 ID and a disposable local-only name', () => {
    expect(config.d1_databases).toHaveLength(1);
    const binding = config.d1_databases[0];
    expect(binding.binding).toBe('DB');
    expect(binding.database_name).toBe('p0-disposable-local-d1');
    expect(binding.database_id).toBe('00000000-0000-4000-8000-000000000001');
    for (const forbidden of [
      EXPECTED_FULL_STAGING_UUID, PRODUCTION_UUID, STAGE01K_SCRATCH_UUID,
    ]) expect(binding.database_id).not.toBe(forbidden);
    expect(config.name).toBe('p0-disposable-local-d1-migration-rehearsal');
    expect(config.vars.ENVIRONMENT).toBe('development');
    expect(config.r2_buckets).toBeUndefined();
    expect(path.resolve(path.dirname(configFile), config.d1_databases[0].migrations_dir))
      .toBe(path.resolve('migrations'));
  });
  it('runs Wrangler on local persistence only, with no remote or deploy command', () => {
    const workflow = fs.readFileSync('.github/workflows/p0-wrangler-local-d1-rehearsal.yml', 'utf8');
    expect(workflow).toContain('d1 migrations apply p0-disposable-local-d1');
    expect(workflow).toContain('--local');
    expect(workflow).toContain('--persist-to');
    expect(workflow).toContain('wrangler.disposable-local-d1.jsonc');
    expect(workflow).not.toMatch(/--remote|wrangler\s+deploy|\bd1\s+execute\s+.*--remote/);
    expect(workflow).toContain('permissions:\n  contents: read');
  });
});
