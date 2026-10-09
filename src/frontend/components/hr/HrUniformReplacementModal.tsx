import React, { useState, useEffect } from 'react';
import { X, RefreshCw, AlertCircle, Info } from 'lucide-react';
import type {
  HrUniformIssue,
  HrUniformItem,
  HrUniformVariant,
  HrUniformStockSummary,
  HrUniformCondition,
  HrUniformReplacementReason,
} from '../../../shared/types';
import { apiFetch } from '../../services/api';
import {
  canSubmitUniformReplacement,
  getUniformErrorMessage,
  formatUniformCondition,
  formatUniformReplacementReason,
  formatDisplayDate,
  resolveOriginalReplacementItemId,
} from './hrUniformUi';

interface HrUniformReplacementModalProps {
  isOpen: boolean;
  outletId: string;
  issue: HrUniformIssue | null;
  items: HrUniformItem[];
  variants: HrUniformVariant[];
  stockSummary: HrUniformStockSummary[];
  onClose: () => void;
  onSuccess: (replacementResult: any) => void;
}

const CONDITIONS: HrUniformCondition[] = ['NEW', 'GOOD', 'FAIR', 'DAMAGED', 'LOST'];

const REPLACEMENT_REASONS: HrUniformReplacementReason[] = [
  'WORN_OUT',
  'DAMAGED',
  'SIZE_CHANGE',
  'LOST',
  'OTHER',
];

