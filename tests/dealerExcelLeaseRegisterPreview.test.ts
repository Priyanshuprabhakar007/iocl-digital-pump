import {describe,it,expect} from 'vitest';
import {getExcelLandLeaseRegisterPreview} from '../src/shared/dealerExcelLeaseRegisterPreview';
import {buildSectionWiseSections} from '../src/worker/services/cocoSectionWiseReportService';
import type {DealerDraftRow} from '../src/shared/dealerMasterDraft';
const draft:DealerDraftRow={sourceRow:2,roCode:'373196',city:'',pincode:'',yellowHeaders:[],fields:{
  CUSTCODE:'373196','LAND OWNER':'CANDIGARH HOUSING BOARD',
  'CUST LAND DESC (LAND STATUS)':'Leased Land',
  'FROM':'30.01.2018','TO':'29.01.2051','DURATION (YEARS)':'33',
  AREA:'0.5','measuring unit':'ACR','RENT (monthly)':'',
}};
describe('Excel preview integrated with Registered Agreements without false signed claims',()=>{
  it('shows 0.5 ACR and dates from source without converting unknown units or inventing rent',()=>{
    const p=getExcelLandLeaseRegisterPreview(draft,'373196',false);
    expect(p).toMatchObject({area:'0.5 ACR',rentMonthly:'',owner:'CANDIGARH HOUSING BOARD',
      startDate:'2018-01-30',endDate:'2051-01-29'});
    expect(p?.status).toBe('Excel Import');
  });
  it('does not expose another RO or duplicate an existing registered land lease',()=>{
    expect(getExcelLandLeaseRegisterPreview(draft,'396187',false)).toBeNull();
    expect(getExcelLandLeaseRegisterPreview(draft,'373196',true)).toBeNull();
  });
  it('marks saved source-based agreement as Recorded in PDF without claiming signed-contract validity',()=>{
    const sections=buildSectionWiseSections({items:[],leases:[],assets:[],outletType:'COCO',
      agreements:[{id:'a',agreementType:'LAND_LEASE',agreementName:'Land Lease',
        agreementNumber:null,counterpartyName:null,vendorCode:null,customerCode:'373196',
        siteClass:null,remarks:'EXCEL_SOURCE_UNVERIFIED | Imported from saved Dealer Master.',
        startDate:'2018-01-30',endDate:'2051-01-29',linkedNfrLeaseId:null,
        leaseTerms:null,contractName:null}],
      reportDate:'2026-11-20'});
    expect(sections[0].tables[0].rows[0][2]).toBe('Recorded');
    expect(sections[0].tables[0].rows[0][5]).toBe('Not Recorded');
  });
});
