-- =============================================================================
-- Migration 0032: Platform-Wide Global Designation Master & Global Shift Master
-- =============================================================================
-- Consolidates outlet-scoped hr_designations and shift_templates into central,
-- reusable global tables (global_hr_designations and global_shift_templates).
-- Existing production records are NEVER deleted or overwritten.

PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;

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
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
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
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
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

-- 3. Populate Global Masters from Existing Outlet-Scoped Masters
INSERT OR IGNORE INTO "global_hr_designations" (
    "id", "code", "name", "skill_category", "status", "notes", "created_by", "created_at", "updated_at"
)
SELECT
    MIN("id"),
    "code",
    "name",
    "skill_category",
    "status",
    "notes",
    "created_by",
    "created_at",
    "updated_at"
FROM "hr_designations"
GROUP BY UPPER(TRIM("code"));

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

-- 5. Rebuild Tables to Support Global Master References

-- 5A. Rebuild operational_shifts
CREATE TABLE "operational_shifts_rebuild" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "outlet_id" TEXT NOT NULL,
  "shift_template_id" TEXT NOT NULL,
  "business_date" TEXT NOT NULL,
  "started_at" TEXT NOT NULL,
  "closed_at" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "opened_by_user_id" TEXT NOT NULL,
  "closed_by_user_id" TEXT,
  "notes" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  UNIQUE ("outlet_id", "shift_template_id", "business_date"),
  FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("opened_by_user_id") REFERENCES "users" ("id"),
  FOREIGN KEY ("closed_by_user_id") REFERENCES "users" ("id"),
  CHECK ("status" IN ('OPEN', 'CLOSING', 'CLOSED', 'LOCKED'))
);

INSERT INTO "operational_shifts_rebuild" SELECT * FROM "operational_shifts";
DROP TABLE "operational_shifts";
ALTER TABLE "operational_shifts_rebuild" RENAME TO "operational_shifts";

CREATE INDEX IF NOT EXISTS "idx_op_shifts_outlet_id" ON "operational_shifts" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_op_shifts_business_date" ON "operational_shifts" ("business_date");
CREATE INDEX IF NOT EXISTS "idx_op_shifts_status" ON "operational_shifts" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_operational_shifts_single_active" ON "operational_shifts" ("outlet_id") WHERE "status" IN ('OPEN', 'CLOSING');

