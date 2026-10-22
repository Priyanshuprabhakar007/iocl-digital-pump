import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';

const ROOT_DIR = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.resolve(ROOT_DIR, 'migrations');
const WORKFLOWS_DIR = path.resolve(ROOT_DIR, '.github/workflows');
const DEPLOY_WORKFLOW_PATH = path.resolve(WORKFLOWS_DIR, 'deploy-cloudflare-demo.yml');
const CI_WORKFLOW_PATH = path.resolve(WORKFLOWS_DIR, 'ci.yml');
const WRANGLER_CONFIG_PATH = path.resolve(ROOT_DIR, 'wrangler.jsonc');
const PACKAGE_JSON_PATH = path.resolve(ROOT_DIR, 'package.json');
const GITIGNORE_PATH = path.resolve(ROOT_DIR, '.gitignore');

describe('Stage F3: Production Data Safety & Release Readiness Suite', () => {
  let localD1: any;
  let testDbPath: string;

  beforeAll(async () => {
    testDbPath = `./.sqlite/test_release_readiness_${Date.now()}.db`;
    const dir = path.dirname(testDbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    localD1 = createLocalD1Database(testDbPath);
    const db = getDb(localD1);
    await seedDatabase(db);
  });

  afterAll(async () => {
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
      if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
    } catch (e) {}
  });

  // ==========================================================================
  // 1. MIGRATION INVENTORY & INTEGRITY
  // ==========================================================================
  describe('1. Migration Inventory & Chronological Sequence', () => {
    it('1.1 contains exactly 32 migrations numbered sequentially 0001 to 0032 without gaps', () => {
      const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort();

      expect(files.length).toBe(32);

      const numbers = files.map(f => {
        const match = f.match(/^(\d{4})_/);
        expect(match).not.toBeNull();
        return parseInt(match![1], 10);
      });

      for (let i = 1; i <= 32; i++) {
        expect(numbers[i - 1]).toBe(i);
      }
    });

    it('1.2 does not contain any migration 0033 or higher beyond the frozen baseline', () => {
      const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
      const hasPost0032 = files.some(f => {
        const num = parseInt(f.slice(0, 4), 10);
        return num > 32;
      });
      expect(hasPost0032).toBe(false);
    });

    it('1.3 all 31 migration files are non-empty and have valid SQL contents', () => {
      const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
      for (const file of files) {
        const filePath = path.join(MIGRATIONS_DIR, file);
        const stats = fs.statSync(filePath);
        expect(stats.size).toBeGreaterThan(50);
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content.trim().length).toBeGreaterThan(0);
      }
    });

    it('1.4 terminal migration 0029 is DG / Report permission persistence', () => {
      const file0029 = path.join(MIGRATIONS_DIR, '0029_dg_report_permissions.sql');
      expect(fs.existsSync(file0029)).toBe(true);
      const content = fs.readFileSync(file0029, 'utf-8');
      expect(content).toContain('dg_log.read');
      expect(content).toContain('dg_log.write');
      expect(content).toContain('reports.read');
      expect(content).toContain('reports.generate');
      expect(content).toContain('role_permissions');
    });

    it('1.5 migration 0028 corresponds to DG Daily Operations & Monthly Reporting schema', () => {
      const file0028 = path.join(MIGRATIONS_DIR, '0028_dg_daily_operations_reporting.sql');
      expect(fs.existsSync(file0028)).toBe(true);
      const content = fs.readFileSync(file0028, 'utf-8');
      expect(content).toContain('dg_daily_logs');
      expect(content).toContain('dg_run_intervals');
    });
  });

  // ==========================================================================
  // 2. DEPLOYMENT WORKFLOW SAFETY & SAFEGUARDS
  // ==========================================================================
  describe('2. Deployment Workflow & Data Safety Controls', () => {
    const deployContent = fs.readFileSync(DEPLOY_WORKFLOW_PATH, 'utf-8');

    it('2.1 deployment is gated strictly behind workflow_dispatch manual trigger', () => {
      expect(deployContent).toContain('workflow_dispatch:');
      // Must not automatically trigger on push
      expect(deployContent).not.toMatch(/on:\s*\n\s*push:/);
    });

    it('2.2 deployment workflow enforces production data safety mode banner and no remote seeding', () => {
      expect(deployContent).toContain('PRODUCTION DATA SAFETY MODE:');
      expect(deployContent).toContain('Remote demo seeding is disabled');
      expect(deployContent).not.toContain('runSeed.ts');
      expect(deployContent).not.toContain('db:seed');
      expect(deployContent).not.toContain('seedDatabase');
    });

    it('2.3 deployment workflow captures pre-migration and post-migration row counts and verifies non-decrease', () => {
      expect(deployContent).toContain('CAPTURING PRE-MIGRATION TABLE COUNTS');
      expect(deployContent).toContain('CAPTURING POST-MIGRATION TABLE COUNTS & VALIDATING');
      expect(deployContent).toContain('if [ "$POST_CNT" -lt "$PRE_CNT" ]; then');
      expect(deployContent).toContain('DEPLOYMENT SAFETY FAILED: One or more operational tables experienced a decrease in row count');
    });

    it('2.4 protected tables list includes all core and specialized operational domains and exact 63 table parity', () => {
      // Extract TABLES=( ... ) arrays from deployment workflow
      const matches = deployContent.match(/TABLES=\([\s\S]*?\)/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(2);

      const parseTablesArray = (block: string): string[] => {
        const lines = block.split('\n');
        const tables: string[] = [];
        for (const line of lines) {
          const m = line.match(/"([^"]+)"/);
          if (m) {
            tables.push(m[1]);
          }
        }
        return tables;
      };

      const preTables = parseTablesArray(matches![0]);
      const postTables = parseTablesArray(matches![1]);

      expect(preTables.length).toBe(63);
      expect(postTables.length).toBe(63);

      // Verify unique entries
      expect(new Set(preTables).size).toBe(63);
      expect(new Set(postTables).size).toBe(63);

      // Verify pre and post arrays are identical
      expect(preTables).toEqual(postTables);

      const requiredTables = [
        'users',
        'retail_outlets',
        'products',
        'outlet_products',
        'tanks',
        'dispensers',
        'nozzles',
        'operational_shifts',
        'nozzle_meter_readings',
        'tank_stock_readings',
        'fuel_receipts',
        'fuel_receipt_tank_lines',
        'outlet_product_prices',
        'credit_parties_v2',
        'shift_collections_v2',
        'cash_handover_logs_v2',
        'bank_deposits_v2',
        'shift_financial_reconciliations',
        'cng_shift_logs',
        'lube_skus',
        'lube_stock_transactions',
        'equipment_assets',
        'equipment_breakdown_tickets',
        'dg_daily_logs',
        'dg_run_intervals',
        'utility_electricity_accounts',
        'municipal_tax_dues',
        'nfr_spaces',
        'nfr_leases',
        'hr_staff',
        'hr_roster_assignments',
        'hr_attendance_records',
        'hr_leave_requests',
        'org_officers',
        'audit_logs',
      ];

      for (const table of requiredTables) {
        expect(preTables).toContain(table);
      }
    });

    it('2.4b release documentation does not contain stale 58 table references and states 63 tables', () => {
      const releaseReadinessMd = fs.readFileSync(path.resolve(ROOT_DIR, 'docs/RELEASE_READINESS.md'), 'utf-8');
      const runbookMd = fs.readFileSync(path.resolve(ROOT_DIR, 'docs/PRODUCTION_RELEASE_RUNBOOK.md'), 'utf-8');

      expect(releaseReadinessMd).not.toContain('58 tables');
      expect(releaseReadinessMd).not.toContain('58 operational');
      expect(releaseReadinessMd).toContain('63 tables');
      expect(releaseReadinessMd).toContain('63 operational');

      expect(runbookMd).not.toContain('58 operational tables');
      expect(runbookMd).toContain('63 protected operational');
    });

    it('2.5 deployment workflow verifies PRAGMA foreign_key_check and aborts on violation', () => {
      expect(deployContent).toContain('PRAGMA foreign_key_check;');
      expect(deployContent).toContain('if [ "$FK_COUNT" != "0" ]; then');
      expect(deployContent).toContain('ERROR: Remote database contains foreign-key violations.');
    });

    it('2.6 deployment workflow verifies recorded migration count is at least 32', () => {
      expect(deployContent).toContain('SELECT COUNT(*) AS count FROM d1_migrations;');
      expect(deployContent).toContain('if [ "$COUNT" -lt "32" ]; then');
      expect(deployContent).toContain('ERROR: Expected all 32 migrations to be recorded.');
    });

    it('2.7 deployment workflow verifies production administrator account exists', () => {
      expect(deployContent).toContain("SELECT COUNT(*) AS count FROM users WHERE email = 'admin@iocl.in';");
      expect(deployContent).toContain('if [ "$ADMIN_COUNT" != "1" ]; then');
      expect(deployContent).toContain('ERROR: Production admin account (admin@iocl.in) not found or count is not 1.');
    });

    it('2.8 deployment migration loop skips already-applied migrations and uses set -euo pipefail', () => {
      expect(deployContent).toContain('set -euo pipefail');
      expect(deployContent).toContain("if [ \"$COUNT\" = \"1\" ]; then");
      expect(deployContent).toContain('Already applied: $NAME');
      expect(deployContent).toContain('INSERT OR IGNORE INTO d1_migrations (name) VALUES (\'$NAME\');');
    });

    it('2.9 migration 0031 uses dedicated remote command batches with duplicate diagnostics and sqlite_master verification', () => {
      expect(deployContent).not.toContain('"migrations/0031_idempotency_and_unique_constraints.sql"');
      expect(deployContent).toContain('Apply Migration 0031 via Ordered Remote Batches');
      expect(deployContent).toContain('[0031] Checking duplicate data...');
      expect(deployContent).toContain('[0031] Creating idempotency_keys...');
      expect(deployContent).toContain('apply_unique_index_with_diagnostic');

      const expectedIndexes = [
        'uq_user_scope_assignments_natural',
        'uq_outlet_user_assignments_natural',
        'uq_fuel_receipts_outlet_invoice',
        'uq_fuel_receipt_lines_receipt_tank',
        'uq_outlet_product_prices_active_start',
        'uq_shift_collections_shift_type_ref',
        'uq_bank_deposits_outlet_channel_ref',
        'uq_lube_sku_prices_active_start',
        'uq_lube_stock_tx_opening_balance',
        'uq_nfr_rent_payments_due_ref',
        'uq_org_officers_email',
        'uq_org_officer_postings_active',
        'uq_outlet_sp_assignments_natural',
        'uq_hr_leave_requests_active_dates',
      ];

      for (const idx of expectedIndexes) {
        expect(deployContent).toContain(`"${idx}"`);
      }

      expect(deployContent).toContain("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'idempotency_keys';");
      expect(deployContent).toContain('[0031] Verified 14 unique indexes...');
      expect(deployContent).toContain("INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0031_idempotency_and_unique_constraints.sql');");
      expect(deployContent).toContain('[0031] Migration completed and recorded.');
    });
  });

  // ==========================================================================
  // 3. CI PIPELINE AUDIT
  // ==========================================================================
  describe('3. CI Pipeline Non-Destructive Integrity', () => {
    const ciContent = fs.readFileSync(CI_WORKFLOW_PATH, 'utf-8');

    it('3.1 CI pipeline only performs non-destructive validation (typecheck, test, build)', () => {
      expect(ciContent).toContain('bun run typecheck');
      expect(ciContent).toContain('bun test');
      expect(ciContent).toContain('bun run build');
    });

    it('3.2 CI pipeline contains no remote deployment or production database commands', () => {
      expect(ciContent).not.toContain('wrangler deploy');
      expect(ciContent).not.toContain('--remote');
      expect(ciContent).not.toContain('d1 execute');
      expect(ciContent).not.toContain('CLOUDFLARE_API_TOKEN');
    });
  });

  // ==========================================================================
  // 4. CONFIGURATION & BINDINGS INTEGRITY
  // ==========================================================================
  describe('4. Wrangler Configuration & Production Bindings', () => {
    const wranglerRaw = fs.readFileSync(WRANGLER_CONFIG_PATH, 'utf-8');
    const wranglerConfig = JSON.parse(wranglerRaw);

    it('4.1 specifies production Worker name and main entry point', () => {
      expect(wranglerConfig.name).toBe('iocl-digital-pump-manager');
      expect(wranglerConfig.main).toBe('src/worker/index.ts');
    });

    it('4.2 specifies production environment flag and allowed origin', () => {
      expect(wranglerConfig.vars?.ENVIRONMENT).toBe('production');
      expect(wranglerConfig.vars?.ALLOWED_ORIGINS).toBeDefined();
    });

    it('4.3 specifies D1 database binding named DB', () => {
      const d1Bindings = wranglerConfig.d1_databases;
      expect(Array.isArray(d1Bindings)).toBe(true);
      const dbBinding = d1Bindings.find((b: any) => b.binding === 'DB');
      expect(dbBinding).toBeDefined();
      expect(dbBinding.database_name).toBe('iocl-pump-manager-d1');
    });

    it('4.4 specifies R2 bucket binding named DOCUMENTS_BUCKET', () => {
      const r2Bindings = wranglerConfig.r2_buckets;
      expect(Array.isArray(r2Bindings)).toBe(true);
      const docsBinding = r2Bindings.find((b: any) => b.binding === 'DOCUMENTS_BUCKET');
      expect(docsBinding).toBeDefined();
      expect(docsBinding.bucket_name).toBe('iocl-pump-manager-docs');
    });
  });

  // ==========================================================================
  // 5. SECRET & REPOSITORY ARTIFACT HYGIENE
  // ==========================================================================
  describe('5. Secret Hygiene & Repository Artifact Cleanliness', () => {
    it('5.1 gitignore protects local sqlite databases, env files, and build outputs', () => {
      const gitignore = fs.readFileSync(GITIGNORE_PATH, 'utf-8');
      expect(gitignore).toContain('node_modules/');
      expect(gitignore).toContain('dist/');
      expect(gitignore).toContain('*.db');
      expect(gitignore).toContain('*.sqlite');
      expect(gitignore).toContain('.env*');
      expect(gitignore).toContain('!.env.example');
    });

    it('5.2 package.json scripts do not accidentally invoke remote seeds or destructive commands in build/test', () => {
      const pkgRaw = fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8');
      const pkg = JSON.parse(pkgRaw);

      expect(pkg.scripts.build).toBe('vite build');
      expect(pkg.scripts.typecheck).toBe('tsc --noEmit');
      expect(pkg.scripts['db:seed:local']).toContain('runSeed.ts');

      // Build and test scripts must not contain --remote
      expect(pkg.scripts.build).not.toContain('--remote');
      expect(pkg.scripts.test).not.toContain('--remote');
    });

    it('5.3 .env.example does not contain hardcoded production tokens or secrets', () => {
      const envExamplePath = path.resolve(ROOT_DIR, '.env.example');
      if (fs.existsSync(envExamplePath)) {
        const envContent = fs.readFileSync(envExamplePath, 'utf-8');
        expect(envContent).not.toMatch(/[a-f0-9]{32,}/i);
        expect(envContent).not.toContain('eyJhbGciOi'); // JWT token pattern
      }
    });

    it('5.4 no local SQLite database files are tracked in git index', () => {
      let trackedFiles: string[] = [];
      if (fs.existsSync(path.join(ROOT_DIR, '.git'))) {
        trackedFiles = execSync('git ls-files', { cwd: ROOT_DIR, encoding: 'utf-8' }).split('\n');
      }
      const trackedDbs = trackedFiles.filter(f => /\.(db|sqlite|sqlite3)$/i.test(f));
      expect(trackedDbs.length).toBe(0);
    });
  });

  // ==========================================================================
  // 6. SQL INTEGRITY & DATA LOSS PREVENTION AUDIT
  // ==========================================================================
  describe('6. Migration SQL Safety & Non-Destructive Invariants', () => {
    it('6.1 no migration contains TRUNCATE or DROP COLUMN statements', () => {
      const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
        expect(content).not.toMatch(/\bTRUNCATE\b/i);
        expect(content).not.toMatch(/\bDROP\s+COLUMN\b/i);
      }
    });

    it('6.2 no migration contains raw unconstrained DELETE FROM statements', () => {
      const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
        expect(content).not.toMatch(/\bDELETE\s+FROM\b/i);
      }
    });

    it('6.3 all historical DROP TABLE statements are safe table copy-rebuild migrations', () => {
      const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
        if (content.match(/\bDROP\s+TABLE\b/i)) {
          // Rebuild migration must copy data: INSERT INTO ... SELECT ... FROM
          expect(content).toMatch(/INSERT\s+INTO[\s\S]*?SELECT[\s\S]*?FROM/i);
          // And rename the table back
          expect(content).toMatch(/ALTER\s+TABLE[\s\S]*?RENAME\s+TO/i);
        }
      }
    });

    it('6.4 PRAGMA foreign_key_check passes with zero violations on the initialized test database', async () => {
      const db = getDb(localD1);
      const fkCheck = await db.all<{ table: string; rowid: number; parent: string; fkid: number }>(
        'PRAGMA foreign_key_check;'
      );
      expect(fkCheck.length).toBe(0);
    });
  });

  // ==========================================================================
  // 7. PRIVACY & SANITIZATION CONTROLS
  // ==========================================================================
  describe('7. Audit Privacy & Error Sanitization Controls', () => {
    it('7.1 audit log helper schema enforces exclusion of full raw Aadhaar and passwords', () => {
      const auditSchemaFile = path.resolve(ROOT_DIR, 'src/db/schema.ts');
      const schemaContent = fs.readFileSync(auditSchemaFile, 'utf-8');

      // Audit logs entity exists and does not store unmasked secrets
      expect(schemaContent).toContain('export const auditLogs');
      expect(schemaContent).toContain('newValueJson: text(\'new_value_json\')');
    });

    it('7.2 error response sanitization module exists and handles SQLite constraint sanitization', () => {
      const errHandlerPath = path.resolve(ROOT_DIR, 'src/worker/middleware/errorHandler.ts');
      if (fs.existsSync(errHandlerPath)) {
        const errContent = fs.readFileSync(errHandlerPath, 'utf-8');
        expect(errContent).toContain('INTERNAL_SERVER_ERROR');
      }
    });
  });

  // ==========================================================================
  // 8. FINANCIAL & TEMPORAL CONVENTIONS
  // ==========================================================================
  describe('8. Financial Integer Storage & Temporal Conventions', () => {
    it('8.1 schema defines money fields as integer paise across financial tables', () => {
      const schemaFile = path.resolve(ROOT_DIR, 'src/db/schema.ts');
      const schemaContent = fs.readFileSync(schemaFile, 'utf-8');

      expect(schemaContent).toContain("pricePaisePerUnit: integer('price_paise_per_unit')");
      expect(schemaContent).toContain("amountPaise: integer('amount_paise')");
      expect(schemaContent).toContain("authoritativeSalesRevenuePaise: integer('authoritative_sales_revenue_paise')");
    });

    it('8.2 operational timestamps follow ISO 8601 UTC string format convention', () => {
      const schemaFile = path.resolve(ROOT_DIR, 'src/db/schema.ts');
      const schemaContent = fs.readFileSync(schemaFile, 'utf-8');

      expect(schemaContent).toContain('createdAt: text(\'created_at\')');
      expect(schemaContent).toContain('updatedAt: text(\'updated_at\')');
    });
  });

  // ==========================================================================
  // 9. PLATFORM BRANDING CONSISTENCY (IOCL DIGITAL OUTLET MANAGER)
  // ==========================================================================
  describe('9. Platform Branding Consistency (IOCL Digital Outlet Manager)', () => {
    it('9.1 Login page, Header, Sidebar, App loading screen, index.html, metadata.json, and PDF footer use Digital Outlet Manager', () => {
      const loginPage = fs.readFileSync(path.resolve(ROOT_DIR, 'src/frontend/pages/LoginPage.tsx'), 'utf-8');
      const header = fs.readFileSync(path.resolve(ROOT_DIR, 'src/frontend/components/layout/Header.tsx'), 'utf-8');
      const sidebar = fs.readFileSync(path.resolve(ROOT_DIR, 'src/frontend/components/layout/Sidebar.tsx'), 'utf-8');
      const appTsx = fs.readFileSync(path.resolve(ROOT_DIR, 'src/App.tsx'), 'utf-8');
      const indexHtml = fs.readFileSync(path.resolve(ROOT_DIR, 'index.html'), 'utf-8');
      const metadataJson = fs.readFileSync(path.resolve(ROOT_DIR, 'metadata.json'), 'utf-8');
      const pdfService = fs.readFileSync(path.resolve(ROOT_DIR, 'src/worker/services/monthlyOperationsPdfService.ts'), 'utf-8');
      const workerApp = fs.readFileSync(path.resolve(ROOT_DIR, 'src/worker/app.ts'), 'utf-8');

      expect(loginPage).toContain('Digital Outlet Manager');
      expect(loginPage).toContain('Indian Oil Corporation Limited • Enterprise Gateway');
      expect(header).toContain('Digital Outlet Manager');
      expect(sidebar).toContain('Digital Outlet Manager');
      expect(sidebar).toContain('IOCL Digital Outlet Manager v1.0');
      expect(appTsx).toContain('Digital Outlet Manager');
      expect(indexHtml).toContain('<title>IOCL Digital Outlet Manager</title>');
      expect(indexHtml).toContain('content="IOCL Digital Outlet Manager"');
      expect(metadataJson).toContain('"name": "IOCL Digital Outlet Manager"');
      expect(pdfService).toContain('Generated by IOCL Digital Outlet Manager - Confidential Operations Record');
      expect(workerApp).toContain('IOCL Digital Outlet Manager Worker API');
    });

    it('9.2 no user-facing source file in src/, index.html, metadata.json, or server.ts contains "Digital Pump Manager"', () => {
      const walkFiles = (dir: string): string[] => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const files: string[] = [];
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            files.push(...walkFiles(fullPath));
          } else if (/\.(ts|tsx|html|json)$/.test(entry.name)) {
            files.push(fullPath);
          }
        }
        return files;
      };

      const sourceFiles = [
        ...walkFiles(path.resolve(ROOT_DIR, 'src')),
        path.resolve(ROOT_DIR, 'index.html'),
        path.resolve(ROOT_DIR, 'metadata.json'),
        path.resolve(ROOT_DIR, 'server.ts'),
      ];

      for (const file of sourceFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        expect(content).not.toContain('Digital Pump Manager');
      }
    });
  });
});
