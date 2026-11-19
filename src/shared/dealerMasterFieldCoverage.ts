/** The 26 source business columns in the IOCL Dealer Master (S. NO. is a sheet row label).
 * This is an audit/preview catalog, not a license to write into production.
 * Land ownership, lease, and outlet identity must be validated independently.
 */
export type DealerDestination = 'ORGANIZATION' | 'OUTLET' | 'LAND' | 'LEASE';
export type DealerStorageReadiness = 'EXISTING_FIELD' | 'NEW_FIELD_REQUIRED' | 'MIGRATION_0037_REQUIRED';
export type DealerFieldDefinition = {
  header: string;
  destination: DealerDestination;
  target: string;
  readiness: DealerStorageReadiness;
};
export const dealerMasterFieldCatalog: readonly DealerFieldDefinition[] = [
  {header:'SALESOFFICE',destination:'ORGANIZATION',target:'Division/Sales Office',readiness:'EXISTING_FIELD'},
  {header:'SALES AREA NAME',destination:'ORGANIZATION',target:'Sales Area',readiness:'EXISTING_FIELD'},
  {header:'CUSTCODE',destination:'OUTLET',target:'RO Code (unique identity)',readiness:'EXISTING_FIELD'},
  {header:'CUSTOMER  NAME (NAME OF  RO)',destination:'OUTLET',target:'Outlet Name',readiness:'EXISTING_FIELD'},
  {header:'ADDRESS',destination:'OUTLET',target:'Address',readiness:'EXISTING_FIELD'},
  {header:'EMAIL',destination:'OUTLET',target:'Contact Email',readiness:'NEW_FIELD_REQUIRED'},
  {header:'CONTACT NO',destination:'OUTLET',target:'Contact Phone',readiness:'NEW_FIELD_REQUIRED'},
  {header:'DISTRICT',destination:'OUTLET',target:'District',readiness:'EXISTING_FIELD'},
  {header:'CUSTOMER GROUP',destination:'OUTLET',target:'Customer Group',readiness:'NEW_FIELD_REQUIRED'},
  {header:'PRICE GROUP DESCRIPTION(SITE)',destination:'OUTLET',target:'Original Site Description / classified Outlet Type',readiness:'NEW_FIELD_REQUIRED'},
  {header:'RO MARKET DESC(CLASS OF MKT)',destination:'OUTLET',target:'Market Class',readiness:'NEW_FIELD_REQUIRED'},
  {header:'CUST LAND DESC (LAND STATUS)',destination:'LAND',target:'Land Status',readiness:'NEW_FIELD_REQUIRED'},
  {header:'COMMISSION DATE',destination:'OUTLET',target:'Commissioning Date',readiness:'NEW_FIELD_REQUIRED'},
  {header:'LAND OWNER',destination:'LAND',target:'Verified Land Owner',readiness:'NEW_FIELD_REQUIRED'},
  {header:'ORDER NO.',destination:'LEASE',target:'Original Order Reference',readiness:'NEW_FIELD_REQUIRED'},
  {header:'FROM',destination:'LEASE',target:'Agreement Start Date',readiness:'EXISTING_FIELD'},
  {header:'TO',destination:'LEASE',target:'Agreement End Date',readiness:'EXISTING_FIELD'},
  {header:'RENT (monthly)',destination:'LEASE',target:'Monthly Lease Value',readiness:'MIGRATION_0037_REQUIRED'},
  {header:'GST CHARGES',destination:'LEASE',target:'GST Terms / Charges',readiness:'NEW_FIELD_REQUIRED'},
  {header:'DURATION (YEARS)',destination:'LEASE',target:'Duration in Years',readiness:'NEW_FIELD_REQUIRED'},
  {header:'Duration (Months)',destination:'LEASE',target:'Duration in Months',readiness:'NEW_FIELD_REQUIRED'},
  {header:'ESCALATION',destination:'LEASE',target:'Escalation Terms (raw source)',readiness:'NEW_FIELD_REQUIRED'},
  {header:'ESCALATION TIME(YR)',destination:'LEASE',target:'Escalation Interval (Years)',readiness:'NEW_FIELD_REQUIRED'},
  {header:'AREA',destination:'LAND',target:'Verified Land Area',readiness:'MIGRATION_0037_REQUIRED'},
  {header:'measuring unit',destination:'LAND',target:'Source Area Unit (ACR/SQMT/SQMTR etc.)',readiness:'NEW_FIELD_REQUIRED'},
  {header:'Remarks',destination:'LEASE',target:'Source Remarks (needs destination review)',readiness:'NEW_FIELD_REQUIRED'},
] as const;

