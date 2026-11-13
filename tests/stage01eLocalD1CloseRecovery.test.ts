import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import { PumpRepository } from '../src/worker/repositories/pumpRepository';
import { readShiftCloseEvidenceSnapshot } from '../src/worker/services/shiftCloseEvidenceReader';
import { assessShiftCloseEvidence } from '../src/worker/services/shiftCloseRecoveryAssessment';

/**
 * Stage 01E: persisted failure-injection tests on disposable local SQLite D1.
 * Uses the app's real shift, reading, reconciliation, finance and audit routes.
 *
 * This is NOT Cloudflare hosted D1 or a production/staging database. It
 * characterizes current behavior; it does not authorize operational fixes.
 */
describe('Stage 01E: local-D1 shift close persistence and failure recovery', () => {
  let localD1: ReturnType<typeof createLocalD1Database>;
  let testPath: string;
  let env: any;

  beforeEach(async () => {
    testPath = `./.sqlite/test_stage01e_close_${Date.now()}_${Math.random().toString(16).slice(2)}.db`;
    localD1 = createLocalD1Database(testPath);
    await seedDatabase(getDb(localD1));
    env = {
      DB: localD1,
      SESSION_SECRET: 'stage01e-local-synthetic-key-123456789012345',
      ENVIRONMENT: 'development',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    };
  });

  afterEach(() => {
    if (localD1) localD1.close();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(testPath + suffix); } catch { /* file may not exist */ }
    }
  });

  async function dbRow(query: string, ...params: unknown[]): Promise<any> {
    return localD1.prepare(query).bind(...params).first();
  }

  async function assessPersisted(shiftId: string, independentlyVerifiedUncertainty: boolean) {
    const evidence = await readShiftCloseEvidenceSnapshot(
      getDb(localD1), shiftId, independentlyVerifiedUncertainty,
    );
    expect(evidence).not.toBeNull();
    return assessShiftCloseEvidence(evidence!);
  }

  async function count(tableName: 'shift_stock_reconciliations' | 'shift_financial_reconciliations' | 'audit_logs',
    shiftId: string, auditAction?: string): Promise<number> {
    const query = tableName === 'audit_logs'
      ? 'SELECT count(*) AS count FROM audit_logs WHERE entity_id = ? AND action = ?'
      : `SELECT count(*) AS count FROM ${tableName} WHERE operational_shift_id = ?`;
    const row = await dbRow(query, ...(tableName === 'audit_logs' ? [shiftId, auditAction] : [shiftId]));
    return Number(row?.count || 0);
  }

  async function login(): Promise<string> {
    const response = await app.fetch(new Request('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
    }), env);
    expect(response.status).toBe(200);
    return response.headers.get('set-cookie') || '';
  }

  async function request(cookie: string, endpoint: string, payload?: unknown): Promise<Response> {
    return app.fetch(new Request(`http://localhost/api/v1${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        Origin: 'http://localhost:3000',
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    }), env);
  }

  async function openShift(cookie: string): Promise<string> {
    const res = await request(cookie, '/outlets/ro-1001/shifts/open', {
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-11-02',
    });
    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    return body.data.id as string;
  }

  async function readyShift(cookie: string): Promise<string> {
    const id = await openShift(cookie);
    for (const tankId of ['tank-ro1-1', 'tank-ro1-2', 'tank-ro1-3']) {
      const res = await request(cookie, `/shifts/${id}/tank-readings`, {
        tankId, readingType: 'OPENING', source: 'MANUAL',
        productDipMm: '1000.000', waterDipMm: '0.000',
      });
      expect(res.status).toBe(201);
    }

    const nozzles = [
      ['nozz-ro1-1-1', '1000.000', '1500.000'],
      ['nozz-ro1-1-2', '2000.000', '2800.000'],
      ['nozz-ro1-2-1', '3000.000', '3300.000'],
      ['nozz-ro1-2-2', '4000.000', '4200.000'],
    ];
    for (const [nozzleId, openingTotalizer, closingTotalizer] of nozzles) {
      const res = await request(cookie, `/shifts/${id}/readings`, {
        nozzleId, openingTotalizer, closingTotalizer, testingQuantity: '0.000',
      });
      expect(res.status).toBe(201);
    }

    for (const [tankId, dip] of [
      ['tank-ro1-1', '1250.000'],
      ['tank-ro1-2', '1000.000'],
      ['tank-ro1-3', '1000.000'],
    ]) {
      const res = await request(cookie, `/shifts/${id}/tank-readings`, {
        tankId, readingType: 'CLOSING', source: 'MANUAL',
        productDipMm: dip, waterDipMm: '0.000',
      });
      expect(res.status).toBe(201);
    }
    return id;
  }

  const closePayload = { varianceReason: 'Synthetic measured variance review' };

  it('persists an exclusive CLOSING claim, rejects a second claimant, and allows restoring OPEN', async () => {
    const cookie = await login();
    const shiftId = await openShift(cookie);
    const pumpRepo = new PumpRepository(getDb(localD1));

    expect((await pumpRepo.beginCloseConditional(shiftId)).success).toBe(true);
    expect((await dbRow('SELECT status FROM operational_shifts WHERE id = ?', shiftId)).status).toBe('CLOSING');
    expect((await pumpRepo.beginCloseConditional(shiftId)).success).toBe(false);
    expect((await assessPersisted(shiftId, false)).disposition).toBe('CLOSE_IN_PROGRESS_REVIEW');

    await pumpRepo.restoreOpenFromClosing(shiftId);
    expect((await dbRow('SELECT status FROM operational_shifts WHERE id = ?', shiftId)).status).toBe('OPEN');
    expect((await pumpRepo.beginCloseConditional(shiftId)).success).toBe(true);
  });

  it('restores OPEN and leaves no reconciliation on an actual incomplete shift close', async () => {
    const cookie = await login();
    const shiftId = await openShift(cookie);
    const res = await request(cookie, `/shifts/${shiftId}/close`, closePayload);
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.error.code).toBe('INCOMPLETE_TANK_STOCK_DATA');
    expect((await dbRow('SELECT status FROM operational_shifts WHERE id = ?', shiftId)).status).toBe('OPEN');
    expect(await count('shift_stock_reconciliations', shiftId)).toBe(0);
    expect(await count('shift_financial_reconciliations', shiftId)).toBe(0);
    expect(await count('audit_logs', shiftId, 'SHIFT_CLOSE')).toBe(0);
    expect((await assessPersisted(shiftId, false)).disposition).toBe('READY_FOR_NORMAL_WORKFLOW');
  });

  it('demonstrates a failed persisted CLOSING->OPEN recovery, then manual test-only restoration', async () => {
    const cookie = await login();
    const shiftId = await openShift(cookie);
    const pumpRepo = new PumpRepository(getDb(localD1));
    expect((await pumpRepo.beginCloseConditional(shiftId)).success).toBe(true);

    await localD1.exec(`CREATE TRIGGER stage01e_block_restore
      BEFORE UPDATE OF status ON operational_shifts
      WHEN OLD.status = 'CLOSING' AND NEW.status = 'OPEN'
      BEGIN SELECT RAISE(ABORT, 'STAGE01E_INJECT_RESTORE_FAILURE'); END;`);
    await expect(pumpRepo.restoreOpenFromClosing(shiftId)).rejects.toThrow();
    expect((await dbRow('SELECT status FROM operational_shifts WHERE id = ?', shiftId)).status).toBe('CLOSING');
    expect((await assessPersisted(shiftId, true)).reasons).toContain('CLOSING_STATE_REQUIRES_REVIEW');

    // Test-database cleanup only; this never runs against a real outlet.
    await localD1.exec('DROP TRIGGER stage01e_block_restore;');
    await pumpRepo.restoreOpenFromClosing(shiftId);
    expect((await dbRow('SELECT status FROM operational_shifts WHERE id = ?', shiftId)).status).toBe('OPEN');
  });

  it('rolls back CLOSED when SHIFT_CLOSE audit insert fails in the atomic batch', async () => {
    const cookie = await login();
    const shiftId = await readyShift(cookie);
    await localD1.exec(`CREATE TRIGGER stage01e_audit_abort
      BEFORE INSERT ON audit_logs
      WHEN NEW.action = 'SHIFT_CLOSE'
      BEGIN SELECT RAISE(ABORT, 'STAGE01E_INJECT_AUDIT_FAILURE'); END;`);

    const first = await request(cookie, `/shifts/${shiftId}/close`, closePayload);
    expect(first.status).toBe(409);
    expect(((await first.json()) as any).error.code).toBe('SHIFT_CLOSE_COMMIT_UNCERTAIN');
    // D1's atomic batch rolls back the CLOSED update and both audit rows.
    // The already-persisted reconcilations remain available for review.
    expect((await dbRow('SELECT status FROM operational_shifts WHERE id = ?', shiftId)).status).toBe('CLOSING');
    expect(await count('shift_stock_reconciliations', shiftId)).toBeGreaterThan(0);
    expect(await count('shift_financial_reconciliations', shiftId)).toBe(1);
    expect(await count('audit_logs', shiftId, 'SHIFT_CLOSE')).toBe(0);
    expect(await count('audit_logs', shiftId, 'FINANCIAL_RECONCILIATION')).toBe(0);
    const incident = await assessPersisted(shiftId, true);
    expect(incident.holdFurtherClose).toBe(true);
    expect(incident.reasons).toContain('CLOSING_STATE_REQUIRES_REVIEW');

    const stockCount = await count('shift_stock_reconciliations', shiftId);
    const second = await request(cookie, `/shifts/${shiftId}/close`, closePayload);
    expect(second.status).toBe(409);
    expect(((await second.json()) as any).error.code).toBe('SHIFT_CLOSED_OR_CLOSING');
    expect(await count('shift_stock_reconciliations', shiftId)).toBe(stockCount);
    expect(await count('shift_financial_reconciliations', shiftId)).toBe(1);
    expect(await count('audit_logs', shiftId, 'SHIFT_CLOSE')).toBe(0);
  });

  it('rolls back CLOSED and SHIFT_CLOSE audit when FINANCIAL_RECONCILIATION audit fails', async () => {
    const cookie = await login();
    const shiftId = await readyShift(cookie);
    await localD1.exec(`CREATE TRIGGER stage01e_finance_audit_abort
      BEFORE INSERT ON audit_logs
      WHEN NEW.action = 'FINANCIAL_RECONCILIATION'
      BEGIN SELECT RAISE(ABORT, 'STAGE01E_INJECT_FINANCIAL_AUDIT_FAILURE'); END;`);

    const response = await request(cookie, `/shifts/${shiftId}/close`, closePayload);
    expect(response.status).toBe(409);
    expect(((await response.json()) as any).error.code).toBe('SHIFT_CLOSE_COMMIT_UNCERTAIN');
    expect((await dbRow('SELECT status FROM operational_shifts WHERE id = ?', shiftId)).status).toBe('CLOSING');
    expect(await count('shift_financial_reconciliations', shiftId)).toBe(1);
    expect(await count('audit_logs', shiftId, 'SHIFT_CLOSE')).toBe(0);
    expect(await count('audit_logs', shiftId, 'FINANCIAL_RECONCILIATION')).toBe(0);
  });

  it('reuses a matching precomputed stock reconciliation without altering any row', async () => {
    const cookie = await login();
    const shiftId = await readyShift(cookie);
    const pumpRepo = new PumpRepository(getDb(localD1));
    await pumpRepo.calculateAndSaveShiftStockReconciliation(shiftId);
    const original = await localD1.prepare(`
      SELECT id, opening_stock_milliunits AS openingStock, created_at AS createdAt
      FROM shift_stock_reconciliations WHERE operational_shift_id = ?
      ORDER BY id
    `).bind(shiftId).all<{ id: string; openingStock: number; createdAt: string }>();
    expect(original.results.length).toBeGreaterThan(0);

    const res = await request(cookie, `/shifts/${shiftId}/close`, closePayload);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).data.status).toBe('CLOSED');
    expect((await dbRow('SELECT status FROM operational_shifts WHERE id = ?', shiftId)).status).toBe('CLOSED');

    const after = await localD1.prepare(`
      SELECT id, opening_stock_milliunits AS openingStock, created_at AS createdAt
      FROM shift_stock_reconciliations WHERE operational_shift_id = ?
      ORDER BY id
    `).bind(shiftId).all<{ id: string; openingStock: number; createdAt: string }>();
    expect(after.results).toEqual(original.results);
    expect(await count('shift_financial_reconciliations', shiftId)).toBe(1);
    expect(await count('audit_logs', shiftId, 'SHIFT_CLOSE')).toBe(1);
    const triage = await assessPersisted(shiftId, false);
    expect(triage.disposition).toBe('CLOSED_EVIDENCE_COMPLETE');
  });

  it('never runs a stock DELETE when reusing valid precomputed evidence', async () => {
    const cookie = await login();
    const shiftId = await readyShift(cookie);
    const pumpRepo = new PumpRepository(getDb(localD1));
    await pumpRepo.calculateAndSaveShiftStockReconciliation(shiftId);
    const originalCount = await count('shift_stock_reconciliations', shiftId);
    await localD1.exec(`CREATE TRIGGER stage01e_stock_cleanup_abort
      BEFORE DELETE ON shift_stock_reconciliations
      BEGIN SELECT RAISE(ABORT, 'STAGE01E_INJECT_STOCK_DELETE_FAILURE'); END;`);

    const res = await request(cookie, `/shifts/${shiftId}/close`, closePayload);
    expect(res.status).toBe(200);
    expect((await dbRow('SELECT status FROM operational_shifts WHERE id = ?', shiftId)).status).toBe('CLOSED');
    expect(await count('shift_stock_reconciliations', shiftId)).toBe(originalCount);
    expect(await count('shift_financial_reconciliations', shiftId)).toBe(1);
    const triage = await assessPersisted(shiftId, false);
    expect(triage.disposition).toBe('CLOSED_EVIDENCE_COMPLETE');
  });

  it('holds mismatched precomputed stock evidence without overwriting it', async () => {
    const cookie = await login();
    const shiftId = await readyShift(cookie);
    const repo = new PumpRepository(getDb(localD1));
    await repo.calculateAndSaveShiftStockReconciliation(shiftId);
    const prior = await dbRow('SELECT id, opening_stock_milliunits AS openingStock FROM shift_stock_reconciliations WHERE operational_shift_id = ? ORDER BY id LIMIT 1', shiftId);
    await localD1.prepare('UPDATE shift_stock_reconciliations SET opening_stock_milliunits = opening_stock_milliunits + 1 WHERE id = ?')
      .bind(prior.id).run();

    const res = await request(cookie, `/shifts/${shiftId}/close`, closePayload);
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).error.code).toBe('SHIFT_CLOSE_REVIEW_REQUIRED');
    expect((await dbRow('SELECT status FROM operational_shifts WHERE id = ?', shiftId)).status).toBe('CLOSING');
    const after = await dbRow('SELECT id, opening_stock_milliunits AS openingStock FROM shift_stock_reconciliations WHERE id = ?', prior.id);
    expect(after.openingStock).toBe(prior.openingStock + 1);
    expect(await count('shift_financial_reconciliations', shiftId)).toBe(0);
    expect(await count('audit_logs', shiftId, 'SHIFT_CLOSE')).toBe(0);
  });

  it('rolls back ALL new stock rows when the finance INSERT fails in atomic preparation', async () => {
    const cookie = await login();
    const shiftId = await readyShift(cookie);
    await localD1.exec(`CREATE TRIGGER stage01e_finance_insert_abort
      BEFORE INSERT ON shift_financial_reconciliations
      BEGIN SELECT RAISE(ABORT, 'STAGE01E_INJECT_FINANCE_FAILURE'); END;`);
    const res = await request(cookie, `/shifts/${shiftId}/close`, closePayload);
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).error.code).toBe('SHIFT_CLOSE_REVIEW_REQUIRED');
    expect((await dbRow('SELECT status FROM operational_shifts WHERE id = ?', shiftId)).status).toBe('CLOSING');
    expect(await count('shift_stock_reconciliations', shiftId)).toBe(0);
    expect(await count('shift_financial_reconciliations', shiftId)).toBe(0);
    expect(await count('audit_logs', shiftId, 'SHIFT_CLOSE')).toBe(0);
    const triage = await assessPersisted(shiftId, true);
    expect(triage.holdFurtherClose).toBe(true);
  });

  it('rolls back earlier stock INSERTs when a later stock tank INSERT fails', async () => {
    const cookie = await login();
    const shiftId = await readyShift(cookie);
    await localD1.exec(`CREATE TRIGGER stage01o_reject_second_stock
      BEFORE INSERT ON shift_stock_reconciliations
      WHEN NEW.tank_id = 'tank-ro1-2'
      BEGIN SELECT RAISE(ABORT, 'STAGE01O_INJECT_STOCK_INSERT_FAILURE'); END;`);

    const response = await request(cookie, `/shifts/${shiftId}/close`, closePayload);
    expect(response.status).toBe(409);
    expect(((await response.json()) as any).error.code).toBe('SHIFT_CLOSE_REVIEW_REQUIRED');
    expect((await dbRow('SELECT status FROM operational_shifts WHERE id = ?', shiftId)).status).toBe('CLOSING');
    expect(await count('shift_stock_reconciliations', shiftId)).toBe(0);
    expect(await count('shift_financial_reconciliations', shiftId)).toBe(0);
    expect(await count('audit_logs', shiftId, 'SHIFT_CLOSE')).toBe(0);
  });

  it('keeps precomputed stock intact when the atomic finance-only preparation fails', async () => {
    const cookie = await login();
    const shiftId = await readyShift(cookie);
    const repo = new PumpRepository(getDb(localD1));
    await repo.calculateAndSaveShiftStockReconciliation(shiftId);
    const oldRows = await localD1.prepare(`
      SELECT id, tank_id, opening_stock_milliunits, created_at
      FROM shift_stock_reconciliations WHERE operational_shift_id = ? ORDER BY id
    `).bind(shiftId).all();

    await localD1.exec(`CREATE TRIGGER stage01o_reject_finance
      BEFORE INSERT ON shift_financial_reconciliations
      BEGIN SELECT RAISE(ABORT, 'STAGE01O_INJECT_FINANCE_INSERT_FAILURE'); END;`);
    const response = await request(cookie, `/shifts/${shiftId}/close`, closePayload);
    expect(response.status).toBe(409);
    expect(((await response.json()) as any).error.code).toBe('SHIFT_CLOSE_REVIEW_REQUIRED');
    expect((await dbRow('SELECT status FROM operational_shifts WHERE id = ?', shiftId)).status).toBe('CLOSING');
    const after = await localD1.prepare(`
      SELECT id, tank_id, opening_stock_milliunits, created_at
      FROM shift_stock_reconciliations WHERE operational_shift_id = ? ORDER BY id
    `).bind(shiftId).all();
    expect(after.results).toEqual(oldRows.results);
    expect(await count('shift_financial_reconciliations', shiftId)).toBe(0);
    expect(await count('audit_logs', shiftId, 'SHIFT_CLOSE')).toBe(0);
  });

  it('holds an existing financial reconciliation unchanged without overwriting it', async () => {
    const cookie = await login();
    const shiftId = await readyShift(cookie);
    const now = '2026-11-13T08:00:00.000Z';
    await localD1.prepare(`
      INSERT INTO shift_financial_reconciliations (
        id, operational_shift_id, outlet_id,
        fuel_sales_revenue_paise, cng_sales_revenue_paise, lube_sales_revenue_paise,
        authoritative_sales_revenue_paise, cash_collection_paise, pos_collection_paise,
        upi_collection_paise, fleet_card_collection_paise, credit_sales_paise,
        direct_bank_drop_paise, total_collections_paise,
        sales_collection_variance_paise, variance_status, variance_reason,
        calculated_at, created_at, updated_at
      ) VALUES (?, ?, ?, 10000, NULL, 0, 10000, 10000, 0, 0, 0, 0, 0, 10000, 0, 'BALANCED', NULL, ?, ?, ?)
    `).bind('stage01n2-prior-financial', shiftId, 'ro-1001', now, now, now).run();
    const original = await dbRow(`
      SELECT id, authoritative_sales_revenue_paise AS amount, created_at AS createdAt
      FROM shift_financial_reconciliations WHERE operational_shift_id = ?
    `, shiftId);

    const response = await request(cookie, `/shifts/${shiftId}/close`, closePayload);
    expect(response.status).toBe(409);
    expect(((await response.json()) as any).error.code).toBe('SHIFT_CLOSE_REVIEW_REQUIRED');
    expect((await dbRow('SELECT status FROM operational_shifts WHERE id = ?', shiftId)).status).toBe('CLOSING');
    expect(await dbRow(`
      SELECT id, authoritative_sales_revenue_paise AS amount, created_at AS createdAt
      FROM shift_financial_reconciliations WHERE operational_shift_id = ?
    `, shiftId)).toEqual(original);
    expect(await count('shift_stock_reconciliations', shiftId)).toBe(0);
  });

  it('reads a real OPEN shift without confusing SHIFT_OPEN audit with SHIFT_CLOSE audit', async () => {
    const cookie = await login();
    const shiftId = await openShift(cookie);
    const snapshot = await readShiftCloseEvidenceSnapshot(getDb(localD1), shiftId, false);
    expect(snapshot).toEqual({
      status: 'OPEN',
      stockReconciliationCount: 0,
      financialReconciliationCount: 0,
      shiftCloseAuditCount: 0,
      uncertainAttempt: false,
    });
    expect((await assessPersisted(shiftId, false)).holdFurtherClose).toBe(false);
  });

  it('classifies a successfully CLOSED shift from persisted reconciliation and audit evidence', async () => {
    const cookie = await login();
    const shiftId = await readyShift(cookie);
    const response = await request(cookie, `/shifts/${shiftId}/close`, closePayload);
    expect(response.status).toBe(200);
    const snapshot = await readShiftCloseEvidenceSnapshot(getDb(localD1), shiftId, false);
    expect(snapshot?.status).toBe('CLOSED');
    expect(snapshot?.stockReconciliationCount).toBeGreaterThan(0);
    expect(snapshot?.financialReconciliationCount).toBe(1);
    expect(snapshot?.shiftCloseAuditCount).toBe(1);
    const assessment = assessShiftCloseEvidence(snapshot!);
    expect(assessment.disposition).toBe('CLOSED_EVIDENCE_COMPLETE');
    expect(assessment.holdFurtherClose).toBe(true);
  });

  it('returns null for a shift that does not exist without inserting evidence', async () => {
    const snapshot = await readShiftCloseEvidenceSnapshot(getDb(localD1), 'not-a-shift', true);
    expect(snapshot).toBeNull();
  });

  it('requires an explicit, independently verified uncertain-attempt flag', async () => {
    await expect(readShiftCloseEvidenceSnapshot(getDb(localD1), 'shift-id', undefined as any))
      .rejects.toThrow('SHIFT_CLOSE_EVIDENCE_ATTEMPT_VERIFICATION_REQUIRED');
    await expect(readShiftCloseEvidenceSnapshot(getDb(localD1), ' ', false))
      .rejects.toThrow('SHIFT_CLOSE_EVIDENCE_SHIFT_ID_REQUIRED');
  });

});
