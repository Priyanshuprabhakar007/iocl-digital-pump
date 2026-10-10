# IOCL Digital Pump Manager

Phase 3C-1 equipment breakdowns and audit hardening complete (99 independent tests verified).

## Production Data Persistence

- **Cloudflare D1 Database**: Serves as the authoritative persistent operational database for daily stock, meter readings, sales, receipts, RSP history, staff records, roster, DG logbook, and reporting.
- **Normal Deployment Workflow**: Strictly performs migration verification, pre/post data count safety checks (ensuring operational row counts never decrease), foreign key integrity checks (`PRAGMA foreign_key_check`), and production admin verification (`admin@iocl.in`), before deploying the Worker.
- **No Remote Seeding**: Normal deployment never runs demo seeds remotely (`demo-seed.sql` is excluded from production deployment).
- **Additive Migrations**: All migrations (0001–0022) are frozen. Future schema work begins with migration `0023`.
- **Preserved Live Records**: Live Company-Owned Company-Operated (COCO) operational records are fully preserved across deployments.
- **Demo Seeding Isolation**:
  - demo seeding is limited to local/development environments
  - no production GitHub workflow executes demo seed against remote D1
  - creating a separate demo Cloudflare database in the future must use a different D1 database binding/name and must never target the production operational database
