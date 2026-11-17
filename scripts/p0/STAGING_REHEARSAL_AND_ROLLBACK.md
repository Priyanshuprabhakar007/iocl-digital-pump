# IOCL P0 — Staging database rehearsal and rollback runbook (NO-GO draft)

**Current release decision: NO-GO.** This is a reviewer checklist, not permission to execute any SQL, deploy a Worker or touch production/staging.

## Scope and safety boundary

- Staging target must be independently verified as `iocl-phase1-full-staging` and never the production or older scratch database.
- Baseline migration scripts **0001–0035** remain unchanged. Do not apply them blindly to hosted D1.
- Current blockers: **0004** (nozzle reading table rebuild), **0007** (operational shift rebuild + `foreign_keys=OFF`), **0011** (multiple financial table rebuilds), **0032** (HR/shift rebuilds, FK setting and existing-row updates).
- Proposed calibration-point immutability triggers are **test-only** and must not be installed until the corresponding migration is reviewed and approved.

## Evidence required BEFORE any destructive rehearsal

1. Independent reviewer confirms the intended isolated throwaway environment, account, Worker binding and D1 UUID. Reject mismatches; never fall back to production or a similarly named database.
2. Collect a **native, independently restorable backup** of that environment using a documented provider-supported procedure. Record its authoritative origin, timestamp, account/DB identifiers and restore instructions outside this repo. This repo does **not** create backups.
3. Save the original baseline migration file names and SHA-256 hashes. Treat any change as requiring a new review.
4. On a **separate offline copy**, run `verifyOfflineStagingBackup` with a reviewer-verified manifest. It checks SHA-256, SQLite `integrity_check`, `foreign_key_check` and exact required table counts. Matching self-declared metadata **does not authenticate hosted provenance**.
5. Restore the independent backup into a dedicated **disposable** isolated DB, never over the original staging DB; verify D1-specific behavior separately from a local SQLite emulator.
6. Capture initial schema, critical row counts, FK status, sampled row hashes, trigger inventory, and migration ledger from the disposable restore.

## Controlled rehearsal (only after explicit approval)

1. Review each blocker individually, especially table DROP/rename dependencies, FK cascades, rebuild ordering and idempotency. Do not assume `PRAGMA foreign_keys=OFF` works inside hosted D1 migration transactions.
2. Build and review a hosted-compatible remediation plan in a **separate proposal** rather than silently rewriting baseline 0001–0035.
3. Run migrations on the throwaway restore only. Stop immediately on first failure; preserve diagnostics and the original backup.
4. Compare post-rehearsal schema, row counts, foreign-key checks, critical sample hashes and audit history to pre-rehearsal evidence. Investigate even a one-row discrepancy.
5. Run Daily Operations, 10KL/15KL/20KL/50KL chart verification against approved source documents, Finance, shift-close and audit UAT. Never replace certified tank curves with synthetic seed fixtures.

## Failure and rollback

- **Before any hosted write:** NO-GO means stop; do not attempt an automatic remote rollback.
- **On disposable rehearsal failure:** quarantine the failed DB, capture logs, restore the verified independent backup to **another new isolated** DB and compare schema, row counts, foreign keys and sample hashes. Never assume a failed D1 batch rolled back every preceding migration.
- **On operational staging failure (future separately approved phase):** stop writers and Worker traffic, preserve evidence, obtain authorized incident review; restore through a separately verified provider-supported process, then re-run integrity and reconciliation checks. No automatic destructive “undo SQL”.
- **Production:** no migration, no rollback, no reseed, no chart overwrite unless a separate explicit release/change-control approval exists.

## Sign-off (all required)

- [ ] Database owner validates native backup provenance and restore capability
- [ ] DBA reviews migration 0004/0007/0011/0032 FK and table rebuild plan
- [ ] Independent reviewer verifies isolated staging identity and access
- [ ] Backup copy and restored throwaway DB integrity checks pass
- [ ] Operator validates tank calibration tables and Daily Operations
- [ ] Finance owner validates reconciliation totals and audit trail
- [ ] Deployment owner approves a separate staging execution window
- [ ] Fresh deployment decision written as GO with its evidence; until then **NO-GO**
