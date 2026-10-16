import React, { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, AlertCircle, Clock, Zap, Fuel, Activity, Trash2 } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { DgDailyLog, EquipmentAsset, DgRunIntervalInput } from '../../../shared/types';

interface DgDailyLogPanelProps {
  outletId: string;
}

export const DgDailyLogPanel: React.FC<DgDailyLogPanelProps> = ({ outletId }) => {
  const [logs, setLogs] = useState<DgDailyLog[]>([]);
  const [dgAssets, setDgAssets] = useState<EquipmentAsset[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Form State
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>('');
  const [businessDate, setBusinessDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [meterFrom, setMeterFrom] = useState<string>('');
  const [meterTo, setMeterTo] = useState<string>('');
  const [hsdConsumedLitres, setHsdConsumedLitres] = useState<string>('0');
  const [hsdRateRupees, setHsdRateRupees] = useState<string>('95.00');
  const [status, setStatus] = useState<'DRAFT' | 'FINAL'>('DRAFT');
  const [remarks, setRemarks] = useState<string>('');
  const [intervals, setIntervals] = useState<DgRunIntervalInput[]>([
    { sequenceNo: 1, startTime: '08:00', endTime: '10:00', remarks: '' },
  ]);

  const loadLogsAndAssets = useCallback(async () => {
    if (!outletId) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch DG Assets for this outlet
      const assetsRes = await apiFetch<EquipmentAsset[]>(`/api/v1/outlets/${outletId}/equipment/assets`);
      if (assetsRes.success && assetsRes.data) {
        const dgs = assetsRes.data.filter((a) => a.equipmentType === 'DG_SET');
        setDgAssets(dgs);
        if (dgs.length > 0 && !selectedEquipmentId) {
          setSelectedEquipmentId(dgs[0].id);
        }
      }

      // Fetch DG Logs
      const logsRes = await apiFetch<DgDailyLog[]>(`/api/v1/outlets/${outletId}/dg-logs`);
      if (logsRes.success && logsRes.data) {
        setLogs(logsRes.data);
      } else if (!logsRes.success) {
        setError(logsRes.error?.message || 'Failed to fetch DG daily logs');
      }
    } catch (err: any) {
      setError(err.message || 'Error loading DG operations data');
    } finally {
      setLoading(false);
    }
  }, [outletId, selectedEquipmentId]);

  useEffect(() => {
    loadLogsAndAssets();
  }, [outletId, loadLogsAndAssets]);

  // Load latest log for chosen equipment to auto-populate previous meter
  useEffect(() => {
    if (!selectedEquipmentId) return;
    const fetchLatest = async () => {
      try {
        const res = await apiFetch<DgDailyLog>(`/api/v1/dg-logs/latest/${selectedEquipmentId}`);
        if (res.success && res.data) {
          if (res.data.meterReadingToMilliunits != null) {
            setMeterFrom((res.data.meterReadingToMilliunits / 1000).toString());
          }
          if (res.data.hsdRatePaisePerLitre != null) {
            setHsdRateRupees((res.data.hsdRatePaisePerLitre / 100).toFixed(2));
          }
        }
      } catch (err) {
        // Ignore fallback
      }
    };
    fetchLatest();
  }, [selectedEquipmentId]);

  const addInterval = () => {
    if (intervals.length >= 8) {
      setError('Maximum 8 run intervals allowed per log');
      return;
    }
    setIntervals([
      ...intervals,
      { sequenceNo: intervals.length + 1, startTime: '12:00', endTime: '13:00', remarks: '' },
    ]);
  };

  const removeInterval = (index: number) => {
    const updated = intervals.filter((_, i) => i !== index).map((iv, idx) => ({
      ...iv,
      sequenceNo: idx + 1,
    }));
    setIntervals(updated);
  };

  const updateInterval = (index: number, field: keyof DgRunIntervalInput, value: string) => {
    const updated = [...intervals];
    updated[index] = { ...updated[index], [field]: value };
    setIntervals(updated);
  };

  const computedAmount = () => {
    const litres = parseFloat(hsdConsumedLitres) || 0;
    const rate = parseFloat(hsdRateRupees) || 0;
    return (litres * rate).toFixed(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEquipmentId) {
      setError('Please select a DG equipment asset');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const hsdMilliunits = Math.round((parseFloat(hsdConsumedLitres) || 0) * 1000);
      const ratePaise = hsdRateRupees ? Math.round(parseFloat(hsdRateRupees) * 100) : null;
      const fromMilliunits = meterFrom ? Math.round(parseFloat(meterFrom) * 1000) : null;
      const toMilliunits = meterTo ? Math.round(parseFloat(meterTo) * 1000) : null;

      const payload = {
        equipmentAssetId: selectedEquipmentId,
        businessDate,
        meterReadingFromMilliunits: fromMilliunits,
        meterReadingToMilliunits: toMilliunits,
        hsdConsumedMilliunits: hsdMilliunits,
        hsdRatePaisePerLitre: ratePaise,
        status,
        remarks: remarks.trim() || null,
        intervals: intervals.filter((iv) => iv.startTime && iv.endTime),
      };

      const res = await apiFetch<DgDailyLog>(`/api/v1/outlets/${outletId}/dg-logs`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res.success) {
        setIsModalOpen(false);
        setRemarks('');
        loadLogsAndAssets();
      } else {
        setError(res.error?.message || 'Failed to create DG daily log');
      }
    } catch (err: any) {
      setError(err.message || 'Error submitting DG daily log');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            DG Set Daily Operations & Run Intervals
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Track daily generator run intervals, running hours, meter readings, and diesel fuel consumption.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadLogsAndAssets}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800 hover:bg-slate-700 transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold text-xs shadow-md shadow-amber-500/20 hover:from-amber-600 hover:to-orange-700 transition"
          >
            <Plus className="w-4 h-4" />
            New Daily Log Entry
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg flex items-center gap-2 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Logs Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/90 text-slate-300 font-semibold border-b border-slate-700">
              <tr>
                <th className="p-3">Business Date</th>
                <th className="p-3">DG Asset</th>
                <th className="p-3">Running Time</th>
                <th className="p-3">Intervals</th>
                <th className="p-3">Meter (From → To)</th>
                <th className="p-3">HSD Consumed</th>
                <th className="p-3">Rate (₹/L)</th>
                <th className="p-3">Amount (₹)</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200 font-mono">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500 font-sans">
                    No DG daily log entries recorded for this outlet yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/50 transition">
                    <td className="p-3 font-semibold text-amber-400">{log.businessDate}</td>
                    <td className="p-3 font-sans font-medium">{log.equipmentName || log.equipmentCode || log.equipmentAssetId}</td>
                    <td className="p-3 text-emerald-400 font-bold">{log.totalRunningHoursStr} hrs</td>
                    <td className="p-3 text-slate-300 font-sans">
                      {log.intervals && log.intervals.length > 0 ? (
                        <span>
                          {log.intervals.length} run{log.intervals.length > 1 ? 's' : ''} (
                          {log.intervals.map((iv) => `${iv.startTime}-${iv.endTime}`).join(', ')})
                        </span>
                      ) : (
                        <span className="text-slate-500">None</span>
                      )}
                    </td>
                    <td className="p-3 text-slate-400">
                      {log.meterReadingFromMilliunits != null ? (log.meterReadingFromMilliunits / 1000).toFixed(1) : '-'} →{' '}
                      {log.meterReadingToMilliunits != null ? (log.meterReadingToMilliunits / 1000).toFixed(1) : '-'}
                    </td>
                    <td className="p-3 text-orange-400 font-semibold">{log.hsdConsumedStr} L</td>
                    <td className="p-3 text-slate-300">{log.hsdRateStr ? `₹${log.hsdRateStr}` : '-'}</td>
                    <td className="p-3 text-emerald-300 font-bold">{log.amountStr ? `₹${log.amountStr}` : '-'}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold ${
                          log.status === 'FINAL'
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                            : 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Log Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-xl shadow-2xl text-slate-200 max-h-[90vh] overflow-y-auto">
            <h4 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-amber-500" />
              Record DG Daily Operation Log
            </h4>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Select DG Asset</label>
                  <select
                    value={selectedEquipmentId}
                    onChange={(e) => setSelectedEquipmentId(e.target.value)}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">-- Choose DG Set --</option>
                    {dgAssets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name} ({asset.assetCode})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Business Date</label>
                  <input
                    type="date"
                    value={businessDate}
                    onChange={(e) => setBusinessDate(e.target.value)}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Meter Readings */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Opening Meter Reading</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="e.g. 100.000"
                    value={meterFrom}
                    onChange={(e) => setMeterFrom(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Closing Meter Reading</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="e.g. 108.000"
                    value={meterTo}
                    onChange={(e) => setMeterTo(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              {/* Run Intervals Section */}
              <div className="space-y-2 p-3 bg-slate-950/40 rounded-lg border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    Run Intervals (Max 8)
                  </span>
                  <button
                    type="button"
                    onClick={addInterval}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 transition"
                  >
                    + Add Interval
                  </button>
                </div>
                {intervals.map((iv, idx) => (
                  <div key={idx} className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] text-slate-500 w-5 font-mono">#{idx + 1}</span>
                    <input
                      type="time"
                      value={iv.startTime}
                      onChange={(e) => updateInterval(idx, 'startTime', e.target.value)}
                      required
                      className="bg-slate-800 border border-slate-700 rounded p-1.5 text-xs text-white focus:outline-none"
                    />
                    <span className="text-slate-400 text-xs">to</span>
                    <input
                      type="time"
                      value={iv.endTime}
                      onChange={(e) => updateInterval(idx, 'endTime', e.target.value)}
                      required
                      className="bg-slate-800 border border-slate-700 rounded p-1.5 text-xs text-white focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Remarks"
                      value={iv.remarks || ''}
                      onChange={(e) => updateInterval(idx, 'remarks', e.target.value)}
                      className="flex-1 bg-slate-800 border border-slate-700 rounded p-1.5 text-xs text-white focus:outline-none"
                    />
                    {intervals.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeInterval(idx)}
                        className="p-1 text-slate-500 hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Fuel and Rate */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">HSD Consumed (Litres)</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={hsdConsumedLitres}
                    onChange={(e) => setHsdConsumedLitres(e.target.value)}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">HSD Rate (₹/L)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={hsdRateRupees}
                    onChange={(e) => setHsdRateRupees(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Amount (₹)</label>
                  <div className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-emerald-400 font-mono font-bold">
                    ₹{computedAmount()}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Log Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'DRAFT' | 'FINAL')}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="DRAFT">DRAFT (Editable)</option>
                    <option value="FINAL">FINAL (Submitted)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Remarks</label>
                  <input
                    type="text"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                    placeholder="Optional notes..."
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold text-xs shadow-md shadow-amber-500/20 hover:from-amber-600 hover:to-orange-700 transition"
                >
                  {submitting ? 'Saving...' : 'Save Log Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
