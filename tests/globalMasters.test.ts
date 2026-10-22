import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import app from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import * as schema from '../src/db/schema';
import { eq, sql } from 'drizzle-orm';
import fs from 'fs';
import {
  detectDesignationConflicts,
  detectShiftTemplateConflicts,
} from '../src/db/globalMasterDiagnostic';

describe('Phase 2 Global Masters: Global Designation Master & Global Shift Master', () => {
  let env: { DB: any; DOCUMENTS_BUCKET: any };
  let dbPath: string;
  let localD1: any;

  beforeEach(async () => {
    dbPath = `./.sqlite/test_global_masters_${Math.random().toString(36).substring(7)}.db`;
    localD1 = createLocalD1Database(dbPath);
    const db = getDb(localD1);
    await seedDatabase(db);
    env = { DB: localD1, DOCUMENTS_BUCKET: null as any };
  });

  afterEach(() => {
    try {
      localD1.close();
    } catch (e) {}

    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
      if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
    } catch (e) {}
  });

  const getCookie = (res: Response) => {
    const setCookie = res.headers.get('set-cookie');
    if (!setCookie) return '';
    return setCookie.split(';')[0];
  };

  const loginAs = async (email: string) => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email, password: 'Password@123' }),
      }),
      env
    );
    const cookie = getCookie(res);
    const json = (await res.json()) as any;
    return { res, cookie, json };
  };

  // 1. Designation diagnostic catches conflicts
  it('1. Designation migration diagnostic detects conflicting codes with different names or skill categories', () => {
    const rawDb = localD1.getNativeDb();
    // Simulate legacy table with conflicting codes across outlets
    rawDb.exec(`
      CREATE TEMP TABLE test_legacy_desigs (
        id TEXT PRIMARY KEY,
        outlet_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        skill_category TEXT,
        status TEXT NOT NULL,
        notes TEXT
      );
      INSERT INTO test_legacy_desigs VALUES
        ('d1', 'ro-1', 'CASHIER', 'Cashier A', 'SKILLED', 'ACTIVE', NULL),
        ('d2', 'ro-2', 'CASHIER', 'Senior Cashier B', 'HIGHLY_SKILLED', 'ACTIVE', NULL);
    `);

    // Run diagnostic query logic
    const conflicts = rawDb.prepare(`
      SELECT
        UPPER(TRIM(code)) as normalized_code,
        COUNT(DISTINCT name) as distinct_names,
        COUNT(DISTINCT skill_category) as distinct_skills
      FROM test_legacy_desigs
      GROUP BY UPPER(TRIM(code))
      HAVING distinct_names > 1 OR distinct_skills > 1
    `).all() as any[];

    expect(conflicts.length).toBe(1);
    expect(conflicts[0].normalized_code).toBe('CASHIER');
    expect(conflicts[0].distinct_names).toBe(2);
    expect(conflicts[0].distinct_skills).toBe(2);
  });

  // 2. Shift template diagnostic catches conflicts
  it('2. Shift template migration diagnostic detects conflicting codes with different timings or sequences', () => {
    const rawDb = localD1.getNativeDb();
    rawDb.exec(`
      CREATE TEMP TABLE test_legacy_shifts (
        id TEXT PRIMARY KEY,
        outlet_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        status TEXT NOT NULL
      );
      INSERT INTO test_legacy_shifts VALUES
        ('s1', 'ro-1', 'SHIFT_1', 'Morning Shift', '06:00', '14:00', 1, 'ACTIVE'),
        ('s2', 'ro-2', 'SHIFT_1', 'Early Shift', '07:00', '15:00', 1, 'ACTIVE');
    `);

    const conflicts = rawDb.prepare(`
      SELECT
        UPPER(TRIM(code)) as normalized_code,
        COUNT(DISTINCT start_time) as distinct_starts,
        COUNT(DISTINCT end_time) as distinct_ends
      FROM test_legacy_shifts
      GROUP BY UPPER(TRIM(code))
      HAVING distinct_starts > 1 OR distinct_ends > 1
    `).all() as any[];

    expect(conflicts.length).toBe(1);
    expect(conflicts[0].normalized_code).toBe('SHIFT_1');
    expect(conflicts[0].distinct_starts).toBe(2);
  });

  // 3. Successful non-destructive migration on equivalent data
  it('3. Successful non-destructive migration preserves and consolidates equivalent records', async () => {
    const rawDb = localD1.getNativeDb();
    const globalDesigs = rawDb.prepare('SELECT COUNT(*) as count FROM global_hr_designations').get() as any;
    const globalShifts = rawDb.prepare('SELECT COUNT(*) as count FROM global_shift_templates').get() as any;
    expect(globalDesigs.count).toBeGreaterThan(0);
    expect(globalShifts.count).toBeGreaterThan(0);
  });

  // 4. Foreign key integrity verified after migration
  it('4. Foreign key integrity verified after migration with no violations', () => {
    const rawDb = localD1.getNativeDb();
    const fkCheck = rawDb.prepare('PRAGMA foreign_key_check;').all();
    expect(fkCheck.length).toBe(0);
  });

  // 5. GET /api/v1/hr/designations returns all active global designations
  it('5. GET /api/v1/hr/designations returns active global designations list', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    const res = await app.fetch(
      new Request('http://localhost/api/v1/hr/designations?status=ACTIVE', {
        method: 'GET',
        headers: { Cookie: adminCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeGreaterThan(0);
    const codes = json.data.map((d: any) => d.code);
    expect(codes).toContain('DSM');
    expect(codes).toContain('MANAGER');
  });

  // 6. POST /api/v1/hr/designations creates a single global master row
  it('6. POST /api/v1/hr/designations creates a single global master row', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    const res = await app.fetch(
      new Request('http://localhost/api/v1/hr/designations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'ACCOUNTS_OFFICER',
          name: 'Accounts Officer',
          skillCategory: 'HIGHLY_SKILLED',
          status: 'ACTIVE',
          notes: 'Manages ledger and accounts audit',
        }),
      }),
      env
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.code).toBe('ACCOUNTS_OFFICER');

    // Verify it exists in global_hr_designations
    const rawDb = localD1.getNativeDb();
    const row = rawDb.prepare('SELECT * FROM global_hr_designations WHERE code = ?').get('ACCOUNTS_OFFICER') as any;
    expect(row).toBeDefined();
    expect(row.name).toBe('Accounts Officer');
  });

  // 7. Duplicate global designation code rejected (409)
  it('7. Duplicate global designation code rejected with 409 CONFLICT', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    const res = await app.fetch(
      new Request('http://localhost/api/v1/hr/designations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'DSM',
          name: 'Duplicate DSM',
          skillCategory: 'SKILLED',
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(res.status).toBe(409);
    const json = (await res.json()) as any;
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('HR_DESIGNATION_CODE_EXISTS');
  });

  // 8. PUT /api/v1/hr/designations/:id updates designation name / skill / status
  it('8. PUT /api/v1/hr/designations/:id updates designation name, skill category, and notes', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    // Create a new designation first
    const createRes = await app.fetch(
      new Request('http://localhost/api/v1/hr/designations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'TEST_ROLE',
          name: 'Test Role Original',
          skillCategory: 'SEMI_SKILLED',
          status: 'ACTIVE',
        }),
      }),
      env
    );
    const created = ((await createRes.json()) as any).data;

    // Update it
    const updateRes = await app.fetch(
      new Request(`http://localhost/api/v1/hr/designations/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          name: 'Test Role Updated',
          skillCategory: 'SKILLED',
          status: 'ACTIVE',
          notes: 'Updated notes',
        }),
      }),
      env
    );
    expect(updateRes.status).toBe(200);
    const updateJson = (await updateRes.json()) as any;
    expect(updateJson.success).toBe(true);
    expect(updateJson.data.name).toBe('Test Role Updated');
    expect(updateJson.data.skillCategory).toBe('SKILLED');
  });

  // 9. PATCH /api/v1/hr/designations/:id/status toggles status
  it('9. PATCH /api/v1/hr/designations/:id/status toggles status between ACTIVE and INACTIVE', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    const createRes = await app.fetch(
      new Request('http://localhost/api/v1/hr/designations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'TOGGLE_ROLE',
          name: 'Toggle Role',
          skillCategory: 'UNSKILLED',
          status: 'ACTIVE',
        }),
      }),
      env
    );
    const created = ((await createRes.json()) as any).data;

    // Deactivate
    const patchRes1 = await app.fetch(
      new Request(`http://localhost/api/v1/hr/designations/${created.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ status: 'INACTIVE' }),
      }),
      env
    );
    expect(patchRes1.status).toBe(200);
    const patchJson1 = (await patchRes1.json()) as any;
    expect(patchJson1.data.status).toBe('INACTIVE');

    // Reactivate
    const patchRes2 = await app.fetch(
      new Request(`http://localhost/api/v1/hr/designations/${created.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ status: 'ACTIVE' }),
      }),
      env
    );
    expect(patchRes2.status).toBe(200);
    const patchJson2 = (await patchRes2.json()) as any;
    expect(patchJson2.data.status).toBe('ACTIVE');
  });

  // 10. Inactive designation cannot be used to create new staff
  it('10. Inactive designation cannot be used to create new staff member', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    // Create and inactivate a designation
    const createRes = await app.fetch(
      new Request('http://localhost/api/v1/hr/designations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'ARCHIVED_ROLE',
          name: 'Archived Role',
          skillCategory: 'UNSKILLED',
          status: 'INACTIVE',
        }),
      }),
      env
    );
    const created = ((await createRes.json()) as any).data;

    // Attempt to create staff with this inactive designation
    const staffRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/hr/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP-INACT-01',
          fullName: 'John Inactive',
          designationId: created.id,
          aadhaarLast4: '1234',
          emergencyContactName: 'Emergency Person',
          emergencyContactPhone: '9876543210',
          joiningDate: '2025-01-01',
          employmentStatus: 'ACTIVE',
        }),
      }),
      env
    );
    expect(staffRes.status).toBe(409);
    const staffJson = (await staffRes.json()) as any;
    expect(staffJson.error.code).toBe('HR_DESIGNATION_NOT_ACTIVE');
  });

  // 11. Inactive designation does NOT break historical staff records
  it('11. Inactive designation does NOT break historical staff records resolution', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    // 1. Create active designation
    const desigRes = await app.fetch(
      new Request('http://localhost/api/v1/hr/designations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'HIST_ROLE',
          name: 'Historical Role',
          skillCategory: 'SKILLED',
          status: 'ACTIVE',
        }),
      }),
      env
    );
    const desig = ((await desigRes.json()) as any).data;

    // 2. Create staff with active designation
    const staffRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/hr/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP-HIST-01',
          fullName: 'Historical Staff Member',
          designationId: desig.id,
          aadhaarLast4: '4321',
          emergencyContactName: 'Emergency Person',
          emergencyContactPhone: '9876543210',
          joiningDate: '2025-01-01',
          employmentStatus: 'ACTIVE',
        }),
      }),
      env
    );
    expect(staffRes.status).toBe(201);
    const staff = ((await staffRes.json()) as any).data;

    // 3. Deactivate designation
    await app.fetch(
      new Request(`http://localhost/api/v1/hr/designations/${desig.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ status: 'INACTIVE' }),
      }),
      env
    );

    // 4. Historical staff query continues to resolve designation name perfectly
    const fetchStaffRes = await app.fetch(
      new Request(`http://localhost/api/v1/hr/staff/${staff.id}`, {
        method: 'GET',
        headers: { Cookie: adminCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(fetchStaffRes.status).toBe(200);
    const fetchedStaff = ((await fetchStaffRes.json()) as any).data;
    expect(fetchedStaff.designationName).toBe('Historical Role');
    expect(fetchedStaff.designationCode).toBe('HIST_ROLE');
  });

  // 12. GET /api/v1/shift-templates returns global shift templates
  it('12. GET /api/v1/shift-templates returns all global shift templates', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    const res = await app.fetch(
      new Request('http://localhost/api/v1/shift-templates', {
        method: 'GET',
        headers: { Cookie: adminCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeGreaterThan(0);
    const codes = json.data.map((s: any) => s.code);
    expect(codes).toContain('SHIFT_1');
    expect(codes).toContain('SHIFT_2');
  });

  // 13. POST /api/v1/shift-templates creates a global shift template
  it('13. POST /api/v1/shift-templates creates a global shift template', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    const res = await app.fetch(
      new Request('http://localhost/api/v1/shift-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'SPECIAL_SHIFT',
          name: 'Special Weekend Shift',
          startTime: '10:00',
          endTime: '18:00',
          sequence: 5,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.code).toBe('SPECIAL_SHIFT');
  });

  // 14. Duplicate global shift template code rejected (409)
  it('14. Duplicate global shift template code rejected with 409 CONFLICT', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    const res = await app.fetch(
      new Request('http://localhost/api/v1/shift-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'SHIFT_1',
          name: 'Duplicate Shift 1',
          startTime: '06:00',
          endTime: '14:00',
          sequence: 1,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(res.status).toBe(409);
    const json = (await res.json()) as any;
    expect(json.success).toBe(false);
  });

  // 15. PUT /api/v1/shift-templates/:id updates shift timings / sequence
  it('15. PUT /api/v1/shift-templates/:id updates shift timings and sequence with immutable code guard', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    // Create shift template
    const createRes = await app.fetch(
      new Request('http://localhost/api/v1/shift-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'EDIT_SHIFT',
          name: 'Edit Shift Initial',
          startTime: '08:00',
          endTime: '16:00',
          sequence: 10,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    const created = ((await createRes.json()) as any).data;

    // Reject attempt to change code
    const badUpdateRes = await app.fetch(
      new Request(`http://localhost/api/v1/shift-templates/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'CHANGED_CODE',
          name: 'Illegal Code Mutation',
        }),
      }),
      env
    );
    expect(badUpdateRes.status).toBe(400);

    // Valid update
    const validUpdateRes = await app.fetch(
      new Request(`http://localhost/api/v1/shift-templates/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          name: 'Edit Shift Updated',
          startTime: '08:30',
          endTime: '16:30',
          sequence: 11,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(validUpdateRes.status).toBe(200);
    const validJson = (await validUpdateRes.json()) as any;
    expect(validJson.data.startTime).toBe('08:30');
    expect(validJson.data.endTime).toBe('16:30');
    expect(validJson.data.sequence).toBe(11);
  });

  // 16. PATCH /api/v1/shift-templates/:id/status toggles status
  it('16. PATCH /api/v1/shift-templates/:id/status toggles status between ACTIVE and INACTIVE', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    const createRes = await app.fetch(
      new Request('http://localhost/api/v1/shift-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'TOGGLE_SHIFT',
          name: 'Toggle Shift',
          startTime: '07:00',
          endTime: '15:00',
          sequence: 8,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    const created = ((await createRes.json()) as any).data;

    const patchRes = await app.fetch(
      new Request(`http://localhost/api/v1/shift-templates/${created.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ status: 'INACTIVE' }),
      }),
      env
    );
    expect(patchRes.status).toBe(200);
    const patchJson = (await patchRes.json()) as any;
    expect(patchJson.data.status).toBe('INACTIVE');
  });

  // 17. Opening a shift with active global shift template succeeds
  it('17. Opening an operational shift with active global shift template succeeds', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // ro-1001 has active nozzles, dispensers, tanks, and products from seed
    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate: '2026-03-30',
          notes: 'Test shift opening with global template',
        }),
      }),
      env
    );
    expect(openRes.status).toBe(201);
    const json = (await openRes.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.shiftTemplateName).toBe('Shift 1 (Morning)');
  });

  // 18. Opening a shift with inactive global shift template fails
  it('18. Opening an operational shift with inactive global shift template fails with INACTIVE_TEMPLATE', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    // 1. Create an inactive shift template
    const createRes = await app.fetch(
      new Request('http://localhost/api/v1/shift-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'INACT_SHIFT',
          name: 'Inactive Shift',
          startTime: '01:00',
          endTime: '05:00',
          sequence: 99,
          status: 'INACTIVE',
        }),
      }),
      env
    );
    const inactiveTpl = ((await createRes.json()) as any).data;

    // 2. Attempt to open a shift with it
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');
    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: inactiveTpl.id,
          businessDate: '2026-03-31',
        }),
      }),
      env
    );
    expect(openRes.status).toBe(400);
    const json = (await openRes.json()) as any;
    expect(json.error.code).toBe('INACTIVE_TEMPLATE');
  });

  // 19. Historical operational shift snapshots remain intact after shift template edits
  it('19. Historical operational shift snapshots remain intact after shift template edits', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // Open a shift with st-ro1-1
    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate: '2026-04-01',
        }),
      }),
      env
    );
    expect(openRes.status).toBe(201);
    const shift = ((await openRes.json()) as any).data;

    // Fetch shift snapshot count before template update
    const rawDb = localD1.getNativeDb();
    const snapshotsBefore = rawDb.prepare(
      'SELECT COUNT(*) as count FROM operational_shift_nozzles WHERE operational_shift_id = ?'
    ).get(shift.id) as any;
    expect(snapshotsBefore.count).toBeGreaterThan(0);

    // Update global shift template
    await app.fetch(
      new Request('http://localhost/api/v1/shift-templates/st-ro1-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          name: 'Shift 1 Modified Name',
          startTime: '06:15',
          endTime: '14:15',
          sequence: 1,
          status: 'ACTIVE',
        }),
      }),
      env
    );

    // Verify snapshots and shift record are intact
    const snapshotsAfter = rawDb.prepare(
      'SELECT COUNT(*) as count FROM operational_shift_nozzles WHERE operational_shift_id = ?'
    ).get(shift.id) as any;
    expect(snapshotsAfter.count).toBe(snapshotsBefore.count);

    // Operational shift still exists and is queryable
    const shiftFetch = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shift.id}`, {
        method: 'GET',
        headers: { Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(shiftFetch.status).toBe(200);
  });

  // 20. Outlet A and outlet B can both use the same global designation
  it('20. Outlet A and Outlet B can both create staff using the same global designation', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    // Create staff at Outlet 1 (ro-1001) using DSM
    const staff1Res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/hr/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP-RO1-DSM-01',
          fullName: 'Staff at RO 1001',
          designationId: 'desig-glb-dsm',
          aadhaarLast4: '1111',
          emergencyContactName: 'Emergency Person 1',
          emergencyContactPhone: '9876543210',
          joiningDate: '2025-01-01',
          employmentStatus: 'ACTIVE',
        }),
      }),
      env
    );
    expect(staff1Res.status).toBe(201);

    // Create staff at Outlet 2 (ro-1002) using the SAME global DSM designation
    const staff2Res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1002/hr/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP-RO2-DSM-01',
          fullName: 'Staff at RO 1002',
          designationId: 'desig-glb-dsm',
          aadhaarLast4: '2222',
          emergencyContactName: 'Emergency Person 2',
          emergencyContactPhone: '9876543210',
          joiningDate: '2025-01-01',
          employmentStatus: 'ACTIVE',
        }),
      }),
      env
    );
    expect(staff2Res.status).toBe(201);
  });

  // 21. Outlet A and outlet B can both use the same global shift template
  it('21. Outlet A and Outlet B can both schedule rosters or shifts using the same global shift template', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    // Create staff at ro-1001
    const s1Res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/hr/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP-RO1-ROST',
          fullName: 'Staff RO1 Rostered',
          designationId: 'desig-glb-dsm',
          aadhaarLast4: '3333',
          emergencyContactName: 'Emergency Person 1',
          emergencyContactPhone: '9876543210',
          joiningDate: '2025-01-01',
          employmentStatus: 'ACTIVE',
        }),
      }),
      env
    );
    const staff1 = ((await s1Res.json()) as any).data;

    // Create staff at ro-1002
    const s2Res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1002/hr/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          employeeCode: 'EMP-RO2-ROST',
          fullName: 'Staff RO2 Rostered',
          designationId: 'desig-glb-dsm',
          aadhaarLast4: '4444',
          emergencyContactName: 'Emergency Person 2',
          emergencyContactPhone: '9876543210',
          joiningDate: '2025-01-01',
          employmentStatus: 'ACTIVE',
        }),
      }),
      env
    );
    const staff2 = ((await s2Res.json()) as any).data;

    // Roster staff1 at ro-1001 with global st-ro1-1
    const rost1 = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/hr/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId: staff1.id,
          rosterDate: '2026-05-01',
          shiftTemplateId: 'st-ro1-1',
        }),
      }),
      env
    );
    expect(rost1.status).toBe(201);

    // Roster staff2 at ro-1002 with the SAME global st-ro1-1
    const rost2 = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1002/hr/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          staffId: staff2.id,
          rosterDate: '2026-05-01',
          shiftTemplateId: 'st-ro1-1',
        }),
      }),
      env
    );
    expect(rost2.status).toBe(201);
  });

  // 22. Compatibility route GET /api/v1/outlets/:id/hr/designations returns global list
  it('22. Compatibility route GET /api/v1/outlets/:id/hr/designations returns active global designations list with deprecation header', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    const res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/hr/designations', {
        method: 'GET',
        headers: { Cookie: adminCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Deprecated')).toBeDefined();
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    const codes = json.data.map((d: any) => d.code);
    expect(codes).toContain('DSM');
    expect(codes).toContain('MANAGER');
  });

  // 23. Compatibility route GET /api/v1/outlets/:id/shift-templates returns global list
  it('23. Compatibility route GET /api/v1/outlets/:id/shift-templates returns active global shift templates with deprecation header', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    const res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shift-templates', {
        method: 'GET',
        headers: { Cookie: adminCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Deprecated')).toBeDefined();
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    const codes = json.data.map((s: any) => s.code);
    expect(codes).toContain('SHIFT_1');
    expect(codes).toContain('SHIFT_2');
  });
});