export const HrUniformReplacementModal: React.FC<HrUniformReplacementModalProps> = ({
  isOpen,
  outletId,
  issue,
  items,
  variants,
  stockSummary,
  onClose,
  onSuccess,
}) => {
  const activeItems = items.filter(i => i.status === 'ACTIVE');

  // Stock lookup from authoritative stockSummary
  const stockMap = new Map<string, number>();
  stockSummary.forEach(s => stockMap.set(s.variantId, s.currentStock));

  const [replacementItemId, setReplacementItemId] = useState('');
  const [replacementVariantId, setReplacementVariantId] = useState('');
  const [quantity, setQuantity] = useState<number | string>(1);
  const [oldCondition, setOldCondition] = useState<HrUniformCondition>('DAMAGED');
  const [replacementReason, setReplacementReason] = useState<HrUniformReplacementReason>('WORN_OUT');
  const [returnOldToStock, setReturnOldToStock] = useState<boolean>(false);
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Available replacement variants for the chosen replacement item
  const availableVariants = variants.filter(
    v => v.uniformItemId === replacementItemId && v.status === 'ACTIVE'
  );

  const currentVariantStock = replacementVariantId ? (stockMap.get(replacementVariantId) ?? 0) : 0;

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen && issue) {
      // Authoritatively resolve original item or active fallback
      const initialItemId = resolveOriginalReplacementItemId({
        issue,
        items,
        variants,
      });
      setReplacementItemId(initialItemId);

      if (initialItemId) {
        const itemVariants = variants.filter(
          v => v.uniformItemId === initialItemId && v.status === 'ACTIVE'
        );
        // Prefer variant matching the original size if available and in stock, or first in stock
        const matchingSizeVariant = itemVariants.find(
          v => v.sizeLabel === issue.sizeLabel && (stockMap.get(v.id) ?? 0) > 0
        );
        const inStockVariant = itemVariants.find(v => (stockMap.get(v.id) ?? 0) > 0);
        const defaultVar = matchingSizeVariant || inStockVariant || itemVariants[0];
        setReplacementVariantId(defaultVar?.id || '');
      } else {
        setReplacementVariantId('');
      }

      setQuantity(issue.quantity || 1);
      setOldCondition('DAMAGED');
      setReplacementReason('WORN_OUT');
      setReturnOldToStock(false);
      setNotes('');
      setFormError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, issue, outletId]);

  if (!isOpen || !issue) return null;

  const handleItemChange = (newItemId: string) => {
    setReplacementItemId(newItemId);
    const itemVariants = variants.filter(
      v => v.uniformItemId === newItemId && v.status === 'ACTIVE'
    );
    const inStockVariant = itemVariants.find(v => (stockMap.get(v.id) ?? 0) > 0);
    setReplacementVariantId(inStockVariant ? inStockVariant.id : itemVariants[0]?.id || '');
    setFormError(null);
  };

  const handleOldConditionChange = (newCond: HrUniformCondition) => {
    setOldCondition(newCond);
    if (newCond === 'DAMAGED' || newCond === 'LOST') {
      setReturnOldToStock(false);
    }
    setFormError(null);
  };

  const isRestockProhibited = oldCondition === 'DAMAGED' || oldCondition === 'LOST';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const validation = canSubmitUniformReplacement({
      replacementVariantId,
      quantity,
      oldCondition,
      replacementReason,
      returnOldToStock,
      availableStock: currentVariantStock,
    });

    if (!validation.isValid) {
      setFormError(validation.error);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        replacementVariantId,
        quantity: Number(quantity),
        oldCondition,
        replacementReason,
        returnOldToStock,
        notes: notes.trim() ? notes.trim() : null,
      };

      const res = await apiFetch<any>(
        `/api/v1/outlets/${outletId}/hr/uniform/issues/${issue.id}/replace`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (!res.success || !res.data) {
        setFormError(getUniformErrorMessage(res.error));
        setIsSubmitting(false);
        return;
      }

      onSuccess(res.data);
    } catch (err) {
      setFormError(getUniformErrorMessage(err));
      setIsSubmitting(false);
    }
  };

  const origConditionStyle = formatUniformCondition(issue.conditionAtIssue);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Process Uniform Replacement</h3>
              <p className="text-[11px] text-slate-400">
                Replace uniform, handle old garment state and issue replacement stock
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {formError && (
            <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Original Issue Summary (Read-Only) */}
          <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2 text-xs">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
              Original Issue Information
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-500">Staff:</span>{' '}
                <span className="text-white font-medium">{issue.staffName || 'Staff Member'}</span>
                <span className="text-slate-400 font-mono text-[10px] ml-1">
                  ({issue.employeeCode || '—'})
                </span>
              </div>
              <div>
                <span className="text-slate-500">Original Item:</span>{' '}
                <span className="text-white font-medium">
                  {issue.itemName || issue.itemCode || 'Uniform Item'}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Original Size:</span>{' '}
                <span className="text-amber-300 font-mono font-bold">
                  {issue.sizeLabel || '—'}
                </span>{' '}
                <span className="text-slate-500 font-mono">({issue.quantity} unit)</span>
              </div>
              <div>
                <span className="text-slate-500">Issued Date:</span>{' '}
                <span className="text-slate-300 font-mono">
                  {formatDisplayDate(issue.issuedAt)}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Issued Condition:</span>{' '}
                <span
                  className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold border ${origConditionStyle.bgClass} ${origConditionStyle.textClass} ${origConditionStyle.borderClass}`}
                >
                  {origConditionStyle.label}
                </span>
              </div>
            </div>
          </div>

          {/* Replacement Item */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Replacement Item <span className="text-orange-400">*</span>
            </label>
            <select
              value={replacementItemId}
              onChange={e => handleItemChange(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60 cursor-pointer"
            >
              <option value="">Select Replacement Item...</option>
              {activeItems.map(item => (
                <option key={item.id} value={item.id}>
                  {item.itemName} ({item.itemCode})
                </option>
              ))}
            </select>
          </div>

          {/* Replacement Size / Variant */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Replacement Size / Variant <span className="text-orange-400">*</span>
            </label>
            <select
              value={replacementVariantId}
              onChange={e => setReplacementVariantId(e.target.value)}
              disabled={isSubmitting || !replacementItemId}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60 cursor-pointer"
            >
              <option value="">Select Size / Variant...</option>
              {availableVariants.map(v => {
                const stock = stockMap.get(v.id) ?? 0;
                return (
                  <option key={v.id} value={v.id}>
                    Size {v.sizeLabel} — {stock > 0 ? `Stock: ${stock}` : 'Out of Stock'}
                  </option>
                );
              })}
            </select>
            {replacementVariantId && (
              <div className="flex items-center justify-between text-[11px] mt-1.5 px-2 py-1 bg-slate-950/60 rounded-lg border border-slate-800">
                <span className="text-slate-400">Available Replacement Stock:</span>
                <span
                  className={`font-mono font-bold ${
                    currentVariantStock > 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {currentVariantStock} units
                </span>
              </div>
            )}
          </div>

          {/* Replacement Quantity */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Replacement Quantity <span className="text-orange-400">*</span>
            </label>
            <input
              type="number"
              min="1"
              max={currentVariantStock > 0 ? currentVariantStock : undefined}
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60"
            />
          </div>

          {/* Old Uniform Condition & Replacement Reason */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Old Uniform Condition <span className="text-orange-400">*</span>
              </label>
              <select
                value={oldCondition}
                onChange={e => handleOldConditionChange(e.target.value as HrUniformCondition)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60 cursor-pointer"
              >
                {CONDITIONS.map(c => (
                  <option key={c} value={c}>
                    {formatUniformCondition(c).label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Replacement Reason <span className="text-orange-400">*</span>
              </label>
              <select
                value={replacementReason}
                onChange={e =>
                  setReplacementReason(e.target.value as HrUniformReplacementReason)
                }
                disabled={isSubmitting}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60 cursor-pointer"
              >
                {REPLACEMENT_REASONS.map(r => (
                  <option key={r} value={r}>
                    {formatUniformReplacementReason(r).label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Return Old Uniform to Stock Checkbox */}
          <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-xl space-y-1.5">
            <label
              className={`flex items-start gap-2.5 text-xs ${
                isRestockProhibited ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                checked={returnOldToStock}
                onChange={e => setReturnOldToStock(e.target.checked)}
                disabled={isSubmitting || isRestockProhibited}
                className="mt-0.5 rounded border-slate-700 bg-slate-900 text-orange-500 focus:ring-orange-500 focus:ring-offset-slate-950 disabled:opacity-50"
              />
              <div>
                <span className="font-semibold text-white">Return Old Uniform to Stock</span>
                <p className="text-[11px] text-slate-400">
                  Credit old returned uniform into outlet usable stock.
                </p>
              </div>
            </label>

            {isRestockProhibited && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-400 pt-1 border-t border-slate-800/60">
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>Damaged or lost uniforms cannot be returned to usable stock.</span>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Replacement Notes <span className="text-slate-500 lowercase">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={isSubmitting}
              placeholder="e.g. Fabric tear on field duty, seasonal size adjustment"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || currentVariantStock <= 0}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-purple-600/20 disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>Confirm Replacement</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
