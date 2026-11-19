-- Additive-only 0040: editable Pending Setup metadata; original Dealer Master source stays immutable.
-- These rows are NOT operational outlets, leases, rent records, or legal agreements.
CREATE TABLE IF NOT EXISTS dealer_master_pending_setups (
  draft_id TEXT NOT NULL REFERENCES dealer_master_draft_uploads(id),
  ro_code TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  setup_json TEXT NOT NULL CHECK(length(setup_json) BETWEEN 20 AND 10000),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (draft_id, ro_code)
);
CREATE INDEX IF NOT EXISTS idx_dealer_pending_creator
  ON dealer_master_pending_setups(created_by,draft_id);
