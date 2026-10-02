-- Migration 0017: Phase 4B-1 Municipal Taxes & Statutory Dues Core Backend

INSERT OR IGNORE INTO "permissions" ("id", "code", "name", "description") VALUES
('perm-mtax-r', 'municipal_taxes.read', 'Read Municipal Taxes', 'View property taxes, trade license fees, signage charges, and statutory payment status'),
('perm-mtax-w', 'municipal_taxes.write', 'Write Municipal Taxes', 'Create and update municipal tax assessments and statutory due records'),
('perm-mtax-pay-w', 'municipal_taxes.payments.write', 'Record Municipal Tax Payments', 'Record statutory due payments with mandatory receipt attachment');

INSERT OR IGNORE INTO "role_permissions" ("role_id", "permission_id") VALUES
('role-admin', 'perm-mtax-r'), ('role-admin', 'perm-mtax-w'), ('role-admin', 'perm-mtax-pay-w'),
('role-so', 'perm-mtax-r'),
('role-do', 'perm-mtax-r'),
('role-bm', 'perm-mtax-r'), ('role-bm', 'perm-mtax-w'), ('role-bm', 'perm-mtax-pay-w'),
('role-fo', 'perm-mtax-r'), ('role-fo', 'perm-mtax-w'), ('role-fo', 'perm-mtax-pay-w'),
('role-dealer', 'perm-mtax-r'), ('role-dealer', 'perm-mtax-pay-w'),
('role-csp', 'perm-mtax-r'), ('role-csp', 'perm-mtax-pay-w');

CREATE TABLE IF NOT EXISTS "municipal_tax_dues" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"tax_type" text NOT NULL,
	"authority_name" text NOT NULL,
	"reference_number" text NOT NULL,
	"assessment_frequency" text NOT NULL,
	"assessment_period_start" text NOT NULL,
	"assessment_period_end" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"due_date" text NOT NULL,
	"assessment_document_id" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"payment_receipt_document_id" text,
	"payment_reference" text,
	"paid_at" text,
	"paid_by_user_id" text,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("assessment_document_id") REFERENCES "documents"("id") ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY ("payment_receipt_document_id") REFERENCES "documents"("id") ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY ("paid_by_user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
    CHECK (tax_type IN ('PROPERTY_TAX', 'TRADE_LICENSE_FEE', 'SIGNAGE_CHARGE', 'LOCAL_AUTHORITY_DUE')),
    CHECK (assessment_frequency IN ('ANNUAL', 'QUARTERLY')),
    CHECK (status IN ('PENDING', 'PAID')),
    CHECK (trim(authority_name) <> ''),
    CHECK (trim(reference_number) <> ''),
    CHECK (trim(assessment_period_start) <> ''),
    CHECK (trim(assessment_period_end) <> ''),
    CHECK (trim(due_date) <> ''),
    CHECK (assessment_period_end >= assessment_period_start),
    CHECK (amount_paise > 0 AND amount_paise <= 9000000000000000),
    CHECK (
        (status = 'PENDING' AND payment_receipt_document_id IS NULL AND paid_at IS NULL AND paid_by_user_id IS NULL) OR
        (status = 'PAID' AND payment_receipt_document_id IS NOT NULL AND paid_at IS NOT NULL AND paid_by_user_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_municipal_tax_statutory_identity" ON "municipal_tax_dues" (
    "outlet_id",
    "tax_type",
    "authority_name",
    "reference_number",
    "assessment_period_start",
    "assessment_period_end"
);

CREATE INDEX IF NOT EXISTS "idx_municipal_tax_outlet_id" ON "municipal_tax_dues" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_municipal_tax_outlet_status" ON "municipal_tax_dues" ("outlet_id", "status");
CREATE INDEX IF NOT EXISTS "idx_municipal_tax_outlet_due_date" ON "municipal_tax_dues" ("outlet_id", "due_date");
CREATE INDEX IF NOT EXISTS "idx_municipal_tax_outlet_tax_type" ON "municipal_tax_dues" ("outlet_id", "tax_type");
CREATE INDEX IF NOT EXISTS "idx_municipal_tax_outlet_frequency" ON "municipal_tax_dues" ("outlet_id", "assessment_frequency");
CREATE INDEX IF NOT EXISTS "idx_municipal_tax_period_start" ON "municipal_tax_dues" ("assessment_period_start");
CREATE INDEX IF NOT EXISTS "idx_municipal_tax_reference_number" ON "municipal_tax_dues" ("reference_number");

CREATE TRIGGER IF NOT EXISTS "trg_municipal_tax_delete_forbidden"
BEFORE DELETE ON "municipal_tax_dues"
BEGIN
    SELECT RAISE(ABORT, 'MUNICIPAL_TAX_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS "trg_municipal_tax_identity_immutable"
BEFORE UPDATE ON "municipal_tax_dues"
BEGIN
    SELECT
        CASE
            WHEN (OLD.outlet_id IS NOT NEW.outlet_id) OR
                 (OLD.created_by IS NOT NEW.created_by) OR
                 (OLD.created_at IS NOT NEW.created_at)
            THEN RAISE(ABORT, 'MUNICIPAL_TAX_IDENTITY_IMMUTABLE')
        END;
END;

CREATE TRIGGER IF NOT EXISTS "trg_municipal_tax_paid_immutable"
BEFORE UPDATE ON "municipal_tax_dues"
FOR EACH ROW
WHEN OLD.status = 'PAID'
BEGIN
    SELECT RAISE(ABORT, 'MUNICIPAL_TAX_PAID_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS "trg_municipal_tax_doc_outlet_insert"
BEFORE INSERT ON "municipal_tax_dues"
BEGIN
    SELECT
        CASE
            WHEN NEW.assessment_document_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM "documents"
                WHERE "documents"."id" = NEW.assessment_document_id
                  AND "documents"."outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'MUNICIPAL_TAX_DOCUMENT_OUTLET_MISMATCH')
            WHEN NEW.payment_receipt_document_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM "documents"
                WHERE "documents"."id" = NEW.payment_receipt_document_id
                  AND "documents"."outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'MUNICIPAL_TAX_RECEIPT_OUTLET_MISMATCH')
        END;
END;

CREATE TRIGGER IF NOT EXISTS "trg_municipal_tax_doc_outlet_update"
BEFORE UPDATE ON "municipal_tax_dues"
BEGIN
    SELECT
        CASE
            WHEN NEW.assessment_document_id IS NOT NULL AND (OLD.assessment_document_id IS NULL OR OLD.assessment_document_id != NEW.assessment_document_id) AND NOT EXISTS (
                SELECT 1 FROM "documents"
                WHERE "documents"."id" = NEW.assessment_document_id
                  AND "documents"."outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'MUNICIPAL_TAX_DOCUMENT_OUTLET_MISMATCH')
            WHEN NEW.payment_receipt_document_id IS NOT NULL AND (OLD.payment_receipt_document_id IS NULL OR OLD.payment_receipt_document_id != NEW.payment_receipt_document_id) AND NOT EXISTS (
                SELECT 1 FROM "documents"
                WHERE "documents"."id" = NEW.payment_receipt_document_id
                  AND "documents"."outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'MUNICIPAL_TAX_RECEIPT_OUTLET_MISMATCH')
        END;
END;
