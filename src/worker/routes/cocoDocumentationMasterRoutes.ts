import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../../db';
import {
  auditLogs, cocoAgreementDetails, cocoExpenseClaims, cocoClaimSettlements,
  cocoAssetInspections, documents, equipmentAssets, nfrLeases,
} from '../../db/schema';
import { requireAuth, type AppContext, type EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../../shared/constants';
import { ScopeService } from '../services/scopeService';
import { OutletRepository } from '../repositories/outletRepository';

export const cocoDocumentationMasterRoutes = new Hono<{ Bindings: EnvBindings }>();
cocoDocumentationMasterRoutes.use('*', requireAuth as any);

const optional = (max = 200) => z.string().trim().max(max).nullable().optional();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Invalid calendar date');
const optDate = dateOnly.nullable().optional();
const agreementInput = z.object({
  outletId: z.string().trim().min(1),
  agreementType: z.enum(['LAND_LEASE', 'SERVICE_PROVIDER', 'OTHER', 'NFR_METADATA']),
  agreementName: z.string().trim().min(1).max(180),
  agreementNumber: optional(100),
  linkedNfrLeaseId: optional(100),
  counterpartyName: optional(180),
  vendorCode: optional(64),
  customerCode: optional(64),
  siteClass: z.enum(['A','B','C']).nullable().optional(),
  startDate: optDate, endDate: optDate,
  agreementDocumentId: optional(100),
  remarks: optional(2000),
}).superRefine((data, ctx) => {
  if ((data.agreementType === 'NFR_METADATA') !== Boolean(data.linkedNfrLeaseId)) {
    ctx.addIssue({ code: 'custom', message: 'NFR_METADATA requires an existing linked NFR lease; other types cannot link to one.' });
  }
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    ctx.addIssue({ code: 'custom', message: 'Agreement end date must be on or after start date.' });
  }
});
const claimInput = z.object({
  outletId: z.string().trim().min(1),
  claimCategory: z.enum([
    'WEIGHTS_MEASURES_STAMPING_CHARGES', 'FIRE_EXTINGUISHER_REFILLING_CHARGES',
    'UNIFORM_CHARGES', 'WAGES_INCENTIVES_MISC', 'OTHER_CLAIM',
  ]),
  title: z.string().trim().min(1).max(180),
  invoiceNumber: optional(100),
  periodStart: optDate, periodEnd: optDate, dueDate: optDate,
  amountPaise: z.number().int().positive().max(9000000000000000),
  invoiceDocumentId: optional(100),
  remarks: optional(2000),
}).superRefine((data, ctx) => {
  if (data.periodStart && data.periodEnd && data.periodEnd < data.periodStart) {
    ctx.addIssue({ code: 'custom', message: 'Period end date must not precede start date.' });
  }
});
const settlementInput = z.object({
  amountPaise: z.number().int().positive().max(9000000000000000),
  paymentDate: dateOnly,
  paymentMethod: z.enum(['BANK_TRANSFER','UPI','CHEQUE','CASH','OTHER']),
  referenceNumber: z.string().trim().min(1).max(120),
  receiptDocumentId: z.string().trim().min(1),
  remarks: optional(2000),
});
const inspectionInput = z.object({
  outletId: z.string().trim().min(1),
  equipmentAssetId: z.string().trim().min(1),
  inspectedOn: dateOnly,
  condition: z.enum(['WORKING','NOT_WORKING','SCRAPPED']),
  nextServiceDate: optDate,
  remarks: optional(2000),
  evidenceDocumentId: optional(100),
}).refine((i) => !i.nextServiceDate || i.nextServiceDate >= i.inspectedOn, {
  message: 'Next service date must not precede inspection date.',
});
const validation = (c: AppContext, details: string) =>
  c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: details } }, 400);
const failed = (c: AppContext, code: string, message: string, status = 400) =>
  c.json({ success: false, data: null, error: { code, message } }, status as any);
