/**
 * Utility UI formatting and helper functions for Phase 4A-2 Frontend Workspace
 */

export interface BillStatusDisplay {
  label: string;
  badgeClass: string;
  isOverdue: boolean;
}

export interface SubMeterStatusDisplay {
  label: string;
  badgeClass: string;
}

/**
 * Returns formatted status label and badge CSS classes for electricity bills
 */
export function getBillStatusDisplay(bill: { status: string; isOverdue?: boolean }): BillStatusDisplay {
  if (bill.status === 'PAID') {
    return {
      label: 'Paid',
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      isOverdue: false,
    };
  }

  if (bill.isOverdue) {
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
 * Alias for formatUtilityStatus
 */
export function formatUtilityStatus(status: string, isOverdue?: boolean): { label: string; badgeClass: string } {
  return getBillStatusDisplay({ status, isOverdue });
}

/**
 * Formats sub-meter beneficiary type into human-friendly text
 */
export function formatBeneficiaryType(type: string): string {
  switch (type) {
    case 'NFR_VENDOR':
      return 'NFR Vendor';
    case 'CNG_FACILITY':
      return 'CNG Facility';
    case 'OTHER':
      return 'Other Facility';
    default:
      return type || 'Unknown';
  }
}

/**
 * Formats sub-meter status into badge class and label
 */
export function formatSubMeterStatus(status: string): SubMeterStatusDisplay {
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
    case 'DECOMMISSIONED':
      return {
        label: 'Decommissioned',
        badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      };
    default:
      return {
        label: status || 'Unknown',
        badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
      };
  }
}

/**
 * Formats account status into badge class and label
 */
export function formatAccountStatus(status: string): { label: string; badgeClass: string } {
  if (status === 'ACTIVE') {
    return {
      label: 'Active',
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    };
  }
  return {
    label: 'Inactive',
    badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  };
}

/**
 * Formats file size in bytes to human-readable string
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Formats ISO date string to readable display date (e.g. 15 Aug 2026)
 */
export function formatDisplayDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  try {
    const parts = dateStr.slice(0, 10).split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(Date.UTC(year, month, day));
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

/**
 * Formats ISO date-time string to readable display timestamp
 */
export function formatDisplayDateTime(dateTimeStr?: string | null): string {
  if (!dateTimeStr) return '-';
  try {
    const d = new Date(dateTimeStr);
    if (isNaN(d.getTime())) return dateTimeStr;
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return dateTimeStr;
  }
}

/**
 * Pure helper: Check if bill can be edited
 */
export function canEditBill(bill: { status: string }, hasWritePermission: boolean): boolean {
  return hasWritePermission && bill.status === 'PENDING';
}

/**
 * Pure helper: Check if bill can be marked as paid
 */
export function canMarkBillPaid(bill: { status: string }, hasPaymentPermission: boolean): boolean {
  return hasPaymentPermission && bill.status === 'PENDING';
}

/**
 * Pure helper: Check if sub-meter can accept new readings
 */
export function canRecordReading(subMeter: { status: string }, hasReadingPermission: boolean): boolean {
  return hasReadingPermission && subMeter.status === 'ACTIVE';
}

/**
 * Pure helper: Check if electricity account master can be edited
 */
export function canEditAccount(hasAccountPermission: boolean): boolean {
  return hasAccountPermission;
}

/**
 * Pure helper: Check if sub-meter master can be edited
 */
export function canEditSubMeter(hasSubMeterPermission: boolean): boolean {
  return hasSubMeterPermission;
}

/**
 * Pure helper: Check if utility bill form is submittable (requires valid billDocumentId)
 */
export function canSubmitUtilityBill(formData: {
  electricityAccountId?: string;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  billAmount?: string;
  dueDate?: string;
  billDocumentId?: string;
  hasAccounts?: boolean;
}, isSubmitting: boolean = false): boolean {
  if (isSubmitting) return false;
  if (formData.hasAccounts === false) return false;
  if (!formData.electricityAccountId || formData.electricityAccountId.trim() === '') return false;
  if (!formData.billingPeriodStart || formData.billingPeriodStart.trim() === '') return false;
  if (!formData.billingPeriodEnd || formData.billingPeriodEnd.trim() === '') return false;
  if (!formData.billAmount || formData.billAmount.trim() === '') return false;
  if (!formData.dueDate || formData.dueDate.trim() === '') return false;
  if (!formData.billDocumentId || formData.billDocumentId.trim() === '') return false;
  return true;
}

/**
 * Pure helper: Check if utility payment form is submittable (requires valid paymentReceiptDocumentId)
 */
export function canSubmitUtilityPayment(formData: {
  paymentReceiptDocumentId?: string;
}, isSubmitting: boolean = false): boolean {
  if (isSubmitting) return false;
  if (!formData.paymentReceiptDocumentId || formData.paymentReceiptDocumentId.trim() === '') return false;
  return true;
}

export interface UtilityFilterState {
  billFilterStatus: string;
  billFilterFromDate: string;
  billFilterToDate: string;
  smFilterBeneficiaryType: string;
  smFilterStatus: string;
  chargeFilterFromDate: string;
  chargeFilterToDate: string;
  chargeFilterSubMeterId: string;
}

/**
 * Pure helper: Returns empty/reset filter state for outlet switch
 */
export function getResetUtilityFilters(): UtilityFilterState {
  return {
    billFilterStatus: '',
    billFilterFromDate: '',
    billFilterToDate: '',
    smFilterBeneficiaryType: '',
    smFilterStatus: '',
    chargeFilterFromDate: '',
    chargeFilterToDate: '',
    chargeFilterSubMeterId: '',
  };
}

/**
 * Pure helper: Filters documents by outlet ID
 */
export function filterDocumentsForOutlet<T extends { outletId: string }>(docs: T[], outletId: string): T[] {
  if (!Array.isArray(docs)) return [];
  return docs.filter(doc => doc.outletId === outletId);
}

/**
 * Pure helper: Build query string for electricity bills filter excluding empty parameters
 */
export function buildBillQueryParams(filters: { status?: string; fromDate?: string; toDate?: string }): string {
  const params = new URLSearchParams();
  if (filters.status && filters.status.trim() !== '') {
    params.append('status', filters.status.trim());
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
 * Pure helper: Build query string for sub-meters filter excluding empty parameters
 */
export function buildSubMeterQueryParams(filters: { beneficiaryType?: string; status?: string }): string {
  const params = new URLSearchParams();
  if (filters.beneficiaryType && filters.beneficiaryType.trim() !== '') {
    params.append('beneficiaryType', filters.beneficiaryType.trim());
  }
  if (filters.status && filters.status.trim() !== '') {
    params.append('status', filters.status.trim());
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Pure helper: Build query string for sub-meter charge summary filter excluding empty parameters
 */
export function buildChargeSummaryQueryParams(filters: { fromDate?: string; toDate?: string; subMeterId?: string }): string {
  const params = new URLSearchParams();
  if (filters.fromDate && filters.fromDate.trim() !== '') {
    params.append('fromDate', filters.fromDate.trim());
  }
  if (filters.toDate && filters.toDate.trim() !== '') {
    params.append('toDate', filters.toDate.trim());
  }
  if (filters.subMeterId && filters.subMeterId.trim() !== '') {
    params.append('subMeterId', filters.subMeterId.trim());
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Validates date range guard (fromDate <= toDate)
 */
export function validateDateRange(fromDate?: string, toDate?: string): { valid: boolean; error?: string } {
  if (fromDate && toDate && fromDate.trim() !== '' && toDate.trim() !== '') {
    if (fromDate.trim() > toDate.trim()) {
      return {
        valid: false,
        error: 'From date cannot be after To date.',
      };
    }
  }
  return { valid: true };
}

/**
 * Translates domain error codes into clear user-friendly messages
 */
export function getUtilityErrorMessage(err: any): string {
  if (!err) return 'An unexpected error occurred.';
  const code = typeof err === 'string' ? err : err.code || err.message;

  switch (code) {
    case 'UTILITY_ELECTRICITY_ACCOUNT_NOT_FOUND':
      return 'The specified electricity account could not be found.';
    case 'UTILITY_CONSUMER_NUMBER_EXISTS':
    case 'UTILITY_ELECTRICITY_ACCOUNT_CODE_EXISTS':
      return 'An electricity account with this consumer number already exists at this outlet.';
    case 'UTILITY_ELECTRICITY_BILL_NOT_FOUND':
      return 'The electricity bill could not be found.';
    case 'UTILITY_BILL_PERIOD_EXISTS':
      return 'A bill for this electricity account and billing period already exists.';
    case 'UTILITY_BILL_DOCUMENT_NOT_FOUND':
      return 'The selected bill document could not be found.';
    case 'UTILITY_BILL_DOCUMENT_OUTLET_MISMATCH':
      return 'The selected bill document does not belong to this retail outlet.';
    case 'UTILITY_PAYMENT_RECEIPT_NOT_FOUND':
      return 'The payment receipt document could not be found.';
    case 'UTILITY_PAYMENT_RECEIPT_OUTLET_MISMATCH':
      return 'The payment receipt document does not belong to this retail outlet.';
    case 'UTILITY_BILL_ALREADY_PAID':
      return 'This electricity bill has already been marked as paid.';
    case 'UTILITY_BILL_PAID_IMMUTABLE':
      return 'Paid bills cannot be modified.';
    case 'UTILITY_SUB_METER_NOT_FOUND':
      return 'The specified sub-meter could not be found.';
    case 'UTILITY_SUB_METER_CODE_EXISTS':
      return 'A sub-meter with this meter code already exists at this outlet.';
    case 'UTILITY_SUB_METER_SERIAL_EXISTS':
      return 'A sub-meter with this serial number already exists at this outlet.';
    case 'SUB_METER_NOT_ACTIVE':
      return 'Only active sub-meters can accept new readings.';
    case 'SUB_METER_READING_DECREASE':
      return 'The new meter reading cannot be lower than the previous reading value.';
    case 'SUB_METER_READING_OUT_OF_ORDER':
      return 'The new reading timestamp must be strictly after the previous reading timestamp.';
    case 'SUB_METER_READING_STATE_CHANGED':
      return 'This sub-meter received another reading concurrently. The latest readings have been reloaded.';
    case 'UTILITY_SUB_METER_READING_IMMUTABLE':
      return 'Sub-meter readings are append-only and cannot be modified or deleted.';
    case 'UTILITY_CHARGE_OVERFLOW':
      return 'The calculated electricity charge exceeds safe system calculation limits.';
    case 'UTILITY_SUMMARY_OVERFLOW':
      return 'The total aggregate amounts exceed safe calculation limits.';
    case 'FORBIDDEN':
      return 'You do not have authorization to access or modify this utility record.';
    case 'VALIDATION_ERROR':
      return err.message || 'Please check the form for invalid input fields.';
    case 'NETWORK_ERROR':
      return 'Unable to reach backend server. Please check your network connection.';
    default:
      return err.message || 'An unexpected error occurred. Please try again.';
  }
}
