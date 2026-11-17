# Stage 01S-2 — Proposed additional financial-input source guards

**Draft only — no migration applied, no production/staging D1 access.**

Complement Stage 01S with fifteen proposed SQLite/D1 BEFORE triggers across:
- shift_collections (cash, UPI, card, credit and bank-drop inputs);
- cng_shift_logs and cng_pressure_readings;
- lube_shift_sales;
- operational_shift_product_prices (shift-specific price snapshots).

INSERT/UPDATE/DELETE operations require all affected shift references to be OPEN. An UPDATE cannot reassign a row to another shift unless both old and new shift are OPEN. Synthetic local test creates an OPEN shift, writes collection/CNG evidence, claims CLOSING, then attempts direct SQL UPDATE/DELETE/INSERT, verifying rejection and preservation.

**Limitations and release blockers:**
1. This does **not** freeze shared master/outlet prices, calibration charts, credit party data, lube SKU pricing, or all supporting service APIs. Their history/version dependencies must be audited.
2. Triggers based on shift status cannot by themselves guarantee source snapshot consistency during two separate D1 close transactions or before a claim.
3. This SQL is only an uninstalled proposal outside frozen migrations 0001–0035, not a release candidate to apply blindly.
4. Full Worker + hosted dedicated D1 staging integration, cross-Worker concurrency, network-after-commit ambiguity, journal integration, approved idempotency, data-version fencing, admin close-empty audit safety, backup/restore and RBAC/UAT are outstanding.
5. Operations, finance, audit and security owners must approve behavior, exception corrections, migration and release.
6. Keep all dependent PRs draft; no production migration, database writes or deployment authorized.
