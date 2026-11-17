# Stage 01J — Close-attempt journal and audit durability (test-only prototype)

**Date:** 13 November 2026  
**Predecessor:** Stage 01I draft PR #24, Stage 01F safeguards specification PR #21.  
**Status:** Prototype is **not connected to production code**. No migrations, API routes, automatic retries or actual shift-close writes.

## Why this stage exists

Stage 01E demonstrated CLOSED-without-SHIFT_CLOSE-audit, pre-existing reconciliation deletion, and incomplete cleanup. Stage 01I added read-only evidence snapshots, but the snapshots cannot reconstruct attempts or detect already deleted evidence. The global idempotency service currently persists successful 2xx HTTP response results; that alone cannot guarantee recovery of a close whose HTTP reply or post-commit audit failed.

This stage creates a disposable, local-only journal protocol to test essential invariants before any production design is authorized.

## Files

- `tests/helpers/closeAttemptJournalPrototype.ts` — D1-compatible SQLite fixture schema and journal operations **used exclusively by tests**. No database migration.
- `tests/stage01jCloseAttemptJournal.test.ts` — 13 regression/failure-injection cases, using seeded local D1 SQLite and a real OPEN test shift.
- This document — scope, explicit limits, review gates.

## Journal prototype

Each attempt carries `attempt_id`, `shift_id`, `outlet_id`, `actor_id`, `idempotency_key`, `payload_fingerprint`, state and timestamps. A unique `(actor_id,idempotency_key)` constraint enforces key reuse, and a partial unique shift index prevents competing `PREPARED`, `REVIEW_REQUIRED` or `COMMITTED` attempts in this prototype. Append-only event rows record `RESERVED`, `REVIEW_REQUIRED`, `COMMITTED` with uniqueness per attempt/event type.

- **Reservation:** requires an OPEN shift at the matching outlet. The local D1 `batch` groups intent insertion and its RESERVE event so an injected event failure rolls back both. An identical key and payload returns the same attempt; altered payload, outlet or shift is rejected.
- **Unknown response:** an attempt is marked `REVIEW_REQUIRED`, not `FAILED`. No automatic restart or reopening.
- **Prototype commit:** groups journal state transition and COMMITTED event. This does **not** close the operational shift or record an actual SHIFT_CLOSE audit; it proves only fixture-journal transaction behavior.
- **Evidence preservation:** fixture operations never delete or overwrite stock/financial reconciliation or actual audit rows. Tests insert an existing reconciliation and verify it survives an injected event failure.

## What the 13 tests verify

1. Reservation + same-request replay, no duplicate attempt/event.
2. Key reuse with changed payload or scope rejected.
3. Competing actor/key on same shift rejected.
4. Wrong outlet/missing shift rejected without new entries.
5. Failed reservation-event insertion rolls back attempt.
6. Prototype commit + replay writes exactly one COMMITTED event, leaves real shift OPEN.
7. Failed committed-event insertion rolls back prototype status transition.
8. Uncertain attempt remains REVIEW_REQUIRED, blocks fresh attempt or implicit commit.
9. Spoofed actor and malformed key rejected.
10. Append-only events cannot be UPDATEd or DELETEd in fixture.
11. Pre-existing stock reconciliation preserved through a failed journal commit.
12. Stage 01I's existing reader does not yet read attempt evidence; counts alone may look clean.
13. Competing concurrent keys leave at most one reservation by unique constraint.

## Non-negotiable production blockers

- The prototype `COMMITTED` state is **not** proof of a closed shift or audited stock/finance consistency.
- The global HTTP idempotency middleware is separate; the prototype is not wired to it. Real duplicate/timeout semantics require cross-request and cross-Worker testing.
- Real D1 transaction semantics, retry/reconnection effects and failure modes must be verified in a controlled, isolated **Cloudflare-hosted staging D1** before any implementation. Local SQLite pass is not sufficient.
- Await operations, finance and audit policy approval on mandatory audit evidence, attempt retention, reconciliation versioning, and recovery authorization.
- Future backend design must join attempt identity, source snapshot, complete per-tank reconciliation, financial reconciliation, mandatory SHIFT_CLOSE audit and CLOSED status with a verified atomic transaction or a durable recovery protocol.
- Reconciliation history already erased by prior code cannot be reconstructed from this new prototype.
- Any future read routes must enforce outlet scope and role permissions; never expose raw SQL errors to operators.
- COCO 79 source documents are reference-only. Pump infrastructure, calibration master, live D1/R2, production data and deployment remain outside scope.

## Validation and release gate

- [ ] Full repository TypeScript check, automated tests and production build pass on Stage 01J head.
- [ ] Individually inspect all 13 Stage 01J test results.
- [ ] Keep Stage 01J in a draft PR stacked on Stage 01I; no merge or deployment.
- [ ] Get the approved recovery workflow, hosted D1 evidence and rollback plan before any runtime wiring.
