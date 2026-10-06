import React, { useState } from 'react';
import { X, Fuel, AlertCircle, ShieldCheck } from 'lucide-react';
import { HrRosterAssignment, Nozzle } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { getHrErrorMessage } from './hrUi';

interface HrNozzleAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  outletId: string;
  scheduledRosters: HrRosterAssignment[];
  nozzles: Nozzle[];
  onSuccess: () => void;
  showFeedback: (type: 'success' | 'error', message: string) => void;
}

export const HrNozzleAssignmentModal: React.FC<HrNozzleAssignmentModalProps> = ({
  isOpen,
  onClose,
  outletId,
  scheduledRosters,
  nozzles,
  onSuccess,
  showFeedback,
}) => {
  const [selectedRosterId, setSelectedRosterId] = useState<string>('');
  const [selectedNozzleId, setSelectedNozzleId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const activeNozzles = nozzles.filter((n) => n.status === 'ACTIVE');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedRosterId) {
      setError('Please select a scheduled roster assignment.');
      return;
    }
    if (!selectedNozzleId) {
      setError('Please select an active nozzle.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetch(`/api/v1/outlets/${outletId}/hr/nozzle-assignments`, {
        method: 'POST',
        body: JSON.stringify({
          rosterAssignmentId: selectedRosterId,
          nozzleId: selectedNozzleId,
          notes: notes.trim() || undefined,
        }),
      });

      if (res.success) {
        showFeedback('success', 'Nozzle assignment created successfully.');
        onSuccess();
        onClose();
      } else {
        setError(getHrErrorMessage(res.error));
      }
    } catch (err: any) {
      setError(getHrErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-500/15 text-orange-400">
              <Fuel className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Create Nozzle Assignment</h3>
              <p className="text-xs text-slate-400 font-mono">Assign scheduled staff member to an operational nozzle</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Select Scheduled Roster Assignment *
            </label>
            {scheduledRosters.length === 0 ? (
              <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700 text-xs text-amber-400">
                No SCHEDULED roster assignments available.
              </div>
            ) : (
              <select
                required
                value={selectedRosterId}
                onChange={(e) => setSelectedRosterId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-orange-500"
              >
                <option value="">-- Select Staff Roster --</option>
                {scheduledRosters.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.staffName || r.staffId} • {r.rosterDate} • {r.shiftTemplateName || 'Shift'}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Select Active Nozzle *
            </label>
            {activeNozzles.length === 0 ? (
              <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700 text-xs text-amber-400">
                No active nozzles found for this outlet.
              </div>
            ) : (
              <select
                required
                value={selectedNozzleId}
                onChange={(e) => setSelectedNozzleId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-orange-500 font-mono"
              >
                <option value="">-- Select Operational Nozzle --</option>
                {activeNozzles.map((n) => (
                  <option key={n.id} value={n.id}>
                    Dispenser {n.dispenserNumber || '—'} • Nozzle {n.nozzleNumber} • {n.productCode || n.productId}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any assignment notes..."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-orange-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || scheduledRosters.length === 0 || activeNozzles.length === 0}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold shadow-lg shadow-orange-500/20 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'Assigning...' : 'Assign Nozzle'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
