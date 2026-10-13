# IOCL Digital Pump Manager — UAT Execution Checklist (Stage F2)

## UAT Status Summary

| Category | Status | Details |
| :--- | :--- | :--- |
| **Automated UAT Status** | **COMPLETED** | 25 automated end-to-end business journey scenarios passing in `tests/uatBusinessJourneys.test.ts` |
| **Manual UI UAT Status** | **PENDING EXECUTION** | Prepared for manual human validation against web frontend |
| **Production UAT Status** | **NOT STARTED** | Deployment frozen; staged for isolated staging/acceptance testing |

---

## Seeded Test Personas & Credentials

All test accounts exist in the seeded local database environment:

| Persona | Seeded Email | Password | User ID | Scope Level | Assigned Scope Entity |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ADMIN** | `admin@iocl.in` | `Password@123` | `user-admin` | `GLOBAL` | System-wide (All units) |
| **STATE_OFFICE** | `wbso@iocl.in` | `Password@123` | `user-so` | `STATE` | West Bengal State Office (`state-wb`) |
| **DIVISIONAL_OFFICE** | `kolkatado@iocl.in` | `Password@123` | `user-do` | `DIVISION` | Kolkata Divisional Office (`div-kol`) |
| **BUSINESS_MANAGER** | `bm.kolkata@iocl.in` | `Password@123` | `user-bm` | `DIVISION` | Kolkata Divisional Office (`div-kol`) |
| **FIELD_OFFICER** | `fo.central@iocl.in` | `Password@123` | `user-fo` | `SALES_AREA` | Kolkata Central Sales Area (`sa-cen`) |
| **DEALER** | `dealer.parkstreet@iocl.in` | `Password@123` | `user-dealer` | `OUTLET` | Park Street RO (`ro-1001`) |
| **CSP** | `csp.parkstreet@iocl.in` | `Password@123` | `user-csp` | `OUTLET` | Park Street RO (`ro-1001`) |

---

## Business Module Execution Checklist

### 1. Login & Authentication
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-AUTH-01` | ADMIN | App running at `/` | Enter valid admin credentials and submit | Redirects to Dashboard; session cookie set; user header shows ADMIN role | [ ] PENDING | Manual execution required |
| `TC-AUTH-02` | DEALER | Logged in | Click 'Logout' in user dropdown | Session cookie cleared; redirected to login; navigating back requires login | [ ] PENDING | Manual execution required |
| `TC-AUTH-03` | ANY | App running at `/` | Submit incorrect password | Error message "Invalid email or password" displayed without revealing DB info | [ ] PENDING | Manual execution required |

### 2. Dashboard
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-DASH-01` | DEALER | Logged in as Dealer | View Dashboard overview | Shows key metric cards for Park Street RO (Shifts, Sales, Tank Stocks) | [ ] PENDING | Manual execution required |
| `TC-DASH-02` | STATE_OFFICE | Logged in as SO | View Dashboard | Overview displays aggregated metrics scoped strictly to West Bengal outlets | [ ] PENDING | Manual execution required |

### 3. Users & RBAC
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-USER-01` | ADMIN | Logged in as Admin | Navigate to Users management page | Complete list of all 7+ seeded users across all roles rendered in table | [ ] PENDING | Manual execution required |
| `TC-USER-02` | DEALER | Logged in as Dealer | Attempt to access `/users` route directly | Access denied notification / 403 Forbidden shown; redirected safely | [ ] PENDING | Manual execution required |
| `TC-USER-03` | ADMIN | Viewing user detail | Apply permission override (e.g. DENY `shifts.read`) | User effective permissions recalculated immediately; reflects on subsequent load | [ ] PENDING | Manual execution required |

### 4. Retail Outlets & Geographic Hierarchy
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-OUT-01` | ADMIN | Logged in as Admin | Open Outlets directory | Displays Park Street, Salt Lake, and Ludhiana retail outlets | [ ] PENDING | Manual execution required |
| `TC-OUT-02` | FIELD_OFFICER | Logged in as FO Central | View Outlets list | Only Park Street RO (in Central SA) is visible; Salt Lake (North SA) is omitted | [ ] PENDING | Manual execution required |

