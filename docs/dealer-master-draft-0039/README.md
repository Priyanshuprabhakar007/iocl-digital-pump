# Draft Import — 26-column source snapshot (proposed migration 0039)

## What changes for the operator

On the **existing** Retail Outlets → Excel Import & Master Synchronization screen:
1. Upload the **original dealer master Excel** as usual (yellow and non-yellow values both included).
2. Choose **Save 26-Column Draft**. City/PIN and Sales Area mapping are *not required* to save a source draft.
3. Next session, open **Saved Drafts → Resume**; the current RO directory is queried again to refresh new-vs-existing matches. Final Sync remains locked.

A saved draft is **source evidence only**. It is neither an operational Retail Outlet nor a Land Ownership record, legally effective Lease Agreement, rent transaction or customer notification. Re-uploads with identical canonical source values are idempotent. Changed source data saves as a new immutable version, preserving history. The original file SHA-256 is metadata; stored source is a normalized JSON snapshot of exactly 26 business columns, original Excel row numbers, optional verified City/PIN supplement and yellow-cell markers for provenance. Yellow cells do **not** block saving.

## Security / safeguards

- Global-scope ADMIN with \`outlets.read\` / \`outlets.update\` permission only, using existing session authentication.
- Draft POST requires \`confirmedDraftOnly=true\` and \`importPolicy=FULL_INCLUDING_YELLOW\`. Reject duplicate CUSTCODE within upload, code/name mismatches, missing business columns and invalid supplement PIN.
- Max 500 source rows / 600 KB canonical JSON payload, allowing the current 131-row workbook but avoiding D1 oversized records.
- Independent \`dealer_master_draft_uploads\` table and database-level immutable/update/delete triggers.
- \`UNIQUE (created_by, content_sha256)\` ensures duplicate saves do not create duplicate drafts.
- Audit log includes metadata and counts, **never the 26-column customer/lease content**.
- Read/list/load only the logged-in creator's own drafts; no wide/global leaks.
- No endpoints for \`retail_outlets\`, \`coco_agreement_details\`, finance or rent writes are used.
- The existing **Confirm Full Import — Locked** gate and production import-write 403 blocks remain unchanged.

## Deployment gates

**Migration 0039 is a separate, additive draft-only proposal.** It lives in \`docs/dealer-master-draft-0039/\`, NOT in automatically executed \`migrations/\` and is independent of proposed 0036/0037/0038. Existing production D1 previously showed 9 outlets and 1 land-lease, which must remain unchanged. No remote D1 migration is run by this PR.

1. CI tests the proposed migration on **disposable local D1**, save/resume, permissions, 131-row limits, idempotency, audit, trigger blocks, and unchanged outlet records.
2. Before a live draft write, verify the production D1 target binding, backup/Time Travel recovery point, and D1 migration identity. Use separate approved operational authorization.
3. Rehearse 0039 on isolated hosted staging with credentials confined to staging, inspect D1 schema and verify rollback strategy.
4. Only then apply **0039** on the approved production D1, deploy the reviewed Cloudflare Worker backend (Vercel frontend deployment does NOT publish the Cloudflare Worker), and run authenticated read-only \`GET /api/v1/outlets/dealer-master/drafts/status\`.
5. The frontend disables Save Draft when schema/Worker is missing, and gives an accurate status message. It never shows success unless the server confirms persistence.
6. User explicitly clicks Save Draft. This is a D1 draft-table write, but no operational RO/Lease write. Final import remains a **separate** approval and implementation task.

## Vercel Free budget

This change is created as a single consolidated commit + one PR. Verify GitHub CI/typecheck/browser smoke before one squash main release; do not push multiple micro-fixes solely to trigger previews. CI uses fixture-only local tests and no hosted D1 actions.

## Boundaries

The draft feature is fully coded, but **production persistence is not active until migration 0039 and the new Cloudflare Worker backend have been independently released**. Do not claim the 131 rows are already saved just because the frontend shows a draft preview.

Historical yellow source counts are provenance, not evidence that a given RO already exists in D1. The six existing RO Code matches must be checked freshly before any future final import; do not auto-overwrite COCO names or signed leases.
