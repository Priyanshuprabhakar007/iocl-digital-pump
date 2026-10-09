import { RoleCode, PermissionCode, UserPermissionsDetails } from '../../shared/types';

export interface UserPermissionCellState {
  isEnabled: boolean;
  isInherited: boolean;
  overrideEffect: 'ALLOW' | 'DENY' | null;
  tooltip: string;
  badgeText: string | null;
}

/**
 * Derives the visual state, tooltip, and badge text for a specific permission
 * row in the Selected User Access column.
 */
export function computeUserPermissionCellState(params: {
  permissionCode: string;
  inheritedPermissionCodes: string[];
  overrides: Array<{ permissionCode: string; effect: 'ALLOW' | 'DENY' }>;
  effectivePermissionCodes: string[];
  roleCodes: string[];
}): UserPermissionCellState {
  const {
    permissionCode,
    inheritedPermissionCodes,
    overrides,
    effectivePermissionCodes,
    roleCodes,
  } = params;

  const isInherited = inheritedPermissionCodes.includes(permissionCode);
  const override = overrides.find(o => o.permissionCode === permissionCode);
  const overrideEffect = override ? override.effect : null;
  const isEnabled = effectivePermissionCodes.includes(permissionCode as PermissionCode);

  if (overrideEffect === 'ALLOW') {
    return {
      isEnabled: true,
      isInherited,
      overrideEffect: 'ALLOW',
      tooltip: 'Custom permission granted by Admin',
      badgeText: '+ Custom Grant',
    };
  }

  if (overrideEffect === 'DENY') {
    return {
      isEnabled: false,
      isInherited,
      overrideEffect: 'DENY',
      tooltip: 'Permission disabled for this user',
      badgeText: '- Custom Deny',
    };
  }

  if (isInherited) {
    const rolesStr = roleCodes.length > 0 ? roleCodes.join(', ') : 'Role';
    return {
      isEnabled: true,
      isInherited: true,
      overrideEffect: null,
      tooltip: `Granted by role: ${rolesStr}`,
      badgeText: null,
    };
  }

  return {
    isEnabled: false,
    isInherited: false,
    overrideEffect: null,
    tooltip: 'Not granted by role or override',
    badgeText: null,
  };
}

/**
 * Checks whether user permission toggles should be disabled for the selected user.
 */
export function getUserPermissionRestriction(params: {
  currentUserId?: string | null;
  selectedUserId?: string | null;
  selectedUserRoles?: string[] | null;
}): { isDisabled: boolean; message: string | null } {
  const { currentUserId, selectedUserId, selectedUserRoles } = params;

  if (!selectedUserId) {
    return { isDisabled: true, message: null };
  }

  if (currentUserId && selectedUserId === currentUserId) {
    return {
      isDisabled: true,
      message: 'Your own permission access cannot be modified here.',
    };
  }

  if (selectedUserRoles && selectedUserRoles.includes('ADMIN')) {
    return {
      isDisabled: true,
      message: 'ADMIN accounts have full system access. Individual permission overrides are not applicable.',
    };
  }

  return { isDisabled: false, message: null };
}
