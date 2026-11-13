import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import { readShiftCloseEvidenceSnapshot } from '../src/worker/services/shiftCloseEvidenceReader';
import { assessShiftCloseEvidence } from '../src/worker/services/shiftCloseRecoveryAssessment';

/**
 * Stage 01M: actual existing Hono API routes with disposable LocalD1 storage.
 * Characterizes BOTH successful operations and known unresolved failure paths.
 *
 * No Cloudflare hosted staging D1, no production data, and NO Stage 01L
 * prototype wired to the real API. Passing does NOT mean release-ready.
 */
describe('Stage 01M: real-route daily operations and shift-close UAT contract (local-only)', () => {
  let db: ReturnType<typeof createLocalD1Database>;
  let file: string;
  let env: any;
  let cookie: string;
  let shiftId: string;

  async function call(method: 'GET' | 'POST', endpoint: string, payload?: unknown, session = cookie) {
    return app.fetch(new Request(`http://localhost/api/v1${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3000',
        ...(session ? { Cookie: session } : {}),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    }), env);
  }

  async function count(table: 'shift_stock_reconciliations' | 'shift_financial_reconciliations' |
    'audit_logs' | 'nozzle_meter_readings', auditAction = 'SHIFT_CLOSE'): Promise<number> {
    const q = table === 'audit_logs'
      ? 'SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id = ? AND entity_type = ? AND action = ?'
      : `SELECT COUNT(*) AS n FROM ${table} WHERE operational_shift_id = ?`;
    const args = table === 'audit_logs'
      ? [shiftId, 'OPERATIONAL_SHIFT', auditAction] : [shiftId];
    const row = await db.prepare(q).bind(...args).first<{ n: number }>();
    return Number(row?.n ?? -1);
  }

  async function status(): Promise<string> {
    const row = await db.prepare('SELECT status FROM operational_shifts WHERE id = ?')
      .bind(shiftId).first<{ status: string }>();
    return row?.status ?? 'MISSING';
  }

  async function prepareReadings(options: { missingNozzle?: boolean } = {}) {
    // All test values are synthetic. They must not be used as financial inputs
    // or imported into any operational outlet.
    for (const tankId of ['tank-ro1-1', 'tank-ro1-2', 'tank-ro1-3']) {
      const res = await call('POST', `/shifts/${shiftId}/tank-readings`, {
        tankId, readingType: 'OPENING', source: 'MANUAL',
        productDipMm: '1000.000', waterDipMm: '0.000',
      });
      expect(res.status).toBe(201);
    }

    const allNozzles = [
      ['nozz-ro1-1-1', '1000.000', '1500.000'],
      ['nozz-ro1-1-2', '2000.000', '2800.000'],
      ['nozz-ro1-2-1', '3000.000', '3300.000'],
      ['nozz-ro1-2-2', '4000.000', '4200.000'],
    ];
    for (const [index, nozzle] of allNozzles.entries()) {
      if (options.missingNozzle && index === allNozzles.length - 1) continue;
      const [nozzleId, openingTotalizer, closingTotalizer] = nozzle;
      const res = await call('POST', `/shifts/${shiftId}/readings`, {
        nozzleId, openingTotalizer, closingTotalizer, testingQuantity: '0.000',
      });
      expect(res.status).toBe(201);
    }

    for (const [tankId, dip] of [
      ['tank-ro1-1', '1250.000'],
      ['tank-ro1-2', '1000.000'],
      ['tank-ro1-3', '1000.000'],
    ]) {
      const res = await call('POST', `/shifts/${shiftId}/tank-readings`, {
        tankId, readingType: 'CLOSING', source: 'MANUAL',
        productDipMm: dip, waterDipMm: '0.000',
      });
      expect(res.status).toBe(201);
    }
  }

  async function close() {
    return call('POST', `/shifts/${shiftId}/close`, {
      varianceReason: 'Synthetic Stage 01M reconciliation review',
    });
  }

  beforeEach(async () => {
    file = `./.sqlite/test_stage01m_${crypto.randomUUID()}.db`;
    db = createLocalD1Database(file);
    await seedDatabase(getDb(db));
    env = {
      DB: db,
      SESSION_SECRET: 'stage01m-synthetic-local-session-secret-12345678',
      ENVIRONMENT: 'development',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    };
    const login = await call('POST', '/auth/login', {
      email: 'admin@iocl.in', password: 'Password@123',
    }, '');
    expect(login.status).toBe(200);
    cookie = login.headers.get('set-cookie') ?? '';
    expect(cookie).not.toBe('');

    const open = await call('POST', '/outlets/ro-1001/shifts/open', {
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-11-13',
    });
    expect(open.status).toBe(201);
    const body: any = await open.json();
    expect(body.success).toBe(true);
    shiftId = body.data.id;
  });

  afterEach(() => {
    if (db) db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(file + suffix); } catch { /* disposable fixture */ }
    }
  });

  it('M-01: authenticated daily-operations bootstrap and shift detail are readable', async () => {
    const daily = await call('GET', '/outlets/ro-1001/daily-operations?businessDate=2026-11-13');
    expect(daily.status).toBe(200);
    const dailyBody: any = await daily.json();
    expect(dailyBody.success).toBe(true);
    expect(dailyBody.data).toBeTruthy();

    const shift = await call('GET', `/shifts/${shiftId}`);
    expect(shift.status).toBe(200);
    expect(((await shift.json()) as any).data.status).toBe('OPEN');
  });

  it('M-02: invalid business dates are refused without shifting source records', async () => {
    const original = await status();
    const invalid = await call('GET', '/outlets/ro-1001/daily-operations?businessDate=not-a-date');
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as any).error.code).toBe('VALIDATION_ERROR');
    expect(await status()).toBe(original);
    expect(await count('shift_stock_reconciliations')).toBe(0);
  });

  it('M-03: closing without a session is rejected and cannot change a shift', async () => {
    const unauthorized = await call('POST', `/shifts/${shiftId}/close`, {
      varianceReason: 'Untrusted request',
    }, '');
    expect(unauthorized.status).toBe(401);
    expect(await status()).toBe('OPEN');
    expect(await count('audit_logs')).toBe(0);
    expect(await count('shift_financial_reconciliations')).toBe(0);
  });

  it('M-04: incomplete tank inputs block closing and preserve editable OPEN state', async () => {
    const res = await close();
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe('INCOMPLETE_TANK_STOCK_DATA');
    expect(await status()).toBe('OPEN');
    expect(await count('shift_stock_reconciliations')).toBe(0);
    expect(await count('shift_financial_reconciliations')).toBe(0);
    expect(await count('audit_logs')).toBe(0);
  });

  it('M-05: one missing nozzle reading blocks close, no fake zero sales are inserted', async () => {
    await prepareReadings({ missingNozzle: true });
    expect(await count('nozzle_meter_readings')).toBe(3);
    const response = await close();
    expect(response.status).toBe(400);
    const body: any = await response.json();
    expect(body.error.code).toBe('INCOMPLETE_SHIFT_READINGS');
    expect(body.error.details?.missingCount).toBe(1);
    expect(await status()).toBe('OPEN');
    expect(await count('nozzle_meter_readings')).toBe(3);
    expect(await count('shift_financial_reconciliations')).toBe(0);
  });

  it('M-06: complete input allows existing close endpoint and leaves auditable evidence', async () => {
    await prepareReadings();
    const response = await close();
    expect(response.status).toBe(200);
    expect(((await response.json()) as any).data.status).toBe('CLOSED');
    expect(await status()).toBe('CLOSED');
    expect(await count('shift_stock_reconciliations')).toBeGreaterThan(0);
    expect(await count('shift_financial_reconciliations')).toBe(1);
    expect(await count('audit_logs')).toBe(1);
    expect(await count('audit_logs', 'FINANCIAL_RECONCILIATION')).toBe(1);
    const evidence = await readShiftCloseEvidenceSnapshot(getDb(db), shiftId, false);
    expect(assessShiftCloseEvidence(evidence!).disposition).toBe('CLOSED_EVIDENCE_COMPLETE');
  });

  it('M-07: after closing, meter reading changes are prohibited without changing stored totals', async () => {
    await prepareReadings();
    expect((await close()).status).toBe(200);
    const previous = await count('nozzle_meter_readings');
    const update = await call('POST', `/shifts/${shiftId}/readings`, {
      nozzleId: 'nozz-ro1-1-1',
      openingTotalizer: '1000.000', closingTotalizer: '9999.000',
      testingQuantity: '0.000',
    });
    expect(update.status).toBe(409);
    expect(((await update.json()) as any).error.code).toBe('SHIFT_CLOSED');
    expect(await count('nozzle_meter_readings')).toBe(previous);
    expect(await status()).toBe('CLOSED');
  });

  it('M-08: duplicate close is rejected with no new reconciliation or closing audit', async () => {
    await prepareReadings();
    expect((await close()).status).toBe(200);
    const previous = {
      stock: await count('shift_stock_reconciliations'),
      finance: await count('shift_financial_reconciliations'),
      audit: await count('audit_logs'),
    };
    const duplicate = await close();
    expect(duplicate.status).toBe(409);
    expect(((await duplicate.json()) as any).error.code).toBe('SHIFT_CLOSED');
    expect(await count('shift_stock_reconciliations')).toBe(previous.stock);
    expect(await count('shift_financial_reconciliations')).toBe(previous.finance);
    expect(await count('audit_logs')).toBe(previous.audit);
  });

  it('M-09: existing API can close without mandatory audit when audit insert fails (KNOWN BLOCKER)', async () => {
    await prepareReadings();
    await db.exec(`CREATE TRIGGER stage01m_force_shift_audit_failure
      BEFORE INSERT ON audit_logs
      WHEN NEW.action = 'SHIFT_CLOSE'
      BEGIN SELECT RAISE(ABORT, 'STAGE01M_INJECT_AUDIT_FAILURE'); END;`);
    const response = await close();
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await status()).toBe('CLOSED');
    expect(await count('audit_logs')).toBe(0);
    const snapshot = await readShiftCloseEvidenceSnapshot(getDb(db), shiftId, true);
    const review = assessShiftCloseEvidence(snapshot!);
    expect(review.holdFurtherClose).toBe(true);
    expect(review.reasons).toContain('SHIFT_CLOSE_AUDIT_COUNT_MISMATCH');
    // This characterizes the EXISTING failure, not acceptable UAT behavior.
    // Release is blocked until an audited replacement close implementation passes.
  });
});
