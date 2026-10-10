import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import fs from 'fs';

describe('Phase 2A Org Masters Suite', () => {
  let localD1: any;
  let env: any;
  let testDbPath: string;
  let adminCookie = '';

  beforeEach(async () => {
    testDbPath = `./.sqlite/test_org_masters_${Math.random().toString(36).substring(2)}_${Date.now()}.db`;
    if (fs.existsSync(testDbPath)) { try { fs.unlinkSync(testDbPath); } catch (e) {} }

    localD1 = createLocalD1Database(testDbPath);
    const db = getDb(localD1);
    await seedDatabase(db);

    env = {
      DB: localD1,
      ENVIRONMENT: 'test',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    };

    const loginRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
    }, env);
    const setCookie = loginRes.headers.get('set-cookie');
    adminCookie = setCookie ? setCookie.split(';')[0] : '';
  });

  afterEach(() => {
    try { localD1.close(); } catch (e) {}
    if (testDbPath && fs.existsSync(testDbPath)) { try { fs.unlinkSync(testDbPath); } catch (e) {} }
  });

  it('allows admin to create and list departments', async () => {
    const createRes = await app.request('/api/v1/departments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminCookie,
        'Origin': 'http://localhost:3000',
      },
      body: JSON.stringify({ code: 'OPS', name: 'Operations Department' }),
    }, env);

    expect(createRes.status).toBe(201);
    const json = await createRes.json() as any;
    expect(json.success).toBe(true);
    expect(json.data.code).toBe('OPS');

    const listRes = await app.request('/api/v1/departments', {
      method: 'GET',
      headers: {
        'Cookie': adminCookie,
        'Origin': 'http://localhost:3000',
      },
    }, env);
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json() as any;
    expect(listJson.success).toBe(true);
    expect(listJson.data.length).toBeGreaterThan(0);
  });

  it('allows admin to create officers and service providers', async () => {
    const deptRes = await app.request('/api/v1/departments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminCookie,
        'Origin': 'http://localhost:3000',
      },
      body: JSON.stringify({ code: 'FIN', name: 'Finance Department' }),
    }, env);
    const deptJson = await deptRes.json() as any;
    const deptId = deptJson.data.id;

    const offRes = await app.request('/api/v1/officers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminCookie,
        'Origin': 'http://localhost:3000',
      },
      body: JSON.stringify({
        officerCode: 'OFF-001',
        name: 'John Doe',
        email: 'john.doe@iocl.in',
        phone: '9876543210',
        departmentId: deptId,
      }),
    }, env);
    expect(offRes.status).toBe(201);

    const spRes = await app.request('/api/v1/service-providers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminCookie,
        'Origin': 'http://localhost:3000',
      },
      body: JSON.stringify({
        code: 'SP-SEC',
        name: 'SecureGuard Services',
        serviceType: 'SECURITY',
        contactName: 'Mr. Guard',
        phone: '9123456789',
        email: 'guard@secure.com',
      }),
    }, env);
    expect(spRes.status).toBe(201);
    const spJson = await spRes.json() as any;

    const assignRes = await app.request('/api/v1/outlet-service-providers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminCookie,
        'Origin': 'http://localhost:3000',
      },
      body: JSON.stringify({
        outletId: 'ro-1001',
        serviceProviderId: spJson.data.id,
        contractReference: 'CTR-2026-01',
        effectiveFrom: '2026-04-01',
      }),
    }, env);
    expect(assignRes.status).toBe(201);
  });
});
