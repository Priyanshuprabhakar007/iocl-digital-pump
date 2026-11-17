# IOCL Phase 1 — Hosted full-staging migration execution and recovery runbook

**Plan prepared 2026-11-14. Current authorization: HOLD / DO NOT APPLY.**

## 1. Boundaries, target, roles

- **Approved intended test target (identity verified by dashboard and read-only Cloudflare API):** account `93888554ef9d9e0b8c18b322683a9652`, D1 `iocl-phase1-full-staging`, UUID `daf55190-af65-4b72-b5f6-8c87b70c4d35`.
- **Explicit configuration:** `scripts/stage01x/wrangler.phase1-staging.jsonc`. It uses the unique staging Worker name, test CORS and no production R2 binding.
- **NEVER target production:** `iocl-pump-manager-d1`, UUID `305f76c6-c940-443f-86a9-33c309a55578`; default root `wrangler.jsonc` and package script `db:migrate:remote` point at production.
- **NEVER reuse Stage 01K scratch:** `stage01k-iocl-disposable`, UUID `9025eb32-4ea8-4bb9-a6e1-ab8ba55bf782`.
- GitHub Environment `iocl-phase1-staging` currently holds a **D1 Read-only** `CLOUDFLARE_API_TOKEN` and environment IDs. **Do not upgrade that secret** to Edit/Write. Read-only credential cannot apply migrations.
- An independent account/database verifier and a named staging change owner are required before using any separate, short-lived write token. A finance/audit reviewer should approve the procedure before any prospective full Worker UAT.

## 2. Evidence already available

