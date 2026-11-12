# Stage 01A — Daily Operations & DSR functional trace

**Date:** 12 November 2026  
**Reference:** COCO 79 (RO 369460), MDG 2024 and the Stage 00 document map  
**Baseline code:** `main` @ `229925f`; dependent on draft Stage 00 PR #15  
**Status:** **Code traced, focused synthetic tests added; live end-to-end UAT not performed**  
**Boundaries:** No Pump Infrastructure work, no calibration chart creation/activation, no historical COCO 79 import, no Cloudflare D1/R2 changes.

## 1. What is already implemented

The user-facing workspace in `src/frontend/pages/DailyOperationsPage.tsx` uses:

- Outlet selection from `ActiveOutletContext`, local business date, and two UI modes (`WORKSPACE` daily entry / `DSR` summary).
- `GET /api/v1/outlets/:outletId/daily-operations?businessDate=...` to load shifts, templates, tank/nozzle entry grids and the daily summary.
- `GET /api/v1/outlets/:outletId/fuel/daily-summary?businessDate=...` to refresh summary from saved records without resaving drafts.
- Existing role-scoped permissions for shift opening, tank/nozzle reading entry, reconciliation and close.
- Per-row and bulk tank reading save; per-row and bulk nozzle reading save; explicit confirmation of prefilled **5.000 L** nozzle testing; recorded nozzle unavailability; summary and close controls.
- `StockOperationsPage.tsx` contains the detailed fuel receipt/decantation workflow; the Daily Operations page reads associated receipt counts and stock status. **Receipt completion must not be inferred from the daily summary alone.**

Existing integration suites include `tests/dailyFuelOperations.test.ts` (26 cases), `tests/tankStockAndReconciliation.test.ts` (16), `tests/fuelReceiptCompletionAndShiftClose.test.ts`, `tests/nozzleDefaultTestingQuantity.test.ts`, `tests/endToEndTankCalibration.test.ts`, plus shift-open/close tests. **These tests are evidence of covered simulated scenarios, not proof of deployed live-data correctness.**

## 2. Exact UI → API → service/data trace

| Operator action | UI entry point | API/permission | Service/repository and saved data | Expected observable response |
| --- | --- | --- | --- | --- |
| Choose outlet/date | `DailyOperationsPage` active outlet + `businessDate` | `GET /outlets/:outletId/daily-operations` / `SHIFTS_READ` | `FuelDailyOperationsService.getDailyOperationsBootstrap`; current shift templates, snapshots, receipts, readings, recon | Empty day is `NOT_STARTED`, rather than an invented shift |
| Open shift | `handleOpenShift` | `POST /outlets/:outletId/shifts/open` / `SHIFTS_OPEN` | `PumpRepository.openOperationalShiftWithSnapshot`; `operational_shifts` plus existing tank/nozzle/price snapshot data | One shift per outlet/date/template; outlet-wide OPEN/CLOSING conflict rejection; audit |
| Enter opening/closing tank dip | `handleSaveSingleTankRow`, `handleSaveAllTanks` | `POST /shifts/:shiftId/tank-readings/batch` / `TANK_STOCK_WRITE` | `TankCalibrationService.convertDipToVolume`; `tank_stock_readings`, chart revision fields | Millimetre dip → calibrated gross/water/net litres; error on unavailable/out-of-range chart |
| Enter nozzle totalizers | `handleSaveSingleNozzleRow`, `handleSaveAllNozzles` | `POST /shifts/:shiftId/readings` or `/batch` / `METER_READINGS_WRITE` | `nozzle_meter_readings`; integer milliunits `gross = closing - opening`, `net = gross - testing` | Saved values reflected in DU/product summaries; missing reading remains visible |
| Mark a nozzle unavailable | `handleRecordUnavailability` | `POST /shifts/:shiftId/nozzle-unavailability` / `METER_READINGS_WRITE` | `nozzle_unavailability_records` | Reasoned unavailable status rather than forced 0 meter reading |
| Record tanker receipt | Stock/Decantation page | `POST /shifts/:shiftId/fuel-receipts` / `FUEL_RECEIPTS_WRITE`; status/line endpoints | `fuel_receipts`, `fuel_receipt_tank_lines`; density tolerance and PRE/POST dip links | Invoice and actual receipt retained distinctly; statuses/quality/variance audited |
| Compute stock reconciliation | `handleComputeReconciliation` | `POST /shifts/:shiftId/stock-reconciliation/compute`; currently guarded by `STOCK_RECONCILIATION_READ` | `PumpRepository.calculateAndSaveShiftStockReconciliation`; `shift_stock_reconciliations` | Theoretical vs physical closing, loss/gain, missing-data error |
| Close shift normally | `handleCloseShift` | `POST /shifts/:shiftId/close` / `SHIFTS_CLOSE` | `ShiftCloseService`; OPEN→CLOSING, completeness checks, stock and financial reconciliations, CLOSED transition, audit | Incomplete readings/receipts rejected, accepted shift locked for edits |
| Exceptional empty-shift close | `handleAdminEmptyClose` | `POST /shifts/:shiftId/close-empty`; global ADMIN scope check | Conditional close only if no operational/finance activity, audited reason | Does not create fake sales/reconciliation for a genuinely empty shift |
| View DSR | `viewMode='DSR'` | Same daily summary/bootstrap API / `SHIFTS_READ` | `FuelDailyOperationsService.computeProductDailySummary` | Product/day totals, per-shift details, missing-field status |
| Monthly report | Reports screen | `GET /outlets/:outletId/reports/monthly-operations` / `REPORTS_READ` | `MonthlyOperationsReportService`, shared product/day logic | Source-consistent daily/monthly numbers after source reconciliation |

