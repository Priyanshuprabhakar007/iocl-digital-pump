# Stage 01L — Atomic shift-close evidence contract (isolated test only)

**Date:** 13 November 2026  
**Base:** Stage 01K draft PR #26.  
**Status:** Prototype and regression tests on disposable local-D1 SQLite; **NO runtime service implementation**.

## Goal

Stage 01E identified that the current ShiftCloseService may mark a shift CLOSED before mandatory audit logging, and its failed-close cleanup may delete pre-existing reconciliation data. Stage 01J added a test-only durable attempt journal and Stage 01K prepared separate hosted-D1 contract tests.

This stage exercises a single local D1 batch against the **existing operational shift, stock reconciliation, financial reconciliation and audit table structures** plus the Stage 01J test journal. It is a proof-of-contract for discussion, NOT an operational fix.

## Files and boundaries

- `tests/helpers/stage01lAtomicClosePrototype.ts`: local-only SQL experiment, fixture-only constraints and one `D1Database.batch()`. All fuel volumes and money are deliberately **synthetic placeholder values**. This helper is never imported by production code or API routes.
- `tests/stage01lAtomicShiftClose.test.ts`: ten isolated local-D1 cases that open a synthetic shift, reserve an attempt, claim CLOSING and inspect persistence after success/failure.
- This document explains limits and release gates.

No production migration, change to `src/worker/services/shiftCloseService.ts`, routing, role permissions, pump infrastructure, calibration master, actual business calculations, hosted Cloudflare resource or deployment.

## Batch semantics under experiment

The disposable fixture includes a partial unique index on SHIFT_CLOSE audits plus local-only triggers requiring:
- a verified PREPARED close attempt for the same shift/outlet/actor before SHIFT_CLOSE auditing;
- matching financial reconciliation, mandatory shift-close audit and **each participating shift-tank snapshot** reconciliation before CLOSING may become CLOSED;
- a persisted CLOSED shift before its Stage 01J attempt can be marked COMMITTED.

The candidate batch inserts synthetic per-tank stock reconciliation, financial reconciliation, SHIFT_CLOSE audit, FINANCIAL_RECONCILIATION audit, status CLOSED, attempt COMMITTED and an append-only COMMITTED event as one unit.

**Actual shift business validation, role checks, source snapshot versioning, financial calculation, and D1-specific staging safety are not implemented by this prototype.**

## Ten test cases

| ID | Local contract scenario | Expected behavior |
|---|---|---|
| L-01 | All synthetic tank, finance, audit and attempt rows valid | CLOSED, complete persisted evidence, one COMMITTED event |
| L-02 | Mandatory SHIFT_CLOSE audit insertion fails | Rollback all new records; remains CLOSING, attempt PREPARED |
| L-03 | Financial reconciliation insertion fails after tank inserts | Rollback tank records, no successful close |
| L-04 | One shift-tank reconciliation intentionally omitted | Local guard prevents CLOSED and batch rolls back |
| L-05 | A pre-existing stock reconciliation conflicts | Preserve original record, no destructive cleanup |
| L-06 | FINANCIAL_RECONCILIATION audit insert fails | Rollback mandatory audit and every other new batch artifact |
| L-07 | Actor does not own the prepared attempt | Do not claim shift or change persisted records |
| L-08 | Same attempted close retried after committed batch | Replay journal result; no duplicate reconciliations/audit |
| L-09 | Shift no longer CLOSING before commit | Reject and roll back all newly created evidence |
| L-10 | Uncertain/failure outcome marked REVIEW_REQUIRED | CLOSING held for review; no automatic reopened/retry |

## Known design gaps

1. This does not invoke the real close endpoint or real financial/stock calculations. Synthetic balanced figures are only to test persistence and cannot be presented as actual sales evidence.
2. The Stage 01J `COMMITTED` journal status is still test-only. An authorised server implementation must establish real attempt ownership, cross-Worker idempotency and a verified source snapshot.
3. Local SQLite triggers are **not** production migrations. They are isolated safety assertions; production schema design, portability and performance require separate review.
4. A test transaction covering persistence does not automatically solve a network timeout after COMMIT; independent durable intent lookup and recoverable correlation IDs remain required.
5. Previously deleted reconciliation rows cannot be reconstructed from the new journal.
6. Failing a post-claim batch intentionally leaves CLOSING pending; a supervised, audited recovery path remains unimplemented.
7. Current system's multiple API contracts, data lock rules, outlet RBAC and daily operations calculations must be validated before any live integration.

## Mandatory gates before Stage 01L operational wiring

- [ ] Local CI TypeScript, full tests, production build PASS on the final Stage 01L commit.
- [ ] Verify seven Stage 01K checks against a separately provisioned **hosted Cloudflare D1**; independently verify no production resources.
- [ ] Reproduce atomic full-table commit and rollback in a dedicated hosted D1 with fixture data, including network retries and concurrent Workers.
- [ ] Operations/finance/audit sign off on mandatory audits, full-tank reconciliation evidence, immutable versions and recovery permissions.
- [ ] Implement transactionally coherent source-snapshot and finance calculation, safe idempotency, outcome re-read and explicit RECOVERY_REQUIRED behavior.
- [ ] Security review, release backup, staging UAT, rollback and audit tests before production deployment.
- [ ] Leave Stage 01L draft stacked on Stage 01K. **DO NOT merge or deploy** until gates satisfied.

No live Cloudflare staging or production access was performed.
