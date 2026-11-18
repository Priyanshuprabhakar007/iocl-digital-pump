import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { DailyFuelSummary, DailyProductSummary } from '../src/shared/types';
import { dsrDates, dsrPeriodProducts, dsrProductValues } from '../src/frontend/utils/dsrReport';
import { generateDsrPdf } from '../src/frontend/utils/dsrReportPdf';

const dates=(mode: Parameters<typeof dsrDates>[0], anchor='2026-11-18', month='2026-11', from='2026-11-01', to='2026-11-18')=>dsrDates(mode,anchor,month,from,to,'2026-11-18');
const product=(overrides: Partial<DailyProductSummary>={}):DailyProductSummary=>({
  productId:'ms',productCode:'MS',productName:'Motor Spirit',unit:'L',status:'COMPLETE',missingFields:[],
  openingStockMilliunits:10000,receiptsMilliunits:0,availableStockMilliunits:10000,
  grossSalesMilliunits:4000,testingMilliunits:1000,netSalesMilliunits:3000,
  theoreticalClosingMilliunits:7000,physicalClosingMilliunits:7000,varianceMilliunits:0,
  ...overrides
} as DailyProductSummary);
const day=(businessDate:string,byProduct:DailyProductSummary[],dayEntryStatus:DailyFuelSummary['dayEntryStatus']='COMPLETE')=>({
  businessDate,byProduct,dayEntryStatus,status:dayEntryStatus==='NO_ENTRY'?'NOT_STARTED':'COMPLETE',
  shiftsCount:dayEntryStatus==='NO_ENTRY'?0:1,byDispenser:[],missingFields:[],completion:{completedReceipts:0,totalReceipts:0}
} as unknown as DailyFuelSummary);

describe('historical DSR read-only reporting',()=>{
  it('uses inclusive business dates, Monday-Sunday weeks and month-to-date cutoff',()=>{
    expect(dates('DAY')).toEqual(['2026-11-18']);
    expect(dates('WEEK')).toEqual(['2026-11-16','2026-11-17','2026-11-18']);
    expect(dates('WEEK','2026-11-01')).toEqual(['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01']);
    expect(dates('MONTH','2026-11-18','2024-02')).toHaveLength(29);
    expect(dates('MONTH')).toHaveLength(18);
    expect(dates('CUSTOM','2026-11-18','2026-11','2026-10-31','2026-11-01')).toEqual(['2026-10-31','2026-11-01']);
  });
  it('rejects impossible, reversed, future and excessive ranges',()=>{
    expect(()=>dates('DAY','2026-02-30')).toThrow();
    expect(()=>dates('DAY','2026-11-19')).toThrow();
    expect(()=>dates('MONTH','2026-11-18','2026-12')).toThrow();
    expect(()=>dates('CUSTOM','2026-11-18','2026-11','2026-11-15','2026-11-01')).toThrow();
    expect(()=>dates('CUSTOM','2026-11-18','2026-11','2026-01-01','2026-11-18')).toThrow();
  });
  it('does not substitute zero for missing values or count incomplete days as complete',()=>{
    const missing=product({status:'PARTIAL',missingFields:['No opening tank reading','Nozzle missing meter reading'],netSalesMilliunits:2000});
    expect(dsrProductValues(missing)[0]).toBe('Not recorded');
    expect(dsrProductValues(missing)[5]).toBe('Not recorded');
    expect(dsrProductValues(product({netSalesMilliunits:0}))[5]).toBe('0.000');
    const result=dsrPeriodProducts([day('2026-11-01',[product()]),day('2026-11-02',[missing],'PARTIAL'),day('2026-11-03',[],'NO_ENTRY')])[0];
    expect(result.recordedNetMilliunits).toBe(3000);
    expect(result.recordedDays).toBe(1);
    expect(result.completeDays).toBe(1);
    expect(result.fullyRecorded).toBe(false);
  });
  it('keeps different product units separate and preserves known zero',()=>{
    const result=dsrPeriodProducts([day('2026-11-01',[product({netSalesMilliunits:0}),product({productId:'cng',productCode:'CNG',unit:'KG',netSalesMilliunits:9000})])]);
    expect(result.find(p=>p.unit==='L')?.recordedNetMilliunits).toBe(0);
    expect(result.find(p=>p.unit==='KG')?.recordedNetMilliunits).toBe(9000);
    expect(result.every(p=>p.fullyRecorded)).toBe(true);
  });
  it('generates readable PDF files with a period overview, daily statements, and no-entry reports',async()=>{
    const metadata={outletName:'Test RO',roCode:'395633',generatedAt:'2026-11-18T00:00:00Z',generatedBy:'Test User',periodLabel:'Weekly'};
    const data=[day('2026-11-01',[product()]),day('2026-11-02',[],'NO_ENTRY'),day('2026-11-03',[product()])];
    expect((await PDFDocument.load(await generateDsrPdf({...metadata,days:data}))).getPageCount()).toBe(3);
    expect((await PDFDocument.load(await generateDsrPdf({...metadata,days:[data[1]]}))).getPageCount()).toBe(1);
  });
});
