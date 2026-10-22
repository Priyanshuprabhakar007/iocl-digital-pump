PRAGMA foreign_keys = OFF;

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

PRAGMA foreign_keys = ON;
