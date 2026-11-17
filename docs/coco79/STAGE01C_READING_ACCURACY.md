# Stage 01C — Reading accuracy and completion warnings

**Date:** 12 November 2026  
**Reference:** COCO 79 operational records and MDG 2024; no historical records copied into the application.  
**Scope:** Existing Daily Operations & DSR **presentation only**. No API, database, formula, permission, pump infrastructure or calibration chart setup changes.

## Why this is needed

The existing `FuelDailyOperationsService.computeProductDailySummary` stores both numeric aggregates (which can be `0` when source inputs are missing) and an authoritative `status`/`missingFields` list. The frontend previously displayed every numeric aggregate using `formatMilliunits` even when an opening tank dip, closing tank dip or nozzle meter reading was not recorded.

An unmeasured volume must not be represented as an actual zero measurement. Conversely, an actual saved `0.000 L` is valid and must remain visible.

## Implemented changes

1. **Source-aware DSR metrics (presentation only).** `src/frontend/utils/dailyReadingPresentation.ts` formats product/day and total rows using existing `status` and `missingFields`:
   - Missing opening stock: `opening`, `available`, `theoretical` and `variance` show `Not recorded`.
   - Missing closing stock: `physical` and `variance` show `Not recorded`.
   - Missing nozzle meter reading: `gross`, `testing`, `net`, `theoretical` and `variance` show `Not recorded`, rather than a misleading partial sum.
   - Saved zero always remains `0.000`. No-product day totals show `Not recorded` rather than assuming zero.
   - Receipt amount remains numeric according to the **existing** aggregation policy. Live in-progress aggregation can use an invoice-quantity fallback if measured receipt is unavailable; this caveat is highlighted to the reviewer.
2. **Nozzle report rows:** Without both opening and closing saved totalizers, the row's derived gross/testing/net sales are shown as `Not recorded`.
3. **Water-dip draft warning:** Newly opened tank entry forms currently prefill water dips with `0.000 mm`; we clearly say that a draft is **not a saved reading** and operators should verify the physical measurement before saving. We have **not** changed the prefill, submitted field values, or introduced an unapproved mandatory validation rule.
4. **Calibration warning:** The row explains that the existing calibration is unavailable and directs staff to an authorized supervisor, **not** to an infrastructure/configuration workflow.
5. **Save error guidance:** Preserve unknown server error details; offer specific actionable messages for `CALIBRATION_NOT_AVAILABLE`, `DIP_OUT_OF_RANGE` and `BATCH_SAVE_UNVERIFIED`. No server error codes were modified.

## What remains a policy decision

- Whether a blank water dip should remain a default `0.000` or require explicit operator confirmation before saving. This PR does **not** alter that workflow.
- Whether invoice quantity is acceptable as a provisional receipt in a daily stock summary. This PR adds a caution but does **not** change the source of receipt calculations.
- Additional reasons for unknown metrics beyond `missingFields`, including incomplete RSP snapshots and some exceptional nozzle-unavailability situations, should be reviewed with operations before adding more blocking logic.
- The authoritative backend and export calculations are unchanged. Other reporting screens might also need source-aware display; do not claim entire-platform parity from this frontend change.

## Tests

`tests/stage01cReadingPresentation.test.ts` checks:
- confirmed saved zero vs absent source readings;
- missing opening, closing and nozzle meter values;
- product-level and day-level unknown totals;
- genuine zero-activity rows vs `NO_ENTRY`;
- nozzle with missing totalizer vs actual 0;
- calibration and uncertain batch messages.

**Go-live gate:** TypeScript, full tests and build, focused staging visual review of daily entry and DSR (mobile and desktop), approval of source authority and water-dip rules, and review of the stacked Stage 00/01A/01B PRs. **No production deployment in this stage.**
