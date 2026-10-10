-- Migration 0023: Department, Officer, and Service Provider Masters Backend Foundation

-- 1. Permissions & Role Permissions
INSERT OR IGNORE INTO "permissions" ("id", "code", "name", "description") VALUES
('perm-org-masters-r', 'org.masters.read', 'Read Org Masters', 'View departments, officers, officer postings and service providers'),
('perm-org-masters-w', 'org.masters.write', 'Write Org Masters', 'Manage departments, officers, officer postings and service providers');

INSERT OR IGNORE INTO "role_permissions" ("role_id", "permission_id") VALUES
-- Admin
('role-admin', 'perm-org-masters-r'), ('role-admin', 'perm-org-masters-w'),
-- State Office
('role-so', 'perm-org-masters-r'), ('role-so', 'perm-org-masters-w'),
-- Divisional Office
('role-do', 'perm-org-masters-r'),
-- Business Manager
('role-bm', 'perm-org-masters-r'),
-- Field Officer
('role-fo', 'perm-org-masters-r');

-- 2. Departments Master
CREATE TABLE IF NOT EXISTS "departments" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CHECK (status IN ('ACTIVE', 'INACTIVE')),
	CHECK (code IS NOT NULL AND trim(code) != ''),
	CHECK (name IS NOT NULL AND trim(name) != '')
);

CREATE INDEX IF NOT EXISTS "idx_departments_code" ON "departments" ("code");
CREATE INDEX IF NOT EXISTS "idx_departments_status" ON "departments" ("status");

-- 3. Officers Master
CREATE TABLE IF NOT EXISTS "officers" (
	"id" text PRIMARY KEY NOT NULL,
	"officer_code" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"phone" text NOT NULL,
	"department_id" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON UPDATE no action ON DELETE restrict,
	CHECK (status IN ('ACTIVE', 'INACTIVE')),
	CHECK (officer_code IS NOT NULL AND trim(officer_code) != ''),
	CHECK (name IS NOT NULL AND trim(name) != ''),
	CHECK (email IS NOT NULL AND trim(email) != '')
);

CREATE INDEX IF NOT EXISTS "idx_officers_code" ON "officers" ("officer_code");
CREATE INDEX IF NOT EXISTS "idx_officers_dept" ON "officers" ("department_id");
CREATE INDEX IF NOT EXISTS "idx_officers_status" ON "officers" ("status");

-- 4. Officer Postings / Hierarchy Assignments
CREATE TABLE IF NOT EXISTS "officer_postings" (
	"id" text PRIMARY KEY NOT NULL,
	"officer_id" text NOT NULL,
	"scope_level" text NOT NULL,
	"state_id" text,
	"division_id" text,
	"sales_area_id" text,
	"outlet_id" text,
	"effective_from" text NOT NULL,
	"effective_to" text,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"created_by" text NOT NULL,
	FOREIGN KEY ("officer_id") REFERENCES "officers"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("state_id") REFERENCES "states"("id") ON UPDATE no action ON DELETE set null,
	FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON UPDATE no action ON DELETE set null,
	FOREIGN KEY ("sales_area_id") REFERENCES "sales_areas"("id") ON UPDATE no action ON DELETE set null,
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE set null,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	CHECK (scope_level IN ('GLOBAL', 'STATE', 'DIVISION', 'SALES_AREA', 'OUTLET')),
	CHECK (is_active IN (0, 1))
);

CREATE INDEX IF NOT EXISTS "idx_officer_postings_officer" ON "officer_postings" ("officer_id");
CREATE INDEX IF NOT EXISTS "idx_officer_postings_scope" ON "officer_postings" ("scope_level");

-- 5. Service Providers Master
CREATE TABLE IF NOT EXISTS "service_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"service_type" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"email" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CHECK (status IN ('ACTIVE', 'INACTIVE')),
	CHECK (code IS NOT NULL AND trim(code) != ''),
	CHECK (name IS NOT NULL AND trim(name) != '')
);

CREATE INDEX IF NOT EXISTS "idx_service_providers_code" ON "service_providers" ("code");
CREATE INDEX IF NOT EXISTS "idx_service_providers_type" ON "service_providers" ("service_type");

-- 6. Outlet Service Provider Assignments
CREATE TABLE IF NOT EXISTS "outlet_service_provider_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"service_provider_id" text NOT NULL,
	"contract_reference" text,
	"effective_from" text NOT NULL,
	"effective_to" text,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"created_by" text NOT NULL,
	UNIQUE("outlet_id", "service_provider_id"),
	FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("service_provider_id") REFERENCES "service_providers"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action,
	CHECK (is_active IN (0, 1))
);

CREATE INDEX IF NOT EXISTS "idx_osp_outlet_id" ON "outlet_service_provider_assignments" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_osp_provider_id" ON "outlet_service_provider_assignments" ("service_provider_id");