*Paths are relative to the `/api/v1` Worker root. The POST reconciliation permission design requires separate review; see A-02 below.*

## 3. Arithmetic and source interpretation

### Tank dip conversion

`TankCalibrationService.convertDipFromPoints`:
1. Uses calibrated `dipMillimetresMilliunits` and `volumeMilliunits` integer-scaled points.
2. Exact point returns the exact stored volume. For an intermediate point it linearly interpolates with `BigInt` arithmetic and half-up rounding to a volume milliunit.
3. Rejects negative/out-of-range dips and charts with fewer than two points; returns the chart ID/revision when available.
4. Water volume is derived using the *same chart*, and **net product volume = gross observed volume − water volume**.

**COCO 79 chart limitation:** The scanned 10/20 KL charts cannot yet support authoritative expected-value assertions without independent manual verification of scale, points, chart identity and units. The new automated tests use **synthetic** points only. **No chart upload, assignment or activation was performed.**

### Nozzle volume

The Worker uses three-decimal integer milliunits:

`gross = closing totalizer − opening totalizer`  
`net = gross − testing quantity`

The UI pre-fills a 5.000 L *testing draft* on new OPEN shifts, but requires operator confirmation; it does **not automatically commit** a 5 L test at shift opening. Operators can confirm 0.000 or an explicitly entered different test amount.

### Product/day DSR

`FuelDailyOperationsService.computeProductDailySummary` uses:
- The earliest applicable shift's opening stock and the latest applicable shift's closing stock.
- Summed nozzle net sales by product and receipt amounts for the business date.
- Stock reconciliation values when available, with a reading/receipt fallback during in-progress shifts.
- `NO_ENTRY`, `PARTIAL`, `COMPLETE` status plus `missingFields` detail.

**Warning for interpretation:** Numeric zeros in a partially completed summary can be placeholders for unavailable aggregates. Always present status and missing fields alongside totals. Invoice figures are dispatch evidence, not independent proof of physically measured received stock.

### Historical COCO 79 test references (not imported)

| Date | Invoice sample (S04) | What we can compare | What we cannot assert yet |
| --- | --- | --- | --- |
| 09-Nov-2026 | MS 9,000 L; HSD 9,000 L; XP95 4,000 L | DSR S03 product/day `Receipt` columns, assuming same business date and invoice group | Tank-specific actual decantation, physical closing, shift/nozzle sales |
| 10-Nov-2026 | MS 13,000 L; HSD 9,000 L | Invoice line totals against S03 product receipt rows | Same-shift measured pre/post dips and cash collection/deposit parity |
| 03→06-Nov-2026 | ORPAK HSD Tank-2 ATG probe fault then replacement | Missing automated reading / restoration evidence semantics | Valid authorization for manual operations without a separate approval |

These are reference quantities extracted during source review; **this code-trace stage did not independently sign off the complete source DSR and invoice scans**.

## 4. Findings and risk register — review before any operational change

| ID | Priority | Code-supported observation | Implication / proposed **next** action |
| --- | --- | --- | --- |
| A-01 | High | `DailyOperationsPage` initializes `openingWaterDipMm` and `closingWaterDipMm` as `'0.000'` when not saved, and batch payload uses `|| '0.000'` | **Clarify policy:** does blank/unmeasured water dip mean 0 or missing? Test with authorized operator before revising input semantics |
| A-02 | High / permissions review | `stockReconciliation.ts` registers a state-changing `POST /stock-reconciliation/compute` with `STOCK_RECONCILIATION_READ` permission (the shared constants currently expose a reconciliation READ permission, not WRITE) | Confirm who is authorized to compute/persist reconciliation and whether permission mapping should change; no change until approved |
| A-03 | High / failure-path review | `tankStock.ts` batch pre-validates all rows but persists them in a sequential loop (`updateTankReadingConditional`/`createTankReadingConditional`) | “All-or-nothing” comment does not by itself prove transactional atomicity. Simulate second/third-row failure, inspect rollback/idempotency and audit before trusting batch under faults |
| A-04 | High / report semantics | `FuelDailyOperationsService.computeProductDailySummary` falls back to invoice quantity when a completed receipt line's measured quantity is null during live/in-progress aggregation | Identify this as **invoiced/unverified receipt** rather than measured receipt wherever displayed; clarify desired financial/stock authority with operations owner |
| A-05 | Medium–High | `DailyOperationsPage.handleCloseShift` sends constant `varianceReason: 'Standard daily shift close'` | This may technically satisfy a required non-zero variance explanation without documenting the actual reason. Review with finance owner before changing closure workflow |
| A-06 | Medium | A single tank-reading POST calls `ensureInitialCalibrationChartForLegacyPoints`; the batch path does so for each row | Saving a reading may create a legacy chart header in older setups. **Do not run this against production to test calibration**; isolate in staging and check side effects |
| A-07 | Medium / operator UX | `selectedTemplateId` in the Daily Operations page is retained unless empty; changing to an outlet with different templates may leave an invalid selected template | Test outlet-switch flow and reset selection to a valid template on appropriate state transition if confirmed |
| A-08 | Medium / failure-path review | `ShiftCloseService` claims OPEN→CLOSING, computes stock and financial reconciliation, then separately finalizes, cleans on errors and writes audit | Existing tests exercise some paths. Simulate audit failure, concurrent edits, rollback failure and retry; do not assert broken production transactions without tests |
| A-09 | Medium / representation | `computeProductDailySummary` returns 0-like aggregate fields even when status `PARTIAL`; missingFields separately lists missing opening/closing and nozzle records | Ensure charts/exports don't represent incomplete metrics as confirmed zero; test product/day status on incomplete shifts |
| A-10 | Operational dependency | COCO 79 S03/S04 does not contain an independently verified full shift's nozzle/dip/finance records | Only partial historical parity tests can be signed off; no full closure calculation validation from DSR alone |