### 5. Products Catalog
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-PROD-01` | ADMIN | Logged in as Admin | Open Products management | Displays MS, HSD, XP95, XTRAGREEN, and CNG products with active status | [ ] PENDING | Manual execution required |
| `TC-PROD-02` | DEALER | Logged in as Dealer | Attempt to create new global fuel product | Action button is disabled / hidden; write request blocked with 403 | [ ] PENDING | Manual execution required |

### 6. Pump Infrastructure (Tanks, Dispensers, Nozzles)
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-PUMP-01` | DEALER | Assigned to RO-1001 | Open Pump Infrastructure view | Displays 3 underground tanks and configured dispensers with matched nozzles | [ ] PENDING | Manual execution required |
| `TC-PUMP-02` | DEALER | Viewing tanks | Inspect Tank 1 (MS) and Tank 2 (HSD) | Safe fill, minimum operating levels, and capacity limits displayed in integer litres | [ ] PENDING | Manual execution required |

### 7. Shift Operations
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-SHF-01` | DEALER | No active shift open | Click 'Open Shift' with Morning template | Shift created with status OPEN; snapshot of fuel prices and tank levels taken | [ ] PENDING | Manual execution required |
| `TC-SHF-02` | DEALER | Shift is currently OPEN | Attempt to open a second simultaneous shift | Blocked with warning "An active operational shift is already OPEN for this outlet" | [ ] PENDING | Manual execution required |

### 8. Fuel Receipts & Decantation
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-RCPT-01` | DEALER | Active shift open | Record Tanker Arrival (TT number, invoice qty) | Receipt created with status ARRIVED; observed density variance evaluated | [ ] PENDING | Manual execution required |
| `TC-RCPT-02` | DEALER | Receipt in ARRIVED | Transition through VERIFIED -> DECANTED -> COMPLETED with linked dip readings | Status progresses cleanly; once COMPLETED, further edits are blocked | [ ] PENDING | Manual execution required |

### 9. Stock Operations & Reconciliation
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-STK-01` | DEALER | Active shift open | Record tank dip level (product mm & water mm) | Volume automatically calculated from monotonic calibration chart; non-negative | [ ] PENDING | Manual execution required |
| `TC-STK-02` | DEALER | Closing shift | Review physical vs book variance reconciliation | Reconciles variance cleanly; prompts for variance reason if threshold exceeded | [ ] PENDING | Manual execution required |

### 10. Financial Operations & Price Masters
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-FIN-01` | ADMIN | Logged in as Admin | Update RSP for MS at Park Street RO | New price stored in exact integer paise; effective date snapshot applied | [ ] PENDING | Manual execution required |
| `TC-FIN-02` | DEALER | Shift settlement | Enter collection breakdown (Cash, UPI, Card, Credit) | Integer paise arithmetic enforces exact balance without floating point drift | [ ] PENDING | Manual execution required |

### 11. CNG Operations
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-CNG-01` | DEALER | CNG-configured RO | Record cascade suction/discharge pressure readings | Log stored with integer milliunits; reflects in daily operational CNG summary | [ ] PENDING | Manual execution required |
| `TC-CNG-02` | DEALER | Viewing CNG | Attempt to query foreign outlet CNG data | 403 Forbidden received; UI shows clear scoped access boundary | [ ] PENDING | Manual execution required |

### 12. Lube Inventory & Sales
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-LUBE-01` | DEALER | Viewing Lube module | Create SKU and record Stock Receipt (IN) | SKU appears in catalog; current stock balance updates to reflect receipt | [ ] PENDING | Manual execution required |
| `TC-LUBE-02` | DEALER | Stock is 10 packs | Attempt outbound adjustment of 15 packs | Error 409 "Insufficient stock to fulfill outbound adjustment" displayed safely | [ ] PENDING | Manual execution required |

### 13. Equipment Breakdown Incident Management
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-EQ-01` | DEALER | Dispenser malfunction | Log equipment breakdown ticket (HIGH severity) | Ticket created in OPEN status with timestamp; event logged in incident history | [ ] PENDING | Manual execution required |
| `TC-EQ-02` | FIELD_OFFICER | Ticket in OPEN | Progress ticket: Assign -> Start -> Resolve -> Signoff | Status transitions to CLOSED with downtime seconds recorded; edits locked | [ ] PENDING | Manual execution required |

### 14. Utilities & Sub-Meters
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-UTIL-01` | ADMIN | Viewing outlet utilities | Register new electricity account & consumer number | Account created with status ACTIVE; appears in outlet utility account table | [ ] PENDING | Manual execution required |
| `TC-UTIL-02` | DEALER | Viewing bills | View monthly consumption and due bills | Financial calculations strictly in integer paise; overdue bills flagged | [ ] PENDING | Manual execution required |

