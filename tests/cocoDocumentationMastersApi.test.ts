import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import app from '../src/worker/app';
import { getDb } from '../src/db';
import { createLocalD1Database } from '../src/db/localD1';
import { seedDatabase } from '../src/db/seed';
import * as schema from '../src/db/schema';
import { eq } from 'drizzle-orm';

describe('COCO documentation master API / evidence protections', () => {
  it('enforces outlet scoping, claim maker-checker, exact settlement and inspection-to-PDF sync', async () => {
    const path = './.sqlite/test_doc_master_api_' + crypto.randomUUID() + '.db';
    const local = createLocalD1Database(path);
    const db = getDb(local);
    const env = { DB: local, ENVIRONMENT: 'development', ALLOWED_ORIGINS: 'http://localhost:3000' } as any;
    const base = 'http://localhost/api/v1/documents';
    try {
      await seedDatabase(db);
      const login = await app.fetch(new Request('http://localhost/api/v1/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
      }), env);
      expect(login.status).toBe(200);
      const cookie = login.headers.get('set-cookie')?.split(';')[0] || '';
      const call = (url: string, method = 'GET', body?: unknown) => app.fetch(new Request(base + url, {
        method, headers: { Cookie: cookie, Origin: 'http://localhost:3000',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      }), env);
      const now = new Date().toISOString();
      await db.insert(schema.documents).values([
        { id: 'evidence-one', outletId: 'ro-1001', name: 'Saved document', mimeType: 'application/pdf',
          r2Key: 'test/doc1', sizeBytes: 128, uploadedByUserId: 'user-admin', createdAt: now },
        { id: 'evidence-other', outletId: 'ro-1002', name: 'Other outlet document', mimeType: 'application/pdf',
          r2Key: 'test/doc2', sizeBytes: 128, uploadedByUserId: 'user-admin', createdAt: now },
      ]);
      const agreement = {
        outletId: 'ro-1001', agreementType: 'LAND_LEASE', agreementName: 'Land Lease',
        agreementNumber: 'LAND-1', counterpartyName: 'Fixture Lessor', vendorCode: 'V-77',
        customerCode: 'C-77', siteClass: 'A', startDate: '2026-01-01',
        endDate: '2027-01-01', agreementDocumentId: 'evidence-one',
      };
      expect((await call('/compliance/masters/agreements', 'POST',
        { ...agreement, agreementDocumentId: 'evidence-other' })).status).toBe(403);
      expect((await call('/compliance/masters/agreements', 'POST', agreement)).status).toBe(201);
      const claimRes = await call('/compliance/masters/claims', 'POST', {
        outletId: 'ro-1001', claimCategory: 'UNIFORM_CHARGES', title: 'Uniform Expense',
        amountPaise: 10000, invoiceDocumentId: 'evidence-one',
      });
      expect(claimRes.status).toBe(201);
      const claimId = (await claimRes.json() as any).data.id;
      expect((await call('/compliance/masters/claims/' + claimId + '/decision',
        'POST', { decision: 'APPROVED' })).status).toBe(403);
      expect((await call('/compliance/masters/claims/' + claimId + '/settlements',
        'POST', { amountPaise: 10000, paymentDate: '2026-11-17', paymentMethod: 'UPI',
          referenceNumber: 'UTR-1', receiptDocumentId: 'evidence-one' })).status).toBe(409);

      // Fixture approval by another user is set directly to isolate database settlement guard.
      await db.update(schema.cocoExpenseClaims).set({
        approvalStatus: 'APPROVED', approvedBy: 'user-so', approvedAt: now,
      }).where(eq(schema.cocoExpenseClaims.id, claimId));

      const pay = (amountPaise: number, referenceNumber: string, documentId = 'evidence-one') =>
        call('/compliance/masters/claims/' + claimId + '/settlements', 'POST',
          { amountPaise, paymentDate: '2026-11-17', paymentMethod: 'UPI',
            referenceNumber, receiptDocumentId: documentId });
      expect((await pay(4000, 'UTR-1')).status).toBe(201);
      expect((await pay(4000, 'UTR-1')).status).toBe(409);
      expect((await pay(7000, 'UTR-2')).status).toBe(409);
      expect((await pay(6000, 'UTR-2', 'evidence-other')).status).toBe(403);
      expect((await pay(6000, 'UTR-2')).status).toBe(201);
      const listing = await call('/compliance/masters?outletId=ro-1001');
      expect(listing.status).toBe(200);
      const json = (await listing.json() as any).data;
      expect(json.claims[0].outstandingPaise).toBe(0);
      expect(json.claims[0].settlementStatus).toBe('PAID');

      await db.insert(schema.equipmentAssets).values({
        id: 'test-dg-asset', outletId: 'ro-1001', assetCode: 'DG-T',
        equipmentType: 'DG_SET', name: 'Generator', manufacturer: 'Example',
        status: 'ACTIVE', createdBy: 'user-admin', createdAt: now, updatedAt: now,
      });
      expect((await call('/compliance/masters/inspections', 'POST', {
        outletId: 'ro-1001', equipmentAssetId: 'test-dg-asset',
        inspectedOn: '2026-11-17', condition: 'NOT_WORKING',
        evidenceDocumentId: 'evidence-one', remarks: 'Needs repair',
      })).status).toBe(201);
      const preview = await call('/compliance/section-wise?outletId=ro-1001&reportDate=2026-11-17');
      expect(preview.status).toBe(200);
      const report = (await preview.json() as any).data;
      expect(report.sections[0].tables[1].rows[0][2]).toBe('V-77');
      expect(report.sections[3].tables[0].rows[2][2]).toBe('Not Working');
      expect(report.sections[4].tables[0].rows.some((row: string[]) =>
        row[1] === 'Uniform Expense' && row[5] === 'Yes')).toBe(true);
      const journal = await db.select().from(schema.auditLogs).all();
      expect(journal.filter((row) => row.action === 'SETTLE_COCO_CLAIM')).toHaveLength(2);
    } finally {
      local.close();
      for (const suffix of ['', '-wal', '-shm']) {
        try { fs.unlinkSync(path + suffix); } catch {}
      }
    }
  });
});
