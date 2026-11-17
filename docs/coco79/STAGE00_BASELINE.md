# COCO 79 — Stage 00 operational-reference baseline

**Prepared:** 12 November 2026 · **Baseline Git SHA:** `229925f06a029c7d0644dc2a0b5835c42726d18c`  
**Reference outlet:** COCO 79, RO code `369460`  
**Scope:** Daily Operations, calibration-as-used-in-readings, fuel receipts/decantation, DSR, reconciliation, finance, maintenance evidence, applicable MDG procedures.  
**Explicit exclusion:** **PUMP INFRASTRUCTURE IS DEFERRED**. Do not change tank/DU/nozzle/product setup, topology, calibration tables or chart activation.

**Evidence status:** Read-only source review and GitHub code inspection only. No connection to live Cloudflare D1/R2 and no real role-by-role production UAT.

## 1. Project definition

The documents illustrate how a fuel outlet records and controls a business day. **They are examples and independent comparison material**, not a request to clone COCO 79's asset setup or load its historical balances into production.

Work from the **existing configured assets** in the system. Where a reading requires an existing tank or chart ID, resolve it *read-only*. Do not alter infrastructure to make a sample data file fit. Distinguish:
- **Source value:** what the document records.
- **App input:** what the UI/API is expected to capture.
- **Calculated output:** what our software derives using its *existing* formula/precision.
- **Discrepancy:** what requires human review or additional evidence.

**No sample historical records, source scans, staff identities or statutory decisions enter production during Stage 00.**

## 2. Evidence register

| Ref | User-provided document | Primary daily-operation value | Caution |
| --- | --- | --- | --- |
| S01 | `COCO 79.pdf` | Site sketch / context only | **Deferred:** not used to configure infrastructure |
| S02 | `Calibration Chart.pdf` | Example 10 KL / 20 KL dip-to-volume chart points and units | Rotated/scanned charts, numeric transcription and provenance unverified; **no upload or activation** |
| S03 | `DSR COCO79 Oct-Nov2026.pdf` | Daily product-wise opening, receipts, sales, totals and differences | Aggregated day data ≠ independently measured tank/nozzle shift entries |
| S04 | `recipt.pdf` | Stock transfer/invoice reference, dated deliveries, quantity/product/density evidence | Invoiced quantity ≠ measured receipt; business date may differ from invoice date |
| S05 | `Employee Details.pdf` | Examples of roles and shift staffing | Personal data; no HR import, role creation or staff assignment in current phase |
| S06 | `COCO 79 EFMS Complaints Data.xlsx` | Facility issues, approvals, vendor statuses, maintenance tracking | Complaint approved/closed ≠ equipment restored |
| S07 | `AUTO_BD_SERVICE_REPORT_GVR1007_V1.0_ba01a507-b193-46f8-99c5-b06871a46feb.pdf` | ORPAK 03-Nov-2026 ATG fault report | A service visit completion is not a successful repair |
| S08 | `AUTO_BD_SERVICE_REPORT_GVR1007_V1.0_4af39f69-0991-4c74-b1c8-d5e0ab695df6.pdf` | ORPAK report bundle including 06-Nov-2026 ATG restoration | Deduplicate repeat report pages; validate actual event dates |
| S09 | `Maintainance Report.pdf` | Preventive inspection checklist examples | Handwritten checklists must not be auto-classified as passed |
| S10 | `Marketing_Discipline_Guideline_2024_24_10_2024.pdf` | Receipt, decantation, quality, daily registers, automation and maintenance procedure reference | Dealership framing; confirm applicability to company-operated outlets before adding controls |

**Source-derived reference scenarios:**
- 09-Nov-2026 invoice product quantities: MS 9,000 L; HSD 9,000 L; XP95 4,000 L. Compare only to matching DSR product/date receipt entries and clearly track invoice vs measured amounts.
- 10-Nov-2026 invoice product quantities: MS 13,000 L; HSD 9,000 L. The invoice is evidence of billed dispatch, not automatic stock receipt confirmation.
- ORPAK complaint `4101172143`: 03-Nov identified a faulty HSD Tank-2 ATG probe; a later 06-Nov report records replacement/restoration. Preserve event sequence; an unavailable automated reading is **not** a zero dip.
- S06 contains maintenance complaint states; preserve complaint approval, vendor handling, repair outcome and sign-off independently.

## 3. Confirmed code-level starting point

