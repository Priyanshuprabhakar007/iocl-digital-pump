import React, { useState, useEffect } from 'react';
import { CngDailySummary } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { Calendar, BarChart3, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';

interface CngDailySummaryPanelProps {
  outletId: string;
  defaultDate: string;
  refreshTrigger?: number;
}

export const CngDailySummaryPanel: React.FC<CngDailySummaryPanelProps> = ({
  outletId,
  defaultDate,
  refreshTrigger = 0,
}) => {
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [summary, setSummary] = useState<CngDailySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync date when defaultDate changes from parent selected shift
  useEffect(() => {
    if (defaultDate) {
      setSelectedDate(defaultDate);
    }
  }, [defaultDate]);

  const loadSummary = async (date: string) => {
    if (!outletId || !date) return;
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch<CngDailySummary>(
        `/api/v1/outlets/${outletId}/cng/daily-summary?businessDate=${date}`
      );

      if (res.success && res.data) {
        setSummary(res.data);
      } else {
        setError(res.error?.message || 'Failed to load daily CNG summary');
        setSummary(null);
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching daily summary');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDate && outletId) {
      loadSummary(selectedDate);
    }
  }, [outletId, selectedDate, refreshTrigger]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-orange-500/10 rounded-xl border border-orange-500/20 text-orange-500">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base md:text-lg font-bold text-white tracking-tight">
              Daily CNG Summary
            </h2>
            <p className="text-xs text-slate-400">
              Aggregated 24-hour business date sales and custody transfer reconciliation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs text-white font-mono focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => loadSummary(selectedDate)}
            disabled={loading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors disabled:opacity-50"
            title="Refresh Daily Summary"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : !summary || summary.shiftCount === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500 italic bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
          No CNG operations recorded for the selected business date.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Status banner */}
          {summary.gridDataComplete ? (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 text-xs text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span className="font-semibold">Grid Data Complete:</span>
              <span className="text-slate-300">
                All {summary.shiftCount} shifts on {summary.businessDate} have verified grid intake recorded.
              </span>
            </div>
          ) : (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2 text-xs text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="font-semibold">Incomplete Grid Intake:</span>
              <span className="text-slate-300">
                Grid intake data is incomplete for one or more shifts. Aggregate variance is unconfirmed.
              </span>
            </div>
          )}

          {/* Aggregated Metrics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Total MFM Sales
              </div>
              <div className="text-xl sm:text-2xl font-black text-white font-mono mt-1">
                {summary.totalMfmSalesKg} kg
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Sum across {summary.shiftCount} shift(s)</div>
            </div>

            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Total Grid Intake
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono mt-1 text-orange-400">
                {summary.gridDataComplete && summary.gridIntakeKg != null ? (
                  `${summary.gridIntakeKg} kg`
                ) : (
                  <span className="text-amber-400 text-sm font-bold font-sans">Incomplete</span>
                )}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                {summary.gridDataComplete ? 'Verified upstream intake' : 'Missing shift intake'}
              </div>
            </div>

            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Grid vs Sales Variance
              </div>
              <div
                className={`text-xl sm:text-2xl font-black font-mono mt-1 ${
                  summary.gridDataComplete && summary.gridSalesVarianceKg != null
                    ? parseFloat(summary.gridSalesVarianceKg) === 0
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                    : 'text-slate-600'
                }`}
              >
                {summary.gridDataComplete && summary.gridSalesVarianceKg != null ? (
                  `${summary.gridSalesVarianceKg} kg`
                ) : (
                  <span className="text-slate-600 text-base font-normal">—</span>
                )}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                {summary.gridDataComplete ? 'Net reconciliation balance' : 'Pending complete grid logs'}
              </div>
            </div>

            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Participating Shifts
              </div>
              <div className="text-xl sm:text-2xl font-black text-white font-mono mt-1">
                {summary.shiftCount}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Recorded for {summary.businessDate}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
