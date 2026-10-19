# IOCL Digital Outlet Manager — Production Release Runbook

**Document Version:** 1.0.0 (Stage F3 Final Freeze)  
**Target Environment:** Cloudflare Production (Workers + D1 + R2)  
**Applicability:** Production Operators, Release Engineers, Station Administrators  
**Emergency Contact:** IOCL Operations Control & Release Governance Team  

---

## Overview & Safety First Policy

This runbook outlines the required step-by-step procedure for deploying the IOCL Digital Outlet Manager into production. 

**CRITICAL SAFETY DIRECTIVES:**
* **NO DEMO SEEDING:** Remote production databases must **never** be seeded with mock or demo data.
* **IMMUTABLE AUDIT:** Do not bypass database integrity triggers or foreign-key constraints.
* **ROW PRESERVATION:** Deployments must be aborted immediately if any operational table experiences a decrease in row count during migration.
* **BACKUP BEFORE RELEASE:** Always capture a D1 database snapshot before triggering production migrations.

---

## Phase A: Pre-Release Approval & Change Window

1. **Verify Change Window:**
   * Confirm the scheduled release window with Retail Sales and Station Operations.
   * Recommended release window: Low-traffic operational hours (e.g., 01:00 AM – 03:00 AM IST).
2. **Obtain Approvals:**
   * Release Manager sign-off.
   * Security & Compliance Officer sign-off.
   * State Office Regional Operations Representative sign-off.
3. **Notify Stakeholders:**
   * Broadcast scheduled maintenance notification to station managers and dealer portals.

---

## Phase B: Confirm Clean Main Branch

1. **Check Repository State:**
   ```bash
   git checkout main
   git fetch origin main
   git status
   ```
2. **Verify Commit Hash:**
   * Confirm local `HEAD` matches the target commit that passed the Stage F3 release readiness audit.
3. **Verify Clean Working Tree:**
   * Ensure `git status` reports `nothing to commit, working tree clean`.

---

## Phase C: Confirm Latest CI Green

1. **Inspect GitHub Actions CI Pipeline:**
   * Access GitHub Repository Actions tab.
   * Confirm the latest run on branch `main` has a **Green Checkmark (SUCCESS)**.
   * Verify all required jobs passed:
     * TypeScript Typecheck (`bun run typecheck`)
     * Full Automated Test Suite (`bun test` — 36 files, 0 failures)
     * Production Asset Build (`bun run build`)
2. **Local Sanity Check (Optional but Recommended):**
   ```bash
   bun run typecheck
   bun test tests/releaseReadiness.test.ts
   bun run build
   ```

---

## Phase D: Backup & Recovery Preparation

1. **Export Remote D1 Backup:**
   ```bash
   # Export raw SQL snapshot of production D1
   npx wrangler d1 export iocl-pump-manager-d1 --remote --output="./backups/d1_prod_pre_release_$(date +%Y%m%d_%H%M%S).sql"
   ```
2. **Verify Backup Integrity:**
   * Confirm the generated SQL file exists and is non-empty (`> 100 KB`).
   * Store backup copy in a secure, encrypted storage location.
3. **Confirm R2 Bucket Status:**
   * Verify R2 documents bucket (`iocl-pump-manager-docs`) is accessible and operational.

---

## Phase E: Capture Pre-Migration Production Table Counts

1. **Query Existing Production Table Counts:**
   * Record the row counts of all operational tables before running migrations:
   ```bash
   npx wrangler d1 execute iocl-pump-manager-d1 --remote \
     --command "SELECT 'users', COUNT(*) FROM users UNION ALL SELECT 'operational_shifts', COUNT(*) FROM operational_shifts UNION ALL SELECT 'fuel_receipts', COUNT(*) FROM fuel_receipts;"
   ```
2. **Automated Preservation Logging:**
   * Note that `.github/workflows/deploy-cloudflare-demo.yml` automatically executes this step and stores baseline counts in `.d1_counts/pre_<table_name>.txt`.

