import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import fs from 'fs';
import { eq } from 'drizzle-orm';
import {
  municipalTaxDues,
  documents,
  auditLogs,
  permissions,
  rolePermissions,
  roles,
} from '../src/db/schema';
import { PERMISSIONS, ROLES } from '../src/shared/constants';

const SAFE_MONEY_LIMIT_PAISE = 100_000_000_00; // 100,000,000.00 INR = 10,000,000,000 paise

class MockR2Bucket {
  private store = new Map<string, { data: Uint8Array; metadata: Record<string, string> }>();
  async get(key: string) {
    const item = this.store.get(key);
    if (!item) return null;
    return {
      body: item.data,
      arrayBuffer: async () => item.data.buffer,
      customMetadata: item.metadata,
    };
  }
  async put(key: string, value: ArrayBuffer | Uint8Array, options?: any) {
    const data = value instanceof Uint8Array ? value : new Uint8Array(value);
    this.store.set(key, { data, metadata: options?.customMetadata || {} });
    return { key, size: data.byteLength };
  }
  async delete(key: string) {
    this.store.delete(key);
  }
}

describe('Phase 4B-1 Municipal Taxes & Statutory Dues Core Backend Suite', () => {
  let localD1: any;
  let env: any;
  let testDbPath: string;

  const OUTLET_1_ID = 'ro-1001'; // Park Street IOCL (Kolkata DO, Central SA)
  const OUTLET_2_ID = 'ro-1002'; // Salt Lake IOCL (Kolkata DO, North SA)
  const OUTLET_3_ID = 'ro-1003'; // GT Road Ludhiana (Ludhiana DO, Central SA)

  beforeEach(async () => {
    testDbPath = `./.sqlite/test_mtax_${Math.random().toString(36).substring(2)}_${Date.now()}.db`;
    if (fs.existsSync(testDbPath)) { try { fs.unlinkSync(testDbPath); } catch (e) {} }
    const walPath = `${testDbPath}-wal`;
    const shmPath = `${testDbPath}-shm`;
    if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch (e) {} }
    if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch (e) {} }

    localD1 = createLocalD1Database(testDbPath);
    await seedDatabase(getDb(localD1));

    env = {
      DB: localD1,
      DOCUMENTS_BUCKET: new MockR2Bucket(),
      ENVIRONMENT: 'test',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    };
  });

  afterEach(() => {
    try { localD1.close(); } catch (e) {}
    if (testDbPath && fs.existsSync(testDbPath)) { try { fs.unlinkSync(testDbPath); } catch (e) {} }
    const walPath = `${testDbPath}-wal`;
    const shmPath = `${testDbPath}-shm`;
    if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch (e) {} }
    if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch (e) {} }
  });

  async function jsonOf<T = any>(res: Response): Promise<T> {
    return (await res.json()) as T;
  }

  async function loginAs(email: string, pass = 'Password@123') {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3000' },
      body: JSON.stringify({ email, password: pass }),
    }, env);
    const setCookie = res.headers.get('set-cookie');
    return setCookie ? setCookie.split(';')[0] : '';
  }

  async function createTestDocument(outletId: string, docId?: string) {
    const db = getDb(localD1);
    const id = docId || `doc-${Math.random().toString(36).substring(2)}`;
    await db.insert(documents).values({
      id,
      outletId,
      name: 'test-doc.pdf',
      sizeBytes: 1024,
      mimeType: 'application/pdf',
      r2Key: `outlets/${outletId}/${id}.pdf`,
      uploadedByUserId: 'user-admin',
      createdAt: new Date().toISOString(),
    }).run();
    return id;
  }

  // =========================================================================
  // 1. MIGRATION & SCHEMA STRUCTURE TESTS
  // =========================================================================
  describe('1. Migration, Schema & Constraint Verification', () => {
    it('1.1 should create municipal_tax_dues table with all expected columns', async () => {
      const db = getDb(localD1);
      const rows = await db.all<{ name: string; type: string }>(
        "PRAGMA table_info(municipal_tax_dues);"
      );
      const cols = rows.map(r => r.name);
      expect(cols).toContain('id');
      expect(cols).toContain('outlet_id');
      expect(cols).toContain('tax_type');
      expect(cols).toContain('authority_name');
      expect(cols).toContain('reference_number');
      expect(cols).toContain('assessment_frequency');
      expect(cols).toContain('assessment_period_start');
      expect(cols).toContain('assessment_period_end');
      expect(cols).toContain('amount_paise');
      expect(cols).toContain('due_date');
      expect(cols).toContain('assessment_document_id');
      expect(cols).toContain('status');
      expect(cols).toContain('payment_receipt_document_id');
      expect(cols).toContain('payment_reference');
      expect(cols).toContain('paid_at');
      expect(cols).toContain('paid_by_user_id');
      expect(cols).toContain('notes');
      expect(cols).toContain('created_by');
      expect(cols).toContain('created_at');
      expect(cols).toContain('updated_at');
    });

    it('1.2 should insert all 3 new municipal tax permissions into permissions table', async () => {
      const db = getDb(localD1);
      const perms = await db.select().from(permissions).all();
      const codes = perms.map(p => p.code);
      expect(codes).toContain(PERMISSIONS.MUNICIPAL_TAXES_READ);
      expect(codes).toContain(PERMISSIONS.MUNICIPAL_TAXES_WRITE);
      expect(codes).toContain(PERMISSIONS.MUNICIPAL_TAX_PAYMENTS_WRITE);
    });

    it('1.3 should map permissions correctly to roles in role_permissions table', async () => {
      const db = getDb(localD1);
      const rolePerms = await db
        .select({
          roleCode: roles.code,
          permCode: permissions.code,
        })
        .from(rolePermissions)
        .innerJoin(roles, eq(rolePermissions.roleId, roles.id))
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .all();

      const permsForRole = (r: string) => rolePerms.filter(rp => rp.roleCode === r).map(rp => rp.permCode);

      // ADMIN: read, write, payments
      expect(permsForRole(ROLES.ADMIN)).toContain(PERMISSIONS.MUNICIPAL_TAXES_READ);
      expect(permsForRole(ROLES.ADMIN)).toContain(PERMISSIONS.MUNICIPAL_TAXES_WRITE);
      expect(permsForRole(ROLES.ADMIN)).toContain(PERMISSIONS.MUNICIPAL_TAX_PAYMENTS_WRITE);

      // STATE_OFFICE: read only
      expect(permsForRole(ROLES.STATE_OFFICE)).toContain(PERMISSIONS.MUNICIPAL_TAXES_READ);
      expect(permsForRole(ROLES.STATE_OFFICE)).not.toContain(PERMISSIONS.MUNICIPAL_TAXES_WRITE);
      expect(permsForRole(ROLES.STATE_OFFICE)).not.toContain(PERMISSIONS.MUNICIPAL_TAX_PAYMENTS_WRITE);

      // DIVISIONAL_OFFICE: read only
      expect(permsForRole(ROLES.DIVISIONAL_OFFICE)).toContain(PERMISSIONS.MUNICIPAL_TAXES_READ);
      expect(permsForRole(ROLES.DIVISIONAL_OFFICE)).not.toContain(PERMISSIONS.MUNICIPAL_TAXES_WRITE);
      expect(permsForRole(ROLES.DIVISIONAL_OFFICE)).not.toContain(PERMISSIONS.MUNICIPAL_TAX_PAYMENTS_WRITE);

      // BUSINESS_MANAGER: read, write, payments
      expect(permsForRole(ROLES.BUSINESS_MANAGER)).toContain(PERMISSIONS.MUNICIPAL_TAXES_READ);
      expect(permsForRole(ROLES.BUSINESS_MANAGER)).toContain(PERMISSIONS.MUNICIPAL_TAXES_WRITE);
      expect(permsForRole(ROLES.BUSINESS_MANAGER)).toContain(PERMISSIONS.MUNICIPAL_TAX_PAYMENTS_WRITE);

      // FIELD_OFFICER: read, write, payments
      expect(permsForRole(ROLES.FIELD_OFFICER)).toContain(PERMISSIONS.MUNICIPAL_TAXES_READ);
      expect(permsForRole(ROLES.FIELD_OFFICER)).toContain(PERMISSIONS.MUNICIPAL_TAXES_WRITE);
      expect(permsForRole(ROLES.FIELD_OFFICER)).toContain(PERMISSIONS.MUNICIPAL_TAX_PAYMENTS_WRITE);

      // DEALER: read, payments (NO write)
      expect(permsForRole(ROLES.DEALER)).toContain(PERMISSIONS.MUNICIPAL_TAXES_READ);
      expect(permsForRole(ROLES.DEALER)).not.toContain(PERMISSIONS.MUNICIPAL_TAXES_WRITE);
      expect(permsForRole(ROLES.DEALER)).toContain(PERMISSIONS.MUNICIPAL_TAX_PAYMENTS_WRITE);

      // CSP: read, payments (NO write)
      expect(permsForRole(ROLES.CSP)).toContain(PERMISSIONS.MUNICIPAL_TAXES_READ);
      expect(permsForRole(ROLES.CSP)).not.toContain(PERMISSIONS.MUNICIPAL_TAXES_WRITE);
      expect(permsForRole(ROLES.CSP)).toContain(PERMISSIONS.MUNICIPAL_TAX_PAYMENTS_WRITE);
    });

    it('1.4 should create all required unique and performance indexes', async () => {
      const db = getDb(localD1);
      const indexes = await db.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'municipal_tax_dues';"
      );
      const indexNames = indexes.map(i => i.name);
      expect(indexNames).toContain('idx_municipal_tax_statutory_identity');
      expect(indexNames).toContain('idx_municipal_tax_outlet_id');
      expect(indexNames).toContain('idx_municipal_tax_outlet_status');
      expect(indexNames).toContain('idx_municipal_tax_outlet_due_date');
      expect(indexNames).toContain('idx_municipal_tax_outlet_tax_type');
      expect(indexNames).toContain('idx_municipal_tax_outlet_frequency');
      expect(indexNames).toContain('idx_municipal_tax_period_start');
      expect(indexNames).toContain('idx_municipal_tax_reference_number');
    });

    it('1.5 should enforce DB trigger trg_municipal_tax_delete_forbidden on direct SQL DELETE', async () => {
      const db = getDb(localD1);
      const triggers = await db.all("SELECT name FROM sqlite_master WHERE type='trigger' AND name = 'trg_municipal_tax_delete_forbidden'");
      expect(triggers.length).toBe(1);

      const now = new Date().toISOString();
      await db.insert(municipalTaxDues).values({
        id: 'mtax-del-test',
        outletId: OUTLET_1_ID,
        taxType: 'PROPERTY_TAX',
        authorityName: 'KMC',
        referenceNumber: 'REF-DEL-1',
        assessmentFrequency: 'ANNUAL',
        assessmentPeriodStart: '2026-04-01',
        assessmentPeriodEnd: '2027-03-31',
        amountPaise: 500000,
        dueDate: '2026-06-30',
        status: 'PENDING',
        createdBy: 'user-admin',
        createdAt: now,
        updatedAt: now,
      }).run();

      await expect(
        db.delete(municipalTaxDues).where(eq(municipalTaxDues.id, 'mtax-del-test')).run()
      ).rejects.toThrow();
    });

    it('1.6 should enforce DB trigger trg_municipal_tax_identity_immutable on direct SQL UPDATE of outlet_id', async () => {
      const db = getDb(localD1);
      const triggers = await db.all("SELECT name FROM sqlite_master WHERE type='trigger' AND name = 'trg_municipal_tax_identity_immutable'");
      expect(triggers.length).toBe(1);

      const now = new Date().toISOString();
      await db.insert(municipalTaxDues).values({
        id: 'mtax-ident-test',
        outletId: OUTLET_1_ID,
        taxType: 'PROPERTY_TAX',
        authorityName: 'KMC',
        referenceNumber: 'REF-IDENT-1',
        assessmentFrequency: 'ANNUAL',
        assessmentPeriodStart: '2026-04-01',
        assessmentPeriodEnd: '2027-03-31',
        amountPaise: 500000,
        dueDate: '2026-06-30',
        status: 'PENDING',
        createdBy: 'user-admin',
        createdAt: now,
        updatedAt: now,
      }).run();

      await expect(
        db.update(municipalTaxDues).set({ outletId: OUTLET_2_ID }).where(eq(municipalTaxDues.id, 'mtax-ident-test')).run()
      ).rejects.toThrow();
    });

    it('1.7 should enforce DB trigger trg_municipal_tax_paid_immutable on direct SQL UPDATE of PAID row', async () => {
      const db = getDb(localD1);
      const triggers = await db.all("SELECT name FROM sqlite_master WHERE type='trigger' AND name = 'trg_municipal_tax_paid_immutable'");
      expect(triggers.length).toBe(1);

      const receiptDocId = await createTestDocument(OUTLET_1_ID);
      const now = new Date().toISOString();
      await db.insert(municipalTaxDues).values({
        id: 'mtax-paid-imm-test',
        outletId: OUTLET_1_ID,
        taxType: 'PROPERTY_TAX',
        authorityName: 'KMC',
        referenceNumber: 'REF-PAID-IMM-1',
        assessmentFrequency: 'ANNUAL',
        assessmentPeriodStart: '2026-04-01',
        assessmentPeriodEnd: '2027-03-31',
        amountPaise: 500000,
        dueDate: '2026-06-30',
        status: 'PAID',
        paymentReceiptDocumentId: receiptDocId,
        paymentReference: 'PAY-1234',
        paidAt: now,
        paidByUserId: 'user-admin',
        createdBy: 'user-admin',
        createdAt: now,
        updatedAt: now,
      }).run();

      await expect(
        db.update(municipalTaxDues).set({ notes: 'Trying to edit paid due' }).where(eq(municipalTaxDues.id, 'mtax-paid-imm-test')).run()
      ).rejects.toThrow();
    });

    it('1.8 should enforce DB trigger trg_municipal_tax_doc_outlet_insert on direct SQL insert with foreign assessment doc', async () => {
      const db = getDb(localD1);
      const triggers = await db.all("SELECT name FROM sqlite_master WHERE type='trigger' AND name = 'trg_municipal_tax_doc_outlet_insert'");
      expect(triggers.length).toBe(1);

      const foreignDocId = await createTestDocument(OUTLET_2_ID); // Doc belongs to Outlet 2
      const now = new Date().toISOString();

      await expect(
        db.insert(municipalTaxDues).values({
          id: 'mtax-doc-mismatch-test',
          outletId: OUTLET_1_ID, // Due belongs to Outlet 1
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'REF-DOC-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amountPaise: 500000,
          dueDate: '2026-06-30',
          assessmentDocumentId: foreignDocId,
          status: 'PENDING',
          createdBy: 'user-admin',
          createdAt: now,
          updatedAt: now,
        }).run()
      ).rejects.toThrow();
    });

    it('1.9 should enforce DB trigger trg_municipal_tax_doc_outlet_update on direct SQL update with foreign receipt doc', async () => {
      const db = getDb(localD1);
      const triggers = await db.all("SELECT name FROM sqlite_master WHERE type='trigger' AND name = 'trg_municipal_tax_doc_outlet_update'");
      expect(triggers.length).toBe(1);

      const foreignReceiptDocId = await createTestDocument(OUTLET_2_ID); // Doc belongs to Outlet 2
      const now = new Date().toISOString();

      await db.insert(municipalTaxDues).values({
        id: 'mtax-rcpt-mismatch-test',
        outletId: OUTLET_1_ID, // Due belongs to Outlet 1
        taxType: 'PROPERTY_TAX',
        authorityName: 'KMC',
        referenceNumber: 'REF-RCPT-1',
        assessmentFrequency: 'ANNUAL',
        assessmentPeriodStart: '2026-04-01',
        assessmentPeriodEnd: '2027-03-31',
        amountPaise: 500000,
        dueDate: '2026-06-30',
        status: 'PENDING',
        createdBy: 'user-admin',
        createdAt: now,
        updatedAt: now,
      }).run();

      await expect(
        db.update(municipalTaxDues).set({
          status: 'PAID',
          paymentReceiptDocumentId: foreignReceiptDocId,
          paidAt: now,
          paidByUserId: 'user-admin',
        }).where(eq(municipalTaxDues.id, 'mtax-rcpt-mismatch-test')).run()
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // 2. CREATE DUE & TAX TYPE TESTS
  // =========================================================================
  describe('2. Create Due & Supported Tax Types', () => {
    it('2.1 should create valid PROPERTY_TAX due and return authoritative DTO with amountStr and isOverdue', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'Kolkata Municipal Corporation',
          referenceNumber: 'PROP/2026/001',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '25000.50',
          dueDate: '2030-09-30', // Future due date
          notes: 'Annual commercial property assessment',
        }),
      }, env);

      expect(res.status).toBe(201);
      const body = await jsonOf(res);
      expect(body.success).toBe(true);
      expect(body.data.id).toBeDefined();
      expect(body.data.outletId).toBe(OUTLET_1_ID);
      expect(body.data.taxType).toBe('PROPERTY_TAX');
      expect(body.data.authorityName).toBe('Kolkata Municipal Corporation');
      expect(body.data.referenceNumber).toBe('PROP/2026/001');
      expect(body.data.assessmentFrequency).toBe('ANNUAL');
      expect(body.data.amountPaise).toBe(2500050);
      expect(body.data.amountStr).toBe('25000.50');
      expect(body.data.status).toBe('PENDING');
      expect(body.data.isOverdue).toBe(false);
      expect(body.data.notes).toBe('Annual commercial property assessment');
      expect(body.data.assessmentDocumentId).toBeNull();
      expect(body.data.paymentReceiptDocumentId).toBeNull();
    });

    it('2.2 should create valid TRADE_LICENSE_FEE due', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'TRADE_LICENSE_FEE',
          authorityName: 'KMC License Dept',
          referenceNumber: 'TL/2026/999',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '12000.00',
          dueDate: '2030-07-31',
        }),
      }, env);

      expect(res.status).toBe(201);
      const body = await jsonOf(res);
      expect(body.data.taxType).toBe('TRADE_LICENSE_FEE');
      expect(body.data.amountPaise).toBe(1200000);
      expect(body.data.amountStr).toBe('12000.00');
    });

    it('2.3 should create valid SIGNAGE_CHARGE due', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'SIGNAGE_CHARGE',
          authorityName: 'KMC Advertisement Dept',
          referenceNumber: 'SIGN/2026/888',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '8500.00',
          dueDate: '2030-08-15',
        }),
      }, env);

      expect(res.status).toBe(201);
      const body = await jsonOf(res);
      expect(body.data.taxType).toBe('SIGNAGE_CHARGE');
      expect(body.data.amountPaise).toBe(850000);
      expect(body.data.amountStr).toBe('8500.00');
    });

    it('2.4 should create valid LOCAL_AUTHORITY_DUE with QUARTERLY frequency', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'LOCAL_AUTHORITY_DUE',
          authorityName: 'Panchayat Development Authority',
          referenceNumber: 'LAD/Q1/2026',
          assessmentFrequency: 'QUARTERLY',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2026-06-30',
          amount: '4500.00',
          dueDate: '2030-05-31',
        }),
      }, env);

      expect(res.status).toBe(201);
      const body = await jsonOf(res);
      expect(body.data.taxType).toBe('LOCAL_AUTHORITY_DUE');
      expect(body.data.assessmentFrequency).toBe('QUARTERLY');
      expect(body.data.amountPaise).toBe(450000);
    });

    it('2.5 should allow optional valid assessment document ID belonging to outlet', async () => {
      const docId = await createTestDocument(OUTLET_1_ID);
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'PROP/WITH/DOC',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '15000.00',
          dueDate: '2030-09-30',
          assessmentDocumentId: docId,
        }),
      }, env);

      expect(res.status).toBe(201);
      const body = await jsonOf(res);
      expect(body.data.assessmentDocumentId).toBe(docId);
    });
  });

  // =========================================================================
  // 3. CREATE VALIDATION & ATTACK DEFENSE TESTS
  // =========================================================================
  describe('3. Create Validation & Attack Injections', () => {
    it('3.1 should reject missing authorityName', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          referenceNumber: 'REF-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '1000.00',
          dueDate: '2026-06-30',
        }),
      }, env);
      expect(res.status).toBe(400);
      const body = await jsonOf(res);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('3.2 should reject blank authorityName (whitespace only)', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: '   ',
          referenceNumber: 'REF-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '1000.00',
          dueDate: '2026-06-30',
        }),
      }, env);
      expect(res.status).toBe(400);
    });

    it('3.3 should reject blank referenceNumber', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: '   ',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '1000.00',
          dueDate: '2026-06-30',
        }),
      }, env);
      expect(res.status).toBe(400);
    });

    it('3.4 should reject invalid taxType (e.g. ELECTRICITY, NFR_RENT)', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'ELECTRICITY',
          authorityName: 'KMC',
          referenceNumber: 'REF-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '1000.00',
          dueDate: '2026-06-30',
        }),
      }, env);
      expect(res.status).toBe(400);
    });

    it('3.5 should reject invalid assessmentFrequency (e.g. MONTHLY)', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'REF-1',
          assessmentFrequency: 'MONTHLY',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '1000.00',
          dueDate: '2026-06-30',
        }),
      }, env);
      expect(res.status).toBe(400);
    });

    it('3.6 should reject zero amount "0.00"', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'REF-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '0.00',
          dueDate: '2026-06-30',
        }),
      }, env);
      expect(res.status).toBe(400);
    });

    it('3.7 should reject negative amount "-500.00"', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'REF-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '-500.00',
          dueDate: '2026-06-30',
        }),
      }, env);
      expect(res.status).toBe(400);
    });

    it('3.8 should reject amount with more than 2 decimal places "100.555"', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'REF-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '100.555',
          dueDate: '2026-06-30',
        }),
      }, env);
      expect(res.status).toBe(400);
    });

    it('3.9 should reject amount exceeding safe integer financial limit', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'REF-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '1000000000.00', // Exceeds safe boundary
          dueDate: '2026-06-30',
        }),
      }, env);
      expect(res.status).toBe(400);
    });

    it('3.10 should reject impossible dates like 2026-02-31', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'REF-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-02-31', // Impossible date
          assessmentPeriodEnd: '2027-03-31',
          amount: '1000.00',
          dueDate: '2026-06-30',
        }),
      }, env);
      expect(res.status).toBe(400);
    });

    it('3.11 should reject assessmentPeriodEnd earlier than assessmentPeriodStart', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'REF-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2027-04-01',
          assessmentPeriodEnd: '2026-03-31', // End before start
          amount: '1000.00',
          dueDate: '2026-06-30',
        }),
      }, env);
      expect(res.status).toBe(400);
    });

    it('3.12 should reject unknown fields in strict schema', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'REF-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '1000.00',
          dueDate: '2026-06-30',
          injectedField: 'malicious',
        }),
      }, env);
      expect(res.status).toBe(400);
    });

    it('3.13 should reject client injection of server-owned status', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'REF-INJECT-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '1000.00',
          dueDate: '2026-06-30',
          status: 'PAID', // Injected
        }),
      }, env);
      expect(res.status).toBe(400);
    });

    it('3.14 should reject nonexistent assessment document ID (404 MUNICIPAL_TAX_DOCUMENT_NOT_FOUND)', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'REF-DOC-NOEXIST',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '1000.00',
          dueDate: '2026-06-30',
          assessmentDocumentId: 'doc-nonexistent-999',
        }),
      }, env);
      expect(res.status).toBe(404);
      const body = await jsonOf(res);
      expect(body.error.code).toBe('MUNICIPAL_TAX_DOCUMENT_NOT_FOUND');
    });

    it('3.15 should reject assessment document ID belonging to a different outlet (400 MUNICIPAL_TAX_DOCUMENT_OUTLET_MISMATCH)', async () => {
      const foreignDocId = await createTestDocument(OUTLET_2_ID); // Doc belongs to Outlet 2
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'REF-DOC-FOREIGN',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '1000.00',
          dueDate: '2026-06-30',
          assessmentDocumentId: foreignDocId,
        }),
      }, env);
      expect(res.status).toBe(400);
      const body = await jsonOf(res);
      expect(body.error.code).toBe('MUNICIPAL_TAX_DOCUMENT_OUTLET_MISMATCH');
    });
  });

  // =========================================================================
  // 4. DUPLICATE PROTECTION TESTS
  // =========================================================================
  describe('4. Duplicate Statutory Identity Protection', () => {
    it('4.1 should return 409 MUNICIPAL_TAX_DUE_EXISTS when creating identical statutory due', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const payload = {
        taxType: 'PROPERTY_TAX',
        authorityName: 'Kolkata Municipal Corporation',
        referenceNumber: 'DUP-TEST-001',
        assessmentFrequency: 'ANNUAL',
        assessmentPeriodStart: '2026-04-01',
        assessmentPeriodEnd: '2027-03-31',
        amount: '10000.00',
        dueDate: '2030-09-30',
      };

      const res1 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(payload),
      }, env);
      expect(res1.status).toBe(201);

      // Attempt duplicate
      const res2 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(payload),
      }, env);
      expect(res2.status).toBe(409);
      const body2 = await jsonOf(res2);
      expect(body2.error.code).toBe('MUNICIPAL_TAX_DUE_EXISTS');
    });

    it('4.2 should allow same reference number in a different assessment period', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const basePayload = {
        taxType: 'PROPERTY_TAX',
        authorityName: 'KMC',
        referenceNumber: 'PERIOD-DIFF-001',
        assessmentFrequency: 'ANNUAL',
        amount: '10000.00',
      };

      const res1 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          ...basePayload,
          assessmentPeriodStart: '2025-04-01',
          assessmentPeriodEnd: '2026-03-31',
          dueDate: '2025-09-30',
        }),
      }, env);
      expect(res1.status).toBe(201);

      const res2 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          ...basePayload,
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          dueDate: '2030-09-30',
        }),
      }, env);
      expect(res2.status).toBe(201);
    });

    it('4.3 should allow same reference number in a different outlet', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const payload = {
        taxType: 'PROPERTY_TAX',
        authorityName: 'KMC',
        referenceNumber: 'OUTLET-DIFF-001',
        assessmentFrequency: 'ANNUAL',
        assessmentPeriodStart: '2026-04-01',
        assessmentPeriodEnd: '2027-03-31',
        amount: '10000.00',
        dueDate: '2030-09-30',
      };

      const res1 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(payload),
      }, env);
      expect(res1.status).toBe(201);

      const res2 = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(payload),
      }, env);
      expect(res2.status).toBe(201);
    });
  });

  // =========================================================================
  // 5. LIST & FILTER TESTS
  // =========================================================================
  describe('5. List Dues & Filter Capabilities', () => {
    let due1Id: string;
    let due2Id: string;
    let due3Id: string;

    beforeEach(async () => {
      const cookie = await loginAs('admin@iocl.in');
      // Due 1: Property Tax, Annual, Due 2030-06-30
      const r1 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'LST-PROP-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '10000.00',
          dueDate: '2030-06-30',
        }),
      }, env);
      due1Id = (await jsonOf(r1)).data.id;

      // Due 2: Trade License, Annual, Due 2030-07-31
      const r2 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'TRADE_LICENSE_FEE',
          authorityName: 'KMC',
          referenceNumber: 'LST-TL-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '5000.00',
          dueDate: '2030-07-31',
        }),
      }, env);
      due2Id = (await jsonOf(r2)).data.id;

      // Due 3: Local Authority, Quarterly, Due 2030-08-31
      const r3 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'LOCAL_AUTHORITY_DUE',
          authorityName: 'Panchayat',
          referenceNumber: 'LST-LAD-1',
          assessmentFrequency: 'QUARTERLY',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2026-06-30',
          amount: '3000.00',
          dueDate: '2030-08-31',
        }),
      }, env);
      due3Id = (await jsonOf(r3)).data.id;
    });

    it('5.1 should list all dues for the outlet', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'GET',
        headers: { Cookie: cookie },
      }, env);
      expect(res.status).toBe(200);
      const body = await jsonOf(res);
      expect(body.data.length).toBe(3);
    });

    it('5.2 should filter by taxType', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes?taxType=PROPERTY_TAX`, {
        method: 'GET',
        headers: { Cookie: cookie },
      }, env);
      expect(res.status).toBe(200);
      const body = await jsonOf(res);
      expect(body.data.length).toBe(1);
      expect(body.data[0].id).toBe(due1Id);
    });

    it('5.3 should filter by assessmentFrequency', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes?assessmentFrequency=QUARTERLY`, {
        method: 'GET',
        headers: { Cookie: cookie },
      }, env);
      expect(res.status).toBe(200);
      const body = await jsonOf(res);
      expect(body.data.length).toBe(1);
      expect(body.data[0].id).toBe(due3Id);
    });

    it('5.4 should filter by status (PENDING)', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes?status=PENDING`, {
        method: 'GET',
        headers: { Cookie: cookie },
      }, env);
      expect(res.status).toBe(200);
      const body = await jsonOf(res);
      expect(body.data.length).toBe(3);
    });

    it('5.5 should filter by dueDate range (fromDate & toDate)', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes?fromDate=2030-07-01&toDate=2030-07-31`, {
        method: 'GET',
        headers: { Cookie: cookie },
      }, env);
      expect(res.status).toBe(200);
      const body = await jsonOf(res);
      expect(body.data.length).toBe(1);
      expect(body.data[0].id).toBe(due2Id);
    });

    it('5.6 should reject invalid filter date range fromDate > toDate', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes?fromDate=2030-08-01&toDate=2030-07-01`, {
        method: 'GET',
        headers: { Cookie: cookie },
      }, env);
      expect(res.status).toBe(400);
    });

    it('5.7 should reject invalid filter date string like 2026-13-01', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes?fromDate=2026-13-01`, {
        method: 'GET',
        headers: { Cookie: cookie },
      }, env);
      expect(res.status).toBe(400);
    });

    it('5.8 should isolate outlet records and exclude other outlet dues', async () => {
      const cookie = await loginAs('admin@iocl.in');
      // Create due for Outlet 2
      await app.request(`/api/v1/outlets/${OUTLET_2_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'Salt Lake Muni',
          referenceNumber: 'SL-PROP-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '7500.00',
          dueDate: '2030-06-30',
        }),
      }, env);

      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'GET',
        headers: { Cookie: cookie },
      }, env);
      const body = await jsonOf(res);
      expect(body.data.length).toBe(3); // Outlet 1 still only has 3
      expect(body.data.every((d: any) => d.outletId === OUTLET_1_ID)).toBe(true);
    });
  });

  // =========================================================================
  // 6. DETAIL & UPDATE PENDING DUE TESTS
  // =========================================================================
  describe('6. Detail & Update Pending Dues', () => {
    let dueId: string;

    beforeEach(async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC Original',
          referenceNumber: 'UPD-REF-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '10000.00',
          dueDate: '2030-06-30',
          notes: 'Original note',
        }),
      }, env);
      dueId = (await jsonOf(res)).data.id;
    });

    it('6.1 should get due detail by ID', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/municipal-taxes/${dueId}`, {
        method: 'GET',
        headers: { Cookie: cookie },
      }, env);
      expect(res.status).toBe(200);
      const body = await jsonOf(res);
      expect(body.data.id).toBe(dueId);
      expect(body.data.authorityName).toBe('KMC Original');
      expect(body.data.amountStr).toBe('10000.00');
    });

    it('6.2 should return 404 for nonexistent due detail', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/municipal-taxes/mtax-nonexistent-123`, {
        method: 'GET',
        headers: { Cookie: cookie },
      }, env);
      expect(res.status).toBe(404);
      const body = await jsonOf(res);
      expect(body.error.code).toBe('MUNICIPAL_TAX_DUE_NOT_FOUND');
    });

    it('6.3 should update pending due fields (authority, amount, notes, dates)', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/municipal-taxes/${dueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          authorityName: 'KMC Assessment Unit',
          amount: '12500.00',
          dueDate: '2030-07-15',
          notes: 'Updated note after reassessment',
        }),
      }, env);

      expect(res.status).toBe(200);
      const body = await jsonOf(res);
      expect(body.data.authorityName).toBe('KMC Assessment Unit');
      expect(body.data.amountPaise).toBe(1250000);
      expect(body.data.amountStr).toBe('12500.00');
      expect(body.data.dueDate).toBe('2030-07-15');
      expect(body.data.notes).toBe('Updated note after reassessment');
    });

    it('6.4 should update pending due assessment document ID with valid same-outlet document', async () => {
      const docId = await createTestDocument(OUTLET_1_ID);
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/municipal-taxes/${dueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          assessmentDocumentId: docId,
        }),
      }, env);

      expect(res.status).toBe(200);
      const body = await jsonOf(res);
      expect(body.data.assessmentDocumentId).toBe(docId);
    });

    it('6.5 should reject update with foreign outlet assessment document (400 MUNICIPAL_TAX_DOCUMENT_OUTLET_MISMATCH)', async () => {
      const foreignDocId = await createTestDocument(OUTLET_2_ID);
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/municipal-taxes/${dueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          assessmentDocumentId: foreignDocId,
        }),
      }, env);

      expect(res.status).toBe(400);
      const body = await jsonOf(res);
      expect(body.error.code).toBe('MUNICIPAL_TAX_DOCUMENT_OUTLET_MISMATCH');
    });

    it('6.6 should reject update when new identity conflicts with an existing due (409 MUNICIPAL_TAX_DUE_EXISTS)', async () => {
      const cookie = await loginAs('admin@iocl.in');
      // Create a second due
      await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC Target',
          referenceNumber: 'UPD-REF-TARGET',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '5000.00',
          dueDate: '2030-06-30',
        }),
      }, env);

      // Attempt to update dueId to conflict with Target
      const res = await app.request(`/api/v1/municipal-taxes/${dueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          authorityName: 'KMC Target',
          referenceNumber: 'UPD-REF-TARGET',
        }),
      }, env);

      expect(res.status).toBe(409);
      const body = await jsonOf(res);
      expect(body.error.code).toBe('MUNICIPAL_TAX_DUE_EXISTS');
    });

    it('6.7 should reject update containing immutable/client-prohibited fields (e.g. status, outletId)', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/municipal-taxes/${dueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          status: 'PAID',
        }),
      }, env);

      expect(res.status).toBe(400);
      const body = await jsonOf(res);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // 7. MARK PAID & LIFECYCLE TESTS
  // =========================================================================
  describe('7. Payment Lifecycle & Immutability', () => {
    let dueId: string;
    let receiptDocId: string;

    beforeEach(async () => {
      receiptDocId = await createTestDocument(OUTLET_1_ID);
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'PAY-TEST-001',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '20000.00',
          dueDate: '2030-06-30',
        }),
      }, env);
      dueId = (await jsonOf(res)).data.id;
    });

    it('7.1 should mark pending due as PAID with receipt and payment reference', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/municipal-taxes/${dueId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          paymentReceiptDocumentId: receiptDocId,
          paymentReference: 'CHALLAN-2026-ABC',
          paidAt: '2026-06-25T10:00:00.000Z',
        }),
      }, env);

      expect(res.status).toBe(200);
      const body = await jsonOf(res);
      expect(body.data.status).toBe('PAID');
      expect(body.data.paymentReceiptDocumentId).toBe(receiptDocId);
      expect(body.data.paymentReference).toBe('CHALLAN-2026-ABC');
      expect(body.data.paidAt).toBe('2026-06-25T10:00:00.000Z');
      expect(body.data.paidByUserId).toBe('user-admin');
      expect(body.data.isOverdue).toBe(false);
    });

    it('7.2 should default paidAt to current server timestamp when omitted', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/municipal-taxes/${dueId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          paymentReceiptDocumentId: receiptDocId,
        }),
      }, env);

      expect(res.status).toBe(200);
      const body = await jsonOf(res);
      expect(body.data.status).toBe('PAID');
      expect(body.data.paidAt).toBeDefined();
      expect(typeof body.data.paidAt).toBe('string');
    });

    it('7.3 should reject mark-paid with nonexistent receipt document (404 MUNICIPAL_TAX_RECEIPT_NOT_FOUND)', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/municipal-taxes/${dueId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          paymentReceiptDocumentId: 'doc-does-not-exist',
        }),
      }, env);

      expect(res.status).toBe(404);
      const body = await jsonOf(res);
      expect(body.error.code).toBe('MUNICIPAL_TAX_RECEIPT_NOT_FOUND');
    });

    it('7.4 should reject mark-paid with foreign outlet receipt document (400 MUNICIPAL_TAX_RECEIPT_OUTLET_MISMATCH)', async () => {
      const foreignReceiptDocId = await createTestDocument(OUTLET_2_ID);
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/municipal-taxes/${dueId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          paymentReceiptDocumentId: foreignReceiptDocId,
        }),
      }, env);

      expect(res.status).toBe(400);
      const body = await jsonOf(res);
      expect(body.error.code).toBe('MUNICIPAL_TAX_RECEIPT_OUTLET_MISMATCH');
    });

    it('7.5 should return 409 MUNICIPAL_TAX_ALREADY_PAID when attempting to mark an already paid due as paid again', async () => {
      const cookie = await loginAs('admin@iocl.in');
      // Mark paid first time
      await app.request(`/api/v1/municipal-taxes/${dueId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          paymentReceiptDocumentId: receiptDocId,
        }),
      }, env);

      // Attempt second payment
      const res = await app.request(`/api/v1/municipal-taxes/${dueId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          paymentReceiptDocumentId: receiptDocId,
        }),
      }, env);

      expect(res.status).toBe(409);
      const body = await jsonOf(res);
      expect(body.error.code).toBe('MUNICIPAL_TAX_ALREADY_PAID');
    });

    it('7.6 should return 409 MUNICIPAL_TAX_PAID_IMMUTABLE when attempting to PUT update an already paid due', async () => {
      const cookie = await loginAs('admin@iocl.in');
      // Mark paid
      await app.request(`/api/v1/municipal-taxes/${dueId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          paymentReceiptDocumentId: receiptDocId,
        }),
      }, env);

      // Attempt PUT update
      const res = await app.request(`/api/v1/municipal-taxes/${dueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          notes: 'Trying to update a paid due',
        }),
      }, env);

      expect(res.status).toBe(409);
      const body = await jsonOf(res);
      expect(body.error.code).toBe('MUNICIPAL_TAX_PAID_IMMUTABLE');
    });

    it('7.7 should return 404 for mark-paid on nonexistent due ID', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/municipal-taxes/mtax-noexist-999/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          paymentReceiptDocumentId: receiptDocId,
        }),
      }, env);

      expect(res.status).toBe(404);
      const body = await jsonOf(res);
      expect(body.error.code).toBe('MUNICIPAL_TAX_DUE_NOT_FOUND');
    });
  });

  // =========================================================================
  // 8. OVERDUE DERIVATION TESTS
  // =========================================================================
  describe('8. Overdue Derivation', () => {
    it('8.1 should derive isOverdue = true for PENDING due with past due date', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'OVD-PAST',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2025-04-01',
          assessmentPeriodEnd: '2026-03-31',
          amount: '10000.00',
          dueDate: '2025-06-30', // In the past
        }),
      }, env);

      expect(res.status).toBe(201);
      const body = await jsonOf(res);
      expect(body.data.isOverdue).toBe(true);
      expect(body.data.status).toBe('PENDING');
    });

    it('8.2 should derive isOverdue = false for PENDING due with future due date', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'OVD-FUT',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '10000.00',
          dueDate: '2030-12-31', // Far in future
        }),
      }, env);

      expect(res.status).toBe(201);
      const body = await jsonOf(res);
      expect(body.data.isOverdue).toBe(false);
    });

    it('8.3 should derive isOverdue = false for PAID due even if due date is in the past', async () => {
      const receiptDocId = await createTestDocument(OUTLET_1_ID);
      const cookie = await loginAs('admin@iocl.in');
      const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'OVD-PAID-PAST',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2025-04-01',
          assessmentPeriodEnd: '2026-03-31',
          amount: '10000.00',
          dueDate: '2025-06-30',
        }),
      }, env);
      const dueId = (await jsonOf(createRes)).data.id;

      // Mark paid
      const payRes = await app.request(`/api/v1/municipal-taxes/${dueId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          paymentReceiptDocumentId: receiptDocId,
        }),
      }, env);

      expect(payRes.status).toBe(200);
      const body = await jsonOf(payRes);
      expect(body.data.status).toBe('PAID');
      expect(body.data.isOverdue).toBe(false);
    });
  });

  // =========================================================================
  // 9. SUMMARY & CHECKED ARITHMETIC TESTS
  // =========================================================================
  describe('9. Summary & Checked Arithmetic', () => {
    it('9.1 should return correct counts, paise amounts, money strings, and earliest nextDueDate', async () => {
      const receiptDocId = await createTestDocument(OUTLET_1_ID);
      const cookie = await loginAs('admin@iocl.in');

      // 1. Pending future due (Due: 2030-11-30, Amount: 10,000.00 = 1,000,000 paise)
      await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'SUM-FUT-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '10000.00',
          dueDate: '2030-11-30',
        }),
      }, env);

      // 2. Pending overdue due (Due: 2025-05-31, Amount: 5,000.00 = 500,000 paise)
      await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'TRADE_LICENSE_FEE',
          authorityName: 'KMC',
          referenceNumber: 'SUM-OVD-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2025-04-01',
          assessmentPeriodEnd: '2026-03-31',
          amount: '5000.00',
          dueDate: '2025-05-31',
        }),
      }, env);

      // 3. Paid due (Due: 2026-06-30, Amount: 3,500.00 = 350,000 paise)
      const r3 = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'SIGNAGE_CHARGE',
          authorityName: 'KMC',
          referenceNumber: 'SUM-PAID-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '3500.00',
          dueDate: '2026-06-30',
        }),
      }, env);
      const paidDueId = (await jsonOf(r3)).data.id;
      await app.request(`/api/v1/municipal-taxes/${paidDueId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ paymentReceiptDocumentId: receiptDocId }),
      }, env);

      // Fetch summary
      const sumRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-tax-summary`, {
        method: 'GET',
        headers: { Cookie: cookie },
      }, env);

      expect(sumRes.status).toBe(200);
      const sumBody = await jsonOf(sumRes);
      expect(sumBody.data.totalCount).toBe(3);
      expect(sumBody.data.pendingCount).toBe(2);
      expect(sumBody.data.overdueCount).toBe(1);
      expect(sumBody.data.paidCount).toBe(1);

      expect(sumBody.data.pendingAmountPaise).toBe(1500000);
      expect(sumBody.data.pendingAmountStr).toBe('15000.00');

      expect(sumBody.data.overdueAmountPaise).toBe(500000);
      expect(sumBody.data.overdueAmountStr).toBe('5000.00');

      expect(sumBody.data.paidAmountPaise).toBe(350000);
      expect(sumBody.data.paidAmountStr).toBe('3500.00');

      // nextDueDate should be earliest pending due date = '2025-05-31'
      expect(sumBody.data.nextDueDate).toBe('2025-05-31');
    });

    it('9.2 should return nextDueDate null when no pending dues exist', async () => {
      const receiptDocId = await createTestDocument(OUTLET_1_ID);
      const cookie = await loginAs('admin@iocl.in');

      const r = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'SUM-ALL-PAID-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '1000.00',
          dueDate: '2030-06-30',
        }),
      }, env);
      const dueId = (await jsonOf(r)).data.id;
      await app.request(`/api/v1/municipal-taxes/${dueId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ paymentReceiptDocumentId: receiptDocId }),
      }, env);

      const sumRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-tax-summary`, {
        method: 'GET',
        headers: { Cookie: cookie },
      }, env);

      expect(sumRes.status).toBe(200);
      const sumBody = await jsonOf(sumRes);
      expect(sumBody.data.pendingCount).toBe(0);
      expect(sumBody.data.nextDueDate).toBeNull();
    });

    it('9.3 should return 400 MUNICIPAL_TAX_SUMMARY_OVERFLOW when aggregate financial sum exceeds safe ceiling', async () => {
      const db = getDb(localD1);
      const now = new Date().toISOString();

      // Direct insert 2 rows whose sum exceeds MAX_SAFE_PAISE in checkedUtilityMoneyAdd
      await db.insert(municipalTaxDues).values([
        {
          id: 'mtax-ovf-1',
          outletId: OUTLET_1_ID,
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'OVF-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amountPaise: 9_000_000_000_000_000 - 100,
          dueDate: '2026-06-30',
          status: 'PENDING',
          createdBy: 'user-admin',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'mtax-ovf-2',
          outletId: OUTLET_1_ID,
          taxType: 'TRADE_LICENSE_FEE',
          authorityName: 'KMC',
          referenceNumber: 'OVF-2',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amountPaise: 500000,
          dueDate: '2026-06-30',
          status: 'PENDING',
          createdBy: 'user-admin',
          createdAt: now,
          updatedAt: now,
        },
      ]).run();

      const cookie = await loginAs('admin@iocl.in');
      const sumRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-tax-summary`, {
        method: 'GET',
        headers: { Cookie: cookie },
      }, env);

      expect(sumRes.status).toBe(400);
      const sumBody = await jsonOf(sumRes);
      expect(sumBody.error.code).toBe('MUNICIPAL_TAX_SUMMARY_OVERFLOW');
    });
  });

  // =========================================================================
  // 10. AUDIT TRAIL LOGGING TESTS
  // =========================================================================
  describe('10. Audit Trail Verification', () => {
    it('10.1 should record audit trail entry for MUNICIPAL_TAX_CREATE', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'AUD-CRE-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '10000.00',
          dueDate: '2030-06-30',
        }),
      }, env);
      const dueId = (await jsonOf(res)).data.id;

      const db = getDb(localD1);
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, dueId)).all();
      expect(logs.length).toBeGreaterThanOrEqual(1);
      const createLog = logs.find(l => l.action === 'MUNICIPAL_TAX_CREATE');
      expect(createLog).toBeDefined();
      expect(createLog!.entityType).toBe('MUNICIPAL_TAX_DUE');
      expect(createLog!.userId).toBe('user-admin');
      expect(createLog!.newValueJson).toBeDefined();
    });

    it('10.2 should record audit trail entry for MUNICIPAL_TAX_UPDATE with oldValue and newValue', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC Before',
          referenceNumber: 'AUD-UPD-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '10000.00',
          dueDate: '2030-06-30',
        }),
      }, env);
      const dueId = (await jsonOf(res)).data.id;

      // Update
      await app.request(`/api/v1/municipal-taxes/${dueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          authorityName: 'KMC After',
          amount: '15000.00',
        }),
      }, env);

      const db = getDb(localD1);
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, dueId)).all();
      const updLog = logs.find(l => l.action === 'MUNICIPAL_TAX_UPDATE');
      expect(updLog).toBeDefined();
      expect(updLog!.oldValueJson).toContain('KMC Before');
      expect(updLog!.newValueJson).toContain('KMC After');
    });

    it('10.3 should record audit trail entry for MUNICIPAL_TAX_MARK_PAID', async () => {
      const receiptDocId = await createTestDocument(OUTLET_1_ID);
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'AUD-PAY-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '10000.00',
          dueDate: '2030-06-30',
        }),
      }, env);
      const dueId = (await jsonOf(res)).data.id;

      // Mark paid
      await app.request(`/api/v1/municipal-taxes/${dueId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ paymentReceiptDocumentId: receiptDocId, paymentReference: 'PAY-AUDIT-REF' }),
      }, env);

      const db = getDb(localD1);
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, dueId)).all();
      const payLog = logs.find(l => l.action === 'MUNICIPAL_TAX_MARK_PAID');
      expect(payLog).toBeDefined();
      expect(payLog!.newValueJson).toContain('PAID');
      expect(payLog!.newValueJson).toContain('PAY-AUDIT-REF');
    });
  });

  // =========================================================================
  // 11. RBAC PERMISSION MATRIX TESTS
  // =========================================================================
  describe('11. RBAC Matrix & Role Permissions', () => {
    let dueId: string;
    let receiptDocId: string;

    beforeEach(async () => {
      receiptDocId = await createTestDocument(OUTLET_1_ID);
      const adminCookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'RBAC-TEST-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '10000.00',
          dueDate: '2030-06-30',
        }),
      }, env);
      dueId = (await jsonOf(res)).data.id;
    });

    it('11.1 STATE_OFFICE can read (200), cannot create master due (403), cannot mark paid (403)', async () => {
      const cookie = await loginAs('wbso@iocl.in');

      // Read -> 200
      const readRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'GET',
        headers: { Cookie: cookie },
      }, env);
      expect(readRes.status).toBe(200);

      // Create -> 403
      const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'SO-TRY-CRE',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '1000.00',
          dueDate: '2030-06-30',
        }),
      }, env);
      expect(createRes.status).toBe(403);

      // Mark paid -> 403
      const payRes = await app.request(`/api/v1/municipal-taxes/${dueId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ paymentReceiptDocumentId: receiptDocId }),
      }, env);
      expect(payRes.status).toBe(403);
    });

    it('11.2 DIVISIONAL_OFFICE can read (200), cannot create master due (403), cannot mark paid (403)', async () => {
      const cookie = await loginAs('kolkatado@iocl.in');

      // Read -> 200
      const readRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'GET',
        headers: { Cookie: cookie },
      }, env);
      expect(readRes.status).toBe(200);

      // Create -> 403
      const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'DO-TRY-CRE',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '1000.00',
          dueDate: '2030-06-30',
        }),
      }, env);
      expect(createRes.status).toBe(403);

      // Mark paid -> 403
      const payRes = await app.request(`/api/v1/municipal-taxes/${dueId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ paymentReceiptDocumentId: receiptDocId }),
      }, env);
      expect(payRes.status).toBe(403);
    });

    it('11.3 FIELD_OFFICER can read (200), create (201), update (200), and mark paid (200)', async () => {
      const cookie = await loginAs('fo.central@iocl.in');

      // Read -> 200
      const readRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'GET',
        headers: { Cookie: cookie },
      }, env);
      expect(readRes.status).toBe(200);

      // Create -> 201
      const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC FO',
          referenceNumber: 'FO-CRE-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '1000.00',
          dueDate: '2030-06-30',
        }),
      }, env);
      expect(createRes.status).toBe(201);
      const foDueId = (await jsonOf(createRes)).data.id;

      // Update -> 200
      const updRes = await app.request(`/api/v1/municipal-taxes/${foDueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ notes: 'FO updated note' }),
      }, env);
      expect(updRes.status).toBe(200);

      // Mark paid -> 200
      const payRes = await app.request(`/api/v1/municipal-taxes/${foDueId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ paymentReceiptDocumentId: receiptDocId }),
      }, env);
      expect(payRes.status).toBe(200);
    });

    it('11.4 DEALER can read (200), mark paid (200), but CANNOT create master due (403) or update master due (403)', async () => {
      const cookie = await loginAs('dealer.parkstreet@iocl.in');

      // Read -> 200
      const readRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'GET',
        headers: { Cookie: cookie },
      }, env);
      expect(readRes.status).toBe(200);

      // Create -> 403 (Dealer does not have municipal_taxes.write)
      const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'DEALER-TRY-CRE',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '1000.00',
          dueDate: '2030-06-30',
        }),
      }, env);
      expect(createRes.status).toBe(403);

      // Update -> 403 (Dealer does not have municipal_taxes.write)
      const updRes = await app.request(`/api/v1/municipal-taxes/${dueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ notes: 'Dealer trying to update' }),
      }, env);
      expect(updRes.status).toBe(403);

      // Mark paid -> 200 (Dealer has municipal_taxes.payments.write)
      const payRes = await app.request(`/api/v1/municipal-taxes/${dueId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ paymentReceiptDocumentId: receiptDocId, paymentReference: 'DEALER-CHALLAN-1' }),
      }, env);
      expect(payRes.status).toBe(200);
    });

    it('11.5 CSP can read (200) and mark paid (200), but CANNOT create master due (403) or update master due (403)', async () => {
      const cookie = await loginAs('csp.parkstreet@iocl.in');

      // Read -> 200
      const readRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'GET',
        headers: { Cookie: cookie },
      }, env);
      expect(readRes.status).toBe(200);

      // Create -> 403
      const createRes = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'CSP-TRY-CRE',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '1000.00',
          dueDate: '2030-06-30',
        }),
      }, env);
      expect(createRes.status).toBe(403);

      // Mark paid -> 200
      const payRes = await app.request(`/api/v1/municipal-taxes/${dueId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ paymentReceiptDocumentId: receiptDocId, paymentReference: 'CSP-CHALLAN-1' }),
      }, env);
      expect(payRes.status).toBe(200);
    });
  });

  // =========================================================================
  // 12. OUTLET SCOPE & CROSS-OUTLET SECURITY TESTS
  // =========================================================================
  describe('12. Outlet Scope Security & Cross-Outlet Isolation', () => {
    let outlet2DueId: string;
    let outlet2ReceiptDocId: string;

    beforeEach(async () => {
      outlet2ReceiptDocId = await createTestDocument(OUTLET_2_ID);
      const adminCookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'Salt Lake Muni',
          referenceNumber: 'OUTLET2-SCOPE-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '10000.00',
          dueDate: '2030-06-30',
        }),
      }, env);
      outlet2DueId = (await jsonOf(res)).data.id;
    });

    it('12.1 Dealer of Outlet 1 cannot list dues of Outlet 2 (403)', async () => {
      const cookie = await loginAs('dealer.parkstreet@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/municipal-taxes`, {
        method: 'GET',
        headers: { Cookie: cookie },
      }, env);
      expect(res.status).toBe(403);
    });

    it('12.2 Dealer of Outlet 1 cannot GET detail of Outlet 2 due (403)', async () => {
      const cookie = await loginAs('dealer.parkstreet@iocl.in');
      const res = await app.request(`/api/v1/municipal-taxes/${outlet2DueId}`, {
        method: 'GET',
        headers: { Cookie: cookie },
      }, env);
      expect(res.status).toBe(403);
    });

    it('12.3 Dealer of Outlet 1 cannot mark paid Outlet 2 due (403)', async () => {
      const cookie = await loginAs('dealer.parkstreet@iocl.in');
      const res = await app.request(`/api/v1/municipal-taxes/${outlet2DueId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ paymentReceiptDocumentId: outlet2ReceiptDocId }),
      }, env);
      expect(res.status).toBe(403);
    });

    it('12.4 Dealer of Outlet 1 cannot get summary of Outlet 2 (403)', async () => {
      const cookie = await loginAs('dealer.parkstreet@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/municipal-tax-summary`, {
        method: 'GET',
        headers: { Cookie: cookie },
      }, env);
      expect(res.status).toBe(403);
    });

    it('12.5 CSP of Outlet 1 cannot list dues of Outlet 2 (403)', async () => {
      const cookie = await loginAs('csp.parkstreet@iocl.in');
      const res = await app.request(`/api/v1/outlets/${OUTLET_2_ID}/municipal-taxes`, {
        method: 'GET',
        headers: { Cookie: cookie },
      }, env);
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 13. ABSENCE OF DELETE ROUTE
  // =========================================================================
  describe('13. No DELETE API Route', () => {
    it('13.1 should return 404 for DELETE /api/v1/municipal-taxes/:id', async () => {
      const cookie = await loginAs('admin@iocl.in');
      const res = await app.request(`/api/v1/municipal-taxes/mtax-123`, {
        method: 'DELETE',
        headers: { Cookie: cookie },
      }, env);
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // 14. CONCURRENCY & CONDITIONAL WRITE TESTS
  // =========================================================================
  describe('14. Concurrency & Race Condition Guards', () => {
    it('14.1 updatePending conditional write returns 409 MUNICIPAL_TAX_STATE_CHANGED when row status changed concurrently', async () => {
      const receiptDocId = await createTestDocument(OUTLET_1_ID);
      const cookie = await loginAs('admin@iocl.in');

      // Create due
      const res = await app.request(`/api/v1/outlets/${OUTLET_1_ID}/municipal-taxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'CONC-TEST-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amount: '10000.00',
          dueDate: '2030-06-30',
        }),
      }, env);
      const dueId = (await jsonOf(res)).data.id;

      // Direct SQL mutate status to PAID behind the service's back to simulate race condition
      const db = getDb(localD1);
      await db.update(municipalTaxDues).set({
        status: 'PAID',
        paymentReceiptDocumentId: receiptDocId,
        paidAt: new Date().toISOString(),
        paidByUserId: 'user-admin',
      }).where(eq(municipalTaxDues.id, dueId)).run();

      // Now service attempts updatePending on dueId -> should return 409
      const updRes = await app.request(`/api/v1/municipal-taxes/${dueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ notes: 'Concurrent update attempt' }),
      }, env);

      expect(updRes.status).toBe(409);
    });
  });

  // =========================================================================
  // 15. DIRECT SQL CONSTRAINT VERIFICATION
  // =========================================================================
  describe('15. Direct SQL Check Constraints', () => {
    it('15.1 rejects invalid tax_type CHECK directly in SQL', async () => {
      const db = getDb(localD1);
      const now = new Date().toISOString();
      await expect(
        db.insert(municipalTaxDues).values({
          id: 'mtax-bad-type',
          outletId: OUTLET_1_ID,
          taxType: 'INVALID_TAX' as any,
          authorityName: 'KMC',
          referenceNumber: 'BAD-1',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amountPaise: 100000,
          dueDate: '2026-06-30',
          status: 'PENDING',
          createdBy: 'user-admin',
          createdAt: now,
          updatedAt: now,
        }).run()
      ).rejects.toThrow();
    });

    it('15.2 rejects invalid assessment_frequency CHECK directly in SQL', async () => {
      const db = getDb(localD1);
      const now = new Date().toISOString();
      await expect(
        db.insert(municipalTaxDues).values({
          id: 'mtax-bad-freq',
          outletId: OUTLET_1_ID,
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'BAD-2',
          assessmentFrequency: 'WEEKLY' as any,
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amountPaise: 100000,
          dueDate: '2026-06-30',
          status: 'PENDING',
          createdBy: 'user-admin',
          createdAt: now,
          updatedAt: now,
        }).run()
      ).rejects.toThrow();
    });

    it('15.3 rejects invalid status CHECK directly in SQL', async () => {
      const db = getDb(localD1);
      const now = new Date().toISOString();
      await expect(
        db.insert(municipalTaxDues).values({
          id: 'mtax-bad-stat',
          outletId: OUTLET_1_ID,
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'BAD-3',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amountPaise: 100000,
          dueDate: '2026-06-30',
          status: 'OVERDUE' as any,
          createdBy: 'user-admin',
          createdAt: now,
          updatedAt: now,
        }).run()
      ).rejects.toThrow();
    });

    it('15.4 rejects negative amount_paise directly in SQL', async () => {
      const db = getDb(localD1);
      const now = new Date().toISOString();
      await expect(
        db.insert(municipalTaxDues).values({
          id: 'mtax-neg-amt',
          outletId: OUTLET_1_ID,
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'BAD-4',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amountPaise: -5000,
          dueDate: '2026-06-30',
          status: 'PENDING',
          createdBy: 'user-admin',
          createdAt: now,
          updatedAt: now,
        }).run()
      ).rejects.toThrow();
    });

    it('15.5 rejects assessment_period_end < assessment_period_start directly in SQL', async () => {
      const db = getDb(localD1);
      const now = new Date().toISOString();
      await expect(
        db.insert(municipalTaxDues).values({
          id: 'mtax-bad-range',
          outletId: OUTLET_1_ID,
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'BAD-5',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2027-04-01',
          assessmentPeriodEnd: '2026-03-31',
          amountPaise: 100000,
          dueDate: '2026-06-30',
          status: 'PENDING',
          createdBy: 'user-admin',
          createdAt: now,
          updatedAt: now,
        }).run()
      ).rejects.toThrow();
    });

    it('15.6 rejects status = PAID without payment_receipt_document_id directly in SQL', async () => {
      const db = getDb(localD1);
      const now = new Date().toISOString();
      await expect(
        db.insert(municipalTaxDues).values({
          id: 'mtax-paid-no-rcpt',
          outletId: OUTLET_1_ID,
          taxType: 'PROPERTY_TAX',
          authorityName: 'KMC',
          referenceNumber: 'BAD-6',
          assessmentFrequency: 'ANNUAL',
          assessmentPeriodStart: '2026-04-01',
          assessmentPeriodEnd: '2027-03-31',
          amountPaise: 100000,
          dueDate: '2026-06-30',
          status: 'PAID',
          paymentReceiptDocumentId: null, // Prohibited for PAID
          paidAt: now,
          paidByUserId: 'user-admin',
          createdBy: 'user-admin',
          createdAt: now,
          updatedAt: now,
        }).run()
      ).rejects.toThrow();
    });
  });
});

