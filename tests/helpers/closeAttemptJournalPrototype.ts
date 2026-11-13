/**
 * STAGE 01J — TEST-ONLY close-attempt protocol prototype.
 *
 * Located in tests/helpers deliberately: NOT a production migration, API,
 * operational close implementation, recovery command or proof of hosted D1.
 * Every method is used exclusively by disposable local-D1 tests.
 */
export type PrototypeAttemptState = 'PREPARED' | 'REVIEW_REQUIRED' | 'COMMITTED';

export interface PrototypeAttempt {
  attempt_id: string;
  outlet_id: string;
  shift_id: string;
  actor_id: string;
  idempotency_key: string;
  payload_fingerprint: string;
  state: PrototypeAttemptState;
  created_at: string;
  updated_at: string;
}

export interface ReservePrototypeInput {
  outletId: string;
  shiftId: string;
  actorId: string;
  idempotencyKey: string;
  fingerprint: string;
}

export interface PrototypeResult {
  kind: 'CREATED' | 'REPLAY' | 'UPDATED';
  attempt: PrototypeAttempt;
}

const KEY_PATTERN = /^[A-Za-z0-9_:.-]{8,128}$/;

function requireNonEmpty(value: string, code: string): void {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
}

/**
 * Fixture-only tables intentionally absent from src/db/schema.ts and migrations.
 * The partial unique index prevents two active or committed attempts per shift.
 * The event table is append-only, with a unique event per attempt/type.
 */
export async function installPrototypeJournal(d1: D1Database): Promise<void> {
  await d1.exec(`
    CREATE TABLE stage01j_close_attempts (
      attempt_id TEXT PRIMARY KEY,
      outlet_id TEXT NOT NULL,
      shift_id TEXT NOT NULL REFERENCES operational_shifts(id),
      actor_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      payload_fingerprint TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('PREPARED', 'REVIEW_REQUIRED', 'COMMITTED')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(actor_id, idempotency_key)
    );
    CREATE UNIQUE INDEX stage01j_one_active_attempt_per_shift
      ON stage01j_close_attempts(shift_id)
      WHERE state IN ('PREPARED', 'REVIEW_REQUIRED', 'COMMITTED');
    CREATE TABLE stage01j_close_attempt_events (
      event_id TEXT PRIMARY KEY,
      attempt_id TEXT NOT NULL REFERENCES stage01j_close_attempts(attempt_id),
      event_type TEXT NOT NULL CHECK (event_type IN ('RESERVED', 'REVIEW_REQUIRED', 'COMMITTED')),
      actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(attempt_id, event_type)
    );
    CREATE TRIGGER stage01j_events_no_update
      BEFORE UPDATE ON stage01j_close_attempt_events
      BEGIN SELECT RAISE(ABORT, 'STAGE01J_APPEND_ONLY_EVENT_UPDATE'); END;
    CREATE TRIGGER stage01j_events_no_delete
      BEFORE DELETE ON stage01j_close_attempt_events
      BEGIN SELECT RAISE(ABORT, 'STAGE01J_APPEND_ONLY_EVENT_DELETE'); END;
  `);
}

export async function getPrototypeAttempt(
  d1: D1Database,
  attemptId: string,
): Promise<PrototypeAttempt | null> {
  return (await d1.prepare(
    'SELECT * FROM stage01j_close_attempts WHERE attempt_id = ? LIMIT 1',
  ).bind(attemptId).first<PrototypeAttempt>()) ?? null;
}

async function getAttemptByKey(
  d1: D1Database,
  actorId: string,
  key: string,
): Promise<PrototypeAttempt | null> {
  return (await d1.prepare(
    'SELECT * FROM stage01j_close_attempts WHERE actor_id = ? AND idempotency_key = ? LIMIT 1',
  ).bind(actorId, key).first<PrototypeAttempt>()) ?? null;
}

