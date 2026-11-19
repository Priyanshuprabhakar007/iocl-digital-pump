import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../../db';
import {auditLogs,cocoAgreementDetails,dealerLandMasterDetails,dealerLeaseSourceRecords,dealerRoMasterDetails} from '../../db/schema';
import {requireAuth, type AppContext, type EnvBindings} from '../middleware/auth';
import {requirePermission} from '../middleware/permission';
import {requireOutletAccess} from '../middleware/scope';
import {PERMISSIONS} from '../../shared/constants';
import {
  dealerAgreementLinkInputSchema,dealerLandMasterInputSchema,dealerLeaseSourceInputSchema,
  dealerRoMasterInputSchema,fillOnlyMissing,matchesVerifiedLeaseSource,
} from '../../shared/dealerMasterStorage';

export const dealerMasterRoutes = new Hono<{Bindings:EnvBindings}>();
dealerMasterRoutes.use('*',requireAuth as any);

const ok=(c:AppContext,data:unknown,status=200)=>c.json({success:true,data,error:null},status as any);
const denied=(c:AppContext,code:string,message:string,status=400)=>
  c.json({success:false,data:null,error:{code,message}},status as any);
const globalWrite=(c:AppContext)=>Boolean(c.var.user.isGlobalScope);
const isMissingTable=(error:unknown)=>{
  const e=String(error)+' '+(error instanceof Error && 'cause' in error?String((error as Error & {cause?:unknown}).cause):'');
  return /no such table:|SQLITE_ERROR.*no such table/i.test(e);
};
const safeFailure=(c:AppContext,e:unknown)=>{
  if(isMissingTable(e))return denied(c,'SCHEMA_MIGRATION_REQUIRED','Dealer master storage migration 0038 has not been applied.',503);
  if(/UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(String(e)))
    return denied(c,'DUPLICATE_SOURCE','A duplicate dealer-master source record or agreement link was blocked.',409);
  console.error('[DEALER_MASTER_EXTENSION_WRITE_ERROR]',e instanceof Error?e.name:'Unknown');
  return denied(c,'DEALER_MASTER_WRITE_FAILED','Could not safely save dealer master details.',500);
};
const makeAudit=(c:AppContext,action:string,id:string,oldValue:unknown,newValue:unknown)=>({
  id:crypto.randomUUID(),userId:c.var.user.user.id,action,entityType:'DEALER_MASTER_SOURCE',entityId:id,
  oldValueJson:oldValue?JSON.stringify(oldValue):null,newValueJson:JSON.stringify(newValue),
  ipAddress:c.req.header('cf-connecting-ip')||null,userAgent:c.req.header('user-agent')||null,
  createdAt:new Date().toISOString(),
});

// Read is scoped to the selected outlet and includes the canonical signed agreement list.
dealerMasterRoutes.get('/:id/dealer-master-extension',
  requirePermission(PERMISSIONS.OUTLETS_READ) as any,requireOutletAccess('id') as any,
  async(c:AppContext)=>{
    const id=(c.req.param('id') || '');const db=getDb(c.env.DB);
    try{
      const [ro,land,leaseSources,agreements]=await Promise.all([
        db.select().from(dealerRoMasterDetails).where(eq(dealerRoMasterDetails.outletId,id)).get(),
        db.select().from(dealerLandMasterDetails).where(eq(dealerLandMasterDetails.outletId,id)).get(),
        db.select().from(dealerLeaseSourceRecords).where(eq(dealerLeaseSourceRecords.outletId,id)).orderBy(desc(dealerLeaseSourceRecords.createdAt)).all(),
        db.select({id:cocoAgreementDetails.id,agreementNumber:cocoAgreementDetails.agreementNumber,
          agreementName:cocoAgreementDetails.agreementName,startDate:cocoAgreementDetails.startDate,
          endDate:cocoAgreementDetails.endDate,agreementDocumentId:cocoAgreementDetails.agreementDocumentId})
          .from(cocoAgreementDetails).where(and(eq(cocoAgreementDetails.outletId,id),eq(cocoAgreementDetails.agreementType,'LAND_LEASE'))).all(),
      ]);
      return ok(c,{ro:ro||null,land:land||null,leaseSources,existingLandLeaseAgreements:agreements});
    }catch(e){return safeFailure(c,e);}
  }
);

