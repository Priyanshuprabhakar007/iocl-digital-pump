# Dealer Master Full Excel simple review — stage 1

User preference: one existing Excel Import screen, no separate D1 staging SQL and no colour-based exclusion. Preserve the original 26-column data (131 ROs) and use immutable RO Code identity to check duplicates before any upsert.

This change adds a **default Full Excel Import preview** to the existing React importer. It compares against the authenticated RO directory (including archived if global admin), displays NEW CANDIDATE vs EXISTING MATCH, highlights old/new changes for supported RO core fields, and exports all 26 original business columns and yellow indicators. Yellow indicators are *informational only* in this mode. Blank source values are never proposed as overwrites.

It retains the previous yellow-protected audit as an optional mode without altering its protections. The production write button is intentionally **disabled**, both in the importer and existing server-side import endpoints.

## Scope limitation
The current production D1 has 9 outlet rows (6 active and 3 archived), and one verified land lease for COCO 56, based on the user's read-only D1 query results. The live frontend directory matched six workbook RO Codes; counts can change after further DB writes. The workbook has no explicit City/PIN, and the production Worker has no Stage 4 batch-snapshot endpoint / migration 0038 fields. All source information is included in the review, but full destination values remain NOT VERIFIED until a separate authorized Worker/storage release.

The next, separately gated development is a fully audited server upsert with tested database recovery, verified unique RO Code matching and field-level overwrites, City/PIN and hierarchy mapping, and 26-field RO/Land/Lease storage. **This PR does not claim to import data into D1**. Do not remove the read-only feature gate or apply migration 0038 without approval and recovery checks.

This is a consolidated, one-commit, frontend-only PR to minimize Vercel Free preview builds.
