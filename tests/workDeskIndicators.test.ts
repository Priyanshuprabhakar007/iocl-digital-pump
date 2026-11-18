import { describe, expect, it } from 'vitest';
import type { DailyFuelSummary } from '../src/shared/types';
import { getWorkDeskIndicators } from '../src/frontend/utils/workDesk';

const make = (overrides: Partial<DailyFuelSummary['completion']> = {}, shifts: DailyFuelSummary['shifts'] = []) => ({
  shiftsCount: shifts.length, shifts,
  completion: { expectedTanks: 0, openingTankReadings: 0, closingTankReadings: 0, expectedNozzles: 0,
    nozzleMeterReadings: 0, unavailableNozzles: 0, totalReceipts: 0, completedReceipts: 0,
    pendingReceipts: 0, reconciliationComplete: false, ...overrides }
} as DailyFuelSummary);
const shift = (status: 'OPEN' | 'CLOSED' | 'LOCKED') => ({status} as DailyFuelSummary['shifts'][number]);

describe('Outlet work desk saved progress', () => {
  it('does not mark an unrecorded day complete', () => {
    expect(getWorkDeskIndicators(make()).every(x=>x.state==='unrecorded')).toBe(true);
  });
  it('counts unavailable nozzles and shows incomplete receipts and closure', () => {
    const indicators = getWorkDeskIndicators(make({expectedTanks:2,openingTankReadings:2,closingTankReadings:1,
      expectedNozzles:4,nozzleMeterReadings:3,unavailableNozzles:1,totalReceipts:2,completedReceipts:1,pendingReceipts:1}, [shift('OPEN')]));
    expect(indicators.map(x=>x.state)).toEqual(['complete','complete','pending','pending','pending','pending']);
  });
  it('reflects closed and locked shifts without inventing receipt records', () => {
    const indicators = getWorkDeskIndicators(make({expectedTanks:1,openingTankReadings:1,closingTankReadings:1,
      expectedNozzles:1,nozzleMeterReadings:1,reconciliationComplete:true}, [shift('CLOSED'),shift('LOCKED')]));
    expect(indicators.map(x=>x.state)).toEqual(['complete','complete','unrecorded','complete','complete','complete']);
  });
});
