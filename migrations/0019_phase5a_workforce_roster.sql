-- Migration 0019: Phase 5A-1 Workforce Master, Manpower Allocation & Shift Roster

-- 1. Permissions & Role Permissions
INSERT OR IGNORE INTO "permissions" ("id", "code", "name", "description") VALUES
('perm-hr-r', 'hr.read', 'Read HR & Workforce', 'View designations, staff master, manpower sanctions, summary, and shift roster'),
('perm-hr-staff-w', 'hr.staff.write', 'Write Staff & Designations', 'Create and update HR designations and staff profiles'),
('perm-hr-manpower-w', 'hr.manpower.write', 'Write Manpower Sanctions', 'Create and update sanctioned manpower counts'),
('perm-hr-roster-w', 'hr.roster.write', 'Write Shift Roster', 'Create and update shift roster assignments');

INSERT OR IGNORE INTO "role_permissions" ("role_id", "permission_id") VALUES
('role-admin', 'perm-hr-r'), ('role-admin', 'perm-hr-staff-w'), ('role-admin', 'perm-hr-manpower-w'), ('role-admin', 'perm-hr-roster-w'),
('role-so', 'perm-hr-r'),
('role-do', 'perm-hr-r'),
('role-bm', 'perm-hr-r'), ('role-bm', 'perm-hr-staff-w'), ('role-bm', 'perm-hr-manpower-w'), ('role-bm', 'perm-hr-roster-w'),
('role-fo', 'perm-hr-r'), ('role-fo', 'perm-hr-staff-w'), ('role-fo', 'perm-hr-manpower-w'), ('role-fo', 'perm-hr-roster-w'),
('role-dealer', 'perm-hr-r'), ('role-dealer', 'perm-hr-staff-w'), ('role-dealer', 'perm-hr-roster-w'),
('role-csp', 'perm-hr-r'), ('role-csp', 'perm-hr-staff-w'), ('role-csp', 'perm-hr-roster-w');

