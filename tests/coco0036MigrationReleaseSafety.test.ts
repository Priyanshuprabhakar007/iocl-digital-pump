import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const configPath = 'scripts/coco36/wrangler.coco36-staging.jsonc';
const config = JSON.parse(read(configPath));

describe('COCO 0036 migration release safety - no hosted writes', () => {
  it('uses the separately verified STAGING D1 UUID and never production/scratch', () => {
    expect(config.name).toBe('iocl-coco36-staging-validation-only');
    expect(config.vars.ENVIRONMENT).toBe('staging');
    expect(config.r2_buckets).toBeUndefined();
    expect(config.d1_databases).toHaveLength(1);
    expect(config.d1_databases[0]).toMatchObject({
      binding: 'DB',
      database_name: 'iocl-phase1-full-staging',
      database_id: 'daf55190-af65-4b72-b5f6-8c87b70c4d35',
      migrations_dir: '../../docs/proposed-migrations',
    });
    expect(config.d1_databases[0].database_id).not.toBe('305f76c6-c940-443f-86a9-33c309a55578');
    expect(config.d1_databases[0].database_id).not.toBe('9025eb32-4ea8-4bb9-a6e1-ab8ba55bf782');
  });

  it('keeps the original 35 migrations completely unchanged and isolates ONLY 0036', () => {
    const original = fs.readdirSync(path.join(root, 'migrations'))
      .filter(n => n.endsWith('.sql')).sort();
    expect(original).toHaveLength(35);
    expect(original[0]).toMatch(/^0001_/);
    expect(original[34]).toMatch(/^0035_/);
    const proposedDir = path.resolve(root, 'scripts/coco36', config.d1_databases[0].migrations_dir);
    expect(proposedDir).toBe(path.join(root, 'docs/proposed-migrations'));
    const proposal = fs.readdirSync(proposedDir).filter(n=>n.endsWith('.sql')).sort();
    expect(proposal).toEqual(['0036_coco_agreements_claims_inspections.sql']);
  });

  it('only creates additive tables, indexes and validation triggers', () => {
    const sql = read('docs/proposed-migrations/0036_coco_agreements_claims_inspections.sql');
    for (const name of ['coco_agreement_details', 'coco_expense_claims',
      'coco_claim_settlements', 'coco_asset_inspections']) {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS ' + name);
    }
    expect((sql.match(/CREATE TRIGGER IF NOT EXISTS /g)||[])).toHaveLength(2);
    expect(sql).not.toMatch(/(^|\n)\s*(DROP|ALTER|DELETE|UPDATE|INSERT|REPLACE)\b/im);
    expect(sql).not.toMatch(/PRAGMA\s+foreign_keys\s*=\s*OFF/i);
    expect(sql).toContain('CLAIM_OVERPAYMENT');
    expect(sql).toContain('EQUIPMENT_OUTLET_MISMATCH');
  });
});
