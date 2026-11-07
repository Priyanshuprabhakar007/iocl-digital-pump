import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { RetailOutlet } from '../../../shared/types';
import {
  ShieldAlert,
  FileSearch,
  DatabaseBackup,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Lock,
  RotateCcw,
  Download,
  ChevronDown,
  ChevronRight,
  FileCheck2,
  Trash2,
  Building2,
  Calendar,
} from 'lucide-react';
import type {
  DailyOperationsResetDryRunPreview,
  DailyOperationsResetApprovalRecord,
} from '../../../worker/services/dailyOperationsTestDataResetService';

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

  const [isOpen, setIsOpen] = useState(false);
  const [targetOutletId, setTargetOutletId] = useState<string>(() => {
    const coco22 = outlets.find((o) => o.roCode === DEFAULT_COCO22_RO_CODE);
    return coco22?.id || selectedOutletId || '';
  });
  const [fromBusinessDate, setFromBusinessDate] = useState(DEFAULT_RESET_FROM_DATE);
  const [toBusinessDate, setToBusinessDate] = useState(DEFAULT_RESET_TO_DATE);

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [preview, setPreview] = useState<DailyOperationsResetDryRunPreview | null>(null);
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});

  // Blocker review state
  const [selectedBlockerIds, setSelectedBlockerIds] = useState<string[]>([]);
  const [blockerReviewNotes, setBlockerReviewNotes] = useState('');
  const [attestUatData, setAttestUatData] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);

  // Backup state
  const [backupReason, setBackupReason] = useState(
    'Pre-go-live UAT test data backup for COCO 22 (2026-10-23 to 2026-11-07)'
  );
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [activeBackup, setActiveBackup] = useState<{
    backupId: string;
    sha256Checksum: string;
    totalRecords: number;
    createdAt: string;
    r2ObjectKey: string | null;
    verified: boolean;
  } | null>(null);
  const [backupsList, setBackupsList] = useState<any[]>([]);
  const [verifyingBackupId, setVerifyingBackupId] = useState<string | null>(null);

  // Restore state
  const [restoreReason, setRestoreReason] = useState('');
  const [restoringBackupId, setRestoringBackupId] = useState<string | null>(null);

  // Approval & Execution state
  const [approvalReason, setApprovalReason] = useState('');
  const [confirmIrreversible, setConfirmIrreversible] = useState(false);
  const [confirmClosedShifts, setConfirmClosedShifts] = useState(false);
  const [confirmationPhrase, setConfirmationPhrase] = useState('');
  const [approvingReset, setApprovingReset] = useState(false);
  const [activeApproval, setActiveApproval] =
    useState<DailyOperationsResetApprovalRecord | null>(null);
  const [executingReset, setExecutingReset] = useState(false);
  const [postResetResult, setPostResetResult] = useState<any | null>(null);
  const [auditHistory, setAuditHistory] = useState<any[]>([]);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!targetOutletId && outlets.length > 0) {
      const coco22 = outlets.find((o) => o.roCode === DEFAULT_COCO22_RO_CODE);
      setTargetOutletId(coco22?.id || selectedOutletId || outlets[0].id);
    }
  }, [outlets, selectedOutletId, targetOutletId]);

  if (!isGlobalAdmin) {
    return null;
  }

  const loadBackupsAndHistory = async (outletIdentifier?: string) => {
    const q = outletIdentifier ? `?outletId=${encodeURIComponent(outletIdentifier)}` : '';
    const [bkpRes, histRes] = await Promise.all([
      apiFetch<any[]>(`/api/v1/admin/daily-ops-reset/backups${q}`),
      apiFetch<any[]>(`/api/v1/admin/daily-ops-reset/audit-history${q}`),
    ]);
    if (bkpRes.success && bkpRes.data) {
      setBackupsList(bkpRes.data);
    }
    if (histRes.success && histRes.data) {
      setAuditHistory(histRes.data);
    }
  };

  const handleRunDryRunPreview = async () => {
    setLoadingPreview(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setPostResetResult(null);

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

    setLoadingPreview(false);
    if (!res.success || !res.data) {
      setErrorMsg(res.error?.message || 'Failed to generate dry-run preview.');
      return;
    }

    setPreview(res.data);
    const expanded: Record<string, boolean> = {};
    for (const grp of res.data.groupedByBusinessDate) {
      expanded[grp.businessDate] = true;
    }
    setExpandedDates(expanded);

    const unreviewedIds = res.data.blockers
      .filter((b) => !b.reviewed)
      .map((b) => b.id);
    setSelectedBlockerIds(unreviewedIds);

    await loadBackupsAndHistory(res.data.outlet.id);
    setSuccessMsg(
      `Dry-run preview generated for ${res.data.outlet.name} (${res.data.outlet.roCode}): ${res.data.summaryCounts.operationalShifts} shift(s), ${res.data.summaryCounts.totalAffectedRecords} total record(s) in range.`
    );
  };

  const handleReviewBlockers = async () => {
    if (!preview) return;
    setSubmittingReview(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const res = await apiFetch<{
      review: any;
      preview: DailyOperationsResetDryRunPreview;
    }>('/api/v1/admin/daily-ops-reset/review-blockers', {
      method: 'POST',
      body: JSON.stringify({
        outletId: preview.outlet.id,
        fromBusinessDate: preview.dateRange.fromBusinessDate,
        toBusinessDate: preview.dateRange.toBusinessDate,
        blockerIds: selectedBlockerIds,
        reviewNotes: blockerReviewNotes,
        attestConfirmedUatTestData: attestUatData,
      }),
    });

    setSubmittingReview(false);
    if (!res.success || !res.data) {
      setErrorMsg(res.error?.message || 'Failed to record blocker review.');
      return;
    }

    setPreview(res.data.preview);
    setSelectedBlockerIds(
      res.data.preview.blockers.filter((b) => !b.reviewed).map((b) => b.id)
    );
    setSuccessMsg(
      `Recorded authorised owner review for ${selectedBlockerIds.length} blocker(s).`
    );
    await loadBackupsAndHistory(preview.outlet.id);
  };

  const handleCreateBackup = async () => {
    if (!preview) return;
    setCreatingBackup(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const res = await apiFetch<any>('/api/v1/admin/daily-ops-reset/backups', {
      method: 'POST',
      body: JSON.stringify({
        outletId: preview.outlet.id,
        fromBusinessDate: preview.dateRange.fromBusinessDate,
        toBusinessDate: preview.dateRange.toBusinessDate,
        reason: backupReason,
      }),
    });

    setCreatingBackup(false);
    if (!res.success || !res.data) {
      setErrorMsg(res.error?.message || 'Failed to create restorable backup.');
      return;
    }

    setActiveBackup({
      backupId: res.data.backupId,
      sha256Checksum: res.data.sha256Checksum,
      totalRecords: res.data.inventory.totalRecords,
      createdAt: res.data.createdAt,
      r2ObjectKey: res.data.r2ObjectKey,
      verified: Boolean(res.data.verification?.verified),
    });
    setActiveApproval(null);
    setSuccessMsg(
      `Restorable backup ${res.data.backupId} created and SHA-256 verified (${res.data.inventory.totalRecords} records).`
    );
    await loadBackupsAndHistory(preview.outlet.id);
  };

  const handleVerifyBackup = async (backupId: string) => {
    setVerifyingBackupId(backupId);
    setErrorMsg(null);
    setSuccessMsg(null);

    const res = await apiFetch<any>(
      `/api/v1/admin/daily-ops-reset/backups/${encodeURIComponent(backupId)}/verify`,
      { method: 'POST', body: JSON.stringify({}) }
    );
    setVerifyingBackupId(null);

    if (!res.success || !res.data?.verified) {
      setErrorMsg(res.error?.message || 'Backup integrity verification failed.');
      return;
    }

    setSuccessMsg(
      `Backup ${backupId} passed SHA-256 checksum (${res.data.sha256Checksum.slice(0, 16)}...) and record inventory verification (${res.data.totalRecords} records).`
    );
  };

  const handleDownloadBackupJson = async (backupId: string) => {
    const res = await apiFetch<any>(
      `/api/v1/admin/daily-ops-reset/backups/${encodeURIComponent(backupId)}`
    );
    if (!res.success || !res.data) {
      setErrorMsg(res.error?.message || 'Could not load backup payload.');
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

  const handleApproveReset = async () => {
    if (!preview || !activeBackup) return;
    setApprovingReset(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const res = await apiFetch<DailyOperationsResetApprovalRecord>(
      '/api/v1/admin/daily-ops-reset/approvals',
      {
        method: 'POST',
        body: JSON.stringify({
          backupId: activeBackup.backupId,
          outletId: preview.outlet.id,
          fromBusinessDate: preview.dateRange.fromBusinessDate,
          toBusinessDate: preview.dateRange.toBusinessDate,
          approvalReason,
          confirmIrreversibleReset: confirmIrreversible,
          confirmClosedShiftReset: confirmClosedShifts,
          confirmationPhrase,
        }),
      }
    );

    setApprovingReset(false);
    if (!res.success || !res.data) {
      setErrorMsg(res.error?.message || 'Failed to record administrator approval.');
      return;
    }

    setActiveApproval(res.data);
    setSuccessMsg(
      `Administrator approval ${res.data.approvalId} recorded for backup ${res.data.backupId}.`
    );
    await loadBackupsAndHistory(preview.outlet.id);
  };

  const handleExecuteReset = async () => {
    if (!activeApproval || !activeBackup) return;
    setExecutingReset(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const res = await apiFetch<any>('/api/v1/admin/daily-ops-reset/execute', {
      method: 'POST',
      body: JSON.stringify({
        approvalId: activeApproval.approvalId,
        backupId: activeBackup.backupId,
        confirmationPhrase,
        executionNotes: approvalReason,
      }),
    });

    setExecutingReset(false);
    if (!res.success || !res.data) {
      setErrorMsg(res.error?.message || 'Atomic reset execution failed.');
      return;
    }

    setPostResetResult(res.data);
    setActiveApproval({ ...activeApproval, status: 'EXECUTED' });
    setSuccessMsg(
      `Authorised UAT reset executed atomically (Audit ID: ${res.data.executionAuditId}). All post-reset integrity checks passed.`
    );
    await handleRunDryRunPreview();
    if (onResetCompleted) onResetCompleted();
  };

  const handleRestoreBackup = async (backupId: string) => {
    if (!restoreReason.trim() || restoreReason.trim().length < 5) {
      setErrorMsg('Please enter a restore reason (minimum 5 characters) before restoring.');
      return;
    }
    setRestoringBackupId(backupId);
    setErrorMsg(null);
    setSuccessMsg(null);

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
      setErrorMsg(res.error?.message || 'Backup restoration failed.');
      return;
    }

    setSuccessMsg(
      `Restored ${res.data.restoredCounts.totalRecords} record(s) from backup ${backupId} (Audit ID: ${res.data.restoreAuditId}).`
    );
    await handleRunDryRunPreview();
    if (onResetCompleted) onResetCompleted();
  };

  return (
    <div
      className="bg-white border-2 border-amber-300 rounded-xl shadow-xs overflow-hidden"
      data-testid="daily-ops-test-data-reset-panel"
    >
      {/* Header Banner */}
      <div className="bg-amber-50/90 border-b border-amber-200 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">
                Daily Operations Test Data Reset (ADMIN-Only Controlled Workflow)
              </h2>
              <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-amber-200 text-amber-950">
                UAT Pre-Go-Live Safeguard
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Dry-Run Preview • Official Data Blocker Detection • SHA-256 Restorable Backup •
              Separate Admin Approval • Atomic FK-Safe Reset
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            const next = !isOpen;
            setIsOpen(next);
            if (next && !preview) {
              handleRunDryRunPreview();
            }
          }}
          data-testid="toggle-daily-ops-reset-panel-btn"
          className="px-3.5 py-2 rounded-lg text-xs font-bold bg-[#003366] text-white hover:bg-[#002244] transition-colors flex items-center gap-1.5 shrink-0"
        >
          <FileSearch className="w-3.5 h-3.5" />
          {isOpen ? 'Hide Reset Workspace' : 'Open Dry-Run Preview & Backup'}
        </button>
      </div>

      {isOpen && (
        <div className="p-5 space-y-6">
          {/* Feedback Banners */}
          {errorMsg && (
            <div
              className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2.5"
              data-testid="reset-workflow-error"
            >
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="font-medium">{errorMsg}</div>
            </div>
          )}
          {successMsg && (
            <div
              className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2.5"
              data-testid="reset-workflow-success"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="font-medium">{successMsg}</div>
            </div>
          )}

          {/* Step 1: Scope & Dry-Run Preview Controls */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="flex flex-col md:flex-row md:items-end gap-4">
              <div className="flex-1">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Target Retail Outlet (COCO)
                </label>
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
                  <select
                    value={targetOutletId}
                    onChange={(e) => setTargetOutletId(e.target.value)}
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

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  From Business Date (Inclusive)
                </label>
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
                  <input
                    type="date"
                    value={fromBusinessDate}
                    onChange={(e) => setFromBusinessDate(e.target.value)}
                    data-testid="reset-from-date-input"
                    className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-mono font-semibold text-slate-900 caret-slate-900 focus:outline-none focus:ring-2 focus:ring-[#003366]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  To Business Date (Inclusive)
                </label>
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
                  <input
                    type="date"
                    value={toBusinessDate}
                    onChange={(e) => setToBusinessDate(e.target.value)}
                    data-testid="reset-to-date-input"
                    className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-mono font-semibold text-slate-900 caret-slate-900 focus:outline-none focus:ring-2 focus:ring-[#003366]"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleRunDryRunPreview}
                disabled={loadingPreview}
                data-testid="run-dry-run-preview-btn"
                className="h-9 px-4 rounded-lg bg-[#003366] text-white text-xs font-bold hover:bg-[#002244] disabled:opacity-50 flex items-center gap-2 shrink-0"
              >
                {loadingPreview ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileSearch className="w-3.5 h-3.5" />
                )}
                1. Run Dry-Run Preview
              </button>
            </div>
          </div>

          {preview && (
            <div className="space-y-6">
              {/* Summary Metrics Grid */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2.5">
                  Dry-Run Preview Summary — {preview.outlet.name} (RO Code: {preview.outlet.roCode}
                  ) • {preview.dateRange.fromBusinessDate} to {preview.dateRange.toBusinessDate}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-[11px] text-slate-500 font-semibold">
                      Operational Shifts
                    </div>
                    <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
                      {preview.summaryCounts.operationalShifts}
                    </div>
                    <div className="text-[10px] font-mono text-slate-600 mt-0.5">
                      OPEN: {preview.summaryCounts.openShifts} | CLOSED:{' '}
                      {preview.summaryCounts.closedShifts} | LOCKED:{' '}
                      {preview.summaryCounts.lockedShifts}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-[11px] text-slate-500 font-semibold">
                      Tank Dips &amp; Water Readings
                    </div>
                    <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
                      {preview.summaryCounts.tankStockReadings}
                    </div>
                    <div className="text-[10px] font-mono text-slate-600 mt-0.5">
                      Open: {preview.summaryCounts.openingTankDips} | Close:{' '}
                      {preview.summaryCounts.closingTankDips} | Water:{' '}
                      {preview.summaryCounts.waterDipPositiveReadings}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-[11px] text-slate-500 font-semibold">
                      Nozzle Totalizers &amp; Testing
                    </div>
                    <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
                      {preview.summaryCounts.nozzleMeterReadings}
                    </div>
                    <div className="text-[10px] font-mono text-slate-600 mt-0.5">
                      With Testing &gt; 0L: {preview.summaryCounts.nozzleTestingPositiveReadings}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-[11px] text-slate-500 font-semibold">
                      Fuel Receipts &amp; Lines
                    </div>
                    <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
                      {preview.summaryCounts.fuelReceipts} /{' '}
                      {preview.summaryCounts.fuelReceiptTankLines}
                    </div>
                    <div className="text-[10px] font-mono text-slate-600 mt-0.5">
                      Pre/Post Dips: {preview.summaryCounts.prePostReceiptTankDips}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-[11px] text-slate-500 font-semibold">
                      Stock &amp; Fin. Reconciliations
                    </div>
                    <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
                      {preview.summaryCounts.shiftStockReconciliations +
                        preview.summaryCounts.shiftFinancialReconciliations}
                    </div>
                    <div className="text-[10px] font-mono text-slate-600 mt-0.5">
                      Collections: {preview.summaryCounts.shiftCollections} | Deposits:{' '}
                      {preview.summaryCounts.bankDeposits}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-300">
                    <div className="text-[11px] text-amber-900 font-bold">
                      Total Affected Records
                    </div>
                    <div
                      className="text-lg font-extrabold font-mono text-amber-950 mt-0.5"
                      data-testid="preview-total-affected-records"
                    >
                      {preview.summaryCounts.totalAffectedRecords}
                    </div>
                    <div className="text-[10px] font-mono text-amber-800 mt-0.5">
                      Snapshots:{' '}
                      {preview.summaryCounts.operationalShiftNozzles +
                        preview.summaryCounts.operationalShiftTanks +
                        preview.summaryCounts.operationalShiftProductPrices}
                    </div>
                  </div>
                </div>
              </div>

              {/* Protected Data Permanently Preserved Banner */}
              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-950 mb-2">
                  <Lock className="w-4 h-4 text-emerald-700" />
                  Permanently Preserved Master, Calibration, Compliance &amp; Other-Outlet Data
                  (Never Deleted)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-[11px] text-emerald-900 font-mono">
                  <div>COCO Outlets: {preview.protectedDataSummary.retailOutletsTotal}</div>
                  <div>
                    Other Outlets Shifts: {preview.protectedDataSummary.otherOutletsShiftsCount}
                  </div>
                  <div>
                    Outside-Range Shifts:{' '}
                    {preview.protectedDataSummary.sameOutletOutsideRangeShiftsCount}
                  </div>
                  <div>
                    Tanks / DUs / Nozzles: {preview.protectedDataSummary.outletTanksCount} /{' '}
                    {preview.protectedDataSummary.outletDispensersCount} /{' '}
                    {preview.protectedDataSummary.outletNozzlesCount}
                  </div>
                  <div>
                    Calibration Charts/Pts:{' '}
                    {preview.protectedDataSummary.outletCalibrationChartsCount} /{' '}
                    {preview.protectedDataSummary.outletCalibrationPointsCount}
                  </div>
                  <div>
                    Vault Docs / Compliance:{' '}
                    {preview.protectedDataSummary.outletDocumentsCount} /{' '}
                    {preview.protectedDataSummary.outletComplianceRecordsCount}
                  </div>
                </div>
              </div>

              {/* Official / Potentially Genuine Data Blockers Section */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div
                  className={`px-4 py-3 border-b flex items-center justify-between ${
                    preview.hasUnreviewedBlockers
                      ? 'bg-red-50 border-red-200 text-red-950'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <ShieldAlert className="w-4 h-4" />
                    Official / Protected Operational Data Detection ({preview.blockers.length}{' '}
                    item(s) detected, {preview.unreviewedBlockersCount} unreviewed)
                  </div>
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-white border">
                    {preview.hasUnreviewedBlockers
                      ? 'RESET BLOCKED UNTIL OWNER REVIEW'
                      : 'ALL DETECTED ITEMS REVIEWED'}
                  </span>
                </div>

                {preview.blockers.length === 0 ? (
                  <div className="p-4 text-xs text-slate-600">
                    No closed shifts, real tanker receipts, settled bank deposits, or external
                    payment blockers detected in this range.
                  </div>
                ) : (
                  <div className="p-4 space-y-4">
                    <div className="space-y-2">
                      {preview.blockers.map((blk) => (
                        <div
                          key={blk.id}
                          className={`p-3 rounded-lg border text-xs flex items-start justify-between gap-3 ${
                            blk.reviewed
                              ? 'bg-emerald-50/40 border-emerald-200'
                              : 'bg-amber-50/50 border-amber-300'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 font-bold text-slate-900">
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-800">
                                {blk.category}
                              </span>
                              <span>{blk.title}</span>
                            </div>
                            <p className="text-slate-600">{blk.description}</p>
                            {blk.reviewed && (
                              <div className="text-[11px] text-emerald-800 font-medium">
                                Reviewed by {blk.reviewedByName} at {blk.reviewedAt}: &ldquo;
                                {blk.reviewNotes}&rdquo;
                              </div>
                            )}
                          </div>
                          <div className="shrink-0">
                            {blk.reviewed ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                <CheckCircle2 className="w-3 h-3" /> Reviewed UAT
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedBlockerIds((prev) =>
                                    prev.includes(blk.id)
                                      ? prev.filter((x) => x !== blk.id)
                                      : [...prev, blk.id]
                                  );
                                }}
                                className={`px-2.5 py-1 rounded text-[11px] font-bold border ${
                                  selectedBlockerIds.includes(blk.id)
                                    ? 'bg-[#003366] text-white border-[#003366]'
                                    : 'bg-white text-slate-700 border-slate-300'
                                }`}
                              >
                                {selectedBlockerIds.includes(blk.id)
                                  ? 'Selected for Review'
                                  : 'Select to Review'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {preview.hasUnreviewedBlockers && (
                      <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                        <div className="text-xs font-bold text-slate-800">
                          Authorised Owner Review &amp; UAT Test Data Attestation
                        </div>
                        <textarea
                          rows={2}
                          value={blockerReviewNotes}
                          onChange={(e) => setBlockerReviewNotes(e.target.value)}
                          placeholder="Enter owner review justification confirming these flagged receipts/shifts/collections are pre-go-live UAT test data (min 10 chars)..."
                          className="w-full p-2.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#003366]"
                        />
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => setAttestUatData(!attestUatData)}
                            className="text-xs font-semibold text-slate-800 flex items-center gap-2 text-left"
                          >
                            <span
                              className={`w-4 h-4 rounded border flex items-center justify-center ${
                                attestUatData
                                  ? 'bg-[#003366] border-[#003366] text-white'
                                  : 'bg-white border-slate-400'
                              }`}
                            >
                              {attestUatData ? '✓' : ''}
                            </span>
                            I have inspected the selected records and attest they are UAT test
                            entries, not genuine commercial transactions.
                          </button>
                          <button
                            type="button"
                            onClick={handleReviewBlockers}
                            disabled={
                              submittingReview ||
                              selectedBlockerIds.length === 0 ||
                              !attestUatData ||
                              blockerReviewNotes.trim().length < 10
                            }
                            data-testid="submit-blocker-review-btn"
                            className="px-3.5 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 disabled:opacity-50 shrink-0"
                          >
                            {submittingReview
                              ? 'Recording Review...'
                              : `Attest & Clear ${selectedBlockerIds.length} Selected Blocker(s)`}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Grouped by Business Date & Outlet */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    Affected Operational Shifts &amp; Dependent Records Grouped by Business Date (
                    {preview.groupedByBusinessDate.length} Business Date(s))
                  </span>
                </div>

                {preview.groupedByBusinessDate.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No operational shifts found for {preview.outlet.name} ({preview.outlet.roCode})
                    between {preview.dateRange.fromBusinessDate} and{' '}
                    {preview.dateRange.toBusinessDate}.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {preview.groupedByBusinessDate.map((group) => {
                      const isExpanded = Boolean(expandedDates[group.businessDate]);
                      return (
                        <div key={group.businessDate} className="bg-white">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedDates((prev) => ({
                                ...prev,
                                [group.businessDate]: !prev[group.businessDate],
                              }))
                            }
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 text-left"
                          >
                            <div className="flex items-center gap-3">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-slate-500" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-slate-500" />
                              )}
                              <span className="font-mono text-xs font-bold text-slate-900">
                                {group.businessDate}
                              </span>
                              <span className="text-xs text-slate-600">
                                {group.outletName} ({group.roCode})
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] font-mono">
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-semibold">
                                {group.shiftsCount} Shift(s)
                              </span>
                              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-900 font-semibold">
                                {group.totalRecordsInDate} Dependent Record(s)
                              </span>
                              {group.unreviewedBlockersCount > 0 && (
                                <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-bold">
                                  {group.unreviewedBlockersCount} Blocker(s)
                                </span>
                              )}
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="px-4 pb-4 space-y-3">
                              {group.shifts.map((item) => (
                                <div
                                  key={item.shift.id}
                                  className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5 text-xs"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-bold text-slate-900">
                                        {item.shift.shiftTemplateName} (
                                        {item.shift.shiftTemplateCode})
                                      </span>
                                      <span className="font-mono text-[11px] text-slate-500">
                                        ID: {item.shift.id}
                                      </span>
                                      <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                          item.shift.status === 'OPEN'
                                            ? 'bg-amber-100 text-amber-900'
                                            : 'bg-slate-200 text-slate-800'
                                        }`}
                                      >
                                        {item.shift.status}
                                      </span>
                                    </div>
                                    <div className="text-[11px] font-mono text-slate-600">
                                      Started: {item.shift.startedAt} | Total Rows:{' '}
                                      {item.counts.totalShiftAndDependentRecords}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-[11px] font-mono text-slate-700">
                                    <div>
                                      Nozzle Snapshots: {item.counts.operationalShiftNozzles}
                                    </div>
                                    <div>Tank Snapshots: {item.counts.operationalShiftTanks}</div>
                                    <div>
                                      Price Snapshots:{' '}
                                      {item.counts.operationalShiftProductPrices}
                                    </div>
                                    <div>
                                      Tank Dips: {item.counts.tankStockReadings} (Water:{' '}
                                      {item.counts.waterDipPositiveReadings})
                                    </div>
                                    <div>
                                      Nozzle Readings: {item.counts.nozzleMeterReadings} (Test:{' '}
                                      {item.counts.nozzleTestingPositiveReadings})
                                    </div>
                                    <div>
                                      Receipts / Lines: {item.counts.fuelReceipts} /{' '}
                                      {item.counts.fuelReceiptTankLines}
                                    </div>
                                    <div>
                                      Stock Recons: {item.counts.shiftStockReconciliations}
                                    </div>
                                    <div>Collections: {item.counts.shiftCollections}</div>
                                    <div>
                                      Handovers / Deposits: {item.counts.cashHandoverLogs} /{' '}
                                      {item.counts.bankDeposits}
                                    </div>
                                    <div>
                                      Fin. Recons: {item.counts.shiftFinancialReconciliations}
                                    </div>
                                    <div>
                                      CNG Logs / Press: {item.counts.cngShiftLogs} /{' '}
                                      {item.counts.cngPressureReadings}
                                    </div>
                                    <div>Lube Sales: {item.counts.lubeShiftSales}</div>
                                  </div>

                                  {item.details.fuelReceipts.length > 0 && (
                                    <div className="pt-2 border-t border-slate-200">
                                      <div className="text-[11px] font-bold text-slate-700 mb-1">
                                        Shift-Linked Fuel Receipts:
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        {item.details.fuelReceipts.map((rcpt) => (
                                          <span
                                            key={rcpt.id}
                                            className="px-2 py-1 rounded bg-white border border-slate-300 font-mono text-[11px] text-slate-800"
                                          >
                                            TT {rcpt.ttNumber} • Inv {rcpt.invoiceNumber} •{' '}
                                            {rcpt.status} ({rcpt.lineCount} line(s))
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Step 2: Restorable Access-Controlled Backup */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DatabaseBackup className="w-4 h-4 text-[#003366]" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Step 2: Generate Restorable, Access-Controlled Backup &amp; Verify Integrity
                    </h4>
                  </div>
                  {activeBackup && (
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-mono text-[11px] font-bold">
                      Active Backup: {activeBackup.backupId} (SHA-256 Verified)
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={backupReason}
                    onChange={(e) => setBackupReason(e.target.value)}
                    placeholder="Enter backup reason..."
                    className="flex-1 h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#003366]"
                  />
                  <button
                    type="button"
                    onClick={handleCreateBackup}
                    disabled={creatingBackup || !preview.canCreateBackup}
                    data-testid="create-reset-backup-btn"
                    className="h-9 px-4 rounded-lg bg-[#003366] text-white text-xs font-bold hover:bg-[#002244] disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                  >
                    <DatabaseBackup className="w-3.5 h-3.5" />
                    {creatingBackup
                      ? 'Creating Verified Backup...'
                      : '2. Generate Verified Restorable Backup'}
                  </button>
                </div>

                {backupsList.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <div className="text-[11px] font-bold text-slate-700">
                      Available Restorable Backups for Outlet:
                    </div>
                    <div className="space-y-2">
                      {backupsList.slice(0, 5).map((bkp) => (
                        <div
                          key={bkp.backupId}
                          className="p-2.5 rounded-lg bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <div className="space-y-0.5">
                            <div className="font-mono font-bold text-slate-900">
                              {bkp.backupId} • {bkp.dateRange.fromBusinessDate} to{' '}
                              {bkp.dateRange.toBusinessDate} ({bkp.totalRecords} records)
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">
                              SHA-256: {bkp.sha256Checksum} • Created: {bkp.createdAt}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setActiveBackup({
                                  backupId: bkp.backupId,
                                  sha256Checksum: bkp.sha256Checksum,
                                  totalRecords: bkp.totalRecords,
                                  createdAt: bkp.createdAt,
                                  r2ObjectKey: bkp.r2ObjectKey,
                                  verified: true,
                                })
                              }
                              className="px-2.5 py-1 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-800"
                            >
                              Select
                            </button>
                            <button
                              type="button"
                              onClick={() => handleVerifyBackup(bkp.backupId)}
                              disabled={verifyingBackupId === bkp.backupId}
                              className="px-2.5 py-1 rounded border border-blue-300 bg-blue-50 hover:bg-blue-100 text-[11px] font-semibold text-blue-900"
                            >
                              Verify SHA-256
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadBackupJson(bkp.backupId)}
                              className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-800 flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" /> JSON
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRestoreBackup(bkp.backupId)}
                              disabled={restoringBackupId === bkp.backupId}
                              className="px-2.5 py-1 rounded border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-[11px] font-bold text-emerald-900 flex items-center gap-1"
                            >
                              <RotateCcw className="w-3 h-3" /> Restore
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-1">
                      <input
                        type="text"
                        value={restoreReason}
                        onChange={(e) => setRestoreReason(e.target.value)}
                        placeholder="Authorised restoration reason (required to execute Restore from Backup)..."
                        className="w-full h-8 px-3 rounded border border-slate-300 bg-white text-xs text-slate-900"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Step 3 & 4: Separate Admin Approval & Atomic Execution */}
              <div className="bg-red-50/50 border border-red-200 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-red-950">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">
                      Step 3 &amp; 4: Separate Administrator Approval &amp; Atomic Reset Execution
                    </h4>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-red-900">
                    Requires Verified Backup + Zero Unreviewed Blockers
                  </span>
                </div>

                <p className="text-xs text-red-900">
                  <strong>IRREVERSIBLE OPERATION WARNING:</strong> Executing this reset will
                  remove {preview.summaryCounts.operationalShifts} operational shift(s) and{' '}
                  {preview.summaryCounts.totalAffectedRecords} total shift-linked record(s) for{' '}
                  <strong>
                    {preview.outlet.name} ({preview.outlet.roCode})
                  </strong>{' '}
                  between <strong>{preview.dateRange.fromBusinessDate}</strong> and{' '}
                  <strong>{preview.dateRange.toBusinessDate}</strong>. Recovery is only possible
                  via the verified backup generated in Step 2.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Administrator Approval &amp; Audit Justification (Min 10 chars)
                    </label>
                    <input
                      type="text"
                      value={approvalReason}
                      onChange={(e) => setApprovalReason(e.target.value)}
                      placeholder="e.g., Authorised pre-go-live UAT reset for COCO 22 after completion of testing"
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Type Confirmation Phrase:{' '}
                      <span className="font-mono text-red-700">{REQUIRED_RESET_PHRASE}</span>
                    </label>
                    <input
                      type="text"
                      value={confirmationPhrase}
                      onChange={(e) => setConfirmationPhrase(e.target.value)}
                      placeholder={REQUIRED_RESET_PHRASE}
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-mono text-slate-900"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setConfirmIrreversible(!confirmIrreversible)}
                    className="text-xs font-semibold text-slate-800 flex items-center gap-2 text-left"
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center ${
                        confirmIrreversible
                          ? 'bg-red-700 border-red-700 text-white'
                          : 'bg-white border-slate-400'
                      }`}
                    >
                      {confirmIrreversible ? '✓' : ''}
                    </span>
                    I confirm the affected record counts ({preview.summaryCounts.totalAffectedRecords}
                    ) and irreversible warning.
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmClosedShifts(!confirmClosedShifts)}
                    className="text-xs font-semibold text-slate-800 flex items-center gap-2 text-left"
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center ${
                        confirmClosedShifts
                          ? 'bg-red-700 border-red-700 text-white'
                          : 'bg-white border-slate-400'
                      }`}
                    >
                      {confirmClosedShifts ? '✓' : ''}
                    </span>
                    Authorise reset of eligible UAT CLOSED/LOCKED shifts in range.
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleApproveReset}
                    disabled={
                      approvingReset ||
                      !activeBackup ||
                      preview.hasUnreviewedBlockers ||
                      !confirmIrreversible ||
                      confirmationPhrase.trim() !== REQUIRED_RESET_PHRASE ||
                      approvalReason.trim().length < 10
                    }
                    data-testid="approve-reset-request-btn"
                    className="h-9 px-4 rounded-lg bg-amber-700 text-white text-xs font-bold hover:bg-amber-800 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <FileCheck2 className="w-3.5 h-3.5" />
                    {approvingReset
                      ? 'Recording Approval...'
                      : '3. Record Separate Admin Approval'}
                  </button>

                  <button
                    type="button"
                    onClick={handleExecuteReset}
                    disabled={
                      executingReset ||
                      !activeApproval ||
                      activeApproval.status === 'EXECUTED' ||
                      confirmationPhrase.trim() !== REQUIRED_RESET_PHRASE
                    }
                    data-testid="execute-approved-reset-btn"
                    className="h-9 px-4 rounded-lg bg-red-700 text-white text-xs font-bold hover:bg-red-800 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {executingReset
                      ? 'Executing Atomic Reset...'
                      : '4. Execute Authorised Atomic Reset'}
                  </button>
                </div>

                {postResetResult && (
                  <div
                    className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-300 text-xs text-emerald-950 space-y-1"
                    data-testid="post-reset-verification-card"
                  >
                    <div className="font-bold">
                      Post-Reset Verification Passed (Execution Audit ID:{' '}
                      {postResetResult.executionAuditId})
                    </div>
                    <div className="font-mono text-[11px]">
                      Remaining Shifts in Range:{' '}
                      {postResetResult.postResetVerification.remainingShiftsInRange} | Orphaned
                      Records: {postResetResult.postResetVerification.orphanedRecordsCount} | FK
                      Violations: {postResetResult.postResetVerification.foreignKeyViolationsCount}{' '}
                      | Protected Tables Intact:{' '}
                      {String(postResetResult.postResetVerification.protectedTablesIntact)} |
                      Ready for Fresh Shift:{' '}
                      {String(postResetResult.postResetVerification.readyForFreshShiftCreation)}
                    </div>
                  </div>
                )}
              </div>

              {/* Permanent Reset Audit History */}
              {auditHistory.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 text-xs font-bold text-slate-800">
                    Permanent Reset Audit Ledger ({auditHistory.length} Event(s))
                  </div>
                  <div className="divide-y divide-slate-200 max-h-56 overflow-y-auto">
                    {auditHistory.map((ev) => (
                      <div
                        key={ev.id}
                        className="px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 bg-white"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                            {ev.action}
                          </span>
                          <span className="font-mono text-[11px] text-slate-600">{ev.id}</span>
                          {ev.summary?.reason && (
                            <span className="text-slate-700 truncate max-w-md">
                              — {ev.summary.reason}
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {ev.createdAt}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
