# COCO 79 — Prioritized implementation backlog and acceptance plan

**Stage 00 deliverable · 12 November 2026 · reference outlet RO 369460**  
No DB write, no production deployment and no change to established operational formulas in this documentation PR.

## How we work

- **One source of truth per domain.** Pump infrastructure owns physical assets/chart versions; shift/stock modules own readings and receipts; finance owns collection/deposit ledger; equipment owns fault states; Document Vault owns attachments.
- **No duplicate transactions.** A scanned invoice or historical DSR is evidence until reviewed; imports must be idempotent, previewable and attributable to an authorized user.
- **Never turn missing into zero.** Apply to readings, automation status, nozzle totals, payment amounts, receipt quantities and reports.
- **Safe gates.** CALIBRATION activation, shift closure, manual automation operation, financial overrides, personnel data and MDG enforcement require explicit authorized review.
- **Tests before merge.** TypeScript, automated suite and production build, plus focused human/UAT tests for workflows; no remote D1 seeding.
- **Security.** Log minimum necessary personnel information, never commit original employee scans or invoice PDFs to GitHub; honor scope and document permissions.

## P0 — Must be resolved before real COCO 79 operational use

| ID | Stage | Task | Acceptance / proof |
| --- | --- | --- | --- |
| P0-01 | 00 | Confirm isolated staging Cloudflare Worker/D1/R2 and Vercel preview; document versions and restore plan | A reviewer verifies staging cannot write to production and backup + rollback rehearsed |
| P0-02 | 00/01 | Obtain read-only COCO 79 master snapshot (RO code → internal ID; products, tanks, DUs, nozzles, templates) | Snapshot matches real outlet and has an approved mismatch register; no secrets or HR PII in report |
| P0-03 | 01 | Certify product and tank-to-nozzle mapping against physical equipment/automation | Each nozzle points to correct DU, tank and product; no ambiguous/missing active links |
| P0-04 | 01 | Transcribe 10/20 KL charts with two-person verification and match **each chart to a tank** | Per-point validation, consistent units, monotonic volumes, capacity check, certificate, engineer approval; dry-run only |
| P0-05 | 02 | Execute end-to-end **single-shift** operational UAT on staging | Open → opening readings → nozzle readings/test quantity → receipts → closing readings → reconcile → close and audit; errors show useful reasons |
| P0-06 | 03 | Match invoice 09/10-Nov records to receipt fields and independently measured decantation evidence | Invoice lines mapped to product; TT, seals, tank assignment, densities, pre/post readings and status verified; no double-counting |
| P0-07 | 04 | Reconstruct one verified COCO 79 day from independent readings, receipts and DSR | Product-level opening + receipts − sales = theoretical closing; measured stock/variance explained; missing ≠ 0 |
| P0-08 | 04 | Supply one same-shift payment mode summary, cash handover and bank deposit record | Reconciled totals, authorized variance reason and payment statuses; paise precision maintained |
| P0-09 | 07 | Role and outlet-scoped UAT, including denied-action tests | Operator/Dealer/FO/Admin see only permitted outlets, no unauthorized writes, scoped documents safe |
| P0-10 | 07 | Controlled release gate | CI green, UAT evidence approved, applied-migration check, D1 backup/restore tested, signed change record |

## P1 — High-value operational improvements after master verification

| ID | Stage | Task | Acceptance / proof |
| --- | --- | --- | --- |
| P1-01 | 01 | Validate 43-row staff file, collision check and employment status | Unique employeeCode within approved scope; no personal source files committed; HR sign-off |
| P1-02 | 03 | Review MDG-based receipt/decantation checklist **against existing validations first** | No duplicate form; each check linked to existing data/source/evidence; approved applicability matrix |
| P1-03 | 05 | Integrate 10 EFMS complaints and ORPAK history through existing equipment tickets/events | External IDs traceable; approval, repair, outage, authorized operation and verified restoration are distinct states |
| P1-04 | 05 | Add independent ATG availability and restoration evidence for HSD Tank-2 | 03-Nov fault and 06-Nov replacement stay in one linked history; no false zero reading or auto manual authorization |
| P1-05 | 06 | Link invoices, calibration documents, technician reports to authorized document categories | Cross-outlet read denied; source document retrievable to authorized role; retention policy reviewed |
| P1-06 | 06 | Build applicability/ownership matrix for MDG 2024 / COCO | Document-only guidance before approval; any enforcement requires explicit functional specification and policy authority |
| P1-07 | 00 | Update stale release docs/migration inventory (README 0026 vs code 0035) | Current migration count, actual applied state, environment & UAT instructions consistent |
| P1-08 | 02/04 | Review shift-close persistence and audit behavior under failures/retries | Idempotent repeat close, rollback consistency and corresponding audit completeness demonstrated in tests |
| P1-09 | 04 | Financial/monthly report parity against one signed source day | Independent expected vs actual per outlet/day/product and collection type; discrepancies logged |

