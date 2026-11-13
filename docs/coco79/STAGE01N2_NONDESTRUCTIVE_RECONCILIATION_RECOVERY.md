# Stage 01N-2 — Non-destructive shift-close evidence preservation

**Date:** 13 November 2026  
**Base:** Stage 01N atomic audit candidate PR #29  
**Status:** isolated backend patch; no production deployment or merge.

## Problem addressed

The legacy close orchestrator called `restoreOpenFromClosing`, then deleted **all** `shift_financial_reconciliations` and `shift_stock_reconciliations` rows by shift ID when validation or persistence failed. This could erase reconciliation evidence created **before** the attempt. Even if cleanup was disabled, the existing stock `UPSERT` and financial update could overwrite those records before a later failure.

## New guarded behavior

1. After a successful exclusive `OPEN → CLOSING` claim, read existing stock and financial reconciliation evidence. Any existing **financial** reconciliation triggers `SHIFT_CLOSE_REVIEW_REQUIRED`, with all rows preserved.
2. If stock reconciliation was already computed through the legitimate stock-compute workflow, recompute its quantities in **read-only preview mode**. Only proceed when **every tank's product ID, all stock/receipt/sale/closing/variance quantities and status** match the saved entries exactly. Reuse those same stored rows without updates. Missing, stale, conflicting or partial evidence is held at `CLOSING` for review.
3. Validate tank and nozzle completeness. Financial reconciliation is evaluated using `persist=false` **before** the first stock/finance write. Validation errors may safely restore `OPEN` only if the attempt has created no reconciliation rows; a failed restore requires review.
4. After validation, stock persistence uses `failOnExisting: true`, which inserts without the normal UPSERT path. Financial persistence uses an **INSERT-only** repository method, never `createOrUpdate`.
5. Any stock/finance database write error (including an interrupted partial write) leaves `CLOSING` and all persisted rows untouched. Return `SHIFT_CLOSE_REVIEW_REQUIRED` (409) instead of claiming no evidence exists or automatically reopening.
6. Stage 01N's atomic finalizer still commits `CLOSED` and both mandatory audits in one D1 batch. An uncertain final commit is still held for review, never cleaned up.

## Compatibility and limitations

- The stock repository's default method continues to support existing UPSERT callers. The stricter `failOnExisting` mode is used **only** by the shift-close path.
- Existing financial `createOrUpdateFinancialReconciliation` stays unchanged for other workflows, but shift-close no longer uses it.
- A database write can create some stock rows before failing. This patch **preserves that evidence** and blocks further closes; it does not implement a full atomic stock/financial preparation transaction.
- Snapshot/input version locking, a production durable close journal, signed operator recovery, and the special ADMIN `close-empty` audit design remain future gates.
- Stage 01K's hosted seven tests proved scratch-only D1 semantics, **not** this updated real shift-close path. Cloudflare-hosted application-level UAT with synthetic data remains mandatory.
- No existing reconciliation is overwritten during normal shift-close. A previously computed **matching stock** reconciliation may be reused, but a prior financial reconciliation or mismatched stock is held for review. A read-only recalculation is not yet an immutable source snapshot; concurrent source mutations remain a release blocker.
- There is no automatic operator recovery workflow, unlock or deletion endpoint added by this stage.

## Regression evidence required

- [ ] Real local-D1: matching existing stock reconciliation is reused and succeeds, preserving original row IDs/data; mismatched saved rows are held at CLOSING and unchanged.
- [ ] Real local-D1: existing financial reconciliation survives with original ID/data; no newly invented stock.
- [ ] Real local-D1: injected financial INSERT failure leaves partial stock evidence and CLOSING for review.
- [ ] Real local-D1: a DELETE-blocking trigger cannot interfere with valid precomputed-stock close; no reconciliation DELETE is invoked.
- [ ] Normal shift close still writes stock, finance and both audit rows and reaches CLOSED.
- [ ] Missing tanks/nozzles and variance/price preflight errors with **no persistence** restore OPEN and retain editable inputs.
- [ ] TypeScript, full test suite and build pass on the final branch.
- [ ] Hosted staging, finance/audit sign-off, review/repair workflow, network-after-commit checks, RBAC and operational UAT done before merge/deploy.

**This is a candidate safety patch, not a full release approval.**
