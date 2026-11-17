# Stage 01AA — Real Wrangler local D1 baseline rehearsal

This workflow does **not** authenticate to Cloudflare or use the GitHub staging environment. Its migration commands have **only** `--local`, with an explicit temporary config, a fake UUID, a unique local-only database name and an isolated `--persist-to` path. No `--remote`, no Wrangler deployment, and no production/staging writes.

## Method
1. Checkout the stacked draft branch; install dependencies locked by bun.lock.
2. Generate a synthetic temporary Wrangler config in `.stage01aa-tmp/` (not tracked; CI runner disposable).
3. Apply the frozen repository baseline migrations 0001–0035 to fresh Wrangler local D1.
4. If application succeeds, inspect `d1_migrations` and require 35 records; check `PRAGMA foreign_key_check` yields zero violations.
5. A CLI error or foreign key incompatibility should fail the workflow, NOT be bypassed.

## Caveats
- A local Wrangler rehearsal is more representative than Bun's separate LocalD1 emulator, but it **cannot prove remote hosted D1 behavior**.
- Cloudflare D1 documented transactional FK enforcement may make existing migrations 0007 and 0032 unsafe. This workflow helps discover symptoms but is not permission to run migrations remotely.
- Keep migrations 0001–0035 frozen. Any adaptation needs a separately approved migration strategy and fresh tests, especially table drops, triggers and HR records.
- No GitHub Environment secrets are referenced; the read-only D1 token is neither accessed nor needed.
- Even a successful local rehearsal does not satisfy the Stage 01V production release gates. No remote writes, merge or deployment authorized.
