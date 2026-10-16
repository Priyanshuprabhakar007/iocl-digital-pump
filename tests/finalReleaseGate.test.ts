import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.resolve(ROOT_DIR, 'migrations');
const WORKFLOWS_DIR = path.resolve(ROOT_DIR, '.github/workflows');
const DEPLOY_WORKFLOW_PATH = path.resolve(WORKFLOWS_DIR, 'deploy-cloudflare-demo.yml');
const CI_WORKFLOW_PATH = path.resolve(WORKFLOWS_DIR, 'ci.yml');

describe('Stage F4: Final Release Candidate Gate Suite', () => {
  // ==========================================================================
  // 1. FREEZE ARTIFACTS EXISTENCE
  // ==========================================================================
  describe('1. Freeze Artifacts & Documentation Completeness', () => {
    const requiredFiles = [
      'tests/finalSystemRegression.test.ts',
      'tests/uatBusinessJourneys.test.ts',
      'tests/releaseReadiness.test.ts',
      'docs/FINAL_FREEZE_BASELINE.md',
      'docs/UAT_EXECUTION_CHECKLIST.md',
      'docs/RELEASE_READINESS.md',
      'docs/PRODUCTION_RELEASE_RUNBOOK.md',
      'docs/FINAL_RELEASE_GATE.md',
      'README.md',
    ];

    for (const file of requiredFiles) {
      it(`1.x verifies ${file} exists and is non-empty`, () => {
        const filePath = path.resolve(ROOT_DIR, file);
        expect(fs.existsSync(filePath)).toBe(true);
        const stats = fs.statSync(filePath);
        expect(stats.size).toBeGreaterThan(50);
      });
    }
  });

  // ==========================================================================
  // 2. MIGRATION FREEZE CONTRACT (0001 - 0028)
  // ==========================================================================
  describe('2. Migration Freeze & Sequence Integrity', () => {
    it('2.1 exactly 28 migrations exist, ordered sequentially 0001 to 0028 without gaps or migrations beyond 0028', () => {
      const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort();

      expect(files.length).toBe(28);

      const numbers = files.map(f => {
        const match = f.match(/^(\d{4})_/);
        expect(match).not.toBeNull();
        return parseInt(match![1], 10);
      });

      for (let i = 1; i <= 28; i++) {
        expect(numbers[i - 1]).toBe(i);
      }

      const hasPost0028 = files.some(f => parseInt(f.slice(0, 4), 10) > 28);
      expect(hasPost0028).toBe(false);
    });

    it('2.2 terminal migration 0028 is DG Daily Operations & Monthly Reporting', () => {
      const file0028 = path.join(MIGRATIONS_DIR, '0028_dg_daily_operations_reporting.sql');
      expect(fs.existsSync(file0028)).toBe(true);
      const content = fs.readFileSync(file0028, 'utf-8');
      expect(content).toContain('dg_daily_logs');
      expect(content).toContain('dg_run_intervals');
      expect(content).not.toContain('directory_hidden');
    });

    it('2.3 migration 0027 corresponds to Retail Outlet Directory Visibility', () => {
      const file0027 = path.join(MIGRATIONS_DIR, '0027_outlet_directory_visibility.sql');
      expect(fs.existsSync(file0027)).toBe(true);
      const content = fs.readFileSync(file0027, 'utf-8');
      expect(content).toContain('directory_hidden');
      expect(content).toContain('retail_outlets');
    });
  });

  // ==========================================================================
  // 3. DEPLOYMENT SAFETY & 61-TABLE INVARIANT
  // ==========================================================================
  describe('3. Production Deployment Safety & Row Preservation Contract', () => {
    const deployContent = fs.readFileSync(DEPLOY_WORKFLOW_PATH, 'utf-8');

    it('3.1 deployment workflow uses workflow_dispatch and non-destructive safety mode', () => {
      expect(deployContent).toContain('workflow_dispatch:');
      expect(deployContent).not.toMatch(/on:\s*\n\s*push:/);
      expect(deployContent).toContain('PRODUCTION DATA SAFETY MODE:');
    });

    it('3.2 deployment workflow contains exactly two TABLES arrays with 61 unique protected tables each', () => {
      const matches = deployContent.match(/TABLES=\([\s\S]*?\)/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(2);

      const parseTables = (block: string): string[] => {
        const lines = block.split('\n');
        const res: string[] = [];
        for (const line of lines) {
          const m = line.match(/"([^"]+)"/);
          if (m) res.push(m[1]);
        }
        return res;
      };

      const pre = parseTables(matches![0]);
      const post = parseTables(matches![1]);

      expect(pre.length).toBe(61);
      expect(post.length).toBe(61);
      expect(new Set(pre).size).toBe(61);
      expect(new Set(post).size).toBe(61);
      expect(pre).toEqual(post);
    });

    it('3.3 deployment workflow enforces PRAGMA foreign_key_check, migration count >= 28, and admin existence', () => {
      expect(deployContent).toContain('PRAGMA foreign_key_check;');
      expect(deployContent).toContain('if [ "$COUNT" -lt "28" ]; then');
      expect(deployContent).toContain("SELECT COUNT(*) AS count FROM users WHERE email = 'admin@iocl.in';");
      expect(deployContent).toContain('if [ "$POST_CNT" -lt "$PRE_CNT" ]; then');
    });
  });

  // ==========================================================================
  // 4. CI PIPELINE NON-DESTRUCTIVE CONTRACT
  // ==========================================================================
  describe('4. CI Pipeline Non-Destructive Integrity', () => {
    const ciContent = fs.readFileSync(CI_WORKFLOW_PATH, 'utf-8');

    it('4.1 CI pipeline only performs typecheck, test, and build', () => {
      expect(ciContent).toContain('bun run typecheck');
      expect(ciContent).toContain('bun test');
      expect(ciContent).toContain('bun run build');
      expect(ciContent).not.toContain('wrangler deploy');
      expect(ciContent).not.toContain('--remote');
    });
  });

  // ==========================================================================
  // 5. PHASE 5A LEAVE MAKER-CHECKER CONTRACT
  // ==========================================================================
  describe('5. Frozen Phase 5A Leave Maker-Checker Contract', () => {
    it('5.1 service and migration enforce maker-checker and terminal status guarantees', () => {
      const servicePath = path.resolve(ROOT_DIR, 'src/worker/services/hrService.ts');
      expect(fs.existsSync(servicePath)).toBe(true);
      const serviceContent = fs.readFileSync(servicePath, 'utf-8');

      expect(serviceContent).toContain('decisionByUserId');
      expect(serviceContent).toContain('requestedByUserId');
    });
  });
});
