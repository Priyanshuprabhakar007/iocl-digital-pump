export type CocoComplianceStatus =
  | 'VALID'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'PAYMENT_PENDING'
  | 'ACTION_REQUIRED'
  | 'NOT_RECORDED'
  | 'NOT_APPLICABLE';

export type CocoPaymentStatus =
  | 'PAID'
  | 'PENDING'
  | 'OVERDUE'
  | 'NOT_APPLICABLE'
  | 'NOT_RECORDED';

export type CocoStatusYesNo = 'YES' | 'NO' | 'NA' | 'NOT_RECORDED';

export type CocoAuthoritativeSource =
  | 'MANUAL'
  | 'MUNICIPAL_TAX_MODULE'
  | 'NFR_LEASE_RENT_MODULE'
  | 'UTILITY_BILLS_MODULE'
  | 'NONE';

export interface StandardCocoCategoryDef {
  srNo: number;
  code: string;
  particular: string;
  defaultFrequency: string;
  linkedModule: CocoAuthoritativeSource;
  supportsServiceDate: boolean;
  supportsAmount: boolean;
  description: string;
}

export const STANDARD_COCO_CATEGORIES: readonly StandardCocoCategoryDef[] = [
  {
    srNo: 1,
    code: 'PESO_LICENCE',
    particular: 'PESO Licence',
    defaultFrequency: 'Yearly / Multi-Year',
    linkedModule: 'MANUAL',
    supportsServiceDate: false,
    supportsAmount: true,
    description: 'Explosives / Petroleum storage and dispensing statutory licence',
  },
  {
    srNo: 2,
    code: 'PROPERTY_TAX',
    particular: 'Property Tax',
    defaultFrequency: 'Yearly / Quarterly',
    linkedModule: 'MUNICIPAL_TAX_MODULE',
    supportsServiceDate: false,
    supportsAmount: true,
    description: 'Municipal property tax assessment and payment status',
  },
  {
    srNo: 3,
    code: 'LEASE_RENT',
    particular: 'Lease Rent',
    defaultFrequency: 'Monthly / Yearly',
    linkedModule: 'NFR_LEASE_RENT_MODULE',
    supportsServiceDate: false,
    supportsAmount: true,
    description: 'Land / NFR lease rent dues and agreement compliance',
  },
  {
    srNo: 4,
    code: 'ELECTRICITY_BILL',
    particular: 'Electricity Bill',
    defaultFrequency: 'Monthly',
    linkedModule: 'UTILITY_BILLS_MODULE',
    supportsServiceDate: false,
    supportsAmount: true,
    description: 'Outlet electricity utility bill and payment status',
  },
  {
    srNo: 5,
    code: 'WATER_BILL',
    particular: 'Water Bill',
    defaultFrequency: 'Monthly / Quarterly',
    linkedModule: 'MUNICIPAL_TAX_MODULE',
    supportsServiceDate: false,
    supportsAmount: true,
    description: 'Municipal water bill / water tax due and payment status',
  },
  {
    srNo: 6,
    code: 'WATER_COOLER_MAINTENANCE',
    particular: 'Water Cooler Maintenance',
    defaultFrequency: 'Quarterly / Half-Yearly',
    linkedModule: 'MANUAL',
    supportsServiceDate: true,
    supportsAmount: true,
    description: 'Drinking water cooler AMC, filter replacement, and hygiene service',
  },
  {
    srNo: 7,
    code: 'WEIGHTS_MEASURES_STAMPING',
    particular: 'Weights & Measures Stamping',
    defaultFrequency: 'Yearly',
    linkedModule: 'MANUAL',
    supportsServiceDate: true,
    supportsAmount: true,
    description: 'Legal Metrology dispensing unit nozzle verification & stamping certificate',
  },
  {
    srNo: 8,
    code: 'FIRE_EXTINGUISHER_REFILLING',
    particular: 'Fire Extinguisher Refilling',
    defaultFrequency: 'Yearly',
    linkedModule: 'MANUAL',
    supportsServiceDate: true,
    supportsAmount: true,
    description: 'Fire extinguisher refilling, hydro-testing, and safety inspection',
  },
  {
    srNo: 9,
    code: 'POS_AUTOMATION',
    particular: 'POS / Automation',
    defaultFrequency: 'Monthly / Ongoing',
    linkedModule: 'MANUAL',
    supportsServiceDate: true,
    supportsAmount: false,
    description: 'Forecourt automation, ATG/FCC connectivity, and POS terminal health',
  },
  {
    srNo: 10,
    code: 'GENERATOR_MAINTENANCE',
    particular: 'Generator Maintenance',
    defaultFrequency: 'Half-Yearly / Yearly',
    linkedModule: 'MANUAL',
    supportsServiceDate: true,
    supportsAmount: true,
    description: 'DG Set preventive maintenance, B-check service, and battery health',
  },
  {
    srNo: 11,
    code: 'CCTV_HEALTH_STATUS',
    particular: 'CCTV Health Status',
    defaultFrequency: 'Monthly / Ongoing',
    linkedModule: 'MANUAL',
    supportsServiceDate: true,
    supportsAmount: false,
    description: 'CCTV camera coverage, DVR/NVR recording retention, and health status',
  },
  {
    srNo: 12,
    code: 'PPL_LICENCE',
    particular: 'Public Performance Licence (PPL)',
    defaultFrequency: 'Yearly',
    linkedModule: 'MANUAL',
    supportsServiceDate: false,
    supportsAmount: true,
    description: 'Public Performance Licence or Not-Applicable declaration',
  },
  {
    srNo: 13,
    code: 'SERVICE_PROVIDER_CONTRACT',
    particular: 'Service Provider Contract Agreement',
    defaultFrequency: 'Tenure / Yearly',
    linkedModule: 'MANUAL',
    supportsServiceDate: false,
    supportsAmount: true,
    description: 'COCO operator / M&H contractor agreement validity and renewal status',
  },
  {
    srNo: 14,
    code: 'WAGES_INCENTIVES_MISC',
    particular: 'Wages, Incentives & Miscellaneous Bills',
    defaultFrequency: 'Monthly',
    linkedModule: 'MANUAL',
    supportsServiceDate: false,
    supportsAmount: true,
    description: 'Staff wages, PF/ESIC statutory compliance, incentives, and miscellaneous bills',
  },
] as const;

