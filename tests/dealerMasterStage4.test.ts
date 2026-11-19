import {describe,expect,it} from 'vitest';
import {buildDealerStage4Plan,getDealerSourceKey,normalizeSourceDate,type Stage4Snapshot} from '../src/shared/dealerMasterStage4';
import type {DealerMasterRow,ImportPlan} from '../src/shared/dealerMasterImport';
import type {RetailOutlet} from '../src/shared/types';

const row:DealerMasterRow={
  roCode:'369460',name:'COCO 79',address:'Sector 79 Mohali',district:'SAS NAGAR',
  salesOffice:'Chandigarh DO',salesArea:'Chandigarh South RSA',
  siteDescription:'COCO-Contractor Opr',sourceRow:21,city:'',pincode:'',
  sourceDetails:{
    CUSTCODE:'369460','CUSTOMER  NAME (NAME OF  RO)':'COCO 79',
    ADDRESS:'Sector 79 Mohali',DISTRICT:'SAS NAGAR',
    EMAIL:'test@example.com','CONTACT NO':'9876543210',
    'CUST LAND DESC (LAND STATUS)':'Leased Land',
    'LAND OWNER':'Unconfirmed Owner','ORDER NO.':'TEST-ORDER',
    FROM:'20.11.2025',TO:'19.10.2045','RENT (monthly)':'78000',
  },
};
const outlet={id:'ro-79',roCode:'369460',name:'COCO 79',
  address:'Sector 79 Mohali',district:'SAS NAGAR',
  city:'Mohali',pincode:'140603',outletType:'COCO',status:'ACTIVE',
} as RetailOutlet;
const snapshot:Stage4Snapshot={
  outlets:[outlet],roDetails:[],landDetails:[],leaseSources:[],
  existingLandLeaseAgreements:[],
};
const normal:ImportPlan={
  row,action:'UNCHANGED',messages:[],changes:[],existingId:'ro-79',
};
describe('Dealer Master Stage4 source→module dry-run',()=>{
  it('keeps yellow EMAIL and owner protected and accepts only other empty destinations',()=>{
    const plan=buildDealerStage4Plan([row],{21:['EMAIL','LANDOWNER']},[normal],snapshot);
    expect(plan.rows[0].outletId).toBe('ro-79');
    expect(plan.rows[0].fields.find(f=>f.header==='EMAIL')?.status).toBe('PROTECTED');
    expect(plan.rows[0].fields.find(f=>f.header==='LAND OWNER')?.status).toBe('PROTECTED');
    expect(plan.rows[0].roDetailsPayload).toEqual({contactPhone:'9876543210'});
    expect(plan.rows[0].landPayload).toEqual({landStatus:'Leased Land'});
    expect(plan.rows[0].leasePayload).toEqual({
      orderNumber:'TEST-ORDER',startDate:'2025-11-20',endDate:'2045-10-19',rentMonthlySource:'78000',
    });
    expect(plan.rows[0].legalAgreementCheck).toBe('MISSING_OR_AMBIGUOUS');
  });
  it('does not overwrite an existing different value',()=>{
    const revised={...snapshot,roDetails:[{outletId:'ro-79',contactPhone:'0000000000'}]};
    const plan=buildDealerStage4Plan([row],{},[normal],revised);
    expect(plan.rows[0].fields.find(f=>f.header==='CONTACT NO')?.status).toBe('CONFLICT');
    expect(plan.rows[0].roDetailsPayload.contactPhone).toBeUndefined();
  });
  it('does not let conflicting saved RO fields block independent missing Land data',()=>{
    const altered={...snapshot,outlets:[{...outlet,name:'Legacy short name'} as RetailOutlet],
      roDetails:[{outletId:'ro-79',contactPhone:'0000000000'}]};
    const plan=buildDealerStage4Plan([row],{},[normal],altered);
    expect(plan.rows[0].fields.find(f=>f.header==='CUSTOMER  NAME (NAME OF  RO)')?.status).toBe('CONFLICT');
    expect(plan.rows[0].fields.find(f=>f.header==='CONTACT NO')?.status).toBe('CONFLICT');
    expect(plan.rows[0].roDetailsPayload).toEqual({});
    expect(plan.rows[0].landPayload).toEqual({landStatus:'Leased Land',landOwner:'Unconfirmed Owner'});
    expect(plan.rows[0].review).toEqual([]);
  });
  it('blocks lease source creation without order or a complete verified date period',()=>{
    const evidenceOnly={...row,sourceDetails:{...row.sourceDetails,'ORDER NO.':'',FROM:'',TO:''}};
    const plan=buildDealerStage4Plan([evidenceOnly],{},[{...normal,row:evidenceOnly}],snapshot);
    expect(plan.rows[0].leasePayload).toEqual({});
    expect(plan.rows[0].fields.some(f=>f.module==='LEASE_SOURCE'&&f.status==='REVIEW')).toBe(true);
    expect(plan.rows[0].roDetailsPayload.contactPhone).toBe('9876543210');
  });
  it('finds legal agreements by order/date but never auto-links a signed agreement',()=>{
    const revised={...snapshot,existingLandLeaseAgreements:[{
      id:'signed-1',outletId:'ro-79',agreementNumber:'TEST-ORDER',
      startDate:'2025-11-20',endDate:'2045-10-19',agreementDocumentId:'contract-1',
    }]};
    const plan=buildDealerStage4Plan([row],{},[normal],revised);
    expect(plan.rows[0].legalAgreementCheck).toBe('SIGNED_MATCH_REQUIRES_APPROVAL');
    expect(plan.rows[0].leasePayload).not.toHaveProperty('linkedAgreementId');
  });
  it('does not create an outlet from unverifiable missing hierarchy or PIN',()=>{
    const r={...row,roCode:'111095',sourceRow:22};
    const blocked:ImportPlan={row:r,action:'REVIEW',messages:['Missing city/PIN'],changes:[]};
    const plan=buildDealerStage4Plan([r],{},[blocked],{...snapshot,outlets:[]});
    expect(plan.rows[0].createOutletPayload).toBeUndefined();
    expect(plan.blockedRows).toBe(1);
  });
  it('flags changed source identity as review instead of duplicating an existing lease candidate',()=>{
    const prior={id:'prior',outletId:'ro-79',sourceKey:'IOCL_DEALER:369460:ORDER:OLD',linkedAgreementId:null};
    const plan=buildDealerStage4Plan([row],{},[normal],{...snapshot,leaseSources:[prior]});
    expect(plan.rows[0].leasePayload).toEqual({});
    expect(plan.rows[0].fields.some(f=>f.module==='LEASE_SOURCE'&&f.status==='REVIEW')).toBe(true);
    expect(plan.rows[0].roDetailsPayload.contactPhone).toBe('9876543210');
  });
  it('returns a deterministic source key on repeated files',()=>{
    expect(getDealerSourceKey(row)).toBe(getDealerSourceKey({...row,sourceRow:29}));
    expect(getDealerSourceKey(row).startsWith('IOCL_DEALER:369460')).toBe(true);
  });
  it('normalizes only unambiguous dates and rejects impossible dates',()=>{
    expect(normalizeSourceDate('20.11.2025')).toBe('2025-11-20');
    expect(normalizeSourceDate('11/30/2025')).toBe('2025-11-30');
    expect(normalizeSourceDate('30/11/2025')).toBe('2025-11-30');
    expect(normalizeSourceDate('02/03/2025')).toBeNull();
    expect(normalizeSourceDate('31.02.2025')).toBeNull();
  });
});
