/**
 * Municipal Taxes & Statutory Dues UI Helper Functions
 * Phase 4B-2 Frontend Workspace
 */

import {
  MunicipalTaxDue,
  MunicipalTaxSummary,
  MunicipalTaxType,
  MunicipalTaxFrequency,
  MunicipalTaxStatus,
  Document,
} from '../../../shared/types';
import { formatDisplayDate, formatDisplayDateTime, formatFileSize } from '../utilities/utilityUi';

export { formatDisplayDate, formatDisplayDateTime, formatFileSize };

export interface MunicipalTaxAttachments {
  assessmentDoc: Document | null;
  receiptDoc: Document | null;
}

/**
 * Pure helper: Resolves assessment and payment receipt documents for a statutory due
 * from an outlet's document list. Ignores documents from other outlets and safely
 * returns null for missing lists or non-matching IDs.
 */
export function resolveMunicipalTaxAttachments(
  documents: Document[] | null | undefined,
  outletId: string,
  assessmentDocumentId?: string | null,
  paymentReceiptDocumentId?: string | null
): MunicipalTaxAttachments {
  if (!documents || !Array.isArray(documents) || !outletId) {
    return { assessmentDoc: null, receiptDoc: null };
  }

  const outletDocs = documents.filter(doc => doc && doc.outletId === outletId);

  const assessmentDoc = assessmentDocumentId
    ? outletDocs.find(doc => doc.id === assessmentDocumentId) || null
    : null;

  const receiptDoc = paymentReceiptDocumentId
    ? outletDocs.find(doc => doc.id === paymentReceiptDocumentId) || null
    : null;

  return { assessmentDoc, receiptDoc };
}

export interface MunicipalTaxStatusDisplay {
  label: string;
  badgeClass: string;
  isOverdue: boolean;
}

/**
 * Returns formatted status label and badge CSS classes for municipal tax dues.
 * PAID always takes precedence over isOverdue.
 */
