import React, { useState } from 'react';
import {
  X,
  UserCheck,
  UserCog,
  CheckCircle2,
  ShieldCheck,
  XCircle,
  AlertCircle,
  Loader2,
  Phone,
  User,
  FileText,
  Calendar,
} from 'lucide-react';
import { EquipmentBreakdownTicket } from '../../../shared/types';
import { getEquipmentErrorMessage } from './equipmentUi';

export type TicketActionType = 'assign' | 'reassign' | 'resolve' | 'signoff' | 'cancel';

interface EquipmentTicketActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: EquipmentBreakdownTicket;
  actionType: TicketActionType;
  onSubmit: (payload: any) => Promise<void>;
}

export const EquipmentTicketActionModal: React.FC<EquipmentTicketActionModalProps> = ({
  isOpen,
  onClose,
  ticket,
  actionType,
  onSubmit,
}) => {
  // Form fields
  const [technicianName, setTechnicianName] = useState(ticket.technicianName || '');
  const [technicianPhone, setTechnicianPhone] = useState(ticket.technicianPhone || '');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolvedAtLocal, setResolvedAtLocal] = useState('');
  const [signoffNotes, setSignoffNotes] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let payload: any = {};

    if (actionType === 'assign' || actionType === 'reassign') {
      if (!technicianName.trim()) {
        setError('Technician name is required.');
        return;
      }
      payload = {
        technicianName: technicianName.trim(),
        technicianPhone: technicianPhone.trim() ? technicianPhone.trim() : null,
      };
    } else if (actionType === 'resolve') {
      if (!resolutionNotes.trim()) {
        setError('Resolution notes are required.');
        return;
      }
      let resolvedAtIso: string | undefined;
      if (resolvedAtLocal) {
        const dateObj = new Date(resolvedAtLocal);
        if (isNaN(dateObj.getTime())) {
          setError('Invalid resolution timestamp.');
          return;
        }
        resolvedAtIso = dateObj.toISOString();
      }
      payload = {
        resolutionNotes: resolutionNotes.trim(),
        ...(resolvedAtIso ? { resolvedAt: resolvedAtIso } : {}),
      };
    } else if (actionType === 'signoff') {
      payload = {
        signoffNotes: signoffNotes.trim() ? signoffNotes.trim() : null,
      };
    } else if (actionType === 'cancel') {
      if (!cancelReason.trim()) {
        setError('A cancellation reason is required.');
        return;
      }
      if (!confirmCancel) {
        setError('Please confirm the cancellation checkbox.');
        return;
      }
      payload = {
        reason: cancelReason.trim(),
      };
    }

    try {
      setLoading(true);
      await onSubmit(payload);
      onClose();
    } catch (err: any) {
      setError(getEquipmentErrorMessage(err.message));
    } finally {
      setLoading(false);
    }
  };

  const getModalConfig = () => {
    switch (actionType) {
      case 'assign':
        return {
          title: 'Assign Technician',
          subtitle: `Assign maintenance technician to ticket for ${ticket.equipmentLabelSnapshot}`,
          icon: <UserCheck className="w-5 h-5 text-indigo-400" />,
          submitText: 'Assign Technician',
          submitBtnClass: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30',
        };
      case 'reassign':
        return {
          title: 'Reassign Technician',
          subtitle: `Update maintenance technician for ${ticket.equipmentLabelSnapshot}`,
          icon: <UserCog className="w-5 h-5 text-amber-400" />,
          submitText: 'Save Reassignment',
          submitBtnClass: 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30',
        };
      case 'resolve':
        return {
          title: 'Resolve Breakdown',
          subtitle: `Record resolution and downtime notes for ${ticket.equipmentLabelSnapshot}`,
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
          submitText: 'Mark Resolved & Calculate Downtime',
          submitBtnClass: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30',
        };
      case 'signoff':
        return {
          title: 'Officer Sign-Off & Close',
          subtitle: `Finalize and close breakdown ticket for ${ticket.equipmentLabelSnapshot}`,
          icon: <ShieldCheck className="w-5 h-5 text-emerald-300" />,
          submitText: 'Sign Off & Close Ticket',
          submitBtnClass: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30',
        };
      case 'cancel':
        return {
          title: 'Cancel Breakdown Ticket',
          subtitle: `Cancel breakdown reporting for ${ticket.equipmentLabelSnapshot}`,
          icon: <XCircle className="w-5 h-5 text-rose-400" />,
          submitText: 'Confirm Cancellation',
          submitBtnClass: 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30',
        };
    }
  };

  const config = getModalConfig();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-slate-200 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700">
              {config.icon}
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">
                {config.title}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {config.subtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">{error}</div>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Assign / Reassign Fields */}
          {(actionType === 'assign' || actionType === 'reassign') && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
                  Technician Name <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Kumar (OEM Vendor)"
                    value={technicianName}
                    onChange={e => setTechnicianName(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
                  Technician Contact Phone <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    placeholder="e.g. +91 98765 43210"
                    value={technicianPhone}
                    onChange={e => setTechnicianPhone(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
                  />
                </div>
              </div>
            </>
          )}

          {/* Resolve Fields */}
          {actionType === 'resolve' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
                  Resolution Notes <span className="text-rose-400">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe repair actions performed, replaced parts, test verification details..."
                  value={resolutionNotes}
                  onChange={e => setResolutionNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
                  Resolved At <span className="text-slate-400 font-normal">(Optional — Defaults to Current Time)</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="datetime-local"
                    value={resolvedAtLocal}
                    onChange={e => setResolvedAtLocal(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors font-mono"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Downtime duration is automatically calculated by the system based on the breakdown timestamp.
                </p>
              </div>
            </>
          )}

          {/* Signoff Fields */}
          {actionType === 'signoff' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
                Officer Sign-off Notes <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <textarea
                rows={3}
                placeholder="Inspection remarks, operational readiness verification, compliance comments..."
                value={signoffNotes}
                onChange={e => setSignoffNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors resize-none"
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                Signing off will transition the ticket to <span className="text-emerald-400 font-semibold font-mono">CLOSED</span> terminal status.
              </p>
            </div>
          )}

          {/* Cancel Fields */}
          {actionType === 'cancel' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
                  Cancellation Reason <span className="text-rose-400">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Explain why this breakdown report is being cancelled (e.g. duplicate ticket, false alarm, operator error)..."
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-colors resize-none"
                />
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-950/30 border border-rose-900/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmCancel}
                  onChange={e => setConfirmCancel(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 text-rose-600 focus:ring-rose-500 bg-slate-950"
                />
                <span className="text-xs text-rose-200">
                  I confirm that this breakdown report should be permanently cancelled and moved to terminal CANCELLED status.
                </span>
              </label>
            </>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-4 py-2 rounded-xl text-xs font-semibold shadow-lg transition-all flex items-center gap-2 ${config.submitBtnClass} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{config.submitText}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
