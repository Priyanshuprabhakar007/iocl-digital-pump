# Stage 01R — Source-data version fence candidate

Status: **pure contract and synthetic tests only; no runtime protection yet.**

The Stage 01P shift close reads source inputs to preview financial and tank reconciliation before making two separate atomic batches. A tank reading, receipt, nozzle entry, price or calibration reference modified between the initial snapshot and the commit would invalidate the preview. Stage 01R's `compareCloseSourceSnapshots` classifies changes across nine relevant data collections. It is deliberately not called from the API.

## Required implementation gate

1. Identify every actual calculation input and its authoritative version in the schema, including receipt status, tank dip, nozzle availability, price-effective intervals, financial collections and calibration chart identity.
2. Capture an authoritative, consistent source snapshot **within D1**, not from unrelated eventually changing route reads; freeze mutable inputs while CLOSING.
3. The atomic `PREPARED` batch must verify the same source versions as a **database-side conditional fence** before inserting stock and financial reconciliation. A comparison performed earlier by application code is insufficient because an input may change immediately afterward.
4. The separate `COMMITTED` batch must likewise enforce the authorized close attempt and valid prepared snapshot. On a mismatch or uncertain result, preserve CLOSING and journal evidence and require review; never auto-delete/reopen/retry.
5. Test concurrent input writes, post-commit network loss and independent Workers against controlled hosted D1 using synthetic data. Preserve audit and immutable records.
6. Review and approve exact versions, security/outlet scope, fallback behavior and migration implications with operations, finance and audit owners.

## Safety

- No changes to frozen migrations 0001–0035, proposed journal SQL, DB bindings, live routes, R2 or production.
- Passing this pure test suite is **not** proof of hosted D1 transaction safety.
- Keep stacked draft PRs unmerged until full hosted Worker UAT, backup/restore and signoffs.
