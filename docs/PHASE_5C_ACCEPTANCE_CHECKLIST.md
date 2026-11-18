# Phase 5C — operational acceptance checklist

## Release gates

- Standard CI: typecheck, all automated tests, production build.
- Responsive browser smoke: isolated compiled frontend on localhost, synthetic reader and two fixtures only, with every API request intercepted. No production credentials, writes, or Worker access. Tests viewport widths 320, 390, 768, 1024 and 1440; mobile navigation open/close/Escape/focus return; outlet continuity; CNG list loading/error/retry and no automatic historical shift choice.
- Vercel preview and production deployment status.
- Live authenticated **read-only** acceptance by the authorized owner. Mocked browser smoke is not evidence that production APIs or records are correct.

## Live read-only verification

| Check | Steps | Expected outcome |
|---|---|---|
| Global outlet context | Choose COCO 22, then COCO 79; open Documents, Stock, CNG, Lube, Finance and DSR | Matching outlet and RO code, no prior outlet's records visible |
| Workbench date/shift | Open a known saved shift from its date, navigate to Stock and Finance and return | Verified same outlet, business date and shift; historical shift not silently chosen |
| Missing records | Open a business date with no shift | Clear no-shift state; no zero-as-recorded or false completion assertion |
| DSR reporting | Finance & Reports → DSR Reports; retrieve Daily, Weekly, Monthly, Custom range PDFs from saved data | Correct inclusive dates and outlet header; known missing data clearly flagged; no duplicate totals |
| Monthly report | Open known closed shift month and preview PDF | Compare report periods, completed shift counts and reconciled totals to saved records |
| Compliance | Select outlet/date, check register, agreements, claims, inspections and Reports & PDF | Same outlet; evidence links to source records; report sections start on separate pages |
| Workforce, Lube, Pump setup | Open every grouped task | Prior panels remain reachable, no permissions or features lost |
| Access management | Inspect user/scope lists and filters; cancel any confirmation without submitting | Explicit action names, visible scope and correct cancellation |
| Mobile and tablet | Chrome DevTools at 320, 390, 768, 1024 px; verify navigation, selectors, scroll inside tables, long dialogs and reachable Cancel/Save | No clipped critical controls or body horizontal scrolling; close dialogs without saving |
| Role restrictions | Use approved read-only scoped login/account | Only authorized outlet and modules shown; access changes remain restricted |

## Mutating UAT (separate controlled gate)

Do not open dummy shifts, create fake claims, collections, staff, readings, or alter access in production. When an isolated environment is available or a real authorized operational entry is necessary, verify opening → readings → receipts as applicable → closing readings → stock reconciliation → finance → authorized shift close → DSR PDF. Use existing backend validation, audit rules, maker/checker, and existing recovery practices. Do not bypass validations or force-close shifts. Never include production secrets in screenshots, repository files, or test fixtures.

Record pass/fail, outlet, business date, role, viewport, expected/actual and screenshot with confidential details masked. A UI change passing CI does not alone establish production readiness.