const ok = (c: AppContext, data: unknown, status = 200) =>
  c.json({ success: true, data, error: null }, status as any);
const scope = async (c: AppContext, outletId: string) =>
  ScopeService.canAccessOutlet(c.var.user, outletId, new OutletRepository(getDb(c.env.DB)));
async function checkDocument(c: AppContext, outletId: string, documentId: string | null | undefined): Promise<boolean> {
  if (!documentId) return true;
  const db = getDb(c.env.DB);
  const doc = await db.select({ outletId: documents.outletId })
    .from(documents).where(eq(documents.id, documentId)).get();
  return Boolean(doc && doc.outletId === outletId);
}
const audit = (c: AppContext, action: string, entityType: string, entityId: string,
  data: Record<string, unknown>, before?: Record<string, unknown> | null) => ({
    id: crypto.randomUUID(),
    userId: c.var.user.user.id,
    action, entityType, entityId,
    oldValueJson: before ? JSON.stringify(before) : null,
    newValueJson: JSON.stringify(data),
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: new Date().toISOString(),
});
const safeError = (c: AppContext, err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  if (/UNIQUE constraint failed|UNIQUE_CONSTRAINT/i.test(msg)) {
    return failed(c, 'DUPLICATE_REFERENCE', 'This document/claim reference already exists.', 409);
  }
  if (/CLAIM_OVERPAYMENT/.test(msg)) {
    return failed(c, 'CLAIM_OVERPAYMENT', 'Payment exceeds the remaining approved claim balance.', 409);
  }
  if (/CLAIM_NOT_APPROVED_OR_OUTLET_MISMATCH/.test(msg)) {
    return failed(c, 'CLAIM_NOT_APPROVED', 'Claim must be approved and belong to this outlet.', 409);
  }
  if (/FOREIGN KEY constraint failed/.test(msg)) {
    return failed(c, 'INVALID_REFERENCE', 'Linked source record is unavailable.', 400);
  }
  console.error('[COCO Documentation Masters]', err);
  return failed(c, 'DOCUMENTATION_WRITE_FAILED', 'Could not safely save this record.', 500);
};

// A single GET feeds the editor and the report. It never reads from another outlet.
cocoDocumentationMasterRoutes.get('/compliance/masters', requirePermission(PERMISSIONS.DOCUMENTS_READ), async (c: AppContext) => {
  const outletId = c.req.query('outletId')?.trim();
  if (!outletId) return validation(c, 'outletId is required.');
  if (!await scope(c, outletId)) return failed(c, 'FORBIDDEN_SCOPE', 'Outlet access denied.', 403);
  const db = getDb(c.env.DB);
  try {
    const [agreements, claims, settlements, inspections, assets, leases] = await Promise.all([
      db.select().from(cocoAgreementDetails).where(eq(cocoAgreementDetails.outletId, outletId)).orderBy(desc(cocoAgreementDetails.createdAt)).all(),
      db.select().from(cocoExpenseClaims).where(eq(cocoExpenseClaims.outletId, outletId)).orderBy(desc(cocoExpenseClaims.createdAt)).all(),
      db.select().from(cocoClaimSettlements).where(eq(cocoClaimSettlements.outletId, outletId)).orderBy(desc(cocoClaimSettlements.createdAt)).all(),
      db.select().from(cocoAssetInspections).where(eq(cocoAssetInspections.outletId, outletId)).orderBy(desc(cocoAssetInspections.inspectedOn), desc(cocoAssetInspections.createdAt)).all(),
      db.select().from(equipmentAssets).where(eq(equipmentAssets.outletId, outletId)).all(),
      db.select().from(nfrLeases).where(eq(nfrLeases.outletId, outletId)).all(),
    ]);
    const totals = new Map<string, number>();
    for (const s of settlements) totals.set(s.claimId, (totals.get(s.claimId) || 0) + s.amountPaise);
    const claimsWithTotals = claims.map((claim) => ({
      ...claim,
      paidPaise: totals.get(claim.id) || 0,
      outstandingPaise: claim.amountPaise - (totals.get(claim.id) || 0),
      settlementStatus: claim.approvalStatus !== 'APPROVED' ? claim.approvalStatus
        : (totals.get(claim.id) || 0) === claim.amountPaise ? 'PAID'
        : (totals.get(claim.id) || 0) > 0 ? 'PARTIALLY_PAID'
        : claim.dueDate && claim.dueDate < new Date().toISOString().slice(0, 10) ? 'OVERDUE' : 'PENDING',
    }));
    return ok(c, { agreements, claims: claimsWithTotals, settlements, inspections, assets, nfrLeases: leases });
  } catch (e) {
    const underlying = e instanceof Error && 'cause' in e ? String((e as Error & { cause?: unknown }).cause) : '';
    if (/no such table/i.test(String(e) + ' ' + underlying)) {
      return failed(c, 'SCHEMA_MIGRATION_REQUIRED', 'Documentation master migration 0036 has not been applied to this environment.', 503);
    }
    return safeError(c, e);
  }
});

