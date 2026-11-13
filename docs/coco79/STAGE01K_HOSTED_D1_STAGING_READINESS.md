# Stage 01K — Disposable hosted D1 contract readiness

**Date:** 13 November 2026  
**Depends on:** Stage 01J draft PR #25.  
**Status:** Staging runner and local tests prepared; **hosted Cloudflare D1 run NOT executed**.

## Purpose

Cloudflare documentation describes `D1Database.batch()` as a SQL transaction that rolls back the entire sequence on a failed statement. Stage 01E/01J used local SQLite emulation; this stage prepares a narrow, explicit probe for a **brand-new disposable remote D1 database** to verify the key behavior under the Cloudflare runtime.

- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://developers.cloudflare.com/workers/wrangler/commands/d1/
- https://developers.cloudflare.com/workers/previews/resources/

**Critical:** This repository's root `wrangler.jsonc` targets the IOCL application and its production DB binding. **Never run `wrangler d1 execute --remote`, `wrangler deploy`, or any migration through that config for this probe.**

## Deliverables

- `scripts/stage01k/staging_schema.sql`: separate scratch-only schema (guard, attempts, append-only events).
- `scripts/stage01k/d1ContractProbe.ts`: seven portable D1 contract checks using scratch tables only.
- `scripts/stage01k/standaloneWorker.ts`: separate temporary Worker entry point; requires authenticated POST, explicit acknowledgement and matching D1 guard hash.
- `scripts/stage01k/configSafety.ts` and `preflight.ts`: refuse production DB ID/name, incorrect binding, non-staging Worker or invalid database ID.
- `scripts/stage01k/wrangler.staging.example.jsonc`: **non-deployable placeholders**. Copy to `wrangler.staging.local.jsonc` and fill in a *fresh* D1 ID; local file is gitignored.
- `tests/stage01kD1Contract.test.ts`: isolated local-D1 contract tests, including no mutation of operational tables.

## Required manual hosted-staging workflow

These are **instructions for an authorized operator**, not tasks executed in CI or in ChatGPT.

1. In the correct Cloudflare account, create a **new, empty, disposable D1** with a unique name starting `stage01k-`. Its database ID must differ from the ID in the root production `wrangler.jsonc`. Never clone production data or use an existing operations database.
2. Copy the example config to `scripts/stage01k/wrangler.staging.local.jsonc`. Set `database_name` and `database_id` to that dedicated database; do not modify the root Wrangler config.
3. **Mandatory local preflight** before every remote action:

   ```sh
   bun scripts/stage01k/preflight.ts scripts/stage01k/wrangler.staging.local.jsonc
   ```

4. With the same explicit config, create only the disposable tables:

   ```sh
   bunx wrangler d1 execute STAGING_DB --remote --config scripts/stage01k/wrangler.staging.local.jsonc --file scripts/stage01k/staging_schema.sql
   ```

5. Create a private, random token of at least 24 characters and retain it in secure operator storage. Compute SHA-256 of the token **locally** (do not print/share the token). Insert only its hex hash as the `marker_hash` in `stage01k_guard` under purpose `IOCL_STAGE01K_DISPOSABLE_ONLY` using `wrangler d1 execute STAGING_DB --remote --config ... --command ...`. Never put the token or secret hash in GitHub.
6. Set a Worker secret named `STAGE01K_PROBE_TOKEN` to exactly the original private token, using the **explicit staging config**, and deploy only the standalone disposable Worker with that config after owner review. **Do not deploy the IOCL application Worker.**
7. Invoke `POST /stage01k/run` against that disposable Worker's URL with `Authorization: Bearer <private token>` and `X-Stage01K-Acknowledge: isolated-disposable-staging`. No CORS is enabled.
8. Capture sanitized JSON check codes, run ID, D1 log/query evidence, concurrency behavior, execution timestamp, and the confirmed disposable database ID. Do not record secrets. Repeat tests under separate Worker invocations and controlled failure conditions.
9. Delete the disposable Worker and dedicated D1 only after retaining verification evidence and receiving operator confirmation. Keep production database and deployment untouched.

**Do not run the hosted procedure until production/staging identifiers and access are independently confirmed by the owner.** A preflight check protects against accidental matching IDs but cannot prove that a newly entered ID is truly isolated.

## Staging contract checks

| Code | Verified behavior intended |
|---|---|
| K01 | Reservation and identical key/payload replay create one attempt |
| K02 | Reused key with a different fingerprint is refused |
| K03 | Failed event INSERT rolls back preceding attempt INSERT in one D1 batch |
| K04 | Failed mandatory event INSERT rolls back status transition in one D1 batch |
| K05 | Simulated lost-response-after-commit is reconciled by re-reading durable evidence |
| K06 | Two concurrent distinct-key attempts for one scratch shift yield one winner |
| K07 | Scratch event evidence cannot be UPDATEd or DELETEd |

The contract's **COMMITTED** state refers to a *scratch attempt only*, not any actual operational shift. The harness never changes `operational_shifts`, `shift_stock_reconciliations`, `shift_financial_reconciliations`, `audit_logs`, pump infrastructure or calibration records.

## Known gaps and release blockers

- [ ] Run the portable contract on a newly provisioned, guard-marked **hosted** D1.
- [ ] Validate independent remote requests across Worker instances/locations, not just local Promise concurrency.
- [ ] Test actual network timeout/retry and a forced disconnect after transaction commit; K05 is only a local simulation.
- [ ] Verify observed D1 rollback and transaction behavior with specific production-equivalent failure modes.
- [ ] Review operations/finance/audit requirements for mandatory audit and immutable reconciliation versions.
- [ ] Design atomic real shift+reconciliation+audit change in Stage 01L **only after** hosted results and signoff.
- [ ] CI typecheck/full suite/build on this branch; draft PR must remain unmerged and undeployed.

No user-supplied credentials are stored in these files. No production data was accessed by this stage.
