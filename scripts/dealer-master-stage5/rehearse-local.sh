#!/usr/bin/env bash
# STAGE 5: disposable local Wrangler D1 only. No hosted D1 or R2 commands.
set -euo pipefail
if [[ "$#" -ne 0 ]]; then echo "This script accepts no arguments" >&2; exit 2; fi
cd "$(dirname "$0")/../.."

# Use a *new*, isolated local database. Do not inherit Cloudflare credentials,
# production config or any persistent user credentials.
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_STAGING_D1_ID CLOUDFLARE_D1_DATABASE_ID
unset CF_API_TOKEN CF_ACCOUNT_ID
export CLOUDFLARE_SEND_METRICS=false
DEST=".stage5-local"
rm -rf "$DEST"
mkdir -p "$DEST"
cat > "$DEST/wrangler.local.jsonc" <<'JSON'
{
  "name": "iocl-dealer-master-stage5-disposable-only",
  "main": "../src/worker/index.ts",
  "compatibility_date": "2024-11-01",
  "compatibility_flags": ["nodejs_compat"],
  "vars": {
    "ENVIRONMENT": "local-test",
    "ALLOWED_ORIGINS": "http://localhost:3000"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "iocl-dealer-master-stage5-disposable-only",
      "database_id": "00000000-0000-4000-8000-000000000038",
      "migrations_dir": "../migrations"
    }
  ]
}
JSON

# Never silently change the frozen 35-file baseline.
bun -e 'const fs=require("node:fs");const names=fs.readdirSync("migrations").filter(x=>/^\d{4}_.*\.sql$/.test(x)).sort();if(names.length!==35||!names[0].startsWith("0001_")||!names[34].startsWith("0035_"))throw Error("Frozen 0001-0035 baseline unexpected");console.log("Checked 35 frozen baseline SQL migrations");'

DB="iocl-dealer-master-stage5-disposable-only"
CFG="$DEST/wrangler.local.jsonc"
STATE="$DEST/state"
# Every database operation explicitly specifies --local and separate persistence.
bunx wrangler d1 migrations apply "$DB" --config "$CFG" --local --persist-to "$STATE"
bunx wrangler d1 execute "$DB" --config "$CFG" --local --persist-to "$STATE" --file docs/proposed-migrations/0036_coco_agreements_claims_inspections.sql
bunx wrangler d1 execute "$DB" --config "$CFG" --local --persist-to "$STATE" --file docs/lease-migration-0037/0037_coco_agreement_lease_terms.sql
bunx wrangler d1 execute "$DB" --config "$CFG" --local --persist-to "$STATE" --file docs/dealer-master-migration-0038/0038_dealer_master_ro_land_lease_source.sql

bunx wrangler d1 execute "$DB" --config "$CFG" --local --persist-to "$STATE" --command "SELECT name,type FROM sqlite_master WHERE type IN ('table','trigger','index') ORDER BY name;" --json > "$DEST/objects.json"
bunx wrangler d1 execute "$DB" --config "$CFG" --local --persist-to "$STATE" --command "PRAGMA foreign_key_check;" --json > "$DEST/foreign-keys.json"
bunx wrangler d1 execute "$DB" --config "$CFG" --local --persist-to "$STATE" --command "PRAGMA integrity_check;" --json > "$DEST/integrity.json"

node scripts/dealer-master-stage5/verify-local-results.mjs "$DEST"
echo "PASS: disposable Cloudflare Wrangler local D1 rehearsal. Remote targets not accessed."
