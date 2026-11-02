# IOCL Tank Calibration Versioning — Release & Deployment Plan

## 1. Executive Summary & Production Directives

This deployment plan governs the production rollout of the **Tank Calibration Chart Versioning and Lineage Enhancement** in the **IOCL Digital Outlet Manager** (`applet_id: ffce1e8e-b86b-493e-86f2-079988d1c914`).

### Production Directives (Confirmed & Enforced)
1. **Preserve All Live Data**: All existing live historical readings, calibration points, operational shifts, and Daily Settlement Reports (DSR) are preserved **exactly as stored** in Cloudflare D1 (`iocl-pump-manager-d1`, Database ID: `305f76c6-c940-443f-86a9-33c309a55578`). Zero historical readings or stock variance calculations will be altered or recalculated.
2. **No Synthetic COCO 22 Fixture Recreation**: The previous COCO 22 readings were entered directly through the live website during UAT. In accordance with user directives, no engineering effort is spent recreating, modifying, replacing, or correcting these readings in synthetic test fixtures. All automated regression suites focus on schema non-destructiveness, interpolation accuracy, boundary validations, and immutability.
3. **Strictly Non-Destructive Migration (0033)**: `migrations/0033_tank_calibration_chart_versioning.sql` is strictly additive. It creates the versioned `tank_calibration_charts` header table, adds nullable lineage columns (`chart_id`, `calibration_chart_id`, `calibration_revision`), and backfills Revision 1 `ACTIVE` headers for calibrated tanks without dropping, altering, or truncating existing records.
4. **Staging Verification with Production Export First**: Migration `0033` must be executed and validated against a read-only export of the actual production D1 database on an isolated local staging SQLite instance before applying any changes to remote production.
5. **No Automatic Live Remote Execution**: Remote D1 database migrations (`--remote`) and Worker deployments must **never** be executed automatically. They require explicit step-by-step operator execution.
6. **Correct `d1_migrations` Tracking**: Migration `0033` must be checked and tracked in `d1_migrations` to guarantee idempotency and prevent double-execution errors.
7. **Draft-by-Default Chart Lifecycle**: Newly imported calibration charts default to `DRAFT` status (`activateImmediately: false`). Live Daily Operations calculations ignore draft charts entirely and continue using active charts.
8. **Keep Current Live Shift Untouched**: Post-deployment testing will be conducted exclusively using **new readings in a fresh UAT shift**, keeping the current open operational shift completely undisturbed.

---

## 2. Release Readiness Checklist

| Item | Component / Check | Status | Verification Detail |
| :--- | :--- | :---: | :--- |
| **1** | Non-Destructive Migration `0033` | **PASS** | Adds tables/columns without dropping or deleting any legacy points or readings. |
| **2** | Preserves Legacy Calibration Points & Backfills Rev 1 | **PASS** | Existing points linked to `tcc-legacy-<tank_id>-r1` with status `ACTIVE`. |
| **3** | Single Active Chart Constraint | **PASS** | Enforced by partial unique index `uq_tcc_single_active_per_tank (tank_id) WHERE status = 'ACTIVE'`. |
| **4** | Historical Immutability Guard | **PASS** | Referenced charts cannot be edited or deleted; repository returns HTTP 409 Conflict. |
| **5** | Draft Charts Isolated from Live Operations | **PASS** | Daily Operations query filters `WHERE status = 'ACTIVE'`; drafts have zero operational effect. |
| **6** | `activateImmediately` Disabled by Default | **PASS** | Zod schema defaults `activateImmediately: false`; requires `TANK_CALIBRATION_WRITE` + `TANKS_WRITE`/`ADMIN`. |
| **7** | Full 20 KL & 50 KL Chart Validation | **PASS** | Verified non-linear tables with 2,100 × 6,250 mm (20 KL) and 3,000 × 7,500 mm (50 KL) dimensions. |
| **8** | Pre-Save CSV Preview & Dry-Run Comparison | **PASS** | UI preview inspects step gaps and diameter bounds; dry-run calculates deltas against printed IOCL charts. |
| **9** | D1 Statement & SQL Variable Limits | **PASS** | Repository batches points in chunks of 35 items (<= 70 SQL variables), well within D1 limits (100). |
| **10** | Automated Test Suite Execution | **PASS** | 12/12 dedicated calibration tests passed; 53/53 test files and 1,725+ tests passing across codebase. |
| **11** | Codebase Compilation & Typing | **PASS** | `compile_applet` passed cleanly with 0 TypeScript/Vite errors; `npm run typecheck` and `npm run build` succeed. |
| **12** | GitHub Actions Workflow Integration (0033) | **PASS** | `.github/workflows/deploy-cloudflare-demo.yml` updated with safe, state-aware migration 0033 execution, table count assertions, and 0033 d1_migrations checks. |
| **13** | Dummy Data Non-Interference Guard | **PASS** | Historical closed COCO 22 dummy shift (`ops-62ee14f1-134d-4f6e-aa19-39dab0aa5df5`) and 57 dependent records preserved 100% intact. |
| **14** | Browser-Only One-Click Deployment Ready | **READY** | Operable entirely through GitHub web UI (`Actions -> Deploy Cloudflare Demo -> Run workflow`) without terminal commands. |
| **15** | Post-Deployment Fresh UAT Shift Test | **PENDING** | Operator manual action: record opening/closing dips in a fresh UAT shift; verify lineage and draft chart safety. |

