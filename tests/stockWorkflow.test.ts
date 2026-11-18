import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import type { OperationalShiftTankSnapshot, TankStockReading, FuelReceipt, ShiftStockSummary } from '../src/shared/types';
import { stockStageOrder, tankDipCoverage, filterStockReceipts, stockReconciliationLabel } from '../src/frontend/utils/stockWorkflow';

const tanks=['t1','t2'].map(tankId=>({tankId,outletId:'ro-a',operationalShiftId:'s-a'} as OperationalShiftTankSnapshot));
const reading=(tankId:string,readingType:TankStockReading['readingType'],operationalShiftId='s-a',outletId='ro-a')=>({tankId,readingType,operationalShiftId,outletId} as TankStockReading);
const receipt=(ttNumber:string,status:FuelReceipt['status'],arrivalAt:string,invoiceNumber:string) :FuelReceipt=>({id:invoiceNumber,outletId:'ro-a',operationalShiftId:'s-a',ttNumber,status,arrivalAt,invoiceNumber,invoiceDate:'2026-11-18',sealVerified:true,recordedByUserId:'test-user',createdAt:arrivalAt,updatedAt:arrivalAt,lines:[]});

describe('Stock workflow simplification',()=>{
  it('keeps four navigable stock stages',()=>{
    expect(stockStageOrder).toEqual(['OPENING','RECEIPTS','CLOSING','RECONCILIATION']);
  });
  it('counts saved readings per tank and exact shift and outlet, including actual zero stock',()=>{
    const reads=[{...reading('t1','OPENING'),netProductVolumeMilliunits:0},reading('t1','OPENING'),reading('t2','OPENING','s-b'),reading('t2','OPENING','s-a','ro-b'),reading('t1','CLOSING')];
    expect(tankDipCoverage(tanks,reads,'OPENING')).toEqual({recorded:1,expected:2,label:'1 / 2 tanks recorded'});
    expect(tankDipCoverage(tanks,reads,'CLOSING').recorded).toBe(1);
    expect(tankDipCoverage([],[],'OPENING').label).toBe('No tank snapshots');
  });
  it('prioritizes pending receipts and preserves completed and cancelled history without mutating source',()=>{
    const records=[receipt('PB1','COMPLETED','2026-11-18T08:00:00Z','INV-1'),receipt('PB2','ARRIVED','2026-11-18T09:00:00Z','INV-2'),receipt('PB3','CANCELLED','2026-11-18T10:00:00Z','INV-3'),receipt('PB4','DECANTED','2026-11-18T11:00:00Z','INV-4')];
    expect(filterStockReceipts(records,'PENDING','').map(r=>r.ttNumber)).toEqual(['PB4','PB2']);
    expect(filterStockReceipts(records,'FINALIZED','').map(r=>r.ttNumber)).toEqual(['PB3','PB1']);
    expect(filterStockReceipts(records,'ALL',' inv-1 ').map(r=>r.ttNumber)).toEqual(['PB1']);
    expect(filterStockReceipts(records,'PENDING','inv-1')).toEqual([]);
    expect(records[0].ttNumber).toBe('PB1');
  });
  it('does not infer a balanced stock report from unavailable or incomplete comparisons',()=>{
    const report={byTank:[{hasOpeningReading:true,hasClosingReading:false,theoreticalClosingStockStr:null,varianceStr:null}]} as unknown as ShiftStockSummary;
    expect(stockReconciliationLabel(report,false)).toBe('Unavailable');
    expect(stockReconciliationLabel(null,true)).toBe('No tank summary');
    expect(stockReconciliationLabel(report,true)).toBe('1 tank(s) incomplete');
  });
  it('keeps existing server contracts and all receipt lifecycle validations',()=>{
    const page=fs.readFileSync('src/frontend/pages/StockOperationsPage.tsx','utf8');
    for(const contract of ['/tank-readings','/fuel-receipts','/stock-reconciliation/compute','PRE_RECEIPT','POST_RECEIPT','cancellationReason','evaluateReceiptCompletionReadiness'])expect(page).toContain(contract);
    expect(page).toContain("useState<ReceiptFilter>('PENDING')");
    expect(page).toContain('filterStockReceipts(receipts,receiptFilter,receiptSearch)');
    expect(page).toContain('setShowDipForm(false)');
    expect(page).toContain('scoped(snapsRes.data)');
    expect(page).toContain('Discard the unsaved tank reading before switching tasks?');
  });
});