### Confirmed safeguards already found

- Shift-open enforces outlet scope, active-shift conflict and template validation, then takes an atomic snapshot.
- Tank/nozzle inputs are checked against **existing shift snapshots**, not arbitrary asset IDs; closed shifts are immutable via conditional repositories.
- Nozzle batch checks testing <= gross, rejects descending totalizers, and enforces variance explanations against prior readings.
- Shift close checks incomplete tanks, uncovered nozzles, stock and financial reconciliation; exceptional empty close is guarded by global ADMIN and has a separate audit action.
- DSR marks partial/missing fields, and tests already cover cross-role access, zero-reading completeness and daily/monthly consistency.
- Existing calibration versioning tests cover zero and out-of-range points, but that does not authenticate COCO 79's scans.

## 5. Existing test coverage vs Stage 01A addition

| Suite | Tests/subjects already exercised |
| --- | --- |
| `dailyFuelOperations.test.ts` | 26 workflow/data tests including shift summary statuses, dips, metering, multi-shift sales, daily/monthly parity, permissions and closed-shift immutability |
| `tankStockAndReconciliation.test.ts` | Calibration, water volume, receipt density, stock variance, completeness, receipt transitions and permission checks |
| `fuelReceiptCompletionAndShiftClose.test.ts` | Pending receipts blocking normal closure, PRE/POST dip readiness, audited cancellation |
| `nozzleDefaultTestingQuantity.test.ts` | Saved 0 versus 5 L prefill, explicit confirmation, 16-nozzle workflow |
| `endToEndTankCalibration.test.ts` | Reference charts, accuracy, version lifecycle and approval governance (existing functionality; **not** being modified) |
| **NEW `coco79Stage01aReference.test.ts`** | Pure synthetic exact-point/interpolation/half-up check, bounds/no chart errors and PARTIAL DSR missing-fields behavior. **No database or live outlet data.** |

## 6. Next implementation proposals (not applied in this audit)

1. **P0 — Clearly distinguish missing, zero and unverified:** review A-01, A-04, A-09 and write failing safety tests for operator-approved semantics, then update UI/report labels as needed.
2. **P0 — Batch integrity and shift close:** reproduce A-03 and A-08 under isolated D1 fault-injection with existing configured test outlet.
3. **P0 — Close variance explanations and RBAC:** review A-02 and A-05 against approved role/finance policy; add tests before altering a permission or blocking action.
4. **P1 — Better outlet/date/template switching UX:** reproduce A-07 and correct the form without changing backend validations.
5. **P1 — COCO 79 source comparison:** transcribe a small independently double-checked subset of S02 dip points, then compare S03/S04 quantities with known business dates; report **evidence gaps**, not automatic discrepancies.
6. **P1 — Staging operator walkthrough:** close an authorized **test** shift from opening through DSR (without touching production); record UAT artifacts.

## 7. Stage 01A sign-off

- [x] Trace daily shift, calibrated dip, nozzle meter, receipt, stock reconciliation, closing and DSR APIs.
- [x] Record concrete source-supported risks separately from confirmed defects.
- [x] Add *synthetic*, no-import functional reference tests.
- [ ] Complete CI for this branch (TypeScript, tests, build).
- [ ] Receive UI/finance/operations approval for missing-vs-zero semantics and nonzero-variance reason.
- [ ] Inspect actual D1 staging bindings and execute role-based end-to-end UAT.
- [ ] Double-check scanned chart points and source DSR rows with an authorized reviewer.

**Stage status:** CODE AUDIT IN PROGRESS; no production/data changes.  
**Pump Infrastructure:** explicitly out of scope.
