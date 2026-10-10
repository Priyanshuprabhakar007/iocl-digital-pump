/**
 * HR / Workforce Management UI formatting, query building, validation and helper functions
 * for Phase 5A-2 Frontend Workspace
 */

import {
  HrDesignationStatus,
  HrEmploymentStatus,
  HrRosterStatus,
  HrSkillCategory,
  HrDesignation,
  HrStaff,
  HrManpowerSanction,
  HrManpowerSummary,
  HrRosterAssignment,
  ShiftTemplate,
  Document,
  Nozzle,
} from '../../../shared/types';
import { formatDisplayDate, formatDisplayDateTime, formatFileSize } from '../utilities/utilityUi';

export { formatDisplayDate, formatDisplayDateTime, formatFileSize };

export type HrWorkspaceTab =
  | 'staff'
  | 'designations'
  | 'manpower'
  | 'roster'
  | 'attendance'
  | 'geofence'
  | 'nozzle-assignment'
  | 'uniforms';

export interface HrFilterState {
  staff: {
    designationId: string;
    skillCategory: string;
    employmentStatus: string;
    search: string;
    joinedFrom: string;
    joinedTo: string;
  };
  designations: {
    search: string;
    status: string;
    skillCategory: string;
  };
  manpower: {
    search: string;
  };
  roster: {
    staffId: string;
    designationId: string;
    shiftTemplateId: string;
    status: string;
    fromDate: string;
    toDate: string;
  };
  attendance: {
    date: string;
    fromDate: string;
    toDate: string;
    staffId: string;
    shiftTemplateId: string;
    status: string;
  };
  nozzleAssignment: {
    date: string;
    fromDate: string;
    toDate: string;
    staffId: string;
    nozzleId: string;
    shiftTemplateId: string;
    status: string;
  };
}

/**
 * Returns empty/reset filter state on outlet switch or clear
 */
export function getResetHrFilters(): HrFilterState {
  return {
    staff: {
      designationId: '',
      skillCategory: '',
      employmentStatus: '',
      search: '',
      joinedFrom: '',
      joinedTo: '',
    },
    designations: {
      search: '',
      status: '',
      skillCategory: '',
    },
    manpower: {
      search: '',
    },
    roster: {
      staffId: '',
      designationId: '',
      shiftTemplateId: '',
      status: '',
      fromDate: '',
      toDate: '',
    },
    attendance: {
      date: '',
      fromDate: '',
      toDate: '',
      staffId: '',
      shiftTemplateId: '',
      status: '',
    },
    nozzleAssignment: {
      date: '',
      fromDate: '',
      toDate: '',
      staffId: '',
      nozzleId: '',
      shiftTemplateId: '',
      status: '',
    },
  };
}

/**
 * Pure helper returning reset targets when switching internal workspace tabs
 */
export function getHrTabResetTargets(nextTab: HrWorkspaceTab) {
  return {
    closeStaffUi: nextTab !== 'staff',
    closeDesignationUi: nextTab !== 'designations',
    closeManpowerUi: nextTab !== 'manpower',
    closeRosterUi: nextTab !== 'roster',
    closeAttendanceUi: nextTab !== 'attendance',
    closeGeofenceUi: nextTab !== 'geofence',
    closeNozzleAssignmentUi: nextTab !== 'nozzle-assignment',
    closeUniformUi: nextTab !== 'uniforms',
  };
}

/**
 * Formats HR employment status into human-friendly label and badge CSS classes
 */
export function formatHrEmploymentStatus(status?: HrEmploymentStatus | string | null): {
  label: string;
  badgeClass: string;
} {
  switch (status) {
    case 'ACTIVE':
      return {
        label: 'Active',
        badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      };
    case 'INACTIVE':
      return {
        label: 'Inactive',
        badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
      };
    case 'EXITED':
      return {
        label: 'Exited',
        badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      };
    default:
      return {
        label: status || '—',
        badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
      };
  }
}

