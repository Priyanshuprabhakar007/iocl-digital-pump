# One-click-free GitHub production release for IOCL draft storage

User expressly authorized activation of the draft-only D1 migration and Worker for the real live website. This is a **single GitHub Actions workflow**, triggered when its file is merged into main. No Antigravity or local project folder is required. Manual workflow_dispatch provides a retry route if GitHub Secrets are missing.

The release:
- Verifies repo production D1 binding, actual remote account/database UUID/name, and D1 production storage version.
- Requires a real Cloudflare D1 Time Travel recovery bookmark before any write. Cloudflare Time Travel is the durable recovery mechanism, subject to account plan retention (7 days Workers Free; 30 days Workers Paid).
- Checks all retail_outlets and coco_agreement_details rows using private in-memory SHA-256 fingerprints.
- Creates a FULL temporary D1 SQL export on the ephemeral GitHub runner; it verifies expected tables, but never uploads or publishes the SQL export. The GitHub repository is PUBLIC, so raw D1 backups MUST NOT become GitHub Actions artifacts or PR attachments. The temporary export is not a durable backup.
- Executes only the independent additive SQL draft migration 0039, verifies the table, index and immutable triggers, confirms operational source data unchanged, then deploys the main-branch Worker through Wrangler.
- Does NOT apply 0036/0037/0038, enable the Full Import button, create any RO, edit any Lease Agreement or upload documents.
- Requires existing GitHub Actions repository secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. If absent, wrong or unauthorized, release stops without mutation.

**Operational caveat:** Remote Worker deployment changes the shared live API runtime for other existing modules. Full test/typecheck checks run first. Even if operational data fingerprints remain unchanged, unrelated Worker functions should be smoke-tested on the live site.

**After green release:** Visit the live Vercel URL, hard-refresh, Check Draft Storage, Save 26-Column Draft, confirm 131 rows, then Resume. Saving a draft writes only the new dealer_master_draft_uploads table. It does NOT populate the 125 new operational outlets or overwrite six existing COCO outlets.

**Public repo/backup:** Time Travel bookmark is not logged. Recovery is manual in Cloudflare, and a full restore would rewind all concurrent legitimate writes. The Action never auto-restores.

**Vercel Free:** One release PR and squash merge; the Cloudflare backend job does not invoke Vercel or create additional Vercel previews.