export async function reservePrototypeCloseAttempt(
  d1: D1Database,
  input: ReservePrototypeInput,
): Promise<PrototypeResult> {
  requireNonEmpty(input.outletId, 'STAGE01J_OUTLET_REQUIRED');
  requireNonEmpty(input.shiftId, 'STAGE01J_SHIFT_REQUIRED');
  requireNonEmpty(input.actorId, 'STAGE01J_ACTOR_REQUIRED');
  requireNonEmpty(input.fingerprint, 'STAGE01J_FINGERPRINT_REQUIRED');
  if (typeof input.idempotencyKey !== 'string' || !KEY_PATTERN.test(input.idempotencyKey)) {
    throw new Error('STAGE01J_INVALID_IDEMPOTENCY_KEY');
  }

  const prior = await getAttemptByKey(d1, input.actorId, input.idempotencyKey);
  if (prior) {
    if (prior.shift_id !== input.shiftId || prior.outlet_id !== input.outletId ||
        prior.payload_fingerprint !== input.fingerprint) {
      throw new Error('STAGE01J_IDEMPOTENCY_PAYLOAD_CONFLICT');
    }
    return { kind: 'REPLAY', attempt: prior };
  }

  const existing = await d1.prepare(
    `SELECT attempt_id FROM stage01j_close_attempts
     WHERE shift_id = ? AND state IN ('PREPARED', 'REVIEW_REQUIRED', 'COMMITTED')
     LIMIT 1`,
  ).bind(input.shiftId).first<{ attempt_id: string }>();
  if (existing) throw new Error('STAGE01J_SHIFT_ATTEMPT_REQUIRES_REVIEW');

  const attemptId = 'stage01j-' + crypto.randomUUID();
  const eventId = 'stage01j-event-' + crypto.randomUUID();
  const now = new Date().toISOString();

  // A local-D1 batch tests atomic insertion of intent and its append-only event.
  // The SELECT also checks the target's outlet and OPEN state inside the batch.
  const results = await d1.batch([
    d1.prepare(`
      INSERT INTO stage01j_close_attempts (
        attempt_id, outlet_id, shift_id, actor_id, idempotency_key,
        payload_fingerprint, state, created_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, 'PREPARED', ?, ?
      WHERE EXISTS (
        SELECT 1 FROM operational_shifts
        WHERE id = ? AND outlet_id = ? AND status = 'OPEN'
      )
      RETURNING attempt_id
    `).bind(
      attemptId, input.outletId, input.shiftId, input.actorId, input.idempotencyKey,
      input.fingerprint, now, now, input.shiftId, input.outletId,
    ),
    d1.prepare(`
      INSERT INTO stage01j_close_attempt_events (
        event_id, attempt_id, event_type, actor_id, created_at
      )
      SELECT ?, attempt_id, 'RESERVED', ?, ? FROM stage01j_close_attempts WHERE attempt_id = ?
      RETURNING event_id
    `).bind(eventId, input.actorId, now, attemptId),
  ]);
  if (results[0]?.results?.length !== 1 || results[1]?.results?.length !== 1) {
    throw new Error('STAGE01J_SHIFT_NOT_OPEN_OR_OUTLET_MISMATCH');
  }

  const attempt = await getPrototypeAttempt(d1, attemptId);
  if (!attempt) throw new Error('STAGE01J_RESERVATION_OUTCOME_UNKNOWN');
  return { kind: 'CREATED', attempt };
}

/**
 * An uncertain close attempt is HELD, not automatically failed or retried.
 * Only test code calls this transition; the actual operational shift is unchanged.
 */
export async function markPrototypeReviewRequired(
  d1: D1Database,
  attemptId: string,
  actorId: string,
): Promise<PrototypeResult> {
  return transitionPrototypeAttempt(d1, attemptId, actorId, 'REVIEW_REQUIRED');
}

/**
 * Prototype commit is only a *journal event*, NEVER a real shift close.
 * Shift status, stock/financial reconciliations and audit_logs remain untouched.
 */
export async function commitPrototypeAttempt(
  d1: D1Database,
  attemptId: string,
  actorId: string,
): Promise<PrototypeResult> {
  return transitionPrototypeAttempt(d1, attemptId, actorId, 'COMMITTED');
}

async function transitionPrototypeAttempt(
  d1: D1Database,
  attemptId: string,
  actorId: string,
  nextState: 'REVIEW_REQUIRED' | 'COMMITTED',
): Promise<PrototypeResult> {
  requireNonEmpty(attemptId, 'STAGE01J_ATTEMPT_ID_REQUIRED');
  requireNonEmpty(actorId, 'STAGE01J_ACTOR_REQUIRED');

  const prior = await getPrototypeAttempt(d1, attemptId);
  if (!prior) throw new Error('STAGE01J_ATTEMPT_NOT_FOUND');
  if (prior.actor_id !== actorId) throw new Error('STAGE01J_ACTOR_MISMATCH');
  if (prior.state === nextState) return { kind: 'REPLAY', attempt: prior };
  if (prior.state !== 'PREPARED') throw new Error('STAGE01J_REQUIRES_AUTHORIZED_REVIEW');

  const now = new Date().toISOString();
  const eventId = 'stage01j-event-' + crypto.randomUUID();
  const outcomes = await d1.batch([
    d1.prepare(`
      UPDATE stage01j_close_attempts SET state = ?, updated_at = ?
      WHERE attempt_id = ? AND actor_id = ? AND state = 'PREPARED'
      RETURNING attempt_id
    `).bind(nextState, now, attemptId, actorId),
    d1.prepare(`
      INSERT INTO stage01j_close_attempt_events
        (event_id, attempt_id, event_type, actor_id, created_at)
      SELECT ?, attempt_id, ?, ?, ? FROM stage01j_close_attempts
      WHERE attempt_id = ? AND state = ?
      RETURNING event_id
    `).bind(eventId, nextState, actorId, now, attemptId, nextState),
  ]);
  if (outcomes[0]?.results?.length !== 1 || outcomes[1]?.results?.length !== 1) {
    throw new Error('STAGE01J_TRANSITION_OUTCOME_UNKNOWN');
  }
  const attempt = await getPrototypeAttempt(d1, attemptId);
  if (!attempt) throw new Error('STAGE01J_TRANSITION_OUTCOME_UNKNOWN');
  return { kind: 'UPDATED', attempt };
}
