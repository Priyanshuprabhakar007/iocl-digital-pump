import { describe, expect, it } from 'vitest';
import { FinancialService } from '../src/worker/services/financialService';

function serviceFor(readings: { nozzleId: string; netSalesQuantityMilliunits: number }[]) {
  const nozzles = ['n1', 'n2'].map(nozzleId => ({
    nozzleId, productId: 'p1', productCategory: 'FUEL',
    productUnit: 'LITRE', productCode: 'MS', productName: 'Petrol',
  }));
  const pumpRepo = {
    findOperationalShiftById: async () => ({ id: 's1', outletId: 'o1', businessDate: '2026-11-14' }),
    listShiftNozzleSnapshots: async () => nozzles,
    listReadingsForShift: async () => readings,
    listUnavailabilityForShift: async () => [],
  };
  const financialRepo = {
    listShiftProductPrices: async () => [{
      productId: 'p1', productCategory: 'FUEL', pricePaisePerUnit: 10000,
    }],
  };
  return new FinancialService(financialRepo as any, pumpRepo as any, {} as any, {} as any);
}

describe('P0 fuel revenue aggregation precision', () => {
  it('keeps ordinary multi-nozzle revenue exact in integer paise', async () => {
    const service = serviceFor([
      { nozzleId: 'n1', netSalesQuantityMilliunits: 1250 },
      { nozzleId: 'n2', netSalesQuantityMilliunits: 2750 },
    ]);
    const result = await service.calculateShiftFuelRevenue('s1');
    expect(result.byProduct).toHaveLength(1);
    expect(result.byProduct[0].quantityMilliunits).toBe(4000);
    expect(result.fuelTotalPaise).toBe(40000);
    expect(result.fuelTotalStr).toBe('400.00');
  });

  it('rejects quantity aggregates beyond safe integer range', async () => {
    const service = serviceFor([
      { nozzleId: 'n1', netSalesQuantityMilliunits: Number.MAX_SAFE_INTEGER },
      { nozzleId: 'n2', netSalesQuantityMilliunits: 1 },
    ]);
    await expect(service.calculateShiftFuelRevenue('s1')).rejects.toThrow('FINANCIAL_AMOUNT_OVERFLOW');
  });

  it('distinguishes a legitimate recorded zero from missing summary data at shift-close validation', async () => {
    // This method is a provisional financial preview; ShiftCloseService separately
    // checks each nozzle has a reading or an approved unavailability record.
    const service = serviceFor([
      { nozzleId: 'n1', netSalesQuantityMilliunits: 0 },
      { nozzleId: 'n2', netSalesQuantityMilliunits: 1000 },
    ]);
    const result = await service.calculateShiftFuelRevenue('s1');
    expect(result.byProduct[0].quantityMilliunits).toBe(1000);
    expect(result.fuelTotalPaise).toBe(10000);
  });
});
