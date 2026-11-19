import {Hono} from 'hono';
import {getDb} from '../../db';
import {dealerMasterDraftUploads} from '../../db/schema';
import {and,eq} from 'drizzle-orm';
import {PERMISSIONS} from '../../shared/constants';
import {pendingSetupSaveSchema,type PendingSetupRecord} from '../../shared/dealerMasterPendingSetup';
import type {DealerDraftContents} from '../../shared/dealerMasterDraft';
import {requireAuth,type AppContext,type EnvBindings} from '../middleware/auth';
import {requirePermission} from '../middleware/permission';

export const dealerMasterPendingRoutes=new Hono<{Bindings:EnvBindings}>();
dealerMasterPendingRoutes.use('*',requireAuth as any);
const read=requirePermission(PERMISSIONS.OUTLETS_READ) as any;
const write=requirePermission(PERMISSIONS.OUTLETS_UPDATE) as any;
const permitted=(c:AppContext)=>c.var.user.isGlobalScope&&c.var.user.roles.includes('ADMIN');
const ok=(c:AppContext,data:unknown)=>c.json({success:true,data,error:null});
const fail=(c:AppContext,code:string,message:string,status=400)=>
  c.json({success:false,data:null,error:{code,message}},status as any);
const validId=(s:string)=>/^[0-9a-f-]{36}$/i.test(s);
const validCode=(s:string)=>/^\d{4,12}$/.test(s);

async function ready(c:AppContext){
  const {results}=await c.env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='dealer_master_pending_setups'"
  ).all();
  return results.length===1;
}
async function ownedDraft(c:AppContext,id:string){
  return getDb(c.env.DB).select().from(dealerMasterDraftUploads).where(and(
    eq(dealerMasterDraftUploads.id,id),
    eq(dealerMasterDraftUploads.createdBy,c.var.user.user.id),
  )).get();
}
async function validateHierarchy(c:AppContext,v:{
  stateId:string;divisionId:string;salesAreaId:string;
}){
  if(v.divisionId&&!v.stateId)return 'Select State Office before Division Office';
  if(v.salesAreaId&&!v.divisionId)return 'Select Division Office before Sales Area';
  if(v.stateId){
    const state=await c.env.DB.prepare('SELECT id FROM states WHERE id=? AND status=?')
      .bind(v.stateId,'ACTIVE').first();
    if(!state)return 'Selected State Office is not active or does not exist';
  }
  if(v.divisionId){
    const division=await c.env.DB.prepare('SELECT id FROM divisions WHERE id=? AND state_id=? AND status=?')
      .bind(v.divisionId,v.stateId,'ACTIVE').first();
    if(!division)return 'Division Office does not belong to the selected State Office';
  }
  if(v.salesAreaId){
    const area=await c.env.DB.prepare('SELECT id FROM sales_areas WHERE id=? AND division_id=? AND status=?')
      .bind(v.salesAreaId,v.divisionId,'ACTIVE').first();
    if(!area)return 'Sales Area does not belong to the selected Division Office';
  }
  return null;
}

dealerMasterPendingRoutes.get('/dealer-master/drafts/:draftId/pending-setup',read,async(c:AppContext)=>{
  if(!permitted(c))return fail(c,'GLOBAL_ADMIN_REQUIRED','Only global admins can view pending setup.',403);
  const draftId=c.req.param('draftId')||'';
  if(!validId(draftId))return fail(c,'INVALID_DRAFT_ID','Invalid draft ID.',400);
  try{
    if(!(await ready(c)))return fail(c,'PENDING_STORAGE_NOT_READY','Pending setup storage has not been deployed.',503);
    if(!(await ownedDraft(c,draftId)))return fail(c,'DRAFT_NOT_FOUND','Draft not found for this admin.',404);
    const response=await c.env.DB.prepare(
      'SELECT ro_code,setup_json,revision,updated_at FROM dealer_master_pending_setups WHERE draft_id=? AND created_by=? ORDER BY ro_code'
    ).bind(draftId,c.var.user.user.id).all<{ro_code:string;setup_json:string;revision:number;updated_at:string}>();
    return ok(c,response.results.map(row=>({
      roCode:row.ro_code,values:JSON.parse(row.setup_json),
      revision:row.revision,updatedAt:row.updated_at,
    } satisfies PendingSetupRecord)));
  }catch{
    return fail(c,'PENDING_SETUP_READ_FAILED','Could not load saved pending setup.',503);
  }
});

