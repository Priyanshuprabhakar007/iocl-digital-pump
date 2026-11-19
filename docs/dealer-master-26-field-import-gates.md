# Dealer Master full-field import — stage 1 and subsequent gates

The workbook contains **27 columns**, including S. NO. (serial number), and **26 business columns**. `src/shared/dealerMasterFieldCoverage.ts` tracks every business column by its real destination: organizational hierarchy, RO master, land ownership and lease agreement.

## Non-negotiable safeguards

1. The user identifies yellow-filled individual cells as already manually entered. Treat yellow as a **protect-this-source-cell** instruction, **not as evidence that every destination module has a correct corresponding database record**. For example, a yellow RO Name does not establish that a lease agreement exists.
2. Match existing outlet records by immutable RO code. Match land and lease destinations **separately** by outlet ID and verified order/agreement references, effective dates, counterparty and documents. Do not create a second agreement because the same RO is in the workbook.
3. New/unhighlighted values are **candidates**, not automatically approved overwrites. Source blanks must stay unknown and must never zero-out existing data.
4. Preserve the original 26 values and their presentation units as an import evidence snapshot. Normalize dates, tax amounts, escalation rates, area units and rent only after source verification. Land owner is not automatically the legal agreement counterparty.
5. Block unknown hierarchy, missing city/PIN, uncertain site classifications, or missing source proof. Do not invent values.
6. The current React uploader has an older, outlet-only write mechanism. For a 26-column workbook, **the new coverage audit disables that write mechanism** until proper module-wise write paths are implemented. It must never silently claim to have imported land or agreement data.

## Target structured storage

The current production `retail_outlets` table stores RO code, name, address, district, city, PIN, organizational hierarchy and limited outlet type. It does not store Email, Contact No, Customer Group, original Site Description, Market Class, Commission Date or raw Land Status.

Extend the RO master with a linked one-to-one record containing contact email, contact phone, customer group, original site description, market class and commissioned date. Link a separate `land_ownership` record by outlet ID holding raw land status, verified owner, and original area/measurement unit. Keep separate source agreement metadata by outlet + verified agreement ID for order number, source dates, GST, duration, escalation, interval and notes. Do **not** merge source records with legal agreements until independently verified.

The existing `coco_agreement_details` master supports agreement type/number, start/end, counterparty and document evidence. Monthly rent and sq yd/sq ft lease dimensions require the **additive 0037 lease terms migration**, currently documented separately and shown unavailable in the production screen. For source area units `SQMT`, `SQMTR` and `ACR`, preserve original values and add conversion/explicit native unit support only after engineering review.

### Implementation gates

- **Stage 1 (this PR):** 26-column source audit, per-cell yellow protection detection, detailed mapping to intended modules, read-only mode. No production D1/R2 writes.
- **Stage 2:** additive reviewed schema + safe API endpoints for RO metadata and land ownership, with role/scope permission, immutable RO code, per-field no-overwrite logic, source provenance, and full audit logging. Disposable local D1 tests.
- **Stage 3:** reviewed agreement-linking and extra lease terms, with 0037 migration preflight, deduplication, legal document validation and full rollback/retry plan. No automatically assumed legal owner/counterparty.
- **Stage 4:** module-wise dry-run comparing *live* record IDs, showing `CREATE`, `FILL MISSING`, `PROTECTED`, `UNCHANGED`, `CONFLICT`, `REVIEW` for each destination, plus explicit second approval for writes and import audit history.
- **Stage 5:** isolated staging acceptance test with actual workbook; verify production DB ID, backup/bookmark, app permissions, and migrations before any authorized production deployment/import.

Current stage 1 does **not** assert that all 26 values are already persisted. Do not merge or deploy stage 2+ database mutations or migrations without a separately authorized release.
