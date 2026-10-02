import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import fs from 'fs';
import { eq } from 'drizzle-orm';
import { equipmentAssets, equipmentBreakdownTickets, equipmentBreakdownEvents } from '../src/db/schema';

const TEST_DB_PATH = `./.sqlite/test_equipment_phase3c_${Math.random().toString(36).substring(2)}.db`;

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

  // --- EXISTING 54 TESTS ---

  it('migration creates equipment_assets table', async () => {
    const db = getDb(localD1);
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name = 'equipment_assets'");
    expect(tables.length).toBe(1);
  });

  it('migration creates equipment_breakdown_tickets table', async () => {
    const db = getDb(localD1);
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name = 'equipment_breakdown_tickets'");
    expect(tables.length).toBe(1);
  });

  it('migration creates equipment_breakdown_events table', async () => {
    const db = getDb(localD1);
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name = 'equipment_breakdown_events'");
    expect(tables.length).toBe(1);
  });

  it('migration independently inserts equipment.read permission', async () => {
    const db = getDb(localD1);
    const perm = await db.all("SELECT code FROM permissions WHERE code = 'equipment.read'");
    expect(perm.length).toBe(1);
  });

  it('migration independently inserts equipment_assets.write permission', async () => {
    const db = getDb(localD1);
    const perm = await db.all("SELECT code FROM permissions WHERE code = 'equipment_assets.write'");
    expect(perm.length).toBe(1);
  });

  it('migration independently inserts equipment_tickets.create permission', async () => {
    const db = getDb(localD1);
    const perm = await db.all("SELECT code FROM permissions WHERE code = 'equipment_tickets.create'");
    expect(perm.length).toBe(1);
  });

  it('migration independently inserts equipment_tickets.manage permission', async () => {
    const db = getDb(localD1);
    const perm = await db.all("SELECT code FROM permissions WHERE code = 'equipment_tickets.manage'");
    expect(perm.length).toBe(1);
  });

  it('migration independently inserts equipment_tickets.signoff permission', async () => {
    const db = getDb(localD1);
    const perm = await db.all("SELECT code FROM permissions WHERE code = 'equipment_tickets.signoff'");
    expect(perm.length).toBe(1);
  });

  it('ADMIN migration mapping contains all equipment permissions', async () => {
    const db = getDb(localD1);
    const adminPerms = await db.all("SELECT permission_id FROM role_permissions WHERE role_id='role-admin' AND permission_id LIKE 'perm-eq-%'");
    expect(adminPerms.length).toBe(5);
  });

  it('STATE_OFFICE has equipment read permission', async () => {
    const db = getDb(localD1);
    const soPerms = await db.all("SELECT permission_id FROM role_permissions WHERE role_id='role-so' AND permission_id='perm-eq-r'");
    expect(soPerms.length).toBe(1);
  });

  it('DIVISIONAL_OFFICE has equipment manage permission', async () => {
    const db = getDb(localD1);
    const doPerms = await db.all("SELECT permission_id FROM role_permissions WHERE role_id='role-do' AND permission_id='perm-eq-t-m'");
    expect(doPerms.length).toBe(1);
  });

  it('BUSINESS_MANAGER has equipment manage permission', async () => {
    const db = getDb(localD1);
    const bmPerms = await db.all("SELECT permission_id FROM role_permissions WHERE role_id='role-bm' AND permission_id='perm-eq-t-m'");
    expect(bmPerms.length).toBe(1);
  });

  it('FIELD_OFFICER has equipment manage permission', async () => {
    const db = getDb(localD1);
    const foPerms = await db.all("SELECT permission_id FROM role_permissions WHERE role_id='role-fo' AND permission_id='perm-eq-t-m'");
    expect(foPerms.length).toBe(1);
  });

  it('DEALER has read, assets write and create but not manage or signoff', async () => {
    const db = getDb(localD1);
    const dealerPerms = await db.all("SELECT permission_id FROM role_permissions WHERE role_id='role-dealer'");
    const pIds = dealerPerms.map((p: any) => p.permission_id);
    expect(pIds).toContain('perm-eq-r');
    expect(pIds).toContain('perm-eq-as-w');
    expect(pIds).toContain('perm-eq-t-c');
    expect(pIds).not.toContain('perm-eq-t-m');
    expect(pIds).not.toContain('perm-eq-t-s');
  });

  it('CSP has read, assets write and create but not manage or signoff', async () => {
    const db = getDb(localD1);
    const cspPerms = await db.all("SELECT permission_id FROM role_permissions WHERE role_id='role-csp'");
    const pIds = cspPerms.map((p: any) => p.permission_id);
    expect(pIds).toContain('perm-eq-r');
    expect(pIds).toContain('perm-eq-as-w');
    expect(pIds).toContain('perm-eq-t-c');
    expect(pIds).not.toContain('perm-eq-t-m');
    expect(pIds).not.toContain('perm-eq-t-s');
  });

  it('lifecycle trigger exists in database', async () => {
    const db = getDb(localD1);
    const triggers = await db.all("SELECT name FROM sqlite_master WHERE type='trigger' AND name = 'trg_eq_ticket_lifecycle'");
    expect(triggers.length).toBe(1);
  });

  it('immutable ticket trigger exists in database', async () => {
    const db = getDb(localD1);
    const triggers = await db.all("SELECT name FROM sqlite_master WHERE type='trigger' AND name = 'trg_eq_ticket_immutability'");
    expect(triggers.length).toBe(1);
  });

  it('terminal ticket trigger exists in database', async () => {
    const db = getDb(localD1);
    const triggers = await db.all("SELECT name FROM sqlite_master WHERE type='trigger' AND name = 'trg_eq_ticket_terminal'");
    expect(triggers.length).toBe(1);
  });

  it('event UPDATE immutable trigger exists in database', async () => {
    const db = getDb(localD1);
    const triggers = await db.all("SELECT name FROM sqlite_master WHERE type='trigger' AND name = 'trg_eq_event_immutable_update'");
    expect(triggers.length).toBe(1);
  });

  it('event DELETE immutable trigger exists in database', async () => {
    const db = getDb(localD1);
    const triggers = await db.all("SELECT name FROM sqlite_master WHERE type='trigger' AND name = 'trg_eq_event_immutable_delete'");
    expect(triggers.length).toBe(1);
  });

  it('invalid equipment asset type rejected directly by DB', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await expect(db.insert(equipmentAssets).values({
      id: 'a-bad',
      outletId: 'ro-1001',
      assetCode: 'BAD-1',
      equipmentType: 'INVALID' as any,
      name: 'Bad Asset',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run()).rejects.toThrow();
  });

  it('invalid equipment asset status rejected directly by DB', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await expect(db.insert(equipmentAssets).values({
      id: 'a-bad-status',
      outletId: 'ro-1001',
      assetCode: 'BAD-2',
      equipmentType: 'ATG',
      status: 'UNKNOWN' as any,
      name: 'Bad Status',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run()).rejects.toThrow();
  });

  it('blank asset code rejected directly by DB', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await expect(db.insert(equipmentAssets).values({
      id: 'a-blank',
      outletId: 'ro-1001',
      assetCode: '   ',
      equipmentType: 'ATG',
      name: 'Blank Code',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run()).rejects.toThrow();
  });

  it('blank asset name rejected directly by DB', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await expect(db.insert(equipmentAssets).values({
      id: 'a-blank-name',
      outletId: 'ro-1001',
      assetCode: 'BLANK-N',
      equipmentType: 'ATG',
      name: '   ',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run()).rejects.toThrow();
  });

  it('RESOLVED without resolution metadata rejected by DB check', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await db.insert(equipmentAssets).values({
      id: 'a-res',
      outletId: 'ro-1001',
      assetCode: 'RES-1',
      equipmentType: 'ATG',
      name: 'Tank Res',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();
    await db.insert(equipmentBreakdownTickets).values({
      id: 't-res',
      outletId: 'ro-1001',
      equipmentAssetId: 'a-res',
      equipmentTypeSnapshot: 'ATG',
      equipmentLabelSnapshot: 'Res Tank',
      priority: 'HIGH',
      failureCategory: 'MECHANICAL',
      description: 'Test',
      status: 'OPEN',
      breakdownAt: now,
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();
    await expect(db.update(equipmentBreakdownTickets).set({
      status: 'RESOLVED',
    }).where(eq(equipmentBreakdownTickets.id, 't-res')).run()).rejects.toThrow();
  });

  it('CLOSED without signoff metadata rejected by DB check', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await db.insert(equipmentAssets).values({
      id: 'a-close',
      outletId: 'ro-1001',
      assetCode: 'CLOSE-1',
      equipmentType: 'ATG',
      name: 'Tank Close',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();
    await db.insert(equipmentBreakdownTickets).values({
      id: 't-close',
      outletId: 'ro-1001',
      equipmentAssetId: 'a-close',
      equipmentTypeSnapshot: 'ATG',
      equipmentLabelSnapshot: 'Close Tank',
      priority: 'HIGH',
      failureCategory: 'MECHANICAL',
      description: 'Test',
      status: 'RESOLVED',
      resolutionNotes: 'Fixed',
      resolvedAt: now,
      resolvedByUserId: 'user-admin',
      downtimeSeconds: 100,
      breakdownAt: now,
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();
    await expect(db.update(equipmentBreakdownTickets).set({
      status: 'CLOSED',
    }).where(eq(equipmentBreakdownTickets.id, 't-close')).run()).rejects.toThrow();
  });

  it('unauthenticated equipment request returns 401', async () => {
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      headers: { 'Origin': 'http://localhost:3000' }
    }, env);
    expect(res.status).toBe(401);
  });

  it('State Office can read equipment assets', async () => {
    const soCookie = await loginAs('wbso@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      headers: { 'Cookie': soCookie, 'Origin': 'http://localhost:3000' }
    }, env);
    expect(res.status).toBe(200);
  });

  it('State Office cannot create equipment asset', async () => {
    const soCookie = await loginAs('wbso@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': soCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'SO-1', equipmentType: 'ATG', name: 'SO' })
    }, env);
    expect(res.status).toBe(403);
  });

  it('State Office cannot create equipment ticket', async () => {
    const soCookie = await loginAs('wbso@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': soCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ dispenserId: 'disp-ro1-1', priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', breakdownAt: '2026-10-01T08:00:00Z' })
    }, env);
    expect(res.status).toBe(403);
  });

  it('Dealer can read own outlet equipment assets', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      headers: { 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' }
    }, env);
    expect(res.status).toBe(200);
  });

  it('Dealer can create equipment asset', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'DLR-1', equipmentType: 'ATG', name: 'Dealer ATG' })
    }, env);
    expect(res.status).toBe(201);
  });

  it('Dealer can create equipment ticket', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ dispenserId: 'disp-ro1-1', priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', breakdownAt: '2026-10-01T08:00:00Z' })
    }, env);
    expect(res.status).toBe(201);
  });

  it('Dealer cannot assign ticket', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const res = await app.request('/api/v1/equipment/tickets/nonexistent/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ technicianName: 'Tech' })
    }, env);
    expect(res.status).toBe(403);
  });

  it('Dealer cannot resolve ticket', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const res = await app.request('/api/v1/equipment/tickets/nonexistent/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ resolutionNotes: 'Fixed', resolvedAt: '2026-10-01T10:00:00Z' })
    }, env);
    expect(res.status).toBe(403);
  });

  it('Dealer cannot signoff ticket', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const res = await app.request('/api/v1/equipment/tickets/nonexistent/signoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ signoffNotes: 'OK' })
    }, env);
    expect(res.status).toBe(403);
  });

  it('cross-outlet asset GET returns 403', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1002/equipment/assets', {
      headers: { 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' }
    }, env);
    expect(res.status).toBe(403);
  });

  it('cross-outlet asset POST returns 403', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1002/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'X-1', equipmentType: 'ATG', name: 'Cross' })
    }, env);
    expect(res.status).toBe(403);
  });

  it('cross-outlet targets GET returns 403', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1002/equipment/targets', {
      headers: { 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' }
    }, env);
    expect(res.status).toBe(403);
  });

  it('cross-outlet ticket list returns 403', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1002/equipment/tickets', {
      headers: { 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' }
    }, env);
    expect(res.status).toBe(403);
  });

  it('cross-outlet health summary GET returns 403', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1002/equipment/health-summary', {
      headers: { 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' }
    }, env);
    expect(res.status).toBe(403);
  });

  it('create ATG asset succeeds', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'ATG-99', equipmentType: 'ATG', name: 'ATG 99' })
    }, env);
    expect(res.status).toBe(201);
  });

  it('create AIR_COMPRESSOR asset succeeds', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'COMP-99', equipmentType: 'AIR_COMPRESSOR', name: 'Compressor 99' })
    }, env);
    expect(res.status).toBe(201);
  });

  it('create CNG_COMPRESSOR asset succeeds', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'CNG-99', equipmentType: 'CNG_COMPRESSOR', name: 'CNG 99' })
    }, env);
    expect(res.status).toBe(201);
  });

  it('create DG_SET asset succeeds', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'DG-99', equipmentType: 'DG_SET', name: 'DG 99' })
    }, env);
    expect(res.status).toBe(201);
  });

  it('create OTHER asset succeeds', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'OTH-99', equipmentType: 'OTHER', name: 'Other 99' })
    }, env);
    expect(res.status).toBe(201);
  });

  it('duplicate asset code returns 409 EQUIPMENT_ASSET_CODE_EXISTS', async () => {
    const cookie = await loginAs('admin@iocl.in');
    await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'DUP-1', equipmentType: 'ATG', name: 'Tank 1' })
    }, env);
    const dupRes = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'DUP-1', equipmentType: 'ATG', name: 'Tank 2' })
    }, env);
    expect(dupRes.status).toBe(409);
    expect((await dupRes.json() as any).error.code).toBe('EQUIPMENT_ASSET_CODE_EXISTS');
  });

  it('asset update succeeds', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const createRes = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'UP-1', equipmentType: 'ATG', name: 'Original Name' })
    }, env);
    const assetId = (await createRes.json() as any).data.id;

    const updRes = await app.request(`/api/v1/equipment/assets/${assetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ name: 'New Name' })
    }, env);
    expect(updRes.status).toBe(200);
    expect((await updRes.json() as any).data.name).toBe('New Name');
  });

  it('targets include dispenser and auxiliary assets', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/targets', {
      headers: { 'Cookie': cookie, 'Origin': 'http://localhost:3000' }
    }, env);
    expect(res.status).toBe(200);
    const data = (await res.json() as any).data;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it('full ticket lifecycle: create, assign, start, resolve, signoff', async () => {
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

  it('ticket cancellation flow succeeds with field officer', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const foCookie = await loginAs('fo.central@iocl.in');

    const createRes = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        dispenserId: 'disp-ro1-1',
        priority: 'LOW',
        failureCategory: 'OTHER',
        description: 'False alarm',
        breakdownAt: '2026-10-01T08:00:00Z',
      })
    }, env);
    expect(createRes.status).toBe(201);
    const ticketId = (await createRes.json() as any).data.id;

    const cancelRes = await app.request(`/api/v1/equipment/tickets/${ticketId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': foCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ reason: 'Mistake ticket' })
    }, env);
    expect(cancelRes.status).toBe(200);
    expect((await cancelRes.json() as any).data.status).toBe('CANCELLED');
  });

  it('health summary API returns correct structure', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const summaryRes = await app.request('/api/v1/outlets/ro-1001/equipment/health-summary', {
      headers: { 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' }
    }, env);
    expect(summaryRes.status).toBe(200);
    const data = (await summaryRes.json() as any).data;
    expect(typeof data.activeTicketCount).toBe('number');
    expect(typeof data.criticalActiveCount).toBe('number');
  });

  it('ticket detail GET returns correct data', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const createRes = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ dispenserId: 'disp-ro1-1', priority: 'MEDIUM', failureCategory: 'ELECTRICAL', description: 'Power issue', breakdownAt: '2026-10-01T08:00:00Z' })
    }, env);
    const ticketId = (await createRes.json() as any).data.id;

    const detailRes = await app.request(`/api/v1/equipment/tickets/${ticketId}`, {
      headers: { 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' }
    }, env);
    expect(detailRes.status).toBe(200);
    expect((await detailRes.json() as any).data.id).toBe(ticketId);
  });

  it('ticket events GET returns audit trail', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const createRes = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ dispenserId: 'disp-ro1-1', priority: 'LOW', failureCategory: 'OTHER', description: 'Test events', breakdownAt: '2026-10-01T08:00:00Z' })
    }, env);
    const ticketId = (await createRes.json() as any).data.id;

    const eventsRes = await app.request(`/api/v1/equipment/tickets/${ticketId}/events`, {
      headers: { 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' }
    }, env);
    expect(eventsRes.status).toBe(200);
    const evs = (await eventsRes.json() as any).data;
    expect(Array.isArray(evs)).toBe(true);
    expect(evs.length).toBeGreaterThan(0);
  });

  // --- NEW ADDITIONAL TARGETED FREEZE-CRITICAL TESTS (SECTIONS 2 - 25) ---

  it('direct SQL OPEN to RESOLVED is rejected', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await db.insert(equipmentAssets).values({
      id: 'a-sq1', outletId: 'ro-1001', assetCode: 'SQ-1', equipmentType: 'ATG', name: 'T1', createdBy: 'user-admin', createdAt: now, updatedAt: now
    }).run();
    await db.insert(equipmentBreakdownTickets).values({
      id: 't-sq1', outletId: 'ro-1001', equipmentAssetId: 'a-sq1', equipmentTypeSnapshot: 'ATG', equipmentLabelSnapshot: 'T1',
      priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', status: 'OPEN', breakdownAt: now, createdBy: 'user-admin', createdAt: now, updatedAt: now
    }).run();
    await expect(db.update(equipmentBreakdownTickets).set({
      status: 'RESOLVED', resolutionNotes: 'ok', resolvedAt: now, resolvedByUserId: 'user-admin', downtimeSeconds: 10
    }).where(eq(equipmentBreakdownTickets.id, 't-sq1')).run()).rejects.toThrow();
  });

  it('direct SQL OPEN to CLOSED is rejected', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await db.insert(equipmentAssets).values({
      id: 'a-sq2', outletId: 'ro-1001', assetCode: 'SQ-2', equipmentType: 'ATG', name: 'T2', createdBy: 'user-admin', createdAt: now, updatedAt: now
    }).run();
    await db.insert(equipmentBreakdownTickets).values({
      id: 't-sq2', outletId: 'ro-1001', equipmentAssetId: 'a-sq2', equipmentTypeSnapshot: 'ATG', equipmentLabelSnapshot: 'T2',
      priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', status: 'OPEN', breakdownAt: now, createdBy: 'user-admin', createdAt: now, updatedAt: now
    }).run();
    await expect(db.update(equipmentBreakdownTickets).set({
      status: 'CLOSED', resolutionNotes: 'ok', resolvedAt: now, resolvedByUserId: 'user-admin', downtimeSeconds: 10, signedOffAt: now, signedOffByUserId: 'user-admin'
    }).where(eq(equipmentBreakdownTickets.id, 't-sq2')).run()).rejects.toThrow();
  });

  it('direct SQL ASSIGNED to RESOLVED is rejected', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await db.insert(equipmentAssets).values({
      id: 'a-sq3', outletId: 'ro-1001', assetCode: 'SQ-3', equipmentType: 'ATG', name: 'T3', createdBy: 'user-admin', createdAt: now, updatedAt: now
    }).run();
    await db.insert(equipmentBreakdownTickets).values({
      id: 't-sq3', outletId: 'ro-1001', equipmentAssetId: 'a-sq3', equipmentTypeSnapshot: 'ATG', equipmentLabelSnapshot: 'T3',
      priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', status: 'ASSIGNED', breakdownAt: now, createdBy: 'user-admin', createdAt: now, updatedAt: now
    }).run();
    await expect(db.update(equipmentBreakdownTickets).set({
      status: 'RESOLVED', resolutionNotes: 'ok', resolvedAt: now, resolvedByUserId: 'user-admin', downtimeSeconds: 10
    }).where(eq(equipmentBreakdownTickets.id, 't-sq3')).run()).rejects.toThrow();
  });

  it('direct SQL ASSIGNED to CLOSED is rejected', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await db.insert(equipmentAssets).values({
      id: 'a-sq4', outletId: 'ro-1001', assetCode: 'SQ-4', equipmentType: 'ATG', name: 'T4', createdBy: 'user-admin', createdAt: now, updatedAt: now
    }).run();
    await db.insert(equipmentBreakdownTickets).values({
      id: 't-sq4', outletId: 'ro-1001', equipmentAssetId: 'a-sq4', equipmentTypeSnapshot: 'ATG', equipmentLabelSnapshot: 'T4',
      priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', status: 'ASSIGNED', breakdownAt: now, createdBy: 'user-admin', createdAt: now, updatedAt: now
    }).run();
    await expect(db.update(equipmentBreakdownTickets).set({
      status: 'CLOSED', resolutionNotes: 'ok', resolvedAt: now, resolvedByUserId: 'user-admin', downtimeSeconds: 10, signedOffAt: now, signedOffByUserId: 'user-admin'
    }).where(eq(equipmentBreakdownTickets.id, 't-sq4')).run()).rejects.toThrow();
  });

  it('direct SQL IN_PROGRESS to CLOSED is rejected', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await db.insert(equipmentAssets).values({
      id: 'a-sq5', outletId: 'ro-1001', assetCode: 'SQ-5', equipmentType: 'ATG', name: 'T5', createdBy: 'user-admin', createdAt: now, updatedAt: now
    }).run();
    await db.insert(equipmentBreakdownTickets).values({
      id: 't-sq5', outletId: 'ro-1001', equipmentAssetId: 'a-sq5', equipmentTypeSnapshot: 'ATG', equipmentLabelSnapshot: 'T5',
      priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', status: 'IN_PROGRESS', breakdownAt: now, createdBy: 'user-admin', createdAt: now, updatedAt: now
    }).run();
    await expect(db.update(equipmentBreakdownTickets).set({
      status: 'CLOSED', resolutionNotes: 'ok', resolvedAt: now, resolvedByUserId: 'user-admin', downtimeSeconds: 10, signedOffAt: now, signedOffByUserId: 'user-admin'
    }).where(eq(equipmentBreakdownTickets.id, 't-sq5')).run()).rejects.toThrow();
  });

  it('direct SQL CLOSED to OPEN is rejected', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await db.insert(equipmentAssets).values({
      id: 'a-sq6', outletId: 'ro-1001', assetCode: 'SQ-6', equipmentType: 'ATG', name: 'T6', createdBy: 'user-admin', createdAt: now, updatedAt: now
    }).run();
    await db.insert(equipmentBreakdownTickets).values({
      id: 't-sq6', outletId: 'ro-1001', equipmentAssetId: 'a-sq6', equipmentTypeSnapshot: 'ATG', equipmentLabelSnapshot: 'T6',
      priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', status: 'CLOSED', resolutionNotes: 'ok', resolvedAt: now, resolvedByUserId: 'user-admin', downtimeSeconds: 10, signedOffAt: now, signedOffByUserId: 'user-admin', breakdownAt: now, createdBy: 'user-admin', createdAt: now, updatedAt: now
    }).run();
    await expect(db.update(equipmentBreakdownTickets).set({
      status: 'OPEN'
    }).where(eq(equipmentBreakdownTickets.id, 't-sq6')).run()).rejects.toThrow();
  });

  it('direct SQL CANCELLED to OPEN is rejected', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await db.insert(equipmentAssets).values({
      id: 'a-sq7', outletId: 'ro-1001', assetCode: 'SQ-7', equipmentType: 'ATG', name: 'T7', createdBy: 'user-admin', createdAt: now, updatedAt: now
    }).run();
    await db.insert(equipmentBreakdownTickets).values({
      id: 't-sq7', outletId: 'ro-1001', equipmentAssetId: 'a-sq7', equipmentTypeSnapshot: 'ATG', equipmentLabelSnapshot: 'T7',
      priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', status: 'CANCELLED', cancelReason: 'Canceled', cancelledAt: now, cancelledByUserId: 'user-admin', breakdownAt: now, createdBy: 'user-admin', createdAt: now, updatedAt: now
    }).run();
    await expect(db.update(equipmentBreakdownTickets).set({
      status: 'OPEN'
    }).where(eq(equipmentBreakdownTickets.id, 't-sq7')).run()).rejects.toThrow();
  });

  it('outlet_id mutation rejected by immutable trigger', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await db.insert(equipmentAssets).values({ id: 'a-im1', outletId: 'ro-1001', assetCode: 'IM-1', equipmentType: 'ATG', name: 'IM1', createdBy: 'user-admin', createdAt: now, updatedAt: now }).run();
    await db.insert(equipmentBreakdownTickets).values({ id: 't-im1', outletId: 'ro-1001', equipmentAssetId: 'a-im1', equipmentTypeSnapshot: 'ATG', equipmentLabelSnapshot: 'IM1', priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', status: 'OPEN', breakdownAt: now, createdBy: 'user-admin', createdAt: now, updatedAt: now }).run();
    await expect(db.update(equipmentBreakdownTickets).set({ outletId: 'ro-1002' }).where(eq(equipmentBreakdownTickets.id, 't-im1')).run()).rejects.toThrow();
  });

  it('dispenser_id value to NULL rejected by immutable trigger', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await db.insert(equipmentBreakdownTickets).values({ id: 't-im2', outletId: 'ro-1001', dispenserId: 'disp-ro1-1', equipmentTypeSnapshot: 'DISPENSER', equipmentLabelSnapshot: 'Disp 1', priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', status: 'OPEN', breakdownAt: now, createdBy: 'user-admin', createdAt: now, updatedAt: now }).run();
    await expect(db.update(equipmentBreakdownTickets).set({ dispenserId: null }).where(eq(equipmentBreakdownTickets.id, 't-im2')).run()).rejects.toThrow();
  });

  it('dispenser_id NULL to value rejected by immutable trigger', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await db.insert(equipmentAssets).values({ id: 'a-im3', outletId: 'ro-1001', assetCode: 'IM-3', equipmentType: 'ATG', name: 'IM3', createdBy: 'user-admin', createdAt: now, updatedAt: now }).run();
    await db.insert(equipmentBreakdownTickets).values({ id: 't-im3', outletId: 'ro-1001', equipmentAssetId: 'a-im3', equipmentTypeSnapshot: 'ATG', equipmentLabelSnapshot: 'IM3', priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', status: 'OPEN', breakdownAt: now, createdBy: 'user-admin', createdAt: now, updatedAt: now }).run();
    await expect(db.update(equipmentBreakdownTickets).set({ dispenserId: 'disp-ro1-1' }).where(eq(equipmentBreakdownTickets.id, 't-im3')).run()).rejects.toThrow();
  });

  it('equipment_asset_id value to NULL rejected by immutable trigger', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await db.insert(equipmentAssets).values({ id: 'a-im4', outletId: 'ro-1001', assetCode: 'IM-4', equipmentType: 'ATG', name: 'IM4', createdBy: 'user-admin', createdAt: now, updatedAt: now }).run();
    await db.insert(equipmentBreakdownTickets).values({ id: 't-im4', outletId: 'ro-1001', equipmentAssetId: 'a-im4', equipmentTypeSnapshot: 'ATG', equipmentLabelSnapshot: 'IM4', priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', status: 'OPEN', breakdownAt: now, createdBy: 'user-admin', createdAt: now, updatedAt: now }).run();
    await expect(db.update(equipmentBreakdownTickets).set({ equipmentAssetId: null }).where(eq(equipmentBreakdownTickets.id, 't-im4')).run()).rejects.toThrow();
  });

  it('equipment_asset_id NULL to value rejected by immutable trigger', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await db.insert(equipmentAssets).values({ id: 'a-im5-ast', outletId: 'ro-1001', assetCode: 'IM-5', equipmentType: 'ATG', name: 'IM5', createdBy: 'user-admin', createdAt: now, updatedAt: now }).run();
    await db.insert(equipmentBreakdownTickets).values({ id: 't-im5', outletId: 'ro-1001', dispenserId: 'disp-ro1-1', equipmentTypeSnapshot: 'DISPENSER', equipmentLabelSnapshot: 'Disp 1', priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', status: 'OPEN', breakdownAt: now, createdBy: 'user-admin', createdAt: now, updatedAt: now }).run();
    await expect(db.update(equipmentBreakdownTickets).set({ equipmentAssetId: 'a-im5-ast' }).where(eq(equipmentBreakdownTickets.id, 't-im5')).run()).rejects.toThrow();
  });

  it('equipment_type_snapshot mutation rejected by immutable trigger', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await db.insert(equipmentBreakdownTickets).values({ id: 't-im6', outletId: 'ro-1001', dispenserId: 'disp-ro1-1', equipmentTypeSnapshot: 'DISPENSER', equipmentLabelSnapshot: 'Disp 1', priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', status: 'OPEN', breakdownAt: now, createdBy: 'user-admin', createdAt: now, updatedAt: now }).run();
    await expect(db.update(equipmentBreakdownTickets).set({ equipmentTypeSnapshot: 'ATG' }).where(eq(equipmentBreakdownTickets.id, 't-im6')).run()).rejects.toThrow();
  });

  it('equipment_label_snapshot mutation rejected by immutable trigger', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await db.insert(equipmentBreakdownTickets).values({ id: 't-im7', outletId: 'ro-1001', dispenserId: 'disp-ro1-1', equipmentTypeSnapshot: 'DISPENSER', equipmentLabelSnapshot: 'Disp 1', priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', status: 'OPEN', breakdownAt: now, createdBy: 'user-admin', createdAt: now, updatedAt: now }).run();
    await expect(db.update(equipmentBreakdownTickets).set({ equipmentLabelSnapshot: 'Changed' }).where(eq(equipmentBreakdownTickets.id, 't-im7')).run()).rejects.toThrow();
  });

  it('breakdown_at mutation rejected by immutable trigger', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await db.insert(equipmentBreakdownTickets).values({ id: 't-im8', outletId: 'ro-1001', dispenserId: 'disp-ro1-1', equipmentTypeSnapshot: 'DISPENSER', equipmentLabelSnapshot: 'Disp 1', priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', status: 'OPEN', breakdownAt: now, createdBy: 'user-admin', createdAt: now, updatedAt: now }).run();
    await expect(db.update(equipmentBreakdownTickets).set({ breakdownAt: '2025-01-01T00:00:00Z' }).where(eq(equipmentBreakdownTickets.id, 't-im8')).run()).rejects.toThrow();
  });

  it('direct UPDATE on equipment_breakdown_events rejected by immutable trigger', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await db.insert(equipmentBreakdownTickets).values({ id: 't-ev1', outletId: 'ro-1001', dispenserId: 'disp-ro1-1', equipmentTypeSnapshot: 'DISPENSER', equipmentLabelSnapshot: 'Disp 1', priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', status: 'OPEN', breakdownAt: now, createdBy: 'user-admin', createdAt: now, updatedAt: now }).run();
    await db.insert(equipmentBreakdownEvents).values({ id: 'ev-1', ticketId: 't-ev1', eventType: 'CREATED', fromStatus: null, toStatus: 'OPEN', actorUserId: 'user-admin', createdAt: now }).run();
    await expect(db.update(equipmentBreakdownEvents).set({ notes: 'hack' }).where(eq(equipmentBreakdownEvents.id, 'ev-1')).run()).rejects.toThrow();
  });

  it('direct DELETE on equipment_breakdown_events rejected by immutable trigger', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await db.insert(equipmentBreakdownTickets).values({ id: 't-ev2', outletId: 'ro-1001', dispenserId: 'disp-ro1-1', equipmentTypeSnapshot: 'DISPENSER', equipmentLabelSnapshot: 'Disp 1', priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', status: 'OPEN', breakdownAt: now, createdBy: 'user-admin', createdAt: now, updatedAt: now }).run();
    await db.insert(equipmentBreakdownEvents).values({ id: 'ev-2', ticketId: 't-ev2', eventType: 'CREATED', fromStatus: null, toStatus: 'OPEN', actorUserId: 'user-admin', createdAt: now }).run();
    await expect(db.delete(equipmentBreakdownEvents).where(eq(equipmentBreakdownEvents.id, 'ev-2')).run()).rejects.toThrow();
  });

  it('invalid ticket priority rejected directly by DB', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await expect(db.insert(equipmentBreakdownTickets).values({
      id: 't-bp', outletId: 'ro-1001', dispenserId: 'disp-ro1-1', equipmentTypeSnapshot: 'DISPENSER', equipmentLabelSnapshot: 'Disp 1',
      priority: 'INVALID' as any, failureCategory: 'MECHANICAL', description: 'Test', status: 'OPEN', breakdownAt: now, createdBy: 'user-admin', createdAt: now, updatedAt: now
    }).run()).rejects.toThrow();
  });

  it('invalid failure_category rejected directly by DB', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await expect(db.insert(equipmentBreakdownTickets).values({
      id: 't-fc', outletId: 'ro-1001', dispenserId: 'disp-ro1-1', equipmentTypeSnapshot: 'DISPENSER', equipmentLabelSnapshot: 'Disp 1',
      priority: 'HIGH', failureCategory: 'INVALID' as any, description: 'Test', status: 'OPEN', breakdownAt: now, createdBy: 'user-admin', createdAt: now, updatedAt: now
    }).run()).rejects.toThrow();
  });

  it('invalid ticket status rejected directly by DB', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await expect(db.insert(equipmentBreakdownTickets).values({
      id: 't-st', outletId: 'ro-1001', dispenserId: 'disp-ro1-1', equipmentTypeSnapshot: 'DISPENSER', equipmentLabelSnapshot: 'Disp 1',
      priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', status: 'INVALID' as any, breakdownAt: now, createdBy: 'user-admin', createdAt: now, updatedAt: now
    }).run()).rejects.toThrow();
  });

  it('negative downtime_seconds rejected directly by DB', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await expect(db.insert(equipmentBreakdownTickets).values({
      id: 't-dt', outletId: 'ro-1001', dispenserId: 'disp-ro1-1', equipmentTypeSnapshot: 'DISPENSER', equipmentLabelSnapshot: 'Disp 1',
      priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', status: 'RESOLVED',
      resolutionNotes: 'Fixed', resolvedAt: now, resolvedByUserId: 'user-admin', downtimeSeconds: -5,
      breakdownAt: now, createdBy: 'user-admin', createdAt: now, updatedAt: now
    }).run()).rejects.toThrow();
  });

  it('invalid equipment event_type rejected directly by DB', async () => {
    const db = getDb(localD1);
    const now = new Date().toISOString();
    await db.insert(equipmentBreakdownTickets).values({ id: 't-et', outletId: 'ro-1001', dispenserId: 'disp-ro1-1', equipmentTypeSnapshot: 'DISPENSER', equipmentLabelSnapshot: 'Disp 1', priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', status: 'OPEN', breakdownAt: now, createdBy: 'user-admin', createdAt: now, updatedAt: now }).run();
    await expect(db.insert(equipmentBreakdownEvents).values({
      id: 'ev-bad', ticketId: 't-et', eventType: 'INVALID' as any, actorUserId: 'user-admin', createdAt: now
    }).run()).rejects.toThrow();
  });

  it('CSP can read own-outlet equipment assets', async () => {
    const cspCookie = await loginAs('csp.parkstreet@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      headers: { 'Cookie': cspCookie, 'Origin': 'http://localhost:3000' }
    }, env);
    expect(res.status).toBe(200);
  });

  it('CSP can create auxiliary asset in own outlet', async () => {
    const cspCookie = await loginAs('csp.parkstreet@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cspCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'CSP-ATG-1', equipmentType: 'ATG', name: 'CSP Tank' })
    }, env);
    expect(res.status).toBe(201);
  });

  it('CSP can create ticket in own outlet', async () => {
    const cspCookie = await loginAs('csp.parkstreet@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cspCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ dispenserId: 'disp-ro1-1', priority: 'MEDIUM', failureCategory: 'MECHANICAL', description: 'CSP ticket', breakdownAt: '2026-10-01T08:00:00Z' })
    }, env);
    expect(res.status).toBe(201);
  });

  it('CSP cannot assign ticket', async () => {
    const cspCookie = await loginAs('csp.parkstreet@iocl.in');
    const res = await app.request('/api/v1/equipment/tickets/nonexistent/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cspCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ technicianName: 'Tech' })
    }, env);
    expect(res.status).toBe(403);
  });

  it('CSP cannot resolve ticket', async () => {
    const cspCookie = await loginAs('csp.parkstreet@iocl.in');
    const res = await app.request('/api/v1/equipment/tickets/nonexistent/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cspCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ resolutionNotes: 'Fixed', resolvedAt: '2026-10-01T10:00:00Z' })
    }, env);
    expect(res.status).toBe(403);
  });

  it('CSP cannot signoff ticket', async () => {
    const cspCookie = await loginAs('csp.parkstreet@iocl.in');
    const res = await app.request('/api/v1/equipment/tickets/nonexistent/signoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cspCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ signoffNotes: 'OK' })
    }, env);
    expect(res.status).toBe(403);
  });

  it('Field Officer can assign scoped equipment ticket', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const foCookie = await loginAs('fo.central@iocl.in');
    const createRes = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ dispenserId: 'disp-ro1-1', priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', breakdownAt: '2026-10-01T08:00:00Z' })
    }, env);
    const ticketId = (await createRes.json() as any).data.id;

    const assignRes = await app.request(`/api/v1/equipment/tickets/${ticketId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': foCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ technicianName: 'Tech Alex' })
    }, env);
    expect(assignRes.status).toBe(200);
    expect((await assignRes.json() as any).data.status).toBe('ASSIGNED');
  });

  it('Field Officer can start scoped equipment ticket', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const foCookie = await loginAs('fo.central@iocl.in');
    const createRes = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ dispenserId: 'disp-ro1-1', priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', breakdownAt: '2026-10-01T08:00:00Z' })
    }, env);
    const ticketId = (await createRes.json() as any).data.id;
    await app.request(`/api/v1/equipment/tickets/${ticketId}/assign`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': foCookie, 'Origin': 'http://localhost:3000' }, body: JSON.stringify({ technicianName: 'Tech Alex' })
    }, env);

    const startRes = await app.request(`/api/v1/equipment/tickets/${ticketId}/start`, {
      method: 'POST', headers: { 'Cookie': foCookie, 'Origin': 'http://localhost:3000' }
    }, env);
    expect(startRes.status).toBe(200);
    expect((await startRes.json() as any).data.status).toBe('IN_PROGRESS');
  });

  it('Field Officer can resolve scoped equipment ticket', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const foCookie = await loginAs('fo.central@iocl.in');
    const createRes = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ dispenserId: 'disp-ro1-1', priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', breakdownAt: '2026-10-01T08:00:00Z' })
    }, env);
    const ticketId = (await createRes.json() as any).data.id;
    await app.request(`/api/v1/equipment/tickets/${ticketId}/assign`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': foCookie, 'Origin': 'http://localhost:3000' }, body: JSON.stringify({ technicianName: 'Tech Alex' })
    }, env);
    await app.request(`/api/v1/equipment/tickets/${ticketId}/start`, {
      method: 'POST', headers: { 'Cookie': foCookie, 'Origin': 'http://localhost:3000' }
    }, env);

    const resolveRes = await app.request(`/api/v1/equipment/tickets/${ticketId}/resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': foCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ resolutionNotes: 'Resolved', resolvedAt: '2026-10-01T09:00:00Z' })
    }, env);
    expect(resolveRes.status).toBe(200);
    expect((await resolveRes.json() as any).data.status).toBe('RESOLVED');
  });

  it('Field Officer can signoff scoped equipment ticket', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const foCookie = await loginAs('fo.central@iocl.in');
    const createRes = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ dispenserId: 'disp-ro1-1', priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', breakdownAt: '2026-10-01T08:00:00Z' })
    }, env);
    const ticketId = (await createRes.json() as any).data.id;
    await app.request(`/api/v1/equipment/tickets/${ticketId}/assign`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': foCookie, 'Origin': 'http://localhost:3000' }, body: JSON.stringify({ technicianName: 'Tech Alex' })
    }, env);
    await app.request(`/api/v1/equipment/tickets/${ticketId}/start`, {
      method: 'POST', headers: { 'Cookie': foCookie, 'Origin': 'http://localhost:3000' }
    }, env);
    await app.request(`/api/v1/equipment/tickets/${ticketId}/resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': foCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ resolutionNotes: 'Resolved', resolvedAt: '2026-10-01T09:00:00Z' })
    }, env);

    const signoffRes = await app.request(`/api/v1/equipment/tickets/${ticketId}/signoff`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': foCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ signoffNotes: 'Verified OK' })
    }, env);
    expect(signoffRes.status).toBe(200);
    expect((await signoffRes.json() as any).data.status).toBe('CLOSED');
  });

  it('cross-outlet asset PUT returns 403', async () => {
    const adminCookie = await loginAs('admin@iocl.in');
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const createRes = await app.request('/api/v1/outlets/ro-1002/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'RO2-AST', equipmentType: 'ATG', name: 'RO2 Tank' })
    }, env);
    const assetId = (await createRes.json() as any).data.id;

    const res = await app.request(`/api/v1/equipment/assets/${assetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ name: 'Hacked' })
    }, env);
    expect(res.status).toBe(403);
  });

  it('cross-outlet ticket detail GET returns 403 when out of scope', async () => {
    const adminCookie = await loginAs('admin@iocl.in');
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const uniqueCode = `RO2-AST-${Date.now()}`;
    const createRes = await app.request('/api/v1/outlets/ro-1002/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: uniqueCode, equipmentType: 'ATG', name: 'RO2 Tank 2' })
    }, env);
    const assetId = (await createRes.json() as any).data.id;

    // Create a ticket for that asset
    const ticketRes = await app.request('/api/v1/outlets/ro-1002/equipment/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ equipmentAssetId: assetId, priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'RO2 ticket', breakdownAt: '2026-10-01T08:00:00Z' })
    }, env);
    const ticketId = (await ticketRes.json() as any).data.id;

    const res = await app.request(`/api/v1/equipment/tickets/${ticketId}`, {
      headers: { 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' }
    }, env);
    expect(res.status).toBe(403);
  });

  it('duplicate auxiliary equipment serial number in same outlet returns 409 EQUIPMENT_ASSET_SERIAL_EXISTS', async () => {
    const cookie = await loginAs('admin@iocl.in');
    await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'SER-1', equipmentType: 'ATG', name: 'Tank 1', serialNumber: 'SN-12345' })
    }, env);

    const dupRes = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'SER-2', equipmentType: 'ATG', name: 'Tank 2', serialNumber: 'SN-12345' })
    }, env);
    expect(dupRes.status).toBe(409);
    expect((await dupRes.json() as any).error.code).toBe('EQUIPMENT_ASSET_SERIAL_EXISTS');
  });

  it('asset update with assetCode rejected with 400', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const createRes = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'UP-2', equipmentType: 'ATG', name: 'Asset' })
    }, env);
    const assetId = (await createRes.json() as any).data.id;

    const updRes = await app.request(`/api/v1/equipment/assets/${assetId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'CHANGED' })
    }, env);
    expect(updRes.status).toBe(400);
  });

  it('asset update with equipmentType rejected with 400', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const createRes = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'UP-3', equipmentType: 'ATG', name: 'Asset' })
    }, env);
    const assetId = (await createRes.json() as any).data.id;

    const updRes = await app.request(`/api/v1/equipment/assets/${assetId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ equipmentType: 'DG_SET' })
    }, env);
    expect(updRes.status).toBe(400);
  });

  it('asset update with outletId rejected with 400', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const createRes = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'UP-4', equipmentType: 'ATG', name: 'Asset' })
    }, env);
    const assetId = (await createRes.json() as any).data.id;

    const updRes = await app.request(`/api/v1/equipment/assets/${assetId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ outletId: 'ro-1002' })
    }, env);
    expect(updRes.status).toBe(400);
  });

  it('asset update with unknown field rejected with 400', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const createRes = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ assetCode: 'UP-5', equipmentType: 'ATG', name: 'Asset' })
    }, env);
    const assetId = (await createRes.json() as any).data.id;

    const updRes = await app.request(`/api/v1/equipment/assets/${assetId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ unknownField: 'hack' })
    }, env);
    expect(updRes.status).toBe(400);
  });

  it('both dispenserId and equipmentAssetId provided on ticket create rejected with 400', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ dispenserId: 'disp-ro1-1', equipmentAssetId: 'some-asset', priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', breakdownAt: '2026-10-01T08:00:00Z' })
    }, env);
    expect(res.status).toBe(400);
  });

  it('neither dispenserId nor equipmentAssetId provided on ticket create rejected with 400', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', breakdownAt: '2026-10-01T08:00:00Z' })
    }, env);
    expect(res.status).toBe(400);
  });

  it('timezone-less breakdownAt rejected with 400', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ dispenserId: 'disp-ro1-1', priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', breakdownAt: '2026-10-01 08:00:00' })
    }, env);
    expect(res.status).toBe(400);
  });

  it('OPEN to start returns 409 INVALID_EQUIPMENT_TICKET_TRANSITION', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const foCookie = await loginAs('fo.central@iocl.in');
    const createRes = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ dispenserId: 'disp-ro1-1', priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', breakdownAt: '2026-10-01T08:00:00Z' })
    }, env);
    const ticketId = (await createRes.json() as any).data.id;

    const startRes = await app.request(`/api/v1/equipment/tickets/${ticketId}/start`, {
      method: 'POST', headers: { 'Cookie': foCookie, 'Origin': 'http://localhost:3000' }
    }, env);
    expect(startRes.status).toBe(409);
    expect((await startRes.json() as any).error.code).toBe('INVALID_EQUIPMENT_TICKET_TRANSITION');
  });

  it('ASSIGNED to resolve returns 409', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const foCookie = await loginAs('fo.central@iocl.in');
    const createRes = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ dispenserId: 'disp-ro1-1', priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', breakdownAt: '2026-10-01T08:00:00Z' })
    }, env);
    const ticketId = (await createRes.json() as any).data.id;
    await app.request(`/api/v1/equipment/tickets/${ticketId}/assign`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': foCookie, 'Origin': 'http://localhost:3000' }, body: JSON.stringify({ technicianName: 'Tech' })
    }, env);

    const resolveRes = await app.request(`/api/v1/equipment/tickets/${ticketId}/resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': foCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ resolutionNotes: 'Done', resolvedAt: '2026-10-01T10:00:00Z' })
    }, env);
    expect(resolveRes.status).toBe(409);
  });

  it('failed ticket transition does not append an equipment event', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const foCookie = await loginAs('fo.central@iocl.in');
    const createRes = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ dispenserId: 'disp-ro1-1', priority: 'HIGH', failureCategory: 'MECHANICAL', description: 'Test', breakdownAt: '2026-10-01T08:00:00Z' })
    }, env);
    const ticketId = (await createRes.json() as any).data.id;

    const eventsBefore = await (await app.request(`/api/v1/equipment/tickets/${ticketId}/events`, { headers: { 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' } }, env)).json() as any;

    await app.request(`/api/v1/equipment/tickets/${ticketId}/start`, {
      method: 'POST', headers: { 'Cookie': foCookie, 'Origin': 'http://localhost:3000' }
    }, env);

    const eventsAfter = await (await app.request(`/api/v1/equipment/tickets/${ticketId}/events`, { headers: { 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' } }, env)).json() as any;
    expect(eventsAfter.data.length).toBe(eventsBefore.data.length);
  });
});