### 15. Municipal Taxes & Statutory Dues
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-TAX-01` | ADMIN | Viewing statutory dues | Create property tax assessment due | Created in PENDING status with clear assessment period and due date | [ ] PENDING | Manual execution required |
| `TC-TAX-02` | ADMIN | Due is PENDING | Mark statutory due as PAID with receipt reference | Status updates to PAID; subsequent attempts to edit amount are blocked (409) | [ ] PENDING | Manual execution required |

### 16. NFR Lease & Rent
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-NFR-01` | ADMIN | Viewing NFR spaces | Create commercial space (ATM Kiosk) | Space registered with identifier and square footage; ready for lease linking | [ ] PENDING | Manual execution required |
| `TC-NFR-02` | DEALER | Viewing NFR spaces | Attempt to query unrelated outlet NFR records | Access denied with 403 Forbidden; no vendor/lease data leaked | [ ] PENDING | Manual execution required |

### 17. Organization Master Data
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-ORG-01` | ADMIN | Viewing Org Masters | Create global department (Retail Engineering) | Department added globally; available for all organizational postings | [ ] PENDING | Manual execution required |
| `TC-ORG-02` | STATE_OFFICE | Logged in as SO | Attempt to POST new global department | Blocked with 403 Forbidden; write restricted strictly to GLOBAL Admin | [ ] PENDING | Manual execution required |

### 18. Workforce & Staff Onboarding
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-HR-01` | ADMIN / DEALER | Staff management | Create designation & onboard new staff member | Staff member created with designation and masked Aadhaar (last 4 digits only) | [ ] PENDING | Manual execution required |
| `TC-HR-02` | DEALER | Viewing staff | Attempt to view staff directory of another outlet | Cross-outlet access returns 403; staff directory scoped to assigned outlet | [ ] PENDING | Manual execution required |

### 19. Attendance & Geofencing
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-ATT-01` | ADMIN | HR Settings | Configure outlet geofence policy (radius, accuracy) | Policy saved and audited; enforced on mobile staff attendance check-ins | [ ] PENDING | Manual execution required |
| `TC-ATT-02` | DEALER | Attendance view | Inspect staff attendance timeline | Check-in/check-out timestamps validated chronologically (checkOut > checkIn) | [ ] PENDING | Manual execution required |

### 20. Nozzle Assignments
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-NOZZ-01` | DEALER | Open operational shift | Assign staff member to Dispenser Nozzle | Assignment persists; nozzle marked active for staff member for that shift | [ ] PENDING | Manual execution required |
| `TC-NOZZ-02` | DEALER | Assignment view | Attempt cross-outlet staff or nozzle pairing | Mismatched combinations rejected by trigger and scope validation | [ ] PENDING | Manual execution required |

### 21. Uniform Management
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-UNI-01` | ADMIN | Uniform catalog | Create uniform item (Shirt) and size variant (L) | Item and variant saved with SKU code, reorder level, and active status | [ ] PENDING | Manual execution required |
| `TC-UNI-02` | DEALER | Stock issuance | Record uniform issue to staff member | Inventory balance decrements; issuance logged in staff uniform history | [ ] PENDING | Manual execution required |

### 22. Leave Management & Maker-Checker (Phase 5A Frozen)
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-LV-01` | DEALER | Staff member active | Requester creates leave request | Request enters PENDING status; dates reserved | [ ] PENDING | Manual execution required |
| `TC-LV-02` | DEALER | Own PENDING request | Requester attempts to approve own leave | Error `HR_MAKER_CHECKER_SELF_APPROVAL_FORBIDDEN` received; remains PENDING | [ ] PENDING | Manual execution required |
| `TC-LV-03` | DEALER | Own PENDING request | Requester attempts to reject own leave | Error `HR_MAKER_CHECKER_SELF_APPROVAL_FORBIDDEN` received; remains PENDING | [ ] PENDING | Manual execution required |
| `TC-LV-04` | FIELD_OFFICER | Leave is PENDING | Checker (FO) approves leave request | Transitions cleanly to APPROVED; decision notes recorded; audit log created | [ ] PENDING | Manual execution required |
| `TC-LV-05` | DEALER | Leave is APPROVED | Requester attempts to cancel approved leave | Blocked with 409; terminal states (APPROVED, REJECTED, CANCELLED) immutable | [ ] PENDING | Manual execution required |
| `TC-LV-06` | FIELD_OFFICER | Leave is PENDING | Non-requester attempts to cancel leave | Blocked with 403 `HR_LEAVE_CANCEL_NOT_REQUESTER`; remains PENDING | [ ] PENDING | Manual execution required |

