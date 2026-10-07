-- Migration 0021: Phase 5C-1 Uniform Management Backend Foundation & Hardening

-- 1. Permissions & Role Permissions
INSERT OR IGNORE INTO "permissions" ("id", "code", "name", "description") VALUES
('perm-hr-uniform-r', 'hr.uniform.read', 'Read Uniforms', 'View uniform items, variants, stock ledger and issue history'),
('perm-hr-uniform-inv-w', 'hr.uniform.inventory.write', 'Write Uniform Inventory', 'Manage uniform items, variants and stock transactions'),
('perm-hr-uniform-issue-w', 'hr.uniform.issue.write', 'Write Uniform Issues', 'Issue, return and replace staff uniforms');

INSERT OR IGNORE INTO "role_permissions" ("role_id", "permission_id") VALUES
-- Admin
('role-admin', 'perm-hr-uniform-r'), ('role-admin', 'perm-hr-uniform-inv-w'), ('role-admin', 'perm-hr-uniform-issue-w'),
-- State Office
('role-so', 'perm-hr-uniform-r'),
-- Divisional Office
('role-do', 'perm-hr-uniform-r'),
-- Business Manager
('role-bm', 'perm-hr-uniform-r'), ('role-bm', 'perm-hr-uniform-inv-w'), ('role-bm', 'perm-hr-uniform-issue-w'),
-- Field Officer
('role-fo', 'perm-hr-uniform-r'), ('role-fo', 'perm-hr-uniform-inv-w'), ('role-fo', 'perm-hr-uniform-issue-w'),
-- Dealer
('role-dealer', 'perm-hr-uniform-r'), ('role-dealer', 'perm-hr-uniform-inv-w'), ('role-dealer', 'perm-hr-uniform-issue-w'),
-- CSP
('role-csp', 'perm-hr-uniform-r');

-- 2. Uniform Items Master
CREATE TABLE IF NOT EXISTS "hr_uniform_items" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"item_code" text NOT NULL,
	"item_name" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	UNIQUE("outlet_id", "item_code"),
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	CHECK (status IN ('ACTIVE', 'INACTIVE')),
	CHECK (item_code IS NOT NULL AND trim(item_code) != ''),
	CHECK (item_name IS NOT NULL AND trim(item_name) != '')
);

CREATE INDEX IF NOT EXISTS "idx_hr_uniform_items_outlet_id" ON "hr_uniform_items" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_hr_uniform_items_category" ON "hr_uniform_items" ("outlet_id", "category");

CREATE TRIGGER IF NOT EXISTS "trg_hr_uniform_items_delete_forbidden"
BEFORE DELETE ON "hr_uniform_items"
BEGIN
    SELECT RAISE(ABORT, 'HR_UNIFORM_ITEM_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_uniform_items_identity_immutable"
BEFORE UPDATE ON "hr_uniform_items"
BEGIN
    SELECT
        CASE
            WHEN (OLD.outlet_id IS NOT NEW.outlet_id) OR
                 (OLD.item_code IS NOT NEW.item_code) OR
                 (OLD.created_by IS NOT NEW.created_by) OR
                 (OLD.created_at IS NOT NEW.created_at)
            THEN RAISE(ABORT, 'HR_UNIFORM_ITEM_IDENTITY_IMMUTABLE')
        END;
END;

-- 3. Uniform Variants Master
CREATE TABLE IF NOT EXISTS "hr_uniform_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"uniform_item_id" text NOT NULL,
	"size_label" text NOT NULL,
	"size_sort_order" integer DEFAULT 0 NOT NULL,
	"reorder_level" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	UNIQUE("uniform_item_id", "size_label"),
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("uniform_item_id") REFERENCES "hr_uniform_items"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	CHECK (status IN ('ACTIVE', 'INACTIVE')),
	CHECK (size_label IS NOT NULL AND trim(size_label) != ''),
	CHECK (reorder_level >= 0)
);

CREATE INDEX IF NOT EXISTS "idx_hr_uniform_variants_outlet_id" ON "hr_uniform_variants" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_hr_uniform_variants_item_id" ON "hr_uniform_variants" ("uniform_item_id");

