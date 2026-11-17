# Stage 01B — Atomic tank-reading batch save

**Date:** 12 November 2026 · **Scope:** Existing Daily Operations & DSR tank readings only  
**Status:** Code change in separate PR #17, not merged or deployed; requires CI and operating owner review.

## Finding

The pre-existing endpoint `POST /api/v1/shifts/:shiftId/tank-readings/batch` validates every input row and calibrates tank dips, then **loops over sequential row-level writes**. If the second write fails (for example, due to a database constraint or outage), the first row may already be committed. The comment claiming that prevalidation made the batch “all-or-nothing” was not sufficient for database-level atomicity.

## Implemented protection

- Keep **identical API URL, input fields, permission, reading types, calibration conversion, output structure, CREATE/UPDATE semantics and audit action**.
- Before persistence, calculate all rows with the existing `TankCalibrationService`, as previously done.
- `PumpRepository.saveTankReadingsBatchAtomic` persists the prepared readings in one **Cloudflare D1 `batch` transaction**. SQL errors in later statements cause rollback of the earlier statements.
- Inserts and updates check that the operational shift remains `OPEN`. A closed/closing shift causes a not-null constraint violation rather than a silent 0-row update that could allow partial acceptance.
- The endpoint returns an explicit error on failure. If D1 reports a successful batch but a later response/readback cannot be verified, it instructs the operator to **refresh before trying again** instead of claiming that rollback occurred.
- No change to pump/infrastructure masters, chart points/activation, stock formulas, water dip defaults, receipt ledger, financial calculations or source records.

## Automated tests

Existing `tests/tankStockAndReconciliation.test.ts` now includes:

- **17:** database trigger rejects the second new reading; asserts first new reading **does not persist**.
- **18:** database trigger rejects the second reading after an existing opening reading is updated; asserts the original opening value is **unchanged** and no closing reading was created.
- **19:** successful mixed UPDATE/CREATE request retains existing reading ID, expected response action labels and exact saved dip values.

The tests use an isolated local D1 SQLite database and synthetic values; they do not import COCO 79 documents or modify production D1.

## Additional safety review, not addressed in Stage 01B

1. The audit entry is still written after the D1 batch. Its fail/retry behavior is separate from reading-row atomicity and needs targeted review before claiming **atomic audit logging**.
2. Calibration's `ensureInitialCalibrationChartForLegacyPoints` helper runs during input preparation in older installations. We did not change it; run only with controlled staging and no production chart updates.
3. A network interruption may leave the client uncertain about the result even if the server committed. Refresh the shift to establish authoritative status before retrying.
4. Missing water dip currently defaults to `0.000` in the UI. Whether a blank means unmeasured or true zero requires an approved operational decision, so this PR deliberately does not change it.
5. Shift closure's generic variance reason, computed reconciliation permission, and DSR invoice-vs-measured receipt labeling remain identified in [Stage 01A trace](./STAGE01A_DAILY_OPERATIONS_TRACE.md).

## Release gate

- [ ] TypeScript, full automated suite and production build pass on the final commit
- [ ] Confirm rollback behavior under staging D1 (not only local SQLite)
- [ ] Test operator save/reload and refresh-first retry messaging
- [ ] Obtain operational approval and merge Stage 00/01A prerequisite PRs
- [ ] Deploy only after an approved release window and backup verification

**Pump Infrastructure remains deferred.**