export const STANDARD_CATEGORY_MAP = new Map<string, StandardCocoCategoryDef>(
  STANDARD_COCO_CATEGORIES.map((cat) => [cat.code, cat])
);

export interface CocoAttachmentInfo {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface LinkedModuleSummary {
  source: CocoAuthoritativeSource;
  sourceLabel: string;
  recordCount: number;
  referenceNumber: string | null;
  dueDate: string | null;
  amountPaise: number | null;
  frequency: string | null;
  paymentStatus: CocoPaymentStatus;
  paidAt: string | null;
  documentIds: string[];
  summaryText: string;
}

export interface CocoComplianceMergedItem {
  id: string | null;
  outletId: string;
  roCode: string;
  outletName: string;
  srNo: number;
  categoryCode: string;
  categoryName: string;
  isCustomCategory: boolean;
  documentTitle: string | null;
  referenceNumber: string | null;
  issueDate: string | null;
  validityDueDate: string | null;
  lastServiceDate: string | null;
  amountPaise: number | null;
  frequency: string | null;
  paymentStatus: CocoPaymentStatus;
  paymentDate: string | null;
  documentValidityStatus: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'NOT_RECORDED' | 'NOT_APPLICABLE';
  complianceStatus: CocoComplianceStatus;
  statusYesNo: CocoStatusYesNo;
  remarks: string | null;
  actionRequired: string | null;
  responsiblePerson: string | null;
  attachmentDocumentIds: string[];
  attachments: CocoAttachmentInfo[];
  authoritativeSource: CocoAuthoritativeSource;
  linkedModuleData: LinkedModuleSummary | null;
  hasDiscrepancy: boolean;
  discrepancyNote: string | null;
  daysUntilDue: number | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CocoDueDatesAndActionsSummary {
  expired: CocoComplianceMergedItem[];
  expiringWithin30Days: CocoComplianceMergedItem[];
  expiringWithin60Days: CocoComplianceMergedItem[];
  expiringWithin90Days: CocoComplianceMergedItem[];
  paymentsPending: CocoComplianceMergedItem[];
  serviceActionsPending: CocoComplianceMergedItem[];
  notRecorded: CocoComplianceMergedItem[];
}

export interface CocoOnePagerRow {
  srNo: number;
  categoryCode: string;
  particular: string;
  statusYesNoDisplay: string;
  validityDueDateDisplay: string;
  amountInrDisplay: string;
  frequencyDisplay: string;
  remarksActionRequiredDisplay: string;
  complianceStatus: CocoComplianceStatus;
  paymentStatus: CocoPaymentStatus;
  authoritativeSource: CocoAuthoritativeSource;
  hasDiscrepancy: boolean;
}

export interface CocoOnePagerReport {
  outletId: string;
  outletName: string;
  roCode: string;
  reportDate: string;
  generatedAt: string;
  generatedBy: string;
  rows: CocoOnePagerRow[];
  customRows: CocoOnePagerRow[];
  summary: {
    totalCategories: number;
    validCount: number;
    expiringSoonCount: number;
    expiredCount: number;
    paymentPendingCount: number;
    actionRequiredCount: number;
    notRecordedCount: number;
    notApplicableCount: number;
    discrepancyCount: number;
  };
}

/**
 * Computes signed whole days between reportDate (YYYY-MM-DD) and targetDate (YYYY-MM-DD).
 * Returns negative if targetDate < reportDate (already expired/overdue).
 */
export function computeDaysBetweenDates(reportDate: string, targetDate: string | null | undefined): number | null {
  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate.trim())) {
    return null;
  }
  if (!reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate.trim())) {
    return null;
  }
  const [ry, rm, rd] = reportDate.trim().split('-').map(Number);
  const [ty, tm, td] = targetDate.trim().split('-').map(Number);
  const reportUtc = Date.UTC(ry, rm - 1, rd);
  const targetUtc = Date.UTC(ty, tm - 1, td);
  if (Number.isNaN(reportUtc) || Number.isNaN(targetUtc)) {
    return null;
  }
  return Math.round((targetUtc - reportUtc) / (1000 * 60 * 60 * 24));
}

