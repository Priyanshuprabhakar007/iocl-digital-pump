import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const stagingPath = path.resolve('scripts/stage01x/wrangler.phase1-staging.jsonc');
const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
const production = JSON.parse(fs.readFileSync('wrangler.jsonc', 'utf8'));

describe('Stage 01X — verified full-staging-only D1 config', () => {
  it('uses the independently verified new full staging D1 ID, never production or Stage 01K', () => {
    expect(staging.d1_databases).toHaveLength(1);
    expect(staging.d1_databases[0]).toMatchObject({
      binding: 'DB',
      database_name: 'iocl-phase1-full-staging',
      database_id: 'daf55190-af65-4b72-b5f6-8c87b70c4d35',
    });
    expect(staging.d1_databases[0].database_id).not.toBe(production.d1_databases[0].database_id);
    expect(staging.d1_databases[0].database_id).not.toBe('9025eb32-4ea8-4bb9-a6e1-ab8ba55bf782');
  });

  it('uses its own nonproduction worker name, environment, and no production R2 binding', () => {
    expect(staging.name).toBe('iocl-phase1-full-staging-worker');
    expect(staging.name).not.toBe(production.name);
    expect(staging.vars.ENVIRONMENT).toBe('staging');
    expect(staging.vars.ENVIRONMENT).not.toBe(production.vars.ENVIRONMENT);
    expect(staging.vars.ALLOWED_ORIGINS).toBe('https://staging.invalid');
    expect(staging.r2_buckets).toBeUndefined();
  });

  it('resolves source entry and migrations directory to the existing repository paths', () => {
    const base = path.dirname(stagingPath);
    expect(path.resolve(base, staging.main)).toBe(path.resolve('src/worker/index.ts'));
    expect(path.resolve(base, staging.d1_databases[0].migrations_dir)).toBe(path.resolve('migrations'));
  });

  it('does not modify the original production configuration or migration files', () => {
    expect(production.d1_databases[0].database_name).toBe('iocl-pump-manager-d1');
    expect(production.d1_databases[0].database_id).toBe('305f76c6-c940-443f-86a9-33c309a55578');
    expect(staging.d1_databases[0].migrations_dir).not.toContain('production');
  });
});
