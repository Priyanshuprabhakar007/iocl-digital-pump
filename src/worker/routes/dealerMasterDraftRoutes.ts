import {Hono} from 'hono';
import {and,desc,eq} from 'drizzle-orm';
import {getDb} from '../../db';
import {auditLogs,dealerMasterDraftUploads,retailOutlets} from '../../db/schema';
import {requireAuth,type AppContext,type EnvBindings} from '../middleware/auth';
import {requirePermission} from '../middleware/permission';
import {PERMISSIONS} from '../../shared/constants';
import {dealerDraftSaveSchema,normalizeDealerDraft,serializeDealerDraft,type DealerDraftContents} from '../../shared/dealerMasterDraft';

export const dealerMasterDraftRoutes=new Hono<{Bindings:EnvBindings}>();
dealerMasterDraftRoutes.use('*',requireAuth as any);
const readPermission=requirePermission(PERMISSIONS.OUTLETS_READ) as any;
const writePermission=requirePermission(PERMISSIONS.OUTLETS_UPDATE) as any;
const success=(c:AppContext,data:unknown,code=200)=>c.json({success:true,data,error:null},code as any);
const fail=(c:AppContext,code:string,message:string,status=400)=>
  c.json({success:false,data:null,error:{code,message}},status as any);
const globalAdmin=(c:AppContext)=>c.var.user.isGlobalScope&&c.var.user.roles.includes('ADMIN');
const needsMigration=(e:unknown)=>/no such table:?\s*dealer_master_draft_uploads/i.test(String(e)+' '+(e instanceof Error&&'cause' in e?String((e as Error&{cause?:unknown}).cause):''));

async function schemaAvailable(c:AppContext){
  const rows=await c.env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='dealer_master_draft_uploads' LIMIT 1"
  ).all<{name:string}>();
  return rows.results.length===1;
}
async function saveCountSnapshot(c:AppContext,codes:string[]){
  // RO Code comparison at the moment of saving; no writes to retail_outlets.
  const existing=new Set<string>();
  for(let i=0;i<codes.length;i+=50){
    const block=codes.slice(i,i+50);
    const binds=block.map(()=>'?').join(',');
    const found=await c.env.DB.prepare(
      'SELECT ro_code FROM retail_outlets WHERE ro_code IN ('+binds+')'
    ).bind(...block).all<{ro_code:string}>();
    found.results.forEach(r=>existing.add(r.ro_code.trim()));
  }
  return {matchedExisting:codes.filter(code=>existing.has(code)).length,
    newRoCandidates:codes.filter(code=>!existing.has(code)).length};
}

dealerMasterDraftRoutes.get('/dealer-master/drafts/status',readPermission,async(c:AppContext)=>{
  if(!globalAdmin(c))return fail(c,'GLOBAL_ADMIN_REQUIRED','Only global admins can access Excel draft storage.',403);
  try{
    const ready=await schemaAvailable(c);
    return success(c,{storageReady:ready,canSaveDraft:ready,
      message:ready?'Draft storage ready. Saving never updates live RO or lease records.':
        'Draft storage migration 0039 has not been verified on the Worker D1. Save Draft is unavailable.'});
  }catch{
    return fail(c,'DRAFT_STATUS_UNAVAILABLE','Could not verify the draft database storage.',503);
  }
});

dealerMasterDraftRoutes.get('/dealer-master/drafts',readPermission,async(c:AppContext)=>{
  if(!globalAdmin(c))return fail(c,'GLOBAL_ADMIN_REQUIRED','Only global admins can view drafts.',403);
  try{
    const db=getDb(c.env.DB);
    const rec=await db.select({
      id:dealerMasterDraftUploads.id,fileName:dealerMasterDraftUploads.sourceFileName,
      fileSha256:dealerMasterDraftUploads.sourceFileSha256,
      sourceSheetName:dealerMasterDraftUploads.sourceSheetName,
      rowCount:dealerMasterDraftUploads.sourceRowCount,
      status:dealerMasterDraftUploads.status,createdAt:dealerMasterDraftUploads.createdAt,
    }).from(dealerMasterDraftUploads)
      .where(eq(dealerMasterDraftUploads.createdBy,c.var.user.user.id))
      .orderBy(desc(dealerMasterDraftUploads.createdAt)).limit(25).all();
    return success(c,rec);
  }catch(e){
    if(needsMigration(e))return fail(c,'DRAFT_MIGRATION_REQUIRED','Draft storage migration 0039 is not applied.',503);
    return fail(c,'DRAFT_HISTORY_UNAVAILABLE','Could not load your saved drafts.',500);
  }
});

