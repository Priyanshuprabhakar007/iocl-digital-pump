import React, { useState, useEffect } from 'react';
import { X, FileText, AlertCircle, ArrowDownLeft, ArrowUpRight, Boxes } from 'lucide-react';
import type {
  HrUniformStockTransaction,
  HrUniformVariant,
  HrUniformStockSummary,
  HrUniformStockTransactionType,
} from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { canSubmitUniformStockTransaction, getUniformErrorMessage, formatUniformTransactionType } from './hrUniformUi';

interface HrUniformStockTransactionModalProps {
  isOpen: boolean;
  outletId: string;
  variants: HrUniformVariant[];
  stockSummary: HrUniformStockSummary[];
  initialVariantId?: string;
  onClose: () => void;
  onSuccess: (transaction: HrUniformStockTransaction) => void;
}

const ALLOWED_TRANSACTION_TYPES: { type: HrUniformStockTransactionType; label: string }[] = [
  { type: 'OPENING_BALANCE', label: 'Opening Balance' },
  { type: 'RECEIPT', label: 'Stock Receipt (PO / Vendor)' },
  { type: 'ADJUSTMENT_IN', label: 'Adjustment In (Found / Correction)' },
  { type: 'ADJUSTMENT_OUT', label: 'Adjustment Out (Damaged / Discrepancy)' },
];

export const HrUniformStockTransactionModal: React.FC<HrUniformStockTransactionModalProps> = ({
  isOpen,
  outletId,
  variants,
  stockSummary,
  initialVariantId,
  onClose,
  onSuccess,
}) => {
  const [variantId, setVariantId] = useState('');
  const [transactionType, setTransactionType] =
    useState<HrUniformStockTransactionType>('RECEIPT');
  const [quantity, setQuantity] = useState<number | string>(1);
  const [referenceType, setReferenceType] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setVariantId(initialVariantId || variants[0]?.id || '');
      setTransactionType('RECEIPT');
      setQuantity(1);
      setReferenceType('');
      setReferenceId('');
      setNotes('');
      setFormError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, initialVariantId, variants]);

  if (!isOpen) return null;

  const selectedStockSummary = stockSummary.find(s => s.variantId === variantId);
  const currentAvailableStock = selectedStockSummary?.currentStock ?? 0;
  const isAdjustment = transactionType === 'ADJUSTMENT_IN' || transactionType === 'ADJUSTMENT_OUT';
  const isAdjustmentOut = transactionType === 'ADJUSTMENT_OUT';
  const qtyNumber = Number(quantity);
  const isExcessAdjustmentOut = isAdjustmentOut && qtyNumber > currentAvailableStock;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const validation = canSubmitUniformStockTransaction({
      variantId,
      transactionType,
      quantity,
      notes,
    });

    if (!validation.isValid) {
      setFormError(validation.error);
      return;
    }

    if (isExcessAdjustmentOut) {
      setFormError(
        `Adjustment Out quantity (${qtyNumber}) cannot exceed current available stock (${currentAvailableStock}).`
      );
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        variantId,
        transactionType,
        quantity: Math.floor(qtyNumber),
        referenceType: referenceType.trim() ? referenceType.trim().toUpperCase() : null,
        referenceId: referenceId.trim() ? referenceId.trim() : null,
        notes: notes.trim() ? notes.trim() : null,
      };

      const res = await apiFetch<HrUniformStockTransaction>(
        `/api/v1/outlets/${outletId}/hr/uniform/stock-transactions`,
        {
          method: 'POST',
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
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Record Stock Transaction</h2>
              <p className="text-[11px] text-slate-400">
                Log inventory receipts, opening balances, or stock adjustments
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {formError && (
            <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Variant Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Size Variant <span className="text-orange-400">*</span>
            </label>
            <select
              value={variantId}
              onChange={e => setVariantId(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60 cursor-pointer"
            >
              <option value="">Select Size / Variant...</option>
              {variants.map(v => (
                <option key={v.id} value={v.id}>
                  {v.itemName ? `${v.itemName} (${v.itemCode || ''}) - ` : ''}Size {v.sizeLabel}
                </option>
              ))}
            </select>
          </div>

          {/* Current Stock Banner */}
          {variantId && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <div className="flex items-center gap-2 text-slate-400">
                <Boxes className="w-4 h-4 text-emerald-400" />
                <span>Current Available Stock:</span>
              </div>
              <span className="font-mono font-bold text-white text-sm">
                {currentAvailableStock} units
              </span>
            </div>
          )}

          {/* Transaction Type */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Transaction Type <span className="text-orange-400">*</span>
            </label>
            <select
              value={transactionType}
              onChange={e => setTransactionType(e.target.value as HrUniformStockTransactionType)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60 cursor-pointer"
            >
              {ALLOWED_TRANSACTION_TYPES.map(item => (
                <option key={item.type} value={item.type}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Quantity <span className="text-orange-400">*</span>
            </label>
            <input
              type="number"
              step="1"
              min="1"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              disabled={isSubmitting}
              placeholder="1"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60"
            />
            {isAdjustmentOut && (
              <p
                className={`text-[10px] mt-1 ${
                  isExcessAdjustmentOut ? 'text-rose-400 font-bold' : 'text-slate-500'
                }`}
              >
                Max reduction allowed: {currentAvailableStock} units
              </p>
            )}
          </div>

          {/* Reference Info (Optional) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Reference Type <span className="text-slate-500 text-[10px] lowercase font-normal">(opt)</span>
              </label>
              <input
                type="text"
                value={referenceType}
                onChange={e => setReferenceType(e.target.value.toUpperCase())}
                disabled={isSubmitting}
                placeholder="e.g. PO, INVOICE, AUDIT"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Reference ID <span className="text-slate-500 text-[10px] lowercase font-normal">(opt)</span>
              </label>
              <input
                type="text"
                value={referenceId}
                onChange={e => setReferenceId(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. INV-2026-1044"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Notes {isAdjustment && <span className="text-orange-400">* (mandatory for adjustments)</span>}
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={isSubmitting}
              placeholder={
                isAdjustment
                  ? 'Mandatory reason for discrepancy or physical count adjustment...'
                  : 'Optional delivery batch or delivery notes...'
              }
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isExcessAdjustmentOut}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-xl shadow-lg shadow-orange-500/20 transition disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting && (
                <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              )}
              <span>Record Transaction</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
