# COCO 79 — Source-to-system master-data map

**Stage:** 00 (analysis only) · **Outlet:** RO `369460` · **Target system:** current `src/db/schema.ts` at baseline `229925f`  
**Data classification:** Operational; S05 employee records are restricted personnel data. No source PDFs, employee identities, invoice scans, or credentials are stored here.

## Mapping convention

- **FOUND IN CODE** = target table/field or route exists in source, **not** verified populated remotely.
- **VERIFY** = value/identity/unit/authority must be checked against signed or independent outlet records.
- **MISSING EVIDENCE** = no sufficient source document supplied.
- **DESIGN GAP** = source attribute not represented cleanly by the currently inspected target model; propose only after review.
- **NO WRITE** = do not load into production D1, apply migrations or activate charts as part of this Stage 00.

## A. Outlet and pump infrastructure

| Source | Source attribute | Existing target | Transform / match | Gate |
| --- | --- | --- | --- | --- |
| S04/S07 | COCO / SAP / RO code `369460` | `retail_outlets.roCode` | Search exact RO code; resolve internal `retail_outlets.id` by read-only query; avoid hard-coded database ID | VERIFY |
| S01 | Tank label and product annotations | `tanks.tankNumber`, `.name`, `.productId` | Do not infer a tank's durable ID from a sketch position | VERIFY |
| S01 + certified asset list (not supplied) | Tank capacity | `tanks.capacityLitres`, `.safeFillCapacityLitres` | Confirm tank-wise capacity, installed product, approved safe fill | MISSING EVIDENCE |
| S01 + certified DU schedule (not supplied) | Dispenser and nozzle connections | `dispensers.dispenserNumber`; `nozzles.nozzleNumber`, `.dispenserId`, `.tankId`, `.productId` | Cross-check physically and with current automation mapping | MISSING EVIDENCE |
| S03 | MS, HSD, XP95, XG, XP100 | `products`, `outlet_products` | Product-code aliases must match active master IDs; do not create duplicate products | VERIFY |
| Shift roster / operations register (not supplied) | Shift code, times and sequence | `shift_templates.code`, `.startTime`, `.endTime`, `.sequence` | Match actual COCO shift pattern, including overnight rules | MISSING EVIDENCE |

**Approval checkpoint:** outlet manager + authorized equipment/operations reviewer sign off tank-to-nozzle topology before shift-entry staging.

## B. Tank calibration and stock readings

| Source | Attribute | Existing target / service | Rule and risk | Gate |
| --- | --- | --- | --- | --- |
| S02 p.1 | 10-KL chart identity, header and printed units | `tank_calibration_charts` (`tankId`, `sourceFileName`, chart dimensions and capacity) | Identify which physical tank and valid chart revision it represents | VERIFY |
| S02 p.2 | 20-KL chart identity, header and printed units | same | Confirm dimensions/units independently, avoid chart capacity assumed from filename alone | VERIFY |
| S02 both | Dip ↔ volume tabulated pairs | `tank_calibration_points.dipMillimetresMilliunits`, `.volumeMilliunits` | Double-entry/manual QA; monotonicity, range, capacity and rounding; preserve all original points | VERIFY |
| S02 | Chart approval/effective validity | `tank_calibration_charts.status`, `.revisionNumber`, `.approvedBy`, `.effectiveFrom` | No activation without engineer + outlet sign-off and safe dry-run | MISSING EVIDENCE |
| Daily tank dip register (not supplied) | Date/shift, opening/closing dip, water dip | `tank_stock_readings` and `operational_shifts` | Distinguish truly missing vs measured 0; record source and timestamp | MISSING EVIDENCE |
| S03 | Product-day opening/receipts/sales | `fuelDailyOperationsService` aggregate output, `shift_stock_reconciliations` | Use independent cross-check, not as a substitute for measured dips/nozzles | VERIFY |
| S07/S08 | ATG HSD Tank-2 offline/online history | `equipment_assets`, tickets, events and document links | Distinguish automated reading unavailable from physical zero; no implied manual authorization | VERIFY |

