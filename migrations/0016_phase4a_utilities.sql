-- Migration 0016: Phase 4A-1 Electricity & Sub-meter Core Backend

INSERT OR IGNORE INTO "permissions" ("id", "code", "name", "description") VALUES
('perm-util-r', 'utilities.read', 'Read Utilities', 'View electricity accounts, bills, sub-meters, and readings'),
('perm-util-acc-w', 'utilities.accounts.write', 'Write Utility Accounts', 'Manage electricity accounts'),
('perm-util-bill-w', 'utilities.bills.write', 'Write Utility Bills', 'Create and update electricity bills'),
('perm-util-pay-w', 'utilities.payments.write', 'Write Utility Payments', 'Record payments for utility bills'),
('perm-util-sub-w', 'utilities.sub_meters.write', 'Write Utility Sub-Meters', 'Manage electricity sub-meters'),
('perm-util-read-w', 'utilities.sub_meter_readings.write', 'Write Utility Sub-Meter Readings', 'Record sub-meter electricity readings');

INSERT OR IGNORE INTO "role_permissions" ("role_id", "permission_id") VALUES
('role-admin', 'perm-util-r'), ('role-admin', 'perm-util-acc-w'), ('role-admin', 'perm-util-bill-w'), ('role-admin', 'perm-util-pay-w'), ('role-admin', 'perm-util-sub-w'), ('role-admin', 'perm-util-read-w'),
('role-so', 'perm-util-r'),
('role-do', 'perm-util-r'),
('role-bm', 'perm-util-r'), ('role-bm', 'perm-util-acc-w'), ('role-bm', 'perm-util-bill-w'), ('role-bm', 'perm-util-pay-w'), ('role-bm', 'perm-util-sub-w'), ('role-bm', 'perm-util-read-w'),
('role-fo', 'perm-util-r'), ('role-fo', 'perm-util-acc-w'), ('role-fo', 'perm-util-bill-w'), ('role-fo', 'perm-util-pay-w'), ('role-fo', 'perm-util-sub-w'), ('role-fo', 'perm-util-read-w'),
('role-dealer', 'perm-util-r'), ('role-dealer', 'perm-util-bill-w'), ('role-dealer', 'perm-util-pay-w'), ('role-dealer', 'perm-util-read-w'),
('role-csp', 'perm-util-r'), ('role-csp', 'perm-util-bill-w'), ('role-csp', 'perm-util-pay-w'), ('role-csp', 'perm-util-read-w');

