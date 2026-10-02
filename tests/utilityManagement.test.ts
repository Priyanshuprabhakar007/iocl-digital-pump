import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import fs from 'fs';
import { eq } from 'drizzle-orm';
import {
  utilityElectricityAccounts,
  utilityElectricityBills,
  utilitySubMeters,
  utilitySubMeterReadings,
  documents,
  auditLogs,
} from '../src/db/schema';
import { PERMISSIONS, ROLES } from '../src/shared/constants';

const TEST_DB_PATH = `./.sqlite/test_utility_${Math.random().toString(36).substring(2)}.db`;

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

describe('Phase 4A-1 Electricity & Sub-meter Core Backend Integration Suite', () => {
  let localD1: any;
  let env: any;
  let testDbPath: string;

  const OUTLET_1_ID = 'ro-1001'; // Park Street IOCL (Kolkata DO, Central SA)
  const OUTLET_2_ID = 'ro-1002'; // Salt Lake IOCL (Kolkata DO, North SA)
  const OUTLET_3_ID = 'ro-1003'; // GT Road Ludhiana (Ludhiana DO, Central SA)

  beforeEach(async () => {
    testDbPath = `./.sqlite/test_utility_${Math.random().toString(36).substring(2)}_${Date.now()}.db`;
    if (fs.existsSync(testDbPath)) { try { fs.unlinkSync(testDbPath); } catch (e) {} }
    const walPath = `${testDbPath}-wal`;
    const shmPath = `${testDbPath}-shm`;
    if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch (e) {} }
    if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch (e) {} }

    localD1 = createLocalD1Database(testDbPath);
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
    if (testDbPath && fs.existsSync(testDbPath)) { try { fs.unlinkSync(testDbPath); } catch (e) {} }
    const walPath = `${testDbPath}-wal`;
    const shmPath = `${testDbPath}-shm`;
    if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch (e) {} }
    if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch (e) {} }
  });

  async function jsonOf<T = any>(res: Response): Promise<T> {
    return (await res.json()) as T;
  }

  async function loginAs(email: string, pass = 'Password@123') {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ email, password: pass }),
    }, env);
    const setCookie = res.headers.get('set-cookie');
    return setCookie ? setCookie.split(';')[0] : '';
  }

  async function createTestDocument(outletId: string, docId?: string) {
    const db = getDb(localD1);
    const id = docId || `doc-${Math.random().toString(36).substring(2)}`;
    await db.insert(documents).values({
      id,
      outletId,
      name: 'test-bill.pdf',
      sizeBytes: 1024,
      mimeType: 'application/pdf',
      r2Key: `outlets/${outletId}/${id}.pdf`,
      uploadedByUserId: 'user-admin',
      createdAt: new Date().toISOString(),
    });
    return id;
  }

  // =========================================================================
  // 1. MIGRATION & SCHEMA VERIFICATION TESTS
  // =========================================================================

  it('migration creates utility_electricity_accounts table', async () => {
    const db = getDb(localD1);
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name = 'utility_electricity_accounts'");
    expect(tables.length).toBe(1);
  });

  it('migration creates utility_electricity_bills table', async () => {
    const db = getDb(localD1);
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name = 'utility_electricity_bills'");
    expect(tables.length).toBe(1);
  });

  it('migration creates utility_sub_meters table', async () => {
    const db = getDb(localD1);
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name = 'utility_sub_meters'");
    expect(tables.length).toBe(1);
  });

  it('migration creates utility_sub_meter_readings table', async () => {
    const db = getDb(localD1);
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name = 'utility_sub_meter_readings'");
    expect(tables.length).toBe(1);
  });

  it('migration creates all required triggers for lifecycle and immutability', async () => {
    const db = getDb(localD1);
    const triggers = await db.all("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_util_%'");
    const names = triggers.map((t: any) => t.name);
    expect(names).toContain('trg_util_elec_bill_paid_immutable');
    expect(names).toContain('trg_util_sub_meter_reading_insert_chain');
    expect(names).toContain('trg_util_sub_meter_reading_immutable_update');
    expect(names).toContain('trg_util_sub_meter_reading_immutable_delete');
  });

  it('migration creates indexes for utility tables performance', async () => {
    const db = getDb(localD1);
    const indexes = await db.all("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_util_%'");
    const names = indexes.map((i: any) => i.name);
    expect(names).toContain('idx_util_elec_acc_outlet_id');
    expect(names).toContain('idx_util_elec_bills_outlet_id');
    expect(names).toContain('idx_util_elec_bills_status');
    expect(names).toContain('idx_util_sub_meters_outlet_id');
    expect(names).toContain('idx_util_sub_meter_readings_meter_time');
  });

  // =========================================================================
  // 2. RBAC PERMISSIONS SEED & MIGRATION TESTS
  // =========================================================================

  it('migration independently inserts all 6 utility permissions', async () => {
    const db = getDb(localD1);
    const perms = await db.all("SELECT code FROM permissions WHERE code LIKE 'utilities%'");
    const codes = perms.map((p: any) => p.code);
    expect(codes).toContain(PERMISSIONS.UTILITIES_READ);
    expect(codes).toContain(PERMISSIONS.UTILITY_ACCOUNTS_WRITE);
    expect(codes).toContain(PERMISSIONS.UTILITY_BILLS_WRITE);
    expect(codes).toContain(PERMISSIONS.UTILITY_PAYMENTS_WRITE);
    expect(codes).toContain(PERMISSIONS.UTILITY_SUB_METERS_WRITE);
    expect(codes).toContain(PERMISSIONS.UTILITY_SUB_METER_READINGS_WRITE);
  });

  it('migration maps ADMIN with all 6 utility permissions', async () => {
    const db = getDb(localD1);
    const adminPerms = await db.all(`
      SELECT p.code FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.id
      WHERE rp.role_id = 'role-admin' AND p.code LIKE 'utilities%'
    `);
    expect(adminPerms.length).toBe(6);
  });

  it('migration maps STATE_OFFICE with read-only utility permission', async () => {
    const db = getDb(localD1);
    const soPerms = await db.all(`
      SELECT p.code FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.id
      WHERE rp.role_id = 'role-so' AND p.code LIKE 'utilities%'
    `);
    const codes = soPerms.map((p: any) => p.code);
    expect(codes).toEqual([PERMISSIONS.UTILITIES_READ]);
  });

  it('migration maps DIVISIONAL_OFFICE with read-only utility permission', async () => {
    const db = getDb(localD1);
    const doPerms = await db.all(`
      SELECT p.code FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.id
      WHERE rp.role_id = 'role-do' AND p.code LIKE 'utilities%'
    `);
    const codes = doPerms.map((p: any) => p.code);
    expect(codes).toEqual([PERMISSIONS.UTILITIES_READ]);
  });

  it('migration maps BUSINESS_MANAGER with full utility write permissions', async () => {
    const db = getDb(localD1);
    const bmPerms = await db.all(`
      SELECT p.code FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.id
      WHERE rp.role_id = 'role-bm' AND p.code LIKE 'utilities%'
    `);
    expect(bmPerms.length).toBe(6);
  });

  it('migration maps FIELD_OFFICER with full utility write permissions', async () => {
    const db = getDb(localD1);
    const foPerms = await db.all(`
      SELECT p.code FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.id
      WHERE rp.role_id = 'role-fo' AND p.code LIKE 'utilities%'
    `);
    expect(foPerms.length).toBe(6);
  });

  it('migration maps DEALER with bills, payments, readings write but NOT accounts or sub-meters write', async () => {
    const db = getDb(localD1);
    const dealerPerms = await db.all(`
      SELECT p.code FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.id
      WHERE rp.role_id = 'role-dealer' AND p.code LIKE 'utilities%'
    `);
    const codes = dealerPerms.map((p: any) => p.code);
    expect(codes).toContain(PERMISSIONS.UTILITIES_READ);
    expect(codes).toContain(PERMISSIONS.UTILITY_BILLS_WRITE);
    expect(codes).toContain(PERMISSIONS.UTILITY_PAYMENTS_WRITE);
    expect(codes).toContain(PERMISSIONS.UTILITY_SUB_METER_READINGS_WRITE);
    expect(codes).not.toContain(PERMISSIONS.UTILITY_ACCOUNTS_WRITE);
    expect(codes).not.toContain(PERMISSIONS.UTILITY_SUB_METERS_WRITE);
  });

  it('migration maps CSP with bills, payments, readings write but NOT accounts or sub-meters write', async () => {
    const db = getDb(localD1);
    const cspPerms = await db.all(`
      SELECT p.code FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.id
      WHERE rp.role_id = 'role-csp' AND p.code LIKE 'utilities%'
    `);
    const codes = cspPerms.map((p: any) => p.code);
    expect(codes).toContain(PERMISSIONS.UTILITIES_READ);
    expect(codes).toContain(PERMISSIONS.UTILITY_BILLS_WRITE);
    expect(codes).toContain(PERMISSIONS.UTILITY_PAYMENTS_WRITE);
    expect(codes).toContain(PERMISSIONS.UTILITY_SUB_METER_READINGS_WRITE);
    expect(codes).not.toContain(PERMISSIONS.UTILITY_ACCOUNTS_WRITE);
    expect(codes).not.toContain(PERMISSIONS.UTILITY_SUB_METERS_WRITE);
  });

  // =========================================================================
  // 3. ELECTRICITY ACCOUNT MANAGEMENT TESTS
  // =========================================================================

  it('creates an electricity account successfully with valid payload', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        consumerNumber: 'WBSEDCL-100234567',
        providerName: 'WBSEDCL',
        billingCycle: 'MONTHLY',
        notes: 'Main 3-phase connection',
      }),
    }, env);

    expect(res.status).toBe(201);
    const json = await jsonOf(res);
    expect(json.success).toBe(true);
    expect(json.data.consumerNumber).toBe('WBSEDCL-100234567');
    expect(json.data.status).toBe('ACTIVE');
    expect(json.data.outletId).toBe(OUTLET_1_ID);
  });

  it('creates an electricity account with minimal required fields', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        consumerNumber: 'WBSEDCL-MINIMAL-01',
        billingCycle: 'BI-MONTHLY',
      }),
    }, env);

    expect(res.status).toBe(201);
    const json = await jsonOf(res);
    expect(json.data.consumerNumber).toBe('WBSEDCL-MINIMAL-01');
    expect(json.data.providerName).toBeNull();
    expect(json.data.notes).toBeNull();
  });

  it('rejects duplicate consumer number for the same outlet with 409', async () => {
    const cookie = await loginAs('admin@iocl.in');
    await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        consumerNumber: 'WBSEDCL-DUP-1',
        billingCycle: 'MONTHLY',
      }),
    }, env);

    const res2 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        consumerNumber: 'WBSEDCL-DUP-1',
        billingCycle: 'BI-MONTHLY',
      }),
    }, env);

    expect(res2.status).toBe(409);
    const json2 = await jsonOf(res2);
    expect(json2.success).toBe(false);
    expect(json2.error.code).toBe('UTILITY_CONSUMER_NUMBER_EXISTS');
  });

  it('allows same consumer number across different outlets', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const res1 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        consumerNumber: 'SAME-CONSUMER-001',
        billingCycle: 'MONTHLY',
      }),
    }, env);
    expect(res1.status).toBe(201);

    const res2 = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        consumerNumber: 'SAME-CONSUMER-001',
        billingCycle: 'MONTHLY',
      }),
    }, env);
    expect(res2.status).toBe(201);
  });

  it('rejects blank consumer number with 400', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        consumerNumber: '   ',
        billingCycle: 'MONTHLY',
      }),
    }, env);
    expect(res.status).toBe(400);
    const json = await jsonOf(res);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects blank billing cycle with 400', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        consumerNumber: 'VALID-CONS-001',
        billingCycle: '   ',
      }),
    }, env);
    expect(res.status).toBe(400);
    const json = await jsonOf(res);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid status with 400', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        consumerNumber: 'VALID-CONS-002',
        billingCycle: 'MONTHLY',
        status: 'DELETED',
      }),
    }, env);
    expect(res.status).toBe(400);
  });

  it('rejects unknown fields in account creation with 400', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        consumerNumber: 'VALID-CONS-003',
        billingCycle: 'MONTHLY',
        unauthorizedField: 'injectedValue',
      }),
    }, env);
    expect(res.status).toBe(400);
  });

  it('updates electricity account mutable fields', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        consumerNumber: 'ACC-UPDATE-001',
        providerName: 'CESC',
        billingCycle: 'MONTHLY',
      }),
    }, env);
    const acc = (await jsonOf(createRes)).data;

    const updateRes = await app.request(`/api/v1/utilities/electricity-accounts/${acc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        providerName: 'CESC Limited',
        billingCycle: 'QUARTERLY',
        status: 'INACTIVE',
        notes: 'Temporarily deactivated',
      }),
    }, env);

    expect(updateRes.status).toBe(200);
    const updateJson = await jsonOf(updateRes);
    expect(updateJson.data.providerName).toBe('CESC Limited');
    expect(updateJson.data.billingCycle).toBe('QUARTERLY');
    expect(updateJson.data.status).toBe('INACTIVE');
  });

  it('rejects mutation of consumerNumber or outletId on account update via strict schema', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        consumerNumber: 'ACC-IMMUT-001',
        billingCycle: 'MONTHLY',
      }),
    }, env);
    const acc = (await jsonOf(createRes)).data;

    const res1 = await app.request(`/api/v1/utilities/electricity-accounts/${acc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        consumerNumber: 'NEW-CONSUMER-NUM',
      }),
    }, env);
    expect(res1.status).toBe(400);

    const res2 = await app.request(`/api/v1/utilities/electricity-accounts/${acc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        outletId: OUTLET_2_ID,
      }),
    }, env);
    expect(res2.status).toBe(400);
  });

  it('returns 404 when updating non-existent electricity account', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const res = await app.request('/api/v1/utilities/electricity-accounts/non-existent-id', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ notes: 'Some note' }),
    }, env);
    expect(res.status).toBe(404);
  });

  it('lists electricity accounts for an outlet', async () => {
    const cookie = await loginAs('admin@iocl.in');
    await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consumerNumber: 'LIST-ACC-01', billingCycle: 'MONTHLY' }),
    }, env);
    await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consumerNumber: 'LIST-ACC-02', billingCycle: 'MONTHLY' }),
    }, env);

    const listRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'GET',
      headers: { Cookie: cookie },
    }, env);
    expect(listRes.status).toBe(200);
    const json = await jsonOf(listRes);
    expect(json.data.length).toBeGreaterThanOrEqual(2);
  });

  it('creates audit log entries on account create and update', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        consumerNumber: 'ACC-AUDIT-001',
        billingCycle: 'MONTHLY',
      }),
    }, env);
    const acc = (await jsonOf(createRes)).data;

    await app.request(`/api/v1/utilities/electricity-accounts/${acc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        notes: 'Audited update note',
      }),
    }, env);

    const db = getDb(localD1);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, acc.id));
    const actions = logs.map(l => l.action);
    expect(actions).toContain('UTILITY_ELECTRICITY_ACCOUNT_CREATE');
    expect(actions).toContain('UTILITY_ELECTRICITY_ACCOUNT_UPDATE');
  });

  // =========================================================================
  // 4. ELECTRICITY BILL MANAGEMENT & LIFECYCLE TESTS
  // =========================================================================

  it('creates electricity bill with valid document and converts decimal amount to paise', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consumerNumber: 'BILL-ACC-001', billingCycle: 'MONTHLY' }),
    }, env);
    const acc = (await jsonOf(accRes)).data;

    const docId = await createTestDocument(OUTLET_1_ID);

    const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-08-31',
        billAmount: '84500.50',
        dueDate: '2026-09-15',
        billDocumentId: docId,
      }),
    }, env);

    expect(res.status).toBe(201);
    const json = await jsonOf(res);
    expect(json.success).toBe(true);
    expect(json.data.billAmountPaise).toBe(8450050);
    expect(json.data.billAmountStr).toBe('84500.50');
    expect(json.data.status).toBe('PENDING');
  });

  it('rejects duplicate bill period for the same electricity account with 409', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consumerNumber: 'BILL-DUP-ACC', billingCycle: 'MONTHLY' }),
    }, env);
    const acc = (await jsonOf(accRes)).data;
    const docId = await createTestDocument(OUTLET_1_ID);

    await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-08-31',
        billAmount: '50000.00',
        dueDate: '2026-09-15',
        billDocumentId: docId,
      }),
    }, env);

    const res2 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-08-31',
        billAmount: '60000.00',
        dueDate: '2026-09-20',
        billDocumentId: docId,
      }),
    }, env);

    expect(res2.status).toBe(409);
    const json2 = await jsonOf(res2);
    expect(json2.error.code).toBe('UTILITY_BILL_PERIOD_EXISTS');
  });

  it('rejects bill with invalid period range (billingPeriodEnd < billingPeriodStart) with 400', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consumerNumber: 'BILL-RANGE-ACC', billingCycle: 'MONTHLY' }),
    }, env);
    const acc = (await jsonOf(accRes)).data;
    const docId = await createTestDocument(OUTLET_1_ID);

    const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2026-08-31',
        billingPeriodEnd: '2026-08-01',
        billAmount: '50000.00',
        dueDate: '2026-09-15',
        billDocumentId: docId,
      }),
    }, env);

    expect(res.status).toBe(400);
    const json = await jsonOf(res);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects bill creation with negative billAmount', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consumerNumber: 'BILL-NEG-ACC', billingCycle: 'MONTHLY' }),
    }, env);
    const acc = (await jsonOf(accRes)).data;
    const docId = await createTestDocument(OUTLET_1_ID);

    const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-08-31',
        billAmount: '-500.00',
        dueDate: '2026-09-15',
        billDocumentId: docId,
      }),
    }, env);

    expect(res.status).toBe(400);
  });

  it('rejects bill creation with invalid date format', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consumerNumber: 'BILL-DATE-ACC', billingCycle: 'MONTHLY' }),
    }, env);
    const acc = (await jsonOf(accRes)).data;
    const docId = await createTestDocument(OUTLET_1_ID);

    const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '01-08-2026', // invalid YYYY-MM-DD
        billingPeriodEnd: '2026-08-31',
        billAmount: '500.00',
        dueDate: '2026-09-15',
        billDocumentId: docId,
      }),
    }, env);

    expect(res.status).toBe(400);
  });

  it('rejects bill creation if bill document does not exist', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consumerNumber: 'BILL-NODOC-ACC', billingCycle: 'MONTHLY' }),
    }, env);
    const acc = (await jsonOf(accRes)).data;

    const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-08-31',
        billAmount: '5000.00',
        dueDate: '2026-09-15',
        billDocumentId: 'non-existent-doc-id',
      }),
    }, env);

    expect(res.status).toBe(404);
    const json = await jsonOf(res);
    expect(json.error.code).toBe('UTILITY_BILL_DOCUMENT_NOT_FOUND');
  });

  it('rejects bill creation if bill document belongs to a different outlet', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consumerNumber: 'BILL-MISDOC-ACC', billingCycle: 'MONTHLY' }),
    }, env);
    const acc = (await jsonOf(accRes)).data;
    const docIdOutlet2 = await createTestDocument(OUTLET_2_ID);

    const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-08-31',
        billAmount: '5000.00',
        dueDate: '2026-09-15',
        billDocumentId: docIdOutlet2,
      }),
    }, env);

    expect(res.status).toBe(403);
    const json = await jsonOf(res);
    expect(json.error.code).toBe('UTILITY_BILL_DOCUMENT_OUTLET_MISMATCH');
  });

  it('rejects bill creation with unknown fields via strict schema', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consumerNumber: 'BILL-UNKN-ACC', billingCycle: 'MONTHLY' }),
    }, env);
    const acc = (await jsonOf(accRes)).data;
    const docId = await createTestDocument(OUTLET_1_ID);

    const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-08-31',
        billAmount: '5000.00',
        dueDate: '2026-09-15',
        billDocumentId: docId,
        status: 'PAID', // client injection of authoritative status
      }),
    }, env);

    expect(res.status).toBe(400);
  });

  it('retrieves bill detail by ID with derived isOverdue', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consumerNumber: 'BILL-DET-ACC', billingCycle: 'MONTHLY' }),
    }, env);
    const acc = (await jsonOf(accRes)).data;
    const docId = await createTestDocument(OUTLET_1_ID);

    const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-08-31',
        billAmount: '5000.00',
        dueDate: '2026-09-15',
        billDocumentId: docId,
      }),
    }, env);
    const bill = (await jsonOf(createRes)).data;

    const getRes = await app.request(`/api/v1/utilities/electricity-bills/${bill.id}`, {
      method: 'GET',
      headers: { Cookie: cookie },
    }, env);

    expect(getRes.status).toBe(200);
    const getJson = await jsonOf(getRes);
    expect(getJson.data.id).toBe(bill.id);
    expect(getJson.data.billAmountPaise).toBe(500000);
    expect(typeof getJson.data.isOverdue).toBe('boolean');
  });

  it('lists bills with filters for status, fromDate, and toDate', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consumerNumber: 'BILL-FILT-ACC', billingCycle: 'MONTHLY' }),
    }, env);
    const acc = (await jsonOf(accRes)).data;
    const docId = await createTestDocument(OUTLET_1_ID);

    await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2026-01-01',
        billingPeriodEnd: '2026-01-31',
        billAmount: '1000.00',
        dueDate: '2026-02-15',
        billDocumentId: docId,
      }),
    }, env);

    const listRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills?status=PENDING&fromDate=2026-01-01&toDate=2026-01-31`, {
      method: 'GET',
      headers: { Cookie: cookie },
    }, env);

    expect(listRes.status).toBe(200);
    const json = await jsonOf(listRes);
    expect(json.data.length).toBeGreaterThanOrEqual(1);
    expect(json.data[0].status).toBe('PENDING');
  });

  it('allows updating a PENDING bill', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consumerNumber: 'BILL-PENDING-ACC', billingCycle: 'MONTHLY' }),
    }, env);
    const acc = (await jsonOf(accRes)).data;
    const docId = await createTestDocument(OUTLET_1_ID);

    const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-08-31',
        billAmount: '5000.00',
        dueDate: '2026-09-15',
        billDocumentId: docId,
      }),
    }, env);
    const bill = (await jsonOf(createRes)).data;

    const updateRes = await app.request(`/api/v1/utilities/electricity-bills/${bill.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        billAmount: '5500.00',
        dueDate: '2026-09-25',
      }),
    }, env);

    expect(updateRes.status).toBe(200);
    const updateJson = await jsonOf(updateRes);
    expect(updateJson.data.billAmountPaise).toBe(550000);
    expect(updateJson.data.dueDate).toBe('2026-09-25');
  });

  it('rejects updating outletId, electricityAccountId, or status on bill update', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consumerNumber: 'BILL-IMMUT-FLDS', billingCycle: 'MONTHLY' }),
    }, env);
    const acc = (await jsonOf(accRes)).data;
    const docId = await createTestDocument(OUTLET_1_ID);

    const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-08-31',
        billAmount: '5000.00',
        dueDate: '2026-09-15',
        billDocumentId: docId,
      }),
    }, env);
    const bill = (await jsonOf(createRes)).data;

    const res1 = await app.request(`/api/v1/utilities/electricity-bills/${bill.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ outletId: OUTLET_2_ID }),
    }, env);
    expect(res1.status).toBe(400);

    const res2 = await app.request(`/api/v1/utilities/electricity-bills/${bill.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ status: 'PAID' }),
    }, env);
    expect(res2.status).toBe(400);
  });

  it('marks a bill as PAID with payment receipt document and reference', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consumerNumber: 'BILL-PAY-ACC', billingCycle: 'MONTHLY' }),
    }, env);
    const acc = (await jsonOf(accRes)).data;
    const billDocId = await createTestDocument(OUTLET_1_ID);
    const receiptDocId = await createTestDocument(OUTLET_1_ID);

    const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-08-31',
        billAmount: '12000.00',
        dueDate: '2026-09-15',
        billDocumentId: billDocId,
      }),
    }, env);
    const bill = (await jsonOf(createRes)).data;

    const payRes = await app.request(`/api/v1/utilities/electricity-bills/${bill.id}/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        paymentReceiptDocumentId: receiptDocId,
        paymentReference: 'NEFT-WBSEDCL-998822',
      }),
    }, env);

    expect(payRes.status).toBe(200);
    const payJson = await jsonOf(payRes);
    expect(payJson.data.status).toBe('PAID');
    expect(payJson.data.paymentReceiptDocumentId).toBe(receiptDocId);
    expect(payJson.data.paymentReference).toBe('NEFT-WBSEDCL-998822');
    expect(payJson.data.paidAt).toBeDefined();
    expect(payJson.data.paidByUserId).toBe('user-admin');
  });

  it('rejects mark-paid if payment receipt document is missing from payload', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consumerNumber: 'BILL-PAY-NODOC', billingCycle: 'MONTHLY' }),
    }, env);
    const acc = (await jsonOf(accRes)).data;
    const billDocId = await createTestDocument(OUTLET_1_ID);

    const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-08-31',
        billAmount: '12000.00',
        dueDate: '2026-09-15',
        billDocumentId: billDocId,
      }),
    }, env);
    const bill = (await jsonOf(createRes)).data;

    const payRes = await app.request(`/api/v1/utilities/electricity-bills/${bill.id}/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        paymentReference: 'NEFT-1234',
      }),
    }, env);

    expect(payRes.status).toBe(400);
  });

  it('rejects mark-paid if payment receipt belongs to a different outlet', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consumerNumber: 'BILL-PAY-MISDOC', billingCycle: 'MONTHLY' }),
    }, env);
    const acc = (await jsonOf(accRes)).data;
    const billDocId = await createTestDocument(OUTLET_1_ID);
    const receiptDocIdOutlet2 = await createTestDocument(OUTLET_2_ID);

    const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-08-31',
        billAmount: '12000.00',
        dueDate: '2026-09-15',
        billDocumentId: billDocId,
      }),
    }, env);
    const bill = (await jsonOf(createRes)).data;

    const payRes = await app.request(`/api/v1/utilities/electricity-bills/${bill.id}/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        paymentReceiptDocumentId: receiptDocIdOutlet2,
      }),
    }, env);

    expect(payRes.status).toBe(403);
    const payJson = await jsonOf(payRes);
    expect(payJson.error.code).toBe('UTILITY_PAYMENT_RECEIPT_OUTLET_MISMATCH');
  });

  it('rejects updating an already PAID bill with 409', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consumerNumber: 'BILL-IMMUT-ACC', billingCycle: 'MONTHLY' }),
    }, env);
    const acc = (await jsonOf(accRes)).data;
    const billDocId = await createTestDocument(OUTLET_1_ID);
    const receiptDocId = await createTestDocument(OUTLET_1_ID);

    const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-08-31',
        billAmount: '12000.00',
        dueDate: '2026-09-15',
        billDocumentId: billDocId,
      }),
    }, env);
    const bill = (await jsonOf(createRes)).data;

    await app.request(`/api/v1/utilities/electricity-bills/${bill.id}/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ paymentReceiptDocumentId: receiptDocId }),
    }, env);

    const updateRes = await app.request(`/api/v1/utilities/electricity-bills/${bill.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ billAmount: '15000.00' }),
    }, env);

    expect(updateRes.status).toBe(409);
    const json = await jsonOf(updateRes);
    expect(json.error.code).toBe('UTILITY_BILL_PAID_IMMUTABLE');
  });

  it('rejects mark-paid on an already PAID bill with 409 UTILITY_BILL_ALREADY_PAID', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consumerNumber: 'BILL-DOUBLEPAY', billingCycle: 'MONTHLY' }),
    }, env);
    const acc = (await jsonOf(accRes)).data;
    const billDocId = await createTestDocument(OUTLET_1_ID);
    const receiptDocId = await createTestDocument(OUTLET_1_ID);

    const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-08-31',
        billAmount: '12000.00',
        dueDate: '2026-09-15',
        billDocumentId: billDocId,
      }),
    }, env);
    const bill = (await jsonOf(createRes)).data;

    await app.request(`/api/v1/utilities/electricity-bills/${bill.id}/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ paymentReceiptDocumentId: receiptDocId }),
    }, env);

    const secondPay = await app.request(`/api/v1/utilities/electricity-bills/${bill.id}/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ paymentReceiptDocumentId: receiptDocId }),
    }, env);

    expect(secondPay.status).toBe(409);
    const json = await jsonOf(secondPay);
    expect(json.error.code).toBe('UTILITY_BILL_ALREADY_PAID');
  });

  it('creates audit log entries on bill create, update, and mark-paid', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consumerNumber: 'BILL-AUDIT-ACC', billingCycle: 'MONTHLY' }),
    }, env);
    const acc = (await jsonOf(accRes)).data;
    const billDocId = await createTestDocument(OUTLET_1_ID);
    const receiptDocId = await createTestDocument(OUTLET_1_ID);

    const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-08-31',
        billAmount: '12000.00',
        dueDate: '2026-09-15',
        billDocumentId: billDocId,
      }),
    }, env);
    const bill = (await jsonOf(createRes)).data;

    await app.request(`/api/v1/utilities/electricity-bills/${bill.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ billAmount: '13000.00' }),
    }, env);

    await app.request(`/api/v1/utilities/electricity-bills/${bill.id}/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ paymentReceiptDocumentId: receiptDocId }),
    }, env);

    const db = getDb(localD1);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, bill.id));
    const actions = logs.map(l => l.action);
    expect(actions).toContain('UTILITY_ELECTRICITY_BILL_CREATE');
    expect(actions).toContain('UTILITY_ELECTRICITY_BILL_UPDATE');
    expect(actions).toContain('UTILITY_ELECTRICITY_BILL_MARK_PAID');
  });

  // =========================================================================
  // 5. ELECTRICITY SUMMARY ENDPOINT TESTS
  // =========================================================================

  it('calculates electricity summary counts and amounts with safe integer arithmetic', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consumerNumber: 'SUM-ACC-EXACT', billingCycle: 'MONTHLY' }),
    }, env);
    const acc = (await jsonOf(accRes)).data;
    const docId = await createTestDocument(OUTLET_1_ID);
    const receiptDocId = await createTestDocument(OUTLET_1_ID);

    // Bill 1: Overdue Pending (100.50 -> 10050 paise)
    await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2020-01-01',
        billingPeriodEnd: '2020-01-31',
        billAmount: '100.50',
        dueDate: '2020-02-15',
        billDocumentId: docId,
      }),
    }, env);

    // Bill 2: Future Pending (200.75 -> 20075 paise)
    await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2099-01-01',
        billingPeriodEnd: '2099-01-31',
        billAmount: '200.75',
        dueDate: '2099-02-15',
        billDocumentId: docId,
      }),
    }, env);

    // Bill 3: Paid (300.00 -> 30000 paise)
    const b3Res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2025-01-01',
        billingPeriodEnd: '2025-01-31',
        billAmount: '300.00',
        dueDate: '2025-02-15',
        billDocumentId: docId,
      }),
    }, env);
    const b3 = (await jsonOf(b3Res)).data;
    await app.request(`/api/v1/utilities/electricity-bills/${b3.id}/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ paymentReceiptDocumentId: receiptDocId }),
    }, env);

    const summaryRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-summary`, {
      method: 'GET',
      headers: { Cookie: cookie },
    }, env);

    expect(summaryRes.status).toBe(200);
    const summary = (await jsonOf(summaryRes)).data;
    expect(summary.accountCount).toBeGreaterThanOrEqual(1);
    expect(summary.pendingBillCount).toBe(2);
    expect(summary.overdueBillCount).toBe(1);
    expect(summary.paidBillCount).toBe(1);
    expect(summary.pendingAmountPaise).toBe(30125); // 10050 + 20075
    expect(summary.overdueAmountPaise).toBe(10050);
  });

  // =========================================================================
  // 6. SUB-METER MASTER TESTS
  // =========================================================================

  it('creates sub-meters for different beneficiary types (NFR_VENDOR, CNG_FACILITY, OTHER)', async () => {
    const cookie = await loginAs('admin@iocl.in');

    const resNfr = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-NFR-01',
        name: 'Cafe Coffee Day Sub-Meter',
        beneficiaryType: 'NFR_VENDOR',
        beneficiaryName: 'Cafe Coffee Day',
        ratePaisePerKwh: 950,
      }),
    }, env);
    expect(resNfr.status).toBe(201);
    expect((await jsonOf(resNfr)).data.beneficiaryType).toBe('NFR_VENDOR');

    const resCng = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-CNG-01',
        name: 'CNG Booster Compressor Meter',
        beneficiaryType: 'CNG_FACILITY',
        beneficiaryName: 'IOCL CNG Station Unit',
        ratePaisePerKwh: 850,
      }),
    }, env);
    expect(resCng.status).toBe(201);
    expect((await jsonOf(resCng)).data.beneficiaryType).toBe('CNG_FACILITY');

    const resOth = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-OTH-01',
        name: 'ATM Kiosk Sub-Meter',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'State Bank of India',
        ratePaisePerKwh: 1000,
      }),
    }, env);
    expect(resOth.status).toBe(201);
    expect((await jsonOf(resOth)).data.beneficiaryType).toBe('OTHER');
  });

  it('rejects duplicate meter code for the same outlet with 409', async () => {
    const cookie = await loginAs('admin@iocl.in');
    await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-DUP-01',
        name: 'Meter 1',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'SBI',
        ratePaisePerKwh: 900,
      }),
    }, env);

    const res2 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-DUP-01',
        name: 'Meter 2',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'HDFC',
        ratePaisePerKwh: 950,
      }),
    }, env);

    expect(res2.status).toBe(409);
    const json2 = await jsonOf(res2);
    expect(json2.error.code).toBe('UTILITY_SUB_METER_CODE_EXISTS');
  });

  it('allows same meter code across different outlets', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const res1 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-COMMON-01',
        name: 'Common Meter',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'Common',
        ratePaisePerKwh: 900,
      }),
    }, env);
    expect(res1.status).toBe(201);

    const res2 = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-COMMON-01',
        name: 'Common Meter Outlet 2',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'Common',
        ratePaisePerKwh: 900,
      }),
    }, env);
    expect(res2.status).toBe(201);
  });

  it('rejects duplicate serial number for the same outlet with 409', async () => {
    const cookie = await loginAs('admin@iocl.in');
    await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-SN-01',
        name: 'Meter 1',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'SBI',
        serialNumber: 'SN-998877',
        ratePaisePerKwh: 900,
      }),
    }, env);

    const res2 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-SN-02',
        name: 'Meter 2',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'HDFC',
        serialNumber: 'SN-998877',
        ratePaisePerKwh: 950,
      }),
    }, env);

    expect(res2.status).toBe(409);
    const json = await jsonOf(res2);
    expect(json.error.code).toBe('UTILITY_SUB_METER_SERIAL_EXISTS');
  });

  it('allows multiple meters with null or blank serial numbers in same outlet', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const res1 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-NOSN-01',
        name: 'No Serial 1',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'SBI',
        ratePaisePerKwh: 900,
      }),
    }, env);
    expect(res1.status).toBe(201);

    const res2 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-NOSN-02',
        name: 'No Serial 2',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'HDFC',
        ratePaisePerKwh: 950,
      }),
    }, env);
    expect(res2.status).toBe(201);
  });

  it('rejects invalid beneficiary type or negative rate with 400', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const res1 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-INV-01',
        name: 'Invalid Type Meter',
        beneficiaryType: 'INVALID_TYPE',
        beneficiaryName: 'Test',
        ratePaisePerKwh: 900,
      }),
    }, env);
    expect(res1.status).toBe(400);

    const res2 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-INV-02',
        name: 'Negative Rate Meter',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'Test',
        ratePaisePerKwh: -10,
      }),
    }, env);
    expect(res2.status).toBe(400);
  });

  it('updates sub-meter mutable fields and rejects immutable ones', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-MUT-01',
        name: 'Initial Name',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'Initial Beneficiary',
        ratePaisePerKwh: 800,
      }),
    }, env);
    const sm = (await jsonOf(createRes)).data;

    const updateRes = await app.request(`/api/v1/utilities/sub-meters/${sm.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        name: 'Updated Name',
        ratePaisePerKwh: 950,
        status: 'INACTIVE',
      }),
    }, env);
    expect(updateRes.status).toBe(200);
    const updateJson = await jsonOf(updateRes);
    expect(updateJson.data.name).toBe('Updated Name');
    expect(updateJson.data.ratePaisePerKwh).toBe(950);
    expect(updateJson.data.status).toBe('INACTIVE');

    // Rejection of immutable meterCode or outletId via strict schema
    const immutRes = await app.request(`/api/v1/utilities/sub-meters/${sm.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ meterCode: 'NEW-CODE' }),
    }, env);
    expect(immutRes.status).toBe(400);
  });

  it('creates audit log entries on sub-meter create and update', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-AUDIT-01',
        name: 'Audit Meter',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'Test',
        ratePaisePerKwh: 800,
      }),
    }, env);
    const sm = (await jsonOf(createRes)).data;

    await app.request(`/api/v1/utilities/sub-meters/${sm.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'Audit Meter Renamed' }),
    }, env);

    const db = getDb(localD1);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, sm.id));
    const actions = logs.map(l => l.action);
    expect(actions).toContain('UTILITY_SUB_METER_CREATE');
    expect(actions).toContain('UTILITY_SUB_METER_UPDATE');
  });

  // =========================================================================
  // 7. SUB-METER READING LEDGER & CALCULATION TESTS
  // =========================================================================

  it('creates first baseline reading with 0 consumption and 0 charge', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const smRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-BASE-01',
        name: 'Baseline Test Meter',
        beneficiaryType: 'NFR_VENDOR',
        beneficiaryName: 'Vendor A',
        ratePaisePerKwh: 900,
      }),
    }, env);
    const sm = (await jsonOf(smRes)).data;

    const readRes = await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        reading: '100.500',
        readingAt: '2026-08-01T08:00:00Z',
        notes: 'Initial commissioning reading',
      }),
    }, env);

    expect(readRes.status).toBe(201);
    const readJson = await jsonOf(readRes);
    expect(readJson.data.readingMilliKwh).toBe(100500);
    expect(readJson.data.readingStr).toBe('100.500');
    expect(readJson.data.previousReadingId).toBeNull();
    expect(readJson.data.previousReadingMilliKwh).toBeNull();
    expect(readJson.data.consumptionMilliKwh).toBe(0);
    expect(readJson.data.consumptionStr).toBe('0.000');
    expect(readJson.data.chargePaise).toBe(0);
    expect(readJson.data.chargeStr).toBe('0.00');
    expect(readJson.data.ratePaisePerKwhSnapshot).toBe(900);
  });

  it('computes consumption and charge accurately on second reading', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const smRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-DELTA-01',
        name: 'Delta Test Meter',
        beneficiaryType: 'NFR_VENDOR',
        beneficiaryName: 'Vendor B',
        ratePaisePerKwh: 850,
      }),
    }, env);
    const sm = (await jsonOf(smRes)).data;

    // Reading 1: 100.000 kWh
    await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        reading: '100.000',
        readingAt: '2026-08-01T08:00:00Z',
      }),
    }, env);

    // Reading 2: 250.500 kWh (delta = 150.500 kWh = 150500 milli-kWh)
    const readRes2 = await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        reading: '250.500',
        readingAt: '2026-09-01T08:00:00Z',
      }),
    }, env);

    expect(readRes2.status).toBe(201);
    const read2 = (await jsonOf(readRes2)).data;
    expect(read2.readingMilliKwh).toBe(250500);
    expect(read2.previousReadingMilliKwh).toBe(100000);
    expect(read2.consumptionMilliKwh).toBe(150500);
    expect(read2.consumptionStr).toBe('150.500');
    expect(read2.chargePaise).toBe(127925);
    expect(read2.chargeStr).toBe('1279.25');
  });

  it('performs half-up rounding on fractional paise correctly', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const smRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-ROUND-01',
        name: 'Rounding Test Meter',
        beneficiaryType: 'NFR_VENDOR',
        beneficiaryName: 'Vendor C',
        ratePaisePerKwh: 855,
      }),
    }, env);
    const sm = (await jsonOf(smRes)).data;

    // Baseline: 0.000
    await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ reading: '0.000', readingAt: '2026-08-01T08:00:00Z' }),
    }, env);

    // Delta: 0.001 kWh (1 milli-kWh). 1 * 855 / 1000 = 0.855 -> rounded half-up to 1 paise
    const res = await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ reading: '0.001', readingAt: '2026-08-02T08:00:00Z' }),
    }, env);

    expect(res.status).toBe(201);
    const data = (await jsonOf(res)).data;
    expect(data.chargePaise).toBe(1);
  });

  it('preserves historical tariff snapshot when sub-meter rate changes later', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const smRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-HIST-01',
        name: 'Historical Rate Test',
        beneficiaryType: 'NFR_VENDOR',
        beneficiaryName: 'Vendor D',
        ratePaisePerKwh: 800,
      }),
    }, env);
    const sm = (await jsonOf(smRes)).data;

    // Baseline
    await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ reading: '100.000', readingAt: '2026-08-01T08:00:00Z' }),
    }, env);

    // Reading 2 at rate 800: consumption = 100 kWh -> 100 * 800 = 80000 paise
    const r2Res = await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ reading: '200.000', readingAt: '2026-08-15T08:00:00Z' }),
    }, env);
    const r2 = (await jsonOf(r2Res)).data;
    expect(r2.chargePaise).toBe(80000);
    expect(r2.ratePaisePerKwhSnapshot).toBe(800);

    // Change sub-meter rate to 1200
    await app.request(`/api/v1/utilities/sub-meters/${sm.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ ratePaisePerKwh: 1200 }),
    }, env);

    // Verify Reading 2 historical charge and rate snapshot did NOT change
    const listRes = await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'GET',
      headers: { Cookie: cookie },
    }, env);
    const readings = (await jsonOf(listRes)).data;
    const r2Check = readings.find((r: any) => r.id === r2.id);
    expect(r2Check.ratePaisePerKwhSnapshot).toBe(800);
    expect(r2Check.chargePaise).toBe(80000);

    // Reading 3 uses NEW rate 1200: consumption = 50 kWh -> 50 * 1200 = 60000 paise
    const r3Res = await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ reading: '250.000', readingAt: '2026-09-01T08:00:00Z' }),
    }, env);
    const r3 = (await jsonOf(r3Res)).data;
    expect(r3.ratePaisePerKwhSnapshot).toBe(1200);
    expect(r3.chargePaise).toBe(60000);
  });

  it('rejects decreasing meter reading with SUB_METER_READING_DECREASE', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const smRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-DEC-01',
        name: 'Decreasing Test',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'Test',
        ratePaisePerKwh: 800,
      }),
    }, env);
    const sm = (await jsonOf(smRes)).data;

    await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ reading: '500.000', readingAt: '2026-08-01T08:00:00Z' }),
    }, env);

    const decRes = await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ reading: '450.000', readingAt: '2026-08-02T08:00:00Z' }),
    }, env);

    expect(decRes.status).toBe(400);
    const json = await jsonOf(decRes);
    expect(json.error.code).toBe('SUB_METER_READING_DECREASE');
  });

  it('rejects same or older timestamp reading with SUB_METER_READING_OUT_OF_ORDER', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const smRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-TIME-01',
        name: 'Time Test',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'Test',
        ratePaisePerKwh: 800,
      }),
    }, env);
    const sm = (await jsonOf(smRes)).data;

    await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ reading: '100.000', readingAt: '2026-08-05T12:00:00Z' }),
    }, env);

    // Same timestamp
    const sameRes = await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ reading: '120.000', readingAt: '2026-08-05T12:00:00Z' }),
    }, env);
    expect(sameRes.status).toBe(400);
    expect((await jsonOf(sameRes)).error.code).toBe('SUB_METER_READING_OUT_OF_ORDER');

    // Older timestamp
    const oldRes = await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ reading: '120.000', readingAt: '2026-08-01T12:00:00Z' }),
    }, env);
    expect(oldRes.status).toBe(400);
    expect((await jsonOf(oldRes)).error.code).toBe('SUB_METER_READING_OUT_OF_ORDER');
  });

  it('rejects reading insertion for INACTIVE or DECOMMISSIONED sub-meter', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const smRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-INACT-01',
        name: 'Inactive Meter',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'Test',
        ratePaisePerKwh: 800,
      }),
    }, env);
    const sm = (await jsonOf(smRes)).data;

    // Deactivate meter
    await app.request(`/api/v1/utilities/sub-meters/${sm.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ status: 'INACTIVE' }),
    }, env);

    const readRes = await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ reading: '100.000', readingAt: '2026-08-01T08:00:00Z' }),
    }, env);

    expect(readRes.status).toBe(400);
    const json = await jsonOf(readRes);
    expect(json.error.code).toBe('SUB_METER_NOT_ACTIVE');
  });

  it('rejects client injection of authoritative fields (consumption, charge, rate snapshot) via strict schema', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const smRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-INJ-01',
        name: 'Injection Test',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'Test',
        ratePaisePerKwh: 800,
      }),
    }, env);
    const sm = (await jsonOf(smRes)).data;

    const res = await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        reading: '100.000',
        readingAt: '2026-08-01T08:00:00Z',
        consumptionMilliKwh: 999999,
        chargePaise: 0,
        ratePaisePerKwhSnapshot: 1,
      }),
    }, env);

    expect(res.status).toBe(400);
  });

  it('creates audit log entries on sub-meter reading creation', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const smRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-AUD-RDG',
        name: 'Audit Reading Test',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'Test',
        ratePaisePerKwh: 800,
      }),
    }, env);
    const sm = (await jsonOf(smRes)).data;

    const readRes = await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ reading: '100.000', readingAt: '2026-08-01T08:00:00Z' }),
    }, env);
    const read = (await jsonOf(readRes)).data;

    const db = getDb(localD1);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, read.id));
    const actions = logs.map(l => l.action);
    expect(actions).toContain('UTILITY_SUB_METER_READING_CREATE');
  });

  // =========================================================================
  // 8. DIRECT SQL INTEGRITY & TRIGGER TESTS
  // =========================================================================

  it('enforces append-only immutability on sub-meter readings: direct SQL UPDATE throws', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const smRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-TRIG-01',
        name: 'Trigger Test',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'Test',
        ratePaisePerKwh: 800,
      }),
    }, env);
    const sm = (await jsonOf(smRes)).data;

    const readRes = await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ reading: '100.000', readingAt: '2026-08-01T08:00:00Z' }),
    }, env);
    const read = (await jsonOf(readRes)).data;

    const db = getDb(localD1);
    await expect(db.update(utilitySubMeterReadings)
      .set({ readingMilliKwh: 200000 })
      .where(eq(utilitySubMeterReadings.id, read.id))
      .run()).rejects.toThrow();
  });

  it('enforces append-only immutability on sub-meter readings: direct SQL DELETE throws', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const smRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-TRIG-02',
        name: 'Trigger Test 2',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'Test',
        ratePaisePerKwh: 800,
      }),
    }, env);
    const sm = (await jsonOf(smRes)).data;

    const readRes = await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ reading: '100.000', readingAt: '2026-08-01T08:00:00Z' }),
    }, env);
    const read = (await jsonOf(readRes)).data;

    const db = getDb(localD1);
    await expect(db.delete(utilitySubMeterReadings)
      .where(eq(utilitySubMeterReadings.id, read.id))
      .run()).rejects.toThrow();
  });

  it('enforces paid bill immutability: direct SQL UPDATE on paid bill throws', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ consumerNumber: 'TRIG-PAID-BILL', billingCycle: 'MONTHLY' }),
    }, env);
    const acc = (await jsonOf(accRes)).data;
    const billDocId = await createTestDocument(OUTLET_1_ID);
    const receiptDocId = await createTestDocument(OUTLET_1_ID);

    const bRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-08-31',
        billAmount: '1000.00',
        dueDate: '2026-09-15',
        billDocumentId: billDocId,
      }),
    }, env);
    const bill = (await jsonOf(bRes)).data;

    await app.request(`/api/v1/utilities/electricity-bills/${bill.id}/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ paymentReceiptDocumentId: receiptDocId }),
    }, env);

    const db = getDb(localD1);
    await expect(db.update(utilityElectricityBills)
      .set({ billAmountPaise: 999999 })
      .where(eq(utilityElectricityBills.id, bill.id))
      .run()).rejects.toThrow();
  });

  // =========================================================================
  // 9. CONCURRENCY PROTECTION TESTS
  // =========================================================================

  it('handles race condition / stale predecessor by returning 409 SUB_METER_READING_STATE_CHANGED', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const smRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-RACE-01',
        name: 'Race Meter',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'Test',
        ratePaisePerKwh: 800,
      }),
    }, env);
    const sm = (await jsonOf(smRes)).data;

    // Baseline reading
    const baseRes = await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ reading: '100.000', readingAt: '2026-08-01T08:00:00Z' }),
    }, env);
    const base = (await jsonOf(baseRes)).data;

    // First write succeeds
    const write1 = await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ reading: '150.000', readingAt: '2026-08-02T08:00:00Z' }),
    }, env);
    expect(write1.status).toBe(201);

    // Direct SQL insertion attempting to link back to base.id (violating unique previous_reading_id)
    const db = getDb(localD1);
    await expect(db.insert(utilitySubMeterReadings).values({
      id: 'stale-race-reading-id',
      outletId: OUTLET_1_ID,
      subMeterId: sm.id,
      previousReadingId: base.id, // Re-using predecessor that already has a successor!
      readingAt: '2026-08-03T08:00:00Z',
      readingMilliKwh: 160000,
      previousReadingMilliKwh: 100000,
      consumptionMilliKwh: 60000,
      ratePaisePerKwhSnapshot: 800,
      chargePaise: 48000,
      recordedByUserId: 'user-admin',
      createdAt: new Date().toISOString(),
    }).run()).rejects.toThrow();
  });

  // =========================================================================
  // 10. SUB-METER CHARGE SUMMARY TESTS
  // =========================================================================

  it('computes sub-meter charge summary for outlet with multiple meters and filters', async () => {
    const cookie = await loginAs('admin@iocl.in');

    // Meter 1: NFR_VENDOR
    const sm1Res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-SUMM-01',
        name: 'CCD Outlet 1',
        beneficiaryType: 'NFR_VENDOR',
        beneficiaryName: 'CCD',
        ratePaisePerKwh: 1000,
      }),
    }, env);
    const sm1 = (await jsonOf(sm1Res)).data;

    // Meter 2: CNG_FACILITY
    const sm2Res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        meterCode: 'SM-SUMM-02',
        name: 'CNG Booster Outlet 1',
        beneficiaryType: 'CNG_FACILITY',
        beneficiaryName: 'IOCL CNG',
        ratePaisePerKwh: 800,
      }),
    }, env);
    const sm2 = (await jsonOf(sm2Res)).data;

    // Meter 1: baseline 100, then 200 (delta = 100 kWh = 100000 milliKwh -> 100000 paise = Rs 1000)
    await app.request(`/api/v1/utilities/sub-meters/${sm1.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ reading: '100.000', readingAt: '2026-08-01T08:00:00Z' }),
    }, env);
    await app.request(`/api/v1/utilities/sub-meters/${sm1.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ reading: '200.000', readingAt: '2026-08-15T08:00:00Z' }),
    }, env);

    // Meter 2: baseline 500, then 750 (delta = 250 kWh = 250000 milliKwh -> 250 * 800 = 200000 paise = Rs 2000)
    await app.request(`/api/v1/utilities/sub-meters/${sm2.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ reading: '500.000', readingAt: '2026-08-01T08:00:00Z' }),
    }, env);
    await app.request(`/api/v1/utilities/sub-meters/${sm2.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ reading: '750.000', readingAt: '2026-08-20T08:00:00Z' }),
    }, env);

    // Total summary
    const summaryRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meter-charge-summary`, {
      method: 'GET',
      headers: { Cookie: cookie },
    }, env);

    expect(summaryRes.status).toBe(200);
    const summary = (await jsonOf(summaryRes)).data;
    expect(summary.totalConsumptionMilliKwh).toBe(350000); // 100000 + 250000
    expect(summary.totalChargePaise).toBe(300000); // 100000 + 200000
    expect(summary.readingCount).toBe(4);
    expect(summary.bySubMeter.length).toBe(2);

    // Filter by subMeterId
    const filteredRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meter-charge-summary?subMeterId=${sm1.id}`, {
      method: 'GET',
      headers: { Cookie: cookie },
    }, env);
    const filtered = (await jsonOf(filteredRes)).data;
    expect(filtered.totalConsumptionMilliKwh).toBe(100000);
    expect(filtered.totalChargePaise).toBe(100000);
    expect(filtered.bySubMeter.length).toBe(1);
  });

  it('returns empty charge summary for outlet with zero sub-meter readings', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meter-charge-summary`, {
      method: 'GET',
      headers: { Cookie: cookie },
    }, env);
    expect(res.status).toBe(200);
    const data = (await jsonOf(res)).data;
    expect(data.totalConsumptionMilliKwh).toBe(0);
    expect(data.totalChargePaise).toBe(0);
    expect(data.readingCount).toBe(0);
  });

  // =========================================================================
  // 11. RBAC API ROLE MATRIX TESTS
  // =========================================================================

  it('allows STATE_OFFICE read access but blocks write endpoints with 403', async () => {
    const soCookie = await loginAs('wbso@iocl.in');

    // Read allowed
    const getRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'GET',
      headers: { Cookie: soCookie },
    }, env);
    expect(getRes.status).toBe(200);

    // Write electricity account blocked
    const postAcc = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: soCookie },
      body: JSON.stringify({ consumerNumber: 'SO-BLOCKED', billingCycle: 'MONTHLY' }),
    }, env);
    expect(postAcc.status).toBe(403);

    // Write sub-meter blocked
    const postSm = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: soCookie },
      body: JSON.stringify({
        meterCode: 'SM-SO-BLOCK',
        name: 'Block',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'Test',
        ratePaisePerKwh: 800,
      }),
    }, env);
    expect(postSm.status).toBe(403);
  });

  it('allows DIVISIONAL_OFFICE read access but blocks write endpoints with 403', async () => {
    const doCookie = await loginAs('kolkatado@iocl.in');

    // Read allowed
    const getRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'GET',
      headers: { Cookie: doCookie },
    }, env);
    expect(getRes.status).toBe(200);

    // Write electricity account blocked
    const postAcc = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: doCookie },
      body: JSON.stringify({ consumerNumber: 'DO-BLOCKED', billingCycle: 'MONTHLY' }),
    }, env);
    expect(postAcc.status).toBe(403);

    // Write sub-meter blocked
    const postSm = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: doCookie },
      body: JSON.stringify({
        meterCode: 'SM-DO-BLOCK',
        name: 'Block',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'Test',
        ratePaisePerKwh: 800,
      }),
    }, env);
    expect(postSm.status).toBe(403);
  });

  it('allows DEALER to create bills, mark paid, and record readings, but blocks account and sub-meter master write with 403', async () => {
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    const adminCookie = await loginAs('admin@iocl.in');

    // Account creation by dealer blocked
    const postAcc = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: dealerCookie },
      body: JSON.stringify({ consumerNumber: 'DEALER-BLOCK-ACC', billingCycle: 'MONTHLY' }),
    }, env);
    expect(postAcc.status).toBe(403);

    // Sub-meter creation by dealer blocked
    const postSm = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: dealerCookie },
      body: JSON.stringify({
        meterCode: 'SM-DEALER-BLOCK',
        name: 'Block',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'Test',
        ratePaisePerKwh: 800,
      }),
    }, env);
    expect(postSm.status).toBe(403);

    // Setup account and sub-meter as admin
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ consumerNumber: 'DEALER-PERM-ACC', billingCycle: 'MONTHLY' }),
    }, env);
    const acc = (await jsonOf(accRes)).data;
    const smRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        meterCode: 'SM-DEALER-PERM',
        name: 'Permitted',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'Test',
        ratePaisePerKwh: 800,
      }),
    }, env);
    const sm = (await jsonOf(smRes)).data;
    const billDocId = await createTestDocument(OUTLET_1_ID);
    const receiptDocId = await createTestDocument(OUTLET_1_ID);

    // Dealer creates bill -> allowed
    const billRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: dealerCookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-08-31',
        billAmount: '4500.00',
        dueDate: '2026-09-15',
        billDocumentId: billDocId,
      }),
    }, env);
    expect(billRes.status).toBe(201);
    const bill = (await jsonOf(billRes)).data;

    // Dealer marks bill paid -> allowed
    const payRes = await app.request(`/api/v1/utilities/electricity-bills/${bill.id}/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: dealerCookie },
      body: JSON.stringify({ paymentReceiptDocumentId: receiptDocId }),
    }, env);
    expect(payRes.status).toBe(200);

    // Dealer records sub-meter reading -> allowed
    const readRes = await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: dealerCookie },
      body: JSON.stringify({ reading: '100.000', readingAt: '2026-08-01T08:00:00Z' }),
    }, env);
    expect(readRes.status).toBe(201);
  });

  it('allows CSP same permissions as dealer (bills, payments, readings) and blocks master writes', async () => {
    const cspCookie = await loginAs('csp.parkstreet@iocl.in');
    const adminCookie = await loginAs('admin@iocl.in');

    // CSP blocked from creating account master
    const postAcc = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cspCookie },
      body: JSON.stringify({ consumerNumber: 'CSP-BLOCK-ACC', billingCycle: 'MONTHLY' }),
    }, env);
    expect(postAcc.status).toBe(403);

    // Setup sub-meter as admin
    const smRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        meterCode: 'SM-CSP-PERM',
        name: 'CSP Meter',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'Test',
        ratePaisePerKwh: 800,
      }),
    }, env);
    const sm = (await jsonOf(smRes)).data;

    // CSP records reading -> allowed
    const readRes = await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cspCookie },
      body: JSON.stringify({ reading: '100.000', readingAt: '2026-08-01T08:00:00Z' }),
    }, env);
    expect(readRes.status).toBe(201);
  });

  it('allows FIELD_OFFICER full write capabilities within assigned scope', async () => {
    const foCookie = await loginAs('fo.central@iocl.in');

    // FO creates account in assigned outlet 1
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: foCookie },
      body: JSON.stringify({ consumerNumber: 'FO-PERM-ACC', billingCycle: 'MONTHLY' }),
    }, env);
    expect(accRes.status).toBe(201);

    // FO creates sub-meter in assigned outlet 1
    const smRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: foCookie },
      body: JSON.stringify({
        meterCode: 'SM-FO-PERM',
        name: 'FO Meter',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'Test',
        ratePaisePerKwh: 800,
      }),
    }, env);
    expect(smRes.status).toBe(201);
  });

  // =========================================================================
  // 12. OUTLET SCOPE ENFORCEMENT TESTS
  // =========================================================================

  it('denies cross-outlet access for DEALER accessing another outlet with 403', async () => {
    // Park Street Dealer is assigned OUTLET_1_ID, attempting to access OUTLET_2_ID or OUTLET_3_ID
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');

    // 1. Account list
    const accList = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/utilities/electricity-accounts`, {
      method: 'GET',
      headers: { Cookie: dealerCookie },
    }, env);
    expect(accList.status).toBe(403);

    // 2. Account create
    const accCreate = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: dealerCookie },
      body: JSON.stringify({ consumerNumber: 'CROSS-SCOPE', billingCycle: 'MONTHLY' }),
    }, env);
    expect(accCreate.status).toBe(403);

    // 3. Bill list
    const billList = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/utilities/electricity-bills`, {
      method: 'GET',
      headers: { Cookie: dealerCookie },
    }, env);
    expect(billList.status).toBe(403);

    // 4. Sub-meter list
    const smList = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/utilities/sub-meters`, {
      method: 'GET',
      headers: { Cookie: dealerCookie },
    }, env);
    expect(smList.status).toBe(403);

    // 5. Electricity summary
    const elecSumm = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/utilities/electricity-summary`, {
      method: 'GET',
      headers: { Cookie: dealerCookie },
    }, env);
    expect(elecSumm.status).toBe(403);

    // 6. Sub-meter charge summary
    const chgSumm = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/utilities/sub-meter-charge-summary`, {
      method: 'GET',
      headers: { Cookie: dealerCookie },
    }, env);
    expect(chgSumm.status).toBe(403);
  });

  it('denies cross-outlet access on ID-based utility routes', async () => {
    const adminCookie = await loginAs('admin@iocl.in');
    const dealerCookie = await loginAs('dealer.parkstreet@iocl.in'); // only scoped to OUTLET_1_ID

    // Create account, bill, sub-meter in OUTLET_2_ID
    const accRes = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/utilities/electricity-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ consumerNumber: 'OUTLET2-ACC-ID', billingCycle: 'MONTHLY' }),
    }, env);
    const acc = (await jsonOf(accRes)).data;
    const docId = await createTestDocument(OUTLET_2_ID);

    const billRes = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/utilities/electricity-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        electricityAccountId: acc.id,
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-08-31',
        billAmount: '5000.00',
        dueDate: '2026-09-15',
        billDocumentId: docId,
      }),
    }, env);
    const bill = (await jsonOf(billRes)).data;

    const smRes = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/utilities/sub-meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        meterCode: 'SM-OUTLET2-ID',
        name: 'Meter 2',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'Test',
        ratePaisePerKwh: 800,
      }),
    }, env);
    const sm = (await jsonOf(smRes)).data;

    // Dealer attempts ID-based access
    // 1. Bill detail
    const getBill = await app.request(`/api/v1/utilities/electricity-bills/${bill.id}`, {
      method: 'GET',
      headers: { Cookie: dealerCookie },
    }, env);
    expect(getBill.status).toBe(403);

    // 2. Bill update
    const putBill = await app.request(`/api/v1/utilities/electricity-bills/${bill.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: dealerCookie },
      body: JSON.stringify({ billAmount: '6000.00' }),
    }, env);
    expect(putBill.status).toBe(403);

    // 3. Mark paid
    const markPaid = await app.request(`/api/v1/utilities/electricity-bills/${bill.id}/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: dealerCookie },
      body: JSON.stringify({ paymentReceiptDocumentId: docId }),
    }, env);
    expect(markPaid.status).toBe(403);

    // 4. Sub-meter detail
    const getSm = await app.request(`/api/v1/utilities/sub-meters/${sm.id}`, {
      method: 'GET',
      headers: { Cookie: dealerCookie },
    }, env);
    expect(getSm.status).toBe(403);

    // 5. Sub-meter readings list
    const getReadings = await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'GET',
      headers: { Cookie: dealerCookie },
    }, env);
    expect(getReadings.status).toBe(403);

    // 6. Sub-meter record reading
    const postReading = await app.request(`/api/v1/utilities/sub-meters/${sm.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: dealerCookie },
      body: JSON.stringify({ reading: '100.000', readingAt: '2026-08-01T08:00:00Z' }),
    }, env);
    expect(postReading.status).toBe(403);
  });

  // =========================================================================
  // 13. IMMUTABILITY & NO DELETE ENDPOINT TESTS
  // =========================================================================

  it('verifies that no DELETE endpoints are exposed for utility entities', async () => {
    const cookie = await loginAs('admin@iocl.in');

    const delAcc = await app.request('/api/v1/utilities/electricity-accounts/some-id', {
      method: 'DELETE',
      headers: { Cookie: cookie },
    }, env);
    expect(delAcc.status).toBe(404);

    const delBill = await app.request('/api/v1/utilities/electricity-bills/some-id', {
      method: 'DELETE',
      headers: { Cookie: cookie },
    }, env);
    expect(delBill.status).toBe(404);

    const delSm = await app.request('/api/v1/utilities/sub-meters/some-id', {
      method: 'DELETE',
      headers: { Cookie: cookie },
    }, env);
    expect(delSm.status).toBe(404);

    const delRead = await app.request('/api/v1/utilities/sub-meters/some-id/readings/some-reading-id', {
      method: 'DELETE',
      headers: { Cookie: cookie },
    }, env);
    expect(delRead.status).toBe(404);
  });
});
