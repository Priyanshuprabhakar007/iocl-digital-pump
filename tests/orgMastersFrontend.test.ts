import { describe, it, expect } from 'vitest';
import {
  getOrgStatusLabel,
  getOrgStatusBadgeClass,
  getOfficerStatusLabel,
  getOfficerStatusBadgeClass,
  getScopeLevelLabel,
  getScopeBadgeClass,
  getServiceTypeLabel,
  getServiceTypeBadgeClass,
  formatOrgDate,
  formatAssignmentPeriod,
  filterDepartments,
  filterOfficers,
  filterServiceProviders,
  getActiveServiceProvidersForNewAssignment,
  canReadOrgMasters,
  canWriteOrgMasters,
  canWriteGlobalOrgMasters,
  canWriteOfficerPostings,
  canWriteOutletAssignments,
  buildPostingLocationLabel,
  getFilteredDivisions,
  getFilteredSalesAreas,
  getFilteredOutlets,
  isValidCalendarDate,
  validateEffectiveDates,
  mapOrgErrorMessage,
  HierarchyContext,
} from '../src/frontend/components/org/orgUi';
import {
  Department,
  Officer,
  OfficerPosting,
  ServiceProvider,
  State,
  Division,
  SalesArea,
  RetailOutlet,
  UserContext,
} from '../src/shared/types';
import { PERMISSIONS } from '../src/shared/constants';

