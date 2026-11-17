-- Stage 01W: experimental source-version fence, disposable local D1 ONLY.
-- This is NOT a production migration or complete source-version integration.
-- It demonstrates an atomic SQL-side revision check during evidence INSERT.
CREATE TABLE IF NOT EXISTS stage01w_shift_source_versions (
  shift_id TEXT PRIMARY KEY REFERENCES operational_shifts(id),
  revision INTEGER NOT NULL CHECK (revision >= 0)
);
CREATE TABLE IF NOT EXISTS stage01w_prepared_evidence (
  id TEXT PRIMARY KEY,
  shift_id TEXT NOT NULL REFERENCES operational_shifts(id),
  source_revision INTEGER NOT NULL,
  category TEXT NOT NULL,
  amount_paise INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS stage01w_reject_stale_preparation
BEFORE INSERT ON stage01w_prepared_evidence
WHEN NOT EXISTS (
  SELECT 1 FROM stage01w_shift_source_versions v
  JOIN operational_shifts s ON s.id = v.shift_id
  WHERE v.shift_id = NEW.shift_id
    AND v.revision = NEW.source_revision
    AND s.status = 'CLOSING'
)
BEGIN
  SELECT RAISE(ABORT, 'STAGE01W_SOURCE_VERSION_STALE_OR_SHIFT_NOT_CLOSING');
END;