## P2 — Efficiency and broader coverage after core readiness

| ID | Stage | Task | Acceptance |
| --- | --- | --- | --- |
| P2-01 | 05 | Preventive-maintenance inspection checklist mapping | Engineer can record observed work and evidence; scans not auto-classified |
| P2-02 | 06 | Approved record retention and due-date reminders | Date/evidence/source-of-truth visible; no invented statutory due dates |
| P2-03 | 06 | Personnel-specific roster/attendance validation | Site-approved shifts, workforce privacy and roles verified |
| P2-04 | 07 | Pilot on a second outlet after COCO 79 | Master mapping and data-isolation/UAT repeat without code forks |

## No-source / unapproved-policy items (not blockers for Stage 00 itself)

- Official COCO 79 tank ID/serial register, nozzle/DU wiring and effective shift templates.
- Complete tank-wise certified chart provenance and approval signatures.
- Signed same-day nozzle opening/closing, dip/water/density readings for one **completed** shift.
- Verified collection-mode split, handovers, bank statement/deposit evidence and credit settlement.
- COCO applicability and authority for MDG sections (especially automation and stock variance).
- Confirmation of staff employment status and who requires system login versus roster-only record.
- Remote D1 migration status, backup recovery confirmation and authorized production owner.

## User-friendly implementation order

1. **Master verification screen / report:** Confirm outlet, tank, product, DU, nozzle and chart mapping before any editable daily entry.
2. **Shift-ready check:** Show which records are available/missing and why; no blocking logic until approved.
3. **Single-journey day-entry view:** Reuse existing shift APIs; opening → readings → receipts → closing → review.
4. **Evidence-linked receipt review:** Match invoice and tank/density evidence, track who verified.
5. **One-page reconciliation:** Explain product sales, receipt, theoretical vs measured stock and variance with exact source.
6. **Integrated exceptions:** ATG outage, unresolved receipts, missing nozzle reading or unverified maintenance state.
7. **Approved DSR and reports:** Reconcile summaries to raw records; no manual fabricated totals.

## Staging UAT cases

| Test ID | Scenario | Expected outcome |
| --- | --- | --- |
| T-001 | Login under another outlet's scope and request COCO 79 data | 403 / restricted; no data leaked |
| T-002 | Open COCO 79 shift with valid config | Snapshot includes correct approved active tanks, nozzles, product prices |
| T-003 | Attempt entry where calibration missing/invalid | Explicit safe error; no zero stock silently produced |
| T-004 | Check 10 KL and 20 KL chart samples with known checked dip points | Exact volumes agree with certified table and service rounding within approved precision |
| T-005 | Submit nozzle reading with missing closing totalizer | Mark incomplete; do not replace with 0 |
| T-006 | Replay 09-Nov invoice into *isolated staging* twice | Idempotency/duplicate protection; one authoritative receipt |
| T-007 | Receipt invoice 09-Nov product totals vs expected DSR | Variance report correctly distinguishes missing physical receipt from invoice quantity |
| T-008 | Recorded ATG offline without valid manual authorization | Equipment state visible; no implicit authorization inferred from ticket status |
| T-009 | 03-Nov service visit vs 06-Nov repair completion | Ticket and service timeline preserve distinct status transitions |
| T-010 | Attempt premature shift close with incomplete required receipt/readings | Block safely with precise reason according to **existing** approved rules |
| T-011 | Close a fully validated shift and re-attempt close | Exactly one authoritative closure, consistent audit, no duplicate recon |
| T-012 | Submit finance totals with missing cash/credit evidence | Explicit missing-data state; no arbitrary zero |
| T-013 | Download document from an unassigned outlet | Denied; R2 object not exposed |
| T-014 | Export DSR, then compare with approved COCO 79 sample | Product/date quantities and units agree or discrepancies documented |
| T-015 | Retry network failure during a saving operation | No duplicate financial, reading or receipt records |
| T-016 | Mobile shift-readings form with 5+ tanks and multiple nozzles | Actions accessible, values readable; no hidden irreversible operation |

## Release acceptance evidence per backlog item

Every implementation PR must include: **purpose**, owner, original source requirement, existing table/API reused, data impact, permission scope, screenshot or UI recording (if visual), positive/negative/failure tests, production migration requirement (yes/no), approval and rollback notes.

**Next action (Stage 01):** produce the *read-only* COCO 79 master-snapshot comparison, then an approved isolated staging fixture. **Do not** start with a historical DSR import or a global policy rule.
