-- Additive, independent extension. Apply only after 0036 and a verified backup.
CREATE TABLE IF NOT EXISTS coco_agreement_lease_terms (
  agreement_id TEXT PRIMARY KEY NOT NULL REFERENCES coco_agreement_details(id) ON DELETE CASCADE,
  dimension_unit TEXT CHECK (dimension_unit IS NULL OR dimension_unit IN ('SQYD','SQFT','FT_LXW')),
  area_milli INTEGER CHECK (area_milli IS NULL OR (typeof(area_milli)='integer' AND area_milli BETWEEN 1 AND 999999999999)),
  length_milli_ft INTEGER CHECK (length_milli_ft IS NULL OR (typeof(length_milli_ft)='integer' AND length_milli_ft BETWEEN 1 AND 999999999999)),
  width_milli_ft INTEGER CHECK (width_milli_ft IS NULL OR (typeof(width_milli_ft)='integer' AND width_milli_ft BETWEEN 1 AND 999999999999)),
  monthly_lease_value_paise INTEGER CHECK (monthly_lease_value_paise IS NULL OR (typeof(monthly_lease_value_paise)='integer' AND monthly_lease_value_paise BETWEEN 0 AND 9000000000000000)),
  CHECK ((dimension_unit IS NULL AND area_milli IS NULL AND length_milli_ft IS NULL AND width_milli_ft IS NULL)
    OR (dimension_unit IS NOT NULL AND dimension_unit IN ('SQYD','SQFT') AND area_milli IS NOT NULL AND length_milli_ft IS NULL AND width_milli_ft IS NULL)
    OR (dimension_unit IS NOT NULL AND dimension_unit='FT_LXW' AND area_milli IS NULL AND length_milli_ft IS NOT NULL AND width_milli_ft IS NOT NULL))
);
CREATE TRIGGER IF NOT EXISTS trg_coco_lease_terms_insert
BEFORE INSERT ON coco_agreement_lease_terms BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM coco_agreement_details a WHERE a.id=NEW.agreement_id
      AND (a.agreement_type='LAND_LEASE' OR (a.agreement_type='NFR_METADATA' AND NEW.monthly_lease_value_paise IS NULL))
  ) THEN RAISE(ABORT,'INVALID_LEASE_TERMS_TYPE') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_coco_lease_terms_update
BEFORE UPDATE ON coco_agreement_lease_terms BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM coco_agreement_details a WHERE a.id=NEW.agreement_id
      AND (a.agreement_type='LAND_LEASE' OR (a.agreement_type='NFR_METADATA' AND NEW.monthly_lease_value_paise IS NULL))
  ) THEN RAISE(ABORT,'INVALID_LEASE_TERMS_TYPE') END;
END;
