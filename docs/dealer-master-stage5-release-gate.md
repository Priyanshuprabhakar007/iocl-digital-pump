# Stage 5 — IOCL Dealer Master deployment readiness (no hosted writes)

## Scope and verdict

**Local D1 rehearsal:** implemented as a **dedicated GitHub Actions job**, using official Wrangler's **disposable local D1**. Cloudflare's local D1 sandbox rejects `PRAGMA integrity_check` with `SQLITE_AUTH`, so that unsupported operation is **not claimed** as a passed test; verify supported foreign-key, migration-ledger, schema and business integrity checks instead. This validates the frozen 35 base migrations plus proposed 0036/0037/0038, schema/triggers, foreign keys, a 35-row migration ledger, and integration tests.

**Hosted staging:** NO-GO until a demonstrably separate staging D1 ID, Worker, and fully isolated authentication/permissions are established and reviewed. Prior project documentation flags hosted-D1 migration incompatibilities in the baseline (especially 0007/0032, with foreign-key behavior differing from a disposable SQLite test). A successful local rehearsal is **not proof of hosted-D1 compatibility**.

**Production:** NO-GO. No migration, approved batch, or production import may be executed by a CI job in this PR. Stage 5 changes no production code path.

## Vercel Free deployment budget

The user has a restricted free Vercel build allowance. Implement Stage 5 in **one consolidated GitHub commit and one draft PR**; avoid pushing intermediate commits just to rerun tests. All D1 rehearsals execute in GitHub Actions and do **not** require Vercel preview deployments. A PR commit can still trigger one automatic Vercel preview if the Vercel project is configured that way; monitor that separately. Do not merge #74/#75/#76/#77 simply to trigger another build. For a strict zero-preview requirement, configure an Ignored Build Step in Vercel for dedicated QA-only branches *after reviewing the project build settings*.

## Available automated evidence

`.github/workflows/dealer-master-stage5-local-d1.yml`:
- no Cloudflare credentials, no production Wrangler config;
- synthetic `database_id` on a completely isolated `.stage5-local/state`;
- frozen migrations 0001–0035 unchanged;
- proposal 0036, then 0037, then 0038, with official Wrangler in `--local` mode;
- table/trigger/index existence, `PRAGMA foreign_key_check`, and exactly 35 applied baseline migrations (`d1_migrations`);
- Stage 4 authorized/scope/fill-only/duplicate/batch-audit regression tests;
- a sanitized, seven-day GitHub Actions artifact (object names, no customer or business records).

### Manual hosted staging gate (not run automatically)

1. **Identify account and target:** verify intended *staging* D1 database UUID and Worker binding separately from the known production database in `wrangler.jsonc`; do not use existing production vars or R2 bucket. A staging name alone is not proof of separation. Match actual D1 UUID via Cloudflare dashboard, and independently verify Worker bindings and allowed origins. Never reuse the production user session in staging.
2. **Baseline assessment:** inspect staging migration history, 0035 baseline, 0036 schema, 0037 lease terms, and 0038 proposals. Review baseline 0007/0032 D1 foreign-key behavior noted in `docs/coco79/STAGE01Z_HOSTED_D1_MIGRATION_COMPATIBILITY.md`. Do not run frozen migrations on a populated instance just because local tests passed. Do not use the existing `deploy-cloudflare-demo.yml` workflow.
3. **Recovery point:** on the intended D1, verify storage version, availability of Cloudflare D1 Time Travel, and record current bookmark and UTC time in a private operational change ticket. Cloudflare Time Travel history may be **7 days on Workers Free**, **30 days on Workers Paid**; confirm the actual account and D1 version. Prefer a separately verified export/restore drill as well. Do **not** execute Time Travel restore as an ordinary rollback test because it overwrites the database in place.
4. **Isolated test:** rehearse 0036 → 0037 → 0038 only on a dedicated staging DB with no production customer data, credentials, frontend API, or R2 references. Run schema checks, `PRAGMA foreign_key_check`, sample RO/land/lease writes and re-upload; confirm identity matching and idempotency.
5. **Application acceptance:** use original XLSX, inspect actual 131 rows, all 26 business columns, 13 yellow-marked rows, 214 protected yellow cells (including serial-number cells), and verify yellow preservation field-by-field. Confirm source row numbers after blank rows, City/PIN supplement provenance, hierarchy aliases, duplicate and archived RO blocks, and the CREATE/FILL_MISSING/PROTECTED/UNCHANGED/CONFLICT/REVIEW report.
6. **Legal and financial separation:** confirm that source rent and owner details do NOT create signed land-lease agreements or modify canonical rent ledgers. Validate signing/document matching as a separate human decision. Confirm source units SQMT, SQMTR, ACR are preserved, never coerced to SQFT/SQYD silently.
7. **Approvals and rollout:** operations, DB owner and application admin sign off on staging evidence; only then create a distinct production deploy/migration plan, secure a confirmed recoverable bookmark/export and authorized maintenance window. **Production import requires its own separate explicit data-change approval**, after preview and record-level review; never assume approval from a GitHub merge.

## Release checklist

| Gate | Current status |
|---|---|
| #74 26-column read-only audit | Draft PR; not merged |
| #75 RO/Land/lease source storage | Draft PR; not merged |
| #76 controlled import workflow | Draft PR; not merged |
| #77 local D1 release safety (this PR) | Draft PR; local workflow requires green run |
| Frozen 0001–0035 original migration baseline | Keep unchanged |
| Cloudflare-hosted staging schema & D1 compatibility | **Not verified / NO-GO** |
| Staging Worker/backend isolation | **Not verified / NO-GO** |
| Hosted staging full 131-row rehearsal | **Not executed / NO-GO** |
| Production D1 recovery bookmark/export | **Not verified / NO-GO** |
| Production migration 0037/0038 approval | **Not given / NO-GO** |
| Production Excel batch import approval | **Not given / NO-GO** |

## Operational references (verify before change)

- D1 local development: https://developers.cloudflare.com/d1/best-practices/local-development/
- Wrangler D1 commands: https://developers.cloudflare.com/d1/wrangler-commands/
- Time Travel and restore warnings: https://developers.cloudflare.com/d1/reference/time-travel/

The local Action must use no remote database credentials. A GitHub green check does not authorize application write access to production.
