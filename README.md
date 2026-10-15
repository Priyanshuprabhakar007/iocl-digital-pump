# IOCL Digital Pump Manager

**Current Status:** Release Candidate / Final Freeze (Stage F4)  
**Verified CI Pipeline:** Pipeline #97 = SUCCESS  
**Automated Baseline:** 1,511 tests passing, 0 failures across 37 test suites  

---

## Project Overview

The **IOCL Digital Pump Manager** is an enterprise-grade, multi-role retail outlet management and operational governance platform built for Indian Oil Corporation Limited (IOCL). It provides end-to-end digital oversight of petroleum retail outlets, covering fuel infrastructure, shift operations, tank stock reconciliation, financial settlements, CNG and Lube operations, equipment maintenance, utility monitoring, municipal taxes, NFR leases, organization master data, HR workforce management, attendance geofencing, nozzle assignments, uniform inventory, and Maker-Checker leave approvals.

---

## Technology Stack

* **Frontend:** React 19, Vite, Tailwind CSS, Lucide Icons, Modular Component Architecture
* **Backend Worker:** Cloudflare Workers, Hono Web Framework
* **Persistence Layer:** Cloudflare D1 (SQLite) with Drizzle ORM
* **Document Vault:** Cloudflare R2 Object Storage
* **Validation & Security:** Zod Schema Validation, Secure Session Cookies, RBAC & Geographic Scoping
* **Runtime & Tooling:** TypeScript (Strict), Bun Package Manager, Vitest

---

## Migration Inventory & Baseline

* **Migration Sequence:** Exactly 26 sequential migrations (`0001` through `0026`).
* **Terminal Migration:** `0026_phase5a_hr_leave_maker_checker.sql` (Phase 5A HR Leave Management & Maker-Checker Foundation).
* **Migration Integrity:** Zero gaps, zero duplicate numbers, no migration `0027`.

---

## Production Data Safety & Safeguards

1. **Zero Remote Demo Seeding:** Production deployment workflows strictly disallow demo seeding or mock initialization against remote D1.
2. **61-Table Row Preservation:** Automated pre- and post-migration row-count validation guards 61 core and specialized operational tables against accidental data deletion.
3. **Foreign Key Integrity:** Automated `PRAGMA foreign_key_check;` execution halts deployment if any foreign key constraint violation is detected.
4. **Production Admin Verification:** Deployment workflows verify the existence of the primary production administrator account (`admin@iocl.in`) before promoting the release.
5. **Atomic Pipeline Protection:** Workflows enforce `set -euo pipefail` and idempotent migration execution.

---

## Implemented Major Domains

* Authentication & Role-Based Access Control (RBAC)
* Outlet Hierarchy & Geographic Scoping (Global, State, Division, Sales Area, Outlet)
* Products & Master Pricing (Integer Paise Precision)
* Pump Infrastructure (Tanks, Dispensers, Nozzles, Capacity Limits)
* Shift Operations & Stock Reconciliation (Opening, Closing, Tank Dips, Fuel Receipts)
* Financial Settlements & Cash Handover / Bank Deposits
* CNG Operations & Pressure Log Management
* Lube SKU Catalog & Stock Ledger Transactions
* Equipment Breakdown & Repair Ticket Management
* Utilities (Electricity Accounts, Sub-Meters, Daily Readings, Bills)
* Municipal Taxes & Statutory Dues Management
* NFR Commercial Leases & Rent Payment Tracking
* Organization Masters (Departments, Officers, Service Providers)
* HR Workforce Management (Designations, Staff, Sanctions, Rosters)
* Attendance Geofencing & Biometric Punch Verification
* Nozzle Operational Assignments & Uniform Inventory Management
* HR Leave Maker-Checker Workflow (Terminal State Enforcement)
* Tamper-Evident Audit Logging & Secure Document Vault (R2)

---

## Release Status & Governance

| Gate | Status |
| :--- | :---: |
| **Engineering / Development** | **COMPLETE** |
| **Automated Release Gates (F1–F4)** | **PASS** |
| **Release Candidate** | **READY** |
| **Manual Desktop / Tablet / Mobile UI UAT** | **PENDING** |
| **Production UAT Smoke Test** | **NOT STARTED** |
| **Formal Release Approval** | **PENDING** |
| **General Production Release** | **NOT YET APPROVED** |

*Note: The software codebase and release candidate pipeline are fully frozen and verified. General production release remains pending human UI and operational acceptance sign-off.*

## Release Candidate

Current release candidate documentation:

`docs/RELEASE_CANDIDATE_RC2.md` (Release Candidate 2 — 27 Migrations Baseline)
