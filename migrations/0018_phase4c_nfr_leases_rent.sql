-- Migration 0018: Phase 4C-1 NFR / Vendor Lease & Rent Core Backend

INSERT OR IGNORE INTO "permissions" ("id", "code", "name", "description") VALUES
('perm-nfr-r', 'nfr.read', 'Read NFR Operations', 'View NFR spaces, vendors, leases, rent dues, and payment records'),
('perm-nfr-master-w', 'nfr.master.write', 'Write NFR Master Data', 'Create and update NFR spaces and vendor masters'),
('perm-nfr-lease-w', 'nfr.leases.write', 'Write NFR Leases', 'Create, update, and terminate NFR lease agreements'),
('perm-nfr-due-w', 'nfr.rent_dues.write', 'Generate NFR Rent Dues', 'Generate monthly authoritative rent dues for NFR leases'),
('perm-nfr-pay-w', 'nfr.rent_payments.write', 'Record NFR Rent Payments', 'Record rent collections and payment receipts for NFR rent dues');

INSERT OR IGNORE INTO "role_permissions" ("role_id", "permission_id") VALUES
('role-admin', 'perm-nfr-r'), ('role-admin', 'perm-nfr-master-w'), ('role-admin', 'perm-nfr-lease-w'), ('role-admin', 'perm-nfr-due-w'), ('role-admin', 'perm-nfr-pay-w'),
('role-so', 'perm-nfr-r'),
('role-do', 'perm-nfr-r'),
('role-bm', 'perm-nfr-r'), ('role-bm', 'perm-nfr-master-w'), ('role-bm', 'perm-nfr-lease-w'), ('role-bm', 'perm-nfr-due-w'), ('role-bm', 'perm-nfr-pay-w'),
('role-fo', 'perm-nfr-r'), ('role-fo', 'perm-nfr-master-w'), ('role-fo', 'perm-nfr-lease-w'), ('role-fo', 'perm-nfr-due-w'), ('role-fo', 'perm-nfr-pay-w'),
('role-dealer', 'perm-nfr-r'), ('role-dealer', 'perm-nfr-pay-w'),
('role-csp', 'perm-nfr-r'), ('role-csp', 'perm-nfr-pay-w');

