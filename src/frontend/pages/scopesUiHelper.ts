import { ScopeLevel } from '../../shared/constants';

export interface ScopePayloadInput {
  userId: string;
  scopeLevel: ScopeLevel;
  stateId?: string | null;
  divisionId?: string | null;
  salesAreaId?: string | null;
  outletId?: string | null;
}

export interface ScopeValidationResult {
  valid: boolean;
  errorMessage: string | null;
  payload: any | null;
}

/**
 * Validates target hierarchy selection and builds strict discriminated payload
 * for user organizational scope assignment.
 */
export function buildScopeAssignmentPayload(input: ScopePayloadInput): ScopeValidationResult {
  const { userId, scopeLevel, stateId, divisionId, salesAreaId, outletId } = input;

  if (!userId || !userId.trim()) {
    return {
      valid: false,
      errorMessage: 'Please select a user.',
      payload: null,
    };
  }

  switch (scopeLevel) {
    case 'GLOBAL':
      return {
        valid: true,
        errorMessage: null,
        payload: {
          userId,
          scopeLevel: 'GLOBAL',
          stateId: null,
          divisionId: null,
          salesAreaId: null,
          outletId: null,
        },
      };

    case 'STATE':
      if (!stateId || !stateId.trim()) {
        return {
          valid: false,
          errorMessage: 'Please select a State Office for STATE scope.',
          payload: null,
        };
      }
      return {
        valid: true,
        errorMessage: null,
        payload: {
          userId,
          scopeLevel: 'STATE',
          stateId,
          divisionId: null,
          salesAreaId: null,
          outletId: null,
        },
      };

    case 'DIVISION':
      if (!divisionId || !divisionId.trim()) {
        return {
          valid: false,
          errorMessage: 'Please select a Divisional Office for DIVISION scope.',
          payload: null,
        };
      }
      return {
        valid: true,
        errorMessage: null,
        payload: {
          userId,
          scopeLevel: 'DIVISION',
          stateId: null,
          divisionId,
          salesAreaId: null,
          outletId: null,
        },
      };

    case 'SALES_AREA':
      if (!salesAreaId || !salesAreaId.trim()) {
        return {
          valid: false,
          errorMessage: 'Please select a Sales Area for SALES_AREA scope.',
          payload: null,
        };
      }
      return {
        valid: true,
        errorMessage: null,
        payload: {
          userId,
          scopeLevel: 'SALES_AREA',
          stateId: null,
          divisionId: null,
          salesAreaId,
          outletId: null,
        },
      };

    case 'OUTLET':
      if (!outletId || !outletId.trim()) {
        return {
          valid: false,
          errorMessage: 'Please select a Retail Outlet for OUTLET scope.',
          payload: null,
        };
      }
      return {
        valid: true,
        errorMessage: null,
        payload: {
          userId,
          scopeLevel: 'OUTLET',
          stateId: null,
          divisionId: null,
          salesAreaId: null,
          outletId,
        },
      };

    default:
      return {
        valid: false,
        errorMessage: `Unknown scope level: ${scopeLevel}`,
        payload: null,
      };
  }
}
