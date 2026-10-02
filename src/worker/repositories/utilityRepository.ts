import { eq, and, sql, desc, asc, gte, lte } from 'drizzle-orm';
import { AppDatabase } from '../../db';
import {
  utilityElectricityAccounts,
  utilityElectricityBills,
  utilitySubMeters,
  utilitySubMeterReadings,
  documents,
} from '../../db/schema';
import {
  UtilityElectricityAccount,
  UtilityElectricityBill,
  UtilitySubMeter,
  UtilitySubMeterReading,
  UtilityElectricityAccountStatus,
  UtilityElectricityBillStatus,
  UtilitySubMeterBeneficiaryType,
  UtilitySubMeterStatus,
} from '../../shared/types';

export class UtilityRepository {
  constructor(private db: AppDatabase) {}

  // ==========================================================================
  // Electricity Accounts
  // ==========================================================================

  async getElectricityAccountById(id: string): Promise<UtilityElectricityAccount | undefined> {
    const res = await this.db
      .select()
      .from(utilityElectricityAccounts)
      .where(eq(utilityElectricityAccounts.id, id))
      .get();
    return (res as unknown as UtilityElectricityAccount) || undefined;
  }

  async getElectricityAccountByConsumerNumber(
    outletId: string,
    consumerNumber: string
  ): Promise<UtilityElectricityAccount | undefined> {
    const res = await this.db
      .select()
      .from(utilityElectricityAccounts)
      .where(
        and(
          eq(utilityElectricityAccounts.outletId, outletId),
          eq(utilityElectricityAccounts.consumerNumber, consumerNumber)
        )
      )
      .get();
    return (res as unknown as UtilityElectricityAccount) || undefined;
  }

  async listElectricityAccounts(outletId: string): Promise<UtilityElectricityAccount[]> {
    const rows = await this.db
      .select()
      .from(utilityElectricityAccounts)
      .where(eq(utilityElectricityAccounts.outletId, outletId))
      .orderBy(desc(utilityElectricityAccounts.createdAt))
      .all();
    return rows as unknown as UtilityElectricityAccount[];
  }

