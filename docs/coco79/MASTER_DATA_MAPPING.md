# COCO 79 — Daily operations source-to-system reference map

**Stage:** 00 · **Use:** reference/testing only · **Outlet:** COCO 79 / RO `369460`  
**Exclusion:** **Do not modify Pump Infrastructure, tanks, dispensing units, nozzles, product masters, source calibration charts or chart activation.**  
The field names below identify **existing** application records, not instructions to import source values. No live data was inspected.

## 1. Reference convention

| Status | Meaning |
| --- | --- |
| Existing | Field, API or service found in the current repository; not necessarily populated or production-tested |
| Example | Historical COCO 79 source data suitable for a controlled comparison |
| Verify | Units, business date, reading source, record identity or evidence are not fully established |
| Missing | Needed for an independent full-day reconstruction but not provided in the current sources |
| Deferred | Infrastructure or personnel-master operation excluded by current user direction |

Do not convert an unrecorded value to zero. Do not replay old invoices or DSR totals into production or silently equate invoiced quantity with measured receipt.

## 2. Daily Operations & DSR

| Reference / evidence | Existing app field or module | What to check | Status |
| --- | --- | --- | --- |
| COCO 79 product/day DSR (S03) | `FuelDailyOperationsService` / daily summary | Same outlet, product, business date and units; report aggregates correctly | Example |
| Daily opening and closing stock (S03) | `tank_stock_readings`, `shift_stock_reconciliations` | DSR product totals do not establish each tank's measured shift dip | Verify |
| Actual shift start/end | `operational_shifts.businessDate`, `.status`, `.startedAt`, `.closedAt` | Opening/closing, permissions, time zone, audit and allowed transitions | Missing source; existing app |
| Nozzle opening/closing meter counts | `nozzle_meter_readings.openingTotalizerMilliunits`, `.closingTotalizerMilliunits` | Missing vs zero; testing adjustment, gross and net sales, retry behavior | Missing source; existing app |
| Nozzle temporarily unavailable | `nozzle_unavailability_records` | Outage reason and date; not silently a zero sales reading | Existing app |
| Shift close | `src/worker/services/shiftCloseService.ts` | Validations, reconciliation, error rollback and audit under retries | Existing app |
| Historical product-day report | `reportRoutes` and monthly/daily reports | Compare calculated aggregate with independently approved DSR after matching time boundaries | Example |

**Test sequence:** select existing test outlet/shift → open → enter readings → save/reload → verify snapshot → receipt → reconciliation → close → DSR → audit. Never create an actual historical COCO 79 shift in production to conduct this test.

## 3. Calibration used in daily readings — not infrastructure configuration

| Reference | Existing software element | Safe task | Out of scope |
| --- | --- | --- | --- |
| S02 10 KL chart / printed dip-to-volume pairs | `TankCalibrationService.convertDipFromPoints` and `tank_calibration_points` | Use a few independently verified points in isolated unit tests to check exact-match/interpolation, precision and units | Assign scanned chart to a tank or activate it |
| S02 20 KL chart | Same conversion service | Check independent examples for monotonicity and expected volume at known dip values | Bulk import or edit chart points |
| Missing or invalid chart | `tankStock` routes / calibration service | Confirm user gets explicit unavailable/out-of-range state, not zero stock | Make unsupported assumptions about tank capacity |
| Chart version/effective date in existing system | `tank_calibration_charts.revisionNumber`, `.effectiveFrom`, `.status` | Check which *already configured* chart a reading used and whether calculation is reproducible | Set chart status, change revision or approve calibration |
| Dip and water readings | `tank_stock_readings.productDipMmMilliunits`, `.waterDipMmMilliunits` | Check distinct measured value, recorded source, timestamp, rounding and traceability | Create/change physical tank records |

**Key distinction:** Reference calibration-chart images help verify **daily dip calculation behavior**. They do not authorize us to upload them or replace the certified charts already used by an outlet. Handwritten/rotated scans require double-checking before any expected-value fixture is written.

## 4. Fuel receipt and decantation reference

