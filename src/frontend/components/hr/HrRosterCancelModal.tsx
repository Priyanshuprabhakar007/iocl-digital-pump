import React, { useState } from 'react';
import { HrRosterAssignment } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { getHrErrorMessage, formatDisplayDate } from './hrUi';
import { X, AlertTriangle, Loader2 } from 'lucide-react';

export interface HrRosterCancelModalProps {
  isOpen: boolean;
  roster: HrRosterAssignment | null;
  onClose: () => void;
  onSuccess: (updated: HrRosterAssignment) => void;
}

export const HrRosterCancelModal: React.FC<HrRosterCancelModalProps> = ({
  isOpen,
  roster,
  onClose,
  onSuccess,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !roster) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);

    try {
      // PUT /api/v1/hr/roster/:id
      const res = await apiFetch<HrRosterAssignment>(`/api/v1/hr/roster/${roster.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'CANCELLED' }),
      });

      if (res.success && res.data) {
        onSuccess(res.data);
        onClose();
      } else {
        setError(getHrErrorMessage(res.error));
      }
    } catch (err: any) {
      setError(getHrErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Cancel Shift Assignment</h3>
              <p className="text-xs text-slate-400">
                Cancel planned roster assignment
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
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="p-6 space-y-4 text-xs text-slate-300">
          <p>
            Are you sure you want to cancel the scheduled roster assignment for{' '}
            <strong className="text-white">{roster.staffName || roster.employeeCode}</strong> on{' '}
            <strong className="text-white">{formatDisplayDate(roster.rosterDate)}</strong>?
          </p>

          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Shift:</span>
              <span className="text-white font-semibold">
                {roster.shiftTemplateName || roster.shiftTemplateCode}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Shift Timings:</span>
              <span className="font-mono text-slate-200">
                {roster.shiftStartTime} – {roster.shiftEndTime}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            Cancelling indicates this planned shift assignment is revoked. This record will remain in historical roster audit.
          </p>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              Keep Scheduled
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-lg shadow-rose-600/20 disabled:opacity-50 transition flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Cancel Assignment</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
