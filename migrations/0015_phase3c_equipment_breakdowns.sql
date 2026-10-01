-- Migration 0015: Phase 3C-1 Equipment Breakdown Management

CREATE TABLE IF NOT EXISTS "equipment_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"asset_code" text NOT NULL,
	"equipment_type" text NOT NULL,
	"name" text NOT NULL,
	"manufacturer" text,
	"model" text,
	"serial_number" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"commissioned_at" text,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_eq_assets_outlet_code_unique" ON "equipment_assets" ("outlet_id","asset_code");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_eq_assets_outlet_serial_unique" ON "equipment_assets" ("outlet_id","serial_number") WHERE serial_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_eq_assets_outlet_id" ON "equipment_assets" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_eq_assets_type" ON "equipment_assets" ("equipment_type");
CREATE INDEX IF NOT EXISTS "idx_eq_assets_status" ON "equipment_assets" ("status");

CREATE TABLE IF NOT EXISTS "equipment_breakdown_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"dispenser_id" text,
	"equipment_asset_id" text,
	"equipment_type_snapshot" text NOT NULL,
	"equipment_label_snapshot" text NOT NULL,
	"priority" text NOT NULL,
	"failure_category" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"breakdown_at" text NOT NULL,
	"technician_name" text,
	"technician_phone" text,
	"assigned_at" text,
	"assigned_by_user_id" text,
	"resolution_notes" text,
	"resolved_at" text,
	"resolved_by_user_id" text,
	"downtime_seconds" integer,
	"signoff_notes" text,
	"signed_off_at" text,
	"signed_off_by_user_id" text,
	"cancel_reason" text,
	"cancelled_at" text,
	"cancelled_by_user_id" text,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("dispenser_id") REFERENCES "dispensers"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("equipment_asset_id") REFERENCES "equipment_assets"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("signed_off_by_user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
    CHECK ( (dispenser_id IS NOT NULL AND equipment_asset_id IS NULL) OR (dispenser_id IS NULL AND equipment_asset_id IS NOT NULL) )
);

CREATE INDEX IF NOT EXISTS "idx_eq_tickets_outlet_id" ON "equipment_breakdown_tickets" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_eq_tickets_dispenser_id" ON "equipment_breakdown_tickets" ("dispenser_id");
CREATE INDEX IF NOT EXISTS "idx_eq_tickets_asset_id" ON "equipment_breakdown_tickets" ("equipment_asset_id");
CREATE INDEX IF NOT EXISTS "idx_eq_tickets_status" ON "equipment_breakdown_tickets" ("status");

CREATE TABLE IF NOT EXISTS "equipment_breakdown_events" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"event_type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"notes" text,
	"actor_user_id" text NOT NULL,
	"created_at" text NOT NULL,
	FOREIGN KEY ("ticket_id") REFERENCES "equipment_breakdown_tickets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action
);

CREATE INDEX IF NOT EXISTS "idx_eq_events_ticket_id" ON "equipment_breakdown_events" ("ticket_id");

-- Triggers for lifecycle and immutability protection

-- Immutability Trigger
CREATE TRIGGER IF NOT EXISTS "trg_eq_ticket_immutability"
BEFORE UPDATE ON "equipment_breakdown_tickets"
BEGIN
    SELECT
        CASE
            WHEN OLD.outlet_id <> NEW.outlet_id THEN RAISE(ABORT, 'EQUIPMENT_TICKET_IMMUTABLE_FIELDS')
            WHEN OLD.dispenser_id <> NEW.dispenser_id THEN RAISE(ABORT, 'EQUIPMENT_TICKET_IMMUTABLE_FIELDS')
            WHEN OLD.equipment_asset_id <> NEW.equipment_asset_id THEN RAISE(ABORT, 'EQUIPMENT_TICKET_IMMUTABLE_FIELDS')
            WHEN OLD.equipment_type_snapshot <> NEW.equipment_type_snapshot THEN RAISE(ABORT, 'EQUIPMENT_TICKET_IMMUTABLE_FIELDS')
            WHEN OLD.equipment_label_snapshot <> NEW.equipment_label_snapshot THEN RAISE(ABORT, 'EQUIPMENT_TICKET_IMMUTABLE_FIELDS')
            WHEN OLD.breakdown_at <> NEW.breakdown_at THEN RAISE(ABORT, 'EQUIPMENT_TICKET_IMMUTABLE_FIELDS')
        END;
END;

-- Lifecycle Trigger
CREATE TRIGGER IF NOT EXISTS "trg_eq_ticket_lifecycle"
BEFORE UPDATE OF "status" ON "equipment_breakdown_tickets"
BEGIN
    SELECT
        CASE
            WHEN OLD.status = 'OPEN' AND NEW.status NOT IN ('ASSIGNED', 'CANCELLED') THEN RAISE(ABORT, 'INVALID_EQUIPMENT_TICKET_TRANSITION')
            WHEN OLD.status = 'ASSIGNED' AND NEW.status NOT IN ('IN_PROGRESS', 'CANCELLED') THEN RAISE(ABORT, 'INVALID_EQUIPMENT_TICKET_TRANSITION')
            WHEN OLD.status = 'IN_PROGRESS' AND NEW.status NOT IN ('RESOLVED') THEN RAISE(ABORT, 'INVALID_EQUIPMENT_TICKET_TRANSITION')
            WHEN OLD.status = 'RESOLVED' AND NEW.status NOT IN ('CLOSED') THEN RAISE(ABORT, 'INVALID_EQUIPMENT_TICKET_TRANSITION')
            WHEN OLD.status IN ('CLOSED', 'CANCELLED') THEN RAISE(ABORT, 'INVALID_EQUIPMENT_TICKET_TRANSITION')
        END;
END;
