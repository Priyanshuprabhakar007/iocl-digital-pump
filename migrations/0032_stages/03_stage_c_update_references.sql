PRAGMA foreign_keys = OFF;

-- 4. Update Existing Foreign Key References to Point to Global Masters
UPDATE "hr_staff"
SET "designation_id" = (
    SELECT g.id
    FROM "global_hr_designations" g
    JOIN "hr_designations" old ON UPPER(TRIM(old.code)) = UPPER(TRIM(g.code))
    WHERE old.id = "hr_staff"."designation_id"
)
WHERE EXISTS (
    SELECT 1
    FROM "global_hr_designations" g
    JOIN "hr_designations" old ON UPPER(TRIM(old.code)) = UPPER(TRIM(g.code))
    WHERE old.id = "hr_staff"."designation_id"
);

UPDATE "hr_manpower_sanctions"
SET "designation_id" = (
    SELECT g.id
    FROM "global_hr_designations" g
    JOIN "hr_designations" old ON UPPER(TRIM(old.code)) = UPPER(TRIM(g.code))
    WHERE old.id = "hr_manpower_sanctions"."designation_id"
)
WHERE EXISTS (
    SELECT 1
    FROM "global_hr_designations" g
    JOIN "hr_designations" old ON UPPER(TRIM(old.code)) = UPPER(TRIM(g.code))
    WHERE old.id = "hr_manpower_sanctions"."designation_id"
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
