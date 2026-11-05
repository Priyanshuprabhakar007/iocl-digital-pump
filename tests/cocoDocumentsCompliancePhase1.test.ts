import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import {
  auditLogs,
  documents,
  municipalTaxDues,
  nfrLeases,
  nfrRentDues,
  nfrSpaces,
  nfrVendors,
  operationalShifts,
  retailOutlets,
  tankCalibrationCharts,
  tanks,
  utilityElectricityAccounts,
  utilityElectricityBills,
} from '../src/db/schema';
import {
  STANDARD_COCO_CATEGORIES,
  evaluateComplianceStatus,
  computeDaysBetweenDates,
} from '../src/shared/cocoComplianceUtils';

class MockR2Bucket {
  private store = new Map<string, { data: Uint8Array; metadata: Record<string, any> }>();

  async get(key: string) {
    const item = this.store.get(key);
    if (!item) return null;
    return {
      body: item.data,
      arrayBuffer: async () => item.data.slice().buffer,
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

describe('Phase 1: COCO Documents & Compliance Management Module Suite', () => {
  let localD1: any;
  let env: any;
  let testDbPath: string;

  const OUTLET_1_ID = 'ro-1001'; // Scoped to Dealer 1 / FO 1
  const OUTLET_2_ID = 'ro-1002'; // Different outlet in Kolkata North SA
  const OUTLET_3_ID = 'ro-1003'; // Different division (Ludhiana)

  beforeEach(async () => {
    testDbPath = `./.sqlite/test_coco_comp_${Math.random().toString(36).substring(2)}_${Date.now()}.db`;
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch {}
    }

    localD1 = createLocalD1Database(testDbPath);
    await seedDatabase(getDb(localD1));

    env = {
      DB: localD1,
      DOCUMENTS_BUCKET: new MockR2Bucket(),
      ENVIRONMENT: 'test',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    };
  }, 15000);

  afterEach(() => {
    try {
      localD1.close();
    } catch {}
    for (const suffix of ['', '-wal', '-shm']) {
      const p = `${testDbPath}${suffix}`;
      if (testDbPath && fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch {}
      }
    }
  });

  async function loginAs(email: string, password = 'Password@123'): Promise<string> {
    const res = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ email, password }),
      },
      env
    );
    const cookie = res.headers.get('set-cookie');
    return cookie ? cookie.split(';')[0] : '';
  }

  function makeValidPdfBytes(contentNote = 'COCO Compliance Attachment'): Uint8Array {
    const text = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\n%% ${contentNote}\n%%EOF`;
    return new TextEncoder().encode(text);
  }

  function makeValidPngBytes(): Uint8Array {
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  }

  function makeValidJpgBytes(): Uint8Array {
    return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
  }

  it('1. preconfigures all 14 standard categories in exact order and supports custom categories without modifying predefined ones', async () => {
    const adminCookie = await loginAs('admin@iocl.in');

    // Verify categories endpoint
    const catRes = await app.request(
      '/api/v1/documents/compliance/categories',
      { headers: { Cookie: adminCookie } },
      env
    );
    expect(catRes.status).toBe(200);
    const catBody = (await catRes.json()) as any;
    expect(catBody.success).toBe(true);
    expect(catBody.data).toHaveLength(14);
    expect(catBody.data.map((c: any) => c.particular)).toEqual([
      'PESO Licence',
      'Property Tax',
      'Lease Rent',
      'Electricity Bill',
      'Water Bill',
      'Water Cooler Maintenance',
      'Weights & Measures Stamping',
      'Fire Extinguisher Refilling',
      'POS / Automation',
      'Generator Maintenance',
      'CCTV Health Status',
      'Public Performance Licence (PPL)',
      'Service Provider Contract Agreement',
      'Wages, Incentives & Miscellaneous Bills',
    ]);

    // Add a custom category record for OUTLET_1_ID
    const createCustomRes = await app.request(
      '/api/v1/documents/compliance/records',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          outletId: OUTLET_1_ID,
          categoryCode: 'CUSTOM_POLLUTION_CTO',
          categoryName: 'Pollution Control Board Consent (CTO)',
          isCustomCategory: true,
          documentTitle: 'WBPCB Consent to Operate',
          referenceNumber: 'WBPCB/CTO/2026/991',
          issueDate: '2026-01-01',
          validityDueDate: '2027-12-31',
          amountPaise: 1500000,
          frequency: 'Yearly',
          paymentStatus: 'PAID',
          paymentDate: '2026-01-05',
          statusYesNo: 'YES',
          remarks: 'Valid CTO certificate on display',
          responsiblePerson: 'Outlet Manager',
        }),
      },
      env
    );
    expect(createCustomRes.status).toBe(201);

    // Fetch register and verify 14 standard categories remain untouched in 1..14 order + custom category at #15
    const regRes = await app.request(
      `/api/v1/documents/compliance/register?outletId=${OUTLET_1_ID}&reportDate=2026-04-15`,
      { headers: { Cookie: adminCookie } },
      env
    );
    expect(regRes.status).toBe(200);
    const regBody = (await regRes.json()) as any;
    expect(regBody.data.items).toHaveLength(15);
    expect(regBody.data.items.slice(0, 14).map((i: any) => i.categoryName)).toEqual(
      STANDARD_COCO_CATEGORIES.map((c) => c.particular)
    );
    expect(regBody.data.items[14].categoryName).toBe('Pollution Control Board Consent (CTO)');
    expect(regBody.data.items[14].isCustomCategory).toBe(true);
    expect(regBody.data.items[14].complianceStatus).toBe('VALID');
  });

  it('2. never treats missing records as valid, paid, or verified (defaults to NOT_RECORDED)', async () => {
    const adminCookie = await loginAs('admin@iocl.in');

    // Use OUTLET_3_ID which has no compliance records or module bills seeded
    const regRes = await app.request(
      `/api/v1/documents/compliance/register?outletId=${OUTLET_3_ID}&reportDate=2026-04-15`,
      { headers: { Cookie: adminCookie } },
      env
    );
    expect(regRes.status).toBe(200);
    const regBody = (await regRes.json()) as any;

    expect(regBody.data.items).toHaveLength(14);
    for (const item of regBody.data.items) {
      expect(item.complianceStatus).toBe('NOT_RECORDED');
      expect(item.paymentStatus).toBe('NOT_RECORDED');
      expect(item.documentValidityStatus).toBe('NOT_RECORDED');
    }
    expect(regBody.data.summary.notRecordedCount).toBe(14);
    expect(regBody.data.summary.validCount).toBe(0);
    expect(regBody.data.dueDatesAndActions.notRecorded).toHaveLength(14);
  });

  it('3. creates and updates compliance records across categories and writes audit logs', async () => {
    const adminCookie = await loginAs('admin@iocl.in');

    // Create PESO Licence record
    const createRes = await app.request(
      '/api/v1/documents/compliance/records',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          outletId: OUTLET_3_ID,
          categoryCode: 'PESO_LICENCE',
          documentTitle: 'PESO Form XIV Petroleum Storage Licence',
          referenceNumber: 'P/HQ/PB/15/373196',
          issueDate: '2025-04-01',
          validityDueDate: '2028-03-31',
          amountPaise: 2500000,
          frequency: '3 Years',
          paymentStatus: 'PAID',
          paymentDate: '2025-03-25',
          statusYesNo: 'YES',
          remarks: 'Valid up to 31-Mar-2028',
          responsiblePerson: 'Divisional Engineer',
        }),
      },
      env
    );
    expect(createRes.status).toBe(201);
    const created = ((await createRes.json()) as any).data;
    expect(created.categoryCode).toBe('PESO_LICENCE');
    expect(created.referenceNumber).toBe('P/HQ/PB/15/373196');

    // Update the same record via PUT /api/v1/documents/compliance/records/:id
    const updateRes = await app.request(
      `/api/v1/documents/compliance/records/${created.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          remarks: 'Updated after annual safety audit',
          actionRequired: 'Display laminated copy in sales room',
        }),
      },
      env
    );
    expect(updateRes.status).toBe(200);
    const updated = ((await updateRes.json()) as any).data;
    expect(updated.remarks).toBe('Updated after annual safety audit');
    expect(updated.actionRequired).toBe('Display laminated copy in sales room');

    // Verify audit logs recorded both CREATE and UPDATE
    const db = getDb(localD1);
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, created.id))
      .all();
    expect(logs.map((l) => l.action)).toContain('CREATE_COCO_COMPLIANCE_RECORD');
    expect(logs.map((l) => l.action)).toContain('UPDATE_COCO_COMPLIANCE_RECORD');
  });

  it('4. supports R2 upload of PDF, JPG, and PNG, authenticated view/download, and enforces outlet scope isolation', async () => {
    const dealer1Cookie = await loginAs('dealer.parkstreet@iocl.in'); // Scoped to OUTLET_1_ID (ro-1001)
    const adminCookie = await loginAs('admin@iocl.in');

    // Upload PDF, PNG, and JPG to OUTLET_1_ID
    const uploads = [
      { name: 'peso_licence.pdf', bytes: makeValidPdfBytes('PESO-PDF'), mime: 'application/pdf' },
      { name: 'stamping_photo.png', bytes: makeValidPngBytes(), mime: 'image/png' },
      { name: 'fire_extinguisher.jpg', bytes: makeValidJpgBytes(), mime: 'image/jpeg' },
    ];

    const uploadedIds: string[] = [];
    for (const u of uploads) {
      const fd = new FormData();
      fd.append('file', new File([u.bytes as unknown as BlobPart], u.name, { type: u.mime }));
      fd.append('outletId', OUTLET_1_ID);

      const res = await app.request(
        '/api/v1/documents',
        {
          method: 'POST',
          headers: { Cookie: dealer1Cookie, Origin: 'http://localhost:3000' },
          body: fd,
        },
        env
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.data.mimeType).toBe(u.mime);
      // Must never expose private storage URLs or r2Key
      expect(body.data.r2Key).toBeUndefined();
      uploadedIds.push(body.data.id);
    }

    // Link all 3 attachments to Fire Extinguisher Refilling on OUTLET_1_ID
    const attachRes = await app.request(
      '/api/v1/documents/compliance/records',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: dealer1Cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          outletId: OUTLET_1_ID,
          categoryCode: 'FIRE_EXTINGUISHER_REFILLING',
          documentTitle: 'Fire Safety Refilling Certificate',
          referenceNumber: 'FE-2026-01',
          lastServiceDate: '2026-01-15',
          validityDueDate: '2027-01-14',
          statusYesNo: 'YES',
          paymentStatus: 'PAID',
          attachmentDocumentIds: uploadedIds,
        }),
      },
      env
    );
    expect(attachRes.status).toBe(201);

    // Authorised dealer1 can view inline (/content) and download (/download)
    const viewRes = await app.request(
      `/api/v1/documents/${uploadedIds[0]}/content`,
      { headers: { Cookie: dealer1Cookie } },
      env
    );
    expect(viewRes.status).toBe(200);
    expect(viewRes.headers.get('content-type')).toBe('application/pdf');
    expect(viewRes.headers.get('content-disposition')).toContain('inline');
    const viewedText = new TextDecoder().decode(await viewRes.arrayBuffer());
    expect(viewedText).toContain('PESO-PDF');

    const dlRes = await app.request(
      `/api/v1/documents/${uploadedIds[0]}/download`,
      { headers: { Cookie: dealer1Cookie } },
      env
    );
    expect(dlRes.status).toBe(200);
    expect(dlRes.headers.get('content-disposition')).toContain('attachment');

    // Upload a document to OUTLET_2_ID as admin
    const fd2 = new FormData();
    fd2.append('file', new File([makeValidPdfBytes('OUTLET2-SECRET') as unknown as BlobPart], 'outlet2_doc.pdf', { type: 'application/pdf' }));
    fd2.append('outletId', OUTLET_2_ID);
    const adminUploadRes = await app.request(
      '/api/v1/documents',
      {
        method: 'POST',
        headers: { Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: fd2,
      },
      env
    );
    const outlet2DocId = ((await adminUploadRes.json()) as any).data.id;

    // Dealer 1 (scoped only to OUTLET_1_ID) MUST be blocked (403) from viewing/downloading OUTLET_2_ID's document
    const forbiddenView = await app.request(
      `/api/v1/documents/${outlet2DocId}/content`,
      { headers: { Cookie: dealer1Cookie } },
      env
    );
    expect(forbiddenView.status).toBe(403);

    const forbiddenDl = await app.request(
      `/api/v1/documents/${outlet2DocId}/download`,
      { headers: { Cookie: dealer1Cookie } },
      env
    );
    expect(forbiddenDl.status).toBe(403);

    // Dealer 1 MUST also be blocked (403) from accessing OUTLET_2_ID's compliance register or One-Pager
    const forbiddenReg = await app.request(
      `/api/v1/documents/compliance/register?outletId=${OUTLET_2_ID}`,
      { headers: { Cookie: dealer1Cookie } },
      env
    );
    expect(forbiddenReg.status).toBe(403);
  });

  it('5. accurately computes EXPIRED and 30 / 60 / 90 day due-date horizons relative to reportDate', async () => {
    const adminCookie = await loginAs('admin@iocl.in');
    const reportDate = '2026-05-01';

    const fixtures = [
      // Expired (< reportDate)
      { code: 'PESO_LICENCE', due: '2026-04-20' },
      // Expiring within 30 days (15 days after reportDate)
      { code: 'WATER_COOLER_MAINTENANCE', due: '2026-05-16' },
      // Expiring within 60 days (45 days after reportDate)
      { code: 'WEIGHTS_MEASURES_STAMPING', due: '2026-06-15' },
      // Expiring within 90 days (75 days after reportDate)
      { code: 'FIRE_EXTINGUISHER_REFILLING', due: '2026-07-15' },
      // Valid beyond 90 days (180 days after reportDate)
      { code: 'GENERATOR_MAINTENANCE', due: '2026-10-28' },
    ];

    for (const f of fixtures) {
      const res = await app.request(
        '/api/v1/documents/compliance/records',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: adminCookie,
            Origin: 'http://localhost:3000',
          },
          body: JSON.stringify({
            outletId: OUTLET_3_ID,
            categoryCode: f.code,
            documentTitle: `${f.code} Doc`,
            validityDueDate: f.due,
            paymentStatus: 'PAID',
            statusYesNo: 'YES',
          }),
        },
        env
      );
      expect(res.status).toBe(201);
    }

    const regRes = await app.request(
      `/api/v1/documents/compliance/register?outletId=${OUTLET_3_ID}&reportDate=${reportDate}`,
      { headers: { Cookie: adminCookie } },
      env
    );
    expect(regRes.status).toBe(200);
    const data = ((await regRes.json()) as any).data;

    const byCode = new Map<string, any>(data.items.map((i: any) => [i.categoryCode, i]));
    expect(byCode.get('PESO_LICENCE').complianceStatus).toBe('EXPIRED');
    expect(byCode.get('WATER_COOLER_MAINTENANCE').complianceStatus).toBe('EXPIRING_SOON');
    expect(byCode.get('WEIGHTS_MEASURES_STAMPING').complianceStatus).toBe('VALID');
    expect(byCode.get('FIRE_EXTINGUISHER_REFILLING').complianceStatus).toBe('VALID');
    expect(byCode.get('GENERATOR_MAINTENANCE').complianceStatus).toBe('VALID');

    // Verify Tab 3 buckets
    expect(data.dueDatesAndActions.expired.map((i: any) => i.categoryCode)).toEqual(['PESO_LICENCE']);
    expect(data.dueDatesAndActions.expiringWithin30Days.map((i: any) => i.categoryCode)).toEqual([
      'WATER_COOLER_MAINTENANCE',
    ]);
    expect(data.dueDatesAndActions.expiringWithin60Days.map((i: any) => i.categoryCode)).toEqual([
      'WATER_COOLER_MAINTENANCE',
      'WEIGHTS_MEASURES_STAMPING',
    ]);
    expect(data.dueDatesAndActions.expiringWithin90Days.map((i: any) => i.categoryCode)).toEqual([
      'WATER_COOLER_MAINTENANCE',
      'WEIGHTS_MEASURES_STAMPING',
      'FIRE_EXTINGUISHER_REFILLING',
    ]);
  });

  it('6. integrates read-only Property Tax, Lease Rent, Electricity, and Water module data, separates document validity from payment status, and flags conflicts without overwriting', async () => {
    const adminCookie = await loginAs('admin@iocl.in');
    const db = getDb(localD1);
    const now = new Date().toISOString();
    const adminRow = await db.query.users.findFirst();
    const adminId = adminRow!.id;

    // Create supporting document in OUTLET_3_ID
    const docId = 'doc-comp-test-1';
    await db.insert(documents).values({
      id: docId,
      outletId: OUTLET_3_ID,
      r2Key: `outlets/${OUTLET_3_ID}/${docId}/bill.pdf`,
      name: 'assessment.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 512,
      uploadedByUserId: adminId,
      createdAt: now,
    });

    // 1. Insert an UNPAID Property Tax assessment in municipal_tax_dues whose dueDate is in the future (2026-12-31)
    await db.insert(municipalTaxDues).values({
      id: 'mtd-prop-1',
      outletId: OUTLET_3_ID,
      taxType: 'PROPERTY_TAX',
      authorityName: 'Ludhiana Municipal Corporation',
      referenceNumber: 'LMC-PT-2026-01',
      assessmentFrequency: 'ANNUAL',
      assessmentPeriodStart: '2026-04-01',
      assessmentPeriodEnd: '2027-03-31',
      amountPaise: 4800000, // ₹48,000
      dueDate: '2026-12-31',
      assessmentDocumentId: docId,
      status: 'PENDING',
      createdBy: adminId,
      createdAt: now,
      updatedAt: now,
    });

    // 2. Insert a Water Tax / Water Bill record in municipal_tax_dues (PAID)
    await db.insert(municipalTaxDues).values({
      id: 'mtd-water-1',
      outletId: OUTLET_3_ID,
      taxType: 'LOCAL_AUTHORITY_DUE',
      authorityName: 'Municipal Water Supply Board',
      referenceNumber: 'WATER-2026-Q1',
      assessmentFrequency: 'QUARTERLY',
      assessmentPeriodStart: '2026-01-01',
      assessmentPeriodEnd: '2026-06-30',
      amountPaise: 350000, // ₹3,500
      dueDate: '2026-06-30',
      assessmentDocumentId: docId,
      status: 'PAID',
      paymentReceiptDocumentId: docId,
      paymentReference: 'UTR-WATER-99',
      paidAt: '2026-04-02T10:00:00Z',
      paidByUserId: adminId,
      createdBy: adminId,
      createdAt: now,
      updatedAt: now,
    });

    // 3. Insert an Electricity Account & PENDING Electricity Bill
    await db.insert(utilityElectricityAccounts).values({
      id: 'uea-comp-1',
      outletId: OUTLET_3_ID,
      consumerNumber: 'PSPCL-889900',
      providerName: 'PSPCL',
      billingCycle: 'Monthly',
      status: 'ACTIVE',
      createdBy: adminId,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(utilityElectricityBills).values({
      id: 'ueb-comp-1',
      outletId: OUTLET_3_ID,
      electricityAccountId: 'uea-comp-1',
      billingPeriodStart: '2026-03-01',
      billingPeriodEnd: '2026-03-31',
      billAmountPaise: 3250000, // ₹32,500
      dueDate: '2026-05-10',
      billDocumentId: docId,
      status: 'PENDING',
      createdBy: adminId,
      createdAt: now,
      updatedAt: now,
    });

    // 4. Insert NFR Space, Vendor, Active Lease, and Unpaid Rent Due
    await db.insert(nfrSpaces).values({
      id: 'nfr-sp-comp-1',
      outletId: OUTLET_3_ID,
      spaceCode: 'ATM-01',
      name: 'ATM Kiosk Space',
      nfrType: 'ATM',
      status: 'ACTIVE',
      createdBy: adminId,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(nfrVendors).values({
      id: 'nfr-vnd-comp-1',
      outletId: OUTLET_3_ID,
      vendorName: 'SBI ATM Services',
      ownerContactName: 'Rajesh Sharma',
      ownerContactPhone: '9876543210',
      status: 'ACTIVE',
      createdBy: adminId,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(nfrLeases).values({
      id: 'nfr-ls-comp-1',
      outletId: OUTLET_3_ID,
      spaceId: 'nfr-sp-comp-1',
      vendorId: 'nfr-vnd-comp-1',
      agreementNumber: 'NFR-LEASE-2026-01',
      leaseStartDate: '2026-01-01',
      leaseEndDate: '2028-12-31',
      monthlyRentPaise: 1800000, // ₹18,000
      securityDepositPaise: 5400000,
      monthlyDueDay: 5,
      agreementDocumentId: docId,
      status: 'ACTIVE',
      createdBy: adminId,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(nfrRentDues).values({
      id: 'nfr-rd-comp-1',
      outletId: OUTLET_3_ID,
      leaseId: 'nfr-ls-comp-1',
      billingMonth: '2026-04',
      rentPeriodStart: '2026-04-01',
      rentPeriodEnd: '2026-04-30',
      dueDate: '2026-05-05',
      monthlyRentPaiseSnapshot: 1800000,
      createdBy: adminId,
      createdAt: now,
    });

    // 5. Also insert a conflicting manual compliance record for PROPERTY_TAX claiming it is PAID with ₹40,000
    await app.request(
      '/api/v1/documents/compliance/records',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          outletId: OUTLET_3_ID,
          categoryCode: 'PROPERTY_TAX',
          documentTitle: 'Manual Property Tax Entry',
          referenceNumber: 'MANUAL-PT-01',
          validityDueDate: '2026-12-31',
          amountPaise: 4000000, // ₹40,000 (conflicts with module ₹48,000)
          paymentStatus: 'PAID', // conflicts with module PENDING
          statusYesNo: 'YES',
        }),
      },
      env
    );

    const regRes = await app.request(
      `/api/v1/documents/compliance/register?outletId=${OUTLET_3_ID}&reportDate=2026-04-15`,
      { headers: { Cookie: adminCookie } },
      env
    );
    expect(regRes.status).toBe(200);
    const regData = ((await regRes.json()) as any).data;
    const byCode = new Map<string, any>(regData.items.map((i: any) => [i.categoryCode, i]));

    // Verify Property Tax:
    // - Uses authoritative MUNICIPAL_TAX_MODULE values (₹48,000, PENDING)
    // - Keeps documentValidityStatus ('VALID' since 2026-12-31 > 2026-04-15) separate from overall complianceStatus ('PAYMENT_PENDING')
    // - Flags discrepancy between manual entry and module record without overwriting financial records
    const propTax = byCode.get('PROPERTY_TAX');
    expect(propTax.authoritativeSource).toBe('MUNICIPAL_TAX_MODULE');
    expect(propTax.amountPaise).toBe(4800000);
    expect(propTax.paymentStatus).toBe('PENDING');
    expect(propTax.documentValidityStatus).toBe('VALID');
    expect(propTax.complianceStatus).toBe('PAYMENT_PENDING');
    expect(propTax.hasDiscrepancy).toBe(true);
    expect(propTax.discrepancyNote).toContain('Payment status mismatch');
    expect(propTax.discrepancyNote).toContain('Amount mismatch');

    // Verify Lease Rent: linked to NFR_LEASE_RENT_MODULE
    const leaseRent = byCode.get('LEASE_RENT');
    expect(leaseRent.authoritativeSource).toBe('NFR_LEASE_RENT_MODULE');
    expect(leaseRent.amountPaise).toBe(1800000);
    expect(leaseRent.complianceStatus).toBe('PAYMENT_PENDING');

    // Verify Electricity Bill: linked to UTILITY_BILLS_MODULE
    const elecBill = byCode.get('ELECTRICITY_BILL');
    expect(elecBill.authoritativeSource).toBe('UTILITY_BILLS_MODULE');
    expect(elecBill.amountPaise).toBe(3250000);
    expect(elecBill.complianceStatus).toBe('PAYMENT_PENDING');

    // Verify Water Bill: linked to MUNICIPAL_TAX_MODULE and PAID -> VALID
    const waterBill = byCode.get('WATER_BILL');
    expect(waterBill.authoritativeSource).toBe('MUNICIPAL_TAX_MODULE');
    expect(waterBill.paymentStatus).toBe('PAID');
    expect(waterBill.complianceStatus).toBe('VALID');
  });

  it('7. generates a valid printable A4 Portrait One-Pager PDF with all 14 standard rows and annex overflow support', async () => {
    const adminCookie = await loginAs('admin@iocl.in');

    // Rename OUTLET_1_ID to COCO IT Park — 373196 for exact reference alignment
    const db = getDb(localD1);
    await db
      .update(retailOutlets)
      .set({ name: 'COCO IT Park', roCode: '373196' })
      .where(eq(retailOutlets.id, OUTLET_1_ID));

    // Add a compliance record with normal remarks
    await app.request(
      '/api/v1/documents/compliance/records',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          outletId: OUTLET_1_ID,
          categoryCode: 'PESO_LICENCE',
          documentTitle: 'PESO Form XIV Licence',
          referenceNumber: 'P/HQ/WB/15/373196',
          validityDueDate: '2027-03-31',
          amountPaise: 2000000,
          frequency: 'Yearly',
          paymentStatus: 'PAID',
          statusYesNo: 'YES',
          remarks: 'Displayed at Sales Room',
        }),
      },
      env
    );

    // 1. Verify One-Pager JSON preview
    const previewRes = await app.request(
      `/api/v1/documents/compliance/one-pager?outletId=${OUTLET_1_ID}&reportDate=2026-04-15`,
      { headers: { Cookie: adminCookie } },
      env
    );
    expect(previewRes.status).toBe(200);
    const previewData = ((await previewRes.json()) as any).data;
    expect(previewData.outletName).toBe('COCO IT Park');
    expect(previewData.roCode).toBe('373196');
    expect(previewData.rows).toHaveLength(14);
    expect(previewData.rows[0].particular).toBe('PESO Licence');
    expect(previewData.rows[0].statusYesNoDisplay).toBe('Yes');
    expect(previewData.rows[0].amountInrDisplay).toContain('20,000');
    // Unrecorded rows must explicitly show 'Not Recorded' and never invent data
    expect(previewData.rows[5].statusYesNoDisplay).toBe('Not Recorded');

    // 2. Generate and verify A4 Portrait One-Page PDF
    const pdfRes = await app.request(
      `/api/v1/documents/compliance/one-pager/pdf?outletId=${OUTLET_1_ID}&reportDate=2026-04-15`,
      { headers: { Cookie: adminCookie } },
      env
    );
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get('content-type')).toBe('application/pdf');
    expect(pdfRes.headers.get('content-disposition')).toContain(
      'COCO_One_Pager_373196_2026-04-15.pdf'
    );

    const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
    expect(pdfBytes.byteLength).toBeGreaterThan(1500);

    const parsedPdf = await PDFDocument.load(pdfBytes);
    expect(parsedPdf.getPageCount()).toBe(1);
    const page1 = parsedPdf.getPage(0);
    const { width, height } = page1.getSize();
    expect(width).toBeCloseTo(595.28, 1);
    expect(height).toBeCloseTo(841.89, 1);
  });

  it('8. preserves all existing tanks, calibration charts, operational shifts, and R2 documents', async () => {
    const db = getDb(localD1);

    const preTanks = await db.select().from(tanks).all();
    const preCharts = await db.select().from(tankCalibrationCharts).all();
    const preShifts = await db.select().from(operationalShifts).all();
    const preDocs = await db.select().from(documents).all();

    const adminCookie = await loginAs('admin@iocl.in');
    await app.request(
      '/api/v1/documents/compliance/records',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          outletId: OUTLET_1_ID,
          categoryCode: 'CCTV_HEALTH_STATUS',
          documentTitle: '16-Channel NVR Inspection Log',
          lastServiceDate: '2026-04-01',
          validityDueDate: '2026-05-01',
          frequency: 'Monthly',
          paymentStatus: 'NOT_APPLICABLE',
          statusYesNo: 'YES',
          remarks: 'All 16 cameras online with 30 days backup retention',
        }),
      },
      env
    );

    const postTanks = await db.select().from(tanks).all();
    const postCharts = await db.select().from(tankCalibrationCharts).all();
    const postShifts = await db.select().from(operationalShifts).all();
    const postDocs = await db.select().from(documents).all();

    expect(postTanks.length).toBe(preTanks.length);
    expect(postCharts.length).toBe(preCharts.length);
    expect(postShifts.length).toBe(preShifts.length);
    expect(postDocs.length).toBe(preDocs.length);
  });
});
