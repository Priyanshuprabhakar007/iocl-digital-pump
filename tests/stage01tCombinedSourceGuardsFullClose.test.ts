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
describe('Stage 01T: combined local D1 guards and real Hono close', () => {
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
    await db.exec(fs.readFileSync('scripts/stage01s/PROPOSED_open_only_source_triggers.sql', 'utf8'));
    await db.exec(fs.readFileSync('scripts/stage01s2/PROPOSED_financial_source_triggers.sql', 'utf8'));
  });

  afterEach(() => {
    if (db) db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(file + suffix); } catch { /* disposable fixture */ }
    }
  });

  it('full close with combined proposed triggers writes audited CLOSED evidence', async () => {
    await prepareReadings();
    const response = await close();
    expect(response.status).toBe(200);
    expect(await status()).toBe('CLOSED');
    expect(await count('shift_stock_reconciliations')).toBeGreaterThan(0);
    expect(await count('shift_financial_reconciliations')).toBe(1);
    expect(await count('audit_logs')).toBe(1);
    expect(await count('audit_logs', 'FINANCIAL_RECONCILIATION')).toBe(1);
  });

  it('failed audit holds CLOSING; direct meter source update blocked', async () => {
    await prepareReadings();
    await db.exec("CREATE TRIGGER stage01t_fail BEFORE INSERT ON audit_logs WHEN NEW.action = 'SHIFT_CLOSE' BEGIN SELECT RAISE(ABORT, 'STAGE01T_FAULT'); END;");
    const response = await close();
    expect(response.status).toBe(409);
    expect(await status()).toBe('CLOSING');
    expect(await count('audit_logs')).toBe(0);
    await expect(db.prepare('UPDATE nozzle_meter_readings SET closing_totalizer_milliunits = closing_totalizer_milliunits WHERE operational_shift_id = ?').bind(shiftId).run()).rejects.toThrow('STAGE01S_SOURCE_SHIFT_NOT_OPEN');
  });
});
