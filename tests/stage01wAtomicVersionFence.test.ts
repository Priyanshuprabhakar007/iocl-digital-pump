import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import { app } from '../src/worker/app';
import { PumpRepository } from '../src/worker/repositories/pumpRepository';

describe('Stage 01W — database-side source revision guard prototype', () => {
  it('rejects a changed version atomically after the preview, keeping all evidence absent', async () => {
    const filename = `./.sqlite/stage01w_${crypto.randomUUID()}.db`;
    const db = createLocalD1Database(filename);
    try {
      await seedDatabase(getDb(db));
      const env: any = {
        DB: db,
        SESSION_SECRET: 'stage01w-local-synthetic-secret-1234567890',
        ENVIRONMENT: 'development',
        ALLOWED_ORIGINS: 'http://localhost:3000',
      };
      const req = (path: string, cookie: string, payload: unknown) =>
        app.fetch(new Request('http://localhost/api/v1' + path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000', Cookie: cookie },
          body: JSON.stringify(payload),
        }), env);
      const login = await req('/auth/login', '', { email: 'admin@iocl.in', password: 'Password@123' });
      expect(login.status).toBe(200);
      const cookie = login.headers.get('set-cookie') ?? '';
      const opened = await req('/outlets/ro-1001/shifts/open', cookie, {
        shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-14',
      });
      expect(opened.status).toBe(201);
      const shiftId = (await opened.json() as any).data.id as string;

      await db.exec(fs.readFileSync('scripts/stage01w/PROPOSED_atomic_version_fence_fixture.sql', 'utf8'));
      await db.prepare('INSERT INTO stage01w_shift_source_versions(shift_id, revision) VALUES (?, ?)')
        .bind(shiftId, 5).run();
      const previewRevision = 5;
      expect((await new PumpRepository(getDb(db)).beginCloseConditional(shiftId)).success).toBe(true);

      // Reproduce a change in an input domain not adequately frozen by the
      // shift-scoped source trigger proposals, e.g. a referenced master price.
      await db.prepare('UPDATE stage01w_shift_source_versions SET revision = ? WHERE shift_id = ?')
        .bind(6, shiftId).run();
      const insert = (id: string, revision: number) => db.prepare(
        'INSERT INTO stage01w_prepared_evidence(id, shift_id, source_revision, category, amount_paise) VALUES (?, ?, ?, ?, ?) RETURNING id',
      ).bind(id, shiftId, revision, 'synthetic-finance', 2500);

      await expect(db.batch([
        insert('first-matching-actual-version', 6),
        insert('second-stale-preview-version', previewRevision),
      ])).rejects.toThrow('STAGE01W_SOURCE_VERSION_STALE_OR_SHIFT_NOT_CLOSING');

      const rows = await db.prepare('SELECT COUNT(*) AS n FROM stage01w_prepared_evidence')
        .first<{ n: number }>();
      expect(Number(rows?.n)).toBe(0);
      const status = await db.prepare('SELECT status FROM operational_shifts WHERE id = ?')
        .bind(shiftId).first<{ status: string }>();
      expect(status?.status).toBe('CLOSING');

      // A verified version at the exact DB write boundary is accepted.
      const committed = await db.batch([insert('matched-new-version', 6)]);
      expect(committed[0]?.results?.length).toBe(1);
      const persisted = await db.prepare('SELECT COUNT(*) AS n FROM stage01w_prepared_evidence')
        .first<{ n: number }>();
      expect(Number(persisted?.n)).toBe(1);

      // CLOSED must never admit new prepared evidence, even with a matching version.
      await db.prepare("UPDATE operational_shifts SET status = 'CLOSED' WHERE id = ?")
        .bind(shiftId).run();
      await expect(db.batch([insert('after-close-rejected', 6)]))
        .rejects.toThrow('STAGE01W_SOURCE_VERSION_STALE_OR_SHIFT_NOT_CLOSING');
    } finally {
      db.close();
      for (const suffix of ['', '-wal', '-shm']) {
        try { fs.unlinkSync(filename + suffix); } catch { /* disposable local fixture */ }
      }
    }
  });
});
