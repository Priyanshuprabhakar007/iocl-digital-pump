import {Hono} from 'hono';
import {z} from 'zod';
import {and,desc,eq} from 'drizzle-orm';
import {getDb} from '../../db';
import {retailOutlets,dealerRoMasterDetails,dealerLandMasterDetails,dealerLeaseSourceRecords,cocoAgreementDetails,auditLogs} from '../../db/schema';
import {requireAuth,type AppContext,type EnvBindings} from '../middleware/auth';
import {requirePermission} from '../middleware/permission';
import {PERMISSIONS} from '../../shared/constants';

export const dealerMasterStage4Routes=new Hono<{Bindings:EnvBindings}>();
dealerMasterStage4Routes.use('*',requireAuth as any);
const okay=(c:AppContext,data:unknown,status=200)=>c.json({success:true,data,error:null},status as any);
const fail=(c:AppContext,code:string,message:string,status=400)=>
  c.json({success:false,data:null,error:{code,message}},status as any);
const onlyGlobal=(c:AppContext)=>c.var.user.isGlobalScope;
const isMissingSchema=(error:unknown)=>{
  const text=String(error)+' '+(error instanceof Error&&'cause' in error?String((error as Error&{cause?:unknown}).cause):'');
  return /no such table/i.test(text);
};
const audit=(c:AppContext,action:string,batchId:string,details:Record<string,unknown>)=>({
  id:crypto.randomUUID(),userId:c.var.user.user.id,action,entityType:'DEALER_MASTER_IMPORT_BATCH',
  entityId:batchId,oldValueJson:null,newValueJson:JSON.stringify(details),
  ipAddress:c.req.header('cf-connecting-ip')||null,userAgent:c.req.header('user-agent')||null,
  createdAt:new Date().toISOString(),
});

const permissionReader=requirePermission(PERMISSIONS.OUTLETS_READ) as any;
const permissionDocs=requirePermission(PERMISSIONS.DOCUMENTS_READ) as any;
const permissionWriter=requirePermission(PERMISSIONS.OUTLETS_UPDATE) as any;
const permissionLeaseWrite=requirePermission(PERMISSIONS.DOCUMENTS_WRITE) as any;

dealerMasterStage4Routes.get('/dealer-master/batch-snapshot',
  permissionReader,permissionDocs,async(c:AppContext)=>{
    if(!onlyGlobal(c))return fail(c,'GLOBAL_SCOPE_REQUIRED','Only global administrators may preview all outlet master details.',403);
    const db=getDb(c.env.DB);
    try{
      // Intentional read-only snapshot. Archived and hidden outlets are included
      // so an imported RO Code cannot be created again by accident.
      const [outlets,roDetails,landDetails,leaseSources,agreements]=await Promise.all([
        db.select().from(retailOutlets).all(),
        db.select().from(dealerRoMasterDetails).all(),
        db.select().from(dealerLandMasterDetails).all(),
        db.select().from(dealerLeaseSourceRecords).all(),
        db.select({
          id:cocoAgreementDetails.id,outletId:cocoAgreementDetails.outletId,
          agreementNumber:cocoAgreementDetails.agreementNumber,
          startDate:cocoAgreementDetails.startDate,endDate:cocoAgreementDetails.endDate,
          agreementDocumentId:cocoAgreementDetails.agreementDocumentId,
        }).from(cocoAgreementDetails)
          .where(eq(cocoAgreementDetails.agreementType,'LAND_LEASE')).all(),
      ]);
      return okay(c,{
        outlets,roDetails,landDetails,leaseSources,
        existingLandLeaseAgreements:agreements,
        schemaReady:true,
      });
    }catch(e){
      if(isMissingSchema(e))return fail(c,'SCHEMA_MIGRATION_REQUIRED',
        'Dealer Master migration 0038 or Documentation 0036 is unavailable. No import has been performed.',503);
      console.error('[DEALER_IMPORT_SNAPSHOT_FAILED]',e instanceof Error?e.name:'Unknown');
      return fail(c,'SNAPSHOT_UNAVAILABLE','Could not load the complete verified master snapshot.',500);
    }
  }
);

const startSchema=z.object({
  fileName:z.string().trim().min(1).max(255),
  sha256:z.string().regex(/^[a-f0-9]{64}$/),
  supplementSha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),
  planSha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),
  totalRows:z.number().int().min(1).max(1000),
  protectedCells:z.number().int().min(1).max(100000),
  eligibleRows:z.number().int().min(0).max(1000),
  confirmed:z.literal(true),
}).strict();
const completeSchema=z.object({
  status:z.enum(['COMPLETE','PARTIAL','FAILED']),
  appliedRows:z.number().int().nonnegative().max(1000),
  failedRows:z.number().int().nonnegative().max(1000),
  skippedRows:z.number().int().nonnegative().max(1000),
  message:z.string().max(800).optional(),
}).strict();

