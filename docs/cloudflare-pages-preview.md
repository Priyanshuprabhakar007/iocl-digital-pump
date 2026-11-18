# Cloudflare Pages — isolated frontend preview setup

This is a **frontend-only** Pages project. Do not connect the live Worker API, D1, R2 or production DNS.

## Source and build
- Repository: `dilseinvite-code/iocl-digital-pump`
- Pages project name: `iocl-digital-pump-ui-preview` (if available)
- Production branch **for this separate Pages project only**: `cloudflare-pages-baseline`
- Project root: repository root (`/`)
- Framework: Vite / React (or None, specifying settings below)
- Build command: `bun install --frozen-lockfile && bun run build`
- Output directory: `dist`
- Build environment: `BUN_VERSION=1.4.4` (current supported patched Bun; repository specifies Bun 1.4.3)
- Do **not** set `VITE_API_BASE_URL` to any live endpoint; leave blank/unset.
- Do not set `ENVIRONMENT`, `ALLOWED_ORIGINS`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, D1 database or R2 bindings in Pages.

## Configure branch controls
1. Connect GitHub to a new **Pages** project (not Workers Builds).
2. Choose the repository and `cloudflare-pages-baseline` as the Pages-specific production branch.
3. Save and deploy the initial static frontend.
4. Under Pages Build / Branch control, disable automatic **production branch** deployments if previews alone are desired.
5. Set Preview branch policy to all feature branches or `feature/*` (exact dashboard UI may vary).
6. Protect preview URLs behind Cloudflare Access before sharing, because branch pages can otherwise be public.

## Safety and expected behavior
- This static deployment has **no live backend**. Its login and operational API-backed functionality cannot be validated end-to-end. Do not enter real credentials.
- Pages' static SPA fallback can return index.html for unknown /api URLs; it is not an API. Use GitHub's `responsive-browser-smoke` for fully intercepted fixture-only responsive testing.
- To enable authenticated interactive previews, deploy a separate **staging Worker** with independently created staging D1 and R2 resources, staging auth secrets/users, dedicated preview origin allowlist, and blocked production credentials. Obtain explicit approval before creating or connecting those resources.
- Do not run `wrangler deploy`, `db:migrate:remote`, or `.github/workflows/deploy-cloudflare-demo.yml` as part of this setup.
- Do not modify existing `wrangler.jsonc` with `pages_build_output_dir`: it currently describes the operational Worker and its resource bindings.
- No custom domain, DNS, Vercel production, Worker route, D1 data or R2 documents should be modified.
- Phase 6A PR #70 and Phase 6B PR #71 may be previewed from their feature branches after Git integration is enabled; PR #71 is currently stacked on #70.

## Validation gates
- Cloudflare Pages static build succeeded, served index.html plus hashed assets, navigation deep links load.
- Network inspection confirms **no requests to operational Worker URLs**.
- No actual login, finance mutation, remote migration or document upload attempted.
- GitHub CI and responsive browser fixture suite pass for target feature branch.
