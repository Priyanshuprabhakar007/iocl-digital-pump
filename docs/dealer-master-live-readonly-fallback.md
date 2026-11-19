# Live read-only Excel snapshot fallback

Screenshot on live Vercel showed 131 original Excel ROs, all 26 business columns and yellow-cell source protection. Only 6 ROs matched the current outlet directory; 125 did not. All 131 marked REVIEW because organizational mappings are unresolved, **not** because 131 are confirmed missing.

The latest frontend receives `Endpoint /api/v1/outlets/dealer-master/batch-snapshot not found` from the older production Worker API. This patch handles that missing endpoint gracefully, avoids redundant 404 calls, shows yellow-marked but unmatched ROs, and exports all 26 source fields (including yellow flags) as an Excel report. **Saved ownership and lease details are NOT verified**; a yellow source does not prove the corresponding record exists.

No production D1 schema migrations, Worker deployment, data edits or imports are performed. Live approval and sync remain disabled. Single consolidated release, minimizing Vercel Free builds.
