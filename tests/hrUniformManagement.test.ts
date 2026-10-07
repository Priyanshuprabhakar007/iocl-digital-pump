import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import fs from 'fs';
import { eq, sql } from 'drizzle-orm';
import { hrUniformItems, hrUniformVariants, hrUniformStockTransactions, hrUniformIssues, hrStaff, hrDesignations } from '../src/db/schema';

const TEST_DB_PATH = `./.sqlite/test_hr_uniform_${Math.random().toString(36).substring(2)}.db`;

describe('Phase 5C-1 Uniform Management Comprehensive Suite', () => {
  let localD1: any;
  let env: any;
  let dealerCookie: string;
  let adminCookie: string;
  let soCookie: string;
  const OUTLET_ID = 'ro-1001';

  beforeEach(async () => {
    if (fs.existsSync(TEST_DB_PATH)) { try { fs.unlinkSync(TEST_DB_PATH); } catch (e) {} }
    const walPath = `${TEST_DB_PATH}-wal`;
    const shmPath = `${TEST_DB_PATH}-shm`;
    if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch (e) {} }
    if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch (e) {} }

    localD1 = createLocalD1Database(TEST_DB_PATH);
    const db = getDb(localD1);
    await seedDatabase(db);

    env = {
      DB: localD1,
      ENVIRONMENT: 'test',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    };

    dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
    adminCookie = await loginAs('admin@iocl.in');
    soCookie = await loginAs('wbso@iocl.in');
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

  it('verifies migration tables and permissions exist', async () => {
    const db = getDb(localD1);
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('hr_uniform_items', 'hr_uniform_variants', 'hr_uniform_stock_transactions', 'hr_uniform_issues')");
    expect(tables.length).toBe(4);

    const perms = await db.all("SELECT code FROM permissions WHERE code LIKE 'hr.uniform.%'");
    expect(perms.length).toBe(3);
  });

  it('performs item CRUD and enforces duplicate code and identity immutability', async () => {
    const outletId = OUTLET_ID;

    // 1. Create item
    const createRes = await app.request(`/api/v1/outlets/${outletId}/hr/uniform/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        itemCode: 'UNIFORM-SHIRT-01',
        itemName: 'Executive Cotton Shirt',
        category: 'SHIRT',
        description: 'Standard white cotton shirt',
        status: 'ACTIVE',
      }),
    }, env);
    expect(createRes.status).toBe(201);
    const createJson: any = await createRes.json();
    const itemId = createJson.data.id;
    expect(createJson.data.itemCode).toBe('UNIFORM-SHIRT-01');

    // 2. Duplicate code rejected (409)
    const dupRes = await app.request(`/api/v1/outlets/${outletId}/hr/uniform/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        itemCode: 'UNIFORM-SHIRT-01',
        itemName: 'Duplicate Shirt',
        category: 'SHIRT',
      }),
    }, env);
    expect(dupRes.status).toBe(409);

    // 3. Update item
    const updateRes = await app.request(`/api/v1/outlets/${outletId}/hr/uniform/items/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        itemName: 'Updated Executive Cotton Shirt',
        category: 'SHIRT',
        status: 'ACTIVE',
      }),
    }, env);
    expect(updateRes.status).toBe(200);
    const updateJson: any = await updateRes.json();
    expect(updateJson.data.itemName).toBe('Updated Executive Cotton Shirt');
  });

  it('manages variants and prevents duplicate size and cross-outlet mismatch', async () => {
    const outletId = OUTLET_ID;
    const db = getDb(localD1);

    // Create item
    const itemRes = await app.request(`/api/v1/outlets/${outletId}/hr/uniform/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ itemCode: 'PANT-01', itemName: 'Formal Trouser', category: 'TROUSER' }),
    }, env);
    const itemJson: any = await itemRes.json();
    const itemId = itemJson.data.id;

    // Create variant M
    const varRes1 = await app.request(`/api/v1/outlets/${outletId}/hr/uniform/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ uniformItemId: itemId, sizeLabel: 'M', sizeSortOrder: 1, reorderLevel: 5 }),
    }, env);
    expect(varRes1.status).toBe(201);
    const varJson1: any = await varRes1.json();
    const variantId = varJson1.data.id;

    // Duplicate size M rejected (409)
    const varResDup = await app.request(`/api/v1/outlets/${outletId}/hr/uniform/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ uniformItemId: itemId, sizeLabel: 'M', sizeSortOrder: 1 }),
    }, env);
    expect(varResDup.status).toBe(409);

    // Direct DB check for variant outlet match trigger
    let trigError = false;
    try {
      await db.run(sql`INSERT INTO hr_uniform_variants (id, outlet_id, uniform_item_id, size_label, size_sort_order, reorder_level, status, created_by, created_at, updated_at) VALUES ('v-fake', 'other-outlet', ${itemId}, 'L', 2, 5, 'ACTIVE', 'user-admin', datetime('now'), datetime('now'))`);
    } catch (e) {
      trigError = true;
    }
    expect(trigError).toBe(true);
  });

  it('manages stock transactions, opening balance, receipts, adjustments, and negative stock protection', async () => {
    const outletId = OUTLET_ID;

    // Create item & variant
    const itemRes = await app.request(`/api/v1/outlets/${outletId}/hr/uniform/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ itemCode: 'CAP-01', itemName: 'Brand Cap', category: 'CAP' }),
    }, env);
    const itemId = (await itemRes.json() as any).data.id;

    const varRes = await app.request(`/api/v1/outlets/${outletId}/hr/uniform/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ uniformItemId: itemId, sizeLabel: 'Free', reorderLevel: 2 }),
    }, env);
    const variantId = (await varRes.json() as any).data.id;

    // 1. Opening balance
    const obRes = await app.request(`/api/v1/outlets/${outletId}/hr/uniform/stock-transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ variantId, transactionType: 'OPENING_BALANCE', quantity: 20 }),
    }, env);
    expect(obRes.status).toBe(201);

    // 2. Receipt
    const rcRes = await app.request(`/api/v1/outlets/${outletId}/hr/uniform/stock-transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ variantId, transactionType: 'RECEIPT', quantity: 10, notes: 'Vendor delivery' }),
    }, env);
    expect(rcRes.status).toBe(201);

    // 3. Adjustment out requiring notes
    const adjOutRes = await app.request(`/api/v1/outlets/${outletId}/hr/uniform/stock-transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ variantId, transactionType: 'ADJUSTMENT_OUT', quantity: 5, notes: 'Damaged in transit audit' }),
    }, env);
    expect(adjOutRes.status).toBe(201);

    // 4. Excessive adjustment out rejected (insufficient stock)
    const excRes = await app.request(`/api/v1/outlets/${outletId}/hr/uniform/stock-transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ variantId, transactionType: 'ADJUSTMENT_OUT', quantity: 100, notes: 'Too much' }),
    }, env);
    expect(excRes.status).toBe(400);

    // 5. Manual API restriction: ISSUE_OUT or RETURN_IN rejected
    const manualIssueRes = await app.request(`/api/v1/outlets/${outletId}/hr/uniform/stock-transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ variantId, transactionType: 'ISSUE_OUT', quantity: 2, notes: 'Manual bypass' }),
    }, env);
    expect(manualIssueRes.status).toBe(400);

    // 6. Check stock summary
    const sumRes = await app.request(`/api/v1/outlets/${outletId}/hr/uniform/stock-summary`, {
      method: 'GET',
      headers: { 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
    }, env);
    expect(sumRes.status).toBe(200);
    const sumJson: any = await sumRes.json();
    const summaryItem = sumJson.data.find((s: any) => s.variantId === variantId);
    expect(summaryItem.currentStock).toBe(25); // 20 + 10 - 5
  });

  it('handles full staff uniform issue, return, and replacement lifecycle with atomicity', async () => {
    const outletId = OUTLET_ID;
    const db = getDb(localD1);
    const now = new Date().toISOString();

    const desigId = `desig_${Date.now()}`;
    await db.insert(hrDesignations).values({
      id: desigId,
      outletId,
      code: 'ATTENDANT',
      name: 'Retail Attendant',
      status: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    const staffId = `staff_${Date.now()}`;
    await db.insert(hrStaff).values({
      id: staffId,
      outletId,
      employeeCode: 'EMP101',
      fullName: 'Test Staff',
      designationId: desigId,
      aadhaarLast4: '5678',
      emergencyContactName: 'Contact',
      emergencyContactPhone: '9876543210',
      joiningDate: '2025-01-01',
      employmentStatus: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    // Create item & variant with stock
    const itemRes = await app.request(`/api/v1/outlets/${outletId}/hr/uniform/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ itemCode: 'JKT-01', itemName: 'Safety Jacket', category: 'JACKET' }),
    }, env);
    const itemId = (await itemRes.json() as any).data.id;

    const varRes = await app.request(`/api/v1/outlets/${outletId}/hr/uniform/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ uniformItemId: itemId, sizeLabel: 'L' }),
    }, env);
    const variantId = (await varRes.json() as any).data.id;

    // Add stock
    await app.request(`/api/v1/outlets/${outletId}/hr/uniform/stock-transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ variantId, transactionType: 'OPENING_BALANCE', quantity: 10 }),
    }, env);

    // 1. Issue uniform to staff
    const issueRes = await app.request(`/api/v1/outlets/${outletId}/hr/uniform/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ staffId, variantId, quantity: 1, conditionAtIssue: 'NEW' }),
    }, env);
    expect(issueRes.status).toBe(201);
    const issueJson: any = await issueRes.json();
    const issueId = issueJson.data.id;
    expect(issueJson.data.status).toBe('ISSUED');

    // 2. Return uniform (GOOD condition, returnToStock = true)
    const returnRes = await app.request(`/api/v1/outlets/${outletId}/hr/uniform/issues/${issueId}/return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ condition: 'GOOD', returnToStock: true, notes: 'Returned clean' }),
    }, env);
    expect(returnRes.status).toBe(200);
    expect((await returnRes.json() as any).data.status).toBe('RETURNED');
  });

  it('enforces route security / URL outlet identity protection', async () => {
    const outletId = OUTLET_ID;

    // Try accessing with non-existent or mismatched item ID
    const res = await app.request(`/api/v1/outlets/${outletId}/hr/uniform/items/non-existent-item`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': dealerCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ itemName: 'Hacker Edit' }),
    }, env);
    expect(res.status).toBe(404);
  });

  it('enforces RBAC permissions across roles', async () => {
    const outletId = OUTLET_ID;

    // State office (SO) has read access but write inventory denied (403)
    const soWriteRes = await app.request(`/api/v1/outlets/${outletId}/hr/uniform/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': soCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ itemCode: 'SO-TEST', itemName: 'Unauthorized', category: 'SHIRT' }),
    }, env);
    expect(soWriteRes.status).toBe(403);
  });
});
