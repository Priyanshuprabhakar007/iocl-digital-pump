# Stage 01Y — Offline preflight of baseline migrations (no DB writes)

## Verified staging identity
The independent Cloudflare metadata GET successfully identified the new full staging D1 `iocl-phase1-full-staging` (`daf55190-af65-4b72-b5f6-8c87b70c4d35`) under Cloudflare account `93888554ef9d9e0b8c18b322683a9652`. The new GitHub Environment `iocl-phase1-staging` has variables for account and D1 IDs and an encrypted read-only API token. The metadata-only workflow completed successfully. Console read-only inspection saw only `_cf_KV` with no application tables.

## Migration inventory
The repository migration folder contains 35 ordered `.sql` files: 0001 through 0035, followed by an auxiliary `0032_stages` directory. The new `offlineBaselineMigrationPreflight.ts` inventories filenames, sizes, SHA-256 digests and presence of potentially impactful SQL syntax. It compares the isolated staging config with the expected target UUID, rejects production and old Stage 01K scratch IDs, checks it resolves to the expected migration directory, and flags structural/data changes for mandatory human review.

For example, 0003 alters and updates `nozzle_meter_readings`, and 0004 rebuilds it using `INSERT INTO ... SELECT`, `DROP TABLE`, and `ALTER TABLE ... RENAME`. On a fresh empty DB these may be valid baseline steps, but this requires verification of all dependencies and the exact Wrangler behavior rather than assuming safety. Regex flags cannot prove the semantic correctness of SQL.

## Execute gates — NOT YET COMPLETE
1. Review complete baseline SQL content and dependencies, including migration 0032 stages and compatibility with installed Wrangler and D1. Check any PR-specific new scripts are excluded from automatic baseline migration discovery.
2. Obtain migration owner approval and **independent staging identity confirmation** and record exact baseline SHA-256 inventory.
3. With a read-only Cloudflare token, verify live schema still has no app tables and compare actual Cloudflare account and database IDs. Do not make a write-capable token available to the read-only workflow.
4. Document backups, Time Travel restore point and responsible operator; approve rollback procedure before modifying even disposable staging.
5. Only after explicit staging-only authorization, run reviewed migrations through `wrangler d1 migrations apply` with `--config scripts/stage01x/wrangler.phase1-staging.jsonc`, exact staging DB name and `--remote`. Never use the production-default `db:migrate:remote` script. Validate installed Wrangler CLI syntax and path resolution before running.
6. Reinspect schema, check `_d1_migrations` and run hosted full Worker/D1 synthetic UAT, with explicit secrets separation. Staging migration success alone will not authorize deploying the app.
7. Journal and source guards from prior draft PRs remain **uninstalled proposals**; they must not be auto-migrated or assumed to be available.

**Status: NO-GO for production. This PR performs no network calls, SQL execution, migrations, deployments, merges or automatic write operations.**
