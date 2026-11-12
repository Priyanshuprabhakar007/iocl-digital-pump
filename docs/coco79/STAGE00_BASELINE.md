# COCO 79 — Stage 00 baseline and evidence inventory

**Status:** Static source audit / draft for outlet-team validation  
**Prepared:** 12 November 2026  
**Pilot outlet:** COCO 79, RO code **369460** (use the actual internal `retail_outlets.id` only after querying the authorized environment)  
**Repository baseline:** `main` at `229925f06a029c7d0644dc2a0b5835c42726d18c`  
**Scope:** Read-only repository and supplied document review. **No live D1/R2 access or production UAT was performed.**

## Outcome sought

Build one connected daily operating process, using existing modules where possible:
outlet master → tank/nozzle and shift master → shift opening → readings → invoice/receipt/decantation → stock/financial reconciliation → authorized close → DSR/reports → audit/evidence.

Do not confuse the **existence of code** with a **verified production feature**. A migration in GitHub is not proof that it has been applied to remote D1.

## 1. Source register

Every file below is treated as **reference evidence**; no attached source should be committed to the public/shared repository, and unverified transcription must not be imported as authoritative data.

| Source ID | Supplied file | Extracted subject and applicability | Review caveat |
| --- | --- | --- | --- |
| S01 | `COCO 79.pdf` | Hand-drawn outlet layout with products/tank/DU connections | Sketch, not a certified as-built asset register |
| S02 | `Calibration Chart.pdf` | Photographed **10 KL** and **20 KL** tank dip/volume charts (2 pages) | Low-quality/rotated scan; full points, units, chart identity and certification require manual two-person checking |
| S03 | `DSR COCO79 Oct-Nov2026.pdf` | Daily product-wise *Opening Stock (Ideal)*, *Receipt*, *Total Stock*, *Sale* and totals, including MS, HSD, XP95, XG, XP100 | Product/day totals are a historical comparison set, not individual shift, tank or nozzle proof |
| S04 | `recipt.pdf` | Multi-page supply/stock-transfer invoices; sample invoices dated **09 and 10 November 2026** | Treat document quantities as invoiced, not automatically as measured received or decanted |
| S05 | `Employee Details.pdf` | 43-row employee/designation list with employee IDs | Contains personal information; verify employee ID uniqueness and current staff status; do not commit source or full names |
| S06 | `COCO 79 EFMS Complaints Data.xlsx` | 10 complaint rows with complaint ID, datetime, facility, nature, remarks, approval, vendor closing and rejection columns | Approval/rejection, vendor closure and actual equipment restoration are different facts |
| S07 | `AUTO_BD_SERVICE_REPORT_GVR1007_V1.0_ba01a507-b193-46f8-99c5-b06871a46feb.pdf` | ORPAK 03-Nov-2026 service report; HSD Tank-2 faulty ATG probe identified; replacement required | Report marked visit/job completed; does **not** prove probe repaired on that date |
| S08 | `AUTO_BD_SERVICE_REPORT_GVR1007_V1.0_4af39f69-0991-4c74-b1c8-d5e0ab695df6.pdf` | Bundled ORPAK visit reports, including later **06-Nov-2026** successful Tank-2 probe replacement | Contains a copy of earlier report; deduplicate by complaint/report reference, not file count |
| S09 | `Maintainance Report.pdf` | Scanned preventive-maintenance / breakdown checklist pages | Handwriting and tick marks require operator confirmation; no automatic pass/fail from a scan |
| S10 | `Marketing_Discipline_Guideline_2024_24_10_2024.pdf` | MDG 2024, 69 pages; receipt, decantation, daily records, automation, stock variance, samples and equipment maintenance | Document is framed for **RO/SKO dealerships**; ask IOCL which provisions apply to COCO and who may authorize exceptions |

### Verified cross-document examples to use in **staging-only** tests

