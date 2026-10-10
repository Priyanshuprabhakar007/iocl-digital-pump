import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import fs from 'fs';
import { hrDesignations } from '../src/db/schema';

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

  it('should reject POST designation without skillCategory (400 VALIDATION_ERROR)', async () => {
    const cookie = await loginAs('admin@iocl.in');

    const res = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/designations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ code: 'UNSKILLED_ROLE', name: 'Unskilled Role' }),
    }, env);
    expect(res.status).toBe(400);
    const json = await res.json() as any;
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('should successfully POST designation with HIGHLY_SKILLED, SKILLED, SEMI_SKILLED, UNSKILLED', async () => {
    const cookie = await loginAs('admin@iocl.in');
    const categories = ['HIGHLY_SKILLED', 'SKILLED', 'SEMI_SKILLED', 'UNSKILLED'] as const;

    for (const cat of categories) {
      const res = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/designations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ code: `ROLE_${cat}`, name: `Role ${cat}`, skillCategory: cat }),
      }, env);
      expect(res.status).toBe(201);
      const json = await res.json() as any;
      expect(json.data.skillCategory).toBe(cat);
    }
  });

  it('should reject invalid skill category value EXPERT with 400 VALIDATION_ERROR', async () => {
    const cookie = await loginAs('admin@iocl.in');

    const res = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/designations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ code: 'EXPERT_ROLE', name: 'Expert Role', skillCategory: 'EXPERT' }),
    }, env);
    expect(res.status).toBe(400);
    const json = await res.json() as any;
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('should compute manpower summary aggregated by skill category including legacy NULL bucket via API', async () => {
    const cookie = await loginAs('admin@iocl.in');

    // Create 1 designation with skillCategory via API
    const d1Res = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/designations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ code: 'HS_ROLE', name: 'Highly Skilled', skillCategory: 'HIGHLY_SKILLED' }),
    }, env);
    const d1 = (await d1Res.json() as any).data;

    // Insert legacy designation with NULL skill_category directly into DB
    const db = getDb(localD1);
    const legacyDesigId = `desig-legacy-${Math.random()}`;
    const now = new Date().toISOString();
    await db.insert(hrDesignations).values({
      id: legacyDesigId,
      outletId: OUTLET_ID,
      code: 'LEGACY_ROLE',
      name: 'Legacy Unclassified',
      skillCategory: null,
      status: 'ACTIVE',
      createdBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    }).run();

    // Create manpower sanctions
    await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/manpower-sanctions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ designationId: d1.id, sanctionedCount: 2, effectiveFrom: '2026-01-01' }),
    }, env);

    await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/manpower-sanctions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ designationId: legacyDesigId, sanctionedCount: 1, effectiveFrom: '2026-01-01' }),
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
