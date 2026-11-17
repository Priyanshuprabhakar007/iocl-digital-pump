# Stage 01N — Atomic shift close and mandatory audit implementation candidate

**Date:** 13 November 2026
**Base:** Stage 01M UAT draft PR #28
**Status:** Development-only candidate; not approved for production.

## Implemented boundary

The legacy ShiftCloseService finalized `operational_shifts.status = CLOSED` and only then wrote `SHIFT_CLOSE` and `FINANCIAL_RECONCILIATION` audits. A failed mandatory audit could therefore leave CLOSED without its audit and return a misleading error.

The new `AtomicShiftCloseFinalizer` performs the **final status update and two audit inserts in one `D1Database.batch()`**. All inputs use bind parameters. The UPDATE requires:

- state `CLOSING`;
- a matching persisted financial reconciliation;
- at least one shift tank snapshot, and corresponding stock reconciliation for every shift-tank snapshot;
- no pre-existing `SHIFT_CLOSE` audit event for that shift.

The two audits are gated on the exact newly closed state/actor/timestamp. Failed audit insertion rolls back the CLOSED update and the other audit. A lost database response or any indeterminate outcome is reported as `SHIFT_CLOSE_COMMIT_UNCERTAIN`. The shift is **not** automatically reopened and reconciliation rows are **not** deleted in this failure path. A rejected precondition returns `SHIFT_CLOSE_REVIEW_REQUIRED`.

This is a narrow **finalization safety fix**. It does not make all earlier stock/finance preparation writes atomic with the closing transition.

## Code changes

- `src/worker/services/atomicShiftCloseFinalizer.ts`: one Cloudflare D1 batched finalization SQL boundary.
- `src/worker/services/shiftCloseService.ts`: uses the atomic finalizer and conservatively reports unknown outcomes.
- `src/worker/routes/shifts.ts`: passes the bound D1 client and maps review/uncertainty to HTTP 409.
- `tests/stage01dShiftCloseFailurePaths.test.ts`: mocks updated for the atomic API.
- `tests/stage01eLocalD1CloseRecovery.test.ts`: real local D1 fault injection checks that neither close nor financial audit can leave CLOSED on failure.
- `tests/stage01mOperationalUat.test.ts`: real Hono endpoint tests updated; M09 and M10 now check rollback after either audit insert error.
- `tests/financialOperations.test.ts`: uncertain finalizer outcome retains evidence and CLOSING for review.

## Important remaining release blockers

1. **Production-representative hosted D1 integration verification is not done for the NEW finalizer.** Stage 01K's seven passed scratch-table tests are only an isolated contract, not a run of the operational shift-close SQL and complete business data.
2. The earlier stock/finance calculations persist before the final batch; their writes may still fail independently and the original `abortAndRestore` path has **destructive cleanup that can remove pre-existing reconciliation evidence**. This behavior remains a known unfixed defect and must be addressed separately.
3. There is no production durable close-attempt journal or authorized operator recovery workflow; the Stage 01J journal remains test-only.
4. `close-empty` exceptional ADMIN path is not changed in this stage and requires separate audit-atomicity review.
5. Cross-Worker concurrent requests, network disconnect after commit, full reconciliation policy, receipt/tank integrity, outlet/role authorization, audit retention and reporting still require independent staging UAT.
6. Operations, finance and audit owner approvals, backup/restore and rollback plan remain **pending**.
7. Do not merge stacked PRs into main or deploy production without explicit release approval.

## Acceptance checklist

- [ ] TypeScript typecheck, all repository tests, production build pass.
- [ ] Both mandatory audit-failure injections demonstrate CLOSING plus zero audit rows, not CLOSED.
- [ ] Successful complete shift close still writes CLOSED + financial + stock + both audits.
- [ ] Retry after ambiguous result does not duplicate close and is held for review.
- [ ] Hosted test on a dedicated, separately migrated synthetic staging D1 and manual UAT of actual backend.
- [ ] Resolve destructive pre-commit cleanup, durable attempt history and exceptional close route before final release.

**No production D1/R2, pump infrastructure, calibration masters or COCO 79 history changed by this draft.**
