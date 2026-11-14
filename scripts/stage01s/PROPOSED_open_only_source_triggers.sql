-- Stage 01S - PROPOSED D1 source-row freeze triggers.
-- NOT a production migration. Only install in disposable synthetic local/staging D1
-- after human review. No scripts automatically install these on remote D1.
-- Hardening candidate: OPEN is the only editable shift state.
-- Note: other source domains (CNG, lubes, payment collections, prices and
-- calibration) need separate analysis before any operational release.

CREATE TRIGGER IF NOT EXISTS s01s_nozzle_meter_readings_insert_open_only
BEFORE INSERT ON nozzle_meter_readings
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = NEW.operational_shift_id AND s.status = 'OPEN'))
BEGIN
  SELECT RAISE(ABORT, 'STAGE01S_SOURCE_SHIFT_NOT_OPEN');
END;

CREATE TRIGGER IF NOT EXISTS s01s_nozzle_meter_readings_update_open_only
BEFORE UPDATE ON nozzle_meter_readings
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = OLD.operational_shift_id AND s.status = 'OPEN')) OR NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = NEW.operational_shift_id AND s.status = 'OPEN'))
BEGIN
  SELECT RAISE(ABORT, 'STAGE01S_SOURCE_SHIFT_NOT_OPEN');
END;

CREATE TRIGGER IF NOT EXISTS s01s_nozzle_meter_readings_delete_open_only
BEFORE DELETE ON nozzle_meter_readings
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = OLD.operational_shift_id AND s.status = 'OPEN'))
BEGIN
  SELECT RAISE(ABORT, 'STAGE01S_SOURCE_SHIFT_NOT_OPEN');
END;

CREATE TRIGGER IF NOT EXISTS s01s_nozzle_unavailability_records_insert_open_only
BEFORE INSERT ON nozzle_unavailability_records
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = NEW.operational_shift_id AND s.status = 'OPEN'))
BEGIN
  SELECT RAISE(ABORT, 'STAGE01S_SOURCE_SHIFT_NOT_OPEN');
END;

CREATE TRIGGER IF NOT EXISTS s01s_nozzle_unavailability_records_update_open_only
BEFORE UPDATE ON nozzle_unavailability_records
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = OLD.operational_shift_id AND s.status = 'OPEN')) OR NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = NEW.operational_shift_id AND s.status = 'OPEN'))
BEGIN
  SELECT RAISE(ABORT, 'STAGE01S_SOURCE_SHIFT_NOT_OPEN');
END;

CREATE TRIGGER IF NOT EXISTS s01s_nozzle_unavailability_records_delete_open_only
BEFORE DELETE ON nozzle_unavailability_records
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = OLD.operational_shift_id AND s.status = 'OPEN'))
BEGIN
  SELECT RAISE(ABORT, 'STAGE01S_SOURCE_SHIFT_NOT_OPEN');
END;

CREATE TRIGGER IF NOT EXISTS s01s_tank_stock_readings_insert_open_only
BEFORE INSERT ON tank_stock_readings
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = NEW.operational_shift_id AND s.status = 'OPEN'))
BEGIN
  SELECT RAISE(ABORT, 'STAGE01S_SOURCE_SHIFT_NOT_OPEN');
END;

CREATE TRIGGER IF NOT EXISTS s01s_tank_stock_readings_update_open_only
BEFORE UPDATE ON tank_stock_readings
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = OLD.operational_shift_id AND s.status = 'OPEN')) OR NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = NEW.operational_shift_id AND s.status = 'OPEN'))
BEGIN
  SELECT RAISE(ABORT, 'STAGE01S_SOURCE_SHIFT_NOT_OPEN');
END;

CREATE TRIGGER IF NOT EXISTS s01s_tank_stock_readings_delete_open_only
BEFORE DELETE ON tank_stock_readings
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = OLD.operational_shift_id AND s.status = 'OPEN'))
BEGIN
  SELECT RAISE(ABORT, 'STAGE01S_SOURCE_SHIFT_NOT_OPEN');
END;

CREATE TRIGGER IF NOT EXISTS s01s_fuel_receipts_insert_open_only
BEFORE INSERT ON fuel_receipts
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = NEW.operational_shift_id AND s.status = 'OPEN'))
BEGIN
  SELECT RAISE(ABORT, 'STAGE01S_SOURCE_SHIFT_NOT_OPEN');
END;

CREATE TRIGGER IF NOT EXISTS s01s_fuel_receipts_update_open_only
BEFORE UPDATE ON fuel_receipts
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = OLD.operational_shift_id AND s.status = 'OPEN')) OR NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = NEW.operational_shift_id AND s.status = 'OPEN'))
BEGIN
  SELECT RAISE(ABORT, 'STAGE01S_SOURCE_SHIFT_NOT_OPEN');
END;

CREATE TRIGGER IF NOT EXISTS s01s_fuel_receipts_delete_open_only
BEFORE DELETE ON fuel_receipts
WHEN NOT (EXISTS (SELECT 1 FROM operational_shifts s WHERE s.id = OLD.operational_shift_id AND s.status = 'OPEN'))
BEGIN
  SELECT RAISE(ABORT, 'STAGE01S_SOURCE_SHIFT_NOT_OPEN');
END;

CREATE TRIGGER IF NOT EXISTS s01s_fuel_receipt_tank_lines_insert_open_only
BEFORE INSERT ON fuel_receipt_tank_lines
WHEN NOT (EXISTS (SELECT 1 FROM fuel_receipts r JOIN operational_shifts s ON s.id = r.operational_shift_id WHERE r.id = NEW.fuel_receipt_id AND s.status = 'OPEN'))
BEGIN
  SELECT RAISE(ABORT, 'STAGE01S_SOURCE_SHIFT_NOT_OPEN');
END;

CREATE TRIGGER IF NOT EXISTS s01s_fuel_receipt_tank_lines_update_open_only
BEFORE UPDATE ON fuel_receipt_tank_lines
WHEN NOT (EXISTS (SELECT 1 FROM fuel_receipts r JOIN operational_shifts s ON s.id = r.operational_shift_id WHERE r.id = OLD.fuel_receipt_id AND s.status = 'OPEN')) OR NOT (EXISTS (SELECT 1 FROM fuel_receipts r JOIN operational_shifts s ON s.id = r.operational_shift_id WHERE r.id = NEW.fuel_receipt_id AND s.status = 'OPEN'))
BEGIN
  SELECT RAISE(ABORT, 'STAGE01S_SOURCE_SHIFT_NOT_OPEN');
END;

CREATE TRIGGER IF NOT EXISTS s01s_fuel_receipt_tank_lines_delete_open_only
BEFORE DELETE ON fuel_receipt_tank_lines
WHEN NOT (EXISTS (SELECT 1 FROM fuel_receipts r JOIN operational_shifts s ON s.id = r.operational_shift_id WHERE r.id = OLD.fuel_receipt_id AND s.status = 'OPEN'))
BEGIN
  SELECT RAISE(ABORT, 'STAGE01S_SOURCE_SHIFT_NOT_OPEN');
END;