### 23. Document Vault & Security
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-DOC-01` | DEALER | Documents view | Upload valid PDF compliance document for RO-1001 | File magic bytes verified (`%PDF-`); stored in R2 with D1 metadata reference | [ ] PENDING | Manual execution required |
| `TC-DOC-02` | DEALER | Upload dialog | Attempt to attach document to foreign outlet | Blocked with 403 Forbidden; cross-outlet document association prevented | [ ] PENDING | Manual execution required |

### 24. Audit Trail
| Test ID | Persona | Precondition | Action | Expected Result | PASS / FAIL | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-AUD-01` | ADMIN | Logged in as Admin | Open Audit Logs viewer | Displays chronological audit log with actor ID, action type, entity, timestamp | [ ] PENDING | Manual execution required |

---

## Responsive & Frontend UI Quality Checklist

| UI Inspection Item | Viewport / Context | Acceptance Criteria | Status |
| :--- | :--- | :--- | :--- |
| **Desktop Layout** | 1440px+ | Side navigation bar intact; tables fit comfortably without horizontal clipping | Manual execution required |
| **Tablet Layout** | 768px – 1024px | Collapsible sidebar drawer; cards re-wrap to 2 columns smoothly | Manual execution required |
| **Mobile Layout** | 375px – 430px | Hamburger menu; single column metric cards; touch targets >= 44px | Manual execution required |
| **Navigation & Routing** | All devices | Active route highlight; breadcrumb hierarchy reflects depth | Manual execution required |
| **Modal Open / Close** | All devices | Backdrop dismiss, Escape key dismiss, focus trap inside dialogs | Manual execution required |
| **Forms & Input Controls** | All devices | Label association, required indicator, inline validation error text | Manual execution required |
| **Validation Messages** | All devices | Human-readable error summaries; no raw schema dump or stack trace | Manual execution required |
| **Data Tables** | All devices | Column headers legible; responsive card-stack on narrow screens | Manual execution required |
| **Horizontal Overflow** | All devices | Zero unwanted horizontal page scrollbars; body container clipped cleanly | Manual execution required |
| **Loading States** | All devices | Skeleton loaders or subtle spinners during API network fetches | Manual execution required |
| **Empty States** | All devices | Helpful empty state illustrations/prompts when lists have 0 items | Manual execution required |
| **Error States** | All devices | User-friendly retry options if API returns transient 500/network error | Manual execution required |
| **Button States** | All devices | Button disabled during in-flight async actions; spinner indicator | Manual execution required |
| **Confirmation Dialogs** | All devices | Destructive actions (e.g. shift close, leave reject) prompt confirmation | Manual execution required |
| **Long Text & Names** | All devices | Ellipsis / wrap handling for long employee names and addresses | Manual execution required |
| **Date Inputs** | All devices | ISO-8601 formatting (YYYY-MM-DD); min/max date range guards | Manual execution required |
| **Currency & Paise** | All devices | Standard Indian numbering format (`₹ XX,XX,XXX.XX`); 2 decimal places | Manual execution required |
| **Mobile Touch Targets** | Mobile (<= 430px) | All interactive buttons, chips, and selects have >= 44px hit areas | Manual execution required |

---

## Deferred / Future Enhancements

The following items are identified for future product iterations beyond the current release freeze. None of these items represent blocking defects against the existing contracts:

1. **Biometric Hardware Direct WebUSB/WebHID Integration**: Support for physical optical fingerprint scanners directly connected via USB for automated staff check-in (currently handled via secure geofenced mobile check-in with GPS radius verification).
2. **Real-time Tank Radar Gauge ATG Serial Feed**: Automated real-time dip telemetry streaming over RS-485 serial-to-edge daemon (currently supported via calibrated manual and ATG dip entry forms).
3. **Automated Fuel Bowser GPS Tracking**: Real-time vehicle telematics telemetry for mobile refuelling bowsers.
4. **Multi-Language Regional UI (Hindi, Bengali, Punjabi)**: Localization of frontend UI strings into regional Indian languages (currently standardized on English with Indian Rupee formatting).
5. **Bulk CSV Roster Import Wizard**: Spreadsheet batch upload for monthly staff roster assignments across multi-outlet dealer clusters.
