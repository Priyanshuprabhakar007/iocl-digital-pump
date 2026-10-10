import {
  OrgStatus,
  OfficerStatus,
  OfficerPostingScopeLevel,
  ServiceType,
  Department,
  Officer,
  OfficerPosting,
  ServiceProvider,
  OutletServiceProviderAssignment,
  State,
  Division,
  SalesArea,
  RetailOutlet,
  UserContext,
} from '../../../shared/types';
import { PERMISSIONS, PermissionCode } from '../../../shared/constants';

export type OrgWorkspaceTab = 'departments' | 'officers' | 'service-providers' | 'outlet-assignments';

// ---------------------------------------------------------------------------
// 1. Status Labels & Badges
// ---------------------------------------------------------------------------

export function getOrgStatusLabel(status: OrgStatus | string): string {
  switch (status) {
    case 'ACTIVE':
      return 'Active';
    case 'INACTIVE':
      return 'Inactive';
    default:
      return status || 'Unknown';
  }
}

export function getOrgStatusBadgeClass(status: OrgStatus | string): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    case 'INACTIVE':
      return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    default:
      return 'bg-slate-700/20 text-slate-300 border-slate-600/30';
  }
}

export function getOfficerStatusLabel(status: OfficerStatus | string): string {
  switch (status) {
    case 'ACTIVE':
      return 'Active';
    case 'INACTIVE':
      return 'Inactive';
    case 'TRANSFERRED':
      return 'Transferred';
    case 'RETIRED':
      return 'Retired';
    default:
      return status || 'Unknown';
  }
}

export function getOfficerStatusBadgeClass(status: OfficerStatus | string): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    case 'INACTIVE':
      return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    case 'TRANSFERRED':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    case 'RETIRED':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    default:
      return 'bg-slate-700/20 text-slate-300 border-slate-600/30';
  }
}

export function getScopeLevelLabel(scopeLevel: OfficerPostingScopeLevel | string): string {
  switch (scopeLevel) {
    case 'GLOBAL':
      return 'Global / Head Office';
    case 'STATE':
      return 'State Office';
    case 'DIVISION':
      return 'Divisional Office';
    case 'SALES_AREA':
      return 'Sales Area';
    case 'OUTLET':
      return 'Retail Outlet';
    default:
      return scopeLevel || 'Unknown Scope';
  }
}

export function getScopeBadgeClass(scopeLevel: OfficerPostingScopeLevel | string): string {
  switch (scopeLevel) {
    case 'GLOBAL':
      return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
    case 'STATE':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    case 'DIVISION':
      return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
    case 'SALES_AREA':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    case 'OUTLET':
      return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
    default:
      return 'bg-slate-700/20 text-slate-300 border-slate-600/30';
  }
}

export function getServiceTypeLabel(serviceType: ServiceType | string): string {
  switch (serviceType) {
    case 'MANPOWER':
      return 'Manpower Deployment';
    case 'HOUSEKEEPING':
      return 'Housekeeping & Sanitation';
    case 'SECURITY':
      return 'Security Agency';
    case 'MAINTENANCE':
      return 'Equipment & Facility Maintenance';
    case 'OTHER':
      return 'Other Services';
    default:
      return serviceType || 'Unknown Service';
  }
}

export function getServiceTypeBadgeClass(serviceType: ServiceType | string): string {
  switch (serviceType) {
    case 'SECURITY':
      return 'bg-red-500/10 text-red-400 border-red-500/30';
    case 'MANPOWER':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    case 'MAINTENANCE':
      return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
    case 'HOUSEKEEPING':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    default:
      return 'bg-slate-500/10 text-slate-300 border-slate-500/30';
  }
}

// ---------------------------------------------------------------------------
// 2. Date Formatting
// ---------------------------------------------------------------------------

export function formatOrgDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const month = parts[1];
      const day = parts[2].slice(0, 2);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const mIdx = parseInt(month, 10) - 1;
      if (mIdx >= 0 && mIdx < 12) {
        return `${day} ${months[mIdx]} ${year}`;
      }
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function formatAssignmentPeriod(effectiveFrom?: string | null, effectiveTo?: string | null): string {
  const from = formatOrgDate(effectiveFrom);
  const to = effectiveTo ? formatOrgDate(effectiveTo) : 'Present / Ongoing';
  return `${from} → ${to}`;
}

