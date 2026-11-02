-- =============================================================================
-- Migration 0033: Tank Calibration Chart Versioning, Metadata & Lineage
-- =============================================================================
-- Preserves all existing tank_calibration_points, tank_stock_readings, and
-- operational_shift_tanks records while introducing versioned chart headers.

-- 1. Create tank_calibration_charts header table
CREATE TABLE IF NOT EXISTS `tank_calibration_charts` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `tank_id` TEXT NOT NULL REFERENCES `tanks`(`id`) ON DELETE CASCADE,
  `revision_number` INTEGER NOT NULL DEFAULT 1,
  `status` TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(`status` IN ('DRAFT', 'APPROVED', 'ACTIVE', 'SUPERSEDED', 'ARCHIVED')),
  `chart_unit_dip` TEXT NOT NULL DEFAULT 'MM' CHECK(`chart_unit_dip` IN ('MM')),
  `chart_unit_volume` TEXT NOT NULL DEFAULT 'LITRES' CHECK(`chart_unit_volume` IN ('LITRES')),
  `tank_diameter_mm_milliunits` INTEGER,
  `tank_length_mm_milliunits` INTEGER,
  `max_dip_mm_milliunits` INTEGER,
  `chart_capacity_milliunits` INTEGER,
  `source_file_name` TEXT,
  `reference_document` TEXT,
  `notes` TEXT,
  `effective_from` TEXT NOT NULL,
  `effective_to` TEXT,
  `approved_by` TEXT REFERENCES `users`(`id`),
  `approved_at` TEXT,
  `created_at` TEXT NOT NULL,
  `created_by` TEXT REFERENCES `users`(`id`),
  `updated_at` TEXT NOT NULL,
  `updated_by` TEXT REFERENCES `users`(`id`),
  CONSTRAINT `chk_tcc_rev_positive` CHECK (`revision_number` >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS `uq_tcc_tank_revision`
  ON `tank_calibration_charts` (`tank_id`, `revision_number`);

CREATE UNIQUE INDEX IF NOT EXISTS `uq_tcc_single_active_per_tank`
  ON `tank_calibration_charts` (`tank_id`)
  WHERE `status` = 'ACTIVE';

CREATE INDEX IF NOT EXISTS `idx_tcc_tank_status`
  ON `tank_calibration_charts` (`tank_id`, `status`);

-- 2. Add chart_id to tank_calibration_points and replace flat tank+dip unique index
ALTER TABLE `tank_calibration_points`
  ADD COLUMN `chart_id` TEXT REFERENCES `tank_calibration_charts`(`id`) ON DELETE CASCADE;

DROP INDEX IF EXISTS `idx_tcp_tank_dip`;

CREATE UNIQUE INDEX IF NOT EXISTS `idx_tcp_chart_dip`
  ON `tank_calibration_points` (`chart_id`, `dip_millimetres_milliunits`)
  WHERE `chart_id` IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS `idx_tcp_legacy_tank_dip`
  ON `tank_calibration_points` (`tank_id`, `dip_millimetres_milliunits`)
  WHERE `chart_id` IS NULL;

CREATE INDEX IF NOT EXISTS `idx_tcp_chart_id`
  ON `tank_calibration_points` (`chart_id`);

-- 3. Backfill Revision 1 ACTIVE chart header for every tank that already has points
INSERT OR IGNORE INTO `tank_calibration_charts` (
  `id`,
  `tank_id`,
  `revision_number`,
  `status`,
  `chart_unit_dip`,
  `chart_unit_volume`,
  `tank_diameter_mm_milliunits`,
  `tank_length_mm_milliunits`,
  `max_dip_mm_milliunits`,
  `chart_capacity_milliunits`,
  `source_file_name`,
  `reference_document`,
  `notes`,
  `effective_from`,
  `effective_to`,
  `approved_by`,
  `approved_at`,
  `created_at`,
  `created_by`,
  `updated_at`,
  `updated_by`
)
SELECT
  'tcc-legacy-' || tcp.`tank_id` || '-r1' AS `id`,
  tcp.`tank_id` AS `tank_id`,
  1 AS `revision_number`,
  'ACTIVE' AS `status`,
  'MM' AS `chart_unit_dip`,
  'LITRES' AS `chart_unit_volume`,
  MAX(tcp.`dip_millimetres_milliunits`) AS `tank_diameter_mm_milliunits`,
  NULL AS `tank_length_mm_milliunits`,
  MAX(tcp.`dip_millimetres_milliunits`) AS `max_dip_mm_milliunits`,
  MAX(tcp.`volume_milliunits`) AS `chart_capacity_milliunits`,
  'legacy-d1-preserved' AS `source_file_name`,
  'REV-1-INITIAL' AS `reference_document`,
  'Automatically preserved initial calibration chart from existing D1 points' AS `notes`,
  COALESCE(SUBSTR(MIN(tcp.`created_at`), 1, 10), '1970-01-01') AS `effective_from`,
  NULL AS `effective_to`,
  MIN(tcp.`created_by`) AS `approved_by`,
  MIN(tcp.`created_at`) AS `approved_at`,
  MIN(tcp.`created_at`) AS `created_at`,
  MIN(tcp.`created_by`) AS `created_by`,
  MAX(tcp.`created_at`) AS `updated_at`,
  MIN(tcp.`created_by`) AS `updated_by`
FROM `tank_calibration_points` tcp
WHERE tcp.`chart_id` IS NULL
GROUP BY tcp.`tank_id`;

-- Link existing calibration points to their backfilled Revision 1 chart header
UPDATE `tank_calibration_points`
SET `chart_id` = 'tcc-legacy-' || `tank_id` || '-r1'
WHERE `chart_id` IS NULL;

-- 4. Add calibration version lineage columns to operational_shift_tanks & tank_stock_readings
ALTER TABLE `operational_shift_tanks`
  ADD COLUMN `calibration_chart_id` TEXT REFERENCES `tank_calibration_charts`(`id`);

ALTER TABLE `operational_shift_tanks`
  ADD COLUMN `calibration_revision` INTEGER;

ALTER TABLE `tank_stock_readings`
  ADD COLUMN `calibration_chart_id` TEXT REFERENCES `tank_calibration_charts`(`id`);

ALTER TABLE `tank_stock_readings`
  ADD COLUMN `calibration_revision` INTEGER;

CREATE INDEX IF NOT EXISTS `idx_tsr_calibration_chart_id`
  ON `tank_stock_readings` (`calibration_chart_id`);

CREATE INDEX IF NOT EXISTS `idx_ost_calibration_chart_id`
  ON `operational_shift_tanks` (`calibration_chart_id`);

-- 5. Backfill lineage on existing historical readings & shift snapshots where a Revision 1 chart exists
UPDATE `operational_shift_tanks`
SET
  `calibration_chart_id` = (
    SELECT c.`id`
    FROM `tank_calibration_charts` c
    WHERE c.`tank_id` = `operational_shift_tanks`.`tank_id`
    ORDER BY c.`revision_number` ASC
    LIMIT 1
  ),
  `calibration_revision` = 1
WHERE `calibration_chart_id` IS NULL
  AND EXISTS (
    SELECT 1
    FROM `tank_calibration_charts` c
    WHERE c.`tank_id` = `operational_shift_tanks`.`tank_id`
  );

UPDATE `tank_stock_readings`
SET
  `calibration_chart_id` = (
    SELECT c.`id`
    FROM `tank_calibration_charts` c
    WHERE c.`tank_id` = `tank_stock_readings`.`tank_id`
    ORDER BY c.`revision_number` ASC
    LIMIT 1
  ),
  `calibration_revision` = 1
WHERE `calibration_chart_id` IS NULL
  AND EXISTS (
    SELECT 1
    FROM `tank_calibration_charts` c
    WHERE c.`tank_id` = `tank_stock_readings`.`tank_id`
  );
