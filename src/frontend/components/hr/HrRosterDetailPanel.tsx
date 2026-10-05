import React, { useState, useEffect } from 'react';
import { HrRosterAssignment } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import {
  formatDisplayDate,
  formatDisplayDateTime,
  formatHrRosterStatus,
  getHrErrorMessage,
  getInitials,
} from './hrUi';
import {
  X,
  Edit,
  Calendar,
  Clock,
  User,
  Tag,
  AlertCircle,
  StickyNote,
  AlertTriangle,
} from 'lucide-react';

export interface HrRosterDetailPanelProps {
  rosterId: string;
  outletId: string;
  refreshKey: number;
  onClose: () => void;
  onEdit?: (roster: HrRosterAssignment) => void;
  onCancelAssignment?: (roster: HrRosterAssignment) => void;
  canEditRoster: boolean;
}

export const HrRosterDetailPanel: React.FC<HrRosterDetailPanelProps> = ({
  rosterId,
  outletId,
  refreshKey,
  onClose,
  onEdit,
  onCancelAssignment,
  canEditRoster,
}) => {
  const [roster, setRoster] = useState<HrRosterAssignment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    const fetchDetail = async () => {
      try {
        const res = await apiFetch<HrRosterAssignment>(`/api/v1/hr/roster/${rosterId}`);
        if (isCancelled) return;

        if (res.success && res.data) {
          if (res.data.outletId !== outletId) {
            setError('Roster assignment belongs to a different outlet.');
            setRoster(null);
          } else {
            setRoster(res.data);
          }
        } else {
          setError(getHrErrorMessage(res.error));
          setRoster(null);
        }
      } catch (err: any) {
        if (!isCancelled) {
          setError(getHrErrorMessage(err));
          setRoster(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchDetail();

    return () => {
      isCancelled = true;
    };
  }, [rosterId, outletId, refreshKey]);

  if (isLoading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 animate-pulse">
            <div className="w-10 h-10 rounded-xl bg-slate-800"></div>
            <div className="space-y-1.5">
              <div className="h-4 bg-slate-800 rounded w-28"></div>
              <div className="h-3 bg-slate-800 rounded w-16"></div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="h-36 bg-slate-800/40 rounded-xl animate-pulse"></div>
      </div>
    );
  }

  if (error || !roster) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Roster Details</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error || 'Unable to load roster assignment details.'}</span>
        </div>
      </div>
    );
  }

  const statusDisplay = formatHrRosterStatus(roster.status);
  const isScheduled = roster.status === 'SCHEDULED';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-800 flex items-start justify-between bg-slate-900/60">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-extrabold text-base shadow-lg shadow-orange-500/20 shrink-0">
            {getInitials(roster.staffName)}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-white">
                {roster.staffName || 'Staff Member'}
              </h3>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusDisplay.badgeClass}`}
              >
                {statusDisplay.label}
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5 font-mono">
              {roster.employeeCode || '—'} • {roster.designationName || '—'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {canEditRoster && onEdit && (
            <button
              onClick={() => onEdit(roster)}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1 text-xs font-semibold px-2.5"
            >
              <Edit className="w-3.5 h-3.5 text-orange-400" />
              <span>Edit</span>
            </button>
          )}
          {canEditRoster && isScheduled && onCancelAssignment && (
            <button
              onClick={() => onCancelAssignment(roster)}
              className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition flex items-center gap-1 text-xs font-semibold px-2.5"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Body Details */}
      <div className="p-5 space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Roster Date */}
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold">
              <Calendar className="w-3.5 h-3.5 text-sky-400" />
              <span>Roster Date</span>
            </div>
            <div className="text-xs font-bold text-slate-200">
              {formatDisplayDate(roster.rosterDate)}
            </div>
          </div>

          {/* Shift */}
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold">
              <Clock className="w-3.5 h-3.5 text-orange-400" />
              <span>Shift Timing</span>
            </div>
            <div className="text-xs font-bold text-slate-200">
              {roster.shiftTemplateName || roster.shiftTemplateCode || 'Shift'}
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              {roster.shiftStartTime && roster.shiftEndTime
                ? `${roster.shiftStartTime} – ${roster.shiftEndTime}`
                : 'Standard Timings'}
            </div>
          </div>
        </div>

        {/* Notes */}
        {roster.notes && (
          <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 space-y-1.5">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold">
              <StickyNote className="w-3.5 h-3.5 text-amber-400" />
              <span>Shift Notes</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
              {roster.notes}
            </p>
          </div>
        )}

        {/* Audit Meta */}
        <div className="pt-2 text-[10px] text-slate-500 flex items-center justify-between">
          <span>Scheduled: {formatDisplayDateTime(roster.createdAt)}</span>
          <span>Last Modified: {formatDisplayDateTime(roster.updatedAt)}</span>
        </div>
      </div>
    </div>
  );
};