/**
 * Evaluates document validity status strictly from validityDueDate vs reportDate.
 */
export function evaluateDocumentValidityStatus(params: {
  hasRecordOrModuleData: boolean;
  statusYesNo: CocoStatusYesNo;
  validityDueDate: string | null;
  reportDate: string;
}): 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'NOT_RECORDED' | 'NOT_APPLICABLE' {
  if (!params.hasRecordOrModuleData) {
    return 'NOT_RECORDED';
  }
  if (params.statusYesNo === 'NA') {
    return 'NOT_APPLICABLE';
  }
  const days = computeDaysBetweenDates(params.reportDate, params.validityDueDate);
  if (days !== null) {
    if (days < 0) return 'EXPIRED';
    if (days <= 30) return 'EXPIRING_SOON';
    return 'VALID';
  }
  if (params.statusYesNo === 'YES') {
    return 'VALID';
  }
  return 'NOT_RECORDED';
}

/**
 * Evaluates overall compliance status on reportDate while keeping document validity
 * separate from payment status (an unpaid property tax / utility / lease record
 * shows PAYMENT_PENDING even if its assessment/agreement document exists and is not expired).
 */
export function evaluateComplianceStatus(params: {
  hasRecordOrModuleData: boolean;
  statusYesNo: CocoStatusYesNo;
  validityDueDate: string | null;
  paymentStatus: CocoPaymentStatus;
  manualComplianceOverride?: CocoComplianceStatus | null;
  actionRequired?: string | null;
  reportDate: string;
}): {
  complianceStatus: CocoComplianceStatus;
  documentValidityStatus: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'NOT_RECORDED' | 'NOT_APPLICABLE';
  daysUntilDue: number | null;
} {
  const daysUntilDue = computeDaysBetweenDates(params.reportDate, params.validityDueDate);
  const documentValidityStatus = evaluateDocumentValidityStatus({
    hasRecordOrModuleData: params.hasRecordOrModuleData,
    statusYesNo: params.statusYesNo,
    validityDueDate: params.validityDueDate,
    reportDate: params.reportDate,
  });

  // Never treat missing records as valid, paid, or verified
  if (!params.hasRecordOrModuleData) {
    return {
      complianceStatus: 'NOT_RECORDED',
      documentValidityStatus: 'NOT_RECORDED',
      daysUntilDue: null,
    };
  }

  if (params.statusYesNo === 'NA' || params.manualComplianceOverride === 'NOT_APPLICABLE') {
    return {
      complianceStatus: 'NOT_APPLICABLE',
      documentValidityStatus: 'NOT_APPLICABLE',
      daysUntilDue,
    };
  }

  // 1. Unpaid / pending payment takes priority over document validity so unpaid tax/rent/utility never appears VALID
  if (
    params.paymentStatus === 'PENDING' ||
    params.paymentStatus === 'OVERDUE' ||
    params.manualComplianceOverride === 'PAYMENT_PENDING'
  ) {
    return {
      complianceStatus: 'PAYMENT_PENDING',
      documentValidityStatus,
      daysUntilDue,
    };
  }

  // 2. Date-based expiration relative to selected reportDate
  if (daysUntilDue !== null && daysUntilDue < 0) {
    return {
      complianceStatus: 'EXPIRED',
      documentValidityStatus: 'EXPIRED',
      daysUntilDue,
    };
  }

  // 3. Explicit action required or operational 'NO'
  if (
    params.manualComplianceOverride === 'ACTION_REQUIRED' ||
    params.statusYesNo === 'NO' ||
    Boolean(params.actionRequired && params.actionRequired.trim() !== '')
  ) {
    return {
      complianceStatus: 'ACTION_REQUIRED',
      documentValidityStatus,
      daysUntilDue,
    };
  }

  // 4. Expiring within 30 days of reportDate
  if (daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 30) {
    return {
      complianceStatus: 'EXPIRING_SOON',
      documentValidityStatus: 'EXPIRING_SOON',
      daysUntilDue,
    };
  }

  // 5. Valid if we have positive confirmation (valid date > 30 days, PAID status, or YES status)
  if (
    (daysUntilDue !== null && daysUntilDue > 30) ||
    params.paymentStatus === 'PAID' ||
    params.statusYesNo === 'YES' ||
    params.manualComplianceOverride === 'VALID'
  ) {
    return {
      complianceStatus: 'VALID',
      documentValidityStatus: documentValidityStatus === 'NOT_RECORDED' ? 'VALID' : documentValidityStatus,
      daysUntilDue,
    };
  }

  return {
    complianceStatus: 'NOT_RECORDED',
    documentValidityStatus: 'NOT_RECORDED',
    daysUntilDue,
  };
}

