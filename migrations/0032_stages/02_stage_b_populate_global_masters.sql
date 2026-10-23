PRAGMA foreign_keys = OFF;

-- 3. Populate Global Masters from Existing Outlet-Scoped Masters
-- 3A. Populate Canonical Global HR Designations Master
INSERT OR IGNORE INTO "global_hr_designations" (
    "id", "code", "name", "skill_category", "status", "notes", "created_by", "created_at", "updated_at"
) VALUES
    ('gdesig-coco-manager', 'COCO_MANAGER', 'COCO Manager', 'SKILLED', 'ACTIVE', 'Canonical COCO Manager master role', COALESCE((SELECT id FROM users LIMIT 1), 'user-admin'), '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('gdesig-pump-manager', 'PUMP_MANAGER', 'Pump Manager', 'SKILLED', 'ACTIVE', 'Canonical Pump Manager master role', COALESCE((SELECT id FROM users LIMIT 1), 'user-admin'), '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('gdesig-forecourt-shift-supervisor', 'FORECOURT_SHIFT_SUPERVISOR', 'Forecourt Shift Supervisor', 'SKILLED', 'ACTIVE', 'Canonical Forecourt Shift Supervisor master role', COALESCE((SELECT id FROM users LIMIT 1), 'user-admin'), '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('gdesig-shift-supervisor', 'SHIFT_SUPERVISOR', 'Shift Supervisor', 'SKILLED', 'ACTIVE', 'Canonical Shift Supervisor master role', COALESCE((SELECT id FROM users LIMIT 1), 'user-admin'), '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('gdesig-cashier', 'CASHIER', 'Cashier', 'SKILLED', 'ACTIVE', 'Canonical Cashier master role', COALESCE((SELECT id FROM users LIMIT 1), 'user-admin'), '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('gdesig-accountant', 'ACCOUNTANT', 'Accountant', 'SKILLED', 'ACTIVE', 'Canonical Accountant master role', COALESCE((SELECT id FROM users LIMIT 1), 'user-admin'), '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('gdesig-customer-attendant', 'CUSTOMER_ATTENDANT', 'Customer Attendant', 'SEMI_SKILLED', 'ACTIVE', 'Canonical Customer Attendant master role', COALESCE((SELECT id FROM users LIMIT 1), 'user-admin'), '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('gdesig-air-tower-customer-attendant', 'AIR_TOWER_CUSTOMER_ATTENDANT', 'Air Tower Customer Attendant', 'UNSKILLED', 'ACTIVE', 'Canonical Air Tower Customer Attendant master role', COALESCE((SELECT id FROM users LIMIT 1), 'user-admin'), '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('gdesig-housekeeping', 'HOUSEKEEPING', 'House Keeping', 'UNSKILLED', 'ACTIVE', 'Canonical House Keeping master role', COALESCE((SELECT id FROM users LIMIT 1), 'user-admin'), '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('gdesig-security-marshal', 'SECURITY_MARSHAL', 'Security / Marshal', 'UNSKILLED', 'ACTIVE', 'Canonical Security / Marshal master role', COALESCE((SELECT id FROM users LIMIT 1), 'user-admin'), '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

-- 3B. Safe local/test fallback for arbitrary test fixture legacy designations
INSERT OR IGNORE INTO "global_hr_designations" (
    "id", "code", "name", "skill_category", "status", "notes", "created_by", "created_at", "updated_at"
)
SELECT
    "id",
    UPPER(TRIM("code")),
    "name",
    "skill_category",
    "status",
    "notes",
    "created_by",
    "created_at",
    "updated_at"
FROM "hr_designations"
WHERE "id" NOT IN (
    'desig-54163d40-b7ab-4e62-accd-4350f1f8cf11',
    'desig-5b5ec560-d9f0-452b-a46c-f2bcfb5ff840',
    'desig-19d0f3f8-ba1e-4746-80c0-9657d45bd5ab',
    'desig-deb087be-1961-4a77-babd-2fee3c889c69',
    'desig-b3aee108-20d3-40b7-ad2d-1750abf0ee13',
    'desig-85b89423-f6b0-4e96-859f-c9082440a332',
    'desig-cad800e2-a71f-4327-bd4a-84d362833cf0',
    'desig-b3fe3aa3-4b1c-4c4a-9711-66ab2ae2ec45',
    'desig-246089cb-4253-49a2-896a-6b4dfbcb104f',
    'desig-7b7fd190-84e1-46d1-9d44-9c83e30146a2',
    'desig-82b4a909-aabd-4b80-84a4-2119f3b8f8f8',
    'desig-a13b3799-ec57-4757-b3c1-c26b8d677eb3',
    'desig-c18ae4a5-7b8f-45a7-b50b-51fbbdb3b54d',
    'desig-e2411a12-3084-48f4-b8d4-39f37626a59d'
) AND "id" NOT LIKE 'gdesig-%';

-- 3C. Populate Global Shift Templates Master
INSERT OR IGNORE INTO "global_shift_templates" (
    "id", "code", "name", "start_time", "end_time", "sequence", "status", "created_by", "created_at", "updated_at"
)
SELECT
    MIN("id"),
    UPPER(TRIM("code")),
    CASE UPPER(TRIM("code"))
        WHEN 'SHIFT_1' THEN 'Shift 1 (Morning)'
        WHEN 'SHIFT_2' THEN 'Shift 2 (Evening)'
        WHEN 'SHIFT_3' THEN 'Shift 3 (Night Overnight)'
        ELSE "name"
    END,
    "start_time",
    "end_time",
    "sequence",
    "status",
    "created_by",
    "created_at",
    "updated_at"
FROM "shift_templates"
GROUP BY UPPER(TRIM("code"));


