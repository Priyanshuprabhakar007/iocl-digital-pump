PRAGMA foreign_keys = OFF;

-- 4. Update Existing Foreign Key References to Point to Global Masters

-- 4A. Update hr_staff designation references via explicit legacy ID mapping
UPDATE "hr_staff"
SET "designation_id" = CASE "designation_id"
    WHEN 'desig-54163d40-b7ab-4e62-accd-4350f1f8cf11' THEN 'gdesig-coco-manager'
    WHEN 'desig-5b5ec560-d9f0-452b-a46c-f2bcfb5ff840' THEN 'gdesig-coco-manager'
    WHEN 'desig-19d0f3f8-ba1e-4746-80c0-9657d45bd5ab' THEN 'gdesig-pump-manager'
    WHEN 'desig-deb087be-1961-4a77-babd-2fee3c889c69' THEN 'gdesig-forecourt-shift-supervisor'
    WHEN 'desig-b3aee108-20d3-40b7-ad2d-1750abf0ee13' THEN 'gdesig-shift-supervisor'
    WHEN 'desig-85b89423-f6b0-4e96-859f-c9082440a332' THEN 'gdesig-cashier'
    WHEN 'desig-cad800e2-a71f-4327-bd4a-84d362833cf0' THEN 'gdesig-cashier'
    WHEN 'desig-b3fe3aa3-4b1c-4c4a-9711-66ab2ae2ec45' THEN 'gdesig-accountant'
    WHEN 'desig-246089cb-4253-49a2-896a-6b4dfbcb104f' THEN 'gdesig-accountant'
    WHEN 'desig-7b7fd190-84e1-46d1-9d44-9c83e30146a2' THEN 'gdesig-customer-attendant'
    WHEN 'desig-82b4a909-aabd-4b80-84a4-2119f3b8f8f8' THEN 'gdesig-customer-attendant'
    WHEN 'desig-a13b3799-ec57-4757-b3c1-c26b8d677eb3' THEN 'gdesig-air-tower-customer-attendant'
    WHEN 'desig-c18ae4a5-7b8f-45a7-b50b-51fbbdb3b54d' THEN 'gdesig-housekeeping'
    WHEN 'desig-e2411a12-3084-48f4-b8d4-39f37626a59d' THEN 'gdesig-security-marshal'
    ELSE "designation_id"
END
WHERE "designation_id" IN (
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
);

-- 4B. Update hr_manpower_sanctions designation references via explicit legacy ID mapping
UPDATE "hr_manpower_sanctions"
SET "designation_id" = CASE "designation_id"
    WHEN 'desig-54163d40-b7ab-4e62-accd-4350f1f8cf11' THEN 'gdesig-coco-manager'
    WHEN 'desig-5b5ec560-d9f0-452b-a46c-f2bcfb5ff840' THEN 'gdesig-coco-manager'
    WHEN 'desig-19d0f3f8-ba1e-4746-80c0-9657d45bd5ab' THEN 'gdesig-pump-manager'
    WHEN 'desig-deb087be-1961-4a77-babd-2fee3c889c69' THEN 'gdesig-forecourt-shift-supervisor'
    WHEN 'desig-b3aee108-20d3-40b7-ad2d-1750abf0ee13' THEN 'gdesig-shift-supervisor'
    WHEN 'desig-85b89423-f6b0-4e96-859f-c9082440a332' THEN 'gdesig-cashier'
    WHEN 'desig-cad800e2-a71f-4327-bd4a-84d362833cf0' THEN 'gdesig-cashier'
    WHEN 'desig-b3fe3aa3-4b1c-4c4a-9711-66ab2ae2ec45' THEN 'gdesig-accountant'
    WHEN 'desig-246089cb-4253-49a2-896a-6b4dfbcb104f' THEN 'gdesig-accountant'
    WHEN 'desig-7b7fd190-84e1-46d1-9d44-9c83e30146a2' THEN 'gdesig-customer-attendant'
    WHEN 'desig-82b4a909-aabd-4b80-84a4-2119f3b8f8f8' THEN 'gdesig-customer-attendant'
    WHEN 'desig-a13b3799-ec57-4757-b3c1-c26b8d677eb3' THEN 'gdesig-air-tower-customer-attendant'
    WHEN 'desig-c18ae4a5-7b8f-45a7-b50b-51fbbdb3b54d' THEN 'gdesig-housekeeping'
    WHEN 'desig-e2411a12-3084-48f4-b8d4-39f37626a59d' THEN 'gdesig-security-marshal'
    ELSE "designation_id"
END
WHERE "designation_id" IN (
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
);

UPDATE "operational_shifts"
SET "shift_template_id" = (
    SELECT g.id
    FROM "global_shift_templates" g
    JOIN "shift_templates" old ON UPPER(TRIM(old.code)) = UPPER(TRIM(g.code))
    WHERE old.id = "operational_shifts"."shift_template_id"
)
WHERE EXISTS (
    SELECT 1
    FROM "global_shift_templates" g
    JOIN "shift_templates" old ON UPPER(TRIM(old.code)) = UPPER(TRIM(g.code))
    WHERE old.id = "operational_shifts"."shift_template_id"
);

UPDATE "hr_roster_assignments"
SET "shift_template_id" = (
    SELECT g.id
    FROM "global_shift_templates" g
    JOIN "shift_templates" old ON UPPER(TRIM(old.code)) = UPPER(TRIM(g.code))
    WHERE old.id = "hr_roster_assignments"."shift_template_id"
)
WHERE EXISTS (
    SELECT 1
    FROM "global_shift_templates" g
    JOIN "shift_templates" old ON UPPER(TRIM(old.code)) = UPPER(TRIM(g.code))
    WHERE old.id = "hr_roster_assignments"."shift_template_id"
);

UPDATE "hr_attendance_records"
SET "shift_template_id" = (
    SELECT g.id
    FROM "global_shift_templates" g
    JOIN "shift_templates" old ON UPPER(TRIM(old.code)) = UPPER(TRIM(g.code))
    WHERE old.id = "hr_attendance_records"."shift_template_id"
)
WHERE EXISTS (
    SELECT 1
    FROM "global_shift_templates" g
    JOIN "shift_templates" old ON UPPER(TRIM(old.code)) = UPPER(TRIM(g.code))
    WHERE old.id = "hr_attendance_records"."shift_template_id"
);

UPDATE "hr_nozzle_assignments"
SET "shift_template_id" = (
    SELECT g.id
    FROM "global_shift_templates" g
    JOIN "shift_templates" old ON UPPER(TRIM(old.code)) = UPPER(TRIM(g.code))
    WHERE old.id = "hr_nozzle_assignments"."shift_template_id"
)
WHERE EXISTS (
    SELECT 1
    FROM "global_shift_templates" g
    JOIN "shift_templates" old ON UPPER(TRIM(old.code)) = UPPER(TRIM(g.code))
    WHERE old.id = "hr_nozzle_assignments"."shift_template_id"
);
