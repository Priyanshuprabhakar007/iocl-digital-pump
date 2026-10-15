-- =========================================================================
-- Migration 0027: Retail Outlet Directory Visibility (Soft Hide / Restore)
-- =========================================================================
-- Non-destructive additive migration adding directory visibility attributes
-- to retail_outlets. All existing rows default to directory_hidden = 0 (visible).
-- =========================================================================

ALTER TABLE `retail_outlets` ADD COLUMN `directory_hidden` INTEGER NOT NULL DEFAULT 0 CHECK (`directory_hidden` IN (0, 1));
ALTER TABLE `retail_outlets` ADD COLUMN `directory_hidden_at` TEXT;
ALTER TABLE `retail_outlets` ADD COLUMN `directory_hidden_by` TEXT;

CREATE INDEX IF NOT EXISTS `idx_outlets_directory_hidden` ON `retail_outlets` (`directory_hidden`);
