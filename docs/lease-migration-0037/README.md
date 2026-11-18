# COCO agreement lease terms — proposed migration 0037

## Scope
Keep Compliance Register unchanged. In Documentation > Masters & Evidence > Lease & Agreements:
- LAND_LEASE: optional dimension mode (sq yd, sq ft, length x width in feet) and monthly lease value in INR.
- NFR_METADATA: optional dimensions associated with the linked NFR lease; monthly value is read from the canonical NFR lease master. Edit the monthly rent in NFR & Lease Management. No separate rent ledger or duplicate amount.
- All agreement types: upload a signed PDF/JPEG/PNG (up to 5 MB) directly to the existing outlet-scoped R2 Document Vault and select/link existing evidence. Saving the agreement completes the linkage. An uploaded but unsaved/cancelled contract remains a vault file; no automatic deletion.
- Section-wise PDF includes a lease terms and contract-evidence table in the first section; legacy one-pager and register remain unchanged.

## Safe release gates
1. Use a **disposable local D1** to apply the original 35 migrations, then 0036, then `docs/lease-migration-0037/0037_coco_agreement_lease_terms.sql`. API and report regressions must pass. No remote mutations in tests.
2. Verify production D1 identity, migration 0036 and recovery backup/bookmark. Obtain approval before applying the SQL to the intended hosted D1 via a separate reviewed runbook. The 0036-only rollout directory and the frozen original migration folder are deliberately unchanged.
3. Rehearse the additive SQL against a verified isolated staging database. Confirm no change to pre-existing rows, foreign-key integrity and two validation triggers.
4. Apply 0037 only after approval and backup, then deploy compatible Worker and frontend. Old code and existing records remain compatible; new code reports leaseTermsAvailable=false until new table exists, and rejects attempts to save unavailable new fields rather than silently ignoring them.
5. Verify authorized outlet scope, upload/download, edit/reload of each measurement mode, exact monthly value, NFR canonical rent read, and report PDF. Do not create dummy lease or document in production; use staging or approved actual records.

No production D1 migration, Worker deployment or R2 write is authorized by this code PR alone.
