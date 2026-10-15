import { describe, it, expect } from 'vitest';
import { buildScopeAssignmentPayload } from '../src/frontend/pages/scopesUiHelper';
import { UserScopeAssignmentSchema } from '../src/shared/validators';

describe('User Organizational Scope Assignment Frontend Payload Builder Suite', () => {
  const userId = 'usr-test-12345';

  // =========================================================================
  // 1. GLOBAL Scope Payload
  // =========================================================================
  it('1. builds valid GLOBAL scope payload with all hierarchy IDs set to null', () => {
    const result = buildScopeAssignmentPayload({
      userId,
      scopeLevel: 'GLOBAL',
      stateId: 'state-wb',
      divisionId: 'div-kol',
      salesAreaId: 'sa-kol-cen',
      outletId: 'ro-1001',
    });

    expect(result.valid).toBe(true);
    expect(result.errorMessage).toBeNull();
    expect(result.payload).toEqual({
      userId,
      scopeLevel: 'GLOBAL',
      stateId: null,
      divisionId: null,
      salesAreaId: null,
      outletId: null,
    });

    // Validates against strict backend discriminated schema
    const parsed = UserScopeAssignmentSchema.safeParse(result.payload);
    expect(parsed.success).toBe(true);
  });

  // =========================================================================
  // 2. STATE Scope Payload
  // =========================================================================
  it('2. builds valid STATE scope payload with target stateId and other hierarchy IDs set to null', () => {
    const result = buildScopeAssignmentPayload({
      userId,
      scopeLevel: 'STATE',
      stateId: 'state-wb',
      divisionId: 'div-kol',
      salesAreaId: 'sa-kol-cen',
      outletId: 'ro-1001',
    });

    expect(result.valid).toBe(true);
    expect(result.errorMessage).toBeNull();
    expect(result.payload).toEqual({
      userId,
      scopeLevel: 'STATE',
      stateId: 'state-wb',
      divisionId: null,
      salesAreaId: null,
      outletId: null,
    });

    // Validates against strict backend discriminated schema
    const parsed = UserScopeAssignmentSchema.safeParse(result.payload);
    expect(parsed.success).toBe(true);
  });

  // =========================================================================
  // 3. DIVISION Scope Payload
  // =========================================================================
  it('3. builds valid DIVISION scope payload with target divisionId and other hierarchy IDs set to null', () => {
    const result = buildScopeAssignmentPayload({
      userId,
      scopeLevel: 'DIVISION',
      stateId: 'state-wb',
      divisionId: 'div-kol',
      salesAreaId: 'sa-kol-cen',
      outletId: 'ro-1001',
    });

    expect(result.valid).toBe(true);
    expect(result.errorMessage).toBeNull();
    expect(result.payload).toEqual({
      userId,
      scopeLevel: 'DIVISION',
      stateId: null,
      divisionId: 'div-kol',
      salesAreaId: null,
      outletId: null,
    });

    // Validates against strict backend discriminated schema
    const parsed = UserScopeAssignmentSchema.safeParse(result.payload);
    expect(parsed.success).toBe(true);
  });

  // =========================================================================
  // 4. SALES_AREA Scope Payload
  // =========================================================================
  it('4. builds valid SALES_AREA scope payload with target salesAreaId and other hierarchy IDs set to null', () => {
    const result = buildScopeAssignmentPayload({
      userId,
      scopeLevel: 'SALES_AREA',
      stateId: 'state-wb',
      divisionId: 'div-kol',
      salesAreaId: 'sa-kol-cen',
      outletId: 'ro-1001',
    });

    expect(result.valid).toBe(true);
    expect(result.errorMessage).toBeNull();
    expect(result.payload).toEqual({
      userId,
      scopeLevel: 'SALES_AREA',
      stateId: null,
      divisionId: null,
      salesAreaId: 'sa-kol-cen',
      outletId: null,
    });

    // Validates against strict backend discriminated schema
    const parsed = UserScopeAssignmentSchema.safeParse(result.payload);
    expect(parsed.success).toBe(true);
  });

  // =========================================================================
  // 5. OUTLET Scope Payload
  // =========================================================================
  it('5. builds valid OUTLET scope payload with target outletId and stateId, divisionId, salesAreaId strictly set to null', () => {
    const result = buildScopeAssignmentPayload({
      userId,
      scopeLevel: 'OUTLET',
      stateId: 'state-wb',
      divisionId: 'div-kol',
      salesAreaId: 'sa-kol-cen',
      outletId: 'ro-1001',
    });

    expect(result.valid).toBe(true);
    expect(result.errorMessage).toBeNull();
    expect(result.payload).toEqual({
      userId,
      scopeLevel: 'OUTLET',
      stateId: null,
      divisionId: null,
      salesAreaId: null,
      outletId: 'ro-1001',
    });

    // Validates against strict backend discriminated schema
    const parsed = UserScopeAssignmentSchema.safeParse(result.payload);
    expect(parsed.success).toBe(true);
  });

  // =========================================================================
  // 6. Client-Side Validation: Missing Target Selection Blocked
  // =========================================================================
  describe('6. Client-side validation: missing target selection is blocked', () => {
    it('blocks submission when userId is missing or empty', () => {
      const res = buildScopeAssignmentPayload({
        userId: '',
        scopeLevel: 'GLOBAL',
      });
      expect(res.valid).toBe(false);
      expect(res.errorMessage).toBe('Please select a user.');
      expect(res.payload).toBeNull();
    });

    it('blocks STATE scope when stateId is missing', () => {
      const res = buildScopeAssignmentPayload({
        userId,
        scopeLevel: 'STATE',
        stateId: '',
      });
      expect(res.valid).toBe(false);
      expect(res.errorMessage).toBe('Please select a State Office for STATE scope.');
      expect(res.payload).toBeNull();
    });

    it('blocks DIVISION scope when divisionId is missing', () => {
      const res = buildScopeAssignmentPayload({
        userId,
        scopeLevel: 'DIVISION',
        stateId: 'state-wb',
        divisionId: '',
      });
      expect(res.valid).toBe(false);
      expect(res.errorMessage).toBe('Please select a Divisional Office for DIVISION scope.');
      expect(res.payload).toBeNull();
    });

    it('blocks SALES_AREA scope when salesAreaId is missing', () => {
      const res = buildScopeAssignmentPayload({
        userId,
        scopeLevel: 'SALES_AREA',
        stateId: 'state-wb',
        divisionId: 'div-kol',
        salesAreaId: '',
      });
      expect(res.valid).toBe(false);
      expect(res.errorMessage).toBe('Please select a Sales Area for SALES_AREA scope.');
      expect(res.payload).toBeNull();
    });

    it('blocks OUTLET scope when outletId is missing', () => {
      const res = buildScopeAssignmentPayload({
        userId,
        scopeLevel: 'OUTLET',
        stateId: 'state-wb',
        divisionId: 'div-kol',
        salesAreaId: 'sa-kol-cen',
        outletId: '',
      });
      expect(res.valid).toBe(false);
      expect(res.errorMessage).toBe('Please select a Retail Outlet for OUTLET scope.');
      expect(res.payload).toBeNull();
    });
  });
});
