import { matchesSearch } from './searchUtils';

export function filterOutletsForSearch(outlets: any[], query: string, showHidden: boolean): any[] {
  if (!query || !query.trim()) return outlets;
  return outlets.filter(ro => {
    const fields = [
      ro.name,
      ro.roCode,
      ro.outletType,
      ro.stateName,
      ro.stateId,
      ro.divisionName,
      ro.divisionId,
      ro.salesAreaName,
      ro.salesAreaId,
      ro.address,
      ro.city,
      ro.district,
      ro.pincode,
      ro.status,
      showHidden && ro.directoryHidden ? 'hidden' : ''
    ];
    return matchesSearch(query, fields);
  });
}

export function filterUsersForSearch(users: any[], query: string): any[] {
  if (!query || !query.trim()) return users;
  return users.filter(u => {
    const fields = [
      u.name,
      u.empCode,
      u.email,
      u.phone,
      u.status,
      ...(u.roles || []),
      ...(u.scopes || []).map((s: any) => s.scopeLevel),
      ...(u.scopes || []).map((s: any) => s.stateName),
      ...(u.scopes || []).map((s: any) => s.divisionName),
      ...(u.scopes || []).map((s: any) => s.salesAreaName),
      ...(u.scopes || []).map((s: any) => s.outletName)
    ];
    return matchesSearch(query, fields);
  });
}

export function filterScopesForSearch(
  scopes: any[],
  query: string,
  users: any[] = [],
  states: any[] = [],
  divisions: any[] = [],
  salesAreas: any[] = [],
  outlets: any[] = []
): any[] {
  if (!query || !query.trim()) return scopes;
  return scopes.filter(s => {
    const matchingUser = users.find(u => u.id === s.userId);
    const matchingState = states.find(st => st.id === s.stateId);
    const matchingDivision = divisions.find(d => d.id === s.divisionId);
    const matchingSalesArea = salesAreas.find(sa => sa.id === s.salesAreaId);
    const matchingOutlet = outlets.find(o => o.id === s.outletId);

    const fields = [
      s.scopeLevel,
      s.stateName,
      s.stateId,
      matchingState?.name,
      matchingState?.code,
      s.divisionName,
      s.divisionId,
      matchingDivision?.name,
      matchingDivision?.code,
      s.salesAreaName,
      s.salesAreaId,
      matchingSalesArea?.name,
      matchingSalesArea?.code,
      s.outletName,
      s.outletId,
      matchingOutlet?.name,
      matchingOutlet?.roCode,
      matchingUser?.name,
      matchingUser?.empCode,
      matchingUser?.email
    ];
    return matchesSearch(query, fields);
  });
}

export function filterPermissionsForSearch(permissions: any[], query: string, roles: any[] = []): any[] {
  if (!query || !query.trim()) return permissions;
  const q = query.trim().toLowerCase();
  return permissions.filter(p => {
    const fields = [p.code, p.name, p.description];
    const baseMatch = matchesSearch(query, fields);
    const matchingRole = roles.find(r => r.code.toLowerCase().includes(q) || (r.name && r.name.toLowerCase().includes(q)));
    if (matchingRole) {
      const isGrantedToRole = matchingRole.code === 'ADMIN' || matchingRole.permissions?.some((pItem: any) => pItem.code === p.code);
      return baseMatch || isGrantedToRole;
    }
    return baseMatch;
  });
}
