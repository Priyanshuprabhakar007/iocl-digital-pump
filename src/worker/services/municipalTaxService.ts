import { MunicipalTaxRepository, MunicipalTaxFilters } from '../repositories/municipalTaxRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { AppDatabase } from '../../db';
import {
  CreateMunicipalTaxDueSchema,
  UpdateMunicipalTaxDueSchema,
  MarkMunicipalTaxPaidSchema,
  MunicipalTaxFilterSchema,
} from '../../shared/validators';
import {
  MunicipalTaxDue,
  MunicipalTaxSummary,
  MunicipalTaxStatus,
} from '../../shared/types';
import { parseMoneyToPaise, formatPaiseToMoney } from '../../shared/utilityUtils';

export class MunicipalTaxError extends Error {
  constructor(public code: string, message: string, public status: number = 400) {
    super(message);
    this.name = 'MunicipalTaxError';
  }
}

function safeParseMoney(amount: string): number {
  try {
    const paise = parseMoneyToPaise(amount);
    if (paise > 100_000_000_00) {
      throw new MunicipalTaxError('VALIDATION_ERROR', 'Money amount exceeds safe limits.', 400);
    }
    return paise;
  } catch (err: any) {
    if (err instanceof MunicipalTaxError) throw err;
    if (err.message && err.message.includes('OVERFLOW')) {
      throw new MunicipalTaxError('VALIDATION_ERROR', 'Money amount exceeds safe limits.', 400);
    }
    throw new MunicipalTaxError('VALIDATION_ERROR', 'Invalid money amount format.', 400);
  }
}

function formatDueDto(due: MunicipalTaxDue, currentDateStr?: string): MunicipalTaxDue {
  const today = currentDateStr || new Date().toISOString().slice(0, 10);
  return {
    ...due,
    amountStr: formatPaiseToMoney(due.amountPaise),
    isOverdue: due.status === 'PENDING' && due.dueDate < today,
  };
}

export class MunicipalTaxService {
  constructor(private db: AppDatabase) {}

  async createDue(
    outletId: string,
    userId: string,
    data: unknown
  ): Promise<MunicipalTaxDue> {
    const validated = CreateMunicipalTaxDueSchema.parse(data);
    const repo = new MunicipalTaxRepository(this.db);

    const amountPaise = safeParseMoney(validated.amount);
    if (amountPaise <= 0) {
      throw new MunicipalTaxError('VALIDATION_ERROR', 'Amount must be greater than zero.', 400);
    }

    // Check duplicate statutory identity
    const existing = await repo.getDuplicate(
      outletId,
      validated.taxType,
      validated.authorityName,
      validated.referenceNumber,
      validated.assessmentPeriodStart,
      validated.assessmentPeriodEnd
    );
    if (existing) {
      throw new MunicipalTaxError(
        'MUNICIPAL_TAX_DUE_EXISTS',
        'A statutory due for this assessment period already exists.',
        409
      );
    }

    // Validate assessment document if provided
    if (validated.assessmentDocumentId) {
      const doc = await repo.getDocumentById(validated.assessmentDocumentId);
      if (!doc) {
        throw new MunicipalTaxError(
          'MUNICIPAL_TAX_DOCUMENT_NOT_FOUND',
          'The selected assessment document could not be found.',
          404
        );
      }
      if (doc.outletId !== outletId) {
        throw new MunicipalTaxError(
          'MUNICIPAL_TAX_DOCUMENT_OUTLET_MISMATCH',
          'The assessment document does not belong to this outlet.',
          400
        );
      }
    }

    try {
      const due = await repo.create({
        id: crypto.randomUUID(),
        outletId,
        taxType: validated.taxType,
        authorityName: validated.authorityName,
        referenceNumber: validated.referenceNumber,
        assessmentFrequency: validated.assessmentFrequency,
        assessmentPeriodStart: validated.assessmentPeriodStart,
        assessmentPeriodEnd: validated.assessmentPeriodEnd,
        amountPaise,
        dueDate: validated.dueDate,
        assessmentDocumentId: validated.assessmentDocumentId ?? null,
        status: 'PENDING',
        paymentReceiptDocumentId: null,
        paymentReference: null,
        paidAt: null,
        paidByUserId: null,
        notes: validated.notes ?? null,
        createdBy: userId,
      });

      await new AuditRepository(this.db).logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'MUNICIPAL_TAX_CREATE',
        entityType: 'MUNICIPAL_TAX_DUE',
        entityId: due.id,
        newValue: due as unknown as Record<string, unknown>,
        createdAt: new Date().toISOString(),
      });

