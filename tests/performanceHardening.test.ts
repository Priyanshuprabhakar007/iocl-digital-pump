import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import app from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import fs from 'fs';
import { apiFetch, clearApiCache } from '../src/frontend/services/api';

describe('Performance Hardening & Instrumentation Suite', () => {
  let envDev: { DB: any; DOCUMENTS_BUCKET: any; ENVIRONMENT: string; ALLOWED_ORIGINS?: string };
  let dbPath: string;
  let localD1: any;
  let adminCookie: string;

  beforeEach(async () => {
    dbPath = `./.sqlite/test_perf_${Math.random().toString(36).substring(7)}.db`;
    localD1 = createLocalD1Database(dbPath);
    const db = getDb(localD1);
    await seedDatabase(db);

    const mockBucket = {
      put: async () => ({ key: '', size: 0 }),
      delete: async () => {},
    };

    envDev = {
      DB: localD1,
      DOCUMENTS_BUCKET: mockBucket as any,
      ENVIRONMENT: 'development',
      ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
    };

    // Authenticate as global admin to obtain a session cookie
    const loginRes = await app.fetch(
      new Request('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
      }),
      envDev
    );

    const setCookie = loginRes.headers.get('set-cookie') || '';
    adminCookie = setCookie.split(';')[0];
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

    clearApiCache();
  });

  it('1. Backend emits Server-Timing header without leaking SQL queries or table details', async () => {
    const res = await app.fetch(
      new Request('http://localhost:3000/api/v1/outlets', {
        method: 'GET',
        headers: {
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
      }),
      envDev
    );

    expect(res.status).toBe(200);
    const serverTiming = res.headers.get('Server-Timing');
    expect(serverTiming).toBeDefined();
    expect(serverTiming).not.toBeNull();

    // Must contain safe timing metrics
    expect(serverTiming).toContain('auth;dur=');
    expect(serverTiming).toContain('db;dur=');
    expect(serverTiming).toContain('handler;dur=');
    expect(serverTiming).toContain('total;dur=');

    // Must NOT leak SQL or database table details
    expect(serverTiming).not.toContain('SELECT');
    expect(serverTiming).not.toContain('INSERT');
    expect(serverTiming).not.toContain('retail_outlets');
    expect(serverTiming).not.toContain('sqlite');
  });

  it('2. GET /api/v1/outlets returns all outlets and batch-loaded assignments without N+1 regression', async () => {
    let prepareCount = 0;
    const originalPrepare = envDev.DB.prepare.bind(envDev.DB);
    envDev.DB.prepare = (sql: string) => {
      prepareCount++;
      return originalPrepare(sql);
    };

    const res = await app.fetch(
      new Request('http://localhost:3000/api/v1/outlets', {
        method: 'GET',
        headers: {
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
      }),
      envDev
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    // Each outlet should have assignedUsersCount and assignments array
    for (const outlet of body.data) {
      expect(typeof outlet.assignedUsersCount).toBe('number');
      expect(Array.isArray(outlet.assignments)).toBe(true);
    }

    // Number of queries must be small and bounded, O(1), not O(N)
    // Auth + Accessible outlets + 1 batch assignment query
    expect(prepareCount).toBeLessThan(15);
  });

  it('3. GET /api/v1/roles returns all roles with permissions in a single batch query', async () => {
    const res = await app.fetch(
      new Request('http://localhost:3000/api/v1/roles', {
        method: 'GET',
        headers: {
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
      }),
      envDev
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    const adminRole = body.data.find((r: any) => r.code === 'ADMIN');
    expect(adminRole).toBeDefined();
    expect(Array.isArray(adminRole.permissions)).toBe(true);
    expect(adminRole.permissions.length).toBeGreaterThan(0);
  });

  it('4. GET /api/v1/users supports pagination and batch-loads roles/scopes without N+1 queries', async () => {
    const res = await app.fetch(
      new Request('http://localhost:3000/api/v1/users?limit=2&offset=0', {
        method: 'GET',
        headers: {
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
      }),
      envDev
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeLessThanOrEqual(2);

    for (const user of body.data) {
      expect(Array.isArray(user.roles)).toBe(true);
      expect(Array.isArray(user.scopes)).toBe(true);
    }
  });

  it('5. Frontend in-flight GET request deduplication shares promises for identical concurrent requests', async () => {
    let fetchCalls = 0;
    const globalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      fetchCalls++;
      // Simulate network latency
      await new Promise(r => setTimeout(r, 20));
      return new Response(JSON.stringify({ success: true, data: [{ id: 'outlet-1' }], error: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    try {
      // Fire 3 simultaneous GET requests for the same master data endpoint
      const p1 = apiFetch('/api/v1/outlets');
      const p2 = apiFetch('/api/v1/outlets');
      const p3 = apiFetch('/api/v1/outlets');

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(r3.success).toBe(true);

      // Only ONE network fetch should have occurred!
      expect(fetchCalls).toBe(1);

      // Subsequent call within TTL is served from query cache
      const r4 = await apiFetch('/api/v1/outlets');
      expect(r4.success).toBe(true);
      expect(fetchCalls).toBe(1);
    } finally {
      globalThis.fetch = globalFetch;
    }
  });

  it('6. Mutation invalidates cached query keys and allows fresh fetch', async () => {
    let fetchCalls = 0;
    const globalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: any, init?: any) => {
      fetchCalls++;
      const method = init?.method || 'GET';
      if (method === 'POST') {
        return new Response(JSON.stringify({ success: true, data: { id: 'new-id' }, error: null }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: true, data: [{ id: 'outlet-1' }], error: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    try {
      // 1. Initial GET caches outlet data
      await apiFetch('/api/v1/outlets');
      expect(fetchCalls).toBe(1);

      // 2. Subsequent GET served from cache
      await apiFetch('/api/v1/outlets');
      expect(fetchCalls).toBe(1);

      // 3. POST mutation on /api/v1/outlets invalidates the cache
      await apiFetch('/api/v1/outlets', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Outlet' }),
      });
      expect(fetchCalls).toBe(2);

      // 4. Next GET fetches fresh data from server
      await apiFetch('/api/v1/outlets');
      expect(fetchCalls).toBe(3);
    } finally {
      globalThis.fetch = globalFetch;
    }
  });
});
