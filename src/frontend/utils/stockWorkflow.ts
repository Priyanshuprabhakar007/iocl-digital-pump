import type { OperationalShiftTankSnapshot, TankStockReading, FuelReceipt, ShiftStockSummary } from '../../shared/types';

export type StockStage = 'OPENING' | 'RECEIPTS' | 'CLOSING' | 'RECONCILIATION';
export type ReceiptFilter = 'PENDING' | 'FINALIZED' | 'ALL';
export const stockStageOrder: StockStage[] = ['OPENING','RECEIPTS','CLOSING','RECONCILIATION'];
export function tankDipCoverage(tanks:OperationalShiftTankSnapshot[], readings:TankStockReading[], type:'OPENING'|'CLOSING'){
  const matching = tanks.filter(t=>readings.some(r=>r.tankId===t.tankId && r.operationalShiftId===t.operationalShiftId && r.outletId===t.outletId && r.readingType===type));
  return {recorded:matching.length,expected:tanks.length,label:tanks.length?matching.length+' / '+tanks.length+' tanks recorded':'No tank snapshots'};
}
export function isFinalizedReceipt(r:FuelReceipt){return r.status==='COMPLETED'||r.status==='CANCELLED';}
export function filterStockReceipts(receipts:FuelReceipt[],filter:ReceiptFilter,search:string){
  const query=search.trim().toLowerCase();
  return receipts.filter(r=>(filter==='ALL'||(filter==='FINALIZED'?isFinalizedReceipt(r):!isFinalizedReceipt(r))) &&
    (!query||[r.ttNumber,r.invoiceNumber,r.invoiceDate,r.status,...(r.lines||[]).map(l=>l.productCode||'')].some(v=>v.toLowerCase().includes(query))))
    .sort((a,b)=>Number(isFinalizedReceipt(a))-Number(isFinalizedReceipt(b)) || b.arrivalAt.localeCompare(a.arrivalAt));
}
export function stockReconciliationLabel(report:ShiftStockSummary|null,available:boolean){
  if(!available)return 'Unavailable';
  if(!report || !report.byTank.length)return 'No tank summary';
  const missing=report.byTank.filter(t=>!t.hasOpeningReading||!t.hasClosingReading||t.theoreticalClosingStockStr==null||t.varianceStr==null).length;
  return missing?missing+' tank(s) incomplete':'Stock comparison available';
}
