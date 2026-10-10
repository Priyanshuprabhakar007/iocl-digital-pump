import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import fs from 'fs';

describe('Phase 4: HR Skill Categories & Workforce Strength Suite', () => {
  let localD1: any;
  let env: any;
  let testDbPath: string;

  const OUTLET_ID = 'ro-1001';

  beforeEach(async () => {
    testDbPath = `./.sqlite/test_hr_skill_${Math.random().toString(36).substring(2)}_${Date.now()}.db`;
    if (fs.existsSync(testDbPath)) { try { fs.unlinkSync(testDbPath); } catch (e) {} }
    const walPath = `${testDbPath}-wal`;
    const shmPath = `${testDbPath}-shm`;
    if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch (e) {} }
    if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch (e) {} }

    localD1 = createLocalD1Database(testDbPath);
    await seedDatabase(getDb(localD1));

    env = {
      DB: localD1,
      DOCUMENTS_BUCKET: { get: async () => null, put: async () => ({}) },
      ENVIRONMENT: 'test',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    };
  });

  afterEach(() => {
    try { localD1.close(); } catch (e) {}
    if (testDbPath && fs.existsSync(testDbPath)) { try { fs.unlinkSync(testDbPath); } catch (e) {} }
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

  it('should support creating designations with and without skill category', async () => {
    const cookie = await loginAs('admin@iocl.in');

    const res1 = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/designations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ code: 'UNCLASSIFIED_ROLE', name: 'Unclassified Role' }),
    }, env);
    expect(res1.status).toBe(201);
    const json1 = await res1.json() as any;
    expect(json1.data.skillCategory).toBeNull();

    const res2 = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/designations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ code: 'SKILLED_ROLE', name: 'Skilled Technician', skillCategory: 'SKILLED' }),
    }, env);
    expect(res2.status).toBe(201);
    const json2 = await res2.json() as any;
    expect(json2.data.skillCategory).toBe('SKILLED');

    const res3 = await app.request(`/api/v1/hr/designations/${json2.data.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ skillCategory: 'HIGHLY_SKILLED' }),
    }, env);
    expect(res3.status).toBe(200);
    const json3 = await res3.json() as any;
    expect(json3.data.skillCategory).toBe('HIGHLY_SKILLED');
  });

  it('should reject invalid skill categories', async () => {
    const cookie = await loginAs('admin@iocl.in');

    const res = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/designations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ code: 'BAD_ROLE', name: 'Bad Role', skillCategory: 'SUPER_DUPER_SKILLED' }),
    }, env);
    expect(res.status).toBe(400);
  });

  it('should compute manpower summary aggregated by skill category including NULL bucket via API', async () => {
    const cookie = await loginAs('admin@iocl.in');

    // Create 3 designations via API
    const d1Res = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/designations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ code: 'HS_ROLE', name: 'Highly Skilled', skillCategory: 'HIGHLY_SKILLED' }),
    }, env);
    const d1 = (await d1Res.json() as any).data;

    const d2Res = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/designations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ code: 'NC_ROLE', name: 'Not Classified' }),
    }, env);
    const d2 = (await d2Res.json() as any).data;

    // Create manpower sanctions
    await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/manpower-sanctions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ designationId: d1.id, sanctionedCount: 2, effectiveFrom: '2026-01-01' }),
    }, env);

    await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/manpower-sanctions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ designationId: d2.id, sanctionedCount: 1, effectiveFrom: '2026-01-01' }),
    }, env);

    // Create staff
    await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({
        employeeCode: 'EMP1',
        fullName: 'Staff One',
        designationId: d1.id,
        aadhaarLast4: '1234',
        emergencyContactName: 'EC1',
        emergencyContactPhone: '+91 9876543210',
        joiningDate: '2026-01-01',
        employmentStatus: 'ACTIVE',
      }),
    }, env);

    const sumRes = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/manpower-summary`, {
      method: 'GET',
      headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
    }, env);

    expect(sumRes.status).toBe(200);
    const sumJson = await sumRes.json() as any;
    const summary = sumJson.data;

    expect(summary.totalSanctionedCount).toBe(3);
    expect(summary.totalActualCount).toBe(1);
    expect(summary.bySkillCategory).toBeDefined();

    const hsBucket = summary.bySkillCategory.find((b: any) => b.skillCategory === 'HIGHLY_SKILLED');
    expect(hsBucket).toBeDefined();
    expect(hsBucket.sanctionedCount).toBe(2);
    expect(hsBucket.actualCount).toBe(1);
    expect(hsBucket.shortageCount).toBe(1);

    const nullBucket = summary.bySkillCategory.find((b: any) => b.skillCategory === null);
    expect(nullBucket).toBeDefined();
    expect(nullBucket.sanctionedCount).toBe(1);
    expect(nullBucket.actualCount).toBe(0);
    expect(nullBucket.shortageCount).toBe(1);
  });
});
