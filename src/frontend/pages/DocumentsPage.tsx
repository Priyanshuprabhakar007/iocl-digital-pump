import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch, apiFetchBlob } from '../services/api';
import { PERMISSIONS } from '../../shared/constants';
import {
  CocoAttachmentInfo,
  CocoAuthoritativeSource,
  CocoComplianceMergedItem,
  CocoComplianceStatus,
  CocoDueDatesAndActionsSummary,
  CocoOnePagerReport,
  CocoPaymentStatus,
  CocoStatusYesNo,
  formatComplianceDateDisplay,
  formatIndianCurrencyFromPaise,
  STANDARD_COCO_CATEGORIES,
} from '../../shared/cocoComplianceUtils';
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Building2,
  FileImage,
  File,
  Calendar,
  Search,
  Plus,
  Edit3,
  Eye,
  Download,
  Clock,
  IndianRupee,
  Wrench,
  ShieldCheck,
  Filter,
  RefreshCw,
  X,
  Link2,
  FileWarning,
  ClipboardCheck,
} from 'lucide-react';

interface OutletOption {
  id: string;
  roCode: string;
  name: string;
  outletType?: string;
}

interface VaultDocumentRecord {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  outletId: string | null;
  uploadedByUserId: string;
  createdAt: string;
}

type ActiveTab = 'REGISTER' | 'ONE_PAGER' | 'DUE_DATES';
type ExpiryHorizon = 30 | 60 | 90;

const STATUS_BADGE_STYLES: Record<
  CocoComplianceStatus,
  { label: string; className: string }
