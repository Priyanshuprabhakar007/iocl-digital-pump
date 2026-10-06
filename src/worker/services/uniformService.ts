import { AppDatabase } from '../../db';
import { UniformRepository } from '../repositories/uniformRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { HrRepository } from '../repositories/hrRepository';
import {
  UniformItemCreateSchema,
  UniformItemUpdateSchema,
  UniformVariantCreateSchema,
  UniformVariantUpdateSchema,
  UniformStockTransactionCreateSchema,
  UniformIssueCreateSchema,
  UniformReturnSchema,
  UniformReplacementSchema,
} from '../../shared/validators';
import {
  HrUniformItem,
  HrUniformVariant,
  HrUniformStockTransaction,
  HrUniformIssue,
  HrUniformStockSummary,
  HrUniformReportSummary,
  HrUniformStatus,
} from '../../shared/types';

export class UniformError extends Error {
  constructor(public code: string, message: string, public status: number = 400) {
    super(message);
    this.name = 'UniformError';
  }
}

export function handleUniformDbError(err: any): never {
  if (err instanceof UniformError) {
    throw err;
  }
  const msg = String(err?.message || err);

  if (msg.includes('HR_UNIFORM_ITEM_NOT_FOUND')) {
    throw new UniformError('HR_UNIFORM_ITEM_NOT_FOUND', 'Uniform item not found', 404);
  }
  if (msg.includes('idx_hr_uniform_items_outlet_code') || (msg.includes('UNIQUE constraint') && msg.includes('hr_uniform_items'))) {
    throw new UniformError('HR_UNIFORM_ITEM_CODE_EXISTS', 'A uniform item with this code already exists for this outlet', 409);
  }
  if (msg.includes('HR_UNIFORM_VARIANT_NOT_FOUND')) {
    throw new UniformError('HR_UNIFORM_VARIANT_NOT_FOUND', 'Uniform variant not found', 404);
  }
  if (msg.includes('idx_hr_uniform_variants_item_size') || (msg.includes('UNIQUE constraint') && msg.includes('hr_uniform_variants'))) {
    throw new UniformError('HR_UNIFORM_VARIANT_EXISTS', 'A variant with this size already exists for this uniform item', 409);
  }
  if (msg.includes('HR_UNIFORM_VARIANT_OUTLET_MISMATCH')) {
    throw new UniformError('HR_UNIFORM_VARIANT_OUTLET_MISMATCH', 'Variant outlet must match uniform item outlet', 400);
  }
  if (msg.includes('HR_UNIFORM_INSUFFICIENT_STOCK')) {
    throw new UniformError('HR_UNIFORM_INSUFFICIENT_STOCK', 'Insufficient stock available for this variant', 400);
  }
  if (msg.includes('HR_UNIFORM_ISSUE_NOT_FOUND')) {
    throw new UniformError('HR_UNIFORM_ISSUE_NOT_FOUND', 'Uniform issue record not found', 404);
  }

  throw new UniformError('INTERNAL_SERVER_ERROR', msg, 500);
}

export class UniformService {
  private uniformRepo: UniformRepository;
  private auditRepo: AuditRepository;
  private hrRepo: HrRepository;

  constructor(private db: AppDatabase) {
    this.uniformRepo = new UniformRepository(db);
    this.auditRepo = new AuditRepository(db);
    this.hrRepo = new HrRepository(db);
  }

  // ==========================================
  // ITEMS
  // ==========================================

