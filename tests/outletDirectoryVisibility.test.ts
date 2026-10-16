import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import app from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import * as schema from '../src/db/schema';
import { eq, and } from 'drizzle-orm';
import fs from 'fs';

// Helper for filtering logic in frontend pure logic tests
export function filterOutletsForDirectory(
  outlets: Array<{ id: string; name: string; status: string; directoryHidden?: boolean }>,
  showHidden: boolean
) {
  return showHidden ? outlets : outlets.filter(o => !o.directoryHidden);
}

describe('Retail Outlet Directory Visibility / Soft-Hide & Restore Lifecycle', () => {
  let env: { DB: any; DOCUMENTS_BUCKET: any };
  let dbPath: string;
  let localD1: any;
  let adminCookie = '';
  let dealerCookie = '';
  let testOutletId = '';

  const getCookie = (res: Response) => {
    const setCookie = res.headers.get('set-cookie');
    if (!setCookie) return '';
    return setCookie.split(';')[0];
  };

  const loginAs = async (email: string) => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email, password: 'Password@123' }),
      }),
      env
    );
    const cookie = getCookie(res);
    const json = (await res.json()) as any;
    return { res, cookie, json };
  };

  beforeEach(async () => {
    dbPath = `./.sqlite/test_outlet_dir_${Math.random().toString(36).substring(7)}.db`;
    localD1 = createLocalD1Database(dbPath);
    const db = getDb(localD1);
    await seedDatabase(db);

    env = { DB: localD1, DOCUMENTS_BUCKET: null as any };

    const adminLogin = await loginAs('admin@iocl.in');
    adminCookie = adminLogin.cookie;

    const dealerLogin = await loginAs('dealer.parkstreet@iocl.in');
    dealerCookie = dealerLogin.cookie;

    // Fetch an accessible outlet
    const outletsRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets', {
        headers: { Cookie: adminCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    const outletsJson = (await outletsRes.json()) as any;
    if (outletsJson.success && outletsJson.data && outletsJson.data.length > 0) {
      testOutletId = outletsJson.data[0].id;
    }
  });

  afterEach(() => {
    try {
      localD1.close();
    } catch (e) {}

    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
      if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
    } catch (e) {}
  });

  it('1. ADMIN can hide an accessible retail outlet with 200 success', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${testOutletId}/directory-visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ hidden: true }),
      }),
      env
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.directoryHidden).toBe(true);
  });

  it('2. After hide, the retail_outlets row still exists (no physical delete)', async () => {
    await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${testOutletId}/directory-visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ hidden: true }),
      }),
      env
    );

    const db = getDb(localD1);
    const rows = await db.select().from(schema.retailOutlets).where(eq(schema.retailOutlets.id, testOutletId));
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(testOutletId);
  });

  it('3. After hide, directory_hidden = 1, directory_hidden_at IS NOT NULL, directory_hidden_by equals authenticated actor user ID', async () => {
    await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${testOutletId}/directory-visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ hidden: true }),
      }),
      env
    );

    const db = getDb(localD1);
    const rows = await db.select().from(schema.retailOutlets).where(eq(schema.retailOutlets.id, testOutletId));
    const outlet = rows[0];
    expect(outlet.directoryHidden).toBe(true);
    expect(outlet.directoryHiddenAt).not.toBeNull();
    expect(outlet.directoryHiddenBy).toBe('user-admin');
  });

  it('4. Existing outlet fields remain unchanged (id, ro_code, name, status, state_id, division_id, sales_area_id)', async () => {
    const db = getDb(localD1);
    const originalRows = await db.select().from(schema.retailOutlets).where(eq(schema.retailOutlets.id, testOutletId));
    const original = originalRows[0];

    await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${testOutletId}/directory-visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ hidden: true }),
      }),
      env
    );

    const updatedRows = await db.select().from(schema.retailOutlets).where(eq(schema.retailOutlets.id, testOutletId));
    const updated = updatedRows[0];

    expect(updated.id).toBe(original.id);
    expect(updated.roCode).toBe(original.roCode);
    expect(updated.name).toBe(original.name);
    expect(updated.status).toBe(original.status);
    expect(updated.stateId).toBe(original.stateId);
    expect(updated.divisionId).toBe(original.divisionId);
    expect(updated.salesAreaId).toBe(original.salesAreaId);
  });

  it('5. Existing related data remains intact after hide', async () => {
    const db = getDb(localD1);
    const nozzles = await db.select().from(schema.nozzles).where(eq(schema.nozzles.outletId, testOutletId));
    const nozzleCountBefore = nozzles.length;

    await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${testOutletId}/directory-visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ hidden: true }),
      }),
      env
    );

    const nozzlesAfter = await db.select().from(schema.nozzles).where(eq(schema.nozzles.outletId, testOutletId));
    expect(nozzlesAfter.length).toBe(nozzleCountBefore);
  });

  it('6. Audit event exists with action = OUTLET_DIRECTORY_HIDE, entity_type = RETAIL_OUTLET, entity_id = target outlet ID', async () => {
    await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${testOutletId}/directory-visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ hidden: true }),
      }),
      env
    );

    const db = getDb(localD1);
    const audits = await db.select().from(schema.auditLogs).where(
      and(
        eq(schema.auditLogs.action, 'OUTLET_DIRECTORY_HIDE'),
        eq(schema.auditLogs.entityId, testOutletId)
      )
    );
    expect(audits.length).toBeGreaterThan(0);
    expect(audits[0].entityType).toBe('RETAIL_OUTLET');
  });

  it('7. Restore works with PATCH same endpoint with hidden: false -> 200, directory_hidden = 0, directory_hidden_at = NULL, directory_hidden_by = NULL', async () => {
    await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${testOutletId}/directory-visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ hidden: true }),
      }),
      env
    );

    const res = await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${testOutletId}/directory-visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ hidden: false }),
      }),
      env
    );
    expect(res.status).toBe(200);

    const db = getDb(localD1);
    const rows = await db.select().from(schema.retailOutlets).where(eq(schema.retailOutlets.id, testOutletId));
    const outlet = rows[0];
    expect(outlet.directoryHidden).toBe(false);
    expect(outlet.directoryHiddenAt).toBeNull();
    expect(outlet.directoryHiddenBy).toBeNull();
  });

  it('8. Restore audit event exists with action = OUTLET_DIRECTORY_RESTORE', async () => {
    await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${testOutletId}/directory-visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ hidden: true }),
      }),
      env
    );
    await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${testOutletId}/directory-visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ hidden: false }),
      }),
      env
    );

    const db = getDb(localD1);
    const audits = await db.select().from(schema.auditLogs).where(
      and(
        eq(schema.auditLogs.action, 'OUTLET_DIRECTORY_RESTORE'),
        eq(schema.auditLogs.entityId, testOutletId)
      )
    );
    expect(audits.length).toBeGreaterThan(0);
  });

  it('9. Unauthorized scoped user cannot hide a foreign outlet -> 403', async () => {
    const foLogin = await loginAs('fo.central@iocl.in');
    const foCookie = foLogin.cookie;

    const db = getDb(localD1);
    const beforeRows = await db.select().from(schema.retailOutlets).where(eq(schema.retailOutlets.id, 'ro-1002'));
    expect(beforeRows.length).toBe(1);
    expect(beforeRows[0].directoryHidden).toBe(false);
    expect(beforeRows[0].directoryHiddenAt).toBeNull();
    expect(beforeRows[0].directoryHiddenBy).toBeNull();

    const res = await app.fetch(
      new Request(`http://localhost/api/v1/outlets/ro-1002/directory-visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: foCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ hidden: true }),
      }),
      env
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as any;
    expect(json.success).toBe(false);

    const afterRows = await db.select().from(schema.retailOutlets).where(eq(schema.retailOutlets.id, 'ro-1002'));
    expect(afterRows.length).toBe(1);
    expect(afterRows[0].directoryHidden).toBe(false);
    expect(afterRows[0].directoryHiddenAt).toBeNull();
    expect(afterRows[0].directoryHiddenBy).toBeNull();

    const audits = await db.select().from(schema.auditLogs).where(
      and(
        eq(schema.auditLogs.action, 'OUTLET_DIRECTORY_HIDE'),
        eq(schema.auditLogs.entityId, 'ro-1002')
      )
    );
    expect(audits.length).toBe(0);
  });

  it('10. Invalid payload is rejected (missing hidden or non-boolean hidden -> 400 VALIDATION_ERROR)', async () => {
    const resEmpty = await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${testOutletId}/directory-visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({}),
      }),
      env
    );
    expect(resEmpty.status).toBe(400);
    const jsonEmpty = (await resEmpty.json()) as any;
    expect(jsonEmpty.error.code).toBe('VALIDATION_ERROR');

    const resInvalidType = await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${testOutletId}/directory-visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ hidden: 'true' }),
      }),
      env
    );
    expect(resInvalidType.status).toBe(400);
  });

  it('11. Unknown outlet returns appropriate controlled error without leaking SQL/internal details', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/outlets/non-existent-outlet-id-999/directory-visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ hidden: true }),
      }),
      env
    );
    expect(res.status).toBe(404);
    const json = (await res.json()) as any;
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NOT_FOUND');
    expect(JSON.stringify(json)).not.toContain('SQLITE');
    expect(JSON.stringify(json)).not.toContain('D1');
  });

  it('12. Explicitly prove no DELETE occurs and the outlet remains queryable after hide and restore', async () => {
    const db = getDb(localD1);

    await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${testOutletId}/directory-visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ hidden: true }),
      }),
      env
    );

    let rows = await db.select().from(schema.retailOutlets).where(eq(schema.retailOutlets.id, testOutletId));
    expect(rows.length).toBe(1);

    await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${testOutletId}/directory-visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ hidden: false }),
      }),
      env
    );

    rows = await db.select().from(schema.retailOutlets).where(eq(schema.retailOutlets.id, testOutletId));
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(testOutletId);
  });
});

describe('Frontend Pure Logic Tests: Retail Outlet Directory Visibility', () => {
  const sampleOutlets = [
    { id: 'ro-1', name: 'Outlet Alpha', status: 'ACTIVE', directoryHidden: false },
    { id: 'ro-2', name: 'Outlet Beta', status: 'ACTIVE', directoryHidden: true },
    { id: 'ro-3', name: 'Outlet Gamma', status: 'INACTIVE', directoryHidden: false },
    { id: 'ro-4', name: 'Outlet Delta', status: 'INACTIVE', directoryHidden: true },
  ];

  it('directoryHidden=false outlet appears normally when showHidden is false', () => {
    const displayed = filterOutletsForDirectory(sampleOutlets, false);
    expect(displayed.some(o => o.id === 'ro-1')).toBe(true);
    expect(displayed.some(o => o.id === 'ro-3')).toBe(true);
  });

  it('directoryHidden=true outlet is excluded when Show Hidden is OFF (showHidden=false)', () => {
    const displayed = filterOutletsForDirectory(sampleOutlets, false);
    expect(displayed.some(o => o.id === 'ro-2')).toBe(false);
    expect(displayed.some(o => o.id === 'ro-4')).toBe(false);
  });

  it('hidden outlet appears when Show Hidden is ON (showHidden=true)', () => {
    const displayed = filterOutletsForDirectory(sampleOutlets, true);
    expect(displayed.some(o => o.id === 'ro-2')).toBe(true);
    expect(displayed.some(o => o.id === 'ro-4')).toBe(true);
  });

  it('HIDDEN state is independent of ACTIVE/INACTIVE operational status', () => {
    const activeNotHidden = sampleOutlets.find(o => o.id === 'ro-3')!;
    expect(activeNotHidden.status).toBe('INACTIVE');
    expect(activeNotHidden.directoryHidden).toBe(false);

    const hiddenActive = sampleOutlets.find(o => o.id === 'ro-2')!;
    expect(hiddenActive.status).toBe('ACTIVE');
    expect(hiddenActive.directoryHidden).toBe(true);
  });
});