> = {
  VALID: {
    label: 'VALID',
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  EXPIRING_SOON: {
    label: 'EXPIRING SOON',
    className: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  EXPIRED: {
    label: 'EXPIRED',
    className: 'bg-red-500/15 text-red-400 border-red-500/30',
  },
  PAYMENT_PENDING: {
    label: 'PAYMENT PENDING',
    className: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  },
  ACTION_REQUIRED: {
    label: 'ACTION REQUIRED',
    className: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  },
  NOT_RECORDED: {
    label: 'NOT RECORDED',
    className: 'bg-slate-800 text-slate-400 border-slate-700',
  },
  NOT_APPLICABLE: {
    label: 'NOT APPLICABLE',
    className: 'bg-slate-800/60 text-slate-500 border-slate-700/60',
  },
};

const PAYMENT_BADGE_STYLES: Record<
  CocoPaymentStatus,
  { label: string; className: string }
> = {
  PAID: {
    label: 'PAID',
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  PENDING: {
    label: 'PENDING',
    className: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  },
  OVERDUE: {
    label: 'OVERDUE',
    className: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
  NOT_APPLICABLE: {
    label: 'N/A',
    className: 'bg-slate-800/60 text-slate-500 border-slate-700/50',
  },
  NOT_RECORDED: {
    label: 'NOT RECORDED',
    className: 'bg-slate-800 text-slate-400 border-slate-700',
  },
};

const SOURCE_LABELS: Record<CocoAuthoritativeSource, string> = {
  MANUAL: 'Manual Register',
  MUNICIPAL_TAX_MODULE: 'Municipal Tax Module',
  NFR_LEASE_RENT_MODULE: 'NFR Lease & Rent Module',
  UTILITY_BILLS_MODULE: 'Utility Bills Module',
  NONE: 'Not Recorded',
};

export const DocumentsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canRead = hasPermission(PERMISSIONS.DOCUMENTS_READ);
  const canWrite = hasPermission(PERMISSIONS.DOCUMENTS_WRITE);

  const [activeTab, setActiveTab] = useState<ActiveTab>('REGISTER');
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [showCocoOnly, setShowCocoOnly] = useState<boolean>(true);
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');
  const [reportDate, setReportDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );

  // Register & One-Pager state
  const [registerItems, setRegisterItems] = useState<CocoComplianceMergedItem[]>([]);
  const [dueDatesAndActions, setDueDatesAndActions] =
    useState<CocoDueDatesAndActionsSummary>({
      expired: [],
      expiringWithin30Days: [],
      expiringWithin60Days: [],
      expiringWithin90Days: [],
      paymentsPending: [],
      serviceActionsPending: [],
      notRecorded: [],
    });
  const EMPTY_SUMMARY: CocoOnePagerReport['summary'] = {
    totalCategories: 14,
    validCount: 0,
    expiringSoonCount: 0,
    expiredCount: 0,
    paymentPendingCount: 0,
    actionRequiredCount: 0,
    notRecordedCount: 0,
    notApplicableCount: 0,
    discrepancyCount: 0,
  };
  const [summary, setSummary] = useState<CocoOnePagerReport['summary']>(EMPTY_SUMMARY);
  const [outletLoadError, setOutletLoadError] = useState<string | null>(null);
  const [onePagerReport, setOnePagerReport] = useState<CocoOnePagerReport | null>(null);
  const [vaultDocs, setVaultDocs] = useState<VaultDocumentRecord[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [expiryHorizon, setExpiryHorizon] = useState<ExpiryHorizon>(30);

  // Loading & notification state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  // Add/Edit Record Modal state
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<CocoComplianceMergedItem | null>(null);
  const [isCustomCategoryMode, setIsCustomCategoryMode] = useState<boolean>(false);
  const [formCategoryCode, setFormCategoryCode] = useState<string>('PESO_LICENCE');
  const [formCustomCategoryName, setFormCustomCategoryName] = useState<string>('');
  const [formDocumentTitle, setFormDocumentTitle] = useState<string>('');
  const [formReferenceNumber, setFormReferenceNumber] = useState<string>('');
  const [formIssueDate, setFormIssueDate] = useState<string>('');
  const [formValidityDueDate, setFormValidityDueDate] = useState<string>('');
  const [formLastServiceDate, setFormLastServiceDate] = useState<string>('');
  const [formAmountRupees, setFormAmountRupees] = useState<string>('');
  const [formFrequency, setFormFrequency] = useState<string>('');
  const [formPaymentStatus, setFormPaymentStatus] = useState<CocoPaymentStatus>('NOT_RECORDED');
  const [formPaymentDate, setFormPaymentDate] = useState<string>('');
  const [formComplianceStatus, setFormComplianceStatus] = useState<CocoComplianceStatus>('VALID');
  const [formStatusYesNo, setFormStatusYesNo] = useState<CocoStatusYesNo>('YES');
  const [formResponsiblePerson, setFormResponsiblePerson] = useState<string>('');
  const [formRemarks, setFormRemarks] = useState<string>('');
  const [formActionRequired, setFormActionRequired] = useState<string>('');
  const [formAttachmentIds, setFormAttachmentIds] = useState<string[]>([]);
  const [isSavingRecord, setIsSavingRecord] = useState<boolean>(false);
  const [modalUploadingFile, setModalUploadingFile] = useState<boolean>(false);

  // Standalone Vault Upload Modal state
  const [isVaultUploadOpen, setIsVaultUploadOpen] = useState<boolean>(false);
  const [vaultFile, setVaultFile] = useState<File | null>(null);
  const [isVaultUploading, setIsVaultUploading] = useState<boolean>(false);

  // Attachment Preview Modal state
  const [previewAttachment, setPreviewAttachment] = useState<CocoAttachmentInfo | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);

  // Filter outlets for COCO selector
  const displayedOutlets = useMemo(() => {
    if (!showCocoOnly) return outlets;
    const cocoList = outlets.filter(
      (o) =>
        o.outletType === 'COCO' ||
        /coco/i.test(o.name)
    );
    return cocoList.length > 0 ? cocoList : outlets;
  }, [outlets, showCocoOnly]);

  const selectedOutlet = useMemo(
    () => outlets.find((o) => o.id === selectedOutletId) || null,
    [outlets, selectedOutletId]
  );

  // Load accessible outlets on mount using apiFetch
  const loadOutlets = useCallback(async () => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setOutletLoadError(null);
    setBannerError(null);
    try {
      const res = await apiFetch<OutletOption[]>('/api/v1/outlets');
      if (res.success && Array.isArray(res.data)) {
        const list: OutletOption[] = res.data;
        setOutlets(list);
        setOutletLoadError(null);
        if (list.length === 0) {
          setSelectedOutletId('');
          setRegisterItems([]);
          setSummary(EMPTY_SUMMARY);
          setIsLoading(false);
          return;
        }
        // Default to first COCO outlet (e.g. COCO IT Park / COCO 22) or first accessible outlet
        const cocoDefault =
          list.find((o) => /it park/i.test(o.name) || o.roCode === '373196') ||
          list.find((o) => o.outletType === 'COCO' || /coco/i.test(o.name)) ||
          list[0];
        if (cocoDefault) {
          setSelectedOutletId(cocoDefault.id);
        } else {
          setSelectedOutletId('');
          setIsLoading(false);
        }
      } else {
        const errorMsg = res.error?.message || 'Failed to load accessible retail outlets.';
        setOutletLoadError(errorMsg);
        setBannerError(errorMsg);
        setOutlets([]);
        setSelectedOutletId('');
        setRegisterItems([]);
        setSummary(EMPTY_SUMMARY);
        setIsLoading(false);
      }
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to load accessible retail outlets.';
      setOutletLoadError(errorMsg);
      setBannerError(errorMsg);
      setOutlets([]);
      setSelectedOutletId('');
      setRegisterItems([]);
      setSummary(EMPTY_SUMMARY);
      setIsLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    loadOutlets();
  }, [loadOutlets]);

  // Load compliance register, One-Pager preview, and outlet R2 documents whenever outlet or reportDate changes
  const fetchOutletComplianceData = async (outletId: string, dateStr: string) => {
    if (!outletId || !canRead) return;
    setIsLoading(true);
    setBannerError(null);
    try {
      const [regRes, onePagerRes, docsRes] = await Promise.all([
        apiFetch<{
          items: CocoComplianceMergedItem[];
          dueDatesAndActions: CocoDueDatesAndActionsSummary;
          summary: CocoOnePagerReport['summary'];
        }>(
          `/api/v1/documents/compliance/register?outletId=${encodeURIComponent(
            outletId
          )}&reportDate=${encodeURIComponent(dateStr)}`
        ),
        apiFetch<CocoOnePagerReport>(
          `/api/v1/documents/compliance/one-pager?outletId=${encodeURIComponent(
            outletId
          )}&reportDate=${encodeURIComponent(dateStr)}`
        ),
        apiFetch<VaultDocumentRecord[]>(
          `/api/v1/documents?outletId=${encodeURIComponent(outletId)}`
        ),
      ]);

      if (regRes.success && regRes.data) {
        setRegisterItems(regRes.data.items || []);
        setDueDatesAndActions(
          regRes.data.dueDatesAndActions || {
            expired: [],
            expiringWithin30Days: [],
            expiringWithin60Days: [],
            expiringWithin90Days: [],
            paymentsPending: [],
            serviceActionsPending: [],
            notRecorded: [],
          }
        );
        if (regRes.data.summary) {
          setSummary(regRes.data.summary);
        }
      } else {
        setBannerError(regRes.error?.message || 'Failed to load compliance register.');
      }

      if (onePagerRes.success && onePagerRes.data) {
        setOnePagerReport(onePagerRes.data);
      } else if (!regRes.success) {
        // regRes error already displayed in banner
      } else if (!onePagerRes.success && onePagerRes.error?.message) {
        setBannerError(onePagerRes.error.message);
      }

      if (docsRes.success && Array.isArray(docsRes.data)) {
        setVaultDocs(docsRes.data);
      } else if (docsRes.error?.message && regRes.success) {
        setBannerError(docsRes.error.message);
      }
    } catch (err: any) {
      setBannerError(err?.message || 'Network error while loading COCO compliance data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedOutletId) {
      fetchOutletComplianceData(selectedOutletId, reportDate);
    }
  }, [selectedOutletId, reportDate]);

  // Clean up blob URL when closing attachment preview modal
  useEffect(() => {
    return () => {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
    };
  }, [previewBlobUrl]);

  // Client-side filtered items for Tab 1 Document Register
  const filteredRegisterItems = useMemo(() => {
    return registerItems.filter((item) => {
      if (categoryFilter !== 'ALL' && item.categoryCode !== categoryFilter) {
        return false;
      }
      if (statusFilter !== 'ALL' && item.complianceStatus !== statusFilter) {
        return false;
      }
      if (searchQuery.trim() !== '') {
        const q = searchQuery.trim().toLowerCase();
        const matches =
          item.categoryName.toLowerCase().includes(q) ||
          item.categoryCode.toLowerCase().includes(q) ||
          (item.documentTitle && item.documentTitle.toLowerCase().includes(q)) ||
          (item.referenceNumber && item.referenceNumber.toLowerCase().includes(q)) ||
          (item.remarks && item.remarks.toLowerCase().includes(q)) ||
          (item.actionRequired && item.actionRequired.toLowerCase().includes(q)) ||
          (item.responsiblePerson && item.responsiblePerson.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [registerItems, categoryFilter, statusFilter, searchQuery]);

  // Open modal to add/edit a standard or custom category record
  const openRecordEditor = (
    item?: CocoComplianceMergedItem | null,
    customMode = false
  ) => {
    setBannerError(null);
    setBannerSuccess(null);

    if (item) {
      setEditingItem(item);
      setIsCustomCategoryMode(item.isCustomCategory);
      setFormCategoryCode(item.categoryCode);
      setFormCustomCategoryName(item.isCustomCategory ? item.categoryName : '');
      setFormDocumentTitle(item.documentTitle || '');
      setFormReferenceNumber(item.referenceNumber || '');
      setFormIssueDate(item.issueDate || '');
      setFormValidityDueDate(item.validityDueDate || '');
      setFormLastServiceDate(item.lastServiceDate || '');
      setFormAmountRupees(
        item.amountPaise !== null && item.amountPaise !== undefined
          ? String(item.amountPaise / 100)
          : ''
      );
      setFormFrequency(item.frequency || '');
      setFormPaymentStatus(
        item.paymentStatus === 'NOT_RECORDED' ? 'PAID' : item.paymentStatus
      );
      setFormPaymentDate(item.paymentDate || '');
      setFormComplianceStatus(
        item.complianceStatus === 'NOT_RECORDED' ? 'VALID' : item.complianceStatus
      );
      setFormStatusYesNo(
        item.statusYesNo === 'NOT_RECORDED' ? 'YES' : item.statusYesNo
      );
      setFormResponsiblePerson(item.responsiblePerson || '');
      setFormRemarks(item.remarks || '');
      setFormActionRequired(item.actionRequired || '');
      setFormAttachmentIds(item.attachmentDocumentIds || []);
    } else if (customMode) {
      setEditingItem(null);
      setIsCustomCategoryMode(true);
      setFormCategoryCode(`CUSTOM_${Date.now().toString(36).toUpperCase()}`);
      setFormCustomCategoryName('');
      setFormDocumentTitle('');
      setFormReferenceNumber('');
      setFormIssueDate('');
      setFormValidityDueDate('');
      setFormLastServiceDate('');
      setFormAmountRupees('');
      setFormFrequency('Yearly');
      setFormPaymentStatus('NOT_APPLICABLE');
      setFormPaymentDate('');
      setFormComplianceStatus('VALID');
      setFormStatusYesNo('YES');
      setFormResponsiblePerson('');
      setFormRemarks('');
      setFormActionRequired('');
      setFormAttachmentIds([]);
    } else {
      const firstUnrecorded =
        registerItems.find((i) => !i.isCustomCategory && i.complianceStatus === 'NOT_RECORDED') ||
        registerItems[0];
      setEditingItem(firstUnrecorded || null);
      setIsCustomCategoryMode(false);
      const code = firstUnrecorded?.categoryCode || 'PESO_LICENCE';
      const stdDef = STANDARD_COCO_CATEGORIES.find((c) => c.code === code);
      setFormCategoryCode(code);
      setFormCustomCategoryName('');
      setFormDocumentTitle(firstUnrecorded?.documentTitle || '');
      setFormReferenceNumber(firstUnrecorded?.referenceNumber || '');
      setFormIssueDate(firstUnrecorded?.issueDate || '');
      setFormValidityDueDate(firstUnrecorded?.validityDueDate || '');
      setFormLastServiceDate(firstUnrecorded?.lastServiceDate || '');
      setFormAmountRupees(
        firstUnrecorded?.amountPaise !== null && firstUnrecorded?.amountPaise !== undefined
          ? String(firstUnrecorded.amountPaise / 100)
          : ''
      );
      setFormFrequency(firstUnrecorded?.frequency || stdDef?.defaultFrequency || 'Yearly');
      setFormPaymentStatus(
        firstUnrecorded?.paymentStatus && firstUnrecorded.paymentStatus !== 'NOT_RECORDED'
          ? firstUnrecorded.paymentStatus
          : stdDef?.supportsAmount
          ? 'PAID'
          : 'NOT_APPLICABLE'
      );
      setFormPaymentDate(firstUnrecorded?.paymentDate || '');
      setFormComplianceStatus('VALID');
      setFormStatusYesNo('YES');
      setFormResponsiblePerson(firstUnrecorded?.responsiblePerson || '');
      setFormRemarks(firstUnrecorded?.remarks || '');
      setFormActionRequired(firstUnrecorded?.actionRequired || '');
      setFormAttachmentIds(firstUnrecorded?.attachmentDocumentIds || []);
    }

    setIsEditorOpen(true);
  };

  // Upload file to R2 inside the record editor modal and automatically attach it
  const handleInlineModalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedOutletId) return;

    setModalUploadingFile(true);
    setBannerError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('outletId', selectedOutletId);

      const res = await apiFetch<VaultDocumentRecord>('/api/v1/documents', {
        method: 'POST',
        body: fd,
      });

      if (res.success && res.data?.id) {
        const uploadedDoc: VaultDocumentRecord = res.data;
        setVaultDocs((prev) => [uploadedDoc, ...prev]);
        setFormAttachmentIds((prev) =>
          prev.includes(uploadedDoc.id) ? prev : [...prev, uploadedDoc.id]
        );
      } else {
        setBannerError(res.error?.message || 'Attachment upload to R2 failed.');
      }
    } catch (err: any) {
      setBannerError(err?.message || 'Network error while uploading attachment to R2 Vault.');
    } finally {
      setModalUploadingFile(false);
      e.target.value = '';
    }
  };

  // Save compliance record
  const handleSaveComplianceRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOutletId) return;

    setIsSavingRecord(true);
    setBannerError(null);
    setBannerSuccess(null);

    try {
      let amountPaise: number | null = null;
      if (formAmountRupees.trim() !== '') {
        const parsedRupees = Number(formAmountRupees.trim());
        if (Number.isNaN(parsedRupees) || parsedRupees < 0) {
          setBannerError('Please enter a valid non-negative amount in INR.');
          setIsSavingRecord(false);
          return;
        }
        amountPaise = Math.round(parsedRupees * 100);
      }

      const categoryCodeToSend = isCustomCategoryMode
        ? editingItem?.isCustomCategory
          ? editingItem.categoryCode
          : `CUSTOM_${formCustomCategoryName
              .trim()
              .toUpperCase()
              .replace(/[^A-Z0-9]+/g, '_')
              .slice(0, 32)}_${Date.now().toString(36).slice(-4).toUpperCase()}`
        : formCategoryCode;

      const payload = {
        outletId: selectedOutletId,
        categoryCode: categoryCodeToSend,
        categoryName: isCustomCategoryMode ? formCustomCategoryName.trim() : undefined,
        isCustomCategory: isCustomCategoryMode,
        documentTitle: formDocumentTitle.trim() || null,
        referenceNumber: formReferenceNumber.trim() || null,
        issueDate: formIssueDate.trim() || null,
        validityDueDate: formValidityDueDate.trim() || null,
        lastServiceDate: formLastServiceDate.trim() || null,
        amountPaise,
        frequency: formFrequency.trim() || null,
        paymentStatus: formPaymentStatus,
        paymentDate: formPaymentDate.trim() || null,
        complianceStatus: formComplianceStatus,
        statusYesNo: formStatusYesNo,
        responsiblePerson: formResponsiblePerson.trim() || null,
        remarks: formRemarks.trim() || null,
        actionRequired: formActionRequired.trim() || null,
        attachmentDocumentIds: formAttachmentIds,
      };

      const res = await apiFetch<any>('/api/v1/documents/compliance/records', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res.success && res.data) {
        setBannerSuccess(
          `Saved compliance record for "${res.data.categoryName}" (${selectedOutlet?.name || ''}).`
        );
        setIsEditorOpen(false);
        await fetchOutletComplianceData(selectedOutletId, reportDate);
      } else {
        setBannerError(res.error?.message || 'Failed to save compliance record.');
      }
    } catch (err: any) {
      setBannerError(err?.message || 'Network error while saving compliance record.');
    } finally {
      setIsSavingRecord(false);
    }
  };

  // Standalone R2 Document Vault upload
  const handleStandaloneVaultUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultFile || !selectedOutletId) return;

    setIsVaultUploading(true);
    setBannerError(null);
    setBannerSuccess(null);

    try {
      const fd = new FormData();
      fd.append('file', vaultFile);
      fd.append('outletId', selectedOutletId);

      const res = await apiFetch<VaultDocumentRecord>('/api/v1/documents', {
        method: 'POST',
        body: fd,
      });

      if (res.success && res.data) {
        setBannerSuccess(`Uploaded "${res.data.name}" to Cloudflare R2 Document Vault.`);
        setVaultFile(null);
        setIsVaultUploadOpen(false);
        await fetchOutletComplianceData(selectedOutletId, reportDate);
      } else {
        setBannerError(res.error?.message || 'Document upload failed.');
      }
    } catch (err: any) {
      setBannerError(err?.message || 'Network error during document upload.');
    } finally {
      setIsVaultUploading(false);
    }
  };

  // Authenticated Attachment Viewing (in-modal via Blob URL)
  const handleViewAttachment = async (att: CocoAttachmentInfo) => {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
    setPreviewAttachment(att);
    setIsPreviewLoading(true);
    setBannerError(null);

    try {
      const res = await apiFetchBlob(`/api/v1/documents/${encodeURIComponent(att.id)}/content`);
      if (!res.success || !res.blob) {
        setBannerError(res.error?.message || 'Unable to load attachment preview.');
        setPreviewAttachment(null);
        return;
      }
      const url = URL.createObjectURL(res.blob);
      setPreviewBlobUrl(url);
    } catch (err: any) {
      setBannerError(err?.message || 'Network error while loading attachment from R2.');
      setPreviewAttachment(null);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  // Authenticated Attachment Download
  const handleDownloadAttachment = async (att: CocoAttachmentInfo) => {
    setBannerError(null);
    try {
      const res = await apiFetchBlob(`/api/v1/documents/${encodeURIComponent(att.id)}/download`);
      if (!res.success || !res.blob) {
        setBannerError(res.error?.message || 'Unable to download attachment.');
        return;
      }
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename || att.name || 'document';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setBannerError(err?.message || 'Network error while downloading attachment.');
    }
  };

  // Generate & Download A4 Portrait One-Pager PDF
  const handleGenerateOnePagerPdf = async () => {
    if (!selectedOutletId) return;
    setIsGeneratingPdf(true);
    setBannerError(null);
    setBannerSuccess(null);

    try {
      const res = await apiFetchBlob(
        `/api/v1/documents/compliance/one-pager/pdf?outletId=${encodeURIComponent(
          selectedOutletId
        )}&reportDate=${encodeURIComponent(reportDate)}`
      );

      if (!res.success || !res.blob) {
        setBannerError(res.error?.message || 'Failed to generate COCO One-Pager PDF.');
        return;
      }

      const url = URL.createObjectURL(res.blob);
      const safeRo = (selectedOutlet?.roCode || 'COCO').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = res.filename || `COCO_One_Pager_${safeRo}_${reportDate}.pdf`;
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setBannerSuccess(
        `Generated and downloaded A4 COCO One-Pager PDF for ${selectedOutlet?.name || 'Outlet'} (${
          selectedOutlet?.roCode || ''
        }).`
      );
    } catch (err: any) {
      setBannerError(err?.message || 'Network error while generating COCO One-Pager PDF.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getFileIcon = (mime: string) => {
    if (mime === 'application/pdf') return <FileText className="w-4 h-4 text-red-400" />;
    if (mime.startsWith('image/')) return <FileImage className="w-4 h-4 text-blue-400" />;
    return <File className="w-4 h-4 text-slate-400" />;
  };

  if (!canRead) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-white">Access Denied</h2>
        <p className="text-slate-400 mt-1">
          You do not have permission to view COCO Documents & Compliance records.
        </p>
      </div>
    );
  }

  const expiringBySelectedHorizon =
    expiryHorizon === 30
      ? dueDatesAndActions.expiringWithin30Days
      : expiryHorizon === 60
      ? dueDatesAndActions.expiringWithin60Days
      : dueDatesAndActions.expiringWithin90Days;

  return (
    <div className="space-y-6">
      {/* Top Header & COCO Outlet / Report Date Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-6 h-6 text-orange-500" />
              <h2 className="text-2xl font-bold text-white tracking-tight">
                COCO Documents & Compliance Management
              </h2>
            </div>
            <p className="text-slate-400 text-sm mt-1">
              Maintain statutory licences, municipal taxes, lease rent, utility dues, equipment AMC & generate printable A4 COCO Compliance One-Pagers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {canWrite && (
              <>
                <button
                  type="button"
                  onClick={() => openRecordEditor(null, false)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add / Update Record
                </button>
                <button
                  type="button"
                  onClick={() => openRecordEditor(null, true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-sm font-medium rounded-lg transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-orange-400" />
                  Add Custom Category
                </button>
                <button
                  type="button"
                  onClick={() => setIsVaultUploadOpen(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-sm font-medium rounded-lg transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-blue-400" />
                  R2 Vault Upload
                </button>
              </>
            )}
          </div>
        </div>

        {/* Outlet Selector + Report Date Selector */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-5">
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="coco-outlet-selector"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-400"
              >
                Select COCO Retail Outlet
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCocoOnly}
                  onChange={(e) => setShowCocoOnly(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-orange-500 focus:ring-orange-500"
                />
                Prioritize COCO Outlets
              </label>
            </div>
            <div className="relative">
              <Building2 className="w-4 h-4 text-orange-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                id="coco-outlet-selector"
                value={selectedOutletId}
                onChange={(e) => setSelectedOutletId(e.target.value)}
                disabled={displayedOutlets.length === 0}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-orange-500 disabled:opacity-50"
              >
                {displayedOutlets.length === 0 ? (
                  <option value="">
                    {outletLoadError
                      ? 'Error loading outlets — see details below'
                      : 'No accessible retail outlets found'}
                  </option>
                ) : (
                  displayedOutlets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} — {o.roCode} {o.outletType ? `(${o.outletType})` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="md:col-span-3">
            <label
              htmlFor="coco-report-date"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
            >
              Compliance Report Date
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="coco-report-date"
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div className="md:col-span-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => fetchOutletComplianceData(selectedOutletId, reportDate)}
              disabled={!selectedOutletId}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh Status
            </button>
            <button
              type="button"
              onClick={handleGenerateOnePagerPdf}
              disabled={isGeneratingPdf || !selectedOutletId}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              {isGeneratingPdf ? 'Generating PDF...' : 'Generate COCO One-Pager PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* Outlet Load Error State */}
      {outletLoadError && (
        <div className="p-5 bg-red-500/10 border border-red-500/25 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <AlertCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <div className="font-semibold text-white text-sm">
                Failed to load accessible retail outlets
              </div>
              <div className="text-xs text-red-300 mt-0.5">{outletLoadError}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={loadOutlets}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Feedback Banners */}
      {bannerError && !outletLoadError && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-between gap-3 text-red-400 text-sm">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{bannerError}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerError(null)}
            className="text-red-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {bannerSuccess && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between gap-3 text-emerald-400 text-sm">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{bannerSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerSuccess(null)}
            className="text-emerald-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Status Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="text-xs font-medium text-slate-400">VALID</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{summary.validCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Active & compliant</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="text-xs font-medium text-slate-400">EXPIRING SOON</div>
          <div className="text-2xl font-bold text-amber-300 mt-1">{summary.expiringSoonCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Within 30 days</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="text-xs font-medium text-slate-400">EXPIRED</div>
          <div className="text-2xl font-bold text-red-400 mt-1">{summary.expiredCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Past validity date</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="text-xs font-medium text-slate-400">PAYMENT PENDING</div>
          <div className="text-2xl font-bold text-orange-400 mt-1">{summary.paymentPendingCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Tax, rent or utility due</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="text-xs font-medium text-slate-400">ACTION REQUIRED</div>
          <div className="text-2xl font-bold text-rose-400 mt-1">{summary.actionRequiredCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Service / inspection due</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="text-xs font-medium text-slate-400">NOT RECORDED</div>
          <div className="text-2xl font-bold text-slate-300 mt-1">{summary.notRecordedCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Never treated as valid</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-slate-800 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('REGISTER')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'REGISTER'
              ? 'border-orange-500 text-orange-400 bg-orange-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          Tab 1 — Document Register
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ONE_PAGER')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'ONE_PAGER'
              ? 'border-orange-500 text-orange-400 bg-orange-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          Tab 2 — Compliance One-Pager
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('DUE_DATES')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'DUE_DATES'
              ? 'border-orange-500 text-orange-400 bg-orange-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          Tab 3 — Due Dates & Pending Actions
          {summary.expiredCount + summary.paymentPendingCount + summary.actionRequiredCount > 0 && (
            <span className="px-1.5 py-0.5 text-[11px] rounded bg-red-500/20 text-red-300 border border-red-500/30">
              {summary.expiredCount + summary.paymentPendingCount + summary.actionRequiredCount}
            </span>
          )}
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1 — DOCUMENT REGISTER                                             */}
      {/* ===================================================================== */}
      {activeTab === 'REGISTER' && (
        <div className="space-y-6">
          {/* Search & Category Filter Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:w-96">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by document, category, reference, remarks..."
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <select
                  aria-label="Filter by category"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-orange-500"
                >
                  <option value="ALL">All Categories ({registerItems.length})</option>
                  {STANDARD_COCO_CATEGORIES.map((cat) => (
                    <option key={cat.code} value={cat.code}>
                      {cat.srNo}. {cat.particular}
                    </option>
                  ))}
                </select>
              </div>

              <select
                aria-label="Filter by compliance status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-orange-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="VALID">VALID</option>
                <option value="EXPIRING_SOON">EXPIRING SOON</option>
                <option value="EXPIRED">EXPIRED</option>
                <option value="PAYMENT_PENDING">PAYMENT PENDING</option>
                <option value="ACTION_REQUIRED">ACTION REQUIRED</option>
                <option value="NOT_RECORDED">NOT RECORDED</option>
                <option value="NOT_APPLICABLE">NOT APPLICABLE</option>
              </select>
            </div>
          </div>

          {/* Discrepancy Alert Banner if any manual vs module conflict exists */}
          {summary.discrepancyCount > 0 && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-200 space-y-1">
                <div className="font-semibold text-amber-300">
                  Authoritative Module Conflict Flagged ({summary.discrepancyCount} Category)
                </div>
                <p>
                  One or more manual compliance entries differ from live financial/utility module records (Municipal Tax, NFR Lease Rent, or Utility Bills). The authoritative module status is displayed below and the discrepancy is flagged without overwriting financial records.
                </p>
              </div>
            </div>
          )}

          {/* Main Compliance Register Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  COCO Compliance & Statutory Document Register —{' '}
                  <span className="text-orange-400">
                    {selectedOutlet ? `${selectedOutlet.name} (${selectedOutlet.roCode})` : ''}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Showing {filteredRegisterItems.length} of {registerItems.length} categories evaluated as of{' '}
                  {formatComplianceDateDisplay(reportDate)}
                </p>
              </div>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                Loading COCO compliance register...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-3.5 w-12">Sr.</th>
                      <th className="py-3 px-3.5">Category / Particular</th>
                      <th className="py-3 px-3.5">Status</th>
                      <th className="py-3 px-3.5">Validity / Due Date</th>
                      <th className="py-3 px-3.5">Amount & Payment</th>
                      <th className="py-3 px-3.5">Remarks / Action Required</th>
                      <th className="py-3 px-3.5">Attachments</th>
                      <th className="py-3 px-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-sm">
                    {filteredRegisterItems.map((item) => {
                      const statusStyle = STATUS_BADGE_STYLES[item.complianceStatus];
                      const payStyle = PAYMENT_BADGE_STYLES[item.paymentStatus];
                      const isMissing = item.complianceStatus === 'NOT_RECORDED';

                      return (
                        <tr
                          key={item.categoryCode}
                          className={`hover:bg-slate-800/30 transition-colors ${
                            isMissing ? 'bg-slate-950/30' : ''
                          }`}
                        >
                          <td className="py-3.5 px-3.5 font-mono text-xs text-slate-400">
                            {item.srNo}
                          </td>

                          <td className="py-3.5 px-3.5">
                            <div className="font-semibold text-white flex items-center gap-2">
                              <span>{item.categoryName}</span>
                              {item.isCustomCategory && (
                                <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                  Custom
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {item.documentTitle ? (
                                <span>
                                  {item.documentTitle}
                                  {item.referenceNumber ? ` • Ref: ${item.referenceNumber}` : ''}
                                </span>
                              ) : item.referenceNumber ? (
                                <span>Ref: {item.referenceNumber}</span>
                              ) : (
                                <span className="text-slate-500 italic">
                                  No document reference recorded
                                </span>
                              )}
                            </div>
                            {item.authoritativeSource !== 'MANUAL' &&
                              item.authoritativeSource !== 'NONE' && (
                                <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-300 border border-blue-500/20">
                                  <Link2 className="w-3 h-3" />
                                  Linked: {SOURCE_LABELS[item.authoritativeSource]} (Read-Only)
                                </div>
                              )}
                          </td>

                          <td className="py-3.5 px-3.5">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-semibold border ${statusStyle.className}`}
                            >
                              {statusStyle.label}
                            </span>
                            <div className="text-[11px] text-slate-400 mt-1">
                              Status (Yes/No):{' '}
                              <span className="font-semibold text-slate-200">
                                {item.statusYesNo === 'NOT_RECORDED'
                                  ? 'Not Recorded'
                                  : item.statusYesNo}
                              </span>
                            </div>
                            {item.documentValidityStatus !== item.complianceStatus &&
                              item.complianceStatus === 'PAYMENT_PENDING' && (
                                <div className="text-[10px] text-amber-300 mt-0.5">
                                  Doc Validity: {item.documentValidityStatus}
                                </div>
                              )}
                          </td>

                          <td className="py-3.5 px-3.5 text-xs">
                            <div className="text-slate-200 font-medium">
                              {item.validityDueDate
                                ? formatComplianceDateDisplay(item.validityDueDate)
                                : 'Not Recorded'}
                            </div>
                            {item.lastServiceDate && (
                              <div className="text-slate-400 mt-0.5">
                                Last Service: {formatComplianceDateDisplay(item.lastServiceDate)}
                              </div>
                            )}
                            {item.daysUntilDue !== null && (
                              <div
                                className={`text-[11px] mt-0.5 font-medium ${
                                  item.daysUntilDue < 0
                                    ? 'text-red-400'
                                    : item.daysUntilDue <= 30
                                    ? 'text-amber-300'
                                    : 'text-emerald-400'
                                }`}
                              >
                                {item.daysUntilDue < 0
                                  ? `Overdue by ${Math.abs(item.daysUntilDue)} day(s)`
                                  : `Due in ${item.daysUntilDue} day(s)`}
                              </div>
                            )}
                            {item.frequency && (
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                Freq: {item.frequency}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-3.5 text-xs">
                            <div className="font-mono font-semibold text-slate-200">
                              {item.amountPaise !== null && item.amountPaise !== undefined
                                ? formatIndianCurrencyFromPaise(item.amountPaise)
                                : '-'}
                            </div>
                            <div className="mt-1">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${payStyle.className}`}
                              >
                                {payStyle.label}
                              </span>
                            </div>
                            {item.paymentDate && (
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                Paid: {formatComplianceDateDisplay(item.paymentDate)}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-3.5 text-xs max-w-xs">
                            {isMissing ? (
                              <span className="text-amber-400/90 font-medium">
                                Missing record — Not Recorded
                              </span>
                            ) : (
                              <div className="space-y-1">
                                {item.remarks && (
                                  <div className="text-slate-300">{item.remarks}</div>
                                )}
                                {item.actionRequired && (
                                  <div className="text-rose-300 font-medium">
                                    Action: {item.actionRequired}
                                  </div>
                                )}
                                {item.responsiblePerson && (
                                  <div className="text-slate-400 text-[11px]">
                                    Resp: {item.responsiblePerson}
                                  </div>
                                )}
                                {!item.remarks && !item.actionRequired && (
                                  <span className="text-slate-500">-</span>
                                )}
                              </div>
                            )}

                            {item.hasDiscrepancy && item.discrepancyNote && (
                              <div className="mt-1.5 p-2 rounded bg-amber-500/15 border border-amber-500/30 text-[11px] text-amber-200">
                                <span className="font-semibold text-amber-300">Discrepancy: </span>
                                {item.discrepancyNote}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-3.5 text-xs">
                            {item.attachments.length === 0 ? (
                              <span className="text-slate-500">None</span>
                            ) : (
                              <div className="space-y-1">
                                {item.attachments.map((att) => (
                                  <div
                                    key={att.id}
                                    className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded px-2 py-1"
                                  >
                                    {getFileIcon(att.mimeType)}
                                    <span
                                      className="truncate max-w-[110px] text-slate-300"
                                      title={att.name}
                                    >
                                      {att.name}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleViewAttachment(att)}
                                      title="View Attachment"
                                      className="p-0.5 text-blue-400 hover:text-blue-300 cursor-pointer"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadAttachment(att)}
                                      title="Download Attachment"
                                      className="p-0.5 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-3.5 text-right whitespace-nowrap">
                            {canWrite && (
                              <button
                                type="button"
                                onClick={() => openRecordEditor(item, item.isCustomCategory)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-orange-400" />
                                {item.id ? 'Edit Record' : 'Add Record'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredRegisterItems.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-500 text-xs">
                          {outletLoadError
                            ? 'Cannot display compliance register: accessible retail outlets failed to load.'
                            : !selectedOutletId
                            ? 'Please select an accessible retail outlet to view its compliance register.'
                            : 'No compliance records match the selected filter.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Outlet Cloudflare R2 Document Vault Repository (Preserves & exposes all outlet attachments) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Outlet Cloudflare R2 Document Vault ({vaultDocs.length} Stored Files)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  All binary PDF, JPG, and PNG attachments stored for this outlet with authenticated scope-checked viewing and downloading.
                </p>
              </div>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => setIsVaultUploadOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-orange-400" />
                  Upload File to R2
                </button>
              )}
            </div>

            {vaultDocs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No standalone files uploaded for this outlet yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/40 text-[11px] font-semibold text-slate-400 uppercase">
                      <th className="py-2.5 px-4">Document Name</th>
                      <th className="py-2.5 px-4">Type</th>
                      <th className="py-2.5 px-4">Size</th>
                      <th className="py-2.5 px-4">Uploaded At</th>
                      <th className="py-2.5 px-4 text-right">Authenticated Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {vaultDocs.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-medium text-white flex items-center gap-2">
                          {getFileIcon(doc.mimeType)}
                          <span>{doc.name}</span>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-400">{doc.mimeType}</td>
                        <td className="py-2.5 px-4 text-slate-400">{formatBytes(doc.sizeBytes)}</td>
                        <td className="py-2.5 px-4 text-slate-400">
                          {new Date(doc.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-4 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => handleViewAttachment(doc)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 rounded cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View Attachment
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadAttachment(doc)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 rounded cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2 — COMPLIANCE ONE-PAGER                                          */}
      {/* ===================================================================== */}
      {activeTab === 'ONE_PAGER' && (
        <div className="space-y-5">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-orange-400">
                A4 Portrait Printable Compliance Summary
              </div>
              <h3 className="text-xl font-bold text-white mt-0.5">
                {onePagerReport
                  ? `${onePagerReport.outletName} — ${onePagerReport.roCode}`
                  : selectedOutlet
                  ? `${selectedOutlet.name} — ${selectedOutlet.roCode}`
                  : 'COCO Compliance One-Pager'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Report Date: <span className="text-slate-200 font-medium">{formatComplianceDateDisplay(reportDate)}</span>
                {onePagerReport && (
                  <>
                    {' '}• Generated by: <span className="text-slate-300">{onePagerReport.generatedBy}</span>
                  </>
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={handleGenerateOnePagerPdf}
              disabled={isGeneratingPdf || !selectedOutletId}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              {isGeneratingPdf ? 'Generating PDF...' : 'Generate COCO One-Pager PDF'}
            </button>
          </div>

          {/* 14-Category Printable Preview Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-950 text-xs font-bold text-slate-200 uppercase tracking-wider">
                    <th className="py-3.5 px-4 border-r border-slate-800 w-16 text-center">
                      Sr. No.
                    </th>
                    <th className="py-3.5 px-4 border-r border-slate-800">Particular</th>
                    <th className="py-3.5 px-4 border-r border-slate-800 text-center">
                      Status (Yes/No)
                    </th>
                    <th className="py-3.5 px-4 border-r border-slate-800 text-center">
                      Validity / Due Date
                    </th>
                    <th className="py-3.5 px-4 border-r border-slate-800 text-right">
                      Amount (₹)
                    </th>
                    <th className="py-3.5 px-4 border-r border-slate-800 text-center">
                      Frequency
                    </th>
                    <th className="py-3.5 px-4">Remarks / Action Required</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-sm">
                  {(onePagerReport?.rows || []).map((row) => {
                    const badge = STATUS_BADGE_STYLES[row.complianceStatus];
                    return (
                      <tr key={row.categoryCode} className="hover:bg-slate-800/40">
                        <td className="py-3 px-4 border-r border-slate-800/80 text-center font-mono text-xs text-slate-300">
                          {row.srNo}
                        </td>
                        <td className="py-3 px-4 border-r border-slate-800/80 font-semibold text-white">
                          <div>{row.particular}</div>
                          <span
                            className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 border-r border-slate-800/80 text-center font-semibold text-slate-200">
                          {row.statusYesNoDisplay}
                        </td>
                        <td className="py-3 px-4 border-r border-slate-800/80 text-center text-xs text-slate-200">
                          {row.validityDueDateDisplay}
                        </td>
                        <td className="py-3 px-4 border-r border-slate-800/80 text-right font-mono text-xs text-slate-200">
                          {row.amountInrDisplay}
                        </td>
                        <td className="py-3 px-4 border-r border-slate-800/80 text-center text-xs text-slate-300">
                          {row.frequencyDisplay}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-300">
                          {row.remarksActionRequiredDisplay}
                        </td>
                      </tr>
                    );
                  })}
                  {(onePagerReport?.rows || []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                        {outletLoadError
                          ? 'Cannot generate preview: accessible retail outlets failed to load.'
                          : !selectedOutletId
                          ? 'Please select an accessible retail outlet to preview the COCO One-Pager report.'
                          : 'No compliance rows available for preview.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {onePagerReport && onePagerReport.customRows.length > 0 && (
              <div className="border-t border-slate-800 p-4 bg-slate-950/40">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Additional Custom Categories (Included in Annex Page)
                </h4>
                <div className="space-y-1.5 text-xs text-slate-300">
                  {onePagerReport.customRows.map((cr) => (
                    <div key={cr.categoryCode} className="flex items-center justify-between">
                      <span className="font-medium text-white">
                        {cr.srNo}. {cr.particular} ({cr.statusYesNoDisplay})
                      </span>
                      <span>
                        Due: {cr.validityDueDateDisplay} • Amount: {cr.amountInrDisplay} •{' '}
                        {cr.remarksActionRequiredDisplay}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3 — DUE DATES & PENDING ACTIONS                                   */}
      {/* ===================================================================== */}
      {activeTab === 'DUE_DATES' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 1. Expired Documents */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-red-500/5">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <h3 className="text-sm font-semibold text-white">
                    Expired Documents ({dueDatesAndActions.expired.length})
                  </h3>
                </div>
                <span className="text-xs text-red-300">As of {formatComplianceDateDisplay(reportDate)}</span>
              </div>
              <div className="p-4">
                {dueDatesAndActions.expired.length === 0 ? (
                  <p className="text-xs text-slate-500">No expired documents for this outlet.</p>
                ) : (
                  <div className="space-y-2.5">
                    {dueDatesAndActions.expired.map((item) => (
                      <div
                        key={item.categoryCode}
                        className="p-3 bg-slate-950 border border-red-500/20 rounded-lg flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="text-sm font-semibold text-white">{item.categoryName}</div>
                          <div className="text-xs text-red-300 mt-0.5">
                            Expired on {formatComplianceDateDisplay(item.validityDueDate)}{' '}
                            {item.daysUntilDue !== null
                              ? `(${Math.abs(item.daysUntilDue)} days overdue)`
                              : ''}
                          </div>
                        </div>
                        {canWrite && (
                          <button
                            type="button"
                            onClick={() => openRecordEditor(item, item.isCustomCategory)}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded border border-slate-700 cursor-pointer"
                          >
                            Update
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 2. Expiring within 30, 60 or 90 days */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-amber-500/5">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-semibold text-white">
                    Expiring Within {expiryHorizon} Days ({expiringBySelectedHorizon.length})
                  </h3>
                </div>
                <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
                  {([30, 60, 90] as ExpiryHorizon[]).map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setExpiryHorizon(days)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        expiryHorizon === days
                          ? 'bg-amber-500 text-slate-950 font-semibold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {days}d (
                      {days === 30
                        ? dueDatesAndActions.expiringWithin30Days.length
                        : days === 60
                        ? dueDatesAndActions.expiringWithin60Days.length
                        : dueDatesAndActions.expiringWithin90Days.length}
                      )
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-4">
                {expiringBySelectedHorizon.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No documents expiring within {expiryHorizon} days of {formatComplianceDateDisplay(reportDate)}.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {expiringBySelectedHorizon.map((item) => (
                      <div
                        key={item.categoryCode}
                        className="p-3 bg-slate-950 border border-amber-500/20 rounded-lg flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="text-sm font-semibold text-white">{item.categoryName}</div>
                          <div className="text-xs text-amber-300 mt-0.5">
                            Due on {formatComplianceDateDisplay(item.validityDueDate)} (in{' '}
                            {item.daysUntilDue} days)
                          </div>
                        </div>
                        {canWrite && (
                          <button
                            type="button"
                            onClick={() => openRecordEditor(item, item.isCustomCategory)}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded border border-slate-700 cursor-pointer"
                          >
                            Update
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 3. Payments Pending */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-orange-500/5">
                <div className="flex items-center gap-2">
                  <IndianRupee className="w-4 h-4 text-orange-400" />
                  <h3 className="text-sm font-semibold text-white">
                    Payments Pending ({dueDatesAndActions.paymentsPending.length})
                  </h3>
                </div>
              </div>
              <div className="p-4">
                {dueDatesAndActions.paymentsPending.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No pending statutory, rent, or utility payments for this outlet.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {dueDatesAndActions.paymentsPending.map((item) => (
                      <div
                        key={item.categoryCode}
                        className="p-3 bg-slate-950 border border-orange-500/20 rounded-lg flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="text-sm font-semibold text-white">
                            {item.categoryName}{' '}
                            <span className="font-mono text-orange-300">
                              ({formatIndianCurrencyFromPaise(item.amountPaise)})
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            Source: {SOURCE_LABELS[item.authoritativeSource]} • Due:{' '}
                            {formatComplianceDateDisplay(item.validityDueDate)}
                          </div>
                        </div>
                        {canWrite && (
                          <button
                            type="button"
                            onClick={() => openRecordEditor(item, item.isCustomCategory)}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded border border-slate-700 cursor-pointer"
                          >
                            View / Edit
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 4. Service & Inspection Actions Pending */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-rose-500/5">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-rose-400" />
                  <h3 className="text-sm font-semibold text-white">
                    Service & Inspection Actions Pending ({dueDatesAndActions.serviceActionsPending.length})
                  </h3>
                </div>
              </div>
              <div className="p-4">
                {dueDatesAndActions.serviceActionsPending.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No pending service, maintenance, or inspection actions.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {dueDatesAndActions.serviceActionsPending.map((item) => (
                      <div
                        key={item.categoryCode}
                        className="p-3 bg-slate-950 border border-rose-500/20 rounded-lg flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="text-sm font-semibold text-white">{item.categoryName}</div>
                          <div className="text-xs text-rose-300 mt-0.5">
                            {item.actionRequired ||
                              item.discrepancyNote ||
                              item.remarks ||
                              'Operational inspection / maintenance action required'}
                          </div>
                        </div>
                        {canWrite && (
                          <button
                            type="button"
                            onClick={() => openRecordEditor(item, item.isCustomCategory)}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded border border-slate-700 cursor-pointer"
                          >
                            Update
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 5. Not-Recorded Documents */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileWarning className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-white">
                  Not-Recorded Documents ({dueDatesAndActions.notRecorded.length})
                </h3>
              </div>
              <span className="text-xs text-slate-400">
                Missing records are never treated as valid, paid, or verified
              </span>
            </div>
            <div className="p-4">
              {!selectedOutletId ? (
                <p className="text-xs text-slate-500">
                  {outletLoadError
                    ? 'Cannot evaluate categories: accessible retail outlets failed to load.'
                    : 'Please select an accessible retail outlet to view missing compliance categories.'}
                </p>
              ) : dueDatesAndActions.notRecorded.length === 0 ? (
                <p className="text-xs text-emerald-400">
                  All 14 standard compliance categories have been recorded for this outlet!
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {dueDatesAndActions.notRecorded.map((item) => (
                    <div
                      key={item.categoryCode}
                      className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="text-xs font-mono text-slate-500">Category #{item.srNo}</div>
                        <div className="text-sm font-medium text-slate-200">{item.categoryName}</div>
                        <div className="text-[11px] text-amber-400/90 mt-0.5">Status: NOT RECORDED</div>
                      </div>
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => openRecordEditor(item, item.isCustomCategory)}
                          className="px-2.5 py-1.5 bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 border border-orange-500/30 rounded text-xs font-medium cursor-pointer"
                        >
                          Add Record
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: ADD / EDIT COMPLIANCE RECORD                                   */}
      {/* ===================================================================== */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full p-6 space-y-5 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white">
                  {isCustomCategoryMode
                    ? editingItem
                      ? `Edit Custom Category — ${editingItem.categoryName}`
                      : 'Add Custom Compliance Category'
                    : `Maintain Compliance Record — ${
                        STANDARD_COCO_CATEGORIES.find((c) => c.code === formCategoryCode)
                          ?.particular || formCategoryCode
                      }`}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Outlet: {selectedOutlet?.name} ({selectedOutlet?.roCode})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editingItem?.linkedModuleData && (
              <div className="p-3.5 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs text-blue-200 space-y-1">
                <div className="font-semibold text-blue-300 flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5" />
                  Read-Only Authoritative Module Integration:{' '}
                  {editingItem.linkedModuleData.sourceLabel}
                </div>
                <p>
                  {editingItem.linkedModuleData.summaryText} • Status:{' '}
                  <strong>{editingItem.linkedModuleData.paymentStatus}</strong> • Amount:{' '}
                  <strong>
                    {formatIndianCurrencyFromPaise(editingItem.linkedModuleData.amountPaise)}
                  </strong>
                </p>
                <p className="text-[11px] text-blue-300/80">
                  Saving supplementary compliance notes or attachments below will not overwrite financial module records. Any discrepancy with module figures is automatically flagged.
                </p>
              </div>
            )}

            <form onSubmit={handleSaveComplianceRecord} className="space-y-4">
              {!isCustomCategoryMode ? (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Standard Compliance Category
                  </label>
                  <select
                    value={formCategoryCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      const found = registerItems.find((i) => i.categoryCode === code);
                      if (found) {
                        openRecordEditor(found, false);
                      } else {
                        setFormCategoryCode(code);
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white"
                  >
                    {STANDARD_COCO_CATEGORIES.map((cat) => (
                      <option key={cat.code} value={cat.code}>
                        {cat.srNo}. {cat.particular}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Custom Category Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formCustomCategoryName}
                    onChange={(e) => setFormCustomCategoryName(e.target.value)}
                    placeholder="e.g., Pollution Control Consent (CTO)"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Document Title
                  </label>
                  <input
                    type="text"
                    value={formDocumentTitle}
                    onChange={(e) => setFormDocumentTitle(e.target.value)}
                    placeholder="e.g., PESO Form XIV Storage Licence"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Licence / Bill Reference Number
                  </label>
                  <input
                    type="text"
                    value={formReferenceNumber}
                    onChange={(e) => setFormReferenceNumber(e.target.value)}
                    placeholder="e.g., P/HQ/WB/15/4921"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Status (Yes / No / N/A)
                  </label>
                  <select
                    value={formStatusYesNo}
                    onChange={(e) => setFormStatusYesNo(e.target.value as CocoStatusYesNo)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white"
                  >
                    <option value="YES">Yes (Available / Functional)</option>
                    <option value="NO">No (Pending / Defective)</option>
                    <option value="NA">Not Applicable (N/A)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Issue Date
                  </label>
                  <input
                    type="date"
                    value={formIssueDate}
                    onChange={(e) => setFormIssueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Validity / Due Date
                  </label>
                  <input
                    type="date"
                    value={formValidityDueDate}
                    onChange={(e) => setFormValidityDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Last Service Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={formLastServiceDate}
                    onChange={(e) => setFormLastServiceDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Amount in INR (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formAmountRupees}
                    onChange={(e) => setFormAmountRupees(e.target.value)}
                    placeholder="e.g., 24500"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Frequency
                  </label>
                  <input
                    type="text"
                    value={formFrequency}
                    onChange={(e) => setFormFrequency(e.target.value)}
                    placeholder="Monthly / Quarterly / Yearly"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Payment Status
                  </label>
                  <select
                    value={formPaymentStatus}
                    onChange={(e) => setFormPaymentStatus(e.target.value as CocoPaymentStatus)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white"
                  >
                    <option value="PAID">PAID</option>
                    <option value="PENDING">PENDING</option>
                    <option value="OVERDUE">OVERDUE</option>
                    <option value="NOT_APPLICABLE">NOT APPLICABLE</option>
                    <option value="NOT_RECORDED">NOT RECORDED</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={formPaymentDate}
                    onChange={(e) => setFormPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Responsible Person
                  </label>
                  <input
                    type="text"
                    value={formResponsiblePerson}
                    onChange={(e) => setFormResponsiblePerson(e.target.value)}
                    placeholder="e.g., Outlet Manager / FO"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Remarks / Status Notes
                  </label>
                  <textarea
                    rows={2}
                    value={formRemarks}
                    onChange={(e) => setFormRemarks(e.target.value)}
                    placeholder="Enter licence / bill / AMC remarks..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Action Required (If Any)
                  </label>
                  <textarea
                    rows={2}
                    value={formActionRequired}
                    onChange={(e) => setFormActionRequired(e.target.value)}
                    placeholder="Leave blank if no action is pending..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white"
                  />
                </div>
              </div>

              {/* Supporting Attachments Section */}
              <div className="border-t border-slate-800 pt-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Supporting Attachments (Cloudflare R2 Document Vault)
                  </label>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-orange-300 border border-slate-700 rounded text-xs font-medium cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    {modalUploadingFile ? 'Uploading...' : 'Upload & Attach PDF/JPG/PNG'}
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                      onChange={handleInlineModalFileUpload}
                      disabled={modalUploadingFile}
                      className="hidden"
                    />
                  </label>
                </div>

                {vaultDocs.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No files uploaded for this outlet yet. Use "Upload & Attach PDF/JPG/PNG" above.
                  </p>
                ) : (
                  <div className="max-h-32 overflow-y-auto bg-slate-950 border border-slate-800 rounded-lg p-2 space-y-1">
                    {vaultDocs.map((doc) => {
                      const checked = formAttachmentIds.includes(doc.id);
                      return (
                        <label
                          key={doc.id}
                          className="flex items-center justify-between px-2 py-1 rounded hover:bg-slate-900 text-xs text-slate-300 cursor-pointer"
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormAttachmentIds((prev) => [...prev, doc.id]);
                                } else {
                                  setFormAttachmentIds((prev) =>
                                    prev.filter((id) => id !== doc.id)
                                  );
                                }
                              }}
                              className="rounded border-slate-700 bg-slate-900 text-orange-500"
                            />
                            {getFileIcon(doc.mimeType)}
                            <span>{doc.name}</span>
                          </span>
                          <span className="text-slate-500">{formatBytes(doc.sizeBytes)}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingRecord}
                  className="px-5 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg cursor-pointer"
                >
                  {isSavingRecord ? 'Saving...' : 'Save Compliance Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: STANDALONE R2 DOCUMENT VAULT UPLOAD                            */}
      {/* ===================================================================== */}
      {isVaultUploadOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-orange-500" />
                Upload to Cloudflare R2 Document Vault
              </h3>
              <button
                type="button"
                onClick={() => setIsVaultUploadOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleStandaloneVaultUpload} className="space-y-4">
              <div className="text-xs text-slate-400">
                Target Outlet:{' '}
                <span className="text-white font-semibold">
                  {selectedOutlet?.name} ({selectedOutlet?.roCode})
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  File (PDF, PNG, JPEG — Max 5 MB)
                </label>
                <input
                  type="file"
                  required
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  onChange={(e) => setVaultFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-orange-500/15 file:text-orange-400 hover:file:bg-orange-500/25 cursor-pointer border border-slate-800 rounded-lg p-1.5 bg-slate-950"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsVaultUploadOpen(false)}
                  className="px-3.5 py-2 bg-slate-800 text-slate-300 text-xs rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!vaultFile || isVaultUploading}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  {isVaultUploading ? 'Uploading...' : 'Upload to R2 Vault'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: AUTHENTICATED ATTACHMENT VIEWER                                */}
      {/* ===================================================================== */}
      {previewAttachment && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-4xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                {getFileIcon(previewAttachment.mimeType)}
                <div>
                  <h3 className="text-sm font-bold text-white">{previewAttachment.name}</h3>
                  <p className="text-[11px] text-slate-400">
                    {previewAttachment.mimeType} • {formatBytes(previewAttachment.sizeBytes)} •
                    Served via authenticated scope-verified R2 stream
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadAttachment(previewAttachment)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
                    setPreviewBlobUrl(null);
                    setPreviewAttachment(null);
                  }}
                  className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg min-h-[420px] max-h-[70vh] flex items-center justify-center overflow-auto p-3">
              {isPreviewLoading ? (
                <div className="text-sm text-slate-400">
                  Loading authenticated attachment from Cloudflare R2...
                </div>
              ) : previewBlobUrl ? (
                previewAttachment.mimeType === 'application/pdf' ? (
                  <iframe
                    src={previewBlobUrl}
                    title={previewAttachment.name}
                    className="w-full h-[62vh] rounded border-0"
                  />
                ) : (
                  <img
                    src={previewBlobUrl}
                    alt={previewAttachment.name}
                    className="max-h-[62vh] max-w-full object-contain rounded"
                  />
                )
              ) : (
                <div className="text-sm text-slate-400">Preview unavailable.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
