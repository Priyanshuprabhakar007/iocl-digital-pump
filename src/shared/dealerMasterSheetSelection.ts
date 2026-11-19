import * as XLSX from 'xlsx';
import {dealerMasterFieldCatalog,normalizedDealerHeader} from './dealerMasterFieldCoverage';

export type SelectedDealerSheet={
  name:string;
  sheetIndex:number;
  headerRowNumber:number; // Excel one-based physical row number
  sheet:XLSX.WorkSheet;
  headers:string[];
  raw:Record<string,unknown>[];
  fullMaster:boolean;
};

const codeNames=new Set(['CUSTCODE','ROCODE']);
const nameNames=new Set([
  'CUSTOMERNAMENAMEOFRO','OUTLETNAME','RONAME'
]);
const expected=new Set(dealerMasterFieldCatalog.map(f=>normalizedDealerHeader(f.header)));

/**
 * Finds the real dealer master worksheet even when an exported review workbook
 * starts with "Import Readiness" or there are title rows above the headers.
 * Never treats a summary/mapping sheet as an outlet data sheet.
 */
export function selectDealerMasterDataSheet(workbook:XLSX.WorkBook):SelectedDealerSheet {
  let best:(SelectedDealerSheet&{score:number})|null=null;
  const worksheets=workbook.SheetNames||[];
  for(let sheetIndex=0;sheetIndex<worksheets.length;sheetIndex++){
    const name=worksheets[sheetIndex];
    const sheet=workbook.Sheets[name];
    if(!sheet||!sheet['!ref'])continue;
    const rows=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:'',raw:false})
      .slice(0,15);
    for(let headerIndex=0;headerIndex<rows.length;headerIndex++){
      const headers=(Array.isArray(rows[headerIndex])?rows[headerIndex]:[]).map(v=>String(v??'').trim());
      const normalized=new Set(headers.map(normalizedDealerHeader));
      const code=[...codeNames].some(v=>normalized.has(v));
      const customer=[...nameNames].some(v=>normalized.has(v));
      const recognized=[...expected].filter(v=>normalized.has(v)).length;
      // Require enough actual dealer fields to reject "RO Code Reconciliation" summaries.
      if(!code||!customer||recognized<6)continue;
      const raw=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{
        range:headerIndex,defval:'',raw:false,
      }).filter(r=>Object.values(r).some(v=>String(v??'').trim()));
      if(!raw.length)continue;
      const fullMaster=recognized===expected.size;
      const score=recognized*100+(raw.length>0?10:0)+(fullMaster?1000:0)-headerIndex;
      if(!best||score>best.score)best={
        name,sheetIndex,headerRowNumber:headerIndex+1,
        sheet,headers,raw,fullMaster,score
      };
    }
  }
  if(!best){
    const listed=worksheets.slice(0,6).join(', ')||'no worksheets';
    throw Error(
      'No dealer-master data sheet found. Searched: '+listed+
      '. Upload "IOCL Dealer Master RO A Site.xlsx" or a workbook with CUSTCODE, '+
      'CUSTOMER NAME and the dealer-master columns.'
    );
  }
  return best;
}