-- Triggers: variant relationship and outlet match validation
CREATE TRIGGER IF NOT EXISTS "trg_hr_uniform_variants_insert_validate"
BEFORE INSERT ON "hr_uniform_variants"
BEGIN
    SELECT
        CASE
            WHEN NOT EXISTS (SELECT 1 FROM hr_uniform_items WHERE id = NEW.uniform_item_id)
            THEN RAISE(ABORT, 'HR_UNIFORM_ITEM_NOT_FOUND')
            WHEN NEW.outlet_id != (SELECT outlet_id FROM hr_uniform_items WHERE id = NEW.uniform_item_id)
            THEN RAISE(ABORT, 'HR_UNIFORM_VARIANT_OUTLET_MISMATCH')
        END;
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_uniform_variants_update_validate"
BEFORE UPDATE ON "hr_uniform_variants"
BEGIN
    SELECT
        CASE
            WHEN NOT EXISTS (SELECT 1 FROM hr_uniform_items WHERE id = NEW.uniform_item_id)
            THEN RAISE(ABORT, 'HR_UNIFORM_ITEM_NOT_FOUND')
            WHEN NEW.outlet_id != (SELECT outlet_id FROM hr_uniform_items WHERE id = NEW.uniform_item_id)
            THEN RAISE(ABORT, 'HR_UNIFORM_VARIANT_OUTLET_MISMATCH')
        END;
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_uniform_variants_delete_forbidden"
BEFORE DELETE ON "hr_uniform_variants"
BEGIN
    SELECT RAISE(ABORT, 'HR_UNIFORM_VARIANT_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_uniform_variants_identity_immutable"
BEFORE UPDATE ON "hr_uniform_variants"
BEGIN
    SELECT
        CASE
            WHEN (OLD.outlet_id IS NOT NEW.outlet_id) OR
                 (OLD.uniform_item_id IS NOT NEW.uniform_item_id) OR
                 (OLD.size_label IS NOT NULL AND OLD.size_label IS NOT NEW.size_label) OR
                 (OLD.created_by IS NOT NEW.created_by) OR
                 (OLD.created_at IS NOT NEW.created_at)
            THEN RAISE(ABORT, 'HR_UNIFORM_VARIANT_IDENTITY_IMMUTABLE')
        END;
END;

-- 4. Uniform Stock Ledger (Transactions)
CREATE TABLE IF NOT EXISTS "hr_uniform_stock_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"transaction_type" text NOT NULL,
	"quantity" integer NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"notes" text,
	"occurred_at" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("variant_id") REFERENCES "hr_uniform_variants"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	CHECK (transaction_type IN ('OPENING_BALANCE', 'RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'ISSUE_OUT', 'RETURN_IN')),
	CHECK (quantity > 0),
	CHECK (transaction_type NOT IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT') OR (notes IS NOT NULL AND trim(notes) != ''))
);

CREATE INDEX IF NOT EXISTS "idx_hr_uniform_stock_transactions_outlet_id" ON "hr_uniform_stock_transactions" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_hr_uniform_stock_transactions_variant_id" ON "hr_uniform_stock_transactions" ("variant_id");

-- Triggers: Stock Transactions validation, outlet matching, negative stock protection, manual transaction restriction
CREATE TRIGGER IF NOT EXISTS "trg_hr_uniform_stock_transactions_insert_validate"
BEFORE INSERT ON "hr_uniform_stock_transactions"
BEGIN
    SELECT
        CASE
            -- Basic existence and outlet match
            WHEN NOT EXISTS (SELECT 1 FROM hr_uniform_variants WHERE id = NEW.variant_id)
            THEN RAISE(ABORT, 'HR_UNIFORM_VARIANT_NOT_FOUND')
            WHEN NEW.outlet_id != (SELECT outlet_id FROM hr_uniform_variants WHERE id = NEW.variant_id)
            THEN RAISE(ABORT, 'HR_UNIFORM_VARIANT_OUTLET_MISMATCH')
            
            -- Manual API restriction
            WHEN NEW.transaction_type IN ('ISSUE_OUT', 'RETURN_IN') AND (NEW.reference_type != 'hr_uniform_issues' OR NEW.reference_id IS NULL)
            THEN RAISE(ABORT, 'HR_UNIFORM_INVALID_TRANSACTION_TYPE')
            
            -- Reference existence check for ISSUE_OUT / RETURN_IN
            WHEN NEW.transaction_type = 'ISSUE_OUT' AND NOT EXISTS (SELECT 1 FROM hr_uniform_issues WHERE id = NEW.reference_id AND status = 'ISSUED' AND outlet_id = NEW.outlet_id AND variant_id = NEW.variant_id AND quantity = NEW.quantity)
            THEN RAISE(ABORT, 'HR_UNIFORM_ISSUE_NOT_FOUND')
            WHEN NEW.transaction_type = 'RETURN_IN' AND NOT EXISTS (SELECT 1 FROM hr_uniform_issues WHERE id = NEW.reference_id AND outlet_id = NEW.outlet_id AND variant_id = NEW.variant_id)
            THEN RAISE(ABORT, 'HR_UNIFORM_ISSUE_NOT_FOUND')

            -- Prevent duplicate ISSUE_OUT
            WHEN NEW.transaction_type = 'ISSUE_OUT' AND EXISTS (SELECT 1 FROM hr_uniform_stock_transactions WHERE transaction_type = 'ISSUE_OUT' AND reference_type = 'hr_uniform_issues' AND reference_id = NEW.reference_id)
            THEN RAISE(ABORT, 'HR_UNIFORM_DUPLICATE_ISSUE_OUT')
            -- Prevent duplicate RETURN_IN
            WHEN NEW.transaction_type = 'RETURN_IN' AND EXISTS (SELECT 1 FROM hr_uniform_stock_transactions WHERE transaction_type = 'RETURN_IN' AND reference_type = 'hr_uniform_issues' AND reference_id = NEW.reference_id)
            THEN RAISE(ABORT, 'HR_UNIFORM_DUPLICATE_RETURN_IN')
            
            -- Negative stock protection
            WHEN NEW.transaction_type IN ('ADJUSTMENT_OUT', 'ISSUE_OUT') AND
                 (SELECT COALESCE(SUM(CASE WHEN transaction_type IN ('OPENING_BALANCE', 'RECEIPT', 'ADJUSTMENT_IN', 'RETURN_IN') THEN quantity ELSE -quantity END), 0)
                  FROM hr_uniform_stock_transactions WHERE variant_id = NEW.variant_id) < NEW.quantity
            THEN RAISE(ABORT, 'HR_UNIFORM_INSUFFICIENT_STOCK')
        END;
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_uniform_stock_transactions_delete_forbidden"
BEFORE DELETE ON "hr_uniform_stock_transactions"
BEGIN
    SELECT RAISE(ABORT, 'HR_UNIFORM_STOCK_TRANSACTION_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_uniform_stock_transactions_update_forbidden"
BEFORE UPDATE ON "hr_uniform_stock_transactions"
BEGIN
    SELECT RAISE(ABORT, 'HR_UNIFORM_STOCK_TRANSACTION_UPDATE_FORBIDDEN');
END;

-- 5. Staff Uniform Issue History
CREATE TABLE IF NOT EXISTS "hr_uniform_issues" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"staff_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"issued_at" text NOT NULL,
	"issued_by" text NOT NULL,
	"condition_at_issue" text DEFAULT 'NEW' NOT NULL,
	"status" text DEFAULT 'ISSUED' NOT NULL,
	"closed_at" text,
	"closed_by" text,
	"condition_on_close" text,
	"replacement_reason" text,
	"replaces_issue_id" text,
	"notes" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("staff_id") REFERENCES "hr_staff"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("variant_id") REFERENCES "hr_uniform_variants"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("replaces_issue_id") REFERENCES "hr_uniform_issues"("id") ON UPDATE no action ON DELETE no action,
	CHECK (status IN ('ISSUED', 'RETURNED', 'REPLACED')),
	CHECK (condition_at_issue IN ('NEW', 'GOOD', 'FAIR', 'DAMAGED', 'LOST')),
	CHECK (condition_on_close IS NULL OR condition_on_close IN ('NEW', 'GOOD', 'FAIR', 'DAMAGED', 'LOST')),
	CHECK (replacement_reason IS NULL OR replacement_reason IN ('WORN_OUT', 'DAMAGED', 'SIZE_CHANGE', 'LOST', 'OTHER')),
	CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS "idx_hr_uniform_issues_outlet_id" ON "hr_uniform_issues" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_hr_uniform_issues_staff_id" ON "hr_uniform_issues" ("staff_id");
CREATE INDEX IF NOT EXISTS "idx_hr_uniform_issues_variant_id" ON "hr_uniform_issues" ("variant_id");
CREATE INDEX IF NOT EXISTS "idx_hr_uniform_issues_status" ON "hr_uniform_issues" ("outlet_id", "status");

-- Triggers: Issue cross-reference integrity & lifecycle state validation
CREATE TRIGGER IF NOT EXISTS "trg_hr_uniform_issues_insert_validate"
BEFORE INSERT ON "hr_uniform_issues"
BEGIN
    SELECT
        CASE
            WHEN NOT EXISTS (SELECT 1 FROM hr_staff WHERE id = NEW.staff_id)
            THEN RAISE(ABORT, 'HR_UNIFORM_STAFF_NOT_FOUND')
            WHEN NEW.outlet_id != (SELECT outlet_id FROM hr_staff WHERE id = NEW.staff_id)
            THEN RAISE(ABORT, 'HR_UNIFORM_STAFF_OUTLET_MISMATCH')
            WHEN (SELECT employment_status FROM hr_staff WHERE id = NEW.staff_id) != 'ACTIVE'
            THEN RAISE(ABORT, 'HR_UNIFORM_STAFF_NOT_ACTIVE')

            WHEN NOT EXISTS (SELECT 1 FROM hr_uniform_variants WHERE id = NEW.variant_id)
            THEN RAISE(ABORT, 'HR_UNIFORM_VARIANT_NOT_FOUND')
            WHEN NEW.outlet_id != (SELECT outlet_id FROM hr_uniform_variants WHERE id = NEW.variant_id)
            THEN RAISE(ABORT, 'HR_UNIFORM_VARIANT_OUTLET_MISMATCH')
            WHEN (SELECT status FROM hr_uniform_variants WHERE id = NEW.variant_id) != 'ACTIVE'
            THEN RAISE(ABORT, 'HR_UNIFORM_VARIANT_INACTIVE')

            WHEN (SELECT status FROM hr_uniform_items WHERE id = (SELECT uniform_item_id FROM hr_uniform_variants WHERE id = NEW.variant_id)) != 'ACTIVE'
            THEN RAISE(ABORT, 'HR_UNIFORM_ITEM_INACTIVE')

            WHEN NEW.replaces_issue_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM hr_uniform_issues WHERE id = NEW.replaces_issue_id)
            THEN RAISE(ABORT, 'HR_UNIFORM_ISSUE_NOT_FOUND')
            WHEN NEW.replaces_issue_id IS NOT NULL AND NEW.replaces_issue_id = NEW.id
            THEN RAISE(ABORT, 'HR_UNIFORM_REPLACEMENT_SELF_REFERENCE')
            WHEN NEW.replaces_issue_id IS NOT NULL AND NEW.outlet_id != (SELECT outlet_id FROM hr_uniform_issues WHERE id = NEW.replaces_issue_id)
            THEN RAISE(ABORT, 'HR_UNIFORM_REPLACEMENT_SOURCE_MISMATCH')
            WHEN NEW.replaces_issue_id IS NOT NULL AND NEW.staff_id != (SELECT staff_id FROM hr_uniform_issues WHERE id = NEW.replaces_issue_id)
            THEN RAISE(ABORT, 'HR_UNIFORM_REPLACEMENT_SOURCE_MISMATCH')
        END;
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_uniform_issues_update_validate"
BEFORE UPDATE ON "hr_uniform_issues"
BEGIN
    SELECT
        CASE
            -- Prevent changing from closed state (RETURNED or REPLACED)
            WHEN OLD.status IN ('RETURNED', 'REPLACED')
            THEN RAISE(ABORT, 'HR_UNIFORM_ISSUE_ALREADY_CLOSED')
            
            -- ISSUED state must NOT have close fields
            WHEN NEW.status = 'ISSUED' AND (NEW.closed_at IS NOT NULL OR NEW.closed_by IS NOT NULL OR NEW.condition_on_close IS NOT NULL)
            THEN RAISE(ABORT, 'HR_UNIFORM_INVALID_RETURN_CONDITION')
            
            -- When closing to RETURNED or REPLACED, require close fields
            WHEN NEW.status IN ('RETURNED', 'REPLACED') AND (NEW.closed_at IS NULL OR NEW.closed_by IS NULL OR NEW.condition_on_close IS NULL)
            THEN RAISE(ABORT, 'HR_UNIFORM_INVALID_RETURN_CONDITION')
            
            -- When REPLACED, require replacement reason
            WHEN NEW.status = 'REPLACED' AND NEW.replacement_reason IS NULL
            THEN RAISE(ABORT, 'HR_UNIFORM_INVALID_RETURN_CONDITION')
        END;
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_uniform_issues_delete_forbidden"
BEFORE DELETE ON "hr_uniform_issues"
BEGIN
    SELECT RAISE(ABORT, 'HR_UNIFORM_ISSUE_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS "trg_hr_uniform_issues_identity_immutable"
BEFORE UPDATE ON "hr_uniform_issues"
BEGIN
    SELECT
        CASE
            WHEN (OLD.outlet_id IS NOT NEW.outlet_id) OR
                 (OLD.staff_id IS NOT NEW.staff_id) OR
                 (OLD.variant_id IS NOT NEW.variant_id) OR
                 (OLD.issued_at IS NOT NEW.issued_at) OR
                 (OLD.issued_by IS NOT NEW.issued_by) OR
                 (OLD.created_at IS NOT NEW.created_at)
            THEN RAISE(ABORT, 'HR_UNIFORM_ISSUE_IDENTITY_IMMUTABLE')
        END;
END;
