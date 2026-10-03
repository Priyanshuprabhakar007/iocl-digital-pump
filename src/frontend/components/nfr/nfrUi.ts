/**
 * NFR UI formatting, query building, validation and helper functions
 * for Phase 4C-2 Frontend Workspace
 */

import {
  NfrType,
  NfrSpaceStatus,
  NfrVendorStatus,
  NfrLeaseStatus,
  NfrRentPaymentStatus,
  Document,
  UtilitySubMeter,
} from '../../../shared/types';
import { formatDisplayDate, formatDisplayDateTime, formatFileSize } from '../utilities/utilityUi';
import { PERMISSIONS } from '../../../shared/constants';

export { formatDisplayDate, formatDisplayDateTime, formatFileSize };

export type NfrWorkspaceTab = 'spaces' | 'vendors' | 'leases' | 'rent-dues';

export interface NfrFilterState {
  spaces: {
    nfrType: string;
    status: string;
  };
  vendors: {
    search: string;
    status: string;
  };
  leases: {
    spaceId: string;
    vendorId: string;
    status: string;
    nfrType: string;
    expiredOnly: boolean;
  };
  rentDues: {
    leaseId: string;
    vendorId: string;
    spaceId: string;
    billingMonth: string;
    paymentStatus: string;
    overdueOnly: boolean;
    fromDate: string;
    toDate: string;
  };
}

/**
 * Returns empty/reset filter state on outlet switch or clear
 */
export function getResetNfrFilters(): NfrFilterState {
  return {
    spaces: {
      nfrType: '',
      status: '',
    },
    vendors: {
      search: '',
      status: '',
    },
    leases: {
      spaceId: '',
      vendorId: '',
      status: '',
      nfrType: '',
      expiredOnly: false,
    },
    rentDues: {
      leaseId: '',
      vendorId: '',
      spaceId: '',
      billingMonth: '',
      paymentStatus: '',
      overdueOnly: false,
      fromDate: '',
      toDate: '',
    },
  };
}

/**
 * Pure helper returning reset targets when switching internal workspace tabs
 */
export function getNfrTabResetTargets(nextTab: NfrWorkspaceTab) {
  return {
    closeSpaceModal: nextTab !== 'spaces',
    closeVendorModal: nextTab !== 'vendors',
    closeLeaseUi: nextTab !== 'leases',
    closeRentDueUi: nextTab !== 'rent-dues',
  };
}

/**
 * Formats NFR space type into human-friendly label
 */
export function formatNfrType(type?: string | null): string {
  switch (type) {
    case 'ATM':
      return 'ATM';
    case 'CONVENIENCE_STORE':
      return 'Convenience Store';
    case 'QSR':
      return 'QSR';
    case 'CAR_WASH':
      return 'Car Wash';
    case 'EV_CHARGING':
      return 'EV Charging';
    case 'CANOPY_ADVERTISING':
      return 'Canopy Advertising';
    default:
      return type ? type : '—';
  }
}

/**
 * Formats lease status badge and label
 * Supports either (status, isExpired) or ({ status, isExpired })
 */
export function getNfrLeaseStatusDisplay(
  statusOrLease: string | { status: string; isExpired?: boolean },
  isExpiredArg?: boolean
): { label: string; badgeClass: string } {
  let status: string;
  let isExpired = false;

  if (typeof statusOrLease === 'object' && statusOrLease !== null) {
    status = statusOrLease.status;
    isExpired = Boolean(statusOrLease.isExpired);
  } else {
    status = statusOrLease;
    isExpired = Boolean(isExpiredArg);
  }

  if (status === 'TERMINATED') {
    return {
      label: 'Terminated',
      badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    };
  }

  if (isExpired) {
    return {
      label: 'Expired',
      badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    };
  }

  return {
    label: 'Active',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  };
}

/**
 * Formats rent payment status badge and label
 * Supports either (paymentStatus, isOverdue) or ({ paymentStatus, isOverdue })
 */
