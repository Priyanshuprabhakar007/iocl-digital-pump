import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import fs from 'node:fs';
import app from '../src/worker/app';
import { getDb } from '../src/db';
import { createLocalD1Database } from '../src/db/localD1';
import { seedDatabase } from '../src/db/seed';
import { buildSectionWiseSections } from '../src/worker/services/cocoSectionWiseReportService';
import { CocoSectionWisePdfService } from '../src/worker/services/cocoSectionWisePdfService';

describe('Section-wise COCO report: source mapping and five-page PDF', () => {
  const sampleSections = () => buildSectionWiseSections({
    items: [],
    leases: [],
    assets: [],
    outletType: 'COCO',
  });

  it('uses five distinct sections and excludes PPL from the licences page', () => {
    const sections = sampleSections();
    expect(sections.map((s) => s.title)).toEqual([
      'Lease & Agreements',
      'Bills, Taxes & Charges',
      'Licences & Certificates',
      'Maintenance & Assets',
      'Claims & Payments',
    ]);
    const certificates = sections[2].tables[0].rows.map((row) => row[1]);
    expect(certificates).toEqual([
      'PESO Licence',
      'Weights & Measures Stamping (DU)',
      'Fire Extinguisher Refill / Test Certificate',
      'Other / Custom Certificate',
    ]);
    expect(certificates.join(' ')).not.toMatch(/public performance|ppl/i);
    expect(sections[0].tables[0].rows[0][2]).toBe('Not Recorded');
    expect(sections[4].tables[0].rows[0][5]).toBe('Not Recorded');
  });

  it('does not treat an active equipment asset as verified working', () => {
    const sections = buildSectionWiseSections({
      items: [],
      leases: [{
        agreementNumber: 'NFR-001', from: '2025-01-01', to: '2029-12-31',
        vendorName: 'Test Vendor', status: 'ACTIVE',
      }],
      assets: [{ equipmentType: 'DG_SET', name: 'DG Set', manufacturer: 'Test Make', status: 'ACTIVE' }],
      outletType: 'COCO',
    });
    expect(sections[0].tables[0].rows[2][5]).toBe('Test Vendor');
    expect(sections[0].tables[0].rows[2][2]).toBe('Valid');
    const generatorRow = sections[3].tables[0].rows[2];
    expect(generatorRow[2]).toBe('Not Recorded');
    expect(generatorRow[3]).toBe('1');
    expect(generatorRow[4]).toBe('Test Make');
  });

  it('marks an expired NFR agreement expired even when its lifecycle flag is ACTIVE', () => {
    const sections = buildSectionWiseSections({
      items: [], assets: [], outletType: 'COCO', reportDate: '2026-11-17',
      leases: [{
        agreementNumber: 'NFR-EXPIRED', from: '2022-01-01',
        to: '2026-10-01', vendorName: 'Former Vendor', status: 'ACTIVE',
      }],
    });
    expect(sections[0].tables[0].rows[2][2]).toBe('Expired');
  });

  it('generates the expected A4 portrait section pages without requiring production records', async () => {
    const report = {
      outletId: 'test-outlet', outletName: 'Synthetic COCO Outlet',
      roCode: 'TEST-001', reportDate: '2026-11-17',
      generatedAt: '2026-11-17T10:00:00.000Z', generatedBy: 'Fixture Tester',
      sections: sampleSections(),
    };
    const bytes = await CocoSectionWisePdfService.generatePdf(report);
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(5);
    for (const page of document.getPages()) {
      expect(page.getSize().width).toBeCloseTo(595.28, 1);
      expect(page.getSize().height).toBeCloseTo(841.89, 1);
    }
  });

  it('enforces authentication and uses the same saved-source model for preview and PDF export', async () => {
    const path = './.sqlite/test_section_report_' + crypto.randomUUID() + '.db';
    const local = createLocalD1Database(path);
    const env: any = { DB: local, ENVIRONMENT: 'development', ALLOWED_ORIGINS: 'http://localhost:3000' };
    try {
      await seedDatabase(getDb(local));
      const url = '/api/v1/documents/compliance/section-wise?outletId=ro-1001&reportDate=2026-11-17';
      const noAuth = await app.fetch(new Request('http://localhost' + url), env);
      expect(noAuth.status).toBe(401);
      const login = await app.fetch(new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
      }), env);
      expect(login.status).toBe(200);
      const cookie = login.headers.get('set-cookie')?.split(';')[0] || '';
      const response = await app.fetch(new Request('http://localhost' + url, {
        headers: { Cookie: cookie },
      }), env);
      expect(response.status).toBe(200);
      const json = await response.json() as any;
      expect(json.data.sections).toHaveLength(5);
      expect(json.data.outletId).toBe('ro-1001');
      const pdfUrl = '/api/v1/documents/compliance/section-wise/pdf?outletId=ro-1001&reportDate=2026-11-17';
      const exported = await app.fetch(new Request('http://localhost' + pdfUrl, {
        headers: { Cookie: cookie },
      }), env);
      expect(exported.status).toBe(200);
      expect(exported.headers.get('Content-Type')).toBe('application/pdf');
      const parsed = await PDFDocument.load(await exported.arrayBuffer());
      expect(parsed.getPageCount()).toBeGreaterThanOrEqual(5);
    } finally {
      local.close();
      for (const suffix of ['', '-wal', '-shm']) {
        try { fs.unlinkSync(path + suffix); } catch {}
      }
    }
  });
});
