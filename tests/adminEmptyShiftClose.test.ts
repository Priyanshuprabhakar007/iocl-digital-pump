import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import { PumpRepository } from '../src/worker/repositories/pumpRepository';
import * as schema from '../src/db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';

const TEST_DB_PATH = './.sqlite/test_admin_empty_shift_close.db';

describe('Admin close empty shift', () => {
  let localD1: any;
  let env: any;

  beforeEach(async () => {
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(TEST_DB_PATH + suffix); } catch {}
    }
    localD1 = createLocalD1Database(TEST_DB_PATH);
    await seedDatabase(getDb(localD1));
    env = {
      DB: localD1,
      ENVIRONMENT: 'development',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    };
  });

  afterEach(() => {
    localD1?.close();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(TEST_DB_PATH + suffix); } catch {}
    }
  });

  async function login(email = 'admin@iocl.in') {
    const res = await app.fetch(new Request('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, password: 'Password@123' }),
    }), env);
    expect(res.status).toBe(200);
    return res.headers.get('set-cookie') || '';
  }

  async function openShift(cookie: string, businessDate: string) {
    const res = await app.fetch(new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate }),
    }), env);
    expect(res.status).toBe(201);
    return ((await res.json()) as any).data.id as string;
  }

  async function closeEmpty(cookie: string, shiftId: string, body: any) {
    return app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/close-empty`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify(body),
    }), env);
  }

  it('closes empty shift, audits reason, and leaves reconciliation absent', async () => {
    const cookie = await login();
    const id = await openShift(cookie, '2026-11-22');
    const reason = 'Shift opened in error; no trading or operational entries.';
    const res = await closeEmpty(cookie, id, { reason, confirm: true });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).data.status).toBe('CLOSED');

    const db = getDb(localD1);
    const [recon] = await db.select().from(schema.shiftFinancialReconciliations)
      .where(eq(schema.shiftFinancialReconciliations.operationalShiftId, id));
    expect(recon).toBeUndefined();
    const logs = await db.select().from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, id));
    expect(logs.some(log => log.action === 'SHIFT_CLOSE_EMPTY_ADMIN'
      && log.newValueJson?.includes(reason))).toBe(true);
    const second = await closeEmpty(cookie, id, { reason, confirm: true });
    expect(second.status).toBe(409);
  });

  it('rolls back CLOSED when the mandatory admin close audit insert fails', async () => {
    const cookie = await login();
    const id = await openShift(cookie, '2026-11-26');
    await localD1.exec(`CREATE TRIGGER stage01u_force_admin_audit_failure
      BEFORE INSERT ON audit_logs
      WHEN NEW.action = 'SHIFT_CLOSE_EMPTY_ADMIN'
      BEGIN SELECT RAISE(ABORT, 'STAGE01U_INJECT_ADMIN_AUDIT_FAILURE'); END;`);
    const res = await closeEmpty(cookie, id, {
      reason: 'Synthetic forced admin audit failure during empty close',
      confirm: true,
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).error.code).toBe('SHIFT_CLOSE_COMMIT_UNCERTAIN');
    const shift = await new PumpRepository(getDb(localD1)).findOperationalShiftById(id);
    expect(shift?.status).toBe('OPEN');
    const audits = await getDb(localD1).select().from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, id));
    expect(audits.filter(a => a.action === 'SHIFT_CLOSE_EMPTY_ADMIN')).toHaveLength(0);
  });

  it('rejects conditional no-data close without writing a success audit', async () => {
    const cookie = await login();
    const id = await openShift(cookie, '2026-11-27');
    await getDb(localD1).run((await import('drizzle-orm')).sql`INSERT INTO tank_stock_readings
      (id, operational_shift_id, outlet_id, tank_id, reading_type, source,
       product_id, product_dip_mm_milliunits, water_dip_mm_milliunits,
       gross_observed_volume_milliunits, water_volume_milliunits, net_product_volume_milliunits,
       recorded_at, recorded_by_user_id, created_at, updated_at)
      VALUES ('stage01u-blocking-reading', ${id}, 'ro-1001',
        (SELECT tank_id FROM operational_shift_tanks WHERE operational_shift_id = ${id} LIMIT 1),
        'OPENING', 'MANUAL',
        (SELECT product_id FROM operational_shift_tanks WHERE operational_shift_id = ${id} LIMIT 1),
        0, 0, 0, 0, 0, '2026-11-27', 'user-admin', '2026-11-27', '2026-11-27')`);
    const res = await closeEmpty(cookie, id, {
      reason: 'Attempting unauthorized empty close with source evidence',
      confirm: true,
    });
    expect(res.status).toBe(409);
    expect((await new PumpRepository(getDb(localD1)).findOperationalShiftById(id))?.status).toBe('OPEN');
    const logs = await getDb(localD1).select().from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, id));
    expect(logs.filter(l => l.action === 'SHIFT_CLOSE_EMPTY_ADMIN')).toHaveLength(0);
  });

  it('requires reason and explicit confirmation', async () => {
    const cookie = await login();
    const id = await openShift(cookie, '2026-11-23');
    expect((await closeEmpty(cookie, id, { reason: 'short', confirm: true })).status).toBe(400);
    expect((await closeEmpty(cookie, id, { reason: 'This is a sufficiently long reason', confirm: false })).status).toBe(400);
    expect((await new PumpRepository(getDb(localD1)).findOperationalShiftById(id))?.status).toBe('OPEN');
  });

  it('rejects an already-recorded tank reading', async () => {
    const cookie = await login();
    const id = await openShift(cookie, '2026-11-24');
    const db = getDb(localD1);
    // A single operational entry must make the exceptional close unavailable.
    await db.run((await import('drizzle-orm')).sql`INSERT INTO tank_stock_readings
      (id, operational_shift_id, outlet_id, tank_id, reading_type, source,
       product_id, product_dip_mm_milliunits, water_dip_mm_milliunits,
       gross_observed_volume_milliunits, water_volume_milliunits, net_product_volume_milliunits,
       recorded_at, recorded_by_user_id, created_at, updated_at)
      VALUES ('empty-close-test-reading', ${id}, 'ro-1001',
        (SELECT tank_id FROM operational_shift_tanks WHERE operational_shift_id = ${id} LIMIT 1),
        'OPENING', 'MANUAL',
        (SELECT product_id FROM operational_shift_tanks WHERE operational_shift_id = ${id} LIMIT 1),
        0, 0, 0, 0, 0, '2026-11-24', 'user-admin', '2026-11-24', '2026-11-24')`);
    const res = await closeEmpty(cookie, id, { reason: 'Incorrectly attempt to bypass existing readings', confirm: true });
    expect(res.status).toBe(409);
    expect((await new PumpRepository(db).findOperationalShiftById(id))?.status).toBe('OPEN');
  });

  it('rejects non-admin users and unauthenticated requests', async () => {
    const admin = await login();
    const id = await openShift(admin, '2026-11-25');
    const body = { reason: 'Administrative close of unused empty shift', confirm: true };
    const noAuth = await closeEmpty('', id, body);
    expect(noAuth.status).toBe(401);
    const dealer = await login('dealer.parkstreet@iocl.in');
    expect((await closeEmpty(dealer, id, body)).status).toBe(403);
  });
});
