import type {DealerMasterRow, ImportPlan} from './dealerMasterImport';
import {normalizedDealerHeader} from './dealerMasterFieldCoverage';
import type {RetailOutlet} from './types';

export type Stage4Module='OUTLET'|'RO_DETAILS'|'LAND'|'LEASE_SOURCE';
export type Stage4Status='CREATE'|'FILL_MISSING'|'PROTECTED'|'UNCHANGED'|'CONFLICT'|'REVIEW';
export type Stage4Field={
  row:number;roCode:string;module:Stage4Module;header:string;field:string;
  source:string;stored:string;status:Stage4Status;note:string;
};
export type Stage4Source={
  outletId:string;sourceKey:string;id:string;linkedAgreementId:string|null;
  [key:string]:unknown;
};
export type Stage4Snapshot={
  outlets:RetailOutlet[];
  roDetails:Record<string,unknown>[];
  landDetails:Record<string,unknown>[];
  leaseSources:Stage4Source[];
  existingLandLeaseAgreements:Array<{
    id:string;outletId:string;agreementNumber:string|null;
    startDate:string|null;endDate:string|null;agreementDocumentId:string|null;
  }>;
};
export type Stage4RowPlan={
  sourceRow:number;roCode:string;outletId?:string;
  createOutletPayload?:ImportPlan['payload'];
  fields:Stage4Field[];review:string[];
  roDetailsPayload:Record<string,string>;
  landPayload:Record<string,string>;
  leasePayload:Record<string,string>;
  leaseSourceKey?:string;
  legalAgreementCheck:'NOT_APPLICABLE'|'SIGNED_MATCH_REQUIRES_APPROVAL'|'MISSING_OR_AMBIGUOUS';
};
export type Stage4Plan={
  rows:Stage4RowPlan[];counts:Record<Stage4Status,number>;protectedCount:number;
  eligibleRows:number;blockedRows:number;
};

const normalized=(value:unknown)=>String(value??'').trim();
const comparable=(value:unknown)=>normalized(value).replace(/\s+/g,' ').toUpperCase();
const readSource=(row:DealerMasterRow,header:string)=>{
  const name=normalizedDealerHeader(header);
  return Object.entries(row.sourceDetails).find(([h])=>normalizedDealerHeader(h)===name)?.[1]?.trim()||'';
};
const isProtected=(protectedHeaders:string[]|undefined,header:string)=>
  Boolean(protectedHeaders?.includes(normalizedDealerHeader(header)));

/** Reject ambiguous dates rather than choosing between DD/MM and MM/DD silently. */
export function normalizeSourceDate(raw:string):string|null {
  const text=raw.trim();
  if(!text)return null;
  let year:number,month:number,day:number;
  if(/^\d{4}-\d{2}-\d{2}$/.test(text)){
    [year,month,day]=text.split('-').map(Number);
  }else if(/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(text)){
    [day,month,year]=text.split('.').map(Number);
  }else if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)){
    const [a,b,y]=text.split('/').map(Number);year=y;
    if(a>12&&b<=12){day=a;month=b;}
    else if(b>12&&a<=12){month=a;day=b;}
    else return null;
  }else if(/^\d{5}$/.test(text)){
    const n=Number(text);
    if(n<30000||n>90000)return null;
    const date=new Date(Date.UTC(1899,11,30)+n*86400000);
    return date.toISOString().slice(0,10);
  }else return null;
  const parsed=new Date(Date.UTC(year,month-1,day));
  if(parsed.getUTCFullYear()!==year||parsed.getUTCMonth()!==month-1||parsed.getUTCDate()!==day)return null;
  return parsed.toISOString().slice(0,10);
}
export function getDealerSourceKey(row:DealerMasterRow) {
  const order=readSource(row,'ORDER NO.');
  const from=readSource(row,'FROM'),to=readSource(row,'TO');
  // A unique key per source row/outlet. Retained over re-upload of the same official master.
  const marker=order?('ORDER:'+order):from&&to?('DATES:'+from+':'+to):('ROW:'+row.sourceRow);
  return ('IOCL_DEALER:'+row.roCode+':'+marker).slice(0,120);
}
const roExtended=[
  ['EMAIL','contactEmail'],['CONTACT NO','contactPhone'],['CUSTOMER GROUP','customerGroup'],
  ['PRICE GROUP DESCRIPTION(SITE)','siteDescription'],
  ['RO MARKET DESC(CLASS OF MKT)','marketClass'],['COMMISSION DATE','commissionDate'],
] as const;
const land=[
  ['CUST LAND DESC (LAND STATUS)','landStatus'],['LAND OWNER','landOwner'],
  ['AREA','sourceArea'],['measuring unit','sourceAreaUnit'],
] as const;
const lease=[
  ['ORDER NO.','orderNumber'],['FROM','startDate'],['TO','endDate'],
  ['RENT (monthly)','rentMonthlySource'],['GST CHARGES','gstChargesSource'],
  ['DURATION (YEARS)','durationYearsSource'],['Duration (Months)','durationMonthsSource'],
  ['ESCALATION','escalationSource'],['ESCALATION TIME(YR)','escalationIntervalYearsSource'],
  ['Remarks','remarksSource'],
] as const;