export const normalizedDealerHeader = (value:string) =>
  value.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');

type ExcelSheet = Record<string,unknown>;
type ExcelStyle = {fillId?:number};
type ExcelFill = {patternType?:string;fgColor?:{rgb?:string}};
type ExcelWorkbook = {Styles?:{CellXf?:ExcelStyle[];Fills?:ExcelFill[]}};

/** Read protected yellow cells from XLSX style IDs. If the XLSX parser does not expose
 * styles, fail closed. No "no highlighted cells" assumption is permitted.
 */
export function readYellowCellProtection(
  workbook: ExcelWorkbook,
  sheet: ExcelSheet,
  headers: string[],
  dataRowCount: number,
): {verified:boolean; protectedBySourceRow:Record<number,string[]>; reason?:string} {
  const cellStyles=workbook.Styles?.CellXf;
  const fills=workbook.Styles?.Fills;
  if(!Array.isArray(cellStyles)||!Array.isArray(fills))return {
    verified:false,protectedBySourceRow:{},reason:'Excel style tables are unavailable. Cannot verify yellow cell protection.'
  };
  const yellowStyleIds=new Set<number>();
  for(let styleIndex=0;styleIndex<cellStyles.length;styleIndex++){
    const fill=fills[cellStyles[styleIndex]?.fillId??-1];
    const rgb=(fill?.fgColor?.rgb||'').toUpperCase().replace(/^#/,'');
    if(fill?.patternType==='solid'&&['FFFFFF00','FFFFEB9C','FFFFFFCC','FFFF00'].includes(rgb))yellowStyleIds.add(styleIndex);
  }
  const protectedBySourceRow:Record<number,string[]>={};
  for(let rowIndex=0;rowIndex<dataRowCount;rowIndex++){
    const sourceRow=rowIndex+2;
    for(let columnIndex=0;columnIndex<headers.length;columnIndex++){
      let n=columnIndex+1,letter='';
      while(n){n--;letter=String.fromCharCode(65+n%26)+letter;n=Math.floor(n/26);}
      const cell=sheet[letter+sourceRow] as {s?:number}|undefined;
      if(cell&&typeof cell.s==='number'&&yellowStyleIds.has(cell.s)){
        (protectedBySourceRow[sourceRow]??=[]).push(normalizedDealerHeader(headers[columnIndex]||''));
      }
    }
  }
  return {verified:true,protectedBySourceRow};
}

export type DealerFieldCoverage = DealerFieldDefinition & {
  protectedCount:number; remainingCount:number; blankCount:number;
};
export function summarizeDealerFieldCoverage(
  rows:Record<string,unknown>[],
  protectedBySourceRow:Record<number,string[]>,
): DealerFieldCoverage[] {
  return dealerMasterFieldCatalog.map(field=>{
    const header=normalizedDealerHeader(field.header);
    let protectedCount=0,remainingCount=0,blankCount=0;
    rows.forEach((row,index)=>{
      const value=Object.entries(row).find(([name])=>normalizedDealerHeader(name)===header)?.[1];
      const populated=value!==undefined&&value!==null&&String(value).trim()!=='';
      if(!populated){blankCount++;return;}
      if((protectedBySourceRow[index+2]||[]).includes(header))protectedCount++;
      else remainingCount++;
    });
    return {...field,protectedCount,remainingCount,blankCount};
  });
}