  async createElectricityAccount(
    account: Omit<UtilityElectricityAccount, 'createdAt' | 'updatedAt'>
  ): Promise<UtilityElectricityAccount> {
    const now = new Date().toISOString();
    const row = await this.db
      .insert(utilityElectricityAccounts)
      .values({
        ...account,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return row as unknown as UtilityElectricityAccount;
  }

  async updateElectricityAccount(
    id: string,
    updates: Partial<Omit<UtilityElectricityAccount, 'id' | 'outletId' | 'consumerNumber' | 'createdAt' | 'createdBy'>>
  ): Promise<UtilityElectricityAccount | undefined> {
    const row = await this.db
      .update(utilityElectricityAccounts)
      .set({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(utilityElectricityAccounts.id, id))
      .returning()
      .get();
    return (row as unknown as UtilityElectricityAccount) || undefined;
  }

  // ==========================================================================
  // Electricity Bills
  // ==========================================================================

  async getElectricityBillById(id: string): Promise<UtilityElectricityBill | undefined> {
    const res = await this.db
      .select()
      .from(utilityElectricityBills)
      .where(eq(utilityElectricityBills.id, id))
      .get();
    return (res as unknown as UtilityElectricityBill) || undefined;
  }

  async getElectricityBillByPeriod(
    electricityAccountId: string,
    start: string,
    end: string
  ): Promise<UtilityElectricityBill | undefined> {
    const res = await this.db
      .select()
      .from(utilityElectricityBills)
      .where(
        and(
          eq(utilityElectricityBills.electricityAccountId, electricityAccountId),
          eq(utilityElectricityBills.billingPeriodStart, start),
          eq(utilityElectricityBills.billingPeriodEnd, end)
        )
      )
      .get();
    return (res as unknown as UtilityElectricityBill) || undefined;
  }

  async listElectricityBills(
    outletId: string,
    filters: { status?: UtilityElectricityBillStatus; fromDate?: string; toDate?: string } = {}
  ): Promise<UtilityElectricityBill[]> {
    const conditions = [eq(utilityElectricityBills.outletId, outletId)];

    if (filters.status) {
      conditions.push(eq(utilityElectricityBills.status, filters.status));
    }
    if (filters.fromDate) {
      conditions.push(gte(utilityElectricityBills.billingPeriodStart, filters.fromDate));
    }
    if (filters.toDate) {
      conditions.push(lte(utilityElectricityBills.billingPeriodEnd, filters.toDate));
    }

    const rows = await this.db
      .select()
      .from(utilityElectricityBills)
      .where(and(...conditions))
      .orderBy(desc(utilityElectricityBills.billingPeriodStart), desc(utilityElectricityBills.createdAt))
      .all();
    return rows as unknown as UtilityElectricityBill[];
  }

  async createElectricityBill(
    bill: Omit<UtilityElectricityBill, 'createdAt' | 'updatedAt' | 'isOverdue' | 'billAmountStr'>
  ): Promise<UtilityElectricityBill> {
    const now = new Date().toISOString();
    const row = await this.db
      .insert(utilityElectricityBills)
      .values({
        ...bill,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return row as unknown as UtilityElectricityBill;
  }

  async updateElectricityBillPending(
    id: string,
    updates: Partial<Pick<UtilityElectricityBill, 'billingPeriodStart' | 'billingPeriodEnd' | 'billAmountPaise' | 'dueDate' | 'billDocumentId'>>
  ): Promise<UtilityElectricityBill | undefined> {
    const row = await this.db
      .update(utilityElectricityBills)
      .set({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(utilityElectricityBills.id, id), eq(utilityElectricityBills.status, 'PENDING')))
      .returning()
      .get();
    return (row as unknown as UtilityElectricityBill) || undefined;
  }

  async markElectricityBillPaidConditional(
    id: string,
    payment: {
      paymentReceiptDocumentId: string;
      paymentReference?: string | null;
      paidAt: string;
      paidByUserId: string;
    }
  ): Promise<UtilityElectricityBill | undefined> {
    const row = await this.db
      .update(utilityElectricityBills)
      .set({
        status: 'PAID',
        paymentReceiptDocumentId: payment.paymentReceiptDocumentId,
        paymentReference: payment.paymentReference || null,
        paidAt: payment.paidAt,
        paidByUserId: payment.paidByUserId,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(utilityElectricityBills.id, id), eq(utilityElectricityBills.status, 'PENDING')))
      .returning()
      .get();
    return (row as unknown as UtilityElectricityBill) || undefined;
  }

  // ==========================================================================
  // Sub-Meters
  // ==========================================================================

  async getSubMeterById(id: string): Promise<UtilitySubMeter | undefined> {
    const res = await this.db
      .select()
      .from(utilitySubMeters)
      .where(eq(utilitySubMeters.id, id))
      .get();
    return (res as unknown as UtilitySubMeter) || undefined;
  }

  async getSubMeterByCode(outletId: string, meterCode: string): Promise<UtilitySubMeter | undefined> {
    const res = await this.db
      .select()
      .from(utilitySubMeters)
      .where(and(eq(utilitySubMeters.outletId, outletId), eq(utilitySubMeters.meterCode, meterCode)))
      .get();
    return (res as unknown as UtilitySubMeter) || undefined;
  }

  async getSubMeterBySerial(outletId: string, serialNumber: string): Promise<UtilitySubMeter | undefined> {
    const res = await this.db
      .select()
      .from(utilitySubMeters)
      .where(and(eq(utilitySubMeters.outletId, outletId), eq(utilitySubMeters.serialNumber, serialNumber)))
      .get();
    return (res as unknown as UtilitySubMeter) || undefined;
  }

  async listSubMeters(
    outletId: string,
    filters: { beneficiaryType?: UtilitySubMeterBeneficiaryType; status?: UtilitySubMeterStatus } = {}
  ): Promise<UtilitySubMeter[]> {
    const conditions = [eq(utilitySubMeters.outletId, outletId)];
    if (filters.beneficiaryType) {
      conditions.push(eq(utilitySubMeters.beneficiaryType, filters.beneficiaryType));
    }
    if (filters.status) {
      conditions.push(eq(utilitySubMeters.status, filters.status));
    }
    const rows = await this.db
      .select()
      .from(utilitySubMeters)
      .where(and(...conditions))
      .orderBy(asc(utilitySubMeters.meterCode))
      .all();
    return rows as unknown as UtilitySubMeter[];
  }

  async createSubMeter(
    subMeter: Omit<UtilitySubMeter, 'createdAt' | 'updatedAt' | 'ratePerKwhStr'>
  ): Promise<UtilitySubMeter> {
    const now = new Date().toISOString();
    const row = await this.db
      .insert(utilitySubMeters)
      .values({
        ...subMeter,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return row as unknown as UtilitySubMeter;
  }

  async updateSubMeter(
    id: string,
    updates: Partial<Omit<UtilitySubMeter, 'id' | 'outletId' | 'meterCode' | 'createdAt' | 'createdBy' | 'ratePerKwhStr'>>
  ): Promise<UtilitySubMeter | undefined> {
    const row = await this.db
      .update(utilitySubMeters)
      .set({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(utilitySubMeters.id, id))
      .returning()
      .get();
    return (row as unknown as UtilitySubMeter) || undefined;
  }

  // ==========================================================================
  // Sub-Meter Readings
  // ==========================================================================

  async getLatestSubMeterReading(subMeterId: string): Promise<UtilitySubMeterReading | undefined> {
    const res = await this.db
      .select()
      .from(utilitySubMeterReadings)
      .where(eq(utilitySubMeterReadings.subMeterId, subMeterId))
      .orderBy(desc(utilitySubMeterReadings.readingAt), desc(utilitySubMeterReadings.createdAt))
      .limit(1)
      .get();
    return (res as unknown as UtilitySubMeterReading) || undefined;
  }

  async getSubMeterReadingById(id: string): Promise<UtilitySubMeterReading | undefined> {
    const res = await this.db
      .select()
      .from(utilitySubMeterReadings)
      .where(eq(utilitySubMeterReadings.id, id))
      .get();
    return (res as unknown as UtilitySubMeterReading) || undefined;
  }

  async createSubMeterReading(
    reading: Omit<UtilitySubMeterReading, 'createdAt' | 'readingStr' | 'previousReadingStr' | 'consumptionStr' | 'ratePerKwhStr' | 'chargeStr'>
  ): Promise<UtilitySubMeterReading> {
    const now = new Date().toISOString();
    const row = await this.db
      .insert(utilitySubMeterReadings)
      .values({
        ...reading,
        createdAt: now,
      })
      .returning()
      .get();
    return row as unknown as UtilitySubMeterReading;
  }

  async listSubMeterReadings(subMeterId: string): Promise<UtilitySubMeterReading[]> {
    const rows = await this.db
      .select()
      .from(utilitySubMeterReadings)
      .where(eq(utilitySubMeterReadings.subMeterId, subMeterId))
      .orderBy(desc(utilitySubMeterReadings.readingAt), desc(utilitySubMeterReadings.createdAt))
      .all();
    return rows as unknown as UtilitySubMeterReading[];
  }

  // ==========================================================================
  // Summary Aggregations
  // ==========================================================================

  async getElectricitySummary(
    outletId: string,
    currentDateStr: string
  ): Promise<{
    accountCount: number;
    activeAccountCount: number;
    pendingBillCount: number;
    overdueBillCount: number;
    paidBillCount: number;
    pendingAmountPaise: number;
    overdueAmountPaise: number;
    latestBillDueDate: string | null;
  }> {
    const accounts = await this.db
      .select({ id: utilityElectricityAccounts.id, status: utilityElectricityAccounts.status })
      .from(utilityElectricityAccounts)
      .where(eq(utilityElectricityAccounts.outletId, outletId))
      .all();

    const accountCount = accounts.length;
    const activeAccountCount = accounts.filter(a => a.status === 'ACTIVE').length;

    const bills = await this.db
      .select({
        id: utilityElectricityBills.id,
        status: utilityElectricityBills.status,
        billAmountPaise: utilityElectricityBills.billAmountPaise,
        dueDate: utilityElectricityBills.dueDate,
      })
      .from(utilityElectricityBills)
      .where(eq(utilityElectricityBills.outletId, outletId))
      .all();

    let pendingBillCount = 0;
    let overdueBillCount = 0;
    let paidBillCount = 0;
    let pendingAmountPaise = 0;
    let overdueAmountPaise = 0;
    let latestDueDate: string | null = null;

    for (const b of bills) {
      if (b.status === 'PAID') {
        paidBillCount += 1;
      } else if (b.status === 'PENDING') {
        pendingBillCount += 1;
        pendingAmountPaise += b.billAmountPaise;

        if (b.dueDate < currentDateStr) {
          overdueBillCount += 1;
          overdueAmountPaise += b.billAmountPaise;
        }

        if (!latestDueDate || b.dueDate > latestDueDate) {
          latestDueDate = b.dueDate;
        }
      }
    }

    return {
      accountCount,
      activeAccountCount,
      pendingBillCount,
      overdueBillCount,
      paidBillCount,
      pendingAmountPaise,
      overdueAmountPaise,
      latestBillDueDate: latestDueDate,
    };
  }

  async getSubMeterChargeSummary(
    outletId: string,
    filters: { fromDate?: string; toDate?: string; subMeterId?: string } = {}
  ): Promise<{
    subMeters: UtilitySubMeter[];
    readings: UtilitySubMeterReading[];
  }> {
    // 1. Get sub-meters
    const smConditions = [eq(utilitySubMeters.outletId, outletId)];
    if (filters.subMeterId) {
      smConditions.push(eq(utilitySubMeters.id, filters.subMeterId));
    }
    const subMeters = (await this.db
      .select()
      .from(utilitySubMeters)
      .where(and(...smConditions))
      .orderBy(asc(utilitySubMeters.meterCode))
      .all()) as unknown as UtilitySubMeter[];

    // 2. Get readings
    const rConditions = [eq(utilitySubMeterReadings.outletId, outletId)];
    if (filters.subMeterId) {
      rConditions.push(eq(utilitySubMeterReadings.subMeterId, filters.subMeterId));
    }
    if (filters.fromDate) {
      rConditions.push(gte(utilitySubMeterReadings.readingAt, filters.fromDate));
    }
    if (filters.toDate) {
      rConditions.push(lte(utilitySubMeterReadings.readingAt, filters.toDate));
    }

    const readings = (await this.db
      .select()
      .from(utilitySubMeterReadings)
      .where(and(...rConditions))
      .orderBy(asc(utilitySubMeterReadings.readingAt))
      .all()) as unknown as UtilitySubMeterReading[];

    return { subMeters, readings };
  }

  // ==========================================================================
  // Document Verification
  // ==========================================================================

  async getDocumentById(id: string) {
    return await this.db.select().from(documents).where(eq(documents.id, id)).get();
  }
}
