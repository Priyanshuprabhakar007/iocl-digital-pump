import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {assessStage6Staging,assertStage6ReadOnlyQuery,STAGE6_READ_ONLY_QUERIES} from '../src/shared/dealerMasterStage6Readiness';

const baseline=Array.from({length:35},(_,i)=>'000'+(i+1)).map(x=>x.slice(-4)+'_migration.sql');
const core=[{name:'retail_outlets',type:'table'},{name:'d1_migrations',type:'table'}];
const doc=[{name:'coco_agreement_details',type:'table'}];
const lease=[
  {name:'coco_agreement_lease_terms',type:'table'},
  {name:'trg_coco_lease_terms_insert',type:'trigger'},
  {name:'trg_coco_lease_terms_update',type:'trigger'},
];
const dealer=[
  {name:'dealer_ro_master_details',type:'table'},
  {name:'dealer_land_master_details',type:'table'},
  {name:'dealer_lease_source_records',type:'table'},
  ...['trg_dealer_lease_same_outlet_insert','trg_dealer_lease_same_outlet_update',
    'trg_dealer_ro_master_details_protect_existing','trg_dealer_land_master_details_protect_existing',
    'trg_dealer_lease_source_records_protect_existing'].map(name=>({name,type:'trigger'})),
  {name:'uq_dealer_lease_sources_one_per_agreement',type:'index'},
];
describe('Stage 6 read-only hosted D1 readiness classification',()=>{
  it('classifies empty staging D1 without implying any migrations are authorized',()=>{
    const x=assessStage6Staging([{name:'_cf_KV',type:'table'}],null,baseline,0);
    expect(x.status).toBe('EMPTY_STAGING');
    expect(x.productionReady).toBe(false);
  });
  it('fails on incomplete or corrupted 35-row migration ledger',()=>{
    expect(assessStage6Staging(core,baseline.slice(0,34),baseline,0).status)
      .toBe('BASELINE_LEDGER_MISMATCH');
    expect(assessStage6Staging(core,[...baseline.slice(0,34),baseline[0]],baseline,0).status)
      .toBe('BASELINE_LEDGER_MISMATCH');
  });
  it('requires each proposal and its required database triggers',()=>{
    expect(assessStage6Staging(core,baseline,baseline,0).status).toBe('DOCUMENTATION_0036_MISSING');
    expect(assessStage6Staging([...core,...doc],baseline,baseline,0).status).toBe('LEASE_TERMS_0037_MISSING');
    expect(assessStage6Staging([...core,...doc,...lease],baseline,baseline,0).status).toBe('DEALER_MASTER_0038_MISSING');
  });
  it('detects FK violations first and never calls schema presence production approval',()=>{
    const objects=[...core,...doc,...lease,...dealer];
    expect(assessStage6Staging(objects,baseline,baseline,1).status).toBe('FOREIGN_KEY_VIOLATIONS');
    const x=assessStage6Staging(objects,baseline,baseline,0);
    expect(x.status).toBe('SCHEMA_PRESENT_APP_UAT_PENDING');
    expect(x.stagingSchemaReady).toBe(true);
    expect(x.productionReady).toBe(false);
  });
  it('rejects arbitrary SQL and untrusted text even if it starts with SELECT',()=>{
    for(const q of ['UPDATE retail_outlets SET name=1','SELECT * FROM retail_outlets','SELECT 1; DELETE FROM retail_outlets']){
      expect(()=>assertStage6ReadOnlyQuery(q)).toThrow('STAGE6_SQL_NOT_IN_READ_ONLY_ALLOWLIST');
    }
    for(const q of Object.values(STAGE6_READ_ONLY_QUERIES))expect(assertStage6ReadOnlyQuery(q)).toBe(q);
  });
  it('staging workflow has no automated credential access on pull requests',()=>{
    const wf=readFileSync('.github/workflows/dealer-master-stage6-readonly.yml','utf8');
    const script=readFileSync('scripts/dealer-master-stage6/hosted-readonly.ts','utf8');
    expect(wf).toContain("github.event_name == 'workflow_dispatch'");
    expect(wf).toContain('environment: iocl-phase1-staging');
    expect(wf).toContain('contents: read');
    expect(script).toContain("stage.vars as Dict");
    expect(script).not.toContain('wrangler deploy');
    expect(script).not.toContain('wrangler d1 migrations apply');
    expect(script).not.toContain('vercel deploy');
    expect(script).toContain("STAGE6_APPROVED_READONLY");
  });
});
