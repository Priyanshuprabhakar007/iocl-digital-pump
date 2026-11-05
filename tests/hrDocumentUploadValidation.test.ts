import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import {
  HR_MAX_UPLOAD_FILE_SIZE_BYTES,
  validateHrUploadFile,
  isHrDocumentCompatibleWithMode,
  sanitizeHrErrorMessage,
  getHrDocumentUploadErrorMessage,
  getHrErrorMessage,
} from '../src/frontend/components/hr/hrUi';

class MockR2Bucket {
  private store = new Map<string, { data: Uint8Array; metadata: Record<string, any> }>();
  public shouldThrowOnPut = false;

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
    if (this.shouldThrowOnPut) {
      throw new Error('Simulated R2 put failure for out-of-band storage');
    }
    const data = value instanceof Uint8Array ? value : new Uint8Array(value);
    this.store.set(key, { data, metadata: options?.customMetadata || {} });
    return { key, size: data.byteLength };
  }

  async delete(key: string) {
    this.store.delete(key);
  }
}

function makeValidPdfBytes(contentNote = 'IOCL Staff Identity Proof'): BlobPart {
  const text = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\n%% ${contentNote}\n%%EOF`;
  return new TextEncoder().encode(text) as unknown as BlobPart;
}

function makeValidPngBytes(): BlobPart {
  // High-bit 0x89 byte is the exact byte that UTF-8 text() decoding corrupts to 0xEF 0xBF 0xBD
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]) as unknown as BlobPart;
}

function makeValidJpgBytes(): BlobPart {
  // High-bit 0xFF 0xD8 0xFF bytes are also corrupted if multipart body is decoded via text()
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
    0x49, 0x46, 0x00, 0x01, 0xff, 0xd9,
  ]) as unknown as BlobPart;
}

describe('HR Staff Document & Photo Upload Validation Regression Suite', () => {
  let localD1: any;
  let env: any;
  let mockR2: MockR2Bucket;
  let testDbPath: string;

  const OUTLET_1_ID = 'ro-1001'; // Assigned to dealer1@iocl.in
  const OUTLET_2_ID = 'ro-1002'; // Unassigned to dealer1@iocl.in

  beforeEach(async () => {
    testDbPath = `./.sqlite/test_hr_doc_upload_${Math.random().toString(36).substring(2)}_${Date.now()}.db`;
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch {}
    }

    localD1 = createLocalD1Database(testDbPath);
    await seedDatabase(getDb(localD1));

    mockR2 = new MockR2Bucket();
    env = {
      DB: localD1,
      DOCUMENTS_BUCKET: mockR2,
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
    const cookieHeader = res.headers.get('set-cookie');
    return cookieHeader ? cookieHeader.split(';')[0] : '';
  }

  // ==========================================================================
  // 1. Frontend File Validation & Mode Filtering (Document vs Photo)
  // ==========================================================================
  describe('1. Frontend File Validation & Mode Compatibility', () => {
    it('1.1 Aadhaar / Identity Proof (mode="document") accepts valid PDF, PNG, and JPEG files', () => {
      const pdfFile = new File([makeValidPdfBytes()], 'aadhaar_card.pdf', { type: 'application/pdf' });
      const pngFile = new File([makeValidPngBytes()], 'aadhaar_front.png', { type: 'image/png' });
      const jpgFile = new File([makeValidJpgBytes()], 'aadhaar_scan.jpg', { type: 'image/jpeg' });
      const jpegFile = new File([makeValidJpgBytes()], 'aadhaar_scan.jpeg', { type: '' }); // Empty browser MIME fallback

      expect(validateHrUploadFile(pdfFile, 'document')).toEqual({ valid: true });
      expect(validateHrUploadFile(pngFile, 'document')).toEqual({ valid: true });
      expect(validateHrUploadFile(jpgFile, 'document')).toEqual({ valid: true });
      expect(validateHrUploadFile(jpegFile, 'document')).toEqual({ valid: true });
    });

    it('1.2 Staff Photo (mode="photo") accepts valid PNG and JPEG but rejects PDF', () => {
      const pngFile = new File([makeValidPngBytes()], 'staff_photo.png', { type: 'image/png' });
      const jpgFile = new File([makeValidJpgBytes()], 'staff_photo.jpg', { type: 'image/jpeg' });
      const pdfFile = new File([makeValidPdfBytes()], 'staff_photo.pdf', { type: 'application/pdf' });

      expect(validateHrUploadFile(pngFile, 'photo')).toEqual({ valid: true });
      expect(validateHrUploadFile(jpgFile, 'photo')).toEqual({ valid: true });
      expect(validateHrUploadFile(pdfFile, 'photo')).toEqual({
        valid: false,
        error: 'Only PNG and JPEG photos are allowed.',
      });
    });

    it('1.3 Rejects unsupported file formats with a clear message in both modes', () => {
      const txtFile = new File([new TextEncoder().encode('hello')], 'notes.txt', { type: 'text/plain' });
      const gifFile = new File([new TextEncoder().encode('GIF89a')], 'avatar.gif', { type: 'image/gif' });

      expect(validateHrUploadFile(txtFile, 'document')).toEqual({
        valid: false,
        error: 'Only PDF, PNG, and JPEG documents are allowed.',
      });
      expect(validateHrUploadFile(gifFile, 'photo')).toEqual({
        valid: false,
        error: 'Only PNG and JPEG photos are allowed.',
      });
    });

    it('1.4 Rejects empty files (0 bytes) with a clear error message', () => {
      const emptyPdf = new File([new Uint8Array(0)], 'empty.pdf', { type: 'application/pdf' });
      const emptyPng = new File([new Uint8Array(0)], 'empty.png', { type: 'image/png' });

      expect(validateHrUploadFile(emptyPdf, 'document')).toEqual({
        valid: false,
        error: 'Uploaded file cannot be empty.',
      });
      expect(validateHrUploadFile(emptyPng, 'photo')).toEqual({
        valid: false,
        error: 'Uploaded file cannot be empty.',
      });
    });

    it('1.5 Rejects files larger than 5 MB with a clear error message', () => {
      const oversizedBytes = new Uint8Array(HR_MAX_UPLOAD_FILE_SIZE_BYTES + 1);
      const oversizedPdf = new File([oversizedBytes], 'huge_aadhaar.pdf', { type: 'application/pdf' });
      const oversizedPng = new File([oversizedBytes], 'huge_photo.png', { type: 'image/png' });

      expect(validateHrUploadFile(oversizedPdf, 'document')).toEqual({
        valid: false,
        error: 'File size exceeds the 5 MB maximum limit.',
      });
      expect(validateHrUploadFile(oversizedPng, 'photo')).toEqual({
        valid: false,
        error: 'File size exceeds the 5 MB maximum limit.',
      });
    });

    it('1.6 Filters Document Vault dropdown items by mode compatibility', () => {
      expect(
        isHrDocumentCompatibleWithMode({ mimeType: 'application/pdf', name: 'aadhaar.pdf' }, 'document')
      ).toBe(true);
      expect(
        isHrDocumentCompatibleWithMode({ mimeType: 'image/png', name: 'aadhaar.png' }, 'document')
      ).toBe(true);
      expect(
        isHrDocumentCompatibleWithMode({ mimeType: 'image/jpeg', name: 'aadhaar.jpg' }, 'document')
      ).toBe(true);

      expect(
        isHrDocumentCompatibleWithMode({ mimeType: 'application/pdf', name: 'aadhaar.pdf' }, 'photo')
      ).toBe(false);
      expect(
        isHrDocumentCompatibleWithMode({ mimeType: 'image/png', name: 'photo.png' }, 'photo')
      ).toBe(true);
      expect(
        isHrDocumentCompatibleWithMode({ mimeType: 'image/jpeg', name: 'photo.jpg' }, 'photo')
      ).toBe(true);
    });
  });

  // ==========================================================================
  // 2. Specific Error Message Preservation & Privacy Sanitization
  // ==========================================================================
  describe('2. Specific Backend Error Preservation & Privacy Sanitization', () => {
    it('2.1 Preserves specific backend error.message on VALIDATION_ERROR instead of generic message', () => {
      const binarySigError = {
        code: 'VALIDATION_ERROR',
        message: 'Invalid file format. Only valid PDF, PNG, and JPEG files are permitted (verified by binary signature)',
      };
      expect(getHrDocumentUploadErrorMessage(binarySigError)).toBe(
        'Invalid file format. Only valid PDF, PNG, and JPEG files are permitted (verified by binary signature)'
      );
      expect(getHrErrorMessage(binarySigError)).toBe(
        'Invalid file format. Only valid PDF, PNG, and JPEG files are permitted (verified by binary signature)'
      );

      const maxSizeError = {
        code: 'VALIDATION_ERROR',
        message: 'File size exceeds maximum limit of 5 MB',
      };
      expect(getHrDocumentUploadErrorMessage(maxSizeError)).toBe(
        'File size exceeds maximum limit of 5 MB'
      );

      const emptyError = {
        code: 'VALIDATION_ERROR',
        message: 'Uploaded file cannot be empty',
      };
      expect(getHrDocumentUploadErrorMessage(emptyError)).toBe(
        'Uploaded file cannot be empty'
      );
    });

    it('2.2 Preserves specific messages for outlet permission and Cloudflare R2 errors', () => {
      expect(
        getHrDocumentUploadErrorMessage({
          code: 'FORBIDDEN_SCOPE',
          message: 'Access denied: Insufficient scope permissions for target outlet',
        })
      ).toBe('Access denied: Insufficient scope permissions for target outlet');

      expect(
        getHrDocumentUploadErrorMessage({
          code: 'MISSING_OUTLET_ID',
          message: 'Access denied: Scoped users must specify an outletId',
        })
      ).toBe('Access denied: Scoped users must specify an outletId');

      expect(
        getHrDocumentUploadErrorMessage({
          code: 'R2_UNAVAILABLE',
          message: 'Document storage service is not configured',
        })
      ).toBe('Document storage service is not configured');

      expect(
        getHrDocumentUploadErrorMessage({
          code: 'R2_UPLOAD_FAILED',
          message: 'Failed to store document in vault',
        })
      ).toBe('Failed to store document in vault');
    });

    it('2.3 Never exposes full 12-digit Aadhaar numbers, R2 storage paths, or sensitive file contents in error messages', () => {
      const leakedAadhaarMsg = 'Validation failed for Aadhaar 9876 5432 1098 during upload';
      const sanitizedAadhaar = sanitizeHrErrorMessage(leakedAadhaarMsg);
      expect(sanitizedAadhaar).not.toContain('9876 5432 1098');
      expect(sanitizedAadhaar).toContain('XXXX-XXXX-[REDACTED]');

      const leakedR2KeyMsg = 'Failed to write to outlets/ro-1001/doc-abc-123/aadhaar_secret.pdf in bucket';
      const sanitizedR2 = sanitizeHrErrorMessage(leakedR2KeyMsg);
      expect(sanitizedR2).not.toContain('outlets/ro-1001/doc-abc-123/aadhaar_secret.pdf');
      expect(sanitizedR2).toContain('[REDACTED-STORAGE-PATH]');

      const leakedDataUri = 'Invalid content data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';
      const sanitizedDataUri = sanitizeHrErrorMessage(leakedDataUri);
      expect(sanitizedDataUri).not.toContain('iVBORw0KGgoAAAANSUhEUgAAAAUA');
      expect(sanitizedDataUri).toContain('[REDACTED-CONTENT]');
    });
  });

  // ==========================================================================
  // 3. Backend Upload & Idempotency Binary Integrity (PDF, PNG, JPEG + Rejected Scenarios)
  // ==========================================================================
  describe('3. End-to-End Multipart Upload with Idempotency-Key & Staff Creation', () => {
    it('3.1 Uploads valid PDF, PNG, and JPEG via multipart FormData with Idempotency-Key and links to HR Staff', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');

      // 1. Upload PDF Aadhaar Document (with Idempotency-Key as sent by apiFetch)
      const pdfForm = new FormData();
      pdfForm.append('file', new File([makeValidPdfBytes() as unknown as BlobPart], 'aadhaar_staff.pdf', { type: 'application/pdf' }));
      pdfForm.append('outletId', OUTLET_1_ID);

      const pdfRes = await app.request(
        '/api/v1/documents',
        {
          method: 'POST',
          headers: {
            Cookie: dealerCookie,
            'Idempotency-Key': 'idem-hr-pdf-upload-001',
            Origin: 'http://localhost:3000',
          },
          body: pdfForm,
        },
        env
      );
      expect(pdfRes.status).toBe(201);
      const pdfJson = (await pdfRes.json()) as any;
      expect(pdfJson.success).toBe(true);
      expect(pdfJson.data.mimeType).toBe('application/pdf');
      expect(pdfJson.data.outletId).toBe(OUTLET_1_ID);
      expect(pdfJson.data.r2Key).toBeUndefined(); // Storage path is never exposed

      // 2. Upload PNG Staff Photo (verifies 0x89 PNG signature is preserved when Idempotency-Key is present)
      const pngForm = new FormData();
      pngForm.append('file', new File([makeValidPngBytes() as unknown as BlobPart], 'staff_photo.png', { type: 'image/png' }));
      pngForm.append('outletId', OUTLET_1_ID);

      const pngRes = await app.request(
        '/api/v1/documents',
        {
          method: 'POST',
          headers: {
            Cookie: dealerCookie,
            'Idempotency-Key': 'idem-hr-png-upload-002',
            Origin: 'http://localhost:3000',
          },
          body: pngForm,
        },
        env
      );
      expect(pngRes.status).toBe(201);
      const pngJson = (await pngRes.json()) as any;
      expect(pngJson.success).toBe(true);
      expect(pngJson.data.mimeType).toBe('image/png');
      expect(pngJson.data.outletId).toBe(OUTLET_1_ID);
      expect(pngJson.data.r2Key).toBeUndefined();

      // 3. Upload JPEG Identity Proof (verifies 0xFF 0xD8 0xFF JPEG signature is preserved when Idempotency-Key is present)
      const jpgForm = new FormData();
      jpgForm.append('file', new File([makeValidJpgBytes() as unknown as BlobPart], 'aadhaar_photo.jpg', { type: 'image/jpeg' }));
      jpgForm.append('outletId', OUTLET_1_ID);

      const jpgRes = await app.request(
        '/api/v1/documents',
        {
          method: 'POST',
          headers: {
            Cookie: dealerCookie,
            'Idempotency-Key': 'idem-hr-jpg-upload-003',
            Origin: 'http://localhost:3000',
          },
          body: jpgForm,
        },
        env
      );
      expect(jpgRes.status).toBe(201);
      const jpgJson = (await jpgRes.json()) as any;
      expect(jpgJson.success).toBe(true);
      expect(jpgJson.data.mimeType).toBe('image/jpeg');
      expect(jpgJson.data.r2Key).toBeUndefined();

      // 4. Create an active HR designation & staff member linking the uploaded Aadhaar & Photo documents
      const desigRes = await app.request(
        `/api/v1/outlets/${OUTLET_1_ID}/hr/designations`,
        {
          method: 'POST',
          headers: {
            Cookie: dealerCookie,
            'Content-Type': 'application/json',
            Origin: 'http://localhost:3000',
          },
          body: JSON.stringify({
            code: 'DSM-UP',
            name: 'Driveway Salesman Upload Test',
            skillCategory: 'SKILLED',
            status: 'ACTIVE',
          }),
        },
        env
      );
      expect(desigRes.status).toBe(201);
      const desigId = ((await desigRes.json()) as any).data.id;

      const staffRes = await app.request(
        `/api/v1/outlets/${OUTLET_1_ID}/hr/staff`,
        {
          method: 'POST',
          headers: {
            Cookie: dealerCookie,
            'Content-Type': 'application/json',
            Origin: 'http://localhost:3000',
          },
          body: JSON.stringify({
            employeeCode: 'EMP-DOC-01',
            fullName: 'Rajesh Sharma',
            designationId: desigId,
            aadhaarLast4: '4321',
            aadhaarDocumentId: pdfJson.data.id,
            photoDocumentId: pngJson.data.id,
            emergencyContactName: 'Meena Sharma',
            emergencyContactPhone: '+91 9876543210',
            joiningDate: '2026-10-01',
            employmentStatus: 'ACTIVE',
          }),
        },
        env
      );
      expect(staffRes.status).toBe(201);
      const staffJson = (await staffRes.json()) as any;
      expect(staffJson.data.aadhaarDocumentId).toBe(pdfJson.data.id);
      expect(staffJson.data.photoDocumentId).toBe(pngJson.data.id);
      expect(staffJson.data.maskedAadhaar).toBe('XXXX XXXX 4321');
    });

    it('3.2 Rejects empty file (0 bytes) and returns specific backend error message', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const form = new FormData();
      form.append('file', new File([new Uint8Array(0)], 'empty.pdf', { type: 'application/pdf' }));
      form.append('outletId', OUTLET_1_ID);

      const res = await app.request(
        '/api/v1/documents',
        {
          method: 'POST',
          headers: {
            Cookie: dealerCookie,
            'Idempotency-Key': 'idem-hr-empty-001',
            Origin: 'http://localhost:3000',
          },
          body: form,
        },
        env
      );
      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(getHrDocumentUploadErrorMessage(json.error)).toBe('Uploaded file cannot be empty');
    });

    it('3.3 Rejects file larger than 5 MB and returns specific backend error message', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const oversizedBytes = new Uint8Array(5 * 1024 * 1024 + 64);
      // Put valid PDF header so size check is what triggers
      oversizedBytes.set([0x25, 0x50, 0x44, 0x46, 0x2d], 0);
      const form = new FormData();
      form.append('file', new File([oversizedBytes], 'oversized.pdf', { type: 'application/pdf' }));
      form.append('outletId', OUTLET_1_ID);

      const res = await app.request(
        '/api/v1/documents',
        {
          method: 'POST',
          headers: {
            Cookie: dealerCookie,
            'Idempotency-Key': 'idem-hr-oversized-001',
            Origin: 'http://localhost:3000',
          },
          body: form,
        },
        env
      );
      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(getHrDocumentUploadErrorMessage(json.error)).toBe('File size exceeds maximum limit of 5 MB');
    });

    it('3.4 Rejects invalid PDF/JPEG/PNG binary signature (spoofed extension) with specific backend message', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');
      const spoofedBytes = new TextEncoder().encode('This is plain text pretending to be a PDF');
      const form = new FormData();
      form.append('file', new File([spoofedBytes], 'fake_aadhaar.pdf', { type: 'application/pdf' }));
      form.append('outletId', OUTLET_1_ID);

      const res = await app.request(
        '/api/v1/documents',
        {
          method: 'POST',
          headers: {
            Cookie: dealerCookie,
            'Idempotency-Key': 'idem-hr-spoofed-001',
            Origin: 'http://localhost:3000',
          },
          body: form,
        },
        env
      );
      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(getHrDocumentUploadErrorMessage(json.error)).toBe(
        'Invalid file format. Only valid PDF, PNG, and JPEG files are permitted (verified by binary signature)'
      );
    });

    it('3.5 Rejects unauthorized outlet upload (FORBIDDEN_SCOPE) and missing outletId (MISSING_OUTLET_ID)', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');

      // 1. Out-of-scope outlet
      const forbiddenForm = new FormData();
      forbiddenForm.append('file', new File([makeValidPngBytes() as unknown as BlobPart], 'photo.png', { type: 'image/png' }));
      forbiddenForm.append('outletId', OUTLET_2_ID);

      const forbiddenRes = await app.request(
        '/api/v1/documents',
        {
          method: 'POST',
          headers: {
            Cookie: dealerCookie,
            Origin: 'http://localhost:3000',
          },
          body: forbiddenForm,
        },
        env
      );
      expect(forbiddenRes.status).toBe(403);
      const forbiddenJson = (await forbiddenRes.json()) as any;
      expect(forbiddenJson.error.code).toBe('FORBIDDEN_SCOPE');
      expect(getHrDocumentUploadErrorMessage(forbiddenJson.error)).toBe(
        'You do not have access to upload documents to this outlet'
      );

      // 2. Missing outletId for scoped user
      const missingOutletForm = new FormData();
      missingOutletForm.append('file', new File([makeValidPngBytes() as unknown as BlobPart], 'photo.png', { type: 'image/png' }));

      const missingOutletRes = await app.request(
        '/api/v1/documents',
        {
          method: 'POST',
          headers: {
            Cookie: dealerCookie,
            Origin: 'http://localhost:3000',
          },
          body: missingOutletForm,
        },
        env
      );
      expect(missingOutletRes.status).toBe(403);
      const missingOutletJson = (await missingOutletRes.json()) as any;
      expect(missingOutletJson.error.code).toBe('MISSING_OUTLET_ID');
      expect(getHrDocumentUploadErrorMessage(missingOutletJson.error)).toBe(
        'Scoped users must specify an accessible outletId when uploading documents'
      );
    });

    it('3.6 Handles Cloudflare R2 unavailable and R2 put failure with clear safe error messages', async () => {
      const dealerCookie = await loginAs('dealer.parkstreet@iocl.in');

      // 1. R2_UPLOAD_FAILED (bucket.put throws)
      mockR2.shouldThrowOnPut = true;
      const failForm = new FormData();
      failForm.append('file', new File([makeValidPngBytes() as unknown as BlobPart], 'photo.png', { type: 'image/png' }));
      failForm.append('outletId', OUTLET_1_ID);

      const failRes = await app.request(
        '/api/v1/documents',
        {
          method: 'POST',
          headers: {
            Cookie: dealerCookie,
            Origin: 'http://localhost:3000',
          },
          body: failForm,
        },
        env
      );
      expect(failRes.status).toBe(502);
      const failJson = (await failRes.json()) as any;
      expect(failJson.error.code).toBe('R2_UPLOAD_FAILED');
      expect(getHrDocumentUploadErrorMessage(failJson.error)).toBe('Failed to store object in Cloudflare R2');

      // 2. R2_UNAVAILABLE (DOCUMENTS_BUCKET not bound)
      const noR2Form = new FormData();
      noR2Form.append('file', new File([makeValidPngBytes() as unknown as BlobPart], 'photo.png', { type: 'image/png' }));
      noR2Form.append('outletId', OUTLET_1_ID);

      const noR2Res = await app.request(
        '/api/v1/documents',
        {
          method: 'POST',
          headers: {
            Cookie: dealerCookie,
            Origin: 'http://localhost:3000',
          },
          body: noR2Form,
        },
        { ...env, DOCUMENTS_BUCKET: undefined }
      );
      expect(noR2Res.status).toBe(500);
      const noR2Json = (await noR2Res.json()) as any;
      expect(noR2Json.error.code).toBe('R2_UNAVAILABLE');
      expect(getHrDocumentUploadErrorMessage(noR2Json.error)).toBe(
        'Cloudflare R2 DOCUMENTS_BUCKET binding is not configured'
      );
    });
  });

  // ==========================================================================
  // 4. Component Source Contract Verification (HrDocumentPicker & HrStaffModal)
  // ==========================================================================
  describe('4. HrDocumentPicker & HrStaffModal Source Contract Verification', () => {
    const pickerSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/frontend/components/hr/HrDocumentPicker.tsx'),
      'utf-8'
    );
    const staffModalSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/frontend/components/hr/HrStaffModal.tsx'),
      'utf-8'
    );

    it('4.1 Sends FormData with "file" and "outletId" through apiFetch without setting Content-Type header', () => {
      expect(pickerSource).toContain("formData.append('file', file)");
      expect(pickerSource).toContain("formData.append('outletId', outletId)");
      expect(pickerSource).toContain("apiFetch<Document>('/api/v1/documents'");
      expect(pickerSource).not.toMatch(/['"]Content-Type['"]\s*:/);
    });

    it('4.2 Immediately adds uploaded document to dropdown and auto-selects it via onSelectDocument', () => {
      expect(pickerSource).toContain('const uploadedDoc = res.data');
      expect(pickerSource).toContain('setVaultDocs(prev => [uploadedDoc, ...prev.filter(d => d.id !== uploadedDoc.id)])');
      expect(pickerSource).toContain('onSelectDocument(uploadedDoc.id)');
    });

    it('4.3 Displays specific error alert directly beneath the upload control with a Retry button', () => {
      expect(pickerSource).toContain('getHrDocumentUploadErrorMessage(res.error)');
      expect(pickerSource).toContain('role="alert"');
      expect(pickerSource).toContain('handleRetryUpload');
      expect(pickerSource).toContain('Retry');
    });

    it('4.4 Configures Aadhaar / Identity Proof as mode="document" and Staff Photo as mode="photo"', () => {
      expect(staffModalSource).toContain('label="Aadhaar / Identity Proof Document"');
      expect(staffModalSource).toContain('mode="document"');
      expect(staffModalSource).toContain('label="Staff Photo Document"');
      expect(staffModalSource).toContain('mode="photo"');
    });
  });
});
