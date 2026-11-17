/**
 * Stage 01K: portable D1 *scratch-table* contract, deliberately disconnected
 * from production routes, operational shifts, audit_logs and reconciliations.
 *
 * Invoke only from a separately deployed probe Worker bound to a freshly
 * created disposable Cloudflare D1. No migrations or production integrations.
 * Hosted behavior has NOT been verified merely because local tests pass.
 */
const PURPOSE = 'IOCL_STAGE01K_DISPOSABLE_ONLY';

export interface Stage01KReport {
  runId: string;
  checks: readonly string[];
  scratchAttemptCount: number;
  scratchEventCount: number;
}

type AttemptRow = {
  id: string;
  shift_key: string;
  idempotency_key: string;
  payload_fingerprint: string;
  state: 'PREPARED' | 'COMMITTED';
};

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readCount(db: D1Database, table: 'stage01k_contract_attempts' | 'stage01k_contract_events', runId: string) {
  const statement = table === 'stage01k_contract_attempts'
    ? 'SELECT count(*) AS n FROM stage01k_contract_attempts WHERE run_id = ?'
    : 'SELECT count(*) AS n FROM stage01k_contract_events WHERE run_id = ?';
  const row = await db.prepare(statement).bind(runId).first<{ n: number }>();
  return Number(row?.n ?? -1);
}

