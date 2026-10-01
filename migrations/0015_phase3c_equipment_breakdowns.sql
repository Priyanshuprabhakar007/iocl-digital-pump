-- Migration 0015: Phase 3C-1 Equipment Breakdown Management

INSERT OR IGNORE INTO "roles" ("id", "code", "name", "description") VALUES
('role-admin', 'ADMIN', 'System Administrator', 'Full access across all organizational units and capabilities'),
('role-so', 'STATE_OFFICE', 'State Office Executive', 'State-level oversight, user scope management, and monitoring'),
('role-do', 'DIVISIONAL_OFFICE', 'Divisional Office Manager', 'Divisional operations management and outlet supervision'),
('role-bm', 'BUSINESS_MANAGER', 'Business Manager', 'Regional business analytics and field officer supervision'),
('role-fo', 'FIELD_OFFICER', 'Field Officer', 'Field level inspection and retail outlet compliance manager'),
('role-dealer', 'DEALER', 'Retail Outlet Dealer', 'Outlet franchisee / owner with access to assigned outlet operations'),
('role-csp', 'CSP', 'Customer Service Provider', 'Outlet staff / attendant with operational data access');

INSERT OR IGNORE INTO "permissions" ("id", "code", "name", "description") VALUES
('perm-eq-r', 'equipment.read', 'Read Equipment', 'View equipment assets and breakdown tickets'),
('perm-eq-as-w', 'equipment_assets.write', 'Write Equipment Assets', 'Manage equipment assets'),
('perm-eq-t-c', 'equipment_tickets.create', 'Create Equipment Tickets', 'Create new breakdown tickets'),
('perm-eq-t-m', 'equipment_tickets.manage', 'Manage Equipment Tickets', 'Assign and resolve breakdown tickets'),
('perm-eq-t-s', 'equipment_tickets.signoff', 'Signoff Equipment Tickets', 'Sign off and close breakdown tickets');

