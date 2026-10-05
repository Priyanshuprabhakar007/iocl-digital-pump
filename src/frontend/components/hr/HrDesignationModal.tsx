import React, { useState, useEffect } from 'react';
import { HrDesignation, HrDesignationStatus } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { canSubmitHrDesignation, getHrErrorMessage } from './hrUi';
import { X, Tag, Edit, AlertCircle, Loader2 } from 'lucide-react';

export interface HrDesignationModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  outletId: string;
  designation: HrDesignation | null;
  onClose: () => void;
  onSuccess: (saved: HrDesignation) => void;
}

export const HrDesignationModal: React.FC<HrDesignationModalProps> = ({
  isOpen,
  mode,
  outletId,
  designation,
  onClose,
  onSuccess,
}) => {
  const isEdit = mode === 'edit' && !!designation;

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<HrDesignationStatus>('ACTIVE');
  const [notes, setNotes] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      if (isEdit && designation) {
        setCode(designation.code || '');
        setName(designation.name || '');
        setStatus(designation.status || 'ACTIVE');
        setNotes(designation.notes || '');
      } else {
        setCode('');
        setName('');
        setStatus('ACTIVE');
        setNotes('');
      }
    }
  }, [isOpen, isEdit, designation]);

  if (!isOpen) return null;

  const canSubmit = canSubmitHrDesignation({ code, name, status }, isEdit);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      if (isEdit && designation) {
        // PUT /api/v1/hr/designations/:id
        const payload = {
          name: name.trim(),
          status,
          notes: notes.trim() ? notes.trim() : null,
        };

        const res = await apiFetch<HrDesignation>(`/api/v1/hr/designations/${designation.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });

        if (res.success && res.data) {
          onSuccess(res.data);
          onClose();
        } else {
          setError(getHrErrorMessage(res.error));
        }
      } else {
        // POST /api/v1/outlets/:outletId/hr/designations
        const payload = {
          code: code.trim().toUpperCase(),
          name: name.trim(),
          status,
          notes: notes.trim() ? notes.trim() : null,
        };

        const res = await apiFetch<HrDesignation>(
          `/api/v1/outlets/${outletId}/hr/designations`,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400">
              {isEdit ? <Edit className="w-5 h-5" /> : <Tag className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isEdit ? 'Edit Designation' : 'Create Designation'}
              </h3>
              <p className="text-xs text-slate-400">
                {isEdit
                  ? `Update designation ${designation?.name} (${designation?.code})`
                  : 'Define new job role designation for outlet workforce'}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Designation Code */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Designation Code <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                disabled={isEdit}
                placeholder="e.g. DSM"
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 disabled:opacity-50 font-mono"
                required
              />
              {isEdit && (
                <p className="text-[10px] text-slate-500 mt-1">
                  Code is immutable after creation.
                </p>
              )}
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Status <span className="text-rose-400">*</span>
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as HrDesignationStatus)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
                required
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          </div>

          {/* Designation Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Designation Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Driveway Sales Master / Pump Attendant"
              className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
              required
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Description / Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Frontline fuel dispenser operations and customer service."
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
              <span>{isEdit ? 'Update Designation' : 'Create Designation'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
