-- =============================================================================
-- Migration 0031: Platform-Wide Idempotency & Natural Business Key Hardening
-- =============================================================================
-- NOTE: Pre-migration duplicate diagnostics are executed non-destructively
-- prior to index creation. Existing production data is NEVER deleted.

-- 1. Global Idempotency Keys Ledger
CREATE TABLE IF NOT EXISTS "idempotency_keys" (
  "id" text PRIMARY KEY NOT NULL,
  "idempotency_key" text NOT NULL,
  "actor_id" text NOT NULL,
  "route" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  "response_status" integer NOT NULL,
  "entity_id" text,
  "response_body" text NOT NULL,
  "created_at" text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_idempotency_keys_key_actor"
  ON "idempotency_keys" ("idempotency_key", "actor_id");

CREATE INDEX IF NOT EXISTS "idx_idempotency_keys_created_at"
  ON "idempotency_keys" ("created_at");

-- 2. User Scope Assignments Natural Identity
CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_scope_assignments_natural"
  ON "user_scope_assignments" (
    "user_id",
    "scope_level",
    COALESCE("state_id", ''),
    COALESCE("division_id", ''),
    COALESCE("sales_area_id", ''),
    COALESCE("outlet_id", '')
  );

-- 3. Outlet User Assignments Natural Identity
CREATE UNIQUE INDEX IF NOT EXISTS "uq_outlet_user_assignments_natural"
  ON "outlet_user_assignments" ("outlet_id", "user_id", "assignment_type");

-- 4. Fuel Receipts & Tank Lines Natural Identity
CREATE UNIQUE INDEX IF NOT EXISTS "uq_fuel_receipts_outlet_invoice"
  ON "fuel_receipts" ("outlet_id", "invoice_number")
  WHERE status != 'CANCELLED';

CREATE UNIQUE INDEX IF NOT EXISTS "uq_fuel_receipt_lines_receipt_tank"
  ON "fuel_receipt_tank_lines" ("fuel_receipt_id", "tank_id");

-- 5. Active Product Price Start Timestamp Uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS "uq_outlet_product_prices_active_start"
  ON "outlet_product_prices" ("outlet_id", "product_id", "effective_from")
  WHERE status = 'ACTIVE';

-- 6. Shift Collections Reference Uniqueness (when reference_number is provided)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_shift_collections_shift_type_ref"
  ON "shift_collections" ("operational_shift_id", "collection_type", "reference_number")
  WHERE reference_number IS NOT NULL AND trim(reference_number) != '';

-- 7. Bank Deposits Reference Uniqueness (when reference_number is provided and not rejected)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_bank_deposits_outlet_channel_ref"
  ON "bank_deposits" ("outlet_id", "deposit_channel", "reference_number")
  WHERE reference_number IS NOT NULL AND trim(reference_number) != '' AND status != 'REJECTED';

-- 8. Lube SKU Active Price Start Timestamp & Opening Balance Uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS "uq_lube_sku_prices_active_start"
  ON "lube_sku_prices" ("outlet_id", "lube_sku_id", "effective_from")
  WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS "uq_lube_stock_tx_opening_balance"
  ON "lube_stock_transactions" ("outlet_id", "lube_sku_id")
  WHERE transaction_type = 'OPENING_BALANCE';

-- 9. NFR Rent Payment Reference Uniqueness (per rent due when reference provided)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_nfr_rent_payments_due_ref"
  ON "nfr_rent_payments" ("rent_due_id", "payment_reference")
  WHERE payment_reference IS NOT NULL AND trim(payment_reference) != '';

-- 10. Organization Officers Email, Active Postings, and Active Service Provider Assignments
CREATE UNIQUE INDEX IF NOT EXISTS "uq_org_officers_email"
  ON "org_officers" ("email")
  WHERE email IS NOT NULL AND trim(email) != '';

CREATE UNIQUE INDEX IF NOT EXISTS "uq_org_officer_postings_active"
  ON "org_officer_postings" (
    "officer_id",
    "scope_level",
    COALESCE("state_id", ''),
    COALESCE("division_id", ''),
    COALESCE("sales_area_id", ''),
    COALESCE("outlet_id", '')
  )
  WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS "uq_outlet_sp_assignments_natural"
  ON "outlet_service_provider_assignments" (
    "outlet_id",
    "service_provider_id",
    "effective_from",
    COALESCE("contract_number", '')
  )
  WHERE status = 'ACTIVE';

-- 11. HR Leave Requests Active From/To Date Uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hr_leave_requests_active_dates"
  ON "hr_leave_requests" ("staff_id", "from_date", "to_date")
  WHERE status IN ('PENDING', 'APPROVED');
