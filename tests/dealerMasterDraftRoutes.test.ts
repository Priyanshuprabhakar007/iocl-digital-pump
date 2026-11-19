import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {app} from '../src/worker/app';
import {getDb} from '../src/db';
import {seedDatabase} from '../src/db/seed';
import {createLocalD1Database} from '../src/db/localD1';
import {retailOutlets,dealerMasterDraftUploads,auditLogs} from '../src/db/schema';
import {dealerMasterFieldCatalog} from '../src/shared/dealerMasterFieldCoverage';
import {normalizeDealerDraft,serializeDealerDraft} from '../src/shared/dealerMasterDraft';

const makeRow=(code:string,row=2)=>({
  sourceRow:row,roCode:code,city:'',pincode:'',
  yellowHeaders:['CUSTCODE','LAND OWNER','RENT (monthly)'],
  sourceDetails:Object.fromEntries(dealerMasterFieldCatalog.map(f=>
    [f.header,f.header==='CUSTCODE'?code:
      f.header==='CUSTOMER  NAME (NAME OF  RO)'?'TEST DEALER '+code:
      f.header==='LAND OWNER'?'Verified owner source':
      f.header==='RENT (monthly)'?'78000':'']
  )),
});
const payload=(codes:string[]=['369460','385770'])=>({
  sourceFileName:'IOCL Dealer Master RO A Site.xlsx',
  sourceFileSha256:'a'.repeat(64),
  sourceSheetName:'IOCL Dealer Master RO FOR REMM',
  importPolicy:'FULL_INCLUDING_YELLOW',
  confirmedDraftOnly:true,
  rows:codes.map((c,i)=>makeRow(c,i+2)),
});
describe('Draft-only RO Master import — independent 0039 storage',()=>{
  let localD1:ReturnType<typeof createLocalD1Database>;
  let env:any,admin='',dealer='',dbPath='';
  const origin='http://localhost:3000';
  async function req(method:string,path:string,body?:unknown,cookie=admin){
    const response=await app.request(path,{
      method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    },env);
    return {status:response.status,data:await response.json() as any};
  }
  beforeEach(async()=>{
    dbPath='./.sqlite/dealer_drafts_'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.db';
    localD1=createLocalD1Database(dbPath);
    await seedDatabase(getDb(localD1));
    await localD1.exec(fs.readFileSync(
      'docs/dealer-master-draft-0039/0039_dealer_master_draft_uploads.sql','utf8'));
    env={DB:localD1,DOCUMENTS_BUCKET:null,ENVIRONMENT:'test',ALLOWED_ORIGINS:origin};
    async function login(email:string){
      const res=await app.request('/api/v1/auth/login',{method:'POST',headers:{
        Origin:origin,'Content-Type':'application/json',
      },body:JSON.stringify({email,password:'Password@123'})},env);
      return res.headers.get('set-cookie')?.split(';')[0]||'';
    }
    admin=await login('admin@iocl.in');
    dealer=await login('dealer.parkstreet@iocl.in');
  },15000);
  afterEach(()=>{
    try{localD1.close();}catch{}
    for(const suffix of ['','-wal','-shm'])try{fs.unlinkSync(dbPath+suffix);}catch{}
  });
  it('saves all 26 source fields incl yellow/missing City PIN without changing outlets',async()=>{
    const before=await getDb(localD1).select().from(retailOutlets).all();
    const health=await req('GET','/api/v1/outlets/dealer-master/drafts/status');
    expect(health.status).toBe(200);
    expect(health.data.data.storageReady).toBe(true);
    const saved=await req('POST','/api/v1/outlets/dealer-master/drafts',payload());
    expect(saved.status).toBe(201);
    expect(saved.data.data.action).toBe('SAVED');
    expect(saved.data.data.rowCount).toBe(2);
    expect(saved.data.data.status).toBe('DRAFT');
    const after=await getDb(localD1).select().from(retailOutlets).all();
    expect(after).toEqual(before);
    const draft=await getDb(localD1).select().from(dealerMasterDraftUploads).all();
    expect(draft).toHaveLength(1);
    const raw=JSON.parse(draft[0].sourceDataJson);
    expect(raw.rows[0].yellowHeaders).toContain('LANDOWNER');
    expect(raw.rows[0].fields['LAND OWNER']).toBe('Verified owner source');
    expect(raw.rows[0].fields['RENT (monthly)']).toBe('78000');
    expect(raw.rows[0].city).toBe('');
    expect(Object.keys(raw.rows[0].fields)).toHaveLength(26);
    expect(raw.businessColumns).toHaveLength(26);
    const audit=await getDb(localD1).select().from(auditLogs).all();
    expect(audit.some(a=>a.action==='DEALER_MASTER_DRAFT_SAVED'&&a.entityId===draft[0].id)).toBe(true);
  });
  it('same Excel payload is idempotent and a new verified PIN produces a new immutable version',async()=>{
    const first=await req('POST','/api/v1/outlets/dealer-master/drafts',payload());
    const duplicate=await req('POST','/api/v1/outlets/dealer-master/drafts',payload());
    expect(duplicate.status).toBe(200);
    expect(duplicate.data.data.action).toBe('ALREADY_SAVED');
    expect(duplicate.data.data.draftId).toBe(first.data.data.draftId);
    const newer=payload();
    newer.rows[1].city='Mohali';newer.rows[1].pincode='160071';
    const second=await req('POST','/api/v1/outlets/dealer-master/drafts',newer);
    expect(second.status).toBe(201);
    expect(second.data.data.draftId).not.toBe(first.data.data.draftId);
    const drafts=await getDb(localD1).select().from(dealerMasterDraftUploads).all();
    expect(drafts).toHaveLength(2);
    await expect(localD1.exec("UPDATE dealer_master_draft_uploads SET status='DRAFT' WHERE id='"+drafts[0].id+"'")).rejects.toThrow();
    await expect(localD1.exec("DELETE FROM dealer_master_draft_uploads WHERE id='"+drafts[0].id+"'")).rejects.toThrow();
  });
  it('saved history loads only the owning admin and resumes original 26 fields',async()=>{
    const saved=await req('POST','/api/v1/outlets/dealer-master/drafts',payload());
    const id=saved.data.data.draftId;
    const list=await req('GET','/api/v1/outlets/dealer-master/drafts');
    expect(list.data.data).toHaveLength(1);
    expect(list.data.data[0].sourceDataJson).toBeUndefined();
    const loaded=await req('GET','/api/v1/outlets/dealer-master/drafts/'+id);
    expect(loaded.status).toBe(200);
    expect(loaded.data.data.contents.rows[1].roCode).toBe('385770');
    expect(loaded.data.data.contents.rows[0].fields.CUSTCODE).toBe('369460');
    expect((await req('GET','/api/v1/outlets/dealer-master/drafts',undefined,dealer)).status).toBe(403);
    expect((await req('POST','/api/v1/outlets/dealer-master/drafts',payload(),dealer)).status).toBe(403);
    expect((await req('GET','/api/v1/outlets/dealer-master/drafts/'+id,undefined,dealer)).status).toBe(403);
  });
  it('rejects duplicate RO codes, missing fields and attempts to claim final import',async()=>{
    const dupe=payload(['369460','369460']);
    expect((await req('POST','/api/v1/outlets/dealer-master/drafts',dupe)).status).toBe(400);
    const bad=payload();delete (bad.rows[0].sourceDetails as any)['LAND OWNER'];
    expect((await req('POST','/api/v1/outlets/dealer-master/drafts',bad)).status).toBe(400);
    expect((await req('POST','/api/v1/outlets/dealer-master/drafts',
      {...payload(),confirmedDraftOnly:false})).status).toBe(400);
    expect((await req('POST','/api/v1/outlets/dealer-master/drafts',
      {...payload(),finalize:true})).status).toBe(400);
    expect((await getDb(localD1).select().from(dealerMasterDraftUploads).all())).toHaveLength(0);
  });
  it('can persist a full 131-row / 26-column source in one immutable draft',async()=>{
    const codes=Array.from({length:131},(_,i)=>String(800000+i));
    const saved=await req('POST','/api/v1/outlets/dealer-master/drafts',payload(codes));
    expect(saved.status).toBe(201);
    expect(saved.data.data.rowCount).toBe(131);
    const loaded=await req('GET','/api/v1/outlets/dealer-master/drafts/'+saved.data.data.draftId);
    expect(loaded.data.data.contents.rows).toHaveLength(131);
    expect(loaded.data.data.contents.rows[130].fields.CUSTCODE).toBe(codes[130]);
  });
});
describe('Pure draft source normalization',()=>{
  it('rejects mismatching RO identity and invalid paired PIN without guessing',()=>{
    const mismatch=payload();mismatch.rows[0].sourceDetails.CUSTCODE='somethingelse';
    expect(()=>normalizeDealerDraft(mismatch)).toThrow(/SOURCE_CODE_MISMATCH/);
    const pin=payload();pin.rows[0].city='Mohali';pin.rows[0].pincode='';
    expect(()=>normalizeDealerDraft(pin)).toThrow(/INVALID_CITY_PIN_SUPPLEMENT/);
  });
  it('preserves 26 source fields, blanks and yellow metadata and does not count serial',()=>{
    const source=payload();source.rows[0].sourceDetails['S. NO.']='1';
    const normalized=normalizeDealerDraft(source);
    expect(normalized.businessColumns).toHaveLength(26);
    expect(normalized.rows[0].fields).not.toHaveProperty('S. NO.');
    expect(normalized.rows[0].yellowHeaders).toContain('LANDOWNER');
    expect(serializeDealerDraft(normalized)).toContain('"RENT (monthly)":"78000"');
  });
});
