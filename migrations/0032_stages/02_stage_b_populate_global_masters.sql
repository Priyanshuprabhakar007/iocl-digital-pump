PRAGMA foreign_keys = OFF;

-- 3. Populate Global Masters from Existing Outlet-Scoped Masters
-- Ensure default system user exists for foreign key validity
INSERT OR IGNORE INTO "users" (
    "id", "emp_code", "name", "email", "phone", "password_hash", "status", "created_at", "updated_at"
) VALUES (
    'usr-admin', 'EMP000', 'System Administrator', 'system@iocl.in', '0000000000', 'system', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
);

-- 3. Populate Canonical Global HR Designations Master
INSERT OR IGNORE INTO "global_hr_designations" (
    "id", "code", "name", "skill_category", "status", "notes", "created_by", "created_at", "updated_at"
) VALUES
    ('gdesig-coco-manager', 'COCO_MANAGER', 'COCO Manager', 'SKILLED', 'ACTIVE', 'Canonical COCO Manager master role', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('gdesig-pump-manager', 'PUMP_MANAGER', 'Pump Manager', 'SKILLED', 'ACTIVE', 'Canonical Pump Manager master role', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('gdesig-forecourt-shift-supervisor', 'FORECOURT_SHIFT_SUPERVISOR', 'Forecourt Shift Supervisor', 'SKILLED', 'ACTIVE', 'Canonical Forecourt Shift Supervisor master role', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('gdesig-shift-supervisor', 'SHIFT_SUPERVISOR', 'Shift Supervisor', 'SKILLED', 'ACTIVE', 'Canonical Shift Supervisor master role', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('gdesig-cashier', 'CASHIER', 'Cashier', 'SKILLED', 'ACTIVE', 'Canonical Cashier master role', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('gdesig-accountant', 'ACCOUNTANT', 'Accountant', 'SKILLED', 'ACTIVE', 'Canonical Accountant master role', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('gdesig-customer-attendant', 'CUSTOMER_ATTENDANT', 'Customer Attendant', 'SEMI_SKILLED', 'ACTIVE', 'Canonical Customer Attendant master role', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('gdesig-air-tower-customer-attendant', 'AIR_TOWER_CUSTOMER_ATTENDANT', 'Air Tower Customer Attendant', 'UNSKILLED', 'ACTIVE', 'Canonical Air Tower Customer Attendant master role', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('gdesig-housekeeping', 'HOUSEKEEPING', 'House Keeping', 'UNSKILLED', 'ACTIVE', 'Canonical House Keeping master role', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('gdesig-security-marshal', 'SECURITY_MARSHAL', 'Security / Marshal', 'UNSKILLED', 'ACTIVE', 'Canonical Security / Marshal master role', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

INSERT OR IGNORE INTO "global_shift_templates" (
    "id", "code", "name", "start_time", "end_time", "sequence", "status", "created_by", "created_at", "updated_at"
)
SELECT
    MIN("id"),
    "code",
    "name",
    "start_time",
    "end_time",
    "sequence",
    "status",
    "created_by",
    "created_at",
    "updated_at"
FROM "shift_templates"
GROUP BY UPPER(TRIM("code"));

