import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assessOfflineBaselineMigrations, EXPECTED_FULL_STAGING_UUID,
  PRODUCTION_UUID, STAGE01K_SCRATCH_UUID,
} from '../scripts/stage01y/offlineBaselineMigrationPreflight';

describe('Stage 01Y — offline 0001–0035 staging preflight', () => {
  const root = process.cwd();
  it('confirms exact staging DB identity and ordered 35 baseline SQL files', () => {
    const r = assessOfflineBaselineMigrations(root);
    expect(r.valid).toBe(true);
    expect(r.databaseUuid).toBe(EXPECTED_FULL_STAGING_UUID);
    expect(r.databaseUuid).not.toBe(PRODUCTION_UUID);
    expect(r.databaseUuid).not.toBe(STAGE01K_SCRATCH_UUID);
    expect(r.migrationCount).toBe(35);
    expect(r.migrationNames[0]).toBe('0001_initial_schema.sql');
    expect(r.migrationNames[34]).toBe('0035_coco_compliance_records.sql');
    expect(r.findings).toHaveLength(35);
    expect(r.findings.every(f => /^[a-f0-9]{64}$/.test(f.sha256))).toBe(true);
  });
  it('flags known table rebuild in 0004 for human review', () => {
    const r = assessOfflineBaselineMigrations(root);
    expect(r.findings.find(f => f.name.startsWith('0004_'))?.flags)
      .toContain('TABLE_DROP');
  });
  it('fails closed if staging config is replaced with production database UUID', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage01y-'));
    try {
      const config = fs.readFileSync('scripts/stage01x/wrangler.phase1-staging.jsonc', 'utf8');
      const testConfig = path.join(tmp, 'mock.jsonc');
      fs.writeFileSync(testConfig, config.replace(EXPECTED_FULL_STAGING_UUID, PRODUCTION_UUID));
      expect(assessOfflineBaselineMigrations(root, testConfig).valid).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