**Existing code:** `src/worker/routes/tankCalibration.ts` includes dry-run, version status and engineering verification routes; `src/worker/services/tankCalibrationService.ts` uses deterministic scaled interpolation. Review/scientifically verify expected points before changing these.

## C. Fuel invoices, receipts and decantation

| Source | Attribute | Existing target | Transformation / verification | Gate |
| --- | --- | --- | --- | --- |
| S04 | Invoice number, invoice date and TT vehicle number | `fuel_receipts.invoiceNumber`, `.invoiceDate`, `.ttNumber` | Check uniqueness, invoice/arrival date distinction, vehicle ID | VERIFY |
| S04 | Product rows and invoiced quantity | `fuel_receipt_tank_lines.productId`, `.invoiceQuantityMilliunits` | 1 KL = 1,000 L; convert with decimal-safe units; validate per-product and per-invoice total | VERIFY |
| S04 | Invoice density / temperature where documented | `fuel_receipt_tank_lines.invoiceDensityMilliunits`, `.temperatureMilliunits` | Confirm measurement basis/units and 15°C reference before any tolerance decision | VERIFY |
| Missing site decantation log | Actual tank receiving product | `fuel_receipt_tank_lines.tankId` | Invoice may not show authoritative receiving tank; confirm from staff/automation record | MISSING EVIDENCE |
| Missing site dip log | Pre/post-decantation dips and measured volume | `.preDecantReadingId`, `.postDecantReadingId`, `.measuredReceivedQuantityMilliunits` | Only valid linked readings from same shift/tank; no invented figures | MISSING EVIDENCE |
| Missing checklists and sign-off | Seals, compartments, safety, sample retention | `fuel_receipts.sealVerified`, `.sealExceptionReason`; other quality/evidence models to review | Map existing validations; propose supplementary checklist only after MDG applicability approval | VERIFY / POSSIBLE GAP |
| S03 + S04 | Daily receipt totals by product | `fuelDailyOperationsService` and existing receipt endpoints | Reconcile by business date, not blindly by invoice calendar date | VERIFY |
| S04 scans | Invoice evidence | `documents` (R2) | Link to receipt with role/scope control and redaction where needed | VERIFY |

**Historical UAT fixture candidates:**
- 2026-11-09: MS 9,000 L; HSD 9,000 L; XP95 4,000 L (invoice fields; check source and DSR independently).
- 2026-11-10: MS 13,000 L; HSD 9,000 L (invoice fields; check source and DSR independently).

**Never** create these in the production receipt ledger; replay only into a designated isolated test database with idempotent fixtures.

## D. Daily shift, stock, finance and DSR

| Required business field | Existing source in system | Evidence supplied | Stage 00 state |
| --- | --- | --- | --- |
| Outlet, business date, shift identity and status | `operational_shifts` / shift routes | S03 product-day dates only | Actual shift ID/closure record missing |
| Tank opening/closing with chart revision | `tank_stock_readings` + snapshots | S02 calibration; S03 product-day totals | Need measured shift dips |
| Nozzle opening/closing, testing and unavailability | `nozzle_meter_readings`, `nozzle_unavailability_records` | Not supplied | **BLOCKER** for shift-to-DSR reconciliation |
| Receipt, pre/post dip and density | `fuel_receipts`, `fuel_receipt_tank_lines` | S04 invoices; S03 daily receipts | Site-side acceptance evidence missing |
| Stock variance and explanation | `shift_stock_reconciliations` | S03 ideal stock and product sales | Recalculate independently, not overwrite |
| Collections by mode | `shift_collections` | Not supplied | **BLOCKER** to full daily finance |
| Cash handover / bank deposit | `cash_handover_logs`, `bank_deposits` | Not supplied | **BLOCKER** to full daily finance |
| Authorized closure and audit | shift close service, audit repository | Not supplied | Staging tests needed |
| Daily and monthly reporting | `reportRoutes`, daily/monthly services | S03 historical DSR | Compare output after upstream masters confirmed |

