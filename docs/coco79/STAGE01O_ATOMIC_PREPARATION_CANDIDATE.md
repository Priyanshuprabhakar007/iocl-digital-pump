# Stage 01O — Atomic stock + financial reconciliation preparation (candidate)

**Date:** 13 November 2026  
**Base:** Stage 01N-2 draft PR #30  
**Status:** Development-only candidate; **not merged or deployed**.

## Why

The Stage 01N-2 shift-close path prevented destructive cleanup, but it wrote each new stock tank reconciliation sequentially and only afterward inserted the financial reconciliation. A middle stock insert or final finance insert failure could persist a subset of rows. Such an attempt was quarantined at `CLOSING` to avoid data loss, but lacked atomic preparation.

## Change

- The stock calculator is used in **read-only preview mode** before persistence. No per-tank INSERT occurs during calculation.
- After full tank/nozzle/receipt/financial/variance validation, `AtomicShiftCloseFinalizer.prepare()` submits all NEW stock tank INSERT statements **and** the finance INSERT in one `D1Database.batch`.
- Every insert is guarded by the shift's current `CLOSING` state and outlet identity; conflicts are **not** UPSERTed. Unique and other SQL constraint violations roll back the full D1 batch.
- The method verifies every inserted row via `RETURNING id` rather than driver-specific affected-row metadata. An uncertain response never authorizes an automatic retry or cleanup.
- Legitimate stock rows explicitly computed earlier by an operator can still be reused, but only if a fresh **read-only** per-tank comparison exactly matches saved product/volume/receipt/sale/variance values. When they match, the preparation batch contains the finance INSERT only; the earlier stock rows are not rewritten.
- `AtomicShiftCloseFinalizer.finalize()` still executes **a separate second atomic D1 batch** for the final status change and both mandatory audit rows. No main, migration or production-resource change.

## Safety evidence required

- [ ] Full CI TypeScript, tests, build.
- [ ] Local D1: an injected financial INSERT failure leaves **zero** newly inserted stock/finance rows.
- [ ] Local D1: a failed second-tank stock INSERT rolls back the first inserted tank.
- [ ] Local D1: a finance failure leaves operator-precomputed stock rows unchanged (same IDs, quantities, timestamps).
- [ ] Normal close, fuel-receipt finalize/cancel + precompute + close, CNG/lube/variance flows and Stage 01N dual audit rollback continue to pass.

## Limitations / blockers

This is **two separate transactions**: preparation and finalization. It does not make a transaction across the entire shift close, nor does it prevent input mutations between preview, preparation and finalization. A lost response after preparation or finalization is still treated as indeterminate and held for authorized review. No automatic retry, deletion, unlock or approval workflow is added.

A durable close-attempt journal (Stage 01J), protected source snapshot/version fences, operational recovery flow, hosted D1 full-backend test with synthetic data, independent concurrent Workers/network timeout UAT, exceptional ADMIN empty-close review and financial/audit owner sign-off are still required before production release.

**Stage 01K's seven hosted scratch-contract tests do not validate this operational D1 application code.**

Production D1/R2, pump infrastructure, calibration masters and COCO 79 reference history remain unchanged.
