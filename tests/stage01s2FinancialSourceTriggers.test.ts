import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import { PumpRepository } from '../src/worker/repositories/pumpRepository';

describe('Stage 01S-2: proposed financial input guard in disposable local D1', () => {
  it('allows OPEN collection/CNG records and rejects direct changes while CLOSING', async () => {
    const filename = `./.sqlite/stage01s2_${Date.now()}_${Math.random().toString(16).slice(2)}.db`;
    const db = createLocalD1Database(filename);
    try {
      await seedDatabase(getDb(db));
      await db.exec(fs.readFileSync('scripts/stage01s2/PROPOSED_financial_source_triggers.sql', 'utf8'));
      const env: any = { DB: db, ENVIRONMENT: 'development',
        SESSION_SECRET: 'stage01s2-local-synthetic-secret-123456789123456',
        ALLOWED_ORIGINS: 'http://localhost:3000' };
      const post = (path: string, body: unknown, cookie = '') =>
        app.fetch(new Request('http://localhost/api/v1' + path, {
          method: 'POST', headers: { 'Content-Type': 'application/json',
            Origin: 'http://localhost:3000', Cookie: cookie }, body: JSON.stringify(body),
        }), env);
      const login = await post('/auth/login', { email: 'admin@iocl.in', password: 'Password@123' });
      expect(login.status).toBe(200);
      const cookie = login.headers.get('set-cookie') || '';
      const opened = await post('/outlets/ro-1001/shifts/open', {
        shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-02',
      }, cookie);
      expect(opened.status).toBe(201);
      const shiftId = (await opened.json() as any).data.id as string;
      const actor = await db.prepare("SELECT id FROM users WHERE email = 'admin@iocl.in'").first<{ id: string }>();
      expect(actor?.id).toBeTruthy();
      const t = '2026-11-02T11:00:00.000Z';
      await db.prepare(`INSERT INTO shift_collections
        (id, operational_shift_id, outlet_id, collection_type, amount_paise,
        collected_at, recorded_by_user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind('s01s2-collection', shiftId, 'ro-1001', 'CASH', 100, t, actor!.id, t, t).run();
      await db.prepare(`INSERT INTO cng_shift_logs
        (id, operational_shift_id, outlet_id, mfm_opening_kg_milliunits,
        mfm_closing_kg_milliunits, net_sales_kg_milliunits, recorded_by_user_id,
        created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind('s01s2-cng', shiftId, 'ro-1001', 1000, 2000, 1000, actor!.id, t, t).run();

      const repo = new PumpRepository(getDb(db));
      expect((await repo.beginCloseConditional(shiftId)).success).toBe(true);
      for (const [table, column] of [
        ['shift_collections', 'amount_paise'],
        ['cng_shift_logs', 'notes'],
      ]) {
        await expect(db.prepare(`UPDATE ${table} SET ${column} = ${column}
          WHERE operational_shift_id = ?`).bind(shiftId).run()).rejects.toThrow('STAGE01S2_SOURCE_SHIFT_NOT_OPEN');
        await expect(db.prepare(`DELETE FROM ${table}
          WHERE operational_shift_id = ?`).bind(shiftId).run()).rejects.toThrow('STAGE01S2_SOURCE_SHIFT_NOT_OPEN');
      }
      await expect(db.prepare(`INSERT INTO shift_collections
        (id, operational_shift_id, outlet_id, collection_type, amount_paise,
        collected_at, recorded_by_user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind('s01s2-collection-2', shiftId, 'ro-1001', 'CASH', 10, t, actor!.id, t, t).run())
        .rejects.toThrow('STAGE01S2_SOURCE_SHIFT_NOT_OPEN');
      const shift = await db.prepare('SELECT status FROM operational_shifts WHERE id = ?')
        .bind(shiftId).first<{status:string}>();
      expect(shift?.status).toBe('CLOSING');
      const collection = await db.prepare('SELECT amount_paise FROM shift_collections WHERE id = ?')
        .bind('s01s2-collection').first<{amount_paise:number}>();
      expect(collection?.amount_paise).toBe(100);
    } finally {
      db.close();
      for (const suffix of ['', '-wal', '-shm']) {
        try { fs.unlinkSync(filename + suffix); } catch { /* disposable only */ }
      }
    }
  });
});
