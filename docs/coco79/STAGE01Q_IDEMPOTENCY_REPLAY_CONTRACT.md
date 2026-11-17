# Stage 01Q — Request-level replay identity (offline contract candidate)

**Status: unapproved and not API-integrated.** This follows Stage 01P (default-off durable journal); all previous deployment, D1 and business-owner gates remain unchanged.

## Candidate semantics

- A caller must first be authenticated and authorized to access the outlet/shift. A trusted server-side fingerprint must be created from an approved canonicalized request payload (including variance inputs and any relevant request metadata), not an unverified client-supplied digest.
- Scope a future idempotency key to the authenticated outlet/shift and enforce uniqueness **atomically** in the authoritative database, not in an in-memory cache.
- No persisted attempt: *candidate* for a new attempt, subject to current shift status, prerequisite validation, exclusive claim and all other business gates.
- Exact replay with CLAIMED/PREPARED/REVIEW_REQUIRED: HOLD. The caller must not retry or implicitly reopen.
- Exact replay with COMMITTED: a candidate to return the previously recorded result **only after independent database evidence verification** for CLOSED, mandatory audits, reconciliations and matching attempt identity.
- Exact replay with VALIDATION_REJECTED: no automatic retry on the same key; authorized new request may start a new attempt only after revalidation.
- Different key/fingerprint or inconsistent outlet/shift scope when an attempt exists: conflict, not a new close.
- Malformed identities or journal state: HOLD.

## Implemented here

`src/worker/services/shiftCloseReplayAssessment.ts` is a pure function with a conservative decision enum. `tests/stage01qShiftCloseReplayAssessment.test.ts` exercises nine synthetic scenarios. The function does not calculate a fingerprint, create a journal entry, query D1, call Cloudflare or grant permission.

## Remaining release blockers

1. Approve the idempotency key scope, lifetime, retry behavior and payload canonicalization contract with operations, finance, audit and security.
2. Extend the **proposed**, not production-applied Stage 01P journal schema to persist unique key and trusted payload fingerprint, and introduce a reviewed migration strategy after frozen migrations 0001–0035.
3. Guard against source-input changes between preview and atomic prepare/finalize; add version fencing/immutability and deterministic calculations.
4. Integrate with route and approved identity controls on a separate branch only after signoff. Handle network-after-commit ambiguity and multi-Worker concurrency.
5. Exercise full application against synthetic hosted staging D1, not only Stage 01K scratch-table contracts; verify rollback, audit integrity, authorization, ADMIN close-empty path, backup/restore and owner approvals.

No databases were contacted or modified. Do not merge/deploy or enable the journal flag in production.
