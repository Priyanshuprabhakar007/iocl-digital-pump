import React, { useState, useEffect } from 'react';
import {
  HrRosterAssignment,
  HrStaff,
  ShiftTemplate,
  HrRosterStatus,
} from '../../../shared/types';
import { apiFetch } from '../../services/api';
import {
  canSubmitHrRoster,
  getHrErrorMessage,
  getEligibleRosterStaff,
  getEligibleRosterShiftTemplates,
} from './hrUi';
import {
  X,
  Calendar,
  Edit,
  AlertCircle,
  Loader2,
  Clock,
  AlertTriangle,
} from 'lucide-react';

export interface HrRosterModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  outletId: string;
  roster: HrRosterAssignment | null;
  staffList: HrStaff[];
  shiftTemplates: ShiftTemplate[];
  canReadShiftTemplates: boolean;
  existingRosterList?: HrRosterAssignment[];
  onClose: () => void;
  onSuccess: (saved: HrRosterAssignment) => void;
}

export const HrRosterModal: React.FC<HrRosterModalProps> = ({
  isOpen,
  mode,
  outletId,
  roster,
  staffList,
  shiftTemplates,
  canReadShiftTemplates,
  existingRosterList = [],
  onClose,
  onSuccess,
}) => {
  const isEdit = mode === 'edit' && !!roster;

  const [staffId, setStaffId] = useState('');
  const [rosterDate, setRosterDate] = useState('');
  const [shiftTemplateId, setShiftTemplateId] = useState('');
  const [status, setStatus] = useState<HrRosterStatus>('SCHEDULED');
  const [notes, setNotes] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      if (isEdit && roster) {
        setStaffId(roster.staffId || '');
        setRosterDate(roster.rosterDate ? roster.rosterDate.slice(0, 10) : '');
        setShiftTemplateId(roster.shiftTemplateId || '');
        setStatus(roster.status || 'SCHEDULED');
        setNotes(roster.notes || '');
      } else {
        setStaffId('');
        setRosterDate(new Date().toISOString().slice(0, 10));
        setShiftTemplateId('');
        setStatus('SCHEDULED');
        setNotes('');
      }
    }
  }, [isOpen, isEdit, roster]);

  if (!isOpen) return null;

  const eligibleStaff = getEligibleRosterStaff(
    staffList,
    isEdit && roster ? roster.staffId : null,
    outletId
  );

  const eligibleShiftTemplates = getEligibleRosterShiftTemplates(
    shiftTemplates,
    isEdit && roster ? roster.shiftTemplateId : null,
    outletId
  );

  // Early client collision warning
  const hasPotentialConflict =
    staffId &&
    rosterDate &&
    existingRosterList.some(
      r => r.staffId === staffId && r.rosterDate.slice(0, 10) === rosterDate && (!isEdit || r.id !== roster?.id)
    );

  const canSubmit =
    canReadShiftTemplates &&
    canSubmitHrRoster(
      { staffId, rosterDate, shiftTemplateId, status },
      isEdit
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      if (isEdit && roster) {
        // PUT /api/v1/hr/roster/:id
        const payload: any = {
          staffId,
          rosterDate,
          shiftTemplateId,
          status,
          notes: notes.trim() ? notes.trim() : null,
        };

        const res = await apiFetch<HrRosterAssignment>(`/api/v1/hr/roster/${roster.id}`, {
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
        // POST /api/v1/outlets/:outletId/hr/roster
        const payload: any = {
          staffId,
          rosterDate,
          shiftTemplateId,
          notes: notes.trim() ? notes.trim() : null,
        };

        const res = await apiFetch<HrRosterAssignment>(
          `/api/v1/outlets/${outletId}/hr/roster`,
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
              {isEdit ? <Edit className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isEdit ? 'Edit Shift Assignment' : 'Assign Shift'}
              </h3>
              <p className="text-xs text-slate-400">
                {isEdit
                  ? `Update roster schedule for ${roster?.staffName || 'employee'}`
                  : 'Schedule employee for an operational pump shift'}
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

        {/* Warning if no shift-template access */}
        {!canReadShiftTemplates && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-xs text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Shift template access is required to assign or change roster shifts.</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-xs text-rose-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Staff Member */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Staff Member <span className="text-rose-400">*</span>
            </label>
            <select
              value={staffId}
              onChange={e => setStaffId(e.target.value)}
              disabled={!canReadShiftTemplates}
              className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 disabled:opacity-50"
              required
            >
              <option value="">-- Select Staff Member --</option>
              {eligibleStaff.map(s => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.employeeCode}) • {s.designationName || 'Staff'}{' '}
                  {s.employmentStatus !== 'ACTIVE' ? `[${s.employmentStatus}]` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Roster Date */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Roster Date <span className="text-rose-400">*</span>
              </label>
              <input
                type="date"
                value={rosterDate}
                onChange={e => setRosterDate(e.target.value)}
                disabled={!canReadShiftTemplates}
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 disabled:opacity-50 font-mono"
                required
              />
            </div>

            {/* Shift Template */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Shift Template <span className="text-rose-400">*</span>
              </label>
              <select
                value={shiftTemplateId}
                onChange={e => setShiftTemplateId(e.target.value)}
                disabled={!canReadShiftTemplates}
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 disabled:opacity-50"
                required
              >
                <option value="">-- Select Shift --</option>
                {eligibleShiftTemplates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code}) • {t.startTime}–{t.endTime}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Potential collision warning */}
          {hasPotentialConflict && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>A shift is already scheduled for this staff member on this date.</span>
            </div>
          )}

          {/* Status (Edit only) */}
          {isEdit && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Assignment Status <span className="text-rose-400">*</span>
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as HrRosterStatus)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
                required
              >
                <option value="SCHEDULED">Scheduled</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
              <p className="text-[10px] text-slate-400 mt-1">
                Cancelled indicates revoked shift assignment (not attendance mark).
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Roster Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Assigned to Island 1 & 2 fuel dispensers."
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
              <span>{isEdit ? 'Update Assignment' : 'Assign Shift'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
