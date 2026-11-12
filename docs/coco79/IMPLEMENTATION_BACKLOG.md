# COCO 79 — Daily operations implementation backlog

**Working reference:** COCO 79 historical documents and MDG 2024  
**Decision:** **DEFER ALL PUMP INFRASTRUCTURE WORK.** Do not create/modify tank, nozzle, dispenser or product masters, physical asset relationships, or calibration chart registrations/activation. The COCO 79 files are reference examples, not production data.

## Guiding principles

- Improve and validate the **existing Daily Operations & DSR** flow first. Keep its existing APIs, permissions, calculations and approved shift states until specific issues are demonstrated and reviewed.
- Calibration work means **testing the existing dip-to-volume calculation**, its numerical precision, error and chart-version behavior **without** changing the chart master or any physical pump.
- Use S03 DSR + S04 invoices as independent historical comparison sets, and S02 scanned charts only as manually checked examples. **Never auto-import them to production.**
- The MDG reference guides review; do not introduce new penalties, mandatory operational gates or universal variation allowances without a responsible IOCL official's approval.
- Use isolated staging and existing configured sample assets/shift data. Never turn a blank or missing reading into numeric zero.
- Build the simplest operator journey: select outlet/date → open shift → record readings → record receipts → reconcile → review exceptions → close → DSR.

## P0 — Start here: Daily Operations and calibration behavior

| ID | Task | Acceptance criterion / evidence |
| --- | --- | --- |
| P0-01 | Walk through current daily operations UI, Worker routes, tables and close service | Write a factual flowchart and field inventory; classify present/partial/missing; no code or data changes yet |
| P0-02 | Prepare an isolated staging test outlet/shift using **existing configured** infrastructure | Confirm no staging credentials, Worker/D1/R2 binding or writes reach production; backup/restore understood |
| P0-03 | Check shift opening, date/shift selection and read/write permission gates | Valid role can open with correct existing snapshots; unauthorized scope gets denied; no duplicate shift |
| P0-04 | Validate tank dip and water reading entry (including missing values) | Saved/reloaded correctly; missing != 0; invalid or unavailable calibration produces explicit messages |
| P0-05 | Test existing dip-to-volume service with checked example chart points | Verify exact point match, interpolation, rounding, upper/lower bounds, units and chart revision; **no chart change/activation** |
| P0-06 | Verify nozzle opening/closing, testing quantity and temporary unavailability | Gross/net quantities reproduce independently, and missing readings are not treated as actual zero |
| P0-07 | Check shift receipts and decantation forms using S04 invoice reference values | Quantity, product, TT, density, seal, pre/post readings and status are mapped without invented data or duplicate receipt |
| P0-08 | Compare calculated product/day DSR with S03 historical report | Show source/expected/actual/variance and business-date assumptions; do not claim parity without source measurements |
| P0-09 | Review stock reconciliation and shift close including failures/retries | Missing data blocks only according to approved existing rules, no orphaned recon, duplicate close or lost audit |
| P0-10 | Conduct role- and mobile-focused staging UAT for one daily operating day | Operator can navigate, save, inspect warnings, export report and recover failed saves; all protected endpoints enforce scope |

## P1 — Related workflows once daily foundation is stable

| ID | Task | Acceptance |
| --- | --- | --- |
| P1-01 | Financial entries: collections by mode, cash handover, deposits and financial close | Ledger/reports agree in paise; missing evidence clearly identified; authorized reviewer handles variance |
| P1-02 | MDG receipt/quality procedure mapping | Show source-backed checklist suggestions without duplicate forms or new blocking rules until company policy approval |
| P1-03 | ATG/automation outage guidance using ORPAK HSD Tank-2 example | Fault/offline, engineer visit, repair and verified restoration are distinct; no implicit manual-operation permission |
| P1-04 | EFMS and preventive-maintenance evidence review | Complaint approved/rejected/vendor closed independent of technically repaired; secure service-document links |
| P1-05 | DSR / monthly reports and audit traceability | Independent sample day reconciles from source ledger to report; discrepancies are visible and reviewed |
| P1-06 | Document evidence/privacy/retention | Outlets and roles scoped; HR documents restricted; official COCO applicability of MDG confirmed |
| P1-07 | Update stale release documentation / applied migration verification | README's 0026 claim reconciled against code through 0035 and live migration state checked by authorized operator |

## Deferred — explicitly not part of this implementation cycle

- **Pump Infrastructure:** tank/DU/nozzle creation, topology changes, commissioning, serial number capture, pump master setup, and physical COCO 79 site sketch implementation.
- **Calibration master changes:** scanning/OCR bulk upload, correction of existing chart points, chart approval or activation, and tank-specific chart assignment.
- **Employee import/HR master setup:** the source employee list is contextual only; no personal records, account creation or roster assignment.
- **Production historical imports:** no backdated invoice, receipt, nozzle, stock, finance or complaint writes from the COCO 79 reference documents.
- **Automated compliance enforcement:** no MDG-based penalty, universal loss tolerance or manual-operations override unless separately approved.
- **Second-outlet rollout:** only after isolated daily workflow testing succeeds and the user opens that phase.

## Independent staging test scenarios

| Test | Scenario | Expected behavior |
| --- | --- | --- |
| D-01 | Authenticated authorized vs unauthorized outlet access | Scope/permission verified; no leakage |
| D-02 | Valid open shift from existing configuration | One shift, correct business date and existing snapshots |
| D-03 | Missing opening tank dip | Incomplete, not zero |
| D-04 | Existing chart missing/out of range | Visible safe error; no fabricated volume |
| D-05 | Known calibration pairs and midpoints from verified non-production fixture | Deterministic, correct precision/rounding |
| D-06 | Closing nozzle reading and testing adjustment | Net volume matches existing formula and recorded testing |
| D-07 | Nozzle intentionally unavailable | Reason visible; no false zero-sale interpretation |
| D-08 | S04 09/10-Nov invoice amounts treated as reference | Correct unit and date mapping; no direct production import |
| D-09 | Received quantity absent but invoice present | No measured-receipt assumption or double counting |
| D-10 | S03 report comparison by product/date | Explainable parity/difference including unknown measurement gaps |
| D-11 | Shift close with incomplete required records | Existing approved validation and error messages honored |
| D-12 | Retry after interruption/duplicate close | No unintended double transaction or inconsistent audit |
| D-13 | Financial variance and missing collection mode data | Distinguish evidence missing vs legitimate ₹0 |
| D-14 | ATG fault / 03-Nov vs 06-Nov service timeline | Fault and restoration not conflated |
| D-15 | Export DSR and monthly report after staged entry | Figures trace to saved readings and receipts |
| D-16 | Mobile operator experience | Fields, controls and warnings remain visible and usable |

## First development handoff — Stage 01A

**Build a read-only functional trace of the existing Daily Operations & DSR code** covering:
- selected outlet/date/shift → open → tank/nozzle readings → receipts → reconciliation → close → report;
- exact API routes and table columns used at each point;
- current validation/error messages and missing/zero treatment;
- current calibration service and chart-revision usage during reading saves;
- safe isolated test cases tied to S02/S03/S04 with explicit source assumptions.

**Completion gate:** trace and expected test cases reviewed; only then submit focused code improvements on a separate branch. There is **no pump-infrastructure prerequisite** to starting this trace; use a preconfigured test outlet and defer site hardware mapping.

## Change-release evidence

For any implementation PR: scope, linked source, existing module/API, data impact, role/scope matrix, positive/negative/retry tests, UI screenshots where relevant, TypeScript/tests/build result, reviewer, staging verification and rollback plan. Never touch production D1/R2 during planning.
