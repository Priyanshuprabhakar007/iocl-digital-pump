import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import * as schema from '../src/db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';

describe('Stage F1: Cross-Module System Regression Suite', () => {
  let localD1: any;
  let env: any;
  let testDbPath: string;

  const OUTLET_ID = 'ro-1001';
  const OTHER_OUTLET_ID = 'ro-1002';

  beforeEach(async () => {
    testDbPath = `./.sqlite/test_final_reg_${Math.random().toString(36).substring(2)}_${Date.now()}.db`;
    if (fs.existsSync(testDbPath)) { try { fs.unlinkSync(testDbPath); } catch (e) {} }
    const walPath = `${testDbPath}-wal`;
    const shmPath = `${testDbPath}-shm`;
    if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch (e) {} }
    if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch (e) {} }

    localD1 = createLocalD1Database(testDbPath);
    const db = getDb(localD1);
    await seedDatabase(db);

    env = {
      DB: localD1,
      DOCUMENTS_BUCKET: {
        get: async () => null,
        put: async () => ({}),
        delete: async () => {},
      },
      ENVIRONMENT: 'test',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    };
  });

  afterEach(() => {
    try { localD1.close(); } catch (e) {}
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      const walPath = `${testDbPath}-wal`;
      const shmPath = `${testDbPath}-shm`;
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
    } catch (e) {}
  });

  async function loginAs(email: string) {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, password: 'Password@123' }),
    }, env);
    const setCookie = res.headers.get('set-cookie');
    return setCookie ? setCookie.split(';')[0] : '';
  }

  async function authedRequest(path: string, options: RequestInit = {}, cookie: string) {
    const headers = new Headers(options.headers || {});
    headers.set('Origin', 'http://localhost:3000');
    if (cookie) headers.set('Cookie', cookie);
    return app.request(path, { ...options, headers }, env);
  }

  async function createTestStaff(outletId: string, empCode: string, name: string) {
    const db = getDb(localD1);
    const desigId = `desig-${Math.random().toString(36).substring(2)}`;
    const now = new Date().toISOString();
    await db.insert(schema.hrDesignations).values({
      id: desigId,
      outletId,
      code: `D_${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      name: 'Smoke Designation',
      skillCategory: 'SKILLED',
      status: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    const staffId = `staff-${Math.random().toString(36).substring(2)}`;
    await db.insert(schema.hrStaff).values({
      id: staffId,
      outletId,
      employeeCode: empCode,
      fullName: name,
      designationId: desigId,
      aadhaarLast4: '1234',
      emergencyContactName: 'Contact Person',
      emergencyContactPhone: '+91 9876543210',
      joiningDate: '2026-01-01',
      employmentStatus: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    return staffId;
  }

  // ==========================================================================
  // 1. AUTHENTICATION & SESSION BASELINE
  // ==========================================================================
  describe('1. Authentication & Session Baseline', () => {
    it('1.1 valid seeded ADMIN logs in successfully with HTTP 200 and session cookie', async () => {
      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
      }, env);

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data.user.email).toBe('admin@iocl.in');
      expect(Array.isArray(body.data.roles)).toBe(true);
      expect(body.data.roles).toContain('ADMIN');
      expect(res.headers.get('set-cookie')).toBeTruthy();
    });

    it('1.2 invalid password is rejected safely with HTTP 401 without exposing internals', async () => {
      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'WrongPassword!999' }),
      }, env);

      expect(res.status).toBe(401);
      const body = await res.json() as any;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_CREDENTIALS');
      expect(JSON.stringify(body)).not.toMatch(/sqlite|syntax|SELECT|WHERE/i);
    });

    it('1.3 unauthenticated protected API request is denied with HTTP 401', async () => {
      const res = await app.request('/api/v1/users', {
        method: 'GET',
        headers: { Origin: 'http://localhost:3000' },
      }, env);

      expect(res.status).toBe(401);
      const body = await res.json() as any;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('1.4 authenticated session accesses permitted resources via /auth/me', async () => {
      const adminCookie = await loginAs('admin@iocl.in');
      const res = await authedRequest('/api/v1/auth/me', { method: 'GET' }, adminCookie);

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data.user.id).toBe('user-admin');
      expect(Array.isArray(body.data.permissions)).toBe(true);
      expect(body.data.permissions.length).toBeGreaterThan(0);
    });

    it('1.5 logout revokes active session and invalidates subsequent calls', async () => {
      const adminCookie = await loginAs('admin@iocl.in');
      const logoutRes = await authedRequest('/api/v1/auth/logout', { method: 'POST' }, adminCookie);
      expect(logoutRes.status).toBe(200);

      const afterLogoutRes = await authedRequest('/api/v1/auth/me', { method: 'GET' }, adminCookie);
      expect(afterLogoutRes.status).toBe(401);
    });

    it('1.6 raw internal SQL errors are sanitized and not leaked in responses', async () => {
      const adminCookie = await loginAs('admin@iocl.in');
      const res = await authedRequest('/api/v1/users/non-existent-user-id-99999/permissions', {
        method: 'GET',
      }, adminCookie);

      expect([400, 404, 500]).toContain(res.status);
      const rawText = await res.text();
      expect(rawText).not.toMatch(/syntax error|near "WHERE"|table .* not found/i);
    });
  });

  // ==========================================================================
  // 2. RBAC & SCOPE REGRESSION
  // ==========================================================================
  describe('2. RBAC & Scope Regression', () => {
    it('2.1 ADMIN can access global administrative resources', async () => {
      const adminCookie = await loginAs('admin@iocl.in');
      const res = await authedRequest('/api/v1/users', { method: 'GET' }, adminCookie);

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
    });

    it('2.2 DEALER cannot access unrelated foreign outlet resources', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const res = await authedRequest(`/api/v1/outlets/${OTHER_OUTLET_ID}/shifts`, { method: 'GET' }, dealerCookie);

      expect(res.status).toBe(403);
      const body = await res.json() as any;
      expect(body.success).toBe(false);
      expect(body.error.code).toMatch(/FORBIDDEN|SCOPE_MISMATCH|UNAUTHORIZED_OUTLET/);
    });

    it('2.3 DEALER and CSP cannot execute privileged administrative writes', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const res = await authedRequest('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empCode: 'NEW-EMP-999',
          name: 'Hacker User',
          email: 'hacker@example.com',
          phone: '9999999999',
          password: 'Password@123',
          roleId: 'role-admin',
        }),
      }, dealerCookie);

      expect(res.status).toBe(403);
      const body = await res.json() as any;
      expect(body.success).toBe(false);
    });

    it('2.4 direct user permission overrides correctly modify effective permissions', async () => {
      const db = getDb(localD1);
      const nowIso = new Date().toISOString();

      const permRes = await db.select().from(schema.permissions).where(eq(schema.permissions.code, 'shifts.read')).get();
      expect(permRes).toBeDefined();

      await db.insert(schema.userPermissionOverrides).values({
        userId: 'user-dealer',
        permissionId: permRes!.id,
        effect: 'DENY',
        assignedByUserId: 'user-admin',
        createdAt: nowIso,
        updatedAt: nowIso,
      }).run();

      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const meRes = await authedRequest('/api/v1/auth/me', { method: 'GET' }, dealerCookie);
      expect(meRes.status).toBe(200);
      const meBody = await meRes.json() as any;
      expect(meBody.data.permissions).not.toContain('shifts.read');
    });

    it('2.5 cross-outlet resource queries do not leak unrelated outlet data', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const res = await authedRequest('/api/v1/outlets', { method: 'GET' }, dealerCookie);

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      const outletIds = body.data.map((o: any) => o.id);
      expect(outletIds).toContain(OUTLET_ID);
      expect(outletIds).not.toContain(OTHER_OUTLET_ID);
    });
  });

  // ==========================================================================
  // 3. MASTER DATA SMOKE COVERAGE
  // ==========================================================================
  describe('3. Master Data Smoke Coverage', () => {
    it('3.1 Admin can read Retail Outlets and receive valid records', async () => {
      const adminCookie = await loginAs('admin@iocl.in');
      const res = await authedRequest('/api/v1/outlets', { method: 'GET' }, adminCookie);

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(2);
      const ro = body.data.find((o: any) => o.id === OUTLET_ID);
      expect(ro).toBeDefined();
      expect(ro.roCode).toBeTruthy();
    });

    it('3.2 Admin can read Products with fuels and categories intact', async () => {
      const adminCookie = await loginAs('admin@iocl.in');
      const res = await authedRequest('/api/v1/products', { method: 'GET' }, adminCookie);

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      const ms = body.data.find((p: any) => p.code === 'MS' || p.id === 'prod-ms');
      expect(ms).toBeDefined();
    });

    it('3.3 Admin can read Roles and Scopes', async () => {
      const adminCookie = await loginAs('admin@iocl.in');
      const rolesRes = await authedRequest('/api/v1/roles', { method: 'GET' }, adminCookie);
      expect(rolesRes.status).toBe(200);
      const rolesBody = await rolesRes.json() as any;
      expect(rolesBody.success).toBe(true);
      expect(rolesBody.data.find((r: any) => r.code === 'ADMIN')).toBeDefined();

      const scopesRes = await authedRequest('/api/v1/scopes', { method: 'GET' }, adminCookie);
      expect(scopesRes.status).toBe(200);
      const scopesBody = await scopesRes.json() as any;
      expect(scopesBody.success).toBe(true);
    });

    it('3.4 Admin can read HR Designations and Staff for an outlet', async () => {
      const adminCookie = await loginAs('admin@iocl.in');
      const desigRes = await authedRequest(`/api/v1/outlets/${OUTLET_ID}/hr/designations`, { method: 'GET' }, adminCookie);
      expect(desigRes.status).toBe(200);
      const desigBody = await desigRes.json() as any;
      expect(desigBody.success).toBe(true);

      const staffRes = await authedRequest(`/api/v1/outlets/${OUTLET_ID}/hr/staff`, { method: 'GET' }, adminCookie);
      expect(staffRes.status).toBe(200);
      const staffBody = await staffRes.json() as any;
      expect(staffBody.success).toBe(true);
    });
  });

  // ==========================================================================
  // 4. PUMP INFRASTRUCTURE BASELINE
  // ==========================================================================
  describe('4. Pump Infrastructure Baseline', () => {
    it('4.1 resolves topology Outlet -> Tanks -> Dispensers -> Nozzles with intact relationships', async () => {
      const adminCookie = await loginAs('admin@iocl.in');

      const tanksRes = await authedRequest(`/api/v1/outlets/${OUTLET_ID}/tanks`, { method: 'GET' }, adminCookie);
      expect(tanksRes.status).toBe(200);
      const tanksBody = await tanksRes.json() as any;
      expect(tanksBody.success).toBe(true);
      expect(tanksBody.data.length).toBeGreaterThan(0);

      const dispensersRes = await authedRequest(`/api/v1/outlets/${OUTLET_ID}/dispensers`, { method: 'GET' }, adminCookie);
      expect(dispensersRes.status).toBe(200);
      const dispensersBody = await dispensersRes.json() as any;
      expect(dispensersBody.success).toBe(true);
      expect(dispensersBody.data.length).toBeGreaterThan(0);

      const nozzlesRes = await authedRequest(`/api/v1/outlets/${OUTLET_ID}/nozzles`, { method: 'GET' }, adminCookie);
      expect(nozzlesRes.status).toBe(200);
      const nozzlesBody = await nozzlesRes.json() as any;
      expect(nozzlesBody.success).toBe(true);
      expect(nozzlesBody.data.length).toBeGreaterThan(0);
    });

    it('4.2 rejects cross-outlet pump infrastructure queries for unauthorized scoped users', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const res = await authedRequest(`/api/v1/outlets/${OTHER_OUTLET_ID}/dispensers`, { method: 'GET' }, dealerCookie);
      expect(res.status).toBe(403);
    });

    it('4.3 verifies DB nozzle-tank product integrity via foreign-key / trigger guarantees', async () => {
      const db = getDb(localD1);
      const tanks = await db.select().from(schema.tanks).where(eq(schema.tanks.outletId, OUTLET_ID)).all();
      const nozzles = await db.select().from(schema.nozzles).where(eq(schema.nozzles.outletId, OUTLET_ID)).all();

      expect(tanks.length).toBeGreaterThan(0);
      expect(nozzles.length).toBeGreaterThan(0);

      for (const nozzle of nozzles) {
        const matchingTank = tanks.find(t => t.id === nozzle.tankId);
        expect(matchingTank).toBeDefined();
        expect(nozzle.productId).toBe(matchingTank!.productId);
      }
    });
  });

  // ==========================================================================
  // 5. SHIFT / STOCK / FUEL OPERATIONS BASELINE
  // ==========================================================================
  describe('5. Shift / Stock / Fuel Operations Baseline', () => {
    it('5.1 authorized request retrieves outlet-scoped shifts', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const res = await authedRequest(`/api/v1/outlets/${OUTLET_ID}/shifts`, { method: 'GET' }, dealerCookie);

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('5.2 tank stock readings route enforces outlet authority', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const res = await authedRequest(`/api/v1/outlets/${OTHER_OUTLET_ID}/tanks`, { method: 'GET' }, dealerCookie);
      expect(res.status).toBe(403);
    });

    it('5.3 fuel receipts route enforces authentication and authorization', async () => {
      const unauthRes = await app.request('/api/v1/shifts/shift-test-1/fuel-receipts', {
        method: 'GET',
        headers: { Origin: 'http://localhost:3000' },
      }, env);
      expect(unauthRes.status).toBe(401);

      const adminCookie = await loginAs('admin@iocl.in');
      const authRes = await authedRequest('/api/v1/shifts/shift-nonexistent-999/fuel-receipts', { method: 'GET' }, adminCookie);
      // Returns 200 with empty list or 404 for unknown shift; never raw error
      expect([200, 404]).toContain(authRes.status);
    });
  });

  // ==========================================================================
  // 6. FINANCIAL OPERATIONS BASELINE
  // ==========================================================================
  describe('6. Financial Operations Baseline', () => {
    it('6.1 authorized scoped request can read product prices and credit parties', async () => {
      const adminCookie = await loginAs('admin@iocl.in');
      const pricesRes = await authedRequest(`/api/v1/outlets/${OUTLET_ID}/product-prices`, { method: 'GET' }, adminCookie);
      expect(pricesRes.status).toBe(200);
      const pricesBody = await pricesRes.json() as any;
      expect(pricesBody.success).toBe(true);

      const partiesRes = await authedRequest(`/api/v1/outlets/${OUTLET_ID}/credit-parties`, { method: 'GET' }, adminCookie);
      expect(partiesRes.status).toBe(200);
      const partiesBody = await partiesRes.json() as any;
      expect(partiesBody.success).toBe(true);
    });

    it('6.2 unauthorized user is rejected when requesting foreign outlet financial data', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const res = await authedRequest(`/api/v1/outlets/${OTHER_OUTLET_ID}/product-prices`, { method: 'GET' }, dealerCookie);
      expect(res.status).toBe(403);
    });

    it('6.3 financial amount validation rejects negative amounts and malformed data', async () => {
      const adminCookie = await loginAs('admin@iocl.in');
      const res = await authedRequest(`/api/v1/outlets/${OUTLET_ID}/product-prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: 'prod-ms',
          effectiveFrom: '2026-12-01T06:00:00.000Z',
          pricePaise: -500, // Invalid negative price
        }),
      }, adminCookie);

      expect(res.status).toBe(400);
      const body = await res.json() as any;
      expect(body.success).toBe(false);
    });
  });

  // ==========================================================================
  // 7. SPECIALIZED OPERATIONAL MODULES
  // ==========================================================================
  describe('7. Specialized Operational Modules', () => {
    it('7.1 CNG Operations: route registered and authorized scoped access succeeds', async () => {
      const adminCookie = await loginAs('admin@iocl.in');
      const res = await authedRequest(`/api/v1/outlets/${OUTLET_ID}/cng/daily-summary?businessDate=2026-06-01`, { method: 'GET' }, adminCookie);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);

      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const crossRes = await authedRequest(`/api/v1/outlets/${OTHER_OUTLET_ID}/cng/daily-summary?businessDate=2026-06-01`, { method: 'GET' }, dealerCookie);
      expect(crossRes.status).toBe(403);
    });

    it('7.2 Lube Operations: route registered and authorized scoped access succeeds', async () => {
      const adminCookie = await loginAs('admin@iocl.in');
      const res = await authedRequest(`/api/v1/outlets/${OUTLET_ID}/lube/skus`, { method: 'GET' }, adminCookie);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);

      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const crossRes = await authedRequest(`/api/v1/outlets/${OTHER_OUTLET_ID}/lube/skus`, { method: 'GET' }, dealerCookie);
      expect(crossRes.status).toBe(403);
    });

    it('7.3 Equipment Breakdowns: route registered and authorized scoped access succeeds', async () => {
      const adminCookie = await loginAs('admin@iocl.in');
      const res = await authedRequest(`/api/v1/outlets/${OUTLET_ID}/equipment/tickets`, { method: 'GET' }, adminCookie);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);

      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const crossRes = await authedRequest(`/api/v1/outlets/${OTHER_OUTLET_ID}/equipment/tickets`, { method: 'GET' }, dealerCookie);
      expect(crossRes.status).toBe(403);
    });

    it('7.4 Utilities / Sub-Meters: route registered and authorized scoped access succeeds', async () => {
      const adminCookie = await loginAs('admin@iocl.in');
      const res = await authedRequest(`/api/v1/outlets/${OUTLET_ID}/utilities/electricity-bills`, { method: 'GET' }, adminCookie);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);

      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const crossRes = await authedRequest(`/api/v1/outlets/${OTHER_OUTLET_ID}/utilities/electricity-bills`, { method: 'GET' }, dealerCookie);
      expect(crossRes.status).toBe(403);
    });

    it('7.5 Municipal Taxes: route registered and authorized scoped access succeeds', async () => {
      const adminCookie = await loginAs('admin@iocl.in');
      const res = await authedRequest(`/api/v1/outlets/${OUTLET_ID}/municipal-taxes`, { method: 'GET' }, adminCookie);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);

      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const crossRes = await authedRequest(`/api/v1/outlets/${OTHER_OUTLET_ID}/municipal-taxes`, { method: 'GET' }, dealerCookie);
      expect(crossRes.status).toBe(403);
    });

    it('7.6 NFR Lease & Rent: route registered and authorized scoped access succeeds', async () => {
      const adminCookie = await loginAs('admin@iocl.in');
      const res = await authedRequest(`/api/v1/outlets/${OUTLET_ID}/nfr/spaces`, { method: 'GET' }, adminCookie);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);

      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const crossRes = await authedRequest(`/api/v1/outlets/${OTHER_OUTLET_ID}/nfr/spaces`, { method: 'GET' }, dealerCookie);
      expect(crossRes.status).toBe(403);
    });
  });

  // ==========================================================================
  // 8. ORGANIZATION MASTERS
  // ==========================================================================
  describe('8. Organization Masters Baseline', () => {
    it('8.1 Admin can read Organization Masters (departments, officers, providers)', async () => {
      const adminCookie = await loginAs('admin@iocl.in');
      const deptRes = await authedRequest('/api/v1/org/departments', { method: 'GET' }, adminCookie);
      expect(deptRes.status).toBe(200);
      const deptBody = await deptRes.json() as any;
      expect(deptBody.success).toBe(true);
      expect(Array.isArray(deptBody.data)).toBe(true);

      const officersRes = await authedRequest('/api/v1/org/officers', { method: 'GET' }, adminCookie);
      expect(officersRes.status).toBe(200);
      const officersBody = await officersRes.json() as any;
      expect(officersBody.success).toBe(true);
      expect(Array.isArray(officersBody.data)).toBe(true);

      const providersRes = await authedRequest('/api/v1/org/service-providers', { method: 'GET' }, adminCookie);
      expect(providersRes.status).toBe(200);
      const providersBody = await providersRes.json() as any;
      expect(providersBody.success).toBe(true);
      expect(Array.isArray(providersBody.data)).toBe(true);
    });

    it('8.2 Global master writes are strictly restricted to GLOBAL Admin scope', async () => {
      const soCookie = await loginAs('wbso@iocl.in');
      const res = await authedRequest('/api/v1/org/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'TEST_DEPT_SO',
          name: 'Unauthorized Dept',
        }),
      }, soCookie);

      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // 9. HR / WORKFORCE SYSTEM BASELINE
  // ==========================================================================
  describe('9. HR / Workforce System Baseline', () => {
    it('9.1 HR modules coexist and share outlet/staff references without integrity conflicts', async () => {
      const adminCookie = await loginAs('admin@iocl.in');

      const desigRes = await authedRequest(`/api/v1/outlets/${OUTLET_ID}/hr/designations`, { method: 'GET' }, adminCookie);
      expect(desigRes.status).toBe(200);

      const staffRes = await authedRequest(`/api/v1/outlets/${OUTLET_ID}/hr/staff`, { method: 'GET' }, adminCookie);
      expect(staffRes.status).toBe(200);

      const rosterRes = await authedRequest(`/api/v1/outlets/${OUTLET_ID}/hr/roster`, { method: 'GET' }, adminCookie);
      expect(rosterRes.status).toBe(200);

      const uniformRes = await authedRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/items`, { method: 'GET' }, adminCookie);
      expect(uniformRes.status).toBe(200);
    });

    it('9.2 cross-outlet HR staff operations are strictly isolated by ScopeService', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const res = await authedRequest(`/api/v1/outlets/${OTHER_OUTLET_ID}/hr/staff`, { method: 'GET' }, dealerCookie);
      expect(res.status).toBe(403);
    });

    it('9.3 attendance and nozzle assignments enforce outlet boundaries', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const attRes = await authedRequest(`/api/v1/outlets/${OUTLET_ID}/hr/attendance`, { method: 'GET' }, dealerCookie);
      expect(attRes.status).toBe(200);

      const nozzAttRes = await authedRequest(`/api/v1/outlets/${OUTLET_ID}/hr/nozzle-assignments`, { method: 'GET' }, dealerCookie);
      expect(nozzAttRes.status).toBe(200);

      const crossAttRes = await authedRequest(`/api/v1/outlets/${OTHER_OUTLET_ID}/hr/attendance`, { method: 'GET' }, dealerCookie);
      expect(crossAttRes.status).toBe(403);
    });
  });

  // ==========================================================================
  // 10. LEAVE MANAGEMENT — FROZEN CONTRACT CHECK
  // ==========================================================================
  describe('10. Leave Management — Frozen Contract Check', () => {
    it('10.1 maker cannot approve or reject own leave request (Maker-Checker guarantee)', async () => {
      const db = getDb(localD1);
      const now = new Date().toISOString();
      const leaveId = 'smoke-leave-mc-1';
      const staffId = await createTestStaff(OUTLET_ID, 'E-SMOKE-1', 'Smoke Staff 1');

      await db.insert(schema.hrLeaveRequests).values({
        id: leaveId,
        outletId: OUTLET_ID,
        staffId,
        leaveType: 'CASUAL',
        fromDate: '2026-11-20',
        toDate: '2026-11-21',
        reason: 'Frozen contract test',
        status: 'PENDING',
        requestedByUserId: 'user-dealer',
        createdAt: now,
        updatedAt: now,
      }).run();

      // Maker self-approval must fail
      try {
        await db.update(schema.hrLeaveRequests)
          .set({ status: 'APPROVED', decisionByUserId: 'user-dealer', decisionAt: now, updatedAt: now })
          .where(eq(schema.hrLeaveRequests.id, leaveId))
          .run();
        throw new Error('Self-approval should have failed');
      } catch (e: any) {
        const fullError = (e.message || '') + (e.cause ? JSON.stringify(e.cause) : '');
        expect(fullError).toMatch(/HR_MAKER_CHECKER_SELF_APPROVAL_FORBIDDEN|SQLITE_CONSTRAINT_TRIGGER/);
      }

      // Maker self-rejection must fail
      try {
        await db.update(schema.hrLeaveRequests)
          .set({ status: 'REJECTED', decisionByUserId: 'user-dealer', decisionAt: now, updatedAt: now })
          .where(eq(schema.hrLeaveRequests.id, leaveId))
          .run();
        throw new Error('Self-rejection should have failed');
      } catch (e: any) {
        const fullError = (e.message || '') + (e.cause ? JSON.stringify(e.cause) : '');
        expect(fullError).toMatch(/HR_MAKER_CHECKER_SELF_APPROVAL_FORBIDDEN|SQLITE_CONSTRAINT_TRIGGER/);
      }

      const leave = await db.select().from(schema.hrLeaveRequests).where(eq(schema.hrLeaveRequests.id, leaveId)).get();
      expect(leave?.status).toBe('PENDING');
    });

    it('10.2 only requester can cancel PENDING leave and non-requester cancel is rejected', async () => {
      const db = getDb(localD1);
      const now = new Date().toISOString();
      const leaveId = 'smoke-leave-mc-2';
      const staffId = await createTestStaff(OUTLET_ID, 'E-SMOKE-2', 'Smoke Staff 2');

      await db.insert(schema.hrLeaveRequests).values({
        id: leaveId,
        outletId: OUTLET_ID,
        staffId,
        leaveType: 'CASUAL',
        fromDate: '2026-11-25',
        toDate: '2026-11-26',
        reason: 'Cancel contract test',
        status: 'PENDING',
        requestedByUserId: 'user-dealer',
        createdAt: now,
        updatedAt: now,
      }).run();

      // Non-requester cancel attempt
      try {
        await db.update(schema.hrLeaveRequests)
          .set({ status: 'CANCELLED', cancelledByUserId: 'user-fo', cancelledAt: now, updatedAt: now })
          .where(eq(schema.hrLeaveRequests.id, leaveId))
          .run();
        throw new Error('Non-requester cancel should have failed');
      } catch (e: any) {
        const fullError = (e.message || '') + (e.cause ? JSON.stringify(e.cause) : '');
        expect(fullError).toMatch(/HR_LEAVE_CANCEL_NOT_REQUESTER|SQLITE_CONSTRAINT_TRIGGER/);
      }

      // Requester cancel succeeds
      await db.update(schema.hrLeaveRequests)
        .set({ status: 'CANCELLED', cancelledByUserId: 'user-dealer', cancelledAt: now, updatedAt: now })
        .where(eq(schema.hrLeaveRequests.id, leaveId))
        .run();

      const leave = await db.select().from(schema.hrLeaveRequests).where(eq(schema.hrLeaveRequests.id, leaveId)).get();
      expect(leave?.status).toBe('CANCELLED');
    });

    it('10.3 APPROVED -> CANCELLED transition is forbidden by state machine triggers', async () => {
      const db = getDb(localD1);
      const now = new Date().toISOString();
      const leaveId = 'smoke-leave-mc-3';
      const staffId = await createTestStaff(OUTLET_ID, 'E-SMOKE-3', 'Smoke Staff 3');

      await db.insert(schema.hrLeaveRequests).values({
        id: leaveId,
        outletId: OUTLET_ID,
        staffId,
        leaveType: 'CASUAL',
        fromDate: '2026-11-28',
        toDate: '2026-11-29',
        reason: 'Terminal contract test',
        status: 'PENDING',
        requestedByUserId: 'user-dealer',
        createdAt: now,
        updatedAt: now,
      }).run();

      // Approved by FO
      await db.update(schema.hrLeaveRequests)
        .set({ status: 'APPROVED', decisionByUserId: 'user-fo', decisionAt: now, updatedAt: now })
        .where(eq(schema.hrLeaveRequests.id, leaveId))
        .run();

      // Attempt to cancel approved leave
      try {
        await db.update(schema.hrLeaveRequests)
          .set({ status: 'CANCELLED', cancelledByUserId: 'user-dealer', cancelledAt: now, updatedAt: now })
          .where(eq(schema.hrLeaveRequests.id, leaveId))
          .run();
        throw new Error('APPROVED -> CANCELLED should have failed');
      } catch (e: any) {
        const fullError = (e.message || '') + (e.cause ? JSON.stringify(e.cause) : '');
        expect(fullError).toMatch(/HR_LEAVE_INVALID_STATE_TRANSITION|SQLITE_CONSTRAINT_TRIGGER/);
      }
    });
  });

  // ==========================================================================
  // 11. DATABASE INTEGRITY CHECK
  // ==========================================================================
  describe('11. Database Integrity Check', () => {
    it('11.1 PRAGMA foreign_key_check reports 0 violations across the entire database', async () => {
      const res = await localD1.prepare('PRAGMA foreign_key_check;').all();
      expect(res.results).toEqual([]);
    });

    it('11.2 verifies absence of orphaned records in critical relational tables', async () => {
      const db = getDb(localD1);

      // Verify all nozzles reference a valid tank
      const allNozzles = await db.select().from(schema.nozzles).all();
      const allTanks = await db.select().from(schema.tanks).all();
      const tankIds = new Set(allTanks.map(t => t.id));
      for (const n of allNozzles) {
        expect(tankIds.has(n.tankId)).toBe(true);
      }

      // Verify all tanks reference a valid outlet
      const allOutlets = await db.select().from(schema.retailOutlets).all();
      const outletIds = new Set(allOutlets.map(o => o.id));
      for (const t of allTanks) {
        expect(outletIds.has(t.outletId)).toBe(true);
      }

      // Verify all users reference valid scopes
      const allScopes = await db.select().from(schema.userScopes).all();
      const allUsers = await db.select().from(schema.users).all();
      const userIds = new Set(allUsers.map(u => u.id));
      for (const s of allScopes) {
        expect(userIds.has(s.userId)).toBe(true);
      }
    });
  });

  // ==========================================================================
  // 12. API ERROR CONTRACT & SANITIZATION
  // ==========================================================================
  describe('12. API Error Contract & Sanitization', () => {
    it('12.1 error responses follow standardized format without exposing stack traces, raw SQL or filesystem paths', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');

      // Request invalid non-existent endpoint
      const notFoundRes = await authedRequest('/api/v1/non-existent-subpath-999', { method: 'GET' }, dealerCookie);
      expect(notFoundRes.status).toBe(404);
      const nfBody = await notFoundRes.json() as any;
      expect(nfBody.success).toBe(false);
      expect(nfBody.error).toBeDefined();
      expect(nfBody.error.code).toBe('NOT_FOUND');

      const nfText = JSON.stringify(nfBody);
      expect(nfText).not.toMatch(/node_modules|\.ts|\.js|at Object\.|Error:/);
      expect(nfText).not.toMatch(/SELECT|INSERT|UPDATE|DELETE|sqlite_master/i);
    });
  });
});
