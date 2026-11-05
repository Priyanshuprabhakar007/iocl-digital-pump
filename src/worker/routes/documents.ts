import { Hono } from 'hono';
import { EnvBindings, requireAuth, AppContext } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../../shared/constants';
import { getDb } from '../../db';
import { cocoComplianceRecords, documents } from '../../db/schema';
import { eq, inArray, desc } from 'drizzle-orm';
import { ScopeService } from '../services/scopeService';
import { OutletRepository } from '../repositories/outletRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { CocoComplianceError, CocoComplianceService } from '../services/cocoComplianceService';
import { CocoCompliancePdfService } from '../services/cocoCompliancePdfService';
import { STANDARD_COCO_CATEGORIES } from '../../shared/cocoComplianceUtils';

const documentRoutes = new Hono<{ Bindings: EnvBindings }>();

documentRoutes.use('*', requireAuth as any);

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

function successResponse(c: any, data: unknown, status: number = 200) {
  return c.json({ success: true, data, error: null }, status as any);
}

function errorResponse(c: any, code: string, message: string, status: number = 400) {
  return c.json({ success: false, data: null, error: { code, message } }, status as any);
}

/**
 * Inspects actual binary magic bytes to determine real file type.
 * Never trusts client-supplied Content-Type or filename extension.
 */
function detectAllowedMimeType(bytes: Uint8Array): 'application/pdf' | 'image/png' | 'image/jpeg' | null {
  if (bytes.length < 4) return null;

  // PDF: %PDF- (25 50 44 46 2D)
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return 'application/pdf';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF ...
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  return null;
}

/**
 * Sanitizes filename to remove path traversal, control characters, and force extension matching real MIME.
 */
function sanitizeFilename(rawName: string, detectedMime: 'application/pdf' | 'image/png' | 'image/jpeg'): string {
  const base = rawName.replace(/^.*[\\/]/, '');
  const cleaned = base.replace(/[^a-zA-Z0-9._ -]/g, '_').trim();
  const safeBase = cleaned.length > 0 ? cleaned.slice(0, 120) : 'document';

  const extMap: Record<'application/pdf' | 'image/png' | 'image/jpeg', string> = {
    'application/pdf': '.pdf',
    'image/png': '.png',
    'image/jpeg': '.jpg',
  };
  const expectedExt = extMap[detectedMime];

  const lower = safeBase.toLowerCase();
  if (detectedMime === 'image/jpeg' && (lower.endsWith('.jpg') || lower.endsWith('.jpeg'))) {
    return safeBase;
  }
  if (lower.endsWith(expectedExt)) {
    return safeBase;
  }
  const withoutExt = safeBase.replace(/\.[^.]+$/, '');
  return `${withoutExt || 'document'}${expectedExt}`;
}

// ============================================================================
// COCO DOCUMENTS & COMPLIANCE MANAGEMENT ROUTES (PHASE 1)
// ============================================================================

/**
 * GET /api/v1/documents/compliance/categories
 * Returns the 14 predefined standard COCO compliance categories.
 */
documentRoutes.get('/compliance/categories', requirePermission(PERMISSIONS.DOCUMENTS_READ), async (c) => {
  return successResponse(c, [...STANDARD_COCO_CATEGORIES]);
});

/**
 * GET /api/v1/documents/compliance/register
 * Returns the full compliance register (14 predefined categories + custom categories),
 * read-only module integrations, discrepancy flags, and Tab 3 due-date/action buckets.
 */
