import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import app from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import { detectDuplicateRecords } from '../src/db/duplicateDiagnostic';
import { mapDatabaseUniqueError } from '../src/worker/services/duplicateErrorMapper';
import { NfrService } from '../src/worker/services/nfrService';
import fs from 'fs';

describe('Platform-Wide Idempotency & Duplicate Hardening Suite', () => {
  let env: { DB: any; DOCUMENTS_BUCKET: any; ENVIRONMENT: string; ALLOWED_ORIGINS?: string };
  let dbPath: string;
  let localD1: any;
  let adminCookie: string;

  beforeEach(async () => {
    dbPath = `./.sqlite/test_idempotency_${Math.random().toString(36).substring(7)}.db`;
    localD1 = createLocalD1Database(dbPath);
    const db = getDb(localD1);
    await seedDatabase(db);

    const mockBucket = {
      put: async () => ({ key: '', size: 0 }),
      delete: async () => {},
    };

    env = {
      DB: localD1,
      DOCUMENTS_BUCKET: mockBucket as any,
      ENVIRONMENT: 'development',
      ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
    };

    // Obtain session cookie
    const loginRes = await app.fetch(
      new Request('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
      }),
      env
    );
    expect(loginRes.status).toBe(200);
    const setCookie = loginRes.headers.get('set-cookie');
    expect(setCookie).not.toBeNull();
    adminCookie = setCookie!.split(';')[0];
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

  describe('1. Idempotency-Key Format Validation', () => {
    it('1.1 rejects short or invalid character Idempotency-Key with 400 INVALID_IDEMPOTENCY_KEY', async () => {
      const res = await app.fetch(
        new Request('http://localhost:3000/api/v1/org/departments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: adminCookie,
            Origin: 'http://localhost:3000',
            'Idempotency-Key': 'abc',
          },
          body: JSON.stringify({
            code: 'DEPT_TEST_SHORT',
            name: 'Short Key Test Dept',
          }),
        }),
        env
      );

      expect(res.status).toBe(400);
      const json: any = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('INVALID_IDEMPOTENCY_KEY');
    });
  });

  describe('2. Idempotency Replay on Matching Payload', () => {
    it('2.1 returns original response with X-Idempotent-Replay header and creates only 1 record', async () => {
      const idemKey = `idem-test-${crypto.randomUUID()}`;
      const payload = {
        code: 'DEPT_RETAIL_EAST',
        name: 'Eastern Retail Operations',
        description: 'Retail management for eastern zone',
      };

      const res1 = await app.fetch(
        new Request('http://localhost:3000/api/v1/org/departments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: adminCookie,
            Origin: 'http://localhost:3000',
            'Idempotency-Key': idemKey,
          },
          body: JSON.stringify(payload),
        }),
        env
      );

      expect(res1.status).toBe(201);
      const json1: any = await res1.json();
      expect(json1.success).toBe(true);

      const res2 = await app.fetch(
        new Request('http://localhost:3000/api/v1/org/departments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: adminCookie,
            Origin: 'http://localhost:3000',
            'Idempotency-Key': idemKey,
          },
          body: JSON.stringify(payload),
        }),
        env
      );

      expect(res2.status).toBe(201);
      expect(res2.headers.get('X-Idempotent-Replay')).toBe('true');
      const json2: any = await res2.json();
      expect(json2.data.id).toBe(json1.data.id);

      const countRow: any = await env.DB.prepare('SELECT COUNT(*) AS cnt FROM org_departments WHERE code = ?')
        .bind('DEPT_RETAIL_EAST')
        .first();
      expect(countRow?.cnt).toBe(1);
    });
  });

  describe('3. Idempotency Conflict on Mismatched Payload', () => {
    it('3.1 rejects reusing the same Idempotency-Key with a different request payload with 409', async () => {
      const idemKey = `idem-conflict-${crypto.randomUUID()}`;

      const res1 = await app.fetch(
        new Request('http://localhost:3000/api/v1/org/departments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: adminCookie,
            Origin: 'http://localhost:3000',
            'Idempotency-Key': idemKey,
          },
          body: JSON.stringify({
            code: 'DEPT_ORIG_1',
            name: 'Original Department Name',
          }),
        }),
        env
      );
      expect(res1.status).toBe(201);

      const res2 = await app.fetch(
        new Request('http://localhost:3000/api/v1/org/departments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: adminCookie,
            Origin: 'http://localhost:3000',
            'Idempotency-Key': idemKey,
          },
          body: JSON.stringify({
            code: 'DEPT_DIFFERENT_2',
            name: 'Mutated Department Name',
          }),
        }),
        env
      );

      expect(res2.status).toBe(409);
      const json2: any = await res2.json();
      expect(json2.success).toBe(false);
      expect(json2.error.code).toBe('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD');
    });
  });

  describe('4. Concurrent Double-Submit Serialization', () => {
    it('4.1 serializes concurrent identical POST requests with the same Idempotency-Key and creates only 1 record', async () => {
      const idemKey = `idem-concurrent-${crypto.randomUUID()}`;
      const payload = {
        code: 'DEPT_CONC_TEST',
        name: 'Concurrent Test Dept',
      };

      const reqs = Array.from({ length: 3 }).map(() =>
        app.fetch(
          new Request('http://localhost:3000/api/v1/org/departments', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Cookie: adminCookie,
              Origin: 'http://localhost:3000',
              'Idempotency-Key': idemKey,
            },
            body: JSON.stringify(payload),
          }),
          env
        )
      );

      const results = await Promise.all(reqs);

      for (const res of results) {
        expect(res.status).toBe(201);
      }

      const replayCount = results.filter((r) => r.headers.get('X-Idempotent-Replay') === 'true').length;
      expect(replayCount).toBe(2);

      const row: any = await env.DB.prepare('SELECT COUNT(*) as count FROM org_departments WHERE code = ?')
        .bind('DEPT_CONC_TEST')
        .first();
      expect(row?.count).toBe(1);
    });
  });

  describe('5. Database Unique Constraint Mapping to 409 Conflict', () => {
    it('5.1 duplicate RO Code on outlet creation returns 409 RO_CODE_EXISTS', async () => {
      const now = new Date().toISOString();
      await env.DB.prepare(`INSERT OR IGNORE INTO states (id, code, name, status, created_at, updated_at) VALUES ('s1', 'WB', 'West Bengal', 'ACTIVE', ?, ?)`).bind(now, now).run();
      await env.DB.prepare(`INSERT OR IGNORE INTO divisions (id, state_id, code, name, status, created_at, updated_at) VALUES ('d1', 's1', 'KOL', 'Kolkata', 'ACTIVE', ?, ?)`).bind(now, now).run();
      await env.DB.prepare(`INSERT OR IGNORE INTO sales_areas (id, division_id, code, name, status, created_at, updated_at) VALUES ('sa1', 'd1', 'CC', 'Central', 'ACTIVE', ?, ?)`).bind(now, now).run();

      await env.DB.prepare(`
        INSERT INTO retail_outlets (
          id, ro_code, name, outlet_type, state_id, division_id, sales_area_id, 
          address, city, district, pincode, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        'out-test', 'RO123', 'Test Outlet', 'COCO', 's1', 'd1', 'sa1', 
        'Addr', 'City', 'Dist', '123456', 'ACTIVE', now, now
      ).run();

      const res = await app.fetch(
        new Request('http://localhost:3000/api/v1/outlets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: adminCookie,
            Origin: 'http://localhost:3000',
          },
          body: JSON.stringify({
            roCode: 'RO123',
            name: 'Duplicate Test Outlet',
            salesAreaId: 'sa1',
            stateId: 's1',
            divisionId: 'd1',
            outletType: 'COCO',
            address: 'Addr',
            city: 'City',
            district: 'Dist',
            pincode: '123456',
            status: 'ACTIVE',
          }),
        }),
        env
      );

      expect(res.status).toBe(409);
      const json: any = await res.json();
      expect(json.error.code).toBe('RO_CODE_EXISTS');
    });

    it('5.2 duplicate user scope assignment returns 409 SCOPE_ASSIGNMENT_EXISTS', async () => {
      const now = new Date().toISOString();
      const userId = `user-${crypto.randomUUID()}`;
      await env.DB.prepare(`INSERT INTO users (id, emp_code, name, email, phone, password_hash, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        userId, `EMP-${userId.slice(0,8)}`, 'Test Scope', 'test.scope@iocl.in', '1234567890', 'hash', 'ACTIVE', now, now
      ).run();

      // First assignment
      const res1 = await app.fetch(
        new Request('http://localhost:3000/api/v1/scopes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: adminCookie,
            Origin: 'http://localhost:3000',
          },
          body: JSON.stringify({
            userId: userId,
            scopeLevel: 'GLOBAL',
          }),
        }),
        env
      );
      expect(res1.status).toBe(201);

      // Attempt duplicate with a different Idempotency-Key
      const res2 = await app.fetch(
        new Request('http://localhost:3000/api/v1/scopes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: adminCookie,
            Origin: 'http://localhost:3000',
            'Idempotency-Key': `idem-dup-scope-${crypto.randomUUID()}`,
          },
          body: JSON.stringify({
            userId: userId,
            scopeLevel: 'GLOBAL',
          }),
        }),
        env
      );
      expect(res2.status).toBe(409);
      const json2: any = await res2.json();
      expect(json2.error.code).toBe('SCOPE_ASSIGNMENT_EXISTS');
    });

    it('5.3 known hr_staff unique violation maps to 409 HR_STAFF_CODE_EXISTS', () => {
      const mapped = mapDatabaseUniqueError(
        new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: hr_staff.outlet_id, hr_staff.employee_code')
      );
      expect(mapped).not.toBeNull();
      expect(mapped?.status).toBe(409);
      expect(mapped?.code).toBe('HR_STAFF_CODE_EXISTS');
    });

    it('5.4 known nozzle unique violation maps to 409 NOZZLE_NUMBER_EXISTS', () => {
      const mapped = mapDatabaseUniqueError(
        new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: nozzles.dispenser_id, nozzles.nozzle_number')
      );
      expect(mapped).not.toBeNull();
      expect(mapped?.status).toBe(409);
      expect(mapped?.code).toBe('NOZZLE_NUMBER_EXISTS');
    });

    it('5.5 unknown unique violation secret_internal_table.foo returns null', () => {
      const mapped = mapDatabaseUniqueError(
        new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: secret_internal_table.foo')
      );
      expect(mapped).toBeNull();
    });

    it('5.6 non-unique SQLite error returns null', () => {
      const mapped = mapDatabaseUniqueError(
        new Error('SQLITE_CONSTRAINT_FOREIGNKEY: FOREIGN KEY constraint failed')
      );
      expect(mapped).toBeNull();
    });

    it('5.7 API-level unknown raw DB error returns 500 INTERNAL_SERVER_ERROR without leaking SQLITE, table, or constraint text', async () => {
      const spy = vi.spyOn(NfrService.prototype, 'listSpaces').mockRejectedValueOnce(
        new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: secret_internal_table.foo')
      );

      try {
        const res = await app.fetch(
          new Request('http://localhost:3000/api/v1/outlets/outlet-1/nfr/spaces', {
            method: 'GET',
            headers: {
              Cookie: adminCookie,
              Origin: 'http://localhost:3000',
            },
          }),
          env
        );

        expect(res.status).toBe(500);
        const bodyText = await res.text();
        const json: any = JSON.parse(bodyText);
        expect(json.success).toBe(false);
        expect(json.error.code).toBe('INTERNAL_SERVER_ERROR');
        expect(bodyText.toLowerCase()).not.toContain('sqlite');
        expect(bodyText.toLowerCase()).not.toContain('secret_internal_table');
        expect(bodyText.toLowerCase()).not.toContain('constraint');
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('6. Non-Destructive Duplicate Diagnostics Verification', () => {
    it('6.1 reports zero duplicate groups on fresh seeded test database', () => {
      const sqliteInstance = (localD1 as any).db;
      const report = detectDuplicateRecords(sqliteInstance);
      expect(report.hasDuplicates).toBe(false);
    });
  });
});

