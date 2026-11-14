# P0 release focus — Daily Operations + Tank Calibration + Finance

**Owner target:** Friday 20 Nov 2026 for integrated staging-test readiness; next weekend is a contingency buffer, not a guaranteed production deployment date.

## Required integrated user journey (no external production writes)
1. Outlet/shift selection, actual nozzle opening totalizers, tank dip/water and grade-specific product price.
2. Operator entries: receipts, closing totalizers/testing, tank closing dip; reload persisted values and preserve missing != numeric zero.
3. Stock: exact approved per-tank active calibration revision, dip-to-litre interpolation with unit/rounding validation and stock reconciliation.
4. Finance: price in paise, net fuel sales, cash, UPI, POS/card, credit and approved adjustments; enforce no duplicate posting/partial close.
5. Review and close: reconciliation, warning and audit checks, a real concurrent/retry test, DSR/financial report agreeing with source data.
6. Access control for ADMIN, STATE, DIVISION, BM, FO, CSP, DEALER by permitted outlet scope and action.
7. Recovery: fail injected after partial input, verify atomicity and unchanged historical CLOSED shifts.

## Existing automated suites now given an explicit P0 gate
- Daily: dailyFuelOperations, openShiftIntegration, fuelReceiptCompletionAndShiftClose.
- Calibration: endToEndTankCalibration, tankCalibrationVersioningAndEnhancements, excelCalibrationImport, globalTankCalibrationTemplates.
- Finance: financialOperations, idempotencyAndDuplicateHardening, adminEmptyShiftClose.
- Cross-system: tankStockAndReconciliation, monthlyOperationsAggregation, dailyOperationsTestDataReset.
- CI uses local test databases only. It does NOT authorize hosted schema migration, production Worker release or historical input modifications.

## Source chart governance
Previously supplied nominal 10 KL, 15 KL and 20 KL calibration workbook was discussed but exact original rows are not currently accessible in repository/working file search. Do not certify accuracy from memory, nominal tank capacity or automatically derived cylindrical formulas. The retrieved 50 KL CSV is **DRAFT from scan**. Do not activate or apply any of these reference charts to physical tanks until certified tank-specific original, revision, geometry/applicability and an authorized comparison have been verified. For COCO 22, previously documented 20KL/50KL global reference points do not authorize assignment to all tanks.

## Acceptance requirements
- Dedicated P0 CI must pass reliably. Any failing test is a blocker, not a reason to skip that test.
- Independently verify numeric expected results against approved real-world chart rows and complete actual daily/finance source record set. A successful synthetic test is not equal to field accuracy.
- Source-version/replay freeze and durable audit journal must be integrated into production runtime (previous Stage 01W code is a prototype, not automatically applied).
- Hosted full-staging DB still requires Stage 01AB explicit approval, documented recovery bookmark and safety review.
- Post-migration hosted Worker UAT and operator/finance signoff remain mandatory before production.

**Current delivery verdict:** NO-GO for production until these gates are satisfied. This branch sets a test harness, not a claim that modules are completed.