cocoDocumentationMasterRoutes.post('/compliance/masters/agreements', requirePermission(PERMISSIONS.DOCUMENTS_WRITE), async (c: AppContext) => {
  const parsed = agreementInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validation(c, parsed.error.issues[0]?.message || 'Invalid agreement.');
  const i = parsed.data;
  if (!await scope(c, i.outletId)) return failed(c, 'FORBIDDEN_SCOPE', 'Outlet access denied.', 403);
  if (!await checkDocument(c, i.outletId, i.agreementDocumentId)) {
    return failed(c, 'DOCUMENT_OUTLET_MISMATCH', 'Agreement document must belong to this outlet.', 403);
  }
  const db = getDb(c.env.DB);
  if (i.linkedNfrLeaseId) {
    const lease = await db.select().from(nfrLeases)
      .where(and(eq(nfrLeases.id, i.linkedNfrLeaseId), eq(nfrLeases.outletId, i.outletId))).get();
    if (!lease) return failed(c, 'NFR_LEASE_NOT_FOUND', 'Linked NFR lease not found in this outlet.', 404);
  }
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(), outletId: i.outletId,
    agreementType: i.agreementType, agreementName: i.agreementName,
    agreementNumber: i.agreementNumber || null, linkedNfrLeaseId: i.linkedNfrLeaseId || null,
    counterpartyName: i.counterpartyName || null, vendorCode: i.vendorCode || null,
    customerCode: i.customerCode || null, siteClass: i.siteClass || null,
    startDate: i.agreementType === 'NFR_METADATA' ? null : i.startDate || null,
    endDate: i.agreementType === 'NFR_METADATA' ? null : i.endDate || null,
    agreementDocumentId: i.agreementDocumentId || null,
    remarks: i.remarks || null,
    createdBy: c.var.user.user.id, updatedBy: c.var.user.user.id,
    createdAt: now, updatedAt: now,
  };
  try {
    await db.batch([
      db.insert(cocoAgreementDetails).values(row),
      db.insert(auditLogs).values(audit(c, 'CREATE_COCO_AGREEMENT', 'coco_agreement', row.id, row)),
    ]);
    return ok(c, row, 201);
  } catch (e) { return safeError(c, e); }
});

