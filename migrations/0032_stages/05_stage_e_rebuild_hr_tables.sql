PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;

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

PRAGMA legacy_alter_table = OFF;
PRAGMA foreign_keys = ON;
