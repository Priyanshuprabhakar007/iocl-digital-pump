import { eq, and, desc, asc, gte, lte, sql } from 'drizzle-orm';
import { AppDatabase } from '../../db';
import {
  hrUniformItems,
  hrUniformVariants,
  hrUniformStockTransactions,
  hrUniformIssues,
  hrStaff,
} from '../../db/schema';
import {
  HrUniformItem,
  HrUniformVariant,
  HrUniformStockTransaction,
  HrUniformStockSummary,
  HrUniformIssue,
  HrUniformReportSummary,
  HrUniformCategory,
  HrUniformStatus,
  HrUniformStockTransactionType,
  HrUniformIssueStatus,
} from '../../shared/types';

export interface UniformItemFilters {
  category?: HrUniformCategory;
  status?: HrUniformStatus;
  search?: string;
}

export interface UniformIssueFilters {
  staffId?: string;
  itemId?: string;
  variantId?: string;
  status?: HrUniformIssueStatus;
  fromDate?: string;
  toDate?: string;
}

export interface UniformStockTransactionFilters {
  variantId?: string;
  transactionType?: HrUniformStockTransactionType;
  fromDate?: string;
  toDate?: string;
}

export class UniformRepository {
  constructor(private db: AppDatabase) {}

  // ==========================================
  // ITEMS
  // ==========================================

  async getItemById(id: string): Promise<HrUniformItem | undefined> {
    const row = await this.db
      .select()
      .from(hrUniformItems)
      .where(eq(hrUniformItems.id, id))
      .get();
    return (row as unknown as HrUniformItem) || undefined;
  }

  async getItemByCode(outletId: string, itemCode: string): Promise<HrUniformItem | undefined> {
    const row = await this.db
      .select()
      .from(hrUniformItems)
      .where(
        and(
          eq(hrUniformItems.outletId, outletId),
          eq(hrUniformItems.itemCode, itemCode.toUpperCase())
        )
      )
      .get();
    return (row as unknown as HrUniformItem) || undefined;
  }

  async getItems(outletId: string, filters?: UniformItemFilters): Promise<HrUniformItem[]> {
    const conditions = [eq(hrUniformItems.outletId, outletId)];

    if (filters?.category) {
      conditions.push(eq(hrUniformItems.category, filters.category));
    }
    if (filters?.status) {
      conditions.push(eq(hrUniformItems.status, filters.status));
    }
    if (filters?.search && filters.search.trim()) {
      const term = `%${filters.search.trim().toLowerCase()}%`;
      conditions.push(
        sql`(lower(${hrUniformItems.itemCode}) LIKE ${term} OR lower(${hrUniformItems.itemName}) LIKE ${term})`
      );
    }

    const rows = await this.db
      .select()
      .from(hrUniformItems)
      .where(and(...conditions))
      .orderBy(asc(hrUniformItems.itemCode))
      .all();
    return rows as unknown as HrUniformItem[];
  }

  async createItem(data: {
    id: string;
    outletId: string;
    itemCode: string;
    itemName: string;
    category: string;
    description?: string | null;
    status: HrUniformStatus;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
  }): Promise<HrUniformItem> {
    await this.db.insert(hrUniformItems).values(data).run();
    const created = await this.getItemById(data.id);
    if (!created) throw new Error('Failed to create uniform item');
    return created;
  }

  async updateItem(
    id: string,
    data: {
      itemName?: string;
      category?: string;
      description?: string | null;
      status?: HrUniformStatus;
      updatedAt: string;
    }
  ): Promise<HrUniformItem> {
    await this.db
      .update(hrUniformItems)
      .set(data)
      .where(eq(hrUniformItems.id, id))
      .run();
    const updated = await this.getItemById(id);
    if (!updated) throw new Error('Uniform item not found after update');
    return updated;
  }

  // ==========================================
  // VARIANTS
  // ==========================================

  async getVariantById(id: string): Promise<(HrUniformVariant & { itemCode?: string; itemName?: string; category?: string }) | undefined> {
    const row = await this.db
      .select({
        variant: hrUniformVariants,
        item: hrUniformItems,
      })
      .from(hrUniformVariants)
      .innerJoin(hrUniformItems, eq(hrUniformVariants.uniformItemId, hrUniformItems.id))
      .where(eq(hrUniformVariants.id, id))
      .get();

    if (!row) return undefined;
    return {
      ...(row.variant as unknown as HrUniformVariant),
      itemCode: row.item.itemCode,
      itemName: row.item.itemName,
      category: row.item.category as HrUniformCategory,
    };
  }

