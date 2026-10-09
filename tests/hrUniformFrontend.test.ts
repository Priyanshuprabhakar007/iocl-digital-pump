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
  buildUniformVariantQueryParams,
  buildUniformTransactionQueryParams,
  buildUniformIssueQueryParams,
  buildUniformHistoryQueryParams,
  getUniformErrorMessage,
  canSubmitUniformItem,
  canSubmitUniformVariant,
  canSubmitUniformStockTransaction,
  resolveInitialVariantItemId,
  canSubmitUniformIssue,
  canSubmitUniformReturn,
  canSubmitUniformReplacement,
  resolveOriginalReplacementItemId,
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
  // 1b. buildUniformVariantQueryParams
  // ==========================================================================
  describe('buildUniformVariantQueryParams', () => {
    it('returns empty string when itemId is empty or whitespace', () => {
      expect(buildUniformVariantQueryParams({})).toBe('');
      expect(buildUniformVariantQueryParams({ itemId: '' })).toBe('');
      expect(buildUniformVariantQueryParams({ itemId: '   ' })).toBe('');
    });

    it('builds query with itemId and trims whitespace', () => {
      const res = buildUniformVariantQueryParams({ itemId: '  item-uniform-42  ' });
      expect(res).toBe('?itemId=item-uniform-42');
      expect(res).not.toContain('undefined');
      expect(res).not.toContain('null');
    });

    it('properly encodes special characters in itemId', () => {
      const res = buildUniformVariantQueryParams({ itemId: 'item/special 123' });
      expect(res).toBe('?itemId=item%2Fspecial+123');
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
      expect(getUniformErrorMessage({ code: 'HR_UNIFORM_ITEM_INACTIVE' })).toBe(
        'Uniform item is inactive.'
      );
      expect(getUniformErrorMessage({ code: 'HR_UNIFORM_VARIANT_OUTLET_MISMATCH' })).toBe(
        'Uniform variant outlet mismatch.'
      );
      expect(getUniformErrorMessage({ code: 'HR_UNIFORM_VARIANT_INACTIVE' })).toBe(
        'Uniform variant is inactive.'
      );
      expect(getUniformErrorMessage({ code: 'HR_UNIFORM_STAFF_NOT_FOUND' })).toBe(
        'Staff member not found.'
      );
      expect(getUniformErrorMessage({ code: 'HR_UNIFORM_STAFF_OUTLET_MISMATCH' })).toBe(
        'Staff member does not belong to this outlet.'
      );
      expect(getUniformErrorMessage({ code: 'HR_UNIFORM_STAFF_NOT_ACTIVE' })).toBe(
        'Staff member is not active.'
      );
      expect(getUniformErrorMessage({ code: 'HR_UNIFORM_REPLACEMENT_STOCK_UNAVAILABLE' })).toBe(
        'Insufficient stock for replacement variant.'
      );
      expect(getUniformErrorMessage({ code: 'HR_UNIFORM_REPLACEMENT_SOURCE_MISMATCH' })).toBe(
        'Replacement source issue mismatch.'
      );
      expect(getUniformErrorMessage({ code: 'HR_UNIFORM_REPLACEMENT_SELF_REFERENCE' })).toBe(
        'Replacement cannot reference itself.'
      );
      expect(getUniformErrorMessage({ code: 'HR_UNIFORM_DUPLICATE_ISSUE_OUT' })).toBe(
        'Duplicate issue transaction.'
      );
      expect(getUniformErrorMessage({ code: 'HR_UNIFORM_DUPLICATE_RETURN_IN' })).toBe(
        'Duplicate return transaction.'
      );
      expect(getUniformErrorMessage({ code: 'INTERNAL_SERVER_ERROR' })).toBe(
        'Internal server error. Please try again.'
      );
    });

    it('returns custom message string if available and meaningful', () => {
      expect(getUniformErrorMessage({ message: 'Custom validation problem' })).toBe(
        'Custom validation problem'
      );
      expect(getUniformErrorMessage({ message: 'Please select an active uniform size.' })).toBe(
        'Please select an active uniform size.'
      );
    });

    it('sanitizes internal database, SQL, and stack trace error messages', () => {
      expect(
        getUniformErrorMessage({
          code: 'SQLITE_CONSTRAINT',
          message: 'SQLITE_CONSTRAINT: UNIQUE constraint failed: hr_uniform_items.outlet_id, hr_uniform_items.item_code',
        })
      ).toBe('Unable to complete the uniform management request.');

      expect(
        getUniformErrorMessage({
          message: 'UNIQUE constraint failed: hr_uniform_variants.uniform_item_id, hr_uniform_variants.size_label',
        })
      ).toBe('Unable to complete the uniform management request.');

      expect(
        getUniformErrorMessage({
          message: 'FOREIGN KEY constraint failed on hr_uniform_issues.variant_id',
        })
      ).toBe('Unable to complete the uniform management request.');

      expect(
        getUniformErrorMessage({
          message: 'SELECT * FROM hr_uniform_items WHERE id = ? failed',
        })
      ).toBe('Unable to complete the uniform management request.');

      expect(
        getUniformErrorMessage({
          message: 'INSERT INTO hr_uniform_issues (id) VALUES ("test")',
        })
      ).toBe('Unable to complete the uniform management request.');

      expect(
        getUniformErrorMessage({
          message: 'DELETE FROM hr_uniform_variants WHERE id = 123',
        })
      ).toBe('Unable to complete the uniform management request.');

      expect(
        getUniformErrorMessage({
          message: 'UPDATE hr_uniform_stock SET current_stock = 0',
        })
      ).toBe('Unable to complete the uniform management request.');

      expect(
        getUniformErrorMessage({
          message: 'Internal database error: SQL constraint failure',
        })
      ).toBe('Unable to complete the uniform management request.');

      expect(
        getUniformErrorMessage({
          message: 'Error: stack trace at Object.execute (/app/server.ts:100:15)',
        })
      ).toBe('Unable to complete the uniform management request.');
    });

    it('preserves known Uniform error code mappings regardless of raw message text', () => {
      expect(
        getUniformErrorMessage({
          code: 'HR_UNIFORM_ITEM_CODE_EXISTS',
          message: 'SQLITE_CONSTRAINT: UNIQUE constraint failed: hr_uniform_items.item_code',
        })
      ).toBe('A uniform item with this code already exists for this outlet.');

      expect(
        getUniformErrorMessage({
          code: 'HR_UNIFORM_INSUFFICIENT_STOCK',
          message: 'Database check failed',
        })
      ).toBe('Insufficient stock available for this operation.');
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

  // ==========================================================================
  // 8. Phase 5C-2B Mutation Form Validators
  // ==========================================================================
  describe('Phase 5C-2B Mutation Form Validators', () => {
    describe('canSubmitUniformItem', () => {
      it('validates required fields for item creation', () => {
        expect(canSubmitUniformItem({}, 'create')).toEqual({
          isValid: false,
          error: 'Item Code is required.',
        });
        expect(canSubmitUniformItem({ itemCode: 'SHIRT-M' }, 'create')).toEqual({
          isValid: false,
          error: 'Item Name is required.',
        });
        expect(
          canSubmitUniformItem({ itemCode: 'SHIRT-M', itemName: 'Shirt Medium' }, 'create')
        ).toEqual({
          isValid: false,
          error: 'Category is required.',
        });
        expect(
          canSubmitUniformItem(
            { itemCode: 'SHIRT-M', itemName: 'Shirt Medium', category: 'SHIRT', status: 'UNKNOWN' as any },
            'create'
          )
        ).toEqual({
          isValid: false,
          error: 'Status must be ACTIVE or INACTIVE.',
        });
        expect(
          canSubmitUniformItem(
            { itemCode: 'SHIRT-M', itemName: 'Shirt Medium', category: 'SHIRT', status: 'ACTIVE' },
            'create'
          )
        ).toEqual({
          isValid: true,
          error: null,
        });
      });

      it('does not require itemCode on item edit', () => {
        expect(
          canSubmitUniformItem(
            { itemName: 'Updated Shirt', category: 'SHIRT', status: 'ACTIVE' },
            'edit'
          )
        ).toEqual({
          isValid: true,
          error: null,
        });
        expect(canSubmitUniformItem({ itemName: '' }, 'edit')).toEqual({
          isValid: false,
          error: 'Item Name is required.',
        });
      });
    });

    describe('canSubmitUniformVariant', () => {
      it('validates required fields for variant creation', () => {
        expect(canSubmitUniformVariant({}, 'create')).toEqual({
          isValid: false,
          error: 'Uniform Item is required.',
        });
        expect(canSubmitUniformVariant({ uniformItemId: 'item-1' }, 'create')).toEqual({
          isValid: false,
          error: 'Size Label is required.',
        });
        expect(
          canSubmitUniformVariant(
            { uniformItemId: 'item-1', sizeLabel: 'XL', sizeSortOrder: 'invalid' },
            'create'
          )
        ).toEqual({
          isValid: false,
          error: 'Size Sort Order must be an integer.',
        });
        expect(
          canSubmitUniformVariant(
            { uniformItemId: 'item-1', sizeLabel: 'XL', sizeSortOrder: 1, reorderLevel: -5 },
            'create'
          )
        ).toEqual({
          isValid: false,
          error: 'Reorder Level must be a non-negative integer.',
        });
        expect(
          canSubmitUniformVariant(
            {
              uniformItemId: 'item-1',
              sizeLabel: 'XL',
              sizeSortOrder: 1,
              reorderLevel: 5,
              status: 'ACTIVE',
            },
            'create'
          )
        ).toEqual({
          isValid: true,
          error: null,
        });
      });

      it('allows editing variant without re-providing immutable uniformItemId or sizeLabel', () => {
        expect(
          canSubmitUniformVariant(
            { sizeSortOrder: 2, reorderLevel: 10, status: 'INACTIVE' },
            'edit'
          )
        ).toEqual({
          isValid: true,
          error: null,
        });
      });
    });

    describe('canSubmitUniformStockTransaction', () => {
      it('validates variantId, transactionType and positive integer quantity', () => {
        expect(canSubmitUniformStockTransaction({})).toEqual({
          isValid: false,
          error: 'Variant is required.',
        });
        expect(
          canSubmitUniformStockTransaction({ variantId: 'var-1', transactionType: 'ISSUE' })
        ).toEqual({
          isValid: false,
          error: 'Invalid or prohibited transaction type.',
        });
        expect(
          canSubmitUniformStockTransaction({
            variantId: 'var-1',
            transactionType: 'RECEIPT',
            quantity: 0,
          })
        ).toEqual({
          isValid: false,
          error: 'Quantity must be a positive integer.',
        });
        expect(
          canSubmitUniformStockTransaction({
            variantId: 'var-1',
            transactionType: 'RECEIPT',
            quantity: -3,
          })
        ).toEqual({
          isValid: false,
          error: 'Quantity must be a positive integer.',
        });
      });

      it('enforces mandatory notes for inventory adjustments', () => {
        expect(
          canSubmitUniformStockTransaction({
            variantId: 'var-1',
            transactionType: 'ADJUSTMENT_IN',
            quantity: 5,
            notes: '',
          })
        ).toEqual({
          isValid: false,
          error: 'Notes are mandatory for inventory adjustments.',
        });
        expect(
          canSubmitUniformStockTransaction({
            variantId: 'var-1',
            transactionType: 'ADJUSTMENT_OUT',
            quantity: 2,
            notes: '  ',
          })
        ).toEqual({
          isValid: false,
          error: 'Notes are mandatory for inventory adjustments.',
        });
        expect(
          canSubmitUniformStockTransaction({
            variantId: 'var-1',
            transactionType: 'ADJUSTMENT_OUT',
            quantity: 2,
            notes: 'Found damaged in transit',
          })
        ).toEqual({
          isValid: true,
          error: null,
        });
      });

      it('allows RECEIPT and OPENING_BALANCE without notes', () => {
        expect(
          canSubmitUniformStockTransaction({
            variantId: 'var-1',
            transactionType: 'RECEIPT',
            quantity: 10,
          })
        ).toEqual({
          isValid: true,
          error: null,
        });
        expect(
          canSubmitUniformStockTransaction({
            variantId: 'var-1',
            transactionType: 'OPENING_BALANCE',
            quantity: 20,
          })
        ).toEqual({
          isValid: true,
          error: null,
        });
      });
    });

    describe('resolveInitialVariantItemId', () => {
      const mockItems = [
        { id: 'item-1', status: 'INACTIVE' },
        { id: 'item-2', status: 'ACTIVE' },
        { id: 'item-3', status: 'ACTIVE' },
      ];

      it('preselects initialItemId if it references an ACTIVE item', () => {
        expect(resolveInitialVariantItemId(mockItems, 'item-2')).toBe('item-2');
        expect(resolveInitialVariantItemId(mockItems, 'item-3')).toBe('item-3');
      });

      it('does NOT preselect initialItemId if it references an INACTIVE item and falls back to first ACTIVE item', () => {
        expect(resolveInitialVariantItemId(mockItems, 'item-1')).toBe('item-2');
      });

      it('falls back to first ACTIVE item when initialItemId is undefined or not found', () => {
        expect(resolveInitialVariantItemId(mockItems)).toBe('item-2');
        expect(resolveInitialVariantItemId(mockItems, 'non-existent')).toBe('item-2');
      });

      it('returns empty string if no active items exist in the catalog', () => {
        const inactiveOnly = [
          { id: 'item-1', status: 'INACTIVE' },
          { id: 'item-4', status: 'INACTIVE' },
        ];
        expect(resolveInitialVariantItemId(inactiveOnly, 'item-1')).toBe('');
        expect(resolveInitialVariantItemId(inactiveOnly)).toBe('');
      });

      it('returns empty string for empty items list', () => {
        expect(resolveInitialVariantItemId([])).toBe('');
        expect(resolveInitialVariantItemId([], 'item-1')).toBe('');
      });
    });
  });

  // ==========================================================================
  // 9. Phase 5C-2C Lifecycle Form Validators (Issue, Return, Replacement)
  // ==========================================================================
  describe('Phase 5C-2C Lifecycle Form Validators', () => {
    describe('canSubmitUniformIssue', () => {
      it('validates a correct issue submission', () => {
        expect(
          canSubmitUniformIssue({
            staffId: 'staff-1',
            variantId: 'var-1',
            quantity: 2,
            conditionAtIssue: 'NEW',
            availableStock: 5,
          })
        ).toEqual({
          isValid: true,
          error: null,
        });
      });

      it('rejects missing staff member', () => {
        expect(
          canSubmitUniformIssue({
            staffId: '',
            variantId: 'var-1',
            quantity: 1,
            conditionAtIssue: 'NEW',
          })
        ).toEqual({
          isValid: false,
          error: 'Staff member is required.',
        });
      });

      it('rejects missing uniform variant', () => {
        expect(
          canSubmitUniformIssue({
            staffId: 'staff-1',
            variantId: '   ',
            quantity: 1,
            conditionAtIssue: 'NEW',
          })
        ).toEqual({
          isValid: false,
          error: 'Uniform size/variant is required.',
        });
      });

      it('rejects zero quantity', () => {
        expect(
          canSubmitUniformIssue({
            staffId: 'staff-1',
            variantId: 'var-1',
            quantity: 0,
            conditionAtIssue: 'NEW',
          })
        ).toEqual({
          isValid: false,
          error: 'Quantity must be a positive integer.',
        });
      });

      it('rejects negative quantity', () => {
        expect(
          canSubmitUniformIssue({
            staffId: 'staff-1',
            variantId: 'var-1',
            quantity: -3,
            conditionAtIssue: 'NEW',
          })
        ).toEqual({
          isValid: false,
          error: 'Quantity must be a positive integer.',
        });
      });

      it('rejects decimal quantity', () => {
        expect(
          canSubmitUniformIssue({
            staffId: 'staff-1',
            variantId: 'var-1',
            quantity: 1.5,
            conditionAtIssue: 'NEW',
          })
        ).toEqual({
          isValid: false,
          error: 'Quantity must be a positive integer.',
        });
      });

      it('rejects quantity greater than available stock', () => {
        expect(
          canSubmitUniformIssue({
            staffId: 'staff-1',
            variantId: 'var-1',
            quantity: 10,
            conditionAtIssue: 'NEW',
            availableStock: 4,
          })
        ).toEqual({
          isValid: false,
          error: 'Requested quantity exceeds available stock.',
        });
      });

      it('accepts valid NEW condition', () => {
        expect(
          canSubmitUniformIssue({
            staffId: 'staff-1',
            variantId: 'var-1',
            quantity: 1,
            conditionAtIssue: 'NEW',
            availableStock: 10,
          })
        ).toEqual({
          isValid: true,
          error: null,
        });
      });

      it('rejects invalid condition at issue', () => {
        expect(
          canSubmitUniformIssue({
            staffId: 'staff-1',
            variantId: 'var-1',
            quantity: 1,
            conditionAtIssue: 'WORN' as any,
          })
        ).toEqual({
          isValid: false,
          error: 'Valid condition at issue is required.',
        });
      });
    });

    describe('canSubmitUniformReturn', () => {
      it('validates GOOD condition with returnToStock true', () => {
        expect(canSubmitUniformReturn({ condition: 'GOOD', returnToStock: true })).toEqual({
          isValid: true,
          error: null,
        });
      });

      it('validates FAIR condition with returnToStock true', () => {
        expect(canSubmitUniformReturn({ condition: 'FAIR', returnToStock: true })).toEqual({
          isValid: true,
          error: null,
        });
      });

      it('validates NEW condition with returnToStock true', () => {
        expect(canSubmitUniformReturn({ condition: 'NEW', returnToStock: true })).toEqual({
          isValid: true,
          error: null,
        });
      });

      it('validates DAMAGED condition with returnToStock false', () => {
        expect(canSubmitUniformReturn({ condition: 'DAMAGED', returnToStock: false })).toEqual({
          isValid: true,
          error: null,
        });
      });

      it('validates LOST condition with returnToStock false', () => {
        expect(canSubmitUniformReturn({ condition: 'LOST', returnToStock: false })).toEqual({
          isValid: true,
          error: null,
        });
      });

      it('rejects DAMAGED condition when returnToStock is true', () => {
        expect(canSubmitUniformReturn({ condition: 'DAMAGED', returnToStock: true })).toEqual({
          isValid: false,
          error: 'Damaged or lost uniforms cannot be returned to usable stock.',
        });
      });

      it('rejects LOST condition when returnToStock is true', () => {
        expect(canSubmitUniformReturn({ condition: 'LOST', returnToStock: true })).toEqual({
          isValid: false,
          error: 'Damaged or lost uniforms cannot be returned to usable stock.',
        });
      });
    });

    describe('canSubmitUniformReplacement', () => {
      it('validates a correct replacement submission', () => {
        expect(
          canSubmitUniformReplacement({
            replacementVariantId: 'var-2',
            quantity: 1,
            oldCondition: 'DAMAGED',
            replacementReason: 'WORN_OUT',
            returnOldToStock: false,
            availableStock: 5,
          })
        ).toEqual({
          isValid: true,
          error: null,
        });
      });

      it('rejects missing replacement variant', () => {
        expect(
          canSubmitUniformReplacement({
            replacementVariantId: '',
            quantity: 1,
            oldCondition: 'DAMAGED',
            replacementReason: 'WORN_OUT',
            returnOldToStock: false,
          })
        ).toEqual({
          isValid: false,
          error: 'Replacement size/variant is required.',
        });
      });

      it('rejects zero quantity', () => {
        expect(
          canSubmitUniformReplacement({
            replacementVariantId: 'var-2',
            quantity: 0,
            oldCondition: 'DAMAGED',
            replacementReason: 'WORN_OUT',
            returnOldToStock: false,
          })
        ).toEqual({
          isValid: false,
          error: 'Replacement quantity must be a positive integer.',
        });
      });

      it('rejects decimal quantity', () => {
        expect(
          canSubmitUniformReplacement({
            replacementVariantId: 'var-2',
            quantity: 2.2,
            oldCondition: 'DAMAGED',
            replacementReason: 'WORN_OUT',
            returnOldToStock: false,
          })
        ).toEqual({
          isValid: false,
          error: 'Replacement quantity must be a positive integer.',
        });
      });

      it('rejects quantity greater than available stock', () => {
        expect(
          canSubmitUniformReplacement({
            replacementVariantId: 'var-2',
            quantity: 8,
            oldCondition: 'DAMAGED',
            replacementReason: 'WORN_OUT',
            returnOldToStock: false,
            availableStock: 3,
          })
        ).toEqual({
          isValid: false,
          error: 'Replacement quantity exceeds available stock.',
        });
      });

      it('accepts all standard replacement reasons', () => {
        const reasons = ['WORN_OUT', 'DAMAGED', 'SIZE_CHANGE', 'LOST', 'OTHER'] as const;
        reasons.forEach(reason => {
          expect(
            canSubmitUniformReplacement({
              replacementVariantId: 'var-2',
              quantity: 1,
              oldCondition: 'FAIR',
              replacementReason: reason,
              returnOldToStock: true,
              availableStock: 10,
            })
          ).toEqual({
            isValid: true,
            error: null,
          });
        });
      });

      it('rejects invalid replacement reason', () => {
        expect(
          canSubmitUniformReplacement({
            replacementVariantId: 'var-2',
            quantity: 1,
            oldCondition: 'FAIR',
            replacementReason: 'INVALID_REASON' as any,
            returnOldToStock: false,
          })
        ).toEqual({
          isValid: false,
          error: 'Valid replacement reason is required.',
        });
      });

      it('rejects DAMAGED old uniform when returnOldToStock is true', () => {
        expect(
          canSubmitUniformReplacement({
            replacementVariantId: 'var-2',
            quantity: 1,
            oldCondition: 'DAMAGED',
            replacementReason: 'DAMAGED',
            returnOldToStock: true,
            availableStock: 5,
          })
        ).toEqual({
          isValid: false,
          error: 'Damaged or lost uniforms cannot be returned to usable stock.',
        });
      });

      it('rejects LOST old uniform when returnOldToStock is true', () => {
        expect(
          canSubmitUniformReplacement({
            replacementVariantId: 'var-2',
            quantity: 1,
            oldCondition: 'LOST',
            replacementReason: 'LOST',
            returnOldToStock: true,
            availableStock: 5,
          })
        ).toEqual({
          isValid: false,
          error: 'Damaged or lost uniforms cannot be returned to usable stock.',
        });
      });

      it('validates GOOD old uniform with returnOldToStock true', () => {
        expect(
          canSubmitUniformReplacement({
            replacementVariantId: 'var-2',
            quantity: 1,
            oldCondition: 'GOOD',
            replacementReason: 'SIZE_CHANGE',
            returnOldToStock: true,
            availableStock: 5,
          })
        ).toEqual({
          isValid: true,
          error: null,
        });
      });
    });

    describe('resolveOriginalReplacementItemId', () => {
      const sampleItems = [
        {
          id: 'item-1',
          outletId: 'out-1',
          itemCode: 'SHIRT-M',
          itemName: 'Standard Uniform Shirt',
          category: 'SHIRT',
          status: 'ACTIVE',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
        {
          id: 'item-2',
          outletId: 'out-1',
          itemCode: 'SHIRT-ALT',
          itemName: 'Standard Uniform Shirt',
          category: 'SHIRT',
          status: 'ACTIVE',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
        {
          id: 'item-3',
          outletId: 'out-1',
          itemCode: 'CAP-STD',
          itemName: 'Standard Uniform Cap',
          category: 'CAP',
          status: 'INACTIVE',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ] as any;

      const sampleVariants = [
        {
          id: 'var-101',
          outletId: 'out-1',
          uniformItemId: 'item-1',
          sizeLabel: 'M',
          sizeSortOrder: 1,
          reorderLevel: 5,
          status: 'ACTIVE',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
        {
          id: 'var-102',
          outletId: 'out-1',
          uniformItemId: 'item-2',
          sizeLabel: 'M',
          sizeSortOrder: 1,
          reorderLevel: 5,
          status: 'ACTIVE',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
        {
          id: 'var-103',
          outletId: 'out-1',
          uniformItemId: 'item-3',
          sizeLabel: 'FREE',
          sizeSortOrder: 1,
          reorderLevel: 5,
          status: 'ACTIVE',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ] as any;

      it('resolves original item from issue.variantId', () => {
        const issue = { variantId: 'var-101', itemCode: 'SHIRT-M' } as any;
        const resolved = resolveOriginalReplacementItemId({
          issue,
          items: sampleItems,
          variants: sampleVariants,
        });
        expect(resolved).toBe('item-1');
      });

      it('prefers authoritative variant association over duplicate or similar item names', () => {
        const issue = {
          variantId: 'var-102',
          itemCode: 'SHIRT-M',
        } as any;
        const resolved = resolveOriginalReplacementItemId({
          issue,
          items: sampleItems,
          variants: sampleVariants,
        });
        expect(resolved).toBe('item-2');
      });

      it('inactive original item falls back to active item', () => {
        const issue = {
          variantId: 'var-103',
          itemCode: 'CAP-STD',
        } as any;
        const resolved = resolveOriginalReplacementItemId({
          issue,
          items: sampleItems,
          variants: sampleVariants,
        });
        expect(resolved).toBe('item-1');
      });

      it('falls back to exact itemCode match if original variant item is inactive but itemCode active match exists', () => {
        const customItems = [
          { id: 'item-old', itemCode: 'SHIRT-OLD', status: 'INACTIVE' },
          { id: 'item-active-code', itemCode: 'SHIRT-CODE', status: 'ACTIVE' },
        ] as any;
        const customVariants = [
          { id: 'var-old', uniformItemId: 'item-old', status: 'ACTIVE' },
        ] as any;
        const issue = { variantId: 'var-old', itemCode: 'SHIRT-CODE' } as any;
        const resolved = resolveOriginalReplacementItemId({
          issue,
          items: customItems,
          variants: customVariants,
        });
        expect(resolved).toBe('item-active-code');
      });

      it('no active item returns empty selection', () => {
        const allInactiveItems = [
          { id: 'item-inactive-1', itemCode: 'INACT-1', status: 'INACTIVE' },
          { id: 'item-inactive-2', itemCode: 'INACT-2', status: 'INACTIVE' },
        ] as any;
        const issue = { variantId: 'var-any', itemCode: 'INACT-1' } as any;
        expect(
          resolveOriginalReplacementItemId({
            issue,
            items: allInactiveItems,
            variants: sampleVariants,
          })
        ).toBe('');

        expect(
          resolveOriginalReplacementItemId({
            issue: null,
            items: [],
            variants: [],
          })
        ).toBe('');
      });
    });
  });
});
