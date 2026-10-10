-- Migration 0023: Department, Officer, and Service Provider Masters Backend Foundation

-- 1. Permissions & Role Permissions
INSERT OR IGNORE INTO "permissions" ("id", "code", "name", "description") VALUES
('perm-org-r', 'org.masters.read', 'Read Org Masters', 'View departments, officers, officer postings and service providers'),
('perm-org-w', 'org.masters.write', 'Write Org Masters', 'Manage departments, officers, officer postings and service providers');

INSERT OR IGNORE INTO "role_permissions" ("role_id", "permission_id") VALUES
-- Admin
('role-admin', 'perm-org-r'), ('role-admin', 'perm-org-w'),
-- State Office (Read only)
('role-so', 'perm-org-r'),
-- Divisional Office
('role-do', 'perm-org-r'),
-- Business Manager
('role-bm', 'perm-org-r'),
-- Field Officer
('role-fo', 'perm-org-r');

-- 2. org_departments
CREATE TABLE IF NOT EXISTS "org_departments" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE restrict,
	CHECK (status IN ('ACTIVE', 'INACTIVE')),
	CHECK (code IS NOT NULL AND trim(code) != ''),
	CHECK (name IS NOT NULL AND trim(name) != '')
);

CREATE INDEX IF NOT EXISTS "idx_org_departments_code" ON "org_departments" ("code");
CREATE INDEX IF NOT EXISTS "idx_org_departments_status" ON "org_departments" ("status");

-- 3. org_officers
CREATE TABLE IF NOT EXISTS "org_officers" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_code" text NOT NULL UNIQUE,
	"full_name" text NOT NULL,
	"designation_title" text NOT NULL,
	"department_id" text NOT NULL,
	"email" text,
	"phone" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("department_id") REFERENCES "org_departments"("id") ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE restrict,
	CHECK (status IN ('ACTIVE', 'INACTIVE', 'TRANSFERRED', 'RETIRED')),
	CHECK (employee_code IS NOT NULL AND trim(employee_code) != ''),
	CHECK (full_name IS NOT NULL AND trim(full_name) != ''),
	CHECK (designation_title IS NOT NULL AND trim(designation_title) != '')
);

CREATE INDEX IF NOT EXISTS "idx_org_officers_code" ON "org_officers" ("employee_code");
CREATE INDEX IF NOT EXISTS "idx_org_officers_dept" ON "org_officers" ("department_id");
CREATE INDEX IF NOT EXISTS "idx_org_officers_status" ON "org_officers" ("status");

-- 4. org_officer_postings
CREATE TABLE IF NOT EXISTS "org_officer_postings" (
	"id" text PRIMARY KEY NOT NULL,
	"officer_id" text NOT NULL,
	"scope_level" text NOT NULL,
	"state_id" text,
	"division_id" text,
	"sales_area_id" text,
	"outlet_id" text,
	"effective_from" text NOT NULL,
	"effective_to" text,
	"is_primary" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("officer_id") REFERENCES "org_officers"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("state_id") REFERENCES "states"("id") ON UPDATE no action ON DELETE set null,
	FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON UPDATE no action ON DELETE set null,
	FOREIGN KEY ("sales_area_id") REFERENCES "sales_areas"("id") ON UPDATE no action ON DELETE set null,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE set null,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE restrict,
	CHECK (scope_level IN ('GLOBAL', 'STATE', 'DIVISION', 'SALES_AREA', 'OUTLET')),
	CHECK (status IN ('ACTIVE', 'INACTIVE')),
	CHECK (is_primary IN (0, 1))
);

CREATE INDEX IF NOT EXISTS "idx_org_officer_postings_officer" ON "org_officer_postings" ("officer_id");
CREATE INDEX IF NOT EXISTS "idx_org_officer_postings_scope" ON "org_officer_postings" ("scope_level");

-- 5. service_providers
CREATE TABLE IF NOT EXISTS "service_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_code" text NOT NULL UNIQUE,
	"provider_name" text NOT NULL,
	"proprietor_or_authorized_person" text,
	"contact_person" text,
	"phone" text,
	"alternate_phone" text,
	"email" text,
	"gstin" text,
	"pan" text,
	"address" text,
	"city" text,
	"district" text,
	"state_text" text,
	"pincode" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE restrict,
	CHECK (status IN ('ACTIVE', 'INACTIVE')),
	CHECK (provider_code IS NOT NULL AND trim(provider_code) != ''),
	CHECK (provider_name IS NOT NULL AND trim(provider_name) != '')
);

CREATE INDEX IF NOT EXISTS "idx_service_providers_code" ON "service_providers" ("provider_code");
CREATE INDEX IF NOT EXISTS "idx_service_providers_status" ON "service_providers" ("status");

-- 6. outlet_service_provider_assignments
CREATE TABLE IF NOT EXISTS "outlet_service_provider_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"service_provider_id" text NOT NULL,
	"service_type" text NOT NULL,
	"contract_number" text,
	"effective_from" text NOT NULL,
	"effective_to" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("service_provider_id") REFERENCES "service_providers"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE restrict,
	CHECK (service_type IN ('MANPOWER', 'HOUSEKEEPING', 'SECURITY', 'MAINTENANCE', 'OTHER')),
	CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE INDEX IF NOT EXISTS "idx_osp_outlet_id" ON "outlet_service_provider_assignments" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_osp_provider_id" ON "outlet_service_provider_assignments" ("service_provider_id");
