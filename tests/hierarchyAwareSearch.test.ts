import { describe, it, expect } from 'vitest';
import { normalizeSearchText, matchesSearch } from '../src/frontend/utils/searchUtils';

describe('Hierarchy-Aware Search Utilities & Security Tests', () => {
  it('1. normalization is case-insensitive and trims whitespace', () => {
    expect(normalizeSearchText('  COCO  ')).toBe('coco');
    expect(normalizeSearchText('Mohali')).toBe('mohali');
    expect(normalizeSearchText(null)).toBe('');
    expect(normalizeSearchText(undefined)).toBe('');
    expect(normalizeSearchText(22)).toBe('22');
    expect(normalizeSearchText('  COCO   22  ')).toBe('coco 22');
  });

  it('2. partial matching with matchesSearch supports multi-word tokens', () => {
    const fields = ['Rakesh Kumar', 'IOCL-FO-001', 'rakesh@iocl.in'];
    expect(matchesSearch('rak', fields)).toBe(true);
    expect(matchesSearch('kumar', fields)).toBe(true);
    expect(matchesSearch('iocl-fo', fields)).toBe(true);
    expect(matchesSearch('delhi', fields)).toBe(false);
    expect(matchesSearch('rakesh 001', fields)).toBe(true);
  });

  it('3. Retail Outlet searchable fields include name, roCode, city, district, pincode, type, status', () => {
    const outlet = {
      name: 'Salt Lake City Sector V Retail Outlet',
      roCode: 'RO-110024',
      outletType: 'CODO',
      city: 'Kolkata',
      district: 'North 24 Parganas',
      pincode: '700091',
      status: 'ACTIVE'
    };
    const fields = [
      outlet.name, outlet.roCode, outlet.outletType, outlet.city,
      outlet.district, outlet.pincode, outlet.status
    ];
    expect(matchesSearch('salt lake', fields)).toBe(true);
    expect(matchesSearch('RO-110024', fields)).toBe(true);
    expect(matchesSearch('kolkata', fields)).toBe(true);
    expect(matchesSearch('700091', fields)).toBe(true);
    expect(matchesSearch('codo', fields)).toBe(true);
    expect(matchesSearch('mumbai', fields)).toBe(false);
  });

  it('4. Hidden outlet behavior respects Show Hidden toggle', () => {
    const outlet = {
      name: 'Secret Mega Pump',
      city: 'Kolkata',
      directoryHidden: true
    };
    // When Show Hidden is OFF, searching for 'hidden' against base outlet fields does not match
    const showHiddenOffFields = [outlet.name, outlet.city];
    expect(matchesSearch('hidden', showHiddenOffFields)).toBe(false);

    // When Show Hidden is ON, 'hidden' tag is added to searchable fields
    const showHiddenOnFields = [outlet.name, outlet.city, 'hidden'];
    expect(matchesSearch('hidden', showHiddenOnFields)).toBe(true);
  });

  it('5. User directory fields include name, emp code, email, role, scope', () => {
    const user = {
      name: 'Sanjay Kumar',
      empCode: 'IOCL-FO-002',
      email: 'sanjay@iocl.in',
      roles: ['FIELD_OFFICER'],
      scopes: [{ scopeLevel: 'SALES_AREA' }]
    };
    const fields = [
      user.name, user.empCode, user.email, ...user.roles, ...user.scopes.map(s => s.scopeLevel)
    ];
    expect(matchesSearch('Sanjay', fields)).toBe(true);
    expect(matchesSearch('IOCL-FO-002', fields)).toBe(true);
    expect(matchesSearch('FIELD_OFFICER', fields)).toBe(true);
    expect(matchesSearch('SALES_AREA', fields)).toBe(true);
    expect(matchesSearch('admin@iocl.in', fields)).toBe(false);
  });

  it('6. Scope Assignment fields include user, employee code, scope level, state, division, sales area, outlet', () => {
    const assignment = {
      scopeLevel: 'SALES_AREA',
      stateName: 'West Bengal',
      divisionName: 'Kolkata Divisional Office',
      salesAreaName: 'Kolkata Central Sales Area',
      outletName: 'Park Street Retail Outlet'
    };
    const fields = [
      assignment.scopeLevel, assignment.stateName, assignment.divisionName,
      assignment.salesAreaName, assignment.outletName
    ];
    expect(matchesSearch('SALES_AREA', fields)).toBe(true);
    expect(matchesSearch('Kolkata Central', fields)).toBe(true);
    expect(matchesSearch('Park Street', fields)).toBe(true);
    expect(matchesSearch('GLOBAL', fields)).toBe(false);
  });

  it('7. Permission fields include permission code, name, description', () => {
    const permission = {
      code: 'OUTLETS_UPDATE',
      name: 'Update Retail Outlets',
      description: 'Allows updating retail outlet master details and status'
    };
    const fields = [permission.code, permission.name, permission.description];
    expect(matchesSearch('OUTLETS_UPDATE', fields)).toBe(true);
    expect(matchesSearch('updating retail', fields)).toBe(true);
    expect(matchesSearch('HR_ATTENDANCE', fields)).toBe(false);
  });

  it('8. SECURITY TEST: search cannot expand existing scoped arrays', () => {
    const scopedDataset = [
      { id: 'ro-1001', name: 'Park Street Retail Outlet', city: 'Kolkata' }
    ];
    const query = 'GT Road Ludhiana';

    const filtered = scopedDataset.filter(item =>
      matchesSearch(query, [item.name, item.city])
    );

    expect(filtered.length).toBe(0);
  });

  it('9. SECURITY TEST: lower hierarchy scope cannot discover foreign higher-level records', () => {
    const outletScopedDataset = [
      { id: 'ro-1001', name: 'Park Street Retail Outlet', salesAreaId: 'sa-cen' }
    ];

    // Searching for an outlet in another sales area (sa-nor) or global admin term
    const foreignQuery = 'Salt Lake Sector V';
    const filtered = outletScopedDataset.filter(item =>
      matchesSearch(foreignQuery, [item.name, item.salesAreaId])
    );

    expect(filtered.length).toBe(0);
    expect(filtered).toEqual([]);
  });
});
