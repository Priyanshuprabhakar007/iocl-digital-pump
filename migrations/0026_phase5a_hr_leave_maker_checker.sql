-- =========================================================================
-- Migration 0026: Phase 5A HR Leave Management & Maker-Checker Foundation
-- =========================================================================

-- 1. Permissions & Role Permissions
INSERT OR IGNORE INTO "permissions" ("id", "code", "name", "description") VALUES
('perm-hr-leave-r', 'hr.leave.read', 'Read Leave Requests', 'Read leave requests'),
('perm-hr-leave-req', 'hr.leave.request', 'Create/Cancel Leave Requests', 'Create/cancel leave requests'),
('perm-hr-leave-appr', 'hr.leave.approve', 'Approve/Reject Leave Requests', 'Approve/reject leave requests');

INSERT OR IGNORE INTO "role_permissions" ("role_id", "permission_id") VALUES
('role-admin', 'perm-hr-leave-r'), ('role-admin', 'perm-hr-leave-req'), ('role-admin', 'perm-hr-leave-appr'),
('role-so', 'perm-hr-leave-r'), ('role-so', 'perm-hr-leave-appr'),
('role-do', 'perm-hr-leave-r'), ('role-do', 'perm-hr-leave-appr'),
('role-bm', 'perm-hr-leave-r'), ('role-bm', 'perm-hr-leave-req'), ('role-bm', 'perm-hr-leave-appr'),
('role-fo', 'perm-hr-leave-r'), ('role-fo', 'perm-hr-leave-req'), ('role-fo', 'perm-hr-leave-appr'),
('role-dealer', 'perm-hr-leave-r'), ('role-dealer', 'perm-hr-leave-req'),
('role-csp', 'perm-hr-leave-r'), ('role-csp', 'perm-hr-leave-req');

