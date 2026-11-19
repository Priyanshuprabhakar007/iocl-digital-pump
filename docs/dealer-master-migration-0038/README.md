# Dealer Master extension — proposed migration 0038

This is **not** part of the currently frozen automatic migrations directory. It is deliberately held under `docs/` for an explicit, separate release decision.

## What is implemented
- `dealer_ro_master_details`: outlet-linked contact email/phone, customer group, original site description, market class and commissioning date.
- `dealer_land_master_details`: outlet-linked land status, purported owner, and original area with original unit (e.g. SQMT or ACR).
- `dealer_lease_source_records`: outlet-linked **source candidates**, preserving order reference, dates, original monthly rent string, GST, duration, escalation and remarks. A row in this table is **not** a legal lease or an accounting/finance entry.

The Worker routes are scoped to authenticated outlets. Global admins with `OUTLETS_UPDATE` or `DOCUMENTS_WRITE` may explicitly fill missing values (no conflicting overwrites) and register a lease-source candidate. Linking a source to a saved `LAND_LEASE` requires an existing document, a verified reference/date match, same-outlet constraint, explicit confirmation and an audit log. No endpoint in this PR auto-creates an agreement or modifies payment/rent ledgers.

## Release gates
1. PR #74 26-field source audit must be merged first, and its **real Excel style parsing must be verified**. Never assume yellow formatting was detected without checking the uploaded workbook.
2. Check the actual target Cloudflare D1 database identity and existing migrations (especially Documentation master `0036`). Document a recoverable backup/bookmark.
3. Apply this SQL **only to a disposable local database, then isolated staging database**. Test with the official D1 dialect and same schema versions as production. Unit test uses disposable SQLite for foreign-key/trigger smoke.
4. Check authorized roles, outlet scoping, archived outlets, idempotent no-op behavior, audit writes, duplicate source keys, cross-outlet linked agreement denial, signed-contract requirement and stale-request collision handling.
5. Adopt explicit production change approval **separately** from any code PR. Do not run remote migrations, R2 writes or live data imports during the PR stage.
6. Verify the existing `0037` lease-terms migration **independently** before enabling any canonical lease monthly-rent/dimension writes. This proposal preserves raw rental terms but does not imply `0037` is applied.
7. For every Excel row with yellow cells, use per-cell/destination verification. Yellow cells are a preservation signal, not evidence that an agreement record exists. Do not auto-create legal agreements solely because Excel names an owner and rent.

## API after an approved migration

Authenticated and scoped `GET /api/v1/outlets/:id/dealer-master-extension` returns the three extension sources plus existing signed `LAND_LEASE` matches, not all owners/agreement histories.

Global-privileged and scoped write paths:
- `PATCH /api/v1/outlets/:id/dealer-master-extension/ro` — fill-only-missing source metadata.
- `PATCH /api/v1/outlets/:id/dealer-master-extension/land` — fill-only-missing land metadata.
- `POST /api/v1/outlets/:id/dealer-master-extension/lease-sources` — create raw lease source candidate; refuse duplicate source key.
- `POST /api/v1/outlets/:id/dealer-master-extension/lease-sources/:sourceId/link` — manually confirm verified source → existing signed land lease linkage.

**No bulk Excel writer is wired to these routes in this stage.** The bulk importer remains read-only for full 26-column files and will be integrated only after additional field-level collision tests and verified yellow-style decoding. There is no user-facing claim that all 26 columns have been saved yet.

### Important source interpretation
- `CUSTCODE` is the outlet key; do not use as lease order number.
- `LAND OWNER` is raw source metadata and not automatically the agreement counterparty.
- `FROM`/`TO` are source dates, not automatically final signed terms.
- `AREA`/`measuring unit` retain exact source unit (SQMT, SQMTR, ACR); do not silently convert.
- Rent, GST and escalation strings remain source evidence until validated against signed agreement.
