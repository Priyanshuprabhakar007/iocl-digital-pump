import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch, clearApiCache } from '../../services/api';
import {
  GlobalTankCalibrationTemplate,
  EligibleCocoTankItem,
  GlobalTemplateAssignmentPreviewResponse,
  AuditLog,
} from '../../../shared/types';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Upload,
  FileSpreadsheet,
  ShieldCheck,
  Lock,
  Layers,
  Check,
  Eye,
  Plus,
  History,
  Sliders,
  Building2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileCheck,
  FileX,
  X,
  Download,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  getGlobalTemplateStatusBadge,
  formatGlobalTemplateDimensions,
  generateVerifiedCylindricalCalibrationCsv,
  buildGlobalTemplateImportPreview,
  canApproveGlobalTemplate,
  formatGlobalCalibrationAuditLogEntry,
  formatCalibrationDisplay,
  getPumpInfrastructureErrorMessage,
  getProductCategoryBadgeClass,
  partitionCocoTanksByEligibility,
  getSelectableEligibleTankIds,
  isCocoTankSelectionDisabled,
  getCocoTankEligibilityBadge,
} from './pumpInfrastructureUi';

export interface GlobalCalibrationMasterSectionProps {
  selectedOutletId: string;
  selectedOutletName?: string;
  canWriteTankCalibration: boolean;
  canApproveCalibrationChart: boolean;
  onCalibrationAssigned?: () => void;
}

