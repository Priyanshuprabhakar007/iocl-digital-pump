# COCO 79 pilot — evidence-led implementation

**Pilot outlet:** COCO 79, RO code 369460  
**Status:** Stage 00 **prepared / awaiting independent data verification**  
**Safety:** Documentation-only changes; no customer records, production data, API or calculations changed.

Read in order:

1. [Stage 00 baseline](./STAGE00_BASELINE.md) — source files, discovered code, discrepancies, missing evidence and release safeguards.
2. [Master data mapping](./MASTER_DATA_MAPPING.md) — exact document fields → existing tables, verification gates and read-only SQL examples.
3. [Implementation backlog](./IMPLEMENTATION_BACKLOG.md) — P0/P1/P2 priorities, acceptance tests and order of work.

## Decision log

| Decision | Status |
| --- | --- |
| Reuse existing shift, stock, receipt, finance, equipment, HR and document modules | Recommended |
| COCO 79 as first reference outlet, RO code 369460 | Agreed pilot |
| No source PDF / personnel record / invoices committed into GitHub | Required |
| No production D1, R2, chart activation or historical receipt import in Stage 00 | Required |
| Source scan ≠ certified structured tank calibration data | Verification pending |
| MDG 2024 dealership procedures do not automatically authorize COCO-specific enforcement | IOCL policy review pending |
| Only start full UAT after verified master mapping and isolated staging | Required |

## Next operational handoff

**First task for a person with authorized system access:** export **read-only** COCO 79 outlet/product/tank/DU/nozzle/chart/shift *configuration*, compare to the site sketch and certified records, document missing links, and obtain outlet and engineering sign-off. No direct production update is required to perform that comparison.

Do not use this Stage 00 baseline as proof of live system correctness or statutory compliance.
