import React, { useState, useEffect } from 'react';
import { HrManpowerSanction, HrDesignation } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { canSubmitHrManpowerSanction, getHrErrorMessage, getLocalDateInputValue } from './hrUi';
import { X, Layers, Edit, AlertCircle, Loader2 } from 'lucide-react';

export interface HrManpowerSanctionModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  outletId: string;
  sanction: HrManpowerSanction | null;
  designations: HrDesignation[];
  existingSanctions: HrManpowerSanction[];
  initialDesignationId?: string | null;
  onClose: () => void;
  onSuccess: (saved: HrManpowerSanction) => void;
}

export const HrManpowerSanctionModal: React.FC<HrManpowerSanctionModalProps> = ({
  isOpen,
  mode,
  outletId,
  sanction,
  designations,
  existingSanctions,
  initialDesignationId,
  onClose,
  onSuccess,
}) => {
  const isEdit = mode === 'edit' && !!sanction;

  const [designationId, setDesignationId] = useState('');
  const [sanctionedCount, setSanctionedCount] = useState<number | string>('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [notes, setNotes] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      if (isEdit && sanction) {
        setDesignationId(sanction.designationId || '');
        setSanctionedCount(sanction.sanctionedCount ?? '');
        setEffectiveFrom(sanction.effectiveFrom ? sanction.effectiveFrom.slice(0, 10) : '');
        setNotes(sanction.notes || '');
      } else {
        setDesignationId(initialDesignationId || '');
        setSanctionedCount('');
        setEffectiveFrom(getLocalDateInputValue());
        setNotes('');
      }
    }
  }, [isOpen, isEdit, sanction, initialDesignationId]);

  if (!isOpen) return null;

  // Filter available designations for CREATE (exclude already sanctioned; include active & inactive unsanctioned)
  const existingSanctionedIds = new Set(existingSanctions.map(s => s.designationId));
  const availableDesignations = designations.filter(d => {
    if (isEdit) return d.id === sanction?.designationId;
    return !existingSanctionedIds.has(d.id);
  });

  const canSubmit = canSubmitHrManpowerSanction(
    { designationId, sanctionedCount, effectiveFrom },
    isEdit
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError(null);

    const countNumber = parseInt(String(sanctionedCount), 10);

    try {
      if (isEdit && sanction) {
        // PUT /api/v1/hr/manpower-sanctions/:id
        const payload = {
          sanctionedCount: countNumber,
          effectiveFrom,
          notes: notes.trim() ? notes.trim() : null,
        };

        const res = await apiFetch<HrManpowerSanction>(
          `/api/v1/hr/manpower-sanctions/${sanction.id}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload),
          }
        );

        if (res.success && res.data) {
          onSuccess(res.data);
          onClose();
        } else {
          setError(getHrErrorMessage(res.error));
        }
      } else {
        // POST /api/v1/outlets/:outletId/hr/manpower-sanctions
        const payload = {
          designationId,
          sanctionedCount: countNumber,
          effectiveFrom,
          notes: notes.trim() ? notes.trim() : null,
        };

        const res = await apiFetch<HrManpowerSanction>(
          `/api/v1/outlets/${outletId}/hr/manpower-sanctions`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );

        if (res.success && res.data) {
          onSuccess(res.data);
          onClose();
        } else {
          setError(getHrErrorMessage(res.error));
        }
      }
    } catch (err: any) {
      setError(getHrErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const selectedDesignation = designations.find(d => d.id === (isEdit ? sanction?.designationId : designationId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400">
              {isEdit ? <Edit className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isEdit ? 'Update Manpower Sanction' : 'Set Manpower Sanction'}
              </h3>
              <p className="text-xs text-slate-400">
                {isEdit
                  ? `Adjust sanctioned strength for ${selectedDesignation?.name || sanction?.designationName || 'role'}`
                  : 'Define authorized headcount target for a job designation'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-xs text-rose-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Designation */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Designation Role <span className="text-rose-400">*</span>
            </label>
            {isEdit ? (
              <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700 text-xs font-semibold text-slate-200">
                {selectedDesignation?.name || sanction?.designationName || '—'}
                <span className="text-slate-400 font-mono ml-2">
                  ({selectedDesignation?.code || sanction?.designationCode || '—'})
                </span>
              </div>
            ) : (
              <select
                value={designationId}
                onChange={e => setDesignationId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
                required
              >
                <option value="">-- Select Designation --</option>
                {availableDesignations.map(d => {
                  const hasExisting = existingSanctions.some(s => s.designationId === d.id);
                  return (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code}) {hasExisting ? '• [Already Sanctioned]' : ''}{' '}
                      {d.status === 'INACTIVE' ? '[Inactive Role]' : ''}
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Sanctioned Count */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Sanctioned Headcount <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                min={0}
                max={10000}
                step={1}
                value={sanctionedCount}
                onChange={e => setSanctionedCount(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 font-mono"
                required
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Approved posts (integer 0–10,000).
              </p>
            </div>

            {/* Effective From */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Effective From <span className="text-rose-400">*</span>
              </label>
              <input
                type="date"
                value={effectiveFrom}
                onChange={e => setEffectiveFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
                required
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Sanction Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Approved under Regional Office headcount circular 2026/Q3."
              className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isEdit ? 'Update Sanction' : 'Save Sanction'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