---

## Phase F: Verify Migration Inventory

1. **Verify Filesystem Migrations:**
   * Confirm local `migrations/` folder contains exactly migrations `0001` through `0027`.
   * Confirm no migration `0028` or higher exists.
2. **Check Migration Sequence:**
   ```bash
   ls -1 migrations/*.sql | sort
   ```
   * Confirm all 27 migration filenames match the expected naming convention, terminating at `0027_outlet_directory_visibility.sql`.

---

## Phase G: Apply Migrations Only If Pending

1. **Query Remote Recorded Migrations:**
   ```bash
   npx wrangler d1 execute iocl-pump-manager-d1 --remote \
     --command "SELECT name FROM d1_migrations ORDER BY id;"
   ```
2. **Determine Pending Migrations:**
   * Compare remote `d1_migrations` with local `migrations/`.
   * If any migration from `0001` to `0027` is missing, apply it individually in sequential order:
   ```bash
   # Example for single pending migration:
   npx wrangler d1 execute iocl-pump-manager-d1 --remote --file=migrations/0027_outlet_directory_visibility.sql
   npx wrangler d1 execute iocl-pump-manager-d1 --remote --command "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0027_outlet_directory_visibility.sql');"
   ```
   * **Note:** The deployment workflow automates this via an idempotent check-before-apply loop.

---

## Phase H: Verify Recorded Migration Count

1. **Verify Total Migrations in D1:**
   ```bash
   npx wrangler d1 execute iocl-pump-manager-d1 --remote \
     --command "SELECT COUNT(*) AS count FROM d1_migrations;"
   ```
2. **Validation Rule:**
   * Count must be **at least 27**.
   * If count is `< 27`, halt release and investigate missing migration entries.

---

## Phase I: PRAGMA foreign_key_check

1. **Execute Foreign Key Integrity Check:**
   ```bash
   npx wrangler d1 execute iocl-pump-manager-d1 --remote \
     --command "PRAGMA foreign_key_check;"
   ```
2. **Validation Rule:**
   * Output must be completely empty (0 violations).
   * If any foreign key violation is reported, **DO NOT PROCEED**. Trigger Phase Q (Rollback & Incident Escalation).

---

## Phase J: Verify Protected Table Row Counts

1. **Execute Post-Migration Row Count Check:**
   * Verify that for every protected table:
     $$\text{Post-Migration Count} \ge \text{Pre-Migration Count}$$
2. **Validation Rule:**
   * Zero row count decrease across all 63 protected operational and business tables.
   * If any table row count decreased, **HALT IMMEDIATELY**.

---

## Phase K: Verify Production Administrator Existence

1. **Query Administrator Account:**
   ```bash
   npx wrangler d1 execute iocl-pump-manager-d1 --remote \
     --command "SELECT COUNT(*) AS count FROM users WHERE email = 'admin@iocl.in';"
   ```
2. **Validation Rule:**
   * Count must equal exactly `1`.
   * Confirm the administrator account has active global privileges.

---

## Phase L: Deploy Worker to Cloudflare

1. **Trigger Production Deployment:**
   * Via GitHub Actions: Navigate to `Actions` -> `Deploy Cloudflare Demo` -> Click `Run workflow` (branch: `main`).
   * Or via manual CLI (if authorized):
   ```bash
   bun run build
   npx wrangler deploy
   ```
2. **Verify Deployment Output:**
   * Confirm Worker version hash is generated.
   * Confirm deployment status returns `Success` with healthy route binding.

---

## Phase M: Smoke-Test Backend API

1. **Health Check Endpoint:**
   ```bash
   curl -s -i "https://iocl-digital-pump.vercel.app/api/v1/health"
   ```
   * Expected: HTTP 200 OK.
2. **Authentication Smoke Test:**
   * Test POST `/api/v1/auth/login` with administrative credentials.
   * Confirm session cookie (`iocl_session`) is returned with `HttpOnly; SameSite=Lax`.
