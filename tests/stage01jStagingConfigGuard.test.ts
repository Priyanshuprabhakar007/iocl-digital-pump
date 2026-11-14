import { describe, expect, it } from 'vitest';
import { validateStagingConfig } from '../scripts/stage01j-validate-staging';

const production = {
  name: 'iocl-digital-pump-manager',
  vars: { ENVIRONMENT: 'production', ALLOWED_ORIGINS: 'https://production.example.com' },
  d1_databases: [{ binding: 'DB', database_name: 'prod-d1', database_id: '11111111-1111-4111-8111-111111111111' }],
  r2_buckets: [{ binding: 'DOCUMENTS_BUCKET', bucket_name: 'prod-docs' }],
};
const uuid = '22222222-2222-4222-8222-222222222222';
const staging = () => ({
  name: 'iocl-digital-pump-staging',
  vars: { ENVIRONMENT: 'staging', ALLOWED_ORIGINS: 'https://staging.example.com' },
  d1_databases: [{ binding: 'DB', database_name: 'synthetic-d1-staging', database_id: uuid }],
});

describe('Stage 01J local staging isolation guard', () => {
  it('passes isolated staging configuration but cannot attest remote ownership', () => {
    expect(validateStagingConfig(production, staging(), uuid)).toEqual({ ok: true, issues: [] });
  });
  it('rejects reuse of production UUID even when expected matches', () => {
    const config = staging();
    config.d1_databases[0].database_id = production.d1_databases[0].database_id;
    expect(validateStagingConfig(production, config, production.d1_databases[0].database_id).ok).toBe(false);
  });
  it('rejects differing expected UUID', () => {
    expect(validateStagingConfig(production, staging(), '33333333-3333-4333-8333-333333333333').ok).toBe(false);
  });
  it('rejects non-staging ENVIRONMENT and worker name', () => {
    const config = { ...staging(), name: production.name, vars: production.vars };
    expect(validateStagingConfig(production, config, uuid).ok).toBe(false);
  });
  it('rejects production database name and additional bindings', () => {
    const config = staging();
    config.d1_databases[0].database_name = 'prod-d1';
    config.d1_databases.push({ binding: 'EXTRA', database_name: 'extra', database_id: uuid });
    expect(validateStagingConfig(production, config, uuid).ok).toBe(false);
  });
  it('rejects routes, R2 bindings and production origin', () => {
    const config = { ...staging(), routes: ['example.com/*'],
      r2_buckets: [{ binding: 'DOCUMENTS_BUCKET', bucket_name: 'prod-docs' }],
      vars: { ENVIRONMENT: 'staging', ALLOWED_ORIGINS: 'https://production.example.com' } };
    expect(validateStagingConfig(production, config, uuid).ok).toBe(false);
  });
  it('rejects invalid input or malformed expected UUID', () => {
    expect(validateStagingConfig(null, staging(), uuid).ok).toBe(false);
    expect(validateStagingConfig(production, staging(), 'not-a-uuid').ok).toBe(false);
  });
});
