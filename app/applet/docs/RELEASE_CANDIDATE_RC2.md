# IOCL Digital Pump Manager — Release Candidate 2

**Release:** v1.0.0-rc2  
**Status:** Engineering Frozen / Ready for Manual Acceptance / Includes Migration 0027

## Verified Engineering Baseline
- Automated tests: 1,538 PASS
- Failed tests: 0
- Assertions: 5,164
- Test files: 39
- TypeScript: PASS
- Production build: PASS
- F1 Cross-Module Regression: PASS
- F2 Automated Business UAT: PASS
- F3 Production Safety Audit: PASS
- F4 Final Release Gate: PASS

## Database Baseline
- Migrations: 0001–0027 (Sequential, gapless)
- Terminal Migration: `0027_outlet_directory_visibility.sql`
- Next Forbidden Migration: `0028` or higher
- Protected production tables: 61
- Foreign Key Integrity: 0 violations (`PRAGMA foreign_key_check`)

## New Features in RC2
- **Retail Outlet Directory Safe Hide / Restore:** Non-destructive additive soft-hide / restore support on retail outlet directory. Preserves all foreign-key relationships, operational history, stock records, financial audits, and workforce assignments while allowing retail outlets to be hidden from the normal directory view.
- **Audit Trails:** Complete audit logging for `OUTLET_DIRECTORY_HIDE` and `OUTLET_DIRECTORY_RESTORE` actions.

## Governance
- Manual UI UAT: PENDING
- Production UAT: NOT STARTED
- Formal Release Approval: PENDING
- Production Released: NO
