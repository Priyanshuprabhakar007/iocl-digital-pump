# Section-wise COCO Operations & Compliance Report

## How to use
1. Open **Documents** and choose the correct outlet and report date.
2. Select **Tab 4 — Section-wise PDF** to inspect a read-only preview built from saved records.
3. Select **Download Section-wise PDF**. Every section starts a new A4 portrait page. If a section has more rows than fit, the exporter adds continuation pages. Page indexing is only in the footer, never the heading.
4. The earlier 14-category Compliance One-Pager stays available and unchanged under Tab 2.

## Export layout and source mapping

| Print section | Read-only source | Limitations / data entry |
| --- | --- | --- |
| Lease & Agreements | Land Lease (LAND_LEASE custom compliance category), Service Provider Contract (SERVICE_PROVIDER_CONTRACT), NFR Management (nfr_leases and vendors), other agreement categories | NFR dates and vendor names come from NFR master. Agreement counterparty for manual contracts, V Code, Customer Code and site classification require dedicated source fields and are displayed as **Not Recorded** until available. |
| Bills, Taxes & Charges | Property Tax, Lease Rent, Electricity, Water, other custom charges (OTHER_STATUTORY_CHARGES) | Aggregation reuses CocoComplianceService to reflect municipal tax, NFR and utility payment state; reports do not write to finance/utility tables. |
| Licences & Certificates | PESO, Weights & Measures stamping, Fire Extinguisher Refilling, and optional custom category OTHER_CERTIFICATE | **Public Performance Licence (PPL) intentionally omitted from this section-wise report only**. It remains available in the original compliance register. |
| Maintenance & Assets | Equipment Assets (count and make), COCO compliance service records | Equipment status ACTIVE, MAINTENANCE, or DECOMMISSIONED does not assert **Working / Not Working / Scrapped**. Inspection condition and last-checked date remain **Not Recorded** without verified operational status evidence. |
| Claims & Payments | NFR rental status and manual compliance categories WEIGHTS_MEASURES_STAMPING_CHARGES, FIRE_EXTINGUISHER_REFILLING_CHARGES, UNIFORM_CHARGES, WAGES_INCENTIVES_MISC | NFR rental is included only when NFR is the authoritative source. Expense claims are not derived from shift fuel-sales collections, handovers, or bank deposits. |

## API
- GET /api/v1/documents/compliance/section-wise?outletId=...&reportDate=YYYY-MM-DD — preview model
- GET /api/v1/documents/compliance/section-wise/pdf?outletId=...&reportDate=YYYY-MM-DD — PDF bytes

Both endpoints require documents.read, authenticated access to the requested outlet scope, and make no operational data changes. Export emits an audit record. The UI uses the same report model for preview and PDF.

## Acceptance checks
- Five sections in the exact order: Lease, Bills, Licences, Maintenance, Claims.
- A4 portrait tables in black-and-white printer-friendly style, no page index inside heading.
- All source values are outlet-scoped and match saved records; no fabricated zeros, payments or assets.
- PPL excluded from licences page without removing the existing PPL compliance record.
- Missing source fields clearly display Not Recorded.
- Each new section begins on a new page; overflow creates additional section-continuation pages.
- Preserve existing PDF export, roles, document vault, D1 migrations, and other modules.

## Local validation
Run bun run typecheck, bun test tests/cocoSectionWiseReport.test.ts, bun test tests/cocoDocumentsCompliancePhase1.test.ts, and bun run build using a disposable local D1 database. A passing synthetic test is not a substitute for permitted hosted staging UAT or finance/operations signoff.

## Known follow-up scope
- Authoritative agreement master for Land Lease and Service Provider Contract, including counterparty, V Code, Customer Code, site class, agreement start/expiry, and attachments.
- Audited claims/expense register with settlement evidence, invoice references and approvals.
- Verified condition inspections for Water Cooler, POS, CCTV and DG assets.
- Reconcile payment status and amounts against source documents for each production outlet.

No schema migration, remote database modification, physical pump infrastructure change, or production rollout is part of this change.


