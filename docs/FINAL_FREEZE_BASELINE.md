# IOCL Digital Pump Manager — Final Freeze Baseline (Stage F1)

## Project Information
- **Project**: IOCL Digital Pump Manager
- **Baseline Commit before F1**: `1e59512d7a264994c6a9bcf1f6c2c1f91d7dfaf0`
- **Starting CI Status**: Pipeline #90 = SUCCESS
- **Starting Validation Metrics**:
  - 1398 tests passed
  - 0 tests failed
  - 4362 expect() calls
  - 33 test files

---

## Technical Stack & Architecture
- **Production Database**: Cloudflare D1 (Distributed SQLite engine with strict schema triggers, foreign keys, and indexes)
- **Document Storage**: Cloudflare R2 (S3-compatible object storage with SHA-256 integrity and MIME signature validation)
- **Frontend Application**: React 19 / Vite SPA with Tailwind CSS
- **Edge Worker / Backend API**: Hono framework on Cloudflare Worker runtime
- **ORM & Migrations**: Drizzle ORM (migrations 0001 through 0026)
- **Schema & Payload Validation**: Zod runtime validation
- **Automated Test Suite**: Bun / Vitest-compatible full-suite integration tests

---

## Implemented System Modules & Functional Areas

1. **Authentication & Security**
   - bcrypt-hashed credential verification
   - HttpOnly cookie sessions with secure flags and expiry
   - Rate limiting for brute-force resistance
   - Sanitized error responses without internal SQL, stack trace, or table leaks

2. **RBAC & User Permission Overrides**
   - Standard roles: `ADMIN`, `STATE_OFFICE`, `DIVISIONAL_OFFICE`, `BUSINESS_MANAGER`, `FIELD_OFFICER`, `DEALER`, `CSP`
   - Role-permission matrix with granular permissions
   - Explicit per-user permission overrides (`ALLOW` / `DENY`)

3. **Outlet Management**
   - Hierarchical geographic hierarchy (States -> Divisions -> Sales Areas -> Outlets)
   - ScopeService enforcing strict geographic and outlet boundaries
   - Cross-outlet isolation preventing unauthorized access or leakage

4. **Product Management**
   - Master liquid fuel products (MS, HSD, XP95, XTRAGREEN, XP100)
   - Product pricing, categories, units, and active status rules

5. **Pump Infrastructure**
   - Outlet -> Tanks -> Dispensers -> Nozzles topology
   - 2, 4, and 6 nozzle dispenser capacity enforcement
   - Tank-product matching and nozzle dependency guards

6. **Shift Operations**
   - Three-phase lifecycle: `OPEN` -> `CLOSING` -> `CLOSED`
   - Historical price and master snapshots at shift open
   - Concurrent shift creation prevention and single-active-shift invariant

7. **Fuel Receipts**
   - Four-state receipt lifecycle: `ARRIVED` -> `VERIFIED` -> `DECANTED` -> `COMPLETED`
   - Quality tolerance checks (density, water, temperature)
   - Atomic rollback and immutability once decanted/completed

8. **Tank Stock & Reconciliation**
   - Dip and volume readings with tank calibration charts
   - Physical vs book stock variance calculation
   - Controlled variance reasons for shift settlement

9. **Financial Operations**
   - Shift sales revenue computation in integer paise
   - Collections by payment method (Cash, Digital/UPI, Fleet Card, Credit)
   - Authoritative variance computation and reconciliation persistence

10. **CNG Operations**
    - High-pressure cascade logs, online grid meters, and mass meters
    - Pressure readings (inlet, cascade, bank) in integer milliunits
    - Dual revenue tracking (Fuel + CNG) with exact half-up rounding

11. **Lube Operations**
    - SKU master, stock transactions (IN, OUT, ADJUSTMENT), and stock balances
    - Litre and pack sales during open shifts with snapshot pricing
    - Negative balance prevention via SQLite database triggers

12. **Equipment Breakdowns**
    - Equipment asset registry (dispensers, compressors, generators, ATG, etc.)
    - Ticket lifecycle: `OPEN` -> `ASSIGNED` -> `IN_PROGRESS` -> `RESOLVED` -> `CLOSED`
    - Immutability and breakdown event history logging

13. **Utilities & Sub-Meters**
    - Electricity connections, monthly consumer bills, and payment receipts
    - Sub-meter consumption tracking for vendors, CNG stations, and commercial tenants
    - Safe integer paise computation and overdue status derivation

14. **Municipal Taxes & Statutory Dues**
    - Property tax, trade licenses, signage charges, and local authority fees
    - Assessment document linking and paid receipt verification
    - Lifecycle immutability for settled statutory dues

15. **NFR Lease & Rent**
    - Space registry (ATM, Food Kiosk, EV Charging, Tyre Care, Convenience Store)
    - Vendor registry, lease agreements, and monthly rent due generation
    - Calendar math, leap-year clamping, and overpayment prevention triggers

16. **Organization Masters**
    - Departments, IOCL officers, and officer postings
    - Service providers and outlet maintenance contracts
    - Global scope write restrictions

17. **HR Workforce & Roster**
    - Designation masters, skill categories, and manpower sanctions
    - Staff directory, Aadhaar masking (last 4 digits only), and document vault
    - Shift roster assignments with single-roster-per-day constraints

18. **Attendance & Geofencing**
    - Haversine-based outlet distance calculation with tolerance radius
    - Check-in and check-out temporal integrity
    - Offline / manual override audit logging

19. **Nozzle Assignments**
    - Staff assignment to dispensers and nozzles during operational shifts
    - Physical delete protection via database triggers

20. **Uniform Management**
    - Uniform items, size variants, stock receipts, and adjustments
    - Issue, return, and replacement tracking per employee
    - Minimum stock alerts and staff uniform history reports

21. **Skill Categories**
    - Standard skill matrix (Unskilled, Semi-Skilled, Skilled, Highly Skilled)
    - Wage category alignment for statutory compliance

22. **Leave Management & Maker-Checker (Phase 5A Frozen)**
    - Strict state machine: `PENDING` -> `APPROVED` | `REJECTED` | `CANCELLED`
    - Terminal status immutability: `APPROVED`, `REJECTED`, and `CANCELLED` cannot transition
    - Maker-Checker enforcement: Maker/requester cannot approve or reject own leave
    - Requester-only cancellation for `PENDING` requests
    - Date interval overlap blocking for active requests, with release upon rejection/cancellation

23. **Audit Logging**
    - Tamper-evident audit trail recording actor, action, entity, IP, and timestamp
    - JSON snapshots of prior and updated states on significant mutations

24. **Document Vault**
    - Cloudflare R2 binary storage referenced by D1 metadata
    - Scope and outlet verification preventing cross-outlet document attachment

---

## Final Freeze Quality Invariants
- `PRAGMA foreign_key_check` = 0 violations
- No schema migrations beyond `0026_hr_leave_maker_checker.sql`
- Zero unhandled exceptions or raw SQL error leakage to client callers
- 100% deterministic test suite in isolated local environments
