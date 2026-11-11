import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  DailyOperationsBootstrapResponse,
  DailyFuelSummary,
  DailyOperationsShiftWorkspace,
  DailyOperationsTankEntryRow,
  DailyOperationsNozzleEntryRow,
  TankStockReading,
  NozzleMeterReading,
} from '../../shared/types';
import {
  apiFetch,
  fetchDailyOperationsBootstrap,
  fetchDailyFuelSummary,
  saveMeterReadingsBatch,
  saveTankReadingsBatch,
} from '../services/api';
import { useActiveOutlet } from '../context/ActiveOutletContext';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../../shared/constants';
import { DailyOperationsTestDataResetPanel } from '../components/pump/DailyOperationsTestDataResetPanel';
import './dailyOperationsModern.css';
import { parseMilliunits, formatMilliunits } from '../../shared/precision';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Fuel,
  Gauge,
  Save,
  RefreshCw,
  Plus,
  FileSpreadsheet,
  Layers,
  Calculator,
  Lock,
  ArrowRight,
} from 'lucide-react';

export const DEFAULT_NOZZLE_TESTING_QUANTITY_LITRES = '5.000';
export const ZERO_NOZZLE_TESTING_QUANTITY_LITRES = '0.000';

export interface TankDraftRow {
  openingDipMm: string;
  openingWaterDipMm: string;
  closingDipMm: string;
  closingWaterDipMm: string;
  saveStatus: 'IDLE' | 'SAVED' | 'DIRTY' | 'SAVING' | 'ERROR';
  errorMessage: string | null;
}

export interface NozzleDraftRow {
  openingTotalizer: string;
  closingTotalizer: string;
  testingQuantity: string;
  varianceReason: string;
  saveStatus: 'IDLE' | 'SAVED' | 'DIRTY' | 'SAVING' | 'ERROR';
  errorMessage: string | null;
  isTestingDefaultPrefilled: boolean;
  testingConfirmed: boolean;
}

export interface UnconfirmedNozzleTestingItem {
  nozzleId: string;
  nozzleNumber: number;
  dispenserNumber: number;
  productCode: string;
  testingQuantity: string;
}

interface PendingTestingConfirmationState {
  mode: 'SINGLE' | 'BATCH';
  shiftId: string;
  singleNozzle?: DailyOperationsNozzleEntryRow;
  unconfirmedNozzles: UnconfirmedNozzleTestingItem[];
}

export function createInitialNozzleDraftRow(
  nozzle: DailyOperationsNozzleEntryRow,
  shiftStatus: DailyOperationsShiftWorkspace['shift']['status'] = 'OPEN'
): NozzleDraftRow {
  if (nozzle.reading) {
    return {
      openingTotalizer: nozzle.reading.openingTotalizerStr || ZERO_NOZZLE_TESTING_QUANTITY_LITRES,
      closingTotalizer: nozzle.reading.closingTotalizerStr || '',
      testingQuantity: nozzle.reading.testingQuantityStr || ZERO_NOZZLE_TESTING_QUANTITY_LITRES,
      varianceReason: nozzle.reading.varianceReason || '',
      saveStatus: 'SAVED',
      errorMessage: null,
      isTestingDefaultPrefilled: false,
      testingConfirmed: true,
    };
  }

  const shouldPrefillFiveLitres = shiftStatus === 'OPEN' && !nozzle.unavailability;
  return {
    openingTotalizer: nozzle.suggestedOpeningTotalizer || ZERO_NOZZLE_TESTING_QUANTITY_LITRES,
    closingTotalizer: '',
    testingQuantity: shouldPrefillFiveLitres
      ? DEFAULT_NOZZLE_TESTING_QUANTITY_LITRES
      : ZERO_NOZZLE_TESTING_QUANTITY_LITRES,
    varianceReason: '',
    saveStatus: 'IDLE',
    errorMessage: null,
    isTestingDefaultPrefilled: shouldPrefillFiveLitres,
    testingConfirmed: !shouldPrefillFiveLitres,
  };
}

export function buildInitialNozzleDraftsMap(
  shifts: DailyOperationsShiftWorkspace[],
  existingDrafts?: Record<string, NozzleDraftRow>
): Record<string, NozzleDraftRow> {
  const nextNozzleDrafts: Record<string, NozzleDraftRow> = {};

  for (const ws of shifts) {
    const sId = ws.shift.id;
    for (const n of ws.nozzles) {
      const key = `${sId}:${n.nozzleId}`;
      if (n.reading) {
        // Never overwrite previously saved readings or actual saved testing quantities
        nextNozzleDrafts[key] = createInitialNozzleDraftRow(n, ws.shift.status);
      } else {
        const existing = existingDrafts?.[key];
        if (
          existing &&
          existing.saveStatus !== 'SAVED' &&
          (existing.saveStatus === 'DIRTY' || existing.testingConfirmed)
        ) {
          nextNozzleDrafts[key] = existing;
        } else {
          nextNozzleDrafts[key] = createInitialNozzleDraftRow(n, ws.shift.status);
        }
      }
    }
  }

  return nextNozzleDrafts;
}

export function updateNozzleDraftTestingQuantity(
  draft: NozzleDraftRow,
  newTestingQuantity: string
): NozzleDraftRow {
  const trimmed = newTestingQuantity.trim();
  let isZero = false;
  let isDefaultFiveLitres = false;

  try {
    const milli = parseMilliunits(trimmed || ZERO_NOZZLE_TESTING_QUANTITY_LITRES);
    isZero = milli === 0;
    isDefaultFiveLitres = milli === 5000;
  } catch {
    isZero = false;
    isDefaultFiveLitres = trimmed === DEFAULT_NOZZLE_TESTING_QUANTITY_LITRES;
  }

  if (isZero) {
    return {
      ...draft,
      testingQuantity: newTestingQuantity,
      saveStatus: 'DIRTY',
      errorMessage: null,
      isTestingDefaultPrefilled: false,
      testingConfirmed: true,
    };
  }

  // If the value was prefilled as 5.000 and remains 5.000, keep prefilled state until confirmed.
  // If the operator manually enters a custom nonzero testing quantity (e.g., 2.500 or 10.000),
  // treat that explicit operator input as confirmed.
  const keepPrefilledState = draft.isTestingDefaultPrefilled && isDefaultFiveLitres;
  return {
    ...draft,
    testingQuantity: newTestingQuantity,
    saveStatus: 'DIRTY',
    errorMessage: null,
    isTestingDefaultPrefilled: keepPrefilledState,
    testingConfirmed: keepPrefilledState ? draft.testingConfirmed : true,
  };
}

export function confirmNozzleDraftTesting(draft: NozzleDraftRow): NozzleDraftRow {
  return {
    ...draft,
    testingConfirmed: true,
    errorMessage: null,
  };
}

export function requiresNozzleTestingConfirmation(
  draft: NozzleDraftRow,
  nozzle?: DailyOperationsNozzleEntryRow
): boolean {
  if (nozzle?.unavailability) return false;
  if (nozzle?.reading && draft.saveStatus === 'SAVED') return false;

  let testingMilli = 0;
  try {
    testingMilli = parseMilliunits(draft.testingQuantity.trim() || ZERO_NOZZLE_TESTING_QUANTITY_LITRES);
  } catch {
    return false;
  }

  if (testingMilli <= 0) return false;
  return Boolean(draft.isTestingDefaultPrefilled && !draft.testingConfirmed);
}

export function evaluateNozzleSaveGuard(
  items: Array<{ nozzle: DailyOperationsNozzleEntryRow; draft: NozzleDraftRow }>
): {
  canProceedImmediately: boolean;
  unconfirmedNozzles: UnconfirmedNozzleTestingItem[];
} {
  const unconfirmedNozzles: UnconfirmedNozzleTestingItem[] = [];

  for (const { nozzle, draft } of items) {
    if (nozzle.unavailability) continue;
    if (!draft.openingTotalizer.trim() || !draft.closingTotalizer.trim()) continue;
    if (requiresNozzleTestingConfirmation(draft, nozzle)) {
      unconfirmedNozzles.push({
        nozzleId: nozzle.nozzleId,
        nozzleNumber: nozzle.nozzleNumber,
        dispenserNumber: nozzle.dispenserNumber,
        productCode: nozzle.productCode,
        testingQuantity: draft.testingQuantity.trim() || DEFAULT_NOZZLE_TESTING_QUANTITY_LITRES,
      });
    }
  }

  return {
    canProceedImmediately: unconfirmedNozzles.length === 0,
    unconfirmedNozzles,
  };
}

export function computeNozzlePreviewSales(
  openingTotalizer: string,
  closingTotalizer: string,
  testingQuantity: string,
  savedReading?: NozzleMeterReading | null
): { grossSalesStr: string; netSalesStr: string } {
  let displayGrossStr: string = savedReading
    ? savedReading.grossSalesQuantityStr || ZERO_NOZZLE_TESTING_QUANTITY_LITRES
    : '—';
  let displayNetStr: string = savedReading
    ? savedReading.netSalesQuantityStr || ZERO_NOZZLE_TESTING_QUANTITY_LITRES
    : '—';

  if (openingTotalizer && closingTotalizer) {
    try {
      const op = parseMilliunits(openingTotalizer);
      const cl = parseMilliunits(closingTotalizer);
      const tst = parseMilliunits(testingQuantity || ZERO_NOZZLE_TESTING_QUANTITY_LITRES);
      if (cl >= op && tst <= cl - op) {
        displayGrossStr = formatMilliunits(cl - op);
        displayNetStr = formatMilliunits(cl - op - tst);
      }
    } catch {
      // keep existing display
    }
  }

  return { grossSalesStr: displayGrossStr, netSalesStr: displayNetStr };
}

function getLocalTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const DailyOperationsPage: React.FC = () => {
  const { userCtx, hasPermission } = useAuth();
  const canRecordUnavailability = hasPermission(PERMISSIONS.METER_READINGS_WRITE);
  const isGlobalAdmin = Boolean(userCtx?.roles?.includes('ADMIN') && userCtx?.isGlobalScope);
  const {
    accessibleOutlets: outlets,
    activeOutletId,
    setActiveOutletId: setSelectedOutletId,
    activeOutlet: selectedOutlet,
  } = useActiveOutlet();
  const selectedOutletId = activeOutletId || '';
  const [businessDate, setBusinessDate] = useState<string>(getLocalTodayIso);
  const [viewMode, setViewMode] = useState<'WORKSPACE' | 'DSR'>('WORKSPACE');

  const [bootstrap, setBootstrap] = useState<DailyOperationsBootstrapResponse | null>(null);
  const [dailySummary, setDailySummary] = useState<DailyFuelSummary | null>(null);
  const [activeShiftId, setActiveShiftId] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState<boolean>(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Open Shift form state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [openingShift, setOpeningShift] = useState<boolean>(false);
  const [newShiftNotes, setNewShiftNotes] = useState('');
  const [unavailableNozzle, setUnavailableNozzle] = useState<DailyOperationsNozzleEntryRow | null>(null);
  const [unavailableReason, setUnavailableReason] = useState('');
  const [savingUnavailable, setSavingUnavailable] = useState(false);

  // Bulk save states
  const [savingAllTanks, setSavingAllTanks] = useState<boolean>(false);
  const [savingAllNozzles, setSavingAllNozzles] = useState<boolean>(false);
  const [runningReconciliation, setRunningReconciliation] = useState<boolean>(false);
  const [closingShiftBusy, setClosingShiftBusy] = useState<boolean>(false);
  const [adminEmptyCloseOpen, setAdminEmptyCloseOpen] = useState(false);
  const [adminEmptyCloseReason, setAdminEmptyCloseReason] = useState('');
  const [adminEmptyCloseConfirmed, setAdminEmptyCloseConfirmed] = useState(false);

  // Per-row local draft maps keyed by `${shiftId}:${tankId}` and `${shiftId}:${nozzleId}`
  const [tankDrafts, setTankDrafts] = useState<Record<string, TankDraftRow>>({});
  const [nozzleDrafts, setNozzleDrafts] = useState<Record<string, NozzleDraftRow>>({});
  const [pendingTestingConfirm, setPendingTestingConfirm] =
    useState<PendingTestingConfirmationState | null>(null);

  // Refs for keyboard Enter/Tab navigation
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const hydrateDraftsFromWorkspaces = useCallback((shifts: DailyOperationsShiftWorkspace[]) => {
    const nextTankDrafts: Record<string, TankDraftRow> = {};

    for (const ws of shifts) {
      const sId = ws.shift.id;
      for (const t of ws.tanks) {
        const key = `${sId}:${t.tankId}`;
        nextTankDrafts[key] = {
          openingDipMm: t.openingReading
            ? t.openingReading.productDipMmStr || ''
            : t.suggestedOpeningDipMm || '',
          openingWaterDipMm: t.openingReading
            ? t.openingReading.waterDipMmStr || '0.000'
            : '0.000',
          closingDipMm: t.closingReading ? t.closingReading.productDipMmStr || '' : '',
          closingWaterDipMm: t.closingReading
            ? t.closingReading.waterDipMmStr || '0.000'
            : '0.000',
          saveStatus: t.openingReading || t.closingReading ? 'SAVED' : 'IDLE',
          errorMessage: null,
        };
      }
    }

    setTankDrafts(nextTankDrafts);
    setNozzleDrafts((prev) => buildInitialNozzleDraftsMap(shifts, prev));
  }, []);

  const loadBootstrap = useCallback(
    async (outletId: string, date: string, preserveActiveShift = false) => {
      if (!outletId || !date) return;
      setLoading(true);
      setPageError(null);
      try {
        const res = await fetchDailyOperationsBootstrap(outletId, date);
        if (!res.success || !res.data) {
          setPageError(res.error?.message || 'Failed to load daily operations');
          setLoading(false);
          return;
        }
        const data = res.data;
        setBootstrap(data);
        setDailySummary(data.dailySummary);
        hydrateDraftsFromWorkspaces(data.shifts);

        if (data.shiftTemplates.length > 0 && !selectedTemplateId) {
          setSelectedTemplateId(data.shiftTemplates[0].id);
        }

        if (data.shifts.length > 0) {
          if (preserveActiveShift && data.shifts.some((s) => s.shift.id === activeShiftId)) {
            // keep current activeShiftId
          } else {
            const openShift = data.shifts.find((s) => s.shift.status === 'OPEN');
            setActiveShiftId(openShift ? openShift.shift.id : data.shifts[data.shifts.length - 1].shift.id);
          }
        } else {
          setActiveShiftId('');
        }
      } catch (err: any) {
        setPageError(err.message || 'Unexpected error loading daily operations');
      } finally {
        setLoading(false);
      }
    },
    [activeShiftId, hydrateDraftsFromWorkspaces, selectedTemplateId]
  );

  // Background revalidation of summary only (no full page reload)
  const revalidateSummaryInBackground = useCallback(async () => {
    if (!selectedOutletId || !businessDate) return;
    setBackgroundRefreshing(true);
    try {
      const res = await fetchDailyFuelSummary(selectedOutletId, businessDate);
      if (res.success && res.data) {
        setDailySummary(res.data);
      }
    } finally {
      setBackgroundRefreshing(false);
    }
  }, [selectedOutletId, businessDate]);

  useEffect(() => {
    if (selectedOutletId && businessDate) {
      loadBootstrap(selectedOutletId, businessDate, false);
    }
  }, [selectedOutletId, businessDate]);

  useEffect(() => {
    if (!selectedOutletId || !businessDate || typeof window === 'undefined') return;
    const handleCalibrationUpdated = () => {
      loadBootstrap(selectedOutletId, businessDate, true);
    };
    window.addEventListener('iocl:tank-calibration-updated', handleCalibrationUpdated);
    return () => {
      window.removeEventListener('iocl:tank-calibration-updated', handleCalibrationUpdated);
    };
  }, [selectedOutletId, businessDate, loadBootstrap]);

  const activeWorkspace: DailyOperationsShiftWorkspace | null =
    bootstrap?.shifts.find((s) => s.shift.id === activeShiftId) ||
    (bootstrap?.shifts && bootstrap.shifts.length > 0 ? bootstrap.shifts[0] : null);

  const isShiftReadOnly =
    !activeWorkspace ||
    activeWorkspace.shift.status === 'CLOSED' ||
    activeWorkspace.shift.status === 'LOCKED';

  const handleOpenShift = async () => {
    if (!selectedOutletId || !selectedTemplateId || !businessDate) return;
    setOpeningShift(true);
    setPageError(null);
    setActionSuccess(null);

    const res = await apiFetch(`/api/v1/outlets/${selectedOutletId}/shifts/open`, {
      method: 'POST',
      body: JSON.stringify({
        shiftTemplateId: selectedTemplateId,
        businessDate,
        notes: newShiftNotes.trim() || null,
      }),
    });

    setOpeningShift(false);
    if (!res.success) {
      setPageError(res.error?.message || 'Failed to open shift');
      return;
    }

    setNewShiftNotes('');
    setActionSuccess('Operational shift opened with active tank and nozzle snapshots.');
    await loadBootstrap(selectedOutletId, businessDate, false);
  };

  // The old Shift Operations screen allowed operators to mark a nozzle unavailable.
  // Keep that operational capability in this unified Daily Operations workspace.
  const handleRecordUnavailability = async () => {
    if (!canRecordUnavailability || !activeWorkspace || activeWorkspace.shift.status !== 'OPEN' ||
        !unavailableNozzle || unavailableReason.trim().length < 3 || savingUnavailable) return;
    setSavingUnavailable(true);
    setPageError(null);
    setActionSuccess(null);
    try {
      const res = await apiFetch(`/api/v1/shifts/${activeWorkspace.shift.id}/nozzle-unavailability`, {
        method: 'POST',
        body: JSON.stringify({
          nozzleId: unavailableNozzle.nozzleId,
          reason: unavailableReason.trim(),
        }),
      });
      if (!res.success) {
        setPageError(res.error?.message || 'Could not mark nozzle unavailable.');
        return;
      }
      setUnavailableNozzle(null);
      setUnavailableReason('');
      setActionSuccess('Nozzle marked unavailable for this shift.');
      await loadBootstrap(selectedOutletId, businessDate, true);
    } catch (error: any) {
      setPageError(error?.message || 'Could not mark nozzle unavailable.');
    } finally {
      setSavingUnavailable(false);
    }
  };

  // Update local tank row after successful save without reloading page
  const applySavedTankReadingsLocally = (
    shiftId: string,
    tankId: string,
    savedReadings: TankStockReading[]
  ) => {
    setBootstrap((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        shifts: prev.shifts.map((ws) => {
          if (ws.shift.id !== shiftId) return ws;
          return {
            ...ws,
            tanks: ws.tanks.map((t) => {
              if (t.tankId !== tankId) return t;
              const openRd =
                savedReadings.find((r) => r.tankId === tankId && r.readingType === 'OPENING') ||
                t.openingReading;
              const closeRd =
                savedReadings.find((r) => r.tankId === tankId && r.readingType === 'CLOSING') ||
                t.closingReading;
              return {
                ...t,
                openingReading: openRd || null,
                closingReading: closeRd || null,
              };
            }),
          };
        }),
      };
    });
  };

  const handleSaveSingleTankRow = async (tankRow: DailyOperationsTankEntryRow) => {
    if (!activeWorkspace || isShiftReadOnly) return;
    const shiftId = activeWorkspace.shift.id;
    const key = `${shiftId}:${tankRow.tankId}`;
    const draft = tankDrafts[key];
    if (!draft) return;

    const batchPayload: Array<{
      tankId: string;
      readingType: 'OPENING' | 'CLOSING';
      source: 'MANUAL';
      productDipMm: string;
      waterDipMm: string;
    }> = [];

    if (draft.openingDipMm.trim() !== '') {
      batchPayload.push({
        tankId: tankRow.tankId,
        readingType: 'OPENING',
        source: 'MANUAL',
        productDipMm: draft.openingDipMm.trim(),
        waterDipMm: draft.openingWaterDipMm.trim() || '0.000',
      });
    }
    if (draft.closingDipMm.trim() !== '') {
      batchPayload.push({
        tankId: tankRow.tankId,
        readingType: 'CLOSING',
        source: 'MANUAL',
        productDipMm: draft.closingDipMm.trim(),
        waterDipMm: draft.closingWaterDipMm.trim() || '0.000',
      });
    }

    if (batchPayload.length === 0) {
      setTankDrafts((prev) => ({
        ...prev,
        [key]: { ...prev[key], saveStatus: 'ERROR', errorMessage: 'Enter Opening or Closing dip (mm)' },
      }));
      return;
    }

    setTankDrafts((prev) => ({
      ...prev,
      [key]: { ...prev[key], saveStatus: 'SAVING', errorMessage: null },
    }));

    const res = await saveTankReadingsBatch(shiftId, batchPayload);
    if (!res.success || !res.data) {
      setTankDrafts((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          saveStatus: 'ERROR',
          errorMessage: res.error?.message || 'Failed to save tank dip reading',
        },
      }));
      return;
    }

    applySavedTankReadingsLocally(shiftId, tankRow.tankId, res.data.readings);
    setTankDrafts((prev) => ({
      ...prev,
      [key]: { ...prev[key], saveStatus: 'SAVED', errorMessage: null },
    }));
    await revalidateSummaryInBackground();
  };

  const handleSaveAllTanks = async () => {
    if (!activeWorkspace || isShiftReadOnly) return;
    const shiftId = activeWorkspace.shift.id;
    const batchPayload: Array<{
      tankId: string;
      readingType: 'OPENING' | 'CLOSING';
      source: 'MANUAL';
      productDipMm: string;
      waterDipMm: string;
    }> = [];

    for (const t of activeWorkspace.tanks) {
      if (!t.hasCalibrationChart) continue;
      const key = `${shiftId}:${t.tankId}`;
      const draft = tankDrafts[key];
      if (!draft) continue;
      if (draft.openingDipMm.trim() !== '') {
        batchPayload.push({
          tankId: t.tankId,
          readingType: 'OPENING',
          source: 'MANUAL',
          productDipMm: draft.openingDipMm.trim(),
          waterDipMm: draft.openingWaterDipMm.trim() || '0.000',
        });
      }
      if (draft.closingDipMm.trim() !== '') {
        batchPayload.push({
          tankId: t.tankId,
          readingType: 'CLOSING',
          source: 'MANUAL',
          productDipMm: draft.closingDipMm.trim(),
          waterDipMm: draft.closingWaterDipMm.trim() || '0.000',
        });
      }
    }

    if (batchPayload.length === 0) {
      setPageError('Please enter at least one tank dip reading before saving.');
      return;
    }

    setSavingAllTanks(true);
    setPageError(null);
    setActionSuccess(null);

    const res = await saveTankReadingsBatch(shiftId, batchPayload);
    setSavingAllTanks(false);

    if (!res.success || !res.data) {
      setPageError(res.error?.message || 'Failed to batch save tank readings');
      return;
    }

    const savedReadings = res.data.readings;
    setBootstrap((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        shifts: prev.shifts.map((ws) => {
          if (ws.shift.id !== shiftId) return ws;
          return {
            ...ws,
            tanks: ws.tanks.map((t) => {
              const openRd =
                savedReadings.find((r) => r.tankId === t.tankId && r.readingType === 'OPENING') ||
                t.openingReading;
              const closeRd =
                savedReadings.find((r) => r.tankId === t.tankId && r.readingType === 'CLOSING') ||
                t.closingReading;
              return {
                ...t,
                openingReading: openRd || null,
                closingReading: closeRd || null,
              };
            }),
          };
        }),
      };
    });

    setTankDrafts((prev) => {
      const next = { ...prev };
      for (const t of activeWorkspace.tanks) {
        const k = `${shiftId}:${t.tankId}`;
        if (
          next[k] &&
          savedReadings.some((r) => r.tankId === t.tankId)
        ) {
          next[k] = { ...next[k], saveStatus: 'SAVED', errorMessage: null };
        }
      }
      return next;
    });

    setActionSuccess(`Saved ${savedReadings.length} tank dip reading(s) via server calibration.`);
    await revalidateSummaryInBackground();
  };

  // Update local nozzle row after successful save without reloading page
  const applySavedNozzleReadingsLocally = (
    shiftId: string,
    savedReadings: NozzleMeterReading[]
  ) => {
    const readingMap = new Map(savedReadings.map((r) => [r.nozzleId, r]));
    setBootstrap((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        shifts: prev.shifts.map((ws) => {
          if (ws.shift.id !== shiftId) return ws;
          return {
            ...ws,
            nozzles: ws.nozzles.map((n) => {
              const updated = readingMap.get(n.nozzleId);
              if (!updated) return n;
              return {
                ...n,
                reading: updated,
                unavailability: null,
              };
            }),
          };
        }),
      };
    });
  };

  const handleSaveSingleNozzleRow = async (
    nozzleRow: DailyOperationsNozzleEntryRow,
    options?: { bypassTestingConfirm?: boolean; overrideTestingQuantity?: string }
  ) => {
    if (!activeWorkspace || isShiftReadOnly) return;
    const shiftId = activeWorkspace.shift.id;
    const key = `${shiftId}:${nozzleRow.nozzleId}`;
    const draft =
      nozzleDrafts[key] || createInitialNozzleDraftRow(nozzleRow, activeWorkspace.shift.status);
    if (!draft) return;

    if (!draft.openingTotalizer.trim() || !draft.closingTotalizer.trim()) {
      setNozzleDrafts((prev) => ({
        ...prev,
        [key]: {
          ...draft,
          saveStatus: 'ERROR',
          errorMessage: 'Opening and Closing totalizer are required',
        },
      }));
      return;
    }

    if (!options?.bypassTestingConfirm) {
      const guard = evaluateNozzleSaveGuard([{ nozzle: nozzleRow, draft }]);
      if (!guard.canProceedImmediately) {
        setPendingTestingConfirm({
          mode: 'SINGLE',
          shiftId,
          singleNozzle: nozzleRow,
          unconfirmedNozzles: guard.unconfirmedNozzles,
        });
        return;
      }
    }

    const effectiveTestingQty =
      (options?.overrideTestingQuantity ?? draft.testingQuantity.trim()) ||
      ZERO_NOZZLE_TESTING_QUANTITY_LITRES;

    setNozzleDrafts((prev) => ({
      ...prev,
      [key]: {
        ...draft,
        testingQuantity: effectiveTestingQty,
        testingConfirmed: true,
        saveStatus: 'SAVING',
        errorMessage: null,
      },
    }));

    const res = await apiFetch<NozzleMeterReading>(`/api/v1/shifts/${shiftId}/readings`, {
      method: 'POST',
      body: JSON.stringify({
        nozzleId: nozzleRow.nozzleId,
        openingTotalizer: draft.openingTotalizer.trim(),
        closingTotalizer: draft.closingTotalizer.trim(),
        testingQuantity: effectiveTestingQty,
        varianceReason: draft.varianceReason.trim() || null,
      }),
    });

    if (!res.success || !res.data) {
      setNozzleDrafts((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          saveStatus: 'ERROR',
          errorMessage: res.error?.message || 'Failed to save reading',
        },
      }));
      return;
    }

    const savedReading = res.data;
    applySavedNozzleReadingsLocally(shiftId, [savedReading]);
    setNozzleDrafts((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        testingQuantity: savedReading.testingQuantityStr || effectiveTestingQty,
        isTestingDefaultPrefilled: false,
        testingConfirmed: true,
        saveStatus: 'SAVED',
        errorMessage: null,
      },
    }));
    await revalidateSummaryInBackground();
  };

  const handleSaveAllNozzles = async (options?: {
    bypassTestingConfirm?: boolean;
    zeroUnconfirmedTesting?: boolean;
  }) => {
    if (!activeWorkspace || isShiftReadOnly) return;
    const shiftId = activeWorkspace.shift.id;

    const candidateItems: Array<{
      nozzle: DailyOperationsNozzleEntryRow;
      draft: NozzleDraftRow;
    }> = [];

    for (const n of activeWorkspace.nozzles) {
      if (n.unavailability) continue;
      const key = `${shiftId}:${n.nozzleId}`;
      const draft =
        nozzleDrafts[key] || createInitialNozzleDraftRow(n, activeWorkspace.shift.status);
      if (!draft) continue;
      if (draft.openingTotalizer.trim() !== '' && draft.closingTotalizer.trim() !== '') {
        candidateItems.push({ nozzle: n, draft });
      }
    }

    if (candidateItems.length === 0) {
      setPageError('Enter opening and closing totalizers for at least one nozzle before bulk saving.');
      return;
    }

    const guard = evaluateNozzleSaveGuard(candidateItems);
    if (!options?.bypassTestingConfirm && !guard.canProceedImmediately) {
      setPendingTestingConfirm({
        mode: 'BATCH',
        shiftId,
        unconfirmedNozzles: guard.unconfirmedNozzles,
      });
      return;
    }

    const unconfirmedIds = new Set(guard.unconfirmedNozzles.map((u) => u.nozzleId));
    const payload = candidateItems.map(({ nozzle, draft }) => {
      const useZero = options?.zeroUnconfirmedTesting && unconfirmedIds.has(nozzle.nozzleId);
      return {
        nozzleId: nozzle.nozzleId,
        openingTotalizer: draft.openingTotalizer.trim(),
        closingTotalizer: draft.closingTotalizer.trim(),
        testingQuantity: useZero
          ? ZERO_NOZZLE_TESTING_QUANTITY_LITRES
          : draft.testingQuantity.trim() || ZERO_NOZZLE_TESTING_QUANTITY_LITRES,
        varianceReason: draft.varianceReason.trim() || null,
      };
    });

    setSavingAllNozzles(true);
    setPageError(null);
    setActionSuccess(null);

    const res = await saveMeterReadingsBatch(shiftId, payload);
    setSavingAllNozzles(false);

    if (!res.success || !res.data) {
      setPageError(res.error?.message || 'Batch save failed');
      return;
    }

    const savedReadings = res.data.readings;
    applySavedNozzleReadingsLocally(shiftId, savedReadings);
    setNozzleDrafts((prev) => {
      const next = { ...prev };
      for (const r of savedReadings) {
        const k = `${shiftId}:${r.nozzleId}`;
        if (next[k]) {
          next[k] = {
            ...next[k],
            testingQuantity: r.testingQuantityStr || next[k].testingQuantity,
            isTestingDefaultPrefilled: false,
            testingConfirmed: true,
            saveStatus: 'SAVED',
            errorMessage: null,
          };
        }
      }
      return next;
    });

    setActionSuccess(`Saved ${savedReadings.length} nozzle meter reading(s) in batch.`);
    await revalidateSummaryInBackground();
  };

  const handleConfirmAllNozzleTestingInShift = () => {
    if (!activeWorkspace || isShiftReadOnly) return;
    const shiftId = activeWorkspace.shift.id;
    setNozzleDrafts((prev) => {
      const next = { ...prev };
      for (const n of activeWorkspace.nozzles) {
        if (n.unavailability) continue;
        const k = `${shiftId}:${n.nozzleId}`;
        const current =
          next[k] || createInitialNozzleDraftRow(n, activeWorkspace.shift.status);
        if (requiresNozzleTestingConfirmation(current, n)) {
          next[k] = confirmNozzleDraftTesting(current);
        }
      }
      return next;
    });
  };

  const handleConfirmPendingTestingAndSave = async () => {
    if (!pendingTestingConfirm) return;
    const pending = pendingTestingConfirm;
    setPendingTestingConfirm(null);

    if (pending.mode === 'SINGLE' && pending.singleNozzle) {
      const key = `${pending.shiftId}:${pending.singleNozzle.nozzleId}`;
      setNozzleDrafts((prev) => ({
        ...prev,
        [key]: prev[key] ? confirmNozzleDraftTesting(prev[key]) : prev[key],
      }));
      await handleSaveSingleNozzleRow(pending.singleNozzle, { bypassTestingConfirm: true });
      return;
    }

    if (pending.mode === 'BATCH') {
      const ids = new Set(pending.unconfirmedNozzles.map((u) => u.nozzleId));
      setNozzleDrafts((prev) => {
        const next = { ...prev };
        for (const nozzleId of ids) {
          const k = `${pending.shiftId}:${nozzleId}`;
          if (next[k]) {
            next[k] = confirmNozzleDraftTesting(next[k]);
          }
        }
        return next;
      });
      await handleSaveAllNozzles({ bypassTestingConfirm: true });
    }
  };

  const handleSavePendingWithZeroTesting = async () => {
    if (!pendingTestingConfirm) return;
    const pending = pendingTestingConfirm;
    setPendingTestingConfirm(null);

    if (pending.mode === 'SINGLE' && pending.singleNozzle) {
      const key = `${pending.shiftId}:${pending.singleNozzle.nozzleId}`;
      setNozzleDrafts((prev) => ({
        ...prev,
        [key]: prev[key]
          ? updateNozzleDraftTestingQuantity(prev[key], ZERO_NOZZLE_TESTING_QUANTITY_LITRES)
          : prev[key],
      }));
      await handleSaveSingleNozzleRow(pending.singleNozzle, {
        bypassTestingConfirm: true,
        overrideTestingQuantity: ZERO_NOZZLE_TESTING_QUANTITY_LITRES,
      });
      return;
    }

    if (pending.mode === 'BATCH') {
      const ids = new Set(pending.unconfirmedNozzles.map((u) => u.nozzleId));
      setNozzleDrafts((prev) => {
        const next = { ...prev };
        for (const nozzleId of ids) {
          const k = `${pending.shiftId}:${nozzleId}`;
          if (next[k]) {
            next[k] = updateNozzleDraftTestingQuantity(
              next[k],
              ZERO_NOZZLE_TESTING_QUANTITY_LITRES
            );
          }
        }
        return next;
      });
      await handleSaveAllNozzles({
        bypassTestingConfirm: true,
        zeroUnconfirmedTesting: true,
      });
    }
  };

  const handleComputeReconciliation = async () => {
    if (!activeWorkspace) return;
    setRunningReconciliation(true);
    setPageError(null);
    setActionSuccess(null);

    const res = await apiFetch(`/api/v1/shifts/${activeWorkspace.shift.id}/stock-reconciliation/compute`, {
      method: 'POST',
      body: JSON.stringify({}),
    });

    setRunningReconciliation(false);
    if (!res.success) {
      setPageError(res.error?.message || 'Could not compute stock reconciliation');
      return;
    }

    setActionSuccess('Shift stock reconciliation computed from authoritative tank & meter readings.');
    await loadBootstrap(selectedOutletId, businessDate, true);
  };

  const handleCloseShift = async () => {
    if (!activeWorkspace || activeWorkspace.shift.status !== 'OPEN') return;
    setClosingShiftBusy(true);
    setPageError(null);
    setActionSuccess(null);

    const res = await apiFetch(`/api/v1/shifts/${activeWorkspace.shift.id}/close`, {
      method: 'POST',
      body: JSON.stringify({ varianceReason: 'Standard daily shift close' }),
    });

    setClosingShiftBusy(false);
    if (!res.success) {
      setPageError(res.error?.message || 'Failed to close shift');
      return;
    }

    setActionSuccess('Operational shift closed and locked.');
    await loadBootstrap(selectedOutletId, businessDate, true);
  };

  const handleAdminEmptyClose = async () => {
    if (!isGlobalAdmin || !activeWorkspace || activeWorkspace.shift.status !== 'OPEN' ||
        closingShiftBusy || adminEmptyCloseReason.trim().length < 10 || !adminEmptyCloseConfirmed) return;

    const targetShiftId = activeWorkspace.shift.id;
    setClosingShiftBusy(true);
    setPageError(null);
    setActionSuccess(null);
    try {
      const res = await apiFetch(`/api/v1/shifts/${targetShiftId}/close-empty`, {
        method: 'POST',
        body: JSON.stringify({ reason: adminEmptyCloseReason.trim(), confirm: true }),
      });

      if (!res.success) {
        setPageError(res.error?.message || 'Cannot close this shift: it may contain operational records.');
        return;
      }

      setAdminEmptyCloseOpen(false);
      setAdminEmptyCloseReason('');
      setAdminEmptyCloseConfirmed(false);
      setActionSuccess('Empty shift closed by Admin. No reconciliation or sales were generated.');
      await loadBootstrap(selectedOutletId, businessDate, true);
    } catch (error: any) {
      setPageError(error?.message || 'Admin empty-shift closure failed.');
    } finally {
      setClosingShiftBusy(false);
    }
  };

  const handleKeyDownOnInput = (
    e: React.KeyboardEvent<HTMLInputElement>,
    idx: number,
    onEnterSave?: () => void
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextInput = inputRefs.current[idx + 1];
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      }
      if (onEnterSave) {
        onEnterSave();
      }
    }
  };

  const statusBadgeConfig = (status: DailyFuelSummary['status']) => {
    switch (status) {
      case 'COMPLETE':
        return {
          label: 'COMPLETE',
          classes: 'bg-emerald-50 text-emerald-800 border-emerald-300',
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
        };
      case 'BLOCKED':
        return {
          label: 'BLOCKED',
          classes: 'bg-red-50 text-red-800 border-red-300',
          icon: <ShieldAlert className="w-4 h-4 text-red-600" />,
        };
      case 'IN_PROGRESS':
        return {
          label: 'IN PROGRESS',
          classes: 'bg-amber-50 text-amber-800 border-amber-300',
          icon: <Clock className="w-4 h-4 text-amber-600" />,
        };
      default:
        return {
          label: 'NOT STARTED',
          classes: 'bg-slate-100 text-slate-700 border-slate-300',
          icon: <Clock className="w-4 h-4 text-slate-500" />,
        };
    }
  };

  let inputRefCounter = 0;
  const registerInputRef = (el: HTMLInputElement | null) => {
    const idx = inputRefCounter++;
    inputRefs.current[idx] = el;
    return idx;
  };

  const summary = dailySummary;
  const badge = statusBadgeConfig(summary?.status || 'NOT_STARTED');

  // Presentation-only indicators: reuse existing authoritative completion fields.
  // They never gate, reorder, or change an operation.
  const progressStages = summary ? [
    {
      label: 'Shift',
      detail: summary.shiftsCount === 0 ? 'Not opened' : `${summary.shiftsCount} recorded`,
      complete: summary.shiftsCount > 0,
    },
    {
      label: 'Tank Opening',
      detail: `${summary.completion.openingTankReadings} / ${summary.completion.expectedTanks}`,
      complete: summary.completion.expectedTanks > 0 &&
        summary.completion.openingTankReadings >= summary.completion.expectedTanks,
    },
    {
      label: 'Nozzle Meters',
      detail: `${summary.completion.nozzleMeterReadings + summary.completion.unavailableNozzles} / ${summary.completion.expectedNozzles}`,
      complete: summary.completion.expectedNozzles > 0 &&
        summary.completion.nozzleMeterReadings + summary.completion.unavailableNozzles >= summary.completion.expectedNozzles,
    },
    {
      label: 'Receipts',
      detail: summary.completion.totalReceipts === 0
        ? 'None recorded'
        : `${summary.completion.completedReceipts} / ${summary.completion.totalReceipts}`,
      complete: summary.completion.totalReceipts > 0 &&
        summary.completion.pendingReceipts === 0,
    },
    {
      label: 'Tank Closing',
      detail: `${summary.completion.closingTankReadings} / ${summary.completion.expectedTanks}`,
      complete: summary.completion.expectedTanks > 0 &&
        summary.completion.closingTankReadings >= summary.completion.expectedTanks,
    },
    {
      label: 'Reconciliation',
      detail: summary.completion.reconciliationComplete ? 'Complete' : 'Pending',
      complete: summary.completion.reconciliationComplete,
    },
  ] : [];

  return (
    <div className="daily-ops-modern space-y-6 pb-12">
      {/* 1. TOP BAR: OUTLET, BUSINESS DATE & VIEW SWITCHER */}
      <div className="space-y-3">
        <div className="option4-hero p-5 sm:p-7">
          <img className="option4-station-art" src="/option4-fuel-station.svg" alt="" aria-hidden="true" />
          <div className="option4-hero-content max-w-2xl">
            <span className="option4-eyebrow">Daily operations / Daily Sales Report</span>
            <div className="flex items-center gap-2.5">
              <Fuel className="w-6 h-6 text-[#003366]" />
              <h1 className="text-xl font-bold text-slate-900">
                Daily Operations &amp; DSR
              </h1>
              {backgroundRefreshing && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Syncing
                </span>
              )}
            </div>
            <p className="text-sm text-slate-600 mt-1">
              Manage tank dips, nozzle readings, stock reconciliation and the Daily Sales Report in one workspace.
            </p>
          </div>
        </div>

        <div className="option4-panel p-4 sm:p-5">
          <div className="flex flex-wrap items-end gap-3">
            {/* Outlet selector */}
            <div className="flex flex-col">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Retail Outlet
              </label>
              <select
                value={selectedOutletId}
                onChange={(e) => setSelectedOutletId(e.target.value)}
                className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#003366] disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
              >
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.roCode} — {o.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Business Date */}
            <div className="flex flex-col">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Business Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={businessDate}
                  onChange={(e) => setBusinessDate(e.target.value)}
                  className="h-9 pl-3 pr-3 rounded-lg border border-slate-300 bg-white text-sm font-mono font-medium text-slate-900 caret-slate-900 focus:outline-none focus:ring-2 focus:ring-[#003366] disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* Mode Switcher */}
            <div className="flex flex-col">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                View Mode
              </label>
              <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 h-9">
                <button
                  type="button"
                  onClick={() => setViewMode('WORKSPACE')}
                  className={`px-3 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                    viewMode === 'WORKSPACE'
                      ? 'bg-[#003366] text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <Gauge className="w-3.5 h-3.5" />
                  Daily Entry
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('DSR')}
                  className={`px-3 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                    viewMode === 'DSR'
                      ? 'bg-[#003366] text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  DSR Summary
                </button>
              </div>
            </div>

            <div className="flex flex-col">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-transparent mb-1">
                Refresh
              </label>
              <button
                type="button"
                onClick={() => loadBootstrap(selectedOutletId, businessDate, true)}
                disabled={loading}
                className="h-9 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. DAILY STATUS HEADER */}
      {summary && (
        <div className="option4-panel p-5 sm:p-6 space-y-4">
          <div className="grid gap-4 border-b border-slate-100 pb-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,auto)] xl:items-start">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Overall Day Status:
              </span>
              <span
                data-testid="daily-overall-status"
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold border ${badge.classes}`}
              >
                {badge.icon}
                {badge.label}
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {selectedOutlet?.roCode} • {businessDate} • {summary.shiftsCount} Shift(s)
              </span>
            </div>

            {/* Shift selector / Open Shift bar */}
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3">
              {bootstrap && bootstrap.shiftTemplates.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#003366] disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    {bootstrap.shiftTemplates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.code} — {tpl.name} ({tpl.startTime}–{tpl.endTime})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleOpenShift}
                    disabled={openingShift}
                    className="h-8 px-3 rounded-lg bg-[#003366] hover:bg-[#002244] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {openingShift ? 'Opening...' : 'Open Shift'}
                  </button>
                </div>
              )}
            </div>
            {bootstrap && bootstrap.shiftTemplates.length > 0 && (
              <div className="xl:col-span-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3">
                <label htmlFor="shift-opening-notes" className="block text-xs font-semibold text-slate-700 mb-1">
                  Optional shift opening notes
                </label>
                <textarea
                  id="shift-opening-notes"
                  value={newShiftNotes}
                  onChange={e => setNewShiftNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional context for the shift (saved when opening)"
                  className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900"
                />
              </div>
            )}
          </div>

          {/* Read-only completion overview; existing data-entry workflow remains unchanged. */}
          <section aria-label="Daily operations progress" className="option4-progress p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-[#17365D]">Daily workflow progress</h2>
                <p className="text-xs text-[#64748B]">Live status from saved operational records — not a required step sequence</p>
              </div>
              <span className="rounded-full border border-[#C6D8FF] bg-white px-3 py-1 text-xs font-bold text-[#2354C6]">
                {progressStages.filter(step => step.complete).length} of {progressStages.length} indicators complete
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {progressStages.map((step, index) => (
                <div key={step.label} data-tone={["orange","blue","purple","green","blue","purple"][index]}
                  className={`option4-step daily-ops-step rounded-xl border p-4 transition-colors ${
                  step.complete ? 'border-emerald-200 bg-white' : 'border-slate-200 bg-white'
                }`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    {step.complete
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-label="Complete" />
                      : <Clock className="h-4 w-4 text-amber-700" aria-label="Not complete" />}
                  </div>
                  <div className="mt-2 text-xs font-semibold text-[#17365D]">{step.label}</div>
                  <div className="mt-1 text-xs tabular-nums text-[#526477]">{step.detail}</div>
                </div>
              ))}
            </div>
          </section>

          {/* The progress strip above is the single source of status presentation.
              Avoid repeating the six indicators in a second grid. */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#DCE6F1] bg-white px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-[#526477]">
              <Clock className="h-4 w-4 text-[#F47721]" />
              <span>{summary.shiftsCount === 0 ? 'No shift started for this date' :
                summary.shifts.every(shift => shift.status === 'CLOSED') ? 'All recorded shifts are closed' :
                `${summary.shifts.filter(shift => shift.status === 'OPEN').length} shift(s) currently open`}</span>
            </div>
            <span className="text-xs text-[#64748B]">Choose a shift below to view or enter operational data</span>
          </div>

          {/* Missing-data warnings */}
          {summary.missingFields.length > 0 && (
            <details open className="group rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
              <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-md text-amber-900 focus-visible:outline-2 focus-visible:outline-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
                <span className="flex-1 text-xs font-bold">Missing Data &amp; Completion Warnings ({summary.missingFields.length})</span>
                <span className="text-xs font-medium text-amber-800 group-open:hidden">Show details +</span>
                <span className="hidden text-xs font-medium text-amber-800 group-open:inline">Hide details −</span>
              </summary>
              <div className="mt-3 pl-0 sm:pl-6">
                  <div className="flex flex-wrap gap-1.5">
                    {summary.missingFields.map((mf, i) => (
                      <span
                        key={i}
                        className={`text-xs px-2 py-0.5 rounded border font-medium ${
                          mf.includes('TANK CALIBRATION REQUIRED')
                            ? 'bg-red-100 text-red-900 border-red-300 font-bold'
                            : 'bg-white text-amber-900 border-amber-200'
                        }`}
                      >
                        {mf}
                      </span>
                    ))}
                  </div>
              </div>
            </details>
          )}
        </div>
      )}

      {pageError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800 flex items-center justify-between">
          <span>{pageError}</span>
          <button
            type="button"
            onClick={() => setPageError(null)}
            className="text-xs font-bold uppercase text-red-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800 flex items-center justify-between">
          <span>{actionSuccess}</span>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-xs font-bold uppercase text-emerald-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* VIEW MODE 1: DAILY ENTRY WORKSPACE */}
      {viewMode === 'WORKSPACE' && (
        <>
          {/* Multi-shift selector tabs */}
          {bootstrap && bootstrap.shifts.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mr-1">
                  Shifts on {businessDate}:
                </span>
                {bootstrap.shifts.map((ws, idx) => {
                  const isSelected = ws.shift.id === activeWorkspace?.shift.id;
                  return (
                    <button
                      key={ws.shift.id}
                      type="button"
                      onClick={() => setActiveShiftId(ws.shift.id)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-2 ${
                        isSelected
                          ? 'bg-[#003366] text-white border-[#003366]'
                          : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <span>
                        Shift #{idx + 1}: {ws.shiftTemplateName}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          ws.shift.status === 'OPEN'
                            ? isSelected
                              ? 'bg-emerald-500 text-white'
                              : 'bg-emerald-100 text-emerald-800'
                            : isSelected
                              ? 'bg-slate-600 text-white'
                              : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {ws.shift.status}
                      </span>
                    </button>
                  );
                })}
              </div>

              {activeWorkspace && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleComputeReconciliation}
                    disabled={runningReconciliation}
                    className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                    {runningReconciliation ? 'Computing...' : 'Compute Stock Reconciliation'}
                  </button>

                  {isGlobalAdmin && activeWorkspace.shift.status === 'OPEN' && (
                    <button
                      type="button"
                      data-testid="admin-close-empty-shift-btn"
                      onClick={() => {
                        setAdminEmptyCloseReason('');
                        setAdminEmptyCloseConfirmed(false);
                        setAdminEmptyCloseOpen(true);
                      }}
                      disabled={closingShiftBusy}
                      className="h-8 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      Admin: Close Empty Shift
                    </button>
                  )}

                  {activeWorkspace.shift.status === 'OPEN' && (
                    <button
                      type="button"
                      onClick={handleCloseShift}
                      disabled={closingShiftBusy}
                      className="h-8 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      {closingShiftBusy ? 'Closing...' : 'Finalize & Close Shift'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-xs">
              <Fuel className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <h3 className="text-base font-bold text-slate-900">
                Start by opening a shift for {businessDate}
              </h3>
              <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
                Choose a shift template in the panel above, then select <strong>Open Shift</strong>.
                After opening, enter tank and nozzle readings or view the day's report.
              </p>
            </div>
          )}

          {activeWorkspace && (
            <>
              <nav aria-label="Jump to daily entry task" className="rounded-2xl border border-[#DCE6F1] bg-white p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-[#17365D]">Choose the task you need</h2>
                    <p className="mt-1 text-xs text-[#64748B]">Jump to any section without changing the required workflow.</p>
                  </div>
                  <span className="rounded-lg bg-[#F1F5F9] px-2.5 py-1 text-xs font-medium text-[#526477]">
                    {activeWorkspace.shift.status === 'OPEN' ? 'Shift open' : 'Read-only shift'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: 'Tank readings', target: 'daily-tank-readings', subtitle: 'Opening & closing dips', icon: Layers },
                    { label: 'Nozzle readings', target: 'daily-nozzle-readings', subtitle: 'Meters & testing', icon: Gauge },
                    { label: 'Sales & stock', target: 'daily-sales-summary', subtitle: 'Totals & reconciliation', icon: Calculator },
                  ].map(task => {
                    const Icon = task.icon;
                    return <a key={task.target} href={`#${task.target}`} className="option4-action flex flex-col items-start gap-2 p-3 text-left transition focus-visible:outline-2 focus-visible:outline-[#2354C6]">
                      <Icon className="h-5 w-5 text-[#D86514]" />
                      <span className="text-xs font-bold text-[#17365D]">{task.label}</span>
                      <span className="text-[11px] leading-relaxed text-[#64748B]">{task.subtitle}</span>
                    </a>;
                  })}
                  <button type="button" onClick={() => setViewMode('DSR')} className="option4-action flex flex-col items-start gap-2 p-3 text-left transition focus-visible:outline-2 focus-visible:outline-[#2354C6]">
                    <FileSpreadsheet className="h-5 w-5 text-[#D86514]" />
                    <span className="text-xs font-bold text-[#17365D]">View DSR</span>
                    <span className="text-[11px] leading-relaxed text-[#64748B]">Daily Sales Report</span>
                  </button>
                </div>
              </nav>
              {/* 3. TANK DIP ENTRY GRID */}
              <div id="daily-tank-readings" className="scroll-mt-24 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-[#003366]" />
                      1. Tank Dip Entry Grid ({activeWorkspace.tanks.length} Active Tanks)
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">Enter opening and closing dip readings in millimetres. Stock volumes are calculated automatically.</p>
                    <details className="mt-2 text-xs text-slate-600">
                      <summary className="cursor-pointer font-medium text-[#17365D]">How are volumes calculated?</summary>
                      <p className="mt-1">The server uses the existing TankCalibrationService to calculate gross, water and net stock volumes.</p>
                    </details>
                  </div>

                  {!isShiftReadOnly && (
                    <button
                      type="button"
                      onClick={handleSaveAllTanks}
                      disabled={savingAllTanks}
                      className="h-9 px-4 rounded-lg bg-[#003366] hover:bg-[#002244] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {savingAllTanks ? 'Saving All Tank Dips...' : 'Save All Tank Dips'}
                    </button>
                  )}
                </div>

                <div className="daily-ops-table-scroll overflow-x-auto" role="region" aria-label="Scrollable operations table" tabIndex={0}>
                  <table className="daily-ops-data-table w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100/80 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                        <th className="py-2.5 px-3">Tank #</th>
                        <th className="py-2.5 px-3">Product</th>
                        <th className="py-2.5 px-3 text-right">Capacity (L)</th>
                        <th className="py-2.5 px-3">Opening Dip (mm)</th>
                        <th className="py-2.5 px-3">Water Dip (mm)</th>
                        <th className="py-2.5 px-3 text-right">Opening Volume (L)</th>
                        <th className="py-2.5 px-3">Closing Dip (mm)</th>
                        <th className="py-2.5 px-3">Closing Water (mm)</th>
                        <th className="py-2.5 px-3 text-right">Closing Volume (L)</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {activeWorkspace.tanks.map((tank) => {
                        const key = `${activeWorkspace.shift.id}:${tank.tankId}`;
                        const draft = tankDrafts[key] || {
                          openingDipMm: '',
                          openingWaterDipMm: '0.000',
                          closingDipMm: '',
                          closingWaterDipMm: '0.000',
                          saveStatus: 'IDLE',
                          errorMessage: null,
                        };

                        return (
                          <tr key={tank.tankId} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                              Tank #{tank.tankNumber}
                              <div className="text-[11px] font-sans font-normal text-slate-500">
                                {tank.tankName}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-900 border border-blue-200">
                                {tank.productCode}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                              {tank.capacityLitres}
                            </td>

                            {!tank.hasCalibrationChart ? (
                              <td colSpan={6} className="py-2.5 px-3">
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-red-50 border border-red-300 text-red-800 text-xs font-bold">
                                  <ShieldAlert className="w-4 h-4 text-red-600" />
                                  TANK CALIBRATION REQUIRED — Upload calibration chart before
                                  recording dips
                                </div>
                              </td>
                            ) : (
                              <>
                                {/* Opening Dip */}
                                <td className="py-2.5 px-3">
                                  <input
                                    ref={(el) => {
                                      registerInputRef(el);
                                    }}
                                    type="text"
                                    inputMode="decimal"
                                    disabled={isShiftReadOnly}
                                    placeholder="e.g. 1200.000"
                                    value={draft.openingDipMm}
                                    onChange={(e) =>
                                      setTankDrafts((prev) => ({
                                        ...prev,
                                        [key]: {
                                          ...draft,
                                          openingDipMm: e.target.value,
                                          saveStatus: 'DIRTY',
                                          errorMessage: null,
                                        },
                                      }))
                                    }
                                    onKeyDown={(e) => handleKeyDownOnInput(e, inputRefCounter - 1)}
                                    className="w-28 h-8 px-2 rounded border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 caret-slate-900 font-mono text-xs text-right focus:outline-none focus:ring-2 focus:ring-[#003366] disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                                  />
                                  {tank.suggestedOpeningDipMm && !tank.openingReading && (
                                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                      Prev: {tank.suggestedOpeningDipMm} mm
                                    </div>
                                  )}
                                </td>

                                {/* Opening Water Dip */}
                                <td className="py-2.5 px-3">
                                  <input
                                    ref={(el) => {
                                      registerInputRef(el);
                                    }}
                                    type="text"
                                    inputMode="decimal"
                                    disabled={isShiftReadOnly}
                                    value={draft.openingWaterDipMm}
                                    onChange={(e) =>
                                      setTankDrafts((prev) => ({
                                        ...prev,
                                        [key]: {
                                          ...draft,
                                          openingWaterDipMm: e.target.value,
                                          saveStatus: 'DIRTY',
                                          errorMessage: null,
                                        },
                                      }))
                                    }
                                    onKeyDown={(e) => handleKeyDownOnInput(e, inputRefCounter - 1)}
                                    className="w-24 h-8 px-2 rounded border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 caret-slate-900 font-mono text-xs text-right focus:outline-none focus:ring-2 focus:ring-[#003366] disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                                  />
                                </td>

                                {/* Opening Calculated Volume */}
                                <td className="py-2.5 px-3 text-right font-mono">
                                  {tank.openingReading ? (
                                    <div>
                                      <div className="font-bold text-slate-900">
                                        {tank.openingReading.netProductVolumeStr} L
                                      </div>
                                      <div className="text-[10px] text-slate-500">
                                        Gross: {tank.openingReading.grossObservedVolumeStr} | Water:{' '}
                                        {tank.openingReading.waterVolumeStr}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-400">Pending Save</span>
                                  )}
                                </td>

                                {/* Closing Dip */}
                                <td className="py-2.5 px-3">
                                  <input
                                    ref={(el) => {
                                      registerInputRef(el);
                                    }}
                                    type="text"
                                    inputMode="decimal"
                                    disabled={isShiftReadOnly}
                                    placeholder="e.g. 1150.000"
                                    value={draft.closingDipMm}
                                    onChange={(e) =>
                                      setTankDrafts((prev) => ({
                                        ...prev,
                                        [key]: {
                                          ...draft,
                                          closingDipMm: e.target.value,
                                          saveStatus: 'DIRTY',
                                          errorMessage: null,
                                        },
                                      }))
                                    }
                                    onKeyDown={(e) => handleKeyDownOnInput(e, inputRefCounter - 1)}
                                    className="w-28 h-8 px-2 rounded border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 caret-slate-900 font-mono text-xs text-right focus:outline-none focus:ring-2 focus:ring-[#003366] disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                                  />
                                </td>

                                {/* Closing Water Dip */}
                                <td className="py-2.5 px-3">
                                  <input
                                    ref={(el) => {
                                      registerInputRef(el);
                                    }}
                                    type="text"
                                    inputMode="decimal"
                                    disabled={isShiftReadOnly}
                                    value={draft.closingWaterDipMm}
                                    onChange={(e) =>
                                      setTankDrafts((prev) => ({
                                        ...prev,
                                        [key]: {
                                          ...draft,
                                          closingWaterDipMm: e.target.value,
                                          saveStatus: 'DIRTY',
                                          errorMessage: null,
                                        },
                                      }))
                                    }
                                    onKeyDown={(e) =>
                                      handleKeyDownOnInput(e, inputRefCounter - 1, () =>
                                        handleSaveSingleTankRow(tank)
                                      )
                                    }
                                    className="w-24 h-8 px-2 rounded border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 caret-slate-900 font-mono text-xs text-right focus:outline-none focus:ring-2 focus:ring-[#003366] disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                                  />
                                </td>

                                {/* Closing Calculated Volume */}
                                <td className="py-2.5 px-3 text-right font-mono">
                                  {tank.closingReading ? (
                                    <div>
                                      <div className="font-bold text-slate-900">
                                        {tank.closingReading.netProductVolumeStr} L
                                      </div>
                                      <div className="text-[10px] text-slate-500">
                                        Gross: {tank.closingReading.grossObservedVolumeStr} | Water:{' '}
                                        {tank.closingReading.waterVolumeStr}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-400">Pending Save</span>
                                  )}
                                </td>
                              </>
                            )}

                            {/* Status */}
                            <td className="py-2.5 px-3">
                              {!tank.hasCalibrationChart ? (
                                <span className="text-xs font-bold text-red-700">BLOCKED</span>
                              ) : draft.saveStatus === 'SAVING' ? (
                                <span className="text-xs font-semibold text-blue-700">
                                  Saving...
                                </span>
                              ) : draft.saveStatus === 'ERROR' ? (
                                <span
                                  className="text-xs font-semibold text-red-700"
                                  title={draft.errorMessage || ''}
                                >
                                  {draft.errorMessage || 'Error'}
                                </span>
                              ) : tank.openingReading && tank.closingReading ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Complete
                                </span>
                              ) : tank.openingReading ? (
                                <span className="text-xs font-semibold text-amber-700">
                                  Opening Saved
                                </span>
                              ) : (
                                <span className="text-xs text-slate-500">Pending</span>
                              )}
                            </td>

                            {/* Row Save Button */}
                            <td className="py-2.5 px-3 text-right">
                              {tank.hasCalibrationChart && !isShiftReadOnly && (
                                <button
                                  type="button"
                                  onClick={() => handleSaveSingleTankRow(tank)}
                                  disabled={draft.saveStatus === 'SAVING'}
                                  className="h-7 px-2.5 rounded bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold disabled:opacity-50"
                                >
                                  Save
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 4. NOZZLE METER ENTRY GRID */}
              <div id="daily-nozzle-readings" className="scroll-mt-24 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Gauge className="w-4 h-4 text-[#003366]" />
                      2. Nozzle Meter Entry Grid ({activeWorkspace.nozzles.length} Configured
                      Nozzles)
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Use <kbd className="px-1.5 py-0.5 bg-white border rounded text-[11px]">Tab</kbd>{' '}
                      or{' '}
                      <kbd className="px-1.5 py-0.5 bg-white border rounded text-[11px]">Enter</kbd>{' '}
                      to move across fields. Opening totalizer auto-suggests from the previous
                      closed shift.
                    </p>
                  </div>

                  {!isShiftReadOnly && (
                    <div className="flex flex-wrap items-center gap-2">
                      {activeWorkspace.nozzles.some((n) => {
                        const k = `${activeWorkspace.shift.id}:${n.nozzleId}`;
                        const d =
                          nozzleDrafts[k] ||
                          createInitialNozzleDraftRow(n, activeWorkspace.shift.status);
                        return requiresNozzleTestingConfirmation(d, n);
                      }) && (
                        <button
                          type="button"
                          data-testid="confirm-all-testing-btn"
                          onClick={handleConfirmAllNozzleTestingInShift}
                          className="h-9 px-3 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-700" />
                          Confirm All 5.000 L Testing
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSaveAllNozzles()}
                        disabled={savingAllNozzles}
                        className="h-9 px-4 rounded-lg bg-[#003366] hover:bg-[#002244] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {savingAllNozzles
                          ? 'Saving All Meter Readings...'
                          : 'Save All Meter Readings'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="daily-ops-table-scroll overflow-x-auto" role="region" aria-label="Scrollable operations table" tabIndex={0}>
                  <table className="daily-ops-data-table w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100/80 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                        <th className="py-2.5 px-3">DU / MPD</th>
                        <th className="py-2.5 px-3">Nozzle #</th>
                        <th className="py-2.5 px-3">Product</th>
                        <th className="py-2.5 px-3">Tank #</th>
                        <th className="py-2.5 px-3">Opening Totalizer</th>
                        <th className="py-2.5 px-3">Closing Totalizer</th>
                        <th className="py-2.5 px-3">Testing (L)</th>
                        <th className="py-2.5 px-3 text-right">Gross Sales (L)</th>
                        <th className="py-2.5 px-3 text-right">Net Sales (L)</th>
                        <th className="py-2.5 px-3">Save Status</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {activeWorkspace.nozzles.map((nozzle) => {
                        const key = `${activeWorkspace.shift.id}:${nozzle.nozzleId}`;
                        const draft =
                          nozzleDrafts[key] ||
                          createInitialNozzleDraftRow(nozzle, activeWorkspace.shift.status);
                        const needsTestingConfirmation = requiresNozzleTestingConfirmation(
                          draft,
                          nozzle
                        );

                        // Check continuity variance between suggested previous closing and current opening
                        let hasContinuityDiff = false;
                        let continuityDiffStr = '0.000';
                        if (nozzle.suggestedOpeningTotalizerMilliunits !== null) {
                          try {
                            const enteredOpenMilli = parseMilliunits(
                              draft.openingTotalizer || '0.000'
                            );
                            const diffMilli =
                              enteredOpenMilli - nozzle.suggestedOpeningTotalizerMilliunits;
                            if (diffMilli !== 0) {
                              hasContinuityDiff = true;
                              continuityDiffStr =
                                (diffMilli > 0 ? '+' : '') + formatMilliunits(diffMilli);
                            }
                          } catch {
                            // ignore parse error while typing
                          }
                        }

                        // Preview gross/net while typing, authoritative reading shown when saved
                        const { grossSalesStr: displayGrossStr, netSalesStr: displayNetStr } =
                          computeNozzlePreviewSales(
                            draft.openingTotalizer,
                            draft.closingTotalizer,
                            draft.testingQuantity,
                            nozzle.reading
                          );

                        return (
                          <tr key={nozzle.nozzleId} className="hover:bg-slate-50/80 align-top">
                            <td className="py-2.5 px-3 font-semibold text-slate-900">
                              MPD #{nozzle.dispenserNumber}
                              <div className="text-[11px] font-normal text-slate-500">
                                {nozzle.dispenserName}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                              Nozzle #{nozzle.nozzleNumber}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-900 border border-blue-200">
                                {nozzle.productCode}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-xs text-slate-700">
                              Tank #{nozzle.tankNumber}
                            </td>

                            {/* Opening Totalizer + Continuity Variance Check */}
                            <td className="py-2.5 px-3">
                              <input
                                ref={(el) => {
                                  registerInputRef(el);
                                }}
                                type="text"
                                inputMode="decimal"
                                disabled={isShiftReadOnly || Boolean(nozzle.unavailability)}
                                value={draft.openingTotalizer}
                                onChange={(e) =>
                                  setNozzleDrafts((prev) => ({
                                    ...prev,
                                    [key]: {
                                      ...draft,
                                      openingTotalizer: e.target.value,
                                      saveStatus: 'DIRTY',
                                      errorMessage: null,
                                    },
                                  }))
                                }
                                onKeyDown={(e) => handleKeyDownOnInput(e, inputRefCounter - 1)}
                                className={`w-32 h-8 px-2 rounded border text-slate-900 placeholder:text-slate-400 caret-slate-900 font-mono text-xs text-right focus:outline-none focus:ring-2 focus:ring-[#003366] disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed ${
                                  hasContinuityDiff
                                    ? 'border-amber-400 bg-amber-50/40'
                                    : 'border-slate-300 bg-white'
                                }`}
                              />
                              {nozzle.suggestedOpeningTotalizerMilliunits !== null && (
                                <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                                  Previous Closing: {nozzle.suggestedOpeningTotalizer}
                                </div>
                              )}
                              {hasContinuityDiff && (
                                <div className="mt-1.5 p-2 rounded bg-amber-50 border border-amber-200 text-[11px] space-y-1">
                                  <div className="font-mono text-amber-900">
                                    Prev: {nozzle.suggestedOpeningTotalizer} | Curr:{' '}
                                    {draft.openingTotalizer} | Diff: {continuityDiffStr}
                                  </div>
                                  <input
                                    type="text"
                                    disabled={isShiftReadOnly}
                                    placeholder="Variance reason required..."
                                    value={draft.varianceReason}
                                    onChange={(e) =>
                                      setNozzleDrafts((prev) => ({
                                        ...prev,
                                        [key]: {
                                          ...draft,
                                          varianceReason: e.target.value,
                                          saveStatus: 'DIRTY',
                                          errorMessage: null,
                                        },
                                      }))
                                    }
                                    className="w-full h-7 px-2 rounded border border-amber-300 bg-white text-xs text-slate-900 placeholder:text-slate-400 caret-slate-900 focus:outline-none focus:ring-2 focus:ring-[#003366] disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                                  />
                                </div>
                              )}
                            </td>

                            {/* Closing Totalizer */}
                            <td className="py-2.5 px-3">
                              <input
                                ref={(el) => {
                                  registerInputRef(el);
                                }}
                                type="text"
                                inputMode="decimal"
                                disabled={isShiftReadOnly || Boolean(nozzle.unavailability)}
                                placeholder="0.000"
                                value={draft.closingTotalizer}
                                onChange={(e) =>
                                  setNozzleDrafts((prev) => ({
                                    ...prev,
                                    [key]: {
                                      ...draft,
                                      closingTotalizer: e.target.value,
                                      saveStatus: 'DIRTY',
                                      errorMessage: null,
                                    },
                                  }))
                                }
                                onKeyDown={(e) => handleKeyDownOnInput(e, inputRefCounter - 1)}
                                className="w-32 h-8 px-2 rounded border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 caret-slate-900 font-mono text-xs text-right focus:outline-none focus:ring-2 focus:ring-[#003366] disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                              />
                            </td>

                            {/* Testing Quantity */}
                            <td className="py-2.5 px-3">
                              <input
                                ref={(el) => {
                                  registerInputRef(el);
                                }}
                                type="text"
                                inputMode="decimal"
                                disabled={isShiftReadOnly || Boolean(nozzle.unavailability)}
                                value={draft.testingQuantity}
                                onChange={(e) =>
                                  setNozzleDrafts((prev) => ({
                                    ...prev,
                                    [key]: updateNozzleDraftTestingQuantity(draft, e.target.value),
                                  }))
                                }
                                onKeyDown={(e) =>
                                  handleKeyDownOnInput(e, inputRefCounter - 1, () =>
                                    handleSaveSingleNozzleRow(nozzle)
                                  )
                                }
                                className="w-24 h-8 px-2 rounded border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 caret-slate-900 font-mono text-xs text-right focus:outline-none focus:ring-2 focus:ring-[#003366] disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                              />
                              {!isShiftReadOnly && !nozzle.unavailability && (
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                  {needsTestingConfirmation ? (
                                    <>
                                      <button
                                        type="button"
                                        data-testid={`confirm-nozzle-testing-${nozzle.nozzleId}`}
                                        onClick={() =>
                                          setNozzleDrafts((prev) => ({
                                            ...prev,
                                            [key]: confirmNozzleDraftTesting(draft),
                                          }))
                                        }
                                        className="px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 border border-amber-300 text-[10px] font-semibold text-amber-900"
                                        title="Confirm physical 5.000 L testing was performed"
                                      >
                                        Confirm 5L Test
                                      </button>
                                      <button
                                        type="button"
                                        data-testid={`zero-nozzle-testing-${nozzle.nozzleId}`}
                                        onClick={() =>
                                          setNozzleDrafts((prev) => ({
                                            ...prev,
                                            [key]: updateNozzleDraftTestingQuantity(
                                              draft,
                                              ZERO_NOZZLE_TESTING_QUANTITY_LITRES
                                            ),
                                          }))
                                        }
                                        className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-[10px] font-mono text-slate-700"
                                        title="Set testing quantity to 0.000 L if no physical testing was performed"
                                      >
                                        0.000 L
                                      </button>
                                    </>
                                  ) : draft.isTestingDefaultPrefilled && draft.testingConfirmed ? (
                                    <span
                                      data-testid={`confirmed-nozzle-testing-${nozzle.nozzleId}`}
                                      className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700"
                                    >
                                      <CheckCircle2 className="w-3 h-3" /> Test Confirmed
                                    </span>
                                  ) : null}
                                </div>
                              )}
                            </td>

                            {/* Gross Sales */}
                            <td className="py-2.5 px-3 text-right font-mono text-slate-800">
                              {displayGrossStr}
                            </td>

                            {/* Net Sales */}
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                              {displayNetStr}
                            </td>

                            {/* Save Status */}
                            <td className="py-2.5 px-3">
                              {nozzle.unavailability ? (
                                <span className="text-xs font-semibold text-slate-600">
                                  Unavailable ({nozzle.unavailability.reason})
                                </span>
                              ) : draft.saveStatus === 'SAVING' ? (
                                <span className="text-xs font-semibold text-blue-700">
                                  Saving...
                                </span>
                              ) : draft.saveStatus === 'ERROR' ? (
                                <span
                                  className="text-xs font-semibold text-red-700"
                                  title={draft.errorMessage || ''}
                                >
                                  {draft.errorMessage || 'Error'}
                                </span>
                              ) : draft.saveStatus === 'DIRTY' ? (
                                <span className="text-xs font-semibold text-amber-700">
                                  Unsaved
                                </span>
                              ) : nozzle.reading ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Saved
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">Not Entered</span>
                              )}
                            </td>

                            {/* Per-row Save */}
                            <td className="py-2.5 px-3 text-right">
                              {!isShiftReadOnly && !nozzle.unavailability && (
                                <div className="flex flex-wrap justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleSaveSingleNozzleRow(nozzle)}
                                    disabled={draft.saveStatus === 'SAVING'}
                                    className="h-7 px-2.5 rounded bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold disabled:opacity-50"
                                  >
                                    Save
                                  </button>
                                  {canRecordUnavailability && activeWorkspace.shift.status === 'OPEN' && !nozzle.reading && (
                                    <button
                                      type="button"
                                      onClick={() => { setUnavailableNozzle(nozzle); setUnavailableReason(''); }}
                                      className="h-7 px-2.5 rounded border border-amber-400 bg-amber-50 text-amber-900 text-xs font-semibold"
                                    >
                                      Mark Unavailable
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* 5. DU / MPD AGGREGATION & PRODUCT STOCK RECONCILIATION */}
          {summary && summary.shiftsCount > 0 && (
            <div id="daily-sales-summary" className="scroll-mt-24 grid grid-cols-1 xl:grid-cols-12 gap-6">
              {/* DU / MPD Totals */}
              <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
                  <h2 className="text-base font-bold text-slate-900">
                    3. DU / MPD Sales Aggregation
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Dispenser-wise nozzle net sales and multi-product breakdown
                  </p>
                </div>
                <div className="p-4 space-y-3">
                  {summary.byDispenser.map((disp) => (
                    <div
                      key={disp.dispenserId}
                      className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/50 space-y-2.5"
                    >
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <div>
                          <span className="text-sm font-bold text-slate-900">
                            MPD #{disp.dispenserNumber}
                          </span>
                          <span className="text-xs text-slate-500 ml-2">{disp.dispenserName}</span>
                        </div>
                        <div className="text-right font-mono">
                          <span className="text-xs text-slate-500 mr-1.5">MPD Total:</span>
                          <span className="text-sm font-bold text-[#003366]">
                            {formatMilliunits(disp.netSalesMilliunits)} L
                          </span>
                        </div>
                      </div>

                      {/* Nozzle pills */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {disp.nozzles.map((n) => (
                          <div
                            key={`${n.operationalShiftId}:${n.nozzleId}`}
                            className="px-2.5 py-1.5 rounded bg-white border border-slate-200 flex items-center justify-between text-xs"
                          >
                            <span className="font-medium text-slate-700">
                              N{n.nozzleNumber}{' '}
                              <span className="text-[10px] font-bold text-blue-800">
                                ({n.productCode})
                              </span>
                            </span>
                            <span className="font-mono font-bold text-slate-900">
                              {formatMilliunits(n.netSalesMilliunits)} L
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Product sub-totals if DU handles multiple products */}
                      {disp.byProduct.length > 0 && (
                        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-600">
                          {disp.byProduct.map((bp) => (
                            <span key={bp.productId} className="font-mono">
                              <strong>{bp.productCode}:</strong>{' '}
                              {formatMilliunits(bp.netSalesMilliunits)} L
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Product Stock & Sales Aggregation */}
              <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      4. Product Stock &amp; Reconciliation Summary
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Earliest shift opening stock + day receipts − meter net sales = theoretical
                      closing vs physical closing
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewMode('DSR')}
                    className="h-8 px-3 rounded-lg bg-[#003366] text-white text-xs font-semibold flex items-center gap-1"
                  >
                    Open Full DSR <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="daily-ops-table-scroll overflow-x-auto" role="region" aria-label="Scrollable operations table" tabIndex={0}>
                  <table className="daily-ops-data-table w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100/80 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                        <th className="py-2.5 px-3">Product</th>
                        <th className="py-2.5 px-3 text-right">Opening</th>
                        <th className="py-2.5 px-3 text-right">Receipts</th>
                        <th className="py-2.5 px-3 text-right">Available</th>
                        <th className="py-2.5 px-3 text-right">Gross Sales</th>
                        <th className="py-2.5 px-3 text-right">Testing</th>
                        <th className="py-2.5 px-3 text-right">Net Sales</th>
                        <th className="py-2.5 px-3 text-right">Theoretical</th>
                        <th className="py-2.5 px-3 text-right">Physical</th>
                        <th className="py-2.5 px-3 text-right">Variance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs font-mono text-slate-900">
                      {summary.byProduct.map((prod) => (
                        <tr key={prod.productId} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-sans font-bold text-slate-900">
                            {prod.productCode}
                            <div className="text-[10px] font-normal text-slate-500">
                              {prod.productName}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {formatMilliunits(prod.openingStockMilliunits)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {formatMilliunits(prod.receiptsMilliunits)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold">
                            {formatMilliunits(prod.availableStockMilliunits)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {formatMilliunits(prod.grossSalesMilliunits)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {formatMilliunits(prod.testingMilliunits)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-[#003366]">
                            {formatMilliunits(prod.netSalesMilliunits)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {formatMilliunits(prod.theoreticalClosingMilliunits)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {formatMilliunits(prod.physicalClosingMilliunits)}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-bold ${
                              prod.varianceMilliunits < 0
                                ? 'text-red-700'
                                : prod.varianceMilliunits > 0
                                  ? 'text-emerald-700'
                                  : 'text-slate-700'
                            }`}
                          >
                            {prod.varianceMilliunits > 0 ? '+' : ''}
                            {formatMilliunits(prod.varianceMilliunits)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 font-mono text-xs font-bold text-slate-900 border-t-2 border-slate-300">
                        <td className="py-2.5 px-3 font-sans">DAY TOTAL (L)</td>
                        <td className="py-2.5 px-3 text-right">
                          {formatMilliunits(summary.totals.openingStockMilliunits)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {formatMilliunits(summary.totals.receiptsMilliunits)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {formatMilliunits(summary.totals.availableStockMilliunits)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {formatMilliunits(summary.totals.grossSalesMilliunits)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {formatMilliunits(summary.totals.testingMilliunits)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-[#003366]">
                          {formatMilliunits(summary.totals.netSalesMilliunits)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {formatMilliunits(summary.totals.theoreticalClosingMilliunits)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {formatMilliunits(summary.totals.physicalClosingMilliunits)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {summary.totals.varianceMilliunits > 0 ? '+' : ''}
                          {formatMilliunits(summary.totals.varianceMilliunits)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* VIEW MODE 2: DSR SUMMARY VIEW */}
      {viewMode === 'DSR' && summary && (
        <div className="space-y-6" data-testid="dsr-summary-view">
          {/* DSR Header Banner */}
          <div className="rounded-2xl border border-[#DDE6EF] bg-[#17365D] p-6 text-white shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-blue-200 font-semibold">
                Indian Oil Corporation Limited • Retail Outlet Daily Sales Report (DSR)
              </div>
              <h2 className="text-xl font-bold mt-1">
                {selectedOutlet?.roCode} — {summary.outletName}
              </h2>
              <div className="text-xs text-blue-100 mt-1 font-mono">
                Business Date: {summary.businessDate} • Shifts Included: {summary.shiftsCount} •
                DSR Status: {summary.status}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-xs text-blue-200 uppercase">Total Net Fuel Sales</div>
                <div className="text-2xl font-bold font-mono">
                  {formatMilliunits(summary.totals.netSalesMilliunits)} L
                </div>
              </div>
            </div>
          </div>

          {/* DSR Section 1: Product-wise Stock & Sales Statement */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-base font-bold text-slate-900">
                1. Product-wise Daily Stock &amp; Sales Statement
              </h3>
            </div>
            <div className="daily-ops-table-scroll overflow-x-auto" role="region" aria-label="Scrollable operations table" tabIndex={0}>
              <table className="daily-ops-data-table w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    <th className="py-3 px-4">Product</th>
                    <th className="py-3 px-4 text-right">Opening Stock (L)</th>
                    <th className="py-3 px-4 text-right">Receipt (L)</th>
                    <th className="py-3 px-4 text-right">Total Available (L)</th>
                    <th className="py-3 px-4 text-right">Gross Meter Sales (L)</th>
                    <th className="py-3 px-4 text-right">Testing (L)</th>
                    <th className="py-3 px-4 text-right">Net Sales (L)</th>
                    <th className="py-3 px-4 text-right">Closing Book Stock (L)</th>
                    <th className="py-3 px-4 text-right">Physical Stock (L)</th>
                    <th className="py-3 px-4 text-right">Variance (L)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm font-mono text-slate-900">
                  {summary.byProduct.map((p) => (
                    <tr key={p.productId} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-sans font-bold text-slate-900">
                        {p.productCode} — {p.productName}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {formatMilliunits(p.openingStockMilliunits)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {formatMilliunits(p.receiptsMilliunits)}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold">
                        {formatMilliunits(p.availableStockMilliunits)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {formatMilliunits(p.grossSalesMilliunits)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {formatMilliunits(p.testingMilliunits)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-[#003366]">
                        {formatMilliunits(p.netSalesMilliunits)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {formatMilliunits(p.theoreticalClosingMilliunits)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {formatMilliunits(p.physicalClosingMilliunits)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-bold ${
                          p.varianceMilliunits < 0
                            ? 'text-red-700'
                            : p.varianceMilliunits > 0
                              ? 'text-emerald-700'
                              : 'text-slate-700'
                        }`}
                      >
                        {p.varianceMilliunits > 0 ? '+' : ''}
                        {formatMilliunits(p.varianceMilliunits)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* DSR Section 2: DU-wise & Nozzle-wise Meter Statement */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-base font-bold text-slate-900">
                2. Dispenser (DU / MPD) &amp; Nozzle-wise Sales Statement
              </h3>
            </div>
            <div className="daily-ops-table-scroll overflow-x-auto" role="region" aria-label="Scrollable operations table" tabIndex={0}>
              <table className="daily-ops-data-table w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    <th className="py-2.5 px-4">Shift</th>
                    <th className="py-2.5 px-4">DU / MPD</th>
                    <th className="py-2.5 px-4">Nozzle</th>
                    <th className="py-2.5 px-4">Product</th>
                    <th className="py-2.5 px-4 text-right">Opening Totalizer</th>
                    <th className="py-2.5 px-4 text-right">Closing Totalizer</th>
                    <th className="py-2.5 px-4 text-right">Gross Sales (L)</th>
                    <th className="py-2.5 px-4 text-right">Testing (L)</th>
                    <th className="py-2.5 px-4 text-right">Net Sales (L)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs font-mono text-slate-900">
                  {summary.byDispenser.flatMap((disp) =>
                    disp.nozzles.map((n) => (
                      <tr
                        key={`${n.operationalShiftId}:${n.nozzleId}`}
                        className="hover:bg-slate-50"
                      >
                        <td className="py-2.5 px-4 font-sans">Shift #{n.shiftNumber}</td>
                        <td className="py-2.5 px-4 font-sans font-semibold">
                          MPD #{disp.dispenserNumber} ({disp.dispenserName})
                        </td>
                        <td className="py-2.5 px-4 font-bold">Nozzle #{n.nozzleNumber}</td>
                        <td className="py-2.5 px-4 font-sans font-bold text-blue-900">
                          {n.productCode}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {n.openingTotalizerMilliunits !== null
                            ? formatMilliunits(n.openingTotalizerMilliunits)
                            : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {n.closingTotalizerMilliunits !== null
                            ? formatMilliunits(n.closingTotalizerMilliunits)
                            : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {formatMilliunits(n.grossSalesMilliunits)}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {formatMilliunits(n.testingQuantityMilliunits)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-[#003366]">
                          {formatMilliunits(n.netSalesMilliunits)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Admin-only empty shift close: normal close and reconciliation remain unchanged. */}
      {isGlobalAdmin && adminEmptyCloseOpen && activeWorkspace?.shift.status === 'OPEN' && (
        <div role="dialog" aria-modal="true" aria-labelledby="admin-empty-close-title"
             className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-amber-300 bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-amber-800">
              <ShieldAlert className="w-6 h-6" />
              <h3 id="admin-empty-close-title" className="font-bold text-lg">Admin: Close Empty Shift</h3>
            </div>
            <p className="text-sm text-slate-700">
              Only a shift with no recorded operational or financial entries can be closed this way.
              No readings, sales, or reconciliations will be created. This action is audited.
            </p>
            <p className="text-xs font-semibold text-slate-600">
              Outlet: {selectedOutlet?.name || selectedOutletId} · Date: {businessDate} · Shift: {activeWorkspace.shiftTemplateName}
            </p>
            <label htmlFor="daily-admin-close-reason" className="block text-sm font-semibold text-slate-800">
              Reason for closing (required, 10–500 characters)
            </label>
            <textarea id="daily-admin-close-reason"
              value={adminEmptyCloseReason}
              onChange={(event) => setAdminEmptyCloseReason(event.target.value)}
              maxLength={500} rows={3}
              placeholder="Example: Shift opened by mistake; no operational data was entered."
              className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900"
            />
            <button type="button" role="checkbox" aria-checked={adminEmptyCloseConfirmed}
              onClick={() => setAdminEmptyCloseConfirmed(value => !value)}
              className="flex items-start gap-2 text-left text-sm text-slate-700">
              <span aria-hidden="true" className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-500">
                {adminEmptyCloseConfirmed ? '✓' : ''}
              </span>
              I confirm this shift has no recorded activity and authorize closing it without reconciliation.
            </button>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" disabled={closingShiftBusy}
                onClick={() => setAdminEmptyCloseOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
                Cancel
              </button>
              <button type="button" data-testid="confirm-admin-close-empty-shift"
                disabled={closingShiftBusy || !adminEmptyCloseConfirmed || adminEmptyCloseReason.trim().length < 10}
                onClick={handleAdminEmptyClose}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {closingShiftBusy ? 'Checking & Closing...' : 'Confirm Admin Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nozzle unavailability, retained from the former Shift Operations screen. */}
      {canRecordUnavailability && unavailableNozzle && activeWorkspace?.shift.status === 'OPEN' && (
        <div role="dialog" aria-modal="true" aria-labelledby="nozzle-unavailable-title"
             className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 shadow-xl space-y-4">
            <h3 id="nozzle-unavailable-title" className="text-lg font-bold text-slate-900">
              Mark Nozzle Unavailable
            </h3>
            <p className="text-sm text-slate-700">
              Dispenser #{unavailableNozzle.dispenserNumber} · Nozzle #{unavailableNozzle.nozzleNumber} · {unavailableNozzle.productCode}
            </p>
            <label htmlFor="nozzle-unavailable-reason" className="block text-xs font-semibold text-slate-700">
              Reason (at least 3 characters)
            </label>
            <textarea id="nozzle-unavailable-reason" rows={3} maxLength={500}
              value={unavailableReason} onChange={e => setUnavailableReason(e.target.value)}
              placeholder="e.g. Nozzle under maintenance"
              className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900" />
            <div className="flex justify-end gap-2">
              <button type="button" disabled={savingUnavailable}
                onClick={() => setUnavailableNozzle(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">Cancel</button>
              <button type="button" disabled={savingUnavailable || unavailableReason.trim().length < 3}
                onClick={handleRecordUnavailability}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {savingUnavailable ? 'Saving...' : 'Confirm Unavailability'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PHYSICAL NOZZLE TESTING CONFIRMATION MODAL */}
      {pendingTestingConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="nozzle-testing-confirm-modal"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-100 text-amber-800 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Confirm Physical Nozzle Testing ({DEFAULT_NOZZLE_TESTING_QUANTITY_LITRES} L)
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  The default testing quantity of{' '}
                  <strong className="font-mono">{DEFAULT_NOZZLE_TESTING_QUANTITY_LITRES} L</strong>{' '}
                  is prefilled for the nozzle(s) below. Before saving to the shift register, please
                  confirm that physical pump testing was actually performed and returned to tank.
                </p>
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-200 bg-slate-50">
              {pendingTestingConfirm.unconfirmedNozzles.map((item) => (
                <div
                  key={item.nozzleId}
                  className="px-3.5 py-2 flex items-center justify-between text-xs"
                >
                  <span className="font-semibold text-slate-800">
                    MPD #{item.dispenserNumber} • Nozzle #{item.nozzleNumber}{' '}
                    <span className="text-blue-800 font-bold">({item.productCode})</span>
                  </span>
                  <span className="font-mono font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                    Testing: {item.testingQuantity} L
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                data-testid="cancel-testing-confirm-btn"
                onClick={() => setPendingTestingConfirm(null)}
                className="h-9 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
              >
                Cancel / Edit Manually
              </button>
              <button
                type="button"
                data-testid="save-zero-testing-btn"
                onClick={handleSavePendingWithZeroTesting}
                className="h-9 px-3.5 rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold font-mono"
              >
                No Testing (Save 0.000 L)
              </button>
              <button
                type="button"
                data-testid="confirm-testing-and-save-btn"
                onClick={handleConfirmPendingTestingAndSave}
                className="h-9 px-4 rounded-lg bg-[#003366] hover:bg-[#002244] text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Confirm Physical Testing &amp; Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN-ONLY CONTROLLED DAILY OPERATIONS TEST DATA RESET */}
      <DailyOperationsTestDataResetPanel
        outlets={outlets}
        selectedOutletId={selectedOutletId}
        onResetCompleted={() => loadBootstrap(selectedOutletId, businessDate, false)}
      />
    </div>
  );
};

export default DailyOperationsPage;
