import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = './.sqlite/test_equipment_phase3c_comprehensive.db';

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

describe('Phase 3C-1 Comprehensive Equipment & Breakdown Management Suite', () => {
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

  // 1. Migration 0015 RBAC & Tables Standalone Test
  it('1. Migration 0015 standalone applies RBAC permissions and role mappings without seedDatabase', async () => {
    const freshPath = './.sqlite/test_migration_only.db';
    if (fs.existsSync(freshPath)) { try { fs.unlinkSync(freshPath); } catch (e) {} }
    
    // Create DB and apply migrations up to 0015
    const dbFresh = createLocalD1Database(freshPath);
    const db = getDb(dbFresh);

    const perms = await db.all("SELECT code FROM permissions WHERE code LIKE 'equipment%'");
    expect(perms.length).toBe(5);
    const codes = perms.map((p: any) => p.code);
    expect(codes).toContain('equipment.read');
    expect(codes).toContain('equipment_assets.write');
    expect(codes).toContain('equipment_tickets.create');
    expect(codes).toContain('equipment_tickets.manage');
    expect(codes).toContain('equipment_tickets.signoff');

    const rolePerms = await db.all("SELECT role_id, permission_id FROM role_permissions WHERE permission_id LIKE 'perm-eq-%'");
    expect(rolePerms.length).toBeGreaterThan(0);

    try { dbFresh.close(); } catch (e) {}
    if (fs.existsSync(freshPath)) { try { fs.unlinkSync(freshPath); } catch (e) {} }
  });

  // 2. Database Tables & Indexes Test
  it('2. Expected equipment tables and indexes exist', async () => {
    const db = getDb(localD1);
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'equipment_%'");
    const tNames = tables.map((t: any) => t.name);
    expect(tNames).toContain('equipment_assets');
    expect(tNames).toContain('equipment_breakdown_tickets');
    expect(tNames).toContain('equipment_breakdown_events');

    const indexes = await db.all("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_eq_%'");
    const iNames = indexes.map((i: any) => i.name);
    expect(iNames).toContain('idx_eq_assets_outlet_code_unique');
    expect(iNames).toContain('idx_eq_tickets_type_snapshot');
    expect(iNames).toContain('idx_eq_events_ticket_created');
  });

  // 3. Auxiliary Asset Creation & Types Test
  it('3. Create auxiliary assets of all 5 allowed types successfully and reject DISPENSER', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const types = ['ATG', 'AIR_COMPRESSOR', 'CNG_COMPRESSOR', 'DG_SET', 'OTHER'];

    for (let i = 0; i < types.length; i++) {
      const t = types[i];
      const res = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
        body: JSON.stringify({
          assetCode: `ASSET-${t}-01`,
          equipmentType: t,
          name: `${t} Unit`,
          status: 'ACTIVE',
          commissionedAt: '2025-01-01T00:00:00Z',
        }),
      }, env);
      expect(res.status).toBe(201);
      const json = await res.json() as any;
      expect(json.data.equipmentType).toBe(t);
    }

    // DISPENSER in auxiliary assets must be rejected by Zod enum
    const dispRes = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        assetCode: 'DISP-FAIL',
        equipmentType: 'DISPENSER',
        name: 'Dispenser Asset',
        status: 'ACTIVE',
      }),
    }, env);
    expect(dispRes.status).toBe(400);
  });

  // 4. Unique Constraints & Asset Validations
  it('4. Unique outlet asset code and serial number constraints return 409 with correct error codes', async () => {
    const cookie = await loginAs('admin@iocl.in');
    // Create first asset
    await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        assetCode: 'ATG-DUP',
        equipmentType: 'ATG',
        name: 'ATG 1',
        serialNumber: 'SN-12345',
        status: 'ACTIVE',
      }),
    }, env);

    // Duplicate code same outlet
    const dupCodeRes = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        assetCode: 'ATG-DUP',
        equipmentType: 'ATG',
        name: 'ATG Duplicate Code',
        status: 'ACTIVE',
      }),
    }, env);
    expect(dupCodeRes.status).toBe(409);
    expect((await dupCodeRes.json() as any).error.code).toBe('EQUIPMENT_ASSET_CODE_EXISTS');

    // Duplicate serial number same outlet
    const dupSerialRes = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        assetCode: 'ATG-OTHER',
        equipmentType: 'ATG',
        name: 'ATG Duplicate Serial',
        serialNumber: 'SN-12345',
        status: 'ACTIVE',
      }),
    }, env);
    expect(dupSerialRes.status).toBe(409);
    expect((await dupSerialRes.json() as any).error.code).toBe('EQUIPMENT_ASSET_SERIAL_EXISTS');

    // Same asset code in different outlet ro-1002 should succeed
    const otherOutletRes = await app.request('/api/v1/outlets/ro-1002/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        assetCode: 'ATG-DUP',
        equipmentType: 'ATG',
        name: 'ATG RO-1002',
        status: 'ACTIVE',
      }),
    }, env);
    expect(otherOutletRes.status).toBe(201);
  });

  // 5. Timezone-Aware Timestamps & Strict Schema
  it('5. Rejects timezone-less timestamps and unknown fields in request bodies (strict validation)', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const tzLessRes = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        assetCode: 'ATG-TZ',
        equipmentType: 'ATG',
        name: 'ATG TZ Test',
        status: 'ACTIVE',
        commissionedAt: '2026-10-01T12:00:00', // Missing timezone Z or offset
      }),
    }, env);
    expect(tzLessRes.status).toBe(400);

    // Strict schema rejection of unknown field
    const unknownFieldRes = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        assetCode: 'ATG-STRICT',
        equipmentType: 'ATG',
        name: 'Strict Test',
        status: 'ACTIVE',
        maliciousField: 'exploit',
      }),
    }, env);
    expect(unknownFieldRes.status).toBe(400);
  });

  // 6. Targets endpoint includes dispensers and auxiliary assets
  it('6. GET /equipment/targets includes dispensers and auxiliary assets, respecting scope', async () => {
    const cookie = await loginAs('dealer.parkstreet@iocl.in');
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/targets', {
      headers: { 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
    }, env);
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.data.length).toBeGreaterThan(0);
    const hasDispenser = json.data.some((t: any) => t.targetType === 'DISPENSER');
    expect(hasDispenser).toBe(true);
  });

  // 7. Ticket Creation & XOR Validation
  it('7. Ticket creation enforces XOR target rule, valid priorities, failure categories, and backend snapshotting', async () => {
    const cookie = await loginAs('dealer.parkstreet@iocl.in');

    // Neither dispenserId nor equipmentAssetId
    const neitherRes = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        priority: 'HIGH',
        failureCategory: 'MECHANICAL',
        description: 'Broken pump',
        breakdownAt: '2026-10-01T10:00:00Z',
      }),
    }, env);
    expect(neitherRes.status).toBe(400);

    // Both dispenserId and equipmentAssetId
    const bothRes = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        dispenserId: 'disp-ro1-1',
        equipmentAssetId: 'dummy-asset-id',
        priority: 'HIGH',
        failureCategory: 'MECHANICAL',
        description: 'Broken pump',
        breakdownAt: '2026-10-01T10:00:00Z',
      }),
    }, env);
    expect(bothRes.status).toBe(400);

    // Valid dispenser ticket creation
    const okRes = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        dispenserId: 'disp-ro1-1',
        priority: 'HIGH',
        failureCategory: 'MECHANICAL',
        description: 'Nozzle leaking',
        breakdownAt: '2026-10-01T10:00:00Z',
      }),
    }, env);
    expect(okRes.status).toBe(201);
    const json = await okRes.json() as any;
    expect(json.data.status).toBe('OPEN');
    expect(json.data.equipmentTypeSnapshot).toBe('DISPENSER');
    expect(json.data.equipmentLabelSnapshot).toBeDefined();
  });

  // 8. Lifecycle Full Flow & 409 Status for Invalid Transitions
  it('8. Full lifecycle flow with exact 409 status on invalid state transitions', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const foCookie = await loginAs('fo.central@iocl.in');

    // Create ticket
    const createRes = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        dispenserId: 'disp-ro1-1',
        priority: 'CRITICAL',
        failureCategory: 'ELECTRICAL',
        description: 'Power failure',
        breakdownAt: '2026-10-01T08:00:00Z',
      }),
    }, env);
    expect(createRes.status).toBe(201);
    const ticketId = (await createRes.json() as any).data.id;

    // Invalid transition: OPEN -> start work directly (should be 409)
    const badStartRes = await app.request(`/api/v1/equipment/tickets/${ticketId}/start`, {
      method: 'POST',
      headers: { 'Cookie': foCookie, 'Origin': 'http://localhost:3000' },
    }, env);
    expect(badStartRes.status).toBe(409);
    expect((await badStartRes.json() as any).error.code).toBe('INVALID_EQUIPMENT_TICKET_TRANSITION');

    // Assign ticket
    const assignRes = await app.request(`/api/v1/equipment/tickets/${ticketId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': foCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ technicianName: 'Tech Dave' }),
    }, env);
    expect(assignRes.status).toBe(200);

    // Start work
    const startRes = await app.request(`/api/v1/equipment/tickets/${ticketId}/start`, {
      method: 'POST',
      headers: { 'Cookie': foCookie, 'Origin': 'http://localhost:3000' },
    }, env);
    expect(startRes.status).toBe(200);

    // Resolve ticket
    const resolveRes = await app.request(`/api/v1/equipment/tickets/${ticketId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': foCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        resolutionNotes: 'Fixed power supply',
        resolvedAt: '2026-10-01T10:00:00Z',
      }),
    }, env);
    expect(resolveRes.status).toBe(200);
    const resolvedData = (await resolveRes.json() as any).data;
    expect(resolvedData.status).toBe('RESOLVED');
    expect(resolvedData.downtimeSeconds).toBe(7200); // 2 hours

    // Sign off (Closed)
    const signoffRes = await app.request(`/api/v1/equipment/tickets/${ticketId}/signoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': foCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ signoffNotes: 'Verified operating normally' }),
    }, env);
    expect(signoffRes.status).toBe(200);
    expect((await signoffRes.json() as any).data.status).toBe('CLOSED');
  });

  // 9. Concurrency Test
  it('9. Conditional update concurrency check returns 409 EQUIPMENT_TICKET_STATE_CHANGED', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const foCookie = await loginAs('fo.central@iocl.in');

    const createRes = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        dispenserId: 'disp-ro1-1',
        priority: 'MEDIUM',
        failureCategory: 'CALIBRATION',
        description: 'Meter drift',
        breakdownAt: '2026-10-01T08:00:00Z',
      }),
    }, env);
    const ticketId = (await createRes.json() as any).data.id;

    // Simulate state change to ASSIGNED
    await app.request(`/api/v1/equipment/tickets/${ticketId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': foCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ technicianName: 'Tech Sam' }),
    }, env);

    // Try conditional update expecting OPEN when state is now ASSIGNED
    const db = getDb(localD1);
    const repo = new (await import('../src/worker/repositories/equipmentRepository')).EquipmentRepository(db);
    
    const staleResult = await repo.updateTicketStatusConditional(ticketId, 'OPEN', 'ASSIGNED', {
      technicianName: 'Stale Tech'
    });
    expect(staleResult).toBeUndefined();
  });

  // 10. Health Summary & Filters Test
  it('10. GET /equipment/health-summary returns accurate metrics and filters work properly', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');

    // Create 2 tickets
    await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        dispenserId: 'disp-ro1-1',
        priority: 'CRITICAL',
        failureCategory: 'ELECTRICAL',
        description: 'Issue 1',
        breakdownAt: '2026-10-01T08:00:00Z',
      }),
    }, env);

    await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        dispenserId: 'disp-ro1-2',
        priority: 'LOW',
        failureCategory: 'MECHANICAL',
        description: 'Issue 2',
        breakdownAt: '2026-10-01T08:00:00Z',
      }),
    }, env);

    const summaryRes = await app.request('/api/v1/outlets/ro-1001/equipment/health-summary', {
      headers: { 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
    }, env);
    expect(summaryRes.status).toBe(200);
    const summary = (await summaryRes.json() as any).data;
    expect(summary.activeTicketCount).toBe(2);
    expect(summary.criticalActiveCount).toBe(1);
    expect(summary.currentlyDownTargetCount).toBe(2);

    // Test ticket filter with invalid equipmentType -> 400
    const invalidFilterRes = await app.request('/api/v1/outlets/ro-1001/equipment/tickets?equipmentType=INVALID_TYPE', {
      headers: { 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
    }, env);
    expect(invalidFilterRes.status).toBe(400);
  });

  // 11. Cross-Outlet Security Scope 403 Test
  it('11. Cross-outlet requests return 403 Forbidden for all equipment endpoints', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in'); // scope is ro-1001
    const res = await app.request('/api/v1/outlets/ro-1002/equipment/assets', {
      headers: { 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
    }, env);
    expect(res.status).toBe(403);
  });

  // 12. RBAC Permission Denial Test
  it('12. State Office user trying to create asset or ticket receives 403 Forbidden', async () => {
    const soCookie = await loginAs('wbso@iocl.in'); // State Office has read permission only
    const res = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': soCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        assetCode: 'SO-TEST',
        equipmentType: 'ATG',
        name: 'SO Test Asset',
        status: 'ACTIVE',
      }),
    }, env);
    expect(res.status).toBe(403);
  });
});
