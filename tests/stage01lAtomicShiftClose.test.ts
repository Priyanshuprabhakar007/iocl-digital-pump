import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import { readShiftCloseEvidenceSnapshot } from '../src/worker/services/shiftCloseEvidenceReader';
import { assessShiftCloseEvidence } from '../src/worker/services/shiftCloseRecoveryAssessment';
import {
  installPrototypeJournal, reservePrototypeCloseAttempt,
  markPrototypeReviewRequired, getPrototypeAttempt, type ReservePrototypeInput,
} from './helpers/closeAttemptJournalPrototype';
import {
  installStage01LTestGuards, claimStage01LTestShift, commitStage01LTestBatch,
  type AtomicCloseFixture,
} from './helpers/stage01lAtomicClosePrototype';

/**
 * A prototype of one atomic DB COMMIT, not a replacement ShiftCloseService.
 * These tests use dummy financial amounts, not real fuel/business calculations.
 * The local SQLite emulator is not a hosted Cloudflare D1 verification.
 */
describe('Stage 01L: real-schema atomic close contract in disposable local D1', () => {
  let db: ReturnType<typeof createLocalD1Database>;
  let path: string;
  let input: ReservePrototypeInput;
  let fixture: AtomicCloseFixture;

  const sqlCount = async (table: 'shift_stock_reconciliations' | 'shift_financial_reconciliations' |
    'audit_logs' | 'stage01j_close_attempt_events', shiftId?: string, action?: string): Promise<number> => {
    const statement = table === 'audit_logs'
      ? 'SELECT count(*) AS n FROM audit_logs WHERE entity_id = ? AND action = ?'
      : table === 'stage01j_close_attempt_events'
        ? 'SELECT count(*) AS n FROM stage01j_close_attempt_events WHERE attempt_id = ? AND event_type = ?'
        : `SELECT count(*) AS n FROM ${table} WHERE operational_shift_id = ?`;
    const row = await db.prepare(statement)
      .bind(shiftId ?? fixture.shiftId, action ?? (table === 'audit_logs' ? 'SHIFT_CLOSE' : 'COMMITTED'))
      .first<{ n: number }>();
    return Number(row?.n ?? -1);
  };

  async function evidence() {
    return readShiftCloseEvidenceSnapshot(getDb(db), fixture.shiftId, false);
  }
  async function shiftStatus(): Promise<string> {
    const row = await db.prepare('SELECT status FROM operational_shifts WHERE id = ?')
      .bind(fixture.shiftId).first<{ status: string }>();
    return row?.status || 'NOT_FOUND';
  }
  async function counts() {
    const values = await Promise.all([
      sqlCount('shift_stock_reconciliations'),
      sqlCount('shift_financial_reconciliations'),
      sqlCount('audit_logs', fixture.shiftId, 'SHIFT_CLOSE'),
      sqlCount('audit_logs', fixture.shiftId, 'FINANCIAL_RECONCILIATION'),
      sqlCount('stage01j_close_attempt_events', fixture.attemptId, 'COMMITTED'),
    ]);
    return {
      stock: values[0],
      finance: values[1],
      closeAudits: values[2],
      financeAudits: values[3],
      committedEvents: values[4],
    };
  }

  beforeEach(async () => {
    path = `./.sqlite/test_stage01l_${crypto.randomUUID()}.db`;
    db = createLocalD1Database(path);
    await seedDatabase(getDb(db));
    await installPrototypeJournal(db);
    const env: any = {
      DB: db,
      SESSION_SECRET: 'stage01l-local-test-session-secret-1234567890',
      ENVIRONMENT: 'development',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    };
    const login = await app.fetch(new Request('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
    }), env);
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie') || '';
    const opened = await app.fetch(new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ businessDate: '2026-11-13', shiftTemplateId: 'st-ro1-1' }),
    }), env);
    expect(opened.status).toBe(201);
    const shiftId = ((await opened.json()) as any).data.id as string;
    input = {
      outletId: 'ro-1001', shiftId, actorId: 'user-admin',
      idempotencyKey: 'stage01l-close-key-0001',
      fingerprint: 'synthetic-source-fingerprint-stage01l',
    };
    const reserved = await reservePrototypeCloseAttempt(db, input);
    expect(reserved.kind).toBe('CREATED');
    fixture = { shiftId, outletId: input.outletId, actorId: input.actorId, attemptId: reserved.attempt.attempt_id };
    await installStage01LTestGuards(db);
    await claimStage01LTestShift(db, fixture);
    expect(await shiftStatus()).toBe('CLOSING');
  });

  afterEach(() => {
    if (db) db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(path + suffix); } catch { /* disposable local-only fixture */ }
    }
  });

  it('atomically persists full tank set, financial record, two audits and CLOSED journal outcome', async () => {
    await commitStage01LTestBatch(db, fixture);
    const expectedTanks = await db.prepare(
      'SELECT count(*) AS n FROM operational_shift_tanks WHERE operational_shift_id = ?',
    ).bind(fixture.shiftId).first<{ n: number }>();
    expect(await shiftStatus()).toBe('CLOSED');
    expect(await counts()).toEqual({
      stock: expectedTanks!.n,
      finance: 1, closeAudits: 1, financeAudits: 1, committedEvents: 1,
    });
    expect((await getPrototypeAttempt(db, fixture.attemptId))?.state).toBe('COMMITTED');
    const snapshot = await evidence();
    expect(snapshot).not.toBeNull();
    expect(assessShiftCloseEvidence(snapshot!).disposition).toBe('CLOSED_EVIDENCE_COMPLETE');
  });

  it('rolls back all reconciliations and CLOSED transition when mandatory SHIFT_CLOSE audit fails', async () => {
    await db.exec(`CREATE TRIGGER stage01l_force_close_audit_failure
      BEFORE INSERT ON audit_logs
      WHEN NEW.action = 'SHIFT_CLOSE'
      BEGIN SELECT RAISE(ABORT, 'STAGE01L_SYNTHETIC_CLOSE_AUDIT_FAILURE'); END;`);
    await expect(commitStage01LTestBatch(db, fixture)).rejects.toThrow();
    expect(await shiftStatus()).toBe('CLOSING');
    expect(await counts()).toEqual({
      stock: 0, finance: 0, closeAudits: 0, financeAudits: 0, committedEvents: 0,
    });
    expect((await getPrototypeAttempt(db, fixture.attemptId))?.state).toBe('PREPARED');
  });

  it('rolls back preceding tank writes when the financial record cannot be inserted', async () => {
    await db.exec(`CREATE TRIGGER stage01l_force_finance_failure
      BEFORE INSERT ON shift_financial_reconciliations
      BEGIN SELECT RAISE(ABORT, 'STAGE01L_SYNTHETIC_FINANCE_FAILURE'); END;`);
    await expect(commitStage01LTestBatch(db, fixture)).rejects.toThrow();
    expect(await shiftStatus()).toBe('CLOSING');
    expect(await counts()).toEqual({
      stock: 0, finance: 0, closeAudits: 0, financeAudits: 0, committedEvents: 0,
    });
  });

  it('blocks a partially reconciled tank set and rolls back the entire batch', async () => {
    await expect(commitStage01LTestBatch(db, fixture, { skipOneTank: true }))
      .rejects.toThrow('STAGE01L_INCOMPLETE_MANDATORY_EVIDENCE');
    expect(await shiftStatus()).toBe('CLOSING');
    expect((await counts()).stock).toBe(0);
    expect((await counts()).finance).toBe(0);
    expect((await counts()).closeAudits).toBe(0);
  });

  it('preserves pre-existing reconciliation evidence if a duplicate tank insert fails', async () => {
    const tank = await db.prepare(
      'SELECT tank_id, product_id FROM operational_shift_tanks WHERE operational_shift_id = ? LIMIT 1',
    ).bind(fixture.shiftId).first<{ tank_id: string; product_id: string }>();
    expect(tank).not.toBeNull();
    const t = new Date().toISOString();
    await db.prepare(`
      INSERT INTO shift_stock_reconciliations (
        id, operational_shift_id, outlet_id, tank_id, product_id,
        opening_stock_milliunits, receipt_quantity_milliunits, sales_quantity_milliunits,
        theoretical_closing_stock_milliunits, physical_closing_stock_milliunits,
        variance_milliunits, variance_status, calculated_at, created_at, updated_at
      ) VALUES ('stage01l-original-evidence', ?, ?, ?, ?, 100000, 0, 0, 100000, 100000, 0,
        'BALANCED', ?, ?, ?)
    `).bind(fixture.shiftId, fixture.outletId, tank!.tank_id, tank!.product_id, t, t, t).run();
    await expect(commitStage01LTestBatch(db, fixture)).rejects.toThrow();
    expect(await shiftStatus()).toBe('CLOSING');
    expect(await counts()).toEqual({
      stock: 1, finance: 0, closeAudits: 0, financeAudits: 0, committedEvents: 0,
    });
    const existing = await db.prepare(
      "SELECT id FROM shift_stock_reconciliations WHERE id = 'stage01l-original-evidence'",
    ).first<{ id: string }>();
    expect(existing?.id).toBe('stage01l-original-evidence');
    expect((await getPrototypeAttempt(db, fixture.attemptId))?.state).toBe('PREPARED');
  });

  it('rolls back SHIFT_CLOSE audit too if the second financial audit insert fails', async () => {
    await db.exec(`CREATE TRIGGER stage01l_force_financial_audit_failure
      BEFORE INSERT ON audit_logs
      WHEN NEW.action = 'FINANCIAL_RECONCILIATION'
      BEGIN SELECT RAISE(ABORT, 'STAGE01L_SYNTHETIC_FINANCIAL_AUDIT_FAILURE'); END;`);
    await expect(commitStage01LTestBatch(db, fixture)).rejects.toThrow();
    expect(await shiftStatus()).toBe('CLOSING');
    expect(await counts()).toEqual({
      stock: 0, finance: 0, closeAudits: 0, financeAudits: 0, committedEvents: 0,
    });
  });

  it('rejects an incompatible actor before the prototype claims a new shift', async () => {
    await expect(claimStage01LTestShift(db, {
      ...fixture, actorId: 'other-actor',
    })).rejects.toThrow('STAGE01L_UNVERIFIED_ATTEMPT');
    expect(await shiftStatus()).toBe('CLOSING');
    expect((await counts()).stock).toBe(0);
  });

  it('replays the matching durable close attempt without duplicating audit or financial evidence', async () => {
    await commitStage01LTestBatch(db, fixture);
    const baseline = await counts();
    const replay = await reservePrototypeCloseAttempt(db, input);
    expect(replay.kind).toBe('REPLAY');
    expect(replay.attempt.state).toBe('COMMITTED');
    await expect(commitStage01LTestBatch(db, fixture)).rejects.toThrow();
    expect(await counts()).toEqual(baseline);
    expect(await shiftStatus()).toBe('CLOSED');
  });

  it('detects a changed shift status and avoids recording any new close evidence', async () => {
    await db.prepare(
      "UPDATE operational_shifts SET status = 'OPEN' WHERE id = ? AND status = 'CLOSING'",
    ).bind(fixture.shiftId).run();
    await expect(commitStage01LTestBatch(db, fixture))
      .rejects.toThrow('STAGE01L_CLOSE_INTENT_NOT_VALID');
    expect(await shiftStatus()).toBe('OPEN');
    expect((await counts()).stock).toBe(0);
    expect((await counts()).closeAudits).toBe(0);
    expect((await getPrototypeAttempt(db, fixture.attemptId))?.state).toBe('PREPARED');
  });

  it('marks a failed/indeterminate attempt for review rather than reopening or retrying', async () => {
    await db.exec(`CREATE TRIGGER stage01l_force_audit_failure
      BEFORE INSERT ON audit_logs
      WHEN NEW.action = 'SHIFT_CLOSE'
      BEGIN SELECT RAISE(ABORT, 'STAGE01L_SYNTHETIC_AUDIT_FAILURE'); END;`);
    await expect(commitStage01LTestBatch(db, fixture)).rejects.toThrow();
    const marked = await markPrototypeReviewRequired(db, fixture.attemptId, fixture.actorId);
    expect(marked.attempt.state).toBe('REVIEW_REQUIRED');
    expect(await shiftStatus()).toBe('CLOSING');
    await expect(reservePrototypeCloseAttempt(db, {
      ...input, idempotencyKey: 'stage01l-second-attempt-0002',
    })).rejects.toThrow('STAGE01J_SHIFT_ATTEMPT_REQUIRES_REVIEW');
    expect(await sqlCount('stage01j_close_attempt_events', fixture.attemptId, 'REVIEW_REQUIRED')).toBe(1);
    const snapshot = await readShiftCloseEvidenceSnapshot(getDb(db), fixture.shiftId, true);
    expect(assessShiftCloseEvidence(snapshot!).holdFurtherClose).toBe(true);
  });
});