/**
 * Formats integer paise into Indian Rupee format for UI (with ₹) or PDF (ASCII-safe Rs. / ₹).
 */
export function formatIndianCurrencyFromPaise(
  amountPaise: number | null | undefined,
  options?: { asciiPrefix?: boolean; fallback?: string }
): string {
  if (amountPaise === null || amountPaise === undefined || Number.isNaN(amountPaise)) {
    return options?.fallback ?? 'Not Recorded';
  }
  const rupees = amountPaise / 100;
  const hasPaise = amountPaise % 100 !== 0;
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(rupees);
  const prefix = options?.asciiPrefix ? 'Rs. ' : '₹';
  return `${prefix}${formatted}`;
}

/**
 * Formats YYYY-MM-DD into DD-MMM-YYYY (e.g. 2026-03-31 -> 31-Mar-2026) or returns fallback.
 */
export function formatComplianceDateDisplay(
  isoDate: string | null | undefined,
  fallback = 'Not Recorded'
): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}/.test(isoDate.trim())) {
    return fallback;
  }
  const clean = isoDate.trim().slice(0, 10);
  const [y, m, d] = clean.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (!y || !m || !d || m < 1 || m > 12) return clean;
  const dd = String(d).padStart(2, '0');
  return `${dd}-${months[m - 1]}-${y}`;
}

/**
 * Builds the Due Dates & Pending Actions buckets for Tab 3 from merged compliance items.
 */
export function buildDueDatesAndActionsSummary(
  items: CocoComplianceMergedItem[]
): CocoDueDatesAndActionsSummary {
  const expired: CocoComplianceMergedItem[] = [];
  const expiringWithin30Days: CocoComplianceMergedItem[] = [];
  const expiringWithin60Days: CocoComplianceMergedItem[] = [];
  const expiringWithin90Days: CocoComplianceMergedItem[] = [];
  const paymentsPending: CocoComplianceMergedItem[] = [];
  const serviceActionsPending: CocoComplianceMergedItem[] = [];
  const notRecorded: CocoComplianceMergedItem[] = [];

  for (const item of items) {
    if (item.complianceStatus === 'NOT_RECORDED') {
      notRecorded.push(item);
      continue;
    }
    if (item.complianceStatus === 'NOT_APPLICABLE') {
      continue;
    }

    if (item.daysUntilDue !== null) {
      if (item.daysUntilDue < 0) {
        expired.push(item);
      } else {
        if (item.daysUntilDue <= 30) {
          expiringWithin30Days.push(item);
        }
        if (item.daysUntilDue <= 60) {
          expiringWithin60Days.push(item);
        }
        if (item.daysUntilDue <= 90) {
          expiringWithin90Days.push(item);
        }
      }
    } else if (item.complianceStatus === 'EXPIRED') {
      expired.push(item);
    }

    if (
      item.paymentStatus === 'PENDING' ||
      item.paymentStatus === 'OVERDUE' ||
      item.complianceStatus === 'PAYMENT_PENDING'
    ) {
      paymentsPending.push(item);
    }

    if (
      item.complianceStatus === 'ACTION_REQUIRED' ||
      Boolean(item.actionRequired && item.actionRequired.trim() !== '') ||
      item.statusYesNo === 'NO' ||
      item.hasDiscrepancy
    ) {
      serviceActionsPending.push(item);
    }
  }

  return {
    expired,
    expiringWithin30Days,
    expiringWithin60Days,
    expiringWithin90Days,
    paymentsPending,
    serviceActionsPending,
    notRecorded,
  };
}