dealerMasterDraftRoutes.get('/dealer-master/drafts/:draftId',readPermission,async(c:AppContext)=>{
  if(!globalAdmin(c))return fail(c,'GLOBAL_ADMIN_REQUIRED','Only global admins can resume drafts.',403);
  const id=c.req.param('draftId')||'';
  if(!/^[0-9a-f-]{36}$/i.test(id))return fail(c,'INVALID_DRAFT_ID','Invalid draft ID.',400);
  try{
    const db=getDb(c.env.DB);
    const saved=await db.select().from(dealerMasterDraftUploads)
      .where(and(eq(dealerMasterDraftUploads.id,id),
        eq(dealerMasterDraftUploads.createdBy,c.var.user.user.id))).get();
    if(!saved)return fail(c,'DRAFT_NOT_FOUND','Draft not found for this admin account.',404);
    const data=JSON.parse(saved.sourceDataJson) as DealerDraftContents;
    if(data.schemaVersion!==1||data.businessColumns.length!==26||data.rows.length!==saved.sourceRowCount)
      return fail(c,'DRAFT_DATA_INVALID','Saved draft payload did not pass consistency checks.',500);
    return success(c,{draftId:saved.id,status:'DRAFT',fileName:saved.sourceFileName,
      fileSha256:saved.sourceFileSha256,sourceSheetName:saved.sourceSheetName,
      createdAt:saved.createdAt,contents:data});
  }catch(e){
    if(needsMigration(e))return fail(c,'DRAFT_MIGRATION_REQUIRED','Draft storage migration 0039 is not applied.',503);
    return fail(c,'DRAFT_LOAD_UNAVAILABLE','Could not load saved draft.',500);
  }
});

dealerMasterDraftRoutes.post('/dealer-master/drafts',writePermission,async(c:AppContext)=>{
  if(!globalAdmin(c))return fail(c,'GLOBAL_ADMIN_REQUIRED','Only global admins can save drafts.',403);
  if(!(await schemaAvailable(c).catch(()=>false)))
    return fail(c,'DRAFT_MIGRATION_REQUIRED','Draft storage migration 0039 must be verified first.',503);
  const raw=await c.req.json().catch(()=>null);
  const parsed=dealerDraftSaveSchema.safeParse(raw);
  if(!parsed.success)return fail(c,'VALIDATION_ERROR',parsed.error.issues[0]?.message||'Invalid Excel draft payload.',400);
  let json='',contents:DealerDraftContents;
  try{
    contents=normalizeDealerDraft(parsed.data);
    json=serializeDealerDraft(contents);
  }catch(e){
    return fail(c,'DRAFT_INVALID',e instanceof Error?e.message:'Invalid source workbook',400);
  }
  const hashBytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(json));
  const contentSha256=Array.from(new Uint8Array(hashBytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
  const db=getDb(c.env.DB),userId=c.var.user.user.id;
  try{
    const previous=await db.select({id:dealerMasterDraftUploads.id,sourceRowCount:dealerMasterDraftUploads.sourceRowCount})
      .from(dealerMasterDraftUploads).where(and(
        eq(dealerMasterDraftUploads.createdBy,userId),
        eq(dealerMasterDraftUploads.contentSha256,contentSha256),
      )).get();
    const match=await saveCountSnapshot(c,contents.rows.map(r=>r.roCode));
    if(previous)return success(c,{draftId:previous.id,action:'ALREADY_SAVED',status:'DRAFT',
      rowCount:previous.sourceRowCount,...match});
    const now=new Date().toISOString(),id=crypto.randomUUID();
    await db.batch([
      db.insert(dealerMasterDraftUploads).values({
        id,createdBy:userId,sourceFileName:parsed.data.sourceFileName,
        sourceFileSha256:parsed.data.sourceFileSha256,
        sourceSheetName:parsed.data.sourceSheetName,contentSha256,
        sourceRowCount:contents.rows.length,businessFieldCount:26,
        status:'DRAFT',sourceDataJson:json,createdAt:now,
      }),
      db.insert(auditLogs).values({
        id:crypto.randomUUID(),userId,action:'DEALER_MASTER_DRAFT_SAVED',
        entityType:'DEALER_MASTER_DRAFT',entityId:id,oldValueJson:null,
        newValueJson:JSON.stringify({fileSha256:parsed.data.sourceFileSha256,
          contentSha256,rowCount:contents.rows.length,businessFieldCount:26,...match}),
        ipAddress:c.req.header('cf-connecting-ip')||null,
        userAgent:c.req.header('user-agent')||null,createdAt:now,
      }),
    ]);
    return success(c,{draftId:id,action:'SAVED',status:'DRAFT',
      rowCount:contents.rows.length,...match},201);
  }catch(e){
    // Concurrent duplicate save: fetch the existing immutable version, never overwrite.
    if(/UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(String(e))){
      const previous=await db.select({id:dealerMasterDraftUploads.id,
        sourceRowCount:dealerMasterDraftUploads.sourceRowCount})
        .from(dealerMasterDraftUploads).where(and(
          eq(dealerMasterDraftUploads.createdBy,userId),
          eq(dealerMasterDraftUploads.contentSha256,contentSha256))).get();
      if(previous){
        const match=await saveCountSnapshot(c,contents.rows.map(r=>r.roCode));
        return success(c,{draftId:previous.id,action:'ALREADY_SAVED',status:'DRAFT',
          rowCount:previous.sourceRowCount,...match});
      }
    }
    if(needsMigration(e))return fail(c,'DRAFT_MIGRATION_REQUIRED','Draft storage migration 0039 is not applied.',503);
    console.error('[DEALER_DRAFT_WRITE_FAILED]',e instanceof Error?e.name:'Unknown');
    return fail(c,'DRAFT_SAVE_FAILED','Draft could not be committed. No operational records were changed.',500);
  }
});
