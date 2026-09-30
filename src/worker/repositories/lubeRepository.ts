import { AppDatabase } from '../../db';
import * as schema from '../../db/schema';
import { eq, and, sql, desc, asc, lte, inArray } from 'drizzle-orm';
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
import { formatLubeQuantity, checkedSafeIntegerAdd } from '../../shared/lubeUtils';
import { formatPaiseToMoney } from '../../shared/financialUtils';

export class LubeRepository {
  constructor(private db: AppDatabase) {}

  // ==========================================
  // SKU CATALOG
  // ==========================================

  async findSkuById(id: string): Promise<LubeSku | null> {
    const [row] = await this.db
      .select()
      .from(schema.lubeSkus)
      .where(eq(schema.lubeSkus.id, id));

    if (!row) return null;
    return {
      ...row,
      reorderThreshold: formatLubeQuantity(row.stockUnit as LubeStockUnit, row.reorderThresholdSubunits),
    } as unknown as LubeSku;
  }

  async findSkuByCode(outletId: string, skuCode: string): Promise<LubeSku | null> {
    const [row] = await this.db
      .select()
      .from(schema.lubeSkus)
      .where(
        and(
          eq(schema.lubeSkus.outletId, outletId),
          eq(schema.lubeSkus.skuCode, skuCode)
        )
      );

    if (!row) return null;
    return {
      ...row,
      reorderThreshold: formatLubeQuantity(row.stockUnit as LubeStockUnit, row.reorderThresholdSubunits),
    } as unknown as LubeSku;
  }

  async listSkusByOutlet(outletId: string): Promise<LubeSku[]> {
    const rows = await this.db
      .select()
      .from(schema.lubeSkus)
      .where(eq(schema.lubeSkus.outletId, outletId))
      .orderBy(asc(schema.lubeSkus.skuCode));

    return rows.map(r => ({
      ...r,
      reorderThreshold: formatLubeQuantity(r.stockUnit as LubeStockUnit, r.reorderThresholdSubunits),
    })) as unknown as LubeSku[];
  }

  async createSku(data: any): Promise<LubeSku> {
    await this.db.insert(schema.lubeSkus).values(data);
    return (await this.findSkuById(data.id))!;
  }

  async updateSku(id: string, data: any): Promise<LubeSku> {
    await this.db.update(schema.lubeSkus).set(data).where(eq(schema.lubeSkus.id, id));
    return (await this.findSkuById(id))!;
  }

  // ==========================================
  // SELLING PRICES
  // ==========================================

  async createPrice(data: any): Promise<LubeSkuPrice> {
    await this.db.insert(schema.lubeSkuPrices).values(data);
    return (await this.findPriceById(data.id))!;
  }

  async updatePrice(id: string, data: any): Promise<LubeSkuPrice> {
    await this.db.update(schema.lubeSkuPrices).set(data).where(eq(schema.lubeSkuPrices.id, id));
    return (await this.findPriceById(id))!;
  }

  async findPriceById(id: string): Promise<LubeSkuPrice | null> {
    const [row] = await this.db
      .select()
      .from(schema.lubeSkuPrices)
      .where(eq(schema.lubeSkuPrices.id, id));

    if (!row) return null;
    return {
      ...row,
      pricePerUnitStr: formatPaiseToMoney(row.pricePaisePerUnit),
    } as unknown as LubeSkuPrice;
  }

  async listPricesByOutlet(outletId: string, skuId?: string): Promise<LubeSkuPrice[]> {
    const conditions = [eq(schema.lubeSkuPrices.outletId, outletId)];
    if (skuId) {
      conditions.push(eq(schema.lubeSkuPrices.lubeSkuId, skuId));
    }

    const rows = await this.db
      .select()
      .from(schema.lubeSkuPrices)
      .where(and(...conditions))
      .orderBy(desc(schema.lubeSkuPrices.effectiveFrom));

    return rows.map(r => ({
      ...r,
      pricePerUnitStr: formatPaiseToMoney(r.pricePaisePerUnit),
    })) as unknown as LubeSkuPrice[];
  }