cocoDocumentationMasterRoutes.put('/compliance/masters/agreements/:id', requirePermission(PERMISSIONS.DOCUMENTS_WRITE), async (c: AppContext) => {
  const parsed = agreementInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validation(c, parsed.error.issues[0]?.message || 'Invalid agreement.');
  const i = parsed.data;
  const db = getDb(c.env.DB);
  const old = await db.select().from(cocoAgreementDetails).where(eq(cocoAgreementDetails.id, (c.req.param('id') || ''))).get();
  if (!old || old.outletId !== i.outletId) return failed(c, 'AGREEMENT_NOT_FOUND', 'Agreement not found in selected outlet.', 404);
  if (!await scope(c, old.outletId)) return failed(c, 'FORBIDDEN_SCOPE', 'Outlet access denied.', 403);
  if (!await checkDocument(c, old.outletId, i.agreementDocumentId)) return failed(c, 'DOCUMENT_OUTLET_MISMATCH', 'Document belongs to another outlet.', 403);
  if (i.linkedNfrLeaseId) {
    const lease = await db.select().from(nfrLeases).where(and(eq(nfrLeases.id, i.linkedNfrLeaseId), eq(nfrLeases.outletId, i.outletId))).get();
    if (!lease) return failed(c, 'NFR_LEASE_NOT_FOUND', 'Linked NFR lease not found.', 404);
  }
  const update = {
    agreementType: i.agreementType, agreementName: i.agreementName, agreementNumber: i.agreementNumber || null,
    linkedNfrLeaseId: i.linkedNfrLeaseId || null, counterpartyName: i.counterpartyName || null,
    vendorCode: i.vendorCode || null, customerCode: i.customerCode || null,
    siteClass: i.siteClass || null,
    startDate: i.agreementType === 'NFR_METADATA' ? null : i.startDate || null,
    endDate: i.agreementType === 'NFR_METADATA' ? null : i.endDate || null,
    agreementDocumentId: i.agreementDocumentId || null, remarks: i.remarks || null,
    updatedBy: c.var.user.user.id, updatedAt: new Date().toISOString(),
  };
  try {
    await db.batch([
      db.update(cocoAgreementDetails).set(update).where(eq(cocoAgreementDetails.id, old.id)),
      db.insert(auditLogs).values(audit(c, 'UPDATE_COCO_AGREEMENT', 'coco_agreement', old.id, update, old)),
    ]);
    return ok(c, { ...old, ...update });
  } catch (e) { return safeError(c, e); }
});

cocoDocumentationMasterRoutes.post('/compliance/masters/claims', requirePermission(PERMISSIONS.DOCUMENTS_WRITE), async (c: AppContext) => {
  const parsed = claimInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validation(c, parsed.error.issues[0]?.message || 'Invalid claim.');
  const i = parsed.data;
  if (!await scope(c, i.outletId)) return failed(c, 'FORBIDDEN_SCOPE', 'Outlet access denied.', 403);
  if (!await checkDocument(c, i.outletId, i.invoiceDocumentId)) return failed(c, 'DOCUMENT_OUTLET_MISMATCH', 'Invoice document belongs to another outlet.', 403);
  const db = getDb(c.env.DB);
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(), outletId: i.outletId, claimCategory: i.claimCategory,
    title: i.title, invoiceNumber: i.invoiceNumber || null,
    periodStart: i.periodStart || null, periodEnd: i.periodEnd || null, dueDate: i.dueDate || null,
    amountPaise: i.amountPaise, invoiceDocumentId: i.invoiceDocumentId || null,
    approvalStatus: 'DRAFT' as const, approvedBy: null, approvedAt: null,
    remarks: i.remarks || null, createdBy: c.var.user.user.id, createdAt: now, updatedAt: now,
  };
  try {
    await db.batch([
      db.insert(cocoExpenseClaims).values(row),
      db.insert(auditLogs).values(audit(c, 'CREATE_COCO_CLAIM', 'coco_claim', row.id, row)),
    ]);
    return ok(c, row, 201);
  } catch (e) { return safeError(c, e); }
});

