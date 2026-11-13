# Stage 01I — Controlled hosted D1 staging verification gate

**Status:** planning and read-only inspection only. No hosted verification executed by this PR.

## Critical production isolation

The tracked root `wrangler.jsonc` config has a production `ENVIRONMENT` value and a production D1 binding. **Do not run** `wrangler d1 execute`, `wrangler d1 migrations apply`, `wrangler deploy`, or `--remote` against that configuration for this stage. Never substitute a database ID found in the repository for the dedicated staging database.

Use a **separate** Cloudflare D1 database and staging-specific configuration outside this repo, verified by an authorized operator. Record account, UUID, database name, creation provenance and empty/synthetic-data proof in restricted deployment records. Do not publish credentials or production identifiers to issues, PRs or chat.

## Gate 0 — Required before any remote command

- [ ] Operations owner approves disposable staging dataset and authorizes hosted D1 tests.
- [ ] Finance/audit owners have not yet approved remediation; do not modify close workflow.
- [ ] An authorized Cloudflare operator confirms current account and exact D1 database UUID/name from the Cloudflare dashboard.
- [ ] Independent second reviewer confirms staging UUID is different from every production binding and the data contains **synthetic records only**.
- [ ] Confirm isolated permissions/token scope; do not paste token into terminal logs, GitHub, chat or screenshots.
- [ ] Back up staging and record a safe rollback/destroy plan.
- [ ] Use isolated staging binding/config and never copy live production D1 data or R2 objects.
- [ ] Explicitly verify migration history/table schema against the code before executing the read-only SQL.
- [ ] Capture only sanitized findings, count totals and CI/verification evidence for review.

## Gate 1 — Read-only inspection

Use `scripts/stage01i-readonly-close-evidence.sql` **only after Gate 0** on the verified staging database via a deliberately reviewed staging-specific command/configuration. The SQL has only SELECT statements. An empty synthetic staging database may legitimately return zero rows; this is not proof of transaction safety.

Record:
- counts by shift status;
- CLOSED/LOCKED rows missing stock/finance/audit evidence;
- OPEN rows with stale evidence and CLOSING rows requiring review;
- whether result schema and row counts match the application interpretation.

Do **not** attempt recovery with SQL, manually adjust statuses or delete rows.

## Gate 2 — Separate disposable fault-injection test plan (NOT EXECUTED)

Only after approval and a review of database transactional capabilities:
1. Seed a uniquely labeled synthetic outlet and shift in the disposable staging DB.
2. Reproduce each Stage 01E failure in a controlled environment, without modifying shared production Worker bindings.
3. Validate hosted D1 atomicity/rollback for stock + finance + final shift + mandatory audit.
4. Verify that a failed financial INSERT preserves any previous stock evidence.
5. Verify interrupted/timeout-after-commit outcomes and idempotent request replay, with durable attempt identity once approved and implemented.
6. Verify that recovery requests are outlet-scoped, independently audited and never blindly reopen CLOSED.
7. Produce scrubbed test reports with exact staging commit/version, date, evidence and the operations/finance/audit signoff outcome.

## Go / no-go policy

- This PR does not certify D1 transactions, fault recovery or deployment readiness.
- Stage 01G's classifier is pure and not connected to the API, and it cannot prevent known production inconsistencies on its own.
- Even successful hosted staging tests are not an authorization to merge the stacked draft PRs or deploy.
- Remediation changes require a separately reviewed, approved implementation and release/backup gate.
