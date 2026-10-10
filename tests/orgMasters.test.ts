import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import * as schema from '../src/db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';

describe('Phase 2A Org Masters Suite (Comprehensive)', () => {
  let localD1: any;
  let env: any;
  let testDbPath: string;
  let adminCookie = '';
  let soCookie = '';

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

    // Login Admin
    const adminLoginRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
    }, env);
    adminCookie = adminLoginRes.headers.get('set-cookie')?.split(';')[0] || '';

    // Login State Office (Read-only for org masters)
    const soLoginRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ email: 'wbso@iocl.in', password: 'Password@123' }),
    }, env);
    soCookie = soLoginRes.headers.get('set-cookie')?.split(';')[0] || '';

    // Give SO user org.masters.write permission override to test that even WITH permission, lack of GLOBAL scope blocks write
    const nowIso = new Date().toISOString();
    await db.insert(schema.userPermissionOverrides).values({
      userId: 'user-so',
      permissionId: 'perm-org-w',
      effect: 'ALLOW',
      assignedByUserId: 'user-admin',
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  });

  afterEach(() => {
    try { localD1.close(); } catch (e) {}
    if (testDbPath && fs.existsSync(testDbPath)) { try { fs.unlinkSync(testDbPath); } catch (e) {} }
  });

  async function execSql(query: string) {
    return localD1.prepare(query).run();
  }

  it('allows admin to create, update departments and enforces uniqueness & validation', async () => {
    const createRes = await app.request('/api/v1/org/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ code: 'HRM', name: 'Human Resources', description: 'HR Management' }),
    }, env);

    expect(createRes.status).toBe(201);
    const json = await createRes.json() as any;
    expect(json.success).toBe(true);
    expect(json.data.code).toBe('HRM');
    expect(json.data.name).toBe('Human Resources');
    const deptId = json.data.id;

    // Duplicate code check
    const dupRes = await app.request('/api/v1/org/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ code: 'HRM', name: 'Duplicate HR' }),
    }, env);
    expect(dupRes.status).toBe(409);

    // Update department
    const updateRes = await app.request(`/api/v1/org/departments/${deptId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ name: 'Human Resources & Admin' }),
    }, env);
    expect(updateRes.status).toBe(200);
    const updateJson = await updateRes.json() as any;
    expect(updateJson.data.name).toBe('Human Resources & Admin');
  });

  it('enforces State Office read-only permissions on org master writes', async () => {
    // If not granted write permission or non-global, fails
    const res = await app.request('/api/v1/org/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': soCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ code: 'SO-TEST', name: 'SO Test Dept' }),
    }, env);
    expect([403, 401]).toContain(res.status);
  });

  it('allows admin to create and update officers', async () => {
    // Create dept first
    const deptRes = await app.request('/api/v1/org/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ code: 'OPS', name: 'Operations' }),
    }, env);
    const deptId = (await deptRes.json() as any).data.id;

    const offRes = await app.request('/api/v1/org/officers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        employeeCode: 'EMP-999',
        fullName: 'Jane Smith',
        designationTitle: 'Chief Manager',
        departmentId: deptId,
        email: 'jane.smith@iocl.in',
        phone: '9876543210',
      }),
    }, env);
    expect(offRes.status).toBe(201);
    const offJson = await offRes.json() as any;
    expect(offJson.data.employeeCode).toBe('EMP-999');
    const offId = offJson.data.id;

    // Update officer
    const updateRes = await app.request(`/api/v1/org/officers/${offId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ designationTitle: 'Senior General Manager' }),
    }, env);
    expect(updateRes.status).toBe(200);
    const updateJson = await updateRes.json() as any;
    expect(updateJson.data.designationTitle).toBe('Senior General Manager');
  });

  it('supports officer postings across all scopes with hierarchy validation', async () => {
    const deptRes = await app.request('/api/v1/org/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ code: 'MKT', name: 'Marketing' }),
    }, env);
    const deptId = (await deptRes.json() as any).data.id;

    const offRes = await app.request('/api/v1/org/officers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        employeeCode: 'EMP-888',
        fullName: 'Amitabh Roy',
        designationTitle: 'State Head',
        departmentId: deptId,
      }),
    }, env);
    const offId = (await offRes.json() as any).data.id;

    // Invalid posting: STATE scope without stateId
    const invalidRes = await app.request(`/api/v1/org/officers/${offId}/postings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        scopeLevel: 'STATE',
        effectiveFrom: '2026-04-01',
      }),
    }, env);
    expect(invalidRes.status).toBe(400);

    // Valid posting: STATE scope with stateId
    const validRes = await app.request(`/api/v1/org/officers/${offId}/postings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        scopeLevel: 'STATE',
        stateId: 'state-wb',
        effectiveFrom: '2026-04-01',
        isPrimary: true,
      }),
    }, env);
    expect(validRes.status).toBe(201);
    const postingId = (await validRes.json() as any).data.id;

    // Update posting
    const updatePostingRes = await app.request(`/api/v1/org/officer-postings/${postingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ effectiveTo: '2027-03-31', status: 'ACTIVE' }),
    }, env);
    expect(updatePostingRes.status).toBe(200);
  });

  it('allows service provider creation and historical multi-assignments to outlets', async () => {
    const spRes = await app.request('/api/v1/org/service-providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        providerCode: 'SP-SEC-1',
        providerName: 'Elite Security Agency',
        contactPerson: 'Col. Sharma',
        phone: '9123456789',
        status: 'ACTIVE',
      }),
    }, env);
    expect(spRes.status).toBe(201);
    const spId = (await spRes.json() as any).data.id;

    // Assignment 1
    const assign1 = await app.request('/api/v1/org/outlets/ro-1001/service-providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        serviceProviderId: spId,
        serviceType: 'SECURITY',
        contractNumber: 'SEC-2025-01',
        effectiveFrom: '2025-04-01',
        effectiveTo: '2026-03-31',
      }),
    }, env);
    expect(assign1.status).toBe(201);

    // Assignment 2 (Historical / Subsequent assignment to same outlet, proving non-unique constraint)
    const assign2 = await app.request('/api/v1/org/outlets/ro-1001/service-providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        serviceProviderId: spId,
        serviceType: 'SECURITY',
        contractNumber: 'SEC-2026-01',
        effectiveFrom: '2026-04-01',
      }),
    }, env);
    expect(assign2.status).toBe(201);
  });

  it('enforces global scope restriction for department, officer, and service provider masters', async () => {
    // Non-global user attempt (State Office) to create department returns 403 with controlled message
    const deptRes = await app.request('/api/v1/org/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': soCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ code: 'FIN', name: 'Finance' }),
    }, env);
    expect(deptRes.status).toBe(403);
    const deptJson = await deptRes.json() as any;
    expect(deptJson.error?.message).toMatch(/Global scope is required/i);

    // Non-global user attempt to create officer returns 403
    const offRes = await app.request('/api/v1/org/officers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': soCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        employeeCode: 'EMP-777',
        fullName: 'Rajesh Sen',
        designationTitle: 'Manager',
      }),
    }, env);
    expect(offRes.status).toBe(403);
    const offJson = await offRes.json() as any;
    expect(offJson.error?.message).toMatch(/Global scope is required/i);

    // Non-global user attempt to create service provider returns 403
    const spRes = await app.request('/api/v1/org/service-providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': soCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({
        providerCode: 'SP-SEC-2',
        providerName: 'Guard Services',
      }),
    }, env);
    expect(spRes.status).toBe(403);
    const spJson = await spRes.json() as any;
    expect(spJson.error?.message).toMatch(/Global scope is required/i);
  });

  // =========================================================================
  // INTEGRITY HARDENING TESTS
  // =========================================================================

  it('enforces DB delete-protection triggers for all org master tables', async () => {
    // 1. Department
    const deptRes = await app.request('/api/v1/org/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ code: 'DEL_DEP', name: 'Delete Protected Dept' }),
    }, env);
    const deptId = (await deptRes.json() as any).data.id;
    await expect(execSql(`DELETE FROM org_departments WHERE id = '${deptId}';`))
      .rejects.toThrow('ORG_DEPARTMENT_DELETE_FORBIDDEN');

    // 2. Officer
    const offRes = await app.request('/api/v1/org/officers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ employeeCode: 'DEL_EMP', fullName: 'Protected Officer', designationTitle: 'Lead', departmentId: deptId }),
    }, env);
    const offId = (await offRes.json() as any).data.id;
    await expect(execSql(`DELETE FROM org_officers WHERE id = '${offId}';`))
      .rejects.toThrow('ORG_OFFICER_DELETE_FORBIDDEN');

    // 3. Officer Posting
    const postRes = await app.request(`/api/v1/org/officers/${offId}/postings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ scopeLevel: 'STATE', stateId: 'state-wb', effectiveFrom: '2026-01-01' }),
    }, env);
    const postId = (await postRes.json() as any).data.id;
    await expect(execSql(`DELETE FROM org_officer_postings WHERE id = '${postId}';`))
      .rejects.toThrow('ORG_OFFICER_POSTING_DELETE_FORBIDDEN');

    // 4. Service Provider
    const spRes = await app.request('/api/v1/org/service-providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ providerCode: 'DEL_SP', providerName: 'Protected SP' }),
    }, env);
    const spId = (await spRes.json() as any).data.id;
    await expect(execSql(`DELETE FROM service_providers WHERE id = '${spId}';`))
      .rejects.toThrow('SERVICE_PROVIDER_DELETE_FORBIDDEN');

    // 5. Outlet Service Provider Assignment
    const assignRes = await app.request('/api/v1/org/outlets/ro-1001/service-providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ serviceProviderId: spId, serviceType: 'MANPOWER', effectiveFrom: '2026-01-01' }),
    }, env);
    const assignId = (await assignRes.json() as any).data.id;
    await expect(execSql(`DELETE FROM outlet_service_provider_assignments WHERE id = '${assignId}';`))
      .rejects.toThrow('OUTLET_SERVICE_PROVIDER_ASSIGNMENT_DELETE_FORBIDDEN');
  });

  it('enforces DB identity immutability triggers on direct SQL updates', async () => {
    // Setup records
    const deptRes = await app.request('/api/v1/org/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ code: 'IMM_DEP', name: 'Immutable Dept' }),
    }, env);
    const deptId = (await deptRes.json() as any).data.id;

    const offRes = await app.request('/api/v1/org/officers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ employeeCode: 'IMM_EMP', fullName: 'Immutable Officer', designationTitle: 'Officer', departmentId: deptId }),
    }, env);
    const offId = (await offRes.json() as any).data.id;

    const postRes = await app.request(`/api/v1/org/officers/${offId}/postings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ scopeLevel: 'STATE', stateId: 'state-wb', effectiveFrom: '2026-01-01' }),
    }, env);
    const postId = (await postRes.json() as any).data.id;

    const spRes = await app.request('/api/v1/org/service-providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ providerCode: 'IMM_SP', providerName: 'Immutable SP' }),
    }, env);
    const spId = (await spRes.json() as any).data.id;

    const assignRes = await app.request('/api/v1/org/outlets/ro-1001/service-providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ serviceProviderId: spId, serviceType: 'MANPOWER', effectiveFrom: '2026-01-01' }),
    }, env);
    const assignId = (await assignRes.json() as any).data.id;

    // 1. Department code change
    await expect(execSql(`UPDATE org_departments SET code = 'MOD_DEP' WHERE id = '${deptId}';`))
      .rejects.toThrow('ORG_DEPARTMENT_IDENTITY_IMMUTABLE');

    // 2. Officer employee_code change
    await expect(execSql(`UPDATE org_officers SET employee_code = 'MOD_EMP' WHERE id = '${offId}';`))
      .rejects.toThrow('ORG_OFFICER_IDENTITY_IMMUTABLE');

    // 3. Posting officer_id change
    await expect(execSql(`UPDATE org_officer_postings SET officer_id = 'other-off' WHERE id = '${postId}';`))
      .rejects.toThrow('ORG_OFFICER_POSTING_IDENTITY_IMMUTABLE');

    // 4. Provider code change
    await expect(execSql(`UPDATE service_providers SET provider_code = 'MOD_SP' WHERE id = '${spId}';`))
      .rejects.toThrow('SERVICE_PROVIDER_IDENTITY_IMMUTABLE');

    // 5. Assignment outlet_id or service_provider_id change
    await expect(execSql(`UPDATE outlet_service_provider_assignments SET outlet_id = 'ro-1002' WHERE id = '${assignId}';`))
      .rejects.toThrow('OUTLET_SERVICE_PROVIDER_ASSIGNMENT_IDENTITY_IMMUTABLE');
    await expect(execSql(`UPDATE outlet_service_provider_assignments SET service_provider_id = 'other-sp' WHERE id = '${assignId}';`))
      .rejects.toThrow('OUTLET_SERVICE_PROVIDER_ASSIGNMENT_IDENTITY_IMMUTABLE');
  });

  it('rejects postings and assignments with effectiveTo earlier than effectiveFrom (API & DB CHECK)', async () => {
    const deptRes = await app.request('/api/v1/org/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ code: 'DATE_DEP', name: 'Date Dept' }),
    }, env);
    const deptId = (await deptRes.json() as any).data.id;

    const offRes = await app.request('/api/v1/org/officers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ employeeCode: 'DATE_EMP', fullName: 'Date Officer', designationTitle: 'Officer', departmentId: deptId }),
    }, env);
    const offId = (await offRes.json() as any).data.id;

    // 1. Posting API rejection
    const invalidPostRes = await app.request(`/api/v1/org/officers/${offId}/postings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ scopeLevel: 'STATE', stateId: 'state-wb', effectiveFrom: '2026-05-01', effectiveTo: '2026-04-01' }),
    }, env);
    expect(invalidPostRes.status).toBe(400);

    // 2. Assignment API rejection
    const spRes = await app.request('/api/v1/org/service-providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ providerCode: 'DATE_SP', providerName: 'Date SP' }),
    }, env);
    const spId = (await spRes.json() as any).data.id;

    const invalidAssignRes = await app.request('/api/v1/org/outlets/ro-1001/service-providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ serviceProviderId: spId, serviceType: 'MANPOWER', effectiveFrom: '2026-05-01', effectiveTo: '2026-04-01' }),
    }, env);
    expect(invalidAssignRes.status).toBe(400);

    // 3. Direct SQL CHECK constraint verification
    await expect(execSql(`INSERT INTO org_officer_postings (id, officer_id, scope_level, effective_from, effective_to, is_primary, status, created_by, created_at, updated_at)
      VALUES ('p-invalid', '${offId}', 'GLOBAL', '2026-05-01', '2026-04-01', 0, 'ACTIVE', 'user-admin', '2026-01-01', '2026-01-01');`))
      .rejects.toThrow();
  });

  it('guards against assigning inactive service providers while allowing historical reads', async () => {
    // Create SP
    const spRes = await app.request('/api/v1/org/service-providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ providerCode: 'INACT_SP', providerName: 'Guard SP' }),
    }, env);
    const spId = (await spRes.json() as any).data.id;

    // Create active assignment
    const assignRes = await app.request('/api/v1/org/outlets/ro-1001/service-providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ serviceProviderId: spId, serviceType: 'SECURITY', effectiveFrom: '2026-01-01' }),
    }, env);
    expect(assignRes.status).toBe(201);
    const assignId = (await assignRes.json() as any).data.id;

    // Deactivate SP
    const deactRes = await app.request(`/api/v1/org/service-providers/${spId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ status: 'INACTIVE' }),
    }, env);
    expect(deactRes.status).toBe(200);

    // New assignment with inactive SP must fail with SERVICE_PROVIDER_INACTIVE
    const newAssignRes = await app.request('/api/v1/org/outlets/ro-1001/service-providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ serviceProviderId: spId, serviceType: 'SECURITY', effectiveFrom: '2026-06-01' }),
    }, env);
    expect(newAssignRes.status).toBe(409);
    const errJson = await newAssignRes.json() as any;
    expect(errJson.error?.code).toBe('SERVICE_PROVIDER_INACTIVE');

    // Historical assignments remain readable
    const listRes = await app.request('/api/v1/org/outlets/ro-1001/service-providers', {
      method: 'GET',
      headers: { 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
    }, env);
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json() as any;
    const found = listJson.data.find((a: any) => a.id === assignId);
    expect(found).toBeDefined();

    // Updating existing assignment does NOT fail or reactivate provider
    const updateAssignRes = await app.request(`/api/v1/org/outlet-service-provider-assignments/${assignId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ notes: 'Updated historical contract' }),
    }, env);
    expect(updateAssignRes.status).toBe(200);

    const checkSp = await app.request(`/api/v1/org/service-providers`, {
      method: 'GET',
      headers: { 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
    }, env);
    const spList = (await checkSp.json() as any).data;
    const provider = spList.find((p: any) => p.id === spId);
    expect(provider.status).toBe('INACTIVE');
  });

  it('validates database-backed hierarchy when creating officer postings', async () => {
    const deptRes = await app.request('/api/v1/org/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ code: 'HIER_DEP', name: 'Hierarchy Dept' }),
    }, env);
    const deptId = (await deptRes.json() as any).data.id;

    const offRes = await app.request('/api/v1/org/officers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ employeeCode: 'HIER_EMP', fullName: 'Hierarchy Officer', designationTitle: 'Officer', departmentId: deptId }),
    }, env);
    const offId = (await offRes.json() as any).data.id;

    // 1. Division does not belong to specified State (div-ldh belongs to state-pb, not state-wb)
    const mismatchDivRes = await app.request(`/api/v1/org/officers/${offId}/postings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ scopeLevel: 'DIVISION', stateId: 'state-wb', divisionId: 'div-ldh', effectiveFrom: '2026-01-01' }),
    }, env);
    expect(mismatchDivRes.status).toBe(400);
    expect((await mismatchDivRes.json() as any).error?.code).toBe('INVALID_ORG_HIERARCHY');

    // 2. Sales Area does not belong to specified Division (sa-cen belongs to div-kol, not div-ldh)
    const mismatchSaRes = await app.request(`/api/v1/org/officers/${offId}/postings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ scopeLevel: 'SALES_AREA', stateId: 'state-pb', divisionId: 'div-ldh', salesAreaId: 'sa-cen', effectiveFrom: '2026-01-01' }),
    }, env);
    expect(mismatchSaRes.status).toBe(400);
    expect((await mismatchSaRes.json() as any).error?.code).toBe('INVALID_ORG_HIERARCHY');

    // 3. Outlet hierarchy mismatch
    const mismatchRoRes = await app.request(`/api/v1/org/officers/${offId}/postings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ scopeLevel: 'OUTLET', stateId: 'state-pb', outletId: 'ro-1001', effectiveFrom: '2026-01-01' }),
    }, env);
    expect(mismatchRoRes.status).toBe(400);
    expect((await mismatchRoRes.json() as any).error?.code).toBe('INVALID_ORG_HIERARCHY');
  });

  it('enforces officer posting read scope boundaries without leaking unrelated records', async () => {
    const deptRes = await app.request('/api/v1/org/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ code: 'READ_DEP', name: 'Read Scope Dept' }),
    }, env);
    const deptId = (await deptRes.json() as any).data.id;

    const offRes = await app.request('/api/v1/org/officers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ employeeCode: 'READ_EMP', fullName: 'Read Officer', designationTitle: 'Officer', departmentId: deptId }),
    }, env);
    const offId = (await offRes.json() as any).data.id;

    // Post in WB (West Bengal)
    await app.request(`/api/v1/org/officers/${offId}/postings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ scopeLevel: 'STATE', stateId: 'state-wb', effectiveFrom: '2026-01-01' }),
    }, env);

    // Post in PB (Punjab)
    await app.request(`/api/v1/org/officers/${offId}/postings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ scopeLevel: 'STATE', stateId: 'state-pb', effectiveFrom: '2026-01-01' }),
    }, env);

    // Admin sees all 2 postings
    const adminListRes = await app.request(`/api/v1/org/officers/${offId}/postings`, {
      method: 'GET',
      headers: { 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
    }, env);
    expect((await adminListRes.json() as any).data.length).toBe(2);

    // State Office user (WBSO) only sees the posting for state-wb
    const soListRes = await app.request(`/api/v1/org/officers/${offId}/postings`, {
      method: 'GET',
      headers: { 'Cookie': soCookie, 'Origin': 'http://localhost:3000' },
    }, env);
    expect(soListRes.status).toBe(200);
    const soPostings = (await soListRes.json() as any).data;
    expect(soPostings.length).toBe(1);
    expect(soPostings[0].stateId).toBe('state-wb');
  });

  it('records correct actor, cf-connecting-ip, and user-agent in audit logs', async () => {
    const testIp = '203.0.113.195';
    const testUa = 'IOCL-Test-Agent/2.0';

    const createRes = await app.request('/api/v1/org/departments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminCookie,
        'Origin': 'http://localhost:3000',
        'cf-connecting-ip': testIp,
        'user-agent': testUa,
      },
      body: JSON.stringify({ code: 'AUDIT_DEP', name: 'Audit Test Dept' }),
    }, env);
    expect(createRes.status).toBe(201);
    const deptId = (await createRes.json() as any).data.id;

    const db = getDb(localD1);
    const logs = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entityId, deptId));
    expect(logs.length).toBeGreaterThan(0);
    const log = logs[0];
    expect(log.userId).toBe('user-admin');
    expect(log.ipAddress).toBe(testIp);
    expect(log.userAgent).toBe(testUa);
  });

  it('safely catches unknown internal errors without leaking raw SQL', async () => {
    // Calling route with malformed database state or triggering an unexpected error
    const brokenEnv = {
      ...env,
      DB: {
        prepare: () => { throw new Error('Unchecked raw SQLite syntax error: near "WHERE": syntax error'); },
      },
    };

    const res = await app.request('/api/v1/org/departments', {
      method: 'GET',
      headers: { 'Cookie': adminCookie, 'Origin': 'http://localhost:3000' },
    }, brokenEnv);

    expect(res.status).toBe(500);
    const json = await res.json() as any;
    expect(json.error?.code).toBe('INTERNAL_SERVER_ERROR');
    expect(json.error?.message).not.toContain('syntax error');
    expect(json.error?.message).not.toContain('SQLite');
  });
});
