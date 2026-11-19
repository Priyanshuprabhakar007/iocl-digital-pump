import type { RetailOutlet, Division, SalesArea } from './types';

export type DealerMasterRow = {
  roCode: string; name: string; address: string; district: string;
  salesOffice: string; salesArea: string; siteDescription: string;
  city: string; pincode: string; sourceRow: number;
  sourceDetails: Record<string, string>;
};
export type ImportAction = 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'REVIEW';
export type DealerImportMappings = {
  divisionIdsByOffice?: Record<string,string>;
  areaIdsByName?: Record<string,string>;
  outletTypesBySite?: Record<string,'COCO'|'CODO'|'A_SITE'>;
};
export const dealerMappingKey = (value:string) => value.trim().replace(/\s+/g,' ').toUpperCase();
export type ImportPlan = {
  row: DealerMasterRow; action: ImportAction; messages: string[];
  existingId?: string;
  payload?: {
    roCode?: string; name: string; address: string; district: string;
    city: string; pincode: string; outletType: 'COCO' | 'CODO' | 'A_SITE';
    stateId: string; divisionId: string; salesAreaId: string; status?: 'ACTIVE';
  };
  changes: string[];
};

const clean = (v: unknown) => String(v ?? '').trim();
const normalized = (v: string) => v.trim().replace(/\s+/g, ' ').toUpperCase();
const normalizedHeader = (v: string) => normalized(v).replace(/[^A-Z0-9]/g, '');
function readCell(row: Record<string, unknown>, ...names: string[]) {
  const lookup = new Map(Object.entries(row).map(([k, v]) => [normalizedHeader(k), v]));
  for (const name of names) {
    const v = lookup.get(normalizedHeader(name));
    if (v !== undefined && v !== null && clean(v)) return clean(v);
  }
  return '';
}
export function parseDealerMasterRows(rawRows: Record<string, unknown>[]): DealerMasterRow[] {
  return rawRows.filter(row => Object.values(row).some(v => clean(v))).map((r, index) => ({
    roCode: readCell(r, 'CUSTCODE', 'RO Code'),
    name: readCell(r, 'CUSTOMER NAME (NAME OF RO)', 'CUSTOMER  NAME (NAME OF  RO)', 'Outlet Name'),
    address: readCell(r, 'ADDRESS'), district: readCell(r, 'DISTRICT'),
    salesOffice: readCell(r, 'SALESOFFICE', 'SALES OFFICE'),
    salesArea: readCell(r, 'SALES AREA NAME', 'SALES AREA'),
    siteDescription: readCell(r, 'PRICE GROUP DESCRIPTION(SITE)', 'OUTLET TYPE'),
    city: readCell(r, 'CITY'), pincode: readCell(r, 'PINCODE', 'PIN CODE'),
    // SheetJS __rowNum__ is the zero-based physical Excel row; protect the correct cells even if the sheet has blank rows.
    sourceRow: typeof (r as {__rowNum__?:number}).__rowNum__ === 'number'
      ? (r as {__rowNum__?:number}).__rowNum__! + 1 : index + 2,
    sourceDetails: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, clean(v)])),
  }));
}
export function classifyDealerSite(site: string): 'COCO' | 'CODO' | 'A_SITE' | null {
  const n = normalized(site);
  if (n.includes('COCO')) return 'COCO';
  if (n === 'RO A SITE' || n === 'A SITE' || n === 'A-SITE') return 'A_SITE';
  if (n.includes('CODO')) return 'CODO';
  return null; // Never silently map B Site, Sub-leased etc to A_SITE
}
export function buildDealerImportPlan(
  rows: DealerMasterRow[],
  existing: RetailOutlet[],
  divisions: Division[],
  areas: SalesArea[],
  mappings: DealerImportMappings = {},
): ImportPlan[] {
  const byCode = new Map(existing.map(o => [normalized(o.roCode), o]));
  const counts = new Map<string,number>();
  rows.forEach(r=>{const k=normalized(r.roCode);counts.set(k,(counts.get(k)||0)+1);});
  return rows.map(row => {
    const messages: string[] = []; const changes: string[] = [];
    const code = normalized(row.roCode);
    const current = byCode.get(code);
    if (!/^\d{4,12}$/.test(code)) messages.push('Missing or invalid numeric customer/RO code');
    if ((counts.get(code)||0)>1) messages.push('Duplicate RO code within uploaded file');
    if (!row.name || !row.address || !row.district) messages.push('Outlet name, address and district are required');
    const mappedDivisionId=mappings.divisionIdsByOffice?.[dealerMappingKey(row.salesOffice)];
    const matchedDivisions=divisions.filter(d=>mappedDivisionId?d.id===mappedDivisionId:normalized(d.name)===normalized(row.salesOffice));
    const division=matchedDivisions.length===1&&matchedDivisions[0].status!=='INACTIVE'?matchedDivisions[0]:null;
    if(!division)messages.push('Sales Office not matched to an active Division: choose mapping');
    const mappedAreaId=mappings.areaIdsByName?.[dealerMappingKey(row.salesArea)];
    const matchedAreas=areas.filter(a=>(mappedAreaId?a.id===mappedAreaId:normalized(a.name)===normalized(row.salesArea))&&a.divisionId===division?.id);
    const area=matchedAreas.length===1&&matchedAreas[0].status!=='INACTIVE'?matchedAreas[0]:null;
    if(!area)messages.push('Sales Area not matched within selected Division: choose mapping');
    const inferredType=mappings.outletTypesBySite?.[dealerMappingKey(row.siteDescription)]||classifyDealerSite(row.siteDescription);
    if (!inferredType && !current) messages.push('Site classification needs manual review before creating outlet');
    if (current?.lifecycleStatus === 'ARCHIVED' || current?.isArchived || current?.directoryHidden) messages.push('Archived or hidden outlet requires separate review');
    if (!current && (!row.city || !/^\d{6}$/.test(row.pincode))) messages.push('Verified City and six-digit PIN code required for new outlet; supply in Excel');
    // Do not change outlet type on existing records: classification changes need explicit review.
    if (current && inferredType && inferredType !== current.outletType) messages.push('Outlet type differs from existing record; review separately');
    if (messages.length || !division || !area) return {row, action:'REVIEW', messages, changes, existingId:current?.id};
    const payload = {
      roCode:code, name:row.name, address:row.address, district:row.district,
      city:current?.city || row.city, pincode:current?.pincode || row.pincode,
      outletType:current?.outletType || inferredType!, stateId:division.stateId,
      divisionId:division.id, salesAreaId:area.id, status:'ACTIVE' as const,
    };
    if (!current) return {row, action:'CREATE', messages, changes:['New outlet'], payload};
    for (const key of ['name','address','district','stateId','divisionId','salesAreaId'] as const) {
      if (normalized(String(current[key] || '')) !== normalized(String(payload[key] || ''))) changes.push(key);
    }
    // Existing city and pincode are kept intact; blanks never overwrite saved data.
    return {row, action:changes.length ? 'UPDATE':'UNCHANGED', messages, changes, existingId:current.id, payload};
  });
}
