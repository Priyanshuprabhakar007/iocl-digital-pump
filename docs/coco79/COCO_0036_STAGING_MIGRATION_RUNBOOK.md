# COCO 0036 — Controlled staging database migration

**Status: LOCAL REHEARSAL ONLY. Remote migration is NOT yet authorized/executed.**
This file is an operator handover, not a permission to bypass the current database release freeze.

## Target identity (reconfirm from Cloudflare immediately before use)

- Cloudflare account: `93888554ef9d9e0b8c18b322683a9652`
- **Only permitted rehearsal target:** D1 `iocl-phase1-full-staging`, UUID `daf55190-af65-4b72-b5f6-8c87b70c4d35`
- **DO NOT USE:** production D1 `iocl-pump-manager-d1`, UUID `305f76c6-c940-443f-86a9-33c309a55578`
- **DO NOT USE:** older disposable D1 `9025eb32-4ea8-4bb9-a6e1-ab8ba55bf782`
- Dedicated config: `scripts/coco36/wrangler.coco36-staging.jsonc`. Its migrations directory intentionally contains **only 0036**, and it has no production R2 binding.
- Proposed SQL: `docs/proposed-migrations/0036_coco_agreements_claims_inspections.sql`.
- Existing root `migrations/` stays frozen at 0001–0035.

## Before any hosted database operation (all required)

1. CI must pass the local Wrangler D1 0035 + 0036 rehearsal and new documentation tests. Local emulators are not proof of hosted compatibility.
2. Independently verify the **current** Cloudflare account, database name/UUID and active Worker bindings; do not assume the account identifiers in older documents are still correct.
3. Hosted D1 must already contain the complete approved baseline, including `d1_migrations` with exactly **35** rows through `0035_coco_compliance_records.sql`. **Older documents recorded this staging D1 as empty. If empty, STOP. Do not use this migration to bootstrap the baseline.** The previous baseline 0001–0035 hosted compatibility blocker (foreign keys/table rebuild) must first be resolved separately.
4. Inspect source tables `users`, `retail_outlets`, `documents`, `nfr_leases`, and `equipment_assets`, their indexes, existing migrations and constraints. The target must not have the four new 0036 tables except when previously applied and verified.
5. Record migration file SHA-256, exact Git commit SHA, Wrangler version, approved change window, named change owner, independent reviewer, and a tested rollback/recovery procedure.
6. Capture a fresh D1 **Time Travel bookmark** and UTC time; check backup retention/restore availability. Never restore automatically—Time Travel restore overwrites the target.
7. Use a separate, short-lived **staging-only D1 write credential**, never copy it into chats, GitHub files, application environment variables, or existing read-only staging secrets.
8. Obtain written staging-only approval after independent review. Never infer authorization for production.

## Read-only operator preflight

Run from the exact checked-out approved Git SHA, using the *staging-specific config on every command*. These commands require a correctly authenticated Cloudflare operator but **do not write**:

```bash
bunx wrangler d1 info iocl-phase1-full-staging \
  --config scripts/coco36/wrangler.coco36-staging.jsonc

bunx wrangler d1 migrations list iocl-phase1-full-staging \
  --config scripts/coco36/wrangler.coco36-staging.jsonc --remote

bunx wrangler d1 execute iocl-phase1-full-staging \
  --config scripts/coco36/wrangler.coco36-staging.jsonc --remote \
  --command "SELECT name FROM d1_migrations ORDER BY id;"

bunx wrangler d1 execute iocl-phase1-full-staging \
  --config scripts/coco36/wrangler.coco36-staging.jsonc --remote \
  --command "SELECT type,name FROM sqlite_master WHERE type IN ('table','trigger') AND name IN ('coco_agreement_details','coco_expense_claims','coco_claim_settlements','coco_asset_inspections','nfr_leases','retail_outlets','equipment_assets','documents','users') ORDER BY type,name;"

bunx wrangler d1 execute iocl-phase1-full-staging \
  --config scripts/coco36/wrangler.coco36-staging.jsonc --remote \
  --command "PRAGMA foreign_key_check;"

bunx wrangler d1 time-travel info iocl-phase1-full-staging \
  --config scripts/coco36/wrangler.coco36-staging.jsonc
```

**STOP** if any identity differs, baseline is missing, unexpected tables exist, migration list includes anything other than the single expected 0036 (or no pending migration if already applied), FK check fails, or Time Travel recovery cannot be established.

## Staging-only APPLY (REFERENCE; NOT AUTHORIZED by this PR)

The next command **modifies the remote staging D1**. It is deliberately not part of CI and must not run until every preflight gate, backup evidence and explicit operator approval is recorded. Wrangler's migration command records 0036 in `d1_migrations` rather than applying an untracked SQL file.

```bash
bunx wrangler d1 migrations apply iocl-phase1-full-staging \
  --config scripts/coco36/wrangler.coco36-staging.jsonc --remote
```

Review Wrangler's exact pending list. If it is not **only** `0036_coco_agreements_claims_inspections.sql`, abort. On an error/timeout, stop and read back ledger/schema; **never blindly retry**.

## Post-migration acceptance

1. Re-run the staging identity check, D1 migrations list, `d1_migrations` and `PRAGMA foreign_key_check`; expect 36 migrations ending with 0036, zero FK violations.
2. Inspect `sqlite_master` for the four new tables and two triggers:
   - `coco_agreement_details`
   - `coco_expense_claims`
   - `coco_claim_settlements`
   - `coco_asset_inspections`
   - `trg_coco_settlement_approved_amount_guard`
   - `trg_coco_inspection_outlet_guard`
3. Compare existing critical parent table row counts and sample hashes captured pre-migration. No Daily Operations/DSR/Finances ledger rows should change.
4. With separately approved staging Worker + isolated Document Vault, perform outlet access, maker-checker approval, overpayment and inspection-condition UAT; compare UI/PDF output with source records.
5. Record results and post-apply recovery bookmark; independent reviewer decides GO/NO-GO for application activation.

## Production

**NOT APPROVED.** Even after staging passes, production needs its own schema/backup check, operating window and finance/audit sign-off. The repository root config and `bun run db:migrate:remote` point at **production**, and must not be used for staging. Do not include any remote DB write in a GitHub push workflow.

Cloudflare documentation:
- https://developers.cloudflare.com/d1/reference/migrations/
- https://developers.cloudflare.com/d1/reference/time-travel/
- https://developers.cloudflare.com/d1/wrangler-commands/
