import {afterEach,beforeEach,describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {app} from '../src/worker/app';
import {getDb} from '../src/db';
import {seedDatabase} from '../src/db/seed';
import {createLocalD1Database} from '../src/db/localD1';
import {retailOutlets} from '../src/db/schema';
import {dealerMasterFieldCatalog} from '../src/shared/dealerMasterFieldCoverage';

describe('Pending Setup without City/PIN or mandatory hierarchy',()=>{
  const origin='http://localhost:3000';
  let localD1:ReturnType<typeof createLocalD1Database>, env:any,admin='',dealer='',file='';
  async function req(method:string,path:string,body?:unknown,cookie=admin){
    const res=await app.request(path,{method,headers:{Origin:origin,Cookie:cookie,
      'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})},env);
    return {status:res.status,data:await res.json() as any};
  }
  async function login(email:string){
    const result=await app.request('/api/v1/auth/login',{method:'POST',headers:{
      Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({
      email,password:'Password@123'
    })},env);
    return result.headers.get('set-cookie')?.split(';')[0]||'';
  }
  const payload={
    sourceFileName:'IOCL Dealer Master RO A Site.xlsx',
    sourceFileSha256:'a'.repeat(64),sourceSheetName:'IOCL Dealer Master RO FOR REMM',
    importPolicy:'FULL_INCLUDING_YELLOW',confirmedDraftOnly:true,
    rows:[{
      sourceRow:2,roCode:'373196',city:'',pincode:'',yellowHeaders:[],
      sourceDetails:Object.fromEntries(dealerMasterFieldCatalog.map(f=>[f.header,
        f.header==='CUSTCODE'?'373196':
        f.header==='CUSTOMER  NAME (NAME OF  RO)'?'COCO IT PARK NEHA HALDWANI SERVICE':
        f.header==='ADDRESS'?'COCO SERVICE PROVIDER IT PARK CHANDIGARH':
        f.header==='DISTRICT'?'CHANDIGARH':''])),
    }],
  };
  const values={
    name:'COCO IT PARK NEHA HALDWANI SERVICE',outletType:'COCO',
    address:'COCO SERVICE PROVIDER IT PARK CHANDIGARH',district:'CHANDIGARH',
    stateId:'',divisionId:'',salesAreaId:'',city:'',pincode:'',
  };
  let draftId='';
  beforeEach(async()=>{
    file='./.sqlite/pending_setup_'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.db';
    localD1=createLocalD1Database(file);
    await seedDatabase(getDb(localD1));
    await localD1.exec(fs.readFileSync('docs/dealer-master-draft-0039/0039_dealer_master_draft_uploads.sql','utf8'));
    await localD1.exec(fs.readFileSync('docs/dealer-master-pending-0040/0040_pending_setup.sql','utf8'));
    env={DB:localD1,DOCUMENTS_BUCKET:null,ENVIRONMENT:'test',ALLOWED_ORIGINS:origin};
    admin=await login('admin@iocl.in');
    dealer=await login('dealer.parkstreet@iocl.in');
    const draft=await req('POST','/api/v1/outlets/dealer-master/drafts',payload);
    expect(draft.status).toBe(201);
    draftId=draft.data.data.draftId;
  },15000);
  afterEach(()=>{
    try{localD1.close();}catch{}
    for(const end of ['','-wal','-shm'])try{fs.unlinkSync(file+end)}catch{}
  });
  const route=()=>'/api/v1/outlets/dealer-master/drafts/'+draftId+'/pending-setup';
  it('persists setup with blank city PIN and hierarchy, without creating an outlet',async()=>{
    const before=await getDb(localD1).select().from(retailOutlets).all();
    const response=await req('PUT',route()+'/373196',{values,expectedRevision:0});
    expect(response.status).toBe(200);
    expect(response.data.data.revision).toBe(1);
    const after=await getDb(localD1).select().from(retailOutlets).all();
    expect(after).toEqual(before);
    const list=await req('GET',route());
    expect(list.data.data).toHaveLength(1);
    expect(list.data.data[0].values.city).toBe('');
    expect(list.data.data[0].values.pincode).toBe('');
  });
  it('updates a saved setup later, without editing original 26 source fields',async()=>{
    const first=await req('PUT',route()+'/373196',{values,expectedRevision:0});
    expect(first.status).toBe(200);
    const next=await req('PUT',route()+'/373196',{
      values:{...values,city:'Chandigarh',pincode:'160101'},expectedRevision:1,
    });
    expect(next.status).toBe(200);
    expect(next.data.data.revision).toBe(2);
    const source=await req('GET','/api/v1/outlets/dealer-master/drafts/'+draftId);
    expect(source.data.data.contents.rows[0].city).toBe('');
    expect(source.data.data.contents.rows[0].fields['CUSTOMER  NAME (NAME OF  RO)']).toBe(values.name);
  });
  it('rejects stale update, unknown code, invalid PIN and unauthorized dealer',async()=>{
    expect((await req('PUT',route()+'/373196',{values:{...values,pincode:'7000'},expectedRevision:0})).status).toBe(400);
    expect((await req('PUT',route()+'/123456',{values,expectedRevision:0})).status).toBe(400);
    expect((await req('PUT',route()+'/373196',{values,expectedRevision:0},dealer)).status).toBe(403);
    await req('PUT',route()+'/373196',{values,expectedRevision:0});
    expect((await req('PUT',route()+'/373196',{values:{...values,city:'Mohali'},expectedRevision:0})).status).toBe(409);
    expect((await req('GET',route(),undefined,dealer)).status).toBe(403);
  });
  it('rejects partial invalid hierarchy but lets state/area remain unselected',async()=>{
    const result=await req('PUT',route()+'/373196',{
      values:{...values,divisionId:'unknown'},expectedRevision:0,
    });
    expect(result.status).toBe(400);
    expect((await req('PUT',route()+'/373196',{values,expectedRevision:0})).status).toBe(200);
  });
});
