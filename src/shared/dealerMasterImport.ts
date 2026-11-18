import type { RetailOutlet, Division, SalesArea } from '../types';

export type DealerMasterRow = {
  roCode: string; name: string; address: string; district: string;
  salesOffice: string; salesArea: string; siteDescription: string;
  city: string; pincode: string; sourceRow: number;
  sourceDetails: Record<string, string>;
};
export type ImportAction = 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'REVIEW';
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
    sourceRow: index + 2,
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
): ImportPlan[] {
  const byCode = new Map(existing.map(o => [normalized(o.roCode), o]));
  const seen = new Set<string>();
  return rows.map(row => {
    const messages: string[] = []; const changes: string[] = [];
    const code = normalized(row.roCode);
    const current = byCode.get(code);
    if (!/^\d{4,12}$/.test(code)) messages.push('Missing or invalid numeric customer/RO code');
    if (seen.has(code)) messages.push('Duplicate RO code within uploaded file');
    seen.add(code);
    if (!row.name || !row.address || !row.district) messages.push('Outlet name, address and district are required');
    const matchedDivisions = divisions.filter(d => normalized(d.name) === normalized(row.salesOffice));
    const division = matchedDivisions.length === 1 ? matchedDivisions[0] : null;
    if (!division) messages.push('Sales Office does not uniquely match an existing Division');
    const matchedAreas = areas.filter(a => normalized(a.name) === normalized(row.salesArea) && a.divisionId === division?.id);
    const area = matchedAreas.length === 1 ? matchedAreas[0] : null;
    if (!area) messages.push('Sales Area does not uniquely match the selected Division');
    const inferredType = classifyDealerSite(row.siteDescription);
    if (!inferredType && !current) messages.push('Site classification needs manual review before creating outlet');
    if (current?.lifecycleStatus === 'ARCHIVED' || current?.isArchived || current?.directoryHidden) messages.push('Archived or hidden outlet requires separate review');
    if (!current && (!row.city || !row.pincode)) messages.push('City and PIN code missing for new outlet; supply verified values in Excel');
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
