-- Migration 0022: Direct User Permission Overrides
CREATE TABLE IF NOT EXISTS "user_permission_overrides" (
	"user_id" text NOT NULL,
	"permission_id" text NOT NULL,
	"effect" text NOT NULL,
	"assigned_by_user_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	PRIMARY KEY ("user_id", "permission_id"),
	FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE CASCADE,
	FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON UPDATE no action ON DELETE CASCADE,
	FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE NO ACTION,
	CHECK ("effect" IN ('ALLOW', 'DENY'))
);

CREATE INDEX IF NOT EXISTS "idx_upo_user_id" ON "user_permission_overrides" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_upo_permission_id" ON "user_permission_overrides" ("permission_id");
