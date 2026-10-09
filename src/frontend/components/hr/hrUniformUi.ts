import type {
  HrUniformItem,
  HrUniformVariant,
  HrUniformCategory,
  HrUniformStatus,
  HrUniformStockTransactionType,
  HrUniformIssueStatus,
  HrUniformCondition,
  HrUniformReplacementReason,
} from '../../../shared/types';
import { formatDisplayDate, formatDisplayDateTime } from '../utilities/utilityUi';

export { formatDisplayDate, formatDisplayDateTime };

/**
 * Formats Uniform item status with badge styling
 */
export function formatUniformItemStatus(status?: HrUniformStatus | string | null): {
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
} {
  switch (status) {
    case 'ACTIVE':
      return {
        label: 'Active',
        bgClass: 'bg-emerald-500/10',
        textClass: 'text-emerald-400',
        borderClass: 'border-emerald-500/20',
      };
    case 'INACTIVE':
      return {
        label: 'Inactive',
        bgClass: 'bg-slate-500/10',
        textClass: 'text-slate-400',
        borderClass: 'border-slate-500/20',
      };
    default:
      return {
        label: 'Unknown',
        bgClass: 'bg-slate-800',
        textClass: 'text-slate-400',
        borderClass: 'border-slate-700',
      };
  }
}

/**
 * Formats Uniform issue status with badge styling
 */
export function formatUniformIssueStatus(status?: HrUniformIssueStatus | string | null): {
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
} {
  switch (status) {
    case 'ISSUED':
      return {
        label: 'Issued',
        bgClass: 'bg-emerald-500/10',
        textClass: 'text-emerald-400',
        borderClass: 'border-emerald-500/30',
      };
    case 'RETURNED':
      return {
        label: 'Returned',
        bgClass: 'bg-sky-500/10',
        textClass: 'text-sky-400',
        borderClass: 'border-sky-500/30',
      };
    case 'REPLACED':
      return {
        label: 'Replaced',
        bgClass: 'bg-purple-500/10',
        textClass: 'text-purple-400',
        borderClass: 'border-purple-500/30',
      };
    default:
      return {
        label: 'Unknown',
        bgClass: 'bg-slate-800',
        textClass: 'text-slate-400',
        borderClass: 'border-slate-700',
      };
  }
}

/**
 * Formats Uniform garment condition with badge styling
 */
export function formatUniformCondition(condition?: HrUniformCondition | string | null): {
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
} {
  switch (condition) {
    case 'NEW':
      return {
        label: 'New',
        bgClass: 'bg-emerald-500/10',
        textClass: 'text-emerald-400',
        borderClass: 'border-emerald-500/20',
      };
    case 'GOOD':
      return {
        label: 'Good',
        bgClass: 'bg-blue-500/10',
        textClass: 'text-blue-400',
        borderClass: 'border-blue-500/20',
      };
    case 'FAIR':
      return {
        label: 'Fair',
        bgClass: 'bg-amber-500/10',
        textClass: 'text-amber-400',
        borderClass: 'border-amber-500/20',
      };
    case 'DAMAGED':
      return {
        label: 'Damaged',
        bgClass: 'bg-rose-500/10',
        textClass: 'text-rose-400',
        borderClass: 'border-rose-500/20',
      };
    case 'LOST':
      return {
        label: 'Lost',
        bgClass: 'bg-red-500/10',
        textClass: 'text-red-400',
        borderClass: 'border-red-500/20',
      };
    default:
      return {
        label: condition || 'Not Specified',
        bgClass: 'bg-slate-800',
        textClass: 'text-slate-400',
        borderClass: 'border-slate-700',
      };
  }
}

/**
 * Formats Uniform inventory transaction type and indicates inflow/outflow direction
 */
export function formatUniformTransactionType(type?: HrUniformStockTransactionType | string | null): {
  label: string;
  isInflow: boolean;
  badgeClass: string;
} {
  switch (type) {
    case 'OPENING_BALANCE':
      return {
        label: 'Opening Balance',
        isInflow: true,
        badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      };
    case 'RECEIPT':
      return {
        label: 'Stock Receipt',
        isInflow: true,
        badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      };
    case 'ADJUSTMENT_IN':
      return {
        label: 'Adjustment In',
        isInflow: true,
        badgeClass: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
      };
    case 'RETURN_IN':
      return {
        label: 'Return In (Restock)',
        isInflow: true,
        badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      };
    case 'ADJUSTMENT_OUT':
      return {
        label: 'Adjustment Out',
        isInflow: false,
        badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      };
    case 'ISSUE_OUT':
      return {
        label: 'Issue Out',
        isInflow: false,
        badgeClass: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      };
    default:
      return {
        label: type || 'Unknown',
        isInflow: false,
        badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
      };
  }
}