function assertContract(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

/**
 * Fails closed BEFORE any write. A DBA/operator must separately provision the
 * disposable scratch schema and insert the hash of a secret out of band.
 * Passing a token alone does NOT provision/identify a safe D1 database.
 */
export async function verifyStage01KGuard(db: D1Database, token: string): Promise<void> {
  if (typeof token !== 'string' || token.length < 24) {
    throw new Error('STAGE01K_APPROVAL_TOKEN_REQUIRED');
  }
  let found: { marker_hash: string } | null = null;
  try {
    found = await db.prepare(
      'SELECT marker_hash FROM stage01k_guard WHERE purpose = ? LIMIT 1',
    ).bind(PURPOSE).first<{ marker_hash: string }>();
  } catch {
    throw new Error('STAGE01K_NO_DISPOSABLE_DATABASE_GUARD');
  }
  const expectedHash = await sha256Hex(token);
  if (!found || found.marker_hash !== expectedHash) {
    throw new Error('STAGE01K_DISPOSABLE_DATABASE_GUARD_MISMATCH');
  }
}

async function getAttempt(db: D1Database, key: string): Promise<AttemptRow | null> {
  return await db.prepare(
    'SELECT id, shift_key, idempotency_key, payload_fingerprint, state FROM stage01k_contract_attempts WHERE idempotency_key = ?',
  ).bind(key).first<AttemptRow>();
}

async function reserve(
  db: D1Database, runId: string, shiftKey: string, key: string, fingerprint: string,
): Promise<{ id: string; replayed: boolean }> {
  const existing = await getAttempt(db, key);
  if (existing) {
    if (existing.shift_key !== shiftKey || existing.payload_fingerprint !== fingerprint) {
      throw new Error('STAGE01K_IDEMPOTENCY_KEY_CONFLICT');
    }
    return { id: existing.id, replayed: true };
  }

  const id = runId + ':attempt:' + crypto.randomUUID();
  const eventId = runId + ':event:' + crypto.randomUUID();
  const now = new Date().toISOString();

  await db.batch([
    db.prepare(
      `INSERT INTO stage01k_contract_attempts
       (id, run_id, shift_key, idempotency_key, payload_fingerprint, state, created_at)
       VALUES (?, ?, ?, ?, ?, 'PREPARED', ?)`,
    ).bind(id, runId, shiftKey, key, fingerprint, now),
    db.prepare(
      `INSERT INTO stage01k_contract_events
       (id, run_id, attempt_id, event_type, created_at)
       VALUES (?, ?, ?, 'RESERVED', ?)`,
    ).bind(eventId, runId, id, now),
  ]);
  return { id, replayed: false };
}

/**
 * Probe uses isolated scratch-only objects. It intentionally simulates a
 * post-commit lost response by re-reading rows; it cannot simulate real
 * Cloudflare networking failure or multiple Worker locations.
 */
export async function runStage01KContract(db: D1Database, approvalToken: string): Promise<Stage01KReport> {
  await verifyStage01KGuard(db, approvalToken);
  const runId = 'stage01k:' + crypto.randomUUID();
  const checks: string[] = [];

  // K01: reservation and matching retry are idempotent.
  const shiftKey = runId + ':shift:1';
  const key = runId + ':key:1';
  const first = await reserve(db, runId, shiftKey, key, 'fingerprint-a');
  const repeat = await reserve(db, runId, shiftKey, key, 'fingerprint-a');
  assertContract(!first.replayed && repeat.replayed && repeat.id === first.id, 'STAGE01K_REPLAY_FAILED');
  assertContract(await readCount(db, 'stage01k_contract_attempts', runId) === 1, 'STAGE01K_REPLAY_CREATED_ROW');
  checks.push('K01_RESERVE_AND_REPLAY');

  // K02: same key, contradictory payload is rejected without a new row.
  let conflict = false;
  try { await reserve(db, runId, shiftKey, key, 'fingerprint-b'); }
  catch (err) { conflict = err instanceof Error && err.message === 'STAGE01K_IDEMPOTENCY_KEY_CONFLICT'; }
  assertContract(conflict, 'STAGE01K_KEY_CONFLICT_NOT_REJECTED');
  checks.push('K02_KEY_REUSE_CONFLICT');

  // K03: if an event insert fails within a batch, the preceding intent
  // must also be rolled back. Failure is forced by reusing an event primary key.
  const reservedEvent = await db.prepare(
    "SELECT id FROM stage01k_contract_events WHERE attempt_id = ? AND event_type = 'RESERVED'",
  ).bind(first.id).first<{ id: string }>();
  assertContract(reservedEvent?.id, 'STAGE01K_MISSING_RESERVED_EVENT');
  const rollbackAttemptId = runId + ':rollback-attempt';
  let rollbackFailed = false;
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO stage01k_contract_attempts
         (id, run_id, shift_key, idempotency_key, payload_fingerprint, state, created_at)
         VALUES (?, ?, ?, ?, ?, 'PREPARED', ?)`,
      ).bind(rollbackAttemptId, runId, runId + ':shift:rollback',
        runId + ':key:rollback', 'rollback', new Date().toISOString()),
      db.prepare(
        `INSERT INTO stage01k_contract_events
         (id, run_id, attempt_id, event_type, created_at)
         VALUES (?, ?, ?, 'RESERVED', ?)`,
      ).bind(reservedEvent!.id, runId, rollbackAttemptId, new Date().toISOString()),
    ]);
  } catch { rollbackFailed = true; }
  assertContract(rollbackFailed, 'STAGE01K_FAILED_EVENT_DID_NOT_ABORT');
  assertContract((await db.prepare(
    'SELECT id FROM stage01k_contract_attempts WHERE id = ?',
  ).bind(rollbackAttemptId).first()) === null, 'STAGE01K_RESERVATION_BATCH_NOT_ROLLED_BACK');
  checks.push('K03_RESERVATION_BATCH_ROLLBACK');

  // K04: COMMITTED state and mandatory event must either both persist or both
  // roll back. Force the event failure with a duplicate event identifier.
  let commitFailed = false;
  try {
    await db.batch([
      db.prepare(
        "UPDATE stage01k_contract_attempts SET state = 'COMMITTED' WHERE id = ? AND state = 'PREPARED'",
      ).bind(first.id),
      db.prepare(
        `INSERT INTO stage01k_contract_events
         (id, run_id, attempt_id, event_type, created_at)
         VALUES (?, ?, ?, 'COMMITTED', ?)`,
      ).bind(reservedEvent!.id, runId, first.id, new Date().toISOString()),
    ]);
  } catch { commitFailed = true; }
  assertContract(commitFailed, 'STAGE01K_FAILED_COMMIT_EVENT_DID_NOT_ABORT');
  assertContract((await getAttempt(db, key))?.state === 'PREPARED', 'STAGE01K_COMMIT_STATUS_DID_NOT_ROLL_BACK');
  checks.push('K04_COMMIT_AND_AUDIT_ROLLBACK');

  // K05: an intact batch commits both status and event, then a simulated
  // lost-response retry can observe COMMITTED without writing again.
  await db.batch([
    db.prepare(
      "UPDATE stage01k_contract_attempts SET state = 'COMMITTED' WHERE id = ? AND state = 'PREPARED'",
    ).bind(first.id),
    db.prepare(
      `INSERT INTO stage01k_contract_events
       (id, run_id, attempt_id, event_type, created_at)
       VALUES (?, ?, ?, 'COMMITTED', ?)`,
    ).bind(runId + ':event:committed', runId, first.id, new Date().toISOString()),
  ]);
  const persisted = await reserve(db, runId, shiftKey, key, 'fingerprint-a');
  assertContract(persisted.replayed && (await getAttempt(db, key))?.state === 'COMMITTED',
    'STAGE01K_POST_COMMIT_REPLAY_FAILED');
  checks.push('K05_POST_COMMIT_RECONCILIATION');

  // K06: a unique shift key prevents concurrent distinct-key claims even if
  // both callers see no existing row before their batch.
  const raceShift = runId + ':shift:race';
  const races = await Promise.allSettled([
    reserve(db, runId, raceShift, runId + ':key:race1', 'race1'),
    reserve(db, runId, raceShift, runId + ':key:race2', 'race2'),
  ]);
  assertContract(races.filter(x => x.status === 'fulfilled').length === 1 &&
    races.filter(x => x.status === 'rejected').length === 1, 'STAGE01K_CONCURRENT_CLAIM_FAILED');
  checks.push('K06_CONCURRENT_CLAIM_GUARD');

  // K07: append-only scratch event cannot be modified or deleted.
  let updateRejected = false;
  try {
    await db.prepare('UPDATE stage01k_contract_events SET event_type = ? WHERE id = ?')
      .bind('COMMITTED', reservedEvent!.id).run();
  } catch { updateRejected = true; }
  let deleteRejected = false;
  try {
    await db.prepare('DELETE FROM stage01k_contract_events WHERE id = ?')
      .bind(reservedEvent!.id).run();
  } catch { deleteRejected = true; }
  assertContract(updateRejected && deleteRejected, 'STAGE01K_APPEND_ONLY_VIOLATED');
  checks.push('K07_APPEND_ONLY_GUARD');

  const scratchAttemptCount = await readCount(db, 'stage01k_contract_attempts', runId);
  const scratchEventCount = await readCount(db, 'stage01k_contract_events', runId);
  assertContract(scratchAttemptCount === 2 && scratchEventCount === 3, 'STAGE01K_FINAL_COUNTS_UNEXPECTED');
  return { runId, checks, scratchAttemptCount, scratchEventCount };
}
