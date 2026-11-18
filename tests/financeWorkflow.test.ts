import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import type { ShiftFinancialSummary, OperationalShift } from '../src/shared/types';
import { financeStages, financeStageDetails, financeSalesProvisional } from '../src/frontend/utils/financeWorkflow';

const shift={id:'shift-a',outletId:'ro-a',status:'OPEN'} as OperationalShift;
const recorded={operationalShiftId:'shift-a',outletId:'ro-a',
  salesRevenue:{readingCoverage:{status:'COMPLETE'},cngApplicable:false,cngComplete:false,pendingComponents:[],authoritativeTotalStr:'1000.00'},
  collections:{totalStr:'1000.00'},cashHandoverSummary:{totalPendingStr:'200.00'},
  cashDepositControl:{pendingCashDepositPaise:30000,pendingCashDepositStr:'300.00'},
  varianceStr:'0.00',varianceStatus:'BALANCED'} as ShiftFinancialSummary;
describe('Connected financial workflow',()=>{
  it('presents the five operational stages in clear order',()=>{
    expect(financeStages.map(s=>s.id)).toEqual(['sales','collections','handovers','deposits','reconciliation']);
  });
  it('never presents missing or wrong-shift data as zero',()=>{
    const absent=financeStageDetails(null,shift);
    expect(Object.values(absent).every(v=>v==='Unavailable')).toBe(true);
    expect(financeStageDetails(recorded,{...shift,id:'other'}).sales).toBe('Unavailable');
  });
  it('labels unverified readings and pending CNG or other components as provisional even at zero variance',()=>{
    for(const salesRevenue of [
      {...recorded.salesRevenue,readingCoverage:undefined},
      {...recorded.salesRevenue,readingCoverage:{...recorded.salesRevenue.readingCoverage!,status:'INCOMPLETE' as const}},
      {...recorded.salesRevenue,cngApplicable:true,cngComplete:false},
      {...recorded.salesRevenue,pendingComponents:['LUBE']},
    ]) {
      const summary={...recorded,salesRevenue};
      expect(financeSalesProvisional(summary)).toBe(true);
      expect(financeStageDetails(summary,shift).reconciliation).toBe('Incomplete sales evidence');
    }
  });
  it('keeps open shift reconciliation provisional in lifecycle and reports actual pending deposit status',()=>{
    expect(financeSalesProvisional(recorded)).toBe(false);
    expect(financeStageDetails(recorded,shift).reconciliation).toContain('Preview');
    expect(financeStageDetails(recorded,shift).deposits).toBe('Pending cash deposit');
    expect(financeStageDetails(recorded,shift).handovers).toContain('200.00');
  });
  it('preserves current financial contracts, permissions and submission lock',()=>{
    const page=fs.readFileSync('src/frontend/pages/FinancialOperationsPage.tsx','utf8');
    for(const path of ['/financial-summary','/collections','/cash-handovers','/bank-deposits','/product-prices','/credit-parties']) expect(page).toContain(path);
    for(const perm of ['COLLECTIONS_WRITE','CASH_HANDOVER_WRITE','BANK_DEPOSITS_WRITE','BANK_DEPOSITS_VERIFY','CASH_HANDOVER_ACKNOWLEDGE'])expect(page).toContain('PERMISSIONS.'+perm);
    expect(page).toContain('actionLock.current=true');
    expect(page).toContain('currentSectionLoaded && !loadingData');
    expect(page).toContain('collectionType===\'CREDIT_SALE\'');
    expect(page).toContain('Review shift closure');
  });
});