/**
 * Formats HR designation status into human-friendly label and badge CSS classes
 */
export function formatHrDesignationStatus(status?: HrDesignationStatus | string | null): {
  label: string;
  badgeClass: string;
} {
  switch (status) {
    case 'ACTIVE':
      return {
        label: 'Active',
        badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      };
    case 'INACTIVE':
      return {
        label: 'Inactive',
        badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
      };
    default:
      return {
        label: status || '—',
        badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
      };
  }
}

/**
 * Formats HR roster assignment status into human-friendly label and badge CSS classes
 */
export function formatHrRosterStatus(status?: HrRosterStatus | string | null): {
  label: string;
  badgeClass: string;
} {
  switch (status) {
    case 'SCHEDULED':
      return {
        label: 'Scheduled',
        badgeClass: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
      };
    case 'CANCELLED':
      return {
        label: 'Cancelled',
        badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
      };
    default:
      return {
        label: status || '—',
        badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
      };
  }
}

/**
 * Generates uppercase 1-2 letter initials from a full name for staff avatar
 */
export function getInitials(name?: string | null): string {
  if (!name || !name.trim()) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Formats HR skill category into human-friendly label and badge CSS classes
 */
export function formatHrSkillCategory(category?: HrSkillCategory | string | null): {
  label: string;
  badgeClass: string;
} {
  switch (category) {
    case 'HIGHLY_SKILLED':
      return {
        label: 'Highly Skilled',
        badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      };
    case 'SKILLED':
      return {
        label: 'Skilled',
        badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      };
    case 'SEMI_SKILLED':
      return {
        label: 'Semi-Skilled',
        badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      };
    case 'UNSKILLED':
      return {
        label: 'Unskilled',
        badgeClass: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
      };
    default:
      return {
        label: 'Not Classified',
        badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      };
  }
}

/**
 * Builds query params for Designation listing
 */
export function buildHrDesignationQueryParams(filters?: {
  search?: string;
  status?: string;
  skillCategory?: string;
}): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.search && filters.search.trim()) {
    params.set('search', filters.search.trim());
  }
  if (filters.status && filters.status.trim()) {
    params.set('status', filters.status.trim());
  }
  if (filters.skillCategory && filters.skillCategory.trim()) {
    params.set('skillCategory', filters.skillCategory.trim());
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

/**
 * Builds query params for Staff listing
 */
export function buildHrStaffQueryParams(filters?: {
  designationId?: string;
  skillCategory?: string;
  employmentStatus?: string;
  search?: string;
  joinedFrom?: string;
  joinedTo?: string;
}): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.designationId && filters.designationId.trim()) {
    params.set('designationId', filters.designationId.trim());
  }
  if (filters.skillCategory && filters.skillCategory.trim()) {
    params.set('skillCategory', filters.skillCategory.trim());
  }
  if (filters.employmentStatus && filters.employmentStatus.trim()) {
    params.set('employmentStatus', filters.employmentStatus.trim());
  }
  if (filters.search && filters.search.trim()) {
    params.set('search', filters.search.trim());
  }
  if (filters.joinedFrom && filters.joinedFrom.trim()) {
    params.set('joinedFrom', filters.joinedFrom.trim());
  }
  if (filters.joinedTo && filters.joinedTo.trim()) {
    params.set('joinedTo', filters.joinedTo.trim());
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

/**
 * Builds query params for Roster listing
 */
export function buildHrRosterQueryParams(filters?: {
  staffId?: string;
  designationId?: string;
  shiftTemplateId?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
}): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.staffId && filters.staffId.trim()) {
    params.set('staffId', filters.staffId.trim());
  }
  if (filters.designationId && filters.designationId.trim()) {
    params.set('designationId', filters.designationId.trim());
  }
  if (filters.shiftTemplateId && filters.shiftTemplateId.trim()) {
    params.set('shiftTemplateId', filters.shiftTemplateId.trim());
  }
  if (filters.status && filters.status.trim()) {
    params.set('status', filters.status.trim());
  }
  if (filters.fromDate && filters.fromDate.trim()) {
    params.set('fromDate', filters.fromDate.trim());
  }
  if (filters.toDate && filters.toDate.trim()) {
    params.set('toDate', filters.toDate.trim());
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

/**
 * Builds query params for Attendance listing
 */
export function buildHrAttendanceQueryParams(filters?: {
  date?: string;
  fromDate?: string;
  toDate?: string;
  staffId?: string;
  shiftTemplateId?: string;
  status?: string;
}): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.date && filters.date.trim()) {
    params.set('date', filters.date.trim());
  }
  if (filters.fromDate && filters.fromDate.trim()) {
    params.set('fromDate', filters.fromDate.trim());
  }
  if (filters.toDate && filters.toDate.trim()) {
    params.set('toDate', filters.toDate.trim());
  }
  if (filters.staffId && filters.staffId.trim()) {
    params.set('staffId', filters.staffId.trim());
  }
  if (filters.shiftTemplateId && filters.shiftTemplateId.trim()) {
    params.set('shiftTemplateId', filters.shiftTemplateId.trim());
  }
  if (filters.status && filters.status.trim()) {
    params.set('status', filters.status.trim());
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

/**
 * Builds query params for Nozzle Assignment listing
 */
export function buildHrNozzleAssignmentQueryParams(filters?: {
  date?: string;
  fromDate?: string;
  toDate?: string;
  staffId?: string;
  nozzleId?: string;
  shiftTemplateId?: string;
  status?: string;
}): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.date && filters.date.trim()) {
    params.set('date', filters.date.trim());
  }
  if (filters.fromDate && filters.fromDate.trim()) {
    params.set('fromDate', filters.fromDate.trim());
  }
  if (filters.toDate && filters.toDate.trim()) {
    params.set('toDate', filters.toDate.trim());
  }
  if (filters.staffId && filters.staffId.trim()) {
    params.set('staffId', filters.staffId.trim());
  }
  if (filters.nozzleId && filters.nozzleId.trim()) {
    params.set('nozzleId', filters.nozzleId.trim());
  }
  if (filters.shiftTemplateId && filters.shiftTemplateId.trim()) {
    params.set('shiftTemplateId', filters.shiftTemplateId.trim());
  }
  if (filters.status && filters.status.trim()) {
    params.set('status', filters.status.trim());
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

export function formatHrAttendanceStatus(status?: string | null): { label: string; badgeClass: string } {
  switch (status) {
    case 'CHECKED_IN':
      return { label: 'Checked In', badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
    case 'CHECKED_OUT':
      return { label: 'Checked Out', badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
    case 'CANCELLED':
      return { label: 'Cancelled', badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20' };
    default:
      return { label: status || '—', badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20' };
  }
}

export function formatHrNozzleStatus(status?: string | null): { label: string; badgeClass: string } {
  switch (status) {
    case 'ASSIGNED':
      return { label: 'Assigned', badgeClass: 'bg-sky-500/10 text-sky-400 border-sky-500/20' };
    case 'CANCELLED':
      return { label: 'Cancelled', badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20' };
    default:
      return { label: status || '—', badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20' };
  }
}

export function formatGeolocationError(error: any): string {
  if (!error) return 'An unknown geolocation error occurred.';
  if (typeof error === 'string') return error;
  if (error.code === 1 || error.message?.includes('PERMISSION_DENIED')) {
    return 'Location permission was denied. Please allow location access to continue.';
  }
  if (error.code === 2 || error.message?.includes('POSITION_UNAVAILABLE')) {
    return 'Your current location could not be determined.';
  }
  if (error.code === 3 || error.message?.includes('TIMEOUT')) {
    return 'Location request timed out. Please try again.';
  }
  return error.message || 'Unable to retrieve your location.';
}

/**
 * Validates joinedFrom and joinedTo date range
 */
export function validateHrJoinedDateRange(
  joinedFrom?: string | null,
  joinedTo?: string | null
): { valid: boolean; error?: string } {
  if (joinedFrom && joinedTo && joinedFrom > joinedTo) {
    return {
      valid: false,
      error: 'Joined From date cannot be after Joined To date.',
    };
  }
  return { valid: true };
}

/**
 * Validates roster fromDate and toDate range
 */
export function validateHrRosterDateRange(
  fromDate?: string | null,
  toDate?: string | null
): { valid: boolean; error?: string } {
  if (fromDate && toDate && fromDate > toDate) {
    return {
      valid: false,
      error: 'From date cannot be after To date.',
    };
  }
  return { valid: true };
}

/**
 * Request guard helper for staff list queries
 */
export function canRequestHrStaffList(filters?: {
  joinedFrom?: string;
  joinedTo?: string;
}): boolean {
  if (!filters) return true;
  const validation = validateHrJoinedDateRange(filters.joinedFrom, filters.joinedTo);
  return validation.valid;
}

/**
 * Request guard helper for roster list queries
 */
export function canRequestHrRosterList(filters?: {
  fromDate?: string;
  toDate?: string;
}): boolean {
  if (!filters) return true;
  const validation = validateHrRosterDateRange(filters.fromDate, filters.toDate);
  return validation.valid;
}

/**
 * Returns local calendar date input string (YYYY-MM-DD) based on local timezone
 */
export function getLocalDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Filters and sorts eligible designations for staff create/edit
 */
export function getEligibleStaffDesignations(
  designations: HrDesignation[],
  currentDesignationId?: string | null,
  outletId?: string
): HrDesignation[] {
  let list = designations;
  if (outletId) {
    list = list.filter(d => d.outletId === outletId);
  }

  return list.filter(d => {
    if (d.status === 'ACTIVE') return true;
    if (currentDesignationId && d.id === currentDesignationId) return true;
    return false;
  });
}

/**
 * Filters and sorts eligible staff members for roster create/edit
 */
export function getEligibleRosterStaff(
  staffList: HrStaff[],
  currentStaffId?: string | null,
  outletId?: string
): HrStaff[] {
  let list = staffList;
  if (outletId) {
    list = list.filter(s => s.outletId === outletId);
  }

  return list.filter(s => {
    if (s.employmentStatus === 'ACTIVE') return true;
    if (currentStaffId && s.id === currentStaffId) return true;
    return false;
  });
}

/**
 * Filters and sorts eligible shift templates for roster create/edit
 */
export function getEligibleRosterShiftTemplates(
  templates: ShiftTemplate[],
  currentShiftTemplateId?: string | null,
  outletId?: string
): ShiftTemplate[] {
  let list = templates;
  if (outletId) {
    list = list.filter(t => t.outletId === outletId);
  }

  const eligible = list.filter(t => {
    if (t.status === 'ACTIVE') return true;
    if (currentShiftTemplateId && t.id === currentShiftTemplateId) return true;
    return false;
  });

  return eligible.slice().sort((a, b) => {
    const seqA = a.sequence ?? 999;
    const seqB = b.sequence ?? 999;
    if (seqA !== seqB) return seqA - seqB;
    const nameA = a.name || a.code || '';
    const nameB = b.name || b.code || '';
    return nameA.localeCompare(nameB);
  });
}

/**
 * Validates designation form payload
 */
export function canSubmitHrDesignation(
  payload: { code?: string; name?: string; status?: string; skillCategory?: string | null },
  isEdit = false
): boolean {
  if (!isEdit) {
    if (!payload.code || !payload.code.trim()) return false;
  }
  if (!payload.name || !payload.name.trim()) return false;
  if (payload.status && payload.status !== 'ACTIVE' && payload.status !== 'INACTIVE') {
    return false;
  }
  if (payload.skillCategory && !['HIGHLY_SKILLED', 'SKILLED', 'SEMI_SKILLED', 'UNSKILLED'].includes(payload.skillCategory)) {
    return false;
  }
  return true;
}

/**
 * Validates staff form payload
 */
export function canSubmitHrStaff(
  payload: {
    employeeCode?: string;
    fullName?: string;
    designationId?: string;
    aadhaarLast4?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    joiningDate?: string;
    employmentStatus?: string;
    exitDate?: string | null;
  },
  isEdit = false
): boolean {
  if (!isEdit) {
    if (!payload.employeeCode || !payload.employeeCode.trim()) return false;
  }
  if (!payload.fullName || !payload.fullName.trim()) return false;
  if (!payload.designationId || !payload.designationId.trim()) return false;

  // Aadhaar Last 4 validation: exactly 4 digits
  if (!payload.aadhaarLast4 || !/^\d{4}$/.test(payload.aadhaarLast4.trim())) {
    return false;
  }

  // Emergency contact name
  if (!payload.emergencyContactName || !payload.emergencyContactName.trim()) {
    return false;
  }

  // Emergency contact phone: permissive validation (digits, +, -, spaces, parentheses, at least 4 chars)
  const phone = payload.emergencyContactPhone ? payload.emergencyContactPhone.trim() : '';
  if (!phone || phone.length < 4 || !/^[0-9+\-()\s]+$/.test(phone)) {
    return false;
  }

  // Joining date
  if (!payload.joiningDate || !payload.joiningDate.trim()) return false;

  // Employment status
  const status = payload.employmentStatus || 'ACTIVE';
  if (status !== 'ACTIVE' && status !== 'INACTIVE' && status !== 'EXITED') {
    return false;
  }

  // Exit date rules
  if (status === 'EXITED') {
    if (!payload.exitDate || !payload.exitDate.trim()) return false;
    if (payload.exitDate < payload.joiningDate) return false;
  } else {
    if (payload.exitDate && payload.exitDate.trim()) return false;
  }

  return true;
}

/**
 * Validates manpower sanction form payload
 */
export function canSubmitHrManpowerSanction(
  payload: {
    designationId?: string;
    sanctionedCount?: number | string;
    effectiveFrom?: string;
  },
  isEdit = false
): boolean {
  if (!isEdit) {
    if (!payload.designationId || !payload.designationId.trim()) return false;
  }
  if (payload.sanctionedCount === undefined || payload.sanctionedCount === null || payload.sanctionedCount === '') {
    return false;
  }
  const countNum = Number(payload.sanctionedCount);
  if (!Number.isInteger(countNum) || countNum < 0 || countNum > 10000) {
    return false;
  }
  if (!payload.effectiveFrom || !payload.effectiveFrom.trim()) return false;
  return true;
}

/**
 * Validates roster assignment form payload
 */
export function canSubmitHrRoster(
  payload: {
    staffId?: string;
    rosterDate?: string;
    shiftTemplateId?: string;
    status?: string;
  },
  isEdit = false
): boolean {
  if (!payload.staffId || !payload.staffId.trim()) return false;
  if (!payload.rosterDate || !payload.rosterDate.trim()) return false;
  if (!payload.shiftTemplateId || !payload.shiftTemplateId.trim()) return false;

  if (isEdit && payload.status) {
    if (payload.status !== 'SCHEDULED' && payload.status !== 'CANCELLED') {
      return false;
    }
  }

  return true;
}

/**
 * Pure permission helpers
 */
export function canEditHrStaff(hasHrStaffWrite: boolean): boolean {
  return Boolean(hasHrStaffWrite);
}

export function canEditHrManpower(hasHrManpowerWrite: boolean): boolean {
  return Boolean(hasHrManpowerWrite);
}

export function canEditHrRoster(hasHrRosterWrite: boolean): boolean {
  return Boolean(hasHrRosterWrite);
}

export function canCancelHrRoster(hasHrRosterWrite: boolean, status?: string): boolean {
  return Boolean(hasHrRosterWrite) && status === 'SCHEDULED';
}

/**
 * Resolves document from loaded documents array safely without exposing r2Key
 */
export function resolveHrDocument(
  docs: Document[],
  docId?: string | null,
  outletId?: string
): Document | null {
  if (!docId || !Array.isArray(docs)) return null;
  const match = docs.find(d => d.id === docId);
  if (!match) return null;
  if (outletId && match.outletId !== outletId) return null;
  return match;
}

export function formatGeofenceInside(inside?: boolean | number | null): { label: string; badgeClass: string } {
  const val = inside === true || inside === 1;
  return val
    ? { label: 'Inside Geofence', badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' }
    : { label: 'Outside Geofence', badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/25' };
}

export function formatDistanceMetres(metres?: number | null): string {
  if (metres == null || isNaN(metres)) return '— m';
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(2)} km`;
}

export function formatGpsAccuracy(accuracy?: number | null): string {
  if (accuracy == null || isNaN(accuracy)) return '— m accuracy';
  return `±${Math.round(accuracy)} m accuracy`;
}

export function getEligibleScheduledRosters(rosters: HrRosterAssignment[]): HrRosterAssignment[] {
  if (!Array.isArray(rosters)) return [];
  return rosters.filter(r => r.status === 'SCHEDULED');
}

export function getEligibleActiveNozzles(nozzles: Nozzle[]): Nozzle[] {
  if (!Array.isArray(nozzles)) return [];
  return nozzles.filter(n => n.status === 'ACTIVE');
}

export function validateHrAttendanceDateRange(
  fromDate?: string | null,
  toDate?: string | null
): { valid: boolean; error?: string } {
  if (fromDate && toDate && fromDate > toDate) {
    return {
      valid: false,
      error: 'From date cannot be after To date.',
    };
  }
  return { valid: true };
}

export function validateHrNozzleDateRange(
  fromDate?: string | null,
  toDate?: string | null
): { valid: boolean; error?: string } {
  if (fromDate && toDate && fromDate > toDate) {
    return {
      valid: false,
      error: 'From date cannot be after To date.',
    };
  }
  return { valid: true };
}

export function isGeofencePolicyNotFound(error: any): boolean {
  if (!error) return false;
  const code = typeof error === 'string' ? error : error.code || error.error?.code || error.message;
  return code === 'HR_GEOFENCE_POLICY_NOT_FOUND';
}

/**
 * Maps HR backend error codes to human-readable error messages
 */
export function getHrErrorMessage(error: any): string {
  if (!error) return 'An unknown error occurred.';

  const code =
    typeof error === 'string'
      ? error
      : error.code || error.error?.code || error.message || error.error?.message;

  if (typeof code === 'string') {
    switch (code) {
      case 'HR_DESIGNATION_NOT_FOUND':
        return 'Designation not found.';
      case 'HR_DESIGNATION_CODE_EXISTS':
        return 'A designation with this code already exists for this outlet.';
      case 'HR_DESIGNATION_NOT_ACTIVE':
        return 'Selected designation is not active.';
      case 'HR_DESIGNATION_IDENTITY_IMMUTABLE':
        return 'Designation code and outlet cannot be modified.';
      case 'HR_STAFF_NOT_FOUND':
        return 'Staff member not found.';
      case 'HR_STAFF_CODE_EXISTS':
        return 'A staff member with this employee code already exists for this outlet.';
      case 'HR_STAFF_NOT_ACTIVE':
        return 'Selected staff member is not active.';
      case 'HR_STAFF_DESIGNATION_OUTLET_MISMATCH':
        return 'Designation does not belong to the same outlet.';
      case 'HR_STAFF_IDENTITY_IMMUTABLE':
        return 'Employee code and outlet cannot be modified.';
      case 'HR_AADHAAR_DOCUMENT_NOT_FOUND':
        return 'Aadhaar document not found.';
      case 'HR_AADHAAR_DOCUMENT_OUTLET_MISMATCH':
        return 'Aadhaar document belongs to a different outlet.';
      case 'HR_PHOTO_DOCUMENT_NOT_FOUND':
        return 'Photo document not found.';
      case 'HR_PHOTO_DOCUMENT_OUTLET_MISMATCH':
        return 'Photo document belongs to a different outlet.';
      case 'HR_MANPOWER_SANCTION_NOT_FOUND':
        return 'Manpower sanction not found.';
      case 'HR_MANPOWER_SANCTION_EXISTS':
        return 'A manpower sanction already exists for this designation.';
      case 'HR_MANPOWER_DESIGNATION_OUTLET_MISMATCH':
        return 'Designation belongs to a different outlet.';
      case 'HR_ROSTER_NOT_FOUND':
        return 'Roster assignment not found.';
      case 'HR_ROSTER_EXISTS':
        return 'A roster assignment already exists for this staff member on this date.';
      case 'HR_ROSTER_STAFF_OUTLET_MISMATCH':
        return 'Staff member belongs to a different outlet.';
      case 'HR_ROSTER_SHIFT_OUTLET_MISMATCH':
        return 'Shift template belongs to a different outlet.';
      case 'HR_SHIFT_TEMPLATE_NOT_FOUND':
        return 'Shift template not found.';
      case 'HR_SHIFT_TEMPLATE_NOT_ACTIVE':
        return 'Shift template is not active.';
      case 'HR_GEOFENCE_POLICY_NOT_FOUND':
        return 'Geofence policy not configured.';
      case 'HR_OUTLET_LOCATION_NOT_CONFIGURED':
        return 'Outlet location has not been configured.';
      case 'HR_GPS_ACCURACY_TOO_LOW':
        return 'GPS accuracy is too low. Move to an open area and try again.';
      case 'HR_OUTSIDE_GEOFENCE':
        return 'You are outside the permitted attendance area.';
      case 'HR_ROSTER_NOT_SCHEDULED':
        return 'Roster assignment is not scheduled.';
      case 'HR_ATTENDANCE_ALREADY_EXISTS':
        return 'Attendance already exists for this roster assignment.';
      case 'HR_ATTENDANCE_NOT_FOUND':
        return 'Attendance record not found.';
      case 'HR_ATTENDANCE_NOT_CHECKED_IN':
        return 'Attendance is not checked in.';
      case 'HR_ATTENDANCE_ALREADY_CHECKED_OUT':
        return 'Attendance already checked out.';
      case 'HR_ATTENDANCE_CHECKOUT_INVALID':
        return 'Checkout time must be strictly after check-in time.';
      case 'HR_NOZZLE_ASSIGNMENT_NOT_FOUND':
        return 'Nozzle assignment not found.';
      case 'HR_NOZZLE_ASSIGNMENT_ALREADY_CANCELLED':
        return 'Nozzle assignment is already cancelled.';
      case 'HR_NOZZLE_ALREADY_ASSIGNED':
        return 'This nozzle is already assigned for the selected shift and date.';
      case 'HR_NOZZLE_NOT_ACTIVE':
        return 'The selected nozzle is not active.';
      case 'HR_NOZZLE_OUTLET_MISMATCH':
        return 'Nozzle belongs to a different outlet.';
      case 'VALIDATION_ERROR':
        return 'Please correct the highlighted validation errors.';
      case 'FORBIDDEN':
        return 'You do not have permission to perform this action.';
      case 'INTERNAL_SERVER_ERROR':
        return 'An unexpected server error occurred.';
      case 'NETWORK_ERROR':
        return 'Network error occurred. Please check your connection.';
      default:
        // Sanitize raw SQLite or internal error strings
        if (
          code.toLowerCase().includes('sqlite') ||
          code.toLowerCase().includes('sql') ||
          code.toLowerCase().includes('syntax') ||
          code.toLowerCase().includes('constraint')
        ) {
          return 'An unexpected server error occurred.';
        }
        return code;
    }
  }

  return 'An unexpected error occurred.';
}
