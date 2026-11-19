-- STAGING-ONLY PROPOSAL: Dealer master extension 0038
-- DO NOT APPLY TO PRODUCTION; requires a separately approved release + D1 backup.
-- Additive, non-destructive. No modifications to pre-existing outlet or agreement rows.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS dealer_ro_master_details (
  outlet_id TEXT NOT NULL PRIMARY KEY REFERENCES retail_outlets(id) ON DELETE CASCADE,
  contact_email TEXT,
  contact_phone TEXT,
  customer_group TEXT,
  site_description TEXT,
  market_class TEXT,
  commission_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES users(id),
  CHECK (commission_date IS NULL OR (length(commission_date)=10 AND substr(commission_date,5,1)='-' AND substr(commission_date,8,1)='-'))
);

CREATE TABLE IF NOT EXISTS dealer_land_master_details (
  outlet_id TEXT NOT NULL PRIMARY KEY REFERENCES retail_outlets(id) ON DELETE CASCADE,
  land_status TEXT,
  land_owner TEXT,
  source_area TEXT,
  source_area_unit TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES users(id)
);

-- A source candidate is NOT a signed agreement or a canonical rent ledger entry.
-- It remains separate until an authorized user verifies a matching LAND_LEASE.
CREATE TABLE IF NOT EXISTS dealer_lease_source_records (
  id TEXT PRIMARY KEY NOT NULL,
  outlet_id TEXT NOT NULL REFERENCES retail_outlets(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  order_number TEXT,
  start_date TEXT,
  end_date TEXT,
  rent_monthly_source TEXT,
  gst_charges_source TEXT,
  duration_years_source TEXT,
  duration_months_source TEXT,
  escalation_source TEXT,
  escalation_interval_years_source TEXT,
  remarks_source TEXT,
  linked_agreement_id TEXT REFERENCES coco_agreement_details(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  UNIQUE(outlet_id, source_key),
  CHECK (start_date IS NULL OR (length(start_date)=10 AND substr(start_date,5,1)='-')),
  CHECK (end_date IS NULL OR (length(end_date)=10 AND substr(end_date,5,1)='-')),
  CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
);
CREATE INDEX IF NOT EXISTS idx_dealer_lease_sources_outlet ON dealer_lease_source_records(outlet_id);
CREATE INDEX IF NOT EXISTS idx_dealer_lease_sources_agreement ON dealer_lease_source_records(linked_agreement_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dealer_lease_sources_one_per_agreement ON dealer_lease_source_records(linked_agreement_id);

-- This blocks cross-outlet linking even if application checks are accidentally bypassed.
CREATE TRIGGER IF NOT EXISTS trg_dealer_lease_same_outlet_insert
BEFORE INSERT ON dealer_lease_source_records
WHEN NEW.linked_agreement_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM coco_agreement_details a
    WHERE a.id = NEW.linked_agreement_id AND a.outlet_id = NEW.outlet_id AND a.agreement_type='LAND_LEASE'
  ) THEN RAISE(ABORT,'LEASE_AGREEMENT_OUTLET_MISMATCH') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_dealer_lease_same_outlet_update
BEFORE UPDATE ON dealer_lease_source_records
WHEN NEW.linked_agreement_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM coco_agreement_details a
    WHERE a.id = NEW.linked_agreement_id AND a.outlet_id = NEW.outlet_id AND a.agreement_type='LAND_LEASE'
  ) THEN RAISE(ABORT,'LEASE_AGREEMENT_OUTLET_MISMATCH') END;
END;