-- 5B. Rebuild hr_staff
CREATE TABLE "hr_staff_rebuild" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"employee_code" text NOT NULL,
	"full_name" text NOT NULL,
	"designation_id" text NOT NULL,
	"aadhaar_last4" text NOT NULL,
	"aadhaar_document_id" text,
	"photo_document_id" text,
	"emergency_contact_name" text NOT NULL,
	"emergency_contact_phone" text NOT NULL,
	"joining_date" text NOT NULL,
	"employment_status" text DEFAULT 'ACTIVE' NOT NULL,
	"exit_date" text,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("aadhaar_document_id") REFERENCES "documents"("id") ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY ("photo_document_id") REFERENCES "documents"("id") ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
    CHECK (employment_status IN ('ACTIVE', 'INACTIVE', 'EXITED')),
    CHECK (trim(employee_code) <> ''),
    CHECK (trim(full_name) <> ''),
    CHECK (aadhaar_last4 GLOB '[0-9][0-9][0-9][0-9]'),
    CHECK (trim(emergency_contact_name) <> ''),
    CHECK (trim(emergency_contact_phone) <> ''),
    CHECK (joining_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    CHECK ((employment_status = 'EXITED' AND exit_date IS NOT NULL AND exit_date >= joining_date AND exit_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]') OR (employment_status IN ('ACTIVE', 'INACTIVE') AND exit_date IS NULL))
);

INSERT INTO "hr_staff_rebuild" SELECT * FROM "hr_staff";
DROP TABLE "hr_staff";
ALTER TABLE "hr_staff_rebuild" RENAME TO "hr_staff";

CREATE UNIQUE INDEX IF NOT EXISTS "idx_hr_staff_outlet_employee_code" ON "hr_staff" ("outlet_id", "employee_code");
CREATE INDEX IF NOT EXISTS "idx_hr_staff_outlet_id" ON "hr_staff" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_hr_staff_outlet_status" ON "hr_staff" ("outlet_id", "employment_status");
CREATE INDEX IF NOT EXISTS "idx_hr_staff_designation_id" ON "hr_staff" ("designation_id");

-- 5C. Rebuild hr_manpower_sanctions
CREATE TABLE "hr_manpower_sanctions_rebuild" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"designation_id" text NOT NULL,
	"sanctioned_count" integer NOT NULL,
	"effective_from" text NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
    CHECK (sanctioned_count >= 0 AND sanctioned_count <= 10000),
    CHECK (effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);

INSERT INTO "hr_manpower_sanctions_rebuild" SELECT * FROM "hr_manpower_sanctions";
DROP TABLE "hr_manpower_sanctions";
ALTER TABLE "hr_manpower_sanctions_rebuild" RENAME TO "hr_manpower_sanctions";

CREATE UNIQUE INDEX IF NOT EXISTS "idx_hr_manpower_outlet_designation" ON "hr_manpower_sanctions" ("outlet_id", "designation_id");
CREATE INDEX IF NOT EXISTS "idx_hr_manpower_outlet_id" ON "hr_manpower_sanctions" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_hr_manpower_designation_id" ON "hr_manpower_sanctions" ("designation_id");

-- 5D. Rebuild hr_roster_assignments
CREATE TABLE "hr_roster_assignments_rebuild" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"staff_id" text NOT NULL,
	"roster_date" text NOT NULL,
	"shift_template_id" text NOT NULL,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("staff_id") REFERENCES "hr_staff"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
    CHECK (status IN ('SCHEDULED', 'CANCELLED')),
    CHECK (roster_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);

INSERT INTO "hr_roster_assignments_rebuild" SELECT * FROM "hr_roster_assignments";
DROP TABLE "hr_roster_assignments";
ALTER TABLE "hr_roster_assignments_rebuild" RENAME TO "hr_roster_assignments";

CREATE UNIQUE INDEX IF NOT EXISTS "idx_hr_roster_staff_date" ON "hr_roster_assignments" ("staff_id", "roster_date");
CREATE INDEX IF NOT EXISTS "idx_hr_roster_outlet_id" ON "hr_roster_assignments" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_hr_roster_outlet_date" ON "hr_roster_assignments" ("outlet_id", "roster_date");
CREATE INDEX IF NOT EXISTS "idx_hr_roster_shift" ON "hr_roster_assignments" ("outlet_id", "shift_template_id");

-- 5E. Rebuild hr_attendance_records
CREATE TABLE "hr_attendance_records_rebuild" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"staff_id" text NOT NULL,
	"roster_assignment_id" text NOT NULL,
	"attendance_date" text NOT NULL,
	"shift_template_id" text NOT NULL,
	"check_in_at" text NOT NULL,
	"check_in_latitude" real NOT NULL,
	"check_in_longitude" real NOT NULL,
	"check_in_accuracy_metres" real NOT NULL,
	"check_in_distance_metres" real NOT NULL,
	"check_in_inside_geofence" integer NOT NULL,
	"check_out_at" text,
	"check_out_latitude" real,
	"check_out_longitude" real,
	"check_out_accuracy_metres" real,
	"check_out_distance_metres" real,
	"check_out_inside_geofence" integer,
	"status" text DEFAULT 'CHECKED_IN' NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("staff_id") REFERENCES "hr_staff"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("roster_assignment_id") REFERENCES "hr_roster_assignments"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	CHECK (status IN ('CHECKED_IN', 'CHECKED_OUT', 'CANCELLED')),
	CHECK (check_in_inside_geofence IN (0, 1)),
	CHECK (check_out_inside_geofence IS NULL OR check_out_inside_geofence IN (0, 1)),
	CHECK (attendance_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CHECK (check_in_latitude BETWEEN -90 AND 90),
	CHECK (check_in_longitude BETWEEN -180 AND 180),
	CHECK (check_in_accuracy_metres >= 0),
	CHECK (check_out_latitude IS NULL OR (check_out_latitude BETWEEN -90 AND 90)),
	CHECK (check_out_longitude IS NULL OR (check_out_longitude BETWEEN -180 AND 180)),
	CHECK (check_out_accuracy_metres IS NULL OR check_out_accuracy_metres >= 0)
);

INSERT INTO "hr_attendance_records_rebuild" SELECT * FROM "hr_attendance_records";
DROP TABLE "hr_attendance_records";
ALTER TABLE "hr_attendance_records_rebuild" RENAME TO "hr_attendance_records";

CREATE INDEX IF NOT EXISTS "idx_hr_attendance_outlet_date" ON "hr_attendance_records" ("outlet_id", "attendance_date");
CREATE INDEX IF NOT EXISTS "idx_hr_attendance_staff_date" ON "hr_attendance_records" ("staff_id", "attendance_date");
CREATE INDEX IF NOT EXISTS "idx_hr_attendance_outlet_status" ON "hr_attendance_records" ("outlet_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_hr_attendance_active_roster" ON "hr_attendance_records" ("roster_assignment_id") WHERE status != 'CANCELLED';

-- 5F. Rebuild hr_nozzle_assignments
CREATE TABLE "hr_nozzle_assignments_rebuild" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"roster_assignment_id" text NOT NULL,
	"staff_id" text NOT NULL,
	"nozzle_id" text NOT NULL,
	"assignment_date" text NOT NULL,
	"shift_template_id" text NOT NULL,
	"status" text DEFAULT 'ASSIGNED' NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("roster_assignment_id") REFERENCES "hr_roster_assignments"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("staff_id") REFERENCES "hr_staff"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("nozzle_id") REFERENCES "nozzles"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	CHECK (status IN ('ASSIGNED', 'CANCELLED')),
	CHECK (assignment_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);

INSERT INTO "hr_nozzle_assignments_rebuild" SELECT * FROM "hr_nozzle_assignments";
DROP TABLE "hr_nozzle_assignments";
ALTER TABLE "hr_nozzle_assignments_rebuild" RENAME TO "hr_nozzle_assignments";

CREATE UNIQUE INDEX IF NOT EXISTS "idx_hr_nozzle_active_assignment" ON "hr_nozzle_assignments" ("nozzle_id", "assignment_date", "shift_template_id") WHERE status != 'CANCELLED';
CREATE INDEX IF NOT EXISTS "idx_hr_nozzle_outlet_date" ON "hr_nozzle_assignments" ("outlet_id", "assignment_date");
CREATE INDEX IF NOT EXISTS "idx_hr_nozzle_staff_date" ON "hr_nozzle_assignments" ("staff_id", "assignment_date");
CREATE INDEX IF NOT EXISTS "idx_hr_nozzle_outlet_status" ON "hr_nozzle_assignments" ("outlet_id", "status");

-- 6. Recreate Integrity Triggers Validating Against Global Masters & Legacy Records

-- 6A. Triggers on hr_staff
CREATE TRIGGER IF NOT EXISTS "trg_hr_staff_delete_forbidden"
BEFORE DELETE ON "hr_staff"
BEGIN
    SELECT RAISE(ABORT, 'HR_STAFF_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_staff_identity_immutable"
BEFORE UPDATE ON "hr_staff"
BEGIN
    SELECT
        CASE
            WHEN (OLD.outlet_id IS NOT NEW.outlet_id) OR
                 (OLD.employee_code IS NOT NEW.employee_code) OR
                 (OLD.created_by IS NOT NEW.created_by) OR
                 (OLD.created_at IS NOT NEW.created_at)
            THEN RAISE(ABORT, 'HR_STAFF_IDENTITY_IMMUTABLE')
        END;
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_staff_insert_integrity"
BEFORE INSERT ON "hr_staff"
BEGIN
    SELECT
        CASE
            WHEN NOT EXISTS (
                SELECT 1 FROM "global_hr_designations" WHERE "id" = NEW.designation_id
            ) AND NOT EXISTS (
                SELECT 1 FROM "hr_designations" WHERE "id" = NEW.designation_id
            ) THEN RAISE(ABORT, 'HR_DESIGNATION_NOT_FOUND')
            WHEN EXISTS (
                SELECT 1 FROM "hr_designations" WHERE "id" = NEW.designation_id AND "outlet_id" IS NOT NULL AND "outlet_id" != NEW.outlet_id
            ) THEN RAISE(ABORT, 'HR_STAFF_DESIGNATION_OUTLET_MISMATCH')
            WHEN NOT EXISTS (
                SELECT 1 FROM "global_hr_designations" WHERE "id" = NEW.designation_id AND "status" = 'ACTIVE'
            ) AND NOT EXISTS (
                SELECT 1 FROM "hr_designations" WHERE "id" = NEW.designation_id AND "status" = 'ACTIVE'
            ) THEN RAISE(ABORT, 'HR_DESIGNATION_NOT_ACTIVE')
            WHEN NEW.aadhaar_document_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM "documents" WHERE "id" = NEW.aadhaar_document_id
            ) THEN RAISE(ABORT, 'HR_AADHAAR_DOCUMENT_NOT_FOUND')
            WHEN NEW.aadhaar_document_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM "documents" WHERE "id" = NEW.aadhaar_document_id AND "outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'HR_AADHAAR_DOCUMENT_OUTLET_MISMATCH')
            WHEN NEW.photo_document_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM "documents" WHERE "id" = NEW.photo_document_id
            ) THEN RAISE(ABORT, 'HR_PHOTO_DOCUMENT_NOT_FOUND')
            WHEN NEW.photo_document_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM "documents" WHERE "id" = NEW.photo_document_id AND "outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'HR_PHOTO_DOCUMENT_OUTLET_MISMATCH')
        END;
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_staff_update_integrity"
BEFORE UPDATE ON "hr_staff"
BEGIN
    SELECT
        CASE
            WHEN (NEW.designation_id IS NOT OLD.designation_id) AND NOT EXISTS (
                SELECT 1 FROM "global_hr_designations" WHERE "id" = NEW.designation_id
            ) AND NOT EXISTS (
                SELECT 1 FROM "hr_designations" WHERE "id" = NEW.designation_id
            ) THEN RAISE(ABORT, 'HR_DESIGNATION_NOT_FOUND')
            WHEN (NEW.designation_id IS NOT OLD.designation_id) AND EXISTS (
                SELECT 1 FROM "hr_designations" WHERE "id" = NEW.designation_id AND "outlet_id" IS NOT NULL AND "outlet_id" != NEW.outlet_id
            ) THEN RAISE(ABORT, 'HR_STAFF_DESIGNATION_OUTLET_MISMATCH')
            WHEN (NEW.designation_id IS NOT OLD.designation_id) AND NOT EXISTS (
                SELECT 1 FROM "global_hr_designations" WHERE "id" = NEW.designation_id AND "status" = 'ACTIVE'
            ) AND NOT EXISTS (
                SELECT 1 FROM "hr_designations" WHERE "id" = NEW.designation_id AND "status" = 'ACTIVE'
            ) THEN RAISE(ABORT, 'HR_DESIGNATION_NOT_ACTIVE')
            WHEN NEW.aadhaar_document_id IS NOT NULL AND (OLD.aadhaar_document_id IS NULL OR NEW.aadhaar_document_id IS NOT OLD.aadhaar_document_id) AND NOT EXISTS (
                SELECT 1 FROM "documents" WHERE "id" = NEW.aadhaar_document_id
            ) THEN RAISE(ABORT, 'HR_AADHAAR_DOCUMENT_NOT_FOUND')
            WHEN NEW.aadhaar_document_id IS NOT NULL AND (OLD.aadhaar_document_id IS NULL OR NEW.aadhaar_document_id IS NOT OLD.aadhaar_document_id) AND NOT EXISTS (
                SELECT 1 FROM "documents" WHERE "id" = NEW.aadhaar_document_id AND "outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'HR_AADHAAR_DOCUMENT_OUTLET_MISMATCH')
            WHEN NEW.photo_document_id IS NOT NULL AND (OLD.photo_document_id IS NULL OR NEW.photo_document_id IS NOT OLD.photo_document_id) AND NOT EXISTS (
                SELECT 1 FROM "documents" WHERE "id" = NEW.photo_document_id
            ) THEN RAISE(ABORT, 'HR_PHOTO_DOCUMENT_NOT_FOUND')
            WHEN NEW.photo_document_id IS NOT NULL AND (OLD.photo_document_id IS NULL OR NEW.photo_document_id IS NOT OLD.photo_document_id) AND NOT EXISTS (
                SELECT 1 FROM "documents" WHERE "id" = NEW.photo_document_id AND "outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'HR_PHOTO_DOCUMENT_OUTLET_MISMATCH')
        END;
END;

-- 6B. Triggers on hr_manpower_sanctions
CREATE TRIGGER IF NOT EXISTS "trg_hr_manpower_delete_forbidden"
BEFORE DELETE ON "hr_manpower_sanctions"
BEGIN
    SELECT RAISE(ABORT, 'HR_MANPOWER_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_manpower_identity_immutable"
BEFORE UPDATE ON "hr_manpower_sanctions"
BEGIN
    SELECT
        CASE
            WHEN (OLD.outlet_id IS NOT NEW.outlet_id) OR
                 (OLD.designation_id IS NOT NEW.designation_id) OR
                 (OLD.created_by IS NOT NEW.created_by) OR
                 (OLD.created_at IS NOT NEW.created_at)
            THEN RAISE(ABORT, 'HR_MANPOWER_IDENTITY_IMMUTABLE')
        END;
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_manpower_insert_integrity"
BEFORE INSERT ON "hr_manpower_sanctions"
BEGIN
    SELECT
        CASE
            WHEN NOT EXISTS (
                SELECT 1 FROM "global_hr_designations" WHERE "id" = NEW.designation_id
            ) AND NOT EXISTS (
                SELECT 1 FROM "hr_designations" WHERE "id" = NEW.designation_id
            ) THEN RAISE(ABORT, 'HR_DESIGNATION_NOT_FOUND')
            WHEN EXISTS (
                SELECT 1 FROM "hr_designations" WHERE "id" = NEW.designation_id AND "outlet_id" IS NOT NULL AND "outlet_id" != NEW.outlet_id
            ) THEN RAISE(ABORT, 'HR_MANPOWER_DESIGNATION_OUTLET_MISMATCH')
        END;
END;

-- 6C. Triggers on hr_roster_assignments
CREATE TRIGGER IF NOT EXISTS "trg_hr_roster_delete_forbidden"
BEFORE DELETE ON "hr_roster_assignments"
BEGIN
    SELECT RAISE(ABORT, 'HR_ROSTER_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_roster_identity_immutable"
BEFORE UPDATE ON "hr_roster_assignments"
BEGIN
    SELECT
        CASE
            WHEN (OLD.outlet_id IS NOT NEW.outlet_id) OR
                 (OLD.created_by IS NOT NEW.created_by) OR
                 (OLD.created_at IS NOT NEW.created_at)
            THEN RAISE(ABORT, 'HR_ROSTER_IDENTITY_IMMUTABLE')
        END;
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_roster_insert_integrity"
BEFORE INSERT ON "hr_roster_assignments"
BEGIN
    SELECT
        CASE
            WHEN NOT EXISTS (
                SELECT 1 FROM "hr_staff" WHERE "id" = NEW.staff_id
            ) THEN RAISE(ABORT, 'HR_STAFF_NOT_FOUND')
            WHEN NOT EXISTS (
                SELECT 1 FROM "hr_staff" WHERE "id" = NEW.staff_id AND "outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'HR_ROSTER_STAFF_OUTLET_MISMATCH')
            WHEN NOT EXISTS (
                SELECT 1 FROM "hr_staff" WHERE "id" = NEW.staff_id AND "employment_status" = 'ACTIVE'
            ) THEN RAISE(ABORT, 'HR_STAFF_NOT_ACTIVE')
            WHEN NOT EXISTS (
                SELECT 1 FROM "global_shift_templates" WHERE "id" = NEW.shift_template_id
            ) AND NOT EXISTS (
                SELECT 1 FROM "shift_templates" WHERE "id" = NEW.shift_template_id
            ) THEN RAISE(ABORT, 'HR_SHIFT_TEMPLATE_NOT_FOUND')
            WHEN NOT EXISTS (
                SELECT 1 FROM "global_shift_templates" WHERE "id" = NEW.shift_template_id AND "status" = 'ACTIVE'
            ) AND NOT EXISTS (
                SELECT 1 FROM "shift_templates" WHERE "id" = NEW.shift_template_id AND "status" = 'ACTIVE'
            ) THEN RAISE(ABORT, 'HR_SHIFT_TEMPLATE_NOT_ACTIVE')
            WHEN NOT EXISTS (
                SELECT 1 FROM "global_shift_templates" WHERE "id" = NEW.shift_template_id
            ) AND EXISTS (
                SELECT 1 FROM "shift_templates" WHERE "id" = NEW.shift_template_id AND "outlet_id" IS NOT NULL AND "outlet_id" != NEW.outlet_id
            ) THEN RAISE(ABORT, 'HR_ROSTER_SHIFT_OUTLET_MISMATCH')
        END;
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_roster_update_integrity"
BEFORE UPDATE ON "hr_roster_assignments"
BEGIN
    SELECT
        CASE
            WHEN (NEW.staff_id IS NOT OLD.staff_id) AND NOT EXISTS (
                SELECT 1 FROM "hr_staff" WHERE "id" = NEW.staff_id
            ) THEN RAISE(ABORT, 'HR_STAFF_NOT_FOUND')
            WHEN (NEW.staff_id IS NOT OLD.staff_id) AND NOT EXISTS (
                SELECT 1 FROM "hr_staff" WHERE "id" = NEW.staff_id AND "outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'HR_ROSTER_STAFF_OUTLET_MISMATCH')
            WHEN (NEW.staff_id IS NOT OLD.staff_id) AND NOT EXISTS (
                SELECT 1 FROM "hr_staff" WHERE "id" = NEW.staff_id AND "employment_status" = 'ACTIVE'
            ) THEN RAISE(ABORT, 'HR_STAFF_NOT_ACTIVE')
            WHEN (NEW.shift_template_id IS NOT OLD.shift_template_id) AND NOT EXISTS (
                SELECT 1 FROM "global_shift_templates" WHERE "id" = NEW.shift_template_id
            ) AND NOT EXISTS (
                SELECT 1 FROM "shift_templates" WHERE "id" = NEW.shift_template_id
            ) THEN RAISE(ABORT, 'HR_SHIFT_TEMPLATE_NOT_FOUND')
            WHEN (NEW.shift_template_id IS NOT OLD.shift_template_id) AND NOT EXISTS (
                SELECT 1 FROM "global_shift_templates" WHERE "id" = NEW.shift_template_id AND "status" = 'ACTIVE'
            ) AND NOT EXISTS (
                SELECT 1 FROM "shift_templates" WHERE "id" = NEW.shift_template_id AND "status" = 'ACTIVE'
            ) THEN RAISE(ABORT, 'HR_SHIFT_TEMPLATE_NOT_ACTIVE')
            WHEN (NEW.shift_template_id IS NOT OLD.shift_template_id) AND NOT EXISTS (
                SELECT 1 FROM "global_shift_templates" WHERE "id" = NEW.shift_template_id
            ) AND EXISTS (
                SELECT 1 FROM "shift_templates" WHERE "id" = NEW.shift_template_id AND "outlet_id" IS NOT NULL AND "outlet_id" != NEW.outlet_id
            ) THEN RAISE(ABORT, 'HR_ROSTER_SHIFT_OUTLET_MISMATCH')
        END;
END;

CREATE TRIGGER IF NOT EXISTS "trg_shift_templates_sync_global_status"
AFTER UPDATE OF "status" ON "shift_templates"
BEGIN
    UPDATE "global_shift_templates" SET "status" = NEW.status, "updated_at" = NEW.updated_at WHERE "id" = NEW.id AND "status" != NEW.status;
END;

CREATE TRIGGER IF NOT EXISTS "trg_global_shift_templates_sync_legacy_status"
AFTER UPDATE OF "status" ON "global_shift_templates"
BEGIN
    UPDATE "shift_templates" SET "status" = NEW.status, "updated_at" = NEW.updated_at WHERE "id" = NEW.id AND "status" != NEW.status;
END;

-- 6D. Triggers on hr_attendance_records
CREATE TRIGGER IF NOT EXISTS "trg_hr_attendance_records_delete_forbidden"
BEFORE DELETE ON "hr_attendance_records"
BEGIN
    SELECT RAISE(ABORT, 'HR_ATTENDANCE_RECORD_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_attendance_records_identity_immutable"
BEFORE UPDATE ON "hr_attendance_records"
BEGIN
    SELECT
        CASE
            WHEN (OLD.outlet_id IS NOT NEW.outlet_id) OR
                 (OLD.staff_id IS NOT NEW.staff_id) OR
                 (OLD.roster_assignment_id IS NOT NEW.roster_assignment_id) OR
                 (OLD.attendance_date IS NOT NEW.attendance_date) OR
                 (OLD.shift_template_id IS NOT NEW.shift_template_id) OR
                 (OLD.created_by IS NOT NEW.created_by) OR
                 (OLD.created_at IS NOT NEW.created_at) OR
                 (OLD.check_in_at IS NOT NEW.check_in_at)
            THEN RAISE(ABORT, 'HR_ATTENDANCE_IDENTITY_IMMUTABLE')
        END;
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_attendance_records_cross_ref_insert"
BEFORE INSERT ON "hr_attendance_records"
BEGIN
    SELECT
        CASE
            WHEN NOT EXISTS (SELECT 1 FROM "hr_roster_assignments" WHERE id = NEW.roster_assignment_id)
            THEN RAISE(ABORT, 'HR_ROSTER_NOT_FOUND')
            WHEN NOT EXISTS (SELECT 1 FROM "hr_roster_assignments" WHERE id = NEW.roster_assignment_id AND outlet_id = NEW.outlet_id)
            THEN RAISE(ABORT, 'HR_ROSTER_OUTLET_MISMATCH')
            WHEN NOT EXISTS (SELECT 1 FROM "hr_roster_assignments" WHERE id = NEW.roster_assignment_id AND staff_id = NEW.staff_id)
            THEN RAISE(ABORT, 'HR_ATTENDANCE_ROSTER_STAFF_MISMATCH')
            WHEN NOT EXISTS (SELECT 1 FROM "hr_roster_assignments" WHERE id = NEW.roster_assignment_id AND roster_date = NEW.attendance_date)
            THEN RAISE(ABORT, 'HR_ATTENDANCE_ROSTER_DATE_MISMATCH')
            WHEN NOT EXISTS (SELECT 1 FROM "hr_roster_assignments" WHERE id = NEW.roster_assignment_id AND shift_template_id = NEW.shift_template_id)
            THEN RAISE(ABORT, 'HR_ATTENDANCE_ROSTER_SHIFT_MISMATCH')
            WHEN NOT EXISTS (SELECT 1 FROM "hr_roster_assignments" WHERE id = NEW.roster_assignment_id AND status = 'SCHEDULED')
            THEN RAISE(ABORT, 'HR_ROSTER_NOT_SCHEDULED')
            WHEN NOT EXISTS (SELECT 1 FROM "hr_staff" WHERE id = NEW.staff_id)
            THEN RAISE(ABORT, 'HR_STAFF_NOT_FOUND')
            WHEN NOT EXISTS (SELECT 1 FROM "hr_staff" WHERE id = NEW.staff_id AND outlet_id = NEW.outlet_id)
            THEN RAISE(ABORT, 'HR_STAFF_OUTLET_MISMATCH')
            WHEN NOT EXISTS (SELECT 1 FROM "hr_staff" WHERE id = NEW.staff_id AND employment_status = 'ACTIVE')
            THEN RAISE(ABORT, 'HR_STAFF_NOT_ACTIVE')
            WHEN NOT EXISTS (SELECT 1 FROM "global_shift_templates" WHERE id = NEW.shift_template_id)
            AND NOT EXISTS (SELECT 1 FROM "shift_templates" WHERE id = NEW.shift_template_id)
            THEN RAISE(ABORT, 'HR_SHIFT_TEMPLATE_NOT_FOUND')
        END;
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_attendance_records_checkout_check"
BEFORE UPDATE ON "hr_attendance_records"
BEGIN
    SELECT
        CASE
            WHEN NEW.status = 'CHECKED_OUT' AND (NEW.check_out_at IS NULL OR NEW.check_out_at <= NEW.check_in_at)
            THEN RAISE(ABORT, 'HR_ATTENDANCE_CHECKOUT_INVALID')
            WHEN NEW.status = 'CHECKED_IN' AND NEW.check_out_at IS NOT NULL
            THEN RAISE(ABORT, 'HR_ATTENDANCE_CHECKED_IN_HAS_CHECKOUT')
        END;
END;

-- 6E. Triggers on hr_nozzle_assignments
CREATE TRIGGER IF NOT EXISTS "trg_hr_nozzle_assignments_delete_forbidden"
BEFORE DELETE ON "hr_nozzle_assignments"
BEGIN
    SELECT RAISE(ABORT, 'HR_NOZZLE_ASSIGNMENT_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_nozzle_assignments_identity_immutable"
BEFORE UPDATE ON "hr_nozzle_assignments"
BEGIN
    SELECT
        CASE
            WHEN (OLD.outlet_id IS NOT NEW.outlet_id) OR
                 (OLD.roster_assignment_id IS NOT NEW.roster_assignment_id) OR
                 (OLD.staff_id IS NOT NEW.staff_id) OR
                 (OLD.nozzle_id IS NOT NEW.nozzle_id) OR
                 (OLD.assignment_date IS NOT NEW.assignment_date) OR
                 (OLD.shift_template_id IS NOT NEW.shift_template_id) OR
                 (OLD.created_by IS NOT NEW.created_by) OR
                 (OLD.created_at IS NOT NEW.created_at)
            THEN RAISE(ABORT, 'HR_NOZZLE_ASSIGNMENT_IDENTITY_IMMUTABLE')
        END;
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_nozzle_assignments_cross_ref_insert"
BEFORE INSERT ON "hr_nozzle_assignments"
BEGIN
    SELECT
        CASE
            WHEN NOT EXISTS (SELECT 1 FROM "hr_roster_assignments" WHERE id = NEW.roster_assignment_id)
            THEN RAISE(ABORT, 'HR_ROSTER_NOT_FOUND')
            WHEN NOT EXISTS (SELECT 1 FROM "hr_roster_assignments" WHERE id = NEW.roster_assignment_id AND outlet_id = NEW.outlet_id)
            THEN RAISE(ABORT, 'HR_ROSTER_OUTLET_MISMATCH')
            WHEN NOT EXISTS (SELECT 1 FROM "hr_roster_assignments" WHERE id = NEW.roster_assignment_id AND staff_id = NEW.staff_id)
            THEN RAISE(ABORT, 'HR_NOZZLE_ROSTER_STAFF_MISMATCH')
            WHEN NOT EXISTS (SELECT 1 FROM "hr_roster_assignments" WHERE id = NEW.roster_assignment_id AND roster_date = NEW.assignment_date)
            THEN RAISE(ABORT, 'HR_NOZZLE_ROSTER_DATE_MISMATCH')
            WHEN NOT EXISTS (SELECT 1 FROM "hr_roster_assignments" WHERE id = NEW.roster_assignment_id AND shift_template_id = NEW.shift_template_id)
            THEN RAISE(ABORT, 'HR_NOZZLE_ROSTER_SHIFT_MISMATCH')
        END;
END;

PRAGMA legacy_alter_table = OFF;
PRAGMA foreign_keys = ON;
PRAGMA foreign_key_check;