  async findActivePriceForSku(outletId: string, skuId: string, date: string): Promise<LubeSkuPrice | null> {
    const [row] = await this.db
      .select()
      .from(schema.lubeSkuPrices)
      .where(
        and(
          eq(schema.lubeSkuPrices.outletId, outletId),
          eq(schema.lubeSkuPrices.lubeSkuId, skuId),
          eq(schema.lubeSkuPrices.status, 'ACTIVE'),
          lte(schema.lubeSkuPrices.effectiveFrom, date),
          sql`(${schema.lubeSkuPrices.effectiveTo} IS NULL OR ${schema.lubeSkuPrices.effectiveTo} >= ${date})`
        )
      )
      .orderBy(desc(schema.lubeSkuPrices.effectiveFrom))
      .limit(1);

    if (!row) return null;
    return {
      ...row,
      pricePerUnitStr: formatPaiseToMoney(row.pricePaisePerUnit),
    } as unknown as LubeSkuPrice;
  }

  async checkPriceOverlap(
    outletId: string,
    skuId: string,
    effectiveFrom: string,
    effectiveTo: string | null,
    excludeId?: string
  ): Promise<boolean> {
    const conditions = [
      eq(schema.lubeSkuPrices.outletId, outletId),
      eq(schema.lubeSkuPrices.lubeSkuId, skuId),
      eq(schema.lubeSkuPrices.status, 'ACTIVE'),
    ];

    if (excludeId) {
      conditions.push(sql`${schema.lubeSkuPrices.id} != ${excludeId}`);
    }

    const rows = await this.db
      .select()
      .from(schema.lubeSkuPrices)
      .where(and(...conditions));

    return rows.some(r => {
      const start = r.effectiveFrom;
      const end = r.effectiveTo || '9999-12-31';
      const newStart = effectiveFrom;
      const newEnd = effectiveTo || '9999-12-31';

      return newStart <= end && newEnd >= start;
    });
  }

  // ==========================================
  // STOCK TRANSACTIONS & SUMMARY
  // ==========================================

  async createStockTransaction(data: any): Promise<LubeStockTransaction> {
    await this.db.insert(schema.lubeStockTransactions).values(data);
    const [row] = await this.db
      .select()
      .from(schema.lubeStockTransactions)
      .where(eq(schema.lubeStockTransactions.id, data.id));

    const sku = await this.findSkuById(row.lubeSkuId);
    return {
      ...row,
      quantity: formatLubeQuantity(sku?.stockUnit || 'PACK', row.quantitySubunits),
    } as unknown as LubeStockTransaction;
  }

  async listStockTransactions(outletId: string, skuId?: string): Promise<LubeStockTransaction[]> {
    const conditions = [eq(schema.lubeStockTransactions.outletId, outletId)];
    if (skuId) {
      conditions.push(eq(schema.lubeStockTransactions.lubeSkuId, skuId));
    }

    const rows = await this.db
      .select()
      .from(schema.lubeStockTransactions)
      .where(and(...conditions))
      .orderBy(desc(schema.lubeStockTransactions.occurredAt));

    const skus = await this.listSkusByOutlet(outletId);
    const skuMap = new Map(skus.map(s => [s.id, s.stockUnit]));

    return rows.map(r => {
      const stockUnit = skuMap.get(r.lubeSkuId) || 'PACK';
      return {
        ...r,
        quantity: formatLubeQuantity(stockUnit, r.quantitySubunits),
      };
    }) as unknown as LubeStockTransaction[];
  }

  async calculateCurrentStockSubunits(lubeSkuId: string): Promise<number> {
    const txRows = await this.db
      .select({
        transactionType: schema.lubeStockTransactions.transactionType,
        quantitySubunits: schema.lubeStockTransactions.quantitySubunits,
      })
      .from(schema.lubeStockTransactions)
      .where(eq(schema.lubeStockTransactions.lubeSkuId, lubeSkuId));

    const saleRows = await this.db
      .select({
        quantitySubunits: schema.lubeShiftSales.quantitySubunits,
      })
      .from(schema.lubeShiftSales)
      .where(eq(schema.lubeShiftSales.lubeSkuId, lubeSkuId));

    let stockBig = 0n;
    for (const tx of txRows) {
      if (tx.transactionType === 'ADJUSTMENT_OUT') {
        stockBig -= BigInt(tx.quantitySubunits);
      } else {
        stockBig += BigInt(tx.quantitySubunits);
      }
    }
    for (const s of saleRows) {
      stockBig -= BigInt(s.quantitySubunits);
    }

    if (stockBig > BigInt(Number.MAX_SAFE_INTEGER) || stockBig < -BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('QUANTITY_OVERFLOW');
    }
    return Number(stockBig);
  }