-- 2. HR Designations
CREATE TABLE IF NOT EXISTS "hr_designations" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
    CHECK (status IN ('ACTIVE', 'INACTIVE')),
    CHECK (trim(code) <> ''),
    CHECK (trim(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_hr_designations_outlet_code" ON "hr_designations" ("outlet_id", "code");
CREATE INDEX IF NOT EXISTS "idx_hr_designations_outlet_id" ON "hr_designations" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_hr_designations_outlet_status" ON "hr_designations" ("outlet_id", "status");

CREATE TRIGGER IF NOT EXISTS "trg_hr_designations_delete_forbidden"
BEFORE DELETE ON "hr_designations"
BEGIN
    SELECT RAISE(ABORT, 'HR_DESIGNATION_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_designations_identity_immutable"
BEFORE UPDATE ON "hr_designations"
BEGIN
    SELECT
        CASE
            WHEN (OLD.outlet_id IS NOT NEW.outlet_id) OR
                 (OLD.code IS NOT NEW.code) OR
                 (OLD.created_by IS NOT NEW.created_by) OR
                 (OLD.created_at IS NOT NEW.created_at)
            THEN RAISE(ABORT, 'HR_DESIGNATION_IDENTITY_IMMUTABLE')
        END;
END;

-- 3. HR Staff
CREATE TABLE IF NOT EXISTS "hr_staff" (
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
	FOREIGN KEY ("designation_id") REFERENCES "hr_designations"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("aadhaar_document_id") REFERENCES "documents"("id") ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY ("photo_document_id") REFERENCES "documents"("id") ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
    CHECK (employment_status IN ('ACTIVE', 'INACTIVE', 'EXITED')),
    CHECK (trim(employee_code) <> ''),
    CHECK (trim(full_name) <> ''),
    CHECK (length(aadhaar_last4) = 4 AND aadhaar_last4 GLOB '[0-9][0-9][0-9][0-9]'),
    CHECK (trim(emergency_contact_name) <> ''),
    CHECK (trim(emergency_contact_phone) <> ''),
    CHECK (joining_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    CHECK (
        (employment_status = 'EXITED' AND exit_date IS NOT NULL AND exit_date >= joining_date AND exit_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
        OR (employment_status IN ('ACTIVE', 'INACTIVE') AND exit_date IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_hr_staff_outlet_employee_code" ON "hr_staff" ("outlet_id", "employee_code");
CREATE INDEX IF NOT EXISTS "idx_hr_staff_outlet_id" ON "hr_staff" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_hr_staff_outlet_designation" ON "hr_staff" ("outlet_id", "designation_id");
CREATE INDEX IF NOT EXISTS "idx_hr_staff_outlet_status" ON "hr_staff" ("outlet_id", "employment_status");

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
                SELECT 1 FROM "hr_designations" WHERE "id" = NEW.designation_id AND "outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'HR_STAFF_DESIGNATION_OUTLET_MISMATCH')
            WHEN NOT EXISTS (
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
                SELECT 1 FROM "hr_designations" WHERE "id" = NEW.designation_id AND "outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'HR_STAFF_DESIGNATION_OUTLET_MISMATCH')
            WHEN (NEW.designation_id IS NOT OLD.designation_id) AND NOT EXISTS (
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

-- 4. HR Manpower Sanctions
CREATE TABLE IF NOT EXISTS "hr_manpower_sanctions" (
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
	FOREIGN KEY ("designation_id") REFERENCES "hr_designations"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
    CHECK (sanctioned_count >= 0 AND sanctioned_count <= 10000),
    CHECK (effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_hr_manpower_outlet_designation" ON "hr_manpower_sanctions" ("outlet_id", "designation_id");
CREATE INDEX IF NOT EXISTS "idx_hr_manpower_outlet_id" ON "hr_manpower_sanctions" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_hr_manpower_designation_id" ON "hr_manpower_sanctions" ("designation_id");

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
                SELECT 1 FROM "hr_designations" WHERE "id" = NEW.designation_id AND "outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'HR_MANPOWER_DESIGNATION_OUTLET_MISMATCH')
        END;
END;

-- 5. HR Roster Assignments
CREATE TABLE IF NOT EXISTS "hr_roster_assignments" (
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
	FOREIGN KEY ("staff_id") REFERENCES "hr_staff"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("shift_template_id") REFERENCES "shift_templates"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
    CHECK (status IN ('SCHEDULED', 'CANCELLED')),
    CHECK (roster_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_hr_roster_staff_date" ON "hr_roster_assignments" ("staff_id", "roster_date");
CREATE INDEX IF NOT EXISTS "idx_hr_roster_outlet_id" ON "hr_roster_assignments" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_hr_roster_outlet_date" ON "hr_roster_assignments" ("outlet_id", "roster_date");
CREATE INDEX IF NOT EXISTS "idx_hr_roster_shift" ON "hr_roster_assignments" ("outlet_id", "shift_template_id");

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
                SELECT 1 FROM "hr_staff" WHERE "id" = NEW.staff_id AND "outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'HR_ROSTER_STAFF_OUTLET_MISMATCH')
            WHEN NOT EXISTS (
                SELECT 1 FROM "hr_staff" WHERE "id" = NEW.staff_id AND "employment_status" = 'ACTIVE'
            ) THEN RAISE(ABORT, 'HR_STAFF_NOT_ACTIVE')
            WHEN NOT EXISTS (
                SELECT 1 FROM "shift_templates" WHERE "id" = NEW.shift_template_id AND "outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'HR_ROSTER_SHIFT_OUTLET_MISMATCH')
            WHEN NOT EXISTS (
                SELECT 1 FROM "shift_templates" WHERE "id" = NEW.shift_template_id AND "status" = 'ACTIVE'
            ) THEN RAISE(ABORT, 'HR_SHIFT_TEMPLATE_NOT_ACTIVE')
        END;
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_roster_update_integrity"
BEFORE UPDATE ON "hr_roster_assignments"
BEGIN
    SELECT
        CASE
            WHEN (NEW.staff_id IS NOT OLD.staff_id) AND NOT EXISTS (
                SELECT 1 FROM "hr_staff" WHERE "id" = NEW.staff_id AND "outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'HR_ROSTER_STAFF_OUTLET_MISMATCH')
            WHEN (NEW.staff_id IS NOT OLD.staff_id) AND NOT EXISTS (
                SELECT 1 FROM "hr_staff" WHERE "id" = NEW.staff_id AND "employment_status" = 'ACTIVE'
            ) THEN RAISE(ABORT, 'HR_STAFF_NOT_ACTIVE')
            WHEN (NEW.shift_template_id IS NOT OLD.shift_template_id) AND NOT EXISTS (
                SELECT 1 FROM "shift_templates" WHERE "id" = NEW.shift_template_id AND "outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'HR_ROSTER_SHIFT_OUTLET_MISMATCH')
            WHEN (NEW.shift_template_id IS NOT OLD.shift_template_id) AND NOT EXISTS (
                SELECT 1 FROM "shift_templates" WHERE "id" = NEW.shift_template_id AND "status" = 'ACTIVE'
            ) THEN RAISE(ABORT, 'HR_SHIFT_TEMPLATE_NOT_ACTIVE')
        END;
END;