documentRoutes.get('/compliance/register', requirePermission(PERMISSIONS.DOCUMENTS_READ), async (c: AppContext) => {
  const user = c.var.user!;
  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);

  const outletId = c.req.query('outletId')?.trim();
  if (!outletId) {
    return errorResponse(c, 'VALIDATION_ERROR', 'outletId query parameter is required.', 400);
  }

  const canAccess = await ScopeService.canAccessOutlet(user, outletId, outletRepo);
  if (!canAccess) {
    return errorResponse(c, 'FORBIDDEN_SCOPE', 'You do not have access to this retail outlet.', 403);
  }

  const reportDate = c.req.query('reportDate')?.trim();
  const search = c.req.query('search')?.trim();
  const category = c.req.query('category')?.trim();

  try {
    const complianceService = new CocoComplianceService(db);
    const register = await complianceService.getOutletComplianceRegister({
      outletId,
      reportDate,
      search,
      categoryFilter: category,
    });
    return successResponse(c, register);
  } catch (err) {
    if (err instanceof CocoComplianceError) {
      return errorResponse(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * POST /api/v1/documents/compliance/records
 * Creates or updates a compliance record for a standard or custom category on an outlet.
 */
documentRoutes.post('/compliance/records', requirePermission(PERMISSIONS.DOCUMENTS_WRITE), async (c: AppContext) => {
  const user = c.var.user!;
  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(c, 'INVALID_JSON', 'Request body must be valid JSON.', 400);
  }

  const outletId = typeof body?.outletId === 'string' ? body.outletId.trim() : '';
  if (!outletId) {
    return errorResponse(c, 'VALIDATION_ERROR', 'outletId is required.', 400);
  }

  const canAccess = await ScopeService.canAccessOutlet(user, outletId, outletRepo);
  if (!canAccess) {
    return errorResponse(c, 'FORBIDDEN_SCOPE', 'You do not have access to this retail outlet.', 403);
  }

  try {
    const complianceService = new CocoComplianceService(db);
    const result = await complianceService.upsertComplianceRecord(
      {
        outletId,
        categoryCode: body.categoryCode,
        categoryName: body.categoryName,
        isCustomCategory: Boolean(body.isCustomCategory),
        documentTitle: body.documentTitle,
        referenceNumber: body.referenceNumber,
        issueDate: body.issueDate,
        validityDueDate: body.validityDueDate,
        lastServiceDate: body.lastServiceDate,
        amountPaise: body.amountPaise,
        frequency: body.frequency,
        paymentStatus: body.paymentStatus,
        paymentDate: body.paymentDate,
        complianceStatus: body.complianceStatus,
        statusYesNo: body.statusYesNo,
        remarks: body.remarks,
        actionRequired: body.actionRequired,
        responsiblePerson: body.responsiblePerson,
        attachmentDocumentIds: Array.isArray(body.attachmentDocumentIds) ? body.attachmentDocumentIds : [],
      },
      user.user.id
    );

    await auditRepo.logAction({
      id: crypto.randomUUID(),
      userId: user.user.id,
      action: result.isCreated ? 'CREATE_COCO_COMPLIANCE_RECORD' : 'UPDATE_COCO_COMPLIANCE_RECORD',
      entityType: 'coco_compliance_record',
      entityId: result.record.id,
      oldValue: result.previousRecord as any,
      newValue: result.record as any,
      ipAddress: c.req.header('cf-connecting-ip') || null,
      userAgent: c.req.header('user-agent') || null,
      createdAt: new Date().toISOString(),
    });

    return successResponse(c, result.record, result.isCreated ? 201 : 200);
  } catch (err) {
    if (err instanceof CocoComplianceError) {
      return errorResponse(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * PUT /api/v1/documents/compliance/records/:id
 * Updates an existing compliance record by ID.
 */
documentRoutes.put('/compliance/records/:id', requirePermission(PERMISSIONS.DOCUMENTS_WRITE), async (c: AppContext) => {
  const user = c.var.user!;
  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);
  const recordId = c.req.param('id') || '';

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(c, 'INVALID_JSON', 'Request body must be valid JSON.', 400);
  }

  try {
    const existing = await db
      .select()
      .from(cocoComplianceRecords)
      .where(eq(cocoComplianceRecords.id, recordId))
      .get();

    if (!existing) {
      return errorResponse(c, 'RECORD_NOT_FOUND', 'Compliance record not found.', 404);
    }

    const canAccess = await ScopeService.canAccessOutlet(user, existing.outletId, outletRepo);
    if (!canAccess) {
      return errorResponse(c, 'FORBIDDEN_SCOPE', 'You do not have access to this retail outlet.', 403);
    }

    const complianceService = new CocoComplianceService(db);
    const result = await complianceService.updateComplianceRecordById(recordId, body, user.user.id);

    await auditRepo.logAction({
      id: crypto.randomUUID(),
      userId: user.user.id,
      action: 'UPDATE_COCO_COMPLIANCE_RECORD',
      entityType: 'coco_compliance_record',
      entityId: result.record.id,
      oldValue: result.previousRecord as any,
      newValue: result.record as any,
      ipAddress: c.req.header('cf-connecting-ip') || null,
      userAgent: c.req.header('user-agent') || null,
      createdAt: new Date().toISOString(),
    });

    return successResponse(c, result.record, 200);
  } catch (err) {
    if (err instanceof CocoComplianceError) {
      return errorResponse(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * GET /api/v1/documents/compliance/one-pager
 * Returns the 14-category COCO Compliance One-Pager preview data for Tab 2.
 */
documentRoutes.get('/compliance/one-pager', requirePermission(PERMISSIONS.DOCUMENTS_READ), async (c: AppContext) => {
  const user = c.var.user!;
  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);

  const outletId = c.req.query('outletId')?.trim();
  if (!outletId) {
    return errorResponse(c, 'VALIDATION_ERROR', 'outletId query parameter is required.', 400);
  }

  const canAccess = await ScopeService.canAccessOutlet(user, outletId, outletRepo);
  if (!canAccess) {
    return errorResponse(c, 'FORBIDDEN_SCOPE', 'You do not have access to this retail outlet.', 403);
  }

  const reportDate = c.req.query('reportDate')?.trim();

  try {
    const complianceService = new CocoComplianceService(db);
    const report = await complianceService.getOnePagerReport({
      outletId,
      reportDate,
      actorUserId: user.user.id,
    });
    return successResponse(c, report);
  } catch (err) {
    if (err instanceof CocoComplianceError) {
      return errorResponse(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * GET /api/v1/documents/compliance/one-pager/pdf
 * Generates and downloads the printable A4 Portrait 14-row COCO One-Pager PDF.
 */
documentRoutes.get('/compliance/one-pager/pdf', requirePermission(PERMISSIONS.DOCUMENTS_READ), async (c: AppContext) => {
  const user = c.var.user!;
  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);

  const outletId = c.req.query('outletId')?.trim();
  if (!outletId) {
    return errorResponse(c, 'VALIDATION_ERROR', 'outletId query parameter is required.', 400);
  }

  const canAccess = await ScopeService.canAccessOutlet(user, outletId, outletRepo);
  if (!canAccess) {
    return errorResponse(c, 'FORBIDDEN_SCOPE', 'You do not have access to this retail outlet.', 403);
  }

  const reportDate = c.req.query('reportDate')?.trim();

  try {
    const complianceService = new CocoComplianceService(db);
    const report = await complianceService.getOnePagerReport({
      outletId,
      reportDate,
      actorUserId: user.user.id,
    });

    const pdfBytes = await CocoCompliancePdfService.generateOnePagerPdf(report);

    await auditRepo.logAction({
      id: crypto.randomUUID(),
      userId: user.user.id,
      action: 'GENERATE_COCO_COMPLIANCE_ONE_PAGER_PDF',
      entityType: 'coco_compliance_report',
      entityId: `${report.outletId}:${report.reportDate}`,
      oldValue: null,
      newValue: {
        outletId: report.outletId,
        roCode: report.roCode,
        reportDate: report.reportDate,
        byteSize: pdfBytes.byteLength,
      },
      ipAddress: c.req.header('cf-connecting-ip') || null,
      userAgent: c.req.header('user-agent') || null,
      createdAt: new Date().toISOString(),
    });

    const safeRoCode = report.roCode.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `COCO_One_Pager_${safeRoCode}_${report.reportDate}.pdf`;

    return new Response(pdfBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBytes.byteLength),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    if (err instanceof CocoComplianceError) {
      return errorResponse(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

// ============================================================================
// DOCUMENT VAULT R2 LIST, UPLOAD, VIEW & DOWNLOAD ROUTES
// ============================================================================

/**
 * GET /api/v1/documents
 * Lists documents accessible within the user's scope.
 */
documentRoutes.get('/', requirePermission(PERMISSIONS.DOCUMENTS_READ), async (c: AppContext) => {
  const user = c.var.user!;
  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);

  const outletIdFilter = c.req.query('outletId')?.trim();

  if (outletIdFilter) {
    const canAccess = await ScopeService.canAccessOutlet(user, outletIdFilter, outletRepo);
    if (!canAccess) {
      return errorResponse(c, 'FORBIDDEN_SCOPE', 'You do not have access to this retail outlet.', 403);
    }
    const docs = await db
      .select({
        id: documents.id,
        name: documents.name,
        mimeType: documents.mimeType,
        sizeBytes: documents.sizeBytes,
        outletId: documents.outletId,
        uploadedByUserId: documents.uploadedByUserId,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(eq(documents.outletId, outletIdFilter))
      .orderBy(desc(documents.createdAt))
      .all();
    return successResponse(c, docs);
  }

  let docs;
  if (user.isGlobalScope) {
    docs = await db
      .select({
        id: documents.id,
        name: documents.name,
        mimeType: documents.mimeType,
        sizeBytes: documents.sizeBytes,
        outletId: documents.outletId,
        uploadedByUserId: documents.uploadedByUserId,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .orderBy(desc(documents.createdAt))
      .all();
  } else {
    const allowedIds = user.accessibleOutletIds || [];
    if (allowedIds.length === 0) {
      return successResponse(c, []);
    }
    docs = await db
      .select({
        id: documents.id,
        name: documents.name,
        mimeType: documents.mimeType,
        sizeBytes: documents.sizeBytes,
        outletId: documents.outletId,
        uploadedByUserId: documents.uploadedByUserId,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(inArray(documents.outletId, allowedIds))
      .orderBy(desc(documents.createdAt))
      .all();
  }

  return successResponse(c, docs);
});

/**
 * Helper to serve authenticated document bytes from Cloudflare R2 with scope enforcement.
 * Never exposes private R2 keys or storage URLs.
 */
async function serveAuthenticatedDocumentBytes(
  c: AppContext,
  disposition: 'inline' | 'attachment'
): Promise<Response> {
  const user = c.var.user!;
  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const docId = c.req.param('id') || '';

  const doc = await db
    .select()
    .from(documents)
    .where(eq(documents.id, docId))
    .get();

  if (!doc) {
    return errorResponse(c, 'DOCUMENT_NOT_FOUND', 'Document not found in the Document Vault.', 404);
  }

  if (doc.outletId) {
    const canAccess = await ScopeService.canAccessOutlet(user, doc.outletId, outletRepo);
    if (!canAccess) {
      return errorResponse(
        c,
        'FORBIDDEN_SCOPE',
        'You do not have permission to access documents for this retail outlet.',
        403
      );
    }
  } else if (!user.isGlobalScope) {
    return errorResponse(
      c,
      'FORBIDDEN_SCOPE',
      'Global scope is required to access unscoped documents.',
      403
    );
  }

  if (!c.env.DOCUMENTS_BUCKET) {
    return errorResponse(c, 'R2_UNAVAILABLE', 'Cloudflare R2 Document Vault binding is unavailable.', 500);
  }

  const r2Obj = await c.env.DOCUMENTS_BUCKET.get(doc.r2Key);
  if (!r2Obj) {
    return errorResponse(
      c,
      'DOCUMENT_BYTES_NOT_FOUND',
      'Document binary object was not found in the R2 Vault.',
      404
    );
  }

  const arrayBuffer = await r2Obj.arrayBuffer();
  const safeName = doc.name.replace(/[^a-zA-Z0-9._ -]/g, '_') || 'document';

  return new Response(arrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': doc.mimeType || 'application/octet-stream',
      'Content-Disposition': `${disposition}; filename="${safeName}"`,
      'Content-Length': String(arrayBuffer.byteLength),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}

/**
 * GET /api/v1/documents/:id/content
 * Streams authenticated document bytes inline for in-browser PDF/JPG/PNG viewing.
 */
documentRoutes.get('/:id/content', requirePermission(PERMISSIONS.DOCUMENTS_READ), async (c: AppContext) => {
  return serveAuthenticatedDocumentBytes(c, 'inline');
});

/**
 * GET /api/v1/documents/:id/download
 * Streams authenticated document bytes as an attachment download.
 */
documentRoutes.get('/:id/download', requirePermission(PERMISSIONS.DOCUMENTS_READ), async (c: AppContext) => {
  return serveAuthenticatedDocumentBytes(c, 'attachment');
});

/**
 * POST /api/v1/documents
 * Uploads a document to Cloudflare R2 and records metadata in D1.
 * Enforces real binary magic-byte inspection, <= 5 MB size, and strict scope validation.
 */
documentRoutes.post('/', requirePermission(PERMISSIONS.DOCUMENTS_WRITE), async (c: AppContext) => {
  const user = c.var.user!;
  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);

  const contentType = c.req.header('content-type') || '';
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return errorResponse(
      c,
      'UNSUPPORTED_MEDIA_TYPE',
      'Multipart form-data with a real binary file is required.',
      415
    );
  }

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch (e) {
    return errorResponse(c, 'INVALID_MULTIPART', 'Request must be valid multipart/form-data', 400);
  }

  const rawFile = formData.get('file');
  const outletIdRaw = formData.get('outletId');
  const outletId = typeof outletIdRaw === 'string' && outletIdRaw.trim() !== '' ? outletIdRaw.trim() : null;

  if (!rawFile || typeof rawFile === 'string' || typeof (rawFile as any).arrayBuffer !== 'function') {
    return errorResponse(c, 'VALIDATION_ERROR', 'A valid file field is required in formData', 400);
  }

  const file = rawFile as File;

  // 1. Validate outlet scope BEFORE any R2 write
  if (outletId) {
    const canAccess = await ScopeService.canAccessOutlet(user, outletId, outletRepo);
    if (!canAccess) {
      return errorResponse(c, 'FORBIDDEN_SCOPE', 'You do not have access to upload documents to this outlet', 403);
    }
  } else if (!user.isGlobalScope) {
    return errorResponse(
      c,
      'MISSING_OUTLET_ID',
      'Scoped users must specify an accessible outletId when uploading documents',
      403
    );
  }

  // 2. Read file buffer and enforce size limits (1 byte to 5 MB)
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  if (bytes.byteLength === 0) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Uploaded file cannot be empty', 400);
  }

  if (bytes.byteLength > MAX_FILE_SIZE_BYTES) {
    return errorResponse(c, 'VALIDATION_ERROR', 'File size exceeds maximum limit of 5 MB', 400);
  }

  // 3. Inspect actual magic bytes (never trust client Content-Type or filename)
  const detectedMime = detectAllowedMimeType(bytes);
  if (!detectedMime) {
    return errorResponse(
      c,
      'VALIDATION_ERROR',
      'Invalid file format. Only valid PDF, PNG, and JPEG files are permitted (verified by binary signature)',
      400
    );
  }

  // 4. Sanitize filename and generate collision-safe R2 key
  const safeName = sanitizeFilename(file.name || 'document', detectedMime);
  const docId = `doc-${crypto.randomUUID()}`;
  const r2Key = `outlets/${outletId || 'global'}/${docId}/${safeName}`;

  if (!c.env.DOCUMENTS_BUCKET) {
    return errorResponse(c, 'R2_UNAVAILABLE', 'Cloudflare R2 DOCUMENTS_BUCKET binding is not configured', 500);
  }

  // 5. Upload to R2 with strict server-detected contentType and nosniff disposition
  try {
    await c.env.DOCUMENTS_BUCKET.put(r2Key, arrayBuffer, {
      httpMetadata: {
        contentType: detectedMime,
        contentDisposition: `attachment; filename="${safeName}"`,
      },
      customMetadata: {
        uploadedByUserId: user.user.id,
        outletId: outletId || 'GLOBAL',
        originalName: safeName,
      },
    });
  } catch (err) {
    return errorResponse(c, 'R2_UPLOAD_FAILED', 'Failed to store object in Cloudflare R2', 502);
  }

  // 6. Record metadata in D1; rollback R2 object if D1 insert fails
  const now = new Date().toISOString();
  const newDoc = {
    id: docId,
    r2Key,
    name: safeName,
    mimeType: detectedMime,
    sizeBytes: bytes.byteLength,
    outletId,
    uploadedByUserId: user.user.id,
    createdAt: now,
  };

  try {
    await db.insert(documents).values(newDoc);
  } catch (dbErr) {
    try {
      await c.env.DOCUMENTS_BUCKET.delete(r2Key);
    } catch (_) {}
    return errorResponse(c, 'DB_INSERT_FAILED', 'Failed to record document metadata in database', 500);
  }

  await auditRepo.logAction({
    id: crypto.randomUUID(),
    userId: user.user.id,
    action: 'UPLOAD_DOCUMENT',
    entityType: 'document',
    entityId: docId,
    oldValue: null,
    newValue: {
      id: newDoc.id,
      name: newDoc.name,
      mimeType: newDoc.mimeType,
      sizeBytes: newDoc.sizeBytes,
      outletId: newDoc.outletId,
    },
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: now,
  });

  // Never expose internal r2Key in client response
  return successResponse(
    c,
    {
      id: newDoc.id,
      name: newDoc.name,
      mimeType: newDoc.mimeType,
      sizeBytes: newDoc.sizeBytes,
      outletId: newDoc.outletId,
      uploadedByUserId: newDoc.uploadedByUserId,
      createdAt: newDoc.createdAt,
    },
    201
  );
});

export default documentRoutes;
