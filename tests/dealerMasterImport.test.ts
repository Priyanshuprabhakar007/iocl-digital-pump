import { describe, expect, it } from 'vitest';
import { buildDealerImportPlan, classifyDealerSite, parseDealerMasterRows } from '../src/shared/dealerMasterImport';
import type { Division, RetailOutlet, SalesArea } from '../src/shared/types';
const div = {id:'div1',name:'Chandigarh DO',stateId:'st1'} as Division;
const area = {id:'sa1',name:'Chandigarh South RSA',stateId:'st1',divisionId:'div1'} as SalesArea;
const excel = (code:unknown='369460')=>({
  CUSTCODE:code,
  'CUSTOMER  NAME (NAME OF  RO)':'COCO 79',
  ADDRESS:'Sector 79 Mohali',DISTRICT:'SAS NAGAR',
  SALESOFFICE:'Chandigarh DO','SALES AREA NAME':'Chandigarh South RSA',
  'PRICE GROUP DESCRIPTION(SITE)':'COCO-Contractor Opr'
});
const current = {id:'ro79',roCode:'369460',name:'COCO 79',address:'Sector 79 Mohali',district:'SAS NAGAR',city:'Mohali',pincode:'160071',outletType:'COCO',stateId:'st1',divisionId:'div1',salesAreaId:'sa1'} as RetailOutlet;
describe('Dealer master Excel synchronization safeguards',()=>{
  it('maps actual workbook headers and numeric CUSTCODE',()=>{
    const rows=parseDealerMasterRows([excel(369460)]);
    expect(rows[0].roCode).toBe('369460');
    expect(rows[0].salesOffice).toBe('Chandigarh DO');
    expect(rows[0].siteDescription).toBe('COCO-Contractor Opr');
  });
  it('does not guess site classification',()=>{
    expect(classifyDealerSite('COCO-Contractor Opr')).toBe('COCO');
    expect(classifyDealerSite('RO A Site')).toBe('A_SITE');
    expect(classifyDealerSite('Unknown site')).toBeNull();
  });
  it('skips identical existing outlets on re-upload',()=>{
    const plan=buildDealerImportPlan(parseDealerMasterRows([excel()]),[current],[div],[area]);
    expect(plan[0].action).toBe('UNCHANGED');
  });
  it('updates existing only when supported fields differ, keeping its city and pincode',()=>{
    const changed=excel();changed.ADDRESS='New verified address';
    const item=buildDealerImportPlan(parseDealerMasterRows([changed]),[current],[div],[area])[0];
    expect(item.action).toBe('UPDATE');
    expect(item.changes).toEqual(['address']);
    expect(item.payload?.city).toBe('Mohali');
    expect(item.payload?.pincode).toBe('160071');
  });
  it('blocks unknown new outlet city and pincode, even with known hierarchy',()=>{
    const item=buildDealerImportPlan(parseDealerMasterRows([excel(123456)]),[],[div],[area])[0];
    expect(item.action).toBe('REVIEW');
    expect(item.messages.some(x=>x.includes('City and PIN'))).toBe(true);
  });
  it('flags duplicate codes in the upload and missing hierarchy',()=>{
    const duplicate=buildDealerImportPlan(parseDealerMasterRows([excel(),excel()]),[current],[div],[area]);
    expect(duplicate[1].action).toBe('REVIEW');
    const missing=buildDealerImportPlan(parseDealerMasterRows([excel()]),[current],[],[]);
    expect(missing[0].action).toBe('REVIEW');
  });
  it('supports explicit verified hierarchy aliases while respecting division lineage',()=>{
    const mismatchedDivision={...div,name:'Chandigarh State Office'} as Division;
    const mismatchedArea={...area,name:'CHANDIGARH SOUTH'} as SalesArea;
    const rows=parseDealerMasterRows([excel()]);
    expect(buildDealerImportPlan(rows,[current],[mismatchedDivision],[mismatchedArea])[0].action).toBe('REVIEW');
    const mapped={
      divisionIdsByOffice:{'CHANDIGARH DO':'div1'},
      areaIdsByName:{'CHANDIGARH SOUTH RSA':'sa1'}
    };
    expect(buildDealerImportPlan(rows,[current],[mismatchedDivision],[mismatchedArea],mapped)[0].action).toBe('UNCHANGED');
    expect(buildDealerImportPlan(rows,[current],[mismatchedDivision],[{...mismatchedArea,divisionId:'other'} as SalesArea],mapped)[0].action).toBe('REVIEW');
  });
  it('refuses every duplicate row in a single file',()=>{
    const plan=buildDealerImportPlan(parseDealerMasterRows([excel(),excel()]),[current],[div],[area]);
    expect(plan.map(p=>p.action)).toEqual(['REVIEW','REVIEW']);
  });
  it('permits explicit site classification mapping but never invents City/PIN',()=>{
    const unknown=excel(111222);
    unknown['PRICE GROUP DESCRIPTION(SITE)']='KSK-A';
    const rows=parseDealerMasterRows([unknown]);
    const plan=buildDealerImportPlan(rows,[],[div],[area],{outletTypesBySite:{'KSK-A':'A_SITE'}});
    expect(plan[0].action).toBe('REVIEW');
    expect(plan[0].messages.some(x=>x.includes('PIN'))).toBe(true);
  });
  it('does not modify archived outlets without separate approval',()=>{
    const item=buildDealerImportPlan(parseDealerMasterRows([excel()]),[{...current,lifecycleStatus:'ARCHIVED'} as RetailOutlet],[div],[area])[0];
    expect(item.action).toBe('REVIEW');
  });
});