  async createItem(
    outletId: string,
    userId: string,
    payload: unknown
  ): Promise<HrUniformItem> {
    const parsed = UniformItemCreateSchema.parse(payload);
    const existing = await this.uniformRepo.getItemByCode(outletId, parsed.itemCode);
    if (existing) {
      throw new UniformError('HR_UNIFORM_ITEM_CODE_EXISTS', 'A uniform item with this code already exists for this outlet', 409);
    }

    const now = new Date().toISOString();
    const id = `uitem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      const item = await this.uniformRepo.createItem({
        id,
        outletId,
        itemCode: parsed.itemCode,
        itemName: parsed.itemName,
        category: parsed.category,
        description: parsed.description || null,
        status: parsed.status as HrUniformStatus,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      await this.auditRepo.log({
        id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId,
        outletId,
        action: 'HR_UNIFORM_ITEM_CREATED',
        targetType: 'hr_uniform_items',
        targetId: id,
        details: JSON.stringify({ itemCode: parsed.itemCode, itemName: parsed.itemName, category: parsed.category }),
        createdAt: now,
      });

      return item;
    } catch (err) {
      handleUniformDbError(err);
    }
  }

  async updateItem(
    outletId: string,
    itemId: string,
    userId: string,
    payload: unknown
  ): Promise<HrUniformItem> {
    const parsed = UniformItemUpdateSchema.parse(payload);
    const item = await this.uniformRepo.getItemById(itemId);
    if (!item || item.outletId !== outletId) {
      throw new UniformError('HR_UNIFORM_ITEM_NOT_FOUND', 'Uniform item not found', 404);
    }

    const now = new Date().toISOString();
    try {
      const updated = await this.uniformRepo.updateItem(itemId, {
        itemName: parsed.itemName,
        category: parsed.category,
        description: parsed.description,
        status: parsed.status as HrUniformStatus,
        updatedAt: now,
      });

      await this.auditRepo.log({
        id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId,
        outletId,
        action: 'HR_UNIFORM_ITEM_UPDATED',
        targetType: 'hr_uniform_items',
        targetId: itemId,
        details: JSON.stringify(parsed),
        createdAt: now,
      });

      return updated;
    } catch (err) {
      handleUniformDbError(err);
    }
  }

  async getItems(outletId: string, filters?: { category?: string; status?: string; search?: string }) {
    return this.uniformRepo.getItems(outletId, filters as any);
  }

  // ==========================================
  // VARIANTS
  // ==========================================

  async createVariant(
    outletId: string,
    userId: string,
    payload: unknown
  ): Promise<HrUniformVariant> {
    const parsed = UniformVariantCreateSchema.parse(payload);
    const item = await this.uniformRepo.getItemById(parsed.uniformItemId);
    if (!item || item.outletId !== outletId) {
      throw new UniformError('HR_UNIFORM_ITEM_NOT_FOUND', 'Uniform item not found', 404);
    }

    const existingVar = await this.uniformRepo.getVariantByItemAndSize(parsed.uniformItemId, parsed.sizeLabel);
    if (existingVar) {
      throw new UniformError('HR_UNIFORM_VARIANT_EXISTS', 'A variant with this size already exists for this uniform item', 409);
    }

    const now = new Date().toISOString();
    const id = `uvar_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      const variant = await this.uniformRepo.createVariant({
        id,
        outletId,
        uniformItemId: parsed.uniformItemId,
        sizeLabel: parsed.sizeLabel,
        sizeSortOrder: parsed.sizeSortOrder,
        reorderLevel: parsed.reorderLevel,
        status: parsed.status as HrUniformStatus,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      await this.auditRepo.log({
        id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId,
        outletId,
        action: 'HR_UNIFORM_VARIANT_CREATED',
        targetType: 'hr_uniform_variants',
        targetId: id,
        details: JSON.stringify({ uniformItemId: parsed.uniformItemId, sizeLabel: parsed.sizeLabel }),
        createdAt: now,
      });

      return variant;
    } catch (err) {
      handleUniformDbError(err);
    }
  }

  async updateVariant(
    outletId: string,
    variantId: string,
    userId: string,
    payload: unknown
  ): Promise<HrUniformVariant> {
    const parsed = UniformVariantUpdateSchema.parse(payload);
    const variant = await this.uniformRepo.getVariantById(variantId);
    if (!variant || variant.outletId !== outletId) {
      throw new UniformError('HR_UNIFORM_VARIANT_NOT_FOUND', 'Uniform variant not found', 404);
    }

    const now = new Date().toISOString();
    try {
      const updated = await this.uniformRepo.updateVariant(variantId, {
        sizeSortOrder: parsed.sizeSortOrder,
        reorderLevel: parsed.reorderLevel,
        status: parsed.status as HrUniformStatus,
        updatedAt: now,
      });

      await this.auditRepo.log({
        id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId,
        outletId,
        action: 'HR_UNIFORM_VARIANT_UPDATED',
        targetType: 'hr_uniform_variants',
        targetId: variantId,
        details: JSON.stringify(parsed),
        createdAt: now,
      });

      return updated;
    } catch (err) {
      handleUniformDbError(err);
    }
  }

  async getVariants(outletId: string, itemId?: string) {
    return this.uniformRepo.getVariants(outletId, itemId);
  }

  // ==========================================
  // STOCK TRANSACTIONS
  // ==========================================

  async createStockTransaction(
    outletId: string,
    userId: string,
    payload: unknown
  ): Promise<HrUniformStockTransaction> {
    const parsed = UniformStockTransactionCreateSchema.parse(payload);
    const variant = await this.uniformRepo.getVariantById(parsed.variantId);
    if (!variant || variant.outletId !== outletId) {
      throw new UniformError('HR_UNIFORM_VARIANT_NOT_FOUND', 'Uniform variant not found', 404);
    }

    if (parsed.transactionType === 'ADJUSTMENT_OUT') {
      const currentStock = await this.uniformRepo.calculateVariantStock(parsed.variantId);
      if (currentStock < parsed.quantity) {
        throw new UniformError('HR_UNIFORM_INSUFFICIENT_STOCK', 'Adjustment out exceeds current variant stock', 400);
      }
    }

    const now = new Date().toISOString();
    const id = `ustx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      const tx = await this.uniformRepo.createStockTransaction({
        id,
        outletId,
        variantId: parsed.variantId,
        transactionType: parsed.transactionType as any,
        quantity: parsed.quantity,
        referenceType: parsed.referenceType || null,
        referenceId: parsed.referenceId || null,
        notes: parsed.notes || null,
        occurredAt: now,
        createdBy: userId,
        createdAt: now,
      });

      await this.auditRepo.log({
        id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId,
        outletId,
        action: 'HR_UNIFORM_STOCK_TRANSACTION_CREATED',
        targetType: 'hr_uniform_stock_transactions',
        targetId: id,
        details: JSON.stringify({ variantId: parsed.variantId, transactionType: parsed.transactionType, quantity: parsed.quantity }),
        createdAt: now,
      });

      return tx;
    } catch (err) {
      handleUniformDbError(err);
    }
  }

  async getStockTransactions(outletId: string, filters?: any) {
    return this.uniformRepo.getStockTransactions(outletId, filters);
  }

  async getStockSummary(outletId: string): Promise<HrUniformStockSummary[]> {
    return this.uniformRepo.getStockSummary(outletId);
  }

  // ==========================================
  // ISSUE / RETURN / REPLACEMENT LIFECYCLE
  // ==========================================

  async issueUniform(
    outletId: string,
    userId: string,
    payload: unknown
  ): Promise<HrUniformIssue> {
    const parsed = UniformIssueCreateSchema.parse(payload);

    // Verify staff
    const staff = await this.hrRepo.getStaffById(parsed.staffId);
    if (!staff || staff.outletId !== outletId) {
      throw new UniformError('HR_UNIFORM_STAFF_OUTLET_MISMATCH', 'Staff member does not belong to this outlet', 400);
    }
    if (staff.employmentStatus !== 'ACTIVE') {
      throw new UniformError('HR_UNIFORM_STAFF_NOT_ACTIVE', 'Staff member is not active', 400);
    }

    // Verify variant and item
    const variant = await this.uniformRepo.getVariantById(parsed.variantId);
    if (!variant || variant.outletId !== outletId) {
      throw new UniformError('HR_UNIFORM_VARIANT_OUTLET_MISMATCH', 'Variant does not belong to this outlet', 400);
    }
    if (variant.status !== 'ACTIVE') {
      throw new UniformError('HR_UNIFORM_VARIANT_INACTIVE', 'Uniform variant is not active', 400);
    }

    const item = await this.uniformRepo.getItemById(variant.uniformItemId);
    if (!item || item.status !== 'ACTIVE') {
      throw new UniformError('HR_UNIFORM_ITEM_INACTIVE', 'Uniform item is not active', 400);
    }

    // Verify stock
    const currentStock = await this.uniformRepo.calculateVariantStock(parsed.variantId);
    if (currentStock < parsed.quantity) {
      throw new UniformError('HR_UNIFORM_INSUFFICIENT_STOCK', 'Insufficient stock available for issuing this uniform', 400);
    }

    const now = new Date().toISOString();
    const issueId = `uiss_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const txId = `ustx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      // Create stock transaction (ISSUE_OUT)
      await this.uniformRepo.createStockTransaction({
        id: txId,
        outletId,
        variantId: parsed.variantId,
        transactionType: 'ISSUE_OUT',
        quantity: parsed.quantity,
        referenceType: 'hr_uniform_issues',
        referenceId: issueId,
        notes: parsed.notes || `Issued to staff ${staff.employeeCode}`,
        occurredAt: now,
        createdBy: userId,
        createdAt: now,
      });

      // Create issue record
      const issue = await this.uniformRepo.createIssue({
        id: issueId,
        outletId,
        staffId: parsed.staffId,
        variantId: parsed.variantId,
        quantity: parsed.quantity,
        issuedAt: now,
        issuedBy: userId,
        conditionAtIssue: parsed.conditionAtIssue,
        status: 'ISSUED',
        notes: parsed.notes || null,
        createdAt: now,
        updatedAt: now,
      });

      await this.auditRepo.log({
        id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId,
        outletId,
        action: 'HR_UNIFORM_ISSUED',
        targetType: 'hr_uniform_issues',
        targetId: issueId,
        details: JSON.stringify({ staffId: parsed.staffId, variantId: parsed.variantId, quantity: parsed.quantity }),
        createdAt: now,
      });

      return issue;
    } catch (err) {
      handleUniformDbError(err);
    }
  }

  async returnUniform(
    outletId: string,
    issueId: string,
    userId: string,
    payload: unknown
  ): Promise<HrUniformIssue> {
    const parsed = UniformReturnSchema.parse(payload);
    const issue = await this.uniformRepo.getIssueById(issueId);
    if (!issue || issue.outletId !== outletId) {
      throw new UniformError('HR_UNIFORM_ISSUE_NOT_FOUND', 'Uniform issue record not found', 404);
    }

    if (issue.status !== 'ISSUED') {
      throw new UniformError('HR_UNIFORM_ISSUE_ALREADY_CLOSED', 'Uniform issue is already closed or processed', 409);
    }

    const now = new Date().toISOString();
    const txId = `ustx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      if (parsed.returnToStock) {
        if (['DAMAGED', 'LOST'].includes(parsed.condition)) {
          throw new UniformError('HR_UNIFORM_INVALID_RESTOCK', 'Damaged or lost items cannot be returned to usable stock', 400);
        }

        await this.uniformRepo.createStockTransaction({
          id: txId,
          outletId,
          variantId: issue.variantId,
          transactionType: 'RETURN_IN',
          quantity: issue.quantity,
          referenceType: 'hr_uniform_issues',
          referenceId: issueId,
          notes: parsed.notes || `Returned from staff ${issue.employeeCode}`,
          occurredAt: now,
          createdBy: userId,
          createdAt: now,
        });
      }

      const updated = await this.uniformRepo.updateIssue(issueId, {
        status: 'RETURNED',
        closedAt: now,
        closedBy: userId,
        conditionOnClose: parsed.condition,
        updatedAt: now,
      });

      await this.auditRepo.log({
        id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId,
        outletId,
        action: 'HR_UNIFORM_RETURNED',
        targetType: 'hr_uniform_issues',
        targetId: issueId,
        details: JSON.stringify({ condition: parsed.condition, returnToStock: parsed.returnToStock }),
        createdAt: now,
      });

      return updated;
    } catch (err) {
      handleUniformDbError(err);
    }
  }

