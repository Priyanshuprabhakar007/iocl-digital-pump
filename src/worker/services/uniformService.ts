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
  if (msg.includes('HR_UNIFORM_ITEM_INACTIVE')) {
    throw new UniformError('HR_UNIFORM_ITEM_INACTIVE', 'Uniform item is inactive', 400);
  }
  if (msg.includes('HR_UNIFORM_VARIANT_NOT_FOUND')) {
    throw new UniformError('HR_UNIFORM_VARIANT_NOT_FOUND', 'Uniform variant not found', 404);
  }
  if (msg.includes('idx_hr_uniform_variants_item_size') || (msg.includes('UNIQUE constraint') && msg.includes('hr_uniform_variants'))) {
    throw new UniformError('HR_UNIFORM_VARIANT_EXISTS', 'A variant with this size already exists for this uniform item', 409);
  }
  if (msg.includes('HR_UNIFORM_VARIANT_OUTLET_MISMATCH')) {
    throw new UniformError('HR_UNIFORM_VARIANT_OUTLET_MISMATCH', 'Variant outlet must match uniform item/outlet', 400);
  }
  if (msg.includes('HR_UNIFORM_VARIANT_INACTIVE')) {
    throw new UniformError('HR_UNIFORM_VARIANT_INACTIVE', 'Uniform variant is inactive', 400);
  }
  if (msg.includes('HR_UNIFORM_INSUFFICIENT_STOCK')) {
    throw new UniformError('HR_UNIFORM_INSUFFICIENT_STOCK', 'Insufficient stock available for this variant', 400);
  }
  if (msg.includes('HR_UNIFORM_INVALID_TRANSACTION_TYPE')) {
    throw new UniformError('HR_UNIFORM_INVALID_TRANSACTION_TYPE', 'Invalid or prohibited transaction type', 400);
  }
  if (msg.includes('HR_UNIFORM_ISSUE_NOT_FOUND')) {
    throw new UniformError('HR_UNIFORM_ISSUE_NOT_FOUND', 'Uniform issue record not found', 404);
  }
  if (msg.includes('HR_UNIFORM_ISSUE_ALREADY_CLOSED')) {
    throw new UniformError('HR_UNIFORM_ISSUE_ALREADY_CLOSED', 'Uniform issue is already closed or processed', 409);
  }
  if (msg.includes('HR_UNIFORM_STAFF_NOT_FOUND')) {
    throw new UniformError('HR_UNIFORM_STAFF_NOT_FOUND', 'Staff member not found', 404);
  }
  if (msg.includes('HR_UNIFORM_STAFF_OUTLET_MISMATCH')) {
    throw new UniformError('HR_UNIFORM_STAFF_OUTLET_MISMATCH', 'Staff member outlet mismatch', 400);
  }
  if (msg.includes('HR_UNIFORM_STAFF_NOT_ACTIVE')) {
    throw new UniformError('HR_UNIFORM_STAFF_NOT_ACTIVE', 'Staff member is not active', 400);
  }
  if (msg.includes('HR_UNIFORM_INVALID_RETURN_CONDITION') || msg.includes('HR_UNIFORM_INVALID_RESTOCK')) {
    throw new UniformError('HR_UNIFORM_INVALID_RETURN_CONDITION', 'Invalid return condition or restock eligibility', 400);
  }
  if (msg.includes('HR_UNIFORM_REPLACEMENT_STOCK_UNAVAILABLE')) {
    throw new UniformError('HR_UNIFORM_REPLACEMENT_STOCK_UNAVAILABLE', 'Insufficient stock for replacement variant', 400);
  }
  if (msg.includes('HR_UNIFORM_REPLACEMENT_SELF_REFERENCE')) {
    throw new UniformError('HR_UNIFORM_REPLACEMENT_SELF_REFERENCE', 'Replacement cannot reference itself', 400);
  }
  if (msg.includes('HR_UNIFORM_REPLACEMENT_SOURCE_MISMATCH')) {
    throw new UniformError('HR_UNIFORM_REPLACEMENT_SOURCE_MISMATCH', 'Replacement source issue mismatch', 400);
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
    const id = `uitem-${crypto.randomUUID()}`;

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

      await this.auditRepo.logAction({
        id: `aud-${crypto.randomUUID()}`,
        userId,
        action: 'HR_UNIFORM_ITEM_CREATED',
        entityType: 'hr_uniform_items',
        entityId: id,
        newValue: { itemCode: parsed.itemCode, itemName: parsed.itemName, category: parsed.category },
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

      await this.auditRepo.logAction({
        id: `aud-${crypto.randomUUID()}`,
        userId,
        action: 'HR_UNIFORM_ITEM_UPDATED',
        entityType: 'hr_uniform_items',
        entityId: itemId,
        newValue: parsed,
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
    const id = `uvar-${crypto.randomUUID()}`;

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

      await this.auditRepo.logAction({
        id: `aud-${crypto.randomUUID()}`,
        userId,
        action: 'HR_UNIFORM_VARIANT_CREATED',
        entityType: 'hr_uniform_variants',
        entityId: id,
        newValue: { uniformItemId: parsed.uniformItemId, sizeLabel: parsed.sizeLabel },
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

      await this.auditRepo.logAction({
        id: `aud-${crypto.randomUUID()}`,
        userId,
        action: 'HR_UNIFORM_VARIANT_UPDATED',
        entityType: 'hr_uniform_variants',
        entityId: variantId,
        newValue: parsed,
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
    if (['ISSUE_OUT', 'RETURN_IN'].includes(parsed.transactionType)) {
      throw new UniformError('HR_UNIFORM_INVALID_TRANSACTION_TYPE', 'Manual stock transactions cannot be ISSUE_OUT or RETURN_IN', 400);
    }

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
    const id = `ustx-${crypto.randomUUID()}`;

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

      await this.auditRepo.logAction({
        id: `aud-${crypto.randomUUID()}`,
        userId,
        action: 'HR_UNIFORM_STOCK_TRANSACTION_CREATED',
        entityType: 'hr_uniform_stock_transactions',
        entityId: id,
        newValue: { variantId: parsed.variantId, transactionType: parsed.transactionType, quantity: parsed.quantity },
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
    const issueId = `uiss-${crypto.randomUUID()}`;
    const txId = `ustx-${crypto.randomUUID()}`;

    try {
      const stockTxData = {
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
      };

      const issueData = {
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
      };

      const issue = await this.uniformRepo.issueUniformAtomic(issueData, stockTxData);

      await this.auditRepo.logAction({
        id: `aud-${crypto.randomUUID()}`,
        userId,
        action: 'HR_UNIFORM_ISSUED',
        entityType: 'hr_uniform_issues',
        entityId: issueId,
        newValue: { staffId: parsed.staffId, variantId: parsed.variantId, quantity: parsed.quantity },
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
    const txId = `ustx-${crypto.randomUUID()}`;

    try {
      let stockTxData: any = undefined;
      if (parsed.returnToStock) {
        if (['DAMAGED', 'LOST'].includes(parsed.condition)) {
          throw new UniformError('HR_UNIFORM_INVALID_RESTOCK', 'Damaged or lost items cannot be returned to usable stock', 400);
        }

        stockTxData = {
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
        };
      }

      const updateData = {
        status: 'RETURNED',
        closedAt: now,
        closedBy: userId,
        conditionOnClose: parsed.condition,
        updatedAt: now,
      };

      const updated = await this.uniformRepo.returnUniformAtomic(issueId, updateData, stockTxData);

      await this.auditRepo.logAction({
        id: `aud-${crypto.randomUUID()}`,
        userId,
        action: 'HR_UNIFORM_RETURNED',
        entityType: 'hr_uniform_issues',
        entityId: issueId,
        newValue: { condition: parsed.condition, returnToStock: parsed.returnToStock },
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
    const returnTxId = `ustx-${crypto.randomUUID()}`;
    const issueTxId = `ustx-${crypto.randomUUID()}`;
    const newIssueId = `uiss-${crypto.randomUUID()}`;

    try {
      let stockTxDataIn: any = undefined;
      if (parsed.returnOldToStock) {
        if (['DAMAGED', 'LOST'].includes(parsed.oldCondition)) {
          throw new UniformError('HR_UNIFORM_INVALID_RESTOCK', 'Damaged or lost items cannot be returned to usable stock', 400);
        }

        stockTxDataIn = {
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
        };
      }

      const updateData = {
        status: 'REPLACED',
        closedAt: now,
        closedBy: userId,
        conditionOnClose: parsed.oldCondition,
        replacementReason: parsed.replacementReason,
        updatedAt: now,
      };

      const stockTxDataOut = {
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
      };

      const newIssueData = {
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
      };

      const res = await this.uniformRepo.replaceUniformAtomic(issueId, updateData, newIssueData, stockTxDataOut, stockTxDataIn);

      await this.auditRepo.logAction({
        id: `aud-${crypto.randomUUID()}`,
        userId,
        action: 'HR_UNIFORM_REPLACED',
        entityType: 'hr_uniform_issues',
        entityId: newIssueId,
        newValue: { oldIssueId: issueId, replacementVariantId: parsed.replacementVariantId, reason: parsed.replacementReason },
        createdAt: now,
      });

      return res;
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