export function getNfrRentStatusDisplay(
  statusOrDue: string | { paymentStatus: string; isOverdue?: boolean },
  isOverdueArg?: boolean
): { label: string; badgeClass: string; isOverdue: boolean } {
  let paymentStatus: string;
  let isOverdue = false;

  if (typeof statusOrDue === 'object' && statusOrDue !== null) {
    paymentStatus = statusOrDue.paymentStatus;
    isOverdue = Boolean(statusOrDue.isOverdue);
  } else {
    paymentStatus = statusOrDue;
    isOverdue = Boolean(isOverdueArg);
  }

  if (paymentStatus === 'PAID') {
    return {
      label: 'Paid',
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      isOverdue: false,
    };
  }

  if (paymentStatus === 'PARTIAL') {
    if (isOverdue) {
      return {
        label: 'Partial • Overdue',
        badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30 font-medium',
        isOverdue: true,
      };
    }
    return {
      label: 'Partial',
      badgeClass: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
      isOverdue: false,
    };
  }

  if (isOverdue) {
    return {
      label: 'Overdue',
      badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30 animate-pulse',
      isOverdue: true,
    };
  }

  return {
    label: 'Pending',
    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    isOverdue: false,
  };
}

/**
 * Build query string for NFR spaces filter
 */
