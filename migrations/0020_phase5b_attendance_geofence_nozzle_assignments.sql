-- Migration 0020: Phase 5B-1 Attendance, Geofencing & Nozzle Assignments (Hardened)

-- 1. Permissions & Role Permissions
INSERT OR IGNORE INTO "permissions" ("id", "code", "name", "description") VALUES
('perm-hr-att-r', 'hr.attendance.read', 'Read Attendance', 'View staff attendance records and geofence logs'),
('perm-hr-att-w', 'hr.attendance.write', 'Write Attendance', 'Perform staff check-in and check-out operations'),
('perm-hr-geo-w', 'hr.geofence.write', 'Write Geofence Policy', 'Configure outlet geofence policies and radius rules'),
('perm-hr-nozz-w', 'hr.nozzle_assignment.write', 'Write Nozzle Assignments', 'Assign scheduled staff to operational nozzles');

INSERT OR IGNORE INTO "role_permissions" ("role_id", "permission_id") VALUES
-- Admin
('role-admin', 'perm-hr-att-r'), ('role-admin', 'perm-hr-att-w'), ('role-admin', 'perm-hr-geo-w'), ('role-admin', 'perm-hr-nozz-w'),
-- State Office
('role-so', 'perm-hr-att-r'),
-- Divisional Office
('role-do', 'perm-hr-att-r'),
-- Business Manager
('role-bm', 'perm-hr-att-r'), ('role-bm', 'perm-hr-att-w'), ('role-bm', 'perm-hr-geo-w'), ('role-bm', 'perm-hr-nozz-w'),
-- Field Officer
('role-fo', 'perm-hr-att-r'), ('role-fo', 'perm-hr-att-w'), ('role-fo', 'perm-hr-geo-w'), ('role-fo', 'perm-hr-nozz-w'),
-- Dealer
('role-dealer', 'perm-hr-att-r'), ('role-dealer', 'perm-hr-att-w'), ('role-dealer', 'perm-hr-nozz-w'),
-- CSP
('role-csp', 'perm-hr-att-r'), ('role-csp', 'perm-hr-att-w'), ('role-csp', 'perm-hr-nozz-w');

-- 2. Outlet Geofence Policies
CREATE TABLE IF NOT EXISTS "hr_outlet_geofence_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL UNIQUE,
	"radius_metres" integer DEFAULT 100 NOT NULL,
	"max_accuracy_metres" integer DEFAULT 50 NOT NULL,
	"attendance_geofence_required" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	CHECK (status IN ('ACTIVE', 'INACTIVE')),
	CHECK (radius_metres BETWEEN 10 AND 10000),
	CHECK (max_accuracy_metres BETWEEN 1 AND 1000),
	CHECK (attendance_geofence_required IN (0, 1))
);

CREATE INDEX IF NOT EXISTS "idx_hr_outlet_geofence_policies_outlet_id" ON "hr_outlet_geofence_policies" ("outlet_id");

