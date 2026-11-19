# Stage 4 — Dealer Master 26-Column Controlled Import & Synchronization

## Scope and trusted source

The user-supplied `IOCL Dealer Master RO A Site.xlsx` has:
- 131 outlet data rows and 27 worksheet columns (`S. NO.` + 26 business columns).
- 13 original rows with yellow formatting and **214 protected cells** when the source is examined as XLSX SpreadsheetML (including yellow serial-number cells).
- Yellow is a user-defined `already entered` marker on **individual cells**, not permission to overwrite or proof of a corresponding agreement in another module.

**The original workbook must never be committed to GitHub.** The tests use synthetic/redacted fixtures only.

## New feature

1. Upload the **original XLSX**. The import parser opens its ZIP and checks `xl/styles.xml`, workbook relationships and the selected worksheet's style IDs. If parsing fails or no expected yellow styles are found, the approval button remains disabled.
2. Show all 26 columns in the coverage table; then show separate `OUTLET`, `RO_DETAILS`, `LAND` and `LEASE_SOURCE` field-level decisions:
   - `CREATE` (only for eligible new outlet/lease source records)
   - `FILL_MISSING` (saved field blank)
   - `PROTECTED` (yellow cell, never written)
   - `UNCHANGED` (already identical)
   - `CONFLICT` (nonempty saved field differs, never overwritten)
   - `REVIEW` (unverifiable date, hierarchy or legal status)
3. For an outlet absent from the current database, standard outlet registration prerequisites still apply: verified division/area, site classification, city and six-digit PIN. Do not derive location data from an address guess.
4. `Download City/PIN Supplement` exports **only CUSTCODE, CITY, PINCODE**. Uploading the completed supplement overlays verified fields by RO Code; the **original highlighted workbook is not re-exported** because that could erase yellow fill metadata.
5. Admin approval is separate from merely uploading a file. On approve, fetch a fresh global snapshot and compare its full destination-by-destination plan with the reviewed preview. Abort and require re-approval if anything changed.
6. Save eligible rows through existing authenticated outlet creation and the Stage 2/3 protected RO/Land/Lease-source APIs. A failure stops further processing; successful earlier operations are not silently rolled back. Record batch start/completion in `audit_logs`; each accepted field write is independently audited by existing APIs.
7. Export all field decisions and actual per-row sync results to Excel.
8. The UI exposes recent batch audit history. Approval requires global-admin scope and the required outlet/document permissions.

**Lease records**: raw lease-source terms are merely evidence. Stage 4 does **not** create a legal land lease, change canonical rent, or link to existing signed agreements automatically. Potential signed matches are shown for separate legal review; actual linking requires agreement reference/date evidence, matching outlet ID and a signed document.

## Release safety

- PR #74: source coverage and yellow-style read-only audit.
- PR #75: proposed *additive* migration 0038 and authenticated RO/Land/Lease-source endpoints.
- PR #76: this Stage 4 workflow (stacked after #75).
- Migration 0038 is deliberately in `docs/dealer-master-migration-0038/`, not the automatic migrations folder.
- Migration 0037, for canonical lease monthly value/dimensions, is **separate and currently unapproved**. Preserve source units (SQMT, SQMTR, ACR) exactly until verified normalizations are approved.
- Do not run `wrangler d1 ... --remote`, demo-deployment workflows, or scripts that seed/rebuild data as part of UI approval testing.
- The Cloudflare D1 database UUID, Worker environment, live origin and backup/bookmark must be positively verified before staging or production migration.
- No production import is authorized by these code PRs. The data-changing user action requires a separate approved import plan after staging acceptance.

## Isolated acceptance sequence

1. Run `bun test tests/dealerMasterXlsxColors.test.ts tests/dealerMasterStage4.test.ts tests/dealerMasterStage4Routes.test.ts`.
2. Typecheck and build frontend with no backend credentials.
3. Apply baseline migrations + proposed 0036 and 0038 **only to an isolated local/staging database**. Verify all D1 foreign-key checks and source/lease outlet integrity triggers.
4. Seed one *synthetic* existing outlet with manually entered values, one new outlet, one yellow row and an unhighlighted row. Verify protected values remain unchanged, duplicate codes blocked, new outlet prerequisites enforced and source-key duplicate protections.
5. Verify complete original XLSX layout with no live credentials: exactly 131 data rows, 13 yellow rows and 214 protected cells (including S. NO.). Confirm no sensitive workbook contents are logged or committed.
6. Verify repeated upload is idempotent. Simulate a partial failure and confirm results export and audit history accurately report it. Re-upload and confirm no duplicate outlet or lease source.
7. Check hierarchy alias mapping and missing City/PIN supplement flow.
8. Independently review signed lease agreement links; never auto-create legal records from the Excel source.
9. Only after staged acceptance and explicit separate approval, deploy the compatible Worker and frontend, apply reviewed migrations with backup, and request deliberate production import authorization.

Current state: implementing and testing in draft PR. Not merged, no hosted migrations, no live records changed.
