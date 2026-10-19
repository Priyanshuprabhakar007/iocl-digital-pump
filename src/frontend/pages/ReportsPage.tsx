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
  Download,
  Eye,
  Loader2
} from 'lucide-react';
import { apiFetch, apiFetchBlob } from '../services/api';
import { RetailOutlet, MonthlyOperationsReport } from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../../shared/constants';

export const ReportsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canGeneratePdf = hasPermission(PERMISSIONS.REPORTS_GENERATE);

  const [outlets, setOutlets] = useState<RetailOutlet[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>(
    new Date().toISOString().substring(0, 7) // YYYY-MM
  );
  const [cutoffMode, setCutoffMode] = useState<'MONTH_END' | 'SELECTED_DATE' | 'LATEST_DATA'>('MONTH_END');
  const [cutoffDate, setCutoffDate] = useState<string>('');
  const [report, setReport] = useState<MonthlyOperationsReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // PDF UI State
  const [pdfLoading, setPdfLoading] = useState<boolean>(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

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

  // Clear stale PDF error whenever filters change
  useEffect(() => {
    setPdfError(null);
  }, [selectedOutletId, selectedMonth, cutoffMode, cutoffDate]);

  // Canonical Report & PDF URL parameters
  const buildPdfUrl = useCallback(() => {
    if (!selectedOutletId || !selectedMonth) return null;
    if (cutoffMode === 'SELECTED_DATE' && !cutoffDate) return null;

    const params = new URLSearchParams({
      month: selectedMonth,
      cutoffMode,
    });

    if (cutoffMode === 'SELECTED_DATE' && cutoffDate) {
      params.set('cutoffDate', cutoffDate);
    }

    return `/api/v1/outlets/${selectedOutletId}/reports/monthly-operations/pdf?${params.toString()}`;
  }, [selectedOutletId, selectedMonth, cutoffMode, cutoffDate]);

  const fetchReport = useCallback(async () => {
    if (!selectedOutletId || !selectedMonth) return;
    if (cutoffMode === 'SELECTED_DATE' && !cutoffDate) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        month: selectedMonth,
        cutoffMode,
      });

      if (cutoffMode === 'SELECTED_DATE' && cutoffDate) {
        params.set('cutoffDate', cutoffDate);
      }

      const res = await apiFetch<MonthlyOperationsReport>(
        `/api/v1/outlets/${selectedOutletId}/reports/monthly-operations?${params.toString()}`
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
  }, [selectedOutletId, selectedMonth, cutoffMode, cutoffDate]);

  useEffect(() => {
    if (cutoffMode === 'SELECTED_DATE' && !cutoffDate) {
      setReport(null);
      setError(null);
      return; // Clear stale report and wait until a valid cutoff date is selected
    }
    fetchReport();
  }, [selectedOutletId, selectedMonth, cutoffMode, cutoffDate, fetchReport]);

  const isPdfDisabled =
    !canGeneratePdf ||
    !selectedOutletId ||
    !selectedMonth ||
    pdfLoading ||
    (cutoffMode === 'SELECTED_DATE' && !cutoffDate);

  const handlePreviewPdf = async () => {
    if (isPdfDisabled) return;
    const pdfEndpoint = buildPdfUrl();
    if (!pdfEndpoint) {
      setPdfError('Invalid report parameters. Please select a valid cutoff date.');
      return;
    }

    // Open blank window synchronously on user click to prevent popup blockers
    const previewWindow = window.open('', '_blank');
    if (!previewWindow) {
      setPdfError(
        'Your browser blocked the PDF preview window. Please allow pop-ups for this site or use Download PDF.'
      );
      return;
    }

    setPdfLoading(true);
    setPdfError(null);

    try {
      const res = await apiFetchBlob(pdfEndpoint);
      if (!res.success || !res.blob) {
        if (previewWindow && !previewWindow.closed) {
          previewWindow.close();
        }
        setPdfError(res.error?.message || 'Failed to generate monthly operations report PDF.');
        return;
      }

      const previewUrl = URL.createObjectURL(res.blob);
      if (previewWindow && !previewWindow.closed) {
        previewWindow.opener = null;
        previewWindow.location.href = previewUrl;
      }

      setTimeout(() => {
        URL.revokeObjectURL(previewUrl);
      }, 60000);
    } catch (err: any) {
      if (previewWindow && !previewWindow.closed) {
        previewWindow.close();
      }
      setPdfError(err.message || 'Failed to generate monthly operations report PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (isPdfDisabled) return;
    const pdfEndpoint = buildPdfUrl();
    if (!pdfEndpoint) {
      setPdfError('Invalid report parameters. Please select a valid cutoff date.');
      return;
    }

    setPdfLoading(true);
    setPdfError(null);

    try {
      const res = await apiFetchBlob(pdfEndpoint);
      if (!res.success || !res.blob) {
        setPdfError(res.error?.message || 'Failed to generate monthly operations report PDF.');
        return;
      }

      const downloadUrl = URL.createObjectURL(res.blob);
      const filename =
        res.filename || `monthly-operations-${selectedOutletId}-${selectedMonth}.pdf`;

      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
      }, 1000);
    } catch (err: any) {
      setPdfError(err.message || 'Failed to generate monthly operations report PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-slate-900/80 p-5 rounded-2xl border border-slate-800 shadow-lg">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-orange-500" />
            Monthly Operations & Performance Report
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Integrated operational summary across DG sets, fuel sales, equipment maintenance, and workforce.
          </p>
        </div>

        {/* Filters and Actions */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
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
          
          <select
            value={cutoffMode}
            onChange={(e) => setCutoffMode(e.target.value as any)}
            className="bg-slate-800/90 border border-slate-700/80 px-3 py-1.5 rounded-lg text-xs text-white"
          >
            <option value="MONTH_END">Complete Month</option>
            <option value="SELECTED_DATE">Selected Date</option>
            <option value="LATEST_DATA">Latest Data</option>
          </select>
          
          {cutoffMode === 'SELECTED_DATE' && (
            <input
              type="date"
              value={cutoffDate}
              onChange={(e) => setCutoffDate(e.target.value)}
              className="bg-slate-800/90 border border-slate-700/80 px-3 py-1.5 rounded-lg text-xs text-white"
            />
          )}

          <button
            onClick={fetchReport}
            disabled={loading}
            title="Refresh Report Data"
            className="p-2 text-slate-300 hover:text-white rounded-lg bg-slate-800 hover:bg-slate-700 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* PDF Preview & Download Actions */}
          {canGeneratePdf && (
            <div className="flex items-center gap-2">
              <button
                onClick={handlePreviewPdf}
                disabled={isPdfDisabled}
                title={
                  !canGeneratePdf
                    ? 'You do not have permission to generate reports.'
                    : isPdfDisabled
                    ? 'Please select required filters'
                    : 'Preview PDF report in new browser tab'
                }
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-700 text-slate-200 text-xs font-medium rounded-lg transition"
              >
                {pdfLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                ) : (
                  <Eye className="w-4 h-4 text-slate-300" />
                )}
                <span>{pdfLoading ? 'Generating PDF...' : 'Preview PDF'}</span>
              </button>

              <button
                onClick={handleDownloadPdf}
                disabled={isPdfDisabled}
                title={
                  !canGeneratePdf
                    ? 'You do not have permission to generate reports.'
                    : isPdfDisabled
                    ? 'Please select required filters'
                    : 'Download PDF report'
                }
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed border border-orange-500/50 text-white text-xs font-medium rounded-lg transition shadow-sm"
              >
                {pdfLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <Download className="w-4 h-4 text-white" />
                )}
                <span>{pdfLoading ? 'Generating PDF...' : 'Download PDF'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* JSON Report Error */}
      {error && (
        <div className="p-4 bg-red-900/30 border border-red-700/50 rounded-xl flex items-center gap-3 text-red-300 text-xs shadow-md">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* PDF Error Display */}
      {pdfError && (
        <div className="p-4 bg-red-900/30 border border-red-700/50 rounded-xl flex items-center justify-between gap-3 text-red-300 text-xs shadow-md">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
            <span>{pdfError}</span>
          </div>
          <button
            onClick={() => setPdfError(null)}
            className="text-red-400 hover:text-red-200 text-xs underline cursor-pointer"
          >
            Dismiss
          </button>
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
