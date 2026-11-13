# Stage 01M — Local integration and operator UAT evidence

**Date:** 13 November 2026  
**Depends on:** Stage 01L draft PR #27 and uncompleted Stage 01K hosted D1 gates.  
**Status:** LOCAL UAT AUTOMATION ONLY; **live/backend integration has not occurred**.

## Purpose

Exercise the *actual existing* daily operations and shift-close HTTP routes using disposable synthetic local-D1 data. Compare operator-visible results to persisted stock, finance, nozzle and audit records. Unlike Stage 01L's prototype, this suite invokes the real Hono service. It therefore exposes existing gaps rather than silently assuming the proposed backend contract is live.

## Deliverable

`tests/stage01mOperationalUat.test.ts` — nine repeatable local tests, each with a fresh migrated/seeded synthetic database, an authenticated administrator session and an opened synthetic shift on seed outlet `ro-1001`. No production credentials or records.

| Case | Flow | Automated expectation |
|---|---|---|
| M-01 | Authenticated daily-operations bootstrap + GET shift | HTTP 200, OPEN shift shown |
| M-02 | Invalid business date | HTTP 400, no source or reconciliation mutation |
| M-03 | Unauthenticated shift-close attempt | HTTP 401, shift remains OPEN |
| M-04 | Missing tank/closing evidence | Close rejected, OPEN restored and no reconciliation |
| M-05 | One nozzle reading missing | INCOMPLETE_SHIFT_READINGS, no fake zero meter row |
| M-06 | All synthetic inputs entered | Existing close returns CLOSED, stock/finance plus audit rows present |
| M-07 | Post-close meter modification attempt | HTTP 409 SHIFT_CLOSED, previously saved reading count preserved |
| M-08 | Second close attempt | HTTP 409 SHIFT_CLOSED, no duplicate reconciliations/audit |
| M-09 | Mandatory SHIFT_CLOSE audit insert fails *after* current close status change | Existing flaw reproduced: API error **but CLOSED without mandatory audit**; recovery classifier flags integrity review |

**M-09 is a blocking negative finding, not a passing product behavior**. The test passes if it successfully reproduces the known defect. CI green must NOT be interpreted as UAT approved.

All fuel-meter and dip figures are fabricated test fixtures. Existing daily operations calculations are not asserted as financially correct based solely on this suite.

## Manual operator/finance/audit UAT matrix — NOT YET RUN

Do these only in a separately approved test application/outlet, never against active COCO 79 history.

| ID | Assigned reviewer | Activity and required evidence | Status |
|---|---|---|---|
| UAT-01 | Outlet operations / FO | Open shift, verify authorized outlet/date/template, confirm snapshots; screenshots + source IDs | Pending |
| UAT-02 | Shift operator | Enter opening dip, water dip, nozzle reading, testing volume, closing dip; confirm units and visible values | Pending |
| UAT-03 | Operations | Validate receipt ARRIVED/PRE-POST dip/COMPLETED gate, including cancelled receipt and reversal policy | Pending |
| UAT-04 | Operations / finance | Compare actual nozzle revenue, DSR, daily report and stock/financial reconciliation to independently calculated test workbook | Pending |
| UAT-05 | Finance | Verify cash/POS/UPI/fleet/credit deposits and variance reason; sign off with independent totals | Pending |
| UAT-06 | Security / operations | Test ADMIN/STATE/DIVISION/BM/FO/CSP/DEALER outlet scope; unauthorized close/read/edit all denied | Pending |
| UAT-07 | Audit | Force close audit failure, verify full rollback of CLOSED+financial+stock artifacts in approved replacement (existing API fails this gate) | Blocked |
| UAT-08 | Audit / finance | Duplicate key, competing actors, timeout-after-commit; verify durable attempt journal and immutable prior reconciliations | Blocked |
| UAT-09 | Supervisor | Simulate CLOSING indeterminate, investigate evidence, require two-person recovery approval; no auto-reopen | Blocked |
| UAT-10 | QA / release manager | Hosted D1 rollback, multi-Worker concurrent requests, backup restore, monitoring and rollback drill | Blocked |

### Minimum acceptance for every manual UAT run

Record reviewer role, synthetic outlet/shift identifier, timestamp/timezone, build SHA, expected outcome, actual outcome, redacted evidence reference, defect/issue ID, and explicit reviewer signoff. Treat any missing evidence as NOT VERIFIED. Do not copy private customer/employee data into GitHub.

## Blockers and next stage

1. **Hosted Stage 01K verification is NOT complete**. The root Wrangler binding references production and must never be used for disposable staging probes.
2. **Stage 01L atomic closure is still test-only** and uses artificial financial/stock numbers. No approval to wire it into runtime.
3. Stage 01M M-09 currently demonstrates a real close route integrity defect; release must remain BLOCKED even if all automated tests pass.
4. Existing DSR/finance correctness must be independently reconciled against realistic, controlled receipt, price and calibration data.
5. Operations, finance, audit and RBAC owners must sign off policy and UAT gates.
6. Stage 01N final release verification cannot be approved while any above condition is open.

**No merge, production migration, release or deployment authorized by this document. Pump infrastructure remains deferred.**
