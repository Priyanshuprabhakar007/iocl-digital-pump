# Stage 01T — Combined-source-guard full Worker close, local-only

This candidate validates the real Hono `/shifts/:shiftId/close` endpoint against a disposable **local D1** database after explicitly installing *both* proposed Stage 01S and 01S-2 trigger sets.

## Test objectives
- Complete four synthetic nozzle entries, three tank opening/closing dips, stock and financial reconciliation, close status transition and two mandatory audits with the guard sets installed.
- Inject a mandatory audit INSERT failure; assert CLOSING hold and no false success audit.
- Attempt direct SQL meter-input mutation against CLOSING to confirm guard enforcement.

## Absolute release boundary
- Neither proposal is in production migrations 0001–0035 or automatically installed on hosted D1.
- These local tests are **not** evidence of Cloudflare-hosted Worker behavior, multi-Worker concurrency or real-network-after-commit recovery.
- All input domains, master reference immutability and end-to-end version fencing remain under review.
- The default-off Stage 01P journal is not enabled by this test; request-key policy and durable recovery still require integration.
- Hosted full-application tests on a separately verified disposable staging D1, backup/restore proof and operations/finance/audit/security approvals remain mandatory.
- Keep draft; **do not merge, apply migration or deploy**.

After CI, report precise failures rather than treating draft checks as production verification.