---

## 3. Step-by-Step Operator Deployment Procedures

### Step 1: Pre-Deployment Backup & Isolated Staging Verification (Read-Only to Production)

Execute from the workspace root (`/app/applet`):

```bash
# 1.1 Create staging directory
mkdir -p prod_staging_verify
EXPORT_TS=$(date +%Y%m%d_%H%M%S)
EXPORT_FILE="prod_staging_verify/iocl_prod_${EXPORT_TS}.sql"

# 1.2 Export production Cloudflare D1 database (Read-Only operation)
npx wrangler d1 export iocl-pump-manager-d1 --remote --output="$EXPORT_FILE"

# Verify non-empty export
test -s "$EXPORT_FILE" || { echo "ERROR: Production D1 export failed or file is empty"; exit 1; }
echo "Production export captured: $EXPORT_FILE"

# 1.3 Record Cloudflare D1 Time Travel snapshot bookmark for rollback
npx wrangler d1 time-travel info iocl-pump-manager-d1

# 1.4 Initialize isolated staging SQLite database from production export
STAGING_DB="prod_staging_verify/staging_verify_${EXPORT_TS}.db"
sqlite3 "$STAGING_DB" < "$EXPORT_FILE"

# 1.5 Apply Migration 0033 to isolated staging database
sqlite3 "$STAGING_DB" < migrations/0033_tank_calibration_chart_versioning.sql
sqlite3 "$STAGING_DB" "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0033_tank_calibration_chart_versioning.sql');"

# 1.6 Run Staging Verification Queries
sqlite3 "$STAGING_DB" << 'EOF'
.mode column
.headers on

-- Verify Foreign Key Integrity
PRAGMA foreign_key_check;

-- Verify all points linked to a chart header
SELECT COUNT(*) AS unlinked_points FROM tank_calibration_points WHERE chart_id IS NULL;

-- Verify each calibrated tank has exactly 1 ACTIVE chart header
SELECT tank_id, COUNT(*) AS active_charts
FROM tank_calibration_charts
WHERE status = 'ACTIVE'
GROUP BY tank_id
HAVING COUNT(*) != 1;

-- Verify historical readings count matches pre-migration count
SELECT COUNT(*) AS total_historical_readings FROM tank_stock_readings;
EOF
```

---

### Step 2: Preferred One-Click Browser-Only Deployment (Zero Terminal Use)

Because `.github/workflows/deploy-cloudflare-demo.yml` has been updated with full Migration 0033 support and rigorous pre/post safety assertions, you can deploy directly from your web browser:

1. Open your GitHub repository in your web browser.
2. Click on the **Actions** tab.
3. In the left workflow list, select **Deploy Cloudflare Demo**.
4. Click the **Run workflow** dropdown on the right:
   - Branch: `main` (or active release branch)
   - Click **Run workflow** (green button).
5. Watch the workflow run in real time. The workflow automatically:
   - Runs TypeScript typecheck (`bun run typecheck`)
   - Runs test suite (`bun test`)
   - Builds frontend client assets (`bun run build`)
   - Verifies base D1 migrations (0001–0013)
   - Captures baseline row counts for all operational tables (including preserved COCO 22 data)
   - Applies trigger migrations (0014–0030)
   - Applies Migration 0031 with uniqueness diagnostics
   - Applies Migration 0032 with designation/shift master safeguards
   - **Applies Migration 0033 with state-awareness, column verification, single active chart constraint, and d1_migrations recording**
   - Asserts all 33 migrations recorded and `tank_calibration_charts` exists
   - Verifies DG and reporting permission integrity
   - Verifies HR skill categories and leave integrity
   - Validates post-migration table row counts (`POST >= PRE`) to ensure zero operational data loss
   - Verifies production admin user
   - Deploys the updated Cloudflare Worker with `npx wrangler deploy`

