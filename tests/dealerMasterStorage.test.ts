import {describe,expect,it} from 'vitest';
import Database from 'better-sqlite3';
import {readFileSync} from 'node:fs';
import {
  dealerRoMasterInputSchema,dealerLandMasterInputSchema,dealerLeaseSourceInputSchema,
  fillOnlyMissing,matchesVerifiedLeaseSource,
} from '../src/shared/dealerMasterStorage';

describe('Dealer Master Stage 2 + 3 guarded fields',()=>{
  it('refuses overwrites, only filling new missing RO/land values',()=>{
    const result=fillOnlyMissing(
      {contactEmail:'existing@iocl.in',contactPhone:null,landOwner:'Registered Owner'},
      {contactEmail:'new@iocl.in',contactPhone:'9876543210',landOwner:'Different Owner'}
    );
    expect(result.updates).toEqual({contactPhone:'9876543210'});
    expect(result.conflicts).toEqual(['contactEmail','landOwner']);
    expect(result.unchanged).toEqual([]);
  });
  it('treats identical, blank and unprovided source values as non-writing',()=>{
    const result=fillOnlyMissing({landStatus:'Leased Land',landOwner:''},{
      landStatus:'Leased Land',landOwner:undefined,sourceArea:''
    });
    expect(result.updates).toEqual({});
    expect(result.conflicts).toEqual([]);
    expect(result.unchanged).toEqual(['landStatus']);
  });
  it('accepts valid RO metadata but rejects invalid email and dates',()=>{
    expect(dealerRoMasterInputSchema.safeParse({contactEmail:'ro@iocl.in',commissionDate:'2024-02-08'}).success).toBe(true);
    expect(dealerRoMasterInputSchema.safeParse({contactEmail:'not-an-email'}).success).toBe(false);
    expect(dealerRoMasterInputSchema.safeParse({commissionDate:'2026-02-31'}).success).toBe(false);
    expect(dealerLandMasterInputSchema.safeParse({landStatus:'Sub Leased Land',sourceArea:'1400',sourceAreaUnit:'SQMT'}).success).toBe(true);
  });
  it('does not rewrite source rent, GST or escalation into unsupported financial terms',()=>{
    const source={
      sourceKey:'385770:lease:2025-11-20',
      startDate:'2025-11-20',endDate:'2045-10-19',
      rentMonthlySource:'78000',gstChargesSource:'As per agreement',
      escalationSource:'0.1',escalationIntervalYearsSource:'5',
    };
    expect(dealerLeaseSourceInputSchema.safeParse(source).success).toBe(true);
    expect(dealerLeaseSourceInputSchema.safeParse({...source,endDate:'2020-01-01'}).success).toBe(false);
    expect(dealerLeaseSourceInputSchema.safeParse({...source,monthlyRentPaise:7800000}).success).toBe(false);
  });
  it('requires signed same-reference LAND_LEASE before linking existing agreement',()=>{
    const s={orderNumber:'ORDER-1',startDate:'2025-11-20',endDate:'2045-10-19'};
    const a={agreementType:'LAND_LEASE',agreementNumber:'ORDER-1',startDate:'2025-11-20',endDate:'2045-10-19',agreementDocumentId:'doc-1'};
    expect(matchesVerifiedLeaseSource(s,a).valid).toBe(true);
    expect(matchesVerifiedLeaseSource(s,{...a,agreementDocumentId:null}).valid).toBe(false);
    expect(matchesVerifiedLeaseSource(s,{...a,agreementNumber:'WRONG'}).valid).toBe(false);
    expect(matchesVerifiedLeaseSource(s,{...a,agreementType:'NFR_METADATA'}).valid).toBe(false);
    expect(matchesVerifiedLeaseSource(s,{...a,endDate:'2040-10-19'}).valid).toBe(false);
  });
});

describe('Dealer Master 0038 D1 SQL migration on disposable SQLite',()=>{
  function setup(){
    const db=new Database(':memory:');
    db.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE users(id TEXT PRIMARY KEY);
      CREATE TABLE retail_outlets(id TEXT PRIMARY KEY);
      CREATE TABLE coco_agreement_details(id TEXT PRIMARY KEY,outlet_id TEXT NOT NULL,agreement_type TEXT NOT NULL);
      INSERT INTO users(id) VALUES('admin');
      INSERT INTO retail_outlets(id) VALUES('ro-1'),('ro-2');
      INSERT INTO coco_agreement_details(id,outlet_id,agreement_type) VALUES('lease-1','ro-1','LAND_LEASE'),('lease-2','ro-2','LAND_LEASE'),('nfr-1','ro-1','NFR_METADATA');
    `);
    const sql=readFileSync('docs/dealer-master-migration-0038/0038_dealer_master_ro_land_lease_source.sql','utf8');
    db.exec(sql);
    return db;
  }
  const makeSource=(outletId:string,linkedAgreementId:string|null=null)=>({
    id:'src-'+outletId, outlet_id:outletId,source_key:'row-3',linked_agreement_id:linkedAgreementId,
    created_at:'2026-11-19T00:00:00Z',updated_at:'2026-11-19T00:00:00Z',
    created_by:'admin',updated_by:'admin',
  });
  it('creates three separately scoped tables with unique outlet land and RO profile',()=>{
    const db=setup();
    db.prepare("INSERT INTO dealer_ro_master_details(outlet_id,contact_email,created_at,updated_at,updated_by) VALUES('ro-1','a@b.com','now','now','admin')").run();
    expect(()=>db.prepare("INSERT INTO dealer_ro_master_details(outlet_id,contact_email,created_at,updated_at,updated_by) VALUES('ro-1','c@b.com','now','now','admin')").run()).toThrow();
    db.close();
  });
  it('blocks cross-outlet and NFR agreement references in source links',()=>{
    const db=setup();const stmt=db.prepare(`INSERT INTO dealer_lease_source_records(id,outlet_id,source_key,linked_agreement_id,created_at,updated_at,created_by,updated_by)
      VALUES (@id,@outlet_id,@source_key,@linked_agreement_id,@created_at,@updated_at,@created_by,@updated_by)`);
    expect(()=>stmt.run(makeSource('ro-1','lease-2'))).toThrow();
    expect(()=>stmt.run(makeSource('ro-1','nfr-1'))).toThrow();
    expect(stmt.run(makeSource('ro-1','lease-1')).changes).toBe(1);
    expect(()=>stmt.run({...makeSource('ro-1',null),id:'another',source_key:'row-3'})).toThrow();
    db.close();
  });
});
