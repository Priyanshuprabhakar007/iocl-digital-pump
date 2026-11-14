# Stage 01J — Offline staging D1 identity guard

Status: **offline guard implemented; hosted D1 NOT verified**.

## What is included

- `scripts/stage01j-validate-staging.ts`: no Cloudflare calls, no Wrangler, no DB reads/writes, no deploy.
- `tests/stage01jStagingConfigGuard.test.ts`: synthetic regression tests against accidental production D1 ID reuse, production R2 bindings, environment/route errors and unrecognized resources.

## Operator procedure (after independent approvals)

1. In Cloudflare dashboard, create/locate the previously agreed **disposable D1 staging database**. Verify its account, name and UUID in the dashboard. No credentials or production datasets are needed in the repository.
2. Independently compare staging UUID/name against every production binding. Two authorized reviewers must verify they differ, and only synthetic records will be used.
3. Prepare a local, uncommitted JSON file outside the repository with a uniquely named staging Worker, `vars.ENVIRONMENT = "staging"`, a single `d1_databases` entry with binding `DB`, the staging name/UUID, and no production R2/routes/other resources. This file is **never deployed by this stage**.
4. Run `bun scripts/stage01j-validate-staging.ts /absolute/path/staging.jsonc <UUID-from-dashboard>`. The script outputs PASS/FAIL **for static configuration only**.
5. Manually review the GitHub draft PR and obtain explicit operations/finance/audit authorization. A PASS is not permission for remote D1 inspection.
6. Only after separate authorization, execute Stage 01I's SELECT-only staging inspection with a reviewed staging-specific command. **Never use the repository's root production wrangler.jsonc**.

## Explicit limitations

- Cannot establish Cloudflare account ownership, remote D1 existence, data isolation, empty/synthetic provenance, transactional guarantees, IAM policy or role approvals.
- The guard can identify a staging config that accidentally references known production IDs, but cannot prove an unrecognized ID is non-production.
- Does not perform Cloudflare API calls or invoke `wrangler d1 execute`.
- Existing shift-close logic and audit inconsistencies remain unchanged.
- Remediation and production release require new authorized gates; keep this PR draft.
