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

  it('should reject PUT update with explicit null skillCategory (400 VALIDATION_ERROR)', async () => {
    const cookie = await loginAs('admin@iocl.in');

    const createRes = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/designations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ code: 'UPDATE_ROLE', name: 'Update Role', skillCategory: 'SKILLED' }),
    }, env);
    expect(createRes.status).toBe(201);
    const desig = (await createRes.json() as any).data;

    // Reject explicit null
    const putNullRes = await app.request(`/api/v1/hr/designations/${desig.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ skillCategory: null }),
    }, env);
    expect(putNullRes.status).toBe(400);
    const json = await putNullRes.json() as any;
    expect(json.error.code).toBe('VALIDATION_ERROR');

    // Allow valid skillCategory update
    const putValidRes = await app.request(`/api/v1/hr/designations/${desig.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
      body: JSON.stringify({ skillCategory: 'HIGHLY_SKILLED' }),
    }, env);
    expect(putValidRes.status).toBe(200);
    const validJson = await putValidRes.json() as any;
    expect(validJson.data.skillCategory).toBe('HIGHLY_SKILLED');
  });

  // =========================================================================
  // 7. Migration 0025 Direct SQLite CHECK Constraint Tests
  // =========================================================================
  describe('7. Migration 0025 Direct SQLite CHECK Constraint Tests', () => {
    it('should accept valid skill_category values and NULL via direct SQL insert', async () => {
      const now = new Date().toISOString();

      const validValues = [null, 'HIGHLY_SKILLED', 'SKILLED', 'SEMI_SKILLED', 'UNSKILLED'];
      for (let i = 0; i < validValues.length; i++) {
        const val = validValues[i];
        const id = `desig-check-valid-${i}-${Date.now()}`;
        const code = `CHK_V_${i}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        await expect(
          localD1.prepare(`
            INSERT INTO hr_designations (id, outlet_id, code, name, skill_category, status, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'ACTIVE', 'user-admin', ?, ?)
          `).bind(id, OUTLET_ID, code, `Valid Role ${i}`, val, now, now).run()
        ).resolves.toBeDefined();

        const row = await localD1.prepare('SELECT skill_category FROM hr_designations WHERE id = ?').bind(id).first();
        expect(row.skill_category).toBe(val);
      }
    });

    it('should reject invalid skill_category values via direct SQLite CHECK constraint', async () => {
      const now = new Date().toISOString();
      const invalidValues = ['EXPERT', 'HELPER', 'HIGH', ''];

      for (let i = 0; i < invalidValues.length; i++) {
        const invalidVal = invalidValues[i];
        const id = `desig-check-invalid-${i}-${Date.now()}`;
        const code = `CHK_INV_${i}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        await expect(
          localD1.prepare(`
            INSERT INTO hr_designations (id, outlet_id, code, name, skill_category, status, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'ACTIVE', 'user-admin', ?, ?)
          `).bind(id, OUTLET_ID, code, `Invalid Role ${i}`, invalidVal, now, now).run()
        ).rejects.toThrow(/CHECK constraint failed/i);
      }
    });
  });

  // =========================================================================
  // 8. Designation Skill Filter API Test
  // =========================================================================
  describe('8. Designation Skill Filter API', () => {
    it('should filter designations by skillCategory and combined skillCategory + status', async () => {
      const cookie = await loginAs('admin@iocl.in');

      // Create multiple designations with different skill categories
      await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/designations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ code: 'FLT_SK_1', name: 'Skilled One', skillCategory: 'SKILLED', status: 'ACTIVE' }),
      }, env);

      await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/designations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ code: 'FLT_SK_2', name: 'Skilled Inactive', skillCategory: 'SKILLED', status: 'INACTIVE' }),
      }, env);

      await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/designations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ code: 'FLT_SS_1', name: 'Semi-Skilled One', skillCategory: 'SEMI_SKILLED', status: 'ACTIVE' }),
      }, env);

      await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/designations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ code: 'FLT_HS_1', name: 'Highly Skilled One', skillCategory: 'HIGHLY_SKILLED', status: 'ACTIVE' }),
      }, env);

      // GET /api/v1/outlets/:outletId/hr/designations?skillCategory=SKILLED
      const resSkilled = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/designations?skillCategory=SKILLED`, {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }, env);
      expect(resSkilled.status).toBe(200);
      const jsonSkilled = await resSkilled.json() as any;
      expect(jsonSkilled.success).toBe(true);
      expect(jsonSkilled.data.length).toBeGreaterThanOrEqual(2);
      expect(jsonSkilled.data.every((d: any) => d.skillCategory === 'SKILLED')).toBe(true);

      // GET combined: skillCategory=SKILLED + status=ACTIVE
      const resCombined = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/designations?skillCategory=SKILLED&status=ACTIVE`, {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }, env);
      expect(resCombined.status).toBe(200);
      const jsonCombined = await resCombined.json() as any;
      expect(jsonCombined.success).toBe(true);
      expect(jsonCombined.data.every((d: any) => d.skillCategory === 'SKILLED' && d.status === 'ACTIVE')).toBe(true);
      expect(jsonCombined.data.some((d: any) => d.code === 'FLT_SK_1')).toBe(true);
      expect(jsonCombined.data.some((d: any) => d.code === 'FLT_SK_2')).toBe(false);
    });
  });

  // =========================================================================
  // 9. Staff Skill Filter API Test
  // =========================================================================
  describe('9. Staff Skill Filter API', () => {
    it('should filter staff by dynamically joined designation skillCategory and employmentStatus', async () => {
      const cookie = await loginAs('admin@iocl.in');

      // Create Designation A (SKILLED) and Designation B (SEMI_SKILLED)
      const resA = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/designations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ code: 'DESIG_SK_A', name: 'Desig A Skilled', skillCategory: 'SKILLED' }),
      }, env);
      const desigA = (await resA.json() as any).data;

      const resB = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/designations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ code: 'DESIG_SS_B', name: 'Desig B Semi-Skilled', skillCategory: 'SEMI_SKILLED' }),
      }, env);
      const desigB = (await resB.json() as any).data;

      // Create staff under Designation A (SKILLED, ACTIVE)
      await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP_SK_101',
          fullName: 'Staff Skilled',
          designationId: desigA.id,
          aadhaarLast4: '5555',
          emergencyContactName: 'EC SK',
          emergencyContactPhone: '+91 9876543211',
          joiningDate: '2026-01-10',
          employmentStatus: 'ACTIVE',
        }),
      }, env);

      // Create staff under Designation B (SEMI_SKILLED, ACTIVE)
      await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP_SS_201',
          fullName: 'Staff Semi-Skilled Active',
          designationId: desigB.id,
          aadhaarLast4: '6666',
          emergencyContactName: 'EC SS',
          emergencyContactPhone: '+91 9876543212',
          joiningDate: '2026-02-15',
          employmentStatus: 'ACTIVE',
        }),
      }, env);

      // Create staff under Designation B (SEMI_SKILLED, INACTIVE)
      await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP_SS_202',
          fullName: 'Staff Semi-Skilled Inactive',
          designationId: desigB.id,
          aadhaarLast4: '7777',
          emergencyContactName: 'EC SS2',
          emergencyContactPhone: '+91 9876543213',
          joiningDate: '2026-03-01',
          employmentStatus: 'INACTIVE',
        }),
      }, env);

      // GET /api/v1/outlets/:outletId/hr/staff?skillCategory=SEMI_SKILLED
      const resFltSS = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/staff?skillCategory=SEMI_SKILLED`, {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }, env);
      expect(resFltSS.status).toBe(200);
      const jsonFltSS = await resFltSS.json() as any;
      expect(jsonFltSS.success).toBe(true);
      expect(jsonFltSS.data.length).toBe(2);
      expect(jsonFltSS.data.every((s: any) => s.designationSkillCategory === 'SEMI_SKILLED')).toBe(true);
      expect(jsonFltSS.data.some((s: any) => s.employeeCode === 'EMP_SK_101')).toBe(false);

      // GET combined: skillCategory=SEMI_SKILLED & employmentStatus=ACTIVE
      const resFltCombined = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/staff?skillCategory=SEMI_SKILLED&employmentStatus=ACTIVE`, {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }, env);
      expect(resFltCombined.status).toBe(200);
      const jsonFltCombined = await resFltCombined.json() as any;
      expect(jsonFltCombined.success).toBe(true);
      expect(jsonFltCombined.data.length).toBe(1);
      expect(jsonFltCombined.data[0].employeeCode).toBe('EMP_SS_201');
      expect(jsonFltCombined.data[0].employmentStatus).toBe('ACTIVE');
    });
  });

  // =========================================================================
  // 10. Staff Dynamic Inheritance Test
  // =========================================================================
  describe('10. Staff Dynamic Skill Inheritance', () => {
    it('should reflect updated designation skillCategory dynamically on staff profiles without storing skill in hr_staff', async () => {
      const cookie = await loginAs('admin@iocl.in');

      // 1. Create designation with SKILLED
      const dRes = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/designations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ code: 'DYN_DESIG', name: 'Dynamic Role', skillCategory: 'SKILLED' }),
      }, env);
      const desig = (await dRes.json() as any).data;

      // 2. Create staff assigned to it
      const sRes = await app.request(`/api/v1/outlets/${OUTLET_ID}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP_DYN_01',
          fullName: 'Dynamic Staff',
          designationId: desig.id,
          aadhaarLast4: '8888',
          emergencyContactName: 'EC Dyn',
          emergencyContactPhone: '+91 9876543214',
          joiningDate: '2026-01-01',
          employmentStatus: 'ACTIVE',
        }),
      }, env);
      const staff = (await sRes.json() as any).data;

      // 3. GET staff and expect SKILLED
      const getStaff1 = await app.request(`/api/v1/hr/staff/${staff.id}`, {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }, env);
      expect(getStaff1.status).toBe(200);
      const jsonStaff1 = await getStaff1.json() as any;
      expect(jsonStaff1.data.designationSkillCategory).toBe('SKILLED');

      // 4. Update designation to HIGHLY_SKILLED
      const updateDRes = await app.request(`/api/v1/hr/designations/${desig.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ skillCategory: 'HIGHLY_SKILLED' }),
      }, env);
      expect(updateDRes.status).toBe(200);

      // 5. GET same staff again and expect HIGHLY_SKILLED
      const getStaff2 = await app.request(`/api/v1/hr/staff/${staff.id}`, {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }, env);
      expect(getStaff2.status).toBe(200);
      const jsonStaff2 = await getStaff2.json() as any;
      expect(jsonStaff2.data.designationSkillCategory).toBe('HIGHLY_SKILLED');

      // Verify that hr_staff table row itself has no skill_category column
      const staffRow = localD1.prepare('SELECT * FROM hr_staff WHERE id = ?').bind(staff.id).first();
      expect(staffRow.skill_category).toBeUndefined();
      expect(staffRow.designationSkillCategory).toBeUndefined();
    });
  });

  // =========================================================================
  // 11. Legacy NULL Update Compatibility Test
  // =========================================================================
  describe('11. Legacy NULL Update Compatibility', () => {
    it('should allow PUT on legacy NULL designation with unrelated fields and preserve skillCategory === null', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const db = getDb(localD1);
      const legacyId = `desig-compat-${Date.now()}`;
      const now = new Date().toISOString();

      // Directly insert legacy designation with skillCategory = null
      await db.insert(hrDesignations).values({
        id: legacyId,
        outletId: OUTLET_ID,
        code: 'COMPAT_LEGACY',
        name: 'Original Legacy Role',
        skillCategory: null,
        status: 'ACTIVE',
        createdBy: 'user-admin',
        createdAt: now,
        updatedAt: now,
      }).run();

      // PUT with only unrelated field 'name', omitting skillCategory completely
      const putRes = await app.request(`/api/v1/hr/designations/${legacyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ name: 'Updated Legacy Role' }),
      }, env);

      expect(putRes.status).toBe(200);
      const json = await putRes.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.name).toBe('Updated Legacy Role');
      expect(json.data.skillCategory).toBeNull();

      // Verify database record still has NULL skill_category
      const dbRow = await localD1.prepare('SELECT skill_category FROM hr_designations WHERE id = ?').bind(legacyId).first();
      expect(dbRow.skill_category).toBeNull();
    });
  });

  // =========================================================================
  // 12. Comprehensive Skill Summary Reconciliation Test
  // =========================================================================
  describe('12. Comprehensive Skill Summary Reconciliation', () => {
    it('should reconcile designation-level shortages/excesses into exact category sums and totals', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const targetOutlet = 'ro-1003'; // Clean seeded outlet for reconciliation

      // Setup designations and sanctions:
      // Highly Skilled: Sanc 2, Act 1, Shortage 1, Excess 0
      const dHS = (await (await app.request(`/api/v1/outlets/${targetOutlet}/hr/designations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ code: 'REC_HS', name: 'Rec Highly Skilled', skillCategory: 'HIGHLY_SKILLED' }),
      }, env)).json() as any).data;

      // Skilled: Sanc 4, Act 5, Shortage 0, Excess 1
      const dSK = (await (await app.request(`/api/v1/outlets/${targetOutlet}/hr/designations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ code: 'REC_SK', name: 'Rec Skilled', skillCategory: 'SKILLED' }),
      }, env)).json() as any).data;

      // Semi-Skilled: Sanc 6, Act 6, Shortage 0, Excess 0
      const dSS = (await (await app.request(`/api/v1/outlets/${targetOutlet}/hr/designations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ code: 'REC_SS', name: 'Rec Semi-Skilled', skillCategory: 'SEMI_SKILLED' }),
      }, env)).json() as any).data;

      // Unskilled: Sanc 3, Act 2, Shortage 1, Excess 0
      const dUS = (await (await app.request(`/api/v1/outlets/${targetOutlet}/hr/designations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ code: 'REC_US', name: 'Rec Unskilled', skillCategory: 'UNSKILLED' }),
      }, env)).json() as any).data;

      // Add sanctions
      await app.request(`/api/v1/outlets/${targetOutlet}/hr/manpower-sanctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ designationId: dHS.id, sanctionedCount: 2, effectiveFrom: '2026-01-01' }),
      }, env);

      await app.request(`/api/v1/outlets/${targetOutlet}/hr/manpower-sanctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ designationId: dSK.id, sanctionedCount: 4, effectiveFrom: '2026-01-01' }),
      }, env);

      await app.request(`/api/v1/outlets/${targetOutlet}/hr/manpower-sanctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ designationId: dSS.id, sanctionedCount: 6, effectiveFrom: '2026-01-01' }),
      }, env);

      await app.request(`/api/v1/outlets/${targetOutlet}/hr/manpower-sanctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ designationId: dUS.id, sanctionedCount: 3, effectiveFrom: '2026-01-01' }),
      }, env);

      // Create staff:
      // HS: 1 staff
      await app.request(`/api/v1/outlets/${targetOutlet}/hr/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'REC_HS_1', fullName: 'Staff HS 1', designationId: dHS.id, aadhaarLast4: '1001',
          emergencyContactName: 'EC', emergencyContactPhone: '+91 9876543210', joiningDate: '2026-01-01', employmentStatus: 'ACTIVE',
        }),
      }, env);

      // SK: 5 staff
      for (let i = 1; i <= 5; i++) {
        await app.request(`/api/v1/outlets/${targetOutlet}/hr/staff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
          body: JSON.stringify({
            employeeCode: `REC_SK_${i}`, fullName: `Staff SK ${i}`, designationId: dSK.id, aadhaarLast4: `200${i}`,
            emergencyContactName: 'EC', emergencyContactPhone: '+91 9876543210', joiningDate: '2026-01-01', employmentStatus: 'ACTIVE',
          }),
        }, env);
      }

      // SS: 6 staff
      for (let i = 1; i <= 6; i++) {
        await app.request(`/api/v1/outlets/${targetOutlet}/hr/staff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
          body: JSON.stringify({
            employeeCode: `REC_SS_${i}`, fullName: `Staff SS ${i}`, designationId: dSS.id, aadhaarLast4: `300${i}`,
            emergencyContactName: 'EC', emergencyContactPhone: '+91 9876543210', joiningDate: '2026-01-01', employmentStatus: 'ACTIVE',
          }),
        }, env);
      }

      // US: 2 staff
      for (let i = 1; i <= 2; i++) {
        await app.request(`/api/v1/outlets/${targetOutlet}/hr/staff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
          body: JSON.stringify({
            employeeCode: `REC_US_${i}`, fullName: `Staff US ${i}`, designationId: dUS.id, aadhaarLast4: `400${i}`,
            emergencyContactName: 'EC', emergencyContactPhone: '+91 9876543210', joiningDate: '2026-01-01', employmentStatus: 'ACTIVE',
          }),
        }, env);
      }

      // Request summary
      const sumRes = await app.request(`/api/v1/outlets/${targetOutlet}/hr/manpower-summary`, {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }, env);

      expect(sumRes.status).toBe(200);
      const summary = (await sumRes.json() as any).data;

      // Verification of totals
      expect(summary.totalSanctionedCount).toBe(15); // 2 + 4 + 6 + 3
      expect(summary.totalActualCount).toBe(14);     // 1 + 5 + 6 + 2
      expect(summary.totalShortageCount).toBe(2);   // HS: 1 shortage, US: 1 shortage
      expect(summary.totalExcessCount).toBe(1);     // SK: 1 excess

      // Verification of bySkillCategory items
      const hsCat = summary.bySkillCategory.find((c: any) => c.skillCategory === 'HIGHLY_SKILLED');
      expect(hsCat).toBeDefined();
      expect(hsCat.sanctionedCount).toBe(2);
      expect(hsCat.actualCount).toBe(1);
      expect(hsCat.shortageCount).toBe(1);
      expect(hsCat.excessCount).toBe(0);

      const skCat = summary.bySkillCategory.find((c: any) => c.skillCategory === 'SKILLED');
      expect(skCat).toBeDefined();
      expect(skCat.sanctionedCount).toBe(4);
      expect(skCat.actualCount).toBe(5);
      expect(skCat.shortageCount).toBe(0);
      expect(skCat.excessCount).toBe(1);

      const ssCat = summary.bySkillCategory.find((c: any) => c.skillCategory === 'SEMI_SKILLED');
      expect(ssCat).toBeDefined();
      expect(ssCat.sanctionedCount).toBe(6);
      expect(ssCat.actualCount).toBe(6);
      expect(ssCat.shortageCount).toBe(0);
      expect(ssCat.excessCount).toBe(0);

      const usCat = summary.bySkillCategory.find((c: any) => c.skillCategory === 'UNSKILLED');
      expect(usCat).toBeDefined();
      expect(usCat.sanctionedCount).toBe(3);
      expect(usCat.actualCount).toBe(2);
      expect(usCat.shortageCount).toBe(1);
      expect(usCat.excessCount).toBe(0);

      // Verify mathematical reconciliation across all skill categories
      const sumSanctioned = summary.bySkillCategory.reduce((acc: number, c: any) => acc + c.sanctionedCount, 0);
      const sumActual = summary.bySkillCategory.reduce((acc: number, c: any) => acc + c.actualCount, 0);
      const sumShortage = summary.bySkillCategory.reduce((acc: number, c: any) => acc + c.shortageCount, 0);
      const sumExcess = summary.bySkillCategory.reduce((acc: number, c: any) => acc + c.excessCount, 0);

      expect(sumSanctioned).toBe(summary.totalSanctionedCount);
      expect(sumActual).toBe(summary.totalActualCount);
      expect(sumShortage).toBe(summary.totalShortageCount);
      expect(sumExcess).toBe(summary.totalExcessCount);
    });
  });
});
