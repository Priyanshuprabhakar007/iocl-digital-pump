import type { ShiftFinancialSummary, OperationalShift } from '../../shared/types';

export type FinanceStage = 'sales' | 'collections' | 'handovers' | 'deposits' | 'reconciliation';
export const financeStages: {id:FinanceStage; label:string; description:string}[] = [
  {id:'sales',label:'Sales',description:'Revenue from saved operational readings'},
  {id:'collections',label:'Collections',description:'Cash, UPI, cards and credit sales'},
  {id:'handovers',label:'Cash handover',description:'Physical cash custody transfer'},
  {id:'deposits',label:'Bank deposits',description:'Submit and verify bank receipts'},
  {id:'reconciliation',label:'Reconciliation',description:'Compare recorded sales and collections'},
];
export function financeSalesProvisional(summary:ShiftFinancialSummary):boolean {
  return summary.salesRevenue.readingCoverage?.status !== 'COMPLETE' ||
    (summary.salesRevenue.cngApplicable && !summary.salesRevenue.cngComplete) ||
    (summary.salesRevenue.pendingComponents?.length ?? 0)>0;
}
export function financeStageDetails(summary:ShiftFinancialSummary|null, shift:OperationalShift|null):Record<FinanceStage,string> {
  if(!summary || !shift || summary.operationalShiftId!==shift.id || summary.outletId!==shift.outletId)
    return {sales:'Unavailable',collections:'Unavailable',handovers:'Unavailable',deposits:'Unavailable',reconciliation:'Unavailable'};
  const preview=financeSalesProvisional(summary);
  const money=(v:string)=>'₹ '+v;
  return {
    sales:money(summary.salesRevenue.authoritativeTotalStr)+(preview?' · provisional':''),
    collections:money(summary.collections.totalStr)+' recorded',
    handovers:money(summary.cashHandoverSummary.totalPendingStr)+' awaiting acknowledgement',
    deposits:money(summary.cashDepositControl.pendingCashDepositStr)+' pending deposit',
    reconciliation:preview?'Incomplete sales evidence':shift.status==='OPEN'?'Preview · '+money(summary.varianceStr):'Variance '+money(summary.varianceStr),
  };
}
