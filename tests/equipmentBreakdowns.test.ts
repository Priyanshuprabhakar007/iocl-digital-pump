import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import fs from 'fs';

const TEST_DB_PATH = './.sqlite/test_equipment_phase3c.db';

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

describe('Phase 3C-1 Equipment & Breakdown Management Suite', () => {
  let localD1: any;
  let env: any;

  beforeEach(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      try { fs.unlinkSync(TEST_DB_PATH); } catch (e) {}
    }
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
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000',
      },
      body: JSON.stringify({ email, password: pass }),
    }, env);
    
    const setCookie = res.headers.get('set-cookie');
    const cookie = setCookie ? setCookie.split(';')[0] : '';
    return cookie;
  }

  it('1. Migration 0015 creates all three equipment tables', async () => {
    const db = getDb(localD1);
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'equipment_%'");
    const tableNames = tables.map((t: any) => t.name);
    expect(tableNames).toContain('equipment_assets');
    expect(tableNames).toContain('equipment_breakdown_tickets');
    expect(tableNames).toContain('equipment_breakdown_events');
  });

  it('12. Create ATG auxiliary asset', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie,
        'Origin': 'http://localhost:3000',
      },
      body: JSON.stringify({
        assetCode: 'ATG-01',
        equipmentType: 'ATG',
        name: 'ATG Tank 1',
        status: 'ACTIVE',
      }),
    }, env);

    expect(res.status).toBe(201);
    const json = await res.json() as any;
    expect(json.data.assetCode).toBe('ATG-01');
    expect(json.data.equipmentType).toBe('ATG');
  });

  it('28. Create dispenser breakdown ticket and check event/audit', async () => {
    const cookie = await loginAs('dealer.parkstreet@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie,
        'Origin': 'http://localhost:3000',
      },
      body: JSON.stringify({
        dispenserId: 'disp-ro1-1',
        priority: 'HIGH',
        failureCategory: 'MECHANICAL',
        description: 'Nozzle 1 flow rate low',
        breakdownAt: new Date().toISOString(),
      }),
    }, env);

    expect(res.status).toBe(201);
    const json = await res.json() as any;
    expect(json.data.status).toBe('OPEN');
    expect(json.data.equipmentTypeSnapshot).toBe('DISPENSER');

    const ticketId = json.data.id;

    // Check events
    const evRes = await app.request(`/api/v1/equipment/tickets/${ticketId}/events`, {
      headers: {
        'Cookie': cookie,
        'Origin': 'http://localhost:3000',
      },
    }, env);
    expect(evRes.status).toBe(200);
    const evJson = await evRes.json() as any;
    expect(evJson.data.length).toBe(1);
    expect(evJson.data[0].eventType).toBe('CREATED');
  });

  it('46. Full lifecycle: OPEN -> ASSIGNED -> IN_PROGRESS -> RESOLVED -> CLOSED', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const foCookie = await loginAs('fo.central@iocl.in');

    // Create ticket as dealer
    const createRes = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': dealerCookie,
        'Origin': 'http://localhost:3000',
      },
      body: JSON.stringify({
        dispenserId: 'disp-ro1-1',
        priority: 'CRITICAL',
        failureCategory: 'ELECTRICAL',
        description: 'Display failure',
        breakdownAt: new Date().toISOString(),
      }),
    }, env);

    expect(createRes.status).toBe(201);
    const ticketId = (await createRes.json() as any).data.id;

    // Assign as FO (Field Officer has manage permission)
    const assignRes = await app.request(`/api/v1/equipment/tickets/${ticketId}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': foCookie,
        'Origin': 'http://localhost:3000',
      },
      body: JSON.stringify({
        technicianName: 'John Doe',
        technicianPhone: '9876543210',
      }),
    }, env);
    expect(assignRes.status).toBe(200);
    expect((await assignRes.json() as any).data.status).toBe('ASSIGNED');

    // Start work
    const startRes = await app.request(`/api/v1/equipment/tickets/${ticketId}/start`, {
      method: 'POST',
      headers: {
        'Cookie': foCookie,
        'Origin': 'http://localhost:3000',
      },
    }, env);
    expect(startRes.status).toBe(200);
    expect((await startRes.json() as any).data.status).toBe('IN_PROGRESS');

    // Resolve
    const resolveRes = await app.request(`/api/v1/equipment/tickets/${ticketId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': foCookie,
        'Origin': 'http://localhost:3000',
      },
      body: JSON.stringify({
        resolutionNotes: 'Replaced display cable',
      }),
    }, env);
    expect(resolveRes.status).toBe(200);
    const resolvedData = (await resolveRes.json() as any).data;
    expect(resolvedData.status).toBe('RESOLVED');
    expect(resolvedData.downtimeSeconds).not.toBeNull();

    // Sign off (Closed) - FO has signoff permission
    const signoffRes = await app.request(`/api/v1/equipment/tickets/${ticketId}/signoff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': foCookie,
        'Origin': 'http://localhost:3000',
      },
      body: JSON.stringify({
        signoffNotes: 'Tested and verified working',
      }),
    }, env);
    expect(signoffRes.status).toBe(200);
    expect((await signoffRes.json() as any).data.status).toBe('CLOSED');
  });

  it('10. Cross-outlet read returns 403', async () => {
    // Dealer of Park Street (ro-1001) trying to read or create for another outlet
    const cookie = await loginAs('dealer.parkstreet@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1002/equipment/assets', {
      headers: {
        'Cookie': cookie,
        'Origin': 'http://localhost:3000',
      },
    }, env);
    expect(res.status).toBe(403);
  });
});