INSERT OR IGNORE INTO "role_permissions" ("role_id", "permission_id") VALUES
('role-admin', 'perm-eq-r'), ('role-admin', 'perm-eq-as-w'), ('role-admin', 'perm-eq-t-c'), ('role-admin', 'perm-eq-t-m'), ('role-admin', 'perm-eq-t-s'),
('role-so', 'perm-eq-r'),
('role-do', 'perm-eq-r'), ('role-do', 'perm-eq-t-m'), ('role-do', 'perm-eq-t-s'),
('role-bm', 'perm-eq-r'), ('role-bm', 'perm-eq-as-w'), ('role-bm', 'perm-eq-t-m'), ('role-bm', 'perm-eq-t-s'),
('role-fo', 'perm-eq-r'), ('role-fo', 'perm-eq-as-w'), ('role-fo', 'perm-eq-t-m'), ('role-fo', 'perm-eq-t-s'),
('role-dealer', 'perm-eq-r'), ('role-dealer', 'perm-eq-as-w'), ('role-dealer', 'perm-eq-t-c'),
('role-csp', 'perm-eq-r'), ('role-csp', 'perm-eq-as-w'), ('role-csp', 'perm-eq-t-c');

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
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
    CHECK (equipment_type IN ('ATG', 'AIR_COMPRESSOR', 'CNG_COMPRESSOR', 'DG_SET', 'OTHER')),
    CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED')),
    CHECK (trim(asset_code) <> ''),
    CHECK (trim(name) <> '')
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
    CHECK ( (dispenser_id IS NOT NULL AND equipment_asset_id IS NULL) OR (dispenser_id IS NULL AND equipment_asset_id IS NOT NULL) ),
    CHECK (equipment_type_snapshot IN ('DISPENSER', 'ATG', 'AIR_COMPRESSOR', 'CNG_COMPRESSOR', 'DG_SET', 'OTHER')),
    CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CHECK (failure_category IN ('ELECTRICAL', 'MECHANICAL', 'ELECTRONICS', 'COMMUNICATION', 'CALIBRATION', 'PRESSURE', 'LEAKAGE', 'POWER', 'SOFTWARE', 'OTHER')),
    CHECK (status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED')),
    CHECK (trim(description) <> ''),
    CHECK (downtime_seconds IS NULL OR downtime_seconds >= 0),
    CHECK (
      status NOT IN ('RESOLVED', 'CLOSED') OR (
        resolution_notes IS NOT NULL AND trim(resolution_notes) <> '' AND
        resolved_at IS NOT NULL AND
        resolved_by_user_id IS NOT NULL AND
        downtime_seconds IS NOT NULL AND downtime_seconds >= 0
      )
    ),
    CHECK (
      status != 'CLOSED' OR (
        signed_off_at IS NOT NULL AND
        signed_off_by_user_id IS NOT NULL
      )
    ),
    CHECK (
      status != 'CANCELLED' OR (
        cancel_reason IS NOT NULL AND trim(cancel_reason) <> '' AND
        cancelled_at IS NOT NULL AND
        cancelled_by_user_id IS NOT NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS "idx_eq_tickets_outlet_id" ON "equipment_breakdown_tickets" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_eq_tickets_dispenser_id" ON "equipment_breakdown_tickets" ("dispenser_id");
CREATE INDEX IF NOT EXISTS "idx_eq_tickets_asset_id" ON "equipment_breakdown_tickets" ("equipment_asset_id");
CREATE INDEX IF NOT EXISTS "idx_eq_tickets_status" ON "equipment_breakdown_tickets" ("status");
CREATE INDEX IF NOT EXISTS "idx_eq_tickets_priority" ON "equipment_breakdown_tickets" ("priority");
CREATE INDEX IF NOT EXISTS "idx_eq_tickets_breakdown_at" ON "equipment_breakdown_tickets" ("breakdown_at");
CREATE INDEX IF NOT EXISTS "idx_eq_tickets_type_snapshot" ON "equipment_breakdown_tickets" ("equipment_type_snapshot");

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
	FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
    CHECK (event_type IN ('CREATED', 'ASSIGNED', 'REASSIGNED', 'WORK_STARTED', 'RESOLVED', 'SIGNED_OFF', 'CANCELLED')),
    CHECK (from_status IS NULL OR from_status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED')),
    CHECK (to_status IS NULL OR to_status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS "idx_eq_events_ticket_id" ON "equipment_breakdown_events" ("ticket_id");
CREATE INDEX IF NOT EXISTS "idx_eq_events_ticket_created" ON "equipment_breakdown_events" ("ticket_id", "created_at");

-- Triggers for lifecycle and immutability protection

-- Immutability Trigger (NULL-safe)
CREATE TRIGGER IF NOT EXISTS "trg_eq_ticket_immutability"
BEFORE UPDATE ON "equipment_breakdown_tickets"
BEGIN
    SELECT
        CASE
            WHEN (OLD.outlet_id IS NOT NEW.outlet_id) OR
                 (OLD.dispenser_id IS NOT NEW.dispenser_id) OR
                 (OLD.equipment_asset_id IS NOT NEW.equipment_asset_id) OR
                 (OLD.equipment_type_snapshot IS NOT NEW.equipment_type_snapshot) OR
                 (OLD.equipment_label_snapshot IS NOT NEW.equipment_label_snapshot) OR
                 (OLD.breakdown_at IS NOT NEW.breakdown_at)
            THEN RAISE(ABORT, 'EQUIPMENT_TICKET_IMMUTABLE_FIELDS')
        END;
END;

-- Terminal Ticket Protection
CREATE TRIGGER IF NOT EXISTS "trg_eq_ticket_terminal"
BEFORE UPDATE ON "equipment_breakdown_tickets"
BEGIN
    SELECT
        CASE
            WHEN OLD.status IN ('CLOSED', 'CANCELLED') THEN RAISE(ABORT, 'EQUIPMENT_TICKET_TERMINAL')
        END;
END;

-- Lifecycle Trigger (Only on change, NULL-safe)
CREATE TRIGGER IF NOT EXISTS "trg_eq_ticket_lifecycle"
BEFORE UPDATE OF "status" ON "equipment_breakdown_tickets"
BEGIN
    SELECT
        CASE
            WHEN OLD.status IS NOT NEW.status AND (
                (OLD.status = 'OPEN' AND NEW.status NOT IN ('ASSIGNED', 'CANCELLED')) OR
                (OLD.status = 'ASSIGNED' AND NEW.status NOT IN ('IN_PROGRESS', 'CANCELLED')) OR
                (OLD.status = 'IN_PROGRESS' AND NEW.status NOT IN ('RESOLVED')) OR
                (OLD.status = 'RESOLVED' AND NEW.status NOT IN ('CLOSED'))
            ) THEN RAISE(ABORT, 'INVALID_EQUIPMENT_TICKET_TRANSITION')
        END;
END;

-- Append-only Event Ledger Protection
CREATE TRIGGER IF NOT EXISTS "trg_eq_event_immutable_update"
BEFORE UPDATE ON "equipment_breakdown_events"
BEGIN
    SELECT RAISE(ABORT, 'EQUIPMENT_EVENT_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS "trg_eq_event_immutable_delete"
BEFORE DELETE ON "equipment_breakdown_events"
BEGIN
    SELECT RAISE(ABORT, 'EQUIPMENT_EVENT_IMMUTABLE');
END;
