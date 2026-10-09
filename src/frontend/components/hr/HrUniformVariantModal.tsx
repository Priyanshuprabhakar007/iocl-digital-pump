import React, { useState, useEffect } from 'react';
import { X, Layers, AlertCircle } from 'lucide-react';
import type { HrUniformVariant, HrUniformItem, HrUniformStatus } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import {
  canSubmitUniformVariant,
  getUniformErrorMessage,
  resolveInitialVariantItemId,
} from './hrUniformUi';

interface HrUniformVariantModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  outletId: string;
  variant?: HrUniformVariant | null;
  items: HrUniformItem[];
  initialItemId?: string;
  onClose: () => void;
  onSuccess: (savedVariant: HrUniformVariant, mode: 'create' | 'edit') => void;
}

export const HrUniformVariantModal: React.FC<HrUniformVariantModalProps> = ({
  isOpen,
  mode,
  outletId,
  variant,
  items,
  initialItemId,
  onClose,
  onSuccess,
}) => {
  const [uniformItemId, setUniformItemId] = useState('');
  const [sizeLabel, setSizeLabel] = useState('');
  const [sizeSortOrder, setSizeSortOrder] = useState<number | string>(0);
  const [reorderLevel, setReorderLevel] = useState<number | string>(0);
  const [status, setStatus] = useState<HrUniformStatus>('ACTIVE');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && variant) {
        setUniformItemId(variant.uniformItemId);
        setSizeLabel(variant.sizeLabel);
        setSizeSortOrder(variant.sizeSortOrder);
        setReorderLevel(variant.reorderLevel);
        setStatus(variant.status);
      } else {
        // In CREATE mode: selectable items must be ACTIVE only.
        // If initialItemId references an active item, preselect it.
        // If initialItemId references an inactive item or none: select first ACTIVE item, or empty if none.
        const defaultItemId = resolveInitialVariantItemId(items, initialItemId);

        setUniformItemId(defaultItemId);
        setSizeLabel('');
        setSizeSortOrder(0);
        setReorderLevel(5);
        setStatus('ACTIVE');
      }
      setFormError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, mode, variant, items, initialItemId]);

  if (!isOpen) return null;

  // For CREATE mode, selectable Uniform Items must be ACTIVE only.
  // In EDIT mode, existing variant's item is displayed (association is immutable).
  const selectableItems =
    mode === 'edit'
      ? items
      : items.filter(item => item.status === 'ACTIVE');

  const selectedItem = items.find(i => i.id === uniformItemId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const validation = canSubmitUniformVariant(
      {
        uniformItemId,
        sizeLabel,
        sizeSortOrder,
        reorderLevel,
        status,
      },
      mode
    );

    if (!validation.isValid) {
      setFormError(validation.error);
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'create') {
        const payload = {
          uniformItemId,
          sizeLabel: sizeLabel.trim(),
          sizeSortOrder: Number(sizeSortOrder),
          reorderLevel: Number(reorderLevel),
          status,
        };

        const res = await apiFetch<HrUniformVariant>(
          `/api/v1/outlets/${outletId}/hr/uniform/variants`,
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

        onSuccess(res.data, 'create');
      } else {
        if (!variant) throw new Error('Missing variant to edit');

        // Never send uniformItemId or sizeLabel during update
        const payload = {
          sizeSortOrder: Number(sizeSortOrder),
          reorderLevel: Number(reorderLevel),
          status,
        };

        const res = await apiFetch<HrUniformVariant>(
          `/api/v1/outlets/${outletId}/hr/uniform/variants/${variant.id}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload),
          }
        );

        if (!res.success || !res.data) {
          setFormError(getUniformErrorMessage(res.error));
          setIsSubmitting(false);
          return;
        }

        onSuccess(res.data, 'edit');
      }
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
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                {mode === 'create' ? 'Add Size Variant' : 'Edit Size Variant'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {mode === 'create'
                  ? 'Define a new size/SKU variant for an active uniform item'
                  : `Update reorder threshold or sort order for size ${variant?.sizeLabel || ''}`}
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

          {/* Uniform Item */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Uniform Item <span className="text-orange-400">*</span>
            </label>
            {mode === 'create' ? (
              <select
                value={uniformItemId}
                onChange={e => setUniformItemId(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60 cursor-pointer"
              >
                <option value="">Select Item...</option>
                {selectableItems.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.itemName} ({item.itemCode})
                  </option>
                ))}
              </select>
            ) : (
              <div className="px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-300">
                {selectedItem
                  ? `${selectedItem.itemName} (${selectedItem.itemCode})`
                  : variant?.itemName
                  ? `${variant.itemName} (${variant.itemCode || ''})`
                  : uniformItemId}
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Item association cannot be altered.
                </span>
              </div>
            )}
          </div>

          {/* Size Label */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Size Label <span className="text-orange-400">*</span>
            </label>
            {mode === 'create' ? (
              <input
                type="text"
                value={sizeLabel}
                onChange={e => setSizeLabel(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. M, L, XL, 32, 34, 40"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60"
              />
            ) : (
              <div className="px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-xs font-mono font-bold text-amber-300">
                {sizeLabel}
                <span className="text-[10px] text-slate-500 font-sans font-normal block mt-0.5">
                  Size label is immutable once created.
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Size Sort Order */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Sort Order <span className="text-orange-400">*</span>
              </label>
              <input
                type="number"
                step="1"
                value={sizeSortOrder}
                onChange={e => setSizeSortOrder(e.target.value)}
                disabled={isSubmitting}
                placeholder="0"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60"
              />
              <p className="text-[10px] text-slate-500 mt-1">Numerical order for sizing display</p>
            </div>

            {/* Reorder Level */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Reorder Level <span className="text-orange-400">*</span>
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={reorderLevel}
                onChange={e => setReorderLevel(e.target.value)}
                disabled={isSubmitting}
                placeholder="0"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60"
              />
              <p className="text-[10px] text-slate-500 mt-1">Triggers low stock alert at or below this</p>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Status <span className="text-orange-400">*</span>
            </label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as HrUniformStatus)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60 cursor-pointer"
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
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
              disabled={isSubmitting}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-xl shadow-lg shadow-orange-500/20 transition disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting && (
                <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              )}
              <span>{mode === 'create' ? 'Create Variant' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
