-- PROPOSAL ONLY. Do not add to migrations/ or apply to hosted D1 without
-- baseline audit, approved rollout, backup, rollback plan and validation.
-- For calibrated charts already captured by ANY shift tank snapshot or tank
-- dip reading, prevent untracked direct SQL point writes (not just API writes).
-- Legacy null chart_id points are not covered by this proposal until migrated.
-- Creating a NEW chart revision and editing its unreferenced points remains
-- possible. Historical chart references stay valid after supersession.

CREATE TRIGGER IF NOT EXISTS p0_calibration_ref_points_no_insert
BEFORE INSERT ON tank_calibration_points
WHEN NEW.chart_id IS NOT NULL AND (
  EXISTS (SELECT 1 FROM operational_shift_tanks AS s
          WHERE s.calibration_chart_id = NEW.chart_id)
  OR EXISTS (SELECT 1 FROM tank_stock_readings AS r
             WHERE r.calibration_chart_id = NEW.chart_id)
)
BEGIN SELECT RAISE(ABORT, 'P0_CALIBRATION_CHART_REFERENCED_IMMUTABLE'); END;

CREATE TRIGGER IF NOT EXISTS p0_calibration_ref_points_no_update
BEFORE UPDATE ON tank_calibration_points
WHEN (
  OLD.chart_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM operational_shift_tanks AS s
            WHERE s.calibration_chart_id = OLD.chart_id)
    OR EXISTS (SELECT 1 FROM tank_stock_readings AS r
               WHERE r.calibration_chart_id = OLD.chart_id)
  )
) OR (
  NEW.chart_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM operational_shift_tanks AS s
            WHERE s.calibration_chart_id = NEW.chart_id)
    OR EXISTS (SELECT 1 FROM tank_stock_readings AS r
               WHERE r.calibration_chart_id = NEW.chart_id)
  )
)
BEGIN SELECT RAISE(ABORT, 'P0_CALIBRATION_CHART_REFERENCED_IMMUTABLE'); END;

CREATE TRIGGER IF NOT EXISTS p0_calibration_ref_points_no_delete
BEFORE DELETE ON tank_calibration_points
WHEN OLD.chart_id IS NOT NULL AND (
  EXISTS (SELECT 1 FROM operational_shift_tanks AS s
          WHERE s.calibration_chart_id = OLD.chart_id)
  OR EXISTS (SELECT 1 FROM tank_stock_readings AS r
             WHERE r.calibration_chart_id = OLD.chart_id)
)
BEGIN SELECT RAISE(ABORT, 'P0_CALIBRATION_CHART_REFERENCED_IMMUTABLE'); END;
