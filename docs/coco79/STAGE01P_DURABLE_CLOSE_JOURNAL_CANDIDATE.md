# Stage 01P — Durable close attempt journal wired to normal shift close

**Status:** Development-only migration and backend candidate. **NOT deployed** to staging or production.  
**Base:** Stage 01O draft PR #31  
**Date:** 13 November 2026

## Purpose

A successful atomic reconciliation-preparation transaction and a successful atomic CLOSED+audit transaction are **separate**. A Worker crash, lost HTTP response, or D1 error between them may leave a shift CLOSING. Historically, evidence snapshots could not distinguish distinct attempts or tell whether a failed response followed a committed write.

## Runtime implementation

- New `migrations/0034_shift_close_attempt_journal.sql`: `shift_close_attempts` and `shift_close_attempt_events`. The latter has append-only UPDATE/DELETE rejection triggers. A partial unique index prevents multiple active/review/committed attempts for a shift while permitting a fresh attempt after a clean validation rejection. The migration is a **proposed code artifact** and has **not** been applied remotely.
- New `src/worker/services/shiftCloseAttemptJournal.ts`: a guarded `D1Database.batch` simultaneously claims `OPEN → CLOSING`, records the attempt and appends a `CLAIMED` event. A failure in the journal insert rolls back the status claim.
- Clean validation rejection uses another D1 batch to restore `OPEN`, mark `VALIDATION_REJECTED`, and append the event together. A failed validation-journal write cannot silently reopen the shift.
- The Stage 01O atomic preparation batch now includes attempt state `PREPARED` and its event **inside the same transaction** as every new stock/financial row. Event failures must roll back all newly inserted reconciliation rows.
- Stage 01N's atomic `CLOSED`+two mandatory audits batch now also updates attempt state `COMMITTED` and appends `COMMITTED` in that same transaction. A journal-event failure must roll back CLOSED and both audits.
- Uncertain outcomes are held for review, with best-effort `REVIEW_REQUIRED` transition/event. If that write also fails, the prior durable `CLAIMED`/`PREPARED` state still blocks an independent claim and requires evidence review. No auto-retry or destructive cleanup is added.
- Normal shift-close route is wired to the journal. Existing scope/RBAC verification remains in the route.

## Tests

New local-D1/Hono real-route tests cover:
1. Success leaves a COMMITTED attempt and exactly one CLAIMED, PREPARED and COMMITTED event as well as CLOSED and both audit entries.
2. Injected CLAIMED event failure rolls back the shift claim and creates no orphan attempt.
3. A clean incomplete-input rejection atomically reopens the shift and records VALIDATION_REJECTED. Subsequent clean retries use distinct attempt IDs.
4. Injected PREPARED event failure rolls back all new stock+financial records and holds CLOSING/REVIEW_REQUIRED.
5. Injected COMMITTED event failure rolls back CLOSED+audits and holds the recorded attempt, while preserving already prepared stock/financial evidence.
6. Event table rejects UPDATE/DELETE; duplicate close remains blocked.

## Important limits and release blockers

- **Two phases remain separate:** this journal records each committed boundary but does not make every source reading/receipt/calibration snapshot immutable between preview and database writes.
- The journal is **not an authorized recovery mechanism**. It does not expose an unlock/restart/repair API. A human-approved recovery policy must define how to reconcile durable attempt events, shift state, reconciliation and audit rows, and which roles can make recovery decisions.
- Request idempotency key and normalized payload fingerprint are not integrated into the journal. Existing HTTP idempotency handling has not been proven equivalent to this transaction protocol under a lost response.
- The exceptional ADMIN `close-empty` operation is **not covered** by this normal close journal.
- Cloudflare-hosted D1 migration and operational Worker/UAT for this code have **not** run. Stage 01K hosted scratch tests did not use this real backend or this migration.
- Independent multi-Worker races, post-commit network disconnect, retention and backup/restore verification and operations/finance/audit signoff remain mandatory release blockers.
- **Never run the new migration on production**, merge stacked PRs or deploy the application without explicit approval. Production D1/R2, pump assets, calibration masters and COCO 79 history are not touched by the branch.

## CI gate

- [ ] TypeScript check, full Bun test suite, production build.
- [ ] All six new local-D1 journal fault-injection tests.
- [ ] Existing normal close, stock/finance precomputed flow and both mandatory audit-failure tests.
