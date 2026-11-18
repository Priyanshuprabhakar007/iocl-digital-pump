import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../../db/schema';
import { cocoAgreementDetails,cocoAgreementLeaseTerms } from '../../db/schema';

export async function getCocoLeaseTerms(db:DrizzleD1Database<typeof schema>,outletId:string){
  try {
    const rows=await db.select({terms:cocoAgreementLeaseTerms}).from(cocoAgreementLeaseTerms)
      .innerJoin(cocoAgreementDetails,eq(cocoAgreementLeaseTerms.agreementId,cocoAgreementDetails.id))
      .where(eq(cocoAgreementDetails.outletId,outletId)).all();
    return {available:true,byId:new Map(rows.map(r=>[r.terms.agreementId,r.terms]))};
  }catch(err){
    const cause=err instanceof Error&&'cause' in err?String(err.cause):'';
    if(/no such table:\s*(?:main\.)?coco_agreement_lease_terms\b/i.test(String(err)+' '+cause)){
      return {available:false,byId:new Map<string,typeof cocoAgreementLeaseTerms.$inferSelect>()};
    }
    throw err;
  }
}
