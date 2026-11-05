import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  apiFetch,
  apiFetchBlob,
  setAuthToken,
  getAuthToken,
  clearApiCache,
} from '../src/frontend/services/api';

describe('Documents & Compliance Frontend API Connection & Safety Suite', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearApiCache();
    setAuthToken(null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. STATIC CODE AUDIT: ZERO DIRECT FETCH CALLS IN DOCUMENTSPAGE.TSX
  // =========================================================================
  describe('1. Static Code Analysis - Strict Shared API Client Enforcement', () => {
    const pagePath = path.resolve(__dirname, '../src/frontend/pages/DocumentsPage.tsx');
    const sourceCode = fs.readFileSync(pagePath, 'utf-8');

    it('1.1 should import apiFetch and apiFetchBlob from ../services/api', () => {
      expect(sourceCode).toMatch(
        /import\s+{[^}]*apiFetch[^}]*apiFetchBlob[^}]*}\s+from\s+['"]\.\.\/services\/api['"]/
      );
    });

    it('1.2 should have zero direct window/global fetch() calls', () => {
      // Find occurrences of fetch( not preceded by api (e.g. apiFetch, apiFetchBlob, etc.)
      const directFetchMatches = sourceCode.match(/(?<!api)fetch\s*\(/g);
      expect(directFetchMatches).toBeNull();
    });

    it('1.3 should define EMPTY_SUMMARY with notRecordedCount: 0 to prevent fake 14 counts on failure', () => {
      expect(sourceCode).toContain('notRecordedCount: 0');
      expect(sourceCode).toContain('EMPTY_SUMMARY');
    });

    it('1.4 should render dedicated error state when outlet loading fails', () => {
      expect(sourceCode).toContain('outletLoadError');
      expect(sourceCode).toContain('Failed to load accessible retail outlets');
    });
  });

  // =========================================================================
  // 2. apiFetch: VITE_API_BASE_URL & BEARER AUTHENTICATION ON JSON ROUTES
  // =========================================================================
  describe('2. apiFetch JSON Requests - Base URL, Auth Header, and Error Handling', () => {
    it('2.1 should load accessible retail outlets using configured Bearer token', async () => {
      setAuthToken('test-bearer-token-12345');

      const mockOutlets = [
        { id: 'ro-1001', roCode: '373196', name: 'COCO IT Park', outletType: 'COCO' },
        { id: 'ro-1002', roCode: '396187', name: 'COCO 22', outletType: 'COCO' },
      ];

      const fetchSpy = vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: mockOutlets }),
      });
      globalThis.fetch = fetchSpy;

      const res = await apiFetch<typeof mockOutlets>('/api/v1/outlets');

      expect(res.success).toBe(true);
      expect(res.data).toEqual(mockOutlets);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [calledUrl, calledOptions] = fetchSpy.mock.calls[0];
      expect(calledUrl).toBe('/api/v1/outlets');
      expect(calledOptions.headers['Authorization']).toBe('Bearer test-bearer-token-12345');
      expect(calledOptions.credentials).toBe('include');
    });

    it('2.2 should propagate actual backend error message when outlet loading fails', async () => {
      setAuthToken('test-token');

      const fetchSpy = vi.fn().mockResolvedValue({
        status: 403,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: {
            code: 'FORBIDDEN_SCOPE',
            message: 'User does not hold DOCUMENTS_READ permission for this division.',
          },
        }),
      });
      globalThis.fetch = fetchSpy;

      const res = await apiFetch('/api/v1/outlets');

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('FORBIDDEN_SCOPE');
      expect(res.error?.message).toBe(
        'User does not hold DOCUMENTS_READ permission for this division.'
      );
    });

    it('2.3 should fetch compliance register with outletId and reportDate query parameters', async () => {
      setAuthToken('auth-token-compliance');

      const mockRegisterData = {
        items: [{ categoryCode: 'PESO_LICENCE', categoryName: 'PESO Licence', complianceStatus: 'VALID' }],
        dueDatesAndActions: { expired: [], expiringWithin30Days: [], paymentsPending: [], notRecorded: [] },
        summary: { totalCategories: 14, validCount: 1, notRecordedCount: 13 },
      };

      const fetchSpy = vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: mockRegisterData }),
      });
      globalThis.fetch = fetchSpy;

      const endpoint = `/api/v1/documents/compliance/register?outletId=${encodeURIComponent(
        'ro-1001'
      )}&reportDate=2026-11-05`;
      const res = await apiFetch<typeof mockRegisterData>(endpoint);

      expect(res.success).toBe(true);
      expect(res.data).toEqual(mockRegisterData);
      expect(fetchSpy).toHaveBeenCalledWith(
        endpoint,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer auth-token-compliance',
          }),
        })
      );
    });

    it('2.4 should fetch One-Pager JSON preview and Document Vault list using apiFetch', async () => {
      setAuthToken('preview-token');

      const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/one-pager')) {
          return {
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              success: true,
              data: { outletName: 'COCO IT Park', roCode: '373196', rows: [] },
            }),
          };
        }
        if (url.includes('/api/v1/documents?outletId=')) {
          return {
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              success: true,
              data: [{ id: 'doc-1', name: 'PESO.pdf', sizeBytes: 1024 }],
            }),
          };
        }
        return { status: 404, headers: new Headers(), json: async () => ({}) };
      });
      globalThis.fetch = fetchSpy;

      const [onePagerRes, docsRes] = await Promise.all([
        apiFetch('/api/v1/documents/compliance/one-pager?outletId=ro-1001&reportDate=2026-11-05'),
        apiFetch('/api/v1/documents?outletId=ro-1001'),
      ]);

      expect(onePagerRes.success).toBe(true);
      expect(docsRes.success).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('2.5 should create or update compliance records with POST and JSON body', async () => {
      setAuthToken('save-record-token');

      const payload = {
        outletId: 'ro-1001',
        categoryCode: 'PESO_LICENCE',
        complianceStatus: 'VALID',
        validityDueDate: '2027-03-31',
      };

      const fetchSpy = vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { id: 'ccr-123', categoryName: 'PESO Licence', complianceStatus: 'VALID' },
        }),
      });
      globalThis.fetch = fetchSpy;

      const res = await apiFetch('/api/v1/documents/compliance/records', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      expect(res.success).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, config] = fetchSpy.mock.calls[0];
      expect(config.method).toBe('POST');
      expect(config.headers['Authorization']).toBe('Bearer save-record-token');
      expect(config.headers['Content-Type']).toBe('application/json');
      expect(config.body).toBe(JSON.stringify(payload));
    });
  });

  // =========================================================================
  // 3. apiFetch with FormData: R2 DOCUMENT VAULT FILE UPLOADS
  // =========================================================================
  describe('3. R2 Vault Uploads via apiFetch (FormData Handling)', () => {
    it('3.1 should upload FormData without overriding multipart Content-Type header', async () => {
      setAuthToken('upload-token-999');

      const fd = new FormData();
      const fakeFile = new Blob(['sample pdf content'], { type: 'application/pdf' });
      fd.append('file', fakeFile, 'peso_approval.pdf');
      fd.append('outletId', 'ro-1001');

      const fetchSpy = vi.fn().mockResolvedValue({
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {
            id: 'doc-r2-1',
            name: 'peso_approval.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 18,
          },
        }),
      });
      globalThis.fetch = fetchSpy;

      const res = await apiFetch('/api/v1/documents', {
        method: 'POST',
        body: fd,
      });

      expect(res.success).toBe(true);
      expect((res.data as any).id).toBe('doc-r2-1');

      const [, config] = fetchSpy.mock.calls[0];
      expect(config.method).toBe('POST');
      expect(config.headers['Authorization']).toBe('Bearer upload-token-999');
      // FormData must NOT have an explicit Content-Type string so browser sets multipart boundary
      expect(config.headers['Content-Type']).toBeUndefined();
      expect(config.body).toBe(fd);
    });

    it('3.2 should handle R2 upload failure and return backend error message', async () => {
      setAuthToken('upload-token');

      const fd = new FormData();
      fd.append('file', new Blob(['test']), 'test.txt');

      const fetchSpy = vi.fn().mockResolvedValue({
        status: 413,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: {
            code: 'FILE_TOO_LARGE',
            message: 'File size exceeds maximum permitted limit of 25MB.',
          },
        }),
      });
      globalThis.fetch = fetchSpy;

      const res = await apiFetch('/api/v1/documents', {
        method: 'POST',
        body: fd,
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('FILE_TOO_LARGE');
      expect(res.error?.message).toContain('exceeds maximum permitted limit');
    });
  });

  // =========================================================================
  // 4. apiFetchBlob: ATTACHMENT VIEWING, DOWNLOADING & ONE-PAGER PDF
  // =========================================================================
  describe('4. apiFetchBlob Binary Requests - Content, Download, and PDF Generation', () => {
    it('4.1 should stream attachment content with Bearer authentication', async () => {
      setAuthToken('binary-read-token');

      const pdfBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]); // %PDF-1.4
      const mockBlob = new Blob([pdfBytes], { type: 'application/pdf' });

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/pdf',
          'content-disposition': 'inline; filename="peso_licence.pdf"',
        }),
        blob: async () => mockBlob,
      });
      globalThis.fetch = fetchSpy;

      const res = await apiFetchBlob('/api/v1/documents/doc-123/content');

      expect(res.success).toBe(true);
      expect(res.blob).toBeDefined();
      expect(res.filename).toBe('peso_licence.pdf');
      expect(res.error).toBeNull();

      const [calledUrl, config] = fetchSpy.mock.calls[0];
      expect(calledUrl).toBe('/api/v1/documents/doc-123/content');
      expect(config.headers['Authorization']).toBe('Bearer binary-read-token');
      expect(config.credentials).toBe('include');
    });

    it('4.2 should download attachment and extract custom filename from Content-Disposition header', async () => {
      setAuthToken('binary-download-token');

      const zipBytes = new Uint8Array([80, 75, 3, 4]); // PK..
      const mockBlob = new Blob([zipBytes], { type: 'application/octet-stream' });

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/octet-stream',
          'content-disposition': 'attachment; filename="fire_safety_audit_2026.pdf"',
        }),
        blob: async () => mockBlob,
      });
      globalThis.fetch = fetchSpy;

      const res = await apiFetchBlob('/api/v1/documents/doc-456/download');

      expect(res.success).toBe(true);
      expect(res.filename).toBe('fire_safety_audit_2026.pdf');
    });

    it('4.3 should generate and download A4 One-Pager PDF via apiFetchBlob', async () => {
      setAuthToken('pdf-gen-token');

      const pdfHeader = new Uint8Array([37, 80, 68, 70]);
      const mockBlob = new Blob([pdfHeader], { type: 'application/pdf' });

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/pdf',
          'content-disposition': 'attachment; filename="COCO_One_Pager_373196_2026-11-05.pdf"',
        }),
        blob: async () => mockBlob,
      });
      globalThis.fetch = fetchSpy;

      const endpoint = '/api/v1/documents/compliance/one-pager/pdf?outletId=ro-1001&reportDate=2026-11-05';
      const res = await apiFetchBlob(endpoint);

      expect(res.success).toBe(true);
      expect(res.blob).toBeDefined();
      expect(res.filename).toBe('COCO_One_Pager_373196_2026-11-05.pdf');

      const [calledUrl, config] = fetchSpy.mock.calls[0];
      expect(calledUrl).toBe(endpoint);
      expect(config.headers['Authorization']).toBe('Bearer pdf-gen-token');
    });

    it('4.4 should parse JSON error response when binary endpoint fails with authorization error', async () => {
      setAuthToken('unauthorized-token');

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: {
            code: 'OUTLET_ACCESS_DENIED',
            message: 'You are not authorized to access documents for outlet ro-9999.',
          },
        }),
      });
      globalThis.fetch = fetchSpy;

      const res = await apiFetchBlob('/api/v1/documents/compliance/one-pager/pdf?outletId=ro-9999&reportDate=2026-11-05');

      expect(res.success).toBe(false);
      expect(res.blob).toBeNull();
      expect(res.error?.code).toBe('OUTLET_ACCESS_DENIED');
      expect(res.error?.message).toBe(
        'You are not authorized to access documents for outlet ro-9999.'
      );
    });

    it('4.5 should handle network error in apiFetchBlob gracefully', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection timed out'));

      const res = await apiFetchBlob('/api/v1/documents/doc-1/download');

      expect(res.success).toBe(false);
      expect(res.blob).toBeNull();
      expect(res.error?.code).toBe('NETWORK_ERROR');
      expect(res.error?.message).toBe('Connection timed out');
    });
  });
});
