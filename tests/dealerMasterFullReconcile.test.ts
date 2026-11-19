import {describe,expect,it} from 'vitest';
import {reconcileFullDealerExcel} from '../src/shared/dealerMasterFullReconcile';
import type {DealerMasterRow} from '../src/shared/dealerMasterImport';
import type {RetailOutlet} from '../src/shared/types';

const source=(code:string,details:Record<string,string>,excelRow=2):DealerMasterRow=>({
  sourceRow:excelRow,roCode:code,name:details['CUSTOMER  NAME (NAME OF  RO)']||'Example',
  address:details.ADDRESS||'Road 1',district:details.DISTRICT||'District',
  salesOffice:'Chandigarh DO',salesArea:'Chandigarh South RSA',
  siteDescription:details['PRICE GROUP DESCRIPTION(SITE)']||'RO A Site',
  city:'',pincode:'',sourceDetails:{
    SALESOFFICE:'Chandigarh DO','SALES AREA NAME':'Chandigarh South RSA',
    CUSTCODE:code,'CUSTOMER  NAME (NAME OF  RO)':details['CUSTOMER  NAME (NAME OF  RO)']||'Example',
    ADDRESS:details.ADDRESS||'Road 1',DISTRICT:details.DISTRICT||'District',
    'PRICE GROUP DESCRIPTION(SITE)':details['PRICE GROUP DESCRIPTION(SITE)']||'RO A Site',...details,
  },
});
const existing={id:'ro79',roCode:'369460',name:'COCO 79',address:'Mohali',
  district:'SAS NAGAR',outletType:'COCO',city:'Mohali',pincode:'160071',
  lifecycleStatus:'ACTIVE'} as RetailOutlet;
describe('Full Excel reconciliation: colors never exclude source values',()=>{
  it('matches RO by code, including yellow, and proposes old/new differences',()=>{
    const row=source('369460',{'CUSTOMER  NAME (NAME OF  RO)':'COCO 79 Updated',
      ADDRESS:'Mohali',DISTRICT:'SAS NAGAR','PRICE GROUP DESCRIPTION(SITE)':'COCO-Contractor Opr',
      'LAND OWNER':'GMADA','RENT (monthly)':'10000'});
    const out=reconcileFullDealerExcel([row],[existing],{2:['CUSTOMERNAME(NAMEOFRO)','LANDOWNER']});
    expect(out.matched).toBe(1);
    expect(out.newCandidates).toBe(0);
    expect(out.proposedUpdates).toBe(1);
    expect(out.fields).toHaveLength(26);
    const name=out.fields.find(f=>f.sourceHeader.includes('CUSTOMER  NAME'))!;
    expect(name.status).toBe('UPDATE_PROPOSED');
    expect(name.wasYellow).toBe('YES');
    expect(name.storedValue).toBe('COCO 79');
    const land=out.fields.find(f=>f.sourceHeader==='LAND OWNER')!;
    expect(land.sourceValue).toBe('GMADA');
    expect(land.wasYellow).toBe('YES');
    expect(land.status).toBe('SAVED_FIELD_NOT_VERIFIED');
  });
  it('marks new ROs as candidates but requires valid city/pin and hierarchy',()=>{
    const out=reconcileFullDealerExcel([source('111999',{'EMAIL':'test@example.com'})],[]);
    expect(out.newCandidates).toBe(1);
    expect(out.missingCityPin).toBe(1);
    expect(out.fields.find(f=>f.sourceHeader==='EMAIL')?.status).toBe('NEW_RO_SOURCE');
  });
  it('blocks duplicate RO codes in uploaded Excel rather than creating twice',()=>{
    const r=source('369460',{ADDRESS:'Different address'});
    const out=reconcileFullDealerExcel([r,{...r,sourceRow:3}],[existing]);
    expect(out.duplicateRows).toBe(2);
    expect(out.matched).toBe(0);
    expect(out.fields.filter(f=>f.status==='REVIEW').length).toBeGreaterThan(0);
  });
  it('never treats blank Excel values as an overwrite',()=>{
    const row=source('369460',{'CUSTOMER  NAME (NAME OF  RO)':'COCO 79',
      ADDRESS:'',DISTRICT:'SAS NAGAR'});
    row.sourceDetails.ADDRESS='';
    const out=reconcileFullDealerExcel([row],[existing]);
    const address=out.fields.find(f=>f.sourceHeader==='ADDRESS');
    expect(address?.status).toBe('BLANK_SOURCE');
    expect(address?.storedValue).toBe('');
  });
  it('blocks an archived record, even with matching code',()=>{
    const out=reconcileFullDealerExcel([source('369460',{})],[{...existing,lifecycleStatus:'ARCHIVED'} as RetailOutlet]);
    expect(out.archivedRows).toBe(1);
    expect(out.rows[0].status).toBe('ARCHIVED_REVIEW');
  });
});
