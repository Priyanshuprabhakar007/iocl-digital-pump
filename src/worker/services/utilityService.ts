import { UtilityRepository } from '../repositories/utilityRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { AppDatabase } from '../../db';
import {
  CreateUtilityElectricityAccountSchema,
  UpdateUtilityElectricityAccountSchema,
  CreateUtilityElectricityBillSchema,
  UpdateUtilityElectricityBillSchema,
  MarkUtilityElectricityBillPaidSchema,
  CreateUtilitySubMeterSchema,
  UpdateUtilitySubMeterSchema,
  CreateUtilitySubMeterReadingSchema,
  UtilityBillFilterSchema,
  UtilitySubMeterFilterSchema,
  UtilityChargeSummaryFilterSchema,
} from '../../shared/validators';
import {
  UtilityElectricityAccount,
  UtilityElectricityBill,
  UtilitySubMeter,
  UtilitySubMeterReading,
  UtilityElectricitySummary,
  UtilitySubMeterChargeSummary,
  UtilitySubMeterChargeSummaryItem,
  UtilityElectricityAccountStatus,
  UtilityElectricityBillStatus,
  UtilitySubMeterBeneficiaryType,
  UtilitySubMeterStatus,
} from '../../shared/types';
import {
  parseMilliKwh,
  formatMilliKwh,
  parseMoneyToPaise,
  formatPaiseToMoney,
  calculateSubMeterChargePaise,
  checkedUtilityMoneyAdd,
  checkedMilliKwhAdd,
} from '../../shared/utilityUtils';

export class UtilityError extends Error {
  constructor(public code: string, message: string, public status: number = 400) {
    super(message);
    this.name = 'UtilityError';
  }
}

function safeParseMoney(amount: string): number {
  try {
    return parseMoneyToPaise(amount);
  } catch (err: any) {
    if (err.message && err.message.includes('OVERFLOW')) {
      throw new UtilityError('VALIDATION_ERROR', 'Money amount exceeds safe limits.', 400);
    }
    throw new UtilityError('VALIDATION_ERROR', 'Invalid money amount format.', 400);
  }
}

export class UtilityService {
  constructor(private db: AppDatabase) {}

  // ==========================================================================
  // Electricity Accounts
  // ==========================================================================

  async createElectricityAccount(
    outletId: string,
    userId: string,
    data: unknown
  ): Promise<UtilityElectricityAccount> {
    const validated = CreateUtilityElectricityAccountSchema.parse(data);
    const repo = new UtilityRepository(this.db);

    const existing = await repo.getElectricityAccountByConsumerNumber(outletId, validated.consumerNumber);
    if (existing) {
      throw new UtilityError(
        'UTILITY_CONSUMER_NUMBER_EXISTS',
        'An electricity account with this consumer number already exists at this outlet.',
        409
      );
    }

    try {
      const account = await repo.createElectricityAccount({
        id: crypto.randomUUID(),
        outletId,
        consumerNumber: validated.consumerNumber,
        providerName: validated.providerName ?? null,
        billingCycle: validated.billingCycle,
        status: validated.status as UtilityElectricityAccountStatus,
        notes: validated.notes ?? null,
        createdBy: userId,
      });

      await new AuditRepository(this.db).logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'UTILITY_ELECTRICITY_ACCOUNT_CREATE',
        entityType: 'UTILITY_ELECTRICITY_ACCOUNT',
        entityId: account.id,
        newValue: account as unknown as Record<string, unknown>,
        createdAt: new Date().toISOString(),
      });

