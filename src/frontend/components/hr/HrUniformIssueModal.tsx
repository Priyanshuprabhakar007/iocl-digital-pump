import React, { useState, useEffect } from 'react';
import { X, Shirt, AlertCircle } from 'lucide-react';
import type {
  HrStaff,
  HrUniformItem,
  HrUniformVariant,
  HrUniformStockSummary,
  HrUniformIssue,
  HrUniformCondition,
} from '../../../shared/types';
import { apiFetch } from '../../services/api';
import {
  canSubmitUniformIssue,
  getUniformErrorMessage,
  formatUniformCondition,
} from './hrUniformUi';

interface HrUniformIssueModalProps {
  isOpen: boolean;
  outletId: string;
  staffList: HrStaff[];
  items: HrUniformItem[];
  variants: HrUniformVariant[];
  stockSummary: HrUniformStockSummary[];
  onClose: () => void;
  onSuccess: (newIssue: HrUniformIssue) => void;
}

const CONDITIONS: HrUniformCondition[] = ['NEW', 'GOOD', 'FAIR', 'DAMAGED', 'LOST'];

export const HrUniformIssueModal: React.FC<HrUniformIssueModalProps> = ({
  isOpen,
  outletId,
  staffList,
  items,
  variants,
  stockSummary,
  onClose,
  onSuccess,
}) => {
  // Only ACTIVE staff are selectable for new uniform issue
  const activeStaff = staffList.filter(s => s.employmentStatus === 'ACTIVE');

  // Only ACTIVE uniform items
  const activeItems = items.filter(i => i.status === 'ACTIVE');

  // Authoritative stock lookup map
  const stockMap = new Map<string, number>();
  stockSummary.forEach(s => stockMap.set(s.variantId, s.currentStock));

  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [quantity, setQuantity] = useState<number | string>(1);
  const [conditionAtIssue, setConditionAtIssue] = useState<HrUniformCondition>('NEW');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Available variants for the currently selected active item
  const availableVariants = variants.filter(
    v => v.uniformItemId === selectedItemId && v.status === 'ACTIVE'
  );

  const currentVariantStock = selectedVariantId ? (stockMap.get(selectedVariantId) ?? 0) : 0;

  // Initialize or reset selections when modal opens
  useEffect(() => {
    if (isOpen) {
      const initialStaff = activeStaff[0]?.id || '';
      setSelectedStaffId(initialStaff);

      const initialItem = activeItems[0]?.id || '';
      setSelectedItemId(initialItem);

      if (initialItem) {
        const itemVariants = variants.filter(
          v => v.uniformItemId === initialItem && v.status === 'ACTIVE'
        );
        // Prefer variant with stock > 0
        const inStockVariant = itemVariants.find(v => (stockMap.get(v.id) ?? 0) > 0);
        setSelectedVariantId(inStockVariant ? inStockVariant.id : itemVariants[0]?.id || '');
      } else {
        setSelectedVariantId('');
      }

      setQuantity(1);
      setConditionAtIssue('NEW');
      setNotes('');
      setFormError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, outletId]);

  // When selected item changes, pick best available variant
  const handleItemChange = (newItemId: string) => {
    setSelectedItemId(newItemId);
    const itemVariants = variants.filter(
      v => v.uniformItemId === newItemId && v.status === 'ACTIVE'
    );
    const inStockVariant = itemVariants.find(v => (stockMap.get(v.id) ?? 0) > 0);
    setSelectedVariantId(inStockVariant ? inStockVariant.id : itemVariants[0]?.id || '');
    setFormError(null);
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const validation = canSubmitUniformIssue({
      staffId: selectedStaffId,
      variantId: selectedVariantId,
      quantity,
      conditionAtIssue,
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
        staffId: selectedStaffId,
        variantId: selectedVariantId,
        quantity: Number(quantity),
        conditionAtIssue,
        notes: notes.trim() ? notes.trim() : null,
      };

      const res = await apiFetch<HrUniformIssue>(
        `/api/v1/outlets/${outletId}/hr/uniform/issues`,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <Shirt className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Issue Uniform to Staff</h3>
              <p className="text-[11px] text-slate-400">
                Allocate uniform size to an active staff member
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

          {/* Staff Member */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Staff Member <span className="text-orange-400">*</span>
            </label>
            <select
              value={selectedStaffId}
              onChange={e => setSelectedStaffId(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60 cursor-pointer"
            >
              <option value="">Select Active Staff Member...</option>
              {activeStaff.map(staff => (
                <option key={staff.id} value={staff.id}>
                  {staff.fullName} ({staff.employeeCode})
                </option>
              ))}
            </select>
            {activeStaff.length === 0 && (
              <p className="text-[10px] text-amber-400 mt-1">
                No active staff members found for this outlet.
              </p>
            )}
          </div>

          {/* Uniform Item */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Uniform Item <span className="text-orange-400">*</span>
            </label>
            <select
              value={selectedItemId}
              onChange={e => handleItemChange(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60 cursor-pointer"
            >
              <option value="">Select Uniform Item...</option>
              {activeItems.map(item => (
                <option key={item.id} value={item.id}>
                  {item.itemName} ({item.itemCode})
                </option>
              ))}
            </select>
          </div>

          {/* Size / Variant */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Size / Variant <span className="text-orange-400">*</span>
            </label>
            <select
              value={selectedVariantId}
              onChange={e => setSelectedVariantId(e.target.value)}
              disabled={isSubmitting || !selectedItemId}
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
            {selectedVariantId && (
              <div className="flex items-center justify-between text-[11px] mt-1.5 px-2 py-1 bg-slate-950/60 rounded-lg border border-slate-800">
                <span className="text-slate-400">Available Stock:</span>
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

          {/* Quantity & Condition at Issue */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Quantity <span className="text-orange-400">*</span>
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

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Condition at Issue <span className="text-orange-400">*</span>
              </label>
              <select
                value={conditionAtIssue}
                onChange={e => setConditionAtIssue(e.target.value as HrUniformCondition)}
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
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Notes <span className="text-slate-500 lowercase">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={isSubmitting}
              placeholder="e.g. Annual allocation, replacement handover, special sizing"
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
              className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-orange-500/20 disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Issuing...</span>
                </>
              ) : (
                <span>Issue Uniform</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
