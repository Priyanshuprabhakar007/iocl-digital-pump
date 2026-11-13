import { PumpRepository } from '../repositories/pumpRepository';
import { FinancialRepository } from '../repositories/financialRepository';
import { FinancialService } from './financialService';
import { AtomicShiftCloseFinalizer } from './atomicShiftCloseFinalizer';
import { OperationalShift } from '../../shared/types';

export class ShiftCloseService {
  constructor(
    private pumpRepo: PumpRepository,
    private financialRepo: FinancialRepository,
    private financialService: FinancialService,
    private atomicFinalizer: AtomicShiftCloseFinalizer
  ) {}

  async closeShift(
    shiftId: string,
    closedByUserId: string,
    varianceReason?: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<{ success: boolean; shift: OperationalShift | null; error?: string; message?: string; details?: any }> {
    // 1. Atomically claim shift: OPEN -> CLOSING
    const beginRes = await this.pumpRepo.beginCloseConditional(shiftId);
    if (!beginRes.success || !beginRes.shift) {
      return {
        success: false,
        shift: beginRes.shift,
        error: 'SHIFT_CLOSED_OR_CLOSING',
        message: 'Shift is already closing, closed, or locked',
      };
    }

    const shift = beginRes.shift;

    // Prior financial evidence requires review; an already computed stock
    // reconciliation may be reused only if the exact current inputs reproduce
    // every stored quantity. Never overwrite a prior reconciliation.
    const [priorStock, priorFinancial] = await Promise.all([
      this.pumpRepo.listShiftStockReconciliations(shiftId),
      this.financialRepo.findShiftFinancialReconciliation(shiftId),
    ]);
    if (priorFinancial) {
      return {
        success: false,
        shift: await this.pumpRepo.findOperationalShiftById(shiftId),
        error: 'SHIFT_CLOSE_REVIEW_REQUIRED',
        message: 'This shift already contains financial reconciliation evidence. Closing is held for authorized review; no records were overwritten or deleted.',
      };
    }

    // Only use this path BEFORE the first stock/finance write. Validations
    // must not erase a reconciliation, and a failed restore requires review.
    const rejectBeforeWrites = async (errorCode: string, message: string, details?: any) => {
      // Even if this attempt has written nothing, previously persisted stock
      // evidence means reopening is not automatically safe.
      if (priorStock.length > 0) {
        return {
          success: false,
          shift: await this.pumpRepo.findOperationalShiftById(shiftId),
          error: 'SHIFT_CLOSE_REVIEW_REQUIRED',
          message: 'Validation failed with existing stock reconciliation evidence. Shift is held for authorized review; no records were changed.',
          details,
        };
      }
      try {
        await this.pumpRepo.restoreOpenFromClosing(shiftId);
        const current = await this.pumpRepo.findOperationalShiftById(shiftId);
        if (current?.status === 'OPEN') {
          return { success: false, shift: current, error: errorCode, message, details };
        }
      } catch {
        // CLOSING may remain in place. Never delete or reset evidence.
      }
      return {
        success: false,
        shift: await this.pumpRepo.findOperationalShiftById(shiftId),
        error: 'SHIFT_CLOSE_REVIEW_REQUIRED',
        message: 'Shift could not be safely reopened after validation. Check its persisted status and evidence with an authorized reviewer.',
      };
    };

    // Once an atomic preparation batch is attempted, do not guess whether
    // it rolled back or committed after a lost response. Leave CLOSING,
    // retain every row, and require supervised investigation.
    const holdAfterWrite = async () => ({
      success: false,
      shift: await this.pumpRepo.findOperationalShiftById(shiftId),
      error: 'SHIFT_CLOSE_REVIEW_REQUIRED',
      message: 'Atomic reconciliation preparation failed or its outcome is uncertain. Shift is held for authorized review; do not retry automatically.',
    });

    // 2. Validate tank/receipt completeness
    const tankCheck = await this.pumpRepo.validateShiftCompleteness(shiftId);
    if (!tankCheck.valid) {
      return rejectBeforeWrites(
        tankCheck.error || 'INCOMPLETE_TANK_STOCK_DATA',
        tankCheck.message || 'Tank stock data is incomplete',
        tankCheck.details || null
      );
    }

    // 3. Validate meter/nozzle completeness
    const snapshots = await this.pumpRepo.listShiftNozzleSnapshots(shiftId);
    const readings = await this.pumpRepo.listReadingsForShift(shiftId);
    const unavails = await this.pumpRepo.listUnavailabilityForShift(shiftId);

    const coveredNozzleIds = new Set<string>();
    readings.forEach(r => coveredNozzleIds.add(r.nozzleId));
    unavails.forEach(u => coveredNozzleIds.add(u.nozzleId));

    const missingSnapshots = snapshots.filter(s => !coveredNozzleIds.has(s.nozzleId));
    if (missingSnapshots.length > 0) {
      const missingDescriptions = missingSnapshots.map(
        s => `Dispenser #${s.dispenserNumber} - Nozzle #${s.nozzleNumber} (${s.productName || s.productCode})`
      );
      return rejectBeforeWrites(
        'INCOMPLETE_SHIFT_READINGS',
        `Cannot close shift. ${missingSnapshots.length} active nozzle(s) have neither a meter reading nor an approved unavailability record.`,
        { missingCount: missingSnapshots.length, missingNozzles: missingDescriptions }
      );
    }

    // 4. Validate ALL financial/price/variance inputs without persistence.
    //    Validation errors can safely restore OPEN only because no stock or
    //    financial reconciliation rows have been written yet.
    let financialPreview;
    try {
      financialPreview = await this.financialService.performFinancialReconciliation(shiftId, varianceReason, false);
    } catch (err: any) {
      const msg = err?.message || err;
      if (msg === 'INCOMPLETE_CNG_DATA') {
        return rejectBeforeWrites('INCOMPLETE_CNG_DATA', 'CNG MFM shift data must be completed before closing this shift.');
      }
      if (msg === 'CNG_PRICE_SNAPSHOT_UNAVAILABLE') {
        return rejectBeforeWrites('CNG_PRICE_SNAPSHOT_UNAVAILABLE', 'CNG historical price snapshot unavailable');
      }
      if (msg === 'CNG_PRICE_SNAPSHOT_AMBIGUOUS') {
        return rejectBeforeWrites('CNG_PRICE_SNAPSHOT_AMBIGUOUS', 'Multiple CNG historical price snapshots found');
      }
      if (msg === 'VARIANCE_REASON_REQUIRED') {
        return rejectBeforeWrites('VARIANCE_REASON_REQUIRED', 'Non-zero variance requires a reason');
      }
      if (msg === 'FINANCIAL_PRICE_SNAPSHOT_UNAVAILABLE') {
        return rejectBeforeWrites('PRICE_SNAPSHOT_MISSING', 'Historical price snapshot unavailable');
      }
      if (msg === 'FINANCIAL_AMOUNT_OVERFLOW') {
        return rejectBeforeWrites('FINANCIAL_AMOUNT_OVERFLOW', 'Financial amount overflow');
      }
      return rejectBeforeWrites('FINANCIAL_RECONCILIATION_FAILED', typeof msg === 'string' ? msg : 'Financial reconciliation failed');
    }

    // 5. Calculate stock WITHOUT writing. If the preview itself fails
    //    before any reconciliation write, a clean attempt may restore OPEN.
    let stockPreview;
    try {
      stockPreview = await this.pumpRepo.calculateAndSaveShiftStockReconciliation(shiftId, { persist: false });
    } catch (err: any) {
      if (priorStock.length > 0) {
        return {
          success: false,
          shift: await this.pumpRepo.findOperationalShiftById(shiftId),
          error: 'SHIFT_CLOSE_REVIEW_REQUIRED',
          message: 'Existing stock reconciliation could not be independently recalculated. Shift is held for authorized review.',
        };
      }
      return rejectBeforeWrites(
        err?.code || 'RECONCILIATION_FAILED',
        err?.message || 'Failed to calculate stock reconciliation without persistence',
      );
    }

    if (!Array.isArray(stockPreview) || stockPreview.length === 0) {
      return {
        success: false,
        shift: await this.pumpRepo.findOperationalShiftById(shiftId),
        error: 'SHIFT_CLOSE_REVIEW_REQUIRED',
        message: 'Stock reconciliation preview has no expected tank rows. Authorized review required.',
      };
    }

    // 6. An operator's previously calculated stock reconciliation can be
    //    reused without UPDATE only if every saved per-tank amount matches a
    //    fresh read-only calculation. Otherwise retain CLOSING for review.
    if (priorStock.length > 0) {
      const fields = [
        'openingStockMilliunits', 'receiptQuantityMilliunits', 'salesQuantityMilliunits',
        'theoreticalClosingStockMilliunits', 'physicalClosingStockMilliunits',
        'varianceMilliunits', 'varianceStatus',
      ] as const;
      const currentByTank = new Map(stockPreview.map(row => [row.tankId, row]));
      const exactMatch = priorStock.length === stockPreview.length &&
        priorStock.every(stored => {
          const current = currentByTank.get(stored.tankId);
          return current && stored.outletId === shift.outletId &&
            stored.productId === current.productId &&
            fields.every(field => stored[field] === current[field]);
        });
      if (!exactMatch) {
        return {
          success: false,
          shift: await this.pumpRepo.findOperationalShiftById(shiftId),
          error: 'SHIFT_CLOSE_REVIEW_REQUIRED',
          message: 'Saved stock reconciliation differs from current source inputs or has missing tanks. No evidence was modified; authorized review is required.',
        };
      }
    }

    // 7. New stock + finance rows are inserted in ONE D1 transaction. If
    //    finance or any stock INSERT fails, all of this batch rolls back.
    //    Precomputed stock is reused only after the verified exact match.
    //    No evidence is overwritten, deleted or automatically retried.
    try {
      const prepared = await this.atomicFinalizer.prepare(
        shiftId, shift.outletId, stockPreview, financialPreview,
        priorStock.length > 0,
      );
      if (!prepared) {
        return holdAfterWrite();
      }
    } catch {
      // Includes database failures and post-commit network uncertainty.
      // Never assume rollback on an ambiguous response.
      return holdAfterWrite();
    }

    // 8. The persisted finance row must exist BEFORE the atomic finalization
    //    batch. A missing row is an integrity/uncertain state, never success.
    const recon = await this.financialRepo.findShiftFinancialReconciliation(shiftId);
    if (!recon) {
      return {
        success: false,
        shift: await this.pumpRepo.findOperationalShiftById(shiftId),
        error: 'SHIFT_CLOSE_REVIEW_REQUIRED',
        message: 'Financial reconciliation evidence missing. Shift is held for authorized review; do not retry automatically.',
      };
    }

    // 9. CLOSING -> CLOSED and both mandatory audits are ONE D1 batch. If
    //    any audit fails, the update must roll back. If the provider throws,
    //    a network-after-commit ambiguity cannot be ruled out: do not reopen
    //    or delete any evidence; require a fresh read and authorized review.
    let finalized: boolean;
    try {
      finalized = await this.atomicFinalizer.finalize(
        shiftId, closedByUserId, recon, ipAddress, userAgent,
      );
    } catch {
      return {
        success: false,
        shift: await this.pumpRepo.findOperationalShiftById(shiftId),
        error: 'SHIFT_CLOSE_COMMIT_UNCERTAIN',
        message: 'Shift-close transaction outcome requires verification. Refresh and contact an authorized reviewer; do not retry automatically.',
      };
    }
    if (!finalized) {
      return {
        success: false,
        shift: await this.pumpRepo.findOperationalShiftById(shiftId),
        error: 'SHIFT_CLOSE_REVIEW_REQUIRED',
        message: 'Shift-close preconditions changed. Shift is held for authorized review; do not retry automatically.',
      };
    }

    const closed = await this.pumpRepo.findOperationalShiftById(shiftId);
    if (!closed || closed.status !== 'CLOSED') {
      return {
        success: false,
        shift: closed,
        error: 'SHIFT_CLOSE_COMMIT_UNCERTAIN',
        message: 'Shift-close confirmation was not readable. Refresh and obtain an authorized status review.',
      };
    }
    return { success: true, shift: closed };
  }
}
