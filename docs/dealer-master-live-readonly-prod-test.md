# Approved-scope production live preview (READ ONLY)
Deployment intention: expose the 26-column Dealer Master **preview UI only** on the real Vercel production site. No schema 0036/0037/0038 migrations are authorized or applied. No linked lease or RO records will be created or updated.

- New frontend and API server import write paths refuse approval in this release. Existing non-import outlet/lease workflows remain unchanged.
- The existing outlet directory and hierarchy can be read via the authenticated main production APIs. Users can upload the original workbook and compare RO Codes and 26-column yellow-cell protection.
- The read-only Stage 4 panel displays live RO match counts from the outlet API. A full land/lease snapshot requires 0036/0038; if unavailable it displays an honest error and offers RO-only export. Never imply a blank detail table means a missing lease.
- Avoid uploading Excel on a preview URL with misconfigured API origin. Use the real `https://iocl-digital-pump-xi.vercel.app/outlets` URL, hard-refresh, sign in, then upload XLSX and validate yellow counts.
- **No backend import writes:** Production Worker config uses `ENVIRONMENT=production`; all new dealer-master mutation endpoints are forbidden with 403. The production website UI has hardcoded read-only mode (requires an independently reviewed change to remove).
- A single consolidated squash merge to main minimizes Vercel Free preview consumption. Vercel may still automatically build previews for the release PR and deploy main.
- If Vercel production points to an unexpected API base or missing Worker release, abort and verify endpoints, do not click sync and do not change D1.
- Before future live data import: a verified recovery point, hosted staging QA, migration approval, record-level dry-run and separate explicit user approval are required.