  async getStockSummaryByOutlet(outletId: string): Promise<LubeStockSummaryItem[]> {
    const skus = await this.listSkusByOutlet(outletId);
    const result: LubeStockSummaryItem[] = [];

    for (const sku of skus) {
      const currentStockSubunits = await this.calculateCurrentStockSubunits(sku.id);
      const isLowStock = currentStockSubunits <= sku.reorderThresholdSubunits;
      result.push({
        lubeSkuId: sku.id,
        skuCode: sku.skuCode,
        skuName: sku.name,
        category: sku.category,
        stockUnit: sku.stockUnit,
        currentStockSubunits,
        currentStock: formatLubeQuantity(sku.stockUnit, currentStockSubunits),
        reorderThresholdSubunits: sku.reorderThresholdSubunits,
        reorderThreshold: sku.reorderThreshold,
        isLowStock,
        status: sku.status,
      });
    }

    return result;
  }

  // ==========================================
  // SHIFT SALES
  // ==========================================

  async createShiftSale(data: any): Promise<LubeShiftSale> {
    await this.db.insert(schema.lubeShiftSales).values(data);
    return (await this.findShiftSaleById(data.id))!;
  }

  async updateShiftSale(id: string, data: any): Promise<LubeShiftSale> {
    await this.db.update(schema.lubeShiftSales).set(data).where(eq(schema.lubeShiftSales.id, id));
    return (await this.findShiftSaleById(id))!;
  }

  async deleteShiftSale(id: string): Promise<void> {
    await this.db.delete(schema.lubeShiftSales).where(eq(schema.lubeShiftSales.id, id));
  }

  async findShiftSaleById(id: string): Promise<LubeShiftSale | null> {
    const [row] = await this.db
      .select()
      .from(schema.lubeShiftSales)
      .where(eq(schema.lubeShiftSales.id, id));

    if (!row) return null;
    const stockUnit = row.stockUnit as LubeStockUnit;
    return {
      ...row,
      quantity: formatLubeQuantity(stockUnit, row.quantitySubunits),
      unitPriceStr: formatPaiseToMoney(row.unitPricePaise),
      revenueStr: formatPaiseToMoney(row.revenuePaise),
    } as unknown as LubeShiftSale;
  }

  async listShiftSales(shiftId: string): Promise<LubeShiftSale[]> {
    const rows = await this.db
      .select()
      .from(schema.lubeShiftSales)
      .where(eq(schema.lubeShiftSales.operationalShiftId, shiftId))
      .orderBy(asc(schema.lubeShiftSales.soldAt));

    return rows.map(r => {
      const stockUnit = r.stockUnit as LubeStockUnit;
      return {
        ...r,
        quantity: formatLubeQuantity(stockUnit, r.quantitySubunits),
        unitPriceStr: formatPaiseToMoney(r.unitPricePaise),
        revenueStr: formatPaiseToMoney(r.revenuePaise),
      };
    }) as unknown as LubeShiftSale[];
  }

  async getShiftSummary(shiftId: string, outletId: string, businessDate: string): Promise<LubeShiftSummary> {
    const sales = await this.listShiftSales(shiftId);

    const skuMap = new Map<string, {
      lubeSkuId: string;
      skuCode: string;
      skuName: string;
      category: string;
      stockUnit: LubeStockUnit;
      quantitySubunits: number;
      saleCount: number;
      revenuePaise: number;
    }>();

    let totalRevenuePaise = 0;
    let totalLitreSubunits = 0;
    let totalPackSubunits = 0;

    for (const sale of sales) {
      totalRevenuePaise = checkedSafeIntegerAdd(totalRevenuePaise, sale.revenuePaise, 'FINANCIAL_AMOUNT_OVERFLOW');
      if (sale.stockUnit === 'LITRE') {
        totalLitreSubunits = checkedSafeIntegerAdd(totalLitreSubunits, sale.quantitySubunits, 'QUANTITY_OVERFLOW');
      } else {
        totalPackSubunits = checkedSafeIntegerAdd(totalPackSubunits, sale.quantitySubunits, 'QUANTITY_OVERFLOW');
      }

      const existing = skuMap.get(sale.lubeSkuId);
      if (existing) {
        existing.quantitySubunits = checkedSafeIntegerAdd(existing.quantitySubunits, sale.quantitySubunits, 'QUANTITY_OVERFLOW');
        existing.saleCount += 1;
        existing.revenuePaise = checkedSafeIntegerAdd(existing.revenuePaise, sale.revenuePaise, 'FINANCIAL_AMOUNT_OVERFLOW');
      } else {
        skuMap.set(sale.lubeSkuId, {
          lubeSkuId: sale.lubeSkuId,
          skuCode: sale.skuCode,
          skuName: sale.skuName,
          category: sale.category,
          stockUnit: sale.stockUnit,
          quantitySubunits: sale.quantitySubunits,
          saleCount: 1,
          revenuePaise: sale.revenuePaise,
        });
      }
    }

    const bySku = Array.from(skuMap.values()).map(item => ({
      ...item,
      quantity: formatLubeQuantity(item.stockUnit, item.quantitySubunits),
      revenueStr: formatPaiseToMoney(item.revenuePaise),
    }));

    return {
      operationalShiftId: shiftId,
      outletId,
      businessDate,
      bySku,
      totalRevenuePaise,
      totalRevenueStr: formatPaiseToMoney(totalRevenuePaise),
      quantitiesByUnit: {
        litre: formatLubeQuantity('LITRE', totalLitreSubunits),
        pack: formatLubeQuantity('PACK', totalPackSubunits),
      },
    };
  }