// ---------------------------------------------------------------------------
// 3. Hierarchy Location Label Builder
// ---------------------------------------------------------------------------

export interface HierarchyContext {
  states: State[];
  divisions: Division[];
  salesAreas: SalesArea[];
  outlets: RetailOutlet[];
}

export function buildPostingLocationLabel(
  posting?: OfficerPosting | null,
  hierarchy?: Partial<HierarchyContext> | null
): string {
  if (!posting) return '—';
  if (posting.scopeLevel === 'GLOBAL') {
    return 'All IOCL Operations (Head Office)';
  }

  const states = hierarchy?.states || [];
  const divisions = hierarchy?.divisions || [];
  const salesAreas = hierarchy?.salesAreas || [];
  const outlets = hierarchy?.outlets || [];

  if (posting.scopeLevel === 'STATE') {
    const st = states.find(s => s.id === posting.stateId);
    return st ? `${st.name} (${st.code})` : posting.stateId || 'State Office';
  }

  if (posting.scopeLevel === 'DIVISION') {
    const div = divisions.find(d => d.id === posting.divisionId);
    return div ? `${div.name} (${div.code})` : posting.divisionId || 'Divisional Office';
  }

  if (posting.scopeLevel === 'SALES_AREA') {
    const sa = salesAreas.find(s => s.id === posting.salesAreaId);
    return sa ? `${sa.name} (${sa.code})` : posting.salesAreaId || 'Sales Area';
  }

  if (posting.scopeLevel === 'OUTLET') {
    const ro = outlets.find(o => o.id === posting.outletId);
    return ro ? `${ro.name} (${ro.roCode})` : posting.outletId || 'Retail Outlet';
  }

  return '—';
}

// ---------------------------------------------------------------------------
// 4. Cascading Hierarchy Filter Helpers
// ---------------------------------------------------------------------------

export function getFilteredDivisions(divisions?: Division[] | null, selectedStateId?: string | null): Division[] {
  if (!divisions || !Array.isArray(divisions)) return [];
  if (!selectedStateId) return divisions;
  return divisions.filter(d => d.stateId === selectedStateId);
}

export function getFilteredSalesAreas(salesAreas?: SalesArea[] | null, selectedDivisionId?: string | null): SalesArea[] {
  if (!salesAreas || !Array.isArray(salesAreas)) return [];
  if (!selectedDivisionId) return salesAreas;
  return salesAreas.filter(sa => sa.divisionId === selectedDivisionId);
}

export function getFilteredOutlets(
  outlets?: RetailOutlet[] | null,
  selectedSalesAreaId?: string | null,
  selectedDivisionId?: string | null
): RetailOutlet[] {
  if (!outlets || !Array.isArray(outlets)) return [];
  let filtered = outlets;
  if (selectedDivisionId) {
    filtered = filtered.filter(o => o.divisionId === selectedDivisionId);
  }
  if (selectedSalesAreaId) {
    filtered = filtered.filter(o => o.salesAreaId === selectedSalesAreaId);
  }
  return filtered;
}

// ---------------------------------------------------------------------------
// 5. Permission Helpers
// ---------------------------------------------------------------------------

export function canReadOrgMasters(hasPermission: (p: PermissionCode) => boolean): boolean {
  if (typeof hasPermission !== 'function') return false;
  return hasPermission(PERMISSIONS.ORG_MASTERS_READ);
}

export function canWriteOrgMasters(hasPermission: (p: PermissionCode) => boolean): boolean {
  if (typeof hasPermission !== 'function') return false;
  return hasPermission(PERMISSIONS.ORG_MASTERS_WRITE);
}

export function canWriteGlobalOrgMasters(
  hasPermission: (p: PermissionCode) => boolean,
  userCtx?: UserContext | null
): boolean {
  if (!userCtx || typeof hasPermission !== 'function') return false;
  return hasPermission(PERMISSIONS.ORG_MASTERS_WRITE) && Boolean(userCtx.isGlobalScope);
}

