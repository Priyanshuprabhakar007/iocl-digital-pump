import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import fs from 'fs';
import { eq, and, sql } from 'drizzle-orm';
import {
  hrUniformItems,
  hrUniformVariants,
  hrUniformStockTransactions,
  hrUniformIssues,
  hrStaff,
  hrDesignations,
  auditLogs,
  permissions,
  rolePermissions,
  roles,
} from '../src/db/schema';

describe('Phase 5C-1 Uniform Management Hardening Suite', () => {
  let localD1: any;
  let env: any;
  let testDbPath: string;
  const OUTLET_ID = 'ro-1001';
  const OTHER_OUTLET_ID = 'ro-1002';

  const ROLES = {
    ADMIN: 'admin@iocl.in',
    SO: 'wbso@iocl.in',
    DO: 'kolkatado@iocl.in',
    BM: 'bm.kolkata@iocl.in',
    FO: 'fo.central@iocl.in',
    DEALER: 'dealer.parkstreet@iocl.in',
    CSP: 'csp.parkstreet@iocl.in',
  };

  const cookies: Record<string, string> = {};

  beforeEach(async () => {
    testDbPath = `./.sqlite/test_hr_uniform_${Math.random().toString(36).substring(2)}_${Date.now()}.db`;
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
      ENVIRONMENT: 'test',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    };

    for (const [role, email] of Object.entries(ROLES)) {
      const cookie = await loginAs(email);
      expect(cookie).not.toBe('');
      expect(cookie).toBeDefined();
      cookies[role] = cookie;
    }
  });

  afterEach(() => {
    try { localD1.close(); } catch (e) {}
    if (testDbPath && fs.existsSync(testDbPath)) { try { fs.unlinkSync(testDbPath); } catch (e) {} }
    const walPath = `${testDbPath}-wal`;
    const shmPath = `${testDbPath}-shm`;
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

  async function authRequest(endpoint: string, method: string, role: string, body?: any) {
    const res = await app.request(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies[role],
        'Origin': 'http://localhost:3000',
      },
      body: body ? JSON.stringify(body) : undefined,
    }, env);
    return res;
  }

  async function getJson(res: Response): Promise<any> {
    return (await res.json()) as any;
  }

  async function execSql(query: string) {
    return localD1.prepare(query).run();
  }

  async function setupActiveStaff(db: any, outletId: string) {
    const desigId = `desig-${Math.random().toString(36).substring(2)}`;
    const staffId = `staff-${Math.random().toString(36).substring(2)}`;
    const now = new Date().toISOString();

    await db.insert(hrDesignations).values({
      id: desigId,
      outletId,
      code: `DSG_${Math.floor(100 + Math.random() * 900)}`,
      name: 'Uniform Operator',
      status: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    await db.insert(hrStaff).values({
      id: staffId,
      outletId,
      employeeCode: `EMP${Math.floor(1000 + Math.random() * 9000)}`,
      fullName: 'Uniform Attendant Staff',
      designationId: desigId,
      aadhaarLast4: '4321',
      emergencyContactName: 'Supervisor',
      emergencyContactPhone: '9876543210',
      joiningDate: '2025-01-01',
      employmentStatus: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    return { desigId, staffId };
  }

  // ==========================================================================
  // 1. MIGRATION, TABLES, TRIGGERS & PERMISSIONS VERIFICATION
  // ==========================================================================
  it('verifies migration, tables, triggers and permissions', async () => {
    const db = getDb(localD1);

    // Verify tables exist in sqlite_master
    const tables = await db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'hr_uniform_%'`
    );
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('hr_uniform_items');
    expect(tableNames).toContain('hr_uniform_variants');
    expect(tableNames).toContain('hr_uniform_stock_transactions');
    expect(tableNames).toContain('hr_uniform_issues');

    // Verify permissions exist in permissions table
    const perms = await db.select().from(permissions).where(
      sql`${permissions.code} IN ('hr.uniform.read', 'hr.uniform.inventory.write', 'hr.uniform.issue.write')`
    ).all();
    expect(perms.length).toBe(3);

    // Verify role permissions
    const adminRole = await db.select().from(roles).where(eq(roles.code, 'ADMIN')).get();
    expect(adminRole).toBeDefined();

    const adminPerms = await db.select().from(rolePermissions)
      .where(eq(rolePermissions.roleId, adminRole!.id))
      .all();
    const adminPermIds = new Set(adminPerms.map(p => p.permissionId));
    perms.forEach(p => {
      expect(adminPermIds.has(p.id)).toBe(true);
    });

    const cspRole = await db.select().from(roles).where(eq(roles.code, 'CSP')).get();
    expect(cspRole).toBeDefined();
    const cspPerms = await db.select().from(rolePermissions)
      .where(eq(rolePermissions.roleId, cspRole!.id))
      .all();
    const cspPermIds = new Set(cspPerms.map(p => p.permissionId));
    const readPerm = perms.find(p => p.code === 'hr.uniform.read')!;
    const invWritePerm = perms.find(p => p.code === 'hr.uniform.inventory.write')!;
    expect(cspPermIds.has(readPerm.id)).toBe(true);
    expect(cspPermIds.has(invWritePerm.id)).toBe(false);
  });

  // ==========================================================================
  // 2. UNIFORM ITEM CRUD, DUPLICATE CODE & IDENTITY IMMUTABILITY
  // ==========================================================================
  it('verifies uniform item CRUD, duplicate code rejection and identity immutability', async () => {
    // Create item
    const createRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/items`, 'POST', 'ADMIN', {
      itemCode: 'SHIRT-REG',
      itemName: 'IOCL Regular Shirt',
      category: 'SHIRT',
      description: 'Standard orange-blue regular staff shirt',
    });
    expect(createRes.status).toBe(201);
    const createData = await getJson(createRes);
    expect(createData.success).toBe(true);
    expect(createData.data.itemCode).toBe('SHIRT-REG');
    expect(createData.data.status).toBe('ACTIVE');
    const itemId = createData.data.id;

    // List items
    const listRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/items`, 'GET', 'ADMIN');
    expect(listRes.status).toBe(200);
    const listData = await getJson(listRes);
    expect(listData.success).toBe(true);
    expect(listData.data.some((i: any) => i.id === itemId)).toBe(true);

    // Update item
    const updateRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/items/${itemId}`, 'PUT', 'ADMIN', {
      itemName: 'IOCL Regular Shirt Updated',
      category: 'SHIRT',
      description: 'Updated description',
      status: 'ACTIVE',
    });
    expect(updateRes.status).toBe(200);
    const updateData = await getJson(updateRes);
    expect(updateData.data.itemName).toBe('IOCL Regular Shirt Updated');

    // Duplicate item code rejected
    const dupRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/items`, 'POST', 'ADMIN', {
      itemCode: 'SHIRT-REG',
      itemName: 'Duplicate Item Code',
      category: 'SHIRT',
    });
    expect(dupRes.status).toBe(409);
    const dupData = await getJson(dupRes);
    expect(dupData.error.code).toBe('HR_UNIFORM_ITEM_CODE_EXISTS');

    // Direct deletion forbidden
    await expect(execSql(`DELETE FROM hr_uniform_items WHERE id = '${itemId}';`))
      .rejects.toThrow('HR_UNIFORM_ITEM_DELETE_FORBIDDEN');

    // Item identity immutability triggers
    await expect(execSql(`UPDATE hr_uniform_items SET item_code = 'SHIRT-NEW' WHERE id = '${itemId}';`))
      .rejects.toThrow('HR_UNIFORM_ITEM_IDENTITY_IMMUTABLE');

    await expect(execSql(`UPDATE hr_uniform_items SET outlet_id = '${OTHER_OUTLET_ID}' WHERE id = '${itemId}';`))
      .rejects.toThrow('HR_UNIFORM_ITEM_IDENTITY_IMMUTABLE');
  });

  // ==========================================================================
  // 3. UNIFORM VARIANT CRUD, DUPLICATE SIZE & CROSS-OUTLET PROTECTION
  // ==========================================================================
  it('verifies variant CRUD, duplicate size, and cross-outlet protection', async () => {
    // Create base item
    const itemRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/items`, 'POST', 'ADMIN', {
      itemCode: 'TROUSER-01',
      itemName: 'Staff Trousers',
      category: 'TROUSER',
    });
    expect(itemRes.status).toBe(201);
    const item = (await getJson(itemRes)).data;

    // Create variant
    const varRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/variants`, 'POST', 'ADMIN', {
      uniformItemId: item.id,
      sizeLabel: '32',
      sizeSortOrder: 32,
      reorderLevel: 5,
    });
    expect(varRes.status).toBe(201);
    const variant = (await getJson(varRes)).data;
    expect(variant.sizeLabel).toBe('32');
    expect(variant.status).toBe('ACTIVE');

    // List variants
    const listRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/variants?itemId=${item.id}`, 'GET', 'ADMIN');
    expect(listRes.status).toBe(200);
    const listData = await getJson(listRes);
    expect(listData.data.some((v: any) => v.id === variant.id)).toBe(true);

    // Update variant
    const updateRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/variants/${variant.id}`, 'PUT', 'ADMIN', {
      sizeSortOrder: 34,
      reorderLevel: 10,
      status: 'ACTIVE',
    });
    expect(updateRes.status).toBe(200);
    const updated = (await getJson(updateRes)).data;
    expect(updated.reorderLevel).toBe(10);

    // Duplicate size rejected
    const dupRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/variants`, 'POST', 'ADMIN', {
      uniformItemId: item.id,
      sizeLabel: '32',
      reorderLevel: 5,
    });
    expect(dupRes.status).toBe(409);
    expect((await getJson(dupRes)).error.code).toBe('HR_UNIFORM_VARIANT_EXISTS');

    // Variant deletion forbidden
    await expect(execSql(`DELETE FROM hr_uniform_variants WHERE id = '${variant.id}';`))
      .rejects.toThrow('HR_UNIFORM_VARIANT_DELETE_FORBIDDEN');

    // Cross-outlet variant protection
    await expect(execSql(`
      INSERT INTO hr_uniform_variants (id, outlet_id, uniform_item_id, size_label, created_by, created_at, updated_at)
      VALUES ('v-cross', '${OTHER_OUTLET_ID}', '${item.id}', '36', 'user-admin', datetime('now'), datetime('now'));
    `)).rejects.toThrow('HR_UNIFORM_VARIANT_OUTLET_MISMATCH');

    // Nonexistent item
    await expect(execSql(`
      INSERT INTO hr_uniform_variants (id, outlet_id, uniform_item_id, size_label, created_by, created_at, updated_at)
      VALUES ('v-fake-item', '${OUTLET_ID}', 'nonexistent-item', '36', 'user-admin', datetime('now'), datetime('now'));
    `)).rejects.toThrow('HR_UNIFORM_ITEM_NOT_FOUND');

    // Variant identity immutability
    await expect(execSql(`UPDATE hr_uniform_variants SET size_label = '38' WHERE id = '${variant.id}';`))
      .rejects.toThrow('HR_UNIFORM_VARIANT_IDENTITY_IMMUTABLE');
  });

  // ==========================================================================
  // 4. STOCK OPENING BALANCE, RECEIPTS, ADJUSTMENTS & CONSTRAINTS
  // ==========================================================================
  it('verifies stock opening balance, receipts, adjustments, and negative stock checks', async () => {
    // Setup item and variant
    const itemRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/items`, 'POST', 'ADMIN', {
      itemCode: 'CAP-01',
      itemName: 'IOCL Cap',
      category: 'CAP',
    });
    const item = (await getJson(itemRes)).data;

    const varRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/variants`, 'POST', 'ADMIN', {
      uniformItemId: item.id,
      sizeLabel: 'FREE',
      reorderLevel: 10,
    });
    const variant = (await getJson(varRes)).data;

    // 1. Opening balance
    const obRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/stock-transactions`, 'POST', 'ADMIN', {
      variantId: variant.id,
      transactionType: 'OPENING_BALANCE',
      quantity: 50,
      notes: 'Initial stock intake',
    });
    expect(obRes.status).toBe(201);

    // 2. Receipt
    const rcptRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/stock-transactions`, 'POST', 'ADMIN', {
      variantId: variant.id,
      transactionType: 'RECEIPT',
      quantity: 20,
      notes: 'Supplier shipment received',
    });
    expect(rcptRes.status).toBe(201);

    // 3. Adjustment In with notes
    const adjInRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/stock-transactions`, 'POST', 'ADMIN', {
      variantId: variant.id,
      transactionType: 'ADJUSTMENT_IN',
      quantity: 5,
      notes: 'Audit variance recount',
    });
    expect(adjInRes.status).toBe(201);

    // 4. Adjustment Out with notes
    const adjOutRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/stock-transactions`, 'POST', 'ADMIN', {
      variantId: variant.id,
      transactionType: 'ADJUSTMENT_OUT',
      quantity: 10,
      notes: 'Damaged during water leak',
    });
    expect(adjOutRes.status).toBe(201);

    // 5. Adjustment without notes rejected
    const noNotesRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/stock-transactions`, 'POST', 'ADMIN', {
      variantId: variant.id,
      transactionType: 'ADJUSTMENT_IN',
      quantity: 5,
    });
    expect(noNotesRes.status).toBe(400);

    // 6. Insufficient stock rejected
    const overStockRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/stock-transactions`, 'POST', 'ADMIN', {
      variantId: variant.id,
      transactionType: 'ADJUSTMENT_OUT',
      quantity: 9999,
      notes: 'Excessive depletion',
    });
    expect(overStockRes.status).toBe(400);
    expect((await getJson(overStockRes)).error.code).toBe('HR_UNIFORM_INSUFFICIENT_STOCK');

    // 7. Manual ISSUE_OUT and RETURN_IN via transaction endpoint prohibited
    const issueManual = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/stock-transactions`, 'POST', 'ADMIN', {
      variantId: variant.id,
      transactionType: 'ISSUE_OUT',
      quantity: 2,
    });
    expect(issueManual.status).toBe(400);

    const returnManual = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/stock-transactions`, 'POST', 'ADMIN', {
      variantId: variant.id,
      transactionType: 'RETURN_IN',
      quantity: 2,
    });
    expect(returnManual.status).toBe(400);

    // DB trigger rejection for unreferenced manual ISSUE_OUT/RETURN_IN
    await expect(execSql(`
      INSERT INTO hr_uniform_stock_transactions (
        id, outlet_id, variant_id, transaction_type, quantity, occurred_at, created_by, created_at
      ) VALUES (
        'tx-manual-unref-issue', '${OUTLET_ID}', '${variant.id}', 'ISSUE_OUT', 1, datetime('now'), 'user-admin', datetime('now')
      );
    `)).rejects.toThrow('HR_UNIFORM_INVALID_TRANSACTION_TYPE');

    // 8. Stock Summary check
    // Current stock: 50 + 20 + 5 - 10 = 65
    const summaryRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/stock-summary`, 'GET', 'ADMIN');
    expect(summaryRes.status).toBe(200);
    const summaryList = (await getJson(summaryRes)).data;
    const itemSummary = summaryList.find((s: any) => s.variantId === variant.id);
    expect(itemSummary).toBeDefined();
    expect(itemSummary.currentStock).toBe(65);
    expect(itemSummary.isLowStock).toBe(false);
  });

  // ==========================================================================
  // 5. UNIFORM ISSUE, RETURN, AND REPLACEMENT LIFECYCLE
  // ==========================================================================
  it('verifies uniform issue, return, and replacement lifecycle via API', async () => {
    const db = getDb(localD1);
    const { staffId } = await setupActiveStaff(db, OUTLET_ID);

    // Item and Variant
    const itemRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/items`, 'POST', 'ADMIN', {
      itemCode: 'SAFETY-JACKET',
      itemName: 'Reflective Safety Jacket',
      category: 'JACKET',
    });
    const item = (await getJson(itemRes)).data;

    const varRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/variants`, 'POST', 'ADMIN', {
      uniformItemId: item.id,
      sizeLabel: 'L',
      reorderLevel: 2,
    });
    const variant = (await getJson(varRes)).data;

    // Inflow stock
    await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/stock-transactions`, 'POST', 'ADMIN', {
      variantId: variant.id,
      transactionType: 'OPENING_BALANCE',
      quantity: 10,
    });

    // 1. Issue uniform
    const issueRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/issues`, 'POST', 'ADMIN', {
      staffId,
      variantId: variant.id,
      quantity: 2,
      conditionAtIssue: 'NEW',
      notes: 'Initial issue for new hire',
    });
    expect(issueRes.status).toBe(201);
    const issue = (await getJson(issueRes)).data;
    expect(issue.status).toBe('ISSUED');
    expect(issue.quantity).toBe(2);

    // Check stock: 10 - 2 = 8
    const sum1 = (await getJson(await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/stock-summary`, 'GET', 'ADMIN'))).data;
    expect(sum1.find((s: any) => s.variantId === variant.id).currentStock).toBe(8);

    // 2. Return uniform (GOOD condition, returnToStock: true)
    const returnRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/issues/${issue.id}/return`, 'POST', 'ADMIN', {
      condition: 'GOOD',
      returnToStock: true,
      notes: 'Returned in clean state',
    });
    expect(returnRes.status).toBe(200);
    const returned = (await getJson(returnRes)).data;
    expect(returned.status).toBe('RETURNED');
    expect(returned.closedAt).not.toBeNull();

    // Check stock: 8 + 2 = 10
    const sum2 = (await getJson(await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/stock-summary`, 'GET', 'ADMIN'))).data;
    expect(sum2.find((s: any) => s.variantId === variant.id).currentStock).toBe(10);

    // Attempt returning already closed issue fails
    const doubleReturn = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/issues/${issue.id}/return`, 'POST', 'ADMIN', {
      condition: 'GOOD',
      returnToStock: true,
    });
    expect(doubleReturn.status).toBe(409);
    expect((await getJson(doubleReturn)).error.code).toBe('HR_UNIFORM_ISSUE_ALREADY_CLOSED');

    // 3. Issue and Replace
    const issue2Res = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/issues`, 'POST', 'ADMIN', {
      staffId,
      variantId: variant.id,
      quantity: 1,
      conditionAtIssue: 'NEW',
    });
    expect(issue2Res.status).toBe(201);
    const issue2 = (await getJson(issue2Res)).data;

    const replaceRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/issues/${issue2.id}/replace`, 'POST', 'ADMIN', {
      oldCondition: 'DAMAGED',
      replacementReason: 'DAMAGED',
      returnOldToStock: false,
      replacementVariantId: variant.id,
      quantity: 1,
      notes: 'Torn during maintenance work',
    });
    expect(replaceRes.status).toBe(200);
    const replaceData = (await getJson(replaceRes)).data;
    expect(replaceData.oldIssue.status).toBe('REPLACED');
    expect(replaceData.newIssue.status).toBe('ISSUED');
    expect(replaceData.newIssue.replacesIssueId).toBe(issue2.id);
  });

  // ==========================================================================
  // 6. ROUTE OUTLET SECURITY
  // ==========================================================================
  it('enforces route outlet security for unauthorized outlets', async () => {
    // Dealer of ro-1001 attempting to access ro-1002
    const readRes = await authRequest(`/api/v1/outlets/${OTHER_OUTLET_ID}/hr/uniform/items`, 'GET', 'DEALER');
    expect(readRes.status).toBe(403);
    expect((await getJson(readRes)).error.code).toBe('FORBIDDEN');

    const writeRes = await authRequest(`/api/v1/outlets/${OTHER_OUTLET_ID}/hr/uniform/items`, 'POST', 'DEALER', {
      itemCode: 'CROSS-OUTLET',
      itemName: 'Hacked Item',
      category: 'SHIRT',
    });
    expect(writeRes.status).toBe(403);
    expect((await getJson(writeRes)).error.code).toBe('FORBIDDEN');

    const issueRes = await authRequest(`/api/v1/outlets/${OTHER_OUTLET_ID}/hr/uniform/issues`, 'POST', 'DEALER', {
      staffId: 'staff-fake',
      variantId: 'variant-fake',
      quantity: 1,
    });
    expect(issueRes.status).toBe(403);
    expect((await getJson(issueRes)).error.code).toBe('FORBIDDEN');
  });

  // ==========================================================================
  // 7. REAL LEDGER INTEGRITY TESTS
  // ==========================================================================
  it('enforces RETURN_IN integrity', async () => {
    const db = getDb(localD1);
    const { staffId } = await setupActiveStaff(db, OUTLET_ID);

    // Setup item, variant, and initial stock
    const itemRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/items`, 'POST', 'ADMIN', {
      itemCode: 'SHIRT-LEDGER',
      itemName: 'Ledger Shirt',
      category: 'SHIRT',
    });
    const item = (await getJson(itemRes)).data;

    const varRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/variants`, 'POST', 'ADMIN', {
      uniformItemId: item.id,
      sizeLabel: 'M',
      reorderLevel: 5,
    });
    const variant = (await getJson(varRes)).data;

    // Add 20 stock
    await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/stock-transactions`, 'POST', 'ADMIN', {
      variantId: variant.id,
      transactionType: 'OPENING_BALANCE',
      quantity: 20,
    });

    // Issue quantity 2
    const issueRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/issues`, 'POST', 'ADMIN', {
      staffId,
      variantId: variant.id,
      quantity: 2,
    });
    const issue = (await getJson(issueRes)).data;

    // Test: referenced issue still ISSUED fails RETURN_IN
    await expect(execSql(`
      INSERT INTO hr_uniform_stock_transactions (
        id, outlet_id, variant_id, transaction_type, quantity, reference_type, reference_id, occurred_at, created_by, created_at
      ) VALUES (
        'tx-ret-fail-issued', '${OUTLET_ID}', '${variant.id}', 'RETURN_IN', 2, 'hr_uniform_issues', '${issue.id}', datetime('now'), 'user-admin', datetime('now')
      );
    `)).rejects.toThrow('HR_UNIFORM_INVALID_RESTOCK');

    // Close issue properly with RETURNED and condition GOOD
    const now = new Date().toISOString();
    await execSql(`
      UPDATE hr_uniform_issues
      SET status = 'RETURNED', closed_at = '${now}', closed_by = 'user-admin', condition_on_close = 'GOOD', updated_at = '${now}'
      WHERE id = '${issue.id}';
    `);

    // Test: quantity larger than issue quantity fails (quantity 3 vs 2)
    await expect(execSql(`
      INSERT INTO hr_uniform_stock_transactions (
        id, outlet_id, variant_id, transaction_type, quantity, reference_type, reference_id, occurred_at, created_by, created_at
      ) VALUES (
        'tx-ret-fail-large', '${OUTLET_ID}', '${variant.id}', 'RETURN_IN', 3, 'hr_uniform_issues', '${issue.id}', datetime('now'), 'user-admin', datetime('now')
      );
    `)).rejects.toThrow('HR_UNIFORM_INVALID_RESTOCK');

    // Test: quantity smaller than issue quantity fails (quantity 1 vs 2)
    await expect(execSql(`
      INSERT INTO hr_uniform_stock_transactions (
        id, outlet_id, variant_id, transaction_type, quantity, reference_type, reference_id, occurred_at, created_by, created_at
      ) VALUES (
        'tx-ret-fail-small', '${OUTLET_ID}', '${variant.id}', 'RETURN_IN', 1, 'hr_uniform_issues', '${issue.id}', datetime('now'), 'user-admin', datetime('now')
      );
    `)).rejects.toThrow('HR_UNIFORM_INVALID_RESTOCK');

    // Test: wrong outlet fails
    await expect(execSql(`
      INSERT INTO hr_uniform_stock_transactions (
        id, outlet_id, variant_id, transaction_type, quantity, reference_type, reference_id, occurred_at, created_by, created_at
      ) VALUES (
        'tx-ret-fail-outlet', '${OTHER_OUTLET_ID}', '${variant.id}', 'RETURN_IN', 2, 'hr_uniform_issues', '${issue.id}', datetime('now'), 'user-admin', datetime('now')
      );
    `)).rejects.toThrow();

    // Test: wrong variant fails
    const var2Res = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/variants`, 'POST', 'ADMIN', {
      uniformItemId: item.id,
      sizeLabel: 'XL',
      reorderLevel: 5,
    });
    const variant2 = (await getJson(var2Res)).data;
    await expect(execSql(`
      INSERT INTO hr_uniform_stock_transactions (
        id, outlet_id, variant_id, transaction_type, quantity, reference_type, reference_id, occurred_at, created_by, created_at
      ) VALUES (
        'tx-ret-fail-var', '${OUTLET_ID}', '${variant2.id}', 'RETURN_IN', 2, 'hr_uniform_issues', '${issue.id}', datetime('now'), 'user-admin', datetime('now')
      );
    `)).rejects.toThrow('HR_UNIFORM_INVALID_RESTOCK');

    // Test: exact issue quantity succeeds
    await execSql(`
      INSERT INTO hr_uniform_stock_transactions (
        id, outlet_id, variant_id, transaction_type, quantity, reference_type, reference_id, occurred_at, created_by, created_at
      ) VALUES (
        'tx-ret-success', '${OUTLET_ID}', '${variant.id}', 'RETURN_IN', 2, 'hr_uniform_issues', '${issue.id}', datetime('now'), 'user-admin', datetime('now')
      );
    `);
    const successRow = await db.select().from(hrUniformStockTransactions).where(eq(hrUniformStockTransactions.id, 'tx-ret-success')).get();
    expect(successRow).toBeDefined();

    // Test: duplicate RETURN_IN fails
    await expect(execSql(`
      INSERT INTO hr_uniform_stock_transactions (
        id, outlet_id, variant_id, transaction_type, quantity, reference_type, reference_id, occurred_at, created_by, created_at
      ) VALUES (
        'tx-ret-dup', '${OUTLET_ID}', '${variant.id}', 'RETURN_IN', 2, 'hr_uniform_issues', '${issue.id}', datetime('now'), 'user-admin', datetime('now')
      );
    `)).rejects.toThrow('HR_UNIFORM_DUPLICATE_RETURN_IN');

    // Test: DAMAGED and LOST return restock fails
    const issueDamagedId = `iss-dam-${Math.random().toString(36).substring(2)}`;
    await execSql(`
      INSERT INTO hr_uniform_issues (
        id, outlet_id, staff_id, variant_id, quantity, issued_at, issued_by, condition_at_issue, status, closed_at, closed_by, condition_on_close, created_at, updated_at
      ) VALUES (
        '${issueDamagedId}', '${OUTLET_ID}', '${staffId}', '${variant.id}', 1, datetime('now'), 'user-admin', 'NEW', 'RETURNED', datetime('now'), 'user-admin', 'DAMAGED', datetime('now'), datetime('now')
      );
    `);
    await expect(execSql(`
      INSERT INTO hr_uniform_stock_transactions (
        id, outlet_id, variant_id, transaction_type, quantity, reference_type, reference_id, occurred_at, created_by, created_at
      ) VALUES (
        'tx-ret-damaged', '${OUTLET_ID}', '${variant.id}', 'RETURN_IN', 1, 'hr_uniform_issues', '${issueDamagedId}', datetime('now'), 'user-admin', datetime('now')
      );
    `)).rejects.toThrow('HR_UNIFORM_INVALID_RESTOCK');

    const issueLostId = `iss-lost-${Math.random().toString(36).substring(2)}`;
    await execSql(`
      INSERT INTO hr_uniform_issues (
        id, outlet_id, staff_id, variant_id, quantity, issued_at, issued_by, condition_at_issue, status, closed_at, closed_by, condition_on_close, created_at, updated_at
      ) VALUES (
        '${issueLostId}', '${OUTLET_ID}', '${staffId}', '${variant.id}', 1, datetime('now'), 'user-admin', 'NEW', 'RETURNED', datetime('now'), 'user-admin', 'LOST', datetime('now'), datetime('now')
      );
    `);
    await expect(execSql(`
      INSERT INTO hr_uniform_stock_transactions (
        id, outlet_id, variant_id, transaction_type, quantity, reference_type, reference_id, occurred_at, created_by, created_at
      ) VALUES (
        'tx-ret-lost', '${OUTLET_ID}', '${variant.id}', 'RETURN_IN', 1, 'hr_uniform_issues', '${issueLostId}', datetime('now'), 'user-admin', datetime('now')
      );
    `)).rejects.toThrow('HR_UNIFORM_INVALID_RESTOCK');
  });

  it('enforces ISSUE_OUT integrity', async () => {
    const db = getDb(localD1);
    const { staffId } = await setupActiveStaff(db, OUTLET_ID);

    const itemRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/items`, 'POST', 'ADMIN', {
      itemCode: 'SAFETY-BOOTS',
      itemName: 'Safety Boots',
      category: 'SAFETY_BOOTS',
    });
    const item = (await getJson(itemRes)).data;

    const varRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/variants`, 'POST', 'ADMIN', {
      uniformItemId: item.id,
      sizeLabel: '9',
      reorderLevel: 5,
    });
    const variant = (await getJson(varRes)).data;

    await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/stock-transactions`, 'POST', 'ADMIN', {
      variantId: variant.id,
      transactionType: 'OPENING_BALANCE',
      quantity: 50,
    });

    // 1. Correct service-generated ISSUE_OUT exists exactly once
    const issueRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/issues`, 'POST', 'ADMIN', {
      staffId,
      variantId: variant.id,
      quantity: 3,
    });
    expect(issueRes.status).toBe(201);
    const issue = (await getJson(issueRes)).data;

    const issueOutTxs = await db.select().from(hrUniformStockTransactions).where(
      and(
        eq(hrUniformStockTransactions.referenceType, 'hr_uniform_issues'),
        eq(hrUniformStockTransactions.referenceId, issue.id)
      )
    ).all();
    expect(issueOutTxs.length).toBe(1);
    expect(issueOutTxs[0].transactionType).toBe('ISSUE_OUT');
    expect(issueOutTxs[0].quantity).toBe(3);

    // 2. Nonexistent issue reference fails
    await expect(execSql(`
      INSERT INTO hr_uniform_stock_transactions (
        id, outlet_id, variant_id, transaction_type, quantity, reference_type, reference_id, occurred_at, created_by, created_at
      ) VALUES (
        'tx-iss-nonexistent', '${OUTLET_ID}', '${variant.id}', 'ISSUE_OUT', 1, 'hr_uniform_issues', 'nonexistent-issue', datetime('now'), 'user-admin', datetime('now')
      );
    `)).rejects.toThrow('HR_UNIFORM_ISSUE_NOT_FOUND');

    // 3. Duplicate ISSUE_OUT fails
    await expect(execSql(`
      INSERT INTO hr_uniform_stock_transactions (
        id, outlet_id, variant_id, transaction_type, quantity, reference_type, reference_id, occurred_at, created_by, created_at
      ) VALUES (
        'tx-iss-dup', '${OUTLET_ID}', '${variant.id}', 'ISSUE_OUT', 3, 'hr_uniform_issues', '${issue.id}', datetime('now'), 'user-admin', datetime('now')
      );
    `)).rejects.toThrow('HR_UNIFORM_DUPLICATE_ISSUE_OUT');

    // Create another raw issue to test variant/quantity mismatch
    const rawIssueId = `raw-iss-${Math.random().toString(36).substring(2)}`;
    await execSql(`
      INSERT INTO hr_uniform_issues (
        id, outlet_id, staff_id, variant_id, quantity, issued_at, issued_by, condition_at_issue, status, created_at, updated_at
      ) VALUES (
        '${rawIssueId}', '${OUTLET_ID}', '${staffId}', '${variant.id}', 2, datetime('now'), 'user-admin', 'NEW', 'ISSUED', datetime('now'), datetime('now')
      );
    `);

    // 4. Wrong variant fails
    const varOther = (await getJson(await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/variants`, 'POST', 'ADMIN', {
      uniformItemId: item.id,
      sizeLabel: '10',
      reorderLevel: 2,
    }))).data;

    await expect(execSql(`
      INSERT INTO hr_uniform_stock_transactions (
        id, outlet_id, variant_id, transaction_type, quantity, reference_type, reference_id, occurred_at, created_by, created_at
      ) VALUES (
        'tx-iss-wrong-var', '${OUTLET_ID}', '${varOther.id}', 'ISSUE_OUT', 2, 'hr_uniform_issues', '${rawIssueId}', datetime('now'), 'user-admin', datetime('now')
      );
    `)).rejects.toThrow('HR_UNIFORM_ISSUE_NOT_FOUND');

    // 5. Wrong quantity fails
    await expect(execSql(`
      INSERT INTO hr_uniform_stock_transactions (
        id, outlet_id, variant_id, transaction_type, quantity, reference_type, reference_id, occurred_at, created_by, created_at
      ) VALUES (
        'tx-iss-wrong-qty', '${OUTLET_ID}', '${variant.id}', 'ISSUE_OUT', 5, 'hr_uniform_issues', '${rawIssueId}', datetime('now'), 'user-admin', datetime('now')
      );
    `)).rejects.toThrow('HR_UNIFORM_ISSUE_NOT_FOUND');
  });

  // ==========================================================================
  // 8. REAL D1 BATCH ROLLBACK TESTS
  // ==========================================================================
  it('verifies D1 batch atomic rollback for issue, return and replacement failures', async () => {
    const db = getDb(localD1);
    const { staffId } = await setupActiveStaff(db, OUTLET_ID);

    const itemRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/items`, 'POST', 'ADMIN', {
      itemCode: 'BATCH-ITEM',
      itemName: 'Batch Atomic Item',
      category: 'SHIRT',
    });
    const item = (await getJson(itemRes)).data;

    const varRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/variants`, 'POST', 'ADMIN', {
      uniformItemId: item.id,
      sizeLabel: 'L',
      reorderLevel: 2,
    });
    const variant = (await getJson(varRes)).data;

    // Set initial stock = 10
    await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/stock-transactions`, 'POST', 'ADMIN', {
      variantId: variant.id,
      transactionType: 'OPENING_BALANCE',
      quantity: 10,
    });

    const getStock = async () => {
      const summary = await db.select({
        inflow: sql<number>`COALESCE(SUM(CASE WHEN ${hrUniformStockTransactions.transactionType} IN ('OPENING_BALANCE', 'RECEIPT', 'ADJUSTMENT_IN', 'RETURN_IN') THEN ${hrUniformStockTransactions.quantity} ELSE 0 END), 0)`,
        outflow: sql<number>`COALESCE(SUM(CASE WHEN ${hrUniformStockTransactions.transactionType} IN ('ADJUSTMENT_OUT', 'ISSUE_OUT') THEN ${hrUniformStockTransactions.quantity} ELSE 0 END), 0)`,
      }).from(hrUniformStockTransactions).where(eq(hrUniformStockTransactions.variantId, variant.id)).get();
      return (summary?.inflow ?? 0) - (summary?.outflow ?? 0);
    };

    expect(await getStock()).toBe(10);

    // ------------------------------------------------------------------------
    // CASE A: ISSUE Rollback (Force 2nd batch statement to fail)
    // ------------------------------------------------------------------------
    const failIssueId = `iss-fail-${Math.random().toString(36).substring(2)}`;
    const now = new Date().toISOString();

    const issueStmt = db.insert(hrUniformIssues).values({
      id: failIssueId,
      outletId: OUTLET_ID,
      staffId,
      variantId: variant.id,
      quantity: 3,
      issuedAt: now,
      issuedBy: 'user-admin',
      conditionAtIssue: 'NEW',
      status: 'ISSUED',
      createdAt: now,
      updatedAt: now,
    });

    // Statement 2 forces failure with negative quantity (fails CHECK(quantity > 0))
    const invalidIssueTxStmt = db.insert(hrUniformStockTransactions).values({
      id: `tx-fail-${Math.random().toString(36).substring(2)}`,
      outletId: OUTLET_ID,
      variantId: variant.id,
      transactionType: 'ISSUE_OUT',
      quantity: -99,
      referenceType: 'hr_uniform_issues',
      referenceId: failIssueId,
      occurredAt: now,
      createdBy: 'user-admin',
      createdAt: now,
    });

    let issueBatchFailed = false;
    try {
      await db.batch([issueStmt, invalidIssueTxStmt]);
    } catch (e) {
      issueBatchFailed = true;
    }
    expect(issueBatchFailed).toBe(true);

    // Assert atomicity
    const issueRow = await db.select().from(hrUniformIssues).where(eq(hrUniformIssues.id, failIssueId)).get();
    expect(issueRow).toBeUndefined();

    const txRows = await db.select().from(hrUniformStockTransactions).where(eq(hrUniformStockTransactions.referenceId, failIssueId)).all();
    expect(txRows.length).toBe(0);

    expect(await getStock()).toBe(10);

    // ------------------------------------------------------------------------
    // CASE B: RETURN Rollback (Force RETURN_IN to fail after issue update)
    // ------------------------------------------------------------------------
    // First create a legitimate issue
    const validIssueRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/issues`, 'POST', 'ADMIN', {
      staffId,
      variantId: variant.id,
      quantity: 2,
    });
    expect(validIssueRes.status).toBe(201);
    const validIssue = (await getJson(validIssueRes)).data;
    expect(await getStock()).toBe(8);

    const updateStmt = db.update(hrUniformIssues).set({
      status: 'RETURNED',
      closedAt: now,
      closedBy: 'user-admin',
      conditionOnClose: 'GOOD',
      updatedAt: now,
    }).where(eq(hrUniformIssues.id, validIssue.id));

    // Force RETURN_IN failure by passing quantity != issue.quantity (fails trigger)
    const invalidReturnTxStmt = db.insert(hrUniformStockTransactions).values({
      id: `tx-ret-fail-${Math.random().toString(36).substring(2)}`,
      outletId: OUTLET_ID,
      variantId: variant.id,
      transactionType: 'RETURN_IN',
      quantity: 9999,
      referenceType: 'hr_uniform_issues',
      referenceId: validIssue.id,
      occurredAt: now,
      createdBy: 'user-admin',
      createdAt: now,
    });

    let returnBatchFailed = false;
    try {
      await db.batch([updateStmt, invalidReturnTxStmt]);
    } catch (e) {
      returnBatchFailed = true;
    }
    expect(returnBatchFailed).toBe(true);

    // Assert issue status remains ISSUED and closedAt remains NULL
    const preservedIssue = await db.select().from(hrUniformIssues).where(eq(hrUniformIssues.id, validIssue.id)).get();
    expect(preservedIssue!.status).toBe('ISSUED');
    expect(preservedIssue!.closedAt).toBeNull();

    // Assert no RETURN_IN transaction exists
    const retTxs = await db.select().from(hrUniformStockTransactions).where(
      and(
        eq(hrUniformStockTransactions.referenceId, validIssue.id),
        eq(hrUniformStockTransactions.transactionType, 'RETURN_IN')
      )
    ).all();
    expect(retTxs.length).toBe(0);

    expect(await getStock()).toBe(8);

    // ------------------------------------------------------------------------
    // CASE C: REPLACEMENT Rollback (Force replacement ISSUE_OUT to fail)
    // ------------------------------------------------------------------------
    const newReplacementIssueId = `uiss-repl-${Math.random().toString(36).substring(2)}`;

    const updateOldIssueStmt = db.update(hrUniformIssues).set({
      status: 'REPLACED',
      closedAt: now,
      closedBy: 'user-admin',
      conditionOnClose: 'DAMAGED',
      replacementReason: 'DAMAGED',
      updatedAt: now,
    }).where(eq(hrUniformIssues.id, validIssue.id));

    const insertNewIssueStmt = db.insert(hrUniformIssues).values({
      id: newReplacementIssueId,
      outletId: OUTLET_ID,
      staffId,
      variantId: variant.id,
      quantity: 2,
      issuedAt: now,
      issuedBy: 'user-admin',
      conditionAtIssue: 'NEW',
      status: 'ISSUED',
      replacesIssueId: validIssue.id,
      createdAt: now,
      updatedAt: now,
    });

    // Fails on quantity check or trigger
    const invalidReplacementIssueOutStmt = db.insert(hrUniformStockTransactions).values({
      id: `ustx-out-fail-${Math.random().toString(36).substring(2)}`,
      outletId: OUTLET_ID,
      variantId: variant.id,
      transactionType: 'ISSUE_OUT',
      quantity: -5,
      referenceType: 'hr_uniform_issues',
      referenceId: newReplacementIssueId,
      occurredAt: now,
      createdBy: 'user-admin',
      createdAt: now,
    });

    let replBatchFailed = false;
    try {
      await db.batch([updateOldIssueStmt, insertNewIssueStmt, invalidReplacementIssueOutStmt]);
    } catch (e) {
      replBatchFailed = true;
    }
    expect(replBatchFailed).toBe(true);

    // Assert atomicity
    const oldIssueState = await db.select().from(hrUniformIssues).where(eq(hrUniformIssues.id, validIssue.id)).get();
    expect(oldIssueState!.status).toBe('ISSUED');

    const newIssueState = await db.select().from(hrUniformIssues).where(eq(hrUniformIssues.id, newReplacementIssueId)).get();
    expect(newIssueState).toBeUndefined();

    const replTxs = await db.select().from(hrUniformStockTransactions).where(eq(hrUniformStockTransactions.referenceId, newReplacementIssueId)).all();
    expect(replTxs.length).toBe(0);

    expect(await getStock()).toBe(8);
  });

  // ==========================================================================
  // 9. REAL LIFECYCLE DIRECT-SQL TESTS
  // ==========================================================================
  it('enforces direct-SQL lifecycle trigger rules and state machine constraints', async () => {
    const db = getDb(localD1);
    const { staffId } = await setupActiveStaff(db, OUTLET_ID);

    const itemRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/items`, 'POST', 'ADMIN', {
      itemCode: 'SHIRT-TRIGGERS',
      itemName: 'Trigger Rules Shirt',
      category: 'SHIRT',
    });
    const item = (await getJson(itemRes)).data;

    const varRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/variants`, 'POST', 'ADMIN', {
      uniformItemId: item.id,
      sizeLabel: 'M',
      reorderLevel: 5,
    });
    const variant = (await getJson(varRes)).data;

    // 1. INSERT ISSUED with closed_at rejected
    await expect(execSql(`
      INSERT INTO hr_uniform_issues (
        id, outlet_id, staff_id, variant_id, quantity, issued_at, issued_by, condition_at_issue, status, closed_at, created_at, updated_at
      ) VALUES (
        'trg-iss-closed', '${OUTLET_ID}', '${staffId}', '${variant.id}', 1, datetime('now'), 'user-admin', 'NEW', 'ISSUED', datetime('now'), datetime('now'), datetime('now')
      );
    `)).rejects.toThrow('HR_UNIFORM_INVALID_RETURN_CONDITION');

    // 2. INSERT ISSUED with replacement_reason rejected
    await expect(execSql(`
      INSERT INTO hr_uniform_issues (
        id, outlet_id, staff_id, variant_id, quantity, issued_at, issued_by, condition_at_issue, status, replacement_reason, created_at, updated_at
      ) VALUES (
        'trg-iss-repl', '${OUTLET_ID}', '${staffId}', '${variant.id}', 1, datetime('now'), 'user-admin', 'NEW', 'ISSUED', 'WORN_OUT', datetime('now'), datetime('now')
      );
    `)).rejects.toThrow('HR_UNIFORM_INVALID_RETURN_CONDITION');

    // 3. INSERT RETURNED without closed_at rejected
    await expect(execSql(`
      INSERT INTO hr_uniform_issues (
        id, outlet_id, staff_id, variant_id, quantity, issued_at, issued_by, condition_at_issue, status, closed_by, condition_on_close, created_at, updated_at
      ) VALUES (
        'trg-ret-no-closedat', '${OUTLET_ID}', '${staffId}', '${variant.id}', 1, datetime('now'), 'user-admin', 'NEW', 'RETURNED', 'user-admin', 'GOOD', datetime('now'), datetime('now')
      );
    `)).rejects.toThrow('HR_UNIFORM_INVALID_RETURN_CONDITION');

    // 4. INSERT RETURNED without closed_by rejected
    await expect(execSql(`
      INSERT INTO hr_uniform_issues (
        id, outlet_id, staff_id, variant_id, quantity, issued_at, issued_by, condition_at_issue, status, closed_at, condition_on_close, created_at, updated_at
      ) VALUES (
        'trg-ret-no-closedby', '${OUTLET_ID}', '${staffId}', '${variant.id}', 1, datetime('now'), 'user-admin', 'NEW', 'RETURNED', datetime('now'), 'GOOD', datetime('now'), datetime('now')
      );
    `)).rejects.toThrow('HR_UNIFORM_INVALID_RETURN_CONDITION');

    // 5. INSERT RETURNED without condition_on_close rejected
    await expect(execSql(`
      INSERT INTO hr_uniform_issues (
        id, outlet_id, staff_id, variant_id, quantity, issued_at, issued_by, condition_at_issue, status, closed_at, closed_by, created_at, updated_at
      ) VALUES (
        'trg-ret-no-cond', '${OUTLET_ID}', '${staffId}', '${variant.id}', 1, datetime('now'), 'user-admin', 'NEW', 'RETURNED', datetime('now'), 'user-admin', datetime('now'), datetime('now')
      );
    `)).rejects.toThrow('HR_UNIFORM_INVALID_RETURN_CONDITION');

    // 6. INSERT RETURNED with replacement_reason rejected
    await expect(execSql(`
      INSERT INTO hr_uniform_issues (
        id, outlet_id, staff_id, variant_id, quantity, issued_at, issued_by, condition_at_issue, status, closed_at, closed_by, condition_on_close, replacement_reason, created_at, updated_at
      ) VALUES (
        'trg-ret-with-repl', '${OUTLET_ID}', '${staffId}', '${variant.id}', 1, datetime('now'), 'user-admin', 'NEW', 'RETURNED', datetime('now'), 'user-admin', 'GOOD', 'DAMAGED', datetime('now'), datetime('now')
      );
    `)).rejects.toThrow('HR_UNIFORM_INVALID_RETURN_CONDITION');

    // 7. INSERT REPLACED without replacement_reason rejected
    await expect(execSql(`
      INSERT INTO hr_uniform_issues (
        id, outlet_id, staff_id, variant_id, quantity, issued_at, issued_by, condition_at_issue, status, closed_at, closed_by, condition_on_close, created_at, updated_at
      ) VALUES (
        'trg-repl-no-reason', '${OUTLET_ID}', '${staffId}', '${variant.id}', 1, datetime('now'), 'user-admin', 'NEW', 'REPLACED', datetime('now'), 'user-admin', 'GOOD', datetime('now'), datetime('now')
      );
    `)).rejects.toThrow('HR_UNIFORM_INVALID_RETURN_CONDITION');

    // Create a valid ISSUED row
    const testIssueId = `iss-state-${Math.random().toString(36).substring(2)}`;
    await execSql(`
      INSERT INTO hr_uniform_issues (
        id, outlet_id, staff_id, variant_id, quantity, issued_at, issued_by, condition_at_issue, status, created_at, updated_at
      ) VALUES (
        '${testIssueId}', '${OUTLET_ID}', '${staffId}', '${variant.id}', 1, datetime('now'), 'user-admin', 'NEW', 'ISSUED', datetime('now'), datetime('now')
      );
    `);

    // 8. UPDATE ISSUED -> ISSUED with closed_at rejected
    await expect(execSql(`
      UPDATE hr_uniform_issues SET closed_at = datetime('now') WHERE id = '${testIssueId}';
    `)).rejects.toThrow('HR_UNIFORM_INVALID_RETURN_CONDITION');

    // 9. UPDATE ISSUED -> ISSUED with replacement_reason rejected
    await expect(execSql(`
      UPDATE hr_uniform_issues SET replacement_reason = 'DAMAGED' WHERE id = '${testIssueId}';
    `)).rejects.toThrow('HR_UNIFORM_INVALID_RETURN_CONDITION');

    // Close issue properly to RETURNED
    await execSql(`
      UPDATE hr_uniform_issues
      SET status = 'RETURNED', closed_at = datetime('now'), closed_by = 'user-admin', condition_on_close = 'GOOD', updated_at = datetime('now')
      WHERE id = '${testIssueId}';
    `);

    // 10. UPDATE RETURNED -> REPLACED rejected
    await expect(execSql(`
      UPDATE hr_uniform_issues SET status = 'REPLACED', replacement_reason = 'DAMAGED' WHERE id = '${testIssueId}';
    `)).rejects.toThrow();

    // Create another issue and close to REPLACED
    const testIssueReplId = `iss-repl-state-${Math.random().toString(36).substring(2)}`;
    await execSql(`
      INSERT INTO hr_uniform_issues (
        id, outlet_id, staff_id, variant_id, quantity, issued_at, issued_by, condition_at_issue, status, closed_at, closed_by, condition_on_close, replacement_reason, created_at, updated_at
      ) VALUES (
        '${testIssueReplId}', '${OUTLET_ID}', '${staffId}', '${variant.id}', 1, datetime('now'), 'user-admin', 'NEW', 'REPLACED', datetime('now'), 'user-admin', 'DAMAGED', 'DAMAGED', datetime('now'), datetime('now')
      );
    `);

    // 11. UPDATE REPLACED -> RETURNED rejected
    await expect(execSql(`
      UPDATE hr_uniform_issues SET status = 'RETURNED' WHERE id = '${testIssueReplId}';
    `)).rejects.toThrow();
  });

  // ==========================================================================
  // 10. FULL 7-ROLE RBAC MATRIX
  // ==========================================================================
  it('verifies 7-role RBAC matrix on READ, INVENTORY WRITE, and ISSUE WRITE', async () => {
    const db = getDb(localD1);

    // Prerequisites for ISSUE WRITE: active staff, item, variant, sufficient stock
    const { staffId } = await setupActiveStaff(db, OUTLET_ID);

    const baseItemRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/items`, 'POST', 'ADMIN', {
      itemCode: 'RBAC-ITEM',
      itemName: 'RBAC Base Item',
      category: 'SHIRT',
    });
    expect(baseItemRes.status).toBe(201);
    const baseItem = (await getJson(baseItemRes)).data;

    const baseVarRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/variants`, 'POST', 'ADMIN', {
      uniformItemId: baseItem.id,
      sizeLabel: 'M',
      reorderLevel: 5,
    });
    expect(baseVarRes.status).toBe(201);
    const baseVariant = (await getJson(baseVarRes)).data;

    // Inflow ample stock (100) so issue write won't fail business validation
    await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/stock-transactions`, 'POST', 'ADMIN', {
      variantId: baseVariant.id,
      transactionType: 'OPENING_BALANCE',
      quantity: 100,
    });

    const rolesMatrix = [
      { role: 'ADMIN', read: 200, invWrite: 201, issueWrite: 201 },
      { role: 'SO', read: 200, invWrite: 403, issueWrite: 403 },
      { role: 'DO', read: 200, invWrite: 403, issueWrite: 403 },
      { role: 'BM', read: 200, invWrite: 201, issueWrite: 201 },
      { role: 'FO', read: 200, invWrite: 201, issueWrite: 201 },
      { role: 'DEALER', read: 200, invWrite: 201, issueWrite: 201 },
      { role: 'CSP', read: 200, invWrite: 403, issueWrite: 403 },
    ];

    for (const config of rolesMatrix) {
      // 1. READ test: GET /api/v1/outlets/:outletId/hr/uniform/items
      const readRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/items`, 'GET', config.role);
      expect(readRes.status).toBe(config.read);

      // 2. INVENTORY WRITE test: POST /api/v1/outlets/:outletId/hr/uniform/items
      const invRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/items`, 'POST', config.role, {
        itemCode: `CODE-${config.role}-${Math.floor(100 + Math.random() * 900)}`,
        itemName: `Item by ${config.role}`,
        category: 'SHIRT',
      });
      expect(invRes.status).toBe(config.invWrite);

      // 3. ISSUE WRITE test: POST /api/v1/outlets/:outletId/hr/uniform/issues
      const issueRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/issues`, 'POST', config.role, {
        staffId,
        variantId: baseVariant.id,
        quantity: 1,
        conditionAtIssue: 'NEW',
      });
      expect(issueRes.status).toBe(config.issueWrite);
    }
  });

  // ==========================================================================
  // 11. REAL ERROR SECURITY TEST
  // ==========================================================================
  it('verifies error security and sanitized responses on unmapped internal failures', async () => {
    // Inject a trigger that triggers an unmapped DB abort during item insert
    await localD1.exec(`
      CREATE TRIGGER trg_test_unmapped_crash
      BEFORE INSERT ON hr_uniform_items
      BEGIN
        SELECT RAISE(ABORT, 'UNMAPPED_RAW_SQLITE_FAILURE');
      END;
    `);

    try {
      const res = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/items`, 'POST', 'ADMIN', {
        itemCode: 'CRASH-TEST',
        itemName: 'Crash Test Item',
        category: 'SHIRT',
      });

      expect(res.status).toBe(500);

      const json = await getJson(res);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(json.error.message).toBe('An unexpected server error occurred.');

      const serialized = JSON.stringify(json);
      expect(serialized).not.toContain('SQLite');
      expect(serialized).not.toContain('SQLITE_CONSTRAINT');
      expect(serialized).not.toContain('D1_ERROR');
      expect(serialized).not.toContain('constraint failed');
      expect(serialized).not.toContain('raw SQL');
      expect(serialized).not.toContain('UNMAPPED_RAW_SQLITE_FAILURE');
    } finally {
      await localD1.exec(`DROP TRIGGER IF EXISTS trg_test_unmapped_crash;`);
    }
  });

  // ==========================================================================
  // 12. REAL AUDIT TESTS
  // ==========================================================================
  it('verifies audit logs for successful operations and absence on failed transactions', async () => {
    const db = getDb(localD1);
    const { staffId } = await setupActiveStaff(db, OUTLET_ID);

    // 1. Item Created Audit
    const itemRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/items`, 'POST', 'ADMIN', {
      itemCode: 'AUDIT-ITEM',
      itemName: 'Audit Uniform Item',
      category: 'SHIRT',
    });
    const item = (await getJson(itemRes)).data;

    const itemCreatedAudit = await db.select().from(auditLogs).where(
      and(
        eq(auditLogs.action, 'HR_UNIFORM_ITEM_CREATED'),
        eq(auditLogs.entityId, item.id)
      )
    ).all();
    expect(itemCreatedAudit.length).toBe(1);

    // 2. Item Updated Audit
    await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/items/${item.id}`, 'PUT', 'ADMIN', {
      itemName: 'Audit Uniform Item Renamed',
      category: 'SHIRT',
    });
    const itemUpdatedAudit = await db.select().from(auditLogs).where(
      and(
        eq(auditLogs.action, 'HR_UNIFORM_ITEM_UPDATED'),
        eq(auditLogs.entityId, item.id)
      )
    ).all();
    expect(itemUpdatedAudit.length).toBe(1);

    // 3. Variant Created Audit
    const varRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/variants`, 'POST', 'ADMIN', {
      uniformItemId: item.id,
      sizeLabel: 'L',
      reorderLevel: 5,
    });
    const variant = (await getJson(varRes)).data;
    const varCreatedAudit = await db.select().from(auditLogs).where(
      and(
        eq(auditLogs.action, 'HR_UNIFORM_VARIANT_CREATED'),
        eq(auditLogs.entityId, variant.id)
      )
    ).all();
    expect(varCreatedAudit.length).toBe(1);

    // 4. Variant Updated Audit
    await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/variants/${variant.id}`, 'PUT', 'ADMIN', {
      reorderLevel: 8,
      status: 'ACTIVE',
    });
    const varUpdatedAudit = await db.select().from(auditLogs).where(
      and(
        eq(auditLogs.action, 'HR_UNIFORM_VARIANT_UPDATED'),
        eq(auditLogs.entityId, variant.id)
      )
    ).all();
    expect(varUpdatedAudit.length).toBe(1);

    // 5. Stock Transaction Audit
    const txRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/stock-transactions`, 'POST', 'ADMIN', {
      variantId: variant.id,
      transactionType: 'OPENING_BALANCE',
      quantity: 50,
    });
    const tx = (await getJson(txRes)).data;
    const txAudit = await db.select().from(auditLogs).where(
      and(
        eq(auditLogs.action, 'HR_UNIFORM_STOCK_TRANSACTION_CREATED'),
        eq(auditLogs.entityId, tx.id)
      )
    ).all();
    expect(txAudit.length).toBe(1);

    // 6. Issue Audit
    const issueRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/issues`, 'POST', 'ADMIN', {
      staffId,
      variantId: variant.id,
      quantity: 2,
    });
    const issue = (await getJson(issueRes)).data;
    const issueAudit = await db.select().from(auditLogs).where(
      and(
        eq(auditLogs.action, 'HR_UNIFORM_ISSUED'),
        eq(auditLogs.entityId, issue.id)
      )
    ).all();
    expect(issueAudit.length).toBe(1);

    // 7. Return Audit
    await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/issues/${issue.id}/return`, 'POST', 'ADMIN', {
      condition: 'GOOD',
      returnToStock: true,
    });
    const returnAudit = await db.select().from(auditLogs).where(
      and(
        eq(auditLogs.action, 'HR_UNIFORM_RETURNED'),
        eq(auditLogs.entityId, issue.id)
      )
    ).all();
    expect(returnAudit.length).toBe(1);

    // 8. Replace Audit
    const issue2Res = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/issues`, 'POST', 'ADMIN', {
      staffId,
      variantId: variant.id,
      quantity: 1,
    });
    const issue2 = (await getJson(issue2Res)).data;

    const replaceRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/issues/${issue2.id}/replace`, 'POST', 'ADMIN', {
      oldCondition: 'DAMAGED',
      replacementReason: 'DAMAGED',
      returnOldToStock: false,
      replacementVariantId: variant.id,
      quantity: 1,
    });
    const replaceData = (await getJson(replaceRes)).data;
    const replaceAudit = await db.select().from(auditLogs).where(
      and(
        eq(auditLogs.action, 'HR_UNIFORM_REPLACED'),
        eq(auditLogs.entityId, replaceData.newIssue.id)
      )
    ).all();
    expect(replaceAudit.length).toBe(1);

    // 9. Negative verification: failed operation (e.g. insufficient stock issue) does NOT create an audit log
    const prevIssueAuditsCount = (await db.select().from(auditLogs).where(eq(auditLogs.action, 'HR_UNIFORM_ISSUED')).all()).length;
    const failedIssueRes = await authRequest(`/api/v1/outlets/${OUTLET_ID}/hr/uniform/issues`, 'POST', 'ADMIN', {
      staffId,
      variantId: variant.id,
      quantity: 9999, // Insufficient stock
    });
    expect(failedIssueRes.status).toBe(400);

    const postIssueAuditsCount = (await db.select().from(auditLogs).where(eq(auditLogs.action, 'HR_UNIFORM_ISSUED')).all()).length;
    expect(postIssueAuditsCount).toBe(prevIssueAuditsCount);
  });
});
