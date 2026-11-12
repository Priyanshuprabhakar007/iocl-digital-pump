# Stage 01E — Isolated local D1 shift-close recovery tests

**Date:** 12 November 2026  
**Depends on:** Stage 01D (draft PR #19).  
**Implementation:** `tests/stage01eLocalD1CloseRecovery.test.ts`.

## Safety boundary

All tests create a **new disposable LocalD1Database file in .sqlite** from repository migrations and synthetic seed data, run the normal Hono application against that local binding, and dispose of the file. This is SQLite-based D1 emulation **not a Cloudflare-hosted staging D1 test**. No production credentials, D1/R2 writes, historical COCO 79 imports, pump infrastructure or calibration master changes are involved.

Injected failures use SQLite triggers created only in the temporary test database. The business endpoints, shift close service, repository persistence and audit inserts are real for these local tests.

## Failure scenarios and expected persistence

| Case | Isolation / injection | Persisted outcome characterized |
|---|---|---|
| E-01 | Two conditional close claims | Exactly one CLOSING claim succeeds, another is rejected, and controlled OPEN restore succeeds |
| E-02 | Incomplete tanks on actual close endpoint | OPEN restored; no reconcilation or SHIFT_CLOSE audit |
| E-03 | Trigger aborts CLOSING→OPEN | CLOSING persists despite attempted recovery; dropping trigger permits test-only restoration |
| E-04 | Trigger aborts SHIFT_CLOSE audit insert after actual finance & stock calculation | CLOSED plus persisted reconcilations with no SHIFT_CLOSE audit; retry returns 409, not a second close |
| E-05 | Trigger aborts financial reconciliation INSERT after an earlier saved stock reconciliation | Existing cleanup may remove pre-existing stock reconciliation; shift returns OPEN |
| E-06 | Trigger aborts both financial reconciliation insert and later stock reconciliation delete | OPEN restored but stale stock reconciliation survives; caller sees failure |

**Important:** The cases describe current code behavior and are not acceptance that these outcomes are safe in production.

## Review and remediation questions

1. How should completed shift + failed mandatory audit be recovered without falsifying audit history or reopening a closed shift?
2. Should cleanup delete a pre-existing reconciliation, or only records created/changed by the failed attempt?
3. How should failed recovery leave an actionable CLOSING state with scoped administrative review rather than an automatic retry?
4. Can financial and stock reconciliation, final shift status and audit be committed atomically on Cloudflare D1, with safe idempotency for interrupted requests?
5. What diagnostics should be exposed to authorized operators without leaking infrastructure error details?

## Release gate

- [ ] TypeScript typecheck, full test suite and build pass on Stage 01E tip.
- [ ] Review actual test output and record any failing assertions against observed database states.
- [ ] Distinguish local SQLite result from controlled Cloudflare staging D1 verification.
- [ ] Obtain operations/finance/audit owner approval before changing backend recovery logic.
- [ ] Keep PR stacked on Stage 01D and draft; do not merge/deploy to production.

**Pump Infrastructure remains deferred.**
