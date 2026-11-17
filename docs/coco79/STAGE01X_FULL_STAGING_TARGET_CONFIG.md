# Stage 01X — Full hosted D1 staging target (configuration only)

## Independently confirmed in Cloudflare dashboard
- New staging D1 name: `iocl-phase1-full-staging`
- Database UUID: `daf55190-af65-4b72-b5f6-8c87b70c4d35`
- Cloudflare Console read-only `sqlite_master` query showed only Cloudflare internal `_cf_KV` table, **zero application tables**.
- Separate older Stage 01K scratch DB UUID: `9025eb32-4ea8-4bb9-a6e1-ab8ba55bf782`; it is **not** the full staging target.
- Production D1 UUID in repository's `wrangler.jsonc`: `305f76c6-c940-443f-86a9-33c309a55578`; **never target this for stage tests**.

## What is configured
`scripts/stage01x/wrangler.phase1-staging.jsonc` is an **explicit opt-in**, isolated Wrangler config with:
- A unique nonproduction Worker name and ENVIRONMENT=staging.
- The new, verified full staging D1 UUID and `DB` binding.
- No production R2 bucket binding or deployed host configuration.
- Source/migrations paths relative to the config file.
- A deliberately non-routable placeholder CORS origin (`https://staging.invalid`); before any real Worker integration, provision an approved staging hostname, isolated R2 bucket and credentials separately.

`tests/stage01xIsolatedStagingConfig.test.ts` checks the staging UUID against both production and Stage 01K, relative paths, Worker/environment isolation, and no production R2 bucket.

## Before executing any migration or hosted application test
1. Review and approve all unchanged baseline migrations 0001–0035 and confirm the exact target DB via Wrangler read-only inspection using **only an explicit `--config scripts/stage01x/wrangler.phase1-staging.jsonc` argument**; validate actual command semantics and config-relative path resolution with installed Wrangler.
2. Have an independent reviewer check the staging UUID/account, migration content, expected schema and absence of live data. Preserve an export/bookmark/rollback strategy.
3. Create and approve a migration plan; distinguish baseline app schema from proposed Stage 01P journal and Stage 01S/S-2 triggers (which are not official migrations and must **not** be auto-applied).
4. Run migrations **only after approval**, targeting that explicit config and UUID, never `wrangler.jsonc` or the broad `db:migrate:remote` package script.
5. Then run real hosted Worker/D1 synthetic UAT, with security, finance, audit and ops signoffs.

**This change does not run Wrangler, modify D1, deploy anything, merge branches or claim release approval. Stage 01V NO-GO gate remains in force.**
