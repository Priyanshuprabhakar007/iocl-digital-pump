# Stage 6 — Hosted Cloudflare D1 staging: read-only discovery only

## Scope and current safety verdict

**Local Stage 5 Wrangler D1 passed** in PR #77, but that did not prove hosted staging or backend/data isolation. Stage 6 **only prepares verified, read-only hosted D1 inspection**. It does not apply baseline migrations, write sample records, deploy a Worker, create an R2 bucket, merge a PR or authorize production import.

Cloudflare D1 API accepts a **D1 Read** token for GET database details and POST SQL query. POST is only a transport method here: the TypeScript script uses an exact **three-query allowlist**, selecting `sqlite_master` object names, `d1_migrations` filenames and `PRAGMA foreign_key_check`. It never fetches outlet/customer rows. No SQL can be supplied from environment, Excel, workflow inputs or command line.

References: https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/get/ and https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/

## Target isolation (independently verify in Cloudflare before execution)

- Staging D1 configured under `scripts/stage01x/wrangler.phase1-staging.jsonc`, name `iocl-phase1-full-staging`, distinct from root `wrangler.jsonc` production D1 and older scratch D1.
- Existing November 14 runbook recorded the staging database as **empty** at that time. Do not assume the present schema is still empty.
- This workflow compares the GitHub environment's account/UUID with pinned, separate staging identities **before any network request**; then verifies the actual Cloudflare response matches the staging name/UUID. Mismatch stops immediately.
- Use GitHub Environment `iocl-phase1-staging`, GitHub environment variables `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_STAGING_D1_ID`, and secret `CLOUDFLARE_API_TOKEN` with **D1 Read only**, restricted to the staging database/account. Never reuse a production write token, put tokens into ChatGPT, or commit them. On the `dilseinvite-code` repository, the availability of these environment resources is **not yet verified** (prior runbook documented them on an older repository/account).
- This new workflow's hosted job runs **only after an explicit workflow_dispatch confirmation**, not on PR pushes. Workflow dispatch may require the workflow to exist on the repository default branch; do **not** merge these draft PRs merely to run the check. An authorized operator can instead check out the reviewed branch in a restricted environment and run the script manually with approved read-only secrets. Do not modify main just to dispatch the job.

## Workflow

1. Review and sign off on staging D1 account/UUID, Worker bindings (none to production), read-only GitHub environment permissions, and target identity in Cloudflare Dashboard.
2. Choose an approved, nonproduction execution method: `bun scripts/dealer-master-stage6/hosted-readonly.ts` from the exact reviewed SHA with `STAGE6_APPROVED_READONLY=confirm-staging-readonly` and the three privately supplied read-only environment variables, or the protected GitHub Actions manual workflow after it is available. Do not run the root Wrangler config.
3. The script checks actual staging metadata and only schema names/ledger/FK status. It writes a **sanitized** `.stage6-readonly/evidence.json` with counts and readiness code; no credentials or outlet records. A green workflow indicates *successful inspection*, not production readiness.
4. Interpret the result:
   - `EMPTY_STAGING`: no application tables yet. **NO-GO** for hosted import or applying the full baseline automatically. Review 0007/0032 hosted foreign-key and rebuild risks from Stage 01Z.
   - `BASELINE_LEDGER_MISMATCH`, `FOREIGN_KEY_VIOLATIONS`, missing 0036/0037/0038: **NO-GO**. Investigate differences; never auto-migrate.
   - `SCHEMA_PRESENT_APP_UAT_PENDING`: expected database objects present, but **still NO-GO for production**. Requires isolated Worker/API credentials, actual workbook test, signed lease verification, recovery bookmark and independent approval.
5. A staging-only schema migration can be planned **only in a separate approved change**, after verifying hosted D1 baseline compatibility, staging isolation, backup/bookmark and rollback capabilities. Never add hosted D1 writes to this workflow.

## Vercel Free build budget

Development performed as a **single consolidated commit** on a stacked draft PR branch. CI schema and safety tests run on GitHub Actions; no Vercel build is needed to inspect the database, but the GitHub integration may automatically trigger **one preview** for the commit. To reduce future builds, configure Vercel Project → Settings → Git → **Ignored Build Step** (requires an account/project setting and should be reviewed so real production builds are never skipped). Vercel's new *pull-request-only preview* preset can reduce previews from loose feature branches; it does not exclude open-PR branches like these.

## Remaining release gates

- Cloudflare hosted staging metadata/schema read-only check: **not executed in this PR**.
- Hosted D1 baseline compatibility and 0036/0037/0038 changes: **not approved**.
- Staging Worker, isolated auth, R2/document-vault bindings: **not verified**.
- Original 131-outlet XLSX complete stage 4 replay in hosted staging: **not executed**.
- Production bookmark/export recovery, migration approval, bulk import review: **not given**.

Keep PRs #74 → #75 → #76 → #77 → #78 stacked and unmerged until all stage gates are signed off.