export function canWriteOfficerPostings(hasPermission: (p: PermissionCode) => boolean): boolean {
  if (typeof hasPermission !== 'function') return false;
  return hasPermission(PERMISSIONS.ORG_MASTERS_WRITE);
}

export function canWriteOutletAssignments(hasPermission: (p: PermissionCode) => boolean): boolean {
  if (typeof hasPermission !== 'function') return false;
  return hasPermission(PERMISSIONS.ORG_MASTERS_WRITE);
}

// ---------------------------------------------------------------------------
// 6. Filter Helpers
// ---------------------------------------------------------------------------

export function filterDepartments(
  departments?: Department[] | null,
  searchQuery?: string | null,
  statusFilter?: string | null
): Department[] {
  if (!departments || !Array.isArray(departments)) return [];
  const query = (searchQuery || '').trim().toLowerCase();
  return departments.filter(d => {
    if (statusFilter && statusFilter !== 'ALL' && d.status !== statusFilter) {
      return false;
    }
    if (!query) return true;
    const codeMatch = d.code?.toLowerCase().includes(query);
    const nameMatch = d.name?.toLowerCase().includes(query);
    const descMatch = d.description?.toLowerCase().includes(query);
    return Boolean(codeMatch || nameMatch || descMatch);
  });
}

export function filterOfficers(
  officers?: Officer[] | null,
  searchQuery?: string | null,
  departmentFilter?: string | null,
  statusFilter?: string | null
): Officer[] {
  if (!officers || !Array.isArray(officers)) return [];
  const query = (searchQuery || '').trim().toLowerCase();
  return officers.filter(o => {
    if (departmentFilter && departmentFilter !== 'ALL' && o.departmentId !== departmentFilter) {
      return false;
    }
    if (statusFilter && statusFilter !== 'ALL' && o.status !== statusFilter) {
      return false;
    }
    if (!query) return true;
    const empMatch = o.employeeCode?.toLowerCase().includes(query);
    const nameMatch = o.fullName?.toLowerCase().includes(query);
    const desigMatch = o.designationTitle?.toLowerCase().includes(query);
    const phoneMatch = o.phone?.toLowerCase().includes(query);
    const emailMatch = o.email?.toLowerCase().includes(query);
    return Boolean(empMatch || nameMatch || desigMatch || phoneMatch || emailMatch);
  });
}

export function filterServiceProviders(
  providers?: ServiceProvider[] | null,
  searchQuery?: string | null,
  statusFilter?: string | null
): ServiceProvider[] {
  if (!providers || !Array.isArray(providers)) return [];
  const query = (searchQuery || '').trim().toLowerCase();
  return providers.filter(p => {
    if (statusFilter && statusFilter !== 'ALL' && p.status !== statusFilter) {
      return false;
    }
    if (!query) return true;
    const codeMatch = p.providerCode?.toLowerCase().includes(query);
    const nameMatch = p.providerName?.toLowerCase().includes(query);
    const personMatch = p.contactPerson?.toLowerCase().includes(query);
    const phoneMatch = p.phone?.toLowerCase().includes(query);
    const emailMatch = p.email?.toLowerCase().includes(query);
    const gstinMatch = p.gstin?.toLowerCase().includes(query);
    const panMatch = p.pan?.toLowerCase().includes(query);
    const cityMatch = p.city?.toLowerCase().includes(query);
    const distMatch = p.district?.toLowerCase().includes(query);
    return Boolean(codeMatch || nameMatch || personMatch || phoneMatch || emailMatch || gstinMatch || panMatch || cityMatch || distMatch);
  });
}

export function getActiveServiceProvidersForNewAssignment(providers?: ServiceProvider[] | null): ServiceProvider[] {
  if (!providers || !Array.isArray(providers)) return [];
  return providers.filter(p => p.status === 'ACTIVE');
}

// ---------------------------------------------------------------------------
// 7. Error Message Mapping (Sanitizing raw SQL / SQLite errors)
// ---------------------------------------------------------------------------

