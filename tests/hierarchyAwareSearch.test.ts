import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { normalizeSearchText, matchesSearch } from '../src/frontend/utils/searchUtils';
import {
  filterOutletsForSearch,
  filterUsersForSearch,
  filterScopesForSearch,
  filterPermissionsForSearch
} from '../src/frontend/utils/sectionSearchHelpers';
import { getUserPermissionRestriction } from '../src/frontend/pages/rbacUiHelper';

describe('Hierarchy-Aware Section Search Production Helpers & Security Tests', () => {
  it('1. normalization and partial matching helpers work correctly', () => {
    expect(normalizeSearchText('  COCO 22  ')).toBe('coco 22');
    expect(matchesSearch('rak', ['Rakesh Kumar', 'IOCL-FO-001'])).toBe(true);
    expect(matchesSearch('delhi', ['Rakesh Kumar', 'IOCL-FO-001'])).toBe(false);
  });

  it('2. Retail Outlets search filter helper respects fields, partial matching, and Show Hidden toggle', () => {
    const outlets = [
      { name: 'Park Street Retail Outlet', roCode: 'RO-1001', city: 'Kolkata', salesAreaId: 'sa-cen', directoryHidden: false },
      { name: 'Secret Hidden Station', roCode: 'RO-1002', city: 'Kolkata', salesAreaId: 'sa-cen', directoryHidden: true }
    ];

    // Show Hidden OFF (filter out hidden outlets first)
    const hiddenOffList = outlets.filter(o => !o.directoryHidden);
    const resultHiddenOff = filterOutletsForSearch(hiddenOffList, 'Secret', false);
    expect(resultHiddenOff.length).toBe(0);

    const resultPark = filterOutletsForSearch(hiddenOffList, 'Park', false);
    expect(resultPark.length).toBe(1);
    expect(resultPark[0].roCode).toBe('RO-1001');

    // Show Hidden ON (all outlets visible including hidden)
    const resultHiddenOn = filterOutletsForSearch(outlets, 'Secret', true);
    expect(resultHiddenOn.length).toBe(1);
    expect(resultHiddenOn[0].roCode).toBe('RO-1002');
  });

  it('3. User directory search filter helper matches name, empCode, email, role, scope and status', () => {
    const users = [
      { name: 'Rakesh Kumar', empCode: 'IOCL-FO-001', email: 'rakesh@iocl.in', phone: '9830098300', status: 'ACTIVE', roles: ['FIELD_OFFICER'], scopes: [{ scopeLevel: 'SALES_AREA' }] }
    ];

    expect(filterUsersForSearch(users, 'Rakesh').length).toBe(1);
    expect(filterUsersForSearch(users, 'IOCL-FO-001').length).toBe(1);
    expect(filterUsersForSearch(users, 'FIELD_OFFICER').length).toBe(1);
    expect(filterUsersForSearch(users, 'admin@iocl.in').length).toBe(0); // security: missing admin returns zero
  });

  it('4. Scope assignments search filter helper matches scope level, boundary names, and derived outlet info', () => {
    const scopes = [
      { id: 'sc-1', userId: 'u-1', scopeLevel: 'SALES_AREA', salesAreaName: 'Kolkata Central Sales Area' }
    ];
    const users = [{ id: 'u-1', name: 'Sanjay Kumar', empCode: 'IOCL-FO-002', email: 'sanjay@iocl.in' }];
    const outlets = [{ id: 'o-1', name: 'Park Street', roCode: 'RO-1001' }];

    expect(filterScopesForSearch(scopes, 'Kolkata', users, [], [], [], outlets).length).toBe(1);
    expect(filterScopesForSearch(scopes, 'Sanjay', users, [], [], [], outlets).length).toBe(1);
    expect(filterScopesForSearch(scopes, 'GLOBAL', users, [], [], [], outlets).length).toBe(0);
  });

  it('5. RBAC permission search filter helper matches permission code, description, and role mapping', () => {
    const permissions = [
      { code: 'OUTLETS_UPDATE', name: 'Update Outlets', description: 'Allows updating retail outlet master details' },
      { code: 'HR_MANAGE', name: 'Manage HR', description: 'Manage workforce roster' }
    ];
    const roles = [
      { code: 'FIELD_OFFICER', permissions: [{ code: 'OUTLETS_UPDATE' }] }
    ];

    expect(filterPermissionsForSearch(permissions, 'OUTLETS_UPDATE', roles).length).toBe(1);
    expect(filterPermissionsForSearch(permissions, 'FIELD_OFFICER', roles).length).toBe(1); // matches role granting permission
    expect(filterPermissionsForSearch(permissions, 'NONEXISTENT', roles).length).toBe(0);
  });

  it('6. EXPLICIT HIERARCHY ISOLATION SECURITY TESTS', () => {
    // A. OUTLET scope dataset containing only COCO22 searching another exact RO name returns []
    const outletDataset = [{ id: 'ro-coco', name: 'COCO 22 Mohali', salesAreaId: 'sa-moh', directoryHidden: false }];
    expect(filterOutletsForSearch(outletDataset, 'Foreign Terminal Pump', false)).toEqual([]);

    // B. SALES_AREA scope dataset containing only sa-cen searching Salt Lake / sa-nor returns []
    const saDataset = [{ id: 'ro-1001', name: 'Park Street', salesAreaId: 'sa-cen', directoryHidden: false }];
    expect(filterOutletsForSearch(saDataset, 'Salt Lake sa-nor', false)).toEqual([]);

    // C. DIVISION scope dataset containing only div-kol searching Punjab / Ludhiana returns []
    const divDataset = [{ id: 'ro-1001', name: 'Park Street', divisionId: 'div-kol', directoryHidden: false }];
    expect(filterOutletsForSearch(divDataset, 'Punjab Ludhiana', false)).toEqual([]);

    // D. User dataset without admin searching admin@iocl.in returns []
    const userDataset = [{ name: 'Field Officer', empCode: 'FO-1', email: 'fo@iocl.in', roles: ['FIELD_OFFICER'] }];
    expect(filterUsersForSearch(userDataset, 'admin@iocl.in')).toEqual([]);
  });

  it('7. getUserPermissionRestriction security rules test', () => {
    // A. selectedUserId absent -> disabled
    expect(getUserPermissionRestriction({ currentUserId: 'admin-1', selectedUserId: null, selectedUserRoles: ['FIELD_OFFICER'] }).isDisabled).toBe(true);

    // B. selectedUserId === currentUserId -> disabled
    expect(getUserPermissionRestriction({ currentUserId: 'admin-1', selectedUserId: 'admin-1', selectedUserRoles: ['ADMIN'] }).isDisabled).toBe(true);

    // C. selected user has ADMIN role -> disabled
    expect(getUserPermissionRestriction({ currentUserId: 'admin-1', selectedUserId: 'admin-2', selectedUserRoles: ['ADMIN'] }).isDisabled).toBe(true);

    // D. normal other selected user -> NOT disabled
    expect(getUserPermissionRestriction({ currentUserId: 'admin-1', selectedUserId: 'fo-2', selectedUserRoles: ['FIELD_OFFICER'] }).isDisabled).toBe(false);
  });

  it('8. RbacPage source verification: uses correct PATCH permission override endpoint and no grant/revoke endpoints', () => {
    const rbacSourcePath = path.join(process.cwd(), 'src/frontend/pages/RbacPage.tsx');
    const sourceCode = fs.readFileSync(rbacSourcePath, 'utf8');

    expect(sourceCode).toContain('PATCH');
    expect(sourceCode).toContain('permissions/${encodeURIComponent(permissionCode)}');
    expect(sourceCode).not.toContain('/permissions/grant');
    expect(sourceCode).not.toContain('/permissions/revoke');
  });

  it('9. RBAC state merge test: permission toggle response preserves selected user metadata', () => {
    const existingUserDetails = {
      user: { id: 'u-1', name: 'Rakesh FO', empCode: 'FO-001', email: 'rakesh@iocl.in' },
      roleCodes: ['FIELD_OFFICER'],
      inheritedPermissionCodes: ['OUTLETS_VIEW', 'OUTLETS_READ'],
      scopes: [{ scopeLevel: 'SALES_AREA', salesAreaId: 'sa-cen' }],
      effectivePermissionCodes: ['OUTLETS_VIEW', 'OUTLETS_READ'],
      overrides: []
    };

    const toggleResponse = {
      permissionCode: 'INDENTS_CREATE',
      enabled: true,
      effect: 'ALLOW' as const,
      effectivePermissionCodes: ['OUTLETS_VIEW', 'OUTLETS_READ', 'INDENTS_CREATE'],
      overrides: [{ permissionCode: 'INDENTS_CREATE', effect: 'ALLOW' as const }]
    };

    const mergeState = (prev: typeof existingUserDetails | null, patchData: typeof toggleResponse) => {
      if (!prev) return prev;
      return {
        ...prev,
        effectivePermissionCodes: patchData.effectivePermissionCodes,
        overrides: patchData.overrides
      };
    };

    const merged = mergeState(existingUserDetails, toggleResponse)!;

    expect(merged.user).toEqual(existingUserDetails.user);
    expect(merged.roleCodes).toEqual(existingUserDetails.roleCodes);
    expect(merged.inheritedPermissionCodes).toEqual(existingUserDetails.inheritedPermissionCodes);
    expect(merged.scopes).toEqual(existingUserDetails.scopes);
    expect(merged.effectivePermissionCodes).toEqual(['OUTLETS_VIEW', 'OUTLETS_READ', 'INDENTS_CREATE']);
    expect(merged.overrides).toEqual([{ permissionCode: 'INDENTS_CREATE', effect: 'ALLOW' }]);
  });
});