- Staging D1 dashboard showed zero IOCL tables and read-only `sqlite_master` returned only internal `_cf_KV`.
- Account and staging database name/UUID verified from Cloudflare REST GET via environment-scoped read-only GitHub workflow run [43563532197](https://github.com/Priyanshuprabhakar007/iocl-digital-pump/actions/runs/43563532197).
- Local Wrangler D1 isolated rehearsal of frozen baseline migrations 0001–0035 plus `d1_migrations` count and foreign-key check: passing [run 43566015914](https://github.com/Priyanshuprabhakar007/iocl-digital-pump/actions/runs/43566015914).
- Offline inventory and SQL risk review in Stage 01Y / 01Z. Stage 01Z explicitly flags `PRAGMA foreign_keys=OFF` in 0007 and 0032, plus table rebuilds. **Local success is not hosted D1 proof**. Frozen migrations remain unchanged.
- Current branch contains only stacked **draft** PRs; do not merge/deploy by virtue of this runbook.

## 3. Pre-migration gates — all required

**STOP unless all are recorded and signed:**

- [ ] A qualified independent reviewer re-checks Cloudflare account ID, D1 UUID, name, **current** schema (no app tables), and latest approved Git SHA right before use.
- [ ] Baseline SQL 0001–0035 reviewed in full. Explicit D1 FK semantics and rebuild/cascade effects for 0004, 0007, 0010, 0011, 0032 are accepted with a written rationale, or a **separate D1-compatible staging-only migration strategy** is tested and approved. Do not modify 0001–0035 in place.
- [ ] Confirm exact intended 35 SQL SHA-256 digests, file order, D1 Wrangler version, flags and config-relative `migrations_dir` on the release SHA. Verify `migrations list` on remote without applying.
- [ ] Full staging DB is dedicated, empty of application data, not bound to any public or production Worker, and has no consumer/production live traffic.
- [ ] Cloudflare D1 backend and Time Travel eligibility verified. Capture **pre-migration Time Travel bookmark** and UTC timestamp, store in protected change record. Verify backup/restore procedure is understood, including loss of writes after restore. Never treat an unverified bookmark as a guaranteed backup.
- [ ] A staging change owner signs a **staging-only** approval with exact account, D1 UUID, SHA, migration range, UTC window, recovery operator and abort thresholds. Second verifier checks identity independently.
- [ ] Staging write credentials, if required, are **separate from the GitHub D1 Read token**, least privilege and short-lived, provided to a controlled human session/approved environment, never put in chat or a PR, and revoked after use.
- [ ] Network retry policy: migration failure, timeout or unknown response means **STOP and read back status**. No blind retry or 'force continue'.
- [ ] No deploy or enabling `STAGE01P_ENABLE_DURABLE_JOURNAL` or installing Stage 01S / S-2 proposed triggers as part of this baseline.

## 4. Staging-only operator commands — REFERENCE, DO NOT RUN UNTIL APPROVED

Run from the repo root, on the exact approved draft SHA in a controlled shell. Use the explicit **nonproduction** config on **every** Wrangler invocation. Verify installed Wrangler syntax with `bunx wrangler d1 --help`.

```bash
# READ ONLY: check target and pending migrations; never use root wrangler.jsonc.
bunx wrangler d1 info iocl-phase1-full-staging \
  --config scripts/stage01x/wrangler.phase1-staging.jsonc

bunx wrangler d1 migrations list iocl-phase1-full-staging \
  --config scripts/stage01x/wrangler.phase1-staging.jsonc --remote

# READ ONLY: database-specific bookmark (verify Time Travel support).
bunx wrangler d1 time-travel info iocl-phase1-full-staging \
  --config scripts/stage01x/wrangler.phase1-staging.jsonc
```

The next command **WRITES to remote staging**. It is intentionally separated here; **do not execute without all gates above and explicit staging-only approval**. It cannot be used with the current read-only token:

```bash
# HIGH IMPACT — requires written staging authorization and reviewed rollback.
bunx wrangler d1 migrations apply iocl-phase1-full-staging \
  --config scripts/stage01x/wrangler.phase1-staging.jsonc --remote
```

Review Wrangler's displayed migration list and confirm it contains only the approved baseline 0001–0035. Stop if it differs, if another DB appears, if a statement errors, or if a prompt is skipped unexpectedly in a CI/noninteractive context. **Do not move this write command into the existing read-only GitHub workflow.**

## 5. Post-apply read-only verification

After the controlled write has been independently authorized and completed:

```bash
bunx wrangler d1 execute iocl-phase1-full-staging \
  --config scripts/stage01x/wrangler.phase1-staging.jsonc --remote \
  --command "SELECT name FROM d1_migrations ORDER BY id;"

bunx wrangler d1 execute iocl-phase1-full-staging \
  --config scripts/stage01x/wrangler.phase1-staging.jsonc --remote \
  --command "PRAGMA foreign_key_check;"

bunx wrangler d1 execute iocl-phase1-full-staging \
  --config scripts/stage01x/wrangler.phase1-staging.jsonc --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Confirm migration ledger contains **exactly approved 35 records**, `foreign_key_check` yields **zero violation rows**, expected app tables and critical indexes/triggers exist, and no seed/real production data is present. Verify with a second person and record dated evidence. No Worker deployment until separate infrastructure security/UAT approval; baseline migrations alone do not create journal/proposed source guard tables.

## 6. Abort, rollback and Time Travel recovery

**STOP** on identity mismatch, nonempty unexpected tables, unexpected pending migration, FK/constraint violation, error/timeout, missing audit evidence, or any ambiguous state. Do not attempt automatic reruns.

1. Halt all staging writes and any dependent staging Workers; preserve console logs, exact error, UTC timestamp and migration ledger. If an apply command failed, successful earlier migrations may remain applied; do **not** assume entire 35-file sequence rolled back.
2. With read-only credentials, inspect current `d1_migrations`, `sqlite_master` and `PRAGMA foreign_key_check`. Compare results against the preflight inventory.
3. If approved rollback is necessary, confirm Time Travel support and the **recorded pre-migration bookmark** in Cloudflare. Restoration **overwrites the target database in place** and cancels in-flight activity. This requires separate operator approval and a write-authorized credential; it is not a safe automatic retry.
4. Reference only, **DO NOT RUN**: `bunx wrangler d1 time-travel restore iocl-phase1-full-staging --config scripts/stage01x/wrangler.phase1-staging.jsonc --bookmark=<RECORDED_STAGING_BOOKMARK>`.
5. Confirm the exact UUID again immediately before restoration; independent verifier must sign off. After restore, inspect tables/ledger and compare to pre-migration baseline. Record recovery evidence and revoke temporary write credential. If restore support is absent, do not proceed with migration without an alternative tested backup recovery strategy.

Cloudflare documentation: https://developers.cloudflare.com/d1/reference/time-travel/ and https://developers.cloudflare.com/d1/wrangler-commands/.

## 7. Formal decision and open signoffs

**Current decision: HOLD for hosted staging migration, NO-GO for production.** This document is a proposed procedure and recovery plan, not authorization. Required before remote migration: named independent reviewer, Cloudflare Time Travel bookmark / recovery test, full migration risk acceptance and documented user staging-only approval. Required before production: hosted real Worker UAT, source version fence integrated, durable journal/idempotency, RBAC, finance, audit and operations signoffs, and separate production change control.

No steps in this PR execute commands, touch remote D1 or enable a deployment.
