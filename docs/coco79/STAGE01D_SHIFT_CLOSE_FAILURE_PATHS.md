# Stage 01D — Shift close failure and retry safety: characterization

**Date:** 12 November 2026  
**Scope:** Existing shift close only; synthetic mock tests and display-only retry guidance. No change to closing logic, operational rules, APIs, schemas, permissions or live data.

## What the current service does

1. Conditionally claims OPEN → CLOSING.
2. Checks tank/receipt completion and whether each nozzle is covered by a recorded reading or unavailability.
3. Saves stock reconciliation, then financial reconciliation.
4. Conditionally finalizes CLOSING → CLOSED.
5. Writes SHIFT_CLOSE and (when finance reconciliation exists) FINANCIAL_RECONCILIATION audit entries **after** the final status change.

For known validation failures it attempts to restore OPEN and delete reconcilations. These actions are separate writes. The tests here do not claim they are transactional.

## Test scope

`tests/stage01dShiftCloseFailurePaths.test.ts` contains twelve isolated characterization cases:
- active/duplicate close claim rejected without side effects;
- incomplete tank/receipt data aborts and attempts cleanup;
- missing nozzle data blocks closing;
- approved nozzle-unavailability record counts as coverage without false sales;
- stock reconciliation errors abort before finance;
- financial variance reason missing aborts before finalization;
- failed final status transition avoids success audits;
- successful finalized close writes the expected audit actions;
- audit failure **after** successful CLOSED transition raises an error without rolling back CLOSED;
- restoration to OPEN failing skips later reconciliation cleanup;
- failed financial cleanup after OPEN restoration skips stock reconciliation cleanup;
- financial audit failing after a successful shift-close audit produces a partially recorded audit outcome.

All repository/service dependencies are mocked; no production or staging D1 or R2 connections are made.

**Operator feedback (presentation only):** `src/frontend/utils/shiftCloseFeedback.ts` and `tests/stage01dShiftCloseFeedback.test.ts` add six focused checks. For network/server/ambiguous close responses, the UI tells the operator to use Refresh to check OPEN/CLOSING/CLOSED before retrying. It preserves known validation errors (such as missing readings or variance reason) verbatim. No automatic retry or refresh occurs, to avoid replacing unsaved drafts.

## Identified follow-up risks

**01D-01: Closed-but-error outcome.** The service finalizes CLOSED before awaiting audit logs; if the audit write rejects, an exception propagates even though close may have completed. A caller must reload authoritative shift status before retry. This is a confirmed code-order risk and should be reproduced using isolated D1 fault injection before designing a correction.

**01D-02: Cleanup is not atomic.** Restore-open, financial reconciliation deletion and stock reconciliation deletion are separate awaited operations; if a cleanup step itself fails, the remainder may not run, leaving CLOSING and/or stale reconciliation. Add staging failure-injection cases and decide transaction or recovery strategy before changing close logic.

**01D-03: Pre-existing reconciliation state.** The abort helper deletes reconciliation records unconditionally; determine whether any valid pre-existing record might be removed by a failed close, with a before/after test.

**01D-04: Variance reason policy.** Daily Operations currently supplies a generic fixed variance reason. Finance/operations must approve how a true non-zero variance gets an explanatory operator reason before changing the UI.

**01D-05: Change concurrency.** Validate closed/closing write guards during the full close sequence using isolated concurrent requests.

## Release gates

- [ ] Run TypeScript, full Vitest suite and production build on **the final commit** (an earlier Stage 01D commit passed GitHub Actions on 12 November 2026).
- [ ] Verify twelve close-service tests and six UI-guidance tests against installed repository dependencies on the final commit.
- [ ] Run isolated D1 failure injection and verify persisted shift/reconciliation/audit state.
- [ ] Review 01D-01 through 01D-05 with finance, audit and operations owners.
- [ ] Integrate only after Stage 00 / 01A / 01B / 01C dependency review.
- [ ] Confirm backup, staging UAT and rollback before any production deployment.

**Status:** characterization tests and operator feedback added on a draft branch; no backend recovery fix, live testing, merge or deployment claimed. Pump infrastructure remains deferred.
