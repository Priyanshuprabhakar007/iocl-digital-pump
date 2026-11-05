import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import {
  OperationalShift,
  OperationalShiftTankSnapshot,
  TankStockReading,
  FuelReceipt,
  FuelReceiptTankLine,
  ShiftStockSummary,
} from '../../shared/types';
import {
  Droplets,
  Fuel,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Calculator,
  Settings2,
  ShieldAlert,
  XCircle,
  ArrowRight,
  Link2,
  Check,
  X,
} from 'lucide-react';

import { useActiveOutlet } from '../context/ActiveOutletContext';
import { getLocalDateInputValue, getLocalDateTimeInputValue } from '../../shared/utils/dateUtils';

export interface ReceiptLineReadiness {
  lineId: string;
  tankId: string;
  tankNumber?: number;
  productCode?: string;
  preReading: TankStockReading | null;
  postReading: TankStockReading | null;
  isLineReady: boolean;
  issues: string[];
}

export interface ReceiptCompletionReadiness {
  canComplete: boolean;
  canTransitionToVerified: boolean;
  canTransitionToDecanted: boolean;
  canCancel: boolean;
  allLinesHaveReadings: boolean;
  missingRequirements: string[];
  lineReadiness: ReceiptLineReadiness[];
}

export function evaluateReceiptCompletionReadiness(
  receipt: FuelReceipt,
  shiftTankReadings: TankStockReading[],
  candidateDecantationStartedAt?: string | null,
  candidateDecantationCompletedAt?: string | null
): ReceiptCompletionReadiness {
  const isFinalized = receipt.status === 'COMPLETED' || receipt.status === 'CANCELLED';
  const missingRequirements: string[] = [];
  const lineReadiness: ReceiptLineReadiness[] = [];

  if (isFinalized) {
    return {
      canComplete: false,
      canTransitionToVerified: false,
      canTransitionToDecanted: false,
      canCancel: false,
      allLinesHaveReadings: false,
      missingRequirements: [`Receipt is already ${receipt.status}.`],
      lineReadiness: [],
    };
  }

  const lines = receipt.lines || [];
  if (lines.length === 0) {
    missingRequirements.push('Fuel receipt has no receiving tank lines.');
  }

  for (const line of lines) {
    const lineIssues: string[] = [];
    const label = `Tank #${line.tankNumber ?? line.tankId} (${line.productCode ?? line.productId})`;

    const preReading = line.preDecantReadingId
      ? shiftTankReadings.find(r => r.id === line.preDecantReadingId) || null
      : null;
    const postReading = line.postDecantReadingId
      ? shiftTankReadings.find(r => r.id === line.postDecantReadingId) || null
      : null;

    if (!line.preDecantReadingId || !preReading) {
      lineIssues.push(`${label}: Missing PRE_RECEIPT tank dip reading.`);
    } else if (
      preReading.readingType !== 'PRE_RECEIPT' ||
      preReading.operationalShiftId !== receipt.operationalShiftId ||
      preReading.tankId !== line.tankId ||
      preReading.productId !== line.productId
    ) {
      lineIssues.push(`${label}: Linked PRE reading does not match shift, tank, or product.`);
    }

    if (!line.postDecantReadingId || !postReading) {
      lineIssues.push(`${label}: Missing POST_RECEIPT tank dip reading.`);
    } else if (
      postReading.readingType !== 'POST_RECEIPT' ||
      postReading.operationalShiftId !== receipt.operationalShiftId ||
      postReading.tankId !== line.tankId ||
      postReading.productId !== line.productId
    ) {
      lineIssues.push(`${label}: Linked POST reading does not match shift, tank, or product.`);
    }

    if (preReading && postReading) {
      if (postReading.recordedAt <= preReading.recordedAt) {
        lineIssues.push(
          `${label}: POST_RECEIPT reading timestamp must be strictly after PRE_RECEIPT reading timestamp.`
        );
      }
      const measuredMilli = postReading.netProductVolumeMilliunits - preReading.netProductVolumeMilliunits;
      if (measuredMilli < 0) {
        lineIssues.push(
          `${label}: Measured received volume cannot be negative (POST net volume is less than PRE net volume).`
        );
      }
    }

    lineReadiness.push({
      lineId: line.id,
      tankId: line.tankId,
      tankNumber: line.tankNumber,
      productCode: line.productCode,
      preReading,
      postReading,
      isLineReady: lineIssues.length === 0,
      issues: lineIssues,
    });

    missingRequirements.push(...lineIssues);
  }

  const allLinesHaveReadings = lines.length > 0 && lineReadiness.every(l => l.isLineReady);

  const effStart = candidateDecantationStartedAt || receipt.decantationStartedAt;
  const effComp = candidateDecantationCompletedAt || receipt.decantationCompletedAt;
  if (effStart && effComp && effComp < effStart) {
    missingRequirements.push(
      'Decantation completion timestamp cannot be earlier than decantation start timestamp.'
    );
  }

  if (receipt.status !== 'DECANTED') {
    missingRequirements.push(
      `Receipt status is ${receipt.status}. Advance lifecycle through ARRIVED → VERIFIED → DECANTED before completing.`
    );
  }

  return {
    canComplete: receipt.status === 'DECANTED' && missingRequirements.length === 0,
    canTransitionToVerified: receipt.status === 'ARRIVED',
    canTransitionToDecanted: receipt.status === 'VERIFIED',
    canCancel: !isFinalized,
    allLinesHaveReadings,
    missingRequirements,
    lineReadiness,
  };
}

export interface ShiftReceiptReadinessSummary {
  totalReceipts: number;
  completedCount: number;
  cancelledCount: number;
  pendingReceipts: FuelReceipt[];
  allReceiptsFinalized: boolean;
  shiftCloseBlockedByReceipts: boolean;
}

export function summarizeShiftReceiptReadiness(receipts: FuelReceipt[]): ShiftReceiptReadinessSummary {
  const completedCount = receipts.filter(r => r.status === 'COMPLETED').length;
  const cancelledCount = receipts.filter(r => r.status === 'CANCELLED').length;
  const pendingReceipts = receipts.filter(r => r.status !== 'COMPLETED' && r.status !== 'CANCELLED');
  return {
    totalReceipts: receipts.length,
    completedCount,
    cancelledCount,
    pendingReceipts,
    allReceiptsFinalized: pendingReceipts.length === 0,
    shiftCloseBlockedByReceipts: pendingReceipts.length > 0,
  };
}

interface LineDipFormState {
  preSource: 'MANUAL' | 'ATG';
  preProductDipMm: string;
  preWaterDipMm: string;
  existingPreReadingId: string;
  postSource: 'MANUAL' | 'ATG';
  postProductDipMm: string;
  postWaterDipMm: string;
  existingPostReadingId: string;
  density: string;
  invoiceDensity: string;
  temperature: string;
}