/** Batch audit events are persisted in existing audit_logs; no extra migration required. */
dealerMasterStage4Routes.post('/dealer-master/batches',
  permissionWriter,permissionLeaseWrite,async(c:AppContext)=>{
    if(c.env.ENVIRONMENT==='production')return fail(c,'LIVE_READ_ONLY_TRIAL','Batch imports are disabled on production during the live test.',403);
    if(!onlyGlobal(c))return fail(c,'GLOBAL_SCOPE_REQUIRED','Only global administrators may approve master imports.',403);
    const parsed=startSchema.safeParse(await c.req.json().catch(()=>null));
    if(!parsed.success)return fail(c,'VALIDATION_ERROR',parsed.error.issues[0]?.message||'Invalid import approval.',400);
    const db=getDb(c.env.DB);const id=crypto.randomUUID();
    try{
      await db.insert(auditLogs).values(audit(c,'DEALER_MASTER_IMPORT_START',id,parsed.data));
      return okay(c,{batchId:id},201);
    }catch(e){
      console.error('[DEALER_IMPORT_BATCH_START_FAILED]',e instanceof Error?e.name:'Unknown');
      return fail(c,'AUDIT_UNAVAILABLE','Import audit cannot be created; no master records were written.',503);
    }
  }
);
dealerMasterStage4Routes.post('/dealer-master/batches/:batchId/complete',
  permissionWriter,permissionLeaseWrite,async(c:AppContext)=>{
    if(c.env.ENVIRONMENT==='production')return fail(c,'LIVE_READ_ONLY_TRIAL','Batch imports are disabled on production during the live test.',403);
    if(!onlyGlobal(c))return fail(c,'GLOBAL_SCOPE_REQUIRED','Only global administrators may finish master imports.',403);
    const parsed=completeSchema.safeParse(await c.req.json().catch(()=>null));
    const batchId=c.req.param('batchId')||'';
    if(!parsed.success||!/^[\da-f-]{36}$/i.test(batchId))
      return fail(c,'VALIDATION_ERROR','Invalid import completion summary.',400);
    const db=getDb(c.env.DB);
    try{
      const entries=await db.select().from(auditLogs).where(
        and(eq(auditLogs.entityId,batchId),eq(auditLogs.entityType,'DEALER_MASTER_IMPORT_BATCH'))
      ).all();
      if(!entries.some(e=>e.action==='DEALER_MASTER_IMPORT_START'&&e.userId===c.var.user.user.id))
        return fail(c,'BATCH_NOT_FOUND','Import batch was not started by this account.',404);
      if(entries.some(e=>e.action==='DEALER_MASTER_IMPORT_COMPLETE'))
        return fail(c,'BATCH_ALREADY_CLOSED','This import batch was already closed.',409);
      await db.insert(auditLogs).values(audit(c,'DEALER_MASTER_IMPORT_COMPLETE',batchId,parsed.data));
      return okay(c,{batchId,status:parsed.data.status});
    }catch(e){
      console.error('[DEALER_IMPORT_BATCH_COMPLETE_FAILED]',e instanceof Error?e.name:'Unknown');
      return fail(c,'AUDIT_UNAVAILABLE','Import completion audit could not be recorded.',503);
    }
  }
);
dealerMasterStage4Routes.get('/dealer-master/batches',
  permissionReader,permissionDocs,async(c:AppContext)=>{
    if(!onlyGlobal(c))return fail(c,'GLOBAL_SCOPE_REQUIRED','Only global administrators may inspect import history.',403);
    const db=getDb(c.env.DB);
    try{
      const records=await db.select({
        entityId:auditLogs.entityId,action:auditLogs.action,
        createdAt:auditLogs.createdAt,newValueJson:auditLogs.newValueJson,
        userId:auditLogs.userId,
      }).from(auditLogs)
        .where(eq(auditLogs.entityType,'DEALER_MASTER_IMPORT_BATCH'))
        .orderBy(desc(auditLogs.createdAt)).limit(100).all();
      return okay(c,records.map(r=>({
        batchId:r.entityId,action:r.action,createdAt:r.createdAt,userId:r.userId,
        details:r.newValueJson?JSON.parse(r.newValueJson):null,
      })));
    }catch(e){
      console.error('[DEALER_IMPORT_HISTORY_FAILED]',e instanceof Error?e.name:'Unknown');
      return fail(c,'HISTORY_UNAVAILABLE','Import audit history could not be loaded.',500);
    }
  }
);
