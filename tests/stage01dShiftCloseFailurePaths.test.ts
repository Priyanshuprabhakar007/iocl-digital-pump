import { describe, expect, it, vi } from 'vitest';
import { ShiftCloseService } from '../src/worker/services/shiftCloseService';

/**
 * Stage 01D: characterization and safety checks for close retries.
 * All dependencies are mocked. There is no D1, R2, deployed Worker or
 * production/staging outlet dependency and no operational policy changes.
 */
function setup() {
  const shiftId = 'synthetic-shift-stage01d';
  const closing = { id: shiftId, outletId: 'synthetic-outlet', status: 'CLOSING' };
  const opened = { ...closing, status: 'OPEN' };
  const closed = { ...closing, status: 'CLOSED' };

  const pump = {
    beginCloseConditional: vi.fn().mockResolvedValue({ success: true, shift: closing }),
    restoreOpenFromClosing: vi.fn().mockResolvedValue(undefined),
    listShiftStockReconciliations: vi.fn().mockResolvedValue([]),
    validateShiftCompleteness: vi.fn().mockResolvedValue({ valid: true }),
    listShiftNozzleSnapshots: vi.fn().mockResolvedValue([
      { nozzleId: 'nozzle-1', dispenserNumber: 1, nozzleNumber: 1, productName: 'MS' },
    ]),
    listReadingsForShift: vi.fn().mockResolvedValue([{ nozzleId: 'nozzle-1' }]),
    listUnavailabilityForShift: vi.fn().mockResolvedValue([]),
    calculateAndSaveShiftStockReconciliation: vi.fn().mockResolvedValue([{
      id: 'preview-stock', operationalShiftId: shiftId, outletId: 'synthetic-outlet',
      tankId: 'tank-1', productId: 'ms', openingStockMilliunits: 1000,
      receiptQuantityMilliunits: 0, salesQuantityMilliunits: 0,
      theoreticalClosingStockMilliunits: 1000, physicalClosingStockMilliunits: 1000,
      varianceMilliunits: 0, varianceStatus: 'BALANCED',
    }]),
    finalizeCloseConditional: vi.fn().mockResolvedValue({ success: true, shift: closed }),
    findOperationalShiftById: vi.fn(),
    deleteStockReconciliation: vi.fn().mockResolvedValue(undefined),
  };
  const finance = {
    findShiftFinancialReconciliation: vi.fn().mockResolvedValueOnce(null).mockResolvedValue({ operationalShiftId: shiftId, outletId: 'synthetic-outlet' }),
    insertFinancialReconciliationWithoutOverwrite: vi.fn().mockResolvedValue(undefined),
    deleteFinancialReconciliation: vi.fn().mockResolvedValue(undefined),
  };
  const financialService = {
    performFinancialReconciliation: vi.fn().mockResolvedValue({ operationalShiftId: shiftId, outletId: 'synthetic-outlet' }),
  };
  const audit = {
    logAction: vi.fn().mockResolvedValue(undefined),
    finalize: vi.fn().mockResolvedValue(true),
    prepare: vi.fn().mockResolvedValue(true),
  };
  const journal = {
    claim: vi.fn().mockResolvedValue('synthetic-attempt-1'),
    rejectValidation: vi.fn().mockResolvedValue(true),
    markReviewRequired: vi.fn().mockResolvedValue(true),
  };
  pump.findOperationalShiftById.mockImplementation(async () => {
    if (journal.rejectValidation.mock.calls.length > 0) return opened;
    if (audit.finalize.mock.calls.length > 0) return closed;
    if (journal.claim.mock.calls.length > 0) return closing;
    return opened;
  });
  const service = new ShiftCloseService(
    pump as unknown as ConstructorParameters<typeof ShiftCloseService>[0],
    finance as unknown as ConstructorParameters<typeof ShiftCloseService>[1],
    financialService as unknown as ConstructorParameters<typeof ShiftCloseService>[2],
    audit as unknown as ConstructorParameters<typeof ShiftCloseService>[3],
    journal as unknown as ConstructorParameters<typeof ShiftCloseService>[4],
  );
  return { shiftId, closing, opened, closed, pump, finance, financialService, audit, journal, service };
}

