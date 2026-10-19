-- Migration 0030: Retail Outlet Archive / Restore Lifecycle
-- Adds lifecycle_status, is_archived, archived_at, and archived_by to retail_outlets
-- and synchronizes any previously hidden outlets with the archived lifecycle state.

ALTER TABLE retail_outlets ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (lifecycle_status IN ('ACTIVE', 'ARCHIVED'));
ALTER TABLE retail_outlets ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1));
ALTER TABLE retail_outlets ADD COLUMN archived_at TEXT;
ALTER TABLE retail_outlets ADD COLUMN archived_by TEXT REFERENCES users(id);

UPDATE retail_outlets
SET
  lifecycle_status = 'ARCHIVED',
  is_archived = 1,
  archived_at = COALESCE(directory_hidden_at, datetime('now')),
  archived_by = directory_hidden_by
WHERE directory_hidden = 1;

CREATE INDEX IF NOT EXISTS idx_retail_outlets_lifecycle_status ON retail_outlets(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_retail_outlets_is_archived ON retail_outlets(is_archived);
