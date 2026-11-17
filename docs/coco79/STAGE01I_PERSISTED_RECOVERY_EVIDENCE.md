# Stage 01I — Persisted close-evidence reader and local verification

**Date:** 13 November 2026  
**Depends on:** Stage 01H PR #23, Stage 01G PR #22 and Stage 01F design PR #21.  
**Status:** Test-only integration; **NOT a live recovery endpoint**.

## Purpose

Stage 01G's triage classifier required the caller to supply a consistent, authorized evidence snapshot. This stage supplies a read-only, parameterized evidence reader and verifies the classifier against the **actual persisted results** of the existing Stage 01E local-D1 recovery tests.

## Implementation

- `src/worker/services/shiftCloseEvidenceReader.ts`: one parameterized SQL `SELECT` returns status and counts from `operational_shifts`, `shift_stock_reconciliations`, `shift_financial_reconciliations` and `audit_logs` (only `SHIFT_CLOSE` events on `OPERATIONAL_SHIFT`). No writes and no route registration.
- `tests/stage01eLocalD1CloseRecovery.test.ts`: existing six persisted fault scenarios now also exercise the Stage 01G recovery classifier through the new reader. Four additional cases verify `SHIFT_OPEN` is not treated as a close audit, a successful close has complete evidence, missing shift is null and uncertain-attempt evidence must be explicit.

The reader requires `uncertainAttempt` **as a boolean supplied from independent verified evidence**; it cannot infer certainty from the current database because no durable close-attempt ledger exists. In the isolated fixture, test code deliberately supplies a known flag. No production caller may silently supply `false`.

## Expected classification from persisted state

| Actual local-D1 state | Classifier outcome |
| --- | --- |
| OPEN and no close evidence | READY_FOR_NORMAL_WORKFLOW (advisory, **not** authorization to close) |
| CLOSING after failed restore | CLOSE_IN_PROGRESS_REVIEW; hold |
| CLOSED with stock + financial reconciliation + one SHIFT_CLOSE audit | CLOSED_EVIDENCE_COMPLETE; hold |
| CLOSED with missing SHIFT_CLOSE audit | INTEGRITY_REVIEW_REQUIRED; hold |
| OPEN with surviving reconciliation after failed cleanup | INTEGRITY_REVIEW_REQUIRED; hold |
| OPEN with earlier reconciliation silently **deleted** | Potential blind spot: counts may look clear. Requires immutable attempted/history evidence in future design |

## Non-negotiable limits

1. No API exposure, user-facing automation, background recovery, automatic reopening, retries, writes or permissions changes.
2. This single-statement status/count read reduces mixed-time observations but is not a Cloudflare-hosted D1 consistency guarantee.
3. `count > 0` of stock reconciliation does not establish **completeness** for all expected tanks; it is only Stage 01G's conservative existing signal. No authoritative signoff from these counts.
4. No attempt ledger exists, so erased historical evidence and unknown timeouts can escape detection. These snapshots must **not** drive irreversible actions.
5. The caller, if integrated later, must enforce outlet scope, RBAC and integrity-review permissions **before** reading data.
6. All tests use local migrated synthetic SQLite. No production D1/R2, real COCO 79 records, pump infrastructure or calibration chart masters touched.

## Verification gates

- [ ] CI typecheck, full tests and build on Stage 01I head commit.
- [ ] Inspect all Stage 01E/01I tests individually and record results.
- [ ] Explicitly review blind spots (missing prior evidence, incomplete tank set, uncertain attempts) with operations/finance/audit owners.
- [ ] Stage 01F recovery policy approval and controlled hosted D1 staging proof **before** runtime integration.
- [ ] Keep draft stacked on Stage 01H. No merge/deployment before release approval.
