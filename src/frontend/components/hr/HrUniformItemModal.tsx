import React, { useState, useEffect } from 'react';
import { X, Package, AlertCircle } from 'lucide-react';
import type { HrUniformItem, HrUniformCategory, HrUniformStatus } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { canSubmitUniformItem, getUniformErrorMessage, formatUniformCategory } from './hrUniformUi';

interface HrUniformItemModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  outletId: string;
  item?: HrUniformItem | null;
  onClose: () => void;
  onSuccess: (savedItem: HrUniformItem, mode: 'create' | 'edit') => void;
}

const STANDARD_CATEGORIES: HrUniformCategory[] = [
  'SHIRT',
  'TROUSER',
  'JACKET',
  'T_SHIRT',
  'CAP',
  'SHOES',
  'BELT',
  'OTHER',
];

export const HrUniformItemModal: React.FC<HrUniformItemModalProps> = ({
  isOpen,
  mode,
  outletId,
  item,
  onClose,
  onSuccess,
}) => {
  const [itemCode, setItemCode] = useState('');
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState<string>('SHIRT');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<HrUniformStatus>('ACTIVE');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && item) {
        setItemCode(item.itemCode);
        setItemName(item.itemName);
        setCategory(item.category);
        setDescription(item.description || '');
        setStatus(item.status);
      } else {
        setItemCode('');
        setItemName('');
        setCategory('SHIRT');
        setDescription('');
        setStatus('ACTIVE');
      }
      setFormError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, mode, item]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const validation = canSubmitUniformItem(
      { itemCode, itemName, category, status },
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
          itemCode: itemCode.trim().toUpperCase(),
          itemName: itemName.trim(),
          category: category.trim(),
          description: description.trim() ? description.trim() : null,
          status,
        };

        const res = await apiFetch<HrUniformItem>(
          `/api/v1/outlets/${outletId}/hr/uniform/items`,
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
        if (!item) throw new Error('Missing item to edit');

        // Never send itemCode during update
        const payload = {
          itemName: itemName.trim(),
          category: category.trim(),
          description: description.trim() ? description.trim() : null,
          status,
        };

        const res = await apiFetch<HrUniformItem>(
          `/api/v1/outlets/${outletId}/hr/uniform/items/${item.id}`,
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
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                {mode === 'create' ? 'Add Uniform Master Item' : 'Edit Uniform Master Item'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {mode === 'create'
                  ? 'Define a new uniform catalog item for this outlet'
                  : `Update metadata for item ${item?.itemCode || ''}`}
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

          {/* Item Code */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Item Code {mode === 'create' && <span className="text-orange-400">*</span>}
            </label>
            <input
              type="text"
              value={itemCode}
              onChange={e => setItemCode(e.target.value.toUpperCase())}
              disabled={mode === 'edit' || isSubmitting}
              placeholder="e.g. SHIRT-M-SUMMER"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60 disabled:bg-slate-950/60"
            />
            {mode === 'edit' && (
              <p className="text-[10px] text-slate-500 mt-1">Item Code is immutable once created.</p>
            )}
          </div>

          {/* Item Name */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Item Name <span className="text-orange-400">*</span>
            </label>
            <input
              type="text"
              value={itemName}
              onChange={e => setItemName(e.target.value)}
              disabled={isSubmitting}
              placeholder="e.g. Summer Staff Uniform Shirt"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Category <span className="text-orange-400">*</span>
            </label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60 cursor-pointer"
            >
              {STANDARD_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>
                  {formatUniformCategory(cat)}
                </option>
              ))}
              {item && !STANDARD_CATEGORIES.includes(item.category as any) && (
                <option value={item.category}>{item.category}</option>
              )}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Description <span className="text-slate-500 text-[10px] lowercase font-normal">(optional)</span>
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={isSubmitting}
              placeholder="Material, supplier info, specification details..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60 resize-none"
            />
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
              <span>{mode === 'create' ? 'Create Item' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
