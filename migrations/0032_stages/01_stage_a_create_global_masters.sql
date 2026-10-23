PRAGMA foreign_keys = OFF;

-- Drop legacy triggers to allow updating references to global masters during migration
DROP TRIGGER IF EXISTS "trg_hr_staff_insert_integrity";
DROP TRIGGER IF EXISTS "trg_hr_staff_update_integrity";
DROP TRIGGER IF EXISTS "trg_hr_staff_identity_immutable";
DROP TRIGGER IF EXISTS "trg_hr_manpower_insert_integrity";
DROP TRIGGER IF EXISTS "trg_hr_manpower_identity_immutable";
DROP TRIGGER IF EXISTS "trg_hr_roster_insert_integrity";
DROP TRIGGER IF EXISTS "trg_hr_roster_update_integrity";
DROP TRIGGER IF EXISTS "trg_hr_roster_identity_immutable";
DROP TRIGGER IF EXISTS "trg_hr_attendance_records_cross_ref_insert";
DROP TRIGGER IF EXISTS "trg_hr_attendance_records_identity_immutable";
DROP TRIGGER IF EXISTS "trg_hr_nozzle_assignments_cross_ref_insert";
DROP TRIGGER IF EXISTS "trg_hr_nozzle_assignments_identity_immutable";

-- 1. Create Global HR Designations Master Table
CREATE TABLE IF NOT EXISTS "global_hr_designations" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"skill_category" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CHECK (status IN ('ACTIVE', 'INACTIVE')),
	CHECK (trim(code) <> ''),
	CHECK (trim(name) <> ''),
	CHECK (skill_category IS NULL OR skill_category IN ('HIGHLY_SKILLED', 'SKILLED', 'SEMI_SKILLED', 'UNSKILLED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_global_hr_designations_code" ON "global_hr_designations" ("code");
CREATE INDEX IF NOT EXISTS "idx_global_hr_designations_status" ON "global_hr_designations" ("status");
CREATE INDEX IF NOT EXISTS "idx_global_hr_designations_skill_category" ON "global_hr_designations" ("skill_category");

CREATE TRIGGER IF NOT EXISTS "trg_global_hr_designations_delete_forbidden"
BEFORE DELETE ON "global_hr_designations"
BEGIN
    SELECT RAISE(ABORT, 'GLOBAL_HR_DESIGNATION_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS "trg_global_hr_designations_code_immutable"
BEFORE UPDATE ON "global_hr_designations"
BEGIN
    SELECT
        CASE
            WHEN OLD.code IS NOT NEW.code
            THEN RAISE(ABORT, 'GLOBAL_HR_DESIGNATION_CODE_IMMUTABLE')
        END;
END;

-- 2. Create Global Shift Templates Master Table
CREATE TABLE IF NOT EXISTS "global_shift_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"sequence" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CHECK (status IN ('ACTIVE', 'INACTIVE')),
	CHECK (trim(code) <> ''),
	CHECK (trim(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_global_shift_templates_code" ON "global_shift_templates" ("code");
CREATE INDEX IF NOT EXISTS "idx_global_shift_templates_status" ON "global_shift_templates" ("status");
CREATE INDEX IF NOT EXISTS "idx_global_shift_templates_sequence" ON "global_shift_templates" ("sequence");

CREATE TRIGGER IF NOT EXISTS "trg_global_shift_templates_delete_forbidden"
BEFORE DELETE ON "global_shift_templates"
BEGIN
    SELECT RAISE(ABORT, 'GLOBAL_SHIFT_TEMPLATE_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS "trg_global_shift_templates_code_immutable"
BEFORE UPDATE ON "global_shift_templates"
BEGIN
    SELECT
        CASE
            WHEN OLD.code IS NOT NEW.code
            THEN RAISE(ABORT, 'GLOBAL_SHIFT_TEMPLATE_CODE_IMMUTABLE')
        END;
END;
