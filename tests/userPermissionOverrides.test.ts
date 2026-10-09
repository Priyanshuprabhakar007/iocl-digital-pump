import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import app from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import * as schema from '../src/db/schema';
import { eq, and } from 'drizzle-orm';
import fs from 'fs';
import { UserRepository } from '../src/worker/repositories/userRepository';
import { AuditRepository } from '../src/worker/repositories/auditRepository';
import { computeUserPermissionCellState, getUserPermissionRestriction } from '../src/frontend/pages/rbacUiHelper';
import { PERMISSIONS } from '../src/shared/constants';

describe('Direct User Permission Toggle Matrix & Overrides Suite', () => {
  let env: { DB: any };
  let dbPath: string;
  let localD1: any;
  let db: any;
  let userRepo: UserRepository;
  let auditRepo: AuditRepository;

  beforeEach(async () => {
    dbPath = `./.sqlite/test_user_overrides_${Math.random().toString(36).substring(7)}.db`;
    localD1 = createLocalD1Database(dbPath);
    db = getDb(localD1);
    await seedDatabase(db);

    env = { DB: localD1 };
    userRepo = new UserRepository(db);
    auditRepo = new AuditRepository(db);
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

  // =========================================================================
  // 1. Database Schema & Migration Verification
  // =========================================================================
  it('migration 0022 creates user_permission_overrides table with composite PK and foreign keys', async () => {
    // Verify table exists by querying sqlite_master
    const tableInfo = (await localD1.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_permission_overrides'").all()).results;
    expect(tableInfo.length).toBe(1);

    // Verify columns
    const columns = (await localD1.prepare("PRAGMA table_info('user_permission_overrides')").all()).results as any[];
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('user_id');
    expect(colNames).toContain('permission_id');
    expect(colNames).toContain('effect');
    expect(colNames).toContain('assigned_by_user_id');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('updated_at');

    // Verify composite primary key
    const pkCols = columns.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => c.name);
    expect(pkCols).toEqual(['user_id', 'permission_id']);
  });

  // =========================================================================
  // 2. Repository Permission Calculation Logic
  // =========================================================================
  it('ALLOW adds non-role permission and DENY removes inherited role permission', async () => {
    // Dealer user (user-dealer) normally has tanks.read, tanks.write, etc.
    const initialPerms = await userRepo.getUserPermissions('user-dealer');
    expect(initialPerms).toContain('tanks.write');
    // Dealer normally does NOT have municipal_taxes.write
    expect(initialPerms).not.toContain('municipal_taxes.write');

    const permTanksWrite = await userRepo.getPermissionByCode('tanks.write');
    const permMuniWrite = await userRepo.getPermissionByCode('municipal_taxes.write');

    expect(permTanksWrite).not.toBeNull();
    expect(permMuniWrite).not.toBeNull();

    // 1. Apply DENY on tanks.write
    await userRepo.setUserPermissionOverride({
      userId: 'user-dealer',
      permissionId: permTanksWrite!.id,
      effect: 'DENY',
      assignedByUserId: 'user-admin',
    });

    // 2. Apply ALLOW on municipal_taxes.write
    await userRepo.setUserPermissionOverride({
      userId: 'user-dealer',
      permissionId: permMuniWrite!.id,
      effect: 'ALLOW',
      assignedByUserId: 'user-admin',
    });

    const updatedPerms = await userRepo.getUserPermissions('user-dealer');
    expect(updatedPerms).not.toContain('tanks.write');
    expect(updatedPerms).toContain('municipal_taxes.write');
  });

  it('one user override does not affect another user with the same role', async () => {
    // Create second dealer user
    const now = new Date().toISOString();
    const dealer2 = await userRepo.createUser({
      id: 'user-dealer-2',
      empCode: 'IOCL-DLR-002',
      name: 'Second Dealer',
      email: 'dealer2@iocl.in',
      phone: '9830000099',
      passwordHash: 'hash',
      status: 'ACTIVE',
      roleCodes: ['DEALER'],
      createdAt: now,
      updatedAt: now,
    });

    const permTanksWrite = await userRepo.getPermissionByCode('tanks.write');
    expect(permTanksWrite).not.toBeNull();

    // Deny tanks.write for user-dealer only
    await userRepo.setUserPermissionOverride({
      userId: 'user-dealer',
      permissionId: permTanksWrite!.id,
      effect: 'DENY',
      assignedByUserId: 'user-admin',
    });

    const dealer1Perms = await userRepo.getUserPermissions('user-dealer');
    const dealer2Perms = await userRepo.getUserPermissions(dealer2.id);

    expect(dealer1Perms).not.toContain('tanks.write');
    expect(dealer2Perms).toContain('tanks.write');
  });

  it('duplicate override impossible and upsert updates effect cleanly', async () => {
    const perm = await userRepo.getPermissionByCode('tanks.read');
    expect(perm).not.toBeNull();

    // Insert ALLOW
    await userRepo.setUserPermissionOverride({
      userId: 'user-dealer',
      permissionId: perm!.id,
      effect: 'ALLOW',
      assignedByUserId: 'user-admin',
    });

    // Upsert to DENY
    await userRepo.setUserPermissionOverride({
      userId: 'user-dealer',
      permissionId: perm!.id,
      effect: 'DENY',
      assignedByUserId: 'user-admin',
    });

    const overrides = await userRepo.getUserPermissionOverrides('user-dealer');
    const matching = overrides.filter(o => o.permissionCode === 'tanks.read');
    expect(matching.length).toBe(1);
    expect(matching[0].effect).toBe('DENY');
  });

  // =========================================================================
  // 3. API Toggle Endpoint Logic & Validation
  // =========================================================================
  it('GET /api/v1/users/:id/permissions returns full permission details for global admin', async () => {
    const { cookie } = await loginAs('admin@iocl.in');

    const res = await app.fetch(
      new Request('http://localhost/api/v1/users/user-dealer/permissions', {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.user.id).toBe('user-dealer');
    expect(json.data.roleCodes).toContain('DEALER');
    expect(Array.isArray(json.data.inheritedPermissionCodes)).toBe(true);
    expect(Array.isArray(json.data.overrides)).toBe(true);
    expect(Array.isArray(json.data.effectivePermissionCodes)).toBe(true);
    expect(json.data.effectivePermissionCodes).toContain('tanks.read');
  });

  it('enabled=true removes existing DENY when role already grants', async () => {
    const { cookie } = await loginAs('admin@iocl.in');

    // First disable tanks.read for user-dealer (which is inherited)
    const patchRes1 = await app.fetch(
      new Request('http://localhost/api/v1/users/user-dealer/permissions/tanks.read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ enabled: false }),
      }),
      env
    );
    expect(patchRes1.status).toBe(200);
    const json1 = (await patchRes1.json()) as any;
    expect(json1.data.effect).toBe('DENY');
    expect(json1.data.enabled).toBe(false);
    expect(json1.data.effectivePermissionCodes).not.toContain('tanks.read');

    // Now enable tanks.read again
    const patchRes2 = await app.fetch(
      new Request('http://localhost/api/v1/users/user-dealer/permissions/tanks.read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ enabled: true }),
      }),
      env
    );
    expect(patchRes2.status).toBe(200);
    const json2 = (await patchRes2.json()) as any;
    expect(json2.data.enabled).toBe(true);
    expect(json2.data.effect).toBeNull(); // DENY removed, no override needed because inherited
    expect(json2.data.effectivePermissionCodes).toContain('tanks.read');

    // DB verify: user_permission_overrides should have 0 entries for tanks.read
    const overrides = await userRepo.getUserPermissionOverrides('user-dealer');
    expect(overrides.find(o => o.permissionCode === 'tanks.read')).toBeUndefined();
  });

  it('enabled=true stores ALLOW when role does not grant', async () => {
    const { cookie } = await loginAs('admin@iocl.in');

    // Dealer does not have users.create
    const patchRes = await app.fetch(
      new Request('http://localhost/api/v1/users/user-dealer/permissions/users.create', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ enabled: true }),
      }),
      env
    );
    expect(patchRes.status).toBe(200);
    const json = (await patchRes.json()) as any;
    expect(json.data.enabled).toBe(true);
    expect(json.data.effect).toBe('ALLOW');
    expect(json.data.effectivePermissionCodes).toContain('users.create');

    const overrides = await userRepo.getUserPermissionOverrides('user-dealer');
    const entry = overrides.find(o => o.permissionCode === 'users.create');
    expect(entry).toBeDefined();
    expect(entry?.effect).toBe('ALLOW');
  });

  it('enabled=false stores DENY even if role does not grant', async () => {
    const { cookie } = await loginAs('admin@iocl.in');

    // Dealer does not have users.create, but Admin explicitly denies it
    const patchRes = await app.fetch(
      new Request('http://localhost/api/v1/users/user-dealer/permissions/users.create', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ enabled: false }),
      }),
      env
    );
    expect(patchRes.status).toBe(200);
    const json = (await patchRes.json()) as any;
    expect(json.data.enabled).toBe(false);
    expect(json.data.effect).toBe('DENY');
    expect(json.data.effectivePermissionCodes).not.toContain('users.create');

    const overrides = await userRepo.getUserPermissionOverrides('user-dealer');
    const entry = overrides.find(o => o.permissionCode === 'users.create');
    expect(entry?.effect).toBe('DENY');
  });

  it('unknown permission code is rejected with 404 PERMISSION_NOT_FOUND', async () => {
    const { cookie } = await loginAs('admin@iocl.in');

    const patchRes = await app.fetch(
      new Request('http://localhost/api/v1/users/user-dealer/permissions/nonexistent.permission', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ enabled: true }),
      }),
      env
    );
    expect(patchRes.status).toBe(404);
    const json = (await patchRes.json()) as any;
    expect(json.error.code).toBe('PERMISSION_NOT_FOUND');
  });

  it('non-global admin is forbidden (403 FORBIDDEN)', async () => {
    // Login as Dealer (user-dealer)
    const { cookie } = await loginAs('dealer.parkstreet@iocl.in');

    const getRes = await app.fetch(
      new Request('http://localhost/api/v1/users/user-csp/permissions', {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(getRes.status).toBe(403);
    const getJson = (await getRes.json()) as any;
    expect(getJson.error.code).toBe('FORBIDDEN');

    const patchRes = await app.fetch(
      new Request('http://localhost/api/v1/users/user-csp/permissions/tanks.read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ enabled: false }),
      }),
      env
    );
    expect(patchRes.status).toBe(403);
    const patchJson = (await patchRes.json()) as any;
    expect(patchJson.error.code).toBe('FORBIDDEN');
  });

  it('Admin cannot modify own permissions (403 SELF_PERMISSION_MODIFICATION_FORBIDDEN)', async () => {
    const { cookie } = await loginAs('admin@iocl.in');

    const patchRes = await app.fetch(
      new Request('http://localhost/api/v1/users/user-admin/permissions/tanks.read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ enabled: false }),
      }),
      env
    );
    expect(patchRes.status).toBe(403);
    const json = (await patchRes.json()) as any;
    expect(json.error.code).toBe('SELF_PERMISSION_MODIFICATION_FORBIDDEN');
  });

  it('target ADMIN role cannot be customized (400 ADMIN_PERMISSION_OVERRIDE_NOT_ALLOWED)', async () => {
    // Create second admin user
    const now = new Date().toISOString();
    const admin2 = await userRepo.createUser({
      id: 'user-admin-2',
      empCode: 'IOCL-ADM-002',
      name: 'Second Admin',
      email: 'admin2@iocl.in',
      phone: '9830000088',
      passwordHash: 'hash',
      status: 'ACTIVE',
      roleCodes: ['ADMIN'],
      createdAt: now,
      updatedAt: now,
    });

    const { cookie } = await loginAs('admin@iocl.in');

    const patchRes = await app.fetch(
      new Request(`http://localhost/api/v1/users/${admin2.id}/permissions/tanks.read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ enabled: false }),
      }),
      env
    );
    expect(patchRes.status).toBe(400);
    const json = (await patchRes.json()) as any;
    expect(json.error.code).toBe('ADMIN_PERMISSION_OVERRIDE_NOT_ALLOWED');
  });

  it('audit generated on successful toggle, and failed toggle creates no success audit', async () => {
    const { cookie } = await loginAs('admin@iocl.in');

    // 1. Successful toggle
    const patchRes = await app.fetch(
      new Request('http://localhost/api/v1/users/user-dealer/permissions/municipal_taxes.write', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ enabled: true }),
      }),
      env
    );
    expect(patchRes.status).toBe(200);

    const auditLogs = await auditRepo.listLogs(10);
    const permAudit = auditLogs.find(
      l => l.action === 'USER_PERMISSION_UPDATED' && l.entityId === 'user-dealer'
    );
    expect(permAudit).toBeDefined();

    // 2. Failed toggle (unknown permission)
    const initialLogCount = auditLogs.length;
    await app.fetch(
      new Request('http://localhost/api/v1/users/user-dealer/permissions/fake.perm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ enabled: true }),
      }),
      env
    );

    const afterLogs = await auditRepo.listLogs(10);
    // Log count should not increase with a successful USER_PERMISSION_UPDATED
    const fakePermAudit = afterLogs.find(
      l => l.action === 'USER_PERMISSION_UPDATED' && (l.newValueJson as any)?.includes('fake.perm')
    );
    expect(fakePermAudit).toBeUndefined();
  });

  it('getUserPermissions immediately reflects toggle and enforces backend authorization', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    // Dealer initially does NOT have users.read
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');
    const check1 = await app.fetch(
      new Request('http://localhost/api/v1/users', {
        headers: { Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(check1.status).toBe(403);

    // Admin grants users.read to dealer
    const grantRes = await app.fetch(
      new Request('http://localhost/api/v1/users/user-dealer/permissions/users.read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ enabled: true }),
      }),
      env
    );
    expect(grantRes.status).toBe(200);

    // Dealer requests again using existing session cookie - immediately allowed!
    const check2 = await app.fetch(
      new Request('http://localhost/api/v1/users', {
        headers: { Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(check2.status).toBe(200);
  });

  // =========================================================================
  // 4. Frontend UI Helper Pure Tests
  // =========================================================================
  describe('Frontend UI Helper Tests', () => {
    it('inherited permission shows checked and displays role tooltip with no override badge', () => {
      const state = computeUserPermissionCellState({
        permissionCode: 'tanks.read',
        inheritedPermissionCodes: ['tanks.read', 'tanks.write'],
        overrides: [],
        effectivePermissionCodes: ['tanks.read', 'tanks.write'],
        roleCodes: ['DEALER'],
      });

      expect(state.isEnabled).toBe(true);
      expect(state.isInherited).toBe(true);
      expect(state.overrideEffect).toBeNull();
      expect(state.tooltip).toBe('Granted by role: DEALER');
      expect(state.badgeText).toBeNull();
    });

    it('denied override shows unchecked and displays custom deny badge', () => {
      const state = computeUserPermissionCellState({
        permissionCode: 'tanks.write',
        inheritedPermissionCodes: ['tanks.read', 'tanks.write'],
        overrides: [{ permissionCode: 'tanks.write', effect: 'DENY' }],
        effectivePermissionCodes: ['tanks.read'], // tanks.write removed
        roleCodes: ['DEALER'],
      });

      expect(state.isEnabled).toBe(false);
      expect(state.isInherited).toBe(true);
      expect(state.overrideEffect).toBe('DENY');
      expect(state.tooltip).toBe('Permission disabled for this user');
      expect(state.badgeText).toBe('- Custom Deny');
    });

    it('custom allow shows checked and displays custom grant badge', () => {
      const state = computeUserPermissionCellState({
        permissionCode: 'municipal_taxes.write',
        inheritedPermissionCodes: ['tanks.read'],
        overrides: [{ permissionCode: 'municipal_taxes.write', effect: 'ALLOW' }],
        effectivePermissionCodes: ['tanks.read', 'municipal_taxes.write'],
        roleCodes: ['DEALER'],
      });

      expect(state.isEnabled).toBe(true);
      expect(state.isInherited).toBe(false);
      expect(state.overrideEffect).toBe('ALLOW');
      expect(state.tooltip).toBe('Custom permission granted by Admin');
      expect(state.badgeText).toBe('+ Custom Grant');
    });

    it('unassigned non-inherited permission shows unchecked without badge', () => {
      const state = computeUserPermissionCellState({
        permissionCode: 'nfr_contracts.write',
        inheritedPermissionCodes: ['tanks.read'],
        overrides: [],
        effectivePermissionCodes: ['tanks.read'],
        roleCodes: ['DEALER'],
      });

      expect(state.isEnabled).toBe(false);
      expect(state.isInherited).toBe(false);
      expect(state.overrideEffect).toBeNull();
      expect(state.badgeText).toBeNull();
    });

    it('getUserPermissionRestriction correctly detects self-edit and admin target accounts', () => {
      // 1. No user selected
      expect(getUserPermissionRestriction({}).isDisabled).toBe(true);

      // 2. Normal target user
      const normal = getUserPermissionRestriction({
        currentUserId: 'admin-1',
        selectedUserId: 'user-2',
        selectedUserRoles: ['DEALER'],
      });
      expect(normal.isDisabled).toBe(false);
      expect(normal.message).toBeNull();

      // 3. Self-edit
      const self = getUserPermissionRestriction({
        currentUserId: 'admin-1',
        selectedUserId: 'admin-1',
        selectedUserRoles: ['ADMIN'],
      });
      expect(self.isDisabled).toBe(true);
      expect(self.message).toBe('Your own permission access cannot be modified here.');

      // 4. Other Admin target
      const adminTarget = getUserPermissionRestriction({
        currentUserId: 'admin-1',
        selectedUserId: 'admin-2',
        selectedUserRoles: ['ADMIN'],
      });
      expect(adminTarget.isDisabled).toBe(true);
      expect(adminTarget.message).toBe('ADMIN accounts have full system access. Individual permission overrides are not applicable.');
    });
  });
});