export const GlobalCalibrationMasterSection: React.FC<GlobalCalibrationMasterSectionProps> = ({
  selectedOutletId,
  selectedOutletName,
  canWriteTankCalibration,
  canApproveCalibrationChart,
  onCalibrationAssigned,
}) => {
  const [templates, setTemplates] = useState<GlobalTankCalibrationTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('gtct-std-20kl');
  const [selectedTemplateDetail, setSelectedTemplateDetail] =
    useState<GlobalTankCalibrationTemplate | null>(null);
  const [eligibleTanks, setEligibleTanks] = useState<EligibleCocoTankItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingEligibleTanks, setLoadingEligibleTanks] = useState(false);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // CSV Upload & Preview state
  const [showCsvPanel, setShowCsvPanel] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [sourceFileName, setSourceFileName] = useState('');
  const [referenceDocument, setReferenceDocument] = useState('');
  const [importNotes, setImportNotes] = useState('');
  const [allowOverCapacity, setAllowOverCapacity] = useState(false);
  const [confirmApproveOverCapacity, setConfirmApproveOverCapacity] = useState(false);

  // Eligible tanks & Assignment preview state
  const [scopeFilter, setScopeFilter] = useState<'ALL_COCO' | 'SELECTED_OUTLET'>('ALL_COCO');
  const [selectedTankIds, setSelectedTankIds] = useState<string[]>([]);
  const [assignmentPreview, setAssignmentPreview] =
    useState<GlobalTemplateAssignmentPreviewResponse | null>(null);
  const [assignmentNotes, setAssignmentNotes] = useState('');

  // Create custom template state
  const [showCreateCustomModal, setShowCreateCustomModal] = useState(false);
  const [customCode, setCustomCode] = useState('');
  const [customName, setCustomName] = useState('');
  const [customCapacity, setCustomCapacity] = useState('30000');
  const [customDiameterMm, setCustomDiameterMm] = useState('2400');
  const [customLengthMm, setCustomLengthMm] = useState('6800');
  const [customMaxDipMm, setCustomMaxDipMm] = useState('2400');
  const [customNotes, setCustomNotes] = useState('');

  // Global ADMIN auth & Excel Importer state
  const { userCtx } = useAuth();
  const isGlobalAdmin = Boolean(userCtx?.roles?.includes('ADMIN'));

  const [showExcelPanel, setShowExcelPanel] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [extractingExcel, setExtractingExcel] = useState(false);
  const [excelPreviewResult, setExcelPreviewResult] = useState<any | null>(null);
  const [importingExcel, setImportingExcel] = useState(false);
  const [showConfirmImportModal, setShowConfirmImportModal] = useState(false);
  const [expandedPreviewSheet, setExpandedPreviewSheet] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setFeedbackError(null);
    setFeedbackSuccess(msg);
  };

  const showError = (msg: string) => {
    setFeedbackSuccess(null);
    setFeedbackError(msg);
  };

  const loadTemplates = useCallback(async (preferredId?: string) => {
    setLoadingTemplates(true);
    try {
      const res = await apiFetch<GlobalTankCalibrationTemplate[]>(
        '/api/v1/calibration-templates',
        { cache: 'no-store' }
      );
      if (res.success && Array.isArray(res.data)) {
        setTemplates(res.data);
        const targetId =
          preferredId ||
          selectedTemplateId ||
          res.data.find(t => t.code === 'STANDARD_20KL')?.id ||
          res.data[0]?.id ||
          '';
        if (targetId) {
          setSelectedTemplateId(targetId);
        }
      } else {
        showError(getPumpInfrastructureErrorMessage(res.error));
      }
    } finally {
      setLoadingTemplates(false);
    }
  }, [selectedTemplateId]);

  const loadTemplateDetailAndTanks = useCallback(
    async (templateId: string, currentScope: 'ALL_COCO' | 'SELECTED_OUTLET') => {
      if (!templateId) return;
      setLoadingDetail(true);
      setLoadingEligibleTanks(true);
      try {
        const outletQuery =
          currentScope === 'SELECTED_OUTLET' && selectedOutletId
            ? `?outletId=${encodeURIComponent(selectedOutletId)}`
            : '';

        const [detailRes, tanksRes] = await Promise.all([
          apiFetch<GlobalTankCalibrationTemplate>(
            `/api/v1/calibration-templates/${encodeURIComponent(templateId)}`,
            { cache: 'no-store' }
          ),
          apiFetch<{ template: GlobalTankCalibrationTemplate; tanks: EligibleCocoTankItem[] }>(
            `/api/v1/calibration-templates/${encodeURIComponent(templateId)}/eligible-tanks${outletQuery}`,
            { cache: 'no-store' }
          ),
        ]);

        if (detailRes.success && detailRes.data) {
          setSelectedTemplateDetail(detailRes.data);
          setReferenceDocument(detailRes.data.referenceDocument || '');
          setSourceFileName(detailRes.data.sourceFileName || '');
          setImportNotes(detailRes.data.notes || '');
        }

        if (tanksRes.success && tanksRes.data && Array.isArray(tanksRes.data.tanks)) {
          setEligibleTanks(tanksRes.data.tanks);
        } else {
          setEligibleTanks([]);
        }
      } finally {
        setLoadingDetail(false);
        setLoadingEligibleTanks(false);
      }
    },
    [selectedOutletId]
  );

  const loadAuditTrail = useCallback(async () => {
    setLoadingAuditLogs(true);
    try {
      const res = await apiFetch<AuditLog[]>(
        '/api/v1/calibration-templates/audit-logs?limit=25',
        { cache: 'no-store' }
      );
      if (res.success && Array.isArray(res.data)) {
        setAuditLogs(res.data);
      }
    } finally {
      setLoadingAuditLogs(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
    loadAuditTrail();
  }, []);

  useEffect(() => {
    if (selectedTemplateId) {
      setAssignmentPreview(null);
      setSelectedTankIds([]);
      setConfirmApproveOverCapacity(false);
      loadTemplateDetailAndTanks(selectedTemplateId, scopeFilter);
    }
  }, [selectedTemplateId, scopeFilter, selectedOutletId, loadTemplateDetailAndTanks]);

  const activeTemplate =
    selectedTemplateDetail ||
    templates.find(t => t.id === selectedTemplateId || t.code === selectedTemplateId) ||
    null;

  const templateMaxVolumeLitres =
    activeTemplate?.maxVolumeLitres ??
    (activeTemplate?.points && activeTemplate.points.length > 0
      ? activeTemplate.points[activeTemplate.points.length - 1].volumeLitres
      : null);

  const templateOverCapacityCeilingLitres = activeTemplate
    ? Math.round(activeTemplate.nominalCapacityLitres * 1.1 * 1000) / 1000
    : null;

  const isTemplateOverNominalCapacity = Boolean(
    activeTemplate &&
      templateMaxVolumeLitres != null &&
      templateMaxVolumeLitres > activeTemplate.nominalCapacityLitres
  );

  const csvPreview =
    activeTemplate && csvText.trim()
      ? buildGlobalTemplateImportPreview(csvText, activeTemplate, {
          allowOverCapacity,
        })
      : null;

  const approvalCheck = canApproveGlobalTemplate(activeTemplate, canApproveCalibrationChart, {
    confirmOverCapacity: confirmApproveOverCapacity,
    maxVolumeLitres: templateMaxVolumeLitres,
    nominalCapacityLitres: activeTemplate?.nominalCapacityLitres ?? null,
  });

  const handleCsvFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFeedbackError(null);
    try {
      const content = await file.text();
      setShowCsvPanel(true);
      setCsvText(content);
      setSourceFileName(file.name);
    } catch {
      showError('Failed to read the selected CSV file.');
    } finally {
      e.target.value = '';
    }
  };

  const handleLoadVerifiedSampleCsv = () => {
    if (!activeTemplate) return;
    const maxDip = activeTemplate.maxDipMm || activeTemplate.tankDiameterMm || 2100;
    const cap =
      allowOverCapacity && activeTemplate.code === 'STANDARD_20KL'
        ? 21648.3
        : activeTemplate.nominalCapacityLitres || 20000;
    const sample = generateVerifiedCylindricalCalibrationCsv(maxDip, cap, 10);
    setShowCsvPanel(true);
    setCsvText(sample);
    setSourceFileName(
      `IOCL_${activeTemplate.code}_${activeTemplate.tankDiameterMm || maxDip}x${activeTemplate.tankLengthMm || 6250}.csv`
    );
    if (!referenceDocument) {
      setReferenceDocument(`IOCL-ENGG-${activeTemplate.code}-REV${activeTemplate.revisionNumber || 1}`);
    }
    setFeedbackError(null);
  };

  // Requirement 1, 3, 4 & 5: Import verified CSV data (including allowOverCapacity) and save as DRAFT by default
  const handleSaveCsvAsDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTemplate || submitting) return;

    if (!csvPreview || !csvPreview.valid) {
      showError(
        csvPreview?.error ||
          'Please provide valid, complete dip-to-volume CSV calibration points before saving.'
      );
      return;
    }

    setSubmitting(true);
    setFeedbackError(null);
    try {
      const res = await apiFetch<GlobalTankCalibrationTemplate>(
        `/api/v1/calibration-templates/${encodeURIComponent(activeTemplate.id)}/import`,
        {
          method: 'POST',
          body: JSON.stringify({
            csvText,
            status: 'DRAFT', // Keep imported templates as DRAFT until separately approved
            allowOverCapacity,
            sourceFileName: sourceFileName.trim() || `${activeTemplate.code.toLowerCase()}.csv`,
            referenceDocument: referenceDocument.trim() || null,
            notes: importNotes.trim() || null,
          }),
        }
      );

      if (res.success && res.data) {
        clearApiCache();
        setShowCsvPanel(false);
        setCsvText('');
        setConfirmApproveOverCapacity(false);
        await Promise.all([
          loadTemplates(res.data.id),
          loadTemplateDetailAndTanks(res.data.id, scopeFilter),
          loadAuditTrail(),
        ]);
        showSuccess(
          `Imported ${res.data.pointsCount} verified calibration points into ${res.data.code} as DRAFT (Rev #${res.data.revisionNumber}). Please review the chart points below and use the Authorised Approval action when verified.`
        );
      } else {
        showError(getPumpInfrastructureErrorMessage(res.error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Requirement 4 & 5: Separate authorised approval action after chart verification (including explicit over-capacity confirmation)
  const handleUpdateTemplateStatus = async (nextStatus: 'APPROVED' | 'DRAFT') => {
    if (!activeTemplate || submitting) return;

    if (nextStatus === 'APPROVED' && isTemplateOverNominalCapacity && !confirmApproveOverCapacity) {
      showError(
        `Chart maximum volume (${formatCalibrationDisplay(
          templateMaxVolumeLitres ?? 0
        )} L) exceeds nominal capacity (${activeTemplate.nominalCapacityLitres.toLocaleString()} L). Please confirm the above-nominal volume verification checkbox before approving.`
      );
      return;
    }

    setSubmitting(true);
    setFeedbackError(null);
    try {
      const overCapConfirmed =
        nextStatus === 'APPROVED' && isTemplateOverNominalCapacity
          ? confirmApproveOverCapacity
          : false;
      const res = await apiFetch<GlobalTankCalibrationTemplate>(
        `/api/v1/calibration-templates/${encodeURIComponent(activeTemplate.id)}/status`,
        {
          method: 'POST',
          body: JSON.stringify({
            status: nextStatus,
            allowOverCapacity: overCapConfirmed,
            confirmOverCapacity: overCapConfirmed,
          }),
        }
      );

      if (res.success && res.data) {
        clearApiCache();
        setConfirmApproveOverCapacity(false);
        await Promise.all([
          loadTemplates(res.data.id),
          loadTemplateDetailAndTanks(res.data.id, scopeFilter),
          loadAuditTrail(),
        ]);
        showSuccess(
          nextStatus === 'APPROVED'
            ? `Global Calibration Master ${res.data.code} (${res.data.pointsCount} points) has been verified and marked APPROVED. It is now eligible for COCO tank assignment preview.`
            : `Global Calibration Master ${res.data.code} returned to DRAFT status.`
        );
      } else {
        showError(getPumpInfrastructureErrorMessage(res.error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const {
    eligibleTanks: verifiedEligibleTanks,
    ineligibleOrUnverifiedTanks,
  } = partitionCocoTanksByEligibility(eligibleTanks);

  const selectableEligibleTankIds = getSelectableEligibleTankIds(eligibleTanks);

  const handleToggleTankSelection = (tank: EligibleCocoTankItem) => {
    if (isCocoTankSelectionDisabled(tank)) return;
    setAssignmentPreview(null);
    setSelectedTankIds(prev =>
      prev.includes(tank.tankId) ? prev.filter(id => id !== tank.tankId) : [...prev, tank.tankId]
    );
  };

  const handleSelectAllEligibleWithoutDraft = () => {
    setAssignmentPreview(null);
    setSelectedTankIds(selectableEligibleTankIds);
  };

  // Requirement 7: Preview tank-wise assignments before confirmation
  const handlePreviewAssignment = async () => {
    if (!activeTemplate || selectedTankIds.length === 0 || submitting) return;
    setSubmitting(true);
    setFeedbackError(null);
    try {
      const res = await apiFetch<GlobalTemplateAssignmentPreviewResponse>(
        `/api/v1/calibration-templates/${encodeURIComponent(activeTemplate.id)}/assign-preview`,
        {
          method: 'POST',
          body: JSON.stringify({ tankIds: selectedTankIds }),
        }
      );

      if (res.success && res.data) {
        setAssignmentPreview(res.data);
      } else {
        showError(getPumpInfrastructureErrorMessage(res.error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Requirement 8 & 9: Confirm assignment as DRAFT (never auto-replacing ACTIVE charts, preserving existing DRAFTs like COCO 22 Tank #1 Rev #2 DRAFT)
  const handleConfirmDraftAssignment = async () => {
    if (!activeTemplate || !assignmentPreview || selectedTankIds.length === 0 || submitting) return;
    setSubmitting(true);
    setFeedbackError(null);
    try {
      const res = await apiFetch<{
        template: GlobalTankCalibrationTemplate;
        assignments: Array<{
          tankId: string;
          tankName: string;
          chartId: string;
          revisionNumber: number;
          status: string;
          pointsCount: number;
          preservedExistingDraft?: boolean;
        }>;
      }>(`/api/v1/calibration-templates/${encodeURIComponent(activeTemplate.id)}/assign`, {
        method: 'POST',
        body: JSON.stringify({
          tankIds: selectedTankIds,
          activateImmediately: false, // Never automatically replace ACTIVE tank charts
          preserveExistingDraft: true, // Preserve COCO 22 Tank #1 Revision #2 DRAFT
          notes:
            assignmentNotes.trim() ||
            `Assigned as DRAFT from Global Calibration Master ${activeTemplate.code} (ACTIVE tank chart preserved)`,
        }),
      });

      if (res.success && res.data) {
        clearApiCache();
        const createdCount = res.data.assignments.filter(a => !a.preservedExistingDraft).length;
        const preservedCount = res.data.assignments.filter(a => a.preservedExistingDraft).length;
        setAssignmentPreview(null);
        setSelectedTankIds([]);
        setAssignmentNotes('');
        await Promise.all([
          loadTemplateDetailAndTanks(activeTemplate.id, scopeFilter),
          loadAuditTrail(),
        ]);
        if (onCalibrationAssigned) {
          onCalibrationAssigned();
        }
        showSuccess(
          `Assigned ${activeTemplate.code} to ${res.data.assignments.length} tank(s) as DRAFT revision(s) (${createdCount} new DRAFT created${
            preservedCount > 0 ? `, ${preservedCount} existing DRAFT preserved untouched` : ''
          }). All ACTIVE tank charts and historical revisions remain untouched.`
        );
      } else {
        showError(getPumpInfrastructureErrorMessage(res.error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateCustomTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFeedbackError(null);
    try {
      const res = await apiFetch<GlobalTankCalibrationTemplate>('/api/v1/calibration-templates', {
        method: 'POST',
        body: JSON.stringify({
          code: customCode.trim().toUpperCase(),
          name: customName.trim(),
          nominalCapacityLitres: Number(customCapacity),
          tankDiameterMm: customDiameterMm.trim() || undefined,
          tankLengthMm: customLengthMm.trim() || undefined,
          maxDipMm: customMaxDipMm.trim() || undefined,
          notes: customNotes.trim() || undefined,
          status: 'DRAFT',
        }),
      });

      if (res.success && res.data) {
        clearApiCache();
        setShowCreateCustomModal(false);
        setCustomCode('');
        setCustomName('');
        await Promise.all([loadTemplates(res.data.id), loadAuditTrail()]);
        showSuccess(
          `Created Global Calibration Template ${res.data.code} in DRAFT status.`
        );
      } else {
        showError(getPumpInfrastructureErrorMessage(res.error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoadSampleWorkbook = async () => {
    setExtractingExcel(true);
    setFeedbackError(null);
    try {
      const res = await apiFetch<any>('/api/v1/calibration-templates/excel-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loadDefault: true }),
      });
      if (res.success && res.data) {
        setExcelPreviewResult(res.data);
        showSuccess(
          `Extracted ${res.data.identifiedChartsCount} calibration charts from default IOCL reference workbook '${res.data.workbookName}'.`
        );
      } else {
        showError(res.error?.message || 'Failed to extract sample workbook.');
      }
    } catch (err: any) {
      showError(err.message || 'Error communicating with server.');
    } finally {
      setExtractingExcel(false);
    }
  };

  const handleExtractUploadedFile = async (fileToExtract?: File) => {
    const targetFile = fileToExtract || excelFile;
    if (!targetFile) {
      showError('Please choose an Excel (.xlsx) file first.');
      return;
    }
    setExtractingExcel(true);
    setFeedbackError(null);
    try {
      const formData = new FormData();
      formData.append('file', targetFile);
      const res = await apiFetch<any>('/api/v1/calibration-templates/excel-preview', {
        method: 'POST',
        body: formData,
      });
      if (res.success && res.data) {
        setExcelPreviewResult(res.data);
        showSuccess(
          `Extracted ${res.data.identifiedChartsCount} calibration charts from '${res.data.workbookName}'.`
        );
      } else {
        showError(res.error?.message || 'Failed to extract calibration data from workbook.');
      }
    } catch (err: any) {
      showError(err.message || 'Error processing Excel file.');
    } finally {
      setExtractingExcel(false);
    }
  };

  const handleConfirmImportAllEligible = async () => {
    if (!excelPreviewResult) return;
    setImportingExcel(true);
    setFeedbackError(null);
    try {
      let res;
      if (excelFile) {
        const formData = new FormData();
        formData.append('file', excelFile);
        formData.append('confirmImport', 'true');
        res = await apiFetch<any>('/api/v1/calibration-templates/excel-import', {
          method: 'POST',
          body: formData,
        });
      } else {
        res = await apiFetch<any>('/api/v1/calibration-templates/excel-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            confirmImport: true,
            loadDefault: true,
            workbookName: excelPreviewResult.workbookName,
            workbookSha256: excelPreviewResult.workbookSha256,
          }),
        });
      }

      if (res.success && res.data) {
        setShowConfirmImportModal(false);
        clearApiCache();
        const imported = res.data.importedTemplates || [];
        const skipped = res.data.skippedCharts || [];
        const names = imported
          .map((t: any) => `${t.code} (${t.action === 'UNCHANGED' ? 'Retained Unchanged' : t.status})`)
          .join(', ');
        showSuccess(
          `Excel calibration reference import completed! Processed: ${names || 'None'}${
            skipped.length > 0 ? `. Skipped: ${skipped.length} charts.` : '.'
          }`
        );
        await Promise.all([loadTemplates(), loadAuditTrail()]);
      } else {
        showError(res.error?.message || 'Import failed.');
      }
    } catch (err: any) {
      showError(err.message || 'Error importing charts from workbook.');
    } finally {
      setImportingExcel(false);
    }
  };

  const templatePoints = activeTemplate?.points || [];

  return (
    <div className="space-y-6" data-testid="global-calibration-master-section">
      {/* Section Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl shadow-black/20">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Layers className="w-5 h-5 text-orange-500" />
              <h2 className="text-lg font-black text-white tracking-tight">
                IOCL Global Calibration Masters
              </h2>
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-mono font-bold bg-orange-500/15 text-orange-300 border border-orange-500/30">
                STANDARD_20KL &amp; STANDARD_50KL
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Centralised horizontal cylindrical underground tank calibration templates. Imported CSV charts are saved as{' '}
              <strong className="text-amber-300 font-mono">DRAFT</strong> by default, require separate authorised approval after verification, and never automatically replace{' '}
              <strong className="text-emerald-300 font-mono">ACTIVE</strong> tank charts or historical revisions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                loadTemplates(selectedTemplateId);
                loadTemplateDetailAndTanks(selectedTemplateId, scopeFilter);
                loadAuditTrail();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-mono font-semibold transition-colors"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  loadingTemplates || loadingDetail ? 'animate-spin text-orange-400' : ''
                }`}
              />
              <span>Refresh Masters</span>
            </button>

            {isGlobalAdmin && (
              <button
                type="button"
                onClick={() => {
                  setShowExcelPanel(prev => !prev);
                  setFeedbackError(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-semibold transition-colors ${
                  showExcelPanel
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/20'
                    : 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-emerald-500/30'
                }`}
                data-testid="toggle-excel-import-panel-btn"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{showExcelPanel ? 'Hide Excel Importer' : 'Import Excel Calibration Workbook'}</span>
              </button>
            )}

            {canWriteTankCalibration && (
              <button
                type="button"
                onClick={() => {
                  setFeedbackError(null);
                  setShowCreateCustomModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-orange-300 border border-orange-500/30 text-xs font-mono font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Custom Template</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Contextual Success / Error Banners */}
      {feedbackSuccess && (
        <div
          className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs sm:text-sm flex items-start justify-between gap-3"
          role="status"
        >
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{feedbackSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackSuccess(null)}
            className="text-xs text-emerald-400 hover:text-white font-mono"
          >
            Dismiss
          </button>
        </div>
      )}

      {feedbackError && (
        <div
          className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs sm:text-sm flex items-start justify-between gap-3"
          role="alert"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{feedbackError}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackError(null)}
            className="text-xs text-rose-400 hover:text-white font-mono"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ADMIN-ONLY EXCEL CALIBRATION IMPORT WORKFLOW */}
      {showExcelPanel && isGlobalAdmin && (
        <div
          className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-6 shadow-2xl space-y-6 ring-1 ring-emerald-500/20"
          data-testid="excel-calibration-import-panel"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white tracking-wide">
                  Direct Excel Calibration Import
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  ADMIN ONLY
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  DRAFT IMPORT ONLY
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Reads multi-sheet IOCL dip-to-volume calibration workbooks (<code className="text-emerald-300">20KL_15KL_10KL_calibration_Dip_chart.xlsx</code>). Converts dip cm to mm, prepends derived synthetic 0 mm = 0 L zero point, validates monotonicity, and saves eligible charts strictly in <strong className="text-amber-300">DRAFT</strong> status. Active outlet charts, historical shifts, and approved templates are never overwritten.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowExcelPanel(false)}
              className="self-start sm:self-center p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              title="Close panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Controls: Upload & Load Sample */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
            <div className="space-y-2">
              <label className="block text-xs font-mono font-semibold text-slate-300 uppercase">
                Choose Excel File (.xlsx / .xls)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setExcelFile(f);
                      handleExtractUploadedFile(f);
                    }
                  }}
                  className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-emerald-300 hover:file:bg-slate-700 cursor-pointer"
                  data-testid="excel-file-input"
                />
              </div>
              {excelFile && (
                <div className="text-[11px] text-slate-400 font-mono">
                  Selected: <span className="text-white">{excelFile.name}</span> ({(excelFile.size / 1024).toFixed(1)} KB)
                </div>
              )}
            </div>

            <div className="space-y-2 flex flex-col justify-end">
              <span className="text-xs font-mono font-semibold text-slate-300 uppercase">
                Or Load Pre-Configured Sample Workbook
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={extractingExcel || importingExcel}
                  onClick={handleLoadSampleWorkbook}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-bold transition-all shadow-sm"
                  data-testid="load-sample-workbook-btn"
                >
                  <FileSpreadsheet className={`w-4 h-4 ${extractingExcel ? 'animate-spin text-orange-400' : 'text-emerald-400'}`} />
                  <span>Load Sample Workbook (20KL_15KL_10KL)</span>
                </button>

                {excelFile && (
                  <button
                    type="button"
                    disabled={extractingExcel || importingExcel}
                    onClick={() => handleExtractUploadedFile()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold transition-colors"
                    data-testid="preview-excel-charts-btn"
                  >
                    <span>Re-preview File</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {extractingExcel && (
            <div className="flex items-center justify-center p-8 bg-slate-950/40 rounded-xl border border-slate-800">
              <div className="flex items-center gap-3 text-slate-300 font-mono text-xs">
                <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
                <span>Extracting sheets, converting cm to mm, validating points and checking capacity limits...</span>
              </div>
            </div>
          )}

          {/* Extracted Charts Preview Grid */}
          {excelPreviewResult && !extractingExcel && (
            <div className="space-y-4" data-testid="excel-calibration-preview">
              {/* Summary Bar */}
              <div
                className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs font-mono"
                data-testid="excel-preview-summary"
              >
                <div className="space-y-1">
                  <div className="text-white font-bold flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-emerald-400" />
                    <span>Workbook: {excelPreviewResult.workbookName}</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    SHA-256: <code className="text-slate-300">{excelPreviewResult.workbookSha256.slice(0, 24)}...</code>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-300">
                    Total Sheets: <strong>{excelPreviewResult.totalSheets}</strong>
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
                    Calibration References (DRAFT): <strong>{excelPreviewResult.eligibleChartsCount}</strong>
                  </span>
                  {Array.isArray(excelPreviewResult.skippedNonCalibrationSheets) &&
                    excelPreviewResult.skippedNonCalibrationSheets.length > 0 && (
                      <span className="px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-400">
                        Non-Calibration Tabs Skipped:{' '}
                        <strong>{excelPreviewResult.skippedNonCalibrationSheets.length}</strong>
                      </span>
                    )}
                </div>
              </div>

              {/* Chart Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {excelPreviewResult.charts.map((chart: any) => {
                  const isEligible = chart.eligibleForDraftImport;
                  const requiresEngReview = Boolean(chart.requiresEngineeringReview);
                  const requiresDimVerif = Boolean(chart.requiresDimensionVerification);
                  const hasWarning = chart.warnings && chart.warnings.length > 0;
                  const isExpanded = expandedPreviewSheet === chart.sheetName;
                  const badgeLabel =
                    chart.reviewStatusLabel ||
                    (requiresEngReview
                      ? 'DRAFT / ENGINEERING REVIEW REQUIRED'
                      : requiresDimVerif
                        ? 'DRAFT / DIMENSION VERIFICATION REQUIRED'
                        : isEligible
                          ? 'DRAFT / PENDING VERIFICATION'
                          : 'Blocked / Review');

                  return (
                    <div
                      key={chart.sheetName}
                      className={`rounded-2xl p-4 border flex flex-col justify-between space-y-4 ${
                        requiresEngReview
                          ? 'bg-slate-950/70 border-rose-500/40 ring-1 ring-rose-500/10'
                          : requiresDimVerif
                            ? 'bg-slate-950/70 border-amber-500/40 ring-1 ring-amber-500/10'
                            : isEligible
                              ? 'bg-slate-950/70 border-emerald-500/30 ring-1 ring-emerald-500/10'
                              : 'bg-slate-950/70 border-rose-500/40 ring-1 ring-rose-500/10'
                      }`}
                      data-testid={`excel-chart-card-${chart.templateCode}`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-slate-800 text-orange-400 border border-slate-700">
                                {chart.templateCode}
                              </span>
                              <span className="text-[11px] font-mono text-slate-400">
                                Sheet: {chart.sheetName}
                              </span>
                            </div>
                            <h4 className="text-sm font-bold text-white mt-1">
                              {chart.templateName}
                            </h4>
                          </div>

                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                              requiresEngReview
                                ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                                : requiresDimVerif || hasWarning
                                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                  : isEligible
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                    : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            }`}
                          >
                            {badgeLabel}
                          </span>
                        </div>

                        {/* Physical Specs & Points Count */}
                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                          <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                            <span className="text-slate-500 block text-[9px] uppercase">Nominal Capacity</span>
                            <span className="text-white font-bold">{chart.nominalCapacityLitres.toLocaleString()} L</span>
                          </div>
                          <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                            <span className="text-slate-500 block text-[9px] uppercase">Validated Points</span>
                            <span className="text-emerald-400 font-bold">{chart.actualPointCount} pts</span>
                          </div>
                          <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                            <span className="text-slate-500 block text-[9px] uppercase">Dimensions</span>
                            <span className="text-slate-300">{chart.tankDiameterMm} × {chart.tankLengthMm} mm</span>
                          </div>
                          <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                            <span className="text-slate-500 block text-[9px] uppercase">Max Dip</span>
                            <span className="text-orange-400 font-bold">{chart.maxDipMm} mm</span>
                          </div>
                        </div>

                        {/* Volume & Synthetic Zero Badges */}
                        <div className="space-y-1.5 text-[11px] font-mono">
                          <div className="flex items-center justify-between p-2 bg-slate-900 rounded-lg border border-slate-800">
                            <span className="text-slate-400">Printed Max Volume:</span>
                            <span className={`font-bold ${isEligible ? 'text-white' : 'text-rose-400 font-black'}`}>
                              {chart.maxVolumeLitres.toLocaleString()} L
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            {chart.hasSyntheticZero && (
                              <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                                0 mm = 0 L derived
                              </span>
                            )}
                            {chart.isMonotonic && (
                              <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                Monotonic Validated
                              </span>
                            )}
                            {chart.startsAtZero && (
                              <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                                Starts at 0 mm
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Warning or Blocked Notice */}
                        {chart.warnings && chart.warnings.length > 0 && (
                          <div
                            className={`p-2.5 rounded-lg text-[11px] font-mono space-y-1 ${
                              isEligible
                                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200'
                                : 'bg-rose-500/10 border border-rose-500/30 text-rose-200'
                            }`}
                          >
                            <div className="flex items-start gap-1.5">
                              {isEligible ? (
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                              ) : (
                                <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                              )}
                              <div>
                                <span className="font-bold block">
                                  {isEligible ? 'Engineering Warning:' : 'Blocked Reason:'}
                                </span>
                                {chart.warnings.map((w: string, idx: number) => (
                                  <p key={idx} className="mt-0.5">{w}</p>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Expand Points View Button */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setExpandedPreviewSheet(isExpanded ? null : chart.sheetName)}
                          className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono transition-colors"
                          data-testid={`toggle-preview-points-${chart.templateCode}`}
                        >
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          <span>{isExpanded ? 'Hide Readings' : `View Readings (${chart.points?.length || 0})`}</span>
                        </button>

                        {isExpanded && chart.points && (
                          <div className="mt-2 p-2 bg-slate-900 border border-slate-800 rounded-lg max-h-48 overflow-y-auto font-mono text-[10px]">
                            <table className="w-full text-left">
                              <thead>
                                <tr className="border-b border-slate-800 text-slate-500">
                                  <th className="py-1">Dip (cm)</th>
                                  <th className="py-1">Dip (mm)</th>
                                  <th className="py-1 text-right">Volume (L)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {chart.points.slice(0, 30).map((pt: any, pidx: number) => (
                                  <tr key={pidx} className="border-b border-slate-800/40 text-slate-300">
                                    <td className="py-0.5">{pt.dipCm != null ? pt.dipCm : (pt.dipMm / 10).toFixed(1)}</td>
                                    <td className="py-0.5 font-bold">{pt.dipMm} mm {pt.isSyntheticZero ? '(synth)' : ''}</td>
                                    <td className="py-0.5 text-right text-emerald-400">{pt.volumeLitres.toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {chart.points.length > 30 && (
                              <div className="text-center text-slate-500 py-1">
                                ... and {chart.points.length - 30} more points up to {chart.maxDipMm} mm
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action: Import All Three Calibration References as DRAFT */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-800">
                <div className="text-xs text-slate-400 font-mono">
                  {excelPreviewResult.eligibleChartsCount > 0 ? (
                    <span>
                      Ready to import/retain all <strong>{excelPreviewResult.eligibleChartsCount}</strong> calibration reference charts (<strong>EXCEL_10KL_REFERENCE</strong>, <strong>EXCEL_15KL_REFERENCE</strong>, and <strong>EXCEL_20KL_REFERENCE</strong>) as <strong className="text-amber-300">DRAFT</strong>. Already-imported 15 KL and 20 KL DRAFT readings are retained without duplication.
                    </span>
                  ) : (
                    <span className="text-rose-400">
                      No eligible charts detected for automatic import.
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={excelPreviewResult.eligibleChartsCount === 0 || importingExcel}
                  onClick={() => setShowConfirmImportModal(true)}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-mono font-bold shadow-lg shadow-emerald-600/20 transition-all"
                  data-testid="import-all-eligible-charts-btn"
                >
                  <FileCheck className="w-4 h-4" />
                  <span>
                    {importingExcel
                      ? 'Importing Calibration References...'
                      : 'Import All Three Calibration References'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Requirement 2: Display Global Calibration Master template cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {templates.map(tpl => {
          const isSelected =
            tpl.id === selectedTemplateId || tpl.code === selectedTemplateId;
          const statusInfo = getGlobalTemplateStatusBadge(tpl.status, tpl.pointsCount, tpl);
          const dims = formatGlobalTemplateDimensions(tpl);

          return (
            <div
              key={tpl.id}
              onClick={() => setSelectedTemplateId(tpl.id)}
              className={`cursor-pointer rounded-2xl p-5 border transition-all space-y-3 ${
                isSelected
                  ? 'bg-slate-900 border-orange-500 shadow-lg shadow-orange-500/10 ring-1 ring-orange-500/30'
                  : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
              }`}
              data-testid={`global-template-card-${tpl.code}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-mono font-black bg-slate-800 text-orange-400 border border-slate-700">
                      {tpl.code}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                      Rev #{tpl.revisionNumber}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white mt-2">{tpl.name}</h3>
                </div>

                <span
                  className={`px-2.5 py-0.5 rounded-md text-[11px] font-mono font-bold border ${statusInfo.badgeClass}`}
                >
                  {statusInfo.label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-800/80 text-xs font-mono">
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase">
                    Nominal Capacity
                  </span>
                  <span className="text-white font-bold">
                    {tpl.nominalCapacityLitres.toLocaleString()} L (
                    {Math.round(tpl.nominalCapacityLitres / 1000)} KL)
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase">
                    Calibration Points
                  </span>
                  <span
                    className={`font-bold ${
                      tpl.pointsCount >= 2 ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {tpl.pointsCount.toLocaleString()} points
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] text-slate-500 block uppercase">
                    IOCL Reference Dimensions (D × L • Max Dip)
                  </span>
                  <span className="text-slate-200 font-semibold">{dims.summaryLabel}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] font-mono">
                <span
                  className={
                    statusInfo.isApproved
                      ? 'text-emerald-400'
                      : statusInfo.hasValidatedPoints
                        ? 'text-cyan-300'
                        : 'text-amber-400'
                  }
                >
                  {statusInfo.readinessLabel}
                </span>
                <span className="text-orange-400 font-bold">
                  {isSelected ? 'Selected ●' : 'Manage →'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Template Workspace */}
      {activeTemplate && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-6">
          {/* Template Detail Header & Separate Authorised Approval Action */}
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 border-b border-slate-800 pb-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-black text-white font-mono">
                  {activeTemplate.code}
                </span>
                <span className="text-sm font-semibold text-slate-300">
                  — {activeTemplate.name}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-md text-xs font-mono font-bold border ${
                    getGlobalTemplateStatusBadge(
                      activeTemplate.status,
                      activeTemplate.pointsCount,
                      activeTemplate
                    ).badgeClass
                  }`}
                >
                  {
                    getGlobalTemplateStatusBadge(
                      activeTemplate.status,
                      activeTemplate.pointsCount,
                      activeTemplate
                    ).label
                  }
                </span>
                <span className="px-2 py-0.5 rounded-md text-xs font-mono bg-slate-800 text-slate-300 border border-slate-700">
                  Revision #{activeTemplate.revisionNumber}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1 text-xs font-mono">
                <div className="p-2.5 bg-slate-950/70 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">DIAMETER</span>
                  <span className="text-white font-bold">
                    {activeTemplate.tankDiameterMm
                      ? `${activeTemplate.tankDiameterMm.toLocaleString()} mm`
                      : '—'}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950/70 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">LENGTH</span>
                  <span className="text-white font-bold">
                    {activeTemplate.tankLengthMm
                      ? `${activeTemplate.tankLengthMm.toLocaleString()} mm`
                      : '—'}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950/70 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">MAX DIP</span>
                  <span className="text-orange-400 font-bold">
                    {activeTemplate.maxDipMm
                      ? `${activeTemplate.maxDipMm.toLocaleString()} mm`
                      : '—'}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950/70 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">POINT COUNT</span>
                  <span className="text-emerald-400 font-bold">
                    {activeTemplate.pointsCount.toLocaleString()} pts
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950/70 rounded-xl border border-slate-800 col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-slate-500 block">SOURCE / REF</span>
                  <span
                    className="text-slate-300 truncate block"
                    title={
                      activeTemplate.sourceFileName ||
                      activeTemplate.referenceDocument ||
                      'Unpopulated Reference Header'
                    }
                  >
                    {activeTemplate.sourceFileName ||
                      activeTemplate.referenceDocument ||
                      'Reference Header'}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons: CSV Import & Separate Authorised Approval */}
            <div className="flex flex-wrap items-center gap-2.5">
              {canWriteTankCalibration && (
                <button
                  type="button"
                  onClick={() => {
                    setShowCsvPanel(prev => !prev);
                    setFeedbackError(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-orange-300 border border-orange-500/30 text-xs font-mono font-bold transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-orange-400" />
                  <span>
                    {showCsvPanel ? 'Hide CSV Import' : 'Upload / Import Verified CSV'}
                  </span>
                </button>
              )}

              {/* Requirement 5: Separate Authorised Approval Action after chart verification */}
              {activeTemplate.status === 'DRAFT' && (
                <button
                  type="button"
                  disabled={!approvalCheck.allowed || submitting}
                  onClick={() => handleUpdateTemplateStatus('APPROVED')}
                  title={approvalCheck.reason || 'Mark verified template as APPROVED'}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-mono font-bold shadow-md shadow-emerald-600/20 transition-all"
                  data-testid="approve-global-template-btn"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verify &amp; Approve Template (APPROVED)</span>
                </button>
              )}

              {activeTemplate.status === 'APPROVED' && canApproveCalibrationChart && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleUpdateTemplateStatus('DRAFT')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-mono font-semibold"
                >
                  <span>Revert to DRAFT</span>
                </button>
              )}
            </div>
          </div>

          {/* Requirement 2 & 5 Notice when template has 0 points or is awaiting approval */}
          {activeTemplate.status === 'DRAFT' && activeTemplate.pointsCount < 2 && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs font-mono text-amber-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-amber-300">
                  Approval Gate Locked (0 Validated Points):
                </span>{' '}
                Reference template <strong>{activeTemplate.code}</strong> is initialized in{' '}
                <strong>DRAFT</strong> status with reference dimensions (
                {activeTemplate.tankDiameterMm} mm Dia × {activeTemplate.tankLengthMm} mm Len,
                Max Dip {activeTemplate.maxDipMm} mm). Upload and validate the complete
                dip-to-volume CSV chart below (saved as DRAFT by default), then use{' '}
                <strong>Verify &amp; Approve Template</strong> to authorise tank assignments.
              </div>
            </div>
          )}

          {activeTemplate.status === 'DRAFT' && activeTemplate.pointsCount >= 2 && (
            <div className="p-3.5 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-xs font-mono text-cyan-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-cyan-300">
                      {activeTemplate.requiresEngineeringReview
                        ? 'Stored as DRAFT / ENGINEERING REVIEW REQUIRED:'
                        : 'Ready for Authorised Verification:'}
                    </span>{' '}
                    {activeTemplate.pointsCount} dip-to-volume points are saved in{' '}
                    <strong>DRAFT</strong> status
                    {templateMaxVolumeLitres != null
                      ? ` (Max Volume: ${formatCalibrationDisplay(templateMaxVolumeLitres)} L)`
                      : ''}
                    .{' '}
                    {activeTemplate.requiresEngineeringReview
                      ? 'All 195 original/derived readings are preserved intact for engineering inspection.'
                      : 'Verify the calibration curve below and click Verify & Approve Template (APPROVED) to unlock COCO tank assignment.'}
                  </div>
                </div>
              </div>

              {(activeTemplate.requiresEngineeringReview ||
                (templateMaxVolumeLitres != null &&
                  templateOverCapacityCeilingLitres != null &&
                  templateMaxVolumeLitres > templateOverCapacityCeilingLitres)) ? (
                <div
                  className="p-3 bg-rose-500/15 border border-rose-500/40 rounded-lg text-rose-200 space-y-1.5"
                  data-testid="engineering-review-required-banner"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-rose-300">
                        10 KL — DRAFT / ENGINEERING REVIEW REQUIRED — {activeTemplate.pointsCount} points:
                      </span>{' '}
                      Printed maximum chart volume{' '}
                      <strong>{formatCalibrationDisplay(templateMaxVolumeLitres ?? 0)} L</strong>{' '}
                      exceeds the normal +10% operational capacity ceiling (
                      <strong>
                        {(templateOverCapacityCeilingLitres ?? 0).toLocaleString()} L
                      </strong>{' '}
                      for nominal{' '}
                      <strong>{activeTemplate.nominalCapacityLitres.toLocaleString()} L</strong>).
                      Operational approval, tank assignment, chart activation, and DSR calculation
                      use are strictly blocked until verified by an authorised engineer.
                    </div>
                  </div>
                </div>
              ) : (
                isTemplateOverNominalCapacity && (
                  <div className="p-3 bg-amber-500/15 border border-amber-500/40 rounded-lg text-amber-200 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-amber-300">
                          Above-Nominal Chart Volume Verification Required:
                        </span>{' '}
                        Printed maximum volume{' '}
                        <strong>{formatCalibrationDisplay(templateMaxVolumeLitres ?? 0)} L</strong>{' '}
                        exceeds nominal capacity{' '}
                        <strong>{activeTemplate.nominalCapacityLitres.toLocaleString()} L</strong>{' '}
                        (permitted +10% ceiling:{' '}
                        <strong>
                          {(templateOverCapacityCeilingLitres ?? 0).toLocaleString()} L
                        </strong>
                        ).
                      </div>
                    </div>
                    <label className="inline-flex items-center gap-2 cursor-pointer text-[11px] text-amber-100 font-semibold">
                      <input
                        type="checkbox"
                        checked={confirmApproveOverCapacity}
                        onChange={e => setConfirmApproveOverCapacity(e.target.checked)}
                        className="rounded border-amber-500/50 bg-slate-900 text-emerald-500"
                        data-testid="confirm-approve-over-capacity-checkbox"
                      />
                      <span>
                        I have verified the official IOCL strapping table and confirm the
                        above-nominal chart maximum volume (
                        {formatCalibrationDisplay(templateMaxVolumeLitres ?? 0)} L &le;{' '}
                        {(templateOverCapacityCeilingLitres ?? 0).toLocaleString()} L +10% ceiling)
                        for authorised approval.
                      </span>
                    </label>
                  </div>
                )
              )}
            </div>
          )}

          {/* Requirement 3 & 4: CSV Upload, Validation & Preview Panel */}
          {showCsvPanel && canWriteTankCalibration && (
            <form
              onSubmit={handleSaveCsvAsDraft}
              className="bg-slate-950/80 border border-orange-500/30 rounded-2xl p-5 space-y-4"
              data-testid="global-template-csv-import-form"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-orange-400 font-mono flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>
                      CSV Upload, Validation &amp; Preview — {activeTemplate.code}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Upload or paste complete verified <code className="text-orange-300">dip_mm,volume_litres</code> calibration rows covering{' '}
                    <strong className="text-white font-mono">
                      0.000 mm to {activeTemplate.maxDipMm} mm
                    </strong>{' '}
                    (0 L to {activeTemplate.nominalCapacityLitres.toLocaleString()} L). Imported charts are always saved as{' '}
                    <strong className="text-amber-300 font-mono">DRAFT</strong> by default.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLoadVerifiedSampleCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-semibold"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>
                      Load Verified IOCL {Math.round(activeTemplate.nominalCapacityLitres / 1000)} KL Cylindrical CSV
                    </span>
                  </button>

                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/40 text-xs font-mono font-bold">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Choose CSV File</span>
                    <input
                      type="file"
                      accept=".csv,.txt,.tsv"
                      onChange={handleCsvFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-400 font-mono uppercase mb-1">
                    Source CSV File Name
                  </label>
                  <input
                    type="text"
                    value={sourceFileName}
                    onChange={e => setSourceFileName(e.target.value)}
                    placeholder={`e.g. IOCL_${activeTemplate.code}.csv`}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 font-mono uppercase mb-1">
                    Reference Document / Engineering Cert
                  </label>
                  <input
                    type="text"
                    value={referenceDocument}
                    onChange={e => setReferenceDocument(e.target.value)}
                    placeholder={`e.g. IOCL-ENGG-${activeTemplate.code}-REV1`}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 font-mono uppercase mb-1">
                    Import Notes
                  </label>
                  <input
                    type="text"
                    value={importNotes}
                    onChange={e => setImportNotes(e.target.value)}
                    placeholder="Verified calibration curve notes"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <textarea
                rows={6}
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                placeholder={`dip_mm,volume_litres\n0.000,0.000\n10.000,...\n...\n${
                  activeTemplate.maxDipMm || 2100
                }.000,${activeTemplate.nominalCapacityLitres}.000`}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
              />

              {/* Validation & Preview Diagnostics */}
              {csvPreview && (
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3 font-mono text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold uppercase text-slate-300">
                      Pre-Save CSV Validation &amp; Range Verification
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                        SAVE TARGET: DRAFT (DEFAULT)
                      </span>
                      {csvPreview.valid ? (
                        <span className="px-2.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                          VALIDATED ({csvPreview.diagnostics.pointsCount} POINTS)
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] font-bold">
                          VALIDATION FAILED
                        </span>
                      )}
                    </div>
                  </div>

                  {!csvPreview.valid && csvPreview.error && (
                    <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-[11px]">
                      ❌ {csvPreview.error}
                    </div>
                  )}

                  {csvPreview.valid && (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-[11px]">
                        <div className="p-2 bg-slate-950/70 rounded-lg border border-slate-800">
                          <span className="text-slate-500 block text-[10px]">DIP COVERAGE</span>
                          <span className="text-orange-400 font-bold">
                            {formatCalibrationDisplay(csvPreview.diagnostics.minDipMm)} –{' '}
                            {formatCalibrationDisplay(csvPreview.diagnostics.maxDipMm)} mm
                          </span>
                        </div>
                        <div className="p-2 bg-slate-950/70 rounded-lg border border-slate-800">
                          <span className="text-slate-500 block text-[10px]">VOLUME COVERAGE</span>
                          <span className="text-white font-bold">
                            {formatCalibrationDisplay(csvPreview.diagnostics.minVolumeLitres)} –{' '}
                            {formatCalibrationDisplay(csvPreview.diagnostics.maxVolumeLitres)} L
                          </span>
                        </div>
                        <div className="p-2 bg-slate-950/70 rounded-lg border border-slate-800">
                          <span className="text-slate-500 block text-[10px]">DOMINANT STEP</span>
                          <span className="text-slate-200">
                            {csvPreview.diagnostics.dominantStepMm
                              ? `${formatCalibrationDisplay(csvPreview.diagnostics.dominantStepMm)} mm`
                              : '—'}
                            {csvPreview.diagnostics.isUniformStep ? ' (Uniform)' : ' (Variable)'}
                          </span>
                        </div>
                        <div className="p-2 bg-slate-950/70 rounded-lg border border-slate-800">
                          <span className="text-slate-500 block text-[10px]">CURVE PROFILE</span>
                          <span className="text-cyan-300">
                            {csvPreview.diagnostics.isNonLinear
                              ? 'Horizontal Cylindrical (Non-Linear)'
                              : 'Linear Profile'}
                          </span>
                        </div>
                      </div>

                      <div className="max-h-40 overflow-y-auto border border-slate-800 rounded-lg">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-slate-800/80 text-slate-400 text-[10px] sticky top-0">
                            <tr>
                              <th className="py-1.5 px-3">#</th>
                              <th className="py-1.5 px-3">Dip (mm)</th>
                              <th className="py-1.5 px-3">Volume (L)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {csvPreview.normalizedPoints.slice(0, 8).map((pt, idx) => (
                              <tr key={idx}>
                                <td className="py-1 px-3 text-slate-500">{idx + 1}</td>
                                <td className="py-1 px-3 text-orange-400">
                                  {formatCalibrationDisplay(pt.dipMillimetres)}
                                </td>
                                <td className="py-1 px-3 text-white">
                                  {formatCalibrationDisplay(pt.volumeLitres)}
                                </td>
                              </tr>
                            ))}
                            {csvPreview.normalizedPoints.length > 8 && (
                              <tr>
                                <td colSpan={3} className="py-1.5 px-3 text-center text-slate-400">
                                  ... +{csvPreview.normalizedPoints.length - 8} more rows (final point:{' '}
                                  {formatCalibrationDisplay(
                                    csvPreview.normalizedPoints[
                                      csvPreview.normalizedPoints.length - 1
                                    ].dipMillimetres
                                  )}{' '}
                                  mm →{' '}
                                  {formatCalibrationDisplay(
                                    csvPreview.normalizedPoints[
                                      csvPreview.normalizedPoints.length - 1
                                    ].volumeLitres
                                  )}{' '}
                                  L)
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="inline-flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                  <input
                    type="checkbox"
                    checked={allowOverCapacity}
                    onChange={e => setAllowOverCapacity(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-800 text-orange-500"
                  />
                  <span>
                    Allow dead-stock / dome volume up to +10% above nominal capacity (
                    {activeTemplate.nominalCapacityLitres.toLocaleString()} L)
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCsvPanel(false)}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-mono"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !csvPreview?.valid}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 disabled:opacity-50 text-white text-xs font-mono font-bold shadow-md shadow-orange-500/20"
                  >
                    {submitting
                      ? 'Saving as DRAFT...'
                      : `Save Imported Points as DRAFT (${csvPreview?.diagnostics.pointsCount || 0} pts)`}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Stored Template Points Preview Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                Stored Dip-to-Volume Calibration Table ({templatePoints.length} points)
              </h3>
              {templatePoints.length > 0 && (
                <span className="text-[11px] font-mono text-slate-400">
                  Range: {formatCalibrationDisplay(templatePoints[0].dipMmStr)} mm (
                  {formatCalibrationDisplay(templatePoints[0].volumeLitreStr)} L) →{' '}
                  {formatCalibrationDisplay(
                    templatePoints[templatePoints.length - 1].dipMmStr
                  )}{' '}
                  mm (
                  {formatCalibrationDisplay(
                    templatePoints[templatePoints.length - 1].volumeLitreStr
                  )}{' '}
                  L)
                </span>
              )}
            </div>

            <div className="overflow-x-auto bg-slate-950/70 border border-slate-800 rounded-xl max-h-56">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] border-b border-slate-800 sticky top-0">
                  <tr>
                    <th className="py-2 px-4">#</th>
                    <th className="py-2 px-4">Dip (mm)</th>
                    <th className="py-2 px-4">Volume (Litres)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loadingDetail ? (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-slate-500">
                        Loading calibration points...
                      </td>
                    </tr>
                  ) : templatePoints.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-slate-500">
                        No dip-to-volume points imported yet for {activeTemplate.code}. Click{' '}
                        <strong className="text-orange-400">Upload / Import Verified CSV</strong>{' '}
                        above to import calibration data as DRAFT.
                      </td>
                    </tr>
                  ) : (
                    templatePoints.map((pt, idx) => (
                      <tr key={pt.id} className="hover:bg-slate-800/40">
                        <td className="py-1.5 px-4 text-slate-500">{idx + 1}</td>
                        <td className="py-1.5 px-4 font-bold text-orange-400">
                          {formatCalibrationDisplay(pt.dipMmStr)}
                        </td>
                        <td className="py-1.5 px-4 text-white">
                          {formatCalibrationDisplay(pt.volumeLitreStr)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Requirement 6, 7, 8 & 9: Eligible COCO Tanks & Tank-Wise Assignment Preview */}
          <div className="pt-4 border-t border-slate-800 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-orange-400" />
                  <span>
                    Verified &amp; Eligible COCO Tanks for {activeTemplate.code} (
                    {activeTemplate.nominalCapacityLitres.toLocaleString()} L •{' '}
                    {activeTemplate.tankDiameterMm}×{activeTemplate.tankLengthMm} mm • Max Dip{' '}
                    {activeTemplate.maxDipMm} mm)
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Requires exact <strong className="text-white font-mono">{activeTemplate.nominalCapacityLitres.toLocaleString()} L</strong> nominal capacity and verified tank-specific dimensions with calibration certification. Assignments create a{' '}
                  <strong className="text-amber-300 font-mono">DRAFT</strong> chart revision only —{' '}
                  <strong className="text-emerald-300 font-mono">ACTIVE</strong> tank charts, historical revisions, and existing{' '}
                  <strong className="text-cyan-300 font-mono">DRAFT</strong> revisions (including COCO 22 Tank #1 Rev #2 DRAFT) are strictly preserved.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl bg-slate-950 border border-slate-800 p-1 text-[11px] font-mono">
                  <button
                    type="button"
                    onClick={() => setScopeFilter('ALL_COCO')}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      scopeFilter === 'ALL_COCO'
                        ? 'bg-orange-500 text-white font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All COCO Outlets
                  </button>
                  <button
                    type="button"
                    onClick={() => setScopeFilter('SELECTED_OUTLET')}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      scopeFilter === 'SELECTED_OUTLET'
                        ? 'bg-orange-500 text-white font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Selected Outlet ({selectedOutletName || 'Current'})
                  </button>
                </div>

                {selectableEligibleTankIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllEligibleWithoutDraft}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-mono font-semibold"
                    data-testid="select-eligible-tanks-btn"
                  >
                    Select Eligible Tanks ({selectableEligibleTankIds.length})
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto bg-slate-950/70 border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs font-mono" data-testid="eligible-coco-tanks-table">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 w-10">Select</th>
                    <th className="py-2.5 px-3">COCO Outlet</th>
                    <th className="py-2.5 px-3">Tank &amp; Grade</th>
                    <th className="py-2.5 px-3">Verified Capacity &amp; Physical Dimensions</th>
                    <th className="py-2.5 px-3">Current Active Chart</th>
                    <th className="py-2.5 px-3">Existing Draft Protection</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loadingEligibleTanks ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500">
                        Loading verified COCO underground tanks...
                      </td>
                    </tr>
                  ) : verifiedEligibleTanks.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500">
                        No verified {activeTemplate.nominalCapacityLitres.toLocaleString()} L ({activeTemplate.tankDiameterMm}×{activeTemplate.tankLengthMm} mm) COCO tanks found in this filter scope.
                      </td>
                    </tr>
                  ) : (
                    verifiedEligibleTanks.map(tank => {
                      const isDisabled = isCocoTankSelectionDisabled(tank);
                      const isChecked = !isDisabled && selectedTankIds.includes(tank.tankId);
                      return (
                        <tr
                          key={tank.tankId}
                          className={`hover:bg-slate-800/40 ${
                            isChecked ? 'bg-orange-500/5' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isDisabled}
                              onChange={() => handleToggleTankSelection(tank)}
                              className="rounded border-slate-700 bg-slate-800 text-orange-500 disabled:opacity-40 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-white">
                              {tank.outletCode} — {tank.outletName}
                            </div>
                            <span className="text-[10px] text-orange-400 font-bold">
                              {tank.outletType}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-white">
                                Tank #{tank.tankNumber} ({tank.tankName})
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] border ${getProductCategoryBadgeClass(
                                  tank.productCode
                                )}`}
                              >
                                {tank.productCode}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-white font-bold">
                                {tank.capacityLitres.toLocaleString()} L
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold">
                                VERIFIED
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {tank.physicalDimensions.diameterMm
                                ? `${tank.physicalDimensions.diameterMm.toLocaleString()} mm Dia × ${tank.physicalDimensions.lengthMm?.toLocaleString()} mm Len • Max Dip ${tank.physicalDimensions.maxDipMm?.toLocaleString()} mm`
                                : 'Unverified dimensions'}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            {tank.currentActiveChart ? (
                              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[11px]">
                                <Lock className="w-3 h-3 text-emerald-400" />
                                <span>
                                  Rev #{tank.currentActiveChart.revisionNumber} ACTIVE (
                                  {tank.currentActiveChart.pointsCount} pts) — Preserved
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-500">No Active Chart</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {tank.existingDraftChart ? (
                              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[11px]">
                                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                                <span>
                                  Rev #{tank.existingDraftChart.revisionNumber} DRAFT Protected (
                                  {tank.existingDraftChart.pointsCount} pts)
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">
                                Ready → Will stage Rev #{tank.targetRevisionNumber} DRAFT
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Requirement 4: Display ineligible or unverified tanks separately with a clear reason and disabled checkboxes */}
            {ineligibleOrUnverifiedTanks.length > 0 && (
              <div
                className="p-4 bg-slate-950/80 border border-amber-500/30 rounded-2xl space-y-3"
                data-testid="ineligible-unverified-tanks-section"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300 font-mono flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span>
                        Ineligible or Unverified COCO Tanks — Operational Assignment Blocked (
                        {ineligibleOrUnverifiedTanks.length})
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Tanks below do not match {activeTemplate.code} ({activeTemplate.nominalCapacityLitres.toLocaleString()} L • {activeTemplate.tankDiameterMm}×{activeTemplate.tankLengthMm} mm) or lack verified tank-specific dimensions / certification. Their selection checkboxes are disabled.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto bg-slate-900/70 border border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs font-mono" data-testid="ineligible-unverified-tanks-table">
                    <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3 w-10">Select</th>
                        <th className="py-2 px-3">COCO Outlet</th>
                        <th className="py-2 px-3">Tank &amp; Grade</th>
                        <th className="py-2 px-3">Nominal Capacity &amp; Recorded Dimensions</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Reason Assignment Is Blocked</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {ineligibleOrUnverifiedTanks.map(tank => {
                        const badge = getCocoTankEligibilityBadge(tank);
                        return (
                          <tr key={tank.tankId} className="opacity-80 bg-slate-950/40">
                            <td className="py-2 px-3">
                              <input
                                type="checkbox"
                                checked={false}
                                disabled={true}
                                readOnly
                                className="rounded border-slate-700 bg-slate-900 text-slate-600 opacity-40 cursor-not-allowed"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <div className="font-bold text-slate-200">
                                {tank.outletCode} — {tank.outletName}
                              </div>
                              <span className="text-[10px] text-orange-400 font-bold">
                                {tank.outletType}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-200">
                                  Tank #{tank.tankNumber} ({tank.tankName})
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] border ${getProductCategoryBadgeClass(
                                    tank.productCode
                                  )}`}
                                >
                                  {tank.productCode}
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-3">
                              <div className="text-slate-200 font-bold">
                                {tank.capacityLitres.toLocaleString()} L
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {tank.physicalDimensions.diameterMm && tank.physicalDimensions.lengthMm
                                  ? `${tank.physicalDimensions.diameterMm.toLocaleString()} mm Dia × ${tank.physicalDimensions.lengthMm.toLocaleString()} mm Len • Max Dip ${tank.physicalDimensions.maxDipMm?.toLocaleString()} mm`
                                  : 'UNVERIFIED — Missing Tank Dimensions'}
                              </div>
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badge.badgeClass}`}
                              >
                                {badge.label}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-[11px] text-amber-200/90">
                              {badge.reason}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Preview Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-mono text-slate-400">
                {selectedTankIds.length} verified compatible tank(s) selected for assignment preview
              </div>
              <button
                type="button"
                disabled={selectedTankIds.length === 0 || submitting || !canApproveCalibrationChart}
                onClick={handlePreviewAssignment}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-mono font-bold shadow-md shadow-cyan-600/20"
                data-testid="preview-tank-assignment-btn"
              >
                <Eye className="w-4 h-4" />
                <span>Preview Tank-Wise Assignment ({selectedTankIds.length})</span>
              </button>
            </div>

            {/* Requirement 7, 8 & 9: Tank-Wise Assignment Preview & Confirmation Panel */}
            {assignmentPreview && (
              <div
                className="p-4 bg-slate-950/90 border border-cyan-500/40 rounded-2xl space-y-4 font-mono text-xs"
                data-testid="tank-assignment-preview-panel"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <h4 className="text-xs font-bold uppercase text-cyan-300 flex items-center gap-1.5">
                      <Eye className="w-4 h-4 text-cyan-400" />
                      <span>
                        Tank-Wise Assignment Preview — {assignmentPreview.template.code} (
                        {assignmentPreview.totalTanksSelected} Tank
                        {assignmentPreview.totalTanksSelected > 1 ? 's' : ''})
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Confirming assignment stages new <strong className="text-amber-300">DRAFT</strong> revisions only. Active charts and existing drafts (such as COCO 22 Tank #1 Rev #2 DRAFT) are never overwritten.
                    </p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                    SAFE MODE: ACTIVE CHARTS &amp; EXISTING DRAFTS PRESERVED
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px]">
                      <tr>
                        <th className="py-2 px-3">Tank</th>
                        <th className="py-2 px-3">Capacity</th>
                        <th className="py-2 px-3">Current Active Chart</th>
                        <th className="py-2 px-3">Existing Draft</th>
                        <th className="py-2 px-3">Preview Outcome</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {assignmentPreview.previews.map(item => (
                        <tr key={item.tankId}>
                          <td className="py-2 px-3 font-bold text-white">
                            Tank #{item.tankNumber} — {item.tankName} ({item.productCode || item.productName})
                          </td>
                          <td className="py-2 px-3 text-slate-200">
                            {item.capacityLitres.toLocaleString()} L
                          </td>
                          <td className="py-2 px-3 text-emerald-300">
                            {item.currentActiveChart
                              ? `Rev #${item.currentActiveChart.revisionNumber} ACTIVE (Preserved)`
                              : 'None'}
                          </td>
                          <td className="py-2 px-3">
                            {item.existingDraftChart ? (
                              <span className="text-amber-300 font-bold">
                                Rev #{item.existingDraftChart.revisionNumber} DRAFT (Preserved)
                              </span>
                            ) : (
                              <span className="text-slate-500">None</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-cyan-300 font-semibold">
                            {item.recommendation}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {activeTemplate.status !== 'APPROVED' && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-[11px]">
                    ⚠️ Template <strong>{activeTemplate.code}</strong> is currently in{' '}
                    <strong>{activeTemplate.status}</strong> status. Please import verified CSV
                    points and click <strong>Verify &amp; Approve Template</strong> before
                    confirming tank assignment.
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <input
                    type="text"
                    value={assignmentNotes}
                    onChange={e => setAssignmentNotes(e.target.value)}
                    placeholder="Optional assignment audit note..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAssignmentPreview(null)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-mono"
                    >
                      Close Preview
                    </button>
                    {canApproveCalibrationChart && (
                      <button
                        type="button"
                        disabled={
                          submitting ||
                          activeTemplate.status !== 'APPROVED' ||
                          activeTemplate.pointsCount < 2
                        }
                        onClick={handleConfirmDraftAssignment}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-mono font-bold shadow-md shadow-orange-500/20"
                        data-testid="confirm-tank-assignment-btn"
                      >
                        <Check className="w-4 h-4" />
                        <span>Confirm Stage as DRAFT Revision</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Requirement 10: Global Calibration Master Audit Trail */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
            <History className="w-4 h-4 text-orange-400" />
            <span>Global Calibration Master Audit Trail</span>
          </h3>
          <button
            type="button"
            onClick={loadAuditTrail}
            className="text-[11px] font-mono text-slate-400 hover:text-white"
          >
            {loadingAuditLogs ? 'Refreshing...' : 'Refresh Logs'}
          </button>
        </div>

        <div className="overflow-x-auto bg-slate-950/70 border border-slate-800 rounded-xl max-h-60">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] border-b border-slate-800 sticky top-0">
              <tr>
                <th className="py-2 px-4">Timestamp</th>
                <th className="py-2 px-4">Action</th>
                <th className="py-2 px-4">Details</th>
                <th className="py-2 px-4">Authorised By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-5 text-center text-slate-500">
                    No Global Calibration Master audit events recorded yet in this session.
                  </td>
                </tr>
              ) : (
                auditLogs.map(log => {
                  const formatted = formatGlobalCalibrationAuditLogEntry(log);
                  return (
                    <tr key={log.id} className="hover:bg-slate-800/40">
                      <td className="py-2 px-4 text-slate-400 whitespace-nowrap">
                        {log.createdAt.replace('T', ' ').slice(0, 19)}
                      </td>
                      <td className="py-2 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${formatted.actionBadgeClass}`}
                        >
                          {formatted.actionBadge}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-slate-200">{formatted.summary}</td>
                      <td className="py-2 px-4 text-slate-300 whitespace-nowrap">
                        {log.userName || 'Administrator'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Custom Global Template Modal */}
      {showCreateCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setShowCreateCustomModal(false)}
          />
          <div className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white font-mono">
              Create Custom Global Calibration Template
            </h3>
            <form onSubmit={handleCreateCustomTemplate} className="space-y-3 text-xs font-mono">
              <div>
                <label className="block text-slate-400 mb-1">Template Code</label>
                <input
                  type="text"
                  required
                  value={customCode}
                  onChange={e => setCustomCode(e.target.value.toUpperCase())}
                  placeholder="e.g. STANDARD_30KL"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Template Name</label>
                <input
                  type="text"
                  required
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="e.g. IOCL Standard 30 KL Tank Calibration"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Nominal Capacity (L)</label>
                  <input
                    type="number"
                    required
                    value={customCapacity}
                    onChange={e => setCustomCapacity(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Diameter (mm)</label>
                  <input
                    type="number"
                    required
                    value={customDiameterMm}
                    onChange={e => setCustomDiameterMm(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Length (mm)</label>
                  <input
                    type="number"
                    required
                    value={customLengthMm}
                    onChange={e => setCustomLengthMm(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Max Dip (mm)</label>
                  <input
                    type="number"
                    required
                    value={customMaxDipMm}
                    onChange={e => setCustomMaxDipMm(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Notes</label>
                <input
                  type="text"
                  value={customNotes}
                  onChange={e => setCustomNotes(e.target.value)}
                  placeholder="Reference engineering specification"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateCustomModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-orange-500 text-white font-bold"
                >
                  {submitting ? 'Creating...' : 'Create as DRAFT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Excel Import */}
      {showConfirmImportModal && excelPreviewResult && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          data-testid="excel-import-confirm-modal"
        >
          <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white font-bold">
                <FileCheck className="w-5 h-5 text-emerald-400" />
                <span>Confirm Excel Calibration Import as DRAFT</span>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmImportModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono text-slate-300">
              <p>
                You are about to import verified calibration charts from <strong className="text-white">{excelPreviewResult.workbookName}</strong> into the IOCL Digital Outlet Manager:
              </p>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                  <Check className="w-4 h-4" />
                  <span>Three Calibration Reference Charts (Saved/Retained as DRAFT):</span>
                </div>
                <ul className="list-disc list-inside pl-2 space-y-1.5 text-slate-200">
                  <li>
                    <strong>EXCEL_10KL_REFERENCE</strong> (10,000 L • 1,940×3,750 mm):{' '}
                    <span className="text-rose-300 font-bold">
                      10 KL — DRAFT / ENGINEERING REVIEW REQUIRED — 195 points
                    </span>{' '}
                    (0 to 1,940 mm, 11,073.41 L max volume; locked from approval/assignment until engineering review)
                  </li>
                  <li>
                    <strong>EXCEL_15KL_REFERENCE</strong> (15,000 L • 1,940×5,500 mm):{' '}
                    <span className="text-amber-300 font-bold">
                      15 KL — DRAFT / DIMENSION VERIFICATION REQUIRED — 195 points
                    </span>{' '}
                    (0 to 1,940 mm, 16,246.13 L max volume; retained without duplicating points if already imported)
                  </li>
                  <li>
                    <strong>EXCEL_20KL_REFERENCE</strong> (20,000 L • 2,100×6,250 mm):{' '}
                    <span className="text-cyan-300 font-bold">
                      20 KL — DRAFT / PENDING VERIFICATION — 211 points
                    </span>{' '}
                    (0 to 2,100 mm, 21,628.93 L max volume; retained without duplicating points if already imported)
                  </li>
                </ul>
              </div>

              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-200 text-[11px]">
                <ShieldCheck className="w-4 h-4 inline-block mr-1 text-emerald-400" />
                <strong>Strict Preservation:</strong> Already-imported 15 KL and 20 KL DRAFT readings are retained without duplication. Standard templates (<code>STANDARD_20KL</code>, <code>STANDARD_50KL</code>), active tank revisions, historical readings, and financial records remain completely untouched.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowConfirmImportModal(false)}
                disabled={importingExcel}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmImportAllEligible}
                disabled={importingExcel}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs shadow-md shadow-emerald-600/20"
                data-testid="confirm-excel-import-btn"
              >
                {importingExcel ? 'Importing...' : 'Confirm Import All Three Calibration References'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
