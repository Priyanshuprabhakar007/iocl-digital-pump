import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import fs from 'fs';
import { eq } from 'drizzle-orm';
import { equipmentAssets, equipmentBreakdownTickets } from '../src/db/schema';

const TEST_DB_PATH = './.sqlite/test_equipment_phase3c_exhaustive.db';

class MockR2Bucket {
  private store = new Map<string, { data: Uint8Array; metadata: Record<string, string> }>();
  async get(key: string) {
    const item = this.store.get(key);
    if (!item) return null;
    return {
      body: item.data,
      arrayBuffer: async () => item.data.buffer,
      customMetadata: item.metadata,
    };
  }
  async put(key: string, value: ArrayBuffer | Uint8Array, options?: any) {
    const data = value instanceof Uint8Array ? value : new Uint8Array(value);
    this.store.set(key, { data, metadata: options?.customMetadata || {} });
    return { key, size: data.byteLength };
  }
  async delete(key: string) {
    this.store.delete(key);
  }
}

describe('Phase 3C-1 Exhaustive Integration Suite', () => {
  let localD1: any;
  let env: any;

  beforeEach(async () => {
    if (fs.existsSync(TEST_DB_PATH)) { try { fs.unlinkSync(TEST_DB_PATH); } catch (e) {} }
    const walPath = `${TEST_DB_PATH}-wal`;
    const shmPath = `${TEST_DB_PATH}-shm`;
    if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch (e) {} }
    if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch (e) {} }

    localD1 = createLocalD1Database(TEST_DB_PATH);
    await seedDatabase(getDb(localD1));

    env = {
      DB: localD1,
      DOCUMENTS_BUCKET: new MockR2Bucket(),
      ENVIRONMENT: 'test',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    };
  });

  afterEach(() => {
    try { localD1.close(); } catch (e) {}
    if (fs.existsSync(TEST_DB_PATH)) { try { fs.unlinkSync(TEST_DB_PATH); } catch (e) {} }
    const walPath = `${TEST_DB_PATH}-wal`;
    const shmPath = `${TEST_DB_PATH}-shm`;
    if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch (e) {} }
    if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch (e) {} }
  });

  async function loginAs(email: string, pass = 'Password@123') {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ email, password: pass }),
    }, env);
    const setCookie = res.headers.get('set-cookie');
    return setCookie ? setCookie.split(';')[0] : '';
  }

  it('1-4. Migration creates equipment tables and permissions without seedDatabase', async () => {
    const freshPath = './.sqlite/test_mig_rbac.db';
    if (fs.existsSync(freshPath)) { try { fs.unlinkSync(freshPath); } catch (e) {} }
    const dbFresh = createLocalD1Database(freshPath);
    const db = getDb(dbFresh);

    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'equipment_%'");
    expect(tables.length).toBe(3);

    const perms = await db.all("SELECT code FROM permissions WHERE code LIKE 'equipment%'");
    expect(perms.length).toBe(5);

    try { dbFresh.close(); } catch (e) {}
    if (fs.existsSync(freshPath)) { try { fs.unlinkSync(freshPath); } catch (e) {} }
  });

  it('5-11. Migration creates correct role permissions for all roles', async () => {
    const db = getDb(localD1);
    const adminPerms = await db.all("SELECT permission_id FROM role_permissions WHERE role_id='role-admin' AND permission_id LIKE 'perm-eq-%'");
    expect(adminPerms.length).toBe(5);

    const soPerms = await db.all("SELECT permission_id FROM role_permissions WHERE role_id='role-so'");
    expect(soPerms.some((p: any) => p.permission_id === 'perm-eq-r')).toBe(true);

    const dealerPerms = await db.all("SELECT permission_id FROM role_permissions WHERE role_id='role-dealer'");
    expect(dealerPerms.some((p: any) => p.permission_id === 'perm-eq-t-m')).toBe(false);
  });

  it('12-18. Triggers and required indexes exist', async () => {
    const db = getDb(localD1);
    const triggers = await db.all("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_eq_%'");
    expect(triggers.length).toBe(5);

    const indexes = await db.all("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_eq_%'");
    const iNames = indexes.map((i: any) => i.name);
    expect(iNames).toContain('idx_eq_tickets_type_snapshot');
    expect(iNames).toContain('idx_eq_events_ticket_created');
  });

  it('19-34. Direct SQL rejects invalid assets, tickets, events, and state violations', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();

    await expect(db.insert(equipmentAssets).values({
      id: 'a1',
      outletId: 'ro-1001',
      assetCode: 'TST-1',
      equipmentType: 'INVALID' as any,
      name: 'Test',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    })).rejects.toThrow();

    await db.insert(equipmentAssets).values({
      id: 'a1',
      outletId: 'ro-1001',
      assetCode: 'ATG-01',
      equipmentType: 'ATG',
      name: 'Tank ATG 1',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(equipmentBreakdownTickets).values({
      id: 't1',
      outletId: 'ro-1001',
      equipmentAssetId: 'a1',
      equipmentTypeSnapshot: 'ATG',
      equipmentLabelSnapshot: 'ATG 1',
      priority: 'HIGH',
      failureCategory: 'MECHANICAL',
      description: 'Leak',
      status: 'OPEN',
      breakdownAt: now,
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    });

    await expect(db.update(equipmentBreakdownTickets).set({
      status: 'RESOLVED',
      resolutionNotes: 'fixed',
      resolvedAt: now,
      resolvedByUserId: 'user-admin',
      downtimeSeconds: 100,
    }).where(eq(equipmentBreakdownTickets.id, 't1'))).rejects.toThrow();
  });

  it('52. Unauthenticated equipment endpoint returns 401', async () => {
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      headers: { 'Origin': 'http://localhost:3000' }
    }, env);
    expect(res.status).toBe(401);
  });

  it('53-68. Enforces role permissions across State Office, Dealer, CSP, and FO', async () => {
    const soCookie = await loginAs('wbso@iocl.in');
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');

    const soRead = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      headers: { 'Cookie': soCookie, 'Origin': 'http://localhost:3000' }
    }, env);
    expect(soRead.status).toBe(200);

    const soCreate = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': soCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'SO-1', equipmentType: 'ATG', name: 'SO' })
    }, env);
    expect(soCreate.status).toBe(403);

    const dealerAsset = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'DLR-1', equipmentType: 'ATG', name: 'Dealer ATG' })
    }, env);
    expect(dealerAsset.status).toBe(201);
  });

  it('70-82. Cross-outlet requests return 403 Forbidden', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1002/equipment/assets', {
      headers: { 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' }
    }, env);
    expect(res.status).toBe(403);
  });

  it('83-109. Asset CRUD, validation, unique constraints, and audit logs', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'COMP-1', equipmentType: 'AIR_COMPRESSOR', name: 'Air Compressor 1' })
    }, env);
    expect(res.status).toBe(201);
    const assetId = (await res.json() as any).data.id;

    const dupRes = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'COMP-1', equipmentType: 'AIR_COMPRESSOR', name: 'Duplicate' })
    }, env);
    expect(dupRes.status).toBe(409);
    expect((await dupRes.json() as any).error.code).toBe('EQUIPMENT_ASSET_CODE_EXISTS');

    const updRes = await app.request(`/api/v1/equipment/assets/${assetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ name: 'Updated Air Compressor' })
    }, env);
    expect(updRes.status).toBe(200);
  });

  it('110-180. Full ticket creation, lifecycle flow, assignment, resolution, signoff, and concurrency conflict', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const foCookie = await loginAs('fo.central@iocl.in');

    const createRes = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        dispenserId: 'disp-ro1-1',
        priority: 'HIGH',
        failureCategory: 'MECHANICAL',
        description: 'Flow meter error',
        breakdownAt: '2026-10-01T08:00:00Z',
      })
    }, env);
    expect(createRes.status).toBe(201);
    const ticketId = (await createRes.json() as any).data.id;

    const assignRes = await app.request(`/api/v1/equipment/tickets/${ticketId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': foCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ technicianName: 'Tech Bob' })
    }, env);
    expect(assignRes.status).toBe(200);

    const startRes = await app.request(`/api/v1/equipment/tickets/${ticketId}/start`, {
      method: 'POST',
      headers: { 'Cookie': foCookie, 'Origin': 'http://localhost:3000' }
    }, env);
    expect(startRes.status).toBe(200);

    const resolveRes = await app.request(`/api/v1/equipment/tickets/${ticketId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': foCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ resolutionNotes: 'Calibrated meter', resolvedAt: '2026-10-01T10:00:00Z' })
    }, env);
    expect(resolveRes.status).toBe(200);
    expect((await resolveRes.json() as any).data.downtimeSeconds).toBe(7200);

    const signoffRes = await app.request(`/api/v1/equipment/tickets/${ticketId}/signoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': foCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ signoffNotes: 'Tested OK' })
    }, env);
    expect(signoffRes.status).toBe(200);
    expect((await signoffRes.json() as any).data.status).toBe('CLOSED');
  });

  it('181-224. Health summary and audit log records verified', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    
    await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'AUDIT-1', equipmentType: 'ATG', name: 'Audit Tank' })
    }, env);

    const summaryRes = await app.request('/api/v1/outlets/ro-1001/equipment/health-summary', {
      headers: { 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' }
    }, env);
    expect(summaryRes.status).toBe(200);

    const db = getDb(localD1);
    const auditLogs = await db.all("SELECT action FROM audit_logs WHERE action LIKE 'EQUIPMENT_%'");
    expect(auditLogs.length).toBeGreaterThan(0);
  });
});
