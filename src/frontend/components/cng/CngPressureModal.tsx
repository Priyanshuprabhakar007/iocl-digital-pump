import React, { useState, useEffect } from 'react';
import { CngPressureReading } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { X, Gauge, AlertTriangle, Save } from 'lucide-react';

interface CngPressureModalProps {
  isOpen: boolean;
  shiftId: string;
  initialData: CngPressureReading | null;
  onClose: () => void;
  onSaved: (reading: CngPressureReading) => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

function toLocalDatetimeInputString(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseLocalInputToIso(localStr: string): string {
  if (!localStr) return new Date().toISOString();
  const d = new Date(localStr);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function isoToLocalDatetimeInputString(isoStr: string | null | undefined): string {
  if (!isoStr) return toLocalDatetimeInputString();
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? toLocalDatetimeInputString() : toLocalDatetimeInputString(d);
}

export const CngPressureModal: React.FC<CngPressureModalProps> = ({
  isOpen,
  shiftId,
  initialData,
  onClose,
  onSaved,
  onError,
  onSuccess,
}) => {
  const [recordedAtLocal, setRecordedAtLocal] = useState(toLocalDatetimeInputString());
  const [pressureUnit, setPressureUnit] = useState('bar');
  const [suctionPressure, setSuctionPressure] = useState('');
  const [dischargePressure, setDischargePressure] = useState('');
  const [cascadePressure, setCascadePressure] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setRecordedAtLocal(isoToLocalDatetimeInputString(initialData.recordedAt));
      setPressureUnit(initialData.pressureUnit ?? 'bar');
      setSuctionPressure(initialData.suctionPressure ?? '');
      setDischargePressure(initialData.dischargePressure ?? '');
      setCascadePressure(initialData.cascadePressure ?? '');
      setNotes(initialData.notes ?? '');
    } else {
      setRecordedAtLocal(toLocalDatetimeInputString());
      setPressureUnit('bar');
      setSuctionPressure('');
      setDischargePressure('');
      setCascadePressure('');
      setNotes('');
    }
    setClientError(null);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const validate = (): boolean => {
    setClientError(null);
    if (!pressureUnit.trim()) {
      setClientError('Pressure engineering unit is required (e.g. bar, kg/cm², psi).');
      return false;
    }

    const decimalRegex = /^\d+(\.\d{1,3})?$/;
    const hasSuction = suctionPressure.trim() !== '';
    const hasDischarge = dischargePressure.trim() !== '';
    const hasCascade = cascadePressure.trim() !== '';

    if (!hasSuction && !hasDischarge && !hasCascade) {
      setClientError('At least one pressure reading (suction, discharge, or cascade) must be entered.');
      return false;
    }

    if (hasSuction && !decimalRegex.test(suctionPressure.trim())) {
      setClientError('Suction pressure must be a non-negative decimal with up to 3 decimal places.');
      return false;
    }
    if (hasDischarge && !decimalRegex.test(dischargePressure.trim())) {
      setClientError('Discharge pressure must be a non-negative decimal with up to 3 decimal places.');
      return false;
    }
    if (hasCascade && !decimalRegex.test(cascadePressure.trim())) {
      setClientError('Cascade / LCNG pressure must be a non-negative decimal with up to 3 decimal places.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload = {
        recordedAt: parseLocalInputToIso(recordedAtLocal),
        pressureUnit: pressureUnit.trim(),
        suctionPressure: suctionPressure.trim() ? suctionPressure.trim() : null,
        dischargePressure: dischargePressure.trim() ? dischargePressure.trim() : null,
        cascadePressure: cascadePressure.trim() ? cascadePressure.trim() : null,
        notes: notes.trim() ? notes.trim() : null,
      };

      if (initialData) {
        // Edit existing reading: PUT /api/v1/cng-pressure-readings/:id
        const res = await apiFetch<CngPressureReading>(`/api/v1/cng-pressure-readings/${initialData.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });

        if (res.success && res.data) {
          onSuccess('Pressure reading updated successfully.');
          onSaved(res.data);
          onClose();
        } else {
          setClientError(res.error?.message || 'Failed to update pressure reading.');
        }
      } else {
        // Create new reading: POST /api/v1/shifts/:shiftId/cng-pressure-readings
        const res = await apiFetch<CngPressureReading>(`/api/v1/shifts/${shiftId}/cng-pressure-readings`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        if (res.success && res.data) {
          onSuccess('Pressure reading added successfully.');
          onSaved(res.data);
          onClose();
        } else {
          setClientError(res.error?.message || 'Failed to create pressure reading.');
        }
      }
    } catch (err: any) {
      setClientError(err.message || 'An unexpected network error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
      
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-orange-500/10 text-orange-500 rounded-lg border border-orange-500/20">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {initialData ? 'Edit Compressor Pressure Reading' : 'Add Compressor Pressure Reading'}
              </h2>
              <p className="text-xs text-slate-400">
                Log suction, discharge, and cascade manifold pressure states
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {clientError && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-xs text-rose-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{clientError}</span>
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Timestamp Recorded <span className="text-orange-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={recordedAtLocal}
                onChange={(e) => setRecordedAtLocal(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Pressure Unit <span className="text-orange-500">*</span>
              </label>
              <input
                type="text"
                value={pressureUnit}
                onChange={(e) => setPressureUnit(e.target.value)}
                required
                placeholder="e.g. bar, kg/cm², psi"
                className="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
          </div>

          <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
              Pressure Values (At least one required)
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1 font-mono">
                  Suction Pressure
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={suctionPressure}
                  onChange={(e) => setSuctionPressure(e.target.value)}
                  placeholder="e.g. 16.500"
                  className="w-full bg-slate-900 border border-slate-800 focus:border-orange-500 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono placeholder:text-slate-600"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1 font-mono">
                  Discharge Pressure
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={dischargePressure}
                  onChange={(e) => setDischargePressure(e.target.value)}
                  placeholder="e.g. 245.000"
                  className="w-full bg-slate-900 border border-slate-800 focus:border-orange-500 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono placeholder:text-slate-600"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1 font-mono">
                  Cascade / LCNG
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={cascadePressure}
                  onChange={(e) => setCascadePressure(e.target.value)}
                  placeholder="e.g. 210.000"
                  className="w-full bg-slate-900 border border-slate-800 focus:border-orange-500 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono placeholder:text-slate-600"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Remarks / Stage Notes <span className="text-slate-500">(Optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Stage 2 compressor cooling normal..."
              className="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-orange-500/20 disabled:opacity-50 transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{submitting ? 'Saving...' : initialData ? 'Update Reading' : 'Save Reading'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