- 09-Nov supply invoice contains approximately **9,000 L MS, 9,000 L HSD and 4,000 L XP95**, to be compared against the DSR's same-date receipt columns.  
- 10-Nov invoice includes **13,000 L MS and 9,000 L HSD**; compare against DSR by date and product, accounting for business date versus actual arrival/decantation time.  
- ORPAK complaint **4101172143**: 03-Nov visit identified HSD Tank-2 faulty ATG probe; **06-Nov** visit reported replacement and restoration. Track **visit state**, **repair state**, **ATG state** and **independent sign-off** separately.  
- EFMS workbook has **2 Pending, 6 Rejected and 2 Approved** approval rows; only one Approved entry explicitly shows vendor closing status `Closed`. These are not ten proven resolved faults.
- The employee document shows **43 rows**, but *unique active employee count* is not established. It has a potential duplicate employee ID requiring row-level review; do not infer employment status.

## 2. Confirmed code capabilities (existence only)

| Domain | Current repository evidence | Audit classification |
| --- | --- | --- |
| Outlet/hierarchy/RBAC | `src/db/schema.ts` (`retail_outlets`, assignments); `src/worker/routes/outlets.ts`; scope middleware | Code present; real COCO 79 configuration not verified |
| Pump asset master | `tanks`, `dispensers`, `nozzles` tables; `src/frontend/pages/PumpInfrastructurePage.tsx` | Code present; sketch-to-asset mapping not verified |
| Calibration | `tank_calibration_charts`, `tank_calibration_points`; routes include dry-run, engineering-verify, version activation, Excel preview | Code present; scanned S02 charts not validated/imported |
| Shifts / readings | `src/worker/routes/shifts.ts`, `tankStock.ts`, `src/worker/services/shiftCloseService.ts` | Code present; role-by-role real shift UAT pending |
| Receipts/decantation | `fuel_receipts`, `fuel_receipt_tank_lines`; `src/worker/routes/fuelReceipts.ts` | Code present; S04 ↔ S03 reconciliation needs staging test |
| Stock/DSR | `shift_stock_reconciliations`; `src/worker/services/fuelDailyOperationsService.ts`; report routes | Code present; product/day historical comparison pending |
| Financials | `shift_collections`, `cash_handover_logs`, `bank_deposits`; financial reconciliation routes | Code present; matching COCO 79 collection/deposit evidence missing |
| Equipment | Assets, tickets, event history, assign/start/resolve/signoff endpoints | Code present; S06–S09 source integration not established |
| Workforce | `hr_staff`, roster, attendance tables/routes | Code present; S05 employee uniqueness/role data require verification |
| Documents & compliance | R2-backed document routes; `coco_compliance_records` **migration 0035**; 14 predefined COCO record categories; one-pager | Code present; remote migration state and operational applicability unverified |
| Security/audit | Session cookies, scope/permission middleware, audit repository and automated test files | Code present; live cross-role UAT/security review not performed |

**Do not introduce a second COCO compliance table:** the repository already contains `migrations/0035_coco_compliance_records.sql` and `src/worker/services/cocoComplianceService.ts`. Whether it exists in production D1 is **unknown**.

## 3. Standards and source-to-system boundaries

- MDG 2024 §§1.1–1.4: match invoice, receipt, safety, water/dip, density and nozzle checks to the *existing* receipt/shift/quality workflows before proposing any new fields or mandatory gates.
- MDG §5.1.11: stock variation assessment is contextual and includes operational variation, product handling allowances and conditional temperature/shrinkage applicability. **Do not implement a global 4% auto-pass rule**, or modify existing reconciliation without approved policy and independent tests.
- MDG §5.1.12: specified record-retention categories/periods inform the Document Vault retention plan, subject to IOCL/company policy and other applicable rules.
- MDG §5.1.16: written authorization is relevant to ATG/manual-operation exceptions. Recording an equipment ticket must **not** by itself authorize manual operation.
- MDG Annexure 6: maintenance evidence should be stored and linked to equipment/complaints instead of duplicating administrative records.

