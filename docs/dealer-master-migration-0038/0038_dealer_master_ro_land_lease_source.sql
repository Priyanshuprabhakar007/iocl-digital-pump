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

-- Database-level protection against concurrent stale writes or direct overwrites.
CREATE TRIGGER IF NOT EXISTS trg_dealer_ro_master_details_protect_existing
BEFORE UPDATE ON dealer_ro_master_details
WHEN (OLD.contact_email IS NOT NULL AND length(trim(OLD.contact_email)) > 0 AND COALESCE(NEW.contact_email, '') <> OLD.contact_email)
  OR (OLD.contact_phone IS NOT NULL AND length(trim(OLD.contact_phone)) > 0 AND COALESCE(NEW.contact_phone, '') <> OLD.contact_phone)
  OR (OLD.customer_group IS NOT NULL AND length(trim(OLD.customer_group)) > 0 AND COALESCE(NEW.customer_group, '') <> OLD.customer_group)
  OR (OLD.site_description IS NOT NULL AND length(trim(OLD.site_description)) > 0 AND COALESCE(NEW.site_description, '') <> OLD.site_description)
  OR (OLD.market_class IS NOT NULL AND length(trim(OLD.market_class)) > 0 AND COALESCE(NEW.market_class, '') <> OLD.market_class)
  OR (OLD.commission_date IS NOT NULL AND length(trim(OLD.commission_date)) > 0 AND COALESCE(NEW.commission_date, '') <> OLD.commission_date)
BEGIN
  SELECT RAISE(ABORT, 'DEALER_MASTER_EXISTING_VALUE_PROTECTED');
END;

-- Database-level protection against concurrent stale writes or direct overwrites.
CREATE TRIGGER IF NOT EXISTS trg_dealer_land_master_details_protect_existing
BEFORE UPDATE ON dealer_land_master_details
WHEN (OLD.land_status IS NOT NULL AND length(trim(OLD.land_status)) > 0 AND COALESCE(NEW.land_status, '') <> OLD.land_status)
  OR (OLD.land_owner IS NOT NULL AND length(trim(OLD.land_owner)) > 0 AND COALESCE(NEW.land_owner, '') <> OLD.land_owner)
  OR (OLD.source_area IS NOT NULL AND length(trim(OLD.source_area)) > 0 AND COALESCE(NEW.source_area, '') <> OLD.source_area)
  OR (OLD.source_area_unit IS NOT NULL AND length(trim(OLD.source_area_unit)) > 0 AND COALESCE(NEW.source_area_unit, '') <> OLD.source_area_unit)
BEGIN
  SELECT RAISE(ABORT, 'DEALER_MASTER_EXISTING_VALUE_PROTECTED');
END;

-- Database-level protection against concurrent stale writes or direct overwrites.
CREATE TRIGGER IF NOT EXISTS trg_dealer_lease_source_records_protect_existing
BEFORE UPDATE ON dealer_lease_source_records
WHEN (OLD.order_number IS NOT NULL AND length(trim(OLD.order_number)) > 0 AND COALESCE(NEW.order_number, '') <> OLD.order_number)
  OR (OLD.start_date IS NOT NULL AND length(trim(OLD.start_date)) > 0 AND COALESCE(NEW.start_date, '') <> OLD.start_date)
  OR (OLD.end_date IS NOT NULL AND length(trim(OLD.end_date)) > 0 AND COALESCE(NEW.end_date, '') <> OLD.end_date)
  OR (OLD.rent_monthly_source IS NOT NULL AND length(trim(OLD.rent_monthly_source)) > 0 AND COALESCE(NEW.rent_monthly_source, '') <> OLD.rent_monthly_source)
  OR (OLD.gst_charges_source IS NOT NULL AND length(trim(OLD.gst_charges_source)) > 0 AND COALESCE(NEW.gst_charges_source, '') <> OLD.gst_charges_source)
  OR (OLD.duration_years_source IS NOT NULL AND length(trim(OLD.duration_years_source)) > 0 AND COALESCE(NEW.duration_years_source, '') <> OLD.duration_years_source)
  OR (OLD.duration_months_source IS NOT NULL AND length(trim(OLD.duration_months_source)) > 0 AND COALESCE(NEW.duration_months_source, '') <> OLD.duration_months_source)
  OR (OLD.escalation_source IS NOT NULL AND length(trim(OLD.escalation_source)) > 0 AND COALESCE(NEW.escalation_source, '') <> OLD.escalation_source)
  OR (OLD.escalation_interval_years_source IS NOT NULL AND length(trim(OLD.escalation_interval_years_source)) > 0 AND COALESCE(NEW.escalation_interval_years_source, '') <> OLD.escalation_interval_years_source)
  OR (OLD.remarks_source IS NOT NULL AND length(trim(OLD.remarks_source)) > 0 AND COALESCE(NEW.remarks_source, '') <> OLD.remarks_source)
BEGIN
  SELECT RAISE(ABORT, 'DEALER_MASTER_EXISTING_VALUE_PROTECTED');
END;