      return formatDueDto(due);
    } catch (err: any) {
      if (err instanceof MunicipalTaxError) throw err;
      if (err.message && (err.message.includes('UNIQUE') || err.message.includes('idx_municipal_tax_statutory_identity'))) {
        throw new MunicipalTaxError(
          'MUNICIPAL_TAX_DUE_EXISTS',
          'A statutory due for this assessment period already exists.',
          409
        );
      }
      if (err.message && err.message.includes('MUNICIPAL_TAX_DOCUMENT_OUTLET_MISMATCH')) {
        throw new MunicipalTaxError(
          'MUNICIPAL_TAX_DOCUMENT_OUTLET_MISMATCH',
          'The assessment document does not belong to this outlet.',
          400
        );
      }
      throw err;
    }
  }

  async getDueById(id: string, outletId?: string): Promise<MunicipalTaxDue> {
    const repo = new MunicipalTaxRepository(this.db);
    const due = await repo.getById(id);
    if (!due) {
      throw new MunicipalTaxError(
        'MUNICIPAL_TAX_DUE_NOT_FOUND',
        'The statutory due could not be found.',
        404
      );
    }
    if (outletId && due.outletId !== outletId) {
      throw new MunicipalTaxError(
        'FORBIDDEN',
        'Access to statutory due at another outlet is forbidden.',
        403
      );
    }
    return formatDueDto(due);
  }

  async listDues(outletId: string, query?: unknown): Promise<MunicipalTaxDue[]> {
    const validated = query ? MunicipalTaxFilterSchema.parse(query) : undefined;
    const repo = new MunicipalTaxRepository(this.db);
    const rows = await repo.listByOutlet(outletId, validated as MunicipalTaxFilters);
    const today = new Date().toISOString().slice(0, 10);
    return rows.map(r => formatDueDto(r, today));
  }

  async updatePendingDue(
    id: string,
    outletId: string,
    userId: string,
    data: unknown
  ): Promise<MunicipalTaxDue> {
    const validated = UpdateMunicipalTaxDueSchema.parse(data);
    const repo = new MunicipalTaxRepository(this.db);

    const existing = await repo.getById(id);
    if (!existing) {
      throw new MunicipalTaxError(
        'MUNICIPAL_TAX_DUE_NOT_FOUND',
        'The statutory due could not be found.',
        404
      );
    }
    if (existing.outletId !== outletId) {
      throw new MunicipalTaxError(
        'FORBIDDEN',
        'Access to statutory due at another outlet is forbidden.',
        403
      );
    }

    if (existing.status === 'PAID') {
      throw new MunicipalTaxError(
        'MUNICIPAL_TAX_PAID_IMMUTABLE',
        'Paid statutory dues cannot be modified.',
        409
      );
    }

    // Validate resulting period
    const resultingStart = validated.assessmentPeriodStart ?? existing.assessmentPeriodStart;
    const resultingEnd = validated.assessmentPeriodEnd ?? existing.assessmentPeriodEnd;
    if (resultingEnd < resultingStart) {
      throw new MunicipalTaxError(
        'VALIDATION_ERROR',
        'assessmentPeriodEnd must be on or after assessmentPeriodStart',
        400
      );
    }

    // Check duplicate statutory identity if identity or period changed
    const resultingType = validated.taxType ?? existing.taxType;
    const resultingAuth = validated.authorityName ?? existing.authorityName;
    const resultingRef = validated.referenceNumber ?? existing.referenceNumber;

    if (
      resultingType !== existing.taxType ||
      resultingAuth !== existing.authorityName ||
      resultingRef !== existing.referenceNumber ||
      resultingStart !== existing.assessmentPeriodStart ||
      resultingEnd !== existing.assessmentPeriodEnd
    ) {
      const dup = await repo.getDuplicate(
        outletId,
        resultingType,
        resultingAuth,
        resultingRef,
        resultingStart,
        resultingEnd
      );
      if (dup && dup.id !== id) {
        throw new MunicipalTaxError(
          'MUNICIPAL_TAX_DUE_EXISTS',
          'A statutory due for this assessment period already exists.',
          409
        );
      }
    }

    // Validate assessment document if changed
    if (validated.assessmentDocumentId !== undefined) {
      if (validated.assessmentDocumentId && validated.assessmentDocumentId !== existing.assessmentDocumentId) {
        const doc = await repo.getDocumentById(validated.assessmentDocumentId);
        if (!doc) {
          throw new MunicipalTaxError(
            'MUNICIPAL_TAX_DOCUMENT_NOT_FOUND',
            'The selected assessment document could not be found.',
            404
          );
        }
        if (doc.outletId !== outletId) {
          throw new MunicipalTaxError(
            'MUNICIPAL_TAX_DOCUMENT_OUTLET_MISMATCH',
            'The assessment document does not belong to this outlet.',
            400
          );
        }
      }
    }

    let amountPaise: number | undefined;
    if (validated.amount !== undefined) {
      amountPaise = safeParseMoney(validated.amount);
      if (amountPaise <= 0) {
        throw new MunicipalTaxError('VALIDATION_ERROR', 'Amount must be greater than zero.', 400);
      }
    }

    const updates: Partial<MunicipalTaxDue> = {};
    if (validated.taxType !== undefined) updates.taxType = validated.taxType;
    if (validated.authorityName !== undefined) updates.authorityName = validated.authorityName;
    if (validated.referenceNumber !== undefined) updates.referenceNumber = validated.referenceNumber;
    if (validated.assessmentFrequency !== undefined) updates.assessmentFrequency = validated.assessmentFrequency;
    if (validated.assessmentPeriodStart !== undefined) updates.assessmentPeriodStart = validated.assessmentPeriodStart;
    if (validated.assessmentPeriodEnd !== undefined) updates.assessmentPeriodEnd = validated.assessmentPeriodEnd;
    if (amountPaise !== undefined) updates.amountPaise = amountPaise;
    if (validated.dueDate !== undefined) updates.dueDate = validated.dueDate;
    if (validated.assessmentDocumentId !== undefined) updates.assessmentDocumentId = validated.assessmentDocumentId ?? null;
    if (validated.notes !== undefined) updates.notes = validated.notes ?? null;

    try {
      const updated = await repo.updatePending(id, updates);
      if (!updated) {
        throw new MunicipalTaxError(
          'MUNICIPAL_TAX_STATE_CHANGED',
          'The statutory due was modified or marked as paid concurrently.',
          409
        );
      }

      await new AuditRepository(this.db).logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'MUNICIPAL_TAX_UPDATE',
        entityType: 'MUNICIPAL_TAX_DUE',
        entityId: updated.id,
        oldValue: existing as unknown as Record<string, unknown>,
        newValue: updated as unknown as Record<string, unknown>,
        createdAt: new Date().toISOString(),
      });

      return formatDueDto(updated);
    } catch (err: any) {
      if (err instanceof MunicipalTaxError) throw err;
      if (err.message && (err.message.includes('UNIQUE') || err.message.includes('idx_municipal_tax_statutory_identity'))) {
        throw new MunicipalTaxError(
          'MUNICIPAL_TAX_DUE_EXISTS',
          'A statutory due for this assessment period already exists.',
          409
        );
      }
      if (err.message && err.message.includes('MUNICIPAL_TAX_PAID_IMMUTABLE')) {
        throw new MunicipalTaxError(
          'MUNICIPAL_TAX_PAID_IMMUTABLE',
          'Paid statutory dues cannot be modified.',
          409
        );
      }
      if (err.message && err.message.includes('MUNICIPAL_TAX_DOCUMENT_OUTLET_MISMATCH')) {
        throw new MunicipalTaxError(
          'MUNICIPAL_TAX_DOCUMENT_OUTLET_MISMATCH',
          'The assessment document does not belong to this outlet.',
          400
        );
      }
      throw err;
    }
  }

  async markPaid(
    id: string,
    outletId: string,
    userId: string,
    data: unknown
  ): Promise<MunicipalTaxDue> {
    const validated = MarkMunicipalTaxPaidSchema.parse(data);
    const repo = new MunicipalTaxRepository(this.db);

    const existing = await repo.getById(id);
    if (!existing) {
      throw new MunicipalTaxError(
        'MUNICIPAL_TAX_DUE_NOT_FOUND',
        'The statutory due could not be found.',
        404
      );
    }
    if (existing.outletId !== outletId) {
      throw new MunicipalTaxError(
        'FORBIDDEN',
        'Access to statutory due at another outlet is forbidden.',
        403
      );
    }

    if (existing.status === 'PAID') {
      throw new MunicipalTaxError(
        'MUNICIPAL_TAX_ALREADY_PAID',
        'This statutory due has already been marked as paid.',
        409
      );
    }

    // Validate payment receipt document
    const receiptDoc = await repo.getDocumentById(validated.paymentReceiptDocumentId);
    if (!receiptDoc) {
      throw new MunicipalTaxError(
        'MUNICIPAL_TAX_RECEIPT_NOT_FOUND',
        'The payment receipt document could not be found.',
        404
      );
    }
    if (receiptDoc.outletId !== outletId) {
      throw new MunicipalTaxError(
        'MUNICIPAL_TAX_RECEIPT_OUTLET_MISMATCH',
        'The payment receipt document does not belong to this outlet.',
        400
      );
    }

    const paidAt = validated.paidAt || new Date().toISOString();

    try {
      const paid = await repo.markPaidConditional(id, {
        paymentReceiptDocumentId: validated.paymentReceiptDocumentId,
        paymentReference: validated.paymentReference ?? null,
        paidAt,
        paidByUserId: userId,
      });

      if (!paid) {
        throw new MunicipalTaxError(
          'MUNICIPAL_TAX_ALREADY_PAID',
          'This statutory due was concurrently marked as paid.',
          409
        );
      }

      await new AuditRepository(this.db).logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'MUNICIPAL_TAX_MARK_PAID',
        entityType: 'MUNICIPAL_TAX_DUE',
        entityId: paid.id,
        oldValue: existing as unknown as Record<string, unknown>,
        newValue: paid as unknown as Record<string, unknown>,
        createdAt: new Date().toISOString(),
      });

      return formatDueDto(paid);
    } catch (err: any) {
      if (err instanceof MunicipalTaxError) throw err;
      if (err.message && err.message.includes('MUNICIPAL_TAX_RECEIPT_OUTLET_MISMATCH')) {
        throw new MunicipalTaxError(
          'MUNICIPAL_TAX_RECEIPT_OUTLET_MISMATCH',
          'The payment receipt document does not belong to this outlet.',
          400
        );
      }
      if (err.message && err.message.includes('MUNICIPAL_TAX_PAID_IMMUTABLE')) {
        throw new MunicipalTaxError(
          'MUNICIPAL_TAX_PAID_IMMUTABLE',
          'Paid statutory dues cannot be modified.',
          409
        );
      }
      throw err;
    }
  }

  async getSummary(outletId: string): Promise<MunicipalTaxSummary> {
    const repo = new MunicipalTaxRepository(this.db);
    const today = new Date().toISOString().slice(0, 10);
    try {
      return await repo.getSummary(outletId, today);
    } catch (err: any) {
      if (err.message && err.message.includes('OVERFLOW')) {
        throw new MunicipalTaxError(
          'MUNICIPAL_TAX_SUMMARY_OVERFLOW',
          'Statutory due summary amounts exceed safe calculation limits.',
          400
        );
      }
      throw err;
    }
  }
}
