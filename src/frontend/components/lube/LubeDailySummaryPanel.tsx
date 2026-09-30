import React, { useState, useEffect } from 'react';
import { LubeDailySummary } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { AlertCircle, RefreshCw, Calendar, TrendingUp } from 'lucide-react';

interface LubeDailySummaryPanelProps {
  outletId: string;
  defaultDate: string;
}

export const LubeDailySummaryPanel: React.FC<LubeDailySummaryPanelProps> = ({
  outletId,
  defaultDate,
}) => {
  const [businessDate, setBusinessDate] = useState(defaultDate || new Date().toISOString().split('T')[0]);
  const [summary, setSummary] = useState<LubeDailySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRequestRef = React.useRef({ outletId, businessDate });

  const fetchDailySummary = async () => {
    if (!outletId || !businessDate) return;
    setLoading(true);
    setError(null);
    const thisRequest = { outletId, businessDate };
    activeRequestRef.current = thisRequest;

    try {
      const res = await apiFetch<LubeDailySummary>(
        `/api/v1/outlets/${outletId}/lube/daily-summary?businessDate=${businessDate}`
      );
      if (
        activeRequestRef.current.outletId !== thisRequest.outletId ||
        activeRequestRef.current.businessDate !== thisRequest.businessDate
      ) {
        return; // Stale response discarded
      }

      if (res.success) {
        setSummary(res.data);
      } else {
        setError(res.error?.message || 'Failed to load daily summary');
        setSummary(null);
      }
    } catch (err: any) {
      if (
        activeRequestRef.current.outletId !== thisRequest.outletId ||
        activeRequestRef.current.businessDate !== thisRequest.businessDate
      ) {
        return; // Stale error discarded
      }
      setError(err.message || 'An unexpected error occurred');
      setSummary(null);
    } finally {
      if (
        activeRequestRef.current.outletId === thisRequest.outletId &&
        activeRequestRef.current.businessDate === thisRequest.businessDate
      ) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    setBusinessDate(defaultDate);
  }, [defaultDate]);

  useEffect(() => {
    fetchDailySummary();
  }, [outletId, businessDate]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-white">Daily Summary</h3>
          <p className="text-xs text-slate-400 mt-0.5">Aggregated lube sales metrics and revenue across the selected business date</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Calendar className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 text-white rounded-lg text-xs font-semibold focus:outline-none focus:border-orange-500 font-mono w-40"
            />
          </div>
          <button
            onClick={fetchDailySummary}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-500/10 border border-rose-500/25 rounded-xl flex items-start gap-2.5 text-rose-500 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : !summary ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl space-y-3">
          <AlertCircle className="w-8 h-8 text-slate-500 mx-auto" />
          <h4 className="text-sm font-semibold text-white">No Summary Data</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Choose a valid business date with active operational shifts to view daily summary metrics.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-2">
              <div className="text-[10px] text-slate-500 font-semibold tracking-wider font-mono uppercase">
                Active Shifts with Sales
              </div>
              <div className="text-lg font-bold text-white font-mono tabular-nums">
                {summary.shiftCountWithLubeSales}
              </div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-2">
              <div className="text-[10px] text-slate-500 font-semibold tracking-wider font-mono uppercase">
                Total Sales Lines
              </div>
              <div className="text-lg font-bold text-white font-mono tabular-nums">
                {summary.saleLineCount}
              </div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-2">
              <div className="text-[10px] text-slate-500 font-semibold tracking-wider font-mono uppercase">
                Litre Volume Sold
              </div>
              <div className="text-lg font-bold text-emerald-500 font-mono tabular-nums">
                {summary.quantitiesByUnit?.litre || '0.000'} <span className="text-[11px] text-slate-500 font-normal">L</span>
              </div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-2">
              <div className="text-[10px] text-slate-500 font-semibold tracking-wider font-mono uppercase">
                Pack Units Sold
              </div>
              <div className="text-lg font-bold text-amber-500 font-mono tabular-nums">
                {summary.quantitiesByUnit?.pack || '0'} <span className="text-[11px] text-slate-500 font-normal">Units</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-gradient-to-r from-orange-500/10 to-amber-500/5 border border-orange-500/20 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <TrendingUp className="w-5 h-5 text-orange-400 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-white tracking-tight">Total Daily Lube Revenue</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">Authoritative revenue calculated backend-side across all matching sales</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-black font-mono text-orange-400 tabular-nums">
                ₹{summary.totalRevenueStr}
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                {summary.totalRevenuePaise} Paise
              </div>
            </div>
          </div>

          {/* Daily list of SKUs sold */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white tracking-wider uppercase font-mono">SKU-Wise Sales breakdown</h4>
            {summary.bySku && summary.bySku.length > 0 ? (
              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-4">SKU Code</th>
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4 text-right">Transactions</th>
                      <th className="py-3 px-4 text-right">Quantity Sold</th>
                      <th className="py-3 px-4 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-xs">
                    {summary.bySku.map((item) => (
                      <tr key={item.lubeSkuId} className="hover:bg-slate-800/40 text-slate-300">
                        <td className="py-3 px-4 font-mono font-bold text-white">{item.skuCode}</td>
                        <td className="py-3 px-4 font-medium text-slate-100">{item.skuName}</td>
                        <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">{item.category}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{item.saleCount}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-200 tabular-nums">
                          {item.quantity} <span className="text-[10px] text-slate-500 font-normal">{item.stockUnit}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-extrabold text-orange-400 tabular-nums">
                          ₹{item.revenueStr}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl text-center text-xs text-slate-400 italic">
                No individual SKU sales recorded for this date.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
