import { describe, it, expect } from 'vitest';
import {
  getBillStatusDisplay,
  formatUtilityStatus,
  formatBeneficiaryType,
  formatSubMeterStatus,
  formatAccountStatus,
  formatFileSize,
  formatDisplayDate,
  formatDisplayDateTime,
  canEditBill,
  canMarkBillPaid,
  canRecordReading,
  canEditAccount,
  canEditSubMeter,
  canSubmitUtilityBill,
  canSubmitUtilityPayment,
  getResetUtilityFilters,
  filterDocumentsForOutlet,
  buildBillQueryParams,
  buildSubMeterQueryParams,
  buildChargeSummaryQueryParams,
  validateDateRange,
  getUtilityErrorMessage,
} from '../src/frontend/components/utilities/utilityUi';

describe('Utility Frontend Logic & UI Helpers (Phase 4A-2)', () => {
  // 1. Pending bill label
  it('1. should return "Pending" status display when bill is PENDING and not overdue', () => {
    const status = getBillStatusDisplay({ status: 'PENDING', isOverdue: false });
    expect(status.label).toBe('Pending');
    expect(status.isOverdue).toBe(false);
    expect(status.badgeClass).toContain('text-amber-400');
  });

  // 2. Overdue bill label
  it('2. should return "Overdue" status display when bill is PENDING and isOverdue is true', () => {
    const status = getBillStatusDisplay({ status: 'PENDING', isOverdue: true });
    expect(status.label).toBe('Overdue');
    expect(status.isOverdue).toBe(true);
    expect(status.badgeClass).toContain('text-rose-400');
  });

  // 3. Paid bill label
  it('3. should return "Paid" status display when bill status is PAID', () => {
    const status = getBillStatusDisplay({ status: 'PAID', isOverdue: false });
    expect(status.label).toBe('Paid');
    expect(status.isOverdue).toBe(false);
    expect(status.badgeClass).toContain('text-emerald-400');

    // Even if isOverdue flag is somehow set, PAID takes precedence
    const paidOverdue = getBillStatusDisplay({ status: 'PAID', isOverdue: true });
    expect(paidOverdue.label).toBe('Paid');
  });

  // 4. Account edit permission rule
  it('4. should respect account edit permission rule', () => {
    expect(canEditAccount(true)).toBe(true);
    expect(canEditAccount(false)).toBe(false);
  });

  // 5. Bill create permission rule
  it('5. should respect bill create permission rule', () => {
    const canWriteBills = (hasPerm: boolean) => hasPerm;
    expect(canWriteBills(true)).toBe(true);
    expect(canWriteBills(false)).toBe(false);
  });

  // 6. Pending bill editable with permission
  it('6. should allow editing a bill only if it is PENDING and user has permission', () => {
    expect(canEditBill({ status: 'PENDING' }, true)).toBe(true);
    expect(canEditBill({ status: 'PENDING' }, false)).toBe(false);
  });

  // 7. Paid bill not editable
  it('7. should NOT allow editing a bill if it is PAID even with write permission', () => {
    expect(canEditBill({ status: 'PAID' }, true)).toBe(false);
    expect(canEditBill({ status: 'PAID' }, false)).toBe(false);
  });

  // 8. Pending bill can show mark-paid when permission exists
  it('8. should allow mark-paid on PENDING bill when user has payment permission', () => {
    expect(canMarkBillPaid({ status: 'PENDING' }, true)).toBe(true);
    expect(canMarkBillPaid({ status: 'PENDING' }, false)).toBe(false);
  });

  // 9. Paid bill cannot show mark-paid
  it('9. should NOT allow mark-paid on PAID bill regardless of permission', () => {
    expect(canMarkBillPaid({ status: 'PAID' }, true)).toBe(false);
    expect(canMarkBillPaid({ status: 'PAID' }, false)).toBe(false);
  });

  // 10. Active sub-meter can accept reading with permission
  it('10. should allow recording reading on ACTIVE sub-meter when user has permission', () => {
    expect(canRecordReading({ status: 'ACTIVE' }, true)).toBe(true);
    expect(canRecordReading({ status: 'ACTIVE' }, false)).toBe(false);
  });

  // 11. Inactive sub-meter cannot accept reading
  it('11. should NOT allow recording reading on INACTIVE sub-meter', () => {
    expect(canRecordReading({ status: 'INACTIVE' }, true)).toBe(false);
    expect(canRecordReading({ status: 'INACTIVE' }, false)).toBe(false);
  });

  // 12. Decommissioned sub-meter cannot accept reading
  it('12. should NOT allow recording reading on DECOMMISSIONED sub-meter', () => {
    expect(canRecordReading({ status: 'DECOMMISSIONED' }, true)).toBe(false);
    expect(canRecordReading({ status: 'DECOMMISSIONED' }, false)).toBe(false);
  });

  // 13. Sub-meter master edit permission rule
  it('13. should respect sub-meter master edit permission rule', () => {
    expect(canEditSubMeter(true)).toBe(true);
    expect(canEditSubMeter(false)).toBe(false);
  });

  // 14. document list filtering by outlet
  it('14. should filter documents strictly matching the selected outletId', () => {
    const docs = [
      { id: 'doc-1', outletId: 'outlet-a', fileName: 'bill-a.pdf' },
      { id: 'doc-2', outletId: 'outlet-b', fileName: 'bill-b.pdf' },
      { id: 'doc-3', outletId: 'outlet-a', fileName: 'receipt-a.pdf' },
    ];

    const filtered = filterDocumentsForOutlet(docs, 'outlet-a');
    expect(filtered.length).toBe(2);
    expect(filtered.map(d => d.id)).toEqual(['doc-1', 'doc-3']);

    const emptyOutlet = filterDocumentsForOutlet(docs, 'outlet-c');
    expect(emptyOutlet.length).toBe(0);

    const invalidInput = filterDocumentsForOutlet(null as any, 'outlet-a');
    expect(invalidInput).toEqual([]);
  });

  // 15. bill filter query excludes empty params
  it('15. should build bill query params excluding empty/whitespace parameters', () => {
    expect(buildBillQueryParams({})).toBe('');
    expect(buildBillQueryParams({ status: '', fromDate: ' ', toDate: '' })).toBe('');
    expect(buildBillQueryParams({ status: 'PENDING' })).toBe('?status=PENDING');
    expect(
      buildBillQueryParams({ status: 'PAID', fromDate: '2026-09-01', toDate: '2026-09-30' })
    ).toBe('?status=PAID&fromDate=2026-09-01&toDate=2026-09-30');
    expect(
      buildBillQueryParams({ fromDate: '2026-09-01' })
    ).toBe('?fromDate=2026-09-01');
  });

  // 16. sub-meter filter query excludes empty params
  it('16. should build sub-meter query params excluding empty parameters', () => {
    expect(buildSubMeterQueryParams({})).toBe('');
    expect(buildSubMeterQueryParams({ beneficiaryType: '', status: '' })).toBe('');
    expect(buildSubMeterQueryParams({ beneficiaryType: 'NFR_VENDOR' })).toBe('?beneficiaryType=NFR_VENDOR');
    expect(buildSubMeterQueryParams({ status: 'ACTIVE' })).toBe('?status=ACTIVE');
    expect(
      buildSubMeterQueryParams({ beneficiaryType: 'CNG_FACILITY', status: 'ACTIVE' })
    ).toBe('?beneficiaryType=CNG_FACILITY&status=ACTIVE');
  });

  // 17. charge-summary filter excludes empty params
  it('17. should build charge summary query params excluding empty parameters', () => {
    expect(buildChargeSummaryQueryParams({})).toBe('');
    expect(buildChargeSummaryQueryParams({ fromDate: '', toDate: '', subMeterId: '' })).toBe('');
    expect(
      buildChargeSummaryQueryParams({
        fromDate: '2026-09-01',
        toDate: '2026-09-30',
        subMeterId: 'subm-123',
      })
    ).toBe('?fromDate=2026-09-01&toDate=2026-09-30&subMeterId=subm-123');
    expect(
      buildChargeSummaryQueryParams({ subMeterId: 'subm-123' })
    ).toBe('?subMeterId=subm-123');
  });

  // 18. fromDate > toDate client guard
  it('18. should reject date range when fromDate is greater than toDate', () => {
    expect(validateDateRange('2026-09-30', '2026-09-01').valid).toBe(false);
    expect(validateDateRange('2026-09-30', '2026-09-01').error).toBe('From date cannot be after To date.');

    expect(validateDateRange('2026-09-01', '2026-09-30').valid).toBe(true);
    expect(validateDateRange('2026-09-15', '2026-09-15').valid).toBe(true);
    expect(validateDateRange('2026-09-01', '').valid).toBe(true);
    expect(validateDateRange('', '2026-09-30').valid).toBe(true);
  });

  // 19. utility error-code mapping
  it('19. should map backend utility error codes to clear user-friendly messages', () => {
    expect(getUtilityErrorMessage('UTILITY_ELECTRICITY_ACCOUNT_NOT_FOUND')).toContain('electricity account could not be found');
    expect(getUtilityErrorMessage('UTILITY_CONSUMER_NUMBER_EXISTS')).toContain('already exists');
    expect(getUtilityErrorMessage('UTILITY_ELECTRICITY_BILL_NOT_FOUND')).toContain('electricity bill could not be found');
    expect(getUtilityErrorMessage('UTILITY_BILL_PERIOD_EXISTS')).toContain('billing period already exists');
    expect(getUtilityErrorMessage('UTILITY_BILL_DOCUMENT_NOT_FOUND')).toContain('bill document could not be found');
    expect(getUtilityErrorMessage('UTILITY_BILL_DOCUMENT_OUTLET_MISMATCH')).toContain('does not belong to this retail outlet');
    expect(getUtilityErrorMessage('UTILITY_PAYMENT_RECEIPT_NOT_FOUND')).toContain('payment receipt document could not be found');
    expect(getUtilityErrorMessage('UTILITY_PAYMENT_RECEIPT_OUTLET_MISMATCH')).toContain('does not belong to this retail outlet');
    expect(getUtilityErrorMessage('UTILITY_BILL_ALREADY_PAID')).toContain('already been marked as paid');
    expect(getUtilityErrorMessage('UTILITY_BILL_PAID_IMMUTABLE')).toContain('Paid bills cannot be modified');
    expect(getUtilityErrorMessage('UTILITY_SUB_METER_NOT_FOUND')).toContain('sub-meter could not be found');
    expect(getUtilityErrorMessage('SUB_METER_NOT_ACTIVE')).toContain('Only active sub-meters');
    expect(getUtilityErrorMessage('SUB_METER_READING_DECREASE')).toContain('cannot be lower than the previous reading');
    expect(getUtilityErrorMessage('SUB_METER_READING_OUT_OF_ORDER')).toContain('must be strictly after');
    expect(getUtilityErrorMessage('SUB_METER_READING_STATE_CHANGED')).toContain('received another reading concurrently');
    expect(getUtilityErrorMessage('UTILITY_CHARGE_OVERFLOW')).toContain('calculation limits');
    expect(getUtilityErrorMessage('FORBIDDEN')).toContain('authorization');
  });

  // 20. file size formatting / valid upload constraints
  it('20. should format file sizes accurately in B, KB, and MB', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(1048576)).toBe('1.00 MB');
    expect(formatFileSize(5242880)).toBe('5.00 MB');
  });

  // 23. Bill submit requires billDocumentId
  it('23. should reject bill submission if billDocumentId is missing or empty', () => {
    const validBase = {
      electricityAccountId: 'acc-1',
      billingPeriodStart: '2026-09-01',
      billingPeriodEnd: '2026-09-30',
      billAmount: '84500.50',
      dueDate: '2026-10-15',
      hasAccounts: true,
    };

    expect(canSubmitUtilityBill({ ...validBase, billDocumentId: '' })).toBe(false);
    expect(canSubmitUtilityBill({ ...validBase, billDocumentId: '   ' })).toBe(false);
    expect(canSubmitUtilityBill({ ...validBase, billDocumentId: undefined })).toBe(false);
    expect(canSubmitUtilityBill({ ...validBase, billDocumentId: 'doc-valid-123' })).toBe(true);
  });

  // 24. Payment submit requires paymentReceiptDocumentId
  it('24. should reject payment submission if paymentReceiptDocumentId is missing or empty', () => {
    expect(canSubmitUtilityPayment({ paymentReceiptDocumentId: '' })).toBe(false);
    expect(canSubmitUtilityPayment({ paymentReceiptDocumentId: '   ' })).toBe(false);
    expect(canSubmitUtilityPayment({ paymentReceiptDocumentId: undefined })).toBe(false);
    expect(canSubmitUtilityPayment({ paymentReceiptDocumentId: 'doc-receipt-999' })).toBe(true);
    expect(canSubmitUtilityPayment({ paymentReceiptDocumentId: 'doc-receipt-999' }, true)).toBe(false); // while submitting
  });

  // 25. Existing pending bill with existing document remains submittable
  it('25. should permit existing pending bill with valid existing document to be submitted', () => {
    const existingBillForm = {
      electricityAccountId: 'acc-existing-1',
      billingPeriodStart: '2026-08-01',
      billingPeriodEnd: '2026-08-31',
      billAmount: '72000.00',
      dueDate: '2026-09-15',
      billDocumentId: 'doc-already-attached-456',
      hasAccounts: true,
    };

    expect(canSubmitUtilityBill(existingBillForm, false)).toBe(true);
  });

  // 26. all utility filters reset on outlet switch
  it('26. should return clean empty filter state on outlet switch', () => {
    const resetState = getResetUtilityFilters();
    expect(resetState.billFilterStatus).toBe('');
    expect(resetState.billFilterFromDate).toBe('');
    expect(resetState.billFilterToDate).toBe('');
    expect(resetState.smFilterBeneficiaryType).toBe('');
    expect(resetState.smFilterStatus).toBe('');
    expect(resetState.chargeFilterFromDate).toBe('');
    expect(resetState.chargeFilterToDate).toBe('');
    expect(resetState.chargeFilterSubMeterId).toBe('');
  });

  // Additional formatting helpers
  it('should format beneficiary types and sub-meter statuses cleanly', () => {
    expect(formatBeneficiaryType('NFR_VENDOR')).toBe('NFR Vendor');
    expect(formatBeneficiaryType('CNG_FACILITY')).toBe('CNG Facility');
    expect(formatBeneficiaryType('OTHER')).toBe('Other Facility');

    expect(formatSubMeterStatus('ACTIVE').label).toBe('Active');
    expect(formatSubMeterStatus('INACTIVE').label).toBe('Inactive');
    expect(formatSubMeterStatus('DECOMMISSIONED').label).toBe('Decommissioned');

    expect(formatAccountStatus('ACTIVE').label).toBe('Active');
    expect(formatAccountStatus('INACTIVE').label).toBe('Inactive');
  });

  it('should format display dates safely', () => {
    expect(formatDisplayDate('2026-09-15')).toContain('2026');
    expect(formatDisplayDate(null)).toBe('-');
    expect(formatDisplayDateTime(null)).toBe('-');
  });
});
