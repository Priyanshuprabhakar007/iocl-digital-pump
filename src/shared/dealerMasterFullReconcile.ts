import type {DealerMasterRow} from './dealerMasterImport';
import {classifyDealerSite} from './dealerMasterImport';
import {dealerMasterFieldCatalog,normalizedDealerHeader} from './dealerMasterFieldCoverage';
import type {RetailOutlet} from './types';

export type FullImportRowStatus='NEW_CANDIDATE'|'EXISTING_MATCH'|'DUPLICATE_REVIEW'|'ARCHIVED_REVIEW'|'INVALID_RO_REVIEW';
export type FullImportFieldStatus=
  'BLANK_SOURCE'|'NEW_RO_SOURCE'|'UNCHANGED'|'UPDATE_PROPOSED'|'REVIEW'|'SAVED_FIELD_NOT_VERIFIED';

export type FullImportRow={
  excelRow:number;roCode:string;excelOutletName:string;status:FullImportRowStatus;
  existingId:string;existingOutletName:string;updatedFields:string[];
  issues:string[];city:string;pincode:string;
};
export type FullImportField={
  excelRow:number;roCode:string;sourceHeader:string;destination:string;targetField:string;
  sourceValue:string;storedValue:string;status:FullImportFieldStatus;
  wasYellow:string;note:string;
};
export type FullExcelReconciliation={
  rows:FullImportRow[];fields:FullImportField[];
  newCandidates:number;matched:number;proposedUpdates:number;
  duplicateRows:number;archivedRows:number;missingCityPin:number;
  unmatchedCodes:string[];allBusinessColumns:number;
};
const standard=(v:unknown)=>String(v??'').trim().replace(/\s+/g,' ').toUpperCase();
const read=(row:DealerMasterRow,header:string):string=>{
  const key=normalizedDealerHeader(header);
  const value=Object.entries(row.sourceDetails)
    .find(([name])=>normalizedDealerHeader(name)===key)?.[1];
  return String(value??'').trim();
};
const knownFields:Record<string,'name'|'address'|'district'|'roCode'>={
  [normalizedDealerHeader('CUSTOMER  NAME (NAME OF  RO)')]:'name',
  [normalizedDealerHeader('ADDRESS')]:'address',
  [normalizedDealerHeader('DISTRICT')]:'district',
  [normalizedDealerHeader('CUSTCODE')]:'roCode',
};

/**
 * 26-field reconciliation based on authenticated RO-directory data only.
 * Yellow is *informational*, never an import exclusion. Unsupported module
 * values are NOT claimed as absent in the database. This function never writes.
 */
export function reconcileFullDealerExcel(
  sourceRows:DealerMasterRow[],
  existingOutlets:RetailOutlet[],
  yellowByRow:Record<number,string[]>={},
):FullExcelReconciliation {
  const current=new Map(existingOutlets.map(outlet=>[standard(outlet.roCode),outlet]));
  const counts=new Map<string,number>();
  sourceRows.forEach(row=>{
    const k=standard(row.roCode);counts.set(k,(counts.get(k)||0)+1);
  });
  const rows:FullImportRow[]=[];
  const fields:FullImportField[]=[];
  for(const row of sourceRows){
    const key=standard(row.roCode);
    const existing=current.get(key);
    const duplicates=(counts.get(key)||0)>1;
    const invalid=!/^\d{4,12}$/.test(key);
    const archived=Boolean(existing?.lifecycleStatus==='ARCHIVED'||existing?.isArchived||existing?.directoryHidden);
    const issues:string[]=[];
    if(duplicates)issues.push('Duplicate RO Code within uploaded Excel');
    if(invalid)issues.push('RO Code is missing or invalid');
    if(archived)issues.push('Existing RO is archived/hidden — do not update automatically');
    if(!existing&&(!row.city||!/^\d{6}$/.test(row.pincode)))
      issues.push('New RO needs verified City and six-digit PIN');
    if(!existing)issues.push('New RO also needs verified hierarchy and site classification');
    const site=classifyDealerSite(row.siteDescription);
    if(!site)issues.push('Site classification requires manual mapping');
    if(existing&&site&&site!==existing.outletType)
      issues.push('Site type differs from saved RO');
    const status:FullImportRowStatus=duplicates?'DUPLICATE_REVIEW':
      invalid?'INVALID_RO_REVIEW':archived?'ARCHIVED_REVIEW':
      existing?'EXISTING_MATCH':'NEW_CANDIDATE';
    const updatedFields:string[]=[];
    const yellows=new Set((yellowByRow[row.sourceRow]||[]).map(normalizedDealerHeader));
    for(const definition of dealerMasterFieldCatalog){
      const header=normalizedDealerHeader(definition.header);
      const value=read(row,definition.header);
      let storedValue='',note='',fieldStatus:FullImportFieldStatus='SAVED_FIELD_NOT_VERIFIED';
      if(!value){
        fieldStatus='BLANK_SOURCE';note='Blank Excel cells never clear existing values';
      }else if(duplicates||invalid||archived){
        fieldStatus='REVIEW';note='RO Code or lifecycle status requires manual resolution';
      }else if(!existing){
        fieldStatus='NEW_RO_SOURCE';note='Source for a proposed new RO — not yet imported';
      }else if(knownFields[header]){
        const field=knownFields[header];
        storedValue=String(existing[field]??'');
        if(standard(value)===standard(storedValue)){
          fieldStatus='UNCHANGED';note='Matching saved RO Master value';
        }else{
          fieldStatus='UPDATE_PROPOSED';
          note='Old vs new difference; manual approval needed; no automatic overwrite';
          updatedFields.push(definition.header);
        }
      }else if(header===normalizedDealerHeader('PRICE GROUP DESCRIPTION(SITE)')&&site){
        storedValue=String(existing.outletType||'');
        fieldStatus=site===existing.outletType?'UNCHANGED':'REVIEW';
        note='Site category mapping, not a direct comparison of original source label';
      }else{
        fieldStatus='SAVED_FIELD_NOT_VERIFIED';
        note='Stored value not available from RO directory; requires module-specific database snapshot';
      }
      fields.push({
        excelRow:row.sourceRow,roCode:row.roCode,sourceHeader:definition.header,
        destination:definition.destination,targetField:definition.target,
        sourceValue:value,storedValue,status:fieldStatus,
        wasYellow:yellows.has(header)?'YES':'NO',note,
      });
    }
    rows.push({
      excelRow:row.sourceRow,roCode:row.roCode,excelOutletName:row.name,
      status,existingId:existing?.id||'',existingOutletName:existing?.name||'',
      updatedFields,issues,city:row.city,pincode:row.pincode,
    });
  }
  return {
    rows,fields,
    newCandidates:rows.filter(r=>r.status==='NEW_CANDIDATE').length,
    matched:rows.filter(r=>r.status==='EXISTING_MATCH').length,
    proposedUpdates:rows.filter(r=>r.status==='EXISTING_MATCH'&&r.updatedFields.length>0).length,
    duplicateRows:rows.filter(r=>r.status==='DUPLICATE_REVIEW').length,
    archivedRows:rows.filter(r=>r.status==='ARCHIVED_REVIEW').length,
    missingCityPin:rows.filter(r=>r.status==='NEW_CANDIDATE'&&r.issues.some(x=>x.includes('City'))).length,
    unmatchedCodes:rows.filter(r=>r.status==='NEW_CANDIDATE').map(r=>r.roCode),
    allBusinessColumns:dealerMasterFieldCatalog.length,
  };
}
