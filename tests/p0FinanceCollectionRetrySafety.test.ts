import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import app from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';

describe('P0 finance collections — retry and historical shift safety', () => {
  let db: ReturnType<typeof createLocalD1Database>;
  let dbPath: string;
  let env: any;
  let cookie: string;
  let shiftId: string;

  beforeEach(async () => {
    dbPath = `./.sqlite/p0_finance_retries_${crypto.randomUUID()}.db`;
    db = createLocalD1Database(dbPath);
    await seedDatabase(getDb(db));
    env = { DB: db, ENVIRONMENT: 'development', ALLOWED_ORIGINS: 'http://localhost:3000' };
    const auth = await app.fetch(new Request('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
    }), env);
    expect(auth.status).toBe(200);
    cookie = auth.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect(cookie).not.toBe('');

    const opened = await app.fetch(new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
    }), env);
    expect(opened.status).toBe(201);
    shiftId = (await opened.json() as any).data.id;
  });

  afterEach(() => {
    try { db.close(); } catch {}
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(dbPath + suffix); } catch {}
    }
  });

  function post(amount: string, key: string) {
    return app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/collections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000',
        'Idempotency-Key': key,
      },
      body: JSON.stringify({ collectionType: 'CASH', amount, collectedAt: '2026-11-20T09:00:00Z' }),
    }), env);
  }

  async function collectionCount(): Promise<number> {
    const row = await db.prepare('SELECT COUNT(*) AS count FROM shift_collections WHERE operational_shift_id = ?').bind(shiftId).first<{ count: number }>();
    return row?.count ?? -1;
  }

  it('same-key concurrent submissions create only one cash collection', async () => {
    const key = `p0-finance-${crypto.randomUUID()}`;
    const responses = await Promise.all([post('150.25', key), post('150.25', key), post('150.25', key)]);
    expect(responses.map(r => r.status)).toEqual([201, 201, 201]);
    expect(responses.filter(r => r.headers.get('X-Idempotent-Replay') === 'true')).toHaveLength(2);
    expect(await collectionCount()).toBe(1);
    const row = await db.prepare('SELECT amount_paise FROM shift_collections WHERE operational_shift_id = ?').bind(shiftId).first<{amount_paise:number}>();
    expect(row?.amount_paise).toBe(15025);
  });

  it('reusing an idempotency key with different money cannot create another collection', async () => {
    const key = `p0-finance-${crypto.randomUUID()}`;
    expect((await post('100.00', key)).status).toBe(201);
    const second = await post('200.00', key);
    expect(second.status).toBe(409);
    expect((await second.json() as any).error.code).toBe('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD');
    expect(await collectionCount()).toBe(1);
  });

  it('cannot append collections after shift has entered CLOSED historical state', async () => {
    const closed = await db.prepare("UPDATE operational_shifts SET status = 'CLOSED' WHERE id = ?").bind(shiftId).run();
    expect(closed.success).toBe(true);
    const response = await post('10.00', `p0-closed-${crypto.randomUUID()}`);
    expect(response.status).not.toBe(201);
    expect(await collectionCount()).toBe(0);
    const row = await db.prepare('SELECT status FROM operational_shifts WHERE id = ?').bind(shiftId).first<{status:string}>();
    expect(row?.status).toBe('CLOSED');
  });
});
