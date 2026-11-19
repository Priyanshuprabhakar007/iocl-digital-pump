import {beforeEach,afterEach,describe,expect,it} from 'vitest';
import fs from 'node:fs';
import {app} from '../src/worker/app';
import {createLocalD1Database} from '../src/db/localD1';
import {getDb} from '../src/db';
import {seedDatabase} from '../src/db/seed';
import {auditLogs,dealerRoMasterDetails,dealerLandMasterDetails,dealerLeaseSourceRecords} from '../src/db/schema';
import {eq} from 'drizzle-orm';

describe('Stage 4 authenticated route integration — disposable local D1 only',()=>{
  let localD1:ReturnType<typeof createLocalD1Database>;
  let env:any,adminCookie='',dealerCookie='',dbPath='';
  const origin='http://localhost:3000';
  async function request(method:string,path:string,body?:unknown,cookie=adminCookie){
    const response=await app.request(path,{
      method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    },env);
    return {status:response.status,data:await response.json() as any};
  }
  beforeEach(async()=>{
    dbPath='./.sqlite/stage4_routes_'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.db';
    localD1=createLocalD1Database(dbPath);
    await seedDatabase(getDb(localD1));
    await localD1.exec(fs.readFileSync('docs/proposed-migrations/0036_coco_agreements_claims_inspections.sql','utf8'));
    await localD1.exec(fs.readFileSync('docs/dealer-master-migration-0038/0038_dealer_master_ro_land_lease_source.sql','utf8'));
    env={DB:localD1,DOCUMENTS_BUCKET:null,ENVIRONMENT:'test',ALLOWED_ORIGINS:origin};
    const login=async(email:string)=>{
      const response=await app.request('/api/v1/auth/login',{
        method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
        body:JSON.stringify({email,password:'Password@123'}),
      },env);
      return response.headers.get('set-cookie')?.split(';')[0]||'';
    };
    adminCookie=await login('admin@iocl.in');
    dealerCookie=await login('dealer.parkstreet@iocl.in');
  },15000);
  afterEach(()=>{
    try{localD1.close();}catch{}
    for(const suffix of ['','-wal','-shm'])try{fs.unlinkSync(dbPath+suffix);}catch{}
  });

  it('global admin sees all records including RO/land/source tables, dealer is denied',async()=>{
    const admin=await request('GET','/api/v1/outlets/dealer-master/batch-snapshot');
    expect(admin.status).toBe(200);
    expect(admin.data.success).toBe(true);
    expect(admin.data.data.outlets.length).toBeGreaterThan(0);
    expect(admin.data.data.roDetails).toEqual([]);
    expect(admin.data.data.leaseSources).toEqual([]);
    const denied=await request('GET','/api/v1/outlets/dealer-master/batch-snapshot',undefined,dealerCookie);
    expect(denied.status).toBe(403);
  });

  it('fill-only RO/land APIs retain original values and reject changes to nonempty fields',async()=>{
    const id='ro-1001';
    const ro=await request('PATCH',`/api/v1/outlets/${id}/dealer-master-extension/ro`,{
      contactEmail:'ro1@iocl.in',contactPhone:'9876501234',marketClass:'RO B Class Market',
    });
    expect(ro.status).toBe(200);
    const land=await request('PATCH',`/api/v1/outlets/${id}/dealer-master-extension/land`,{
      landStatus:'Leased Land',sourceArea:'1400',sourceAreaUnit:'SQMT',
    });
    expect(land.status).toBe(200);
    const forbiddenOverwrite=await request('PATCH',`/api/v1/outlets/${id}/dealer-master-extension/ro`,{
      contactEmail:'different@iocl.in',
    });
    expect(forbiddenOverwrite.status).toBe(409);
    const db=getDb(localD1);
    const records=await db.select().from(dealerRoMasterDetails).where(eq(dealerRoMasterDetails.outletId,id));
    expect(records[0].contactEmail).toBe('ro1@iocl.in');
    const landRecords=await db.select().from(dealerLandMasterDetails).where(eq(dealerLandMasterDetails.outletId,id));
    expect(landRecords[0].sourceAreaUnit).toBe('SQMT');
  });

  it('registers source lease as evidence but never creates canonical signed lease',async()=>{
    const id='ro-1001';
    const source=await request('POST',`/api/v1/outlets/${id}/dealer-master-extension/lease-sources`,{
      sourceKey:'TEST-RO1001:2025-01-01',orderNumber:'ORD-123',startDate:'2025-01-01',
      endDate:'2045-01-01',rentMonthlySource:'78000',sourceRemarks:'test',
    });
    // Unknown fields must be rejected; no write.
    expect(source.status).toBe(400);
    const valid=await request('POST',`/api/v1/outlets/${id}/dealer-master-extension/lease-sources`,{
      sourceKey:'TEST-RO1001:2025-01-01',orderNumber:'ORD-123',startDate:'2025-01-01',
      endDate:'2045-01-01',rentMonthlySource:'78000',
    });
    expect(valid.status).toBe(201);
    const duplicate=await request('POST',`/api/v1/outlets/${id}/dealer-master-extension/lease-sources`,{
      sourceKey:'TEST-RO1001:2025-01-01',orderNumber:'ORD-123',
    });
    expect(duplicate.status).toBe(409);
    const sources=await getDb(localD1).select().from(dealerLeaseSourceRecords)
      .where(eq(dealerLeaseSourceRecords.outletId,id));
    expect(sources).toHaveLength(1);
    expect(sources[0].linkedAgreementId).toBeNull();
  });

  it('re-upload updates only missing lease-source terms and blocks conflicting updates',async()=>{
    const id='ro-1001';const root=`/api/v1/outlets/${id}/dealer-master-extension/lease-sources`;
    const newSource=await request('POST',root,{sourceKey:'SOURCE-PATCH-001',orderNumber:'ORDER-001',startDate:'2025-11-20'});
    expect(newSource.status).toBe(201);
    const sourceId=newSource.data.data.id;
    const filled=await request('PATCH',root+'/'+sourceId,{endDate:'2045-10-19',rentMonthlySource:'78000'});
    expect(filled.status).toBe(200);
    const retry=await request('PATCH',root+'/'+sourceId,{endDate:'2045-10-19',rentMonthlySource:'78000'});
    expect(retry.status).toBe(200);
    expect(retry.data.data.action).toBe('UNCHANGED');
    const conflict=await request('PATCH',root+'/'+sourceId,{rentMonthlySource:'90000'});
    expect(conflict.status).toBe(409);
    const source=await getDb(localD1).select().from(dealerLeaseSourceRecords).where(eq(dealerLeaseSourceRecords.id,sourceId));
    expect(source).toHaveLength(1);
    expect(source[0].rentMonthlySource).toBe('78000');
  });
  it('records required batch approval and completion in audit history, rejecting unauthorized sign-off',async()=>{
    const invalid=await request('POST','/api/v1/outlets/dealer-master/batches',{
      fileName:'master.xlsx',sha256:'not-a-valid-hash',totalRows:131,protectedCells:214,
      eligibleRows:12,confirmed:true,
    });
    expect(invalid.status).toBe(400);
    const start=await request('POST','/api/v1/outlets/dealer-master/batches',{
      fileName:'master.xlsx',sha256:'a'.repeat(64),
      supplementSha256:'b'.repeat(64),planSha256:'c'.repeat(64),totalRows:131,
      protectedCells:214,eligibleRows:12,confirmed:true,
    });
    expect(start.status).toBe(201);
    const batchId=start.data.data.batchId;
    const startAudit=await getDb(localD1).select().from(auditLogs).where(eq(auditLogs.entityId,batchId));
    const startMetadata=JSON.parse(startAudit[0].newValueJson||'{}');
    expect(startMetadata.supplementSha256).toBe('b'.repeat(64));
    expect(startMetadata.planSha256).toBe('c'.repeat(64));
    const finish=await request('POST',`/api/v1/outlets/dealer-master/batches/${batchId}/complete`,{
      status:'PARTIAL',appliedRows:6,failedRows:1,skippedRows:124,
    });
    expect(finish.status).toBe(200);
    const duplicate=await request('POST',`/api/v1/outlets/dealer-master/batches/${batchId}/complete`,{
      status:'COMPLETE',appliedRows:12,failedRows:0,skippedRows:119,
    });
    expect(duplicate.status).toBe(409);
    const events=await getDb(localD1).select().from(auditLogs).where(eq(auditLogs.entityId,batchId));
    expect(events.map(e=>e.action)).toEqual(expect.arrayContaining([
      'DEALER_MASTER_IMPORT_START','DEALER_MASTER_IMPORT_COMPLETE',
    ]));
  });
});
