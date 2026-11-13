# Stage 01N-2 — Non-destructive shift-close evidence preservation

**Date:** 13 November 2026  
**Base:** Stage 01N atomic audit candidate PR #29  
**Status:** isolated backend patch; no production deployment or merge.

## Problem addressed

The legacy close orchestrator called `restoreOpenFromClosing`, then deleted **all** `shift_financial_reconciliations` and `shift_stock_reconciliations` rows by shift ID when validation or persistence failed. This could erase reconciliation evidence created **before** the attempt. Even if cleanup was disabled, the existing stock `UPSERT` and financial update could overwrite those records before a later failure.

## New guarded behavior

1. After a successful exclusive `OPEN → CLOSING` claim, read existing stock and financial reconciliation evidence. If either exists, refuse recalculation and return `SHIFT_CLOSE_REVIEW_REQUIRED`; retain `CLOSING` and every existing row for supervised investigation. No repair/delete is automatic.
2. Validate tank and nozzle completeness. Financial reconciliation is evaluated using `persist=false` **before** the first stock/finance write. Validation errors may safely restore `OPEN` only if the attempt has created no reconciliation rows; a failed restore requires review.
3. After validation, stock persistence uses `failOnExisting: true`, which inserts without the normal UPSERT path. Financial persistence uses an **INSERT-only** repository method, never `createOrUpdate`.
4. Any stock/finance database write error (including an interrupted partial write) leaves `CLOSING` and all persisted rows untouched. Return `SHIFT_CLOSE_REVIEW_REQUIRED` (409) instead of claiming no evidence exists or automatically reopening.
5. Stage 01N's atomic finalizer still commits `CLOSED` and both mandatory audits in one D1 batch. An uncertain final commit is still held for review, never cleaned up.

## Compatibility and limitations

- The stock repository's default method continues to support existing UPSERT callers. The stricter `failOnExisting` mode is used **only** by the shift-close path.
- Existing financial `createOrUpdateFinancialReconciliation` stays unchanged for other workflows, but shift-close no longer uses it.
- A database write can create some stock rows before failing. This patch **preserves that evidence** and blocks further closes; it does not implement a full atomic stock/financial preparation transaction.
- Snapshot/input version locking, a production durable close journal, signed operator recovery, and the special ADMIN `close-empty` audit design remain future gates.
- Stage 01K's hosted seven tests proved scratch-only D1 semantics, **not** this updated real shift-close path. Cloudflare-hosted application-level UAT with synthetic data remains mandatory.
- No existing reconciliation is allowed to be overwritten by a new normal shift-close attempt. Existing evidence appearing in an OPEN shift is treated as a discrepancy requiring review.
- There is no automatic operator recovery workflow, unlock or deletion endpoint added by this stage.

## Regression evidence required

- [ ] Real local-D1: existing stock reconciliation survives a reattempt, including original row ID/data; state remains CLOSING.
- [ ] Real local-D1: existing financial reconciliation survives with original ID/data; no newly invented stock.
- [ ] Real local-D1: injected financial INSERT failure leaves partial stock evidence and CLOSING for review.
- [ ] Real local-D1: a DELETE-blocking trigger cannot prevent correct refusal because the close attempt must not run reconciliation cleanup DELETE.
- [ ] Normal shift close still writes stock, finance and both audit rows and reaches CLOSED.
- [ ] Missing tanks/nozzles and variance/price preflight errors with **no persistence** restore OPEN and retain editable inputs.
- [ ] TypeScript, full test suite and build pass on the final branch.
- [ ] Hosted staging, finance/audit sign-off, review/repair workflow, network-after-commit checks, RBAC and operational UAT done before merge/deploy.

**This is a candidate safety patch, not a full release approval.**
