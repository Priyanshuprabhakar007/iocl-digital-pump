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
    })).rejects.toThrow();
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
    })).rejects.toThrow();
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
    })).rejects.toThrow();
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
    })).rejects.toThrow();
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
    });
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
    });
    await expect(db.update(equipmentBreakdownTickets).set({
      status: 'RESOLVED',
    }).where(eq(equipmentBreakdownTickets.id, 't-res'))).rejects.toThrow();
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
    });
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
    });
    await expect(db.update(equipmentBreakdownTickets).set({
      status: 'CLOSED',
    }).where(eq(equipmentBreakdownTickets.id, 't-close'))).rejects.toThrow();
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
});