| Source / attribute | Existing target | Verification rule | Status |
| --- | --- | --- | --- |
| S04 invoice number and date | `fuel_receipts.invoiceNumber`, `.invoiceDate` | Invoice date vs shift business date / receipt date | Example |
| S04 vehicle details | `fuel_receipts.ttNumber` | Match original source, allow no invented TT number | Example / verify |
| S04 product and invoiced KL/L | `fuel_receipt_tank_lines.productId`, `.invoiceQuantityMilliunits` | Unit conversion 1 KL = 1,000 L; decimal-safe precision | Example |
| S04 density/temperature | `.invoiceDensityMilliunits`, `.densityMilliunits`, `.temperatureMilliunits` | Verify basis (e.g., 15°C) and authoritative measured density separately | Verify |
| Site-side seal and receipt verification | `fuel_receipts.sealVerified`, `.sealExceptionReason`, status | Do not assume seal check was done because the invoice exists | Missing evidence |
| Actual decanted tank/pre/post dips | `fuel_receipt_tank_lines.tankId`, `.preDecantReadingId`, `.postDecantReadingId` | Examine links to *existing* configured test data; do not build or remap tanks | Missing evidence |
| Measured received volume | `.measuredReceivedQuantityMilliunits`, `.receiptVarianceMilliunits` | Invoiced vs physically accepted; preserve independent evidence | Missing evidence |
| MDG 2024 receipt checklist | Existing validation and document attachment routes | Identify existing checks before suggesting any new checklist or mandatory gate | Policy applicability unconfirmed |

**Comparison examples:** S04 includes 09-Nov-2026 MS 9,000 L, HSD 9,000 L, XP95 4,000 L, and 10-Nov-2026 MS 13,000 L, HSD 9,000 L. Use only as source quantities in staging tests; first check dates, invoice grouping and corresponding S03 DSR values.

## 5. Stock reconciliation, sales and finance

| Reference | Existing code/data | Check | Status |
| --- | --- | --- | --- |
| DSR opening, receipt, sales, closing stock | `shift_stock_reconciliations`, `FuelDailyOperationsService` | Product/date aggregation and reconciliation arithmetic; do not assume book equals physical stock | Example |
| Nozzle gross/net sales | `nozzle_meter_readings` | Difference, testing quantities, missing/unavailable readings | Missing independent nozzle source |
| Product price snapshots | `operational_shift_product_prices` | Historic price precision and correct business date | Not supplied in documents |
| Cash, digital, credit collections | `shift_collections` | Per-mode amount in integer paise, reference and authorized edits | Missing |
| Cash handover and bank deposits | `cash_handover_logs`, `bank_deposits` | Status, date, verification and no duplicate records | Missing |
| Shift financial reconciliation | `shift_financial_reconciliations`, `financialRoutes` | Sales vs collections, variance reasons, retries | Existing app; unverified against COCO 79 |
| MDG stock variation | Existing reconciliation output | Show evidence, expected vs actual and reviewer explanation | Do not introduce unapproved numerical tolerance |

The user can start a workflow audit **without** a signed complete-day bundle. Independent full-day parity and production sign-off remain pending until missing source readings and collection evidence are available.

## 6. Maintenance evidence and operational exceptions

| Source | Existing target | Safe usage |
| --- | --- | --- |
| S06 EFMS 10-row complaint register | `equipment_breakdown_tickets` and events | Sample complaint lifecycles and distinct approval/vendor/repair statuses |
| S07/S08 ORPAK ATG Tank-2 incident | Equipment events and Document Vault | Test unavailable ATG, service visit, replacement and verification timelines; no implied authorized manual operation |
| S09 preventive-maintenance form | Equipment event and document evidence | Review whether checklist/notes can be linked; no automatic pass/fail from handwriting |
| S10 MDG 2024 | Workflow guidance | No COCO-specific mandatory enforcement or penalty without IOCL approval |

No changes to physical equipment inventory are included. If an operational flow needs a test fault, use an **isolated test ticket** and existing equipment references rather than adding asset masters.

## 7. Identity and privacy

S05 Employee Details can help us understand operator roles, but it is **not** a mandate to import 43 employees or assign logins. Workforce/HR master setup is deferred. Only role-level functional testing with authorized staging users is in scope.

## 8. Read-only technical queries (optional; not executed)

Only use an authorized **staging or read-only** environment. Actual SQL identifiers must be confirmed against the applied schema; no credentials or personal-data rows should be shared in GitHub.

```sql
-- Resolve an outlet only when needed for a read-only comparison.
SELECT id, ro_code, name FROM retail_outlets WHERE ro_code = '369460';

-- Inspect existing shift status and chronology; no new shift is created.
SELECT id, outlet_id, business_date, status, started_at, closed_at
FROM operational_shifts WHERE outlet_id = :outlet_id
ORDER BY business_date DESC;
```

**Next:** [IMPLEMENTATION_BACKLOG.md](./IMPLEMENTATION_BACKLOG.md) begins with daily operations behavior, calibration calculation tests, receipt/DSR parity and missing-data handling—not Pump Infrastructure.