/**
 * Formats Uniform replacement reason
 */
export function formatUniformReplacementReason(reason?: HrUniformReplacementReason | string | null): {
  label: string;
} {
  switch (reason) {
    case 'WORN_OUT':
      return { label: 'Worn Out' };
    case 'DAMAGED':
      return { label: 'Damaged' };
    case 'SIZE_CHANGE':
      return { label: 'Size Change' };
    case 'LOST':
      return { label: 'Lost' };
    case 'OTHER':
      return { label: 'Other' };
    default:
      return { label: reason || 'None' };
  }
}

/**
 * Formats Uniform item category
 */
export function formatUniformCategory(category?: HrUniformCategory | string | null): string {
  switch (category) {
    case 'SHIRT':
      return 'Shirt';
    case 'TROUSER':
      return 'Trouser';
    case 'JACKET':
      return 'Jacket';
    case 'T_SHIRT':
      return 'T-Shirt';
    case 'CAP':
      return 'Cap';
    case 'SHOES':
      return 'Shoes';
    case 'BELT':
      return 'Belt';
    case 'OTHER':
      return 'Other';
    default:
      if (!category) return 'Unknown';
      return category
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
  }
}

/**
 * Validates fromDate and toDate range
 */
export function validateUniformDateRange(
  fromDate?: string | null,
  toDate?: string | null
): { isValid: boolean; error: string | null } {
  if (fromDate && toDate && fromDate > toDate) {
    return {
      isValid: false,
      error: 'From Date cannot be later than To Date.',
    };
  }
  return {
    isValid: true,
    error: null,
  };
}

/**
 * Builds query params string for Uniform items endpoint
 * Supported: category, status, search
 */
