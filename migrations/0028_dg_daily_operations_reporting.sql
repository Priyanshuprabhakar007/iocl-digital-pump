-- Phase 1: DG Daily Operations & Monthly Operations Reporting Schema
CREATE TABLE IF NOT EXISTS `dg_daily_logs` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `outlet_id` TEXT NOT NULL REFERENCES `retail_outlets`(`id`) ON DELETE CASCADE,
  `equipment_asset_id` TEXT NOT NULL REFERENCES `equipment_assets`(`id`) ON DELETE RESTRICT,
  `business_date` TEXT NOT NULL,
  `meter_reading_from_milliunits` INTEGER,
  `meter_reading_to_milliunits` INTEGER,
  `hsd_consumed_milliunits` INTEGER NOT NULL DEFAULT 0,
  `hsd_rate_paise_per_litre` INTEGER,
  `amount_paise` INTEGER,
  `remarks` TEXT,
  `status` TEXT NOT NULL DEFAULT 'DRAFT',
  `recorded_by_user_id` TEXT NOT NULL REFERENCES `users`(`id`),
  `updated_by_user_id` TEXT NOT NULL REFERENCES `users`(`id`),
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL,
  CONSTRAINT `uq_dg_daily_logs_asset_date` UNIQUE (`equipment_asset_id`, `business_date`),
  CHECK (`status` IN ('DRAFT', 'FINAL')),
  CHECK (`meter_reading_from_milliunits` IS NULL OR `meter_reading_from_milliunits` >= 0),
  CHECK (`meter_reading_to_milliunits` IS NULL OR `meter_reading_to_milliunits` >= 0),
  CHECK (`meter_reading_to_milliunits` IS NULL OR `meter_reading_from_milliunits` IS NULL OR `meter_reading_to_milliunits` >= `meter_reading_from_milliunits`),
  CHECK (`hsd_consumed_milliunits` >= 0),
  CHECK (`hsd_rate_paise_per_litre` IS NULL OR `hsd_rate_paise_per_litre` >= 0),
  CHECK (`amount_paise` IS NULL OR `amount_paise` >= 0),
  CHECK (`business_date` GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);

CREATE INDEX IF NOT EXISTS `idx_dg_daily_logs_outlet_date` ON `dg_daily_logs` (`outlet_id`, `business_date`);
CREATE INDEX IF NOT EXISTS `idx_dg_daily_logs_asset` ON `dg_daily_logs` (`equipment_asset_id`);
CREATE INDEX IF NOT EXISTS `idx_dg_daily_logs_recorded_by` ON `dg_daily_logs` (`recorded_by_user_id`);

CREATE TABLE IF NOT EXISTS `dg_run_intervals` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `dg_daily_log_id` TEXT NOT NULL REFERENCES `dg_daily_logs`(`id`) ON DELETE CASCADE,
  `sequence_no` INTEGER NOT NULL,
  `start_time` TEXT NOT NULL,
  `end_time` TEXT NOT NULL,
  `duration_minutes` INTEGER NOT NULL,
  `remarks` TEXT,
  `created_at` TEXT NOT NULL,
  CONSTRAINT `uq_dg_run_intervals_log_seq` UNIQUE (`dg_daily_log_id`, `sequence_no`),
  CHECK (`sequence_no` > 0),
  CHECK (`duration_minutes` >= 0)
);

CREATE INDEX IF NOT EXISTS `idx_dg_run_intervals_log_id` ON `dg_run_intervals` (`dg_daily_log_id`);
