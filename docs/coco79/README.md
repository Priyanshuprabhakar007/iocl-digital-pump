# COCO 79 — Reference-led Daily Operations & Calibration Project

**Reference source:** COCO 79, RO code `369460`  
**Status:** Stage 00 working baseline, not signed off; no live data writes  
**User scope decision:** **COCO 79 is a reference case. Do not configure, redesign, import or modify Pump Infrastructure at this time.**

We are studying **how an outlet operates**, not replicating COCO 79's tank/DU/nozzle installation. Our application should work across outlets using their *existing* approved infrastructure and product configuration. The supplied historical COCO 79 records are **examples for mapping, workflow evaluation and isolated tests**, never production entries.

## In scope now

1. **Daily Operations & DSR:** shift opening, tank dip readings, nozzle readings, shift closing, DSR presentation and missing-data handling.
2. **Calibration in daily operations:** how dip readings are converted to volume; chart units, rounding, revision/effective date, checks for absent charts and sample calculations. **No chart upload, replacement or activation.**
3. **Fuel receipts and decantation:** invoice/TT details, quantity, pre/post readings, density/temperature, safety/quality evidence and traceability.
4. **Stock and sales:** product/day opening stock, receipts, recorded sales, theoretical/physical closing and explainable differences.
5. **Finance and reports:** collection modes, cash handover/deposits and report-to-ledger parity when independent evidence is available.
6. **Maintenance and evidence (secondary):** EFMS and ORPAK examples of equipment outage, repair evidence and safe/manual-operations controls, plus document traceability.
7. **MDG 2024:** source-backed workflow guidance and evidence checks; company-operated outlet applicability requires confirmation before any automated enforcement.

## Deliberately out of scope

- Pump Infrastructure screens, physical site sketch implementation, adding or changing tanks, DUs, nozzles, tank-to-nozzle mappings, equipment serial numbers or product masters.
- Migration or activation of scanned 10/20 KL calibration charts; restructuring calibration database tables or changing production conversion formulas.
- Copying COCO 79 historical stock/receipt transactions or employees into a live outlet.
- New blocking/penalty rules based on MDG without approved operational policy.

**Boundary:** To test a historical dip example, we may need a *read-only* reference to the tank/product/chart as already configured. That is a testing dependency, **not** authorization to modify Pump Infrastructure.

## Read in order

1. [Stage 00 baseline](./STAGE00_BASELINE.md) — ten documents, current code, evidence limitations and scope exclusions.
2. [Daily operations source mapping](./MASTER_DATA_MAPPING.md) — source fields to existing shift, calibration, receipt, reconciliation and finance models.
3. [Implementation backlog](./IMPLEMENTATION_BACKLOG.md) — P0 daily-operations focus, test scenarios and future deferred work.
4. [Stage 01A Daily Operations trace](./STAGE01A_DAILY_OPERATIONS_TRACE.md) — actual UI/API/service workflow, calibrated calculation behavior, test coverage and priority risk register.

## What we do next

**Start with an existing daily shift lifecycle and one historical COCO 79 day as a read-only reference.** Inspect the current UI/APIs/services and write tests for opening, readings, missing-versus-zero, receipt matching, reconciliation and closing. Compare outputs to the supplied DSR and invoices only when units, business dates and measurement evidence agree.

Development remains separate from live D1/R2. Stage 00 documentation requires review; code changes must be proposed in separate implementation PRs after test expectations are defined.
