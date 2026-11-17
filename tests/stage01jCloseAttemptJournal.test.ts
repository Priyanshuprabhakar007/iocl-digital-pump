import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import { readShiftCloseEvidenceSnapshot } from '../src/worker/services/shiftCloseEvidenceReader';
import {
  installPrototypeJournal,
  reservePrototypeCloseAttempt,
  markPrototypeReviewRequired,
  commitPrototypeAttempt,
  getPrototypeAttempt,
  type ReservePrototypeInput,
} from './helpers/closeAttemptJournalPrototype';

describe('Stage 01J: disposable local-D1 close-attempt journal prototype (NOT deployed)', () => {
  let localD1: ReturnType<typeof createLocalD1Database>;
  let file: string;
  let shiftId: string;
  let input: ReservePrototypeInput;

  async function scalar(query: string, ...params: unknown[]): Promise<number> {
    const row = await localD1.prepare(query).bind(...params).first<{ n: number }>();
    return Number(row?.n ?? -1);
  }

  async function countAttempts(): Promise<number> {
    return scalar('SELECT count(*) AS n FROM stage01j_close_attempts');
  }

  async function countEvents(type?: string): Promise<number> {
    return type
      ? scalar('SELECT count(*) AS n FROM stage01j_close_attempt_events WHERE event_type = ?', type)
      : scalar('SELECT count(*) AS n FROM stage01j_close_attempt_events');
  }

  async function actualShiftStatus(): Promise<string> {
    const row = await localD1.prepare('SELECT status FROM operational_shifts WHERE id = ?')
      .bind(shiftId).first<{ status: string }>();
    return row?.status ?? 'MISSING';
  }

  beforeEach(async () => {
    file = `./.sqlite/stage01j_journal_${Date.now()}_${crypto.randomUUID()}.db`;
    localD1 = createLocalD1Database(file);
    await seedDatabase(getDb(localD1));
    await installPrototypeJournal(localD1);
    const env: any = {
      DB: localD1,
      SESSION_SECRET: 'stage01j-synthetic-local-session-secret-1234567',
      ENVIRONMENT: 'development',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    };
    const auth = await app.fetch(new Request('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
    }), env);
    expect(auth.status).toBe(200);
    const cookie = auth.headers.get('set-cookie') ?? '';

    const opened = await app.fetch(new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ businessDate: '2026-11-13', shiftTemplateId: 'st-ro1-1' }),
    }), env);
    expect(opened.status).toBe(201);
    shiftId = ((await opened.json()) as any).data.id;
    input = {
      outletId: 'ro-1001',
      shiftId,
      actorId: 'user-admin',
      idempotencyKey: 'stage01j-close-test-001',
      fingerprint: 'synthetic-sha256-request-payload-001',
    };
  });

  afterEach(() => {
    if (localD1) localD1.close();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(file + suffix); } catch { /* disposable fixture */ }
    }
  });

  it('persists intent and append-only RESERVED evidence; same key/payload replays without writes', async () => {
    const first = await reservePrototypeCloseAttempt(localD1, input);
    expect(first.kind).toBe('CREATED');
    expect(first.attempt.state).toBe('PREPARED');
    const second = await reservePrototypeCloseAttempt(localD1, input);
    expect(second.kind).toBe('REPLAY');
    expect(second.attempt.attempt_id).toBe(first.attempt.attempt_id);
    expect(await countAttempts()).toBe(1);
    expect(await countEvents()).toBe(1);
    expect(await countEvents('RESERVED')).toBe(1);
    expect(await actualShiftStatus()).toBe('OPEN');
  });

  it('rejects a reused idempotency key with changed fingerprint, shift or outlet', async () => {
    await reservePrototypeCloseAttempt(localD1, input);
    for (const changes of [
      { fingerprint: 'another-payload' },
      { shiftId: 'other-shift' },
      { outletId: 'ro-wrong' },
    ]) {
      await expect(reservePrototypeCloseAttempt(localD1, { ...input, ...changes }))
        .rejects.toThrow('STAGE01J_IDEMPOTENCY_PAYLOAD_CONFLICT');
    }
    expect(await countAttempts()).toBe(1);
    expect(await countEvents()).toBe(1);
  });

  it('holds conflicting close attempts even from a different actor/key', async () => {
    await reservePrototypeCloseAttempt(localD1, input);
    await expect(reservePrototypeCloseAttempt(localD1, {
      ...input, actorId: 'user-other', idempotencyKey: 'stage01j-close-test-002',
    })).rejects.toThrow('STAGE01J_SHIFT_ATTEMPT_REQUIRES_REVIEW');
    expect(await countAttempts()).toBe(1);
    expect(await actualShiftStatus()).toBe('OPEN');
  });

  it('rejects wrong outlet or nonexistent shift without creating a journal entry', async () => {
    await expect(reservePrototypeCloseAttempt(localD1, { ...input, outletId: 'ro-wrong' }))
      .rejects.toThrow('STAGE01J_SHIFT_NOT_OPEN_OR_OUTLET_MISMATCH');
    await expect(reservePrototypeCloseAttempt(localD1, { ...input, shiftId: 'missing-shift' }))
      .rejects.toThrow('STAGE01J_SHIFT_NOT_OPEN_OR_OUTLET_MISMATCH');
    expect(await countAttempts()).toBe(0);
    expect(await countEvents()).toBe(0);
  });

  it('rolls back reservation when RESERVED event cannot be inserted', async () => {
    await localD1.exec(`CREATE TRIGGER stage01j_force_reserve_event_failure
      BEFORE INSERT ON stage01j_close_attempt_events
      WHEN NEW.event_type = 'RESERVED'
      BEGIN SELECT RAISE(ABORT, 'STAGE01J_INJECT_EVENT_FAILURE'); END;`);
    await expect(reservePrototypeCloseAttempt(localD1, input)).rejects.toThrow();
    expect(await countAttempts()).toBe(0);
    expect(await countEvents()).toBe(0);
    await localD1.exec('DROP TRIGGER stage01j_force_reserve_event_failure;');
    expect((await reservePrototypeCloseAttempt(localD1, input)).kind).toBe('CREATED');
  });

  it('atomically marks prototype COMMITTED and appends event without closing a real shift', async () => {
    const first = await reservePrototypeCloseAttempt(localD1, input);
    const committed = await commitPrototypeAttempt(localD1, first.attempt.attempt_id, input.actorId);
    expect(committed.kind).toBe('UPDATED');
    expect(committed.attempt.state).toBe('COMMITTED');
    const retry = await commitPrototypeAttempt(localD1, first.attempt.attempt_id, input.actorId);
    expect(retry.kind).toBe('REPLAY');
    expect(await countAttempts()).toBe(1);
    expect(await countEvents('COMMITTED')).toBe(1);
    expect(await countEvents()).toBe(2);
    expect(await actualShiftStatus()).toBe('OPEN');
    expect(await scalar(
      `SELECT count(*) AS n FROM audit_logs WHERE entity_id = ? AND action = 'SHIFT_CLOSE'`,
      shiftId,
    )).toBe(0);
  });

  it('rolls back prototype COMMITTED transition when corresponding event insert fails', async () => {
    const first = await reservePrototypeCloseAttempt(localD1, input);
    await localD1.exec(`CREATE TRIGGER stage01j_force_commit_event_failure
      BEFORE INSERT ON stage01j_close_attempt_events
      WHEN NEW.event_type = 'COMMITTED'
      BEGIN SELECT RAISE(ABORT, 'STAGE01J_INJECT_COMMIT_EVENT_FAILURE'); END;`);
    await expect(commitPrototypeAttempt(localD1, first.attempt.attempt_id, input.actorId)).rejects.toThrow();
    expect((await getPrototypeAttempt(localD1, first.attempt.attempt_id))?.state).toBe('PREPARED');
    expect(await countEvents('COMMITTED')).toBe(0);
    expect(await countEvents('RESERVED')).toBe(1);

    await localD1.exec('DROP TRIGGER stage01j_force_commit_event_failure;');
    expect((await commitPrototypeAttempt(localD1, first.attempt.attempt_id, input.actorId)).attempt.state)
      .toBe('COMMITTED');
  });

  it('retains uncertain attempts for review and forbids implicit commit or new attempt', async () => {
    const first = await reservePrototypeCloseAttempt(localD1, input);
    const review = await markPrototypeReviewRequired(localD1, first.attempt.attempt_id, input.actorId);
    expect(review.attempt.state).toBe('REVIEW_REQUIRED');
    expect((await markPrototypeReviewRequired(localD1, first.attempt.attempt_id, input.actorId)).kind).toBe('REPLAY');
    await expect(commitPrototypeAttempt(localD1, first.attempt.attempt_id, input.actorId))
      .rejects.toThrow('STAGE01J_REQUIRES_AUTHORIZED_REVIEW');
    await expect(reservePrototypeCloseAttempt(localD1, {
      ...input, idempotencyKey: 'stage01j-close-test-003',
    })).rejects.toThrow('STAGE01J_SHIFT_ATTEMPT_REQUIRES_REVIEW');
    expect((await reservePrototypeCloseAttempt(localD1, input)).attempt.state).toBe('REVIEW_REQUIRED');
    expect(await countEvents('REVIEW_REQUIRED')).toBe(1);
    expect(await actualShiftStatus()).toBe('OPEN');
  });

  it('rejects spoofed actor transitions and malformed keys without modifying the journal', async () => {
    const first = await reservePrototypeCloseAttempt(localD1, input);
    await expect(commitPrototypeAttempt(localD1, first.attempt.attempt_id, 'other-actor'))
      .rejects.toThrow('STAGE01J_ACTOR_MISMATCH');
    await expect(markPrototypeReviewRequired(localD1, first.attempt.attempt_id, 'other-actor'))
      .rejects.toThrow('STAGE01J_ACTOR_MISMATCH');
    await expect(reservePrototypeCloseAttempt(localD1, { ...input, idempotencyKey: 'bad' }))
      .rejects.toThrow('STAGE01J_INVALID_IDEMPOTENCY_KEY');
    expect(await countAttempts()).toBe(1);
    expect(await countEvents()).toBe(1);
  });

  it('rejects update/delete of append-only prototype evidence events', async () => {
    await reservePrototypeCloseAttempt(localD1, input);
    await expect(localD1.prepare(`
      UPDATE stage01j_close_attempt_events SET event_type = 'COMMITTED'
    `).run()).rejects.toThrow('STAGE01J_APPEND_ONLY_EVENT_UPDATE');
    await expect(localD1.prepare('DELETE FROM stage01j_close_attempt_events').run())
      .rejects.toThrow('STAGE01J_APPEND_ONLY_EVENT_DELETE');
    expect(await countEvents()).toBe(1);
  });

  it('preserves pre-existing real stock reconciliation rows during failed journal writes', async () => {
    const tank = await localD1.prepare(`
      SELECT id, product_id FROM tanks WHERE outlet_id = ? LIMIT 1
    `).bind(input.outletId).first<{ id: string; product_id: string }>();
    expect(tank).not.toBeNull();
    const timestamp = new Date().toISOString();
    await localD1.prepare(`
      INSERT INTO shift_stock_reconciliations (
        id, operational_shift_id, outlet_id, tank_id, product_id,
        opening_stock_milliunits, receipt_quantity_milliunits, sales_quantity_milliunits,
        theoretical_closing_stock_milliunits, physical_closing_stock_milliunits,
        variance_milliunits, variance_status, calculated_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 100000, 0, 0, 100000, 100000, 0, 'BALANCED', ?, ?, ?)
    `).bind('stage01j-prior-stock', shiftId, input.outletId, tank!.id, tank!.product_id,
      timestamp, timestamp, timestamp).run();

    await localD1.exec(`CREATE TRIGGER stage01j_force_commit_event_failure
      BEFORE INSERT ON stage01j_close_attempt_events
      WHEN NEW.event_type = 'COMMITTED'
      BEGIN SELECT RAISE(ABORT, 'STAGE01J_INJECT_COMMIT_EVENT_FAILURE'); END;`);
    const created = await reservePrototypeCloseAttempt(localD1, input);
    await expect(commitPrototypeAttempt(localD1, created.attempt.attempt_id, input.actorId))
      .rejects.toThrow();
    expect(await scalar(
      'SELECT count(*) AS n FROM shift_stock_reconciliations WHERE id = ?',
      'stage01j-prior-stock',
    )).toBe(1);
    expect((await getPrototypeAttempt(localD1, created.attempt.attempt_id))?.state).toBe('PREPARED');
    expect(await actualShiftStatus()).toBe('OPEN');
  });

  it('shows that Stage 01I reader does not yet consume prototype attempts (no live integration)', async () => {
    await reservePrototypeCloseAttempt(localD1, input);
    const snapshot = await readShiftCloseEvidenceSnapshot(getDb(localD1), shiftId, false);
    expect(snapshot?.status).toBe('OPEN');
    expect(snapshot?.stockReconciliationCount).toBe(0);
    expect(snapshot?.financialReconciliationCount).toBe(0);
    expect(snapshot?.shiftCloseAuditCount).toBe(0);
    expect(await countAttempts()).toBe(1);
    // Intentionally demonstrates the Stage 01I blind spot, not a safe close decision.
  });

  it('enforces the database unique index under concurrent distinct close keys', async () => {
    const settled = await Promise.allSettled([
      reservePrototypeCloseAttempt(localD1, input),
      reservePrototypeCloseAttempt(localD1, {
        ...input, idempotencyKey: 'stage01j-close-test-004', fingerprint: 'other-payload',
      }),
    ]);
    expect(settled.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(settled.filter(x => x.status === 'rejected')).toHaveLength(1);
    expect(await countAttempts()).toBe(1);
    expect(await countEvents('RESERVED')).toBe(1);
  });
});
