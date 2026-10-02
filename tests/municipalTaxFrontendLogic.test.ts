import { describe, it, expect } from 'vitest';
import {
  getMunicipalTaxStatusDisplay,
  formatTaxType,
  formatTaxFrequency,
  canEditMunicipalTaxDue,
  canMarkMunicipalTaxPaid,
  canSubmitMunicipalTaxDue,
  canSubmitMunicipalTaxPayment,
  getResetMunicipalTaxFilters,
  buildMunicipalTaxQueryParams,
  validateMunicipalTaxDateRange,
  getMunicipalTaxErrorMessage,
  formatDisplayDate,
  formatDisplayDateTime,
  formatFileSize,
} from '../src/frontend/components/municipalTaxes/municipalTaxUi';

describe('Municipal Taxes Frontend Logic & UI Helpers (Phase 4B-2)', () => {
  // 1. PENDING non-overdue label
  it('1. should return "Pending" status display when due is PENDING and not overdue', () => {
    const status = getMunicipalTaxStatusDisplay({ status: 'PENDING', isOverdue: false });
    expect(status.label).toBe('Pending');
    expect(status.isOverdue).toBe(false);
    expect(status.badgeClass).toContain('text-amber-400');
  });

  // 2. PENDING overdue label
  it('2. should return "Overdue" status display when due is PENDING and isOverdue is true', () => {
    const status = getMunicipalTaxStatusDisplay({ status: 'PENDING', isOverdue: true });
    expect(status.label).toBe('Overdue');
    expect(status.isOverdue).toBe(true);
    expect(status.badgeClass).toContain('text-rose-400');
  });

  // 3. PAID label
  it('3. should return "Paid" status display when due status is PAID', () => {
    const status = getMunicipalTaxStatusDisplay({ status: 'PAID', isOverdue: false });
    expect(status.label).toBe('Paid');
    expect(status.isOverdue).toBe(false);
    expect(status.badgeClass).toContain('text-emerald-400');
  });

  // 4. PAID takes precedence over isOverdue
  it('4. should ensure PAID status takes precedence even if isOverdue flag is true', () => {
    const status = getMunicipalTaxStatusDisplay({ status: 'PAID', isOverdue: true });
    expect(status.label).toBe('Paid');
    expect(status.isOverdue).toBe(false);
    expect(status.badgeClass).toContain('text-emerald-400');
  });

  // 5. PROPERTY_TAX label
  it('5. should format PROPERTY_TAX to "Property Tax"', () => {
    expect(formatTaxType('PROPERTY_TAX')).toBe('Property Tax');
  });

  // 6. TRADE_LICENSE_FEE label
  it('6. should format TRADE_LICENSE_FEE to "Trade License Fee"', () => {
    expect(formatTaxType('TRADE_LICENSE_FEE')).toBe('Trade License Fee');
  });

  // 7. SIGNAGE_CHARGE label
  it('7. should format SIGNAGE_CHARGE to "Signage Charge"', () => {
    expect(formatTaxType('SIGNAGE_CHARGE')).toBe('Signage Charge');
  });

  // 8. LOCAL_AUTHORITY_DUE label
  it('8. should format LOCAL_AUTHORITY_DUE to "Local Authority Due"', () => {
    expect(formatTaxType('LOCAL_AUTHORITY_DUE')).toBe('Local Authority Due');
  });

  // 9. ANNUAL label
  it('9. should format ANNUAL frequency to "Annual"', () => {
    expect(formatTaxFrequency('ANNUAL')).toBe('Annual');
  });

  // 10. QUARTERLY label
  it('10. should format QUARTERLY frequency to "Quarterly"', () => {
    expect(formatTaxFrequency('QUARTERLY')).toBe('Quarterly');
  });

  // 11. PENDING due editable with write permission
  it('11. should allow editing PENDING due when write permission is present', () => {
    expect(canEditMunicipalTaxDue({ status: 'PENDING' }, true)).toBe(true);
  });

  // 12. PENDING due not editable without write permission
  it('12. should deny editing PENDING due when write permission is absent', () => {
    expect(canEditMunicipalTaxDue({ status: 'PENDING' }, false)).toBe(false);
  });

  // 13. PAID due never editable
  it('13. should deny editing PAID due regardless of write permission', () => {
    expect(canEditMunicipalTaxDue({ status: 'PAID' }, true)).toBe(false);
    expect(canEditMunicipalTaxDue({ status: 'PAID' }, false)).toBe(false);
  });

  // 14. PENDING due mark-paid with payment permission
  it('14. should allow marking PENDING due as paid when payment permission is present', () => {
    expect(canMarkMunicipalTaxPaid({ status: 'PENDING' }, true)).toBe(true);
  });

  // 15. PENDING due cannot mark-paid without permission
  it('15. should deny marking PENDING due as paid when payment permission is absent', () => {
    expect(canMarkMunicipalTaxPaid({ status: 'PENDING' }, false)).toBe(false);
  });

  // 16. PAID due cannot mark-paid
  it('16. should deny marking PAID due as paid regardless of permission', () => {
    expect(canMarkMunicipalTaxPaid({ status: 'PAID' }, true)).toBe(false);
    expect(canMarkMunicipalTaxPaid({ status: 'PAID' }, false)).toBe(false);
  });

  // 17. create form requires all required master fields
  it('17. should require all mandatory fields to submit create/edit due form', () => {
    const validForm = {
      taxType: 'PROPERTY_TAX',
      authorityName: 'MCD',
      referenceNumber: 'REF-001',
      assessmentFrequency: 'ANNUAL',
      assessmentPeriodStart: '2026-01-01',
      assessmentPeriodEnd: '2026-12-31',
      amount: '25000.00',
      dueDate: '2026-03-31',
    };
    expect(canSubmitMunicipalTaxDue(validForm, false)).toBe(true);

    // Missing taxType
    expect(canSubmitMunicipalTaxDue({ ...validForm, taxType: '' }, false)).toBe(false);
    // Blank authority
    expect(canSubmitMunicipalTaxDue({ ...validForm, authorityName: '   ' }, false)).toBe(false);
    // Missing referenceNumber
    expect(canSubmitMunicipalTaxDue({ ...validForm, referenceNumber: '' }, false)).toBe(false);
    // Missing frequency
    expect(canSubmitMunicipalTaxDue({ ...validForm, assessmentFrequency: '' }, false)).toBe(false);
    // Missing period start
    expect(canSubmitMunicipalTaxDue({ ...validForm, assessmentPeriodStart: '' }, false)).toBe(false);
    // Missing period end
    expect(canSubmitMunicipalTaxDue({ ...validForm, assessmentPeriodEnd: '' }, false)).toBe(false);
    // Missing amount
    expect(canSubmitMunicipalTaxDue({ ...validForm, amount: '' }, false)).toBe(false);
    // Missing dueDate
    expect(canSubmitMunicipalTaxDue({ ...validForm, dueDate: '' }, false)).toBe(false);
    // When submitting is true
    expect(canSubmitMunicipalTaxDue(validForm, true)).toBe(false);
  });

  // 18. assessment document remains optional
  it('18. should accept create/edit due without assessment document attachment', () => {
    const formWithoutDoc = {
      taxType: 'PROPERTY_TAX',
      authorityName: 'MCD',
      referenceNumber: 'REF-002',
      assessmentFrequency: 'ANNUAL',
      assessmentPeriodStart: '2026-01-01',
      assessmentPeriodEnd: '2026-12-31',
      amount: '15000',
      dueDate: '2026-03-31',
    };
    expect(canSubmitMunicipalTaxDue(formWithoutDoc, false)).toBe(true);
  });

  // 19. reversed assessment period rejected
  it('19. should reject form submission when assessmentPeriodEnd is before assessmentPeriodStart', () => {
    const reversedForm = {
      taxType: 'PROPERTY_TAX',
      authorityName: 'MCD',
      referenceNumber: 'REF-003',
      assessmentFrequency: 'ANNUAL',
      assessmentPeriodStart: '2026-12-31',
      assessmentPeriodEnd: '2026-01-01',
      amount: '5000.00',
      dueDate: '2026-03-31',
    };
    expect(canSubmitMunicipalTaxDue(reversedForm, false)).toBe(false);
  });

  // 20. payment form requires receipt document ID
  it('20. should require paymentReceiptDocumentId to submit payment form', () => {
    expect(canSubmitMunicipalTaxPayment({ paymentReceiptDocumentId: 'doc_123' }, false)).toBe(true);
    expect(canSubmitMunicipalTaxPayment({ paymentReceiptDocumentId: '' }, false)).toBe(false);
    expect(canSubmitMunicipalTaxPayment({ paymentReceiptDocumentId: '   ' }, false)).toBe(false);
    expect(canSubmitMunicipalTaxPayment({ paymentReceiptDocumentId: undefined }, false)).toBe(false);
    expect(canSubmitMunicipalTaxPayment({ paymentReceiptDocumentId: 'doc_123' }, true)).toBe(false);
  });

  // 21. list query excludes empty params
  it('21. should build query string excluding empty filter parameters', () => {
    const query = buildMunicipalTaxQueryParams({
      taxType: '',
      status: '',
      assessmentFrequency: '',
      fromDate: '',
      toDate: '',
    });
    expect(query).toBe('');
  });

  // 22. list query includes all non-empty filters
  it('22. should build query string including all non-empty filter parameters', () => {
    const query = buildMunicipalTaxQueryParams({
      taxType: 'PROPERTY_TAX',
      status: 'PENDING',
      assessmentFrequency: 'ANNUAL',
      fromDate: '2026-01-01',
      toDate: '2026-12-31',
    });
    expect(query).toBe('?taxType=PROPERTY_TAX&status=PENDING&assessmentFrequency=ANNUAL&fromDate=2026-01-01&toDate=2026-12-31');
  });

  // 23. fromDate > toDate rejected
  it('23. should reject date range where fromDate is after toDate', () => {
    const result = validateMunicipalTaxDateRange('2026-12-31', '2026-01-01');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('From date cannot be after To date.');
  });

  // 24. valid date range accepted
  it('24. should accept valid date range where fromDate <= toDate or either is empty', () => {
    expect(validateMunicipalTaxDateRange('2026-01-01', '2026-12-31').isValid).toBe(true);
    expect(validateMunicipalTaxDateRange('2026-05-01', '2026-05-01').isValid).toBe(true);
    expect(validateMunicipalTaxDateRange('2026-01-01', '').isValid).toBe(true);
    expect(validateMunicipalTaxDateRange('', '2026-12-31').isValid).toBe(true);
  });

  // 25. reset filters returns all empty values
  it('25. should return all empty filter values on getResetMunicipalTaxFilters', () => {
    const reset = getResetMunicipalTaxFilters();
    expect(reset).toEqual({
      taxType: '',
      status: '',
      assessmentFrequency: '',
      fromDate: '',
      toDate: '',
    });
  });

  // 26. duplicate error mapping
  it('26. should map MUNICIPAL_TAX_DUE_EXISTS error correctly', () => {
    const msg = getMunicipalTaxErrorMessage({ code: 'MUNICIPAL_TAX_DUE_EXISTS' });
    expect(msg).toBe(
      'A statutory due with the same tax type, authority, reference number and assessment period already exists for this outlet.'
    );
  });

  // 27. already-paid error mapping
  it('27. should map MUNICIPAL_TAX_ALREADY_PAID error correctly', () => {
    const msg = getMunicipalTaxErrorMessage({ code: 'MUNICIPAL_TAX_ALREADY_PAID' });
    expect(msg).toBe(
      'This statutory due has already been marked as paid. The latest record has been reloaded.'
    );
  });

  // 28. state-changed error mapping
  it('28. should map MUNICIPAL_TAX_STATE_CHANGED error correctly', () => {
    const msg = getMunicipalTaxErrorMessage({ code: 'MUNICIPAL_TAX_STATE_CHANGED' });
    expect(msg).toBe(
      'The statutory due changed while you were viewing it. The latest record has been reloaded.'
    );
  });

  // 29. document-outlet error mapping
  it('29. should map MUNICIPAL_TAX_DOCUMENT_OUTLET_MISMATCH and MUNICIPAL_TAX_RECEIPT_OUTLET_MISMATCH correctly', () => {
    const docMsg = getMunicipalTaxErrorMessage({ code: 'MUNICIPAL_TAX_DOCUMENT_OUTLET_MISMATCH' });
    expect(docMsg).toBe('The selected assessment document belongs to a different outlet.');

    const recMsg = getMunicipalTaxErrorMessage({ code: 'MUNICIPAL_TAX_RECEIPT_OUTLET_MISMATCH' });
    expect(recMsg).toBe('The selected payment receipt document belongs to a different outlet.');
  });

  // 30. summary-overflow error mapping
  it('30. should map MUNICIPAL_TAX_SUMMARY_OVERFLOW error correctly', () => {
    const msg = getMunicipalTaxErrorMessage({ code: 'MUNICIPAL_TAX_SUMMARY_OVERFLOW' });
    expect(msg).toBe('The aggregate municipal tax amount exceeds the supported financial ceiling.');
  });

  // 31. raw SQL / SQLite errors are sanitized
  it('31. should sanitize raw SQLite error messages and never leak internal DB errors', () => {
    const rawSqlErr = { message: 'SQLITE_CONSTRAINT: trg_municipal_tax_paid_immutable aborted' };
    const msg = getMunicipalTaxErrorMessage(rawSqlErr);
    expect(msg).not.toContain('SQLITE_');
    expect(msg).not.toContain('trg_');
    expect(msg).toBe('Database operation failed. Please verify your inputs and try again.');
  });

  // 32. date & file size formatters
  it('32. should format dates, date-times, and file sizes properly', () => {
    expect(formatDisplayDate('2026-08-15')).toContain('Aug');
    expect(formatDisplayDate('2026-08-15')).toContain('2026');
    expect(formatDisplayDate(null)).toBe('-');

    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1048576)).toBe('1.00 MB');
    expect(formatFileSize(500)).toBe('500 B');
  });
});
