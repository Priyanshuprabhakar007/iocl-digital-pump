import type {DealerDraftContents,DealerDraftRow} from './dealerMasterDraft';
import {dealerMasterFieldCatalog} from './dealerMasterFieldCoverage';

export type DealerExcelReportSource=Pick<DealerDraftRow,'roCode'|'fields'>;

/**
 * Read-only reporting appendix from a saved, immutable 26-column Excel draft.
 * Never elevate these fields into a signed agreement, legal counterparty,
 * payment ledger, verified land ownership or compliance status.
 */
export function buildDealerExcelSourceTables(
  source:DealerExcelReportSource|null|undefined,
  reportRoCode:string,
){
  if(!source||source.roCode.trim()!==reportRoCode.trim())return [];
  const fields=source.fields;
  const destinations=[
    {kind:'OUTLET',title:'Excel Outlet Details (UNVERIFIED SOURCE)'},
    {kind:'ORGANIZATION',title:'Excel Organizational Details (UNVERIFIED SOURCE)'},
    {kind:'LAND',title:'Excel Land Details (UNVERIFIED SOURCE)'},
    {kind:'LEASE',title:'Excel Lease Terms (UNVERIFIED SOURCE)'},
  ] as const;
  return destinations.map(group=>({
    title:group.title,
    source:'Immutable 26-field Excel draft - NOT a signed agreement',
    headers:['Excel Source Field','Value from Excel'],
    widths:[200,309],
    rows:dealerMasterFieldCatalog.filter(f=>f.destination===group.kind).map(f=>[
      f.header,
      fields[f.header]?.trim()||'Blank in original Excel',
    ]),
  }));
}

/** Safely locate the single requested RO in the administrator's own saved
 * 0039 drafts; never use name similarity or another outlet's source values.
 */
export function findDealerExcelReportSource(
  sourceDataJsons:readonly string[],
  reportRoCode:string,
):DealerExcelReportSource|null{
  const code=reportRoCode.trim();
  if(!/^\d{4,12}$/.test(code))return null;
  for(const json of sourceDataJsons){
    let obj:DealerDraftContents;
    try{obj=JSON.parse(json) as DealerDraftContents;}catch{continue;}
    if(obj?.schemaVersion!==1||
      !Array.isArray(obj.businessColumns)||obj.businessColumns.length!==26||
      !Array.isArray(obj.rows))continue;
    const candidate=obj.rows.find(r=>r.roCode?.trim()===code);
    if(candidate&&candidate.fields?.CUSTCODE?.trim()===code&&
      dealerMasterFieldCatalog.every(f=>Object.hasOwn(candidate.fields,f.header))){
      return {roCode:code,fields:candidate.fields};
    }
  }
  return null;
}