## Phase 2: Documentation Masters & Evidence

Under Documents, select **Tab 5 — Masters & Evidence** and the relevant outlet. The separate forms now capture data which was previously **Not Recorded**:

1. **Agreement Master:** Land Lease, Service Provider Contract, additional NFR metadata, and Other agreements. Enter agreement number, agreement counterparty, V Code, customer code, site classification, validity dates, evidence attachment and remarks. NFR metadata references the existing NFR lease ID; NFR contractual dates and vendor are sourced from the original NFR module rather than duplicated.
2. **Claims & Payments:** Add an expense claim with category, invoice, period, due date, amount, and Document Vault evidence. It is initially **DRAFT**. Only a *different* globally scoped administrator may approve it. A payment requires an **APPROVED** claim, payment date, amount, payment channel, unique reference number and outlet-matched receipt. Total payments may not exceed approved claim amount. Partial settlements are supported and never shown as fully paid.
3. **Equipment Inspection:** Choose an existing equipment asset, capture its observed **WORKING / NOT_WORKING / SCRAPPED** condition, inspection date, upcoming service date, remarks and evidence attachment. History is append-only; the latest eligible inspection as of the report date determines display status.

Supported API:
- GET /api/v1/documents/compliance/masters?outletId=... (requires documents.read and outlet scope)
- POST /api/v1/documents/compliance/masters/agreements (documents.write)
- PUT /api/v1/documents/compliance/masters/agreements/:id (documents.write)
- POST /api/v1/documents/compliance/masters/claims (documents.write)
- PUT /api/v1/documents/compliance/masters/claims/:id (documents.write, DRAFT only)
- POST /api/v1/documents/compliance/masters/claims/:id/decision (global administrator + documents.write, maker-checker)
- POST /api/v1/documents/compliance/masters/claims/:id/settlements (documents.write, approved claim, outlet receipt)
- POST /api/v1/documents/compliance/masters/inspections (documents.write and equipment_assets.write)

All routes enforce outlet scope. Documents and equipment are checked against the same outlet. Write operations and audit entries use D1 transactional batches, while SQLite triggers prevent overpayment and wrong-outlet equipment inspections. The user must register a Water Cooler, CCTV, POS or Generator as an Equipment asset (OTHER or DG_SET type) before condition entries can be created.

### Database and hosting safety
- **PROPOSED migration:** docs/proposed-migrations/0036_coco_agreements_claims_inspections.sql (additive: 4 tables, indexes, constraints and guards). It is deliberately outside the approved migrations/ directory because the current release gate freezes that directory at 0035. No old DSR, shifts, fuel settlement or tank data is modified.
- An existing hosted instance without 0036 can still export its old report, but **Tab 5 cannot save or list new masters** until the new schema has been reviewed and applied.
- **Do not automatically run remote migrations or production deploy scripts as part of a code PR.** First confirm the target D1 database and a tested recovery bookmark / backup, review migration 0036 and the hosted status, and obtain explicit authorization before applying it.
- Run the unit/integration suite, test user-role and outlet isolation, approve/settle a disposable sample claim using separate accounts, compare generated PDF against saved records, and confirm no duplicate or overpaid expenses.
- Payment status is based on evidence and approvals. Fuel-sales collection entries in Financial Operations are not automatically expense claims.
- Use the real Document Vault for records. No production credentials or uploaded actual customer invoices are embedded in tests.

### Pending hosted acceptance
- [ ] TypeScript, isolated tests, and build pass.
- [ ] Exact migration version reviewed against the actual hosted database; recovery/rollback plan approved.
- [ ] Dedicated **non-production** D1 migration rehearsal and role-based UAT passes.
- [ ] Verify correct Vercel/Worker environment points to intended DB and no stale branch.
- [ ] Only then consider release and enable master entry for real outlets.

**Release freeze note:** CI requires exactly the original 35 migrations. This PR does not change the approved sequence or authorize hosted D1 migration. Local API tests apply the proposed SQL only to a disposable local database. A separate explicitly approved migration/release PR is required before live master-entry endpoints can work.
