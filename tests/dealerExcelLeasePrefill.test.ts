import {describe,it,expect} from 'vitest';
import {dealerLeaseFormSuggestions} from '../src/shared/dealerExcelLeasePrefill';
import type {DealerDraftRow} from '../src/shared/dealerMasterDraft';
const make=(fields:Record<string,string>):DealerDraftRow=>({
  sourceRow:2,roCode:'373196',city:'',pincode:'',yellowHeaders:[],
  fields:{CUSTCODE:'373196',...fields},
});
describe('Excel lease suggestions are review-only and preserve ambiguous values',()=>{
  it('prefills unambiguous ISO dates, reference and monthly values but never invents counterparty',()=>{
    const p=dealerLeaseFormSuggestions(make({
      'ORDER NO.':'OC-19','FROM':'2026-01-01','TO':'2027-12-31',
      'RENT (monthly)':'₹15,000.50','LAND OWNER':'Someone listed on source',
      'AREA':'25.5','measuring unit':'SQYD',
    }));
    expect(p.agreementNumber).toBe('OC-19');
    expect(p.startDate).toBe('2026-01-01');
    expect(p.rentMonthly).toBe('15000.50');
    expect(p.area).toBe('25.5');
    expect(p.reviewNotes).toContain('LAND OWNER');
    expect('counterpartyName' in p).toBe(false);
  });
  it('does not silently convert SQMT, ACR or guess date order',()=>{
    const p=dealerLeaseFormSuggestions(make({
      'AREA':'500','measuring unit':'SQMT',
      'FROM':'01/02/2026','RENT (monthly)':'Rent may change',
    }));
    expect(p.dimensionUnit).toBe(null);
    expect(p.area).toBe('');
    expect(p.startDate).toBe('');
    expect(p.rentMonthly).toBe('');
    expect(p.reviewNotes).toContain('measuring unit: SQMT');
  });
  it('rejects invalid calendar date and uncertain site categorization',()=>{
    const p=dealerLeaseFormSuggestions(make({
      'FROM':'2026-02-30','PRICE GROUP DESCRIPTION(SITE)':'Other',
    }));
    expect(p.startDate).toBe('');
    expect(p.siteClass).toBe('');
  });
});