dealerMasterRoutes.patch('/:id/dealer-master-extension/ro',
  requirePermission(PERMISSIONS.OUTLETS_UPDATE) as any,requireOutletAccess('id') as any,
  async(c:AppContext)=>{
    if(!globalWrite(c))return denied(c,'GLOBAL_ADMIN_REQUIRED','Global administration required for master imports.',403);
    const parsed=dealerRoMasterInputSchema.safeParse(await c.req.json().catch(()=>null));
    if(!parsed.success)return denied(c,'VALIDATION_ERROR',parsed.error.issues[0]?.message||'Invalid dealer RO source.',400);
    const id=(c.req.param('id') || '');const db=getDb(c.env.DB);
    try{
      const existing=await db.select().from(dealerRoMasterDetails).where(eq(dealerRoMasterDetails.outletId,id)).get()||null;
      const candidate=fillOnlyMissing(existing as Record<string,unknown>|null,parsed.data);
      if(candidate.conflicts.length)return denied(c,'EXISTING_VALUES_PROTECTED','Existing fields differ; manual review is required: '+candidate.conflicts.join(', '),409);
      if(!Object.keys(candidate.updates).length)return ok(c,{action:'UNCHANGED',outletId:id});
      const now=new Date().toISOString();const actor=c.var.user.user.id;
      const updated={...candidate.updates,updatedAt:now,updatedBy:actor};
      await db.batch([
        existing?db.update(dealerRoMasterDetails).set(updated).where(eq(dealerRoMasterDetails.outletId,id)):
          db.insert(dealerRoMasterDetails).values({outletId:id,...candidate.updates,createdAt:now,updatedAt:now,updatedBy:actor}),
        db.insert(auditLogs).values(makeAudit(c,'DEALER_RO_FILL_MISSING',id,existing,updated)),
      ]);
      return ok(c,{action:existing?'FILL_MISSING':'CREATE',outletId:id,fields:Object.keys(candidate.updates)});
    }catch(e){return safeFailure(c,e);}
  }
);

dealerMasterRoutes.patch('/:id/dealer-master-extension/land',
  requirePermission(PERMISSIONS.OUTLETS_UPDATE) as any,requireOutletAccess('id') as any,
  async(c:AppContext)=>{
    if(!globalWrite(c))return denied(c,'GLOBAL_ADMIN_REQUIRED','Global administration required for master imports.',403);
    const parsed=dealerLandMasterInputSchema.safeParse(await c.req.json().catch(()=>null));
    if(!parsed.success)return denied(c,'VALIDATION_ERROR',parsed.error.issues[0]?.message||'Invalid dealer land source.',400);
    const id=(c.req.param('id') || '');const db=getDb(c.env.DB);
    try{
      const existing=await db.select().from(dealerLandMasterDetails).where(eq(dealerLandMasterDetails.outletId,id)).get()||null;
      const candidate=fillOnlyMissing(existing as Record<string,unknown>|null,parsed.data);
      if(candidate.conflicts.length)return denied(c,'EXISTING_VALUES_PROTECTED','Existing land values differ: '+candidate.conflicts.join(', '),409);
      if(!Object.keys(candidate.updates).length)return ok(c,{action:'UNCHANGED',outletId:id});
      const now=new Date().toISOString();const actor=c.var.user.user.id;
      const updated={...candidate.updates,updatedAt:now,updatedBy:actor};
      await db.batch([
        existing?db.update(dealerLandMasterDetails).set(updated).where(eq(dealerLandMasterDetails.outletId,id)):
          db.insert(dealerLandMasterDetails).values({outletId:id,...candidate.updates,createdAt:now,updatedAt:now,updatedBy:actor}),
        db.insert(auditLogs).values(makeAudit(c,'DEALER_LAND_FILL_MISSING',id,existing,updated)),
      ]);
      return ok(c,{action:existing?'FILL_MISSING':'CREATE',outletId:id,fields:Object.keys(candidate.updates)});
    }catch(e){return safeFailure(c,e);}
  }
);