3. **Session Query:**
   * Test GET `/api/v1/auth/me` with session cookie.
   * Confirm user persona, role (`ADMIN`), and global scope are accurately resolved.

---

## Phase N: Smoke-Test Frontend UI

1. **Access Web Application:**
   * Navigate to `https://iocl-digital-pump.vercel.app` in a clean browser session.
2. **Visual Verification:**
   * Confirm Indian Oil branding, login screen styling, and logo load without layout shift.
   * Confirm browser console reports zero unhandled script errors or network 404s.
3. **Login Navigation:**
   * Log in as `admin@iocl.in`.
   * Confirm landing dashboard loads with active outlet overview, tank dip status, and shift meters.

---

## Phase O: Execute Production UAT Checklist

Perform quick non-destructive validation of key operational modules:
* [ ] **Retail Outlet View:** Check outlet list renders correctly.
* [ ] **Shift Status:** Confirm shift state is accurately shown (`OPEN`, `CLOSED`, or `NO_SHIFT`).
* [ ] **Fuel Readings:** Review tank calibration and nozzle meter displays.
* [ ] **CNG Operations:** Check CNG compressor logs and pressure readings.
* [ ] **Lube Catalog:** View lube SKU inventory levels and pricing masters.
* [ ] **HR Workforce:** View staff roster and leave request dashboard.
* [ ] **Audit Log Viewer:** Confirm latest login action is logged in audit trail with timestamp.

---

## Phase P: Release Approval & Sign-Off

1. **Formal Sign-Off:**
   * Record deployment timestamp, Git commit SHA, and operator name.
   * Update internal release tracker to `RELEASED - PRODUCTION ACTIVE`.
2. **Post-Release Monitoring:**
   * Monitor Cloudflare Worker telemetry / error logs for the next 60 minutes.
   * Verify zero 500 error spikes on `/api/v1/*` routes.

---

## Phase Q: Rollback Plan & Decision Criteria

### 1. Rollback Decision Triggers
Initiate rollback immediately if any of the following occur:
* `PRAGMA foreign_key_check;` reports foreign key constraint violations.
* Any protected operational table experienced an unexplained row-count decrease.
* Cloudflare Worker deployment fails or causes continuous 500 Internal Server Errors.
* Production administrator account cannot log in or authenticate.
* Critical data corruption is detected.

### 2. Worker Code Rollback (Zero Database Impact)
If the database schema is intact and the defect is isolated to application code or frontend assets:
```bash
# Redeploy previous stable Worker deployment via Wrangler
npx wrangler rollback <previous-deployment-id>
```
* **Impact:** Near-instantaneous (~5 seconds), zero risk to persisted database rows.

### 3. Database Recovery Procedure (Critical Incident)
* **Caution on Schema Rollbacks:** SQLite and Cloudflare D1 do not support automated `DOWN` migrations. Rolling back schema migrations manually using ad hoc SQL is dangerous and can lead to irreversible data loss.
* **Restore from Pre-Release Snapshot:**
  1. Notify IOCL Operations Control and place the application in Maintenance Mode.
  2. Verify pre-release SQL snapshot captured in Phase D:
     `./backups/d1_prod_pre_release_<timestamp>.sql`
  3. Execute database restoration:
     ```bash
     npx wrangler d1 execute iocl-pump-manager-d1 --remote --file="./backups/d1_prod_pre_release_<timestamp>.sql" --yes
     ```
  4. Verify restored row counts match pre-release baseline.
  5. Run `PRAGMA foreign_key_check;` to confirm 0 violations.
  6. Re-deploy the matching previous stable Worker version.
  7. Conduct post-rollback smoke tests before removing Maintenance Mode.

### 4. Incident Escalation Protocol
* **Severity 1 (Data Corruption / Outage):** Escalate immediately to Lead Systems Architect and Station Operations Director. Convene emergency incident bridge.
* **Root Cause Analysis (RCA):** Preserve deployment logs, workflow traces, and backup artifacts for post-incident review.
