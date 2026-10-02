import React, { useState } from 'react';
import { UtilitySubMeter, UtilitySubMeterReading } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { getUtilityErrorMessage, formatDisplayDateTime } from './utilityUi';
import { X, Gauge, Loader2, AlertCircle, Info, RefreshCw } from 'lucide-react';

interface SubMeterReadingModalProps {
  subMeter: UtilitySubMeter;
  latestReading: UtilitySubMeterReading | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onConflict: () => void;
}

export const SubMeterReadingModal: React.FC<SubMeterReadingModalProps> = ({
  subMeter,
  latestReading,
  isOpen,
  onClose,
  onSuccess,
  onConflict,
}) => {
  const [reading, setReading] = useState('');
  const [readingAtLocal, setReadingAtLocal] = useState(() => {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
  });
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsConflict(false);

    if (!reading.trim() || !/^\d+(\.\d{1,3})?$/.test(reading.trim())) {
      setErrorMsg('Please enter a valid meter reading value (up to 3 decimal places, e.g. 12543.728).');
      return;
    }
    if (!readingAtLocal) {
      setErrorMsg('Reading date and time is required.');
      return;
    }

    setSubmitting(true);
    try {
      const readingAtIso = new Date(readingAtLocal).toISOString();

      const payload = {
        reading: reading.trim(),
        readingAt: readingAtIso,
        notes: notes.trim() || null,
      };

      const res = await apiFetch<UtilitySubMeterReading>(
        `/api/v1/utilities/sub-meters/${subMeter.id}/readings`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      if (res.success) {
        onSuccess();
        onClose();
      } else {
        if (res.error?.code === 'SUB_METER_READING_STATE_CHANGED') {
          setIsConflict(true);
          setErrorMsg(
            'This sub-meter received another reading while you were viewing it. The latest readings have been reloaded.'
          );
          onConflict();
        } else {
          setErrorMsg(getUtilityErrorMessage(res.error));
        }
      }
    } catch (err: any) {
      setErrorMsg(getUtilityErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Record Meter Reading
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                {subMeter.meterCode} — {subMeter.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMsg && (
            <div
              className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                isConflict
                  ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
                  : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
              }`}
            >
              <AlertCircle
                className={`w-4 h-4 shrink-0 mt-0.5 ${isConflict ? 'text-amber-400' : 'text-rose-400'}`}
              />
              <div className="flex-1">{errorMsg}</div>
            </div>
          )}

          {/* Current Tariff & Previous Reading Guidance */}
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
            <div className="flex justify-between items-center text-slate-400">
              <span>Active Sub-Meter Tariff:</span>
              <span className="font-mono text-orange-400 font-bold">
                ₹{subMeter.ratePerKwhStr} / kWh
              </span>
            </div>

            {latestReading ? (
              <>
                <div className="flex justify-between items-center text-slate-400 pt-1.5 border-t border-slate-800/80">
                  <span>Previous Meter Reading:</span>
                  <span className="font-mono text-white font-semibold">
                    {latestReading.readingStr} kWh
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Previous Reading Date:</span>
                  <span className="font-mono text-slate-300">
                    {formatDisplayDateTime(latestReading.readingAt)}
                  </span>
                </div>
              </>
            ) : (
              <div className="pt-1.5 border-t border-slate-800/80 flex items-center gap-1.5 text-slate-400 text-[11px]">
                <Info className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                <span>
                  First Baseline Reading: Establishes initial meter counter (0 kWh consumption, ₹0 charge).
                </span>
              </div>
            )}
          </div>

          {/* New Reading Value */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              New Meter Reading (kWh) <span className="text-orange-400">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={reading}
                onChange={e => setReading(e.target.value)}
                disabled={submitting}
                placeholder={latestReading ? `e.g. ${latestReading.readingStr}` : 'e.g. 1000.000'}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white font-mono placeholder-slate-600 focus:outline-none focus:border-orange-500/60 transition-all"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono font-medium">
                kWh
              </span>
            </div>
            {latestReading && (
              <p className="text-[11px] text-slate-500">
                Must be greater than or equal to {latestReading.readingStr} kWh.
              </p>
            )}
          </div>

          {/* Reading Timestamp */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Reading Timestamp <span className="text-orange-400">*</span>
            </label>
            <input
              type="datetime-local"
              value={readingAtLocal}
              onChange={e => setReadingAtLocal(e.target.value)}
              disabled={submitting}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-orange-500/60 transition-all font-mono"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Reading Notes / Observation
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={submitting}
              rows={2}
              placeholder="e.g. Monthly shift end reading, verified physical seal intact..."
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/60 transition-all resize-none"
            />
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-xl text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-orange-500/20"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Recording...
                </>
              ) : (
                'Save Reading'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