CREATE TRIGGER IF NOT EXISTS "trg_hr_outlet_geofence_policies_delete_forbidden"
BEFORE DELETE ON "hr_outlet_geofence_policies"
BEGIN
    SELECT RAISE(ABORT, 'HR_GEOFENCE_POLICY_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_outlet_geofence_policies_identity_immutable"
BEFORE UPDATE ON "hr_outlet_geofence_policies"
BEGIN
    SELECT
        CASE
            WHEN (OLD.outlet_id IS NOT NEW.outlet_id) OR
                 (OLD.created_by IS NOT NEW.created_by) OR
                 (OLD.created_at IS NOT NEW.created_at)
            THEN RAISE(ABORT, 'HR_GEOFENCE_POLICY_IDENTITY_IMMUTABLE')
        END;
END;

-- 3. Attendance Records
CREATE TABLE IF NOT EXISTS "hr_attendance_records" (
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
	FOREIGN KEY ("shift_template_id") REFERENCES "shift_templates"("id") ON UPDATE no action ON DELETE no action,
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

CREATE UNIQUE INDEX IF NOT EXISTS "idx_hr_attendance_active_roster" ON "hr_attendance_records" ("roster_assignment_id") WHERE status != 'CANCELLED';
CREATE INDEX IF NOT EXISTS "idx_hr_attendance_outlet_date" ON "hr_attendance_records" ("outlet_id", "attendance_date");
CREATE INDEX IF NOT EXISTS "idx_hr_attendance_staff_date" ON "hr_attendance_records" ("staff_id", "attendance_date");
CREATE INDEX IF NOT EXISTS "idx_hr_attendance_outlet_status" ON "hr_attendance_records" ("outlet_id", "status");

CREATE TRIGGER IF NOT EXISTS "trg_hr_attendance_records_delete_forbidden"
BEFORE DELETE ON "hr_attendance_records"
BEGIN
    SELECT RAISE(ABORT, 'HR_ATTENDANCE_DELETE_FORBIDDEN');
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
            WHEN NOT EXISTS (SELECT 1 FROM "shift_templates" WHERE id = NEW.shift_template_id AND outlet_id = NEW.outlet_id)
            THEN RAISE(ABORT, 'HR_SHIFT_OUTLET_MISMATCH')
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

-- 4. Nozzle Assignments
CREATE TABLE IF NOT EXISTS "hr_nozzle_assignments" (
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
	FOREIGN KEY ("shift_template_id") REFERENCES "shift_templates"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	CHECK (status IN ('ASSIGNED', 'CANCELLED')),
	CHECK (assignment_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_hr_nozzle_active_assignment" ON "hr_nozzle_assignments" ("nozzle_id", "assignment_date", "shift_template_id") WHERE status != 'CANCELLED';
CREATE INDEX IF NOT EXISTS "idx_hr_nozzle_outlet_date" ON "hr_nozzle_assignments" ("outlet_id", "assignment_date");
CREATE INDEX IF NOT EXISTS "idx_hr_nozzle_staff_date" ON "hr_nozzle_assignments" ("staff_id", "assignment_date");
CREATE INDEX IF NOT EXISTS "idx_hr_nozzle_outlet_status" ON "hr_nozzle_assignments" ("outlet_id", "status");

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
            WHEN NOT EXISTS (SELECT 1 FROM "hr_roster_assignments" WHERE id = NEW.roster_assignment_id AND status = 'SCHEDULED')
            THEN RAISE(ABORT, 'HR_ROSTER_NOT_SCHEDULED')
            WHEN NOT EXISTS (SELECT 1 FROM "hr_staff" WHERE id = NEW.staff_id)
            THEN RAISE(ABORT, 'HR_STAFF_NOT_FOUND')
            WHEN NOT EXISTS (SELECT 1 FROM "hr_staff" WHERE id = NEW.staff_id AND outlet_id = NEW.outlet_id)
            THEN RAISE(ABORT, 'HR_STAFF_OUTLET_MISMATCH')
            WHEN NOT EXISTS (SELECT 1 FROM "hr_staff" WHERE id = NEW.staff_id AND employment_status = 'ACTIVE')
            THEN RAISE(ABORT, 'HR_STAFF_NOT_ACTIVE')
            WHEN NOT EXISTS (SELECT 1 FROM "nozzles" WHERE id = NEW.nozzle_id)
            THEN RAISE(ABORT, 'HR_NOZZLE_NOT_FOUND')
            WHEN NOT EXISTS (SELECT 1 FROM "nozzles" WHERE id = NEW.nozzle_id AND outlet_id = NEW.outlet_id)
            THEN RAISE(ABORT, 'HR_NOZZLE_OUTLET_MISMATCH')
            WHEN NOT EXISTS (SELECT 1 FROM "nozzles" WHERE id = NEW.nozzle_id AND status = 'ACTIVE')
            THEN RAISE(ABORT, 'HR_NOZZLE_NOT_ACTIVE')
            WHEN NOT EXISTS (SELECT 1 FROM "shift_templates" WHERE id = NEW.shift_template_id AND outlet_id = NEW.outlet_id)
            THEN RAISE(ABORT, 'HR_SHIFT_OUTLET_MISMATCH')
        END;
END;