export function mapOrgErrorMessage(errorCode?: string | null, rawMessage?: string | null): string {
  // Never expose raw SQL / SQLite / internal text
  const codeStr = (errorCode || '').trim();
  const cleanMsg = (rawMessage || '').trim();
  const lowerMsg = cleanMsg.toLowerCase();
  const lowerCode = codeStr.toLowerCase();

  if (
    lowerMsg.includes('sqlite') ||
    lowerMsg.includes('syntax error') ||
    lowerMsg.includes('raise(abort') ||
    lowerMsg.includes('near "') ||
    lowerMsg.includes('sql') ||
    lowerCode.includes('sqlite') ||
    lowerCode.includes('sql')
  ) {
    return 'An unexpected database error occurred. The transaction was safely aborted.';
  }

  switch (codeStr) {
    case 'FORBIDDEN':
      return cleanMsg || 'You do not have permission or scope authority to perform this operation.';
    case 'VALIDATION_ERROR':
      return cleanMsg || 'Please correct the invalid input fields and try again.';
    case 'DEPARTMENT_NOT_FOUND':
      return 'The requested department could not be found.';
    case 'DUPLICATE_DEPARTMENT_CODE':
      return 'A department with this code already exists. Please choose a unique code.';
    case 'OFFICER_NOT_FOUND':
      return 'The requested officer record could not be found.';
    case 'DUPLICATE_OFFICER':
      return 'An officer with this employee code or email address is already registered.';
    case 'POSTING_NOT_FOUND':
      return 'The specified officer posting was not found.';
    case 'INVALID_ORG_HIERARCHY':
      return cleanMsg || 'The specified location does not match the organizational hierarchy structure.';
    case 'INVALID_POSTING_SCOPE':
      return cleanMsg || 'The specified posting scope is invalid for this officer or organizational hierarchy.';
    case 'SERVICE_PROVIDER_NOT_FOUND':
      return 'The requested service provider could not be found.';
    case 'SERVICE_PROVIDER_INACTIVE':
      return 'Cannot create new assignments for an inactive service provider. Please reactivate the provider first.';
    case 'DUPLICATE_SERVICE_PROVIDER_CODE':
      return 'A service provider with this code already exists. Please provide a unique code.';
    case 'ASSIGNMENT_NOT_FOUND':
      return 'The outlet service provider assignment record was not found.';
    case 'NETWORK_ERROR':
      return 'Network connection lost. Please verify your internet connection.';
    case 'HTTP_ERROR':
      return 'The server encountered an error processing your request.';
    case 'INTERNAL_SERVER_ERROR':
      return 'An internal server error occurred. Please try again or contact system support.';
    default:
      return cleanMsg || 'Unable to complete the operation. Please try again.';
  }
}

// ---------------------------------------------------------------------------
// 8. Form Strict Calendar Date Validation
// ---------------------------------------------------------------------------

export function isValidCalendarDate(dateStr?: string | null): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;

  const [yStr, mStr, dStr] = trimmed.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const d = parseInt(dStr, 10);

  if (m < 1 || m > 12 || d < 1 || d > 31) return false;

  const dateObj = new Date(Date.UTC(y, m - 1, d));
  return (
    dateObj.getUTCFullYear() === y &&
    dateObj.getUTCMonth() === m - 1 &&
    dateObj.getUTCDate() === d
  );
}

export function validateEffectiveDates(
  effectiveFrom?: string | null,
  effectiveTo?: string | null
): string | null {
  if (!effectiveFrom || !effectiveFrom.trim()) {
    return 'Effective From date is required.';
  }

  const fromTrimmed = effectiveFrom.trim();
  if (!isValidCalendarDate(fromTrimmed)) {
    return 'Effective From must be a valid calendar date in YYYY-MM-DD format.';
  }

  if (effectiveTo && effectiveTo.trim()) {
    const toTrimmed = effectiveTo.trim();
    if (!isValidCalendarDate(toTrimmed)) {
      return 'Effective To must be a valid calendar date in YYYY-MM-DD format.';
    }
    if (fromTrimmed > toTrimmed) {
      return 'Effective To date cannot be earlier than Effective From date.';
    }
  }

  return null;
}