CREATE TABLE IF NOT EXISTS "utility_electricity_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"consumer_number" text NOT NULL,
	"provider_name" text,
	"billing_cycle" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
    CHECK (status IN ('ACTIVE', 'INACTIVE')),
    CHECK (trim(consumer_number) <> ''),
    CHECK (trim(billing_cycle) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_util_elec_acc_outlet_consumer" ON "utility_electricity_accounts" ("outlet_id", "consumer_number");
CREATE INDEX IF NOT EXISTS "idx_util_elec_acc_outlet_id" ON "utility_electricity_accounts" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_util_elec_acc_status" ON "utility_electricity_accounts" ("status");

CREATE TABLE IF NOT EXISTS "utility_electricity_bills" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"electricity_account_id" text NOT NULL,
	"billing_period_start" text NOT NULL,
	"billing_period_end" text NOT NULL,
	"bill_amount_paise" integer NOT NULL,
	"due_date" text NOT NULL,
	"bill_document_id" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"payment_receipt_document_id" text,
	"payment_reference" text,
	"paid_at" text,
	"paid_by_user_id" text,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("electricity_account_id") REFERENCES "utility_electricity_accounts"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("bill_document_id") REFERENCES "documents"("id") ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY ("payment_receipt_document_id") REFERENCES "documents"("id") ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY ("paid_by_user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
    CHECK (bill_amount_paise >= 0),
    CHECK (trim(billing_period_start) <> ''),
    CHECK (trim(billing_period_end) <> ''),
    CHECK (trim(due_date) <> ''),
    CHECK (billing_period_end >= billing_period_start),
    CHECK (status IN ('PENDING', 'PAID')),
    CHECK (
        status != 'PAID' OR (
            payment_receipt_document_id IS NOT NULL AND
            paid_at IS NOT NULL AND
            paid_by_user_id IS NOT NULL
        )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_util_elec_bills_acc_period" ON "utility_electricity_bills" ("electricity_account_id", "billing_period_start", "billing_period_end");
CREATE INDEX IF NOT EXISTS "idx_util_elec_bills_outlet_id" ON "utility_electricity_bills" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_util_elec_bills_account_id" ON "utility_electricity_bills" ("electricity_account_id");
CREATE INDEX IF NOT EXISTS "idx_util_elec_bills_status" ON "utility_electricity_bills" ("status");
CREATE INDEX IF NOT EXISTS "idx_util_elec_bills_due_date" ON "utility_electricity_bills" ("due_date");
CREATE INDEX IF NOT EXISTS "idx_util_elec_bills_period_start" ON "utility_electricity_bills" ("billing_period_start");

CREATE TRIGGER IF NOT EXISTS "trg_util_elec_bill_paid_immutable"
BEFORE UPDATE ON "utility_electricity_bills"
BEGIN
    SELECT
        CASE
            WHEN OLD.status = 'PAID' AND (
                (OLD.outlet_id IS NOT NEW.outlet_id) OR
                (OLD.electricity_account_id IS NOT NEW.electricity_account_id) OR
                (OLD.billing_period_start IS NOT NEW.billing_period_start) OR
                (OLD.billing_period_end IS NOT NEW.billing_period_end) OR
                (OLD.bill_amount_paise IS NOT NEW.bill_amount_paise) OR
                (OLD.due_date IS NOT NEW.due_date) OR
                (OLD.bill_document_id IS NOT NEW.bill_document_id) OR
                (NEW.status != 'PAID') OR
                (OLD.payment_receipt_document_id IS NOT NEW.payment_receipt_document_id) OR
                (OLD.paid_at IS NOT NEW.paid_at) OR
                (OLD.paid_by_user_id IS NOT NEW.paid_by_user_id)
            ) THEN RAISE(ABORT, 'UTILITY_BILL_PAID_IMMUTABLE')
        END;
END;

CREATE TABLE IF NOT EXISTS "utility_sub_meters" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"meter_code" text NOT NULL,
	"name" text NOT NULL,
	"beneficiary_type" text NOT NULL,
	"beneficiary_name" text NOT NULL,
	"serial_number" text,
	"rate_paise_per_kwh" integer NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"commissioned_at" text,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
    CHECK (beneficiary_type IN ('NFR_VENDOR', 'CNG_FACILITY', 'OTHER')),
    CHECK (status IN ('ACTIVE', 'INACTIVE', 'DECOMMISSIONED')),
    CHECK (rate_paise_per_kwh >= 0),
    CHECK (trim(meter_code) <> ''),
    CHECK (trim(name) <> ''),
    CHECK (trim(beneficiary_name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_util_sub_meters_outlet_code" ON "utility_sub_meters" ("outlet_id", "meter_code");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_util_sub_meters_outlet_serial" ON "utility_sub_meters" ("outlet_id", "serial_number") WHERE serial_number IS NOT NULL AND trim(serial_number) <> '';
CREATE INDEX IF NOT EXISTS "idx_util_sub_meters_outlet_id" ON "utility_sub_meters" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_util_sub_meters_beneficiary_type" ON "utility_sub_meters" ("beneficiary_type");
CREATE INDEX IF NOT EXISTS "idx_util_sub_meters_status" ON "utility_sub_meters" ("status");

CREATE TABLE IF NOT EXISTS "utility_sub_meter_readings" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"sub_meter_id" text NOT NULL,
	"previous_reading_id" text,
	"reading_at" text NOT NULL,
	"reading_millikwh" integer NOT NULL,
	"previous_reading_millikwh" integer,
	"consumption_millikwh" integer NOT NULL,
	"rate_paise_per_kwh_snapshot" integer NOT NULL,
	"charge_paise" integer NOT NULL,
	"recorded_by_user_id" text NOT NULL,
	"notes" text,
	"created_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("sub_meter_id") REFERENCES "utility_sub_meters"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("previous_reading_id") REFERENCES "utility_sub_meter_readings"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
    CHECK (reading_millikwh >= 0),
    CHECK (consumption_millikwh >= 0),
    CHECK (rate_paise_per_kwh_snapshot >= 0),
    CHECK (charge_paise >= 0),
    CHECK (
        (previous_reading_id IS NULL AND previous_reading_millikwh IS NULL AND consumption_millikwh = 0) OR
        (previous_reading_id IS NOT NULL AND previous_reading_millikwh IS NOT NULL AND consumption_millikwh = reading_millikwh - previous_reading_millikwh)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_util_sub_meter_readings_prev" ON "utility_sub_meter_readings" ("previous_reading_id") WHERE previous_reading_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_util_sub_meter_readings_meter_time" ON "utility_sub_meter_readings" ("sub_meter_id", "reading_at");
CREATE INDEX IF NOT EXISTS "idx_util_sub_meter_readings_outlet_time" ON "utility_sub_meter_readings" ("outlet_id", "reading_at");

CREATE TRIGGER IF NOT EXISTS "trg_util_sub_meter_reading_insert_chain"
BEFORE INSERT ON "utility_sub_meter_readings"
BEGIN
    SELECT
        CASE
            WHEN NEW.previous_reading_id IS NOT NULL THEN
                CASE
                    WHEN NOT EXISTS (
                        SELECT 1 FROM "utility_sub_meter_readings" prev
                        WHERE prev.id = NEW.previous_reading_id
                          AND prev.sub_meter_id = NEW.sub_meter_id
                          AND prev.outlet_id = NEW.outlet_id
                    ) THEN RAISE(ABORT, 'SUB_METER_READING_INVALID_PREDECESSOR')
                    WHEN (
                        SELECT prev.reading_at FROM "utility_sub_meter_readings" prev
                        WHERE prev.id = NEW.previous_reading_id
                    ) >= NEW.reading_at THEN RAISE(ABORT, 'SUB_METER_READING_OUT_OF_ORDER')
                    WHEN (
                        SELECT prev.reading_millikwh FROM "utility_sub_meter_readings" prev
                        WHERE prev.id = NEW.previous_reading_id
                    ) > NEW.reading_millikwh THEN RAISE(ABORT, 'SUB_METER_READING_DECREASE')
                    WHEN (
                        SELECT prev.reading_millikwh FROM "utility_sub_meter_readings" prev
                        WHERE prev.id = NEW.previous_reading_id
                    ) != NEW.previous_reading_millikwh THEN RAISE(ABORT, 'SUB_METER_READING_MISMATCH_PREV_VALUE')
                END
        END;
END;

CREATE TRIGGER IF NOT EXISTS "trg_util_sub_meter_reading_immutable_update"
BEFORE UPDATE ON "utility_sub_meter_readings"
BEGIN
    SELECT RAISE(ABORT, 'UTILITY_SUB_METER_READING_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS "trg_util_sub_meter_reading_immutable_delete"
BEFORE DELETE ON "utility_sub_meter_readings"
BEGIN
    SELECT RAISE(ABORT, 'UTILITY_SUB_METER_READING_IMMUTABLE');
END;