  async replaceUniform(
    outletId: string,
    issueId: string,
    userId: string,
    payload: unknown
  ): Promise<{ oldIssue: HrUniformIssue; newIssue: HrUniformIssue }> {
    const parsed = UniformReplacementSchema.parse(payload);
    const oldIssue = await this.uniformRepo.getIssueById(issueId);
    if (!oldIssue || oldIssue.outletId !== outletId) {
      throw new UniformError('HR_UNIFORM_ISSUE_NOT_FOUND', 'Uniform issue record not found', 404);
    }

    if (oldIssue.status !== 'ISSUED') {
      throw new UniformError('HR_UNIFORM_ISSUE_ALREADY_CLOSED', 'Original uniform issue is already closed', 409);
    }

    // Verify replacement variant
    const newVariant = await this.uniformRepo.getVariantById(parsed.replacementVariantId);
    if (!newVariant || newVariant.outletId !== outletId) {
      throw new UniformError('HR_UNIFORM_VARIANT_OUTLET_MISMATCH', 'Replacement variant does not belong to this outlet', 400);
    }
    if (newVariant.status !== 'ACTIVE') {
      throw new UniformError('HR_UNIFORM_VARIANT_INACTIVE', 'Replacement variant is not active', 400);
    }

    const currentStock = await this.uniformRepo.calculateVariantStock(parsed.replacementVariantId);
    if (currentStock < parsed.quantity) {
      throw new UniformError('HR_UNIFORM_REPLACEMENT_STOCK_UNAVAILABLE', 'Insufficient stock for replacement variant', 400);
    }

    const now = new Date().toISOString();
    const returnTxId = `ustx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const issueTxId = `ustx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const newIssueId = `uiss_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      // 1. If returning old item to stock
      if (parsed.returnOldToStock) {
        if (['DAMAGED', 'LOST'].includes(parsed.oldCondition)) {
          throw new UniformError('HR_UNIFORM_INVALID_RESTOCK', 'Damaged or lost items cannot be returned to usable stock', 400);
        }

        await this.uniformRepo.createStockTransaction({
          id: returnTxId,
          outletId,
          variantId: oldIssue.variantId,
          transactionType: 'RETURN_IN',
          quantity: oldIssue.quantity,
          referenceType: 'hr_uniform_issues',
          referenceId: issueId,
          notes: parsed.notes || `Replacement return from staff ${oldIssue.employeeCode}`,
          occurredAt: now,
          createdBy: userId,
          createdAt: now,
        });
      }

      // 2. Close old issue as REPLACED
      const updatedOld = await this.uniformRepo.updateIssue(issueId, {
        status: 'REPLACED',
        closedAt: now,
        closedBy: userId,
        conditionOnClose: parsed.oldCondition,
        replacementReason: parsed.replacementReason,
        updatedAt: now,
      });

      // 3. Issue new variant (ISSUE_OUT)
      await this.uniformRepo.createStockTransaction({
        id: issueTxId,
        outletId,
        variantId: parsed.replacementVariantId,
        transactionType: 'ISSUE_OUT',
        quantity: parsed.quantity,
        referenceType: 'hr_uniform_issues',
        referenceId: newIssueId,
        notes: `Replacement for issue ${issueId}: ${parsed.replacementReason}`,
        occurredAt: now,
        createdBy: userId,
        createdAt: now,
      });

      const newIssue = await this.uniformRepo.createIssue({
        id: newIssueId,
        outletId,
        staffId: oldIssue.staffId,
        variantId: parsed.replacementVariantId,
        quantity: parsed.quantity,
        issuedAt: now,
        issuedBy: userId,
        conditionAtIssue: 'NEW',
        status: 'ISSUED',
        notes: parsed.notes || `Replacement for issue ${issueId}`,
        createdAt: now,
        updatedAt: now,
        replacesIssueId: issueId,
      });

      await this.auditRepo.log({
        id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId,
        outletId,
        action: 'HR_UNIFORM_REPLACED',
        targetType: 'hr_uniform_issues',
        targetId: newIssueId,
        details: JSON.stringify({ oldIssueId: issueId, replacementVariantId: parsed.replacementVariantId, reason: parsed.replacementReason }),
        createdAt: now,
      });

      return { oldIssue: updatedOld, newIssue };
    } catch (err) {
      handleUniformDbError(err);
    }
  }

  async getIssues(outletId: string, filters?: any) {
    return this.uniformRepo.getIssues(outletId, filters);
  }

  async getIssueById(outletId: string, issueId: string) {
    const issue = await this.uniformRepo.getIssueById(issueId);
    if (!issue || issue.outletId !== outletId) {
      throw new UniformError('HR_UNIFORM_ISSUE_NOT_FOUND', 'Uniform issue record not found', 404);
    }
    return issue;
  }

  async getStaffIssueHistory(outletId: string, staffId?: string, fromDate?: string, toDate?: string) {
    return this.uniformRepo.getStaffIssueHistory(outletId, staffId, fromDate, toDate);
  }

  async getReportSummary(outletId: string): Promise<HrUniformReportSummary> {
    return this.uniformRepo.getReportSummary(outletId);
  }
}
