-- PROPOSED additive draft-only migration 0039; NOT applied automatically.
-- A DRAFT is original source evidence, not a Retail Outlet, lease or signed contract.
-- Safe to rehearse in disposable local D1 before any controlled production release.
CREATE TABLE IF NOT EXISTS dealer_master_draft_uploads (
  id TEXT PRIMARY KEY NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  source_file_name TEXT NOT NULL,
  source_file_sha256 TEXT NOT NULL,
  source_sheet_name TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  source_row_count INTEGER NOT NULL CHECK (source_row_count BETWEEN 1 AND 500),
  business_field_count INTEGER NOT NULL CHECK (business_field_count = 26),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status = 'DRAFT'),
  source_data_json TEXT NOT NULL CHECK (length(source_data_json) BETWEEN 100 AND 650000),
  created_at TEXT NOT NULL,
  UNIQUE (created_by, content_sha256)
);
CREATE INDEX IF NOT EXISTS idx_dealer_drafts_creator_created
  ON dealer_master_draft_uploads(created_by, created_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_dealer_draft_no_overwrite
BEFORE UPDATE ON dealer_master_draft_uploads
BEGIN
  SELECT RAISE(ABORT,'DEALER_DRAFT_IMMUTABLE_CREATE_NEW_VERSION');
END;
CREATE TRIGGER IF NOT EXISTS trg_dealer_draft_no_delete
BEFORE DELETE ON dealer_master_draft_uploads
BEGIN
  SELECT RAISE(ABORT,'DEALER_DRAFT_IMMUTABLE_NO_DELETE');
END;
