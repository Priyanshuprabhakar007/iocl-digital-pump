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

import { useActiveOutlet } from '../context/ActiveOutletContext';
import { getLocalMonthInputValue } from '../../shared/utils/dateUtils';
import './financialReportsModern.css';

export const ReportsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canGeneratePdf = hasPermission(PERMISSIONS.REPORTS_GENERATE);

  const { activeOutletId, accessibleOutlets: outlets, setActiveOutletId } = useActiveOutlet();
  const selectedOutletId = activeOutletId || '';
  const setSelectedOutletId = setActiveOutletId;

  const [selectedMonth, setSelectedMonth] = useState<string>(getLocalMonthInputValue());
  const [cutoffMode, setCutoffMode] = useState<'MONTH_END' | 'SELECTED_DATE' | 'LATEST_DATA'>('MONTH_END');
  const [cutoffDate, setCutoffDate] = useState<string>('');
  const [report, setReport] = useState<MonthlyOperationsReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // PDF UI State
  const [pdfLoading, setPdfLoading] = useState<boolean>(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

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
    if (!selectedOutletId || !selectedMonth) {
      setReport(null);
      return;
    }
    if (cutoffMode === 'SELECTED_DATE' && !cutoffDate) {
      setReport(null);
      return;
    }

    setLoading(true);
    setError(null);
    setReport(null); // Clear stale report data prior to fetching

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
    <div className="reports-modern mx-auto max-w-7xl space-y-6 pb-10">
      {/* Header */}
      <div className="phase3-surface flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-5 sm:p-6">
        <div>
          <h2 className="text-xl font-bold text-[#17365D] flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-orange-500" />
            Monthly Operations & Performance Report
          </h2>
          <p className="text-xs text-[#64748B] mt-1">
            Integrated operational summary across DG sets, fuel sales, equipment maintenance, and workforce.
          </p>
        </div>

        {/* Filters and Actions */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <div className="flex items-center gap-2 bg-[#F8FAFC] border border-[#D7E0EA] px-3 py-1.5 rounded-lg text-xs">
            <Building2 className="w-4 h-4 text-[#B8530D] shrink-0" />
            <select
              value={selectedOutletId}
              onChange={(e) => setSelectedOutletId(e.target.value)}
              className="bg-transparent text-[#17365D] font-medium focus:outline-none cursor-pointer"
            >
              {outlets.map((o) => (
                <option key={o.id} value={o.id} className="bg-white text-[#17365D]">
                  {o.name} ({o.roCode})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-[#F8FAFC] border border-[#D7E0EA] px-3 py-1.5 rounded-lg text-xs">
            <Calendar className="w-4 h-4 text-[#B8530D] shrink-0" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-[#17365D] font-medium focus:outline-none cursor-pointer"
            />
          </div>
          
          <select
            value={cutoffMode}
            onChange={(e) => setCutoffMode(e.target.value as any)}
            className="bg-[#F8FAFC] border border-[#D7E0EA] px-3 py-1.5 rounded-lg text-xs text-[#17365D]"
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
              className="bg-[#F8FAFC] border border-[#D7E0EA] px-3 py-1.5 rounded-lg text-xs text-[#17365D]"
            />
          )}

          <button
            onClick={fetchReport}
            disabled={loading}
            title="Refresh Report Data"
            className="p-2 text-[#475569] hover:text-[#17365D] rounded-lg bg-[#F1F5F9] hover:bg-[#E8EEF5] transition" aria-label="Refresh report"
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
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F1F5F9] hover:bg-[#E8EEF5] disabled:opacity-50 disabled:cursor-not-allowed border border-[#D7E0EA] text-[#334155] text-xs font-medium rounded-lg transition"
              >
                {pdfLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#64748B]" />
                ) : (
                  <Eye className="w-4 h-4 text-[#475569]" />
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
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#17365D] hover:bg-[#102A4A] disabled:opacity-50 disabled:cursor-not-allowed border border-[#17365D] text-white text-xs font-medium rounded-lg transition shadow-sm"
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

      <div aria-label="Report selection summary" className="flex flex-wrap items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 py-3 text-xs text-[#526477]">
        <FileText className="h-4 w-4 text-[#17365D]" />
        <span>Reporting period: <strong className="text-[#17365D]">{selectedMonth}</strong></span>
        <span aria-hidden="true">•</span>
        <span>Cutoff: <strong className="text-[#17365D]">{cutoffMode === 'MONTH_END' ? 'Complete Month' : cutoffMode === 'SELECTED_DATE' ? 'Selected Date' : 'Latest Data'}</strong></span>
        {cutoffMode === 'SELECTED_DATE' && cutoffDate && <span>({cutoffDate})</span>}
      </div>

      {/* JSON Report Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-800 text-xs shadow-md">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-700" />
          <span>{error}</span>
        </div>
      )}

      {/* PDF Error Display */}
      {pdfError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-3 text-red-800 text-xs shadow-md">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-700" />
            <span>{pdfError}</span>
          </div>
          <button
            onClick={() => setPdfError(null)}
            className="text-red-700 hover:text-red-200 text-xs underline cursor-pointer"
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
            <div className="phase3-surface p-5 space-y-3">
              <div className="flex items-center justify-between text-amber-700 font-bold text-sm">
                <span className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  DG Daily Operations
                </span>
                <span className="text-xs bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200 font-mono">
                  {report.dgSummary.totalLogs} Logs
                </span>
              </div>
              <div className="space-y-2 pt-2 border-t border-[#E2E8F0] text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Total Run Hours:</span>
                  <span className="text-[#17365D] font-bold">{report.dgSummary.totalRunHours} hrs</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Diesel Consumed:</span>
                  <span className="text-[#B8530D] font-bold">{report.dgSummary.totalDieselConsumedLitres} L</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Avg Daily Run:</span>
                  <span className="text-amber-800">{report.dgSummary.averageDailyRunHours} hrs/day</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Grid Failures:</span>
                  <span className="text-red-700">{report.dgSummary.totalGridFailureMinutes} mins</span>
                </div>
              </div>
            </div>

            {/* Fuel Sales Card */}
            <div className="phase3-surface p-5 space-y-3">
              <div className="flex items-center justify-between text-emerald-700 font-bold text-sm">
                <span className="flex items-center gap-2">
                  <Fuel className="w-5 h-5" />
                  Shift & Fuel Sales
                </span>
                <span className="text-xs bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200 font-mono">
                  {report.fuelSummary.totalShiftsCount} Shifts
                </span>
              </div>
              <div className="space-y-2 pt-2 border-t border-[#E2E8F0] text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Completed Shifts:</span>
                  <span className="text-[#17365D] font-bold">{report.fuelSummary.totalShiftsCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Reconciled Revenue:</span>
                  <span className="text-emerald-700 font-bold">
                    ₹{(report.fuelSummary.totalSalesPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Breakdown Maintenance Card */}
            <div className="phase3-surface p-5 space-y-3">
              <div className="flex items-center justify-between text-blue-700 font-bold text-sm">
                <span className="flex items-center gap-2">
                  <Wrench className="w-5 h-5" />
                  Equipment Breakdowns
                </span>
                <span className="text-xs bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200 font-mono">
                  {report.breakdownSummary.totalTickets} Tickets
                </span>
              </div>
              <div className="space-y-2 pt-2 border-t border-[#E2E8F0] text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Open Tickets:</span>
                  <span className="text-amber-700 font-bold">{report.breakdownSummary.openTickets}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Resolved Tickets:</span>
                  <span className="text-emerald-700 font-bold">{report.breakdownSummary.resolvedTickets}</span>
                </div>
              </div>
            </div>

            {/* HR Workforce Card */}
            <div className="phase3-surface p-5 space-y-3">
              <div className="flex items-center justify-between text-indigo-700 font-bold text-sm">
                <span className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Workforce & Staff
                </span>
                <span className="text-xs bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded border border-indigo-200 font-mono">
                  {report.hrSummary.totalStaff} Active Staff
                </span>
              </div>
              <div className="space-y-2 pt-2 border-t border-[#E2E8F0] text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Active Staff Count:</span>
                  <span className="text-[#17365D] font-bold">{report.hrSummary.totalStaff}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Staff Present Days:</span>
                  <span className="text-indigo-800 font-bold">{report.hrSummary.presentDaysCount} man-days</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