export function buildNfrSpaceQueryParams(filters: {
  nfrType?: string;
  status?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.nfrType && filters.nfrType.trim() !== '') {
    params.append('nfrType', filters.nfrType.trim());
  }
  if (filters.status && filters.status.trim() !== '') {
    params.append('status', filters.status.trim());
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Build query string for NFR vendors filter
 */
export function buildNfrVendorQueryParams(filters: {
  status?: string;
  search?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.status && filters.status.trim() !== '') {
    params.append('status', filters.status.trim());
  }
  if (filters.search && filters.search.trim() !== '') {
    params.append('search', filters.search.trim());
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Build query string for NFR leases filter
 */
export function buildNfrLeaseQueryParams(filters: {
  spaceId?: string;
  vendorId?: string;
  status?: string;
  nfrType?: string;
  expiredOnly?: boolean;
}): string {
  const params = new URLSearchParams();
  if (filters.spaceId && filters.spaceId.trim() !== '') {
    params.append('spaceId', filters.spaceId.trim());
  }
  if (filters.vendorId && filters.vendorId.trim() !== '') {
    params.append('vendorId', filters.vendorId.trim());
  }
  if (filters.status && filters.status.trim() !== '') {
    params.append('status', filters.status.trim());
  }
  if (filters.nfrType && filters.nfrType.trim() !== '') {
    params.append('nfrType', filters.nfrType.trim());
  }
  if (filters.expiredOnly) {
    params.append('expiredOnly', 'true');
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Build query string for NFR rent dues filter
 */
export function buildNfrRentDueQueryParams(filters: {
  leaseId?: string;
  vendorId?: string;
  spaceId?: string;
  billingMonth?: string;
  paymentStatus?: string;
  overdueOnly?: boolean;
  fromDate?: string;
  toDate?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.leaseId && filters.leaseId.trim() !== '') {
    params.append('leaseId', filters.leaseId.trim());
  }
  if (filters.vendorId && filters.vendorId.trim() !== '') {
    params.append('vendorId', filters.vendorId.trim());
  }
  if (filters.spaceId && filters.spaceId.trim() !== '') {
    params.append('spaceId', filters.spaceId.trim());
  }
  if (filters.billingMonth && filters.billingMonth.trim() !== '') {
    params.append('billingMonth', filters.billingMonth.trim());
  }
  if (filters.paymentStatus && filters.paymentStatus.trim() !== '') {
    params.append('paymentStatus', filters.paymentStatus.trim());
  }
  if (filters.overdueOnly) {
    params.append('overdueOnly', 'true');
  }
  if (filters.fromDate && filters.fromDate.trim() !== '') {
    params.append('fromDate', filters.fromDate.trim());
  }
  if (filters.toDate && filters.toDate.trim() !== '') {
    params.append('toDate', filters.toDate.trim());
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Validates date range guard (fromDate <= toDate)
 */
export function validateNfrDateRange(
  fromDate?: string,
  toDate?: string
): { isValid: boolean; valid: boolean; error?: string } {
  if (fromDate && toDate && fromDate.trim() !== '' && toDate.trim() !== '') {
    if (fromDate.trim() > toDate.trim()) {
      return {
        isValid: false,
        valid: false,
        error: 'From date cannot be after To date.',
      };
    }
  }
  return { isValid: true, valid: true };
}

/**
 * Action permissions helpers
 */
export function canEditNfrLease(
  hasPermissionOrLease: ((perm: any) => boolean) | boolean | { status: string },
  leaseOrHasPermission?: { status: string } | boolean
): boolean {
  let hasPerm = false;
  let status = '';

  if (typeof hasPermissionOrLease === 'function') {
    hasPerm = hasPermissionOrLease(PERMISSIONS.NFR_LEASES_WRITE);
    status = (leaseOrHasPermission as { status: string })?.status || '';
  } else if (typeof hasPermissionOrLease === 'boolean') {
    hasPerm = hasPermissionOrLease;
    status = (leaseOrHasPermission as { status: string })?.status || '';
  } else if (typeof hasPermissionOrLease === 'object' && hasPermissionOrLease !== null) {
    status = hasPermissionOrLease.status;
    hasPerm = Boolean(leaseOrHasPermission);
  }

  return hasPerm && status === 'ACTIVE';
}

export function canTerminateNfrLease(
  hasPermissionOrLease: ((perm: any) => boolean) | boolean | { status: string },
  leaseOrHasPermission?: { status: string } | boolean
): boolean {
  let hasPerm = false;
  let status = '';

  if (typeof hasPermissionOrLease === 'function') {
    hasPerm = hasPermissionOrLease(PERMISSIONS.NFR_LEASES_WRITE);
    status = (leaseOrHasPermission as { status: string })?.status || '';
  } else if (typeof hasPermissionOrLease === 'boolean') {
    hasPerm = hasPermissionOrLease;
    status = (leaseOrHasPermission as { status: string })?.status || '';
  } else if (typeof hasPermissionOrLease === 'object' && hasPermissionOrLease !== null) {
    status = hasPermissionOrLease.status;
    hasPerm = Boolean(leaseOrHasPermission);
  }

  return hasPerm && status === 'ACTIVE';
}

export function canGenerateNfrRentDue(
  hasPermission: ((perm: any) => boolean) | boolean
): boolean {
  if (typeof hasPermission === 'function') {
    return hasPermission(PERMISSIONS.NFR_RENT_DUES_WRITE);
  }
  return Boolean(hasPermission);
}

export function canRecordNfrRentPayment(
  hasPermissionOrDue: ((perm: any) => boolean) | boolean | { paymentStatus: string },
  dueOrHasPermission?: { paymentStatus: string } | boolean
): boolean {
  let hasPerm = false;
  let paymentStatus = '';

  if (typeof hasPermissionOrDue === 'function') {
    hasPerm = hasPermissionOrDue(PERMISSIONS.NFR_RENT_PAYMENTS_WRITE);
    paymentStatus = (dueOrHasPermission as { paymentStatus: string })?.paymentStatus || '';
  } else if (typeof hasPermissionOrDue === 'boolean') {
    hasPerm = hasPermissionOrDue;
    paymentStatus = (dueOrHasPermission as { paymentStatus: string })?.paymentStatus || '';
  } else if (typeof hasPermissionOrDue === 'object' && hasPermissionOrDue !== null) {
    paymentStatus = hasPermissionOrDue.paymentStatus;
    hasPerm = Boolean(dueOrHasPermission);
  }

  return hasPerm && paymentStatus !== 'PAID';
}

/**
 * Form submit validity checkers
 */
export function canSubmitNfrSpace(
  formData: {
    spaceCode?: string;
    name?: string;
    nfrType?: string;
  },
  isEdit: boolean = false,
  isSubmitting: boolean = false
): boolean {
  if (isSubmitting) return false;
  if (!isEdit && (!formData.spaceCode || formData.spaceCode.trim() === '')) return false;
  if (!formData.name || formData.name.trim() === '') return false;
  if (!formData.nfrType || formData.nfrType.trim() === '') return false;
  return true;
}

export function canSubmitNfrVendor(
  formData: {
    vendorName?: string;
    ownerContactName?: string;
    ownerContactPhone?: string;
  },
  isSubmitting: boolean = false
): boolean {
  if (isSubmitting) return false;
  if (!formData.vendorName || formData.vendorName.trim() === '') return false;
  if (!formData.ownerContactName || formData.ownerContactName.trim() === '') return false;
  if (!formData.ownerContactPhone || formData.ownerContactPhone.trim() === '') return false;

  // Permissive phone validation: digits, spaces, +, -, parentheses
  const phonePattern = /^[0-9+\-\s()]+$/;
  if (!phonePattern.test(formData.ownerContactPhone.trim())) {
    return false;
  }

  return true;
}

export function canSubmitNfrLease(
  formData: {
    spaceId?: string;
    vendorId?: string;
    agreementNumber?: string;
    leaseStartDate?: string;
    leaseEndDate?: string;
    monthlyRent?: string;
    securityDeposit?: string;
    monthlyDueDay?: number | string;
  },
  isSubmitting: boolean = false
): boolean {
  if (isSubmitting) return false;
  if (!formData.spaceId || formData.spaceId.trim() === '') return false;
  if (!formData.vendorId || formData.vendorId.trim() === '') return false;
  if (!formData.agreementNumber || formData.agreementNumber.trim() === '') return false;
  if (!formData.leaseStartDate || formData.leaseStartDate.trim() === '') return false;
  if (!formData.leaseEndDate || formData.leaseEndDate.trim() === '') return false;
  if (formData.leaseEndDate < formData.leaseStartDate) return false;
  if (!formData.monthlyRent || formData.monthlyRent.trim() === '') return false;

  const rentNum = parseFloat(formData.monthlyRent.trim());
  if (isNaN(rentNum) || rentNum <= 0 || !/^\d+(\.\d{1,2})?$/.test(formData.monthlyRent.trim())) {
    return false;
  }

  if (formData.securityDeposit && formData.securityDeposit.trim() !== '') {
    const depNum = parseFloat(formData.securityDeposit.trim());
    if (isNaN(depNum) || depNum < 0 || !/^\d+(\.\d{1,2})?$/.test(formData.securityDeposit.trim())) {
      return false;
    }
  }

  const dueDayNum =
    typeof formData.monthlyDueDay === 'number'
      ? formData.monthlyDueDay
      : parseInt(formData.monthlyDueDay || '', 10);
  if (
    isNaN(dueDayNum) ||
    dueDayNum < 1 ||
    dueDayNum > 31 ||
    !Number.isInteger(Number(formData.monthlyDueDay))
  ) {
    return false;
  }

  return true;
}

export function canSubmitNfrRentPayment(
  formData: {
    amount?: string;
    receiptDocumentId?: string;
    paymentReference?: string;
    paidAt?: string;
    notes?: string;
  },
  isSubmitting: boolean = false
): boolean {
  if (isSubmitting) return false;
  if (!formData.amount || formData.amount.trim() === '') return false;

  const num = parseFloat(formData.amount.trim());
  if (isNaN(num) || num <= 0 || !/^\d+(\.\d{1,2})?$/.test(formData.amount.trim())) {
    return false;
  }

  if (!formData.receiptDocumentId || formData.receiptDocumentId.trim() === '') return false;
  return true;
}

/**
 * Filter utility sub-meters eligible for NFR lease linkage
 */
export function getEligibleNfrSubMeters(
  subMeters: UtilitySubMeter[] | null | undefined,
  outletId?: string | null,
  isEdit: boolean = false,
  currentSubMeterId?: string | null
): UtilitySubMeter[] {
  if (!subMeters || !Array.isArray(subMeters)) return [];

  return subMeters.filter((meter) => {
    // Beneficiary must be NFR_VENDOR
    if (meter.beneficiaryType !== 'NFR_VENDOR') return false;

    // Must match outletId if provided
    if (outletId && meter.outletId !== outletId) return false;

    // For create: only ACTIVE meters
    if (!isEdit) {
      return meter.status === 'ACTIVE';
    }

    // For edit: ACTIVE or currently linked meter even if inactive
    if (meter.status === 'ACTIVE') return true;
    if (currentSubMeterId && meter.id === currentSubMeterId) return true;

    return false;
  });
}

/**
 * Resolves document metadata from vault list by ID within the same outlet
 */
export function resolveNfrDocument<
  T extends {
    id: string;
    outletId?: string | null;
    fileName?: string;
    name?: string;
    fileSize?: number;
    sizeBytes?: number;
    createdAt?: string;
  }
>(
  docs: T[] | null | undefined,
  documentId: string | null | undefined,
  outletId: string
): T | null {
  if (!docs || !Array.isArray(docs) || !documentId || !outletId) return null;
  const match = docs.find((d) => d.id === documentId && d.outletId === outletId);
  return match || null;
}

/**
 * Translates domain error codes into clear user-friendly messages
 */
export function getNfrErrorMessage(err: any): string {
  if (!err) return 'An unexpected error occurred.';
  const code = typeof err === 'string' ? err : err.code || err.message;
  const rawMsg = typeof err === 'object' ? err.message : '';

  switch (code) {
    case 'NFR_SPACE_NOT_FOUND':
      return 'NFR space was not found.';
    case 'NFR_SPACE_CODE_EXISTS':
      return 'An NFR space with this code already exists for this outlet.';
    case 'NFR_SPACE_NOT_ACTIVE':
      return 'The selected NFR space is inactive and cannot be assigned to a new lease.';
    case 'NFR_VENDOR_NOT_FOUND':
      return 'NFR vendor was not found.';
    case 'NFR_VENDOR_NOT_ACTIVE':
      return 'The selected vendor is inactive and cannot be assigned to a new lease.';
    case 'NFR_LEASE_NOT_FOUND':
      return 'Lease agreement was not found.';
    case 'NFR_AGREEMENT_EXISTS':
      return 'A lease agreement with this number already exists for this outlet.';
    case 'NFR_SPACE_LEASE_OVERLAP':
      return 'The selected space already has an active lease overlapping with this period.';
    case 'NFR_LEASE_SPACE_OUTLET_MISMATCH':
      return 'The selected space belongs to a different outlet.';
    case 'NFR_LEASE_VENDOR_OUTLET_MISMATCH':
      return 'The selected vendor belongs to a different outlet.';
    case 'NFR_LEASE_DOCUMENT_NOT_FOUND':
      return 'The selected agreement document could not be found.';
    case 'NFR_LEASE_DOCUMENT_OUTLET_MISMATCH':
      return 'The agreement document does not belong to this outlet.';
    case 'NFR_LEASE_SUB_METER_NOT_FOUND':
      return 'The linked sub-meter could not be found.';
    case 'NFR_LEASE_SUB_METER_OUTLET_MISMATCH':
      return 'The linked sub-meter belongs to a different outlet.';
    case 'NFR_LEASE_SUB_METER_NOT_NFR':
      return 'The linked sub-meter must have beneficiary type NFR_VENDOR.';
    case 'NFR_LEASE_TERMINATED_IMMUTABLE':
      return 'Terminated leases cannot be modified.';
    case 'NFR_LEASE_ALREADY_TERMINATED':
      return 'This lease has already been terminated. The latest lease data has been reloaded.';
    case 'NFR_LEASE_STATE_CHANGED':
      return 'The lease changed while you were editing it. The latest data has been reloaded.';
    case 'NFR_RENT_DUE_NOT_FOUND':
      return 'Rent due record was not found.';
    case 'NFR_RENT_DUE_EXISTS':
      return 'A rent due has already been generated for this lease and billing month.';
    case 'NFR_RENT_DUE_IMMUTABLE':
      return 'Rent dues are immutable financial records and cannot be modified or deleted.';
    case 'NFR_RENT_RECEIPT_NOT_FOUND':
      return 'Payment receipt document was not found in the Document Vault.';
    case 'NFR_RENT_RECEIPT_OUTLET_MISMATCH':
      return 'The payment receipt document does not belong to this outlet.';
    case 'NFR_RENT_ALREADY_PAID':
      return 'This rent due has already been fully paid. The latest ledger has been reloaded.';
    case 'NFR_RENT_OVERPAYMENT':
      return 'The payment exceeds the current outstanding balance. The latest rent ledger has been reloaded.';
    case 'NFR_RENT_PAYMENT_IMMUTABLE':
      return 'Rent payments are immutable records and cannot be modified or deleted.';
    case 'NFR_RENT_LEDGER_INTEGRITY_ERROR':
      return 'A rent payment ledger integrity violation was detected.';
    case 'NFR_SUMMARY_OVERFLOW':
      return 'Calculated financial totals exceeded numerical boundaries.';
    case 'FORBIDDEN':
      return 'You do not have permission to perform this action.';
    case 'VALIDATION_ERROR':
      return rawMsg || 'Please check the form for invalid or missing input fields.';
    case 'NETWORK_ERROR':
      return 'Network communication failed. Please check your connection.';
    case 'INTERNAL_SERVER_ERROR':
      return 'An unexpected server error occurred.';
    default:
      if (
        typeof code === 'string' &&
        (code.includes('SQLITE') ||
          code.includes('constraint failed') ||
          code.includes('Failed query'))
      ) {
        return 'An error occurred while processing your request.';
      }
      return rawMsg || 'An error occurred while processing your request.';
  }
}
