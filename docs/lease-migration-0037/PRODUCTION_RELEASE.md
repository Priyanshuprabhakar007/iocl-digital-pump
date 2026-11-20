# COCO 0037 production release (additive)

Authorizes only the new `coco_agreement_lease_terms` table and two restricted type-validation triggers. It does not change existing agreements, documents, NFR ledger entries, outlets, or source draft rows. The release runner verifies production D1 ID, time travel recovery bookmark, a full private ephemeral SQL export, and before/after fingerprints. The repository is public: never publish D1 export data to workflow artifacts or logs.

Preflight runs the existing 0036+0037 integration rehearsals with a disposable local D1 and checks the release script. A non-empty partial 0037 schema is blocked; a fully verified existing 0037 schema is skipped idempotently. The deployment is blocked if any independent check fails.

The 0037 canonical units are SQYD/SQFT/FT_LXW. `ACR` from an Excel source must remain visible as raw, **unverified** evidence, not silently converted. Optional document attachments are stored in the existing outlet-scoped R2 Vault, not migration 0037. Do not falsely label a source-only record as an executed or independently verified legal contract. Existing migration 0038 is not part of this release.
