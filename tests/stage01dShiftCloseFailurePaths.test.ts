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
    validateShiftCompleteness: vi.fn().mockResolvedValue({ valid: true }),
    listShiftNozzleSnapshots: vi.fn().mockResolvedValue([
      { nozzleId: 'nozzle-1', dispenserNumber: 1, nozzleNumber: 1, productName: 'MS' },
    ]),
    listReadingsForShift: vi.fn().mockResolvedValue([{ nozzleId: 'nozzle-1' }]),
    listUnavailabilityForShift: vi.fn().mockResolvedValue([]),
    calculateAndSaveShiftStockReconciliation: vi.fn().mockResolvedValue(undefined),
    finalizeCloseConditional: vi.fn().mockResolvedValue({ success: true, shift: closed }),
    findOperationalShiftById: vi.fn().mockResolvedValue(opened),
    deleteStockReconciliation: vi.fn().mockResolvedValue(undefined),
  };
  const finance = {
    findShiftFinancialReconciliation: vi.fn().mockResolvedValue(null),
    deleteFinancialReconciliation: vi.fn().mockResolvedValue(undefined),
  };
  const financialService = {
    performFinancialReconciliation: vi.fn().mockResolvedValue(undefined),
  };
  const audit = {
    logAction: vi.fn().mockResolvedValue(undefined),
  };
  const service = new ShiftCloseService(
    pump as unknown as ConstructorParameters<typeof ShiftCloseService>[0],
    finance as unknown as ConstructorParameters<typeof ShiftCloseService>[1],
    financialService as unknown as ConstructorParameters<typeof ShiftCloseService>[2],
    audit as unknown as ConstructorParameters<typeof ShiftCloseService>[3],
  );
  return { shiftId, closing, opened, closed, pump, finance, financialService, audit, service };
}

describe('Stage 01D: shift close failure and retry characterization (mock-only)', () => {
  it('rejects a duplicate/concurrent close claim without reconciling, auditing or cleanup', async () => {
    const s = setup();
    s.pump.beginCloseConditional.mockResolvedValue({ success: false, shift: s.closed });
    const res = await s.service.closeShift(s.shiftId, 'user-1');
    expect(res.success).toBe(false);
    expect(res.error).toBe('SHIFT_CLOSED_OR_CLOSING');
    expect(s.pump.validateShiftCompleteness).not.toHaveBeenCalled();
    expect(s.pump.restoreOpenFromClosing).not.toHaveBeenCalled();
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
    expect(s.pump.restoreOpenFromClosing).toHaveBeenCalledWith(s.shiftId);
    expect(s.pump.deleteStockReconciliation).toHaveBeenCalledWith(s.shiftId);
    expect(s.finance.deleteFinancialReconciliation).toHaveBeenCalledWith(s.shiftId);
    expect(s.pump.finalizeCloseConditional).not.toHaveBeenCalled();
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
    expect(s.pump.restoreOpenFromClosing).toHaveBeenCalled();
    expect(s.pump.finalizeCloseConditional).not.toHaveBeenCalled();
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
    expect(s.pump.finalizeCloseConditional).toHaveBeenCalledWith(s.shiftId, 'user-1');
    expect(s.pump.restoreOpenFromClosing).not.toHaveBeenCalled();
  });

  it('aborts and skips financial reconciliation when stock computation fails', async () => {
    const s = setup();
    s.pump.calculateAndSaveShiftStockReconciliation.mockRejectedValue(
      Object.assign(new Error('Insufficient dip evidence'), { code: 'STOCK_EVIDENCE_MISSING' }),
    );
    const res = await s.service.closeShift(s.shiftId, 'user-1');
    expect(res.success).toBe(false);
    expect(res.error).toBe('STOCK_EVIDENCE_MISSING');
    expect(s.financialService.performFinancialReconciliation).not.toHaveBeenCalled();
    expect(s.pump.restoreOpenFromClosing).toHaveBeenCalled();
    expect(s.pump.finalizeCloseConditional).not.toHaveBeenCalled();
  });

  it('surfaces a required variance reason without accidentally finalizing the shift', async () => {
    const s = setup();
    s.financialService.performFinancialReconciliation.mockRejectedValue(
      new Error('VARIANCE_REASON_REQUIRED'),
    );
    const res = await s.service.closeShift(s.shiftId, 'user-1');
    expect(res.success).toBe(false);
    expect(res.error).toBe('VARIANCE_REASON_REQUIRED');
    expect(s.pump.restoreOpenFromClosing).toHaveBeenCalled();
    expect(s.finance.deleteFinancialReconciliation).toHaveBeenCalled();
    expect(s.pump.finalizeCloseConditional).not.toHaveBeenCalled();
  });

  it('does not write success audits if final transition loses a concurrent race', async () => {
    const s = setup();
    s.pump.finalizeCloseConditional.mockResolvedValue({ success: false, shift: null });
    const res = await s.service.closeShift(s.shiftId, 'user-1');
    expect(res.success).toBe(false);
    expect(res.error).toBe('SHIFT_CLOSED_OR_CLOSING');
    expect(s.pump.restoreOpenFromClosing).toHaveBeenCalled();
    expect(s.finance.deleteFinancialReconciliation).toHaveBeenCalled();
    expect(s.audit.logAction).not.toHaveBeenCalled();
  });

  it('records shift-close and financial audits after successful finalization', async () => {
    const s = setup();
    s.finance.findShiftFinancialReconciliation.mockResolvedValue({
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
    expect(s.audit.logAction).toHaveBeenCalledTimes(2);
    expect(s.audit.logAction.mock.calls.map(([entry]) => entry.action)).toEqual([
      'SHIFT_CLOSE', 'FINANCIAL_RECONCILIATION',
    ]);
    expect(s.pump.restoreOpenFromClosing).not.toHaveBeenCalled();
  });

  it('characterizes audit failure AFTER CLOSED: no destructive rollback, but caller receives an exception', async () => {
    const s = setup();
    s.audit.logAction.mockRejectedValue(new Error('SYNTHETIC_AUDIT_WRITE_FAILURE'));
    await expect(s.service.closeShift(s.shiftId, 'user-1')).rejects.toThrow(
      'SYNTHETIC_AUDIT_WRITE_FAILURE',
    );
    expect(s.pump.finalizeCloseConditional).toHaveBeenCalled();
    expect(s.pump.restoreOpenFromClosing).not.toHaveBeenCalled();
    expect(s.pump.deleteStockReconciliation).not.toHaveBeenCalled();
    // This is a known API/outcome ambiguity, not proof of rolled-back closure.
    // Requires a separate audited design decision before a behavior change.
  });
});
