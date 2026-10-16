import React, { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, AlertCircle, Clock, Zap, Fuel, Activity } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { DgDailyLog, EquipmentAsset } from '../../../shared/types';

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
  const [logDate, setLogDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [openingRunHours, setOpeningRunHours] = useState<number>(0);
  const [closingRunHours, setClosingRunHours] = useState<number>(0);
  const [dieselConsumedLitres, setDieselConsumedLitres] = useState<number>(0);
  const [unitsGeneratedKwh, setUnitsGeneratedKwh] = useState<number | ''>('');
  const [openingDieselBalance, setOpeningDieselBalance] = useState<number>(0);
  const [dieselAddedLitres, setDieselAddedLitres] = useState<number>(0);
  const [gridFailureMin, setGridFailureMin] = useState<number>(0);
  const [powerCutEvents, setPowerCutEvents] = useState<number>(0);
  const [remarks, setRemarks] = useState<string>('');

  const loadLogsAndAssets = useCallback(async () => {
    if (!outletId) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch DG Assets for this outlet
      const assetsRes = await apiFetch<EquipmentAsset[]>(`/api/v1/equipment/assets?outletId=${outletId}`);
      if (assetsRes.success && assetsRes.data) {
        const dgs = assetsRes.data.filter((a) => a.equipmentType === 'DG_SET');
        setDgAssets(dgs);
        if (dgs.length > 0 && !selectedEquipmentId) {
          setSelectedEquipmentId(dgs[0].id);
        }
      }

      // Fetch DG Logs
      const logsRes = await apiFetch<DgDailyLog[]>(`/api/v1/dg-operations/logs?outletId=${outletId}`);
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

  // Load latest log for chosen equipment to auto-populate opening run hours & diesel balance
  useEffect(() => {
    if (!selectedEquipmentId) return;
    const fetchLatest = async () => {
      try {
        const res = await apiFetch<DgDailyLog>(`/api/v1/dg-operations/latest/${selectedEquipmentId}`);
        if (res.success && res.data) {
          setOpeningRunHours(res.data.closingRunHours);
          setOpeningDieselBalance(res.data.closingDieselBalanceLitres);
          setClosingRunHours(res.data.closingRunHours);
        }
      } catch (err) {
        // Ignore fallback
      }
    };
    fetchLatest();
  }, [selectedEquipmentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEquipmentId) {
      setError('Please select a DG equipment asset');
      return;
    }
    if (closingRunHours < openingRunHours) {
      setError('Closing run hours cannot be less than opening run hours');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        outletId,
        equipmentId: selectedEquipmentId,
        logDate,
        openingRunHours,
        closingRunHours,
        dieselConsumedLitres,
        unitsGeneratedKwh: unitsGeneratedKwh === '' ? null : Number(unitsGeneratedKwh),
        openingDieselBalanceLitres: openingDieselBalance,
        dieselAddedLitres,
        gridFailureDurationMinutes: gridFailureMin,
        powerCutEventsCount: powerCutEvents,
        remarks: remarks.trim() || undefined,
      };

      const res = await apiFetch<DgDailyLog>('/api/v1/dg-operations/logs', {
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
            DG Set Daily Operations & Fuel Logs
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Track daily generator run hours, diesel fuel consumption, power cuts, and unit generation.
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
                <th className="p-3">Log Date</th>
                <th className="p-3">DG Asset</th>
                <th className="p-3">Run Hours (Open / Close)</th>
                <th className="p-3">Total Run Hours</th>
                <th className="p-3">Diesel Consumed (L)</th>
                <th className="p-3">Diesel Added (L)</th>
                <th className="p-3">Closing Diesel Bal (L)</th>
                <th className="p-3">Grid Failure (Min)</th>
                <th className="p-3">Power Cuts</th>
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
                    <td className="p-3 font-semibold text-amber-400">{log.logDate}</td>
                    <td className="p-3 font-sans font-medium">{log.equipmentName || log.equipmentCode || log.equipmentId}</td>
                    <td className="p-3 text-slate-400">
                      {log.openingRunHours} → {log.closingRunHours}
                    </td>
                    <td className="p-3 text-emerald-400 font-bold">{log.totalRunHours} hrs</td>
                    <td className="p-3 text-orange-400 font-semibold">{log.dieselConsumedLitres} L</td>
                    <td className="p-3 text-blue-400">{log.dieselAddedLitres} L</td>
                    <td className="p-3 text-slate-300">{log.closingDieselBalanceLitres} L</td>
                    <td className="p-3 text-amber-300">{log.gridFailureDurationMinutes} m</td>
                    <td className="p-3 text-slate-400">{log.powerCutEventsCount}</td>
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
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-lg shadow-2xl text-slate-200">
            <h4 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-amber-500" />
              Record DG Daily Operation Log
            </h4>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Select DG Asset</label>
                <select
                  value={selectedEquipmentId}
                  onChange={(e) => setSelectedEquipmentId(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">-- Choose DG Set Asset --</option>
                  {dgAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name} ({asset.assetCode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Log Date</label>
                  <input
                    type="date"
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Opening Run Hours</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={openingRunHours}
                    onChange={(e) => setOpeningRunHours(Number(e.target.value))}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Closing Run Hours</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={closingRunHours}
                    onChange={(e) => setClosingRunHours(Number(e.target.value))}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Diesel Consumed (Litres)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={dieselConsumedLitres}
                    onChange={(e) => setDieselConsumedLitres(Number(e.target.value))}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Opening Diesel Bal (L)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={openingDieselBalance}
                    onChange={(e) => setOpeningDieselBalance(Number(e.target.value))}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Diesel Added (Litres)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={dieselAddedLitres}
                    onChange={(e) => setDieselAddedLitres(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Grid Failure (Minutes)</label>
                  <input
                    type="number"
                    min="0"
                    value={gridFailureMin}
                    onChange={(e) => setGridFailureMin(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Power Cut Events Count</label>
                  <input
                    type="number"
                    min="0"
                    value={powerCutEvents}
                    onChange={(e) => setPowerCutEvents(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Remarks / Maintenance Notes</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  placeholder="Optional operational remarks..."
                />
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