export function getMunicipalTaxStatusDisplay(due: {
  status: string;
  isOverdue?: boolean;
}): MunicipalTaxStatusDisplay {
  if (due.status === 'PAID') {
    return {
      label: 'Paid',
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      isOverdue: false,
    };
  }

  if (due.isOverdue) {
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
 * Formats statutory tax type into human-friendly text
 */
export function formatTaxType(type: string): string {
  switch (type) {
    case 'PROPERTY_TAX':
      return 'Property Tax';
    case 'TRADE_LICENSE_FEE':
      return 'Trade License Fee';
    case 'SIGNAGE_CHARGE':
      return 'Signage Charge';
    case 'LOCAL_AUTHORITY_DUE':
      return 'Local Authority Due';
    default:
      return type || 'Unknown';
  }
}

/**
 * Formats assessment frequency into human-friendly text
 */
export function formatTaxFrequency(freq: string): string {
  switch (freq) {
    case 'ANNUAL':
      return 'Annual';
    case 'QUARTERLY':
      return 'Quarterly';
    default:
      return freq || 'Unknown';
  }
}

/**
 * Pure helper: Check if due can be edited
 * Editable only if user has write permission AND due status is PENDING
 */
export function canEditMunicipalTaxDue(
  due: { status: string } | null | undefined,
  hasWritePermission: boolean
): boolean {
  if (!due || !hasWritePermission) return false;
  return due.status === 'PENDING';
}

/**
 * Pure helper: Check if due can be marked as paid
 * Mark-paid allowed only if user has payment permission AND due status is PENDING
 */
export function canMarkMunicipalTaxPaid(
  due: { status: string } | null | undefined,
  hasPaymentPermission: boolean
): boolean {
  if (!due || !hasPaymentPermission) return false;
  return due.status === 'PENDING';
}

/**
 * Pure helper: Check if statutory due creation/edit form is submittable.
 * assessmentDocumentId is OPTIONAL.
 * Rejects submitting, blank required fields, or reversed assessment period.
 */
export function canSubmitMunicipalTaxDue(
  formData: {
    taxType?: string;
    authorityName?: string;
    referenceNumber?: string;
    assessmentFrequency?: string;
    assessmentPeriodStart?: string;
    assessmentPeriodEnd?: string;
    amount?: string;
    dueDate?: string;
  },
  isSubmitting: boolean = false
): boolean {
  if (isSubmitting) return false;
  if (!formData.taxType || formData.taxType.trim() === '') return false;
  if (!formData.authorityName || formData.authorityName.trim() === '') return false;
  if (!formData.referenceNumber || formData.referenceNumber.trim() === '') return false;
  if (!formData.assessmentFrequency || formData.assessmentFrequency.trim() === '') return false;
  if (!formData.assessmentPeriodStart || formData.assessmentPeriodStart.trim() === '') return false;
  if (!formData.assessmentPeriodEnd || formData.assessmentPeriodEnd.trim() === '') return false;
  if (!formData.amount || formData.amount.trim() === '') return false;
  if (!formData.dueDate || formData.dueDate.trim() === '') return false;

  // Validate assessment period start <= end
  if (formData.assessmentPeriodEnd < formData.assessmentPeriodStart) {
    return false;
  }

  return true;
}

/**
 * Pure helper: Check if payment form is submittable (requires non-empty paymentReceiptDocumentId)
 */
export function canSubmitMunicipalTaxPayment(
  formData: {
    paymentReceiptDocumentId?: string;
  },
  isSubmitting: boolean = false
): boolean {
  if (isSubmitting) return false;
  if (!formData.paymentReceiptDocumentId || formData.paymentReceiptDocumentId.trim() === '') {
    return false;
  }
  return true;
}

export interface MunicipalTaxFilterState {
  taxType: string;
  status: string;
  assessmentFrequency: string;
  fromDate: string;
  toDate: string;
}

/**
 * Pure helper: Returns empty/reset filter state for outlet switch
 */
export function getResetMunicipalTaxFilters(): MunicipalTaxFilterState {
  return {
    taxType: '',
    status: '',
    assessmentFrequency: '',
    fromDate: '',
    toDate: '',
  };
}

/**
 * Pure helper: Build URL query string from filters, omitting empty values.
 */
export function buildMunicipalTaxQueryParams(filters: Partial<MunicipalTaxFilterState>): string {
  const params = new URLSearchParams();

  if (filters.taxType && filters.taxType.trim() !== '') {
    params.set('taxType', filters.taxType.trim());
  }
  if (filters.status && filters.status.trim() !== '') {
    params.set('status', filters.status.trim());
  }
  if (filters.assessmentFrequency && filters.assessmentFrequency.trim() !== '') {
    params.set('assessmentFrequency', filters.assessmentFrequency.trim());
  }
  if (filters.fromDate && filters.fromDate.trim() !== '') {
    params.set('fromDate', filters.fromDate.trim());
  }
  if (filters.toDate && filters.toDate.trim() !== '') {
    params.set('toDate', filters.toDate.trim());
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

/**
 * Pure helper: Validates date range
 */
export function validateMunicipalTaxDateRange(
  fromDate?: string,
  toDate?: string
): { isValid: boolean; error?: string } {
  if (fromDate && toDate && fromDate > toDate) {
    return {
      isValid: false,
      error: 'From date cannot be after To date.',
    };
  }
  return { isValid: true };
}

/**
 * Maps backend error codes / error objects to user-friendly messages.
 * Never exposes raw SQLite strings.
 */
export function getMunicipalTaxErrorMessage(err: any): string {
  if (!err) return 'An unexpected error occurred.';

  const code = err.code || (err.error && err.error.code) || '';
  const message = err.message || (err.error && err.error.message) || '';

  switch (code) {
    case 'MUNICIPAL_TAX_DUE_NOT_FOUND':
      return 'The requested statutory due was not found.';
    case 'MUNICIPAL_TAX_DUE_EXISTS':
      return 'A statutory due with the same tax type, authority, reference number and assessment period already exists for this outlet.';
    case 'MUNICIPAL_TAX_DOCUMENT_NOT_FOUND':
      return 'The specified assessment document could not be found.';
    case 'MUNICIPAL_TAX_DOCUMENT_OUTLET_MISMATCH':
      return 'The selected assessment document belongs to a different outlet.';
    case 'MUNICIPAL_TAX_RECEIPT_NOT_FOUND':
      return 'The specified payment receipt document could not be found.';
    case 'MUNICIPAL_TAX_RECEIPT_OUTLET_MISMATCH':
      return 'The selected payment receipt document belongs to a different outlet.';
    case 'MUNICIPAL_TAX_ALREADY_PAID':
      return 'This statutory due has already been marked as paid. The latest record has been reloaded.';
    case 'MUNICIPAL_TAX_PAID_IMMUTABLE':
      return 'This statutory due is already paid and cannot be modified.';
    case 'MUNICIPAL_TAX_STATE_CHANGED':
      return 'The statutory due changed while you were viewing it. The latest record has been reloaded.';
    case 'MUNICIPAL_TAX_SUMMARY_OVERFLOW':
      return 'The aggregate municipal tax amount exceeds the supported financial ceiling.';
    case 'VALIDATION_ERROR':
      return message || 'Invalid input provided. Please check all fields.';
    case 'FORBIDDEN':
      return 'You do not have permission to perform this action.';
    case 'NETWORK_ERROR':
      return 'Network error. Please check your connection and try again.';
    default:
      if (typeof message === 'string' && message.trim() !== '') {
        // Filter out raw SQL errors if any leaked
        if (message.includes('SQLITE_') || message.includes('DrizzleQueryError') || message.includes('trg_')) {
          return 'Database operation failed. Please verify your inputs and try again.';
        }
        return message;
      }
      return 'An unexpected error occurred. Please try again.';
  }
}
