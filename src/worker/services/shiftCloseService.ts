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

    // Helper to abort and restore OPEN, ensuring no stale reconciliation
    const abortAndRestore = async (errorCode: string, message: string, details?: any) => {
      await this.pumpRepo.restoreOpenFromClosing(shiftId);
      // Clean up any authoritative reconciliation created during the failed attempt
      await this.financialRepo.deleteFinancialReconciliation(shiftId);
      await this.pumpRepo.deleteStockReconciliation(shiftId);
      return {
        success: false,
        shift: await this.pumpRepo.findOperationalShiftById(shiftId),
        error: errorCode,
        message,
        details,
      };
    };

    // 2. Validate tank/receipt completeness
    const tankCheck = await this.pumpRepo.validateShiftCompleteness(shiftId);
    if (!tankCheck.valid) {
      return abortAndRestore(
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
      return abortAndRestore(
        'INCOMPLETE_SHIFT_READINGS',
        `Cannot close shift. ${missingSnapshots.length} active nozzle(s) have neither a meter reading nor an approved unavailability record.`,
        { missingCount: missingSnapshots.length, missingNozzles: missingDescriptions }
      );
    }

    // 4. Calculate/persist stock reconciliation
    try {
      await this.pumpRepo.calculateAndSaveShiftStockReconciliation(shiftId);
    } catch (err: any) {
      return abortAndRestore(
        err?.code || 'RECONCILIATION_FAILED',
        err?.message || 'Failed to compute stock reconciliation'
      );
    }

    // 5. Calculate/persist financial reconciliation (enforcing variance reason & price snapshots & overflow)
    try {
      await this.financialService.performFinancialReconciliation(shiftId, varianceReason, true);
    } catch (err: any) {
      const msg = err?.message || err;
      if (msg === 'INCOMPLETE_CNG_DATA') {
        return abortAndRestore('INCOMPLETE_CNG_DATA', 'CNG MFM shift data must be completed before closing this shift.');
      }
      if (msg === 'CNG_PRICE_SNAPSHOT_UNAVAILABLE') {
        return abortAndRestore('CNG_PRICE_SNAPSHOT_UNAVAILABLE', 'CNG historical price snapshot unavailable');
      }
      if (msg === 'CNG_PRICE_SNAPSHOT_AMBIGUOUS') {
        return abortAndRestore('CNG_PRICE_SNAPSHOT_AMBIGUOUS', 'Multiple CNG historical price snapshots found');
      }
      if (msg === 'VARIANCE_REASON_REQUIRED') {
        return abortAndRestore('VARIANCE_REASON_REQUIRED', 'Non-zero variance requires a reason');
      }
      if (msg === 'FINANCIAL_PRICE_SNAPSHOT_UNAVAILABLE') {
        return abortAndRestore('PRICE_SNAPSHOT_MISSING', 'Historical price snapshot unavailable');
      }
      if (msg === 'FINANCIAL_AMOUNT_OVERFLOW') {
        return abortAndRestore('FINANCIAL_AMOUNT_OVERFLOW', 'Financial amount overflow');
      }
      return abortAndRestore('FINANCIAL_RECONCILIATION_FAILED', typeof msg === 'string' ? msg : 'Financial reconciliation failed');
    }

    // 6. The precomputed finance row must exist BEFORE the atomic finalization
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

    // 7. CLOSING -> CLOSED and both mandatory audits are ONE D1 batch. If
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
