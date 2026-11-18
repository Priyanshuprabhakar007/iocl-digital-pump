import { z } from 'zod';

const measure = z.number().int().positive().max(999999999999).nullable();
export const leaseTermsSchema = z.object({
  dimensionUnit:z.enum(['SQYD','SQFT','FT_LXW']).nullable(),
  areaMilli:measure,
  lengthMilliFt:measure,
  widthMilliFt:measure,
  monthlyLeaseValuePaise:z.number().int().nonnegative().max(9000000000000000).nullable(),
}).superRefine((v,ctx)=>{
  const valid=v.dimensionUnit==='FT_LXW'
    ? v.areaMilli===null&&v.lengthMilliFt!==null&&v.widthMilliFt!==null
    : v.dimensionUnit==='SQYD'||v.dimensionUnit==='SQFT'
      ? v.areaMilli!==null&&v.lengthMilliFt===null&&v.widthMilliFt===null
      : v.areaMilli===null&&v.lengthMilliFt===null&&v.widthMilliFt===null;
  if(!valid)ctx.addIssue({code:'custom',message:'Enter an area or both length and width, using one measurement method.'});
});
export type LeaseTerms = z.infer<typeof leaseTermsSchema>;
export function parseLeaseMeasure(value:string):number {
  if(!/^\d{1,9}(\.\d{1,3})?$/.test(value.trim()))throw Error('Enter a positive dimension with up to 3 decimal places.');
  const [whole,fraction='']=value.trim().split('.');
  const milli=Number(whole)*1000+Number((fraction+'000').slice(0,3));
  if(milli<=0||milli>999999999999)throw Error('Dimension must be greater than zero and within the allowed limit.');
  return milli;
}
export function parseMonthlyLeaseValue(value:string):number {
  if(!/^\d{1,14}(\.\d{1,2})?$/.test(value.trim()))throw Error('Enter a monthly lease value with up to 2 decimal places.');
  const [whole,fraction='']=value.trim().split('.');
  const paise=BigInt(whole)*100n+BigInt((fraction+'00').slice(0,2));
  if(paise>9000000000000000n)throw Error('Lease value exceeds the allowed limit.');
  return Number(paise);
}
export const displayMeasure=(milli:number|null|undefined)=>milli==null?'':String(milli/1000);
export function formatLeaseDimension(terms:LeaseTerms|null|undefined):string {
  if(!terms?.dimensionUnit)return 'Not Recorded';
  if(terms.dimensionUnit==='FT_LXW'){
    if(terms.lengthMilliFt==null||terms.widthMilliFt==null)return 'Not Recorded';
    return displayMeasure(terms.lengthMilliFt)+' ft x '+displayMeasure(terms.widthMilliFt)+' ft';
  }
  return terms.areaMilli==null?'Not Recorded':displayMeasure(terms.areaMilli)+(terms.dimensionUnit==='SQYD'?' sq yd':' sq ft');
}
export const isLeaseAgreement=(type:string)=>type==='LAND_LEASE'||type==='NFR_METADATA';
