import { LubeRepository } from '../repositories/lubeRepository';
import { PumpRepository } from '../repositories/pumpRepository';
import { AuditRepository } from '../repositories/auditRepository';
import {
  LubeSku,
  LubeSkuPrice,
  LubeStockTransaction,
  LubeShiftSale,
  LubeStockSummaryItem,
  LubeShiftSummary,
  LubeDailySummary,
  LubeStockUnit,
} from '../../shared/types';
import {
  parseLubeQuantity,
  calculateLubeRevenuePaise,
} from '../../shared/lubeUtils';
import { parseMoneyToPaise } from '../../shared/financialUtils';

export class LubeError extends Error {
  constructor(public code: string, message: string, public status: number = 400) {
    super(message);
    this.name = 'LubeError';
  }
}

function safeParseQuantity(unit: LubeStockUnit, raw: string, fieldName = 'quantity'): number {
  try {
    return parseLubeQuantity(unit, raw);
  } catch {
    throw new LubeError('VALIDATION_ERROR', `Invalid ${fieldName} format for stock unit ${unit}`, 400);
  }
}

export class LubeService {
  constructor(
    private lubeRepo: LubeRepository,
    private pumpRepo: PumpRepository,
    private auditRepo: AuditRepository
  ) {}

  // ==========================================
  // SKU CATALOG
  // ==========================================

  async listSkus(outletId: string): Promise<LubeSku[]> {
    return this.lubeRepo.listSkusByOutlet(outletId);
  }

  async getSkuById(id: string): Promise<LubeSku | null> {
    return this.lubeRepo.findSkuById(id);
  }

  async createSku(
    userId: string,
    outletId: string,
    input: {
      skuCode: string;
      name: string;
      category: string;
      stockUnit: LubeStockUnit;
      reorderThreshold: string;
      status?: 'ACTIVE' | 'INACTIVE';
    }
  ): Promise<LubeSku> {
    const existing = await this.lubeRepo.findSkuByCode(outletId, input.skuCode);
    if (existing) {
      throw new LubeError('DUPLICATE_SKU_CODE', `SKU code ${input.skuCode} already exists for this outlet`, 409);
    }

    const reorderThresholdSubunits = safeParseQuantity(input.stockUnit, input.reorderThreshold, 'reorder threshold');
    if (reorderThresholdSubunits < 0) {
      throw new LubeError('VALIDATION_ERROR', 'Reorder threshold cannot be negative', 400);
    }

    const now = new Date().toISOString();
    const id = `lube-sku-${crypto.randomUUID()}`;

    const sku = await this.lubeRepo.createSku({
      id,
      outletId,
      skuCode: input.skuCode.toUpperCase().trim(),
      name: input.name.trim(),
      category: input.category.trim(),
      stockUnit: input.stockUnit,
      reorderThresholdSubunits,
      status: input.status || 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });

    await this.auditRepo.logAction({
      id: crypto.randomUUID(),
      userId,
      action: 'LUBE_SKU_CREATE',
      entityType: 'LUBE_SKU',
      entityId: sku.id,
      oldValue: null,
      newValue: sku as any,
      createdAt: now,
    });

    return sku;
  }

  async updateSku(
    userId: string,
    skuId: string,
    input: {
      name?: string;
      category?: string;
      reorderThreshold?: string;
      status?: 'ACTIVE' | 'INACTIVE';
    }
  ): Promise<LubeSku> {
    const existing = await this.lubeRepo.findSkuById(skuId);
    if (!existing) {
      throw new LubeError('LUBE_SKU_NOT_FOUND', 'Lube SKU not found', 404);
    }

    const updateData: any = {
      updatedAt: new Date().toISOString(),
    };

    if (input.name !== undefined) {
      updateData.name = input.name.trim();
    }
    if (input.category !== undefined) {
      updateData.category = input.category.trim();
    }
    if (input.reorderThreshold !== undefined) {
      const thresholdSubunits = safeParseQuantity(existing.stockUnit, input.reorderThreshold, 'reorder threshold');
      if (thresholdSubunits < 0) {
        throw new LubeError('VALIDATION_ERROR', 'Reorder threshold cannot be negative', 400);
      }
      updateData.reorderThresholdSubunits = thresholdSubunits;
    }
    if (input.status !== undefined) {
      updateData.status = input.status;
    }

    const updated = await this.lubeRepo.updateSku(skuId, updateData);

    await this.auditRepo.logAction({
      id: crypto.randomUUID(),
      userId,
      action: 'LUBE_SKU_UPDATE',
      entityType: 'LUBE_SKU',
      entityId: skuId,
      oldValue: existing as any,
      newValue: updated as any,
      createdAt: new Date().toISOString(),
    });

    return updated;
  }

