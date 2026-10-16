-- Phase 1: DG Daily Operations & Monthly Reporting Schema
CREATE TABLE IF NOT EXISTS `dg_daily_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `outlet_id` text NOT NULL REFERENCES `retail_outlets`(`id`) ON DELETE CASCADE,
  `equipment_id` text NOT NULL REFERENCES `equipment_assets`(`id`) ON DELETE RESTRICT,
  `log_date` text NOT NULL,
  `opening_run_hours` real NOT NULL,
  `closing_run_hours` real NOT NULL,
  `total_run_hours` real NOT NULL,
  `diesel_consumed_litres` real NOT NULL,
  `units_generated_kwh` real,
  `opening_diesel_balance_litres` real NOT NULL,
  `diesel_added_litres` real NOT NULL DEFAULT 0,
  `closing_diesel_balance_litres` real NOT NULL,
  `grid_failure_duration_minutes` integer NOT NULL DEFAULT 0,
  `power_cut_events_count` integer NOT NULL DEFAULT 0,
  `operator_user_id` text NOT NULL REFERENCES `users`(`id`),
  `remarks` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CHECK (`closing_run_hours` >= `opening_run_hours`),
  CHECK (`total_run_hours` >= 0),
  CHECK (`diesel_consumed_litres` >= 0),
  CHECK (`opening_diesel_balance_litres` >= 0),
  CHECK (`diesel_added_litres` >= 0),
  CHECK (`closing_diesel_balance_litres` >= 0),
  CHECK (`grid_failure_duration_minutes` >= 0),
  CHECK (`power_cut_events_count` >= 0),
  CHECK (`log_date` GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);

CREATE INDEX IF NOT EXISTS `idx_dg_daily_logs_outlet_date` ON `dg_daily_logs` (`outlet_id`, `log_date`);
CREATE INDEX IF NOT EXISTS `idx_dg_daily_logs_equipment` ON `dg_daily_logs` (`equipment_id`);
CREATE INDEX IF NOT EXISTS `idx_dg_daily_logs_operator` ON `dg_daily_logs` (`operator_user_id`);
