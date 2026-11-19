import { z } from 'zod';

/** Stage 2: values are explicitly filled into EMPTY fields only. No overwrites, no hidden defaults. */
const optionalText = (max:number) => z.string().trim().min(1).max(max).optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{
  const d=new Date(v+'T00:00:00Z');
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;
},'Invalid calendar date');
export const dealerRoMasterInputSchema = z.object({
  contactEmail: z.string().trim().email().max(254).optional(),
  contactPhone: optionalText(50),
  customerGroup: optionalText(100),
  siteDescription: optionalText(180),
  marketClass: optionalText(180),
  commissionDate: isoDate.optional(),
}).strict();

export const dealerLandMasterInputSchema = z.object({
  landStatus: optionalText(180),
  landOwner: optionalText(180),
  sourceArea: optionalText(80),
  sourceAreaUnit: optionalText(40),
}).strict();

export const dealerLeaseSourceInputSchema = z.object({
  sourceKey: z.string().trim().min(3).max(120),
  orderNumber: optionalText(120),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  rentMonthlySource: optionalText(100),
  gstChargesSource: optionalText(180),
  durationYearsSource: optionalText(40),
  durationMonthsSource: optionalText(40),
  escalationSource: optionalText(180),
  escalationIntervalYearsSource: optionalText(40),
  remarksSource: optionalText(2000),
}).strict().refine(d=>!d.startDate||!d.endDate||d.startDate<=d.endDate,{
  message:'Source lease end date cannot be before start date.',
});

export const dealerLeaseSourcePatchSchema = z.object({
  orderNumber: optionalText(120),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  rentMonthlySource: optionalText(100),
  gstChargesSource: optionalText(180),
  durationYearsSource: optionalText(40),
  durationMonthsSource: optionalText(40),
  escalationSource: optionalText(180),
  escalationIntervalYearsSource: optionalText(40),
  remarksSource: optionalText(2000),
}).strict().refine(d=>!d.startDate||!d.endDate||d.startDate<=d.endDate,{message:'Lease source end date must be after start date.'});

export const dealerAgreementLinkInputSchema = z.object({
  agreementId: z.string().trim().min(3).max(128),
  confirmedSourceAndDocument: z.literal(true),
}).strict();

export type OnlyMissingResult = {
  updates: Record<string,string>;
  conflicts: string[];
  unchanged: string[];
};
/** Never update a nonempty target (including a yellow-sourced value previously entered manually). */
export function fillOnlyMissing(
  stored: Record<string,unknown> | null,
  incoming: Record<string,string|undefined>,
): OnlyMissingResult {
  const updates:Record<string,string>={};
  const conflicts:string[]=[];
  const unchanged:string[]=[];
  for(const [key,value] of Object.entries(incoming)){
    if(value===undefined)continue;
    const source=value.trim();
    if(!source)continue;
    const existing=stored?.[key];
    const current=existing==null?'':String(existing).trim();
    if(!current)updates[key]=source;
    else if(current===source)unchanged.push(key);
    else conflicts.push(key);
  }
  return {updates,conflicts,unchanged};
}
export function matchesVerifiedLeaseSource(
  source:{orderNumber:string|null;startDate:string|null;endDate:string|null},
  agreement:{agreementNumber:string|null;startDate:string|null;endDate:string|null;agreementDocumentId:string|null;agreementType:string},
): {valid:boolean; reason?:string} {
  if(agreement.agreementType!=='LAND_LEASE') return {valid:false,reason:'Only LAND_LEASE agreements can be linked'};
  if(!agreement.agreementDocumentId) return {valid:false,reason:'Signed agreement document must be linked before source linking'};
  if(source.orderNumber&&agreement.agreementNumber&&source.orderNumber.trim()!==agreement.agreementNumber.trim())
    return {valid:false,reason:'Order reference does not match agreement number'};
  if(source.startDate&&agreement.startDate&&source.startDate!==agreement.startDate)
    return {valid:false,reason:'Agreement start date does not match source'};
  if(source.endDate&&agreement.endDate&&source.endDate!==agreement.endDate)
    return {valid:false,reason:'Agreement end date does not match source'};
  const referenceMatch=Boolean(source.orderNumber&&agreement.agreementNumber&&source.orderNumber.trim()===agreement.agreementNumber.trim());
  const datesMatch=Boolean(source.startDate&&agreement.startDate&&source.endDate&&agreement.endDate
    &&source.startDate===agreement.startDate&&source.endDate===agreement.endDate);
  if(!referenceMatch&&!datesMatch)return {valid:false,reason:'A matching order number or full lease period is required for verified linking'};
  return {valid:true};
}