  // ==========================================
  // SELLING PRICES
  // ==========================================

  async listPrices(outletId: string, skuId?: string): Promise<LubeSkuPrice[]> {
    return this.lubeRepo.listPricesByOutlet(outletId, skuId);
  }

  async createPrice(
    userId: string,
    outletId: string,
    input: {
      lubeSkuId: string;
      pricePaisePerUnit: string;
      effectiveFrom: string;
      effectiveTo?: string | null;
      status?: 'ACTIVE' | 'INACTIVE';
    }
  ): Promise<LubeSkuPrice> {
    const sku = await this.lubeRepo.findSkuById(input.lubeSkuId);
    if (!sku) {
      throw new LubeError('LUBE_SKU_NOT_FOUND', 'Lube SKU not found', 404);
    }
    if (sku.outletId !== outletId) {
      throw new LubeError('OUTLET_MISMATCH', 'SKU does not belong to this outlet', 400);
    }

    const pricePaise = parseMoneyToPaise(input.pricePaisePerUnit);
    if (pricePaise <= 0) {
      throw new LubeError('VALIDATION_ERROR', 'Price must be greater than zero', 400);
    }

    const effectiveTo = input.effectiveTo || null;
    if (effectiveTo && effectiveTo < input.effectiveFrom) {
      throw new LubeError('VALIDATION_ERROR', 'effectiveTo cannot be earlier than effectiveFrom', 400);
    }

    const status = input.status || 'ACTIVE';
    if (status === 'ACTIVE') {
      const overlaps = await this.lubeRepo.checkPriceOverlap(
        outletId,
        input.lubeSkuId,
        input.effectiveFrom,
        effectiveTo
      );
      if (overlaps) {
        throw new LubeError('OVERLAPPING_LUBE_PRICE', 'An active selling price already covers this date range', 409);
      }
    }

    const now = new Date().toISOString();
    const id = `lube-price-${crypto.randomUUID()}`;

    const price = await this.lubeRepo.createPrice({
      id,
      outletId,
      lubeSkuId: input.lubeSkuId,
      pricePaisePerUnit: pricePaise,
      effectiveFrom: input.effectiveFrom,
      effectiveTo,
      status,
      createdAt: now,
      createdBy: userId,
    });

    await this.auditRepo.logAction({
      id: crypto.randomUUID(),
      userId,
      action: 'LUBE_PRICE_CREATE',
      entityType: 'LUBE_PRICE',
      entityId: price.id,
      oldValue: null,
      newValue: price as any,
      createdAt: now,
    });

    return price;
  }

  async updatePrice(
    userId: string,
    priceId: string,
    input: {
      effectiveTo?: string | null;
      status?: 'ACTIVE' | 'INACTIVE';
    }
  ): Promise<LubeSkuPrice> {
    const existing = await this.lubeRepo.findPriceById(priceId);
    if (!existing) {
      throw new LubeError('NOT_FOUND', 'Lube price not found', 404);
    }

    const effectiveTo = input.effectiveTo !== undefined ? input.effectiveTo : (existing.effectiveTo || null);
    if (effectiveTo && effectiveTo < existing.effectiveFrom) {
      throw new LubeError('VALIDATION_ERROR', 'effectiveTo cannot be earlier than effectiveFrom', 400);
    }

    const newStatus = input.status || existing.status;
    if (newStatus === 'ACTIVE') {
      const overlaps = await this.lubeRepo.checkPriceOverlap(
        existing.outletId,
        existing.lubeSkuId,
        existing.effectiveFrom,
        effectiveTo || null,
        priceId
      );
      if (overlaps) {
        throw new LubeError('OVERLAPPING_LUBE_PRICE', 'An active selling price already covers this date range', 409);
      }
    }

    const updateData: any = {};
    if (input.effectiveTo !== undefined) updateData.effectiveTo = input.effectiveTo;
    if (input.status !== undefined) updateData.status = input.status;

    const updated = await this.lubeRepo.updatePrice(priceId, updateData);

    await this.auditRepo.logAction({
      id: crypto.randomUUID(),
      userId,
      action: 'LUBE_PRICE_UPDATE',
      entityType: 'LUBE_PRICE',
      entityId: priceId,
      oldValue: existing as any,
      newValue: updated as any,
      createdAt: new Date().toISOString(),
    });

    return updated;
  }

