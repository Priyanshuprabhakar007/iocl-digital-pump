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

  it('characterizes removal of an existing stock reconciliation when financial persistence fails', async () => {
    const cookie = await login();
    const shiftId = await readyShift(cookie);
    const pumpRepo = new PumpRepository(getDb(localD1));
    await pumpRepo.calculateAndSaveShiftStockReconciliation(shiftId);
    expect(await count('shift_stock_reconciliations', shiftId)).toBeGreaterThan(0);

    await localD1.exec(`CREATE TRIGGER stage01e_finance_abort
      BEFORE INSERT ON shift_financial_reconciliations
      BEGIN SELECT RAISE(ABORT, 'STAGE01E_INJECT_FINANCE_FAILURE'); END;`);
    const res = await request(cookie, `/shifts/${shiftId}/close`, closePayload);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await dbRow('SELECT status FROM operational_shifts WHERE id = ?', shiftId)).status).toBe('OPEN');
    // Existing service cleanup deletes by shift ID, including a reconciliation that
    // was present before this close attempt. This is a finding, not desired policy.
    // Counts alone CANNOT detect erased prior evidence: the classifier considers
    // this OPEN/empty state ready. Never use this triage to authorize an auto-close.
    expect((await assessPersisted(shiftId, false)).disposition).toBe('READY_FOR_NORMAL_WORKFLOW');
    expect(await count('shift_stock_reconciliations', shiftId)).toBe(0);
    expect(await count('shift_financial_reconciliations', shiftId)).toBe(0);
    expect(await count('audit_logs', shiftId, 'SHIFT_CLOSE')).toBe(0);
  });

  it('characterizes stale stock reconciliation when cleanup DELETE itself is rejected', async () => {
    const cookie = await login();
    const shiftId = await readyShift(cookie);
    const pumpRepo = new PumpRepository(getDb(localD1));
    await pumpRepo.calculateAndSaveShiftStockReconciliation(shiftId);
    const preCount = await count('shift_stock_reconciliations', shiftId);
    expect(preCount).toBeGreaterThan(0);

    await localD1.exec(`CREATE TRIGGER stage01e_finance_abort
      BEFORE INSERT ON shift_financial_reconciliations
      BEGIN SELECT RAISE(ABORT, 'STAGE01E_INJECT_FINANCE_FAILURE'); END;
      CREATE TRIGGER stage01e_stock_cleanup_abort
      BEFORE DELETE ON shift_stock_reconciliations
      BEGIN SELECT RAISE(ABORT, 'STAGE01E_INJECT_STOCK_DELETE_FAILURE'); END;`);

    const res = await request(cookie, `/shifts/${shiftId}/close`, closePayload);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await dbRow('SELECT status FROM operational_shifts WHERE id = ?', shiftId)).status).toBe('OPEN');
    expect(await count('shift_financial_reconciliations', shiftId)).toBe(0);
    expect(await count('shift_stock_reconciliations', shiftId)).toBe(preCount);
    expect(await count('audit_logs', shiftId, 'SHIFT_CLOSE')).toBe(0);
    const triage = await assessPersisted(shiftId, true);
    expect(triage.disposition).toBe('INTEGRITY_REVIEW_REQUIRED');
    expect(triage.reasons).toContain('OPEN_SHIFT_HAS_CLOSE_EVIDENCE');
    expect(triage.holdFurtherClose).toBe(true);
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