      return account;
    } catch (err: any) {
      if (err instanceof UtilityError) throw err;
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        throw new UtilityError(
          'UTILITY_CONSUMER_NUMBER_EXISTS',
          'An electricity account with this consumer number already exists at this outlet.',
          409
        );
      }
      throw err;
    }
  }

  async updateElectricityAccount(
    id: string,
    userId: string,
    data: unknown
  ): Promise<UtilityElectricityAccount> {
    const validated = UpdateUtilityElectricityAccountSchema.parse(data);
    const repo = new UtilityRepository(this.db);

    const existing = await repo.getElectricityAccountById(id);
    if (!existing) {
      throw new UtilityError(
        'UTILITY_ELECTRICITY_ACCOUNT_NOT_FOUND',
        'Electricity account not found.',
        404
      );
    }

    const updates: Partial<Omit<UtilityElectricityAccount, 'id' | 'outletId' | 'consumerNumber' | 'createdAt' | 'createdBy'>> = {};
    if (validated.providerName !== undefined) updates.providerName = validated.providerName ?? null;
    if (validated.billingCycle !== undefined) updates.billingCycle = validated.billingCycle;
    if (validated.status !== undefined) updates.status = validated.status as UtilityElectricityAccountStatus;
    if (validated.notes !== undefined) updates.notes = validated.notes ?? null;

    const updated = await repo.updateElectricityAccount(id, updates);
    if (!updated) {
      throw new UtilityError(
        'UTILITY_ELECTRICITY_ACCOUNT_NOT_FOUND',
        'Electricity account not found.',
        404
      );
    }

    await new AuditRepository(this.db).logAction({
      id: crypto.randomUUID(),
      userId,
      action: 'UTILITY_ELECTRICITY_ACCOUNT_UPDATE',
      entityType: 'UTILITY_ELECTRICITY_ACCOUNT',
      entityId: id,
      oldValue: existing as unknown as Record<string, unknown>,
      newValue: updated as unknown as Record<string, unknown>,
      createdAt: new Date().toISOString(),
    });

    return updated;
  }

  async listElectricityAccounts(outletId: string): Promise<UtilityElectricityAccount[]> {
    const repo = new UtilityRepository(this.db);
    return await repo.listElectricityAccounts(outletId);
  }

  async getElectricityAccount(id: string): Promise<UtilityElectricityAccount> {
    const repo = new UtilityRepository(this.db);
    const account = await repo.getElectricityAccountById(id);
    if (!account) {
      throw new UtilityError(
        'UTILITY_ELECTRICITY_ACCOUNT_NOT_FOUND',
        'Electricity account not found.',
        404
      );
    }
    return account;
  }

  // ==========================================================================
  // Electricity Bills
  // ==========================================================================

  async createElectricityBill(
    outletId: string,
    userId: string,
    data: unknown
  ): Promise<UtilityElectricityBill> {
    const validated = CreateUtilityElectricityBillSchema.parse(data);
    const repo = new UtilityRepository(this.db);

    // 1. Verify electricity account exists and belongs to outlet
    const account = await repo.getElectricityAccountById(validated.electricityAccountId);
    if (!account) {
      throw new UtilityError(
        'UTILITY_ELECTRICITY_ACCOUNT_NOT_FOUND',
        'Electricity account not found.',
        404
      );
    }
    if (account.outletId !== outletId) {
      throw new UtilityError(
        'FORBIDDEN',
        'Electricity account belongs to another outlet.',
        403
      );
    }

    // 2. Check billing period uniqueness
    const existingBill = await repo.getElectricityBillByPeriod(
      validated.electricityAccountId,
      validated.billingPeriodStart,
      validated.billingPeriodEnd
    );
    if (existingBill) {
      throw new UtilityError(
        'UTILITY_BILL_PERIOD_EXISTS',
        'A bill for this electricity account and billing period already exists.',
        409
      );
    }

    // 3. Verify bill document exists and belongs to same outlet
    const doc = await repo.getDocumentById(validated.billDocumentId);
    if (!doc) {
      throw new UtilityError(
        'UTILITY_BILL_DOCUMENT_NOT_FOUND',
        'The specified bill document does not exist.',
        404
      );
    }
    if (doc.outletId !== outletId) {
      throw new UtilityError(
        'UTILITY_BILL_DOCUMENT_OUTLET_MISMATCH',
        'The specified bill document does not belong to this outlet.',
        403
      );
    }

    // 4. Safe money conversion
    const billAmountPaise = safeParseMoney(validated.billAmount);

    try {
      const bill = await repo.createElectricityBill({
        id: crypto.randomUUID(),
        outletId,
        electricityAccountId: validated.electricityAccountId,
        billingPeriodStart: validated.billingPeriodStart,
        billingPeriodEnd: validated.billingPeriodEnd,
        billAmountPaise,
        dueDate: validated.dueDate,
        billDocumentId: validated.billDocumentId,
        status: 'PENDING',
        paymentReceiptDocumentId: null,
        paymentReference: null,
        paidAt: null,
        paidByUserId: null,
        createdBy: userId,
      });

      await new AuditRepository(this.db).logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'UTILITY_ELECTRICITY_BILL_CREATE',
        entityType: 'UTILITY_ELECTRICITY_BILL',
        entityId: bill.id,
        newValue: bill as unknown as Record<string, unknown>,
        createdAt: new Date().toISOString(),
      });

      return this.formatBillDto(bill);
    } catch (err: any) {
      if (err instanceof UtilityError) throw err;
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        throw new UtilityError(
          'UTILITY_BILL_PERIOD_EXISTS',
          'A bill for this electricity account and billing period already exists.',
          409
        );
      }
      throw err;
    }
  }

  async updateElectricityBill(
    id: string,
    userId: string,
    data: unknown
  ): Promise<UtilityElectricityBill> {
    const validated = UpdateUtilityElectricityBillSchema.parse(data);
    const repo = new UtilityRepository(this.db);

    const existing = await repo.getElectricityBillById(id);
    if (!existing) {
      throw new UtilityError(
        'UTILITY_ELECTRICITY_BILL_NOT_FOUND',
        'Electricity bill not found.',
        404
      );
    }

    if (existing.status === 'PAID') {
      throw new UtilityError(
        'UTILITY_BILL_PAID_IMMUTABLE',
        'Cannot modify a paid electricity bill.',
        409
      );
    }

    // If new bill document provided, verify ownership
    if (validated.billDocumentId) {
      const doc = await repo.getDocumentById(validated.billDocumentId);
      if (!doc) {
        throw new UtilityError(
          'UTILITY_BILL_DOCUMENT_NOT_FOUND',
          'The specified bill document does not exist.',
          404
        );
      }
      if (doc.outletId !== existing.outletId) {
        throw new UtilityError(
          'UTILITY_BILL_DOCUMENT_OUTLET_MISMATCH',
          'The specified bill document does not belong to this outlet.',
          403
        );
      }
    }

    const newStart = validated.billingPeriodStart ?? existing.billingPeriodStart;
    const newEnd = validated.billingPeriodEnd ?? existing.billingPeriodEnd;
    if (newEnd < newStart) {
      throw new UtilityError(
        'VALIDATION_ERROR',
        'billingPeriodEnd must be on or after billingPeriodStart',
        400
      );
    }

    const updates: Partial<Pick<UtilityElectricityBill, 'billingPeriodStart' | 'billingPeriodEnd' | 'billAmountPaise' | 'dueDate' | 'billDocumentId'>> = {};
    if (validated.billingPeriodStart !== undefined) updates.billingPeriodStart = validated.billingPeriodStart;
    if (validated.billingPeriodEnd !== undefined) updates.billingPeriodEnd = validated.billingPeriodEnd;
    if (validated.billAmount !== undefined) updates.billAmountPaise = safeParseMoney(validated.billAmount);
    if (validated.dueDate !== undefined) updates.dueDate = validated.dueDate;
    if (validated.billDocumentId !== undefined) updates.billDocumentId = validated.billDocumentId;

    try {
      const updated = await repo.updateElectricityBillPending(id, updates);
      if (!updated) {
        throw new UtilityError(
          'UTILITY_BILL_PAID_IMMUTABLE',
          'Cannot modify a paid electricity bill or bill not found.',
          409
        );
      }

      await new AuditRepository(this.db).logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'UTILITY_ELECTRICITY_BILL_UPDATE',
        entityType: 'UTILITY_ELECTRICITY_BILL',
        entityId: id,
        oldValue: existing as unknown as Record<string, unknown>,
        newValue: updated as unknown as Record<string, unknown>,
        createdAt: new Date().toISOString(),
      });

      return this.formatBillDto(updated);
    } catch (err: any) {
      if (err instanceof UtilityError) throw err;
      if (err.message && err.message.includes('UTILITY_BILL_PAID_IMMUTABLE')) {
        throw new UtilityError(
          'UTILITY_BILL_PAID_IMMUTABLE',
          'Cannot modify a paid electricity bill.',
          409
        );
      }
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        throw new UtilityError(
          'UTILITY_BILL_PERIOD_EXISTS',
          'A bill for this electricity account and billing period already exists.',
          409
        );
      }
      throw err;
    }
  }

  async markElectricityBillPaid(
    id: string,
    userId: string,
    data: unknown
  ): Promise<UtilityElectricityBill> {
    const validated = MarkUtilityElectricityBillPaidSchema.parse(data);
    const repo = new UtilityRepository(this.db);

    const existing = await repo.getElectricityBillById(id);
    if (!existing) {
      throw new UtilityError(
        'UTILITY_ELECTRICITY_BILL_NOT_FOUND',
        'Electricity bill not found.',
        404
      );
    }

    if (existing.status === 'PAID') {
      throw new UtilityError(
        'UTILITY_BILL_ALREADY_PAID',
        'This electricity bill has already been marked as paid.',
        409
      );
    }

    // Verify payment receipt document exists and belongs to bill outlet
    const doc = await repo.getDocumentById(validated.paymentReceiptDocumentId);
    if (!doc) {
      throw new UtilityError(
        'UTILITY_PAYMENT_RECEIPT_NOT_FOUND',
        'Payment receipt document not found.',
        404
      );
    }
    if (doc.outletId !== existing.outletId) {
      throw new UtilityError(
        'UTILITY_PAYMENT_RECEIPT_OUTLET_MISMATCH',
        'Payment receipt document does not belong to this outlet.',
        403
      );
    }

    const paidAt = validated.paidAt ? new Date(validated.paidAt).toISOString() : new Date().toISOString();

    try {
      const updated = await repo.markElectricityBillPaidConditional(id, {
        paymentReceiptDocumentId: validated.paymentReceiptDocumentId,
        paymentReference: validated.paymentReference,
        paidAt,
        paidByUserId: userId,
      });

      if (!updated) {
        throw new UtilityError(
          'UTILITY_BILL_ALREADY_PAID',
          'This electricity bill has already been marked as paid.',
          409
        );
      }

      await new AuditRepository(this.db).logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'UTILITY_ELECTRICITY_BILL_MARK_PAID',
        entityType: 'UTILITY_ELECTRICITY_BILL',
        entityId: id,
        oldValue: existing as unknown as Record<string, unknown>,
        newValue: updated as unknown as Record<string, unknown>,
        createdAt: new Date().toISOString(),
      });

      return this.formatBillDto(updated);
    } catch (err: any) {
      if (err instanceof UtilityError) throw err;
      if (err.message && err.message.includes('UTILITY_BILL_PAID_IMMUTABLE')) {
        throw new UtilityError(
          'UTILITY_BILL_ALREADY_PAID',
          'This electricity bill has already been marked as paid.',
          409
        );
      }
      throw err;
    }
  }

  async getElectricityBill(id: string): Promise<UtilityElectricityBill> {
    const repo = new UtilityRepository(this.db);
    const bill = await repo.getElectricityBillById(id);
    if (!bill) {
      throw new UtilityError(
        'UTILITY_ELECTRICITY_BILL_NOT_FOUND',
        'Electricity bill not found.',
        404
      );
    }
    return this.formatBillDto(bill);
  }

  async listElectricityBills(
    outletId: string,
    query: unknown
  ): Promise<UtilityElectricityBill[]> {
    const filters = UtilityBillFilterSchema.parse(query || {});
    const repo = new UtilityRepository(this.db);
    const rows = await repo.listElectricityBills(outletId, filters);
    return rows.map(b => this.formatBillDto(b));
  }

  async getElectricitySummary(outletId: string): Promise<UtilityElectricitySummary> {
    const repo = new UtilityRepository(this.db);
    const todayStr = new Date().toISOString().slice(0, 10);
    try {
      const summary = await repo.getElectricitySummary(outletId, todayStr);

      return {
        ...summary,
        pendingAmountStr: formatPaiseToMoney(summary.pendingAmountPaise),
        overdueAmountStr: formatPaiseToMoney(summary.overdueAmountPaise),
      };
    } catch (err: any) {
      if (err instanceof UtilityError) throw err;
      if (err.message && err.message.includes('UTILITY_SUMMARY_OVERFLOW')) {
        throw new UtilityError(
          'UTILITY_SUMMARY_OVERFLOW',
          'Electricity summary exceeds safe monetary limits.',
          400
        );
      }
      throw err;
    }
  }

  private formatBillDto(bill: UtilityElectricityBill): UtilityElectricityBill {
    const todayStr = new Date().toISOString().slice(0, 10);
    const isOverdue = bill.status === 'PENDING' && bill.dueDate < todayStr;
    return {
      ...bill,
      billAmountStr: formatPaiseToMoney(bill.billAmountPaise),
      isOverdue,
    };
  }

  // ==========================================================================
  // Sub-Meters
  // ==========================================================================

  async createSubMeter(
    outletId: string,
    userId: string,
    data: unknown
  ): Promise<UtilitySubMeter> {
    const validated = CreateUtilitySubMeterSchema.parse(data);
    const repo = new UtilityRepository(this.db);

    const existingCode = await repo.getSubMeterByCode(outletId, validated.meterCode);
    if (existingCode) {
      throw new UtilityError(
        'UTILITY_SUB_METER_CODE_EXISTS',
        'A sub-meter with this code already exists at this outlet.',
        409
      );
    }

    if (validated.serialNumber && validated.serialNumber.trim() !== '') {
      const existingSerial = await repo.getSubMeterBySerial(outletId, validated.serialNumber.trim());
      if (existingSerial) {
        throw new UtilityError(
          'UTILITY_SUB_METER_SERIAL_EXISTS',
          'A sub-meter with this serial number already exists at this outlet.',
          409
        );
      }
    }

    let ratePaisePerKwh: number;
    if (validated.ratePaisePerKwh !== undefined) {
      ratePaisePerKwh = validated.ratePaisePerKwh;
    } else if (validated.ratePerKwh !== undefined) {
      ratePaisePerKwh = safeParseMoney(validated.ratePerKwh);
    } else {
      throw new UtilityError('VALIDATION_ERROR', 'ratePaisePerKwh or ratePerKwh is required', 400);
    }

    try {
      const subMeter = await repo.createSubMeter({
        id: crypto.randomUUID(),
        outletId,
        meterCode: validated.meterCode,
        name: validated.name,
        beneficiaryType: validated.beneficiaryType as UtilitySubMeterBeneficiaryType,
        beneficiaryName: validated.beneficiaryName,
        serialNumber: validated.serialNumber?.trim() || null,
        ratePaisePerKwh,
        status: (validated.status || 'ACTIVE') as UtilitySubMeterStatus,
        commissionedAt: validated.commissionedAt ? new Date(validated.commissionedAt).toISOString() : null,
        notes: validated.notes?.trim() || null,
        createdBy: userId,
      });

      await new AuditRepository(this.db).logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'UTILITY_SUB_METER_CREATE',
        entityType: 'UTILITY_SUB_METER',
        entityId: subMeter.id,
        newValue: subMeter as unknown as Record<string, unknown>,
        createdAt: new Date().toISOString(),
      });

      return this.formatSubMeterDto(subMeter);
    } catch (err: any) {
      if (err instanceof UtilityError) throw err;
      if (err.message && err.message.includes('idx_util_sub_meters_outlet_code')) {
        throw new UtilityError(
          'UTILITY_SUB_METER_CODE_EXISTS',
          'A sub-meter with this code already exists at this outlet.',
          409
        );
      }
      if (err.message && err.message.includes('idx_util_sub_meters_outlet_serial')) {
        throw new UtilityError(
          'UTILITY_SUB_METER_SERIAL_EXISTS',
          'A sub-meter with this serial number already exists at this outlet.',
          409
        );
      }
      throw err;
    }
  }

  async updateSubMeter(
    id: string,
    userId: string,
    data: unknown
  ): Promise<UtilitySubMeter> {
    const validated = UpdateUtilitySubMeterSchema.parse(data);
    const repo = new UtilityRepository(this.db);

    const existing = await repo.getSubMeterById(id);
    if (!existing) {
      throw new UtilityError(
        'UTILITY_SUB_METER_NOT_FOUND',
        'Sub-meter not found.',
        404
      );
    }

    if (validated.serialNumber !== undefined && validated.serialNumber !== null && validated.serialNumber.trim() !== '') {
      const trimmedSerial = validated.serialNumber.trim();
      if (trimmedSerial !== existing.serialNumber) {
        const existingSerial = await repo.getSubMeterBySerial(existing.outletId, trimmedSerial);
        if (existingSerial && existingSerial.id !== id) {
          throw new UtilityError(
            'UTILITY_SUB_METER_SERIAL_EXISTS',
            'A sub-meter with this serial number already exists at this outlet.',
            409
          );
        }
      }
    }

    const updates: Partial<Omit<UtilitySubMeter, 'id' | 'outletId' | 'meterCode' | 'createdAt' | 'createdBy' | 'ratePerKwhStr'>> = {};
    if (validated.name !== undefined) updates.name = validated.name;
    if (validated.beneficiaryType !== undefined) updates.beneficiaryType = validated.beneficiaryType as UtilitySubMeterBeneficiaryType;
    if (validated.beneficiaryName !== undefined) updates.beneficiaryName = validated.beneficiaryName;
    if (validated.serialNumber !== undefined) updates.serialNumber = validated.serialNumber?.trim() || null;
    if (validated.ratePaisePerKwh !== undefined) {
      updates.ratePaisePerKwh = validated.ratePaisePerKwh;
    } else if (validated.ratePerKwh !== undefined) {
      updates.ratePaisePerKwh = safeParseMoney(validated.ratePerKwh);
    }
    if (validated.status !== undefined) updates.status = validated.status as UtilitySubMeterStatus;
    if (validated.commissionedAt !== undefined) updates.commissionedAt = validated.commissionedAt ? new Date(validated.commissionedAt).toISOString() : null;
    if (validated.notes !== undefined) updates.notes = validated.notes?.trim() || null;

    try {
      const updated = await repo.updateSubMeter(id, updates);
      if (!updated) {
        throw new UtilityError(
          'UTILITY_SUB_METER_NOT_FOUND',
          'Sub-meter not found.',
          404
        );
      }

      await new AuditRepository(this.db).logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'UTILITY_SUB_METER_UPDATE',
        entityType: 'UTILITY_SUB_METER',
        entityId: id,
        oldValue: existing as unknown as Record<string, unknown>,
        newValue: updated as unknown as Record<string, unknown>,
        createdAt: new Date().toISOString(),
      });

      return this.formatSubMeterDto(updated);
    } catch (err: any) {
      if (err instanceof UtilityError) throw err;
      if (err.message && err.message.includes('idx_util_sub_meters_outlet_serial')) {
        throw new UtilityError(
          'UTILITY_SUB_METER_SERIAL_EXISTS',
          'A sub-meter with this serial number already exists at this outlet.',
          409
        );
      }
      throw err;
    }
  }

  async getSubMeter(id: string): Promise<UtilitySubMeter> {
    const repo = new UtilityRepository(this.db);
    const subMeter = await repo.getSubMeterById(id);
    if (!subMeter) {
      throw new UtilityError(
        'UTILITY_SUB_METER_NOT_FOUND',
        'Sub-meter not found.',
        404
      );
    }
    return this.formatSubMeterDto(subMeter);
  }

  async listSubMeters(
    outletId: string,
    query: unknown
  ): Promise<UtilitySubMeter[]> {
    const filters = UtilitySubMeterFilterSchema.parse(query || {});
    const repo = new UtilityRepository(this.db);
    const rows = await repo.listSubMeters(outletId, filters);
    return rows.map(sm => this.formatSubMeterDto(sm));
  }

  private formatSubMeterDto(subMeter: UtilitySubMeter): UtilitySubMeter {
    return {
      ...subMeter,
      ratePerKwhStr: formatPaiseToMoney(subMeter.ratePaisePerKwh),
    };
  }

  // ==========================================================================
  // Sub-Meter Readings
  // ==========================================================================

  async createSubMeterReading(
    subMeterId: string,
    userId: string,
    data: unknown
  ): Promise<UtilitySubMeterReading> {
    const validated = CreateUtilitySubMeterReadingSchema.parse(data);
    const repo = new UtilityRepository(this.db);

    const subMeter = await repo.getSubMeterById(subMeterId);
    if (!subMeter) {
      throw new UtilityError(
        'UTILITY_SUB_METER_NOT_FOUND',
        'Sub-meter not found.',
        404
      );
    }

    if (subMeter.status !== 'ACTIVE') {
      throw new UtilityError(
        'SUB_METER_NOT_ACTIVE',
        'Only active sub-meters accept new readings.',
        400
      );
    }

    let readingMilliKwh: number;
    try {
      readingMilliKwh = parseMilliKwh(validated.reading);
    } catch (err: any) {
      if (err.message && err.message.includes('OVERFLOW')) {
        throw new UtilityError('VALIDATION_ERROR', 'Meter reading value exceeds safe limit.', 400);
      }
      throw new UtilityError('VALIDATION_ERROR', 'Invalid meter reading value.', 400);
    }

    const readingAt = new Date(validated.readingAt).toISOString();

    const latest = await repo.getLatestSubMeterReading(subMeterId);

    let previousReadingId: string | null = null;
    let previousReadingMilliKwh: number | null = null;
    let consumptionMilliKwh = 0;
    let chargePaise = 0;

    const ratePaisePerKwhSnapshot = subMeter.ratePaisePerKwh;

    if (latest) {
      if (readingAt <= latest.readingAt) {
        throw new UtilityError(
          'SUB_METER_READING_OUT_OF_ORDER',
          'New reading timestamp must be after the latest reading timestamp.',
          400
        );
      }
      if (readingMilliKwh < latest.readingMilliKwh) {
        throw new UtilityError(
          'SUB_METER_READING_DECREASE',
          'New meter reading value cannot be lower than the previous reading value.',
          400
        );
      }

      previousReadingId = latest.id;
      previousReadingMilliKwh = latest.readingMilliKwh;
      consumptionMilliKwh = readingMilliKwh - latest.readingMilliKwh;
      try {
        chargePaise = calculateSubMeterChargePaise(consumptionMilliKwh, ratePaisePerKwhSnapshot);
      } catch (err: any) {
        if (err.message && err.message.includes('UTILITY_CHARGE_OVERFLOW')) {
          throw new UtilityError('UTILITY_CHARGE_OVERFLOW', 'Calculated electricity charge exceeds safe limits.', 400);
        }
        throw err;
      }
    }

    try {
      const created = await repo.createSubMeterReading({
        id: crypto.randomUUID(),
        outletId: subMeter.outletId,
        subMeterId,
        previousReadingId,
        readingAt,
        readingMilliKwh,
        previousReadingMilliKwh,
        consumptionMilliKwh,
        ratePaisePerKwhSnapshot,
        chargePaise,
        recordedByUserId: userId,
        notes: validated.notes?.trim() || null,
      });

      await new AuditRepository(this.db).logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'UTILITY_SUB_METER_READING_CREATE',
        entityType: 'UTILITY_SUB_METER_READING',
        entityId: created.id,
        newValue: created as unknown as Record<string, unknown>,
        createdAt: new Date().toISOString(),
      });

      return this.formatReadingDto(created);
    } catch (err: any) {
      if (err instanceof UtilityError) throw err;
      if (
        (err.message && err.message.includes('idx_util_sub_meter_readings_prev')) ||
        (err.message && err.message.includes('idx_util_sub_meter_readings_single_root')) ||
        (err.message && err.message.includes('SUB_METER_READING_INVALID_PREDECESSOR')) ||
        (err.message && err.message.includes('SUB_METER_READING_OUT_OF_ORDER'))
      ) {
        throw new UtilityError(
          'SUB_METER_READING_STATE_CHANGED',
          'Sub-meter reading chain has been modified concurrently. Please refresh and retry.',
          409
        );
      }
      if (err.message && err.message.includes('SUB_METER_READING_DECREASE')) {
        throw new UtilityError(
          'SUB_METER_READING_DECREASE',
          'New meter reading value cannot be lower than the previous reading value.',
          400
        );
      }
      throw err;
    }
  }

  async listSubMeterReadings(subMeterId: string): Promise<UtilitySubMeterReading[]> {
    const repo = new UtilityRepository(this.db);
    const subMeter = await repo.getSubMeterById(subMeterId);
    if (!subMeter) {
      throw new UtilityError(
        'UTILITY_SUB_METER_NOT_FOUND',
        'Sub-meter not found.',
        404
      );
    }
    const rows = await repo.listSubMeterReadings(subMeterId);
    return rows.map(r => this.formatReadingDto(r));
  }

  private formatReadingDto(reading: UtilitySubMeterReading): UtilitySubMeterReading {
    return {
      ...reading,
      readingStr: formatMilliKwh(reading.readingMilliKwh),
      previousReadingStr: reading.previousReadingMilliKwh !== null ? formatMilliKwh(reading.previousReadingMilliKwh) : null,
      consumptionStr: formatMilliKwh(reading.consumptionMilliKwh),
      ratePerKwhStr: formatPaiseToMoney(reading.ratePaisePerKwhSnapshot),
      chargeStr: formatPaiseToMoney(reading.chargePaise),
    };
  }

  // ==========================================================================
  // Charge Summary
  // ==========================================================================

  async getSubMeterChargeSummary(
    outletId: string,
    query: unknown
  ): Promise<UtilitySubMeterChargeSummary> {
    const filters = UtilityChargeSummaryFilterSchema.parse(query || {});
    const repo = new UtilityRepository(this.db);

    if (filters.subMeterId) {
      const subMeter = await repo.getSubMeterById(filters.subMeterId);
      if (!subMeter) {
        throw new UtilityError('UTILITY_SUB_METER_NOT_FOUND', 'Sub-meter not found.', 404);
      }
      if (subMeter.outletId !== outletId) {
        throw new UtilityError('FORBIDDEN', 'Sub-meter belongs to another outlet.', 403);
      }
    }

    const fromDateIso = filters.fromDate ? `${filters.fromDate}T00:00:00.000Z` : undefined;
    const toDateIso = filters.toDate ? `${filters.toDate}T23:59:59.999Z` : undefined;

    const { subMeters, readings } = await repo.getSubMeterChargeSummary(outletId, {
      fromDate: fromDateIso,
      toDate: toDateIso,
      subMeterId: filters.subMeterId,
    });

    // Map readings by subMeterId
    const readingsByMeter = new Map<string, UtilitySubMeterReading[]>();
    for (const r of readings) {
      const list = readingsByMeter.get(r.subMeterId) || [];
      list.push(r);
      readingsByMeter.set(r.subMeterId, list);
    }

    try {
      let totalConsumptionMilliKwh = 0;
      let totalChargePaise = 0;
      let totalReadingCount = 0;

      const bySubMeter: UtilitySubMeterChargeSummaryItem[] = [];

      for (const sm of subMeters) {
        const meterReadings = readingsByMeter.get(sm.id) || [];
        let meterConsumption = 0;
        let meterCharge = 0;
        const count = meterReadings.length;

        for (const r of meterReadings) {
          meterConsumption = checkedMilliKwhAdd(meterConsumption, r.consumptionMilliKwh);
          meterCharge = checkedUtilityMoneyAdd(meterCharge, r.chargePaise);
        }

        totalConsumptionMilliKwh = checkedMilliKwhAdd(totalConsumptionMilliKwh, meterConsumption);
        totalChargePaise = checkedUtilityMoneyAdd(totalChargePaise, meterCharge);
        totalReadingCount += count;

        bySubMeter.push({
          subMeterId: sm.id,
          meterCode: sm.meterCode,
          name: sm.name,
          beneficiaryType: sm.beneficiaryType,
          beneficiaryName: sm.beneficiaryName,
          consumptionMilliKwh: meterConsumption,
          consumptionStr: formatMilliKwh(meterConsumption),
          chargePaise: meterCharge,
          chargeStr: formatPaiseToMoney(meterCharge),
          readingCount: count,
        });
      }

      return {
        totalConsumptionMilliKwh,
        totalConsumptionStr: formatMilliKwh(totalConsumptionMilliKwh),
        totalChargePaise,
        totalChargeStr: formatPaiseToMoney(totalChargePaise),
        readingCount: totalReadingCount,
        bySubMeter,
      };
    } catch (err: any) {
      if (err instanceof UtilityError) throw err;
      if (err.message && err.message.includes('UTILITY_SUMMARY_OVERFLOW')) {
        throw new UtilityError(
          'UTILITY_SUMMARY_OVERFLOW',
          'Sub-meter summary aggregate exceeds safe limits.',
          400
        );
      }
      throw err;
    }
  }
}
