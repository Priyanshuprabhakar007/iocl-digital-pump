-- ============================================================================
-- Migration 0035: COCO Documents & Compliance Management (Phase 1)
-- Safe additive migration creating coco_compliance_records table and indexes.
-- Preserves all existing tables, documents, financial records, and tank data.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "coco_compliance_records" (
  "id" text PRIMARY KEY NOT NULL,
  "outlet_id" text NOT NULL REFERENCES "retail_outlets"("id") ON DELETE CASCADE,
  "ro_code_snapshot" text NOT NULL,
  "category_code" text NOT NULL,
  "category_name" text NOT NULL,
  "display_order" integer NOT NULL DEFAULT 99,
  "is_custom_category" integer NOT NULL DEFAULT 0,
  "document_title" text,
  "reference_number" text,
  "issue_date" text,
  "validity_due_date" text,
  "last_service_date" text,
  "amount_paise" integer,
  "frequency" text,
  "payment_status" text NOT NULL DEFAULT 'NOT_RECORDED',
  "payment_date" text,
  "compliance_status" text NOT NULL DEFAULT 'NOT_RECORDED',
  "status_yes_no" text NOT NULL DEFAULT 'NOT_RECORDED',
  "remarks" text,
  "action_required" text,
  "responsible_person" text,
  "attachment_document_ids_json" text NOT NULL DEFAULT '[]',
  "created_by" text NOT NULL REFERENCES "users"("id"),
  "updated_by" text NOT NULL REFERENCES "users"("id"),
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL,
  CONSTRAINT "chk_coco_comp_custom" CHECK ("is_custom_category" IN (0, 1)),
  CONSTRAINT "chk_coco_comp_amount" CHECK ("amount_paise" IS NULL OR "amount_paise" >= 0),
  CONSTRAINT "chk_coco_comp_payment_status" CHECK ("payment_status" IN ('PAID', 'PENDING', 'OVERDUE', 'NOT_APPLICABLE', 'NOT_RECORDED')),
  CONSTRAINT "chk_coco_comp_status" CHECK ("compliance_status" IN ('VALID', 'EXPIRING_SOON', 'EXPIRED', 'PAYMENT_PENDING', 'ACTION_REQUIRED', 'NOT_RECORDED', 'NOT_APPLICABLE')),
  CONSTRAINT "chk_coco_comp_yes_no" CHECK ("status_yes_no" IN ('YES', 'NO', 'NA', 'NOT_RECORDED')),
  CONSTRAINT "chk_coco_comp_cat_code" CHECK (trim("category_code") <> ''),
  CONSTRAINT "chk_coco_comp_cat_name" CHECK (trim("category_name") <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_coco_compliance_outlet_category"
  ON "coco_compliance_records" ("outlet_id", "category_code");

CREATE INDEX IF NOT EXISTS "idx_coco_compliance_outlet_id"
  ON "coco_compliance_records" ("outlet_id");

CREATE INDEX IF NOT EXISTS "idx_coco_compliance_due_date"
  ON "coco_compliance_records" ("outlet_id", "validity_due_date");

CREATE INDEX IF NOT EXISTS "idx_coco_compliance_status"
  ON "coco_compliance_records" ("outlet_id", "compliance_status");
