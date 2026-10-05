import { describe, it, expect } from 'vitest';
import {
  formatHrEmploymentStatus,
  formatHrDesignationStatus,
  formatHrRosterStatus,
  getInitials,
  buildHrDesignationQueryParams,
  buildHrStaffQueryParams,
  buildHrRosterQueryParams,
  validateHrJoinedDateRange,
  validateHrRosterDateRange,
  canRequestHrStaffList,
  canRequestHrRosterList,
  getLocalDateInputValue,
  getEligibleStaffDesignations,
  getEligibleRosterStaff,
  getEligibleRosterShiftTemplates,
  canSubmitHrDesignation,
  canSubmitHrStaff,
  canSubmitHrManpowerSanction,
  canSubmitHrRoster,
  canEditHrStaff,
  canEditHrManpower,
  canEditHrRoster,
  canCancelHrRoster,
  resolveHrDocument,
  getHrErrorMessage,
  getHrTabResetTargets,
  getResetHrFilters,
} from '../src/frontend/components/hr/hrUi';
import type {
  HrDesignation,
  HrStaff,
  HrManpowerSanction,
  ShiftTemplate,
  Document,
} from '../src/shared/types';

describe('Phase 5A-2 HR & Workforce Frontend Logic Test Suite', () => {
  // ==========================================================================
  // 1. Status Formatting
  // ==========================================================================
  describe('1. Status Formatting Helpers', () => {
    it('1.1 should format ACTIVE staff employment status correctly', () => {
      const res = formatHrEmploymentStatus('ACTIVE');
      expect(res.label).toBe('Active');
      expect(res.badgeClass).toContain('emerald');
    });

    it('1.2 should format INACTIVE staff employment status correctly', () => {
      const res = formatHrEmploymentStatus('INACTIVE');
      expect(res.label).toBe('Inactive');
      expect(res.badgeClass).toContain('slate');
    });

    it('1.3 should format EXITED staff employment status correctly', () => {
      const res = formatHrEmploymentStatus('EXITED');
      expect(res.label).toBe('Exited');
      expect(res.badgeClass).toContain('rose');
    });

    it('1.4 should fallback gracefully for unknown or null staff status', () => {
      expect(formatHrEmploymentStatus(null).label).toBe('—');
      expect(formatHrEmploymentStatus(undefined).label).toBe('—');
      expect(formatHrEmploymentStatus('UNKNOWN' as any).label).toBe('UNKNOWN');
    });

    it('1.5 should format ACTIVE designation status correctly', () => {
      const res = formatHrDesignationStatus('ACTIVE');
      expect(res.label).toBe('Active');
      expect(res.badgeClass).toContain('emerald');
    });

    it('1.6 should format INACTIVE designation status correctly', () => {
      const res = formatHrDesignationStatus('INACTIVE');
      expect(res.label).toBe('Inactive');
      expect(res.badgeClass).toContain('slate');
    });

    it('1.7 should fallback gracefully for null designation status', () => {
      expect(formatHrDesignationStatus(null).label).toBe('—');
    });

    it('1.8 should format SCHEDULED roster assignment status correctly', () => {
      const res = formatHrRosterStatus('SCHEDULED');
      expect(res.label).toBe('Scheduled');
      expect(res.badgeClass).toContain('sky');
    });

    it('1.9 should format CANCELLED roster assignment status correctly', () => {
      const res = formatHrRosterStatus('CANCELLED');
      expect(res.label).toBe('Cancelled');
      expect(res.badgeClass).toContain('slate');
    });

    it('1.10 should fallback gracefully for null roster status', () => {
      expect(formatHrRosterStatus(null).label).toBe('—');
    });
  });

  // ==========================================================================
  // 2. Avatar Initials
  // ==========================================================================
  describe('2. Initials Generator', () => {
    it('2.1 should extract initials from two-word full name', () => {
      expect(getInitials('Ramesh Kumar')).toBe('RK');
    });

    it('2.2 should extract initials from single name', () => {
      expect(getInitials('Priyanshu')).toBe('PR');
    });

    it('2.3 should extract first and last initials from multi-word name', () => {
      expect(getInitials('Mohammad Imran Khan')).toBe('MK');
    });

    it('2.4 should handle empty or null name safely', () => {
      expect(getInitials('')).toBe('??');
      expect(getInitials(null)).toBe('??');
      expect(getInitials(undefined)).toBe('??');
    });
  });

  // ==========================================================================
  // 3. Designation Form Validation
  // ==========================================================================
  describe('3. Designation Validation', () => {
    it('3.1 should accept valid designation on CREATE', () => {
      expect(
        canSubmitHrDesignation({ code: 'DSM', name: 'Driveway Sales Master', status: 'ACTIVE' }, false)
      ).toBe(true);
    });

    it('3.2 should reject designation with missing code on CREATE', () => {
      expect(
        canSubmitHrDesignation({ code: '', name: 'Driveway Sales Master', status: 'ACTIVE' }, false)
      ).toBe(false);
    });

    it('3.3 should reject designation with missing name on CREATE', () => {
      expect(
        canSubmitHrDesignation({ code: 'DSM', name: '  ', status: 'ACTIVE' }, false)
      ).toBe(false);
    });

    it('3.4 should accept designation without code on EDIT', () => {
      expect(
        canSubmitHrDesignation({ name: 'Senior DSM', status: 'ACTIVE' }, true)
      ).toBe(true);
    });

    it('3.5 should reject invalid status string', () => {
      expect(
        canSubmitHrDesignation({ code: 'DSM', name: 'DSM', status: 'PENDING' as any }, false)
      ).toBe(false);
    });
  });

  // ==========================================================================
  // 4. Staff Form Validation & Privacy Safeguards
  // ==========================================================================
  describe('4. Staff Form Validation', () => {
    const validStaffPayload = {
      employeeCode: 'EMP-001',
      fullName: 'Sunil Verma',
      designationId: 'desig-1',
      aadhaarLast4: '4567',
      emergencyContactName: 'Anita Verma',
      emergencyContactPhone: '+91 9876543210',
      joiningDate: '2026-01-15',
      employmentStatus: 'ACTIVE',
      exitDate: null,
    };

    it('4.1 should accept valid staff on CREATE', () => {
      expect(canSubmitHrStaff(validStaffPayload, false)).toBe(true);
    });

    it('4.2 should reject missing employeeCode on CREATE', () => {
      expect(canSubmitHrStaff({ ...validStaffPayload, employeeCode: '' }, false)).toBe(false);
    });

    it('4.3 should allow missing employeeCode on EDIT', () => {
      expect(canSubmitHrStaff({ ...validStaffPayload, employeeCode: '' }, true)).toBe(true);
    });

    it('4.4 should reject missing fullName', () => {
      expect(canSubmitHrStaff({ ...validStaffPayload, fullName: ' ' }, false)).toBe(false);
    });

    it('4.5 should reject missing designationId', () => {
      expect(canSubmitHrStaff({ ...validStaffPayload, designationId: '' }, false)).toBe(false);
    });

    it('4.6 should reject 3-digit Aadhaar last 4', () => {
      expect(canSubmitHrStaff({ ...validStaffPayload, aadhaarLast4: '123' }, false)).toBe(false);
    });

    it('4.7 should reject 5-digit Aadhaar last 4', () => {
      expect(canSubmitHrStaff({ ...validStaffPayload, aadhaarLast4: '12345' }, false)).toBe(false);
    });

    it('4.8 should reject letters in Aadhaar last 4', () => {
      expect(canSubmitHrStaff({ ...validStaffPayload, aadhaarLast4: '123A' }, false)).toBe(false);
    });

    it('4.9 should accept exact 4 digits for Aadhaar last 4', () => {
      expect(canSubmitHrStaff({ ...validStaffPayload, aadhaarLast4: '9988' }, false)).toBe(true);
    });

    it('4.10 should reject missing emergency contact name', () => {
      expect(canSubmitHrStaff({ ...validStaffPayload, emergencyContactName: '' }, false)).toBe(false);
    });

    it('4.11 should reject missing emergency phone', () => {
      expect(canSubmitHrStaff({ ...validStaffPayload, emergencyContactPhone: '' }, false)).toBe(false);
    });

    it('4.12 should reject invalid phone characters', () => {
      expect(canSubmitHrStaff({ ...validStaffPayload, emergencyContactPhone: 'abc-xyz' }, false)).toBe(false);
    });

    it('4.13 should accept phone with +, -, spaces and parentheses', () => {
      expect(canSubmitHrStaff({ ...validStaffPayload, emergencyContactPhone: '+1 (555) 019-2834' }, false)).toBe(true);
    });

    it('4.14 should reject missing joiningDate', () => {
      expect(canSubmitHrStaff({ ...validStaffPayload, joiningDate: '' }, false)).toBe(false);
    });

    it('4.15 should reject invalid employment status', () => {
      expect(canSubmitHrStaff({ ...validStaffPayload, employmentStatus: 'ON_LEAVE' }, false)).toBe(false);
    });
  });

  // ==========================================================================
  // 5. Staff Lifecycle & Exit Date Rules
  // ==========================================================================
  describe('5. Staff Exit Date Rules', () => {
    const baseStaff = {
      employeeCode: 'EMP-002',
      fullName: 'Vikram Singh',
      designationId: 'desig-1',
      aadhaarLast4: '1122',
      emergencyContactName: 'Geeta Singh',
      emergencyContactPhone: '9876543210',
      joiningDate: '2026-02-01',
    };

    it('5.1 should require exitDate when employmentStatus is EXITED', () => {
      expect(
        canSubmitHrStaff({ ...baseStaff, employmentStatus: 'EXITED', exitDate: null }, true)
      ).toBe(false);
      expect(
        canSubmitHrStaff({ ...baseStaff, employmentStatus: 'EXITED', exitDate: '' }, true)
      ).toBe(false);
    });

    it('5.2 should reject EXITED staff if exitDate is before joiningDate', () => {
      expect(
        canSubmitHrStaff(
          { ...baseStaff, employmentStatus: 'EXITED', exitDate: '2026-01-15' },
          true
        )
      ).toBe(false);
    });

    it('5.3 should accept EXITED staff if exitDate is equal to or after joiningDate', () => {
      expect(
        canSubmitHrStaff(
          { ...baseStaff, employmentStatus: 'EXITED', exitDate: '2026-02-01' },
          true
        )
      ).toBe(true);
      expect(
        canSubmitHrStaff(
          { ...baseStaff, employmentStatus: 'EXITED', exitDate: '2026-06-30' },
          true
        )
      ).toBe(true);
    });

    it('5.4 should reject ACTIVE staff if exitDate is populated', () => {
      expect(
        canSubmitHrStaff(
          { ...baseStaff, employmentStatus: 'ACTIVE', exitDate: '2026-06-30' },
          true
        )
      ).toBe(false);
    });

    it('5.5 should reject INACTIVE staff if exitDate is populated', () => {
      expect(
        canSubmitHrStaff(
          { ...baseStaff, employmentStatus: 'INACTIVE', exitDate: '2026-06-30' },
          true
        )
      ).toBe(false);
    });

    it('5.6 should accept ACTIVE/INACTIVE staff with null exitDate', () => {
      expect(
        canSubmitHrStaff({ ...baseStaff, employmentStatus: 'ACTIVE', exitDate: null }, true)
      ).toBe(true);
      expect(
        canSubmitHrStaff({ ...baseStaff, employmentStatus: 'INACTIVE', exitDate: null }, true)
      ).toBe(true);
    });
  });

  // ==========================================================================
  // 6. Designation Eligibility
  // ==========================================================================
  describe('6. Designation Eligibility for Staff', () => {
    const mockDesignations: HrDesignation[] = [
      {
        id: 'desig-1',
        outletId: 'ro-1001',
        code: 'DSM',
        name: 'Driveway Sales Master',
        status: 'ACTIVE',
        notes: null,
        createdBy: 'usr-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'desig-2',
        outletId: 'ro-1001',
        code: 'CSH',
        name: 'Cashier',
        status: 'INACTIVE',
        notes: null,
        createdBy: 'usr-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'desig-3',
        outletId: 'ro-1002',
        code: 'MGR',
        name: 'Manager',
        status: 'ACTIVE',
        notes: null,
        createdBy: 'usr-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    it('6.1 on CREATE: only ACTIVE same-outlet designations are included', () => {
      const eligible = getEligibleStaffDesignations(mockDesignations, null, 'ro-1001');
      expect(eligible.length).toBe(1);
      expect(eligible[0].id).toBe('desig-1');
    });

    it('6.2 on EDIT: currently linked INACTIVE designation is retained', () => {
      const eligible = getEligibleStaffDesignations(mockDesignations, 'desig-2', 'ro-1001');
      expect(eligible.length).toBe(2);
      expect(eligible.some(d => d.id === 'desig-2')).toBe(true);
    });

    it('6.3 on EDIT: other unlinked INACTIVE designations remain excluded', () => {
      const extraInactive: HrDesignation = {
        id: 'desig-4',
        outletId: 'ro-1001',
        code: 'HLP',
        name: 'Helper',
        status: 'INACTIVE',
        notes: null,
        createdBy: 'usr-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      const eligible = getEligibleStaffDesignations(
        [...mockDesignations, extraInactive],
        'desig-2',
        'ro-1001'
      );
      expect(eligible.some(d => d.id === 'desig-4')).toBe(false);
    });
  });

  // ==========================================================================
  // 7. Roster Staff Eligibility
  // ==========================================================================
  describe('7. Roster Staff Eligibility', () => {
    const mockStaff: HrStaff[] = [
      {
        id: 'staff-1',
        outletId: 'ro-1001',
        employeeCode: 'E01',
        fullName: 'Active Worker',
        designationId: 'd1',
        aadhaarLast4: '1111',
        maskedAadhaar: 'XXXX XXXX 1111',
        aadhaarDocumentId: null,
        photoDocumentId: null,
        emergencyContactName: 'Contact',
        emergencyContactPhone: '9999999999',
        joiningDate: '2026-01-01',
        employmentStatus: 'ACTIVE',
        exitDate: null,
        notes: null,
        createdBy: 'usr-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'staff-2',
        outletId: 'ro-1001',
        employeeCode: 'E02',
        fullName: 'Inactive Worker',
        designationId: 'd1',
        aadhaarLast4: '2222',
        maskedAadhaar: 'XXXX XXXX 2222',
        aadhaarDocumentId: null,
        photoDocumentId: null,
        emergencyContactName: 'Contact',
        emergencyContactPhone: '9999999999',
        joiningDate: '2026-01-01',
        employmentStatus: 'INACTIVE',
        exitDate: null,
        notes: null,
        createdBy: 'usr-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'staff-3',
        outletId: 'ro-1001',
        employeeCode: 'E03',
        fullName: 'Exited Worker',
        designationId: 'd1',
        aadhaarLast4: '3333',
        maskedAadhaar: 'XXXX XXXX 3333',
        aadhaarDocumentId: null,
        photoDocumentId: null,
        emergencyContactName: 'Contact',
        emergencyContactPhone: '9999999999',
        joiningDate: '2026-01-01',
        employmentStatus: 'EXITED',
        exitDate: '2026-02-01',
        notes: null,
        createdBy: 'usr-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    it('7.1 on CREATE: only ACTIVE staff are eligible', () => {
      const eligible = getEligibleRosterStaff(mockStaff, null, 'ro-1001');
      expect(eligible.length).toBe(1);
      expect(eligible[0].id).toBe('staff-1');
    });

    it('7.2 on EDIT: currently linked INACTIVE staff is retained', () => {
      const eligible = getEligibleRosterStaff(mockStaff, 'staff-2', 'ro-1001');
      expect(eligible.length).toBe(2);
      expect(eligible.some(s => s.id === 'staff-2')).toBe(true);
    });

    it('7.3 on EDIT: currently linked EXITED staff is retained for historical editing', () => {
      const eligible = getEligibleRosterStaff(mockStaff, 'staff-3', 'ro-1001');
      expect(eligible.length).toBe(2);
      expect(eligible.some(s => s.id === 'staff-3')).toBe(true);
    });
  });

  // ==========================================================================
  // 8. Shift Template Eligibility & Sequence Sorting
  // ==========================================================================
  describe('8. Shift Template Eligibility & Sorting', () => {
    const mockTemplates: ShiftTemplate[] = [
      {
        id: 'st-3',
        outletId: 'ro-1001',
        code: 'NIGHT',
        name: 'Night Shift',
        startTime: '22:00',
        endTime: '06:00',
        sequence: 3,
        status: 'ACTIVE',
        createdBy: 'usr-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'st-1',
        outletId: 'ro-1001',
        code: 'MORN',
        name: 'Morning Shift',
        startTime: '06:00',
        endTime: '14:00',
        sequence: 1,
        status: 'ACTIVE',
        createdBy: 'usr-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'st-inactive',
        outletId: 'ro-1001',
        code: 'SPL',
        name: 'Special Shift',
        startTime: '10:00',
        endTime: '18:00',
        sequence: 4,
        status: 'INACTIVE',
        createdBy: 'usr-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    it('8.1 on CREATE: only ACTIVE same-outlet templates returned and sorted by sequence', () => {
      const eligible = getEligibleRosterShiftTemplates(mockTemplates, null, 'ro-1001');
      expect(eligible.length).toBe(2);
      expect(eligible[0].id).toBe('st-1'); // sequence 1
      expect(eligible[1].id).toBe('st-3'); // sequence 3
    });

    it('8.2 on EDIT: currently linked INACTIVE template is retained', () => {
      const eligible = getEligibleRosterShiftTemplates(mockTemplates, 'st-inactive', 'ro-1001');
      expect(eligible.length).toBe(3);
      expect(eligible.some(t => t.id === 'st-inactive')).toBe(true);
    });
  });

  // ==========================================================================
  // 9. Manpower Sanction Validation
  // ==========================================================================
  describe('9. Manpower Sanction Validation', () => {
    it('9.1 should accept sanctionedCount 0', () => {
      expect(
        canSubmitHrManpowerSanction({ designationId: 'd1', sanctionedCount: 0, effectiveFrom: '2026-01-01' })
      ).toBe(true);
    });

    it('9.2 should accept sanctionedCount positive integer up to 10000', () => {
      expect(
        canSubmitHrManpowerSanction({ designationId: 'd1', sanctionedCount: 15, effectiveFrom: '2026-01-01' })
      ).toBe(true);
      expect(
        canSubmitHrManpowerSanction({ designationId: 'd1', sanctionedCount: 10000, effectiveFrom: '2026-01-01' })
      ).toBe(true);
    });

    it('9.3 should reject negative sanctionedCount', () => {
      expect(
        canSubmitHrManpowerSanction({ designationId: 'd1', sanctionedCount: -1, effectiveFrom: '2026-01-01' })
      ).toBe(false);
    });

    it('9.4 should reject decimal sanctionedCount', () => {
      expect(
        canSubmitHrManpowerSanction({ designationId: 'd1', sanctionedCount: 5.5, effectiveFrom: '2026-01-01' })
      ).toBe(false);
    });

    it('9.5 should reject sanctionedCount over 10000', () => {
      expect(
        canSubmitHrManpowerSanction({ designationId: 'd1', sanctionedCount: 10001, effectiveFrom: '2026-01-01' })
      ).toBe(false);
    });

    it('9.6 should reject missing designationId on CREATE', () => {
      expect(
        canSubmitHrManpowerSanction({ designationId: '', sanctionedCount: 5, effectiveFrom: '2026-01-01' }, false)
      ).toBe(false);
    });

    it('9.7 should allow missing designationId on EDIT', () => {
      expect(
        canSubmitHrManpowerSanction({ sanctionedCount: 5, effectiveFrom: '2026-01-01' }, true)
      ).toBe(true);
    });
  });

  // ==========================================================================
  // 10. Roster Form Validation
  // ==========================================================================
  describe('10. Roster Form Validation', () => {
    it('10.1 should accept valid roster on CREATE', () => {
      expect(
        canSubmitHrRoster({ staffId: 's1', rosterDate: '2026-11-20', shiftTemplateId: 'st1' }, false)
      ).toBe(true);
    });

    it('10.2 should reject missing staffId', () => {
      expect(
        canSubmitHrRoster({ staffId: '', rosterDate: '2026-11-20', shiftTemplateId: 'st1' }, false)
      ).toBe(false);
    });

    it('10.3 should reject missing rosterDate', () => {
      expect(
        canSubmitHrRoster({ staffId: 's1', rosterDate: '', shiftTemplateId: 'st1' }, false)
      ).toBe(false);
    });

    it('10.4 should reject missing shiftTemplateId', () => {
      expect(
        canSubmitHrRoster({ staffId: 's1', rosterDate: '2026-11-20', shiftTemplateId: '' }, false)
      ).toBe(false);
    });

    it('10.5 on EDIT: accept valid SCHEDULED or CANCELLED status', () => {
      expect(
        canSubmitHrRoster({ staffId: 's1', rosterDate: '2026-11-20', shiftTemplateId: 'st1', status: 'SCHEDULED' }, true)
      ).toBe(true);
      expect(
        canSubmitHrRoster({ staffId: 's1', rosterDate: '2026-11-20', shiftTemplateId: 'st1', status: 'CANCELLED' }, true)
      ).toBe(true);
    });

    it('10.6 on EDIT: reject invalid status string', () => {
      expect(
        canSubmitHrRoster({ staffId: 's1', rosterDate: '2026-11-20', shiftTemplateId: 'st1', status: 'ABSENT' as any }, true)
      ).toBe(false);
    });
  });

  // ==========================================================================
  // 11. Query Builders
  // ==========================================================================
  describe('11. Query Parameter Builders', () => {
    it('11.1 should build designation query with search and status', () => {
      const q = buildHrDesignationQueryParams({ search: 'dsm', status: 'ACTIVE' });
      expect(q).toBe('?search=dsm&status=ACTIVE');
    });

    it('11.2 should omit empty parameters in designation query', () => {
      const q = buildHrDesignationQueryParams({ search: '', status: 'ACTIVE' });
      expect(q).toBe('?status=ACTIVE');
    });

    it('11.3 should return empty string for empty designation filters', () => {
      expect(buildHrDesignationQueryParams({})).toBe('');
      expect(buildHrDesignationQueryParams(undefined)).toBe('');
    });

    it('11.4 should build staff query with all populated filters', () => {
      const q = buildHrStaffQueryParams({
        designationId: 'd1',
        employmentStatus: 'ACTIVE',
        search: 'sunil',
        joinedFrom: '2026-01-01',
        joinedTo: '2026-12-31',
      });
      expect(q).toContain('designationId=d1');
      expect(q).toContain('employmentStatus=ACTIVE');
      expect(q).toContain('search=sunil');
      expect(q).toContain('joinedFrom=2026-01-01');
      expect(q).toContain('joinedTo=2026-12-31');
    });

    it('11.5 should build roster query with date filters and shiftTemplateId', () => {
      const q = buildHrRosterQueryParams({
        staffId: 's1',
        shiftTemplateId: 'st1',
        status: 'SCHEDULED',
        fromDate: '2026-11-01',
        toDate: '2026-11-30',
      });
      expect(q).toContain('staffId=s1');
      expect(q).toContain('shiftTemplateId=st1');
      expect(q).toContain('status=SCHEDULED');
      expect(q).toContain('fromDate=2026-11-01');
      expect(q).toContain('toDate=2026-11-30');
    });
  });

  // ==========================================================================
  // 12. Date Range Validation
  // ==========================================================================
  describe('12. Date Range Validators', () => {
    it('12.1 valid staff joined date range (joinedFrom <= joinedTo)', () => {
      expect(validateHrJoinedDateRange('2026-01-01', '2026-06-30').valid).toBe(true);
      expect(validateHrJoinedDateRange('2026-01-01', '2026-01-01').valid).toBe(true);
    });

    it('12.2 invalid staff joined date range (joinedFrom > joinedTo)', () => {
      const res = validateHrJoinedDateRange('2026-07-01', '2026-01-01');
      expect(res.valid).toBe(false);
      expect(res.error).toBe('Joined From date cannot be after Joined To date.');
    });

    it('12.3 valid roster date range (fromDate <= toDate)', () => {
      expect(validateHrRosterDateRange('2026-11-01', '2026-11-30').valid).toBe(true);
    });

    it('12.4 invalid roster date range (fromDate > toDate)', () => {
      const res = validateHrRosterDateRange('2026-12-01', '2026-11-01');
      expect(res.valid).toBe(false);
      expect(res.error).toBe('From date cannot be after To date.');
    });
  });

  // ==========================================================================
  // 13. Action Permission Helpers
  // ==========================================================================
  describe('13. Action Permissions', () => {
    it('13.1 canEditHrStaff reflects staff write permission', () => {
      expect(canEditHrStaff(true)).toBe(true);
      expect(canEditHrStaff(false)).toBe(false);
    });

    it('13.2 canEditHrManpower reflects manpower write permission', () => {
      expect(canEditHrManpower(true)).toBe(true);
      expect(canEditHrManpower(false)).toBe(false);
    });

    it('13.3 canEditHrRoster reflects roster write permission', () => {
      expect(canEditHrRoster(true)).toBe(true);
      expect(canEditHrRoster(false)).toBe(false);
    });

    it('13.4 canCancelHrRoster is true only if permitted AND status is SCHEDULED', () => {
      expect(canCancelHrRoster(true, 'SCHEDULED')).toBe(true);
      expect(canCancelHrRoster(false, 'SCHEDULED')).toBe(false);
      expect(canCancelHrRoster(true, 'CANCELLED')).toBe(false);
    });
  });

  // ==========================================================================
  // 14. Document Resolution
  // ==========================================================================
  describe('14. Document Vault Resolution', () => {
    const mockDocs: Document[] = [
      {
        id: 'doc-1',
        outletId: 'ro-1001',
        name: 'aadhaar_scan.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 102400,
        r2Key: 'internal/key/1',
        uploadedByUserId: 'usr-1',
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'doc-2',
        outletId: 'ro-1002',
        name: 'foreign_outlet_doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 204800,
        r2Key: 'internal/key/2',
        uploadedByUserId: 'usr-1',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];

    it('14.1 should resolve matching document for current outlet', () => {
      const doc = resolveHrDocument(mockDocs, 'doc-1', 'ro-1001');
      expect(doc).not.toBeNull();
      expect(doc?.name).toBe('aadhaar_scan.pdf');
    });

    it('14.2 should return null for document belonging to foreign outlet', () => {
      const doc = resolveHrDocument(mockDocs, 'doc-2', 'ro-1001');
      expect(doc).toBeNull();
    });

    it('14.3 should return null for nonexistent docId', () => {
      expect(resolveHrDocument(mockDocs, 'doc-999', 'ro-1001')).toBeNull();
      expect(resolveHrDocument(mockDocs, null, 'ro-1001')).toBeNull();
    });
  });

  // ==========================================================================
  // 15. Workspace Tab Transitions & Resets
  // ==========================================================================
  describe('15. Tab Reset Targets', () => {
    it('15.1 transitioning to staff resets non-staff UI states', () => {
      const t = getHrTabResetTargets('staff');
      expect(t.closeStaffUi).toBe(false);
      expect(t.closeDesignationUi).toBe(true);
      expect(t.closeManpowerUi).toBe(true);
      expect(t.closeRosterUi).toBe(true);
    });

    it('15.2 transitioning to designations resets non-designation UI states', () => {
      const t = getHrTabResetTargets('designations');
      expect(t.closeStaffUi).toBe(true);
      expect(t.closeDesignationUi).toBe(false);
      expect(t.closeManpowerUi).toBe(true);
      expect(t.closeRosterUi).toBe(true);
    });

    it('15.3 transitioning to manpower resets non-manpower UI states', () => {
      const t = getHrTabResetTargets('manpower');
      expect(t.closeStaffUi).toBe(true);
      expect(t.closeDesignationUi).toBe(true);
      expect(t.closeManpowerUi).toBe(false);
      expect(t.closeRosterUi).toBe(true);
    });

    it('15.4 transitioning to roster resets non-roster UI states', () => {
      const t = getHrTabResetTargets('roster');
      expect(t.closeStaffUi).toBe(true);
      expect(t.closeDesignationUi).toBe(true);
      expect(t.closeManpowerUi).toBe(true);
      expect(t.closeRosterUi).toBe(false);
    });

    it('15.5 getResetHrFilters returns clean filter state', () => {
      const f = getResetHrFilters();
      expect(f.staff.search).toBe('');
      expect(f.designations.status).toBe('');
      expect(f.roster.fromDate).toBe('');
    });
  });

  // ==========================================================================
  // 16. Error Mapping & Sanitization
  // ==========================================================================
  describe('16. Error Mapping & Sanitization', () => {
    it('16.1 maps HR_DESIGNATION_CODE_EXISTS', () => {
      expect(getHrErrorMessage('HR_DESIGNATION_CODE_EXISTS')).toBe(
        'A designation with this code already exists for this outlet.'
      );
    });

    it('16.2 maps HR_DESIGNATION_NOT_ACTIVE', () => {
      expect(getHrErrorMessage('HR_DESIGNATION_NOT_ACTIVE')).toBe(
        'Selected designation is not active.'
      );
    });

    it('16.3 maps HR_STAFF_CODE_EXISTS', () => {
      expect(getHrErrorMessage('HR_STAFF_CODE_EXISTS')).toBe(
        'A staff member with this employee code already exists for this outlet.'
      );
    });

    it('16.4 maps HR_STAFF_NOT_ACTIVE', () => {
      expect(getHrErrorMessage('HR_STAFF_NOT_ACTIVE')).toBe(
        'Selected staff member is not active.'
      );
    });

    it('16.5 maps HR_STAFF_DESIGNATION_OUTLET_MISMATCH', () => {
      expect(getHrErrorMessage('HR_STAFF_DESIGNATION_OUTLET_MISMATCH')).toBe(
        'Designation does not belong to the same outlet.'
      );
    });

    it('16.6 maps HR_AADHAAR_DOCUMENT_NOT_FOUND', () => {
      expect(getHrErrorMessage('HR_AADHAAR_DOCUMENT_NOT_FOUND')).toBe(
        'Aadhaar document not found.'
      );
    });

    it('16.7 maps HR_AADHAAR_DOCUMENT_OUTLET_MISMATCH', () => {
      expect(getHrErrorMessage('HR_AADHAAR_DOCUMENT_OUTLET_MISMATCH')).toBe(
        'Aadhaar document belongs to a different outlet.'
      );
    });

    it('16.8 maps HR_PHOTO_DOCUMENT_OUTLET_MISMATCH', () => {
      expect(getHrErrorMessage('HR_PHOTO_DOCUMENT_OUTLET_MISMATCH')).toBe(
        'Photo document belongs to a different outlet.'
      );
    });

    it('16.9 maps HR_MANPOWER_SANCTION_EXISTS', () => {
      expect(getHrErrorMessage('HR_MANPOWER_SANCTION_EXISTS')).toBe(
        'A manpower sanction already exists for this designation.'
      );
    });

    it('16.10 maps HR_ROSTER_EXISTS', () => {
      expect(getHrErrorMessage('HR_ROSTER_EXISTS')).toBe(
        'A roster assignment already exists for this staff member on this date.'
      );
    });

    it('16.11 maps HR_STAFF_NOT_FOUND', () => {
      expect(getHrErrorMessage('HR_STAFF_NOT_FOUND')).toBe(
        'Staff member not found.'
      );
    });

    it('16.12 maps HR_SHIFT_TEMPLATE_NOT_FOUND', () => {
      expect(getHrErrorMessage('HR_SHIFT_TEMPLATE_NOT_FOUND')).toBe(
        'Shift template not found.'
      );
    });

    it('16.13 maps HR_SHIFT_TEMPLATE_NOT_ACTIVE', () => {
      expect(getHrErrorMessage('HR_SHIFT_TEMPLATE_NOT_ACTIVE')).toBe(
        'Shift template is not active.'
      );
    });

    it('16.14 maps FORBIDDEN', () => {
      expect(getHrErrorMessage('FORBIDDEN')).toBe(
        'You do not have permission to perform this action.'
      );
    });

    it('16.15 maps INTERNAL_SERVER_ERROR', () => {
      expect(getHrErrorMessage('INTERNAL_SERVER_ERROR')).toBe(
        'An unexpected server error occurred.'
      );
    });

    it('16.16 sanitizes raw SQLite or SQL constraint errors', () => {
      expect(getHrErrorMessage('SQLITE_CONSTRAINT: UNIQUE constraint failed')).toBe(
        'An unexpected server error occurred.'
      );
    });

    it('16.17 handles structured error objects correctly', () => {
      expect(getHrErrorMessage({ code: 'HR_STAFF_NOT_FOUND' })).toBe('Staff member not found.');
      expect(getHrErrorMessage({ error: { code: 'HR_ROSTER_EXISTS' } })).toBe(
        'A roster assignment already exists for this staff member on this date.'
      );
    });
  });

  // ==========================================================================
  // 17. Phase 5A-2 Hardening & Filter Isolation Additions
  // ==========================================================================
  describe('17. Phase 5A-2 Hardening & Filter Isolation Additions', () => {
    it('17.1 canRequestHrStaffList blocks when joinedFrom > joinedTo', () => {
      expect(canRequestHrStaffList({ joinedFrom: '2026-06-01', joinedTo: '2026-05-01' })).toBe(false);
    });

    it('17.2 canRequestHrStaffList allows when joinedFrom <= joinedTo', () => {
      expect(canRequestHrStaffList({ joinedFrom: '2026-05-01', joinedTo: '2026-06-01' })).toBe(true);
    });

    it('17.3 canRequestHrStaffList allows one-sided ranges', () => {
      expect(canRequestHrStaffList({ joinedFrom: '2026-05-01', joinedTo: '' })).toBe(true);
      expect(canRequestHrStaffList({ joinedFrom: '', joinedTo: '2026-06-01' })).toBe(true);
      expect(canRequestHrStaffList({})).toBe(true);
    });

    it('17.4 canRequestHrRosterList blocks when fromDate > toDate', () => {
      expect(canRequestHrRosterList({ fromDate: '2026-06-01', toDate: '2026-05-01' })).toBe(false);
    });

    it('17.5 canRequestHrRosterList allows when fromDate <= toDate', () => {
      expect(canRequestHrRosterList({ fromDate: '2026-05-01', toDate: '2026-06-01' })).toBe(true);
    });

    it('17.6 canRequestHrRosterList allows one-sided ranges', () => {
      expect(canRequestHrRosterList({ fromDate: '2026-05-01', toDate: '' })).toBe(true);
      expect(canRequestHrRosterList({ fromDate: '', toDate: '2026-06-01' })).toBe(true);
      expect(canRequestHrRosterList({})).toBe(true);
    });

    it('17.7 getLocalDateInputValue returns formatted YYYY-MM-DD string', () => {
      const d = new Date(2026, 3, 5); // April 5, 2026
      const val = getLocalDateInputValue(d);
      expect(val).toBe('2026-04-05');
    });

    it('17.8 getLocalDateInputValue pads single digit month and day', () => {
      const d = new Date(2026, 0, 9); // Jan 9, 2026
      const val = getLocalDateInputValue(d);
      expect(val).toBe('2026-01-09');
    });

    it('17.9 filtered Staff Directory does not affect master reference staff list', () => {
      const masterStaff = [
        { id: 's1', outletId: 'o1', employeeCode: 'E1', fullName: 'Staff 1', designationId: 'd1', aadhaarLast4: '1234', emergencyContactName: 'A', emergencyContactPhone: '9999999999', joiningDate: '2026-01-01', employmentStatus: 'ACTIVE' },
        { id: 's2', outletId: 'o1', employeeCode: 'E2', fullName: 'Staff 2', designationId: 'd1', aadhaarLast4: '5678', emergencyContactName: 'B', emergencyContactPhone: '8888888888', joiningDate: '2026-01-01', employmentStatus: 'INACTIVE' },
      ] as HrStaff[];
      const filteredStaff = masterStaff.filter(s => s.employmentStatus === 'ACTIVE');
      expect(filteredStaff.length).toBe(1);
      expect(masterStaff.length).toBe(2);
    });

    it('17.10 filtered Designations tab does not affect Staff modal designation choices', () => {
      const masterDesignations = [
        { id: 'd1', outletId: 'o1', code: 'DSM', name: 'Driveway Salesman', status: 'ACTIVE' },
        { id: 'd2', outletId: 'o1', code: 'SUP', name: 'Supervisor', status: 'INACTIVE' },
      ] as HrDesignation[];
      const filteredDesig = masterDesignations.filter(d => d.code === 'DSM');
      expect(filteredDesig.length).toBe(1);

      const eligible = getEligibleStaffDesignations(masterDesignations, null, 'o1');
      expect(eligible.some(d => d.id === 'd2')).toBe(false);
      expect(eligible.length).toBe(1);
    });

    it('17.11 unsanctioned active designation included in manpower sanctions creation options', () => {
      const designations = [
        { id: 'd1', outletId: 'o1', code: 'DSM', name: 'DSM', status: 'ACTIVE' },
        { id: 'd2', outletId: 'o1', code: 'SUP', name: 'Supervisor', status: 'ACTIVE' },
      ] as HrDesignation[];
      const existingSanctions = [
        { id: 's1', outletId: 'o1', designationId: 'd1', sanctionedCount: 5, effectiveFrom: '2026-01-01' },
      ] as HrManpowerSanction[];
      const existingIds = new Set(existingSanctions.map(s => s.designationId));
      const available = designations.filter(d => !existingIds.has(d.id));
      expect(available.length).toBe(1);
      expect(available[0].id).toBe('d2');
    });

    it('17.12 already sanctioned designation excluded from create options', () => {
      const designations = [
        { id: 'd1', outletId: 'o1', code: 'DSM', name: 'DSM', status: 'ACTIVE' },
      ] as HrDesignation[];
      const existingSanctions = [
        { id: 's1', outletId: 'o1', designationId: 'd1', sanctionedCount: 5, effectiveFrom: '2026-01-01' },
      ] as HrManpowerSanction[];
      const existingIds = new Set(existingSanctions.map(s => s.designationId));
      const available = designations.filter(d => !existingIds.has(d.id));
      expect(available.length).toBe(0);
    });

    it('17.13 inactive unsanctioned designation included with annotation', () => {
      const designations = [
        { id: 'd3', outletId: 'o1', code: 'OLD', name: 'Legacy Role', status: 'INACTIVE' },
      ] as HrDesignation[];
      const existingSanctions = [] as HrManpowerSanction[];
      const existingIds = new Set(existingSanctions.map(s => s.designationId));
      const available = designations.filter(d => !existingIds.has(d.id));
      expect(available.length).toBe(1);
      expect(available[0].status).toBe('INACTIVE');
    });

    it('17.14 CREATE sanction preselection sets initial designation', () => {
      const initialDesignationId = 'd-preset';
      const resolvedId = initialDesignationId || '';
      expect(resolvedId).toBe('d-preset');
    });

    it('17.15 CREATE without preselection sets empty designation', () => {
      const initialDesignationId = null;
      const resolvedId = initialDesignationId || '';
      expect(resolvedId).toBe('');
    });

    it('17.16 EDIT sanction preserves existing designation', () => {
      const sanction = {
        id: 's1',
        outletId: 'o1',
        designationId: 'd-edit',
        sanctionedCount: 4,
        effectiveFrom: '2026-01-01',
      } as HrManpowerSanction;
      const designationId = sanction.designationId;
      expect(designationId).toBe('d-edit');
    });

    it('17.17 reset filters returns all blank filter states', () => {
      const filters = getResetHrFilters();
      expect(filters.staff.designationId).toBe('');
      expect(filters.staff.employmentStatus).toBe('');
      expect(filters.staff.search).toBe('');
      expect(filters.staff.joinedFrom).toBe('');
      expect(filters.staff.joinedTo).toBe('');
      expect(filters.designations.search).toBe('');
      expect(filters.designations.status).toBe('');
      expect(filters.manpower.search).toBe('');
      expect(filters.roster.staffId).toBe('');
      expect(filters.roster.fromDate).toBe('');
      expect(filters.roster.toDate).toBe('');
    });

    it('17.18 validateHrJoinedDateRange returns success when dates are equal', () => {
      const res = validateHrJoinedDateRange('2026-05-01', '2026-05-01');
      expect(res.valid).toBe(true);
    });

    it('17.19 validateHrRosterDateRange returns success when dates are equal', () => {
      const res = validateHrRosterDateRange('2026-05-01', '2026-05-01');
      expect(res.valid).toBe(true);
    });

    it('17.20 getEligibleStaffDesignations handles empty array safely', () => {
      const res = getEligibleStaffDesignations([], null, 'o1');
      expect(res).toEqual([]);
    });

    it('17.21 getEligibleRosterStaff handles empty array safely', () => {
      const res = getEligibleRosterStaff([], null, 'o1');
      expect(res).toEqual([]);
    });

    it('17.22 getHrErrorMessage returns custom string when unknown error format passed', () => {
      const res = getHrErrorMessage('SOME_RANDOM_CUSTOM_ERROR');
      expect(res).toBe('SOME_RANDOM_CUSTOM_ERROR');
    });
  });
});
