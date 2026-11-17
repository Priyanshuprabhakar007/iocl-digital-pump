import { describe, expect, it } from 'vitest';
import { assessFuelRevenueReadingCoverage } from '../src/worker/services/fuelRevenueReadingCoverage';

const nozzles = [
  { nozzleId: 'n1', productCategory: 'FUEL' },
  { nozzleId: 'n2', productCategory: 'FUEL' },
  { nozzleId: 'cng1', productCategory: 'CNG' },
];
describe('P0 Finance — provisional fuel reading completeness', () => {
  it('marks missing fuel nozzle reading INCOMPLETE instead of treating it as zero', () => {
    const report = assessFuelRevenueReadingCoverage(nozzles, [
      { nozzleId: 'n1', netSalesQuantityMilliunits: 500 },
    ], []);
    expect(report).toEqual({
      status: 'INCOMPLETE', expectedNozzles: 2, recordedNozzles: 1,
      unavailableNozzles: 0, missingNozzleIds: ['n2'],
    });
  });
  it('accepts recorded zero and explicitly unavailable fuel nozzles', () => {
    const report = assessFuelRevenueReadingCoverage(nozzles, [
      { nozzleId: 'n1', netSalesQuantityMilliunits: 0 },
    ], [{ nozzleId: 'n2' }]);
    expect(report.status).toBe('COMPLETE');
    expect(report.recordedNozzles).toBe(1);
    expect(report.unavailableNozzles).toBe(1);
    expect(report.missingNozzleIds).toEqual([]);
  });
  it('does not treat incomplete saved reading as valid even with unavailability', () => {
    const report = assessFuelRevenueReadingCoverage(nozzles, [
      { nozzleId: 'n1', netSalesQuantityMilliunits: null },
      { nozzleId: 'n2', netSalesQuantityMilliunits: 1000 },
    ], [{ nozzleId: 'n1' }]);
    expect(report.status).toBe('INCOMPLETE');
    expect(report.missingNozzleIds).toEqual(['n1']);
  });
  it('does not count CNG in fuel reading coverage', () => {
    const report = assessFuelRevenueReadingCoverage(nozzles, [
      { nozzleId: 'n1', netSalesQuantityMilliunits: 0 },
      { nozzleId: 'n2', netSalesQuantityMilliunits: 0 },
    ], []);
    expect(report.status).toBe('COMPLETE');
    expect(report.expectedNozzles).toBe(2);
  });
});