  async getDailySummary(outletId: string, businessDate: string): Promise<LubeDailySummary> {
    const shifts = await this.db
      .select({ id: schema.operationalShifts.id })
      .from(schema.operationalShifts)
      .where(
        and(
          eq(schema.operationalShifts.outletId, outletId),
          eq(schema.operationalShifts.businessDate, businessDate)
        )
      );

    const shiftIds = shifts.map(s => s.id);
    if (shiftIds.length === 0) {
      return {
        outletId,
        businessDate,
        shiftCountWithLubeSales: 0,
        saleLineCount: 0,
        bySku: [],
        totalRevenuePaise: 0,
        totalRevenueStr: '0.00',
        quantitiesByUnit: {
          litre: '0.000',
          pack: '0',
        },
      };
    }

    const sales = await this.db
      .select()
      .from(schema.lubeShiftSales)
      .where(inArray(schema.lubeShiftSales.operationalShiftId, shiftIds));

    const shiftsWithSales = new Set(sales.map(s => s.operationalShiftId));

    const skuMap = new Map<string, {
      lubeSkuId: string;
      skuCode: string;
      skuName: string;
      category: string;
      stockUnit: LubeStockUnit;
      quantitySubunits: number;
      saleCount: number;
      revenuePaise: number;
    }>();

    let totalRevenuePaise = 0;
    let totalLitreSubunits = 0;
    let totalPackSubunits = 0;

    for (const sale of sales) {
      const stockUnit = sale.stockUnit as LubeStockUnit;
      totalRevenuePaise = checkedSafeIntegerAdd(totalRevenuePaise, sale.revenuePaise, 'FINANCIAL_AMOUNT_OVERFLOW');
      if (stockUnit === 'LITRE') {
        totalLitreSubunits = checkedSafeIntegerAdd(totalLitreSubunits, sale.quantitySubunits, 'QUANTITY_OVERFLOW');
      } else {
        totalPackSubunits = checkedSafeIntegerAdd(totalPackSubunits, sale.quantitySubunits, 'QUANTITY_OVERFLOW');
      }

      const existing = skuMap.get(sale.lubeSkuId);
      if (existing) {
        existing.quantitySubunits = checkedSafeIntegerAdd(existing.quantitySubunits, sale.quantitySubunits, 'QUANTITY_OVERFLOW');
        existing.saleCount += 1;
        existing.revenuePaise = checkedSafeIntegerAdd(existing.revenuePaise, sale.revenuePaise, 'FINANCIAL_AMOUNT_OVERFLOW');
      } else {
        skuMap.set(sale.lubeSkuId, {
          lubeSkuId: sale.lubeSkuId,
          skuCode: sale.skuCode,
          skuName: sale.skuName,
          category: sale.category,
          stockUnit,
          quantitySubunits: sale.quantitySubunits,
          saleCount: 1,
          revenuePaise: sale.revenuePaise,
        });
      }
    }

    const bySku = Array.from(skuMap.values()).map(item => ({
      ...item,
      quantity: formatLubeQuantity(item.stockUnit, item.quantitySubunits),
      revenueStr: formatPaiseToMoney(item.revenuePaise),
    }));

    return {
      outletId,
      businessDate,
      shiftCountWithLubeSales: shiftsWithSales.size,
      saleLineCount: sales.length,
      bySku,
      totalRevenuePaise,
      totalRevenueStr: formatPaiseToMoney(totalRevenuePaise),
      quantitiesByUnit: {
        litre: formatLubeQuantity('LITRE', totalLitreSubunits),
        pack: formatLubeQuantity('PACK', totalPackSubunits),
      },
    };
  }
}
