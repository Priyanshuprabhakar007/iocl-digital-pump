-- Migration 0036: additive COCO documentation masters, expense evidence, asset inspections.
-- NO existing tables, operational finance ledger, or historical shifts are modified.

CREATE TABLE IF NOT EXISTS coco_agreement_details (
  id TEXT PRIMARY KEY NOT NULL,
  outlet_id TEXT NOT NULL REFERENCES retail_outlets(id) ON DELETE CASCADE,
  agreement_type TEXT NOT NULL CHECK (agreement_type IN ('LAND_LEASE','SERVICE_PROVIDER','OTHER','NFR_METADATA')),
  agreement_name TEXT NOT NULL,
  agreement_number TEXT,
  linked_nfr_lease_id TEXT REFERENCES nfr_leases(id),
  counterparty_name TEXT,
  vendor_code TEXT,
  customer_code TEXT,
  site_class TEXT CHECK (site_class IS NULL OR site_class IN ('A','B','C')),
  start_date TEXT,
  end_date TEXT,
  agreement_document_id TEXT REFERENCES documents(id),
  remarks TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
  CHECK ((agreement_type = 'NFR_METADATA') = (linked_nfr_lease_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_coco_agreements_outlet ON coco_agreement_details(outlet_id, agreement_type);
CREATE UNIQUE INDEX IF NOT EXISTS uq_coco_agreements_nfr_metadata ON coco_agreement_details(linked_nfr_lease_id) WHERE linked_nfr_lease_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS coco_expense_claims (
  id TEXT PRIMARY KEY NOT NULL,
  outlet_id TEXT NOT NULL REFERENCES retail_outlets(id) ON DELETE CASCADE,
  claim_category TEXT NOT NULL,
  title TEXT NOT NULL,
  invoice_number TEXT,
  period_start TEXT,
  period_end TEXT,
  due_date TEXT,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0 AND amount_paise <= 9000000000000000),
  invoice_document_id TEXT REFERENCES documents(id),
  approval_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (approval_status IN ('DRAFT','APPROVED','REJECTED')),
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  remarks TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (period_start IS NULL OR period_end IS NULL OR period_end >= period_start),
  CHECK ((approval_status = 'APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
      OR (approval_status <> 'APPROVED' AND approved_by IS NULL AND approved_at IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_coco_claims_outlet_category ON coco_expense_claims(outlet_id, claim_category);
CREATE INDEX IF NOT EXISTS idx_coco_claims_outlet_due ON coco_expense_claims(outlet_id, due_date);

CREATE TABLE IF NOT EXISTS coco_claim_settlements (
  id TEXT PRIMARY KEY NOT NULL,
  claim_id TEXT NOT NULL REFERENCES coco_expense_claims(id) ON DELETE RESTRICT,
  outlet_id TEXT NOT NULL REFERENCES retail_outlets(id) ON DELETE CASCADE,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0 AND amount_paise <= 9000000000000000),
  payment_date TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('BANK_TRANSFER','UPI','CHEQUE','CASH','OTHER')),
  reference_number TEXT NOT NULL,
  receipt_document_id TEXT NOT NULL REFERENCES documents(id),
  remarks TEXT,
  recorded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_coco_settlements_claim ON coco_claim_settlements(claim_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_coco_settlements_claim_reference ON coco_claim_settlements(claim_id, reference_number);

-- Atomically reject invalid or over-limit settlement writes, even under concurrency.
CREATE TRIGGER IF NOT EXISTS trg_coco_settlement_approved_amount_guard
BEFORE INSERT ON coco_claim_settlements
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM coco_expense_claims c
    WHERE c.id = NEW.claim_id AND c.outlet_id = NEW.outlet_id AND c.approval_status = 'APPROVED'
  ) THEN RAISE(ABORT, 'CLAIM_NOT_APPROVED_OR_OUTLET_MISMATCH') END;
  SELECT CASE WHEN (
    NEW.amount_paise +
    COALESCE((SELECT SUM(s.amount_paise) FROM coco_claim_settlements s WHERE s.claim_id = NEW.claim_id), 0)
  ) > (SELECT c.amount_paise FROM coco_expense_claims c WHERE c.id = NEW.claim_id)
  THEN RAISE(ABORT, 'CLAIM_OVERPAYMENT') END;
END;

CREATE TABLE IF NOT EXISTS coco_asset_inspections (
  id TEXT PRIMARY KEY NOT NULL,
  outlet_id TEXT NOT NULL REFERENCES retail_outlets(id) ON DELETE CASCADE,
  equipment_asset_id TEXT NOT NULL REFERENCES equipment_assets(id) ON DELETE RESTRICT,
  inspected_on TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('WORKING','NOT_WORKING','SCRAPPED')),
  next_service_date TEXT,
  remarks TEXT,
  evidence_document_id TEXT REFERENCES documents(id),
  recorded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  CHECK (next_service_date IS NULL OR next_service_date >= inspected_on)
);
CREATE INDEX IF NOT EXISTS idx_coco_inspections_outlet_date ON coco_asset_inspections(outlet_id, inspected_on DESC);
CREATE INDEX IF NOT EXISTS idx_coco_inspections_asset_date ON coco_asset_inspections(equipment_asset_id, inspected_on DESC, created_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_coco_inspection_outlet_guard
BEFORE INSERT ON coco_asset_inspections
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM equipment_assets a WHERE a.id = NEW.equipment_asset_id AND a.outlet_id = NEW.outlet_id
  ) THEN RAISE(ABORT, 'EQUIPMENT_OUTLET_MISMATCH') END;
END;
