import { eq, and, desc, asc, gte, lte } from 'drizzle-orm';
import { AppDatabase } from '../../db';
import { municipalTaxDues, documents } from '../../db/schema';
import {
  MunicipalTaxDue,
  MunicipalTaxType,
  MunicipalTaxFrequency,
  MunicipalTaxStatus,
  MunicipalTaxSummary,
  Document,
} from '../../shared/types';
import { checkedUtilityMoneyAdd, formatPaiseToMoney } from '../../shared/utilityUtils';

export interface MunicipalTaxFilters {
  taxType?: MunicipalTaxType;
  status?: MunicipalTaxStatus;
  assessmentFrequency?: MunicipalTaxFrequency;
  fromDate?: string;
  toDate?: string;
}

export class MunicipalTaxRepository {
  constructor(private db: AppDatabase) {}

  async getById(id: string): Promise<MunicipalTaxDue | undefined> {
    const res = await this.db
      .select()
      .from(municipalTaxDues)
      .where(eq(municipalTaxDues.id, id))
      .get();
    return (res as unknown as MunicipalTaxDue) || undefined;
  }

  async getDuplicate(
    outletId: string,
    taxType: string,
    authorityName: string,
    referenceNumber: string,
    assessmentPeriodStart: string,
    assessmentPeriodEnd: string
  ): Promise<MunicipalTaxDue | undefined> {
    const res = await this.db
      .select()
      .from(municipalTaxDues)
      .where(
        and(
          eq(municipalTaxDues.outletId, outletId),
          eq(municipalTaxDues.taxType, taxType as any),
          eq(municipalTaxDues.authorityName, authorityName),
          eq(municipalTaxDues.referenceNumber, referenceNumber),
          eq(municipalTaxDues.assessmentPeriodStart, assessmentPeriodStart),
          eq(municipalTaxDues.assessmentPeriodEnd, assessmentPeriodEnd)
        )
      )
      .get();
    return (res as unknown as MunicipalTaxDue) || undefined;
  }

  async listByOutlet(
    outletId: string,
    filters?: MunicipalTaxFilters
  ): Promise<MunicipalTaxDue[]> {
    const conditions = [eq(municipalTaxDues.outletId, outletId)];

    if (filters?.taxType) {
      conditions.push(eq(municipalTaxDues.taxType, filters.taxType));
    }
    if (filters?.status) {
      conditions.push(eq(municipalTaxDues.status, filters.status));
    }
    if (filters?.assessmentFrequency) {
      conditions.push(eq(municipalTaxDues.assessmentFrequency, filters.assessmentFrequency));
    }
    if (filters?.fromDate) {
      conditions.push(gte(municipalTaxDues.dueDate, filters.fromDate));
    }
    if (filters?.toDate) {
      conditions.push(lte(municipalTaxDues.dueDate, filters.toDate));
    }

    const rows = await this.db
      .select()
      .from(municipalTaxDues)
      .where(and(...conditions))
      .orderBy(desc(municipalTaxDues.dueDate), desc(municipalTaxDues.createdAt))
      .all();

    return rows as unknown as MunicipalTaxDue[];
  }

  async create(
    due: Omit<MunicipalTaxDue, 'createdAt' | 'updatedAt' | 'amountStr' | 'isOverdue'>
  ): Promise<MunicipalTaxDue> {
    const now = new Date().toISOString();
    const row = await this.db
      .insert(municipalTaxDues)
      .values({
        ...due,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return row as unknown as MunicipalTaxDue;
  }

  async updatePending(
    id: string,
    updates: Partial<
      Omit<
        MunicipalTaxDue,
        | 'id'
        | 'outletId'
        | 'status'
        | 'paymentReceiptDocumentId'
        | 'paymentReference'
        | 'paidAt'
        | 'paidByUserId'
        | 'createdBy'
        | 'createdAt'
        | 'updatedAt'
        | 'amountStr'
        | 'isOverdue'
      >
    >
  ): Promise<MunicipalTaxDue | undefined> {
    const row = await this.db
      .update(municipalTaxDues)
      .set({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(municipalTaxDues.id, id), eq(municipalTaxDues.status, 'PENDING')))
      .returning()
      .get();
    return (row as unknown as MunicipalTaxDue) || undefined;
  }

  async markPaidConditional(
    id: string,
    payment: {
      paymentReceiptDocumentId: string;
      paymentReference: string | null;
      paidAt: string;
      paidByUserId: string;
    }
  ): Promise<MunicipalTaxDue | undefined> {
    const row = await this.db
      .update(municipalTaxDues)
      .set({
        status: 'PAID',
        paymentReceiptDocumentId: payment.paymentReceiptDocumentId,
        paymentReference: payment.paymentReference,
        paidAt: payment.paidAt,
        paidByUserId: payment.paidByUserId,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(municipalTaxDues.id, id), eq(municipalTaxDues.status, 'PENDING')))
      .returning()
      .get();
    return (row as unknown as MunicipalTaxDue) || undefined;
  }

  async getSummary(outletId: string, currentDateStr: string): Promise<MunicipalTaxSummary> {
    const rows = await this.db
      .select()
      .from(municipalTaxDues)
      .where(eq(municipalTaxDues.outletId, outletId))
      .orderBy(asc(municipalTaxDues.dueDate))
      .all();

    let totalCount = 0;
    let pendingCount = 0;
    let overdueCount = 0;
    let paidCount = 0;

    let pendingAmountPaise = 0;
    let overdueAmountPaise = 0;
    let paidAmountPaise = 0;

    let nextDueDate: string | null = null;

    for (const r of rows) {
      totalCount++;
      const isPaid = r.status === 'PAID';
      const isPending = r.status === 'PENDING';
      const isOverdue = isPending && r.dueDate < currentDateStr;

      if (isPaid) {
        paidCount++;
        paidAmountPaise = checkedUtilityMoneyAdd(paidAmountPaise, r.amountPaise);
      } else if (isPending) {
        pendingCount++;
        pendingAmountPaise = checkedUtilityMoneyAdd(pendingAmountPaise, r.amountPaise);

        if (isOverdue) {
          overdueCount++;
          overdueAmountPaise = checkedUtilityMoneyAdd(overdueAmountPaise, r.amountPaise);
        }

        if (nextDueDate === null || r.dueDate < nextDueDate) {
          nextDueDate = r.dueDate;
        }
      }
    }

    return {
      totalCount,
      pendingCount,
      overdueCount,
      paidCount,
      pendingAmountPaise,
      pendingAmountStr: formatPaiseToMoney(pendingAmountPaise),
      overdueAmountPaise,
      overdueAmountStr: formatPaiseToMoney(overdueAmountPaise),
      paidAmountPaise,
      paidAmountStr: formatPaiseToMoney(paidAmountPaise),
      nextDueDate,
    };
  }

  async getDocumentById(id: string): Promise<Document | undefined> {
    const res = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .get();
    return (res as unknown as Document) || undefined;
  }
}