cocoDocumentationMasterRoutes.put('/compliance/masters/claims/:id', requirePermission(PERMISSIONS.DOCUMENTS_WRITE), async (c: AppContext) => {
  const parsed = claimInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validation(c, parsed.error.issues[0]?.message || 'Invalid claim.');
  const i = parsed.data;
  const db = getDb(c.env.DB);
  const old = await db.select().from(cocoExpenseClaims).where(eq(cocoExpenseClaims.id, (c.req.param('id') || ''))).get();
  if (!old || old.outletId !== i.outletId) return failed(c, 'CLAIM_NOT_FOUND', 'Claim not found in selected outlet.', 404);
  if (!await scope(c, old.outletId)) return failed(c, 'FORBIDDEN_SCOPE', 'Outlet access denied.', 403);
  if (old.approvalStatus !== 'DRAFT') return failed(c, 'CLAIM_LOCKED', 'Only draft claims may be edited.', 409);
  if (!await checkDocument(c, old.outletId, i.invoiceDocumentId)) return failed(c, 'DOCUMENT_OUTLET_MISMATCH', 'Invoice document belongs to another outlet.', 403);
  const update = {
    claimCategory: i.claimCategory, title: i.title, invoiceNumber: i.invoiceNumber || null,
    periodStart: i.periodStart || null, periodEnd: i.periodEnd || null, dueDate: i.dueDate || null,
    amountPaise: i.amountPaise, invoiceDocumentId: i.invoiceDocumentId || null,
    remarks: i.remarks || null, updatedAt: new Date().toISOString(),
  };
  try {
    await db.batch([
      db.update(cocoExpenseClaims).set(update).where(and(eq(cocoExpenseClaims.id, old.id), eq(cocoExpenseClaims.approvalStatus, 'DRAFT'))),
      db.insert(auditLogs).values(audit(c, 'UPDATE_COCO_CLAIM', 'coco_claim', old.id, update, old)),
    ]);
    return ok(c, { ...old, ...update });
  } catch (e) { return safeError(c, e); }
});