**Unit guardrails:** fuel volume is stored in scaled milliunits; financial amounts are integer paise. Avoid floats, handwritten conversions or rounded spreadsheet values as authoritative inserts.

## E. Maintenance, staff and documents

| Source | Source field | Current model | Status / issue |
| --- | --- | --- | --- |
| S06 | External EFMS complaint ID, facility, date and description | `equipment_breakdown_tickets` + equipment assets/events | No dedicated external complaint ID was found in inspected ticket fields; **DESIGN GAP** candidate, pending full schema/API review |
| S06 | Approval, rejection, vendor closing and remarks | ticket events/notes + source attachment | Must not collapse to a single `CLOSED` state; approval ≠ repair |
| S07/S08 | Report number, failed/replaced probe, service visit dates | equipment ticket events + Document Vault | Deduplicate shared complaint 4101172143 and link reports |
| S09 | Maintenance checks, readings and technician sign-off | equipment events + source PDF attachment | Handwriting requires verification, not auto-pass |
| S05 | Employee ID, name and designation | `hr_staff.employeeCode`, `.fullName`, `.designationId` | Restrict access; verify potential ID collision and employment status before import |
| S05 | Father's name | **No corresponding required `hr_staff` field** | **DO NOT IMPORT** without an approved purpose and legal basis |
| Missing | Joining/leaving date, contact/role assignment | `hr_staff.employmentStatus`, roster and user assignments | Verify independently; staff are not automatically login users |
| S06–S09 | Evidence attachment | `documents` (R2), COCO compliance reference/link model | R2 authorization and retention review required |
| S10 | MDG receipt/stock/automation/maintenance procedures | Existing operational and compliance modules | Applicability to COCO **not approved**; guidance/evidence only, never auto-penalty |

## F. Read-only queries for a DBA/reviewer (examples, not executed)

Run against **the authorized staging or read-only snapshot**, using actual D1 schema and approved account. Do not paste personally identifying rows into tickets.

```sql
-- Resolve outlet ID safely from the public-facing RO code.
SELECT id, ro_code, name, status FROM retail_outlets WHERE ro_code = '369460';

-- Authorized reviewer replaces :outlet_id with the verified database ID.
SELECT id, tank_number, name, product_id, capacity_litres, status
  FROM tanks WHERE outlet_id = :outlet_id ORDER BY tank_number;
SELECT id, dispenser_id, nozzle_number, tank_id, product_id, status
  FROM nozzles WHERE outlet_id = :outlet_id ORDER BY dispenser_id, nozzle_number;
SELECT id, tank_id, revision_number, status, effective_from, approved_at
  FROM tank_calibration_charts WHERE tank_id IN
  (SELECT id FROM tanks WHERE outlet_id = :outlet_id);
SELECT id, code, start_time, end_time, sequence, status
  FROM shift_templates WHERE outlet_id = :outlet_id ORDER BY sequence;
```

**Caution:** Verify all SQL identifiers against the *live applied schema* first. These queries intentionally do not use personal employee fields or mutate data.

## G. Approval matrix for future import proposals

| Material | Required reviewer(s) | Approved action |
| --- | --- | --- |
| Site equipment topology | Site manager + designated IOCL engineering/operations official | Staging master import preview |
| Calibration scan/transcription | Authorized technical/engineering approver | Dry-run and approved chart-version activation |
| Historical DSR/receipts | Finance/retail operations owner | Redacted staging fixtures and independent comparison |
| EFMS/ORPAK service history | Facilities/service owner | Evidence link and verified operational state |
| Employee IDs and access | Authorized HR officer + security administrator | Minimum-necessary staging staff import |
| MDG controls / exceptions | Designated IOCL policy owner | Approved configuration, not automatic enforcement |
| Production deployment | Release + data owner | Change window, backup, CI and role UAT gates |

**Next:** [IMPLEMENTATION_BACKLOG.md](./IMPLEMENTATION_BACKLOG.md) gives the ordered tasks and acceptance tests.