// Source candidate entry is separate from legally executed agreements and NFR rent ledger.
// Creating this record does not create a Land Lease, change rent or link a legal counterparty.
dealerMasterRoutes.post('/:id/dealer-master-extension/lease-sources',
  requirePermission(PERMISSIONS.DOCUMENTS_WRITE) as any,requireOutletAccess('id') as any,
  async(c:AppContext)=>{
    if(!globalWrite(c))return denied(c,'GLOBAL_ADMIN_REQUIRED','Global administration required for lease source creation.',403);
    const parsed=dealerLeaseSourceInputSchema.safeParse(await c.req.json().catch(()=>null));
    if(!parsed.success)return denied(c,'VALIDATION_ERROR',parsed.error.issues[0]?.message||'Invalid lease source.',400);
    const id=(c.req.param('id') || '');const db=getDb(c.env.DB);const data=parsed.data;
    try{
      const existing=await db.select().from(dealerLeaseSourceRecords)
        .where(and(eq(dealerLeaseSourceRecords.outletId,id),eq(dealerLeaseSourceRecords.sourceKey,data.sourceKey))).get();
      if(existing)return denied(c,'LEASE_SOURCE_EXISTS','A lease-source candidate with this key already exists. Review it rather than duplicating it.',409);
      const now=new Date().toISOString();const actor=c.var.user.user.id;const recordId=crypto.randomUUID();
      const row={id:recordId,outletId:id,sourceKey:data.sourceKey,
        orderNumber:data.orderNumber||null,startDate:data.startDate||null,endDate:data.endDate||null,
        rentMonthlySource:data.rentMonthlySource||null,gstChargesSource:data.gstChargesSource||null,
        durationYearsSource:data.durationYearsSource||null,durationMonthsSource:data.durationMonthsSource||null,
        escalationSource:data.escalationSource||null,escalationIntervalYearsSource:data.escalationIntervalYearsSource||null,
        remarksSource:data.remarksSource||null,linkedAgreementId:null,createdAt:now,updatedAt:now,createdBy:actor,updatedBy:actor};
      await db.batch([
        db.insert(dealerLeaseSourceRecords).values(row),
        db.insert(auditLogs).values(makeAudit(c,'DEALER_LEASE_SOURCE_REGISTER',recordId,null,row)),
      ]);
      return ok(c,{id:recordId,action:'SOURCE_RECORDED_NOT_SIGNED_AGREEMENT'},201);
    }catch(e){return safeFailure(c,e);}
  }
);

dealerMasterRoutes.post('/:id/dealer-master-extension/lease-sources/:sourceId/link',
  requirePermission(PERMISSIONS.DOCUMENTS_WRITE) as any,requireOutletAccess('id') as any,
  async(c:AppContext)=>{
    if(!globalWrite(c))return denied(c,'GLOBAL_ADMIN_REQUIRED','Global administration required for verified lease linking.',403);
    const parsed=dealerAgreementLinkInputSchema.safeParse(await c.req.json().catch(()=>null));
    if(!parsed.success)return denied(c,'VALIDATION_ERROR','Explicit signed-document verification is required.',400);
    const id=(c.req.param('id') || '');const sourceId=(c.req.param('sourceId') || '');const db=getDb(c.env.DB);
    try{
      const source=await db.select().from(dealerLeaseSourceRecords)
        .where(and(eq(dealerLeaseSourceRecords.id,sourceId),eq(dealerLeaseSourceRecords.outletId,id))).get();
      if(!source)return denied(c,'SOURCE_NOT_FOUND','Lease source not found for selected outlet.',404);
      if(source.linkedAgreementId)return denied(c,'ALREADY_LINKED','Source is already linked. Review before making changes.',409);
      const agreement=await db.select().from(cocoAgreementDetails)
        .where(and(eq(cocoAgreementDetails.id,parsed.data.agreementId),eq(cocoAgreementDetails.outletId,id))).get();
      if(!agreement)return denied(c,'AGREEMENT_NOT_FOUND','Signed agreement is unavailable in selected outlet.',404);
      const check=matchesVerifiedLeaseSource(source,agreement);
      if(!check.valid)return denied(c,'LEASE_MATCH_REQUIRES_REVIEW',check.reason||'Lease matching failed.',409);
      const duplicate=await db.select({id:dealerLeaseSourceRecords.id}).from(dealerLeaseSourceRecords)
        .where(eq(dealerLeaseSourceRecords.linkedAgreementId,agreement.id)).get();
      if(duplicate)return denied(c,'AGREEMENT_ALREADY_LINKED','This agreement has another linked source candidate.',409);
      const now=new Date().toISOString();
      await db.batch([
        db.update(dealerLeaseSourceRecords).set({linkedAgreementId:agreement.id,updatedAt:now,updatedBy:c.var.user.user.id})
          .where(and(eq(dealerLeaseSourceRecords.id,sourceId),eq(dealerLeaseSourceRecords.outletId,id))),
        db.insert(auditLogs).values(makeAudit(c,'DEALER_LEASE_SOURCE_LINK',sourceId,source,{linkedAgreementId:agreement.id})),
      ]);
      return ok(c,{sourceId,linkedAgreementId:agreement.id,action:'LINKED_EXISTING_SIGNED_AGREEMENT'});
    }catch(e){return safeFailure(c,e);}
  }
);
