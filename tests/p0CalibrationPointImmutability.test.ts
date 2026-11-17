import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import app from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';

const proposedSql = 'scripts/p0/PROPOSED_referenced_calibration_point_immutability.sql';

describe('P0 proposed DB-side calibration point immutability — disposable local D1 only', () => {
  it('rejects direct INSERT, UPDATE and DELETE after shift snapshots a chart, even before first dip', async () => {
    const path = `./.sqlite/p0_chart_point_lock_${crypto.randomUUID()}.db`;
    const db = createLocalD1Database(path);
    try {
      await seedDatabase(getDb(db));
      // No hosted D1 migration or deployment: enable proposal only in this DB.
      await db.exec(fs.readFileSync(proposedSql, 'utf8'));
      const env: any = { DB: db, ENVIRONMENT: 'development', ALLOWED_ORIGINS: 'http://localhost:3000' };
      const login = await app.fetch(new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
      }), env);
      expect(login.status).toBe(200);
      const cookie = login.headers.get('set-cookie') ?? '';
      const opened = await app.fetch(new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }), env);
      expect(opened.status).toBe(201);
      const shiftId = (await opened.json() as any).data.id as string;
      const snapshot = await db.prepare(
        "SELECT calibration_chart_id AS chartId FROM operational_shift_tanks WHERE operational_shift_id = ? AND tank_id = 'tank-ro1-1'",
      ).bind(shiftId).first<{ chartId: string }>();
      expect(snapshot?.chartId).toBeTruthy();
      const chartId = snapshot!.chartId;
      const preDipCount = await db.prepare(
        'SELECT COUNT(*) AS n FROM tank_stock_readings WHERE operational_shift_id = ?',
      ).bind(shiftId).first<{n:number}>();
      expect(preDipCount?.n).toBe(0);

      const point = await db.prepare(
        'SELECT id, volume_milliunits AS volume FROM tank_calibration_points WHERE chart_id = ? ORDER BY dip_millimetres_milliunits LIMIT 1',
      ).bind(chartId).first<{id:string;volume:number}>();
      expect(point?.id).toBeTruthy();

      const error = 'P0_CALIBRATION_CHART_REFERENCED_IMMUTABLE';
      await expect(db.prepare(
        'UPDATE tank_calibration_points SET volume_milliunits = volume_milliunits + 1 WHERE id = ?',
      ).bind(point!.id).run()).rejects.toThrow(error);
      await expect(db.prepare(
        'DELETE FROM tank_calibration_points WHERE id = ?',
      ).bind(point!.id).run()).rejects.toThrow(error);
      await expect(db.prepare(
        `INSERT INTO tank_calibration_points
        (id,chart_id,tank_id,dip_millimetres_milliunits,volume_milliunits,created_at,created_by)
        VALUES (?,?,?,9999000,9999000,?,?)`,
      ).bind('p0-immutable-new-point',chartId,'tank-ro1-1',new Date().toISOString(),'user-admin').run()).rejects.toThrow(error);
      const unchanged = await db.prepare(
        'SELECT volume_milliunits AS volume FROM tank_calibration_points WHERE id = ?',
      ).bind(point!.id).first<{volume:number}>();
      expect(unchanged?.volume).toBe(point!.volume);

      // Fresh unreferenced DRAFT revision remains editable, preserving the
      // approved workflow of introducing a new chart instead of rewriting it.
      await db.prepare(`INSERT INTO tank_calibration_charts
        (id,tank_id,revision_number,status,effective_from,created_at,created_by,updated_at)
        VALUES ('p0-unreferenced-draft','tank-ro1-1',999,'DRAFT','2026-11-21',?,?,?)`)
        .bind(new Date().toISOString(),'user-admin',new Date().toISOString()).run();
      await db.prepare(`INSERT INTO tank_calibration_points
        (id,chart_id,tank_id,dip_millimetres_milliunits,volume_milliunits,created_at,created_by)
        VALUES ('p0-draft-point','p0-unreferenced-draft','tank-ro1-1',1000,2000,?,?)`)
        .bind(new Date().toISOString(),'user-admin').run();
      await db.prepare(
        "UPDATE tank_calibration_points SET volume_milliunits = 3000 WHERE id = 'p0-draft-point'",
      ).run();
      const draft = await db.prepare(
        "SELECT volume_milliunits AS volume FROM tank_calibration_points WHERE id = 'p0-draft-point'",
      ).first<{volume:number}>();
      expect(draft?.volume).toBe(3000);
      await db.prepare("DELETE FROM tank_calibration_points WHERE id = 'p0-draft-point'").run();
      expect((await db.prepare(
        "SELECT COUNT(*) AS n FROM tank_calibration_points WHERE id = 'p0-draft-point'",
      ).first<{n:number}>())?.n).toBe(0);
    } finally {
      db.close();
      for (const suffix of ['', '-wal', '-shm']) {
        try { fs.unlinkSync(path + suffix); } catch {}
      }
    }
  });
});