  async getVariantByItemAndSize(uniformItemId: string, sizeLabel: string): Promise<HrUniformVariant | undefined> {
    const row = await this.db
      .select()
      .from(hrUniformVariants)
      .where(
        and(
          eq(hrUniformVariants.uniformItemId, uniformItemId),
          eq(hrUniformVariants.sizeLabel, sizeLabel)
        )
      )
      .get();
    return (row as unknown as HrUniformVariant) || undefined;
  }

  async getVariants(outletId: string, itemId?: string): Promise<(HrUniformVariant & { itemCode?: string; itemName?: string; category?: string })[]> {
    const conditions = [eq(hrUniformVariants.outletId, outletId)];
    if (itemId) {
      conditions.push(eq(hrUniformVariants.uniformItemId, itemId));
    }

    const rows = await this.db
      .select({
        variant: hrUniformVariants,
        item: hrUniformItems,
      })
      .from(hrUniformVariants)
      .innerJoin(hrUniformItems, eq(hrUniformVariants.uniformItemId, hrUniformItems.id))
      .where(and(...conditions))
      .orderBy(asc(hrUniformItems.itemCode), asc(hrUniformVariants.sizeSortOrder), asc(hrUniformVariants.sizeLabel))
      .all();

    return rows.map(r => ({
      ...(r.variant as unknown as HrUniformVariant),
      itemCode: r.item.itemCode,
      itemName: r.item.itemName,
      category: r.item.category as HrUniformCategory,
    }));
  }

  async createVariant(data: {
    id: string;
    outletId: string;
    uniformItemId: string;
    sizeLabel: string;
    sizeSortOrder: number;
    reorderLevel: number;
    status: HrUniformStatus;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
  }): Promise<HrUniformVariant> {
    await this.db.insert(hrUniformVariants).values(data).run();
    const created = await this.getVariantById(data.id);
    if (!created) throw new Error('Failed to create uniform variant');
    return created;
  }

  async updateVariant(
    id: string,
    data: {
      sizeSortOrder?: number;
      reorderLevel?: number;
      status?: HrUniformStatus;
      updatedAt: string;
    }
  ): Promise<HrUniformVariant> {
    await this.db
      .update(hrUniformVariants)
      .set(data)
      .where(eq(hrUniformVariants.id, id))
      .run();
    const updated = await this.getVariantById(id);
    if (!updated) throw new Error('Uniform variant not found after update');
    return updated;
  }

  // ==========================================
  // STOCK LEDGER & TRANSACTIONS
  // ==========================================

  async calculateVariantStock(variantId: string): Promise<number> {
    const result = await this.db
      .select({
        inflow: sql`COALESCE(SUM(CASE WHEN ${hrUniformStockTransactions.transactionType} IN ('OPENING_BALANCE', 'RECEIPT', 'ADJUSTMENT_IN', 'RETURN_IN') THEN ${hrUniformStockTransactions.quantity} ELSE 0 END), 0)`,
        outflow: sql`COALESCE(SUM(CASE WHEN ${hrUniformStockTransactions.transactionType} IN ('ADJUSTMENT_OUT', 'ISSUE_OUT') THEN ${hrUniformStockTransactions.quantity} ELSE 0 END), 0)`,
      })
      .from(hrUniformStockTransactions)
      .where(eq(hrUniformStockTransactions.variantId, variantId))
      .get();

    if (!result) return 0;
    const current = Number(result.inflow) - Number(result.outflow);
    return Math.max(0, current);
  }

  async createStockTransaction(data: {
    id: string;
    outletId: string;
    variantId: string;
    transactionType: HrUniformStockTransactionType;
    quantity: number;
    referenceType?: string | null;
    referenceId?: string | null;
    notes?: string | null;
    occurredAt: string;
    createdBy: string;
    createdAt: string;
  }): Promise<HrUniformStockTransaction> {
    await this.db.insert(hrUniformStockTransactions).values(data).run();
    const row = await this.db
      .select()
      .from(hrUniformStockTransactions)
      .where(eq(hrUniformStockTransactions.id, data.id))
      .get();
    if (!row) throw new Error('Failed to create stock transaction');
    return row as unknown as HrUniformStockTransaction;
  }

