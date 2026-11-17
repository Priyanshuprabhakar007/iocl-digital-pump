import { describe, expect, it } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { seedDatabase } from '../src/db/seed';
import { getDb } from '../src/db';
import { PumpRepository } from '../src/worker/repositories/pumpRepository';
import fs from 'node:fs';

describe('Stage 01R-2: source input endpoints reject mutations during CLOSING', () => {
  it('holds both meter routes and nozzle-unavailability routes without writing records', async () => {
    const path = `./.sqlite/stage01r2_${Date.now()}_${Math.random().toString(16).slice(2)}.db`;
    const d1 = createLocalD1Database(path);
    try {
      await seedDatabase(getDb(d1));
      const env: any = {
        DB: d1,
        SESSION_SECRET: 'stage01r2-synthetic-secret-1234567891234567',
        ENVIRONMENT: 'development',
        ALLOWED_ORIGINS: 'http://localhost:3000',
      };
      const request = (route: string, method: string, cookie: string, body?: unknown) =>
        app.fetch(new Request('http://localhost/api/v1' + route, {
          method,
          headers: { Origin: 'http://localhost:3000', Cookie: cookie, 'Content-Type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }), env);

      const login = await request('/auth/login', 'POST', '', {
        email: 'admin@iocl.in', password: 'Password@123',
      });
      expect(login.status).toBe(200);
      const cookie = login.headers.get('set-cookie') || '';
      const opened = await request('/outlets/ro-1001/shifts/open', 'POST', cookie, {
        shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-02',
      });
      expect(opened.status).toBe(201);
      const shiftId = (await opened.json() as any).data.id as string;
      const repo = new PumpRepository(getDb(d1));
      expect((await repo.beginCloseConditional(shiftId)).success).toBe(true);

      const routes: Array<[string, string, unknown?]> = [
        [`/shifts/${shiftId}/readings`, 'POST', {
          nozzleId: 'nozz-ro1-1-1', openingTotalizer: '1000.000',
          closingTotalizer: '1001.000', testingQuantity: '0.000',
        }],
        [`/shifts/${shiftId}/readings/batch`, 'POST', { readings: [] }],
        [`/shifts/${shiftId}/nozzle-unavailability`, 'POST', {
          nozzleId: 'nozz-ro1-1-1', reason: 'Synthetic test',
        }],
        [`/shifts/${shiftId}/nozzle-unavailability/nozz-ro1-1-1`, 'DELETE'],
      ];
      for (const [route, method, body] of routes) {
        const response = await request(route, method, cookie, body);
        expect(response.status, `${method} ${route}`).toBe(409);
      }
      const status = await d1.prepare('SELECT status FROM operational_shifts WHERE id = ?')
        .bind(shiftId).first<{ status: string }>();
      expect(status?.status).toBe('CLOSING');
      const meter = await d1.prepare('SELECT count(*) AS n FROM nozzle_meter_readings WHERE operational_shift_id = ?')
        .bind(shiftId).first<{ n: number }>();
      const unavailability = await d1.prepare('SELECT count(*) AS n FROM nozzle_unavailability_records WHERE operational_shift_id = ?')
        .bind(shiftId).first<{ n: number }>();
      expect(Number(meter?.n)).toBe(0);
      expect(Number(unavailability?.n)).toBe(0);
    } finally {
      d1.close();
      for (const suffix of ['', '-wal', '-shm']) {
        try { fs.unlinkSync(path + suffix); } catch { /* disposable local fixture */ }
      }
    }
  });
});
