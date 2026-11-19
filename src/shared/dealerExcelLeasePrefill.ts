import type {DealerDraftRow} from './dealerMasterDraft';
import type {LeaseTerms} from './leaseTerms';

/** The Excel workbook is SOURCE EVIDENCE, never an executed legal agreement.
 * Prefill a review form only; do not infer a counterparty, sign-off, or ledger entry.
 */
export function dealerLeaseFormSuggestions(row:DealerDraftRow){
  const f=row.fields;
  const date=(value:string)=>{
    const raw=value.trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return '';
    const d=new Date(raw+'T00:00:00Z');
    return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===raw?raw:'';
  };
  const rent=(value:string)=>{
    const candidate=value.trim().replace(/^(₹|Rs\.?\s*|INR\s*)/i,'').replace(/,/g,'').trim();
    return /^\d{1,14}(\.\d{1,2})?$/.test(candidate)?candidate:'';
  };
  const desc=(f['PRICE GROUP DESCRIPTION(SITE)']||'').trim().toUpperCase();
  const siteClass=/\bA[\s-]?SITE\b/.test(desc)?'A':/\bB[\s-]?SITE\b/.test(desc)?'B':/\bC[\s-]?SITE\b/.test(desc)?'C':'';
  const area=(f.AREA||'').replace(/,/g,'').trim();
  const unit=(f['measuring unit']||'').trim().toUpperCase();
  const dimensionUnit:LeaseTerms['dimensionUnit']=
    unit==='SQYD'||unit==='SQ YD'||unit==='SQ. YD'?'SQYD':
    unit==='SQFT'||unit==='SQ FT'||unit==='SQ. FT'?'SQFT':null;
  const validArea=dimensionUnit&&/^\d{1,9}(\.\d{1,3})?$/.test(area)&&Number(area)>0?area:'';
  const raw=[
    'ORDER NO.','LAND OWNER','CUST LAND DESC (LAND STATUS)',
    'FROM','TO','RENT (monthly)','GST CHARGES','DURATION (YEARS)',
    'Duration (Months)','ESCALATION','ESCALATION TIME(YR)',
    'AREA','measuring unit','Remarks',
  ].filter(key=>(f[key]||'').trim()).map(key=>key+': '+f[key]);
  return {
    agreementNumber:(f['ORDER NO.']||'').trim(),
    startDate:date(f.FROM||''),
    endDate:date(f.TO||''),
    customerCode:row.roCode,
    siteClass,
    rentMonthly:rent(f['RENT (monthly)']||''),
    dimensionUnit:validArea?dimensionUnit:null,
    area:validArea,
    // Raw source terms are shown for verification. Land owner is never inferred as legal counterparty.
    reviewNotes:raw.join('\n'),
  };
}