/**
 * Converts a merged compliance item into a printable One-Pager row.
 * Missing data is shown as 'Not Recorded' or '-' and never invented.
 */
export function toCocoOnePagerRow(item: CocoComplianceMergedItem): CocoOnePagerRow {
  let statusYesNoDisplay = 'Not Recorded';
  if (item.complianceStatus === 'NOT_RECORDED') {
    statusYesNoDisplay = 'Not Recorded';
  } else if (item.statusYesNo === 'NA' || item.complianceStatus === 'NOT_APPLICABLE') {
    statusYesNoDisplay = 'N/A';
  } else if (
    item.statusYesNo === 'YES' &&
    item.complianceStatus !== 'EXPIRED' &&
    item.complianceStatus !== 'PAYMENT_PENDING'
  ) {
    statusYesNoDisplay = 'Yes';
  } else if (
    item.statusYesNo === 'NO' ||
    item.complianceStatus === 'EXPIRED' ||
    item.complianceStatus === 'PAYMENT_PENDING' ||
    item.complianceStatus === 'ACTION_REQUIRED'
  ) {
    statusYesNoDisplay = item.statusYesNo === 'YES' ? 'Yes (Due)' : 'No';
  } else if (item.statusYesNo === 'YES') {
    statusYesNoDisplay = 'Yes';
  }

  const validityParts: string[] = [];
  if (item.validityDueDate) {
    validityParts.push(formatComplianceDateDisplay(item.validityDueDate));
  }
  if (item.lastServiceDate) {
    validityParts.push(`Last Svc: ${formatComplianceDateDisplay(item.lastServiceDate)}`);
  }
  const validityDueDateDisplay =
    item.complianceStatus === 'NOT_APPLICABLE'
      ? 'N/A'
      : validityParts.length > 0
      ? validityParts.join(' | ')
      : item.complianceStatus === 'NOT_RECORDED'
      ? 'Not Recorded'
      : '-';

  const amountInrDisplay =
    item.complianceStatus === 'NOT_APPLICABLE'
      ? '-'
      : item.amountPaise !== null && item.amountPaise !== undefined
      ? formatIndianCurrencyFromPaise(item.amountPaise, { fallback: '-' })
      : item.complianceStatus === 'NOT_RECORDED'
      ? 'Not Recorded'
      : '-';

  const frequencyDisplay =
    item.complianceStatus === 'NOT_APPLICABLE'
      ? 'N/A'
      : item.frequency && item.frequency.trim() !== ''
      ? item.frequency.trim()
      : item.complianceStatus === 'NOT_RECORDED'
      ? 'Not Recorded'
      : '-';

  const remarksSegments: string[] = [];
  if (item.complianceStatus === 'NOT_RECORDED') {
    remarksSegments.push('Not Recorded — Compliance entry pending');
  } else {
    if (item.referenceNumber) {
      remarksSegments.push(`Ref: ${item.referenceNumber}`);
    }
    if (item.paymentStatus === 'PAID') {
      remarksSegments.push(
        item.paymentDate
          ? `Paid (${formatComplianceDateDisplay(item.paymentDate)})`
          : 'Paid'
      );
    } else if (item.paymentStatus === 'PENDING' || item.paymentStatus === 'OVERDUE') {
      remarksSegments.push('Payment Pending');
    }
    if (item.remarks && item.remarks.trim() !== '') {
      remarksSegments.push(item.remarks.trim());
    }
    if (item.actionRequired && item.actionRequired.trim() !== '') {
      remarksSegments.push(`Action: ${item.actionRequired.trim()}`);
    }
    if (item.hasDiscrepancy && item.discrepancyNote) {
      remarksSegments.push(`[Discrepancy: ${item.discrepancyNote}]`);
    }
  }

  const remarksActionRequiredDisplay =
    remarksSegments.length > 0 ? remarksSegments.join(' • ') : '-';

  return {
    srNo: item.srNo,
    categoryCode: item.categoryCode,
    particular: item.categoryName,
    statusYesNoDisplay,
    validityDueDateDisplay,
    amountInrDisplay,
    frequencyDisplay,
    remarksActionRequiredDisplay,
    complianceStatus: item.complianceStatus,
    paymentStatus: item.paymentStatus,
    authoritativeSource: item.authoritativeSource,
    hasDiscrepancy: item.hasDiscrepancy,
  };
}