cocoDocumentationMasterRoutes.post('/compliance/masters/claims/:id/decision', requirePermission(PERMISSIONS.DOCUMENTS_WRITE), async (c: AppContext) => {
  const decision = z.object({ decision: z.enum(['APPROVED', 'REJECTED']) }).safeParse(await c.req.json().catch(() => null));
  if (!decision.success) return validation(c, 'decision must be APPROVED or REJECTED.');
  // Only a globally scoped administrator can approve spending. Separate maker/checker.
  if (!c.var.user.isGlobalAdmin) return failed(c, 'APPROVAL_FORBIDDEN', 'A global administrator must approve or reject claims.', 403);
  const db = getDb(c.env.DB);
  const claim = await db.select().from(cocoExpenseClaims).where(eq(cocoExpenseClaims.id, (c.req.param('id') || ''))).get();
  if (!claim) return failed(c, 'CLAIM_NOT_FOUND', 'Claim not found.', 404);
  if (!await scope(c, claim.outletId)) return failed(c, 'FORBIDDEN_SCOPE', 'Outlet access denied.', 403);
  if (claim.approvalStatus !== 'DRAFT') return failed(c, 'CLAIM_LOCKED', 'Only draft claims may be decided.', 409);
  if (decision.data.decision === 'APPROVED' && claim.createdBy === c.var.user.user.id) {
    return failed(c, 'MAKER_CHECKER', 'A claim creator cannot approve their own claim.', 403);
  }
  const patch = decision.data.decision === 'APPROVED'
    ? { approvalStatus: 'APPROVED' as const, approvedBy: c.var.user.user.id, approvedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    : { approvalStatus: 'REJECTED' as const, approvedBy: null, approvedAt: null, updatedAt: new Date().toISOString() };
  try {
    await db.batch([
      db.update(cocoExpenseClaims).set(patch).where(and(eq(cocoExpenseClaims.id, claim.id), eq(cocoExpenseClaims.approvalStatus, 'DRAFT'))),
      db.insert(auditLogs).values(audit(c, 'DECIDE_COCO_CLAIM', 'coco_claim', claim.id, patch, claim)),
    ]);
    return ok(c, { ...claim, ...patch });
  } catch (e) { return safeError(c, e); }
});

cocoDocumentationMasterRoutes.post('/compliance/masters/claims/:id/settlements', requirePermission(PERMISSIONS.DOCUMENTS_WRITE), async (c: AppContext) => {
  const parsed = settlementInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validation(c, parsed.error.issues[0]?.message || 'Invalid settlement.');
  const db = getDb(c.env.DB);
  const claim = await db.select().from(cocoExpenseClaims).where(eq(cocoExpenseClaims.id, (c.req.param('id') || ''))).get();
  if (!claim) return failed(c, 'CLAIM_NOT_FOUND', 'Claim not found.', 404);
  if (!await scope(c, claim.outletId)) return failed(c, 'FORBIDDEN_SCOPE', 'Outlet access denied.', 403);
  if (claim.approvalStatus !== 'APPROVED') return failed(c, 'CLAIM_NOT_APPROVED', 'Claim must be approved before payment.', 409);
  if (!await checkDocument(c, claim.outletId, parsed.data.receiptDocumentId)) {
    return failed(c, 'DOCUMENT_OUTLET_MISMATCH', 'Payment receipt must belong to the claim outlet.', 403);
  }
  const row = {
    id: crypto.randomUUID(), claimId: claim.id, outletId: claim.outletId,
    amountPaise: parsed.data.amountPaise, paymentDate: parsed.data.paymentDate,
    paymentMethod: parsed.data.paymentMethod, referenceNumber: parsed.data.referenceNumber,
    receiptDocumentId: parsed.data.receiptDocumentId, remarks: parsed.data.remarks || null,
    recordedBy: c.var.user.user.id, createdAt: new Date().toISOString(),
  };
  try {
    await db.batch([
      db.insert(cocoClaimSettlements).values(row),
      db.insert(auditLogs).values(audit(c, 'SETTLE_COCO_CLAIM', 'coco_claim_settlement', row.id, row)),
    ]);
    return ok(c, row, 201);
  } catch (e) { return safeError(c, e); }
});

cocoDocumentationMasterRoutes.post('/compliance/masters/inspections',
  requirePermission(PERMISSIONS.DOCUMENTS_WRITE),
  requirePermission(PERMISSIONS.EQUIPMENT_ASSETS_WRITE),
  async (c: AppContext) => {
    const parsed = inspectionInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validation(c, parsed.error.issues[0]?.message || 'Invalid inspection.');
    const i = parsed.data;
    if (!await scope(c, i.outletId)) return failed(c, 'FORBIDDEN_SCOPE', 'Outlet access denied.', 403);
    if (!await checkDocument(c, i.outletId, i.evidenceDocumentId)) return failed(c, 'DOCUMENT_OUTLET_MISMATCH', 'Inspection evidence must belong to this outlet.', 403);
    const db = getDb(c.env.DB);
    const asset = await db.select().from(equipmentAssets).where(and(eq(equipmentAssets.id, i.equipmentAssetId), eq(equipmentAssets.outletId, i.outletId))).get();
    if (!asset) return failed(c, 'EQUIPMENT_NOT_FOUND', 'Register the equipment asset in this outlet first.', 404);
    const row = {
      id: crypto.randomUUID(), outletId: i.outletId, equipmentAssetId: i.equipmentAssetId,
      inspectedOn: i.inspectedOn, condition: i.condition, nextServiceDate: i.nextServiceDate || null,
      remarks: i.remarks || null, evidenceDocumentId: i.evidenceDocumentId || null,
      recordedBy: c.var.user.user.id, createdAt: new Date().toISOString(),
    };
    try {
      await db.batch([
        db.insert(cocoAssetInspections).values(row),
        db.insert(auditLogs).values(audit(c, 'RECORD_COCO_INSPECTION', 'coco_asset_inspection', row.id, row)),
      ]);
      return ok(c, row, 201);
    } catch (e) { return safeError(c, e); }
  }
);