describe('Stage 01D: shift close failure and retry characterization (mock-only)', () => {
  it('rejects a duplicate/concurrent close claim without reconciling, auditing or cleanup', async () => {
    const s = setup();
    s.pump.findOperationalShiftById.mockResolvedValueOnce(s.closed);
    const res = await s.service.closeShift(s.shiftId, 'user-1');
    expect(res.success).toBe(false);
    expect(res.error).toBe('SHIFT_CLOSED_OR_CLOSING');
    expect(s.pump.validateShiftCompleteness).not.toHaveBeenCalled();
    expect(s.journal.claim).not.toHaveBeenCalled();
    expect(s.journal.rejectValidation).not.toHaveBeenCalled();
    expect(s.finance.deleteFinancialReconciliation).not.toHaveBeenCalled();
    expect(s.audit.logAction).not.toHaveBeenCalled();
  });

  it('restores OPEN and does not finalize when tank/receipt completeness is rejected', async () => {
    const s = setup();
    s.pump.validateShiftCompleteness.mockResolvedValue({
      valid: false, error: 'INCOMPLETE_TANK_STOCK_DATA', message: 'Tank dip is missing',
    });
    const res = await s.service.closeShift(s.shiftId, 'user-1');
    expect(res.success).toBe(false);
    expect(res.error).toBe('INCOMPLETE_TANK_STOCK_DATA');
    expect(s.journal.rejectValidation).toHaveBeenCalledWith(s.shiftId, 'synthetic-attempt-1', 'user-1');
    expect(s.pump.deleteStockReconciliation).not.toHaveBeenCalled();
    expect(s.finance.deleteFinancialReconciliation).not.toHaveBeenCalled();
    expect(s.audit.finalize).not.toHaveBeenCalled();
  });

  it('requires every nozzle to have a reading or recorded unavailability', async () => {
    const s = setup();
    s.pump.listShiftNozzleSnapshots.mockResolvedValue([
      { nozzleId: 'nozzle-1', dispenserNumber: 1, nozzleNumber: 1, productCode: 'MS' },
      { nozzleId: 'nozzle-2', dispenserNumber: 1, nozzleNumber: 2, productCode: 'HSD' },
    ]);
    const res = await s.service.closeShift(s.shiftId, 'user-1');
    expect(res.success).toBe(false);
    expect(res.error).toBe('INCOMPLETE_SHIFT_READINGS');
    expect(res.details?.missingCount).toBe(1);
    expect(s.journal.rejectValidation).toHaveBeenCalled();
    expect(s.audit.finalize).not.toHaveBeenCalled();
  });

  it('allows an unavailable nozzle to be covered without inserting a false zero sale', async () => {
    const s = setup();
    s.pump.listShiftNozzleSnapshots.mockResolvedValue([
      { nozzleId: 'nozzle-1', dispenserNumber: 1, nozzleNumber: 1 },
      { nozzleId: 'nozzle-2', dispenserNumber: 1, nozzleNumber: 2 },
    ]);
    s.pump.listUnavailabilityForShift.mockResolvedValue([{ nozzleId: 'nozzle-2' }]);
    const res = await s.service.closeShift(s.shiftId, 'user-1', 'Checked variance');
    expect(res.success).toBe(true);
    expect(s.audit.finalize).toHaveBeenCalledWith(s.shiftId, 'user-1', expect.any(Object), undefined, undefined, 'synthetic-attempt-1');
    expect(s.journal.rejectValidation).not.toHaveBeenCalled();
  });

  it('aborts and skips financial reconciliation when stock computation fails', async () => {
    const s = setup();
    s.pump.calculateAndSaveShiftStockReconciliation.mockRejectedValue(
      Object.assign(new Error('Insufficient dip evidence'), { code: 'STOCK_EVIDENCE_MISSING' }),
    );
    const res = await s.service.closeShift(s.shiftId, 'user-1');
    expect(res.success).toBe(false);
    expect(res.error).toBe('STOCK_EVIDENCE_MISSING');
    expect(s.financialService.performFinancialReconciliation).toHaveBeenCalledWith(s.shiftId, undefined, false);
    expect(s.journal.rejectValidation).toHaveBeenCalled();
    expect(s.pump.deleteStockReconciliation).not.toHaveBeenCalled();
    expect(s.audit.prepare).not.toHaveBeenCalled();
    expect(s.audit.finalize).not.toHaveBeenCalled();
  });

  it('surfaces a required variance reason without accidentally finalizing the shift', async () => {
    const s = setup();
    s.financialService.performFinancialReconciliation.mockRejectedValue(
      new Error('VARIANCE_REASON_REQUIRED'),
    );
    const res = await s.service.closeShift(s.shiftId, 'user-1');
    expect(res.success).toBe(false);
    expect(res.error).toBe('VARIANCE_REASON_REQUIRED');
    expect(s.journal.rejectValidation).toHaveBeenCalled();
    expect(s.finance.deleteFinancialReconciliation).not.toHaveBeenCalled();
    expect(s.pump.calculateAndSaveShiftStockReconciliation).not.toHaveBeenCalled();
    expect(s.audit.finalize).not.toHaveBeenCalled();
  });

  it('does not write success audits if final transition loses a concurrent race', async () => {
    const s = setup();
    s.audit.finalize.mockResolvedValue(false);
    const res = await s.service.closeShift(s.shiftId, 'user-1');
    expect(res.success).toBe(false);
    expect(res.error).toBe('SHIFT_CLOSE_REVIEW_REQUIRED');
    expect(s.journal.rejectValidation).not.toHaveBeenCalled();
    expect(s.finance.deleteFinancialReconciliation).not.toHaveBeenCalled();
    expect(s.audit.finalize).toHaveBeenCalledTimes(1);
  });

  it('commits the shift and both audits through the same finalizer', async () => {
    const s = setup();
    s.finance.findShiftFinancialReconciliation.mockReset().mockResolvedValueOnce(null).mockResolvedValue({
      fuelSalesRevenuePaise: 50000,
      cngSalesRevenuePaise: 0,
      lubeSalesRevenuePaise: 0,
      authoritativeSalesRevenuePaise: 50000,
      totalCollectionsPaise: 50000,
      salesCollectionVariancePaise: 0,
      varianceStatus: 'MATCHED',
      varianceReason: null,
    });
    const res = await s.service.closeShift(s.shiftId, 'user-1');
    expect(res.success).toBe(true);
    expect(res.shift?.status).toBe('CLOSED');
    expect(s.audit.finalize).toHaveBeenCalledTimes(1);
    expect(s.audit.finalize.mock.calls[0][2].fuelSalesRevenuePaise).toBe(50000);
    expect(s.audit.logAction).not.toHaveBeenCalled();
    expect(s.journal.rejectValidation).not.toHaveBeenCalled();
  });

  it('does not report successful closing if the atomic audit batch fails', async () => {
    const s = setup();
    s.audit.finalize.mockRejectedValue(new Error('SYNTHETIC_AUDIT_WRITE_FAILURE'));
    const result = await s.service.closeShift(s.shiftId, 'user-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('SHIFT_CLOSE_COMMIT_UNCERTAIN');
    expect(s.audit.finalize).toHaveBeenCalled();
    expect(s.journal.rejectValidation).not.toHaveBeenCalled();
    expect(s.pump.deleteStockReconciliation).not.toHaveBeenCalled();
    // The caller is held for review, not given permission to retry or reopen.
  });

  it('holds validation failures for review if restoring OPEN fails, without deleting records', async () => {
    const s = setup();
    s.pump.validateShiftCompleteness.mockResolvedValue({
      valid: false, error: 'INCOMPLETE_TANK_STOCK_DATA', message: 'Missing closing dip',
    });
    s.journal.rejectValidation.mockRejectedValue(new Error('SYNTHETIC_RESTORE_FAILURE'));
    const result = await s.service.closeShift(s.shiftId, 'user-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('SHIFT_CLOSE_REVIEW_REQUIRED');
    expect(s.finance.deleteFinancialReconciliation).not.toHaveBeenCalled();
    expect(s.pump.deleteStockReconciliation).not.toHaveBeenCalled();
    expect(s.audit.finalize).not.toHaveBeenCalled();
  });

  it('refuses to overwrite pre-existing stock reconciliation, leaving CLOSING for review', async () => {
    const s = setup();
    s.pump.listShiftStockReconciliations.mockResolvedValue([{ id: 'prior-stock-evidence' }]);
    s.pump.calculateAndSaveShiftStockReconciliation.mockResolvedValueOnce([]);
    const result = await s.service.closeShift(s.shiftId, 'user-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('SHIFT_CLOSE_REVIEW_REQUIRED');
    expect(s.pump.calculateAndSaveShiftStockReconciliation).toHaveBeenCalledWith(
      s.shiftId, { persist: false },
    );
    expect(s.finance.insertFinancialReconciliationWithoutOverwrite).not.toHaveBeenCalled();
    expect(s.journal.rejectValidation).not.toHaveBeenCalled();
    expect(s.pump.deleteStockReconciliation).not.toHaveBeenCalled();
    expect(s.finance.deleteFinancialReconciliation).not.toHaveBeenCalled();
  });

  it('holds after financial persistence failure without destructive cleanup', async () => {
    const s = setup();
    s.audit.prepare.mockRejectedValue(new Error('SYNTHETIC_FINANCE_INSERT_FAILURE'));
    const result = await s.service.closeShift(s.shiftId, 'user-1');
    expect(result.error).toBe('SHIFT_CLOSE_REVIEW_REQUIRED');
    expect(s.pump.calculateAndSaveShiftStockReconciliation).toHaveBeenCalledWith(
      s.shiftId, { persist: false },
    );
    expect(s.audit.prepare).toHaveBeenCalledWith(
      s.shiftId, 'synthetic-outlet', expect.any(Array), expect.any(Object),
      false, 'synthetic-attempt-1',
    );
    expect(s.journal.rejectValidation).not.toHaveBeenCalled();
    expect(s.pump.deleteStockReconciliation).not.toHaveBeenCalled();
    expect(s.finance.deleteFinancialReconciliation).not.toHaveBeenCalled();
    expect(s.audit.finalize).not.toHaveBeenCalled();
  });

  it('holds a failed financial audit batch for review without destructive cleanup', async () => {
    const s = setup();
    s.finance.findShiftFinancialReconciliation.mockReset().mockResolvedValueOnce(null).mockResolvedValue({
      fuelSalesRevenuePaise: 10000,
      cngSalesRevenuePaise: 0,
      lubeSalesRevenuePaise: 0,
      authoritativeSalesRevenuePaise: 10000,
      totalCollectionsPaise: 10000,
      salesCollectionVariancePaise: 0,
      varianceStatus: 'MATCHED',
      varianceReason: null,
    });
    s.audit.finalize.mockRejectedValueOnce(new Error('SYNTHETIC_SECOND_AUDIT_FAILURE'));
    const result = await s.service.closeShift(s.shiftId, 'user-1');
    expect(result.error).toBe('SHIFT_CLOSE_COMMIT_UNCERTAIN');
    expect(s.audit.finalize).toHaveBeenCalledTimes(1);
    expect(s.journal.claim).toHaveBeenCalledTimes(1);
    expect(s.audit.logAction).not.toHaveBeenCalled();
    expect(s.journal.rejectValidation).not.toHaveBeenCalled();
    expect(s.finance.deleteFinancialReconciliation).not.toHaveBeenCalled();
  });

});