export function buildDealerStage4Plan(
  rows:DealerMasterRow[],
  protectedBySourceRow:Record<number,string[]>,
  outletPlans:ImportPlan[],
  snapshot:Stage4Snapshot,
):Stage4Plan {
  const byRo=new Map(snapshot.outlets.map(o=>[comparable(o.roCode),o]));
  const roDetails=new Map(snapshot.roDetails.map(d=>[normalized(d.outletId),d]));
  const landDetails=new Map(snapshot.landDetails.map(d=>[normalized(d.outletId),d]));
  const sourceByKey=new Map(snapshot.leaseSources.map(l=>[l.outletId+'|'+l.sourceKey,l]));
  const codes=new Map<string,number>();
  rows.forEach(r=>codes.set(r.roCode,(codes.get(r.roCode)||0)+1));
  const plans=rows.map((row,index):Stage4RowPlan=>{
    const outlet=byRo.get(comparable(row.roCode));
    const base=outletPlans[index];
    const protectedHeaders=protectedBySourceRow[row.sourceRow]||[];
    const review:string[]=[];
    const fields:Stage4Field[]=[];
    const roDetailsPayload:Record<string,string>={};
    const landPayload:Record<string,string>={};
    const leasePayload:Record<string,string>={};
    const sourceKey=getDealerSourceKey(row);
    const source=outlet?sourceByKey.get(outlet.id+'|'+sourceKey):undefined;
    const extensionRo=outlet?roDetails.get(outlet.id):undefined;
    const extensionLand=outlet?landDetails.get(outlet.id):undefined;
    if((codes.get(row.roCode)||0)>1)review.push('Duplicate RO code in uploaded file');
    if(!/^\d{4,12}$/.test(row.roCode))review.push('Invalid RO code');
    if(outlet?.lifecycleStatus==='ARCHIVED'||outlet?.isArchived||outlet?.directoryHidden)
      review.push('Archived/hidden outlet requires administrator review');
    const canCreate=!outlet&&base?.action==='CREATE'&&Boolean(base.payload);
    if(!outlet&&!canCreate)review.push('New outlet requires verified hierarchy, site classification, City and PIN before import');
    if(!outlet&&['CUSTCODE','CUSTOMER  NAME (NAME OF  RO)'].some(h=>isProtected(protectedHeaders,h)))
      review.push('Yellow-marked outlet identity is not found in database. Confirm manually entered outlet first.');

    function add(module:Stage4Module,header:string,field:string,existingValue:unknown,sourceValue?:string){
      const raw=sourceValue??readSource(row,header);
      if(!raw)return;
      const protectedCell=isProtected(protectedHeaders,header);
      const isDate=field==='commissionDate'||field==='startDate'||field==='endDate';
      const parsed=isDate?normalizeSourceDate(raw):raw;
      let status:Stage4Status='REVIEW',note='';
      if(protectedCell){
        status='PROTECTED';note='Yellow cell — preserved, never uploaded';
        if(module==='LEASE_SOURCE'&&outlet&&!source)note+='; lease destination needs independent verification';
      }else if(isDate&&!parsed){
        status='REVIEW';note='Unverified or ambiguous source date';
      }else if(module==='RO_DETAILS'&&field==='contactEmail'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed!)){
        status='REVIEW';note='Invalid email';
      }else if(!outlet&&!canCreate){
        status='REVIEW';note='Outlet does not yet have a verified RO master';
      }else if(module==='LEASE_SOURCE'&&!outlet){
        status=canCreate?'CREATE':'REVIEW';
        note=canCreate?'Create source after verified outlet registration':'Verify outlet before lease source';
      }else {
        const target=comparable(existingValue);
        const incoming=comparable(parsed);
        if(target===incoming&&target)status='UNCHANGED';
        else if(target) {status='CONFLICT';note='Existing nonempty value differs — overwrite blocked';}
        else status=module==='LEASE_SOURCE'&&!source?'CREATE':'FILL_MISSING';
      }
      const decision={row:row.sourceRow,roCode:row.roCode,module,header,field,source:raw,
        stored:normalized(existingValue),status,note};
      fields.push(decision);
      if((status==='CREATE'||status==='FILL_MISSING')&&parsed){
        if(module==='RO_DETAILS')roDetailsPayload[field]=parsed;
        else if(module==='LAND')landPayload[field]=parsed;
        else if(module==='LEASE_SOURCE')leasePayload[field]=parsed;
      }
    }
    for(const [header,field] of [
      ['CUSTOMER  NAME (NAME OF  RO)','name'],['ADDRESS','address'],['DISTRICT','district'],
    ] as const){
      add('OUTLET',header,field,outlet?.[field]);
      const item=fields[fields.length-1];
      if(outlet&&item?.module==='OUTLET'&&item?.status==='FILL_MISSING'){
        item.status='REVIEW';item.note='Core outlet changes need separate admin review';
      }
      if(outlet&&item?.module==='OUTLET'&&item?.status==='CONFLICT')review.push('Outlet identity differs in '+header);
    }
    for(const [header,field] of roExtended)add('RO_DETAILS',header,field,extensionRo?.[field]);
    for(const [header,field] of land)add('LAND',header,field,extensionLand?.[field]);
    for(const [header,field] of lease)add('LEASE_SOURCE',header,field,source?.[field]);
    const hasLeaseEvidence=lease.some(([header])=>Boolean(readSource(row,header)));
    let legalAgreementCheck:Stage4RowPlan['legalAgreementCheck']='NOT_APPLICABLE';
    if(hasLeaseEvidence&&outlet){
      const agreements=snapshot.existingLandLeaseAgreements.filter(a=>a.outletId===outlet.id);
      const order=readSource(row,'ORDER NO.');
      const from=normalizeSourceDate(readSource(row,'FROM'));
      const to=normalizeSourceDate(readSource(row,'TO'));
      const matches=agreements.filter(a=>(
        Boolean(order&&a.agreementNumber&&comparable(order)===comparable(a.agreementNumber))||
        Boolean(from&&to&&a.startDate===from&&a.endDate===to)
      ));
      legalAgreementCheck=matches.length===1&&Boolean(matches[0].agreementDocumentId)
        ?'SIGNED_MATCH_REQUIRES_APPROVAL':'MISSING_OR_AMBIGUOUS';
    }
    if(source?.linkedAgreementId&&legalAgreementCheck==='MISSING_OR_AMBIGUOUS')
      review.push('Existing source/lease link cannot be verified against signed agreements');
    return {
      sourceRow:row.sourceRow,roCode:row.roCode,outletId:outlet?.id,
      createOutletPayload:!outlet&&canCreate&&!review.length?base?.payload:undefined,
      fields,review,roDetailsPayload,landPayload,leasePayload,
      leasePayload:leasePayload,leaseSourceKey:hasLeaseEvidence?sourceKey:undefined,
      legalAgreementCheck,
    };
  });
  const counts:Stage4Plan['counts']={CREATE:0,FILL_MISSING:0,PROTECTED:0,UNCHANGED:0,CONFLICT:0,REVIEW:0};
  let blockedRows=0,eligibleRows=0;
  for(const plan of plans){
    for(const f of plan.fields)counts[f.status]++;
    if(plan.review.length)blockedRows++;
    else if(plan.createOutletPayload||Object.keys(plan.roDetailsPayload).length||
      Object.keys(plan.landPayload).length||Object.keys(plan.leasePayload).length)eligibleRows++;
  }
  return {rows:plans,counts,protectedCount:counts.PROTECTED,eligibleRows,blockedRows};
}
