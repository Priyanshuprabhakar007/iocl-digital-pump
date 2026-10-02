import React, { useState, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  Layers,
  Wrench,
  Fuel,
  Calendar,
  FileText,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  EquipmentTarget,
  EquipmentTicketPriority,
  EquipmentFailureCategory,
  EquipmentBreakdownTicket,
} from '../../../shared/types';
import { apiFetch } from '../../services/api';
import {
  formatEquipmentType,
  formatFailureCategory,
  formatPriority,
  isTargetEligibleForTicket,
  getEquipmentErrorMessage,
} from './equipmentUi';

interface EquipmentTicketCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  outletId: string;
  targets: EquipmentTarget[];
  onTicketCreated: (ticket?: EquipmentBreakdownTicket) => void;
}

export const EquipmentTicketCreateModal: React.FC<EquipmentTicketCreateModalProps> = ({
  isOpen,
  onClose,
  outletId,
  targets,
  onTicketCreated,
}) => {
  const [selectedTargetKey, setSelectedTargetKey] = useState<string>('');
  const [priority, setPriority] = useState<EquipmentTicketPriority>('HIGH');
  const [failureCategory, setFailureCategory] = useState<EquipmentFailureCategory>('MECHANICAL');
  const [description, setDescription] = useState('');
  const [breakdownAtLocal, setBreakdownAtLocal] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Set default datetime to current local time when opening
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      // Format to YYYY-MM-DDTHH:mm
      const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setBreakdownAtLocal(localIso);
      setError(null);
      setDescription('');
      setSelectedTargetKey('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filter eligible targets (ACTIVE and MAINTENANCE only)
  const eligibleTargets = targets.filter(t => isTargetEligibleForTicket(t.status));
  const dispenserTargets = eligibleTargets.filter(t => t.targetType === 'DISPENSER');
  const assetTargets = eligibleTargets.filter(t => t.targetType === 'ASSET');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedTargetKey) {
      setError('Please select a target equipment or dispenser.');
      return;
    }

    if (!description.trim()) {
      setError('Fault description is required.');
      return;
    }

    if (!breakdownAtLocal) {
      setError('Breakdown occurrence timestamp is required.');
      return;
    }

    const dateObj = new Date(breakdownAtLocal);
    if (isNaN(dateObj.getTime())) {
      setError('Invalid breakdown timestamp.');
      return;
    }
    const breakdownAtIso = dateObj.toISOString();

    const [targetType, targetId] = selectedTargetKey.split('::');

    const payload: any = {
      priority,
      failureCategory,
      description: description.trim(),
      breakdownAt: breakdownAtIso,
    };

    if (targetType === 'DISPENSER') {
      payload.dispenserId = targetId;
    } else if (targetType === 'ASSET') {
      payload.equipmentAssetId = targetId;
    } else {
      setError('Invalid target selection.');
      return;
    }

    try {
      setLoading(true);
      const res = await apiFetch<EquipmentBreakdownTicket>(
        `/api/v1/outlets/${outletId}/equipment/tickets`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      if (res.success) {
        onTicketCreated(res.data || undefined);
        onClose();
      } else {
        setError(getEquipmentErrorMessage(res.error?.code || res.error?.message));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create breakdown ticket.');
    } finally {
      setLoading(false);
    }
  };

  const priorityOptions: EquipmentTicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

  const failureCategories: EquipmentFailureCategory[] = [
    'MECHANICAL',
    'ELECTRICAL',
    'ELECTRONICS',
    'COMMUNICATION',
    'CALIBRATION',
    'PRESSURE',
    'LEAKAGE',
    'POWER',
    'SOFTWARE',
    'OTHER',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-slate-200 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">
                Report Equipment Breakdown
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Log a new breakdown ticket for a dispenser or auxiliary asset
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
          {/* Target Equipment Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
              Select Target Equipment / Dispenser <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <select
                required
                value={selectedTargetKey}
                onChange={e => setSelectedTargetKey(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-sm text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
              >
                <option value="">— Select Target Equipment —</option>

                {dispenserTargets.length > 0 && (
                  <optgroup label="Fuel Dispensers">
                    {dispenserTargets.map(t => (
                      <option key={`DISPENSER::${t.targetId}`} value={`DISPENSER::${t.targetId}`}>
                        {t.label} ({t.status})
                      </option>
                    ))}
                  </optgroup>
                )}

                {assetTargets.length > 0 && (
                  <optgroup label="Auxiliary Equipment Assets">
                    {assetTargets.map(t => (
                      <option key={`ASSET::${t.targetId}`} value={`ASSET::${t.targetId}`}>
                        {t.label} — {formatEquipmentType(t.equipmentType)} ({t.status})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            {eligibleTargets.length === 0 && (
              <p className="text-[11px] text-amber-400 mt-1">
                No active or maintenance equipment targets found at this outlet.
              </p>
            )}
          </div>

          {/* Priority & Failure Category in 2 columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
                Priority Level <span className="text-rose-400">*</span>
              </label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as EquipmentTicketPriority)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-sm text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors font-mono"
              >
                {priorityOptions.map(p => (
                  <option key={p} value={p}>
                    {formatPriority(p)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
                Failure Category <span className="text-rose-400">*</span>
              </label>
              <select
                value={failureCategory}
                onChange={e => setFailureCategory(e.target.value as EquipmentFailureCategory)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-sm text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors font-mono"
              >
                {failureCategories.map(cat => (
                  <option key={cat} value={cat}>
                    {formatFailureCategory(cat)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Breakdown Timestamp */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
              Breakdown Occurred At <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="datetime-local"
                required
                value={breakdownAtLocal}
                onChange={e => setBreakdownAtLocal(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors font-mono"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
              Fault Description & Symptoms <span className="text-rose-400">*</span>
            </label>
            <textarea
              required
              rows={3}
              placeholder="Describe observable symptoms, error codes, noise, nozzle failure, flow meter error, pressure drops..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors resize-none"
            />
          </div>

          {/* Footer Buttons */}
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
              disabled={loading || eligibleTargets.length === 0}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 shadow-lg shadow-orange-500/20 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Report Breakdown</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
