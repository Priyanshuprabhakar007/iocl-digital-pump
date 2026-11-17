# Stage 01Z — Cloudflare-hosted D1 baseline migration compatibility review

## Current verdict: **NO-GO** for applying 0001–0035 remotely

Stage 01Y confirmed 35 ordered baseline SQL files and the isolated Cloudflare D1 target. But this does **not** establish that the same SQL can execute safely on Cloudflare-hosted D1.

### Confirmed compatibility concern

- `migrations/0007_phase2b_final_integrity.sql` has `PRAGMA foreign_keys=OFF;` at line 3; it then copies and drops `operational_shifts` and renames its replacement.
- `migrations/0032_global_designation_and_shift_masters.sql` has `PRAGMA foreign_keys = OFF;` at line 8 and `PRAGMA legacy_alter_table = ON;` at line 9; it rebuilds `operational_shifts` plus multiple HR tables and applies data updates/triggers. It finishes with `PRAGMA foreign_key_check;`.
- `0004`, `0010`, `0011` and `0032` also contain `DROP TABLE` steps in schema rebuilds, requiring reviewed foreign key/cascade safety.
- Migrating a fresh, unseeded D1 may avoid some data-rebuild hazards but does not prove compatibility of the DDL or SQL under D1's transaction semantics.

Cloudflare documents that D1 queries/migrations execute in implicit transactions, so `PRAGMA foreign_keys=OFF` cannot turn off enforcement within them. `PRAGMA defer_foreign_keys=ON` is supported but **does not disable cascading actions**; it is not an automatic substitute without reviewing all table dependencies and the exact rename/drop order.

Official references:
- https://developers.cloudflare.com/d1/sql-api/foreign-keys/
- https://developers.cloudflare.com/d1/reference/migrations/
- https://developers.cloudflare.com/d1/sql-api/sql-statements/

## Offline gate included here

`scripts/stage01z/inspectHostedD1MigrationCompatibility.ts` detects attempts to switch foreign keys OFF, table-drop rebuilds and updates to existing rows. Its intentionally fixed verdict is **not safe for unsupervised remote migration**. Four regression tests check mandatory migration findings.

## Correct next engineering tasks

1. Produce a dependency map for the exact fresh schema, especially `operational_shifts`, HR tables, child foreign keys, trigger drop/create order and indexes. Trace what a `DROP TABLE` does when D1 foreign-key enforcement stays enabled.
2. Rehearse with **Wrangler's local D1 engine** on a fresh disposable DB using a separate explicit config; tests using the Bun LocalD1 adapter do not prove hosted D1 behavior.
3. Develop a separately reviewed *staging-only* D1-compatible baseline migration strategy. Keep original production migrations 0001–0035 frozen; do not quietly rewrite or overwrite them.
4. Obtain a documented rollback/Time Travel plan and operator approval **before** applying anything to the full hosted staging DB.
5. Validate post-migration schema, indexes, triggers and `PRAGMA foreign_key_check` before running real Worker integration tests.
6. Require security/finance/audit/operations signoffs, journal/version fencing integration and go/no-go approval before production deployment.

Read-only staging token remains scoped to D1 Read. This draft performs no Cloudflare writes, no migrations, no deployments, and leaves both staging and production schemas unchanged.