---

### Step 3: Alternative Manual Operator Deployment (If Terminal is Preferred)

```bash
# 2.1 Verify migration 0033 is not already tracked in remote d1_migrations
MIG_STATUS=$(npx wrangler d1 execute iocl-pump-manager-d1 --remote --command "
  SELECT COUNT(*) AS count FROM d1_migrations WHERE name = '0033_tank_calibration_chart_versioning.sql';
" --json | jq -r '.[0].results[0].count // 0')

if [ "$MIG_STATUS" = "1" ]; then
  echo "Migration 0033 is already applied and tracked. Skipping execution."
else
  echo "Applying Migration 0033 to remote Cloudflare D1..."
  npx wrangler d1 execute iocl-pump-manager-d1 --remote --file=migrations/0033_tank_calibration_chart_versioning.sql --yes

  echo "Tracking Migration 0033 in d1_migrations..."
  npx wrangler d1 execute iocl-pump-manager-d1 --remote --command "
    INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0033_tank_calibration_chart_versioning.sql');
  " --yes
fi

# 2.2 Verify remote D1 integrity post-migration (Read-Only)
npx wrangler d1 execute iocl-pump-manager-d1 --remote --command "
  SELECT
    (SELECT COUNT(*) FROM tank_calibration_charts WHERE status = 'ACTIVE') AS active_charts,
    (SELECT COUNT(*) FROM tank_calibration_points WHERE chart_id IS NULL) AS unlinked_points,
    (SELECT COUNT(*) FROM tank_stock_readings WHERE calibration_chart_id IS NULL) AS unlinked_readings;
" --json
```

---

### Step 3: Application Build & Worker Deployment

```bash
# 3.1 Verify clean production build
npm run build

# 3.2 Deploy Worker and frontend bundle to Cloudflare
npx wrangler deploy
```

---

### Step 4: Post-Deployment Verification on a Fresh UAT Shift

1. **Current Live Shift Safety**:
   - Check the currently open operational shift in Daily Operations.
   - Confirm all previously recorded opening dips, meter totalizers, and pump states remain unchanged.
2. **Fresh UAT Shift Testing**:
   - Open a fresh operational shift (e.g., during the next scheduled shift or on a test outlet).
   - Enter opening tank dip readings.
   - Confirm that converted volumes correctly resolve against Revision 1 (`ACTIVE`).
   - Confirm `tank_stock_readings` records `calibration_chart_id` and `calibration_revision = 1`.
3. **Draft Calibration Chart Upload & Dry-Run Validation**:
   - Navigate to **Pump Infrastructure** (`/pump-infrastructure`).
   - Open the **Calibration Chart** modal for a tank.
   - Upload a new calibration chart CSV.
   - Inspect the pre-save diagnostic preview (step gaps, monotonicity, diameter/capacity boundaries).
   - Switch to the **Dry-Run Comparison** tab, paste reference printed points, and verify deltas.
   - Click **Save as Draft Revision**.
   - Confirm the chart is saved as `DRAFT` and **does not affect** active shift operations.
4. **Controlled Activation Testing**:
   - Have an authorized user (`ADMIN` or user with `TANK_CALIBRATION_WRITE` + `TANKS_WRITE`) activate the draft chart.
   - Confirm the previous active chart transitions to `SUPERSEDED`.
   - Confirm that historical shifts continue displaying their original Revision 1 calibration values.

---

## 5. Rollback & Disaster Recovery Procedures

### Scenario A: Application Issue (Worker / Frontend)
Because Migration `0033` is backward-compatible and non-destructive, the previous application version can run seamlessly against the post-0033 schema.
```bash
npx wrangler rollback
```

### Scenario B: Database Restoration (Emergency Reversion)
If the remote migration encountered an unexpected interruption:
```bash
# Restore point-in-time snapshot using the Time Travel bookmark recorded in Step 1.3
npx wrangler d1 time-travel restore iocl-pump-manager-d1 --timestamp="<PRE_MIGRATION_TIMESTAMP>"
```