export function buildUniformItemQueryParams(filters: {
  category?: string;
  status?: string;
  search?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.category && filters.category.trim()) {
    params.set('category', filters.category.trim());
  }
  if (filters.status && filters.status.trim()) {
    params.set('status', filters.status.trim());
  }
  if (filters.search && filters.search.trim()) {
    params.set('search', filters.search.trim());
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Builds query params string for Uniform variants endpoint
 * Supported: itemId
 */
export function buildUniformVariantQueryParams(filters: {
  itemId?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.itemId && filters.itemId.trim()) {
    params.set('itemId', filters.itemId.trim());
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Builds query params string for Uniform stock transactions endpoint
 * Supported: variantId, transactionType, fromDate, toDate
 */
export function buildUniformTransactionQueryParams(filters: {
  variantId?: string;
  transactionType?: string;
  fromDate?: string;
  toDate?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.variantId && filters.variantId.trim()) {
    params.set('variantId', filters.variantId.trim());
  }
  if (filters.transactionType && filters.transactionType.trim()) {
    params.set('transactionType', filters.transactionType.trim());
  }
  if (filters.fromDate && filters.fromDate.trim()) {
    params.set('fromDate', filters.fromDate.trim());
  }
  if (filters.toDate && filters.toDate.trim()) {
    params.set('toDate', filters.toDate.trim());
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Builds query params string for Uniform issues endpoint
 * Supported: staffId, itemId, variantId, status, fromDate, toDate
 */
export function buildUniformIssueQueryParams(filters: {
  staffId?: string;
  itemId?: string;
  variantId?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.staffId && filters.staffId.trim()) {
    params.set('staffId', filters.staffId.trim());
  }
  if (filters.itemId && filters.itemId.trim()) {
    params.set('itemId', filters.itemId.trim());
  }
  if (filters.variantId && filters.variantId.trim()) {
    params.set('variantId', filters.variantId.trim());
  }
  if (filters.status && filters.status.trim()) {
    params.set('status', filters.status.trim());
  }
  if (filters.fromDate && filters.fromDate.trim()) {
    params.set('fromDate', filters.fromDate.trim());
  }
  if (filters.toDate && filters.toDate.trim()) {
    params.set('toDate', filters.toDate.trim());
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Builds query params string for Uniform staff history report endpoint
 * Supported: staffId, fromDate, toDate
 */
export function buildUniformHistoryQueryParams(filters: {
  staffId?: string;
  fromDate?: string;
  toDate?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.staffId && filters.staffId.trim()) {
    params.set('staffId', filters.staffId.trim());
  }
  if (filters.fromDate && filters.fromDate.trim()) {
    params.set('fromDate', filters.fromDate.trim());
  }
  if (filters.toDate && filters.toDate.trim()) {
    params.set('toDate', filters.toDate.trim());
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Maps backend Uniform error responses and codes to human-friendly strings
 */
export function getUniformErrorMessage(error: any): string {
  if (!error) return 'Unable to complete the uniform management request.';

  const code = error?.code || error?.error?.code || (typeof error === 'string' ? error : '');
  const message = error?.message || error?.error?.message || '';

  if (code === 'FORBIDDEN' || message.includes('FORBIDDEN')) {
    return 'You do not have permission to perform this uniform management action.';
  }
  if (code === 'NETWORK_ERROR' || message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return 'Network connectivity error. Please check your connection.';
  }
  if (code === 'HTTP_ERROR') {
    return 'Server communication error. Please try again.';
  }
  if (code === 'HR_UNIFORM_ITEM_NOT_FOUND' || message.includes('HR_UNIFORM_ITEM_NOT_FOUND')) {
    return 'Uniform item not found.';
  }
  if (code === 'HR_UNIFORM_VARIANT_NOT_FOUND' || message.includes('HR_UNIFORM_VARIANT_NOT_FOUND')) {
    return 'Uniform size/variant not found.';
  }
  if (code === 'HR_UNIFORM_ISSUE_NOT_FOUND' || message.includes('HR_UNIFORM_ISSUE_NOT_FOUND')) {
    return 'Uniform issue record not found.';
  }
  if (code === 'HR_UNIFORM_INSUFFICIENT_STOCK' || message.includes('HR_UNIFORM_INSUFFICIENT_STOCK')) {
    return 'Insufficient stock available for this operation.';
  }
  if (code === 'HR_UNIFORM_INVALID_RESTOCK' || message.includes('HR_UNIFORM_INVALID_RESTOCK')) {
    return 'Damaged or lost items cannot be returned to usable stock.';
  }
  if (code === 'HR_UNIFORM_ISSUE_ALREADY_CLOSED' || message.includes('HR_UNIFORM_ISSUE_ALREADY_CLOSED')) {
    return 'This uniform issue is already closed or processed.';
  }
  if (code === 'HR_UNIFORM_ITEM_CODE_EXISTS' || message.includes('HR_UNIFORM_ITEM_CODE_EXISTS')) {
    return 'A uniform item with this code already exists for this outlet.';
  }
  if (code === 'HR_UNIFORM_VARIANT_EXISTS' || message.includes('HR_UNIFORM_VARIANT_EXISTS')) {
    return 'A variant with this size already exists for this uniform item.';
  }
  if (code === 'HR_UNIFORM_INVALID_TRANSACTION_TYPE' || message.includes('HR_UNIFORM_INVALID_TRANSACTION_TYPE')) {
    return 'Invalid or prohibited transaction type.';
  }
  if (code === 'HR_UNIFORM_ITEM_INACTIVE' || message.includes('HR_UNIFORM_ITEM_INACTIVE')) {
    return 'Uniform item is inactive.';
  }
  if (code === 'HR_UNIFORM_VARIANT_OUTLET_MISMATCH' || message.includes('HR_UNIFORM_VARIANT_OUTLET_MISMATCH')) {
    return 'Uniform variant outlet mismatch.';
  }
  if (code === 'HR_UNIFORM_VARIANT_INACTIVE' || message.includes('HR_UNIFORM_VARIANT_INACTIVE')) {
    return 'Uniform variant is inactive.';
  }
  if (code === 'HR_UNIFORM_STAFF_NOT_FOUND' || message.includes('HR_UNIFORM_STAFF_NOT_FOUND')) {
    return 'Staff member not found.';
  }
  if (code === 'HR_UNIFORM_STAFF_OUTLET_MISMATCH' || message.includes('HR_UNIFORM_STAFF_OUTLET_MISMATCH')) {
    return 'Staff member does not belong to this outlet.';
  }
  if (code === 'HR_UNIFORM_STAFF_NOT_ACTIVE' || message.includes('HR_UNIFORM_STAFF_NOT_ACTIVE')) {
    return 'Staff member is not active.';
  }
  if (code === 'HR_UNIFORM_REPLACEMENT_STOCK_UNAVAILABLE' || message.includes('HR_UNIFORM_REPLACEMENT_STOCK_UNAVAILABLE')) {
    return 'Insufficient stock for replacement variant.';
  }
  if (code === 'HR_UNIFORM_REPLACEMENT_SOURCE_MISMATCH' || message.includes('HR_UNIFORM_REPLACEMENT_SOURCE_MISMATCH')) {
    return 'Replacement source issue mismatch.';
  }
  if (code === 'HR_UNIFORM_REPLACEMENT_SELF_REFERENCE' || message.includes('HR_UNIFORM_REPLACEMENT_SELF_REFERENCE')) {
    return 'Replacement cannot reference itself.';
  }
  if (code === 'HR_UNIFORM_DUPLICATE_ISSUE_OUT' || message.includes('HR_UNIFORM_DUPLICATE_ISSUE_OUT')) {
    return 'Duplicate issue transaction.';
  }
  if (code === 'HR_UNIFORM_DUPLICATE_RETURN_IN' || message.includes('HR_UNIFORM_DUPLICATE_RETURN_IN')) {
    return 'Duplicate return transaction.';
  }
  if (code === 'INTERNAL_SERVER_ERROR' || message.includes('INTERNAL_SERVER_ERROR')) {
    return 'Internal server error. Please try again.';
  }

  // Sanitize internal / database / stack trace patterns from custom messages
  if (isInternalOrUnsafeError(message) || isInternalOrUnsafeError(code)) {
    return 'Unable to complete the uniform management request.';
  }

  if (typeof message === 'string' && message.trim().length > 0 && !message.includes('object Object')) {
    return message;
  }

  return 'Unable to complete the uniform management request.';
}

/**
 * Detects internal database / SQL / stack trace patterns to prevent leaking
 * system internals to the frontend user interface.
 */
export function isInternalOrUnsafeError(message?: string | null): boolean {
  if (!message || typeof message !== 'string') return false;
  const lower = message.toLowerCase();

  return (
    lower.includes('sqlite') ||
    lower.includes('sql constraint') ||
    lower.includes('unique constraint') ||
    lower.includes('foreign key') ||
    lower.includes('database error') ||
    lower.includes('stack trace') ||
    /\binsert\s+into\b/i.test(message) ||
    /\bdelete\s+from\b/i.test(message) ||
    /\bselect\b[\s\S]*\bfrom\b/i.test(message) ||
    /\bselect\s+[*0-9]/i.test(message) ||
    /\bupdate\s+\w+\s+set\b/i.test(message) ||
    /\bat\s+[\w./\\-]+\s*\(/i.test(message) ||
    /\bat\s+[\w./\\-]+:\d+:\d+/i.test(message)
  );
}

/**
 * Resolves the original uniform item ID for replacement modal default selection.
 * Priority:
 * 1. Original item from authoritative issue.variantId -> variant.uniformItemId if ACTIVE
 * 2. Exact issue.itemCode match if ACTIVE
 * 3. First ACTIVE item in catalog
 * 4. Empty string if no active items exist
 */
export function resolveOriginalReplacementItemId(params: {
  issue?: {
    variantId?: string | null;
    itemCode?: string | null;
  } | null;
  items: HrUniformItem[];
  variants: HrUniformVariant[];
}): string {
  if (!params.issue) {
    const firstActive = params.items.find(i => i.status === 'ACTIVE');
    return firstActive?.id || '';
  }

  // 1. Authoritative variant lookup
  if (params.issue.variantId) {
    const originalVariant = params.variants.find(v => v.id === params.issue?.variantId);
    if (originalVariant) {
      const originalItem = params.items.find(i => i.id === originalVariant.uniformItemId);
      if (originalItem && originalItem.status === 'ACTIVE') {
        return originalItem.id;
      }
    }
  }

  // 2. Exact issue.itemCode match if ACTIVE
  if (params.issue.itemCode) {
    const codeMatchedItem = params.items.find(
      i => i.itemCode === params.issue?.itemCode && i.status === 'ACTIVE'
    );
    if (codeMatchedItem) {
      return codeMatchedItem.id;
    }
  }

  // 3. First ACTIVE item
  const firstActiveItem = params.items.find(i => i.status === 'ACTIVE');
  if (firstActiveItem) {
    return firstActiveItem.id;
  }

  // 4. Empty string
  return '';
}

/**
 * Validates uniform item form inputs before submission
 */
export function canSubmitUniformItem(
  data: {
    itemCode?: string;
    itemName?: string;
    category?: string;
    status?: string;
  },
  mode: 'create' | 'edit'
): { isValid: boolean; error: string | null } {
  if (mode === 'create') {
    if (!data.itemCode || !data.itemCode.trim()) {
      return { isValid: false, error: 'Item Code is required.' };
    }
  }

  if (!data.itemName || !data.itemName.trim()) {
    return { isValid: false, error: 'Item Name is required.' };
  }

  if (!data.category || !data.category.trim()) {
    return { isValid: false, error: 'Category is required.' };
  }

  if (data.status && data.status !== 'ACTIVE' && data.status !== 'INACTIVE') {
    return { isValid: false, error: 'Status must be ACTIVE or INACTIVE.' };
  }

  return { isValid: true, error: null };
}

/**
 * Validates uniform variant form inputs before submission
 */
export function canSubmitUniformVariant(
  data: {
    uniformItemId?: string;
    sizeLabel?: string;
    sizeSortOrder?: number | string;
    reorderLevel?: number | string;
    status?: string;
  },
  mode: 'create' | 'edit'
): { isValid: boolean; error: string | null } {
  if (mode === 'create') {
    if (!data.uniformItemId || !data.uniformItemId.trim()) {
      return { isValid: false, error: 'Uniform Item is required.' };
    }
    if (!data.sizeLabel || !data.sizeLabel.trim()) {
      return { isValid: false, error: 'Size Label is required.' };
    }
  }

  const sortOrderNum = Number(data.sizeSortOrder);
  if (isNaN(sortOrderNum) || !Number.isInteger(sortOrderNum)) {
    return { isValid: false, error: 'Size Sort Order must be an integer.' };
  }

  const reorderNum = Number(data.reorderLevel);
  if (isNaN(reorderNum) || !Number.isInteger(reorderNum) || reorderNum < 0) {
    return { isValid: false, error: 'Reorder Level must be a non-negative integer.' };
  }

  if (data.status && data.status !== 'ACTIVE' && data.status !== 'INACTIVE') {
    return { isValid: false, error: 'Status must be ACTIVE or INACTIVE.' };
  }

  return { isValid: true, error: null };
}

/**
 * Validates uniform stock transaction form inputs before submission
 */
export function canSubmitUniformStockTransaction(data: {
  variantId?: string;
  transactionType?: string;
  quantity?: number | string;
  notes?: string | null;
}): { isValid: boolean; error: string | null } {
  if (!data.variantId || !data.variantId.trim()) {
    return { isValid: false, error: 'Variant is required.' };
  }

  const allowedTypes = ['OPENING_BALANCE', 'RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'];
  if (!data.transactionType || !allowedTypes.includes(data.transactionType)) {
    return { isValid: false, error: 'Invalid or prohibited transaction type.' };
  }

  const qtyNum = Number(data.quantity);
  if (isNaN(qtyNum) || !Number.isInteger(qtyNum) || qtyNum <= 0) {
    return { isValid: false, error: 'Quantity must be a positive integer.' };
  }

  if (
    (data.transactionType === 'ADJUSTMENT_IN' || data.transactionType === 'ADJUSTMENT_OUT') &&
    (!data.notes || !data.notes.trim())
  ) {
    return { isValid: false, error: 'Notes are mandatory for inventory adjustments.' };
  }

  return { isValid: true, error: null };
}

/**
 * Resolves the initial uniform item selection for variant creation.
 * Selects initialItemId if and only if it points to an active item.
 * Otherwise selects the first available active item, or empty string if none.
 */
export function resolveInitialVariantItemId(
  items: Array<{ id: string; status: string }>,
  initialItemId?: string
): string {
  const activeItems = items.filter(item => item.status === 'ACTIVE');
  const targetItem = initialItemId ? items.find(item => item.id === initialItemId) : undefined;
  if (targetItem && targetItem.status === 'ACTIVE') {
    return targetItem.id;
  }
  return activeItems[0]?.id || '';
}

/**
 * Validates uniform issue form inputs before submission
 */
export function canSubmitUniformIssue(data: {
  staffId?: string;
  variantId?: string;
  quantity?: number | string;
  conditionAtIssue?: string;
  availableStock?: number;
}): { isValid: boolean; error: string | null } {
  if (!data.staffId || !data.staffId.trim()) {
    return { isValid: false, error: 'Staff member is required.' };
  }

  if (!data.variantId || !data.variantId.trim()) {
    return { isValid: false, error: 'Uniform size/variant is required.' };
  }

  const qty = Number(data.quantity);
  if (isNaN(qty) || !Number.isInteger(qty) || qty <= 0) {
    return { isValid: false, error: 'Quantity must be a positive integer.' };
  }

  const validConditions = ['NEW', 'GOOD', 'FAIR', 'DAMAGED', 'LOST'];
  if (!data.conditionAtIssue || !validConditions.includes(data.conditionAtIssue)) {
    return { isValid: false, error: 'Valid condition at issue is required.' };
  }

  if (typeof data.availableStock === 'number' && !isNaN(data.availableStock)) {
    if (qty > data.availableStock) {
      return { isValid: false, error: 'Requested quantity exceeds available stock.' };
    }
  }

  return { isValid: true, error: null };
}

/**
 * Validates uniform return form inputs before submission
 */
export function canSubmitUniformReturn(data: {
  condition?: string;
  returnToStock?: boolean;
}): { isValid: boolean; error: string | null } {
  const validConditions = ['NEW', 'GOOD', 'FAIR', 'DAMAGED', 'LOST'];
  if (!data.condition || !validConditions.includes(data.condition)) {
    return { isValid: false, error: 'Valid return condition is required.' };
  }

  if (typeof data.returnToStock !== 'boolean') {
    return { isValid: false, error: 'Return to stock preference must be specified.' };
  }

  if (data.returnToStock && (data.condition === 'DAMAGED' || data.condition === 'LOST')) {
    return { isValid: false, error: 'Damaged or lost uniforms cannot be returned to usable stock.' };
  }

  return { isValid: true, error: null };
}

/**
 * Validates uniform replacement form inputs before submission
 */
export function canSubmitUniformReplacement(data: {
  replacementVariantId?: string;
  quantity?: number | string;
  oldCondition?: string;
  replacementReason?: string;
  returnOldToStock?: boolean;
  availableStock?: number;
}): { isValid: boolean; error: string | null } {
  if (!data.replacementVariantId || !data.replacementVariantId.trim()) {
    return { isValid: false, error: 'Replacement size/variant is required.' };
  }

  const qty = Number(data.quantity);
  if (isNaN(qty) || !Number.isInteger(qty) || qty <= 0) {
    return { isValid: false, error: 'Replacement quantity must be a positive integer.' };
  }

  if (typeof data.availableStock === 'number' && !isNaN(data.availableStock)) {
    if (qty > data.availableStock) {
      return { isValid: false, error: 'Replacement quantity exceeds available stock.' };
    }
  }

  const validConditions = ['NEW', 'GOOD', 'FAIR', 'DAMAGED', 'LOST'];
  if (!data.oldCondition || !validConditions.includes(data.oldCondition)) {
    return { isValid: false, error: 'Valid old uniform condition is required.' };
  }

  const validReasons = ['WORN_OUT', 'DAMAGED', 'SIZE_CHANGE', 'LOST', 'OTHER'];
  if (!data.replacementReason || !validReasons.includes(data.replacementReason)) {
    return { isValid: false, error: 'Valid replacement reason is required.' };
  }

  if (typeof data.returnOldToStock !== 'boolean') {
    return { isValid: false, error: 'Return to stock preference must be specified.' };
  }

  if (data.returnOldToStock && (data.oldCondition === 'DAMAGED' || data.oldCondition === 'LOST')) {
    return { isValid: false, error: 'Damaged or lost uniforms cannot be returned to usable stock.' };
  }

  return { isValid: true, error: null };
}