| Workflow | Existing GitHub code | Reference-validation task |
| --- | --- | --- |
| Daily shift lifecycle and readings | `src/worker/routes/shifts.ts`, `src/worker/services/shiftCloseService.ts` | Verify open, snapshots, meter entry, error handling, close, retries and audit |
| Tank dip / calibrated volume | `src/worker/routes/tankStock.ts`, `src/worker/services/tankCalibrationService.ts` | Verify chart selection, dip units, interpolation, rounding and missing-chart behavior **without modifying the chart** |
| Fuel receipts / decantation | `src/worker/routes/fuelReceipts.ts`, `fuel_receipts`, `fuel_receipt_tank_lines` | Check invoice fields, status, density, pre/post-dip links and quantity sources |
| Stock/Daily Sales Report | `src/worker/services/fuelDailyOperationsService.ts`, `src/worker/routes/stockReconciliation.ts`, report routes | Compare day/product totals to historical DSR; never infer shift records from aggregate totals |
| Collections / deposits | `src/worker/routes/financialRoutes.ts` and finance tables | Check mode totals, handovers, bank deposits, variance reasons with real evidence when available |
| Maintenance exceptions | `src/worker/routes/equipmentRoutes.ts`, equipment tickets/events | Test how an outage, repair and restoration should appear in day workflows |
| Document evidence | `src/worker/routes/documents.ts`, R2 storage / compliance register | Review secure linking and retention; do not expose employee source files |
| Permissions and audit | Scope/permission middleware and audit repository | Verify role and outlet access and mutation traceability in staging |

A route, table, migration or automated test **existing in GitHub** does not prove that it is configured or functioning correctly in production.

## 4. MDG 2024 — reference controls, not new automatic rules

- §§1.1–1.2: receipt verification and decantation steps (invoice, TT, seals, quantity/quality, tank dips and associated evidence) should first be mapped to existing entry screens and validation.
- §§1.3–1.4: daily stock, meter, water and quality records provide reference cases for completeness and warnings.
- §5.1.11: stock variation requires interpretation of applicable method and allowances; **never insert universal 4% tolerance** or change the app's existing arithmetic without approved rules/tests.
- §5.1.12: guide for record availability and retention, subject to other applicable policies.
- §5.1.16: automation outages/manual operation need appropriately documented authorization; **a breakdown ticket alone is not authorization**.
- Annexure 6 and maintenance provisions: attach signed source evidence to events where approved.

Do not auto-label a COCO 79 operator as violating MDG or auto-generate a penalty. A designated IOCL policy owner must confirm COCO applicability and authority.

## 5. Gaps and initial risks — scoped to daily operations

| ID | Priority | Finding | Safe next action |
| --- | --- | --- | --- |
| O-001 | P0 | Existing end-to-end day workflow has not been manually verified for one outlet/role | Staging UAT against a controlled shift, without modifying production |
| O-002 | P0 | No complete verified sample combining same-shift dips, nozzle readings, fuel receipt, collections and deposits | Use partial source scenarios; request independent full-shift evidence later |
| O-003 | P0 | Scanned calibration example lacks certified machine-readable points/identity | Test generic interpolation and missing-chart behavior with independently checked, non-production fixtures; **defer chart setup** |
| O-004 | P0 | Source DSR and invoices may use different calendar and business-date conventions | Explicit date alignment and no double-counting |
| O-005 | P0 | Readings absent and readings genuinely zero can appear similar | Audit every status, UI and computation where missing values are displayed |
| O-006 | P1 | EFMS complaint/vendor and ORPAK engineer resolution states differ | Link service evidence, not a single blanket CLOSED flag |
| O-007 | P1 | MDG 2024 COCO scope/authorizations not confirmed | Reference checklist first; no enforced mandatory gate |
| O-008 | P1 | Shift close stock/finance/audit failure paths need explicit retry tests | Review transactional/idempotency handling, avoid unproven defect claims |
| O-009 | P1 | Repo README still says last migration 0026 while code has 0035; manual UAT outstanding | Correct documentation separately before database changes |
| O-010 | Deferred | COCO 79 physical tank/nozzle topology and staff master confirmation not performed | **Not part of current plan** unless a later user-approved infrastructure/HR phase is opened |

## 6. Stage 00 acceptance criteria

- [x] Register all 10 source documents, with scope and limitations.
- [x] Identify current daily operations, calibration, receipt, report, finance and maintenance source paths.
- [x] Create a **reference-only** field map and prioritized task/tests backlog.
- [x] Explicitly defer all pump infrastructure and chart master changes.
- [ ] Verify isolated staging environment and safe reference fixtures.
- [ ] Execute first controlled daily-shift workflow test.
- [ ] Independently check a small set of source chart points and invoice/DSR quantities, with unit notes.
- [ ] Receive missing same-shift readings and collection evidence if the user wishes to validate a complete historical business day.
- [ ] Confirm MDG COCO applicability before any new mandatory operational policy.

**Status:** Working baseline drafted; **not a production sign-off**.

See [MASTER_DATA_MAPPING.md](./MASTER_DATA_MAPPING.md) and [IMPLEMENTATION_BACKLOG.md](./IMPLEMENTATION_BACKLOG.md).
