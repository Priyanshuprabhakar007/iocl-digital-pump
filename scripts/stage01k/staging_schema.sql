-- Stage 01K disposable-only Cloudflare D1 scratch schema.
-- DO NOT apply to IOCL production or existing operational/staging databases.
-- Must be applied ONLY to a newly created, dedicated Stage 01K database.
-- The operator separately inserts a SHA-256 token hash into stage01k_guard.
CREATE TABLE IF NOT EXISTS stage01k_guard (
  purpose TEXT PRIMARY KEY CHECK (purpose = 'IOCL_STAGE01K_DISPOSABLE_ONLY'),
  marker_hash TEXT NOT NULL CHECK (length(marker_hash) = 64)
);

CREATE TABLE IF NOT EXISTS stage01k_contract_attempts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  shift_key TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_fingerprint TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('PREPARED', 'COMMITTED')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stage01k_contract_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL REFERENCES stage01k_contract_attempts(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('RESERVED', 'COMMITTED')),
  created_at TEXT NOT NULL,
  UNIQUE (attempt_id, event_type)
);

CREATE TRIGGER IF NOT EXISTS stage01k_protect_events_update
  BEFORE UPDATE ON stage01k_contract_events
  BEGIN SELECT RAISE(ABORT, 'STAGE01K_APPEND_ONLY_UPDATE'); END;

CREATE TRIGGER IF NOT EXISTS stage01k_protect_events_delete
  BEFORE DELETE ON stage01k_contract_events
  BEGIN SELECT RAISE(ABORT, 'STAGE01K_APPEND_ONLY_DELETE'); END;
