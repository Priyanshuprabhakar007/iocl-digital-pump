PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;

-- 5A. Rebuild operational_shifts with shift_template_id foreign key reference
CREATE TABLE "operational_shifts_rebuild" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "outlet_id" TEXT NOT NULL,
  "shift_template_id" TEXT NOT NULL,
  "business_date" TEXT NOT NULL,
  "started_at" TEXT NOT NULL,
  "closed_at" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "opened_by_user_id" TEXT NOT NULL,
  "closed_by_user_id" TEXT,
  "notes" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  UNIQUE ("outlet_id", "shift_template_id", "business_date"),
  FOREIGN KEY ("outlet_id") REFERENCES "retail_outlets" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("shift_template_id") REFERENCES "global_shift_templates" ("id"),
  FOREIGN KEY ("opened_by_user_id") REFERENCES "users" ("id"),
  FOREIGN KEY ("closed_by_user_id") REFERENCES "users" ("id"),
  CHECK ("status" IN ('OPEN', 'CLOSING', 'CLOSED', 'LOCKED'))
);

INSERT INTO "operational_shifts_rebuild" SELECT * FROM "operational_shifts";
DROP TABLE "operational_shifts";
ALTER TABLE "operational_shifts_rebuild" RENAME TO "operational_shifts";

CREATE INDEX IF NOT EXISTS "idx_op_shifts_outlet_id" ON "operational_shifts" ("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_op_shifts_business_date" ON "operational_shifts" ("business_date");
CREATE INDEX IF NOT EXISTS "idx_op_shifts_status" ON "operational_shifts" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_operational_shifts_single_active" ON "operational_shifts" ("outlet_id") WHERE "status" IN ('OPEN', 'CLOSING');

PRAGMA legacy_alter_table = OFF;
PRAGMA foreign_keys = ON;

PRAGMA foreign_key_check;