  // ==========================================
  // STOCK TRANSACTIONS & SUMMARY
  // ==========================================

  async getStockSummary(outletId: string): Promise<LubeStockSummaryItem[]> {
    return this.lubeRepo.getStockSummaryByOutlet(outletId);
  }

  async getLowStock(outletId: string): Promise<LubeStockSummaryItem[]> {
    const summary = await this.lubeRepo.getStockSummaryByOutlet(outletId);
    return summary.filter(item => item.status === 'ACTIVE' && item.isLowStock);
  }

  async listStockTransactions(outletId: string, skuId?: string): Promise<LubeStockTransaction[]> {
    return this.lubeRepo.listStockTransactions(outletId, skuId);
  }

  async createStockTransaction(
    userId: string,
    outletId: string,
    input: {
      lubeSkuId: string;
      transactionType: 'OPENING_BALANCE' | 'RECEIPT' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';
      quantity: string;
      occurredAt: string;
      referenceNumber?: string | null;
      notes?: string | null;
    }
  ): Promise<LubeStockTransaction> {
    const sku = await this.lubeRepo.findSkuById(input.lubeSkuId);
    if (!sku) {
      throw new LubeError('LUBE_SKU_NOT_FOUND', 'Lube SKU not found', 404);
    }
    if (sku.outletId !== outletId) {
      throw new LubeError('OUTLET_MISMATCH', 'SKU does not belong to this outlet', 400);
    }
    if (sku.status !== 'ACTIVE') {
      throw new LubeError('LUBE_SKU_INACTIVE', 'Cannot transact on inactive SKU', 409);
    }

    const quantitySubunits = safeParseQuantity(sku.stockUnit, input.quantity, 'transaction quantity');
    if (quantitySubunits <= 0) {
      throw new LubeError('VALIDATION_ERROR', 'Transaction quantity must be greater than zero', 400);
    }

    if (
      (input.transactionType === 'ADJUSTMENT_IN' || input.transactionType === 'ADJUSTMENT_OUT') &&
      (!input.notes || input.notes.trim() === '')
    ) {
      throw new LubeError('VALIDATION_ERROR', 'Notes/reason are required for inventory adjustments', 400);
    }

    if (input.transactionType === 'ADJUSTMENT_OUT') {
      const currentStock = await this.lubeRepo.calculateCurrentStockSubunits(sku.id);
      if (currentStock < quantitySubunits) {
        throw new LubeError('INSUFFICIENT_LUBE_STOCK', 'Insufficient stock to fulfill outbound adjustment', 409);
      }
    }

    const now = new Date().toISOString();
    const id = `lube-tx-${crypto.randomUUID()}`;

    try {
      const tx = await this.lubeRepo.createStockTransaction({
        id,
        outletId,
        lubeSkuId: input.lubeSkuId,
        transactionType: input.transactionType,
        quantitySubunits,
        occurredAt: input.occurredAt,
        referenceNumber: input.referenceNumber?.trim() || null,
        notes: input.notes?.trim() || null,
        createdBy: userId,
        createdAt: now,
      });

      await this.auditRepo.logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'LUBE_STOCK_TRANSACTION_CREATE',
        entityType: 'LUBE_STOCK_TRANSACTION',
        entityId: tx.id,
        oldValue: null,
        newValue: tx as any,
        createdAt: now,
      });

