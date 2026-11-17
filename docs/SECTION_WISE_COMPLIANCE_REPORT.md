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
