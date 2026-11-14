# Stage 01S — Proposed database-side source-input freeze

**Status: isolated synthetic test candidate, NOT an installed migration or production safeguard.**

## What this draft tests

`scripts/stage01s/PROPOSED_open_only_source_triggers.sql` defines 15 SQLite/D1-compatible BEFORE triggers (INSERT, UPDATE, DELETE) on five shift-scoped source tables:

- `nozzle_meter_readings`
- `nozzle_unavailability_records`
- `tank_stock_readings`
- `fuel_receipts`
- `fuel_receipt_tank_lines` (parent receipt determines shift status)

Each trigger rejects an attempted change unless the affected shift is OPEN, including reassignment of a row between shift IDs in UPDATE. The local-D1 synthetic regression applies the script **only in a disposable fixture** and checks that valid OPEN inserts succeed and direct UPDATE/DELETE/INSERT while CLOSING fail. No remote DB has been accessed.

## Why not a production migration yet

These five tables are only part of the shift-close calculation source. Other source inputs (CNG logs, lubricant movement, payment/collection records, product prices, calibration revisions and source relationships) require an inventory of every writable API/repository path. Applying these triggers alone as a release fix would give a false assurance that inputs are fully frozen.

Additionally, a status-based guard prevents shift-scoped writes during CLOSING but does not create a snapshot/version-fence for price or calibration masters shared across shifts; it cannot guarantee that the read-only calculation and both transactional batches observe the same inputs. A complete database-side fence or frozen version-bound calculation is required before release.

## Gates before any hosted D1 application

1. Obtain operations, finance and audit agreement on CLOSING input immutability and handling exceptional corrections.
2. Inventory all authoritative inputs used by stock/financial previews and test all mutation routes, including manual and admin paths.
3. Design a new reviewed migration after the frozen 0001–0035 release and check all legacy records; never edit frozen migration files or run this SQL directly against production.
4. Test rollback and concurrency on a disposable synthetic Cloudflare-hosted staging D1 and its full Worker app, not only scratch tables.
5. Complete network-after-commit, audit integrity, RBAC, backup/restore, independent reviewers and final go/no-go signoff.

**No runtime route or repository integration, flag activation, migration, production deploy or remote D1 execution in this PR.**