## 4. Baseline issues and evidence gaps

| ID | Severity | Observation | Impact / action |
| --- | --- | --- | --- |
| G-001 | Blocker | No authorized live D1 snapshot, asset listing or independent COCO 79 confirmation yet | Do not assert site configuration or start live migration |
| G-002 | Blocker | Scan-to-tank identity and full calibration-point values unverified | No chart activation or dip-volume comparison on live tanks |
| G-003 | Blocker | No same-shift tank/nozzle readings + mode-wise collections + deposits supplied for a complete COCO 79 day | Full daily/financial closure cannot be independently reconciled |
| G-004 | High | Site sketch lacks verified equipment serial numbers and all nozzle/tank mappings | Validate physical tanks, DUs, nozzles, product codes and effective shift master |
| G-005 | High | EFMS and ORPAK statuses are not equivalent; fault restoration and authorization evidence must be explicit | Independent maintenance acceptance needed |
| G-006 | High | Staff list may contain repeated employee identifiers; no current/terminated status or system access matrix | Deduplicate privately, restrict HR files, and validate role assignments |
| G-007 | High | `README.md` states migration terminal `0026`, while repo contains migrations through `0035` | Baseline/release instructions are stale; reconcile documented migration state before remote changes |
| G-008 | High | `docs/UAT_EXECUTION_CHECKLIST.md` explicitly says manual UI UAT pending and production UAT not started | Automated tests cannot substitute for real role- and outlet-specific UAT |
| G-009 | High | MDG's COCO applicability and authority matrix not yet confirmed | Add guidance/evidence first, no automatic violations or penalties |
| G-010 | Review | Shift closure service orchestrates stock/financial writes and audits; transactional/rollback integrity needs targeted review | Investigate, do not label a confirmed defect without concurrency/failure tests |
| G-011 | Review | Repository docs contain seeded local test personas; production isolation must be verified | Confirm production cannot use seeded credentials or demo records |

## 5. Safe environment and verification gate

1. Identify **development**, **staging** and **production** Worker URLs, D1 binding/database IDs, R2 buckets, Vercel environment, and active Git SHA. Record identifiers securely **outside** this repository when sensitive.
2. Confirm backups/export and restore procedure; never operate on remote production D1 in this stage.
3. Read-only COCO 79 master snapshot: outlet ID / RO code, products, tanks, DUs, nozzles, charts/revisions, shift templates, staff-count summary, documents and existing operational dates.
4. Compare this snapshot to `MASTER_DATA_MAPPING.md`; mark each as CONFIRMED / MISMATCH / UNAVAILABLE and assign a reviewer.
5. Use redacted fixtures and a designated staging outlet; never reseed or replay historical receipts into production.
6. Require approval for all changes affecting calibration activation, financial amounts, shift closure, automation overrides or MDG enforcement.
7. Keep an auditable discrepancy log and test evidence for all changes.

## 6. Stage 00 completion criteria

- [x] Register 10 source files with limitations.
- [x] Map principal source fields to existing schema and APIs.
- [x] Create prioritized backlog and acceptance scenarios.
- [ ] Obtain confirmed COCO 79 asset/tank/nozzle IDs and official product mappings.
- [ ] Validate calibration scans, tank identity, full certified points and engineering sign-off.
- [ ] Receive same-shift nozzle/stock readings, collections and deposit evidence for one sample day.
- [ ] Obtain controlled staging environment with backup/restore and safe sample-data policy.
- [ ] Perform authorized COCO 79 read-only master export and reconcile against mapping.
- [ ] Secure approval of COCO applicability, automation authorization and MDG-related policies.

**Stage status:** BASELINE PREPARED — **not signed off**, no production readiness claim.

See also [MASTER_DATA_MAPPING.md](./MASTER_DATA_MAPPING.md) and [IMPLEMENTATION_BACKLOG.md](./IMPLEMENTATION_BACKLOG.md).
