import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import { PumpRepository } from '../src/worker/repositories/pumpRepository';

describe('Stage 01S: proposed local D1 source immutability triggers', () => {
  it('permits OPEN writes but blocks direct SQL changes after CLOSING for five source tables', async () => {
    const filename = `./.sqlite/stage01s_${Date.now()}_${Math.random().toString(16).slice(2)}.db`;
    const d1 = createLocalD1Database(filename);
    try {
      await seedDatabase(getDb(d1));
      await d1.exec(fs.readFileSync('scripts/stage01s/PROPOSED_open_only_source_triggers.sql', 'utf8'));
      const env: any = {
        DB: d1, ENVIRONMENT: 'development',
        ALLOWED_ORIGINS: 'http://localhost:3000',
        SESSION_SECRET: 'stage01s-local-synthetic-secret-123456789123456',
      };
      const request = (path: string, body: unknown, cookie = '') =>
        app.fetch(new Request('http://localhost/api/v1' + path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000', Cookie: cookie },
          body: JSON.stringify(body),
        }), env);
      const login = await request('/auth/login', { email: 'admin@iocl.in', password: 'Password@123' });
      expect(login.status).toBe(200);
      const cookie = login.headers.get('set-cookie') || '';
      const opened = await request('/outlets/ro-1001/shifts/open', {
        shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-02',
      }, cookie);
      expect(opened.status).toBe(201);
      const shiftId = (await opened.json() as any).data.id as string;

      const user = await d1.prepare("SELECT id FROM users WHERE email='admin@iocl.in'").first<{id:string}>();
      expect(user?.id).toBeTruthy();
      const actorId = user!.id;
      const now = '2026-11-02T10:00:00.000Z';
      const receiptId = 's01s-receipt-1';
      const lineId = 's01s-line-1';
      const unavailId = 's01s-unavail-1';

      // All five source tables can accept their valid synthetic entries while OPEN.
      expect((await request(`/shifts/${shiftId}/readings`, {
        nozzleId: 'nozz-ro1-1-1', openingTotalizer: '1000.000',
        closingTotalizer: '1001.000', testingQuantity: '0.000',
      }, cookie)).status).toBe(201);
      expect((await request(`/shifts/${shiftId}/tank-readings`, {
        tankId: 'tank-ro1-1', readingType: 'OPENING', source: 'MANUAL',
        productDipMm: '1000.000', waterDipMm: '0.000',
      }, cookie)).status).toBe(201);
      await d1.prepare(`INSERT INTO nozzle_unavailability_records
        (id, operational_shift_id, nozzle_id, reason, recorded_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(unavailId, shiftId, 'nozz-ro1-1-2', 'Synthetic unavailable nozzle', actorId, now).run();
      await d1.prepare(`INSERT INTO fuel_receipts
        (id, outlet_id, operational_shift_id, tt_number, invoice_number, invoice_date,
          arrival_at, status, recorded_by_user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(receiptId, 'ro-1001', shiftId, 'S01S-TRUCK', 'S01S-INVOICE',
          '2026-11-02', now, 'ARRIVED', actorId, now, now).run();
      await d1.prepare(`INSERT INTO fuel_receipt_tank_lines
        (id, fuel_receipt_id, tank_id, product_id, invoice_quantity_milliunits, created_at, updated_at)
        SELECT ?, ?, t.id, t.product_id, ?, ?, ? FROM tanks t WHERE t.id = ?`)
        .bind(lineId, receiptId, 1000, now, now, 'tank-ro1-1').run();

      const repo = new PumpRepository(getDb(d1));
      expect((await repo.beginCloseConditional(shiftId)).success).toBe(true);
      const attempts = [
        ['nozzle_meter_readings', 'closing_totalizer_milliunits', 'operational_shift_id', shiftId],
        ['tank_stock_readings', 'product_dip_mm_milliunits', 'operational_shift_id', shiftId],
        ['nozzle_unavailability_records', 'reason', 'operational_shift_id', shiftId],
        ['fuel_receipts', 'tt_number', 'operational_shift_id', shiftId],
        ['fuel_receipt_tank_lines', 'invoice_quantity_milliunits', 'fuel_receipt_id', receiptId],
      ] as const;
      for (const [table, column, whereColumn, key] of attempts) {
        // Identifiers come from the fixed in-test whitelist, not user input.
        await expect(d1.prepare(`UPDATE ${table} SET ${column} = ${column}
          WHERE ${whereColumn} = ?`).bind(key).run(), table).rejects.toThrow('STAGE01S_SOURCE_SHIFT_NOT_OPEN');
        await expect(d1.prepare(`DELETE FROM ${table}
          WHERE ${whereColumn} = ?`).bind(key).run(), table).rejects.toThrow('STAGE01S_SOURCE_SHIFT_NOT_OPEN');
      }
      await expect(d1.prepare(`INSERT INTO nozzle_unavailability_records
        (id, operational_shift_id, nozzle_id, reason, recorded_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .bind('s01s-unavail-2', shiftId, 'nozz-ro1-2-1', 'Synthetic attempt', actorId, now).run())
        .rejects.toThrow('STAGE01S_SOURCE_SHIFT_NOT_OPEN');

      const current = await d1.prepare('SELECT status FROM operational_shifts WHERE id = ?')
        .bind(shiftId).first<{ status: string }>();
      expect(current?.status).toBe('CLOSING');
    } finally {
      d1.close();
      for (const suffix of ['', '-wal', '-shm']) {
        try { fs.unlinkSync(filename + suffix); } catch { /* disposable local fixture */ }
      }
    }
  });
});
