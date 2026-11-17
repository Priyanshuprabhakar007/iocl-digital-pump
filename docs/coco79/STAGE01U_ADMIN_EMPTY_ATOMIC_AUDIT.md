# Stage 01U — Atomic ADMIN empty-shift closure and audit (draft)

## Implemented

- The exceptional global ADMIN `POST /shifts/:shiftId/close-empty` path now uses a single `D1Database.batch` containing a conditional OPEN→CLOSED update and the mandatory `SHIFT_CLOSE_EMPTY_ADMIN` audit insert.
- Both statements must confirm one returned row. The audit SELECT is conditioned on the same shift, outlet, actor, and transition timestamp; an unsuccessful conditional update cannot create a success audit.
- Retains the original empty-shift guards: no meter, unavailable nozzle, tank readings, fuel receipt, stock/finance reconciliations, collections, bank deposits, cash handovers, CNG or lube data.
- Audit insertion failure rolls the status change back in disposable local D1. Unknown provider/network outcome yields `SHIFT_CLOSE_COMMIT_UNCERTAIN` and **no automatic replay**.
- Local tests verify success, audit failure rollback and pre-existing activity rejection.

## Scope and release blockers

No migrations, deployment, production database access, and no feature flag changes. This branch is stacked on Stage 01T's synthetic integration PR. The new function is a backend candidate, **not production certified**.

A successful local SQLite/D1 test cannot establish transaction behavior during a lost response on hosted Cloudflare D1. Full connected Worker/D1 staging trials, cross-Worker concurrency, source/reference version fencing, complete journal/idempotency integration, RBAC/security/finance UAT and backup/rollback signoffs remain mandatory.

**Do not merge, deploy or automatically retry ambiguous close outcomes.**
