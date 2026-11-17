# IOCL Digital Outlet Manager — Client Demo (17 November 2026)

## Purpose and environment
Demonstrate the **working UI and API on isolated, synthetic demo data**, not on the empty full-staging Cloudflare D1 or production. Use the P0 draft branch `fix/p0-finance-provisional-reading-status-20261114`. The branch has a `.devcontainer/devcontainer.json` that installs Bun and dependencies for a browser-based GitHub Codespace. No remote D1 credentials are needed.

**Important:** A local Codespace demo does not constitute hosted staging UAT, physical tank calibration certification, or production release approval.

## Start in browser (no local VS Code)
1. Open `https://github.com/Priyanshuprabhakar007/iocl-digital-pump`.
2. Select branch `fix/p0-finance-provisional-reading-status-20261114`.
3. Select **Code → Codespaces → Create codespace on this branch**. Use Codespaces **in browser**. If Codespaces is unavailable on the account, do not attempt to redirect the demo to production or the empty hosted staging database.
4. The devcontainer installs `bun@1.4.3` and the locked project dependencies. In the web terminal run `bun run dev`.
5. When port **3000** is offered, choose **Open in Browser**. Keep the forwarded port **Private** and screen-share the browser window. Do not make it public merely to share the app with clients.
6. The app automatically creates and seeds a disposable local SQLite/D1 database at `.sqlite/iocl_local.db`. Use **local sample accounts only** (for example, the development admin `admin@iocl.in` using the sample password defined in `src/db/seed.ts` and local integration tests); do not enter live client or production credentials.

## Client demo sequence: show functional outcomes, not a list of menus
1. **Outlet and infrastructure:** choose a seeded demo outlet; point out product/tank/dispenser/nozzle links.
2. **Tank calibration:** show existing sample chart and dip-to-volume conversion; clarify that 10KL/15KL/20KL/50KL official source charts still require independent validation.
3. **Daily Operations:** show shift opening, opening readings and nozzle totalizers, testing/closing readings, and shift stock calculations. Use numbers consistent with the seeded demo and never invent reconciliation data live in front of the client.
4. **Fuel receipts and stock:** show the receiving flow and its effect on opening + receipts − net sales vs physical closing, if a prepared local sample supports it.
5. **Financial Operations:** show a local sample collection type (Cash/UPI/Card), summary and reconciliation. No real payments are processed.
6. **Shift close / audit trail:** show close outcome only for a fully reconciled prepared demo shift. If discrepancies trigger a hold, demonstrate that the system **blocks unauthorized finalization** instead of bypassing it.
7. **Reports:** display available DSR/operational reports in the sample environment.

## Contingencies and safety
- **App does not open:** check terminal for the `server running on http://0.0.0.0:3000` message; confirm port 3000 is forwarded and private.
- **Login fails:** check local seeding logs; do not use or reset any hosted database.
- **Reconciliation not ready:** demonstrate read-only screenshots and existing prepared example flow; do not claim an end-to-end UAT pass for that scenario.
- **Do not run:** `wrangler ... --remote`, `db:migrate:remote`, production/staging deployment workflows, restore/delete, or demo seeding against any hosted D1.
- **Prepare before meeting:** open the login page, select the demo outlet, validate three screens, and keep the P0 GitHub Actions test run available for technical assurance.
