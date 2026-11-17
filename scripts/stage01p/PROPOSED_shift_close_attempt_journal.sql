-- Stage 01P: durable attempt history for NORMAL shift-close workflow.
-- PROPOSED ONLY: DO NOT APPLY AUTOMATICALLY. Requires a reviewed, sequential
-- migration after the frozen 0001-0035 production schema release gates change.
CREATE TABLE IF NOT EXISTS shift_close_attempts (
  id TEXT PRIMARY KEY,
  shift_id TEXT NOT NULL REFERENCES operational_shifts(id),
  outlet_id TEXT NOT NULL REFERENCES retail_outlets(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  state TEXT NOT NULL CHECK (state IN (
    'CLAIMED', 'PREPARED', 'COMMITTED', 'VALIDATION_REJECTED', 'REVIEW_REQUIRED'
  )),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shift_close_attempts_shift
  ON shift_close_attempts(shift_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_close_attempts_one_active
  ON shift_close_attempts(shift_id)
  WHERE state IN ('CLAIMED', 'PREPARED', 'COMMITTED', 'REVIEW_REQUIRED');
CREATE TABLE IF NOT EXISTS shift_close_attempt_events (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES shift_close_attempts(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'CLAIMED', 'PREPARED', 'COMMITTED', 'VALIDATION_REJECTED', 'REVIEW_REQUIRED'
  )),
  actor_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE(attempt_id, event_type)
);
CREATE INDEX IF NOT EXISTS idx_shift_close_attempt_events_attempt
  ON shift_close_attempt_events(attempt_id, created_at);
CREATE TRIGGER IF NOT EXISTS shift_close_attempt_events_immutable_update
  BEFORE UPDATE ON shift_close_attempt_events
  BEGIN SELECT RAISE(ABORT, 'SHIFT_CLOSE_ATTEMPT_EVENTS_APPEND_ONLY_UPDATE'); END;
CREATE TRIGGER IF NOT EXISTS shift_close_attempt_events_immutable_delete
  BEFORE DELETE ON shift_close_attempt_events
  BEGIN SELECT RAISE(ABORT, 'SHIFT_CLOSE_ATTEMPT_EVENTS_APPEND_ONLY_DELETE'); END;