export const StockOperationsPage: React.FC = () => {
  const { activeOutletId, accessibleOutlets: outlets, setActiveOutletId } = useActiveOutlet();
  const selectedOutletId = activeOutletId || '';
  const setSelectedOutletId = setActiveOutletId;

  const [shifts, setShifts] = useState<OperationalShift[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'OPENING' | 'RECEIPTS' | 'CLOSING' | 'RECONCILIATION'>('OPENING');

  const [tankSnapshots, setTankSnapshots] = useState<OperationalShiftTankSnapshot[]>([]);
  const [tankReadings, setTankReadings] = useState<TankStockReading[]>([]);
  const [receipts, setReceipts] = useState<FuelReceipt[]>([]);
  const [reconciliation, setReconciliation] = useState<ShiftStockSummary | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [dipSubmitting, setDipSubmitting] = useState(false);
  const [receiptSubmitting, setReceiptSubmitting] = useState(false);
  const [computeSubmitting, setComputeSubmitting] = useState(false);

  // Tank Stock Entry Form State
  const [dipForm, setDipForm] = useState<{
    tankId: string;
    readingType: 'OPENING' | 'CLOSING' | 'PRE_RECEIPT' | 'POST_RECEIPT' | 'ADHOC';
    source: 'MANUAL' | 'ATG';
    productDipMm: string;
    waterDipMm: string;
  }>({
    tankId: '',
    readingType: 'OPENING',
    source: 'MANUAL',
    productDipMm: '',
    waterDipMm: '0.000',
  });

  // Fuel Receipt Creation Modal State
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptForm, setReceiptForm] = useState({
    ttNumber: '',
    invoiceNumber: '',
    invoiceDate: getLocalDateInputValue(),
    arrivalTime: getLocalDateTimeInputValue(),
    sealVerified: true,
    sealExceptionReason: '',
    lineTankId: '',
    invoiceQuantity: '',
    density: '',
    invoiceDensity: '',
    temperature: '',
  });

  // Manage Fuel Receipt Modal State
  const [managingReceiptId, setManagingReceiptId] = useState<string | null>(null);
  const [manageModalError, setManageModalError] = useState<string | null>(null);
  const [manageModalSuccess, setManageModalSuccess] = useState<string | null>(null);
  const [manageActionBusy, setManageActionBusy] = useState(false);

  // Verification / Timestamps / Cancellation fields inside Manage Modal
  const [sealVerifiedInput, setSealVerifiedInput] = useState<boolean>(true);
  const [sealExceptionInput, setSealExceptionInput] = useState<string>('');
  const [decantStartInput, setDecantStartInput] = useState<string>('');
  const [decantCompleteInput, setDecantCompleteInput] = useState<string>('');
  const [showCancelSection, setShowCancelSection] = useState<boolean>(false);
  const [cancellationReasonInput, setCancellationReasonInput] = useState<string>('');
  const [lineForms, setLineForms] = useState<Record<string, LineDipFormState>>({});

  // Fetch Shifts when Outlet changes
  useEffect(() => {
    if (selectedOutletId) {
      loadShifts(selectedOutletId);
    } else {
      setShifts([]);
      setSelectedShiftId('');
    }
  }, [selectedOutletId]);

  // Fetch Shift Data when Shift changes
  useEffect(() => {
    if (selectedShiftId) {
      loadShiftData(selectedShiftId);
    }
  }, [selectedShiftId]);

  const loadShifts = async (outletId: string, preserveShiftId?: string) => {
    const res = await apiFetch<OperationalShift[]>(`/api/v1/outlets/${outletId}/shifts`);
    if (res.success && res.data) {
      setShifts(res.data);
      if (preserveShiftId && res.data.some(s => s.id === preserveShiftId)) {
        setSelectedShiftId(preserveShiftId);
        return;
      }
      const openShift = res.data.find(s => s.status === 'OPEN');
      if (openShift) {
        setSelectedShiftId(openShift.id);
      } else if (res.data.length > 0) {
        setSelectedShiftId(res.data[0].id);
      } else {
        setSelectedShiftId('');
      }
    }
  };

  const loadShiftData = async (shiftId: string) => {
    setLoading(true);
    setErrorMsg(null);

    const [snapsRes, readingsRes, receiptsRes, reconRes] = await Promise.all([
      apiFetch<OperationalShiftTankSnapshot[]>(`/api/v1/shifts/${shiftId}/tank-snapshots`),
      apiFetch<TankStockReading[]>(`/api/v1/shifts/${shiftId}/tank-readings`),
      apiFetch<FuelReceipt[]>(`/api/v1/shifts/${shiftId}/fuel-receipts`),
      apiFetch<ShiftStockSummary>(`/api/v1/shifts/${shiftId}/stock-reconciliation`),
    ]);

    if (snapsRes.success && snapsRes.data) setTankSnapshots(snapsRes.data);
    if (readingsRes.success && readingsRes.data) setTankReadings(readingsRes.data);
    if (receiptsRes.success && receiptsRes.data) setReceipts(receiptsRes.data);
    if (reconRes.success && reconRes.data) setReconciliation(reconRes.data);

    setLoading(false);
    return {
      readings: readingsRes.data || [],
      receipts: receiptsRes.data || [],
    };
  };

  const initializeLineForms = (rcpt: FuelReceipt) => {
    const nextForms: Record<string, LineDipFormState> = {};
    for (const line of rcpt.lines || []) {
      nextForms[line.id] = {
        preSource: 'MANUAL',
        preProductDipMm: '',
        preWaterDipMm: '0.000',
        existingPreReadingId: line.preDecantReadingId || '',
        postSource: 'MANUAL',
        postProductDipMm: '',
        postWaterDipMm: '0.000',
        existingPostReadingId: line.postDecantReadingId || '',
        density: line.densityStr || '',
        invoiceDensity: line.invoiceDensityStr || '',
        temperature: line.temperatureStr || '',
      };
    }
    setLineForms(nextForms);
  };

  const openManageReceiptModal = (rcpt: FuelReceipt, openInCancelMode = false) => {
    setManagingReceiptId(rcpt.id);
    setManageModalError(null);
    setManageModalSuccess(null);
    setSealVerifiedInput(rcpt.sealVerified ?? true);
    setSealExceptionInput(rcpt.sealExceptionReason || '');
    setDecantStartInput('');
    setDecantCompleteInput('');
    setShowCancelSection(openInCancelMode);
    setCancellationReasonInput('');
    initializeLineForms(rcpt);
  };

  const closeManageReceiptModal = () => {
    setManagingReceiptId(null);
    setManageModalError(null);
    setManageModalSuccess(null);
    setShowCancelSection(false);
    setCancellationReasonInput('');
  };

  const updateLineFormField = (lineId: string, patch: Partial<LineDipFormState>) => {
    setLineForms(prev => {
      const current = prev[lineId] || {
        preSource: 'MANUAL',
        preProductDipMm: '',
        preWaterDipMm: '0.000',
        existingPreReadingId: '',
        postSource: 'MANUAL',
        postProductDipMm: '',
        postWaterDipMm: '0.000',
        existingPostReadingId: '',
        density: '',
        invoiceDensity: '',
        temperature: '',
      };
      return {
        ...prev,
        [lineId]: { ...current, ...patch },
      };
    });
  };

  const handleRecordAndLinkDecantDip = async (
    rcpt: FuelReceipt,
    line: FuelReceiptTankLine,
    readingType: 'PRE_RECEIPT' | 'POST_RECEIPT'
  ) => {
    if (!selectedShiftId || manageActionBusy) return;
    const lf = lineForms[line.id];
    if (!lf) return;

    const productDipMm = readingType === 'PRE_RECEIPT' ? lf.preProductDipMm.trim() : lf.postProductDipMm.trim();
    const waterDipMm =
      (readingType === 'PRE_RECEIPT' ? lf.preWaterDipMm.trim() : lf.postWaterDipMm.trim()) || '0.000';
    const source = readingType === 'PRE_RECEIPT' ? lf.preSource : lf.postSource;

    if (!productDipMm) {
      setManageModalError(`Please enter actual ${readingType} product dip (mm) for Tank #${line.tankNumber}.`);
      return;
    }

    setManageActionBusy(true);
    setManageModalError(null);
    setManageModalSuccess(null);

    try {
      const dipRes = await apiFetch<TankStockReading>(`/api/v1/shifts/${selectedShiftId}/tank-readings`, {
        method: 'POST',
        body: JSON.stringify({
          tankId: line.tankId,
          readingType,
          source,
          productDipMm,
          waterDipMm,
          notes: `${readingType} dip for TT ${rcpt.ttNumber} / Inv ${rcpt.invoiceNumber}`,
        }),
      });

      if (!dipRes.success || !dipRes.data) {
        setManageModalError(dipRes.error?.message || `Failed to record ${readingType} tank reading.`);
        return;
      }

      const newReadingId = dipRes.data.id;
      const linkPayload =
        readingType === 'PRE_RECEIPT'
          ? { preDecantReadingId: newReadingId }
          : { postDecantReadingId: newReadingId };

      const linkRes = await apiFetch<FuelReceiptTankLine>(`/api/v1/fuel-receipt-lines/${line.id}`, {
        method: 'PATCH',
        body: JSON.stringify(linkPayload),
      });

      if (!linkRes.success) {
        setManageModalError(
          linkRes.error?.message ||
            `Recorded ${readingType} reading (${newReadingId}), but failed to link it to receipt line.`
        );
        await loadShiftData(selectedShiftId);
        return;
      }

      const refreshed = await loadShiftData(selectedShiftId);
      const updatedReceipt = refreshed.receipts.find(r => r.id === rcpt.id);
      if (updatedReceipt) {
        initializeLineForms(updatedReceipt);
      }
      setManageModalSuccess(
        `Recorded and linked ${readingType} reading (${dipRes.data.netProductVolumeStr} L net) for Tank #${line.tankNumber}.`
      );
    } finally {
      setManageActionBusy(false);
    }
  };

  const handleLinkExistingReading = async (
    rcpt: FuelReceipt,
    line: FuelReceiptTankLine,
    readingType: 'PRE_RECEIPT' | 'POST_RECEIPT',
    readingId: string
  ) => {
    if (!selectedShiftId || !readingId || manageActionBusy) return;

    setManageActionBusy(true);
    setManageModalError(null);
    setManageModalSuccess(null);

    try {
      const payload =
        readingType === 'PRE_RECEIPT'
          ? { preDecantReadingId: readingId }
          : { postDecantReadingId: readingId };

      const res = await apiFetch<FuelReceiptTankLine>(`/api/v1/fuel-receipt-lines/${line.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      if (!res.success) {
        setManageModalError(res.error?.message || `Failed to link ${readingType} reading to receipt line.`);
        return;
      }

      const refreshed = await loadShiftData(selectedShiftId);
      const updatedReceipt = refreshed.receipts.find(r => r.id === rcpt.id);
      if (updatedReceipt) {
        initializeLineForms(updatedReceipt);
      }
      setManageModalSuccess(`Linked existing ${readingType} reading to Tank #${line.tankNumber}.`);
    } finally {
      setManageActionBusy(false);
    }
  };

  const handleSaveLineQuality = async (rcpt: FuelReceipt, line: FuelReceiptTankLine) => {
    if (!selectedShiftId || manageActionBusy) return;
    const lf = lineForms[line.id];
    if (!lf) return;

    setManageActionBusy(true);
    setManageModalError(null);
    setManageModalSuccess(null);

    try {
      const res = await apiFetch<FuelReceiptTankLine>(`/api/v1/fuel-receipt-lines/${line.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          density: lf.density.trim() ? lf.density.trim() : null,
          invoiceDensity: lf.invoiceDensity.trim() ? lf.invoiceDensity.trim() : null,
          temperature: lf.temperature.trim() ? lf.temperature.trim() : null,
        }),
      });

      if (!res.success) {
        setManageModalError(res.error?.message || 'Failed to update line quality parameters.');
        return;
      }

      const refreshed = await loadShiftData(selectedShiftId);
      const updatedReceipt = refreshed.receipts.find(r => r.id === rcpt.id);
      if (updatedReceipt) {
        initializeLineForms(updatedReceipt);
      }
      setManageModalSuccess(`Updated density and temperature parameters for Tank #${line.tankNumber}.`);
    } finally {
      setManageActionBusy(false);
    }
  };

  const handleTransitionReceiptStatus = async (
    rcpt: FuelReceipt,
    targetStatus: 'VERIFIED' | 'DECANTED' | 'COMPLETED' | 'CANCELLED'
  ) => {
    if (!selectedShiftId || manageActionBusy) return;

    if (targetStatus === 'VERIFIED' && !sealVerifiedInput && !sealExceptionInput.trim()) {
      setManageModalError('A seal exception reason is required when tanker seal is marked as not verified.');
      return;
    }

    if (targetStatus === 'CANCELLED') {
      if (cancellationReasonInput.trim().length < 3) {
        setManageModalError('An authorised cancellation audit reason (minimum 3 characters) is required.');
        return;
      }
    }

    if (targetStatus === 'COMPLETED') {
      const readiness = evaluateReceiptCompletionReadiness(
        rcpt,
        tankReadings,
        decantStartInput ? new Date(decantStartInput).toISOString() : rcpt.decantationStartedAt,
        decantCompleteInput ? new Date(decantCompleteInput).toISOString() : null
      );
      if (!readiness.canComplete) {
        setManageModalError(
          `Cannot complete fuel receipt: ${readiness.missingRequirements.join(' ')}`
        );
        return;
      }
    }

    setManageActionBusy(true);
    setManageModalError(null);
    setManageModalSuccess(null);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const payload: Record<string, unknown> = {
        status: targetStatus,
      };

      if (targetStatus === 'VERIFIED') {
        payload.sealVerified = sealVerifiedInput;
        payload.sealExceptionReason = sealVerifiedInput ? null : sealExceptionInput.trim();
      } else if (targetStatus === 'DECANTED') {
        if (decantStartInput.trim()) {
          payload.decantationStartedAt = new Date(decantStartInput).toISOString();
        }
      } else if (targetStatus === 'COMPLETED') {
        if (decantStartInput.trim()) {
          payload.decantationStartedAt = new Date(decantStartInput).toISOString();
        }
        if (decantCompleteInput.trim()) {
          payload.decantationCompletedAt = new Date(decantCompleteInput).toISOString();
        }
      } else if (targetStatus === 'CANCELLED') {
        const trimmedReason = cancellationReasonInput.trim();
        payload.cancellationReason = trimmedReason;
        payload.sealExceptionReason = `CANCELLED: ${trimmedReason}`;
      }

      const res = await apiFetch<FuelReceipt>(`/api/v1/fuel-receipts/${rcpt.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      if (!res.success || !res.data) {
        setManageModalError(res.error?.message || `Failed to transition receipt to ${targetStatus}.`);
        return;
      }

      const refreshed = await loadShiftData(selectedShiftId);
      if (selectedOutletId) {
        await loadShifts(selectedOutletId, selectedShiftId);
      }

      const readinessAfter = summarizeShiftReceiptReadiness(refreshed.receipts);
      const statusNotice = `Receipt TT ${rcpt.ttNumber} (Inv ${rcpt.invoiceNumber}) transitioned to ${targetStatus}.`;

      if (targetStatus === 'COMPLETED' || targetStatus === 'CANCELLED') {
        const suffix = readinessAfter.allReceiptsFinalized
          ? ' All fuel receipts for this shift are now finalised. You may recompute stock reconciliation and proceed to close the shift.'
          : '';
        setSuccessMsg(`${statusNotice}${suffix}`);
        setManageModalSuccess(`${statusNotice}${suffix}`);
        setShowCancelSection(false);
      } else {
        setManageModalSuccess(statusNotice);
      }
    } finally {
      setManageActionBusy(false);
    }
  };

  const handleRecordDip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShiftId || !dipForm.tankId || !dipForm.productDipMm || dipSubmitting) return;

    setDipSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await apiFetch(`/api/v1/shifts/${selectedShiftId}/tank-readings`, {
        method: 'POST',
        body: JSON.stringify({
          tankId: dipForm.tankId,
          readingType: activeTab === 'OPENING' ? 'OPENING' : activeTab === 'CLOSING' ? 'CLOSING' : dipForm.readingType,
          source: dipForm.source,
          productDipMm: dipForm.productDipMm,
          waterDipMm: dipForm.waterDipMm || '0.000',
        }),
      });

      if (res.success) {
        setSuccessMsg(`Recorded ${activeTab} stock dip successfully.`);
        setDipForm({ tankId: '', readingType: 'OPENING', source: 'MANUAL', productDipMm: '', waterDipMm: '0.000' });
        await loadShiftData(selectedShiftId);
      } else {
        setErrorMsg(res.error?.message || 'Failed to record tank reading');
      }
    } finally {
      setDipSubmitting(false);
    }
  };

  const handleCreateReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShiftId || !receiptForm.lineTankId || receiptSubmitting) return;

    const tank = tankSnapshots.find(t => t.tankId === receiptForm.lineTankId);
    if (!tank) return;

    setReceiptSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await apiFetch(`/api/v1/shifts/${selectedShiftId}/fuel-receipts`, {
        method: 'POST',
        body: JSON.stringify({
          ttNumber: receiptForm.ttNumber,
          invoiceNumber: receiptForm.invoiceNumber,
          invoiceDate: receiptForm.invoiceDate,
          arrivalAt: receiptForm.arrivalTime,
          sealVerified: receiptForm.sealVerified,
          sealExceptionReason: receiptForm.sealVerified ? null : receiptForm.sealExceptionReason,
          lines: [
            {
              tankId: receiptForm.lineTankId,
              productId: tank.productId,
              invoiceQuantity: receiptForm.invoiceQuantity,
              density: receiptForm.density || null,
              invoiceDensity: receiptForm.invoiceDensity || null,
              temperature: receiptForm.temperature || null,
            },
          ],
        }),
      });

      if (res.success) {
        setSuccessMsg('Fuel receipt created successfully');
        setShowReceiptModal(false);
        setReceiptForm({
          ttNumber: '',
          invoiceNumber: '',
          invoiceDate: getLocalDateInputValue(),
          arrivalTime: getLocalDateTimeInputValue(),
          sealVerified: true,
          sealExceptionReason: '',
          lineTankId: '',
          invoiceQuantity: '',
          density: '',
          invoiceDensity: '',
          temperature: '',
        });
        await loadShiftData(selectedShiftId);
      } else {
        setErrorMsg(res.error?.message || 'Failed to create fuel receipt');
      }
    } finally {
      setReceiptSubmitting(false);
    }
  };

  const handleComputeReconciliation = async () => {
    if (!selectedShiftId || computeSubmitting) return;
    setComputeSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await apiFetch(`/api/v1/shifts/${selectedShiftId}/stock-reconciliation/compute`, {
        method: 'POST',
      });

      if (res.success) {
        setSuccessMsg('Reconciliation computed and saved.');
        await loadShiftData(selectedShiftId);
        if (selectedOutletId) {
          await loadShifts(selectedOutletId, selectedShiftId);
        }
      } else {
        setErrorMsg(res.error?.message || 'Reconciliation compute failed');
      }
    } finally {
      setComputeSubmitting(false);
    }
  };

  const currentShift = shifts.find(s => s.id === selectedShiftId);
  const shiftReceiptSummary = summarizeShiftReceiptReadiness(receipts);
  const managingReceipt = managingReceiptId ? receipts.find(r => r.id === managingReceiptId) || null : null;
  const managingReceiptReadiness = managingReceipt
    ? evaluateReceiptCompletionReadiness(
        managingReceipt,
        tankReadings,
        decantStartInput ? new Date(decantStartInput).toISOString() : managingReceipt.decantationStartedAt,
        decantCompleteInput ? new Date(decantCompleteInput).toISOString() : null
      )
    : null;

  // All reading IDs already linked across any receipt in this shift
  const linkedPreReadingIds = new Set<string>();
  const linkedPostReadingIds = new Set<string>();
  for (const r of receipts) {
    for (const l of r.lines || []) {
      if (l.preDecantReadingId) linkedPreReadingIds.add(l.preDecantReadingId);
      if (l.postDecantReadingId) linkedPostReadingIds.add(l.postDecantReadingId);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Droplets className="w-6 h-6 text-orange-500" />
            Stock & Decantation Operations
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Tank stock dips, tanker receipts, quality density verification, and authoritative reconciliation
          </p>
        </div>

        <button
          onClick={() => selectedShiftId && loadShiftData(selectedShiftId)}
          className="self-start sm:self-auto px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Selectors Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-900/80 p-4 rounded-xl border border-slate-800">
        <div>
          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Retail Outlet
          </label>
          <select
            value={selectedOutletId}
            onChange={e => setSelectedOutletId(e.target.value)}
            className="w-full bg-slate-800 text-white text-sm font-semibold rounded-lg p-2.5 border border-slate-700 focus:border-orange-500 focus:outline-none"
          >
            {outlets.map(o => (
              <option key={o.id} value={o.id}>
                {o.roCode} - {o.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Operational Shift
          </label>
          <select
            value={selectedShiftId}
            onChange={e => setSelectedShiftId(e.target.value)}
            className="w-full bg-slate-800 text-white text-sm font-semibold rounded-lg p-2.5 border border-slate-700 focus:border-orange-500 focus:outline-none"
          >
            {shifts.length === 0 ? (
              <option value="">No shifts available</option>
            ) : (
              shifts.map(s => (
                <option key={s.id} value={s.id}>
                  {s.businessDate} ({s.status})
                </option>
              ))
            )}
          </select>
        </div>

        {currentShift && (
          <div className="flex items-center justify-between gap-2 text-xs text-slate-300 font-mono bg-slate-800/50 p-2.5 rounded-lg border border-slate-700/50 self-end">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Status:</span>
              <span
                className={`px-2 py-0.5 rounded font-bold ${
                  currentShift.status === 'OPEN'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {currentShift.status}
              </span>
            </div>
            {receipts.length > 0 && (
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  shiftReceiptSummary.allReceiptsFinalized
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}
              >
                Receipts: {shiftReceiptSummary.completedCount + shiftReceiptSummary.cancelledCount}/
                {shiftReceiptSummary.totalReceipts} Finalised
              </span>
            )}
          </div>
        )}
      </div>

      {/* Error & Success Messages */}
      {errorMsg && (
        <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Operations Navigation Tabs */}
      <div className="flex border-b border-slate-800 overflow-x-auto scrollbar-none">
        {[
          { id: 'OPENING', label: '1. Opening Stock', icon: Droplets },
          {
            id: 'RECEIPTS',
            label:
              shiftReceiptSummary.pendingReceipts.length > 0
                ? `2. Fuel Receipts (${shiftReceiptSummary.pendingReceipts.length} Pending)`
                : '2. Fuel Receipts',
            icon: Fuel,
          },
          { id: 'CLOSING', label: '3. Closing Stock', icon: Droplets },
          { id: 'RECONCILIATION', label: '4. Reconciliation', icon: Calculator },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 text-xs md:text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${
                isActive
                  ? 'border-orange-500 text-orange-400 bg-orange-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content: OPENING & CLOSING STOCK */}
      {(activeTab === 'OPENING' || activeTab === 'CLOSING') && (
        <div className="space-y-6">
          {/* Record Dip Form */}
          {currentShift?.status === 'OPEN' && (
            <form onSubmit={handleRecordDip} className="bg-slate-900/90 p-4 md:p-5 rounded-xl border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Droplets className="w-4 h-4 text-orange-500" />
                Record {activeTab} Dip Reading
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Tank</label>
                  <select
                    value={dipForm.tankId}
                    onChange={e => setDipForm({ ...dipForm, tankId: e.target.value })}
                    required
                    className="w-full bg-slate-800 text-white text-xs font-semibold rounded-lg p-2.5 border border-slate-700 focus:border-orange-500 focus:outline-none"
                  >
                    <option value="">Select Tank</option>
                    {tankSnapshots.map(t => (
                      <option key={t.tankId} value={t.tankId}>
                        Tank #{t.tankNumber} ({t.productCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Source</label>
                  <select
                    value={dipForm.source}
                    onChange={e => setDipForm({ ...dipForm, source: e.target.value as any })}
                    className="w-full bg-slate-800 text-white text-xs font-semibold rounded-lg p-2.5 border border-slate-700 focus:border-orange-500 focus:outline-none"
                  >
                    <option value="MANUAL">MANUAL DIP</option>
                    <option value="ATG">AUTOMATIC TANK GAUGE (ATG)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Product Dip (mm)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 1250.000"
                    value={dipForm.productDipMm}
                    onChange={e => setDipForm({ ...dipForm, productDipMm: e.target.value })}
                    required
                    className="w-full bg-slate-800 text-white text-xs font-semibold rounded-lg p-2.5 border border-slate-700 focus:border-orange-500 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Water Dip (mm)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 0.000"
                    value={dipForm.waterDipMm}
                    onChange={e => setDipForm({ ...dipForm, waterDipMm: e.target.value })}
                    className="w-full bg-slate-800 text-white text-xs font-semibold rounded-lg p-2.5 border border-slate-700 focus:border-orange-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={dipSubmitting}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-orange-500/20 disabled:opacity-50"
                >
                  {dipSubmitting ? 'Saving...' : `Save ${activeTab} Reading`}
                </button>
              </div>
            </form>
          )}

          {/* Snapshot Tanks Readings Table */}
          <div className="bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                {activeTab} Tank Stock Dips
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-[10px] text-slate-400 uppercase font-mono tracking-wider">
                  <tr>
                    <th className="p-3">Tank #</th>
                    <th className="p-3">Product</th>
                    <th className="p-3">Source</th>
                    <th className="p-3">Product Dip (mm)</th>
                    <th className="p-3">Water Dip (mm)</th>
                    <th className="p-3 text-right">Gross Vol (L)</th>
                    <th className="p-3 text-right">Water Vol (L)</th>
                    <th className="p-3 text-right">Net Product Stock (L)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {tankSnapshots.map(ts => {
                    const reading = tankReadings.find(r => r.tankId === ts.tankId && r.readingType === activeTab);
                    return (
                      <tr key={ts.tankId} className="hover:bg-slate-800/40">
                        <td className="p-3 font-bold text-white">Tank #{ts.tankNumber}</td>
                        <td className="p-3">{ts.productCode} - {ts.productName}</td>
                        <td className="p-3 text-slate-400">{reading ? reading.source : '-'}</td>
                        <td className="p-3 text-slate-200">{reading ? reading.productDipMmStr : '-'}</td>
                        <td className="p-3 text-slate-200">{reading ? reading.waterDipMmStr : '-'}</td>
                        <td className="p-3 text-right text-slate-300">{reading ? reading.grossObservedVolumeStr : '-'}</td>
                        <td className="p-3 text-right text-slate-400">{reading ? reading.waterVolumeStr : '-'}</td>
                        <td className="p-3 text-right font-bold text-orange-400">
                          {reading ? `${reading.netProductVolumeStr} L` : <span className="text-red-400 font-normal">MISSING</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: FUEL RECEIPTS */}
      {activeTab === 'RECEIPTS' && (
        <div className="space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Fuel className="w-4 h-4 text-orange-500" />
                Tanker Fuel Deliveries
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Every tanker receipt must reach COMPLETED (with verified PRE & POST tank dips) or CANCELLED before shift closing.
              </p>
            </div>
            {currentShift?.status === 'OPEN' && (
              <button
                onClick={() => setShowReceiptModal(true)}
                className="px-3.5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-orange-500/20 flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                New Fuel Receipt
              </button>
            )}
          </div>

          {/* Shift Fuel Receipt Readiness Banner */}
          {receipts.length > 0 && (
            <div
              className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
                shiftReceiptSummary.shiftCloseBlockedByReceipts
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide">
                  {shiftReceiptSummary.shiftCloseBlockedByReceipts ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        Shift Close Blocked — {shiftReceiptSummary.pendingReceipts.length} Non-Finalised Fuel Receipt
                        {shiftReceiptSummary.pendingReceipts.length === 1 ? '' : 's'}
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        All Shift Fuel Receipts Finalised ({shiftReceiptSummary.completedCount} Completed,{' '}
                        {shiftReceiptSummary.cancelledCount} Cancelled)
                      </span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-300">
                  {shiftReceiptSummary.shiftCloseBlockedByReceipts
                    ? `Pending receipts: ${shiftReceiptSummary.pendingReceipts
                        .map(r => `TT ${r.ttNumber} (Inv ${r.invoiceNumber} — ${r.status})`)
                        .join(', ')}. Click "Manage Receipt" below to complete decantation dips or cancel undelivered receipts.`
                    : 'Shift receipt completeness checks are satisfied. Recompute stock reconciliation to include completed tanker volumes before closing the shift.'}
                </p>
              </div>

              {currentShift?.status === 'OPEN' && shiftReceiptSummary.allReceiptsFinalized && (
                <button
                  type="button"
                  disabled={computeSubmitting}
                  onClick={handleComputeReconciliation}
                  className="self-start sm:self-center shrink-0 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Calculator className="w-3.5 h-3.5" />
                  {computeSubmitting ? 'Recomputing...' : 'Recompute Stock Reconciliation'}
                </button>
              )}
            </div>
          )}

          {receipts.length === 0 ? (
            <div className="p-8 text-center bg-slate-900/60 rounded-xl border border-slate-800 text-slate-400 text-xs font-mono">
              No fuel receipts recorded for this shift.
            </div>
          ) : (
            receipts.map(rcpt => {
              const isFinalized = rcpt.status === 'COMPLETED' || rcpt.status === 'CANCELLED';
              const readiness = evaluateReceiptCompletionReadiness(rcpt, tankReadings);

              return (
                <div key={rcpt.id} className="bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden p-4 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs sm:text-sm font-bold text-white font-mono">
                          TT: {rcpt.ttNumber} — Invoice: {rcpt.invoiceNumber}
                        </span>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-extrabold rounded font-mono ${
                            rcpt.status === 'COMPLETED'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : rcpt.status === 'CANCELLED'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : rcpt.status === 'DECANTED'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              : rcpt.status === 'VERIFIED'
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {rcpt.status}
                        </span>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded font-mono ${
                            rcpt.sealVerified
                              ? 'bg-slate-800 text-slate-300 border border-slate-700'
                              : 'bg-red-500/15 text-red-300 border border-red-500/30'
                          }`}
                        >
                          {rcpt.sealVerified ? 'SEAL VERIFIED' : 'SEAL EXCEPTION'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5 font-mono">
                        <span>Inv Date: {rcpt.invoiceDate}</span>
                        <span>Arrived: {new Date(rcpt.arrivalAt).toLocaleString()}</span>
                        {rcpt.decantationStartedAt && (
                          <span>Decant Start: {new Date(rcpt.decantationStartedAt).toLocaleString()}</span>
                        )}
                        {rcpt.decantationCompletedAt && (
                          <span>Decant Complete: {new Date(rcpt.decantationCompletedAt).toLocaleString()}</span>
                        )}
                      </div>
                      {rcpt.sealExceptionReason && (
                        <div className="text-[11px] text-amber-300 font-mono bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1 inline-block">
                          Audit / Seal Note: {rcpt.sealExceptionReason}
                        </div>
                      )}
                    </div>

                    {!isFinalized && currentShift?.status === 'OPEN' && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openManageReceiptModal(rcpt, false)}
                          className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors shadow shadow-orange-500/20 flex items-center gap-1.5"
                        >
                          <Settings2 className="w-3.5 h-3.5" />
                          Manage Receipt
                        </button>
                        <button
                          type="button"
                          onClick={() => openManageReceiptModal(rcpt, true)}
                          className="px-2.5 py-1.5 bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Cancel Receipt
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Missing Requirements Hint on Non-finalized Receipt Card */}
                  {!isFinalized && readiness.missingRequirements.length > 0 && (
                    <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-[11px] text-slate-300 space-y-1">
                      <div className="font-bold text-amber-400 uppercase tracking-wider text-[10px]">
                        Remaining Requirements Before Completion:
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 text-slate-400 font-mono">
                        {readiness.missingRequirements.map((req, idx) => (
                          <li key={idx}>{req}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Lines Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300 font-mono">
                      <thead className="bg-slate-800/80 text-[10px] text-slate-400 uppercase">
                        <tr>
                          <th className="p-2.5">Tank</th>
                          <th className="p-2.5">Product</th>
                          <th className="p-2.5 text-right">Invoice Qty (L)</th>
                          <th className="p-2.5 text-right">PRE Dip / Net</th>
                          <th className="p-2.5 text-right">POST Dip / Net</th>
                          <th className="p-2.5 text-right">Measured Qty (L)</th>
                          <th className="p-2.5 text-right">Variance (L)</th>
                          <th className="p-2.5 text-right">Obs / Inv Density</th>
                          <th className="p-2.5 text-right">Temp (°C)</th>
                          <th className="p-2.5">Quality Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {rcpt.lines?.map(l => {
                          const preR = l.preDecantReadingId
                            ? tankReadings.find(r => r.id === l.preDecantReadingId)
                            : undefined;
                          const postR = l.postDecantReadingId
                            ? tankReadings.find(r => r.id === l.postDecantReadingId)
                            : undefined;
                          return (
                            <tr key={l.id}>
                              <td className="p-2.5 font-bold text-white">Tank #{l.tankNumber}</td>
                              <td className="p-2.5">{l.productCode}</td>
                              <td className="p-2.5 text-right">{l.invoiceQuantityStr} L</td>
                              <td className="p-2.5 text-right">
                                {preR ? (
                                  <span className="text-emerald-300">
                                    {preR.productDipMmStr} mm ({preR.netProductVolumeStr} L)
                                  </span>
                                ) : (
                                  <span className="text-amber-400">MISSING PRE</span>
                                )}
                              </td>
                              <td className="p-2.5 text-right">
                                {postR ? (
                                  <span className="text-emerald-300">
                                    {postR.productDipMmStr} mm ({postR.netProductVolumeStr} L)
                                  </span>
                                ) : (
                                  <span className="text-amber-400">MISSING POST</span>
                                )}
                              </td>
                              <td className="p-2.5 text-right font-bold text-slate-200">
                                {l.measuredReceivedQuantityStr ? `${l.measuredReceivedQuantityStr} L` : '-'}
                              </td>
                              <td className="p-2.5 text-right text-orange-400">
                                {l.receiptVarianceStr ? `${l.receiptVarianceStr} L` : '-'}
                              </td>
                              <td className="p-2.5 text-right">
                                {l.densityStr || '-'} / {l.invoiceDensityStr || '-'}
                                {l.densityVarianceStr ? ` (Δ ${l.densityVarianceStr})` : ''}
                              </td>
                              <td className="p-2.5 text-right">{l.temperatureStr ? `${l.temperatureStr}°C` : '-'}</td>
                              <td className="p-2.5">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    l.qualityStatus === 'PASS'
                                      ? 'bg-emerald-500/20 text-emerald-400'
                                      : l.qualityStatus === 'OUT_OF_TOLERANCE'
                                      ? 'bg-red-500/20 text-red-400'
                                      : 'bg-slate-700 text-slate-300'
                                  }`}
                                >
                                  {l.qualityStatus}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab Content: RECONCILIATION */}
      {activeTab === 'RECONCILIATION' && (
        <div className="space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Calculator className="w-4 h-4 text-orange-500" />
                Shift Stock Reconciliation
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Theoretical Closing = Opening + Completed Receipts - Sales
              </p>
            </div>

            {currentShift?.status === 'OPEN' && (
              <button
                disabled={computeSubmitting}
                onClick={handleComputeReconciliation}
                className="px-3.5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-orange-500/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Calculator className="w-4 h-4" />
                {computeSubmitting ? 'Computing...' : 'Compute Reconciliation'}
              </button>
            )}
          </div>

          {!reconciliation ? (
            <div className="p-8 text-center bg-slate-900/60 rounded-xl border border-slate-800 text-slate-400 text-xs font-mono">
              No reconciliation report available yet. Enter Opening/Closing dips and click Compute.
            </div>
          ) : (
            <div className="space-y-6">
              {/* By Tank Table */}
              <div className="bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden">
                <div className="p-3.5 bg-slate-800/80 border-b border-slate-800 font-bold text-xs text-white uppercase">
                  Tank-Level Reconciliation
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300 font-mono">
                    <thead className="bg-slate-800/50 text-[10px] text-slate-400 uppercase">
                      <tr>
                        <th className="p-3">Tank #</th>
                        <th className="p-3">Product</th>
                        <th className="p-3 text-right">Opening Stock</th>
                        <th className="p-3 text-right">+ Receipts</th>
                        <th className="p-3 text-right">- Meter Sales</th>
                        <th className="p-3 text-right">= Theoretical</th>
                        <th className="p-3 text-right">Physical Closing</th>
                        <th className="p-3 text-right">Variance</th>
                        <th className="p-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {reconciliation.byTank.map(t => (
                        <tr key={t.tankId} className="hover:bg-slate-800/30">
                          <td className="p-3 font-bold text-white">Tank #{t.tankNumber}</td>
                          <td className="p-3">{t.productCode}</td>
                          <td className="p-3 text-right">{t.openingStockStr ?? '-'} L</td>
                          <td className="p-3 text-right text-emerald-400">+{t.receiptQuantityStr} L</td>
                          <td className="p-3 text-right text-amber-400">-{t.salesQuantityStr} L</td>
                          <td className="p-3 text-right font-bold text-slate-200">{t.theoreticalClosingStockStr ?? '-'} L</td>
                          <td className="p-3 text-right font-bold text-white">{t.physicalClosingStockStr ?? '-'} L</td>
                          <td className="p-3 text-right font-bold text-orange-400">{t.varianceStr ?? '-'} L</td>
                          <td className="p-3 text-center">
                            {t.varianceStatus ? (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                  t.varianceStatus === 'BALANCED'
                                    ? 'bg-slate-700 text-slate-300'
                                    : t.varianceStatus === 'GAIN'
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                }`}
                              >
                                {t.varianceStatus}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* By Product Summary */}
              <div className="bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden">
                <div className="p-3.5 bg-slate-800/80 border-b border-slate-800 font-bold text-xs text-white uppercase">
                  Product-Level Reconciliation Summary
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300 font-mono">
                    <thead className="bg-slate-800/50 text-[10px] text-slate-400 uppercase">
                      <tr>
                        <th className="p-3">Product</th>
                        <th className="p-3 text-right">Opening Total</th>
                        <th className="p-3 text-right">Receipts Total</th>
                        <th className="p-3 text-right">Sales Total</th>
                        <th className="p-3 text-right">Theoretical</th>
                        <th className="p-3 text-right">Physical Total</th>
                        <th className="p-3 text-right">Total Variance</th>
                        <th className="p-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {reconciliation.byProduct.map(p => (
                        <tr key={p.productId} className="hover:bg-slate-800/30">
                          <td className="p-3 font-bold text-white">{p.productCode} - {p.productName}</td>
                          <td className="p-3 text-right">{p.openingStockStr ?? '-'} L</td>
                          <td className="p-3 text-right text-emerald-400">+{p.receiptQuantityStr} L</td>
                          <td className="p-3 text-right text-amber-400">-{p.salesQuantityStr} L</td>
                          <td className="p-3 text-right font-bold text-slate-200">{p.theoreticalClosingStockStr ?? '-'} L</td>
                          <td className="p-3 text-right font-bold text-white">{p.physicalClosingStockStr ?? '-'} L</td>
                          <td className="p-3 text-right font-bold text-orange-400">{p.varianceStr ?? '-'} L</td>
                          <td className="p-3 text-center">
                            {p.varianceStatus ? (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                  p.varianceStatus === 'BALANCED'
                                    ? 'bg-slate-700 text-slate-300'
                                    : p.varianceStatus === 'GAIN'
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                }`}
                              >
                                {p.varianceStatus}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manage Fuel Receipt Lifecycle & Decantation Modal */}
      {managingReceipt && managingReceiptReadiness && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-4 sm:p-6 space-y-5 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    <Fuel className="w-5 h-5 text-orange-500" />
                    Manage Fuel Receipt — TT {managingReceipt.ttNumber}
                  </h3>
                  <span className="px-2.5 py-0.5 rounded text-xs font-extrabold font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {managingReceipt.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  Invoice: {managingReceipt.invoiceNumber} | Date: {managingReceipt.invoiceDate} | Arrived:{' '}
                  {new Date(managingReceipt.arrivalAt).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={closeManageReceiptModal}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Lifecycle Stepper */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Authorised Receipt Lifecycle Progression
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                {(['ARRIVED', 'VERIFIED', 'DECANTED', 'COMPLETED'] as const).map((step, index) => {
                  const statusOrder = ['ARRIVED', 'VERIFIED', 'DECANTED', 'COMPLETED'];
                  const currentIdx = statusOrder.indexOf(managingReceipt.status);
                  const isDone = currentIdx > index || managingReceipt.status === 'COMPLETED';
                  const isCurrent = managingReceipt.status === step;
                  return (
                    <div
                      key={step}
                      className={`p-2.5 rounded-lg border flex items-center justify-between ${
                        isCurrent
                          ? 'bg-orange-500/15 border-orange-500/50 text-orange-300 font-bold'
                          : isDone
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-slate-900 border-slate-800 text-slate-500'
                      }`}
                    >
                      <span>
                        {index + 1}. {step}
                      </span>
                      {isDone && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {manageModalError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{manageModalError}</span>
              </div>
            )}

            {manageModalSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{manageModalSuccess}</span>
              </div>
            )}

            {/* Step 1: Tanker Arrival & Seal Verification (ARRIVED -> VERIFIED) */}
            {managingReceipt.status === 'ARRIVED' && (
              <div className="bg-slate-950/70 border border-cyan-500/30 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                    Step 1: Tanker Seal & Invoice Verification (ARRIVED → VERIFIED)
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <label className="flex items-center gap-2 text-slate-200 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sealVerifiedInput}
                      onChange={e => setSealVerifiedInput(e.target.checked)}
                      className="rounded border-slate-600 text-orange-500 focus:ring-orange-500"
                    />
                    Tanker Manifold & Lock Seals Verified Intact
                  </label>
                  {!sealVerifiedInput && (
                    <div>
                      <label className="block text-[10px] font-bold text-amber-300 uppercase mb-1">
                        Seal Exception Reason (Required)
                      </label>
                      <input
                        type="text"
                        placeholder="Describe seal discrepancy or authorisation..."
                        value={sealExceptionInput}
                        onChange={e => setSealExceptionInput(e.target.value)}
                        className="w-full bg-slate-800 text-white rounded-lg p-2 border border-amber-500/40 text-xs"
                      />
                    </div>
                  )}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={manageActionBusy}
                    onClick={() => handleTransitionReceiptStatus(managingReceipt, 'VERIFIED')}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    Verify Tanker & Seal (Advance to VERIFIED)
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Decantation Tank Readings (PRE_RECEIPT & POST_RECEIPT) & Quality */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <Droplets className="w-4 h-4 text-orange-500" />
                Tank Line Decantation Dips (PRE_RECEIPT & POST_RECEIPT) & Quality Parameters
              </h4>

              {(managingReceipt.lines || []).map(line => {
                const lf = lineForms[line.id] || {
                  preSource: 'MANUAL',
                  preProductDipMm: '',
                  preWaterDipMm: '0.000',
                  existingPreReadingId: line.preDecantReadingId || '',
                  postSource: 'MANUAL',
                  postProductDipMm: '',
                  postWaterDipMm: '0.000',
                  existingPostReadingId: line.postDecantReadingId || '',
                  density: line.densityStr || '',
                  invoiceDensity: line.invoiceDensityStr || '',
                  temperature: line.temperatureStr || '',
                };

                const linkedPre = line.preDecantReadingId
                  ? tankReadings.find(r => r.id === line.preDecantReadingId) || null
                  : null;
                const linkedPost = line.postDecantReadingId
                  ? tankReadings.find(r => r.id === line.postDecantReadingId) || null
                  : null;

                const availableUnlinkedPre = tankReadings.filter(
                  r =>
                    r.readingType === 'PRE_RECEIPT' &&
                    r.tankId === line.tankId &&
                    r.productId === line.productId &&
                    (!linkedPreReadingIds.has(r.id) || r.id === line.preDecantReadingId)
                );

                const availableUnlinkedPost = tankReadings.filter(
                  r =>
                    r.readingType === 'POST_RECEIPT' &&
                    r.tankId === line.tankId &&
                    r.productId === line.productId &&
                    (!linkedPostReadingIds.has(r.id) || r.id === line.postDecantReadingId)
                );

                return (
                  <div
                    key={line.id}
                    className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-4"
                  >
                    {/* Line Summary Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3 font-mono text-xs">
                      <div className="font-bold text-white">
                        Tank #{line.tankNumber} ({line.productCode} - {line.productName})
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[11px]">
                        <span className="text-slate-300">
                          Invoice Qty: <strong className="text-white">{line.invoiceQuantityStr} L</strong>
                        </span>
                        <span className="text-slate-300">
                          Measured Qty:{' '}
                          <strong className="text-emerald-400">
                            {line.measuredReceivedQuantityStr ? `${line.measuredReceivedQuantityStr} L` : 'Pending Dips'}
                          </strong>
                        </span>
                        <span className="text-slate-300">
                          Variance:{' '}
                          <strong className="text-orange-400">
                            {line.receiptVarianceStr ? `${line.receiptVarianceStr} L` : '-'}
                          </strong>
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            line.qualityStatus === 'PASS'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : line.qualityStatus === 'OUT_OF_TOLERANCE'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          Quality: {line.qualityStatus}
                        </span>
                      </div>
                    </div>

                    {/* PRE_RECEIPT and POST_RECEIPT Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* PRE_RECEIPT Panel */}
                      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-orange-400 uppercase font-mono">
                            1. PRE_RECEIPT Tank Dip
                          </span>
                          {linkedPre ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
                              LINKED ({linkedPre.netProductVolumeStr} L)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold">
                              REQUIRED
                            </span>
                          )}
                        </div>

                        {linkedPre && (
                          <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 space-y-0.5">
                            <div>
                              Product Dip: <strong>{linkedPre.productDipMmStr} mm</strong> | Water Dip:{' '}
                              <strong>{linkedPre.waterDipMmStr} mm</strong>
                            </div>
                            <div>
                              Net Stock: <strong className="text-emerald-400">{linkedPre.netProductVolumeStr} L</strong>{' '}
                              ({linkedPre.source})
                            </div>
                            <div className="text-slate-500">
                              Recorded: {new Date(linkedPre.recordedAt).toLocaleString()}
                            </div>
                          </div>
                        )}

                        {managingReceipt.status !== 'COMPLETED' && managingReceipt.status !== 'CANCELLED' && (
                          <div className="space-y-2.5 pt-1">
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                                  Source
                                </label>
                                <select
                                  value={lf.preSource}
                                  onChange={e =>
                                    updateLineFormField(line.id, { preSource: e.target.value as 'MANUAL' | 'ATG' })
                                  }
                                  className="w-full bg-slate-800 text-white rounded p-2 border border-slate-700 text-xs"
                                >
                                  <option value="MANUAL">MANUAL</option>
                                  <option value="ATG">ATG</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                                  Product Dip (mm)
                                </label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="Actual mm"
                                  value={lf.preProductDipMm}
                                  onChange={e => updateLineFormField(line.id, { preProductDipMm: e.target.value })}
                                  className="w-full bg-slate-800 text-white rounded p-2 border border-slate-700 text-xs font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                                  Water Dip (mm)
                                </label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="0.000"
                                  value={lf.preWaterDipMm}
                                  onChange={e => updateLineFormField(line.id, { preWaterDipMm: e.target.value })}
                                  className="w-full bg-slate-800 text-white rounded p-2 border border-slate-700 text-xs font-mono"
                                />
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={manageActionBusy}
                              onClick={() => handleRecordAndLinkDecantDip(managingReceipt, line, 'PRE_RECEIPT')}
                              className="w-full py-2 bg-orange-500/90 hover:bg-orange-500 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                            >
                              Record & Link New PRE_RECEIPT Dip
                            </button>

                            {availableUnlinkedPre.length > 0 && (
                              <div className="flex items-center gap-2 pt-1">
                                <select
                                  value={lf.existingPreReadingId}
                                  onChange={e =>
                                    updateLineFormField(line.id, { existingPreReadingId: e.target.value })
                                  }
                                  className="flex-1 bg-slate-800 text-white rounded p-1.5 border border-slate-700 text-[11px] font-mono"
                                >
                                  <option value="">Select existing PRE_RECEIPT reading...</option>
                                  {availableUnlinkedPre.map(r => (
                                    <option key={r.id} value={r.id}>
                                      {r.productDipMmStr} mm → {r.netProductVolumeStr} L (
                                      {new Date(r.recordedAt).toLocaleTimeString()})
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={manageActionBusy || !lf.existingPreReadingId}
                                  onClick={() =>
                                    handleLinkExistingReading(
                                      managingReceipt,
                                      line,
                                      'PRE_RECEIPT',
                                      lf.existingPreReadingId
                                    )
                                  }
                                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
                                >
                                  <Link2 className="w-3 h-3" />
                                  Link
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* POST_RECEIPT Panel */}
                      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-orange-400 uppercase font-mono">
                            2. POST_RECEIPT Tank Dip
                          </span>
                          {linkedPost ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
                              LINKED ({linkedPost.netProductVolumeStr} L)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold">
                              REQUIRED
                            </span>
                          )}
                        </div>

                        {linkedPost && (
                          <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 space-y-0.5">
                            <div>
                              Product Dip: <strong>{linkedPost.productDipMmStr} mm</strong> | Water Dip:{' '}
                              <strong>{linkedPost.waterDipMmStr} mm</strong>
                            </div>
                            <div>
                              Net Stock:{' '}
                              <strong className="text-emerald-400">{linkedPost.netProductVolumeStr} L</strong> (
                              {linkedPost.source})
                            </div>
                            <div className="text-slate-500">
                              Recorded: {new Date(linkedPost.recordedAt).toLocaleString()}
                            </div>
                          </div>
                        )}

                        {managingReceipt.status !== 'COMPLETED' && managingReceipt.status !== 'CANCELLED' && (
                          <div className="space-y-2.5 pt-1">
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                                  Source
                                </label>
                                <select
                                  value={lf.postSource}
                                  onChange={e =>
                                    updateLineFormField(line.id, { postSource: e.target.value as 'MANUAL' | 'ATG' })
                                  }
                                  className="w-full bg-slate-800 text-white rounded p-2 border border-slate-700 text-xs"
                                >
                                  <option value="MANUAL">MANUAL</option>
                                  <option value="ATG">ATG</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                                  Product Dip (mm)
                                </label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="Actual mm"
                                  value={lf.postProductDipMm}
                                  onChange={e => updateLineFormField(line.id, { postProductDipMm: e.target.value })}
                                  className="w-full bg-slate-800 text-white rounded p-2 border border-slate-700 text-xs font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                                  Water Dip (mm)
                                </label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="0.000"
                                  value={lf.postWaterDipMm}
                                  onChange={e => updateLineFormField(line.id, { postWaterDipMm: e.target.value })}
                                  className="w-full bg-slate-800 text-white rounded p-2 border border-slate-700 text-xs font-mono"
                                />
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={manageActionBusy}
                              onClick={() => handleRecordAndLinkDecantDip(managingReceipt, line, 'POST_RECEIPT')}
                              className="w-full py-2 bg-orange-500/90 hover:bg-orange-500 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                            >
                              Record & Link New POST_RECEIPT Dip
                            </button>

                            {availableUnlinkedPost.length > 0 && (
                              <div className="flex items-center gap-2 pt-1">
                                <select
                                  value={lf.existingPostReadingId}
                                  onChange={e =>
                                    updateLineFormField(line.id, { existingPostReadingId: e.target.value })
                                  }
                                  className="flex-1 bg-slate-800 text-white rounded p-1.5 border border-slate-700 text-[11px] font-mono"
                                >
                                  <option value="">Select existing POST_RECEIPT reading...</option>
                                  {availableUnlinkedPost.map(r => (
                                    <option key={r.id} value={r.id}>
                                      {r.productDipMmStr} mm → {r.netProductVolumeStr} L (
                                      {new Date(r.recordedAt).toLocaleTimeString()})
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={manageActionBusy || !lf.existingPostReadingId}
                                  onClick={() =>
                                    handleLinkExistingReading(
                                      managingReceipt,
                                      line,
                                      'POST_RECEIPT',
                                      lf.existingPostReadingId
                                    )
                                  }
                                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
                                >
                                  <Link2 className="w-3 h-3" />
                                  Link
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Density & Temperature Quality Parameters */}
                    <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 flex flex-col sm:flex-row sm:items-end gap-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1 font-mono text-xs">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                            Observed Density (kg/m³)
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="e.g. 745.000"
                            value={lf.density}
                            onChange={e => updateLineFormField(line.id, { density: e.target.value })}
                            className="w-full bg-slate-800 text-white rounded p-2 border border-slate-700 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                            Invoice Density (kg/m³)
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="e.g. 744.000"
                            value={lf.invoiceDensity}
                            onChange={e => updateLineFormField(line.id, { invoiceDensity: e.target.value })}
                            className="w-full bg-slate-800 text-white rounded p-2 border border-slate-700 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                            Temperature (°C)
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="e.g. 28.500"
                            value={lf.temperature}
                            onChange={e => updateLineFormField(line.id, { temperature: e.target.value })}
                            className="w-full bg-slate-800 text-white rounded p-2 border border-slate-700 text-xs"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={manageActionBusy}
                        onClick={() => handleSaveLineQuality(managingReceipt, line)}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold rounded-lg shrink-0 disabled:opacity-50"
                      >
                        Save Quality / Density
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Step 3: Transition VERIFIED -> DECANTED */}
            {managingReceipt.status === 'VERIFIED' && (
              <div className="bg-slate-950/70 border border-blue-500/30 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-300">
                  Step 2: Record Physical Decantation (VERIFIED → DECANTED)
                </h4>
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                  <div className="text-xs flex-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                      Decantation Started At (Optional — leave blank to use current server timestamp)
                    </label>
                    <input
                      type="datetime-local"
                      value={decantStartInput}
                      onChange={e => setDecantStartInput(e.target.value)}
                      className="bg-slate-800 text-white rounded-lg p-2 border border-slate-700 text-xs font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={manageActionBusy}
                    onClick={() => handleTransitionReceiptStatus(managingReceipt, 'DECANTED')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    Mark Tanker Decanted (Advance to DECANTED)
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Completion Readiness Validation & Transition DECANTED -> COMPLETED */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Final Step: Completion Validation & Finalisation (DECANTED → COMPLETED)
                </h4>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    managingReceiptReadiness.canComplete
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {managingReceiptReadiness.canComplete ? 'READY TO COMPLETE' : 'INCOMPLETE REQUIREMENTS'}
                </span>
              </div>

              {managingReceiptReadiness.missingRequirements.length > 0 ? (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-1">
                  <div className="font-bold text-[11px] uppercase">
                    Cannot Complete Fuel Receipt Yet — Missing Information:
                  </div>
                  <ul className="list-disc list-inside font-mono text-[11px] space-y-0.5">
                    {managingReceiptReadiness.missingRequirements.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 font-mono">
                  All receiving tank lines have valid PRE_RECEIPT and POST_RECEIPT dip readings and receipt status is DECANTED.
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-1">
                <div className="text-xs">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Decantation Completed At (Optional — leave blank to use current server timestamp)
                  </label>
                  <input
                    type="datetime-local"
                    value={decantCompleteInput}
                    onChange={e => setDecantCompleteInput(e.target.value)}
                    className="bg-slate-800 text-white rounded-lg p-2 border border-slate-700 text-xs font-mono"
                  />
                </div>
                <button
                  type="button"
                  disabled={manageActionBusy || !managingReceiptReadiness.canComplete}
                  onClick={() => handleTransitionReceiptStatus(managingReceipt, 'COMPLETED')}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Complete Fuel Receipt (Finalise as COMPLETED)
                </button>
              </div>
            </div>

            {/* Authorised Cancellation Section */}
            <div className="border-t border-slate-800 pt-4">
              {!showCancelSection ? (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    Incorrect entry or undelivered tanker? Cancel with an audited reason.
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowCancelSection(true)}
                    className="px-3 py-1.5 bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 text-xs font-bold rounded-lg flex items-center gap-1.5"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Authorised Cancellation...
                  </button>
                </div>
              ) : (
                <div className="bg-red-950/30 border border-red-500/40 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-red-300 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-red-400" />
                      Authorised Fuel Receipt Cancellation (Preserves Record & Audit Trail)
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowCancelSection(false)}
                      className="text-xs text-slate-400 hover:text-slate-200"
                    >
                      Hide
                    </button>
                  </div>
                  <p className="text-xs text-slate-300">
                    Cancelling transitions this receipt to <strong>CANCELLED</strong>, excludes its volume from stock
                    reconciliation, preserves the historical record, and logs the reason in the audit trail.
                  </p>
                  <div>
                    <label className="block text-[10px] font-bold text-red-300 uppercase mb-1">
                      Cancellation Audit Reason (Required, min 3 characters)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Duplicate invoice entry / Tanker diverted before decantation"
                      value={cancellationReasonInput}
                      onChange={e => setCancellationReasonInput(e.target.value)}
                      className="w-full bg-slate-900 text-white rounded-lg p-2.5 border border-red-500/40 text-xs font-mono"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCancelSection(false)}
                      className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs font-bold rounded-lg"
                    >
                      Keep Receipt Open
                    </button>
                    <button
                      type="button"
                      disabled={manageActionBusy || cancellationReasonInput.trim().length < 3}
                      onClick={() => handleTransitionReceiptStatus(managingReceipt, 'CANCELLED')}
                      className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 disabled:opacity-40"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Confirm Receipt Cancellation
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fuel Receipt Creation Modal */}
      {showReceiptModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Fuel className="w-5 h-5 text-orange-500" />
              Record Tanker Fuel Receipt
            </h3>

            <form onSubmit={handleCreateReceipt} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">TT Number</label>
                  <input
                    type="text"
                    placeholder="e.g. TT-9988"
                    value={receiptForm.ttNumber}
                    onChange={e => setReceiptForm({ ...receiptForm, ttNumber: e.target.value })}
                    required
                    className="w-full bg-slate-800 text-white rounded-lg p-2.5 border border-slate-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Invoice Number</label>
                  <input
                    type="text"
                    placeholder="e.g. INV-2026-001"
                    value={receiptForm.invoiceNumber}
                    onChange={e => setReceiptForm({ ...receiptForm, invoiceNumber: e.target.value })}
                    required
                    className="w-full bg-slate-800 text-white rounded-lg p-2.5 border border-slate-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Invoice Date</label>
                  <input
                    type="date"
                    value={receiptForm.invoiceDate}
                    onChange={e => setReceiptForm({ ...receiptForm, invoiceDate: e.target.value })}
                    required
                    className="w-full bg-slate-800 text-white rounded-lg p-2.5 border border-slate-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Arrival Time</label>
                  <input
                    type="datetime-local"
                    value={receiptForm.arrivalTime}
                    onChange={e => setReceiptForm({ ...receiptForm, arrivalTime: e.target.value })}
                    required
                    className="w-full bg-slate-800 text-white rounded-lg p-2.5 border border-slate-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-400 uppercase mb-1">Receiving Tank</label>
                <select
                  value={receiptForm.lineTankId}
                  onChange={e => setReceiptForm({ ...receiptForm, lineTankId: e.target.value })}
                  required
                  className="w-full bg-slate-800 text-white rounded-lg p-2.5 border border-slate-700 focus:outline-none"
                >
                  <option value="">Select Tank</option>
                  {tankSnapshots.map(t => (
                    <option key={t.tankId} value={t.tankId}>
                      Tank #{t.tankNumber} ({t.productCode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 font-mono">
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Invoice Qty (L)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 12000.000"
                    value={receiptForm.invoiceQuantity}
                    onChange={e => setReceiptForm({ ...receiptForm, invoiceQuantity: e.target.value })}
                    required
                    className="w-full bg-slate-800 text-white rounded-lg p-2.5 border border-slate-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Observed Density</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 745.200"
                    value={receiptForm.density}
                    onChange={e => setReceiptForm({ ...receiptForm, density: e.target.value })}
                    className="w-full bg-slate-800 text-white rounded-lg p-2.5 border border-slate-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 font-mono">
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Invoice Density</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 744.000"
                    value={receiptForm.invoiceDensity}
                    onChange={e => setReceiptForm({ ...receiptForm, invoiceDensity: e.target.value })}
                    className="w-full bg-slate-800 text-white rounded-lg p-2.5 border border-slate-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Temperature (°C)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 29.500"
                    value={receiptForm.temperature}
                    onChange={e => setReceiptForm({ ...receiptForm, temperature: e.target.value })}
                    className="w-full bg-slate-800 text-white rounded-lg p-2.5 border border-slate-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={receiptSubmitting}
                  onClick={() => setShowReceiptModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={receiptSubmitting}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg shadow-lg shadow-orange-500/20 disabled:opacity-50"
                >
                  {receiptSubmitting ? 'Saving...' : 'Save Receipt Header'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockOperationsPage;
