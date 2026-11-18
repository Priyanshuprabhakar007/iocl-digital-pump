import type { DailyFuelSummary } from '../../shared/types';

export type WorkDeskIndicator = {label:string; detail:string; state:'complete'|'pending'|'unrecorded'};

// Read-only presentation of saved daily summary; no readiness decisions or writes.
export function getWorkDeskIndicators(summary: DailyFuelSummary): WorkDeskIndicator[] {
  const c = summary.completion;
  const count = (label:string, actual:number, expected:number):WorkDeskIndicator => ({
    label, detail: expected > 0 ? actual+' / '+expected : 'No expected readings recorded',
    state: expected === 0 ? 'unrecorded' : actual >= expected ? 'complete' : 'pending',
  });
  const hasShifts = summary.shiftsCount > 0;
  return [
    count('Opening tank dips',c.openingTankReadings,c.expectedTanks),
    count('Nozzle meters / unavailable',c.nozzleMeterReadings + c.unavailableNozzles,c.expectedNozzles),
    {label:'Fuel receipts',detail:c.totalReceipts===0?'None recorded':c.completedReceipts+' / '+c.totalReceipts,
      state:c.totalReceipts===0?'unrecorded':c.pendingReceipts===0 && c.completedReceipts===c.totalReceipts?'complete':'pending'},
    count('Closing tank dips',c.closingTankReadings,c.expectedTanks),
    {label:'Stock reconciliation',detail:!hasShifts?'No shift recorded':c.reconciliationComplete?'Recorded complete':'Pending',
      state:!hasShifts?'unrecorded':c.reconciliationComplete?'complete':'pending'},
    {label:'Shift closure',detail:!hasShifts?'No shift recorded':summary.shifts.filter(s=>s.status!=='OPEN').length+' / '+summary.shiftsCount+' not open',
      state:!hasShifts?'unrecorded':summary.shifts.length===summary.shiftsCount && summary.shifts.every(s=>s.status==='CLOSED'||s.status==='LOCKED')?'complete':'pending'}
  ];
}
