-- Stage 01S-2 — PROPOSED ONLY, not a production migration.
-- Complements Stage 01S source triggers; for disposable local/approved synthetic staging only.
-- Enforce OPEN-only source-row insert/update/delete including shift reassignment.
-- Not a replacement for transaction-level snapshot/version fencing.

CREATE TRIGGER IF NOT EXISTS s01s2_shift_collections_insert_open_only
BEFORE INSERT ON shift_collections
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = NEW.operational_shift_id AND s.status = 'OPEN'))
BEGIN SELECT RAISE(ABORT, 'STAGE01S2_SOURCE_SHIFT_NOT_OPEN'); END;

CREATE TRIGGER IF NOT EXISTS s01s2_shift_collections_update_open_only
BEFORE UPDATE ON shift_collections
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = OLD.operational_shift_id AND s.status = 'OPEN')) OR NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = NEW.operational_shift_id AND s.status = 'OPEN'))
BEGIN SELECT RAISE(ABORT, 'STAGE01S2_SOURCE_SHIFT_NOT_OPEN'); END;

CREATE TRIGGER IF NOT EXISTS s01s2_shift_collections_delete_open_only
BEFORE DELETE ON shift_collections
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = OLD.operational_shift_id AND s.status = 'OPEN'))
BEGIN SELECT RAISE(ABORT, 'STAGE01S2_SOURCE_SHIFT_NOT_OPEN'); END;

CREATE TRIGGER IF NOT EXISTS s01s2_cng_shift_logs_insert_open_only
BEFORE INSERT ON cng_shift_logs
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = NEW.operational_shift_id AND s.status = 'OPEN'))
BEGIN SELECT RAISE(ABORT, 'STAGE01S2_SOURCE_SHIFT_NOT_OPEN'); END;

CREATE TRIGGER IF NOT EXISTS s01s2_cng_shift_logs_update_open_only
BEFORE UPDATE ON cng_shift_logs
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = OLD.operational_shift_id AND s.status = 'OPEN')) OR NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = NEW.operational_shift_id AND s.status = 'OPEN'))
BEGIN SELECT RAISE(ABORT, 'STAGE01S2_SOURCE_SHIFT_NOT_OPEN'); END;

CREATE TRIGGER IF NOT EXISTS s01s2_cng_shift_logs_delete_open_only
BEFORE DELETE ON cng_shift_logs
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = OLD.operational_shift_id AND s.status = 'OPEN'))
BEGIN SELECT RAISE(ABORT, 'STAGE01S2_SOURCE_SHIFT_NOT_OPEN'); END;

CREATE TRIGGER IF NOT EXISTS s01s2_cng_pressure_readings_insert_open_only
BEFORE INSERT ON cng_pressure_readings
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = NEW.operational_shift_id AND s.status = 'OPEN'))
BEGIN SELECT RAISE(ABORT, 'STAGE01S2_SOURCE_SHIFT_NOT_OPEN'); END;

CREATE TRIGGER IF NOT EXISTS s01s2_cng_pressure_readings_update_open_only
BEFORE UPDATE ON cng_pressure_readings
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = OLD.operational_shift_id AND s.status = 'OPEN')) OR NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = NEW.operational_shift_id AND s.status = 'OPEN'))
BEGIN SELECT RAISE(ABORT, 'STAGE01S2_SOURCE_SHIFT_NOT_OPEN'); END;

CREATE TRIGGER IF NOT EXISTS s01s2_cng_pressure_readings_delete_open_only
BEFORE DELETE ON cng_pressure_readings
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = OLD.operational_shift_id AND s.status = 'OPEN'))
BEGIN SELECT RAISE(ABORT, 'STAGE01S2_SOURCE_SHIFT_NOT_OPEN'); END;

CREATE TRIGGER IF NOT EXISTS s01s2_lube_shift_sales_insert_open_only
BEFORE INSERT ON lube_shift_sales
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = NEW.operational_shift_id AND s.status = 'OPEN'))
BEGIN SELECT RAISE(ABORT, 'STAGE01S2_SOURCE_SHIFT_NOT_OPEN'); END;

CREATE TRIGGER IF NOT EXISTS s01s2_lube_shift_sales_update_open_only
BEFORE UPDATE ON lube_shift_sales
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = OLD.operational_shift_id AND s.status = 'OPEN')) OR NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = NEW.operational_shift_id AND s.status = 'OPEN'))
BEGIN SELECT RAISE(ABORT, 'STAGE01S2_SOURCE_SHIFT_NOT_OPEN'); END;

CREATE TRIGGER IF NOT EXISTS s01s2_lube_shift_sales_delete_open_only
BEFORE DELETE ON lube_shift_sales
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = OLD.operational_shift_id AND s.status = 'OPEN'))
BEGIN SELECT RAISE(ABORT, 'STAGE01S2_SOURCE_SHIFT_NOT_OPEN'); END;

CREATE TRIGGER IF NOT EXISTS s01s2_operational_shift_product_prices_insert_open_only
BEFORE INSERT ON operational_shift_product_prices
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = NEW.operational_shift_id AND s.status = 'OPEN'))
BEGIN SELECT RAISE(ABORT, 'STAGE01S2_SOURCE_SHIFT_NOT_OPEN'); END;

CREATE TRIGGER IF NOT EXISTS s01s2_operational_shift_product_prices_update_open_only
BEFORE UPDATE ON operational_shift_product_prices
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = OLD.operational_shift_id AND s.status = 'OPEN')) OR NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = NEW.operational_shift_id AND s.status = 'OPEN'))
BEGIN SELECT RAISE(ABORT, 'STAGE01S2_SOURCE_SHIFT_NOT_OPEN'); END;

CREATE TRIGGER IF NOT EXISTS s01s2_operational_shift_product_prices_delete_open_only
BEFORE DELETE ON operational_shift_product_prices
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = OLD.operational_shift_id AND s.status = 'OPEN'))
BEGIN SELECT RAISE(ABORT, 'STAGE01S2_SOURCE_SHIFT_NOT_OPEN'); END;
