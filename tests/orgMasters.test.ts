import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
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
  });

  afterEach(() => {
    try { localD1.close(); } catch (e) {}
    if (testDbPath && fs.existsSync(testDbPath)) { try { fs.unlinkSync(testDbPath); } catch (e) {} }
  });

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
    const res = await app.request('/api/v1/org/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': soCookie, 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ code: 'SO-TEST', name: 'SO Test Dept' }),
    }, env);
    // Should be forbidden because State Office has read-only permission for org masters
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
});