-- 2. HR Leave Requests Table
CREATE TABLE IF NOT EXISTS "hr_leave_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"staff_id" text NOT NULL,
	"leave_type" text NOT NULL,
	"from_date" text NOT NULL,
	"to_date" text NOT NULL,
	"reason" text NOT NULL,
	"attachment_document_id" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"decision_by_user_id" text,
	"decision_at" text,
	"decision_notes" text,
	"cancelled_by_user_id" text,
	"cancelled_at" text,
	"cancellation_reason" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("staff_id") REFERENCES "hr_staff"("id") ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY ("attachment_document_id") REFERENCES "documents"("id") ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("decision_by_user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	CHECK ("leave_type" IN ('CASUAL', 'SICK', 'EARNED', 'UNPAID', 'OTHER')),
	CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
	CHECK (trim("reason") <> ''),
	CHECK ("from_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CHECK ("to_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CHECK ("to_date" >= "from_date"),
	CHECK (
		("status" = 'PENDING' AND "decision_by_user_id" IS NULL AND "decision_at" IS NULL AND "cancelled_by_user_id" IS NULL AND "cancelled_at" IS NULL)
		OR
		("status" = 'APPROVED' AND "decision_by_user_id" IS NOT NULL AND "decision_at" IS NOT NULL AND "cancelled_by_user_id" IS NULL AND "cancelled_at" IS NULL)
		OR
		("status" = 'REJECTED' AND "decision_by_user_id" IS NOT NULL AND "decision_at" IS NOT NULL AND trim("decision_notes") <> '' AND "cancelled_by_user_id" IS NULL AND "cancelled_at" IS NULL)
		OR
		("status" = 'CANCELLED' AND "decision_by_user_id" IS NULL AND "decision_at" IS NULL AND "cancelled_by_user_id" IS NOT NULL AND "cancelled_at" IS NOT NULL AND trim("cancellation_reason") <> '')
	)
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS "idx_hr_leave_outlet_status" ON "hr_leave_requests" ("outlet_id", "status");
CREATE INDEX IF NOT EXISTS "idx_hr_leave_outlet_staff" ON "hr_leave_requests" ("outlet_id", "staff_id");
CREATE INDEX IF NOT EXISTS "idx_hr_leave_staff_dates" ON "hr_leave_requests" ("staff_id", "from_date", "to_date");
CREATE INDEX IF NOT EXISTS "idx_hr_leave_outlet_dates" ON "hr_leave_requests" ("outlet_id", "from_date", "to_date");
CREATE INDEX IF NOT EXISTS "idx_hr_leave_requested_by" ON "hr_leave_requests" ("requested_by_user_id");

-- 4. Triggers
CREATE TRIGGER IF NOT EXISTS "trg_hr_leave_delete_forbidden"
BEFORE DELETE ON "hr_leave_requests"
BEGIN
    SELECT RAISE(ABORT, 'HR_LEAVE_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_leave_identity_immutable"
BEFORE UPDATE ON "hr_leave_requests"
BEGIN
    SELECT
        CASE
            WHEN (OLD.outlet_id IS NOT NEW.outlet_id) OR
                 (OLD.staff_id IS NOT NEW.staff_id) OR
                 (OLD.leave_type IS NOT NEW.leave_type) OR
                 (OLD.from_date IS NOT NEW.from_date) OR
                 (OLD.to_date IS NOT NEW.to_date) OR
                 (OLD.reason IS NOT NEW.reason) OR
                 (OLD.attachment_document_id IS NOT NEW.attachment_document_id) OR
                 (OLD.requested_by_user_id IS NOT NEW.requested_by_user_id) OR
                 (OLD.created_at IS NOT NEW.created_at)
            THEN RAISE(ABORT, 'HR_LEAVE_IDENTITY_IMMUTABLE')
        END;
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_leave_insert_integrity"
BEFORE INSERT ON "hr_leave_requests"
BEGIN
    SELECT
        CASE
            WHEN NEW.status IN ('APPROVED', 'REJECTED', 'CANCELLED')
            THEN RAISE(ABORT, 'HR_LEAVE_INVALID_STATE_TRANSITION')
            WHEN NEW.status <> 'PENDING'
            THEN RAISE(ABORT, 'HR_LEAVE_INVALID_STATE_TRANSITION')
            WHEN NOT EXISTS (SELECT 1 FROM "hr_staff" WHERE "id" = NEW.staff_id)
            THEN RAISE(ABORT, 'HR_STAFF_NOT_FOUND')
            WHEN NOT EXISTS (SELECT 1 FROM "hr_staff" WHERE "id" = NEW.staff_id AND "outlet_id" = NEW.outlet_id)
            THEN RAISE(ABORT, 'HR_LEAVE_STAFF_OUTLET_MISMATCH')
            WHEN NEW.attachment_document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "documents" WHERE "id" = NEW.attachment_document_id)
            THEN RAISE(ABORT, 'HR_LEAVE_DOCUMENT_NOT_FOUND')
            WHEN NEW.attachment_document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "documents" WHERE "id" = NEW.attachment_document_id AND "outlet_id" = NEW.outlet_id)
            THEN RAISE(ABORT, 'HR_LEAVE_DOCUMENT_OUTLET_MISMATCH')
            WHEN NEW.status IN ('PENDING', 'APPROVED') AND EXISTS (
                SELECT 1 FROM "hr_leave_requests"
                WHERE "staff_id" = NEW.staff_id
                  AND "status" IN ('PENDING', 'APPROVED')
                  AND "to_date" >= NEW.from_date
                  AND "from_date" <= NEW.to_date
            )
            THEN RAISE(ABORT, 'HR_LEAVE_OVERLAP')
            WHEN NEW.status IN ('APPROVED', 'REJECTED') AND NEW.decision_by_user_id = NEW.requested_by_user_id
            THEN RAISE(ABORT, 'HR_MAKER_CHECKER_SELF_APPROVAL_FORBIDDEN')
            WHEN NEW.status = 'CANCELLED' AND NEW.cancelled_by_user_id <> NEW.requested_by_user_id
            THEN RAISE(ABORT, 'HR_LEAVE_CANCEL_NOT_REQUESTER')
        END;
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_leave_update_integrity"
BEFORE UPDATE ON "hr_leave_requests"
BEGIN
    SELECT
        CASE
            WHEN (NEW.staff_id IS NOT OLD.staff_id) AND NOT EXISTS (SELECT 1 FROM "hr_staff" WHERE "id" = NEW.staff_id)
            THEN RAISE(ABORT, 'HR_STAFF_NOT_FOUND')
            WHEN (NEW.staff_id IS NOT OLD.staff_id) AND NOT EXISTS (SELECT 1 FROM "hr_staff" WHERE "id" = NEW.staff_id AND "outlet_id" = NEW.outlet_id)
            THEN RAISE(ABORT, 'HR_LEAVE_STAFF_OUTLET_MISMATCH')
            WHEN NEW.attachment_document_id IS NOT NULL AND (OLD.attachment_document_id IS NULL OR NEW.attachment_document_id IS NOT OLD.attachment_document_id) AND NOT EXISTS (SELECT 1 FROM "documents" WHERE "id" = NEW.attachment_document_id)
            THEN RAISE(ABORT, 'HR_LEAVE_DOCUMENT_NOT_FOUND')
            WHEN NEW.attachment_document_id IS NOT NULL AND (OLD.attachment_document_id IS NULL OR NEW.attachment_document_id IS NOT OLD.attachment_document_id) AND NOT EXISTS (SELECT 1 FROM "documents" WHERE "id" = NEW.attachment_document_id AND "outlet_id" = NEW.outlet_id)
            THEN RAISE(ABORT, 'HR_LEAVE_DOCUMENT_OUTLET_MISMATCH')
            WHEN OLD.status <> NEW.status AND OLD.status <> 'PENDING'
            THEN RAISE(ABORT, 'HR_LEAVE_INVALID_STATE_TRANSITION')
            WHEN OLD.status = 'PENDING' AND NEW.status NOT IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')
            THEN RAISE(ABORT, 'HR_LEAVE_INVALID_STATE_TRANSITION')
            -- Terminal immutability
            WHEN OLD.status IN ('APPROVED', 'REJECTED', 'CANCELLED') AND (
                 (NEW.decision_by_user_id IS NOT OLD.decision_by_user_id) OR
                 (NEW.decision_at IS NOT OLD.decision_at) OR
                 (NEW.decision_notes IS NOT OLD.decision_notes) OR
                 (NEW.cancelled_by_user_id IS NOT OLD.cancelled_by_user_id) OR
                 (NEW.cancelled_at IS NOT OLD.cancelled_at) OR
                 (NEW.cancellation_reason IS NOT OLD.cancellation_reason)
            )
            THEN RAISE(ABORT, 'HR_LEAVE_TERMINAL_IMMUTABLE')
            WHEN NEW.status IN ('PENDING', 'APPROVED') AND (OLD.status <> NEW.status OR NEW.from_date <> OLD.from_date OR NEW.to_date <> OLD.to_date) AND EXISTS (
                SELECT 1 FROM "hr_leave_requests"
                WHERE "id" <> NEW.id
                  AND "staff_id" = NEW.staff_id
                  AND "status" IN ('PENDING', 'APPROVED')
                  AND "to_date" >= NEW.from_date
                  AND "from_date" <= NEW.to_date
            )
            THEN RAISE(ABORT, 'HR_LEAVE_OVERLAP')
            WHEN NEW.status IN ('APPROVED', 'REJECTED') AND NEW.decision_by_user_id = NEW.requested_by_user_id
            THEN RAISE(ABORT, 'HR_MAKER_CHECKER_SELF_APPROVAL_FORBIDDEN')
            WHEN NEW.status = 'CANCELLED' AND NEW.cancelled_by_user_id <> NEW.requested_by_user_id
            THEN RAISE(ABORT, 'HR_LEAVE_CANCEL_NOT_REQUESTER')
        END;
END;
