import { describe, it, expect } from 'vitest';
import {
  formatNfrType,
  getNfrLeaseStatusDisplay,
  getNfrRentStatusDisplay,
  buildNfrSpaceQueryParams,
  buildNfrVendorQueryParams,
  buildNfrLeaseQueryParams,
  buildNfrRentDueQueryParams,
  validateNfrDateRange,
  getResetNfrFilters,
  getNfrTabResetTargets,
  canEditNfrLease,
  canTerminateNfrLease,
  canGenerateNfrRentDue,
  canRecordNfrRentPayment,
  canSubmitNfrSpace,
  canSubmitNfrVendor,
  canSubmitNfrLease,
  canSubmitNfrRentPayment,
  getEligibleNfrSubMeters,
  resolveNfrDocument,
  getNfrErrorMessage,
} from '../src/frontend/components/nfr/nfrUi';
import { PERMISSIONS } from '../src/shared/constants';
import type { NfrLease, NfrRentDue, Document, UtilitySubMeter } from '../src/shared/types';

describe('Phase 4C-2 NFR Frontend Logic Suite', () => {
  // -------------------------------------------------------------
  // 1. NFR Type Formatting Tests
  // -------------------------------------------------------------
  describe('formatNfrType', () => {
    it('formats ATM correctly', () => {
      expect(formatNfrType('ATM')).toBe('ATM');
    });

    it('formats CONVENIENCE_STORE correctly', () => {
      expect(formatNfrType('CONVENIENCE_STORE')).toBe('Convenience Store');
    });

    it('formats QSR correctly', () => {
      expect(formatNfrType('QSR')).toBe('QSR');
    });

    it('formats CAR_WASH correctly', () => {
      expect(formatNfrType('CAR_WASH')).toBe('Car Wash');
    });

    it('formats EV_CHARGING correctly', () => {
      expect(formatNfrType('EV_CHARGING')).toBe('EV Charging');
    });

    it('formats CANOPY_ADVERTISING correctly', () => {
      expect(formatNfrType('CANOPY_ADVERTISING')).toBe('Canopy Advertising');
    });

    it('formats unknown or empty type with fallback', () => {
      expect(formatNfrType('UNKNOWN_CUSTOM_TYPE' as any)).toBe('UNKNOWN_CUSTOM_TYPE');
      expect(formatNfrType('' as any)).toBe('—');
    });
  });

  // -------------------------------------------------------------
  // 2. Lease Status Display Tests
  // -------------------------------------------------------------
  describe('getNfrLeaseStatusDisplay', () => {
    it('returns Active for ACTIVE non-expired lease', () => {
      const display = getNfrLeaseStatusDisplay('ACTIVE', false);
      expect(display.label).toBe('Active');
      expect(display.badgeClass).toContain('emerald');
    });

    it('returns Expired for ACTIVE expired lease', () => {
      const display = getNfrLeaseStatusDisplay('ACTIVE', true);
      expect(display.label).toBe('Expired');
      expect(display.badgeClass).toContain('amber');
    });

    it('returns Terminated for TERMINATED non-expired lease', () => {
      const display = getNfrLeaseStatusDisplay('TERMINATED', false);
      expect(display.label).toBe('Terminated');
      expect(display.badgeClass).toContain('slate');
    });

    it('returns Terminated for TERMINATED expired lease (precedence test)', () => {
      const display = getNfrLeaseStatusDisplay('TERMINATED', true);
      expect(display.label).toBe('Terminated');
      expect(display.badgeClass).toContain('slate');
    });

    it('supports object argument signature', () => {
      const display = getNfrLeaseStatusDisplay({ status: 'ACTIVE', isExpired: true });
      expect(display.label).toBe('Expired');
    });
  });

  // -------------------------------------------------------------
  // 3. Rent Payment Status Display Tests
  // -------------------------------------------------------------
  describe('getNfrRentStatusDisplay', () => {
    it('returns Paid for PAID status even if isOverdue is false', () => {
      const display = getNfrRentStatusDisplay('PAID', false);
      expect(display.label).toBe('Paid');
      expect(display.badgeClass).toContain('emerald');
    });

    it('returns Paid for PAID status even if isOverdue is true (precedence test)', () => {
      const display = getNfrRentStatusDisplay('PAID', true);
      expect(display.label).toBe('Paid');
      expect(display.badgeClass).toContain('emerald');
    });

    it('returns Partial • Overdue for PARTIAL status when isOverdue is true', () => {
      const display = getNfrRentStatusDisplay('PARTIAL', true);
      expect(display.label).toBe('Partial • Overdue');
      expect(display.badgeClass).toContain('rose');
    });

    it('returns Partial for PARTIAL status when isOverdue is false', () => {
      const display = getNfrRentStatusDisplay('PARTIAL', false);
      expect(display.label).toBe('Partial');
      expect(display.badgeClass).toContain('sky');
    });

    it('returns Overdue for PENDING status when isOverdue is true', () => {
      const display = getNfrRentStatusDisplay('PENDING', true);
      expect(display.label).toBe('Overdue');
      expect(display.badgeClass).toContain('rose');
    });

    it('returns Pending for PENDING status when isOverdue is false', () => {
      const display = getNfrRentStatusDisplay('PENDING', false);
      expect(display.label).toBe('Pending');
      expect(display.badgeClass).toContain('amber');
    });

    it('supports object argument signature', () => {
      const display = getNfrRentStatusDisplay({ paymentStatus: 'PARTIAL', isOverdue: true });
      expect(display.label).toBe('Partial • Overdue');
    });
  });

  // -------------------------------------------------------------
  // 4. RBAC Permission Action Guards
  // -------------------------------------------------------------
  describe('RBAC Action Helpers', () => {
    const mockActiveLease: NfrLease = {
      id: 'lease-1',
      outletId: 'out-1',
      spaceId: 'sp-1',
      vendorId: 'ven-1',
      agreementNumber: 'AGR-001',
      leaseStartDate: '2026-01-01',
      leaseEndDate: '2026-12-31',
      monthlyRentPaise: 3500000,
      monthlyRentStr: '35000.00',
      securityDepositPaise: 7000000,
      securityDepositStr: '70000.00',
      monthlyDueDay: 5,
      agreementDocumentId: null,
      subMeterId: null,
      status: 'ACTIVE',
      terminatedAt: null,
      terminationReason: null,
      terminatedByUserId: null,
      notes: null,
      createdBy: 'usr-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      isExpired: false,
    };

    const mockTerminatedLease: NfrLease = {
      ...mockActiveLease,
      id: 'lease-2',
      status: 'TERMINATED',
      terminatedAt: '2026-06-01T00:00:00.000Z',
    };

    const mockPendingDue: NfrRentDue = {
      id: 'due-1',
      outletId: 'out-1',
      leaseId: 'lease-1',
      billingMonth: '2026-05',
      rentPeriodStart: '2026-05-01',
      rentPeriodEnd: '2026-05-31',
      dueDate: '2026-05-05',
      monthlyRentPaiseSnapshot: 3500000,
      monthlyRentStr: '35000.00',
      totalPaidPaise: 0,
      totalPaidStr: '0.00',
      outstandingPaise: 3500000,
      outstandingStr: '35000.00',
      paymentStatus: 'PENDING',
      isOverdue: false,
      paymentCount: 0,
      createdBy: 'usr-1',
      createdAt: '2026-05-01T00:00:00.000Z',
    };

    const mockPartialDue: NfrRentDue = {
      ...mockPendingDue,
      id: 'due-2',
      totalPaidPaise: 1000000,
      totalPaidStr: '10000.00',
      outstandingPaise: 2500000,
      outstandingStr: '25000.00',
      paymentStatus: 'PARTIAL',
      isOverdue: true,
      paymentCount: 1,
    };

    const mockPaidDue: NfrRentDue = {
      ...mockPendingDue,
      id: 'due-3',
      totalPaidPaise: 3500000,
      totalPaidStr: '35000.00',
      outstandingPaise: 0,
      outstandingStr: '0.00',
      paymentStatus: 'PAID',
      isOverdue: false,
      paymentCount: 2,
    };

    it('canEditNfrLease allows active lease with NFR_LEASES_WRITE', () => {
      const hasPerm = (p: string) => p === PERMISSIONS.NFR_LEASES_WRITE;
      expect(canEditNfrLease(hasPerm, mockActiveLease)).toBe(true);
    });

    it('canEditNfrLease forbids active lease without NFR_LEASES_WRITE', () => {
      const hasPerm = () => false;
      expect(canEditNfrLease(hasPerm, mockActiveLease)).toBe(false);
    });

    it('canEditNfrLease forbids terminated lease even with NFR_LEASES_WRITE', () => {
      const hasPerm = (p: string) => p === PERMISSIONS.NFR_LEASES_WRITE;
      expect(canEditNfrLease(hasPerm, mockTerminatedLease)).toBe(false);
    });

    it('canTerminateNfrLease allows active lease with NFR_LEASES_WRITE', () => {
      const hasPerm = (p: string) => p === PERMISSIONS.NFR_LEASES_WRITE;
      expect(canTerminateNfrLease(hasPerm, mockActiveLease)).toBe(true);
    });

    it('canTerminateNfrLease forbids active lease without NFR_LEASES_WRITE', () => {
      const hasPerm = () => false;
      expect(canTerminateNfrLease(hasPerm, mockActiveLease)).toBe(false);
    });

    it('canTerminateNfrLease forbids terminated lease even with NFR_LEASES_WRITE', () => {
      const hasPerm = (p: string) => p === PERMISSIONS.NFR_LEASES_WRITE;
      expect(canTerminateNfrLease(hasPerm, mockTerminatedLease)).toBe(false);
    });

    it('canGenerateNfrRentDue checks NFR_RENT_DUES_WRITE', () => {
      const hasPermTrue = (p: string) => p === PERMISSIONS.NFR_RENT_DUES_WRITE;
      const hasPermFalse = () => false;
      expect(canGenerateNfrRentDue(hasPermTrue)).toBe(true);
      expect(canGenerateNfrRentDue(hasPermFalse)).toBe(false);
    });

    it('canRecordNfrRentPayment allows PENDING due with permission', () => {
      const hasPerm = (p: string) => p === PERMISSIONS.NFR_RENT_PAYMENTS_WRITE;
      expect(canRecordNfrRentPayment(hasPerm, mockPendingDue)).toBe(true);
    });

    it('canRecordNfrRentPayment allows PARTIAL overdue due with permission', () => {
      const hasPerm = (p: string) => p === PERMISSIONS.NFR_RENT_PAYMENTS_WRITE;
      expect(canRecordNfrRentPayment(hasPerm, mockPartialDue)).toBe(true);
    });

    it('canRecordNfrRentPayment forbids PAID due even with permission', () => {
      const hasPerm = (p: string) => p === PERMISSIONS.NFR_RENT_PAYMENTS_WRITE;
      expect(canRecordNfrRentPayment(hasPerm, mockPaidDue)).toBe(false);
    });

    it('canRecordNfrRentPayment forbids PENDING due without permission', () => {
      const hasPerm = () => false;
      expect(canRecordNfrRentPayment(hasPerm, mockPendingDue)).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 5. Form Submit Validation Helpers
  // -------------------------------------------------------------
  describe('Form Submit Helpers', () => {
    describe('canSubmitNfrSpace', () => {
      it('validates complete space form', () => {
        expect(
          canSubmitNfrSpace({
            spaceCode: 'SPC-01',
            name: 'ATM Kiosk 1',
            nfrType: 'ATM',
          })
        ).toBe(true);
      });

      it('rejects missing spaceCode on create', () => {
        expect(
          canSubmitNfrSpace({
            spaceCode: '   ',
            name: 'ATM Kiosk 1',
            nfrType: 'ATM',
          })
        ).toBe(false);
      });

      it('allows missing spaceCode on edit', () => {
        expect(
          canSubmitNfrSpace(
            {
              name: 'ATM Kiosk 1',
              nfrType: 'ATM',
            },
            true
          )
        ).toBe(true);
      });

      it('rejects missing name', () => {
        expect(
          canSubmitNfrSpace({
            spaceCode: 'SPC-01',
            name: '',
            nfrType: 'ATM',
          })
        ).toBe(false);
      });

      it('rejects invalid nfrType', () => {
        expect(
          canSubmitNfrSpace({
            spaceCode: 'SPC-01',
            name: 'ATM Kiosk 1',
            nfrType: '' as any,
          })
        ).toBe(false);
      });
    });

    describe('canSubmitNfrVendor', () => {
      it('validates valid vendor name and permissive phone', () => {
        expect(
          canSubmitNfrVendor({
            vendorName: 'HDFC Bank Ltd',
            ownerContactName: 'Rajesh Sharma',
            ownerContactPhone: '+91 (022) 1234-5678',
          })
        ).toBe(true);
      });

      it('rejects empty vendorName', () => {
        expect(
          canSubmitNfrVendor({
            vendorName: '   ',
            ownerContactName: 'Rajesh Sharma',
            ownerContactPhone: '+91 9876543210',
          })
        ).toBe(false);
      });

      it('rejects missing ownerContactName', () => {
        expect(
          canSubmitNfrVendor({
            vendorName: 'HDFC Bank Ltd',
            ownerContactName: '',
            ownerContactPhone: '+91 9876543210',
          })
        ).toBe(false);
      });

      it('rejects missing ownerContactPhone', () => {
        expect(
          canSubmitNfrVendor({
            vendorName: 'HDFC Bank Ltd',
            ownerContactName: 'Rajesh Sharma',
            ownerContactPhone: '   ',
          })
        ).toBe(false);
      });

      it('rejects invalid characters in phone', () => {
        expect(
          canSubmitNfrVendor({
            vendorName: 'HDFC Bank Ltd',
            ownerContactName: 'Rajesh Sharma',
            ownerContactPhone: '98765-ABC-210',
          })
        ).toBe(false);
      });

      it('accepts phone containing +, -, spaces, parentheses', () => {
        expect(
          canSubmitNfrVendor({
            vendorName: 'HDFC Bank Ltd',
            ownerContactName: 'Rajesh Sharma',
            ownerContactPhone: '+91 (011) 2345-6789',
          })
        ).toBe(true);
      });

      it('rejects if isSubmitting is true', () => {
        expect(
          canSubmitNfrVendor(
            {
              vendorName: 'HDFC Bank Ltd',
              ownerContactName: 'Rajesh Sharma',
              ownerContactPhone: '+91 9876543210',
            },
            true
          )
        ).toBe(false);
      });
    });

    describe('canSubmitNfrLease', () => {
      const validLeaseInput = {
        spaceId: 'sp-1',
        vendorId: 'ven-1',
        agreementNumber: 'AGR-2026-001',
        leaseStartDate: '2026-01-01',
        leaseEndDate: '2026-12-31',
        monthlyRent: '35000.00',
        securityDeposit: '70000',
        monthlyDueDay: 5,
      };

      it('validates a correct lease payload', () => {
        expect(canSubmitNfrLease(validLeaseInput)).toBe(true);
      });

      it('rejects leaseEndDate before leaseStartDate', () => {
        expect(
          canSubmitNfrLease({
            ...validLeaseInput,
            leaseStartDate: '2026-06-01',
            leaseEndDate: '2026-05-31',
          })
        ).toBe(false);
      });

      it('accepts leaseStartDate equal to leaseEndDate', () => {
        expect(
          canSubmitNfrLease({
            ...validLeaseInput,
            leaseStartDate: '2026-06-01',
            leaseEndDate: '2026-06-01',
          })
        ).toBe(true);
      });

      it('accepts monthlyDueDay 1 and 31', () => {
        expect(canSubmitNfrLease({ ...validLeaseInput, monthlyDueDay: 1 })).toBe(true);
        expect(canSubmitNfrLease({ ...validLeaseInput, monthlyDueDay: 31 })).toBe(true);
      });

      it('rejects monthlyDueDay 0 and 32', () => {
        expect(canSubmitNfrLease({ ...validLeaseInput, monthlyDueDay: 0 })).toBe(false);
        expect(canSubmitNfrLease({ ...validLeaseInput, monthlyDueDay: 32 })).toBe(false);
      });

      it('rejects non-integer monthlyDueDay', () => {
        expect(canSubmitNfrLease({ ...validLeaseInput, monthlyDueDay: 15.5 })).toBe(false);
      });

      it('rejects zero or negative monthlyRent', () => {
        expect(canSubmitNfrLease({ ...validLeaseInput, monthlyRent: '0' })).toBe(false);
        expect(canSubmitNfrLease({ ...validLeaseInput, monthlyRent: '-500' })).toBe(false);
      });

      it('rejects non-decimal monthlyRent', () => {
        expect(canSubmitNfrLease({ ...validLeaseInput, monthlyRent: 'abc' })).toBe(false);
        expect(canSubmitNfrLease({ ...validLeaseInput, monthlyRent: '12.34.56' })).toBe(false);
      });

      it('accepts empty or zero securityDeposit', () => {
        expect(canSubmitNfrLease({ ...validLeaseInput, securityDeposit: '' })).toBe(true);
        expect(canSubmitNfrLease({ ...validLeaseInput, securityDeposit: '0' })).toBe(true);
      });

      it('rejects invalid format securityDeposit', () => {
        expect(canSubmitNfrLease({ ...validLeaseInput, securityDeposit: 'invalid' })).toBe(false);
      });
    });

    describe('canSubmitNfrRentPayment', () => {
      it('validates payment with amount and receipt document ID', () => {
        expect(
          canSubmitNfrRentPayment({
            amount: '15000.50',
            receiptDocumentId: 'doc-uuid-1',
          })
        ).toBe(true);
      });

      it('rejects missing receiptDocumentId', () => {
        expect(
          canSubmitNfrRentPayment({
            amount: '15000.50',
            receiptDocumentId: '   ',
          })
        ).toBe(false);
      });

      it('rejects invalid or zero amount', () => {
        expect(
          canSubmitNfrRentPayment({
            amount: '0',
            receiptDocumentId: 'doc-uuid-1',
          })
        ).toBe(false);
        expect(
          canSubmitNfrRentPayment({
            amount: '-100',
            receiptDocumentId: 'doc-uuid-1',
          })
        ).toBe(false);
        expect(
          canSubmitNfrRentPayment({
            amount: 'abc',
            receiptDocumentId: 'doc-uuid-1',
          })
        ).toBe(false);
      });
    });
  });

  // -------------------------------------------------------------
  // 6. Query Builder Tests
  // -------------------------------------------------------------
  describe('Query Builders', () => {
    it('buildNfrSpaceQueryParams builds query string correctly', () => {
      expect(buildNfrSpaceQueryParams({ nfrType: 'ATM', status: 'ACTIVE' })).toBe(
        '?nfrType=ATM&status=ACTIVE'
      );
      expect(buildNfrSpaceQueryParams({ nfrType: '', status: '' })).toBe('');
      expect(buildNfrSpaceQueryParams({ nfrType: 'QSR', status: '' })).toBe('?nfrType=QSR');
    });

    it('buildNfrVendorQueryParams builds query string correctly', () => {
      expect(buildNfrVendorQueryParams({ search: 'HDFC Bank', status: 'ACTIVE' })).toBe(
        '?status=ACTIVE&search=HDFC+Bank'
      );
      expect(buildNfrVendorQueryParams({ search: '', status: '' })).toBe('');
    });

    it('buildNfrLeaseQueryParams builds query string correctly', () => {
      expect(
        buildNfrLeaseQueryParams({
          spaceId: 'sp-1',
          vendorId: 'ven-1',
          status: 'ACTIVE',
          nfrType: 'ATM',
          expiredOnly: true,
        })
      ).toBe('?spaceId=sp-1&vendorId=ven-1&status=ACTIVE&nfrType=ATM&expiredOnly=true');

      expect(
        buildNfrLeaseQueryParams({
          spaceId: '',
          vendorId: '',
          status: '',
          nfrType: '',
          expiredOnly: false,
        })
      ).toBe('');
    });

    it('buildNfrRentDueQueryParams builds query string correctly', () => {
      expect(
        buildNfrRentDueQueryParams({
          leaseId: 'l-1',
          vendorId: 'v-1',
          spaceId: 's-1',
          billingMonth: '2026-05',
          paymentStatus: 'PARTIAL',
          overdueOnly: true,
          fromDate: '2026-05-01',
          toDate: '2026-05-31',
        })
      ).toBe(
        '?leaseId=l-1&vendorId=v-1&spaceId=s-1&billingMonth=2026-05&paymentStatus=PARTIAL&overdueOnly=true&fromDate=2026-05-01&toDate=2026-05-31'
      );

      expect(
        buildNfrRentDueQueryParams({
          leaseId: '',
          vendorId: '',
          spaceId: '',
          billingMonth: '',
          paymentStatus: '',
          overdueOnly: false,
          fromDate: '',
          toDate: '',
        })
      ).toBe('');
    });
  });

  // -------------------------------------------------------------
  // 7. Date Filter Validation Tests
  // -------------------------------------------------------------
  describe('validateNfrDateRange', () => {
    it('allows empty dates', () => {
      expect(validateNfrDateRange('', '')).toEqual({ isValid: true, valid: true });
      expect(validateNfrDateRange('2026-01-01', '')).toEqual({ isValid: true, valid: true });
      expect(validateNfrDateRange('', '2026-12-31')).toEqual({ isValid: true, valid: true });
    });

    it('allows valid date range where fromDate <= toDate', () => {
      expect(validateNfrDateRange('2026-01-01', '2026-12-31')).toEqual({
        isValid: true,
        valid: true,
      });
      expect(validateNfrDateRange('2026-05-15', '2026-05-15')).toEqual({
        isValid: true,
        valid: true,
      });
    });

    it('rejects invalid date range where fromDate > toDate', () => {
      const result = validateNfrDateRange('2026-06-01', '2026-05-01');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('From date cannot be after To date.');
    });
  });

  // -------------------------------------------------------------
  // 8. Document Resolution Helper Tests
  // -------------------------------------------------------------
  describe('resolveNfrDocument', () => {
    const mockDocuments: Document[] = [
      {
        id: 'doc-1',
        outletId: 'out-1',
        name: 'lease_agreement.pdf',
        sizeBytes: 1048576,
        mimeType: 'application/pdf',
        r2Key: 'key-1',
        uploadedByUserId: 'usr-1',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'doc-2',
        outletId: 'out-2',
        name: 'foreign_doc.pdf',
        sizeBytes: 524288,
        mimeType: 'application/pdf',
        r2Key: 'key-2',
        uploadedByUserId: 'usr-1',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    it('finds matching document in the same outlet', () => {
      const doc = resolveNfrDocument(mockDocuments, 'doc-1', 'out-1');
      expect(doc).not.toBeNull();
      expect(doc?.id).toBe('doc-1');
      expect(doc?.name).toBe('lease_agreement.pdf');
    });

    it('ignores foreign outlet document even if ID matches', () => {
      const doc = resolveNfrDocument(mockDocuments, 'doc-2', 'out-1');
      expect(doc).toBeNull();
    });

    it('returns null if doc ID is not found', () => {
      const doc = resolveNfrDocument(mockDocuments, 'doc-999', 'out-1');
      expect(doc).toBeNull();
    });

    it('returns null if doc ID is missing or empty', () => {
      expect(resolveNfrDocument(mockDocuments, '', 'out-1')).toBeNull();
      expect(resolveNfrDocument(mockDocuments, undefined, 'out-1')).toBeNull();
    });

    it('returns null if doc list is null/empty', () => {
      expect(resolveNfrDocument([], 'doc-1', 'out-1')).toBeNull();
      expect(resolveNfrDocument(null as any, 'doc-1', 'out-1')).toBeNull();
    });
  });

  // -------------------------------------------------------------
  // 9. Error Mapping Tests
  // -------------------------------------------------------------
  describe('getNfrErrorMessage', () => {
    it('maps space errors correctly', () => {
      expect(getNfrErrorMessage('NFR_SPACE_NOT_FOUND')).toBe('NFR space was not found.');
      expect(getNfrErrorMessage('NFR_SPACE_CODE_EXISTS')).toBe(
        'An NFR space with this code already exists for this outlet.'
      );
      expect(getNfrErrorMessage('NFR_SPACE_NOT_ACTIVE')).toBe(
        'The selected NFR space is inactive and cannot be assigned to a new lease.'
      );
    });

    it('maps vendor errors correctly', () => {
      expect(getNfrErrorMessage('NFR_VENDOR_NOT_FOUND')).toBe('NFR vendor was not found.');
      expect(getNfrErrorMessage('NFR_VENDOR_NOT_ACTIVE')).toBe(
        'The selected vendor is inactive and cannot be assigned to a new lease.'
      );
    });

    it('maps lease agreement errors correctly', () => {
      expect(getNfrErrorMessage('NFR_LEASE_NOT_FOUND')).toBe('Lease agreement was not found.');
      expect(getNfrErrorMessage('NFR_AGREEMENT_EXISTS')).toBe(
        'A lease agreement with this number already exists for this outlet.'
      );
      expect(getNfrErrorMessage('NFR_SPACE_LEASE_OVERLAP')).toBe(
        'The selected space already has an active lease overlapping with this period.'
      );
      expect(getNfrErrorMessage('NFR_LEASE_TERMINATED_IMMUTABLE')).toBe(
        'Terminated leases cannot be modified.'
      );
      expect(getNfrErrorMessage('NFR_LEASE_ALREADY_TERMINATED')).toBe(
        'This lease has already been terminated. The latest lease data has been reloaded.'
      );
      expect(getNfrErrorMessage('NFR_LEASE_STATE_CHANGED')).toBe(
        'The lease changed while you were editing it. The latest data has been reloaded.'
      );
    });

    it('maps rent due and payment errors correctly', () => {
      expect(getNfrErrorMessage('NFR_RENT_DUE_NOT_FOUND')).toBe('Rent due record was not found.');
      expect(getNfrErrorMessage('NFR_RENT_DUE_EXISTS')).toBe(
        'A rent due has already been generated for this lease and billing month.'
      );
      expect(getNfrErrorMessage('NFR_RENT_OVERPAYMENT')).toBe(
        'The payment exceeds the current outstanding balance. The latest rent ledger has been reloaded.'
      );
      expect(getNfrErrorMessage('NFR_RENT_ALREADY_PAID')).toBe(
        'This rent due has already been fully paid. The latest ledger has been reloaded.'
      );
      expect(getNfrErrorMessage('NFR_RENT_RECEIPT_NOT_FOUND')).toBe(
        'Payment receipt document was not found in the Document Vault.'
      );
      expect(getNfrErrorMessage('NFR_SUMMARY_OVERFLOW')).toBe(
        'Calculated financial totals exceeded numerical boundaries.'
      );
    });

    it('maps generic and permission errors correctly', () => {
      expect(getNfrErrorMessage('FORBIDDEN')).toBe(
        'You do not have permission to perform this action.'
      );
      expect(getNfrErrorMessage('NETWORK_ERROR')).toBe(
        'Network communication failed. Please check your connection.'
      );
    });

    it('sanitizes raw SQLite errors safely', () => {
      const sanitized = getNfrErrorMessage(
        'SQLITE_CONSTRAINT: UNIQUE constraint failed: nfr_spaces.space_code'
      );
      expect(sanitized).toBe('An error occurred while processing your request.');
    });
  });

  // -------------------------------------------------------------
  // 10. Filter Reset Tests
  // -------------------------------------------------------------
  describe('getResetNfrFilters', () => {
    it('returns empty initial filter state for all tabs', () => {
      const reset = getResetNfrFilters();
      expect(reset.spaces).toEqual({ nfrType: '', status: '' });
      expect(reset.vendors).toEqual({ search: '', status: '' });
      expect(reset.leases).toEqual({
        spaceId: '',
        vendorId: '',
        status: '',
        nfrType: '',
        expiredOnly: false,
      });
      expect(reset.rentDues).toEqual({
        leaseId: '',
        vendorId: '',
        spaceId: '',
        billingMonth: '',
        paymentStatus: '',
        overdueOnly: false,
        fromDate: '',
        toDate: '',
      });
    });
  });

  // -------------------------------------------------------------
  // 11. Tab Switch Reset Targets Tests
  // -------------------------------------------------------------
  describe('getNfrTabResetTargets', () => {
    it('switching to spaces closes vendor, lease, and rent dues UI', () => {
      const targets = getNfrTabResetTargets('spaces');
      expect(targets).toEqual({
        closeSpaceModal: false,
        closeVendorModal: true,
        closeLeaseUi: true,
        closeRentDueUi: true,
      });
    });

    it('switching to vendors closes spaces, lease, and rent dues UI', () => {
      const targets = getNfrTabResetTargets('vendors');
      expect(targets).toEqual({
        closeSpaceModal: true,
        closeVendorModal: false,
        closeLeaseUi: true,
        closeRentDueUi: true,
      });
    });

    it('switching to leases closes spaces, vendors, and rent dues UI', () => {
      const targets = getNfrTabResetTargets('leases');
      expect(targets).toEqual({
        closeSpaceModal: true,
        closeVendorModal: true,
        closeLeaseUi: false,
        closeRentDueUi: true,
      });
    });

    it('switching to rent-dues closes spaces, vendors, and lease UI', () => {
      const targets = getNfrTabResetTargets('rent-dues');
      expect(targets).toEqual({
        closeSpaceModal: true,
        closeVendorModal: true,
        closeLeaseUi: true,
        closeRentDueUi: false,
      });
    });
  });

  // -------------------------------------------------------------
  // 12. Sub-Meter Eligibility Tests
  // -------------------------------------------------------------
  describe('getEligibleNfrSubMeters', () => {
    const mockMeters: UtilitySubMeter[] = [
      {
        id: 'sm-1',
        outletId: 'out-1',
        meterCode: 'SM-NFR-01',
        name: 'ATM Sub-meter',
        beneficiaryType: 'NFR_VENDOR',
        beneficiaryName: 'HDFC Bank',
        serialNumber: 'SN-001',
        ratePaisePerKwh: 850,
        status: 'ACTIVE',
        commissionedAt: '2026-01-01',
        notes: null,
        createdBy: 'usr-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'sm-2',
        outletId: 'out-1',
        meterCode: 'SM-NFR-02',
        name: 'Inactive NFR Meter',
        beneficiaryType: 'NFR_VENDOR',
        beneficiaryName: 'Old Vendor',
        serialNumber: 'SN-002',
        ratePaisePerKwh: 850,
        status: 'INACTIVE',
        commissionedAt: '2026-01-01',
        notes: null,
        createdBy: 'usr-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'sm-3',
        outletId: 'out-1',
        meterCode: 'SM-CNG-01',
        name: 'CNG Booster Meter',
        beneficiaryType: 'CNG_FACILITY',
        beneficiaryName: 'CNG Compressor',
        serialNumber: 'SN-003',
        ratePaisePerKwh: 850,
        status: 'ACTIVE',
        commissionedAt: '2026-01-01',
        notes: null,
        createdBy: 'usr-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'sm-4',
        outletId: 'out-1',
        meterCode: 'SM-OTH-01',
        name: 'Staff Quarter Meter',
        beneficiaryType: 'OTHER',
        beneficiaryName: 'Staff Quarters',
        serialNumber: 'SN-004',
        ratePaisePerKwh: 850,
        status: 'ACTIVE',
        commissionedAt: '2026-01-01',
        notes: null,
        createdBy: 'usr-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'sm-5',
        outletId: 'out-2',
        meterCode: 'SM-NFR-OUT2',
        name: 'Foreign Outlet NFR Meter',
        beneficiaryType: 'NFR_VENDOR',
        beneficiaryName: 'Foreign Vendor',
        serialNumber: 'SN-005',
        ratePaisePerKwh: 850,
        status: 'ACTIVE',
        commissionedAt: '2026-01-01',
        notes: null,
        createdBy: 'usr-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    it('A. ACTIVE NFR_VENDOR is included on create', () => {
      const eligible = getEligibleNfrSubMeters(mockMeters, 'out-1', false);
      expect(eligible.some((m) => m.id === 'sm-1')).toBe(true);
    });

    it('B. INACTIVE NFR_VENDOR is excluded on create', () => {
      const eligible = getEligibleNfrSubMeters(mockMeters, 'out-1', false);
      expect(eligible.some((m) => m.id === 'sm-2')).toBe(false);
    });

    it('C. Currently linked INACTIVE NFR_VENDOR is included on edit', () => {
      const eligible = getEligibleNfrSubMeters(mockMeters, 'out-1', true, 'sm-2');
      expect(eligible.some((m) => m.id === 'sm-2')).toBe(true);
      expect(eligible.some((m) => m.id === 'sm-1')).toBe(true);
    });

    it('D. CNG_FACILITY is excluded even if ACTIVE and matching outlet', () => {
      const eligibleCreate = getEligibleNfrSubMeters(mockMeters, 'out-1', false);
      const eligibleEdit = getEligibleNfrSubMeters(mockMeters, 'out-1', true, 'sm-3');
      expect(eligibleCreate.some((m) => m.id === 'sm-3')).toBe(false);
      expect(eligibleEdit.some((m) => m.id === 'sm-3')).toBe(false);
    });

    it('E. OTHER beneficiary type is excluded even if ACTIVE', () => {
      const eligibleCreate = getEligibleNfrSubMeters(mockMeters, 'out-1', false);
      const eligibleEdit = getEligibleNfrSubMeters(mockMeters, 'out-1', true, 'sm-4');
      expect(eligibleCreate.some((m) => m.id === 'sm-4')).toBe(false);
      expect(eligibleEdit.some((m) => m.id === 'sm-4')).toBe(false);
    });

    it('F. Foreign-outlet meter is excluded even if ACTIVE NFR_VENDOR', () => {
      const eligible = getEligibleNfrSubMeters(mockMeters, 'out-1', false);
      expect(eligible.some((m) => m.id === 'sm-5')).toBe(false);
    });

    it('excludes unlinked INACTIVE NFR_VENDOR on edit', () => {
      const eligible = getEligibleNfrSubMeters(mockMeters, 'out-1', true, 'sm-1');
      expect(eligible.some((m) => m.id === 'sm-2')).toBe(false);
    });

    it('returns empty array when input is null or undefined or empty', () => {
      expect(getEligibleNfrSubMeters(null, 'out-1')).toEqual([]);
      expect(getEligibleNfrSubMeters(undefined, 'out-1')).toEqual([]);
      expect(getEligibleNfrSubMeters([], 'out-1')).toEqual([]);
    });
  });
});