dealerMasterPendingRoutes.put('/dealer-master/drafts/:draftId/pending-setup/:roCode',write,async(c:AppContext)=>{
  if(!permitted(c))return fail(c,'GLOBAL_ADMIN_REQUIRED','Only global admins can save pending setup.',403);
  const draftId=c.req.param('draftId')||'',roCode=(c.req.param('roCode')||'').trim();
  if(!validId(draftId)||!validCode(roCode))return fail(c,'INVALID_IDENTITY','Invalid saved draft or RO Code.',400);
  const parsed=pendingSetupSaveSchema.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return fail(c,'VALIDATION_ERROR',parsed.error.issues[0]?.message||'Invalid pending setup.',400);
  try{
    if(!(await ready(c)))return fail(c,'PENDING_STORAGE_NOT_READY','Pending setup storage has not been deployed.',503);
    const draft=await ownedDraft(c,draftId);
    if(!draft)return fail(c,'DRAFT_NOT_FOUND','Draft not found for this admin.',404);
    const contents=JSON.parse(draft.sourceDataJson) as DealerDraftContents;
    if(contents.schemaVersion!==1||contents.rows.length!==draft.sourceRowCount||
       !contents.rows.some(row=>row.roCode===roCode))
      return fail(c,'SOURCE_IDENTITY_MISMATCH','RO Code does not belong to this saved source.',400);
    const existingOutlet=await c.env.DB.prepare('SELECT id FROM retail_outlets WHERE ro_code=? LIMIT 1')
      .bind(roCode).first();
    if(existingOutlet)return fail(c,'RO_ALREADY_REGISTERED','This RO Code already exists as an operational outlet.',409);
    const hierarchyError=await validateHierarchy(c,parsed.data.values);
    if(hierarchyError)return fail(c,'INVALID_PENDING_HIERARCHY',hierarchyError,400);
    const previous=await c.env.DB.prepare(
      'SELECT setup_json,revision,updated_at FROM dealer_master_pending_setups WHERE draft_id=? AND ro_code=? AND created_by=?'
    ).bind(draftId,roCode,c.var.user.user.id).first<{
      setup_json:string;revision:number;updated_at:string;
    }>();
    const expected=parsed.data.expectedRevision;
    if((previous?.revision||0)!==expected)
      return fail(c,'PENDING_SETUP_STALE','This record was edited elsewhere. Refresh the draft before saving.',409);
    const serialized=JSON.stringify(parsed.data.values);
    if(previous?.setup_json===serialized)return ok(c,{
      roCode,values:parsed.data.values,revision:previous.revision,updatedAt:previous.updated_at,
    } satisfies PendingSetupRecord);
    const now=new Date().toISOString();
    const result=await c.env.DB.prepare(
      'INSERT INTO dealer_master_pending_setups(draft_id,ro_code,created_by,setup_json,revision,updated_at) '+
      'VALUES(?,?,?,?,1,?) ON CONFLICT(draft_id,ro_code) DO UPDATE SET '+
      'setup_json=excluded.setup_json,revision=dealer_master_pending_setups.revision+1,updated_at=excluded.updated_at '+
      'WHERE dealer_master_pending_setups.revision=? AND dealer_master_pending_setups.created_by=excluded.created_by'
    ).bind(draftId,roCode,c.var.user.user.id,serialized,now,expected).run();
    if(!result.meta?.changes)return fail(c,'PENDING_SETUP_STALE','Record changed during save. Refresh and try again.',409);
    const version=expected+1;
    // Metadata-only audit avoids duplicating customer/lease fields into logs.
    try{
      await c.env.DB.prepare(
        'INSERT INTO audit_logs(id,user_id,action,entity_type,entity_id,old_value_json,new_value_json,ip_address,user_agent,created_at) '+
        'VALUES(?,?,?,?,?,?,?,?,?,?)'
      ).bind(crypto.randomUUID(),c.var.user.user.id,'DEALER_PENDING_SETUP_SAVED',
        'DEALER_MASTER_DRAFT',draftId+':'+roCode,
        JSON.stringify({revision:expected}),
        JSON.stringify({revision:version,roCode,changedFields:Object.keys(parsed.data.values)}),
        c.req.header('cf-connecting-ip')||null,c.req.header('user-agent')||null,now).run();
    }catch{
      console.error('[PENDING_SETUP_AUDIT_FAILED] write succeeded; audit logging requires investigation');
    }
    return ok(c,{roCode,values:parsed.data.values,revision:version,updatedAt:now} satisfies PendingSetupRecord);
  }catch{
    return fail(c,'PENDING_SETUP_SAVE_FAILED','Pending setup could not be saved. Existing outlets and leases were not modified.',503);
  }
});
