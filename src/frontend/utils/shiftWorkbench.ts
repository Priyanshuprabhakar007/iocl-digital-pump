import type { OperationalShift } from '../../shared/types';

export type WorkbenchSelection = { outletId: string; businessDate: string; shiftId: string | null };
export type WorkbenchPage = 'daily-ops' | 'stock-ops' | 'financials' | 'dsr-reports';

export function resolveWorkbenchShift(shifts: OperationalShift[], outletId: string, selection: WorkbenchSelection | null, fallback: 'open' | 'latest' = 'open'): OperationalShift | null {
  const allowed = shifts.filter(s => s.outletId === outletId);
  if (selection?.outletId === outletId) {
    if (selection.shiftId) return allowed.find(s => s.id === selection.shiftId && s.businessDate === selection.businessDate) || null;
    return allowed.find(s => s.businessDate === selection.businessDate && s.status === 'OPEN')
      || allowed.find(s => s.businessDate === selection.businessDate) || null;
  }
  return (fallback === 'open' ? allowed.find(s => s.status === 'OPEN') : undefined) || allowed[0] || null;
}

export function toWorkbenchSelection(shift: Pick<OperationalShift,'id'|'outletId'|'businessDate'>): WorkbenchSelection {
  return {outletId:shift.outletId,businessDate:shift.businessDate,shiftId:shift.id};
}
