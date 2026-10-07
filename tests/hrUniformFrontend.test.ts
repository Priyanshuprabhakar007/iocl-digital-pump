import { describe, it, expect } from 'vitest';
import {
  formatUniformItemStatus,
  formatUniformIssueStatus,
  formatUniformCondition,
  formatUniformTransactionType,
  formatUniformReplacementReason,
  formatUniformCategory,
  validateUniformDateRange,
  buildUniformItemQueryParams,
  buildUniformTransactionQueryParams,
  buildUniformIssueQueryParams,
  buildUniformHistoryQueryParams,
  getUniformErrorMessage,
} from '../src/frontend/components/hr/hrUniformUi';

describe('Phase 5C-2A Uniform Frontend UI Helpers & Pure Logic Suite', () => {
  // ==========================================================================
  // 1. buildUniformItemQueryParams
  // ==========================================================================
  describe('buildUniformItemQueryParams', () => {
    it('returns empty string when all filter values are empty or whitespace', () => {
      expect(buildUniformItemQueryParams({})).toBe('');
      expect(buildUniformItemQueryParams({ category: '', status: '', search: '' })).toBe('');
      expect(buildUniformItemQueryParams({ category: '   ', status: '  ', search: ' ' })).toBe('');
    });

    it('builds query with search only and trims whitespace', () => {
      const res = buildUniformItemQueryParams({ search: '  Shirt 01  ' });
      expect(res).toBe('?search=Shirt+01');
      expect(res).not.toContain('category');
      expect(res).not.toContain('status');
    });

    it('builds query with category only', () => {
      const res = buildUniformItemQueryParams({ category: 'TROUSER' });
      expect(res).toBe('?category=TROUSER');
      expect(res).not.toContain('status');
      expect(res).not.toContain('search');
    });

    it('builds query with status only', () => {
      const res = buildUniformItemQueryParams({ status: 'ACTIVE' });
      expect(res).toBe('?status=ACTIVE');
      expect(res).not.toContain('category');
    });

    it('properly encodes special characters in search', () => {
      const res = buildUniformItemQueryParams({ search: 'Reflective & Safe/Jacket' });
      expect(res).toBe('?search=Reflective+%26+Safe%2FJacket');
    });

    it('combines category, status, and search without unsupported keys', () => {
      const res = buildUniformItemQueryParams({
        category: 'JACKET',
        status: 'ACTIVE',
        search: 'Winter',
      });
      const parsed = new URLSearchParams(res.replace('?', ''));
      expect(parsed.get('category')).toBe('JACKET');
      expect(parsed.get('status')).toBe('ACTIVE');
      expect(parsed.get('search')).toBe('Winter');
      expect(parsed.has('page')).toBe(false);
      expect(parsed.has('limit')).toBe(false);
      expect(res).not.toContain('undefined');
      expect(res).not.toContain('null');
    });
  });

  // ==========================================================================
  // 2. buildUniformTransactionQueryParams
  // ==========================================================================
  describe('buildUniformTransactionQueryParams', () => {
    it('returns empty string when all filters are empty', () => {
      expect(buildUniformTransactionQueryParams({})).toBe('');
      expect(
        buildUniformTransactionQueryParams({
          variantId: '',
          transactionType: '',
          fromDate: '',
          toDate: '',
        })
      ).toBe('');
    });

    it('builds query with variantId only', () => {
      const res = buildUniformTransactionQueryParams({ variantId: 'var-123' });
      expect(res).toBe('?variantId=var-123');
    });

    it('builds query with transactionType only', () => {
      const res = buildUniformTransactionQueryParams({ transactionType: 'OPENING_BALANCE' });
      expect(res).toBe('?transactionType=OPENING_BALANCE');
    });

    it('builds query with dates only', () => {
      const res = buildUniformTransactionQueryParams({
        fromDate: '2026-01-01',
        toDate: '2026-01-31',
      });
      const parsed = new URLSearchParams(res.replace('?', ''));
      expect(parsed.get('fromDate')).toBe('2026-01-01');
      expect(parsed.get('toDate')).toBe('2026-01-31');
    });

    it('combines variantId, transactionType, and date range', () => {
      const res = buildUniformTransactionQueryParams({
        variantId: 'var-999',
        transactionType: 'ISSUE_OUT',
        fromDate: '2026-02-01',
        toDate: '2026-02-28',
      });
      const parsed = new URLSearchParams(res.replace('?', ''));
      expect(parsed.get('variantId')).toBe('var-999');
      expect(parsed.get('transactionType')).toBe('ISSUE_OUT');
      expect(parsed.get('fromDate')).toBe('2026-02-01');
      expect(parsed.get('toDate')).toBe('2026-02-28');
      expect(res).not.toContain('undefined');
      expect(res).not.toContain('null');
    });
  });

  // ==========================================================================
  // 3. buildUniformIssueQueryParams
  // ==========================================================================
  describe('buildUniformIssueQueryParams', () => {
    it('returns empty string for empty filter object', () => {
      expect(buildUniformIssueQueryParams({})).toBe('');
      expect(
        buildUniformIssueQueryParams({
          staffId: '',
          itemId: '',
          variantId: '',
          status: '',
          fromDate: '',
          toDate: '',
        })
      ).toBe('');
    });

    it('builds query for staffId filter', () => {
      const res = buildUniformIssueQueryParams({ staffId: 'staff-42' });
      expect(res).toBe('?staffId=staff-42');
    });

    it('builds query for itemId and variantId filter', () => {
      const res = buildUniformIssueQueryParams({ itemId: 'item-10', variantId: 'var-20' });
      const parsed = new URLSearchParams(res.replace('?', ''));
      expect(parsed.get('itemId')).toBe('item-10');
      expect(parsed.get('variantId')).toBe('var-20');
      expect(parsed.has('staffId')).toBe(false);
    });

    it('builds query for status and date range', () => {
      const res = buildUniformIssueQueryParams({
        status: 'ISSUED',
        fromDate: '2026-03-01',
        toDate: '2026-03-15',
      });
      const parsed = new URLSearchParams(res.replace('?', ''));
      expect(parsed.get('status')).toBe('ISSUED');
      expect(parsed.get('fromDate')).toBe('2026-03-01');
      expect(parsed.get('toDate')).toBe('2026-03-15');
    });

    it('combines all supported issue query parameters', () => {
      const res = buildUniformIssueQueryParams({
        staffId: 'staff-1',
        itemId: 'item-2',
        variantId: 'var-3',
        status: 'RETURNED',
        fromDate: '2026-04-01',
        toDate: '2026-04-30',
      });
      const parsed = new URLSearchParams(res.replace('?', ''));
      expect(parsed.get('staffId')).toBe('staff-1');
      expect(parsed.get('itemId')).toBe('item-2');
      expect(parsed.get('variantId')).toBe('var-3');
      expect(parsed.get('status')).toBe('RETURNED');
      expect(parsed.get('fromDate')).toBe('2026-04-01');
      expect(parsed.get('toDate')).toBe('2026-04-30');
      expect(res).not.toContain('undefined');
      expect(res).not.toContain('null');
    });
  });

  // ==========================================================================
  // 4. buildUniformHistoryQueryParams
  // ==========================================================================
  describe('buildUniformHistoryQueryParams', () => {
    it('returns empty string when no filters passed', () => {
      expect(buildUniformHistoryQueryParams({})).toBe('');
      expect(buildUniformHistoryQueryParams({ staffId: '', fromDate: '', toDate: '' })).toBe('');
    });

    it('builds query with staffId only', () => {
      const res = buildUniformHistoryQueryParams({ staffId: 'staff-history-1' });
      expect(res).toBe('?staffId=staff-history-1');
    });

    it('builds query with date range only', () => {
      const res = buildUniformHistoryQueryParams({
        fromDate: '2026-05-01',
        toDate: '2026-05-31',
      });
      const parsed = new URLSearchParams(res.replace('?', ''));
      expect(parsed.get('fromDate')).toBe('2026-05-01');
      expect(parsed.get('toDate')).toBe('2026-05-31');
      expect(parsed.has('staffId')).toBe(false);
    });

    it('combines staffId and dates without unsupported parameters', () => {
      const res = buildUniformHistoryQueryParams({
        staffId: 'staff-77',
        fromDate: '2026-01-01',
        toDate: '2026-12-31',
      });
      const parsed = new URLSearchParams(res.replace('?', ''));
      expect(parsed.get('staffId')).toBe('staff-77');
      expect(parsed.get('fromDate')).toBe('2026-01-01');
      expect(parsed.get('toDate')).toBe('2026-12-31');
      expect(res).not.toContain('undefined');
      expect(res).not.toContain('null');
    });
  });

  // ==========================================================================
  // 5. validateUniformDateRange
  // ==========================================================================
  describe('validateUniformDateRange', () => {
    it('returns isValid true when both dates are empty', () => {
      expect(validateUniformDateRange('', '')).toEqual({ isValid: true, error: null });
      expect(validateUniformDateRange(undefined, undefined)).toEqual({ isValid: true, error: null });
    });

    it('returns isValid true when only fromDate or only toDate is provided', () => {
      expect(validateUniformDateRange('2026-01-01', '')).toEqual({ isValid: true, error: null });
      expect(validateUniformDateRange('', '2026-01-31')).toEqual({ isValid: true, error: null });
    });

    it('returns isValid true when fromDate is earlier than toDate', () => {
      expect(validateUniformDateRange('2026-01-01', '2026-01-10')).toEqual({
        isValid: true,
        error: null,
      });
    });

    it('returns isValid true when fromDate and toDate are identical', () => {
      expect(validateUniformDateRange('2026-01-15', '2026-01-15')).toEqual({
        isValid: true,
        error: null,
      });
    });

    it('returns isValid false with error message when fromDate is later than toDate', () => {
      const res = validateUniformDateRange('2026-02-01', '2026-01-01');
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('From Date cannot be later than To Date.');
    });
  });

  // ==========================================================================
  // 6. Formatters
  // ==========================================================================
  describe('Formatters', () => {
    describe('formatUniformItemStatus', () => {
      it('formats ACTIVE status', () => {
        const res = formatUniformItemStatus('ACTIVE');
        expect(res.label).toBe('Active');
        expect(res.textClass).toContain('emerald');
      });

      it('formats INACTIVE status', () => {
        const res = formatUniformItemStatus('INACTIVE');
        expect(res.label).toBe('Inactive');
        expect(res.textClass).toContain('slate');
      });

      it('falls back safely for unknown/null status', () => {
        expect(formatUniformItemStatus(null).label).toBe('Unknown');
        expect(formatUniformItemStatus(undefined).label).toBe('Unknown');
        expect(formatUniformItemStatus('INVALID').label).toBe('Unknown');
      });
    });

    describe('formatUniformIssueStatus', () => {
      it('formats ISSUED status', () => {
        const res = formatUniformIssueStatus('ISSUED');
        expect(res.label).toBe('Issued');
        expect(res.textClass).toContain('emerald');
      });

      it('formats RETURNED status', () => {
        const res = formatUniformIssueStatus('RETURNED');
        expect(res.label).toBe('Returned');
        expect(res.textClass).toContain('sky');
      });

      it('formats REPLACED status', () => {
        const res = formatUniformIssueStatus('REPLACED');
        expect(res.label).toBe('Replaced');
        expect(res.textClass).toContain('purple');
      });

      it('falls back safely for missing status', () => {
        expect(formatUniformIssueStatus(null).label).toBe('Unknown');
      });
    });

    describe('formatUniformCondition', () => {
      it('formats NEW condition', () => {
        const res = formatUniformCondition('NEW');
        expect(res.label).toBe('New');
        expect(res.textClass).toContain('emerald');
      });

      it('formats GOOD condition', () => {
        const res = formatUniformCondition('GOOD');
        expect(res.label).toBe('Good');
        expect(res.textClass).toContain('blue');
      });

      it('formats FAIR condition', () => {
        const res = formatUniformCondition('FAIR');
        expect(res.label).toBe('Fair');
        expect(res.textClass).toContain('amber');
      });

      it('formats DAMAGED condition', () => {
        const res = formatUniformCondition('DAMAGED');
        expect(res.label).toBe('Damaged');
        expect(res.textClass).toContain('rose');
      });

      it('formats LOST condition', () => {
        const res = formatUniformCondition('LOST');
        expect(res.label).toBe('Lost');
        expect(res.textClass).toContain('red');
      });

      it('falls back for null condition', () => {
        expect(formatUniformCondition(null).label).toBe('Not Specified');
      });
    });

    describe('formatUniformTransactionType', () => {
      it('identifies inflows with positive semantics', () => {
        expect(formatUniformTransactionType('OPENING_BALANCE').isInflow).toBe(true);
        expect(formatUniformTransactionType('RECEIPT').isInflow).toBe(true);
        expect(formatUniformTransactionType('ADJUSTMENT_IN').isInflow).toBe(true);
        expect(formatUniformTransactionType('RETURN_IN').isInflow).toBe(true);
      });

      it('identifies outflows with negative semantics', () => {
        expect(formatUniformTransactionType('ADJUSTMENT_OUT').isInflow).toBe(false);
        expect(formatUniformTransactionType('ISSUE_OUT').isInflow).toBe(false);
      });

      it('provides clean readable labels', () => {
        expect(formatUniformTransactionType('OPENING_BALANCE').label).toBe('Opening Balance');
        expect(formatUniformTransactionType('RECEIPT').label).toBe('Stock Receipt');
        expect(formatUniformTransactionType('RETURN_IN').label).toBe('Return In (Restock)');
      });
    });

    describe('formatUniformReplacementReason', () => {
      it('formats standard replacement reasons', () => {
        expect(formatUniformReplacementReason('WORN_OUT').label).toBe('Worn Out');
        expect(formatUniformReplacementReason('DAMAGED').label).toBe('Damaged');
        expect(formatUniformReplacementReason('SIZE_CHANGE').label).toBe('Size Change');
        expect(formatUniformReplacementReason('LOST').label).toBe('Lost');
        expect(formatUniformReplacementReason('OTHER').label).toBe('Other');
      });

      it('handles null and undefined', () => {
        expect(formatUniformReplacementReason(null).label).toBe('None');
        expect(formatUniformReplacementReason(undefined).label).toBe('None');
      });
    });

    describe('formatUniformCategory', () => {
      it('formats predefined categories', () => {
        expect(formatUniformCategory('SHIRT')).toBe('Shirt');
        expect(formatUniformCategory('TROUSER')).toBe('Trouser');
        expect(formatUniformCategory('JACKET')).toBe('Jacket');
        expect(formatUniformCategory('T_SHIRT')).toBe('T-Shirt');
        expect(formatUniformCategory('CAP')).toBe('Cap');
        expect(formatUniformCategory('SHOES')).toBe('Shoes');
        expect(formatUniformCategory('BELT')).toBe('Belt');
        expect(formatUniformCategory('OTHER')).toBe('Other');
      });

      it('converts custom snake_case categories to title case', () => {
        expect(formatUniformCategory('SAFETY_VEST')).toBe('Safety Vest');
      });
    });
  });

  // ==========================================================================
  // 7. getUniformErrorMessage
  // ==========================================================================
  describe('getUniformErrorMessage', () => {
    it('maps FORBIDDEN error code', () => {
      expect(getUniformErrorMessage({ code: 'FORBIDDEN' })).toBe(
        'You do not have permission to perform this uniform management action.'
      );
    });

    it('maps NETWORK_ERROR', () => {
      expect(getUniformErrorMessage({ code: 'NETWORK_ERROR' })).toBe(
        'Network connectivity error. Please check your connection.'
      );
    });

    it('maps HTTP_ERROR', () => {
      expect(getUniformErrorMessage({ code: 'HTTP_ERROR' })).toBe(
        'Server communication error. Please try again.'
      );
    });

    it('maps backend uniform entity not found codes', () => {
      expect(getUniformErrorMessage({ code: 'HR_UNIFORM_ITEM_NOT_FOUND' })).toBe(
        'Uniform item not found.'
      );
      expect(getUniformErrorMessage({ code: 'HR_UNIFORM_VARIANT_NOT_FOUND' })).toBe(
        'Uniform size/variant not found.'
      );
      expect(getUniformErrorMessage({ code: 'HR_UNIFORM_ISSUE_NOT_FOUND' })).toBe(
        'Uniform issue record not found.'
      );
    });

    it('maps domain constraint errors', () => {
      expect(getUniformErrorMessage({ code: 'HR_UNIFORM_INSUFFICIENT_STOCK' })).toBe(
        'Insufficient stock available for this operation.'
      );
      expect(getUniformErrorMessage({ code: 'HR_UNIFORM_INVALID_RESTOCK' })).toBe(
        'Damaged or lost items cannot be returned to usable stock.'
      );
      expect(getUniformErrorMessage({ code: 'HR_UNIFORM_ISSUE_ALREADY_CLOSED' })).toBe(
        'This uniform issue is already closed or processed.'
      );
    });

    it('returns custom message string if available and meaningful', () => {
      expect(getUniformErrorMessage({ message: 'Custom validation problem' })).toBe(
        'Custom validation problem'
      );
    });

    it('falls back to safe generic error message', () => {
      expect(getUniformErrorMessage(null)).toBe(
        'Unable to complete the uniform management request.'
      );
      expect(getUniformErrorMessage({})).toBe(
        'Unable to complete the uniform management request.'
      );
    });
  });
});