  async getStockTransactions(outletId: string, filters?: UniformStockTransactionFilters): Promise<HrUniformStockTransaction[]> {
    const conditions = [eq(hrUniformStockTransactions.outletId, outletId)];

    if (filters?.variantId) {
      conditions.push(eq(hrUniformStockTransactions.variantId, filters.variantId));
    }
    if (filters?.transactionType) {
      conditions.push(eq(hrUniformStockTransactions.transactionType, filters.transactionType));
    }
    if (filters?.fromDate) {
      conditions.push(sql`${hrUniformStockTransactions.occurredAt} >= ${filters.fromDate}`);
    }
    if (filters?.toDate) {
      conditions.push(sql`${hrUniformStockTransactions.occurredAt} <= ${filters.toDate}`);
    }

    const rows = await this.db
      .select({
        tx: hrUniformStockTransactions,
        variant: hrUniformVariants,
        item: hrUniformItems,
      })
      .from(hrUniformStockTransactions)
      .innerJoin(hrUniformVariants, eq(hrUniformStockTransactions.variantId, hrUniformVariants.id))
      .innerJoin(hrUniformItems, eq(hrUniformVariants.uniformItemId, hrUniformItems.id))
      .where(and(...conditions))
      .orderBy(desc(hrUniformStockTransactions.occurredAt), desc(hrUniformStockTransactions.createdAt))
      .all();

    return rows.map(r => ({
      ...(r.tx as unknown as HrUniformStockTransaction),
      itemCode: r.item.itemCode,
      itemName: r.item.itemName,
      sizeLabel: r.variant.sizeLabel,
    }));
  }

  async getStockSummary(outletId: string): Promise<HrUniformStockSummary[]> {
    const variants = await this.getVariants(outletId);
    const summaries: HrUniformStockSummary[] = [];

    for (const v of variants) {
      const currentStock = await this.calculateVariantStock(v.id);
      summaries.push({
        variantId: v.id,
        itemId: v.uniformItemId,
        itemCode: v.itemCode || '',
        itemName: v.itemName || '',
        category: (v.category || 'OTHER') as HrUniformCategory,
        sizeLabel: v.sizeLabel,
        sizeSortOrder: v.sizeSortOrder,
        reorderLevel: v.reorderLevel,
        status: v.status,
        currentStock,
        isLowStock: currentStock <= v.reorderLevel,
      });
    }

    return summaries;
  }

  // ==========================================
  // ISSUES & LIFECYCLE
  // ==========================================

  async getIssueById(id: string): Promise<(HrUniformIssue & { staffName?: string; employeeCode?: string; itemCode?: string; itemName?: string; sizeLabel?: string; category?: HrUniformCategory }) | undefined> {
    const row = await this.db
      .select({
        issue: hrUniformIssues,
        staff: hrStaff,
        variant: hrUniformVariants,
        item: hrUniformItems,
      })
      .from(hrUniformIssues)
      .innerJoin(hrStaff, eq(hrUniformIssues.staffId, hrStaff.id))
      .innerJoin(hrUniformVariants, eq(hrUniformIssues.variantId, hrUniformVariants.id))
      .innerJoin(hrUniformItems, eq(hrUniformVariants.uniformItemId, hrUniformItems.id))
      .where(eq(hrUniformIssues.id, id))
      .get();

    if (!row) return undefined;
    return {
      ...(row.issue as unknown as HrUniformIssue),
      staffName: row.staff.fullName,
      employeeCode: row.staff.employeeCode,
      itemCode: row.item.itemCode,
      itemName: row.item.itemName,
      sizeLabel: row.variant.sizeLabel,
      category: row.item.category as HrUniformCategory,
    };
  }

  async getIssues(outletId: string, filters?: UniformIssueFilters): Promise<HrUniformIssue[]> {
    const conditions = [eq(hrUniformIssues.outletId, outletId)];

    if (filters?.staffId) {
      conditions.push(eq(hrUniformIssues.staffId, filters.staffId));
    }
    if (filters?.itemId) {
      conditions.push(eq(hrUniformVariants.uniformItemId, filters.itemId));
    }
    if (filters?.variantId) {
      conditions.push(eq(hrUniformIssues.variantId, filters.variantId));
    }
    if (filters?.status) {
      conditions.push(eq(hrUniformIssues.status, filters.status));
    }
    if (filters?.fromDate) {
      conditions.push(sql`${hrUniformIssues.issuedAt} >= ${filters.fromDate}`);
    }
    if (filters?.toDate) {
      conditions.push(sql`${hrUniformIssues.issuedAt} <= ${filters.toDate}`);
    }

    const rows = await this.db
      .select({
        issue: hrUniformIssues,
        staff: hrStaff,
        variant: hrUniformVariants,
        item: hrUniformItems,
      })
      .from(hrUniformIssues)
      .innerJoin(hrStaff, eq(hrUniformIssues.staffId, hrStaff.id))
      .innerJoin(hrUniformVariants, eq(hrUniformIssues.variantId, hrUniformVariants.id))
      .innerJoin(hrUniformItems, eq(hrUniformVariants.uniformItemId, hrUniformItems.id))
      .where(and(...conditions))
      .orderBy(desc(hrUniformIssues.issuedAt), desc(hrUniformIssues.createdAt))
      .all();

    return rows.map(r => ({
      ...(r.issue as unknown as HrUniformIssue),
      staffName: r.staff.fullName,
      employeeCode: r.staff.employeeCode,
      itemCode: r.item.itemCode,
      itemName: r.item.itemName,
      sizeLabel: r.variant.sizeLabel,
      category: r.item.category as HrUniformCategory,
    }));
  }

