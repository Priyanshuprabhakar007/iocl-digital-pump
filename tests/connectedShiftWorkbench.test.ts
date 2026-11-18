import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import type { OperationalShift } from '../src/shared/types';
import { resolveWorkbenchShift, toWorkbenchSelection } from '../src/frontend/utils/shiftWorkbench';

const shift = (id:string,outletId:string,businessDate:string,status:OperationalShift['status']) => ({id,outletId,businessDate,status} as OperationalShift);
const shifts = [
  shift('other','ro-b','2026-11-18','OPEN'),
  shift('new','ro-a','2026-11-18','OPEN'),
  shift('a','ro-a','2026-11-17','CLOSED'),
  shift('b','ro-a','2026-11-17','OPEN'),
];
describe('Connected shift workbench',()=>{
  it('preserves an explicitly chosen historical closed shift rather than opening the newest shift',()=>{
    expect(resolveWorkbenchShift(shifts,'ro-a',toWorkbenchSelection(shifts[2]))?.id).toBe('a');
  });
  it('never falls back when the remembered shift is absent or its date does not match',()=>{
    expect(resolveWorkbenchShift(shifts,'ro-a',{outletId:'ro-a',businessDate:'2026-11-17',shiftId:'missing'})).toBeNull();
    expect(resolveWorkbenchShift(shifts,'ro-a',{outletId:'ro-a',businessDate:'2026-11-18',shiftId:'a'})).toBeNull();
    expect(resolveWorkbenchShift(shifts,'ro-a',{outletId:'ro-a',businessDate:'2026-11-18',shiftId:'other'})).toBeNull();
  });
  it('chooses an open shift on the exact selected date when no explicit shift is remembered',()=>{
    expect(resolveWorkbenchShift(shifts,'ro-a',{outletId:'ro-a',businessDate:'2026-11-17',shiftId:null})?.id).toBe('b');
    expect(resolveWorkbenchShift(shifts,'ro-a',{outletId:'ro-a',businessDate:'2026-11-16',shiftId:null})).toBeNull();
  });
  it('never selects a shift from a different outlet',()=>{
    expect(resolveWorkbenchShift(shifts,'ro-a',null)?.outletId).toBe('ro-a');
    expect(resolveWorkbenchShift(shifts,'ro-c',null)).toBeNull();
  });
  it('supports daily entry, receipts, finance and date-based reports without changing routes',()=>{
    const app=fs.readFileSync('src/App.tsx','utf8');
    const daily=fs.readFileSync('src/frontend/pages/DailyOperationsPage.tsx','utf8');
    const stock=fs.readFileSync('src/frontend/pages/StockOperationsPage.tsx','utf8');
    const finance=fs.readFileSync('src/frontend/pages/FinancialOperationsPage.tsx','utf8');
    const dsr=fs.readFileSync('src/frontend/pages/DsrReportsPage.tsx','utf8');
    expect(app).toContain('ShiftWorkbenchProvider');
    expect(app).toContain('key={activeOutletId}');
    for(const p of ['stock-ops','financials','dsr-reports'])expect(daily).toContain("followTask('"+p+"')");
    expect(stock).toContain("selectedRef.current===shiftId");
    expect(finance).toContain("selectedRef.current===selectedShiftId");
    expect(stock).toContain('Return to shift workbench');
    expect(finance).toContain('Return to shift workbench');
    expect(dsr).toContain('selection?.businessDate || today()');
  });
});