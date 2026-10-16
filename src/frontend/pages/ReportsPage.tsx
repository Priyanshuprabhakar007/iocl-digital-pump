import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Building2,
  RefreshCw,
  AlertCircle,
  Zap,
  Fuel,
  Wrench,
  Users,
  Calendar,
  Download
} from 'lucide-react';
import { apiFetch } from '../services/api';
import { RetailOutlet, MonthlyOperationsReport } from '../../shared/types';

export const ReportsPage: React.FC = () => {
  const [outlets, setOutlets] = useState<RetailOutlet[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>(
    new Date().toISOString().substring(0, 7) // YYYY-MM
  );
  const [report, setReport] = useState<MonthlyOperationsReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load Outlets on Mount
  useEffect(() => {
    const fetchOutlets = async () => {
      try {
        const res = await apiFetch<RetailOutlet[]>('/api/v1/outlets');
        if (res.success && res.data && res.data.length > 0) {
          setOutlets(res.data);
          setSelectedOutletId(res.data[0].id);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load retail outlets');
      }
    };
    fetchOutlets();
  }, []);

  const fetchReport = useCallback(async () => {
    if (!selectedOutletId || !selectedMonth) return;
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch<MonthlyOperationsReport>(
        `/api/v1/reports/monthly-operations?outletId=${selectedOutletId}&month=${selectedMonth}`
      );
      if (res.success && res.data) {
        setReport(res.data);
      } else if (!res.success) {
        setError(res.error?.message || 'Failed to generate monthly operations report');
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching report');
    } finally {
      setLoading(false);
    }
  }, [selectedOutletId, selectedMonth]);

  useEffect(() => {
    fetchReport();
  }, [selectedOutletId, selectedMonth, fetchReport]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/80 p-5 rounded-2xl border border-slate-800 shadow-lg">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-orange-500" />
            Monthly Operations & Performance Report
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Integrated operational summary across DG sets, fuel sales, equipment maintenance, and workforce.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 px-3 py-1.5 rounded-lg text-xs">
            <Building2 className="w-4 h-4 text-orange-400 shrink-0" />
            <select
              value={selectedOutletId}
              onChange={(e) => setSelectedOutletId(e.target.value)}
              className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
            >
              {outlets.map((o) => (
                <option key={o.id} value={o.id} className="bg-slate-900 text-white">
                  {o.name} ({o.roCode})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 px-3 py-1.5 rounded-lg text-xs">
            <Calendar className="w-4 h-4 text-orange-400 shrink-0" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
            />
          </div>

          <button
            onClick={fetchReport}
            disabled={loading}
            className="p-2 text-slate-300 hover:text-white rounded-lg bg-slate-800 hover:bg-slate-700 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 border border-red-700/50 rounded-xl flex items-center gap-3 text-red-300 text-xs shadow-md">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Report Cards Grid */}
      {report && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* DG Operations Card */}
            <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-3">
              <div className="flex items-center justify-between text-amber-400 font-bold text-sm">
                <span className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  DG Daily Operations
                </span>
                <span className="text-xs bg-amber-950/60 text-amber-300 px-2 py-0.5 rounded border border-amber-800/50 font-mono">
                  {report.dgSummary.totalLogs} Logs
                </span>
              </div>
              <div className="space-y-2 pt-2 border-t border-slate-800 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Run Hours:</span>
                  <span className="text-white font-bold">{report.dgSummary.totalRunHours} hrs</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Diesel Consumed:</span>
                  <span className="text-orange-400 font-bold">{report.dgSummary.totalDieselConsumedLitres} L</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Avg Daily Run:</span>
                  <span className="text-amber-300">{report.dgSummary.averageDailyRunHours} hrs/day</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Grid Failures:</span>
                  <span className="text-red-400">{report.dgSummary.totalGridFailureMinutes} mins</span>
                </div>
              </div>
            </div>

            {/* Fuel Sales Card */}
            <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-3">
              <div className="flex items-center justify-between text-emerald-400 font-bold text-sm">
                <span className="flex items-center gap-2">
                  <Fuel className="w-5 h-5" />
                  Shift & Fuel Sales
                </span>
                <span className="text-xs bg-emerald-950/60 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800/50 font-mono">
                  {report.fuelSummary.totalShiftsCount} Shifts
                </span>
              </div>
              <div className="space-y-2 pt-2 border-t border-slate-800 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">Completed Shifts:</span>
                  <span className="text-white font-bold">{report.fuelSummary.totalShiftsCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Reconciled Revenue:</span>
                  <span className="text-emerald-400 font-bold">
                    ₹{(report.fuelSummary.totalSalesPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Breakdown Maintenance Card */}
            <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-3">
              <div className="flex items-center justify-between text-blue-400 font-bold text-sm">
                <span className="flex items-center gap-2">
                  <Wrench className="w-5 h-5" />
                  Equipment Breakdowns
                </span>
                <span className="text-xs bg-blue-950/60 text-blue-300 px-2 py-0.5 rounded border border-blue-800/50 font-mono">
                  {report.breakdownSummary.totalTickets} Tickets
                </span>
              </div>
              <div className="space-y-2 pt-2 border-t border-slate-800 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">Open Tickets:</span>
                  <span className="text-amber-400 font-bold">{report.breakdownSummary.openTickets}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Resolved Tickets:</span>
                  <span className="text-emerald-400 font-bold">{report.breakdownSummary.resolvedTickets}</span>
                </div>
              </div>
            </div>

            {/* HR Workforce Card */}
            <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-3">
              <div className="flex items-center justify-between text-indigo-400 font-bold text-sm">
                <span className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Workforce & Staff
                </span>
                <span className="text-xs bg-indigo-950/60 text-indigo-300 px-2 py-0.5 rounded border border-indigo-800/50 font-mono">
                  {report.hrSummary.totalStaff} Active Staff
                </span>
              </div>
              <div className="space-y-2 pt-2 border-t border-slate-800 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">Active Staff Count:</span>
                  <span className="text-white font-bold">{report.hrSummary.totalStaff}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Staff Present Days:</span>
                  <span className="text-indigo-300 font-bold">{report.hrSummary.presentDaysCount} man-days</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
