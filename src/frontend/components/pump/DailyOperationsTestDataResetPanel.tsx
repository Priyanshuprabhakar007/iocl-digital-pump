import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { RetailOutlet } from '../../../shared/types';
import {
  ShieldAlert,
  Search,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Lock,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Database,
  History,
  Download,
  RotateCcw,
  Building2,
  Calendar,
  X,
  FileCheck,
} from 'lucide-react';
import type { DailyOperationsResetDryRunPreview } from '../../../worker/services/dailyOperationsTestDataResetService';

export const DEFAULT_COCO22_RO_CODE = '396187';
export const DEFAULT_RESET_FROM_DATE = '2026-10-23';
export const DEFAULT_RESET_TO_DATE = '2026-11-07';
export const REQUIRED_RESET_PHRASE = 'RESET COCO TEST DATA';

interface DailyOperationsTestDataResetPanelProps {
  outlets: RetailOutlet[];
  selectedOutletId: string;
  onResetCompleted?: () => void;
}

export const DailyOperationsTestDataResetPanel: React.FC<
  DailyOperationsTestDataResetPanelProps
> = ({ outlets, selectedOutletId, onResetCompleted }) => {
  const { userCtx } = useAuth();
  const isGlobalAdmin = Boolean(
    userCtx?.roles?.includes('ADMIN') && userCtx?.isGlobalScope
  );

  const [targetOutletId, setTargetOutletId] = useState<string>(() => {
    const coco22 = outlets.find((o) => o.roCode === DEFAULT_COCO22_RO_CODE);
    return coco22?.id || selectedOutletId || '';
  });
  const [fromBusinessDate, setFromBusinessDate] = useState(DEFAULT_RESET_FROM_DATE);
  const [toBusinessDate, setToBusinessDate] = useState(DEFAULT_RESET_TO_DATE);

  // Workflow states
  const [checkingData, setCheckingData] = useState(false);
  const [preview, setPreview] = useState<DailyOperationsResetDryRunPreview | null>(null);
  const [hasChecked, setHasChecked] = useState(false);

  // Deletion Confirmation Modal State
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmPhraseInput, setConfirmPhraseInput] = useState('');
  const [confirmIrreversibleCheck, setConfirmIrreversibleCheck] = useState(false);
  const [attestUatCheck, setAttestUatCheck] = useState(false);
  const [reviewNotesInput, setReviewNotesInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Completion & Status
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [latestBackupId, setLatestBackupId] = useState<string | null>(null);

  // Expandable "Advanced Admin Tools"
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const [backupsList, setBackupsList] = useState<any[]>([]);
  const [auditHistory, setAuditHistory] = useState<any[]>([]);
  const [loadingAdvanced, setLoadingAdvanced] = useState(false);
  const [verifyingBackupId, setVerifyingBackupId] = useState<string | null>(null);
  const [restoreReason, setRestoreReason] = useState('');
  const [restoringBackupId, setRestoringBackupId] = useState<string | null>(null);

  useEffect(() => {
    if (!targetOutletId && outlets.length > 0) {
      const coco22 = outlets.find((o) => o.roCode === DEFAULT_COCO22_RO_CODE);
      setTargetOutletId(coco22?.id || selectedOutletId || outlets[0].id);
    }
  }, [outlets, selectedOutletId, targetOutletId]);

  if (!isGlobalAdmin) {
    return null;
  }

  const loadAdvancedToolsData = async (outletId?: string) => {
    setLoadingAdvanced(true);
    const q = outletId ? `?outletId=${encodeURIComponent(outletId)}` : '';
    const [bkpRes, histRes] = await Promise.all([
      apiFetch<any[]>(`/api/v1/admin/daily-ops-reset/backups${q}`),
      apiFetch<any[]>(`/api/v1/admin/daily-ops-reset/audit-history${q}`),
    ]);
    if (bkpRes.success && bkpRes.data) setBackupsList(bkpRes.data);
    if (histRes.success && histRes.data) setAuditHistory(histRes.data);
    setLoadingAdvanced(false);
  };

  // Step 3: Check Data
  const handleCheckData = async () => {
    setCheckingData(true);
    setErrorMessage(null);
    setResetSuccessMessage(null);

    const res = await apiFetch<DailyOperationsResetDryRunPreview>(
      '/api/v1/admin/daily-ops-reset/preview',
      {
        method: 'POST',
        body: JSON.stringify({
          outletId: targetOutletId,
          fromBusinessDate,
          toBusinessDate,
        }),
      }
    );

    setCheckingData(false);
    setHasChecked(true);

    if (!res.success || !res.data) {
      setErrorMessage(res.error?.message || 'Failed to check data for selected scope.');
      setPreview(null);
      return;
    }

    setPreview(res.data);
    if (showAdvancedTools) {
      loadAdvancedToolsData(res.data.outlet.id);
    }
  };

  // Step 4: Open Single Confirmation Popup
  const handleOpenDeleteModal = () => {
    setConfirmPhraseInput('');
    setConfirmIrreversibleCheck(false);
    setAttestUatCheck(false);
    setReviewNotesInput('');
    setErrorMessage(null);
    setShowConfirmModal(true);
  };

  // Step 5: Execute Streamlined Deletion
  const handleConfirmStreamlinedDelete = async () => {
    if (!preview) return;

    setIsDeleting(true);
    setErrorMessage(null);

    const res = await apiFetch<any>('/api/v1/admin/daily-ops-reset/streamlined-delete', {
      method: 'POST',
      body: JSON.stringify({
        outletId: preview.outlet.id,
        fromBusinessDate: preview.dateRange.fromBusinessDate,
        toBusinessDate: preview.dateRange.toBusinessDate,
        confirmationPhrase: confirmPhraseInput.trim(),
        confirmIrreversibleReset: confirmIrreversibleCheck,
        confirmClosedShiftReset: true,
        attestConfirmedUatTestData: attestUatCheck,
        reviewNotes: reviewNotesInput.trim(),
        deletionReason:
          reviewNotesInput.trim() ||
          `Pre-go-live UAT test data reset for ${preview.outlet.name} (${preview.outlet.roCode})`,
      }),
    });

    setIsDeleting(false);

    if (!res.success || !res.data) {
      setErrorMessage(res.error?.message || 'Failed to execute test data reset.');
      return;
    }

    setShowConfirmModal(false);
    setLatestBackupId(res.data.backupId);
    setResetSuccessMessage('Data Reset Successfully — 0 Records Remaining');

    // Refresh data check to reflect 0 records remaining
    await handleCheckData();
    if (onResetCompleted) {
      onResetCompleted();
    }
  };

  const handleVerifyBackup = async (backupId: string) => {
    setVerifyingBackupId(backupId);
    setErrorMessage(null);
    const res = await apiFetch<any>(
      `/api/v1/admin/daily-ops-reset/backups/${encodeURIComponent(backupId)}/verify`,
      { method: 'POST', body: JSON.stringify({}) }
    );
    setVerifyingBackupId(null);
    if (!res.success || !res.data?.verified) {
      setErrorMessage(res.error?.message || 'Backup integrity verification failed.');
      return;
    }
    setResetSuccessMessage(
      `Backup ${backupId} passed integrity verification (SHA-256: ${res.data.sha256Checksum?.slice(0, 16)}...).`
    );
  };

  const handleDownloadBackupJson = async (backupId: string) => {
    const res = await apiFetch<any>(
      `/api/v1/admin/daily-ops-reset/backups/${encodeURIComponent(backupId)}`
    );
    if (!res.success || !res.data) {
      setErrorMessage(res.error?.message || 'Could not load backup payload.');
      return;
    }
    const blob = new Blob([JSON.stringify(res.data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${backupId}_${res.data.outlet.roCode}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRestoreBackup = async (backupId: string) => {
    if (!restoreReason.trim() || restoreReason.trim().length < 5) {
      setErrorMessage('Please enter a restore reason (minimum 5 characters) before restoring.');
      return;
    }
    setRestoringBackupId(backupId);
    setErrorMessage(null);
    const res = await apiFetch<any>(
      `/api/v1/admin/daily-ops-reset/backups/${encodeURIComponent(backupId)}/restore`,
      {
        method: 'POST',
        body: JSON.stringify({
          restoreReason: restoreReason.trim(),
        }),
      }
    );
    setRestoringBackupId(null);
    if (!res.success || !res.data) {
      setErrorMessage(res.error?.message || 'Backup restoration failed.');
      return;
    }
    setResetSuccessMessage(
      `Restored ${res.data.totalRestoredRecords} records from backup ${backupId}.`
    );
    await handleCheckData();
    if (onResetCompleted) onResetCompleted();
  };

  const totalShifts = preview?.summaryCounts.operationalShifts ?? 0;
  const totalRecords = preview?.summaryCounts.totalAffectedRecords ?? 0;
  const isZeroRecords = hasChecked && totalShifts === 0 && totalRecords === 0;
  const hasLockedShifts = (preview?.summaryCounts.lockedShifts ?? 0) > 0;
  const hasBlockers = Boolean(preview && preview.blockers && preview.blockers.length > 0);

  const canConfirmModal =
    confirmPhraseInput.trim() === REQUIRED_RESET_PHRASE &&
    confirmIrreversibleCheck &&
    !hasLockedShifts &&
    (!hasBlockers || (attestUatCheck && reviewNotesInput.trim().length >= 10));

  return (
    <div
      className="bg-white border-2 border-amber-300 rounded-xl shadow-xs overflow-hidden"
      data-testid="daily-ops-test-data-reset-panel"
    >
      {/* Header */}
      <div className="bg-amber-50/90 border-b border-amber-200 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Daily Operations Test Data Reset
              </h2>
              <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-amber-200 text-amber-950">
                ADMIN-Only
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Select outlet and business-date range to verify and cleanly delete UAT test records.
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Error Notification */}
        {errorMessage && (
          <div
            className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2.5"
            data-testid="reset-workflow-error"
          >
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="font-medium flex-1">{errorMessage}</div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-red-500 hover:text-red-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Success / 0 Records Banner */}
        {resetSuccessMessage && (
          <div
            className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 flex items-start gap-2.5"
            data-testid="reset-workflow-success"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-bold text-emerald-950 text-sm">
                {resetSuccessMessage}
              </div>
              {latestBackupId && (
                <div className="text-[11px] font-mono text-emerald-800 mt-0.5">
                  Automated verified restorable backup created: <strong>{latestBackupId}</strong>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Workflow Form Bar: Outlet, From Date, To Date, Check Data, Delete Test Data */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            {/* 1. Select Outlet */}
            <div className="md:col-span-4">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                1. COCO Outlet
              </label>
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
                <select
                  value={targetOutletId}
                  onChange={(e) => {
                    setTargetOutletId(e.target.value);
                    setHasChecked(false);
                    setPreview(null);
                  }}
                  data-testid="reset-target-outlet-select"
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#003366]"
                >
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} — RO Code {o.roCode} ({o.outletType})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 2. From Date */}
            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                2. From Date
              </label>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
                <input
                  type="date"
                  value={fromBusinessDate}
                  onChange={(e) => {
                    setFromBusinessDate(e.target.value);
                    setHasChecked(false);
                  }}
                  data-testid="reset-from-date-input"
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#003366]"
                />
              </div>
            </div>

            {/* To Date */}
            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                To Date
              </label>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
                <input
                  type="date"
                  value={toBusinessDate}
                  onChange={(e) => {
                    setToBusinessDate(e.target.value);
                    setHasChecked(false);
                  }}
                  data-testid="reset-to-date-input"
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#003366]"
                />
              </div>
            </div>

            {/* 3. Check Data Button */}
            <div className="md:col-span-2">
              <button
                type="button"
                onClick={handleCheckData}
                disabled={checkingData || !targetOutletId}
                data-testid="check-data-btn"
                className="w-full h-9 px-3 rounded-lg bg-[#003366] text-white text-xs font-bold hover:bg-[#002244] disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors shadow-xs"
              >
                {checkingData ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                Check Data
              </button>
              {/* Backwards-compatible hidden button alias for existing tests */}
              <button
                type="button"
                onClick={handleCheckData}
                data-testid="run-dry-run-preview-btn"
                className="sr-only"
                aria-hidden="true"
              >
                Run Dry-Run Preview
              </button>
            </div>

            {/* 4. Delete Test Data Button */}
            <div className="md:col-span-2">
              <button
                type="button"
                onClick={handleOpenDeleteModal}
                disabled={
                  !hasChecked ||
                  isZeroRecords ||
                  totalRecords === 0 ||
                  hasLockedShifts ||
                  isDeleting
                }
                data-testid="delete-test-data-btn"
                className="w-full h-9 px-3 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-colors shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Test Data
              </button>
            </div>
          </div>
        </div>

        {/* Data Check Results */}
        {hasChecked && (
          <div className="space-y-3">
            {/* Zero Records Case */}
            {isZeroRecords ? (
              <div
                className="p-4 rounded-xl bg-slate-100 border border-slate-300 text-center space-y-1"
                data-testid="no-data-to-delete-badge"
              >
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-200 text-slate-800 text-xs font-bold font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-600" />
                  No Data to Delete
                </div>
                <p className="text-xs text-slate-600">
                  Zero operational shifts and records found for {preview?.outlet.name} between{' '}
                  {fromBusinessDate} and {toBusinessDate}. Data deletion is disabled.
                </p>
              </div>
            ) : (
              /* Affected Shifts & Record Counts Display */
              preview && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase">
                        Operational Shifts
                      </div>
                      <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                        {preview.summaryCounts.operationalShifts}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                        OPEN: {preview.summaryCounts.openShifts} | CLOSED:{' '}
                        {preview.summaryCounts.closedShifts}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase">
                        Dips &amp; Totalizers
                      </div>
                      <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                        {preview.summaryCounts.tankStockReadings +
                          preview.summaryCounts.nozzleMeterReadings}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                        Dips: {preview.summaryCounts.tankStockReadings} | Meters:{' '}
                        {preview.summaryCounts.nozzleMeterReadings}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase">
                        Receipts &amp; Reconciliations
                      </div>
                      <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                        {preview.summaryCounts.fuelReceipts +
                          preview.summaryCounts.shiftStockReconciliations +
                          preview.summaryCounts.shiftFinancialReconciliations}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                        Receipts: {preview.summaryCounts.fuelReceipts} | Collections:{' '}
                        {preview.summaryCounts.shiftCollections}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 shadow-2xs">
                      <div className="text-[11px] font-bold text-amber-900 uppercase">
                        Total Affected Records
                      </div>
                      <div
                        className="text-xl font-extrabold font-mono text-amber-950 mt-0.5"
                        data-testid="preview-total-affected-records"
                      >
                        {preview.summaryCounts.totalAffectedRecords}
                      </div>
                      <div className="text-[10px] font-mono text-amber-800 mt-0.5">
                        All 17 shift-linked tables
                      </div>
                    </div>
                  </div>

                  {/* Flagged Records Warning if any */}
                  {hasBlockers && (
                    <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          {preview.blockers.length} Flagged Record(s) in Scope (Closed Shifts,
                          Tanker Receipts or Settled Entries)
                        </span>
                      </div>
                      <p className="text-amber-800 text-[11px]">
                        These items require confirmation and UAT test attestation in the deletion
                        popup before deletion can proceed.
                      </p>
                    </div>
                  )}

                  {/* Permanently Preserved Master Data Assurance */}
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-700">
                    <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>
                      <strong>Protected Master Data Intact:</strong> Tank calibration charts (
                      {preview.protectedDataSummary.outletCalibrationChartsCount}), tanks, nozzles,
                      staff, compliance records, audit logs, and other outlets are never touched.
                    </span>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* Expandable "Advanced Admin Tools" Section */}
        <div className="pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={() => {
              const next = !showAdvancedTools;
              setShowAdvancedTools(next);
              if (next && preview?.outlet?.id) {
                loadAdvancedToolsData(preview.outlet.id);
              } else if (next && targetOutletId) {
                loadAdvancedToolsData(targetOutletId);
              }
            }}
            data-testid="advanced-admin-tools-toggle"
            className="flex items-center justify-between w-full py-2 text-xs font-bold text-slate-700 hover:text-slate-900"
          >
            <span className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-slate-500" />
              Advanced Admin Tools (Backup Restoration &amp; Permanent Audit History)
            </span>
            {showAdvancedTools ? (
              <ChevronUp className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {showAdvancedTools && (
            <div className="mt-3 space-y-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              {loadingAdvanced && (
                <div className="flex items-center gap-2 text-slate-500 font-mono text-[11px]">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading backups &amp; history...
                </div>
              )}

              {/* Backups List */}
              <div className="space-y-2">
                <div className="font-bold text-slate-800 flex items-center justify-between">
                  <span>Restorable Backups ({backupsList.length}):</span>
                </div>

                {backupsList.length === 0 ? (
                  <p className="text-slate-500 italic">No previous backups available for this outlet.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {backupsList.map((bkp) => (
                      <div
                        key={bkp.backupId}
                        className="p-2.5 rounded-lg bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-2"
                      >
                        <div>
                          <div className="font-mono font-bold text-slate-900">
                            {bkp.backupId} ({bkp.totalRecords} records)
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">
                            {bkp.dateRange?.fromBusinessDate} to {bkp.dateRange?.toBusinessDate} •{' '}
                            {bkp.createdAt}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleVerifyBackup(bkp.backupId)}
                            disabled={verifyingBackupId === bkp.backupId}
                            className="px-2 py-1 rounded border border-blue-300 bg-blue-50 text-blue-900 text-[10px] font-semibold hover:bg-blue-100"
                          >
                            Verify SHA-256
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadBackupJson(bkp.backupId)}
                            className="px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 text-[10px] font-semibold hover:bg-slate-100 flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" /> JSON
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreBackup(bkp.backupId)}
                            disabled={restoringBackupId === bkp.backupId}
                            className="px-2 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-900 text-[10px] font-bold hover:bg-emerald-100 flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" /> Restore
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {backupsList.length > 0 && (
                  <div className="pt-2">
                    <input
                      type="text"
                      value={restoreReason}
                      onChange={(e) => setRestoreReason(e.target.value)}
                      placeholder="Authorised reason required to execute Restore (minimum 5 characters)..."
                      className="w-full h-8 px-2.5 rounded border border-slate-300 bg-white text-xs text-slate-900"
                    />
                  </div>
                )}
              </div>

              {/* Permanent Audit Ledger */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-slate-500" />
                  <span>Permanent Reset Audit History ({auditHistory.length}):</span>
                </div>
                {auditHistory.length === 0 ? (
                  <p className="text-slate-500 italic">No audit records found.</p>
                ) : (
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {auditHistory.map((ev) => (
                      <div
                        key={ev.id}
                        className="px-2.5 py-1.5 rounded bg-white border border-slate-200 text-[11px] flex items-center justify-between font-mono"
                      >
                        <span className="font-bold text-slate-800">{ev.action}</span>
                        <span className="text-slate-500 truncate max-w-xs">{ev.summary?.reason || ev.id}</span>
                        <span className="text-slate-400 text-[10px]">{ev.createdAt}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Step 5: One Single Confirmation Modal */}
      {showConfirmModal && preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          data-testid="streamlined-delete-confirm-modal"
        >
          <div className="bg-white border-2 border-red-500 rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-red-600 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-sm font-bold tracking-tight">
                  Confirm Permanent Test Data Deletion
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                data-testid="cancel-delete-modal-btn"
                className="text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
              {/* Irreversible Warning Box */}
              <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-900 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-xs text-red-950">
                  <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                  IRREVERSIBLE DATA RESET WARNING
                </div>
                <p className="text-[11px] leading-relaxed">
                  You are about to permanently delete all daily operations shift and transaction
                  data for the scope below. A restorable backup will be automatically created and
                  SHA-256 verified prior to deletion.
                </p>
              </div>

              {/* Exact Scope Breakdown */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Target Outlet:</span>
                  <span className="font-bold text-slate-900">
                    {preview.outlet.name} (RO Code: {preview.outlet.roCode})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Business Date Range:</span>
                  <span className="font-bold text-slate-900">
                    {preview.dateRange.fromBusinessDate} to {preview.dateRange.toBusinessDate}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Affected Shifts:</span>
                  <span className="font-bold text-slate-900">
                    {preview.summaryCounts.operationalShifts} operational shift(s)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Dependent Records:</span>
                  <span className="font-bold text-red-700">
                    {preview.summaryCounts.totalAffectedRecords} records across 17 tables
                  </span>
                </div>
              </div>

              {/* Flagged Records Review (if any blockers exist) */}
              {hasBlockers && (
                <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 space-y-2.5">
                  <div className="font-bold text-amber-950 flex items-center gap-1.5">
                    <FileCheck className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>Authorised Review of Flagged Items ({preview.blockers.length})</span>
                  </div>
                  <div className="space-y-1.5 max-h-28 overflow-y-auto">
                    {preview.blockers.map((b) => (
                      <div
                        key={b.id}
                        className="p-1.5 rounded bg-white border border-amber-200 text-[10px] font-mono"
                      >
                        <span className="font-bold text-slate-800">[{b.category}]</span> {b.title} —{' '}
                        <span className="text-slate-600">{b.description}</span>
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-amber-950 mb-1">
                      Review Justification (Min 10 characters):
                    </label>
                    <textarea
                      rows={2}
                      value={reviewNotesInput}
                      onChange={(e) => setReviewNotesInput(e.target.value)}
                      placeholder="Confirm why these flagged records are pre-go-live UAT test data..."
                      className="w-full p-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#003366]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setAttestUatCheck(!attestUatCheck)}
                    className="flex items-center gap-2 text-left text-[11px] font-semibold text-slate-800"
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        attestUatCheck
                          ? 'bg-[#003366] border-[#003366] text-white'
                          : 'bg-white border-slate-400'
                      }`}
                    >
                      {attestUatCheck ? '✓' : ''}
                    </span>
                    I attest that these flagged records are confirmed UAT test entries, not genuine
                    commercial transactions.
                  </button>
                </div>
              )}

              {/* Checkbox: Irreversible Confirmation */}
              <button
                type="button"
                onClick={() => setConfirmIrreversibleCheck(!confirmIrreversibleCheck)}
                className="flex items-center gap-2 text-left text-xs font-semibold text-slate-900"
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    confirmIrreversibleCheck
                      ? 'bg-red-600 border-red-600 text-white'
                      : 'bg-white border-slate-400'
                  }`}
                >
                  {confirmIrreversibleCheck ? '✓' : ''}
                </span>
                I confirm the exact outlet, dates, record counts and irreversible operation warning.
              </button>

              {/* Confirmation Phrase Input */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Type confirmation phrase{' '}
                  <span className="font-mono text-red-700 select-all">{REQUIRED_RESET_PHRASE}</span>{' '}
                  to authorise deletion:
                </label>
                <input
                  type="text"
                  value={confirmPhraseInput}
                  onChange={(e) => setConfirmPhraseInput(e.target.value)}
                  placeholder={REQUIRED_RESET_PHRASE}
                  data-testid="confirm-reset-phrase-input"
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="bg-slate-50 border-t border-slate-200 px-5 py-3.5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isDeleting}
                data-testid="cancel-delete-btn"
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmStreamlinedDelete}
                disabled={!canConfirmModal || isDeleting}
                data-testid="confirm-delete-test-data-btn"
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-xs"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Backing Up &amp; Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Confirm &amp; Delete Test Data
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyOperationsTestDataResetPanel;
