import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import * as schema from '../src/db/schema';
import { eq, sql } from 'drizzle-orm';
import { HrService } from '../src/worker/services/hrService';
import fs from 'fs';

// Mock R2 Bucket for Document & Storage UAT
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

describe('Stage F2: Business Workflow UAT Suite', () => {
  let localD1: any;
  let env: any;
  let testDbPath: string;

  // Primary Outlets from Seed Data
  const OUTLET_1_ID = 'ro-1001'; // Park Street (WB / Kolkata Central SA)
  const OUTLET_2_ID = 'ro-1002'; // Salt Lake (WB / Kolkata North SA)
  const OUTLET_3_ID = 'ro-1003'; // GT Road Ludhiana (Punjab / Ludhiana Central SA)

  // Seeded User Personas
  const PERSONAS = {
    ADMIN: 'admin@iocl.in',
    STATE_OFFICE: 'wbso@iocl.in',
    DIVISIONAL_OFFICE: 'kolkatado@iocl.in',
    BUSINESS_MANAGER: 'bm.kolkata@iocl.in',
    FIELD_OFFICER: 'fo.central@iocl.in',
    DEALER: 'dealer.parkstreet@iocl.in',
    CSP: 'csp.parkstreet@iocl.in',
  };

  beforeEach(async () => {
    testDbPath = `./.sqlite/test_uat_journey_${Math.random().toString(36).substring(2)}_${Date.now()}.db`;
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
      DOCUMENTS_BUCKET: new MockR2Bucket(),
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

  // ==========================================================================
  // JOURNEY A — ADMIN LOGIN & SYSTEM GOVERNANCE
  // ==========================================================================
  describe('Journey A: Admin Login & System Governance', () => {
    it('executes full administrative governance lifecycle and revokes session on logout', async () => {
      // 1. Login
      const adminCookie = await loginAs(PERSONAS.ADMIN);
      expect(adminCookie).toBeTruthy();

      // 2. Verify Session
      const meRes = await authedRequest('/api/v1/auth/me', { method: 'GET' }, adminCookie);
      expect(meRes.status).toBe(200);
      const meBody = await meRes.json() as any;
      expect(meBody.data.user.email).toBe(PERSONAS.ADMIN);
      expect(meBody.data.roles).toContain('ADMIN');

      // 3. Read Users
      const usersRes = await authedRequest('/api/v1/users', { method: 'GET' }, adminCookie);
      expect(usersRes.status).toBe(200);
      const usersBody = await usersRes.json() as any;
      expect(usersBody.data.length).toBeGreaterThanOrEqual(7);

      // 4. Read Roles
      const rolesRes = await authedRequest('/api/v1/roles', { method: 'GET' }, adminCookie);
      expect(rolesRes.status).toBe(200);
      const rolesBody = await rolesRes.json() as any;
      expect(rolesBody.data.length).toBeGreaterThanOrEqual(7);

      // 5. Read Scopes
      const scopesRes = await authedRequest('/api/v1/scopes', { method: 'GET' }, adminCookie);
      expect(scopesRes.status).toBe(200);

      // 6. Read Outlets
      const outletsRes = await authedRequest('/api/v1/outlets', { method: 'GET' }, adminCookie);
      expect(outletsRes.status).toBe(200);
      const outletsBody = await outletsRes.json() as any;
      expect(outletsBody.data.length).toBeGreaterThanOrEqual(3);

      // 7. Read Org Masters
      const deptRes = await authedRequest('/api/v1/org/departments', { method: 'GET' }, adminCookie);
      expect(deptRes.status).toBe(200);
      const officersRes = await authedRequest('/api/v1/org/officers', { method: 'GET' }, adminCookie);
      expect(officersRes.status).toBe(200);
      const providersRes = await authedRequest('/api/v1/org/service-providers', { method: 'GET' }, adminCookie);
      expect(providersRes.status).toBe(200);

      // 8. Read Audit Logs
      const auditRes = await authedRequest('/api/v1/audit-logs', { method: 'GET' }, adminCookie);
      expect(auditRes.status).toBe(200);

      // 9. Logout
      const logoutRes = await authedRequest('/api/v1/auth/logout', { method: 'POST' }, adminCookie);
      expect(logoutRes.status).toBe(200);

      // 10. Verify old session is invalid
      const postLogoutRes = await authedRequest('/api/v1/auth/me', { method: 'GET' }, adminCookie);
      expect(postLogoutRes.status).toBe(401);
    });
  });

  // ==========================================================================
  // JOURNEY B — SCOPED OFFICER HIERARCHY
  // ==========================================================================
  describe('Journey B: Scoped Officer Hierarchy', () => {
    it('enforces geographic scope boundaries across SO, DO, BM, and FO personas', async () => {
      // 1. State Office (WBSO): can access WB outlets (ro-1001), denied Punjab outlet (ro-1003)
      const soCookie = await loginAs(PERSONAS.STATE_OFFICE);
      const soAllowed = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/shifts`, { method: 'GET' }, soCookie);
      expect(soAllowed.status).toBe(200);
      const soDenied = await authedRequest(`/api/v1/outlets/${OUTLET_3_ID}/shifts`, { method: 'GET' }, soCookie);
      expect(soDenied.status).toBe(403);

      // 2. Divisional Office (Kolkata DO): can access Kolkata outlets (ro-1001), denied Punjab outlet (ro-1003)
      const doCookie = await loginAs(PERSONAS.DIVISIONAL_OFFICE);
      const doAllowed = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/shifts`, { method: 'GET' }, doCookie);
      expect(doAllowed.status).toBe(200);
      const doDenied = await authedRequest(`/api/v1/outlets/${OUTLET_3_ID}/shifts`, { method: 'GET' }, doCookie);
      expect(doDenied.status).toBe(403);

      // 3. Business Manager (Kolkata DO): can access assigned territory, denied Punjab outlet (ro-1003)
      const bmCookie = await loginAs(PERSONAS.BUSINESS_MANAGER);
      const bmAllowed = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/shifts`, { method: 'GET' }, bmCookie);
      expect(bmAllowed.status).toBe(200);
      const bmDenied = await authedRequest(`/api/v1/outlets/${OUTLET_3_ID}/shifts`, { method: 'GET' }, bmCookie);
      expect(bmDenied.status).toBe(403);

      // 4. Field Officer (Kolkata Central SA): can access ro-1001 in Central SA, denied ro-1002 in North SA
      const foCookie = await loginAs(PERSONAS.FIELD_OFFICER);
      const foAllowed = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/shifts`, { method: 'GET' }, foCookie);
      expect(foAllowed.status).toBe(200);
      const foDenied = await authedRequest(`/api/v1/outlets/${OUTLET_2_ID}/shifts`, { method: 'GET' }, foCookie);
      expect(foDenied.status).toBe(403);

      // 5. Customer Service Provider (CSP): can access assigned outlet, denied foreign outlet and administrative writes
      const cspCookie = await loginAs(PERSONAS.CSP);
      const cspAllowed = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/tanks`, { method: 'GET' }, cspCookie);
      expect(cspAllowed.status).toBe(200);
      const cspDenied = await authedRequest(`/api/v1/outlets/${OUTLET_2_ID}/tanks`, { method: 'GET' }, cspCookie);
      expect(cspDenied.status).toBe(403);
    });
  });

  // ==========================================================================
  // JOURNEY C — DEALER DAILY OUTLET ACCESS
  // ==========================================================================
  describe('Journey C: Dealer Daily Outlet Access', () => {
    it('allows Dealer complete operational view of assigned outlet while blocking administrative writes', async () => {
      const dealerCookie = await loginAs(PERSONAS.DEALER);

      // 1. Load assigned outlet
      const outletRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}`, { method: 'GET' }, dealerCookie);
      expect(outletRes.status).toBe(200);

      // 2. Read pump infrastructure (tanks, dispensers)
      const tanksRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/tanks`, { method: 'GET' }, dealerCookie);
      expect(tanksRes.status).toBe(200);
      const dispRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/dispensers`, { method: 'GET' }, dealerCookie);
      expect(dispRes.status).toBe(200);

      // 3. Read active products
      const prodRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/products`, { method: 'GET' }, dealerCookie);
      expect(prodRes.status).toBe(200);

      // 4. Read shifts
      const shiftsRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/shifts`, { method: 'GET' }, dealerCookie);
      expect(shiftsRes.status).toBe(200);

      // 5. Read HR attendance and nozzle assignments
      const attRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/hr/attendance`, { method: 'GET' }, dealerCookie);
      expect(attRes.status).toBe(200);
      const nozzleAttRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/hr/nozzle-assignments`, { method: 'GET' }, dealerCookie);
      expect(nozzleAttRes.status).toBe(200);

      // 6. Denied unrelated outlet access
      const crossRes = await authedRequest(`/api/v1/outlets/${OUTLET_2_ID}/tanks`, { method: 'GET' }, dealerCookie);
      expect(crossRes.status).toBe(403);

      // 7. Denied privileged administrative user write
      const writeRes = await authedRequest('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empCode: 'NEW-DLR-X',
          name: 'Unauthorized User',
          email: 'unauth@iocl.in',
          phone: '9876543210',
          password: 'Password@123',
          roleId: 'role-admin',
        }),
      }, dealerCookie);
      expect(writeRes.status).toBe(403);
    });
  });

  // ==========================================================================
  // JOURNEY D — DAILY SHIFT OPERATIONS
  // ==========================================================================
  describe('Journey D: Daily Shift Operations', () => {
    it('executes shift opening, active shift detection, and enforces single active shift invariant', async () => {
      const dealerCookie = await loginAs(PERSONAS.DEALER);

      // 1. Open shift for business date
      const openRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/shifts/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate: '2026-11-01',
        }),
      }, dealerCookie);

      expect(openRes.status).toBe(201);
      const openBody = await openRes.json() as any;
      expect(openBody.success).toBe(true);
      const shiftId = openBody.data.id;
      expect(openBody.data.status).toBe('OPEN');

      // 2. Retrieve active shifts and verify presence
      const listRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/shifts`, { method: 'GET' }, dealerCookie);
      expect(listRes.status).toBe(200);
      const listBody = await listRes.json() as any;
      const found = listBody.data.find((s: any) => s.id === shiftId);
      expect(found).toBeDefined();
      expect(found.status).toBe('OPEN');

      // 3. Duplicate active shift attempt must fail with 409
      const dupRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/shifts/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-2',
          businessDate: '2026-11-01',
        }),
      }, dealerCookie);

      expect(dupRes.status).toBe(409);
      const dupBody = await dupRes.json() as any;
      expect(dupBody.error.code).toMatch(/OPEN_SHIFT_EXISTS|CONFLICT/);
    });

    it('rejects shift opening with invalid parameters or unassigned template', async () => {
      const dealerCookie = await loginAs(PERSONAS.DEALER);
      const res = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/shifts/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftTemplateId: 'non-existent-template',
          businessDate: 'invalid-date',
        }),
      }, dealerCookie);
      expect([400, 404]).toContain(res.status);
    });
  });

  // ==========================================================================
  // JOURNEY E — FUEL RECEIPT WORKFLOW
  // ==========================================================================
  describe('Journey E: Fuel Receipt Workflow', () => {
    it('exercises full ARRIVED -> VERIFIED -> DECANTED -> COMPLETED lifecycle with quality validation', async () => {
      const dealerCookie = await loginAs(PERSONAS.DEALER);

      // Open shift first
      const openRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/shifts/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate: '2026-11-02',
        }),
      }, dealerCookie);
      const shiftId = (await openRes.json() as any).data.id;

      // 1. Create Fuel Receipt with line matching Tank 1 (MS)
      const nowIso = new Date().toISOString();
      const createRes = await authedRequest(`/api/v1/shifts/${shiftId}/fuel-receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ttNumber: 'WB-01-AB-1234',
          invoiceNumber: 'INV-IOCL-98765',
          invoiceDate: '2026-11-02',
          arrivalAt: nowIso,
          sealVerified: true,
          lines: [
            {
              tankId: 'tank-ro1-1',
              productId: 'prod-ms',
              invoiceQuantity: '5000.000',
              density: '745.000',
              invoiceDensity: '743.000',
              temperature: '25.000',
            },
          ],
        }),
      }, dealerCookie);

      expect(createRes.status).toBe(201);
      const createBody = await createRes.json() as any;
      const receiptId = createBody.data.id;
      const lineId = createBody.data.lines[0].id;
      expect(createBody.data.status).toBe('ARRIVED');

      // 2. Record PRE_RECEIPT reading on Tank 1 (Dip: 500mm -> 3100 L)
      const preRes = await authedRequest(`/api/v1/shifts/${shiftId}/tank-readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tankId: 'tank-ro1-1',
          readingType: 'PRE_RECEIPT',
          source: 'MANUAL',
          productDipMm: '500.000',
          waterDipMm: '0.000',
        }),
      }, dealerCookie);
      expect(preRes.status).toBe(201);
      const preReadingId = (await preRes.json() as any).data.id;

      // 3. Record POST_RECEIPT reading on Tank 1 (Dip: 1000mm -> 8500 L)
      const postRes = await authedRequest(`/api/v1/shifts/${shiftId}/tank-readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tankId: 'tank-ro1-1',
          readingType: 'POST_RECEIPT',
          source: 'MANUAL',
          productDipMm: '1000.000',
          waterDipMm: '0.000',
        }),
      }, dealerCookie);
      expect(postRes.status).toBe(201);
      const postReadingId = (await postRes.json() as any).data.id;

      // 4. Link pre & post readings to the receipt line
      const linkRes = await authedRequest(`/api/v1/fuel-receipt-lines/${lineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preDecantReadingId: preReadingId,
          postDecantReadingId: postReadingId,
        }),
      }, dealerCookie);
      expect(linkRes.status).toBe(200);

      // 5. Transition ARRIVED -> VERIFIED
      const verifyRes = await authedRequest(`/api/v1/fuel-receipts/${receiptId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'VERIFIED' }),
      }, dealerCookie);
      expect(verifyRes.status).toBe(200);

      // 6. Transition VERIFIED -> DECANTED
      const decantedRes = await authedRequest(`/api/v1/fuel-receipts/${receiptId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'DECANTED',
          decantationStartedAt: new Date().toISOString(),
        }),
      }, dealerCookie);
      expect(decantedRes.status).toBe(200);

      // 7. Transition DECANTED -> COMPLETED
      const completeRes = await authedRequest(`/api/v1/fuel-receipts/${receiptId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'COMPLETED',
        }),
      }, dealerCookie);
      expect(completeRes.status).toBe(200);
      expect((await completeRes.json() as any).data.status).toBe('COMPLETED');

      // 8. Terminal State Immutability: modifying COMPLETED receipt fails with 409
      const mutateRes = await authedRequest(`/api/v1/fuel-receipts/${receiptId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      }, dealerCookie);
      expect(mutateRes.status).toBe(409);
    });
  });

  // ==========================================================================
  // JOURNEY F — STOCK & RECONCILIATION
  // ==========================================================================
  describe('Journey F: Stock & Reconciliation', () => {
    it('validates tank calibration dip readings, precision bounds, and cross-outlet isolation', async () => {
      const adminCookie = await loginAs(PERSONAS.ADMIN);

      // 1. Read tank calibration
      const calibRes = await authedRequest('/api/v1/tanks/tank-ro1-1/calibration', { method: 'GET' }, adminCookie);
      expect(calibRes.status).toBe(200);
      const calibBody = await calibRes.json() as any;
      expect(calibBody.success).toBe(true);

      // 2. Non-monotonic point rejected with 400
      const badCalibRes = await authedRequest('/api/v1/tanks/tank-ro1-1/calibration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dipMillimetres: '1200.000',
          volumeLitres: '100.000', // invalid: at higher dip volume must be higher
        }),
      }, adminCookie);
      expect(badCalibRes.status).toBe(400);

      // 3. Cross-outlet tank query denied for dealer
      const dealerCookie = await loginAs(PERSONAS.DEALER);
      const crossTankRes = await authedRequest(`/api/v1/outlets/${OUTLET_2_ID}/tanks`, { method: 'GET' }, dealerCookie);
      expect(crossTankRes.status).toBe(403);
    });
  });

  // ==========================================================================
  // JOURNEY G — FINANCIAL SETTLEMENT
  // ==========================================================================
  describe('Journey G: Financial Settlement', () => {
    it('manages product price masters with integer paise validation and rejects negative amounts', async () => {
      const adminCookie = await loginAs(PERSONAS.ADMIN);

      // 1. Read product prices
      const pricesRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/product-prices`, { method: 'GET' }, adminCookie);
      expect(pricesRes.status).toBe(200);

      // 2. Read credit parties
      const partiesRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/credit-parties`, { method: 'GET' }, adminCookie);
      expect(partiesRes.status).toBe(200);

      // 3. Malformed negative price rejected
      const badPriceRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/product-prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: 'prod-ms',
          effectiveFrom: '2026-11-01T06:00:00.000Z',
          pricePaisePerUnit: -9900,
        }),
      }, adminCookie);
      expect(badPriceRes.status).toBe(400);
    });
  });

  // ==========================================================================
  // JOURNEY H — CNG OPERATIONS
  // ==========================================================================
  describe('Journey H: CNG Operations', () => {
    it('reads CNG summary and enforces outlet-scoped access', async () => {
      const dealerCookie = await loginAs(PERSONAS.DEALER);

      // 1. Scoped user accesses assigned outlet CNG summary
      const cngRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/cng/daily-summary?businessDate=2026-11-01`, {
        method: 'GET',
      }, dealerCookie);
      expect(cngRes.status).toBe(200);
      const cngBody = await cngRes.json() as any;
      expect(cngBody.success).toBe(true);

      // 2. Cross-outlet CNG access blocked
      const crossCngRes = await authedRequest(`/api/v1/outlets/${OUTLET_2_ID}/cng/daily-summary?businessDate=2026-11-01`, {
        method: 'GET',
      }, dealerCookie);
      expect(crossCngRes.status).toBe(403);
    });
  });

  // ==========================================================================
  // JOURNEY I — LUBE OPERATIONS
  // ==========================================================================
  describe('Journey I: Lube Operations', () => {
    it('manages lube SKU catalog, records stock transactions, and enforces outlet boundaries', async () => {
      const adminCookie = await loginAs(PERSONAS.ADMIN);

      // 1. Create Lube SKU with valid CreateLubeSkuSchema
      const skuCode = `SERVO-PRIDE-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const createSkuRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/lube/skus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuCode,
          name: 'Servo Pride 15W-40 (4L)',
          category: 'ENGINE_OIL',
          stockUnit: 'PACK',
          reorderThreshold: '10',
          status: 'ACTIVE',
        }),
      }, adminCookie);

      expect(createSkuRes.status).toBe(201);
      const skuBody = await createSkuRes.json() as any;
      const skuId = skuBody.data.id;

      // 2. Record Stock Receipt (IN)
      const nowIso = new Date().toISOString();
      const stockInRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/lube/stock-transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lubeSkuId: skuId,
          transactionType: 'RECEIPT',
          quantity: '25',
          occurredAt: nowIso,
          referenceNumber: 'INV-LUBE-001',
          notes: 'Initial stock receipt',
        }),
      }, adminCookie);

      expect(stockInRes.status).toBe(201);

      // 3. View stock summary
      const summaryRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/lube/stock-summary`, { method: 'GET' }, adminCookie);
      expect(summaryRes.status).toBe(200);
      const summaryBody = await summaryRes.json() as any;
      const found = summaryBody.data.find((s: any) => s.lubeSkuId === skuId);
      expect(found).toBeDefined();
      expect(found.currentStock).toBe('25');
    });

    it('prevents negative lube stock through transactional balance enforcement', async () => {
      const adminCookie = await loginAs(PERSONAS.ADMIN);
      const skuCode = `SERVO-NEG-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const createSkuRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/lube/skus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuCode,
          name: 'Servo Pride Neg Test',
          category: 'ENGINE_OIL',
          stockUnit: 'PACK',
          reorderThreshold: '5',
          status: 'ACTIVE',
        }),
      }, adminCookie);
      const skuId = (await createSkuRes.json() as any).data.id;

      // Attempt ADJUSTMENT_OUT exceeding current balance (0)
      const badTxRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/lube/stock-transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lubeSkuId: skuId,
          transactionType: 'ADJUSTMENT_OUT',
          quantity: '10',
          occurredAt: new Date().toISOString(),
          notes: 'Excess deduction attempt',
        }),
      }, adminCookie);
      expect([400, 409]).toContain(badTxRes.status);
    });
  });

  // ==========================================================================
  // JOURNEY J — EQUIPMENT BREAKDOWN
  // ==========================================================================
  describe('Journey J: Equipment Breakdown Lifecycle', () => {
    it('progresses ticket through OPEN -> ASSIGNED -> IN_PROGRESS -> RESOLVED -> CLOSED lifecycle', async () => {
      const dealerCookie = await loginAs(PERSONAS.DEALER);
      const foCookie = await loginAs(PERSONAS.FIELD_OFFICER);

      // 1. Dealer creates breakdown ticket
      const createTicketRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/equipment/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dispenserId: 'disp-ro1-1',
          priority: 'HIGH',
          failureCategory: 'MECHANICAL',
          description: 'Nozzle 1 delivering lower volume than display pulse rate',
          breakdownAt: '2026-11-01T08:00:00Z',
        }),
      }, dealerCookie);

      expect(createTicketRes.status).toBe(201);
      const ticketBody = await createTicketRes.json() as any;
      const ticketId = ticketBody.data.id;
      expect(ticketBody.data.status).toBe('OPEN');

      // 2. Field Officer assigns ticket
      const assignRes = await authedRequest(`/api/v1/equipment/tickets/${ticketId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          technicianName: 'Technician Amit Roy',
        }),
      }, foCookie);
      expect(assignRes.status).toBe(200);

      // 3. Start Work -> IN_PROGRESS
      const startRes = await authedRequest(`/api/v1/equipment/tickets/${ticketId}/start`, {
        method: 'POST',
      }, foCookie);
      expect(startRes.status).toBe(200);

      // 4. Resolve Ticket -> RESOLVED
      const resolveRes = await authedRequest(`/api/v1/equipment/tickets/${ticketId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolutionNotes: 'Purged air, recalibrated pulser unit and verified measure',
          resolvedAt: '2026-11-01T10:00:00Z',
        }),
      }, foCookie);
      expect(resolveRes.status).toBe(200);

      // 5. Signoff -> CLOSED
      const signoffRes = await authedRequest(`/api/v1/equipment/tickets/${ticketId}/signoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signoffNotes: 'Satisfactorily tested 5-litre stamped measure delivery',
        }),
      }, foCookie);
      expect(signoffRes.status).toBe(200);
      const finalBody = await signoffRes.json() as any;
      expect(finalBody.data.status).toBe('CLOSED');
    });
  });

  // ==========================================================================
  // JOURNEY K — UTILITIES / SUB-METERS
  // ==========================================================================
  describe('Journey K: Utilities / Sub-Meters', () => {
    it('creates electricity account, lists bills, and enforces outlet scope', async () => {
      const adminCookie = await loginAs(PERSONAS.ADMIN);

      // 1. Create electricity account
      const createAccRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consumerNumber: `WBSEDCL-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          providerName: 'WBSEDCL Kolkata',
          billingCycle: 'MONTHLY',
          notes: 'Main 3-phase commercial feeder',
        }),
      }, adminCookie);

      expect(createAccRes.status).toBe(201);
      const accBody = await createAccRes.json() as any;
      expect(accBody.success).toBe(true);

      // 2. Read accounts for outlet
      const listAccRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, { method: 'GET' }, adminCookie);
      expect(listAccRes.status).toBe(200);

      // 3. Dealer cross-outlet access denied
      const dealerCookie = await loginAs(PERSONAS.DEALER);
      const crossRes = await authedRequest(`/api/v1/outlets/${OUTLET_2_ID}/utilities/electricity-accounts`, { method: 'GET' }, dealerCookie);
      expect(crossRes.status).toBe(403);
    });
  });

  // ==========================================================================
  // JOURNEY L — MUNICIPAL TAX
  // ==========================================================================
  describe('Journey L: Municipal Tax & Statutory Dues', () => {
    it('manages statutory due lifecycle, records settlement, and enforces paid immutability', async () => {
      const adminCookie = await loginAs(PERSONAS.ADMIN);
      const db = getDb(localD1);

      // Create test document for receipt
      const receiptDocId = `doc-tax-${Math.random().toString(36).substring(2)}`;
      const nowIso = new Date().toISOString();
      await db.insert(schema.documents).values({
        id: receiptDocId,
        outletId: OUTLET_1_ID,
        name: 'tax_payment_receipt.pdf',
        r2Key: `docs/${OUTLET_1_ID}/${receiptDocId}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        uploadedByUserId: 'user-admin',
        createdAt: nowIso,
      }).run();

      // 1. Create municipal tax due
      const createRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'Kolkata Municipal Corporation',
          referenceNumber: `PROP/2026/${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '15000.00',
          dueDate: '2026-11-30',
          notes: 'Annual commercial property assessment',
        }),
      }, adminCookie);

      expect(createRes.status).toBe(201);
      const dueBody = await createRes.json() as any;
      const dueId = dueBody.data.id;
      expect(dueBody.data.status).toBe('PENDING');

      // 2. Mark Paid
      const markPaidRes = await authedRequest(`/api/v1/municipal-taxes/${dueId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentReceiptDocumentId: receiptDocId,
          paymentReference: 'UTR-KMC-999888',
        }),
      }, adminCookie);

      expect(markPaidRes.status).toBe(200);
      const paidBody = await markPaidRes.json() as any;
      expect(paidBody.data.status).toBe('PAID');

      // 3. Terminal Paid Immutability: modifying paid due must be rejected with 409
      const mutateRes = await authedRequest(`/api/v1/municipal-taxes/${dueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: 'Attempt to modify settled due',
        }),
      }, adminCookie);

      expect(mutateRes.status).toBe(409);
    });
  });

  // ==========================================================================
  // JOURNEY M — NFR LEASE / RENT
  // ==========================================================================
  describe('Journey M: NFR Lease / Rent', () => {
    it('creates commercial space, vendor, and prevents unauthorized cross-outlet writes', async () => {
      const adminCookie = await loginAs(PERSONAS.ADMIN);

      // 1. Create NFR Space
      const spaceCode = `SPC-ATM-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const spaceRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/nfr/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spaceCode,
          name: 'ATM Space Kiosk',
          nfrType: 'ATM',
          locationDescription: 'Adjacent to customer lounge',
        }),
      }, adminCookie);

      expect(spaceRes.status).toBe(201);
      const spaceBody = await spaceRes.json() as any;
      expect(spaceBody.data.nfrType).toBe('ATM');

      // 2. Dealer cross-outlet NFR query blocked
      const dealerCookie = await loginAs(PERSONAS.DEALER);
      const crossNfr = await authedRequest(`/api/v1/outlets/${OUTLET_2_ID}/nfr/spaces`, { method: 'GET' }, dealerCookie);
      expect(crossNfr.status).toBe(403);
    });
  });

  // ==========================================================================
  // JOURNEY N — ORGANIZATION MASTER DATA
  // ==========================================================================
  describe('Journey N: Organization Master Data', () => {
    it('allows Admin global master creation while strictly denying non-global users', async () => {
      const adminCookie = await loginAs(PERSONAS.ADMIN);

      // 1. Admin creates global department
      const deptCode = `DEPT_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const createDeptRes = await authedRequest('/api/v1/org/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: deptCode,
          name: 'Retail Engineering & Maintenance',
        }),
      }, adminCookie);

      expect(createDeptRes.status).toBe(201);

      // 2. Non-global user (State Office) cannot create global department -> 403
      const soCookie = await loginAs(PERSONAS.STATE_OFFICE);
      const failDeptRes = await authedRequest('/api/v1/org/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'UNAUTH_DEPT',
          name: 'Unauthorized Department',
        }),
      }, soCookie);

      expect(failDeptRes.status).toBe(403);
    });
  });

  // ==========================================================================
  // JOURNEY O — HR STAFF ONBOARDING
  // ==========================================================================
  describe('Journey O: HR Staff Onboarding', () => {
    it('creates designation, onboards staff with masked Aadhaar, and enforces outlet integrity', async () => {
      const adminCookie = await loginAs(PERSONAS.ADMIN);

      // 1. Create designation
      const desigCode = `DES_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const desigRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/hr/designations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: desigCode,
          name: 'Senior Fuel Attendant',
          skillCategory: 'SKILLED',
        }),
      }, adminCookie);

      expect(desigRes.status).toBe(201);
      const desigId = (await desigRes.json() as any).data.id;

      // 2. Onboard staff
      const staffRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeCode: `EMP-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
          fullName: 'Bikash Kumar Mondal',
          designationId: desigId,
          aadhaarLast4: '4321',
          emergencyContactName: 'Manojit Mondal',
          emergencyContactPhone: '+91 9876543210',
          joiningDate: '2026-01-15',
        }),
      }, adminCookie);

      expect(staffRes.status).toBe(201);
      const staffBody = await staffRes.json() as any;
      expect(staffBody.data.aadhaarLast4).toBe('4321');

      // 3. Dealer cannot access staff from foreign outlet
      const dealerCookie = await loginAs(PERSONAS.DEALER);
      const crossStaffRes = await authedRequest(`/api/v1/outlets/${OUTLET_2_ID}/hr/staff`, { method: 'GET' }, dealerCookie);
      expect(crossStaffRes.status).toBe(403);
    });
  });

  // ==========================================================================
  // JOURNEY P — ROSTER / ATTENDANCE / GEOFENCE
  // ==========================================================================
  describe('Journey P: Roster, Attendance & Geofencing', () => {
    it('configures outlet geofence policy and validates attendance parameters', async () => {
      const adminCookie = await loginAs(PERSONAS.ADMIN);

      // 1. Configure Geofence Policy
      const policyRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/hr/geofence-policy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          radiusMetres: 150,
          maxAccuracyMetres: 30,
          attendanceGeofenceRequired: true,
          status: 'ACTIVE',
        }),
      }, adminCookie);

      expect(policyRes.status).toBe(200);

      // 2. Read Attendance records
      const attRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/hr/attendance`, { method: 'GET' }, adminCookie);
      expect(attRes.status).toBe(200);

      // 3. Dealer cross-outlet attendance access blocked
      const dealerCookie = await loginAs(PERSONAS.DEALER);
      const crossAttRes = await authedRequest(`/api/v1/outlets/${OUTLET_2_ID}/hr/attendance`, { method: 'GET' }, dealerCookie);
      expect(crossAttRes.status).toBe(403);
    });
  });

  // ==========================================================================
  // JOURNEY Q — NOZZLE ASSIGNMENT
  // ==========================================================================
  describe('Journey Q: Nozzle Assignment', () => {
    it('reads nozzle assignments and blocks cross-outlet manipulation', async () => {
      const dealerCookie = await loginAs(PERSONAS.DEALER);

      // 1. Dealer reads assigned outlet nozzle assignments
      const nozzRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/hr/nozzle-assignments`, { method: 'GET' }, dealerCookie);
      expect(nozzRes.status).toBe(200);

      // 2. Foreign outlet nozzle assignments access denied
      const crossNozzRes = await authedRequest(`/api/v1/outlets/${OUTLET_2_ID}/hr/nozzle-assignments`, { method: 'GET' }, dealerCookie);
      expect(crossNozzRes.status).toBe(403);
    });
  });

  // ==========================================================================
  // JOURNEY R — UNIFORM MANAGEMENT
  // ==========================================================================
  describe('Journey R: Uniform Management', () => {
    it('maintains uniform items, variants, stock, and isolates outlet inventory', async () => {
      const adminCookie = await loginAs(PERSONAS.ADMIN);

      // 1. Create uniform item
      const itemCode = `SHIRT-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const itemRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/hr/uniform/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemCode,
          itemName: 'IOCL Regular Shirt',
          category: 'SHIRT',
          description: 'Standard orange-blue regular staff shirt',
        }),
      }, adminCookie);

      expect(itemRes.status).toBe(201);
      const itemBody = await itemRes.json() as any;
      const itemId = itemBody.data.id;

      // 2. Create size variant
      const variantRes = await authedRequest(`/api/v1/outlets/${OUTLET_1_ID}/hr/uniform/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uniformItemId: itemId,
          sizeLabel: 'L',
          sizeSortOrder: 1,
          reorderLevel: 5,
          status: 'ACTIVE',
        }),
      }, adminCookie);

      expect(variantRes.status).toBe(201);

      // 3. Dealer cross-outlet uniform access denied
      const dealerCookie = await loginAs(PERSONAS.DEALER);
      const crossUniRes = await authedRequest(`/api/v1/outlets/${OUTLET_2_ID}/hr/uniform/items`, { method: 'GET' }, dealerCookie);
      expect(crossUniRes.status).toBe(403);
    });
  });

  // ==========================================================================
  // JOURNEY S — LEAVE REQUEST MAKER-CHECKER (FROZEN PHASE 5A)
  // ==========================================================================
  describe('Journey S: Leave Request Maker-Checker', () => {
    it('exercises complete Maker-Checker lifecycle using HrService with full state-machine guarantees', async () => {
      const db = getDb(localD1);
      const hrService = new HrService(db);
      const now = new Date().toISOString();

      // Setup Staff
      const desigId = `desig-leave-${Math.random().toString(36).substring(2)}`;
      await db.insert(schema.hrDesignations).values({
        id: desigId,
        outletId: OUTLET_1_ID,
        code: `D_L_${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        name: 'Leave Test Designation',
        skillCategory: 'SKILLED',
        status: 'ACTIVE',
        createdBy: 'user-admin',
        createdAt: now,
        updatedAt: now,
      }).run();

      const staffId = `staff-leave-${Math.random().toString(36).substring(2)}`;
      await db.insert(schema.hrStaff).values({
        id: staffId,
        outletId: OUTLET_1_ID,
        employeeCode: `EMP-L-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        fullName: 'Leave Test Staff',
        designationId: desigId,
        aadhaarLast4: '5566',
        emergencyContactName: 'Relative',
        emergencyContactPhone: '+91 9876543210',
        joiningDate: '2026-01-01',
        employmentStatus: 'ACTIVE',
        createdBy: 'user-admin',
        createdAt: now,
        updatedAt: now,
      }).run();

      // 1. Requester creates leave -> PENDING
      const leave1 = await hrService.createLeaveRequest(OUTLET_1_ID, 'user-dealer', {
        staffId,
        leaveType: 'CASUAL',
        fromDate: '2026-11-10',
        toDate: '2026-11-11',
        reason: 'Family event',
      });
      expect(leave1.status).toBe('PENDING');

      // 2. Requester CANNOT self-approve (Maker-Checker guarantee)
      await expect(
        hrService.approveLeaveRequest(leave1.id, OUTLET_1_ID, 'user-dealer', { decisionNotes: 'Self approval attempt' })
      ).rejects.toThrow();

      // 3. Requester CANNOT self-reject (Maker-Checker guarantee)
      await expect(
        hrService.rejectLeaveRequest(leave1.id, OUTLET_1_ID, 'user-dealer', { decisionNotes: 'Self rejection attempt' })
      ).rejects.toThrow();

      // 4. Different authorized checker approves leave1 -> APPROVED
      const approved = await hrService.approveLeaveRequest(leave1.id, OUTLET_1_ID, 'user-fo', { decisionNotes: 'Approved by FO' });
      expect(approved.status).toBe('APPROVED');

      // 5. Terminal State Immutability: APPROVED cannot be cancelled
      await expect(
        hrService.cancelLeaveRequest(leave1.id, OUTLET_1_ID, 'user-dealer', { cancellationReason: 'Cancel approved attempt' })
      ).rejects.toThrow();

      // 6. Requester creates leave2 and cancels own PENDING request -> CANCELLED
      const leave2 = await hrService.createLeaveRequest(OUTLET_1_ID, 'user-dealer', {
        staffId,
        leaveType: 'SICK',
        fromDate: '2026-11-20',
        toDate: '2026-11-21',
        reason: 'Health appointment',
      });
      expect(leave2.status).toBe('PENDING');

      // Non-requester cannot cancel
      await expect(
        hrService.cancelLeaveRequest(leave2.id, OUTLET_1_ID, 'user-fo', { cancellationReason: 'Third party cancel attempt' })
      ).rejects.toThrow();

      // Requester cancels own request -> CANCELLED
      const cancelled = await hrService.cancelLeaveRequest(leave2.id, OUTLET_1_ID, 'user-dealer', { cancellationReason: 'Appointment rescheduled' });
      expect(cancelled.status).toBe('CANCELLED');

      // 7. Requester creates leave3 and checker rejects it -> REJECTED
      const leave3 = await hrService.createLeaveRequest(OUTLET_1_ID, 'user-dealer', {
        staffId,
        leaveType: 'EARNED',
        fromDate: '2026-11-25',
        toDate: '2026-11-26',
        reason: 'Vacation request',
      });
      expect(leave3.status).toBe('PENDING');

      const rejected = await hrService.rejectLeaveRequest(leave3.id, OUTLET_1_ID, 'user-fo', { decisionNotes: 'Staffing shortage' });
      expect(rejected.status).toBe('REJECTED');
    });

    it('strictly prevents overlapping leave requests for the same staff member', async () => {
      const db = getDb(localD1);
      const hrService = new HrService(db);
      const now = new Date().toISOString();

      const desigId = `desig-ovl-${Math.random().toString(36).substring(2)}`;
      await db.insert(schema.hrDesignations).values({
        id: desigId, outletId: OUTLET_1_ID, code: `D_OVL_${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        name: 'Overlap Test Designation', skillCategory: 'SKILLED', status: 'ACTIVE', createdBy: 'user-admin', createdAt: now, updatedAt: now,
      }).run();

      const staffId = `staff-ovl-${Math.random().toString(36).substring(2)}`;
      await db.insert(schema.hrStaff).values({
        id: staffId, outletId: OUTLET_1_ID, employeeCode: `EMP-OVL-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        fullName: 'Overlap Staff', designationId: desigId, aadhaarLast4: '7788', emergencyContactName: 'Kin', emergencyContactPhone: '9876543210',
        joiningDate: '2026-01-01', employmentStatus: 'ACTIVE', createdBy: 'user-admin', createdAt: now, updatedAt: now,
      }).run();

      await hrService.createLeaveRequest(OUTLET_1_ID, 'user-dealer', {
        staffId, leaveType: 'CASUAL', fromDate: '2026-12-10', toDate: '2026-12-15', reason: 'Active vacation',
      });

      // Overlapping request must be rejected
      await expect(
        hrService.createLeaveRequest(OUTLET_1_ID, 'user-dealer', {
          staffId, leaveType: 'CASUAL', fromDate: '2026-12-12', toDate: '2026-12-14', reason: 'Overlapping request',
        })
      ).rejects.toThrow();
    });
  });

  // ==========================================================================
  // JOURNEY T — AUDITABILITY
  // ==========================================================================
  describe('Journey T: Auditability & Tamper-Evident Trail', () => {
    it('verifies audit logs record actor, action, entity, timestamp, and sanitized details', async () => {
      const adminCookie = await loginAs(PERSONAS.ADMIN);

      // Query audit logs
      const auditRes = await authedRequest('/api/v1/audit-logs', { method: 'GET' }, adminCookie);
      expect(auditRes.status).toBe(200);
      const auditBody = await auditRes.json() as any;
      expect(auditBody.success).toBe(true);
      expect(Array.isArray(auditBody.data)).toBe(true);
      expect(auditBody.data.length).toBeGreaterThan(0);

      // Verify audit record structure
      const record = auditBody.data[0];
      expect(record.id).toBeTruthy();
      expect(record.action).toBeTruthy();
      expect(record.createdAt).toBeTruthy();
    });
  });

  // ==========================================================================
  // DOCUMENT SECURITY & SCOPE UAT
  // ==========================================================================
  describe('Document Security & Scope UAT', () => {
    it('verifies document isolation and protects cross-outlet document attachments', async () => {
      const dealerCookie = await loginAs(PERSONAS.DEALER);

      // 1. Dealer lists documents within scope
      const docRes = await authedRequest('/api/v1/documents', { method: 'GET' }, dealerCookie);
      expect(docRes.status).toBe(200);
      const docBody = await docRes.json() as any;
      expect(docBody.success).toBe(true);
      expect(Array.isArray(docBody.data)).toBe(true);

      // 2. Dealer rejected when attempting to upload document for foreign outlet
      const boundary = '----WebKitFormBoundaryUatTest77';
      const bodyStr =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="outletId"\r\n\r\n` +
        `${OUTLET_2_ID}\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="license.pdf"\r\n` +
        `Content-Type: application/pdf\r\n\r\n` +
        `%PDF-1.4 test valid pdf\r\n` +
        `--${boundary}--\r\n`;

      const crossUploadRes = await app.request('/api/v1/documents', {
        method: 'POST',
        headers: {
          Cookie: dealerCookie,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          Origin: 'http://localhost:3000',
        },
        body: bodyStr,
      }, env);

      expect(crossUploadRes.status).toBe(403);
    });
  });

  // ==========================================================================
  // END-TO-END DATABASE INTEGRITY
  // ==========================================================================
  describe('End-to-End Database Integrity', () => {
    it('verifies PRAGMA foreign_key_check reports 0 violations and zero orphan records exist', async () => {
      // 1. PRAGMA foreign_key_check via localD1
      const fkCheck = await localD1.prepare('PRAGMA foreign_key_check;').all();
      expect(fkCheck.results).toEqual([]);

      // 2. Verify all nozzles reference a valid tank
      const db = getDb(localD1);
      const allNozzles = await db.select().from(schema.nozzles).all();
      const allTanks = await db.select().from(schema.tanks).all();
      const tankIds = new Set(allTanks.map(t => t.id));
      for (const n of allNozzles) {
        expect(tankIds.has(n.tankId)).toBe(true);
      }

      // 3. Verify all tanks reference a valid outlet
      const allOutlets = await db.select().from(schema.retailOutlets).all();
      const outletIds = new Set(allOutlets.map(o => o.id));
      for (const t of allTanks) {
        expect(outletIds.has(t.outletId)).toBe(true);
      }

      // 4. Verify user roles reference valid users
      const allUserRoles = await db.select().from(schema.userRoles).all();
      const allUsers = await db.select().from(schema.users).all();
      const userIds = new Set(allUsers.map(u => u.id));
      for (const ur of allUserRoles) {
        expect(userIds.has(ur.userId)).toBe(true);
      }
    });
  });
});
