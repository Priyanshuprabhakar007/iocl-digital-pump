# Stage 01F — Shift-close recovery design and safeguards

Date: 12 November 2026  
Status: **DESIGN ONLY — approval required before backend changes**  
Depends on Stage 01E PR #20, Stage 01D PR #19 and underlying draft stages.

## Scope and invariants

This stage addresses shift-close recovery, reconciliation evidence and audit durability. It does **not** implement remediation, database migrations or production changes. Pump infrastructure and calibration master activation remain out of scope. COCO 79 documents are operational references, not authority to import or overwrite real history.

Non-negotiable invariants:
1. A shift has one authoritative close attempt at a time; duplicate requests with the same idempotency key resolve to the same recorded outcome, while contradictory requests require review.
2. No existing stock or financial reconciliation may be deleted by a failed close attempt. Preserve immutable historical versions and ownership/attempt identifiers.
3. CLOSED requires committed stock reconciliation, financial reconciliation and mandatory SHIFT_CLOSE audit evidence with consistent close-attempt identification.
4. Never treat an ambiguous DB result as proof of failure. Re-read persisted shift status and attempt artifacts before retrying or compensating.
5. Do not automatically reopen a truly CLOSED shift. Corrections require separately authorized, append-only adjustments with reason and audit trail.
6. CLOSING with an indeterminate outcome is quarantined for investigation; no speculative cleanup or repeated close by operators.
7. All state transitions are outlet-scoped and role-authorized. Financial/audit recovery requires dual review where policy demands it.
8. Client errors return safe codes and correlation IDs; raw SQL, credentials and stack traces remain server-side.

## Observed Stage 01E failure matrix and proposed handling

| Local test | Observed current behavior | Design requirement |
|---|---|---|
| E-01 | Exclusive OPEN → CLOSING claim; second claim rejected | Preserve conditional claim and add durable attempt ID/idempotency |
| E-02 | Incomplete readings restore OPEN | Preflight validation before any close writes; no mutation of prior evidence |
| E-03 | Failed CLOSING → OPEN restoration leaves CLOSING | Mark/reconcile uncertain outcome via an operator recovery queue, not blind retry |
| E-04 | CLOSED with financial/stock rows but missing SHIFT_CLOSE audit | Enforce atomic commit of reconciliation + CLOSED + audit, or use a rigorously defined durable intent/recovery protocol if atomicity is unsupported |
| E-05 | Finance write failure deletes existing stock reconciliation | Attempt-scoped changes only; no unconditional delete by shift ID |
| E-06 | Failed cleanup leaves OPEN with stale reconciliation | No partial cleanup; display an actionable diagnostic and preserve prior committed evidence |

These are **design goals**, not verified implementation behavior.

## Proposed state and identity model

- Shift state: OPEN, CLOSING, CLOSED; CLOSING must carry attempt_id, started_at, actor_id and status/recovery metadata.
- A close attempt has a durable unique idempotency key scoped to outlet and shift, payload fingerprint, requester, timestamp, progress metadata, final result, and a server-generated correlation ID.
- Reconciliation records carry attempt_id and version/source metadata. Historical records are append-only; never overwrite or delete data merely to compensate a failed attempt.
- Mandatory audit event references the same attempt_id, shift_id and canonical result, with a uniqueness guard to prevent duplicate SHIFT_CLOSE events.
- The initial design should *not* invent a new business status visible to all users without product/operations signoff. Recovery-required state may be an internal flag on CLOSING while preserving known API contracts.

## Proposed close transaction (subject to Cloudflare D1 verification)

1. Authenticate, authorize outlet/role, validate request schema and idempotency key.
2. Preflight readings, stock, business date, fuel receipts, financial inputs and calibration gates; fail before writes for missing prerequisites.
3. Conditionally reserve OPEN → CLOSING with persisted attempt identity; duplicate matching request reads existing outcome.
4. Compute deterministic stock and financial reconciliation from a fixed source snapshot; avoid side effects during calculation.
5. Commit new attempt-scoped reconciliation rows, mandatory SHIFT_CLOSE audit and shift CLOSED transition in **one DB transaction/batch with verified rollback semantics**; use only supported D1 primitives after hosted staging verification.
6. On explicit transaction failure, re-read persisted attempt and shift before reporting failure/retryability. On uncertain network outcome, return an indeterminate status with correlation ID and disable automatic resubmission.
7. Do not delete old rows. An authorized recovery process reconstructs truth from durable attempts, audit and reconciliation evidence.

**Cloudflare D1 note:** Local SQLite emulator behavior does not prove the safety/rollback semantics of a hosted Cloudflare D1 operation; test atomicity and error modes on disposable controlled staging D1 before coding or release.

## Operator recovery runbook (proposed)

- OPEN with no new attempt artifacts: safe to correct missing source readings and explicitly start a fresh close attempt.
- CLOSING and incomplete/unknown artifacts: block further close, show “Recovery review required” with attempt/correlation ID; supervisor investigates audit and both reconciliation tables and checks D1 incident logs.
- CLOSED with complete evidence: show historical close result; idempotent retry returns the recorded result, no mutation.
- CLOSED with missing audit or reconciliation (legacy/corrupted case): preserve CLOSED and evidence, raise high-severity integrity incident; audit/finance-authorized compensating record only after investigation. Never fabricate a backdated SHIFT_CLOSE.
- OPEN with unexpected persisted reconciliation: preserve evidence and flag for review; do not silently clean it up.
- Every administrator action needs reason, actor, timestamp, before/after evidence hashes or pointers, and independent audit of the recovery action.

## Access and reporting

- Dealer/FO: read operational status and submit inputs, cannot override closed states or purge reconciliations.
- BM/Division/State: review scoped exceptions according to configured role, cannot delete source evidence.
- Authorized finance/audit administrator: jointly approve compensating recovery actions according to policy.
- Customer-facing messages are explicit: VALIDATION_FAILED, CLOSE_IN_PROGRESS, CLOSE_RESULT_UNKNOWN, CLOSE_INTEGRITY_REVIEW_REQUIRED, ALREADY_CLOSED; use stable HTTP responses only after endpoint contract review.

## Acceptance plan (not yet executed)

- [ ] Operations, finance and audit owners agree whether SHIFT_CLOSE audit is mandatory and what repair trail is permissible.
- [ ] D1 transaction/rollback and busy/network/timeout semantics documented from controlled hosted staging tests.
- [ ] Duplicate concurrent close and timeout-after-commit are idempotent.
- [ ] Audit insert failure cannot leave a new CLOSED state with missing audit.
- [ ] Financial failure does not delete any reconciliation predating the attempt.
- [ ] Failed restore does not result in an unsafe automatic retry.
- [ ] Immutable versions, RBAC checks and recovery event logs are tested.
- [ ] Test typecheck, full suite, production build, hosted staging UAT, backup/restore verification and signoff before any release.

## Delivery gate

This PR is a **draft design stacked on Stage 01E**. It intentionally does not touch runtime code, migrations, operational data, credentials, production Cloudflare resources or deployment. Review and approval are required before a separate Stage 01G implementation PR.
