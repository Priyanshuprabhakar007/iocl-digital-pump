-- =============================================================================
-- Migration 0034: Global Tank Calibration Templates & Multi-Tank Assignment
-- =============================================================================
-- Introduces reusable global tank calibration templates (e.g. STANDARD_20KL, STANDARD_50KL)
-- while preserving tank-wise calibration chart revisions, historical readings, and DSRs.
-- Reference templates are initialized in DRAFT status with official IOCL reference dimensions
-- and must not be marked APPROVED until complete verified dip-to-volume points are imported.

-- 1. Create global_tank_calibration_templates header table
CREATE TABLE IF NOT EXISTS `global_tank_calibration_templates` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `code` TEXT NOT NULL UNIQUE,
  `name` TEXT NOT NULL,
  `nominal_capacity_litres` INTEGER NOT NULL,
  `tank_diameter_mm_milliunits` INTEGER,
  `tank_length_mm_milliunits` INTEGER,
  `max_dip_mm_milliunits` INTEGER,
  `revision_number` INTEGER NOT NULL DEFAULT 1,
  `status` TEXT NOT NULL DEFAULT 'DRAFT' CHECK(`status` IN ('DRAFT', 'APPROVED', 'ACTIVE', 'SUPERSEDED', 'ARCHIVED')),
  `source_file_name` TEXT,
  `reference_document` TEXT,
  `notes` TEXT,
  `created_by` TEXT REFERENCES `users`(`id`),
  `created_at` TEXT NOT NULL,
  `approved_by` TEXT REFERENCES `users`(`id`),
  `approved_at` TEXT,
  `updated_at` TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `uq_gtct_code`
  ON `global_tank_calibration_templates` (`code`);

CREATE INDEX IF NOT EXISTS `idx_gtct_status`
  ON `global_tank_calibration_templates` (`status`);

CREATE INDEX IF NOT EXISTS `idx_gtct_capacity`
  ON `global_tank_calibration_templates` (`nominal_capacity_litres`);

-- 2. Create global_tank_calibration_template_points child table
CREATE TABLE IF NOT EXISTS `global_tank_calibration_template_points` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `template_id` TEXT NOT NULL REFERENCES `global_tank_calibration_templates`(`id`) ON DELETE CASCADE,
  `dip_millimetres_milliunits` INTEGER NOT NULL,
  `volume_milliunits` INTEGER NOT NULL,
  `created_at` TEXT NOT NULL,
  `created_by` TEXT REFERENCES `users`(`id`)
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_gtctp_template_dip`
  ON `global_tank_calibration_template_points` (`template_id`, `dip_millimetres_milliunits`);

CREATE INDEX IF NOT EXISTS `idx_gtctp_template_id`
  ON `global_tank_calibration_template_points` (`template_id`);

-- 3. Add source_template_id to tank_calibration_charts to track lineage back to standard templates
ALTER TABLE `tank_calibration_charts`
  ADD COLUMN `source_template_id` TEXT REFERENCES `global_tank_calibration_templates`(`id`);

CREATE INDEX IF NOT EXISTS `idx_tcc_source_template_id`
  ON `tank_calibration_charts` (`source_template_id`);

-- 4. Seed Standard 20 KL Global Calibration Template Header (DRAFT until verified CSV points imported)
-- IOCL Reference Dimensions: Diameter = 2100 mm, Length = 6250 mm, Max Dip = 2100 mm
INSERT OR IGNORE INTO `global_tank_calibration_templates` (
  `id`,
  `code`,
  `name`,
  `nominal_capacity_litres`,
  `tank_diameter_mm_milliunits`,
  `tank_length_mm_milliunits`,
  `max_dip_mm_milliunits`,
  `revision_number`,
  `status`,
  `source_file_name`,
  `reference_document`,
  `notes`,
  `created_by`,
  `created_at`,
  `approved_by`,
  `approved_at`,
  `updated_at`
) VALUES (
  'gtct-std-20kl',
  'STANDARD_20KL',
  'Standard 20,000 Litre Tank Calibration Chart',
  20000,
  2100000,
  6250000,
  2100000,
  1,
  'DRAFT',
  'iocl_standard_20kl_calibration.pdf',
  'IOCL-STD-TANK-20KL-REV1',
  'Official IOCL reference dimensions (Diameter 2100 mm, Length 6250 mm, Max Dip 2100 mm) for 20 KL horizontal cylindrical underground storage tanks. Import and validate complete dip-to-volume CSV data before approval.',
  NULL,
  '2026-01-01T00:00:00.000Z',
  NULL,
  NULL,
  '2026-01-01T00:00:00.000Z'
);

-- 5. Seed Standard 50 KL Global Calibration Template Header (DRAFT until verified CSV points imported)
-- IOCL Reference Dimensions: Diameter = 3000 mm, Length = 7500 mm, Max Dip = 3000 mm
INSERT OR IGNORE INTO `global_tank_calibration_templates` (
  `id`,
  `code`,
  `name`,
  `nominal_capacity_litres`,
  `tank_diameter_mm_milliunits`,
  `tank_length_mm_milliunits`,
  `max_dip_mm_milliunits`,
  `revision_number`,
  `status`,
  `source_file_name`,
  `reference_document`,
  `notes`,
  `created_by`,
  `created_at`,
  `approved_by`,
  `approved_at`,
  `updated_at`
) VALUES (
  'gtct-std-50kl',
  'STANDARD_50KL',
  'Standard 50,000 Litre Tank Calibration Chart',
  50000,
  3000000,
  7500000,
  3000000,
  1,
  'DRAFT',
  'iocl_standard_50kl_calibration.pdf',
  'IOCL-STD-TANK-50KL-REV1',
  'Official IOCL reference dimensions (Diameter 3000 mm, Length 7500 mm, Max Dip 3000 mm) for 50 KL high-capacity underground storage tanks. Import and validate complete dip-to-volume CSV data before approval.',
  NULL,
  '2026-01-01T00:00:00.000Z',
  NULL,
  NULL,
  '2026-01-01T00:00:00.000Z'
);