  async createIssue(data: {
    id: string;
    outletId: string;
    staffId: string;
    variantId: string;
    quantity: number;
    issuedAt: string;
    issuedBy: string;
    conditionAtIssue: string;
    status: HrUniformIssueStatus;
    notes?: string | null;
    createdAt: string;
    updatedAt: string;
    replacesIssueId?: string | null;
  }): Promise<HrUniformIssue> {
    await this.db.insert(hrUniformIssues).values(data as any).run();
    const created = await this.getIssueById(data.id);
    if (!created) throw new Error('Failed to create uniform issue');
    return created;
  }

  async updateIssue(
    id: string,
    data: {
      status: HrUniformIssueStatus;
      closedAt: string;
      closedBy: string;
      conditionOnClose: string;
      replacementReason?: string | null;
      updatedAt: string;
    }
  ): Promise<HrUniformIssue> {
    await this.db
      .update(hrUniformIssues)
      .set(data as any)
      .where(eq(hrUniformIssues.id, id))
      .run();
    const updated = await this.getIssueById(id);
    if (!updated) throw new Error('Uniform issue not found after update');
    return updated;
  }

  async getStaffIssueHistory(outletId: string, staffId?: string, fromDate?: string, toDate?: string): Promise<HrUniformIssue[]> {
    const conditions = [eq(hrUniformIssues.outletId, outletId)];
    if (staffId) {
      conditions.push(eq(hrUniformIssues.staffId, staffId));
    }
    if (fromDate) {
      conditions.push(sql`${hrUniformIssues.issuedAt} >= ${fromDate}`);
    }
    if (toDate) {
      conditions.push(sql`${hrUniformIssues.issuedAt} <= ${toDate}`);
    }

    const rows = await this.db
      .select({
        issue: hrUniformIssues,
        staff: hrStaff,
        variant: hrUniformVariants,
        item: hrUniformItems,
      })
      .from(hrUniformIssues)
      .innerJoin(hrStaff, eq(hrUniformIssues.staffId, hrStaff.id))
      .innerJoin(hrUniformVariants, eq(hrUniformIssues.variantId, hrUniformVariants.id))
      .innerJoin(hrUniformItems, eq(hrUniformVariants.uniformItemId, hrUniformItems.id))
      .where(and(...conditions))
      .orderBy(desc(hrUniformIssues.issuedAt))
      .all();

    return rows.map(r => ({
      ...(r.issue as unknown as HrUniformIssue),
      staffName: r.staff.fullName,
      employeeCode: r.staff.employeeCode,
      itemCode: r.item.itemCode,
      itemName: r.item.itemName,
      sizeLabel: r.variant.sizeLabel,
      category: r.item.category as HrUniformCategory,
    }));
  }

  async getReportSummary(outletId: string): Promise<HrUniformReportSummary> {
    const items = await this.getItems(outletId, { status: 'ACTIVE' });
    const variants = await this.getVariants(outletId);
    const activeVariants = variants.filter(v => v.status === 'ACTIVE');
    const stockSummary = await this.getStockSummary(outletId);
    const lowStockCount = stockSummary.filter(s => s.isLowStock).length;
    const totalStock = stockSummary.reduce((acc, s) => acc + s.currentStock, 0);

    const issues = await this.getIssues(outletId);
    const totalIssued = issues.filter(i => i.status === 'ISSUED').length;
    const totalReturned = issues.filter(i => i.status === 'RETURNED').length;
    const totalReplaced = issues.filter(i => i.status === 'REPLACED').length;

    return {
      totalActiveItems: items.length,
      totalActiveVariants: activeVariants.length,
      totalAvailableStock: totalStock,
      lowStockVariantCount: lowStockCount,
      totalIssued,
      totalReturned,
      totalReplaced,
    };
  }
}