describe('Organization Masters - Pure Frontend Logic Suite', () => {
  // ---------------------------------------------------------------------------
  // 1. Labels and Badge Classes
  // ---------------------------------------------------------------------------
  describe('Status, Scope and Service Type Labels', () => {
    it('returns correct org status labels and handles edge cases', () => {
      expect(getOrgStatusLabel('ACTIVE')).toBe('Active');
      expect(getOrgStatusLabel('INACTIVE')).toBe('Inactive');
      expect(getOrgStatusLabel('CUSTOM_STATUS')).toBe('CUSTOM_STATUS');
      expect(getOrgStatusLabel('')).toBe('Unknown');
    });

    it('returns correct org status badge classes', () => {
      expect(getOrgStatusBadgeClass('ACTIVE')).toContain('emerald');
      expect(getOrgStatusBadgeClass('INACTIVE')).toContain('slate');
      expect(getOrgStatusBadgeClass('OTHER')).toContain('slate-700');
    });

    it('returns correct officer status labels and handles edge cases', () => {
      expect(getOfficerStatusLabel('ACTIVE')).toBe('Active');
      expect(getOfficerStatusLabel('INACTIVE')).toBe('Inactive');
      expect(getOfficerStatusLabel('TRANSFERRED')).toBe('Transferred');
      expect(getOfficerStatusLabel('RETIRED')).toBe('Retired');
      expect(getOfficerStatusLabel('SUSPENDED')).toBe('SUSPENDED');
      expect(getOfficerStatusLabel('')).toBe('Unknown');
    });

    it('returns correct officer status badge classes', () => {
      expect(getOfficerStatusBadgeClass('ACTIVE')).toContain('emerald');
      expect(getOfficerStatusBadgeClass('INACTIVE')).toContain('slate');
      expect(getOfficerStatusBadgeClass('TRANSFERRED')).toContain('amber');
      expect(getOfficerStatusBadgeClass('RETIRED')).toContain('blue');
      expect(getOfficerStatusBadgeClass('OTHER')).toContain('slate-700');
    });

    it('returns correct scope level labels and badges', () => {
      expect(getScopeLevelLabel('GLOBAL')).toBe('Global / Head Office');
      expect(getScopeLevelLabel('STATE')).toBe('State Office');
      expect(getScopeLevelLabel('DIVISION')).toBe('Divisional Office');
      expect(getScopeLevelLabel('SALES_AREA')).toBe('Sales Area');
      expect(getScopeLevelLabel('OUTLET')).toBe('Retail Outlet');
      expect(getScopeLevelLabel('REGIONAL')).toBe('REGIONAL');
      expect(getScopeLevelLabel('')).toBe('Unknown Scope');

      expect(getScopeBadgeClass('GLOBAL')).toContain('purple');
      expect(getScopeBadgeClass('STATE')).toContain('blue');
      expect(getScopeBadgeClass('DIVISION')).toContain('cyan');
      expect(getScopeBadgeClass('SALES_AREA')).toContain('amber');
      expect(getScopeBadgeClass('OUTLET')).toContain('orange');
      expect(getScopeBadgeClass('UNKNOWN')).toContain('slate-700');
    });

    it('returns correct service type labels and badges', () => {
      expect(getServiceTypeLabel('MANPOWER')).toBe('Manpower Deployment');
      expect(getServiceTypeLabel('HOUSEKEEPING')).toBe('Housekeeping & Sanitation');
      expect(getServiceTypeLabel('SECURITY')).toBe('Security Agency');
      expect(getServiceTypeLabel('MAINTENANCE')).toBe('Equipment & Facility Maintenance');
      expect(getServiceTypeLabel('OTHER')).toBe('Other Services');
      expect(getServiceTypeLabel('CONSULTING')).toBe('CONSULTING');
      expect(getServiceTypeLabel('')).toBe('Unknown Service');

      expect(getServiceTypeBadgeClass('SECURITY')).toContain('red');
      expect(getServiceTypeBadgeClass('MANPOWER')).toContain('amber');
      expect(getServiceTypeBadgeClass('MAINTENANCE')).toContain('cyan');
      expect(getServiceTypeBadgeClass('HOUSEKEEPING')).toContain('emerald');
      expect(getServiceTypeBadgeClass('OTHER')).toContain('slate-500');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Date Formatting
  // ---------------------------------------------------------------------------
  describe('formatOrgDate & formatAssignmentPeriod', () => {
    it('formats standard YYYY-MM-DD dates cleanly', () => {
      expect(formatOrgDate('2026-03-15')).toBe('15 Mar 2026');
      expect(formatOrgDate('2026-01-01')).toBe('01 Jan 2026');
      expect(formatOrgDate('2025-12-31')).toBe('31 Dec 2025');
    });

    it('handles null, undefined, empty string, or invalid inputs safely', () => {
      expect(formatOrgDate(null)).toBe('—');
      expect(formatOrgDate(undefined)).toBe('—');
      expect(formatOrgDate('')).toBe('—');
    });

    it('formats assignment periods including ongoing tenure', () => {
      expect(formatAssignmentPeriod('2026-01-01', '2026-12-31')).toBe('01 Jan 2026 → 31 Dec 2026');
      expect(formatAssignmentPeriod('2026-01-01', null)).toBe('01 Jan 2026 → Present / Ongoing');
      expect(formatAssignmentPeriod('2026-01-01', undefined)).toBe('01 Jan 2026 → Present / Ongoing');
      expect(formatAssignmentPeriod(null, null)).toBe('— → Present / Ongoing');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Strict Calendar Date Validation
  // ---------------------------------------------------------------------------
  describe('Strict Calendar Date Validation', () => {
    it('validates realistic calendar dates', () => {
      expect(isValidCalendarDate('2026-01-15')).toBe(true);
      expect(isValidCalendarDate('2026-02-28')).toBe(true);
      expect(isValidCalendarDate('2024-02-29')).toBe(true); // Leap year 2024
      expect(isValidCalendarDate('2026-12-31')).toBe(true);
    });

    it('rejects impossible calendar dates', () => {
      expect(isValidCalendarDate('2026-02-31')).toBe(false); // Impossible February day
      expect(isValidCalendarDate('2026-02-29')).toBe(false); // Non-leap year 2026
      expect(isValidCalendarDate('2026-13-01')).toBe(false); // Month 13
      expect(isValidCalendarDate('2026-00-10')).toBe(false); // Month 0
      expect(isValidCalendarDate('2026-04-31')).toBe(false); // April has 30 days
      expect(isValidCalendarDate('2026-06-31')).toBe(false); // June has 30 days
      expect(isValidCalendarDate('2026-09-31')).toBe(false); // September has 30 days
      expect(isValidCalendarDate('2026-11-31')).toBe(false); // November has 30 days
    });

    it('rejects malformed date strings, null, or undefined', () => {
      expect(isValidCalendarDate(null)).toBe(false);
      expect(isValidCalendarDate(undefined)).toBe(false);
      expect(isValidCalendarDate('')).toBe(false);
      expect(isValidCalendarDate('15-01-2026')).toBe(false);
      expect(isValidCalendarDate('2026/01/15')).toBe(false);
      expect(isValidCalendarDate('not-a-date')).toBe(false);
    });

    it('enforces validateEffectiveDates rules', () => {
      // Required from date
      expect(validateEffectiveDates('', '2026-12-31')).toBe('Effective From date is required.');
      expect(validateEffectiveDates(null, '2026-12-31')).toBe('Effective From date is required.');

      // Invalid from date
      expect(validateEffectiveDates('2026-02-31', '2026-12-31')).toContain('valid calendar date');
      expect(validateEffectiveDates('2026-13-01', null)).toContain('valid calendar date');

      // Invalid to date
      expect(validateEffectiveDates('2026-01-01', '2026-02-31')).toContain('valid calendar date');

      // effectiveTo < effectiveFrom
      expect(validateEffectiveDates('2026-06-01', '2026-05-01')).toBe(
        'Effective To date cannot be earlier than Effective From date.'
      );

      // Valid open-ended tenure
      expect(validateEffectiveDates('2026-01-01', null)).toBeNull();
      expect(validateEffectiveDates('2026-01-01', '')).toBeNull();

      // Valid bounded tenure
      expect(validateEffectiveDates('2026-01-01', '2026-12-31')).toBeNull();
      expect(validateEffectiveDates('2026-01-01', '2026-01-01')).toBeNull(); // Same day valid
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Filtering Helpers
  // ---------------------------------------------------------------------------
  describe('filterDepartments', () => {
    const mockDepts: Department[] = [
      {
        id: 'dept-1',
        code: 'ENG',
        name: 'Engineering & Maintenance',
        description: 'Retail equipment infrastructure',
        status: 'ACTIVE',
        createdBy: 'user-1',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      {
        id: 'dept-2',
        code: 'OPS',
        name: 'Retail Operations',
        description: 'Fuel dispensing and shift ops',
        status: 'ACTIVE',
        createdBy: 'user-1',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      {
        id: 'dept-3',
        code: 'VIG',
        name: 'Vigilance & Audit',
        description: 'Inspection and governance',
        status: 'INACTIVE',
        createdBy: 'user-1',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];

    it('filters by search query across code, name, and description', () => {
      expect(filterDepartments(mockDepts, 'ENG', 'ALL')).toHaveLength(1);
      expect(filterDepartments(mockDepts, 'retail', 'ALL')).toHaveLength(2);
      expect(filterDepartments(mockDepts, 'dispensing', 'ALL')).toHaveLength(1);
      expect(filterDepartments(mockDepts, 'nonexistent', 'ALL')).toHaveLength(0);
    });

    it('filters by status', () => {
      expect(filterDepartments(mockDepts, '', 'ACTIVE')).toHaveLength(2);
      expect(filterDepartments(mockDepts, '', 'INACTIVE')).toHaveLength(1);
      expect(filterDepartments(mockDepts, '', 'ALL')).toHaveLength(3);
    });

    it('handles empty arrays and null safely', () => {
      expect(filterDepartments([], 'test', 'ALL')).toEqual([]);
      expect(filterDepartments(null, 'test', 'ALL')).toEqual([]);
      expect(filterDepartments(undefined, 'test', 'ALL')).toEqual([]);
    });
  });

  describe('filterOfficers', () => {
    const mockOfficers: Officer[] = [
      {
        id: 'off-1',
        employeeCode: 'EMP-101',
        fullName: 'Rajesh Sharma',
        designationTitle: 'Senior Manager (Retail)',
        departmentId: 'dept-ops',
        email: 'rajesh.sharma@iocl.in',
        phone: '9876543210',
        status: 'ACTIVE',
        notes: null,
        createdBy: 'user-1',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      {
        id: 'off-2',
        employeeCode: 'EMP-102',
        fullName: 'Amit Verma',
        designationTitle: 'Assistant Manager (Engineering)',
        departmentId: 'dept-eng',
        email: 'amit.verma@iocl.in',
        phone: '9811122233',
        status: 'TRANSFERRED',
        notes: null,
        createdBy: 'user-1',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      {
        id: 'off-3',
        employeeCode: 'EMP-103',
        fullName: 'Sunita Rao',
        designationTitle: 'Divisional Retail Head',
        departmentId: 'dept-ops',
        email: 'sunita.rao@iocl.in',
        phone: '9822233344',
        status: 'RETIRED',
        notes: null,
        createdBy: 'user-1',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];

    it('filters by search query across code, name, designation, phone, and email', () => {
      expect(filterOfficers(mockOfficers, 'EMP-101', 'ALL', 'ALL')).toHaveLength(1);
      expect(filterOfficers(mockOfficers, 'Rajesh', 'ALL', 'ALL')).toHaveLength(1);
      expect(filterOfficers(mockOfficers, 'Manager', 'ALL', 'ALL')).toHaveLength(2);
      expect(filterOfficers(mockOfficers, '98111', 'ALL', 'ALL')).toHaveLength(1);
      expect(filterOfficers(mockOfficers, 'sunita.rao', 'ALL', 'ALL')).toHaveLength(1);
    });

    it('filters by department', () => {
      expect(filterOfficers(mockOfficers, '', 'dept-ops', 'ALL')).toHaveLength(2);
      expect(filterOfficers(mockOfficers, '', 'dept-eng', 'ALL')).toHaveLength(1);
      expect(filterOfficers(mockOfficers, '', 'dept-other', 'ALL')).toHaveLength(0);
    });

    it('filters by officer status', () => {
      expect(filterOfficers(mockOfficers, '', 'ALL', 'ACTIVE')).toHaveLength(1);
      expect(filterOfficers(mockOfficers, '', 'ALL', 'TRANSFERRED')).toHaveLength(1);
      expect(filterOfficers(mockOfficers, '', 'ALL', 'RETIRED')).toHaveLength(1);
      expect(filterOfficers(mockOfficers, '', 'ALL', 'INACTIVE')).toHaveLength(0);
    });

    it('combines search, department, and status filters', () => {
      expect(filterOfficers(mockOfficers, 'Manager', 'dept-ops', 'ACTIVE')).toHaveLength(1);
      expect(filterOfficers(mockOfficers, 'Manager', 'dept-ops', 'TRANSFERRED')).toHaveLength(0);
    });

    it('handles empty arrays and null safely', () => {
      expect(filterOfficers([], '', 'ALL', 'ALL')).toEqual([]);
      expect(filterOfficers(null, '', 'ALL', 'ALL')).toEqual([]);
      expect(filterOfficers(undefined, '', 'ALL', 'ALL')).toEqual([]);
    });
  });

  describe('filterServiceProviders and getActiveServiceProvidersForNewAssignment', () => {
    const mockProviders: ServiceProvider[] = [
      {
        id: 'sp-1',
        providerCode: 'SP-SEC-01',
        providerName: 'Apex Security & Allied Services',
        proprietorOrAuthorizedPerson: 'Col. R. Singh',
        contactPerson: 'Vikas Kumar',
        phone: '9988776655',
        alternatePhone: null,
        email: 'apex@security.com',
        gstin: '07AAAAA0000A1Z5',
        pan: 'AAAAA0000A',
        address: '12 Connaught Place',
        city: 'New Delhi',
        district: 'Central Delhi',
        stateText: 'Delhi',
        pincode: '110001',
        status: 'ACTIVE',
        notes: null,
        createdBy: 'user-1',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      {
        id: 'sp-2',
        providerCode: 'SP-MAN-02',
        providerName: 'Prime Manpower Solutions',
        proprietorOrAuthorizedPerson: 'Sanjay Gupta',
        contactPerson: 'Manoj Sharma',
        phone: '9911223344',
        alternatePhone: null,
        email: 'prime@manpower.com',
        gstin: '09BBBBB1111B1Z2',
        pan: 'BBBBB1111B',
        address: 'Sector 62',
        city: 'Noida',
        district: 'Gautam Buddha Nagar',
        stateText: 'Uttar Pradesh',
        pincode: '201301',
        status: 'INACTIVE',
        notes: null,
        createdBy: 'user-1',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];

    it('filters providers by search query across multiple fields', () => {
      expect(filterServiceProviders(mockProviders, 'SP-SEC', 'ALL')).toHaveLength(1);
      expect(filterServiceProviders(mockProviders, 'Apex', 'ALL')).toHaveLength(1);
      expect(filterServiceProviders(mockProviders, 'Vikas', 'ALL')).toHaveLength(1);
      expect(filterServiceProviders(mockProviders, '07AAAAA', 'ALL')).toHaveLength(1);
      expect(filterServiceProviders(mockProviders, 'Noida', 'ALL')).toHaveLength(1);
    });

    it('filters providers by status', () => {
      expect(filterServiceProviders(mockProviders, '', 'ACTIVE')).toHaveLength(1);
      expect(filterServiceProviders(mockProviders, '', 'INACTIVE')).toHaveLength(1);
      expect(filterServiceProviders(mockProviders, '', 'ALL')).toHaveLength(2);
    });

    it('getActiveServiceProvidersForNewAssignment strictly excludes INACTIVE providers', () => {
      const activeOnly = getActiveServiceProvidersForNewAssignment(mockProviders);
      expect(activeOnly).toHaveLength(1);
      expect(activeOnly[0].providerCode).toBe('SP-SEC-01');
      expect(activeOnly.some((p) => p.status === 'INACTIVE')).toBe(false);
    });

    it('handles empty or null arrays safely', () => {
      expect(filterServiceProviders([], '', 'ALL')).toEqual([]);
      expect(filterServiceProviders(null, '', 'ALL')).toEqual([]);
      expect(getActiveServiceProvidersForNewAssignment([])).toEqual([]);
      expect(getActiveServiceProvidersForNewAssignment(null)).toEqual([]);
      expect(getActiveServiceProvidersForNewAssignment(undefined)).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Permission Helpers
  // ---------------------------------------------------------------------------
  describe('Permission Helpers', () => {
    const mockGlobalUser: UserContext = {
      user: {
        id: 'usr-1',
        empCode: 'IOC-001',
        name: 'Super Admin',
        email: 'admin@iocl.in',
        phone: '9800000001',
        status: 'ACTIVE',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      roles: ['ADMIN'],
      permissions: [PERMISSIONS.ORG_MASTERS_READ, PERMISSIONS.ORG_MASTERS_WRITE],
      scopes: [],
      primaryScope: 'GLOBAL',
      isGlobalScope: true,
      accessibleStateIds: [],
      accessibleDivisionIds: [],
      accessibleSalesAreaIds: [],
      accessibleOutletIds: [],
      isGlobalAdmin: true,
    };

    const mockScopedUser: UserContext = {
      user: {
        id: 'usr-2',
        empCode: 'IOC-002',
        name: 'Sales Officer',
        email: 'so@iocl.in',
        phone: '9800000002',
        status: 'ACTIVE',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      roles: ['FIELD_OFFICER'],
      permissions: [PERMISSIONS.ORG_MASTERS_READ, PERMISSIONS.ORG_MASTERS_WRITE],
      scopes: [],
      primaryScope: 'OUTLET',
      isGlobalScope: false,
      accessibleStateIds: [],
      accessibleDivisionIds: [],
      accessibleSalesAreaIds: [],
      accessibleOutletIds: ['ro-1'],
      isGlobalAdmin: false,
    };

    it('canReadOrgMasters validates read permission', () => {
      expect(canReadOrgMasters((p) => p === PERMISSIONS.ORG_MASTERS_READ)).toBe(true);
      expect(canReadOrgMasters(() => false)).toBe(false);
    });

    it('canWriteGlobalOrgMasters requires BOTH write permission AND isGlobalScope === true', () => {
      // Global scope with write permission -> true
      expect(
        canWriteGlobalOrgMasters((p) => p === PERMISSIONS.ORG_MASTERS_WRITE, mockGlobalUser)
      ).toBe(true);

      // Scoped user with write permission -> false
      expect(
        canWriteGlobalOrgMasters((p) => p === PERMISSIONS.ORG_MASTERS_WRITE, mockScopedUser)
      ).toBe(false);

      // Global scope without write permission -> false
      expect(canWriteGlobalOrgMasters(() => false, mockGlobalUser)).toBe(false);

      // Null user -> false
      expect(
        canWriteGlobalOrgMasters((p) => p === PERMISSIONS.ORG_MASTERS_WRITE, null)
      ).toBe(false);
      expect(
        canWriteGlobalOrgMasters((p) => p === PERMISSIONS.ORG_MASTERS_WRITE, undefined)
      ).toBe(false);
    });

    it('canWriteOfficerPostings and canWriteOutletAssignments check write permission', () => {
      expect(canWriteOfficerPostings((p) => p === PERMISSIONS.ORG_MASTERS_WRITE)).toBe(true);
      expect(canWriteOfficerPostings(() => false)).toBe(false);

      expect(canWriteOutletAssignments((p) => p === PERMISSIONS.ORG_MASTERS_WRITE)).toBe(true);
      expect(canWriteOutletAssignments(() => false)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Posting Location Label Resolution
  // ---------------------------------------------------------------------------
  describe('buildPostingLocationLabel', () => {
    const mockHierarchy: HierarchyContext = {
      states: [{ id: 'st-dl', code: 'DL', name: 'Delhi State Office', status: 'ACTIVE', createdAt: '', updatedAt: '' }],
      divisions: [{ id: 'div-nd', stateId: 'st-dl', code: 'NDDO', name: 'New Delhi DO', status: 'ACTIVE', createdAt: '', updatedAt: '' }],
      salesAreas: [{ id: 'sa-c1', divisionId: 'div-nd', code: 'CENTRAL-SA', name: 'Central Sales Area', status: 'ACTIVE', createdAt: '', updatedAt: '' }],
      outlets: [
        {
          id: 'ro-1001',
          roCode: 'RO-1001',
          name: 'Connaught Fuels',
          outletType: 'COCO',
          stateId: 'st-dl',
          divisionId: 'div-nd',
          salesAreaId: 'sa-c1',
          status: 'ACTIVE',
          address: '',
          city: 'New Delhi',
          district: 'Central',
          pincode: '110001',
          createdAt: '',
          updatedAt: '',
        },
      ],
    };

    it('resolves GLOBAL scope', () => {
      const posting: OfficerPosting = {
        id: 'p-1',
        officerId: 'off-1',
        scopeLevel: 'GLOBAL',
        stateId: null,
        divisionId: null,
        salesAreaId: null,
        outletId: null,
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        isPrimary: true,
        status: 'ACTIVE',
        notes: null,
        createdBy: '',
        createdAt: '',
        updatedAt: '',
      };
      expect(buildPostingLocationLabel(posting, mockHierarchy)).toBe(
        'All IOCL Operations (Head Office)'
      );
    });

    it('resolves STATE scope', () => {
      const posting: OfficerPosting = {
        id: 'p-2',
        officerId: 'off-1',
        scopeLevel: 'STATE',
        stateId: 'st-dl',
        divisionId: null,
        salesAreaId: null,
        outletId: null,
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        isPrimary: true,
        status: 'ACTIVE',
        notes: null,
        createdBy: '',
        createdAt: '',
        updatedAt: '',
      };
      expect(buildPostingLocationLabel(posting, mockHierarchy)).toBe('Delhi State Office (DL)');
    });

    it('resolves DIVISION scope', () => {
      const posting: OfficerPosting = {
        id: 'p-3',
        officerId: 'off-1',
        scopeLevel: 'DIVISION',
        stateId: 'st-dl',
        divisionId: 'div-nd',
        salesAreaId: null,
        outletId: null,
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        isPrimary: true,
        status: 'ACTIVE',
        notes: null,
        createdBy: '',
        createdAt: '',
        updatedAt: '',
      };
      expect(buildPostingLocationLabel(posting, mockHierarchy)).toBe('New Delhi DO (NDDO)');
    });

    it('resolves SALES_AREA scope', () => {
      const posting: OfficerPosting = {
        id: 'p-4',
        officerId: 'off-1',
        scopeLevel: 'SALES_AREA',
        stateId: 'st-dl',
        divisionId: 'div-nd',
        salesAreaId: 'sa-c1',
        outletId: null,
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        isPrimary: true,
        status: 'ACTIVE',
        notes: null,
        createdBy: '',
        createdAt: '',
        updatedAt: '',
      };
      expect(buildPostingLocationLabel(posting, mockHierarchy)).toBe(
        'Central Sales Area (CENTRAL-SA)'
      );
    });

    it('resolves OUTLET scope', () => {
      const posting: OfficerPosting = {
        id: 'p-5',
        officerId: 'off-1',
        scopeLevel: 'OUTLET',
        stateId: 'st-dl',
        divisionId: 'div-nd',
        salesAreaId: 'sa-c1',
        outletId: 'ro-1001',
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        isPrimary: true,
        status: 'ACTIVE',
        notes: null,
        createdBy: '',
        createdAt: '',
        updatedAt: '',
      };
      expect(buildPostingLocationLabel(posting, mockHierarchy)).toBe('Connaught Fuels (RO-1001)');
    });

    it('falls back gracefully on unknown IDs or missing hierarchy metadata', () => {
      const postingUnknown: OfficerPosting = {
        id: 'p-6',
        officerId: 'off-1',
        scopeLevel: 'OUTLET',
        stateId: null,
        divisionId: null,
        salesAreaId: null,
        outletId: 'ro-unknown',
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        isPrimary: false,
        status: 'ACTIVE',
        notes: null,
        createdBy: '',
        createdAt: '',
        updatedAt: '',
      };
      expect(buildPostingLocationLabel(postingUnknown, mockHierarchy)).toBe('ro-unknown');

      expect(buildPostingLocationLabel(null, mockHierarchy)).toBe('—');
      expect(buildPostingLocationLabel(undefined, mockHierarchy)).toBe('—');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Hierarchy Cascading Helpers
  // ---------------------------------------------------------------------------
  describe('Hierarchy Cascading Helpers', () => {
    const divisions: Division[] = [
      { id: 'div-1', stateId: 'st-1', code: 'D1', name: 'Div 1', status: 'ACTIVE', createdAt: '', updatedAt: '' },
      { id: 'div-2', stateId: 'st-2', code: 'D2', name: 'Div 2', status: 'ACTIVE', createdAt: '', updatedAt: '' },
    ];

    const salesAreas: SalesArea[] = [
      { id: 'sa-1', divisionId: 'div-1', code: 'SA1', name: 'SA 1', status: 'ACTIVE', createdAt: '', updatedAt: '' },
      { id: 'sa-2', divisionId: 'div-2', code: 'SA2', name: 'SA 2', status: 'ACTIVE', createdAt: '', updatedAt: '' },
    ];

    const outlets: RetailOutlet[] = [
      {
        id: 'ro-1',
        roCode: 'R1',
        name: 'RO 1',
        outletType: 'COCO',
        stateId: 'st-1',
        divisionId: 'div-1',
        salesAreaId: 'sa-1',
        status: 'ACTIVE',
        address: '',
        city: '',
        district: '',
        pincode: '',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'ro-2',
        roCode: 'R2',
        name: 'RO 2',
        outletType: 'COCO',
        stateId: 'st-2',
        divisionId: 'div-2',
        salesAreaId: 'sa-2',
        status: 'ACTIVE',
        address: '',
        city: '',
        district: '',
        pincode: '',
        createdAt: '',
        updatedAt: '',
      },
    ];

    it('cascades State -> Divisions', () => {
      expect(getFilteredDivisions(divisions, 'st-1')).toHaveLength(1);
      expect(getFilteredDivisions(divisions, 'st-1')[0].id).toBe('div-1');
      expect(getFilteredDivisions(divisions, '')).toEqual(divisions);
      expect(getFilteredDivisions(null, 'st-1')).toEqual([]);
    });

    it('cascades Division -> Sales Areas', () => {
      expect(getFilteredSalesAreas(salesAreas, 'div-1')).toHaveLength(1);
      expect(getFilteredSalesAreas(salesAreas, 'div-1')[0].id).toBe('sa-1');
      expect(getFilteredSalesAreas(salesAreas, '')).toEqual(salesAreas);
      expect(getFilteredSalesAreas(null, 'div-1')).toEqual([]);
    });

    it('cascades Sales Area -> Outlets', () => {
      expect(getFilteredOutlets(outlets, 'sa-1', 'div-1')).toHaveLength(1);
      expect(getFilteredOutlets(outlets, 'sa-1', 'div-1')[0].id).toBe('ro-1');
      expect(getFilteredOutlets(outlets, '', 'div-1')).toHaveLength(1);
      expect(getFilteredOutlets(outlets, '', '')).toEqual(outlets);
      expect(getFilteredOutlets(null, 'sa-1', 'div-1')).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. mapOrgErrorMessage Mapping & SQLite Sanitization
  // ---------------------------------------------------------------------------
  describe('mapOrgErrorMessage', () => {
    it('maps all defined business error codes to friendly messages', () => {
      expect(mapOrgErrorMessage('FORBIDDEN')).toContain('permission or scope authority');
      expect(mapOrgErrorMessage('VALIDATION_ERROR')).toContain('invalid input fields');
      expect(mapOrgErrorMessage('DEPARTMENT_NOT_FOUND')).toContain('department could not be found');
      expect(mapOrgErrorMessage('DUPLICATE_DEPARTMENT_CODE')).toContain('already exists');
      expect(mapOrgErrorMessage('OFFICER_NOT_FOUND')).toContain('officer record could not be found');
      expect(mapOrgErrorMessage('DUPLICATE_OFFICER')).toContain('already registered');
      expect(mapOrgErrorMessage('POSTING_NOT_FOUND')).toContain('officer posting was not found');
      expect(mapOrgErrorMessage('INVALID_ORG_HIERARCHY')).toContain('organizational hierarchy');
      expect(mapOrgErrorMessage('INVALID_POSTING_SCOPE')).toContain('posting scope');
      expect(mapOrgErrorMessage('SERVICE_PROVIDER_NOT_FOUND')).toContain('service provider could not be found');
      expect(mapOrgErrorMessage('SERVICE_PROVIDER_INACTIVE')).toContain('inactive service provider');
      expect(mapOrgErrorMessage('DUPLICATE_SERVICE_PROVIDER_CODE')).toContain('already exists');
      expect(mapOrgErrorMessage('ASSIGNMENT_NOT_FOUND')).toContain('assignment record was not found');
      expect(mapOrgErrorMessage('NETWORK_ERROR')).toContain('Network connection lost');
      expect(mapOrgErrorMessage('HTTP_ERROR')).toContain('server encountered an error');
      expect(mapOrgErrorMessage('INTERNAL_SERVER_ERROR')).toContain('internal server error occurred');
    });

    it('strictly sanitizes raw SQLite syntax errors and abort strings', () => {
      const rawSqlErrors = [
        'Unchecked raw SQLite syntax error: near "WHERE": syntax error',
        'sqlite3_step failed: table "org_officers" already exists',
        'RAISE(ABORT, "ORG_DEPARTMENT_DELETE_FORBIDDEN")',
        'SQLITE_CONSTRAINT: foreign key constraint failed',
        'Error near "FROM": SQL error',
      ];

      for (const err of rawSqlErrors) {
        const mapped = mapOrgErrorMessage(undefined, err);
        expect(mapped).toBe(
          'An unexpected database error occurred. The transaction was safely aborted.'
        );
        expect(mapped.toLowerCase()).not.toContain('sqlite');
        expect(mapped.toLowerCase()).not.toContain('syntax');
        expect(mapped.toLowerCase()).not.toContain('raise(');
      }

      // Also checks when code itself has sqlite keyword
      expect(mapOrgErrorMessage('SQLITE_ERROR', 'some message')).toBe(
        'An unexpected database error occurred. The transaction was safely aborted.'
      );
    });

    it('falls back gracefully on empty, null, or unknown error values', () => {
      expect(mapOrgErrorMessage(null, null)).toBe(
        'Unable to complete the operation. Please try again.'
      );
      expect(mapOrgErrorMessage(undefined, undefined)).toBe(
        'Unable to complete the operation. Please try again.'
      );
      expect(mapOrgErrorMessage('', '')).toBe(
        'Unable to complete the operation. Please try again.'
      );
      expect(mapOrgErrorMessage('CUSTOM_CODE', 'Custom message')).toBe('Custom message');
    });
  });
});