-- 1. NFR SPACES
CREATE TABLE IF NOT EXISTS "nfr_spaces" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"space_code" text NOT NULL,
	"name" text NOT NULL,
	"nfr_type" text NOT NULL,
	"location_description" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
    CHECK (nfr_type IN ('ATM', 'CONVENIENCE_STORE', 'QSR', 'CAR_WASH', 'EV_CHARGING', 'CANOPY_ADVERTISING')),
    CHECK (status IN ('ACTIVE', 'INACTIVE')),
    CHECK (trim(space_code) <> ''),
    CHECK (trim(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_nfr_spaces_outlet_code" ON "nfr_spaces" ("outlet_id", "space_code");
CREATE INDEX IF NOT EXISTS "idx_nfr_spaces_outlet_id" ON "nfr_spaces" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_nfr_spaces_outlet_type" ON "nfr_spaces" ("outlet_id", "nfr_type");
CREATE INDEX IF NOT EXISTS "idx_nfr_spaces_outlet_status" ON "nfr_spaces" ("outlet_id", "status");

CREATE TRIGGER IF NOT EXISTS "trg_nfr_spaces_delete_forbidden"
BEFORE DELETE ON "nfr_spaces"
BEGIN
    SELECT RAISE(ABORT, 'NFR_SPACE_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS "trg_nfr_spaces_identity_immutable"
BEFORE UPDATE ON "nfr_spaces"
BEGIN
    SELECT
        CASE
            WHEN (OLD.outlet_id IS NOT NEW.outlet_id) OR
                 (OLD.space_code IS NOT NEW.space_code) OR
                 (OLD.created_by IS NOT NEW.created_by) OR
                 (OLD.created_at IS NOT NEW.created_at)
            THEN RAISE(ABORT, 'NFR_SPACE_IDENTITY_IMMUTABLE')
        END;
END;

-- 2. NFR VENDORS
CREATE TABLE IF NOT EXISTS "nfr_vendors" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"vendor_name" text NOT NULL,
	"owner_contact_name" text NOT NULL,
	"owner_contact_phone" text NOT NULL,
	"owner_contact_email" text,
	"address" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
    CHECK (status IN ('ACTIVE', 'INACTIVE')),
    CHECK (trim(vendor_name) <> ''),
    CHECK (trim(owner_contact_name) <> ''),
    CHECK (trim(owner_contact_phone) <> '')
);

CREATE INDEX IF NOT EXISTS "idx_nfr_vendors_outlet_id" ON "nfr_vendors" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_nfr_vendors_outlet_status" ON "nfr_vendors" ("outlet_id", "status");

CREATE TRIGGER IF NOT EXISTS "trg_nfr_vendors_delete_forbidden"
BEFORE DELETE ON "nfr_vendors"
BEGIN
    SELECT RAISE(ABORT, 'NFR_VENDOR_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS "trg_nfr_vendors_identity_immutable"
BEFORE UPDATE ON "nfr_vendors"
BEGIN
    SELECT
        CASE
            WHEN (OLD.outlet_id IS NOT NEW.outlet_id) OR
                 (OLD.created_by IS NOT NEW.created_by) OR
                 (OLD.created_at IS NOT NEW.created_at)
            THEN RAISE(ABORT, 'NFR_VENDOR_IDENTITY_IMMUTABLE')
        END;
END;

-- 3. NFR LEASES
CREATE TABLE IF NOT EXISTS "nfr_leases" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"space_id" text NOT NULL,
	"vendor_id" text NOT NULL,
	"agreement_number" text NOT NULL,
	"lease_start_date" text NOT NULL,
	"lease_end_date" text NOT NULL,
	"monthly_rent_paise" integer NOT NULL,
	"security_deposit_paise" integer NOT NULL,
	"monthly_due_day" integer NOT NULL,
	"agreement_document_id" text,
	"sub_meter_id" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"terminated_at" text,
	"termination_reason" text,
	"terminated_by_user_id" text,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("space_id") REFERENCES "nfr_spaces"("id") ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY ("vendor_id") REFERENCES "nfr_vendors"("id") ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY ("agreement_document_id") REFERENCES "documents"("id") ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY ("sub_meter_id") REFERENCES "utility_sub_meters"("id") ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY ("terminated_by_user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
    CHECK (status IN ('ACTIVE', 'TERMINATED')),
    CHECK (trim(agreement_number) <> ''),
    CHECK (lease_end_date >= lease_start_date),
    CHECK (monthly_rent_paise > 0 AND monthly_rent_paise <= 9000000000000000),
    CHECK (security_deposit_paise >= 0 AND security_deposit_paise <= 9000000000000000),
    CHECK (monthly_due_day >= 1 AND monthly_due_day <= 31),
    CHECK (
        (status = 'ACTIVE' AND terminated_at IS NULL AND terminated_by_user_id IS NULL) OR
        (status = 'TERMINATED' AND terminated_at IS NOT NULL AND terminated_by_user_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_nfr_leases_outlet_agreement" ON "nfr_leases" ("outlet_id", "agreement_number");
CREATE INDEX IF NOT EXISTS "idx_nfr_leases_outlet_id" ON "nfr_leases" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_nfr_leases_space_id" ON "nfr_leases" ("space_id");
CREATE INDEX IF NOT EXISTS "idx_nfr_leases_vendor_id" ON "nfr_leases" ("vendor_id");
CREATE INDEX IF NOT EXISTS "idx_nfr_leases_outlet_status" ON "nfr_leases" ("outlet_id", "status");
CREATE INDEX IF NOT EXISTS "idx_nfr_leases_dates" ON "nfr_leases" ("lease_start_date", "lease_end_date");

CREATE TRIGGER IF NOT EXISTS "trg_nfr_leases_delete_forbidden"
BEFORE DELETE ON "nfr_leases"
BEGIN
    SELECT RAISE(ABORT, 'NFR_LEASE_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS "trg_nfr_leases_identity_immutable"
BEFORE UPDATE ON "nfr_leases"
BEGIN
    SELECT
        CASE
            WHEN (OLD.outlet_id IS NOT NEW.outlet_id) OR
                 (OLD.created_by IS NOT NEW.created_by) OR
                 (OLD.created_at IS NOT NEW.created_at)
            THEN RAISE(ABORT, 'NFR_LEASE_IDENTITY_IMMUTABLE')
        END;
END;

CREATE TRIGGER IF NOT EXISTS "trg_nfr_leases_terminated_immutable"
BEFORE UPDATE ON "nfr_leases"
FOR EACH ROW
WHEN OLD.status = 'TERMINATED'
BEGIN
    SELECT RAISE(ABORT, 'NFR_LEASE_TERMINATED_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS "trg_nfr_leases_insert_integrity"
BEFORE INSERT ON "nfr_leases"
BEGIN
    SELECT
        CASE
            WHEN NOT EXISTS (
                SELECT 1 FROM "nfr_spaces"
                WHERE "nfr_spaces"."id" = NEW.space_id
                  AND "nfr_spaces"."outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'NFR_LEASE_SPACE_OUTLET_MISMATCH')
            WHEN NOT EXISTS (
                SELECT 1 FROM "nfr_vendors"
                WHERE "nfr_vendors"."id" = NEW.vendor_id
                  AND "nfr_vendors"."outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'NFR_LEASE_VENDOR_OUTLET_MISMATCH')
            WHEN NEW.agreement_document_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM "documents"
                WHERE "documents"."id" = NEW.agreement_document_id
                  AND "documents"."outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'NFR_LEASE_DOCUMENT_OUTLET_MISMATCH')
            WHEN NEW.sub_meter_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM "utility_sub_meters"
                WHERE "utility_sub_meters"."id" = NEW.sub_meter_id
                  AND "utility_sub_meters"."outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'NFR_LEASE_SUB_METER_OUTLET_MISMATCH')
            WHEN NEW.sub_meter_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM "utility_sub_meters"
                WHERE "utility_sub_meters"."id" = NEW.sub_meter_id
                  AND "utility_sub_meters"."outlet_id" = NEW.outlet_id
                  AND "utility_sub_meters"."beneficiary_type" = 'NFR_VENDOR'
            ) THEN RAISE(ABORT, 'NFR_LEASE_SUB_METER_NOT_NFR')
            WHEN NEW.status != 'TERMINATED' AND EXISTS (
                SELECT 1 FROM "nfr_leases"
                WHERE "nfr_leases"."space_id" = NEW.space_id
                  AND "nfr_leases"."id" != NEW.id
                  AND "nfr_leases"."status" != 'TERMINATED'
                  AND "nfr_leases"."lease_start_date" <= NEW.lease_end_date
                  AND "nfr_leases"."lease_end_date" >= NEW.lease_start_date
            ) THEN RAISE(ABORT, 'NFR_SPACE_LEASE_OVERLAP')
        END;
END;

CREATE TRIGGER IF NOT EXISTS "trg_nfr_leases_update_integrity"
BEFORE UPDATE ON "nfr_leases"
BEGIN
    SELECT
        CASE
            WHEN NOT EXISTS (
                SELECT 1 FROM "nfr_spaces"
                WHERE "nfr_spaces"."id" = NEW.space_id
                  AND "nfr_spaces"."outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'NFR_LEASE_SPACE_OUTLET_MISMATCH')
            WHEN NOT EXISTS (
                SELECT 1 FROM "nfr_vendors"
                WHERE "nfr_vendors"."id" = NEW.vendor_id
                  AND "nfr_vendors"."outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'NFR_LEASE_VENDOR_OUTLET_MISMATCH')
            WHEN NEW.agreement_document_id IS NOT NULL AND (OLD.agreement_document_id IS NULL OR OLD.agreement_document_id != NEW.agreement_document_id) AND NOT EXISTS (
                SELECT 1 FROM "documents"
                WHERE "documents"."id" = NEW.agreement_document_id
                  AND "documents"."outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'NFR_LEASE_DOCUMENT_OUTLET_MISMATCH')
            WHEN NEW.sub_meter_id IS NOT NULL AND (OLD.sub_meter_id IS NULL OR OLD.sub_meter_id != NEW.sub_meter_id) AND NOT EXISTS (
                SELECT 1 FROM "utility_sub_meters"
                WHERE "utility_sub_meters"."id" = NEW.sub_meter_id
                  AND "utility_sub_meters"."outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'NFR_LEASE_SUB_METER_OUTLET_MISMATCH')
            WHEN NEW.sub_meter_id IS NOT NULL AND (OLD.sub_meter_id IS NULL OR OLD.sub_meter_id != NEW.sub_meter_id) AND NOT EXISTS (
                SELECT 1 FROM "utility_sub_meters"
                WHERE "utility_sub_meters"."id" = NEW.sub_meter_id
                  AND "utility_sub_meters"."outlet_id" = NEW.outlet_id
                  AND "utility_sub_meters"."beneficiary_type" = 'NFR_VENDOR'
            ) THEN RAISE(ABORT, 'NFR_LEASE_SUB_METER_NOT_NFR')
            WHEN NEW.status != 'TERMINATED' AND EXISTS (
                SELECT 1 FROM "nfr_leases"
                WHERE "nfr_leases"."space_id" = NEW.space_id
                  AND "nfr_leases"."id" != NEW.id
                  AND "nfr_leases"."status" != 'TERMINATED'
                  AND "nfr_leases"."lease_start_date" <= NEW.lease_end_date
                  AND "nfr_leases"."lease_end_date" >= NEW.lease_start_date
            ) THEN RAISE(ABORT, 'NFR_SPACE_LEASE_OVERLAP')
        END;
END;

-- 4. NFR RENT DUES
CREATE TABLE IF NOT EXISTS "nfr_rent_dues" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"lease_id" text NOT NULL,
	"billing_month" text NOT NULL,
	"rent_period_start" text NOT NULL,
	"rent_period_end" text NOT NULL,
	"due_date" text NOT NULL,
	"monthly_rent_paise_snapshot" integer NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("lease_id") REFERENCES "nfr_leases"("id") ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
    CHECK (rent_period_end >= rent_period_start),
    CHECK (monthly_rent_paise_snapshot > 0 AND monthly_rent_paise_snapshot <= 9000000000000000),
    CHECK (trim(billing_month) <> ''),
    CHECK (trim(due_date) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_nfr_rent_dues_lease_month" ON "nfr_rent_dues" ("lease_id", "billing_month");
CREATE INDEX IF NOT EXISTS "idx_nfr_rent_dues_outlet_id" ON "nfr_rent_dues" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_nfr_rent_dues_lease_id" ON "nfr_rent_dues" ("lease_id");
CREATE INDEX IF NOT EXISTS "idx_nfr_rent_dues_due_date" ON "nfr_rent_dues" ("outlet_id", "due_date");
CREATE INDEX IF NOT EXISTS "idx_nfr_rent_dues_billing_month" ON "nfr_rent_dues" ("billing_month");

CREATE TRIGGER IF NOT EXISTS "trg_nfr_rent_dues_delete_forbidden"
BEFORE DELETE ON "nfr_rent_dues"
BEGIN
    SELECT RAISE(ABORT, 'NFR_RENT_DUE_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS "trg_nfr_rent_dues_update_forbidden"
BEFORE UPDATE ON "nfr_rent_dues"
BEGIN
    SELECT RAISE(ABORT, 'NFR_RENT_DUE_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS "trg_nfr_rent_dues_insert_integrity"
BEFORE INSERT ON "nfr_rent_dues"
BEGIN
    SELECT
        CASE
            WHEN NOT EXISTS (
                SELECT 1 FROM "nfr_leases"
                WHERE "nfr_leases"."id" = NEW.lease_id
                  AND "nfr_leases"."outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'NFR_RENT_DUE_OUTLET_MISMATCH')
        END;
END;

-- 5. NFR RENT PAYMENTS
CREATE TABLE IF NOT EXISTS "nfr_rent_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"rent_due_id" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"receipt_document_id" text NOT NULL,
	"payment_reference" text,
	"paid_at" text NOT NULL,
	"recorded_by_user_id" text NOT NULL,
	"notes" text,
	"created_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("rent_due_id") REFERENCES "nfr_rent_dues"("id") ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY ("receipt_document_id") REFERENCES "documents"("id") ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
    CHECK (amount_paise > 0 AND amount_paise <= 9000000000000000),
    CHECK (trim(paid_at) <> '')
);

CREATE INDEX IF NOT EXISTS "idx_nfr_rent_payments_outlet_id" ON "nfr_rent_payments" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_nfr_rent_payments_due_id" ON "nfr_rent_payments" ("rent_due_id");
CREATE INDEX IF NOT EXISTS "idx_nfr_rent_payments_paid_at" ON "nfr_rent_payments" ("paid_at");

CREATE TRIGGER IF NOT EXISTS "trg_nfr_rent_payments_delete_forbidden"
BEFORE DELETE ON "nfr_rent_payments"
BEGIN
    SELECT RAISE(ABORT, 'NFR_RENT_PAYMENT_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS "trg_nfr_rent_payments_update_forbidden"
BEFORE UPDATE ON "nfr_rent_payments"
BEGIN
    SELECT RAISE(ABORT, 'NFR_RENT_PAYMENT_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS "trg_nfr_rent_payments_overpayment_insert"
BEFORE INSERT ON "nfr_rent_payments"
BEGIN
    SELECT
        CASE
            WHEN NOT EXISTS (
                SELECT 1 FROM "nfr_rent_dues"
                WHERE "nfr_rent_dues"."id" = NEW.rent_due_id
                  AND "nfr_rent_dues"."outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'NFR_RENT_PAYMENT_OUTLET_MISMATCH')
            WHEN NOT EXISTS (
                SELECT 1 FROM "documents"
                WHERE "documents"."id" = NEW.receipt_document_id
                  AND "documents"."outlet_id" = NEW.outlet_id
            ) THEN RAISE(ABORT, 'NFR_RENT_RECEIPT_OUTLET_MISMATCH')
            WHEN (
                SELECT COALESCE(SUM("amount_paise"), 0)
                FROM "nfr_rent_payments"
                WHERE "rent_due_id" = NEW.rent_due_id
            ) >= (
                SELECT "monthly_rent_paise_snapshot"
                FROM "nfr_rent_dues"
                WHERE "id" = NEW.rent_due_id
            ) THEN RAISE(ABORT, 'NFR_RENT_ALREADY_PAID')
            WHEN (
                SELECT COALESCE(SUM("amount_paise"), 0)
                FROM "nfr_rent_payments"
                WHERE "rent_due_id" = NEW.rent_due_id
            ) + NEW.amount_paise > (
                SELECT "monthly_rent_paise_snapshot"
                FROM "nfr_rent_dues"
                WHERE "id" = NEW.rent_due_id
            ) THEN RAISE(ABORT, 'NFR_RENT_OVERPAYMENT')
        END;
END;