      return tx;
    } catch (err: any) {
      if (err.message?.includes('INSUFFICIENT_LUBE_STOCK')) {
        throw new LubeError('INSUFFICIENT_LUBE_STOCK', 'Insufficient stock to fulfill outbound adjustment', 409);
      }
      throw err;
    }
  }

  // ==========================================
  // SHIFT SALES
  // ==========================================

  async listShiftSales(shiftId: string): Promise<LubeShiftSale[]> {
    return this.lubeRepo.listShiftSales(shiftId);
  }

  async createShiftSale(
    userId: string,
    shiftId: string,
    input: {
      lubeSkuId: string;
      quantity: string;
      soldAt: string;
      notes?: string | null;
    }
  ): Promise<LubeShiftSale> {
    const shift = await this.pumpRepo.findOperationalShiftById(shiftId);
    if (!shift) {
      throw new LubeError('NOT_FOUND', 'Operational shift not found', 404);
    }
    if (shift.status !== 'OPEN') {
      throw new LubeError('SHIFT_CLOSED', 'Cannot record lube sales on a non-open shift', 409);
    }

    const sku = await this.lubeRepo.findSkuById(input.lubeSkuId);
    if (!sku) {
      throw new LubeError('LUBE_SKU_NOT_FOUND', 'Lube SKU not found', 404);
    }
    if (sku.outletId !== shift.outletId) {
      throw new LubeError('OUTLET_MISMATCH', 'SKU does not belong to the shift outlet', 400);
    }
    if (sku.status !== 'ACTIVE') {
      throw new LubeError('LUBE_SKU_INACTIVE', 'Cannot record sales for an inactive SKU', 409);
    }

    const quantitySubunits = safeParseQuantity(sku.stockUnit, input.quantity, 'sale quantity');
    if (quantitySubunits <= 0) {
      throw new LubeError('VALIDATION_ERROR', 'Sale quantity must be greater than zero', 400);
    }

    const price = await this.lubeRepo.findActivePriceForSku(shift.outletId, sku.id, shift.businessDate);
    if (!price) {
      throw new LubeError(
        'LUBE_PRICE_NOT_CONFIGURED',
        `No active selling price configured for ${sku.name} on ${shift.businessDate}`,
        409
      );
    }

    const currentStock = await this.lubeRepo.calculateCurrentStockSubunits(sku.id);
    if (currentStock < quantitySubunits) {
      throw new LubeError('INSUFFICIENT_LUBE_STOCK', 'Insufficient stock to fulfill sale', 409);
    }

    const revenuePaise = calculateLubeRevenuePaise(sku.stockUnit, quantitySubunits, price.pricePaisePerUnit);

    const now = new Date().toISOString();
    const id = `lube-sale-${crypto.randomUUID()}`;

    try {
      const sale = await this.lubeRepo.createShiftSale({
        id,
        operationalShiftId: shiftId,
        outletId: shift.outletId,
        lubeSkuId: sku.id,
        skuCode: sku.skuCode,
        skuName: sku.name,
        category: sku.category,
        stockUnit: sku.stockUnit,
        quantitySubunits,
        unitPricePaise: price.pricePaisePerUnit,
        revenuePaise,
        soldAt: input.soldAt,
        recordedByUserId: userId,
        notes: input.notes?.trim() || null,
        createdAt: now,
        updatedAt: now,
      });

      await this.auditRepo.logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'LUBE_SALE_CREATE',
        entityType: 'LUBE_SALE',
        entityId: sale.id,
        oldValue: null,
        newValue: sale as any,
        createdAt: now,
      });

      return sale;
    } catch (err: any) {
      if (err.message?.includes('SHIFT_CLOSED')) {
        throw new LubeError('SHIFT_CLOSED', 'Cannot record lube sales on a non-open shift', 409);
      }
      if (err.message?.includes('INSUFFICIENT_LUBE_STOCK')) {
        throw new LubeError('INSUFFICIENT_LUBE_STOCK', 'Insufficient stock to fulfill sale', 409);
      }
      if (err.message?.includes('LUBE_SKU_INACTIVE')) {
        throw new LubeError('LUBE_SKU_INACTIVE', 'Cannot record sales for an inactive SKU', 409);
      }
      if (err.message?.includes('OUTLET_MISMATCH')) {
        throw new LubeError('OUTLET_MISMATCH', 'SKU does not belong to the shift outlet', 400);
      }
      if (err.message?.includes('LUBE_SKU_NOT_FOUND')) {
        throw new LubeError('LUBE_SKU_NOT_FOUND', 'Lube SKU not found', 404);
      }
      throw err;
    }
  }

  async updateShiftSale(
    userId: string,
    saleId: string,
    input: {
      quantity: string;
      soldAt?: string;
      notes?: string | null;
    }
  ): Promise<LubeShiftSale> {
    const sale = await this.lubeRepo.findShiftSaleById(saleId);
    if (!sale) {
      throw new LubeError('NOT_FOUND', 'Lube shift sale not found', 404);
    }

    const shift = await this.pumpRepo.findOperationalShiftById(sale.operationalShiftId);
    if (!shift || shift.status !== 'OPEN') {
      throw new LubeError('SHIFT_CLOSED', 'Cannot update sale on a non-open shift', 409);
    }

    const newQuantitySubunits = safeParseQuantity(sale.stockUnit, input.quantity, 'sale quantity');
    if (newQuantitySubunits <= 0) {
      throw new LubeError('VALIDATION_ERROR', 'Sale quantity must be greater than zero', 400);
    }

    const currentStock = await this.lubeRepo.calculateCurrentStockSubunits(sale.lubeSkuId);
    const availableStock = currentStock + sale.quantitySubunits;
    if (availableStock < newQuantitySubunits) {
      throw new LubeError('INSUFFICIENT_LUBE_STOCK', 'Insufficient stock to fulfill updated sale quantity', 409);
    }

    const newRevenuePaise = calculateLubeRevenuePaise(
      sale.stockUnit,
      newQuantitySubunits,
      sale.unitPricePaise
    );

    const updateData: any = {
      quantitySubunits: newQuantitySubunits,
      revenuePaise: newRevenuePaise,
      updatedAt: new Date().toISOString(),
    };
    if (input.soldAt !== undefined) updateData.soldAt = input.soldAt;
    if (input.notes !== undefined) updateData.notes = input.notes?.trim() || null;

    try {
      const updated = await this.lubeRepo.updateShiftSale(saleId, updateData);

      await this.auditRepo.logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'LUBE_SALE_UPDATE',
        entityType: 'LUBE_SALE',
        entityId: saleId,
        oldValue: sale as any,
        newValue: updated as any,
        createdAt: new Date().toISOString(),
      });

      return updated;
    } catch (err: any) {
      if (err.message?.includes('SHIFT_CLOSED')) {
        throw new LubeError('SHIFT_CLOSED', 'Cannot update sale on a non-open shift', 409);
      }
      if (err.message?.includes('INSUFFICIENT_LUBE_STOCK')) {
        throw new LubeError('INSUFFICIENT_LUBE_STOCK', 'Insufficient stock to fulfill updated sale quantity', 409);
      }
      throw err;
    }
  }

  async deleteShiftSale(userId: string, saleId: string): Promise<void> {
    const sale = await this.lubeRepo.findShiftSaleById(saleId);
    if (!sale) {
      throw new LubeError('NOT_FOUND', 'Lube shift sale not found', 404);
    }

    const shift = await this.pumpRepo.findOperationalShiftById(sale.operationalShiftId);
    if (!shift || shift.status !== 'OPEN') {
      throw new LubeError('SHIFT_CLOSED', 'Cannot delete sale on a non-open shift', 409);
    }

    try {
      await this.lubeRepo.deleteShiftSale(saleId);
    } catch (err: any) {
      if (err.message?.includes('SHIFT_CLOSED')) {
        throw new LubeError('SHIFT_CLOSED', 'Cannot delete sale on a non-open shift', 409);
      }
      throw err;
    }

    await this.auditRepo.logAction({
      id: crypto.randomUUID(),
      userId,
      action: 'LUBE_SALE_DELETE',
      entityType: 'LUBE_SALE',
      entityId: saleId,
      oldValue: sale as any,
      newValue: null,
      createdAt: new Date().toISOString(),
    });
  }

  async getShiftSummary(shiftId: string): Promise<LubeShiftSummary> {
    const shift = await this.pumpRepo.findOperationalShiftById(shiftId);
    if (!shift) {
      throw new LubeError('NOT_FOUND', 'Operational shift not found', 404);
    }

    try {
      return await this.lubeRepo.getShiftSummary(shiftId, shift.outletId, shift.businessDate);
    } catch (err: any) {
      if (err.message === 'FINANCIAL_AMOUNT_OVERFLOW' || err.message === 'QUANTITY_OVERFLOW') {
        throw new LubeError(err.message, 'Calculated summary amount exceeds safe maximum', 400);
      }
      throw err;
    }
  }

  async getDailySummary(outletId: string, businessDate: string): Promise<LubeDailySummary> {
    try {
      return await this.lubeRepo.getDailySummary(outletId, businessDate);
    } catch (err: any) {
      if (err.message === 'FINANCIAL_AMOUNT_OVERFLOW' || err.message === 'QUANTITY_OVERFLOW') {
        throw new LubeError(err.message, 'Calculated summary amount exceeds safe maximum', 400);
      }
      throw err;
    }
  }
}
