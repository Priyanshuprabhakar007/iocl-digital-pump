import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../../shared/constants';
import {
  RetailOutlet,
  OperationalShift,
  CngShiftLog,
  CngPressureReading,
} from '../../shared/types';
import {
  Flame,
  Building2,
  Clock,
  Calendar,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Lock,
  Unlock,
  ShieldAlert,
} from 'lucide-react';
import { CngMfmPanel } from '../components/cng/CngMfmPanel';
import { CngPressurePanel } from '../components/cng/CngPressurePanel';
import { CngDailySummaryPanel } from '../components/cng/CngDailySummaryPanel';
import { CngPressureModal } from '../components/cng/CngPressureModal';

export const CngOperationsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canRead = hasPermission(PERMISSIONS.CNG_OPERATIONS_READ);
  const canWrite = hasPermission(PERMISSIONS.CNG_OPERATIONS_WRITE);

  const [outlets, setOutlets] = useState<RetailOutlet[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');
  const [loadingOutlets, setLoadingOutlets] = useState(true);

  const [shiftsList, setShiftsList] = useState<OperationalShift[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<OperationalShift | null>(null);
  const [loadingShifts, setLoadingShifts] = useState(false);

  // CNG Shift specific data
  const [cngLog, setCngLog] = useState<CngShiftLog | null>(null);
  const [pressureReadings, setPressureReadings] = useState<CngPressureReading[]>([]);
  const [loadingShiftData, setLoadingShiftData] = useState(false);
  const [dailySummaryRefreshCounter, setDailySummaryRefreshCounter] = useState(0);

  // Pressure Modal state
  const [pressureModalOpen, setPressureModalOpen] = useState(false);
  const [editingPressureReading, setEditingPressureReading] = useState<CngPressureReading | null>(null);
  const [deletingPressureId, setDeletingPressureId] = useState<string | null>(null);

  // Global action feedback
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Auto clear success message after 5 seconds
  useEffect(() => {
    if (actionSuccess) {
      const timer = setTimeout(() => setActionSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [actionSuccess]);

  // Load Outlets on Mount
  useEffect(() => {
    const loadOutlets = async () => {
      setLoadingOutlets(true);
      try {
        const res = await apiFetch<RetailOutlet[]>('/api/v1/outlets');
        if (res.success && res.data && res.data.length > 0) {
          setOutlets(res.data);
          setSelectedOutletId(res.data[0].id);
        } else {
          setOutlets([]);
        }
      } catch (err: any) {
        setActionError(err.message || 'Failed to load retail outlets');
      } finally {
        setLoadingOutlets(false);
      }
    };

    if (canRead) {
      loadOutlets();
    }
  }, [canRead]);

  // Load Shifts when Outlet Changes
  useEffect(() => {
    if (!selectedOutletId) {
      setShiftsList([]);
      setSelectedShiftId('');
      setSelectedShift(null);
      return;
    }

    const loadShifts = async () => {
      setLoadingShifts(true);
      setActionError(null);
      try {
        const res = await apiFetch<OperationalShift[]>(`/api/v1/outlets/${selectedOutletId}/shifts`);
        if (res.success && res.data) {
          setShiftsList(res.data);
          if (res.data.length > 0) {
            // Pick current active or first shift
            setSelectedShiftId(res.data[0].id);
          } else {
            setSelectedShiftId('');
            setSelectedShift(null);
            setCngLog(null);
            setPressureReadings([]);
          }
        }
      } catch (err: any) {
        setActionError(err.message || 'Failed to load operational shifts');
      } finally {
        setLoadingShifts(false);
      }
    };

    loadShifts();
  }, [selectedOutletId]);

  // Load Selected Shift Details, CNG Log, and Pressure Readings
  const loadShiftData = async () => {
    if (!selectedShiftId) {
      setSelectedShift(null);
      setCngLog(null);
      setPressureReadings([]);
      return;
    }

    setLoadingShiftData(true);
    setActionError(null);

    try {
      const [shiftRes, logRes, pressureRes] = await Promise.all([
        apiFetch<OperationalShift>(`/api/v1/shifts/${selectedShiftId}`),
        apiFetch<CngShiftLog | null>(`/api/v1/shifts/${selectedShiftId}/cng-log`),
        apiFetch<CngPressureReading[]>(`/api/v1/shifts/${selectedShiftId}/cng-pressure-readings`),
      ]);

      if (shiftRes.success && shiftRes.data) {
        setSelectedShift(shiftRes.data);
      } else {
        setSelectedShift(null);
      }

      if (logRes.success) {
        setCngLog(logRes.data);
      } else {
        setCngLog(null);
      }

      if (pressureRes.success && pressureRes.data) {
        setPressureReadings(pressureRes.data);
      } else {
        setPressureReadings([]);
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to load shift CNG records');
    } finally {
      setLoadingShiftData(false);
    }
  };

  useEffect(() => {
    loadShiftData();
  }, [selectedShiftId]);

  const reloadPressureReadings = async () => {
    if (!selectedShiftId) return;
    try {
      const res = await apiFetch<CngPressureReading[]>(`/api/v1/shifts/${selectedShiftId}/cng-pressure-readings`);
      if (res.success && res.data) {
        setPressureReadings(res.data);
      }
    } catch {
      // keep existing state on transient fetch error
    }
  };

  const handleRefresh = async () => {
    await loadShiftData();
    setDailySummaryRefreshCounter((c) => c + 1);
  };

  const handleAddPressure = () => {
    setEditingPressureReading(null);
    setPressureModalOpen(true);
  };

  const handleEditPressure = (reading: CngPressureReading) => {
    setEditingPressureReading(reading);
    setPressureModalOpen(true);
  };

  const handleDeletePressure = async (readingId: string) => {
    if (!window.confirm('Are you sure you want to delete this compressor pressure reading?')) {
      return;
    }

    setDeletingPressureId(readingId);
    setActionError(null);

    try {
      const res = await apiFetch(`/api/v1/cng-pressure-readings/${readingId}`, {
        method: 'DELETE',
      });

      if (res.success) {
        setActionSuccess('Pressure reading deleted successfully.');
        await reloadPressureReadings();
      } else {
        const code = res.error?.code;
        let msg = res.error?.message || 'Failed to delete pressure reading';
        if (code === 'SHIFT_CLOSED') {
          msg = 'Cannot delete reading because the operational shift is closed or locked.';
        } else if (code === 'CNG_NOT_AVAILABLE_AT_OUTLET') {
          msg = 'CNG operations not available at this outlet.';
        } else if (code === 'NOT_FOUND') {
          msg = 'Pressure reading not found or already deleted.';
        }
        setActionError(msg);
      }
    } catch (err: any) {
      setActionError(err.message || 'Network error deleting pressure reading');
    } finally {
      setDeletingPressureId(null);
    }
  };

  const selectedOutlet = outlets.find((o) => o.id === selectedOutletId);

  if (!canRead) {
    return (
      <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl max-w-xl mx-auto my-12 space-y-3">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-white">Access Restricted</h2>
        <p className="text-xs text-slate-400">
          You do not have permission (<code className="font-mono text-orange-400">cng_operations.read</code>) to view CNG Operations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Selectors */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-500/10 rounded-xl border border-orange-500/20 text-orange-500 shadow-md shadow-orange-500/10">
              <Flame className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">
                CNG Operations
              </h1>
              <p className="text-xs text-slate-400">
                MFM sales, grid intake and compressor pressure monitoring
              </p>
            </div>
          </div>

          {/* Top Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Outlet Selector */}
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 min-w-[200px]">
              <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={selectedOutletId}
                onChange={(e) => setSelectedOutletId(e.target.value)}
                disabled={loadingOutlets}
                className="bg-transparent text-xs text-white font-medium focus:outline-none w-full"
              >
                {outlets.length === 0 ? (
                  <option value="">No outlets available</option>
                ) : (
                  outlets.map((o) => (
                    <option key={o.id} value={o.id} className="bg-slate-900 text-white">
                      {o.name} ({o.roCode})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Shift Selector */}
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 min-w-[220px]">
              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={selectedShiftId}
                onChange={(e) => setSelectedShiftId(e.target.value)}
                disabled={loadingShifts || shiftsList.length === 0}
                className="bg-transparent text-xs text-white font-medium focus:outline-none w-full"
              >
                {shiftsList.length === 0 ? (
                  <option value="">No shifts available</option>
                ) : (
                  shiftsList.map((s) => (
                    <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                      {s.businessDate} • {s.shiftTemplateName || 'Shift'} [{s.status}]
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loadingShiftData}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors disabled:opacity-50"
              title="Refresh Shift Data"
            >
              <RefreshCw className={`w-4 h-4 ${loadingShiftData ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Selected Shift Context Card */}
        {selectedShift && (
          <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-white">
                {selectedOutlet?.name} <span className="font-mono text-slate-400">({selectedOutlet?.roCode})</span>
              </span>
              <span className="text-slate-600 hidden sm:inline">•</span>
              <span className="flex items-center gap-1 text-slate-300 font-mono">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                {selectedShift.businessDate}
              </span>
              <span className="text-slate-600 hidden sm:inline">•</span>
              <span className="text-slate-300 font-medium">
                {selectedShift.shiftTemplateName || 'Shift Template'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase font-mono ${
                  selectedShift.status === 'OPEN'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : selectedShift.status === 'CLOSING'
                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                    : selectedShift.status === 'LOCKED'
                    ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {selectedShift.status}
              </span>

              {selectedShift.status !== 'OPEN' ? (
                <div className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                  <Lock className="w-3 h-3" />
                  <span>Historical shift — CNG records are read-only.</span>
                </div>
              ) : !canWrite ? (
                <div className="flex items-center gap-1 text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-lg">
                  <Lock className="w-3 h-3" />
                  <span>Read-only mode — write permission required to modify.</span>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Global Alerts */}
      {actionError && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-between text-xs text-rose-400 shadow-lg">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between text-xs text-emerald-400 shadow-lg">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Empty States */}
      {outlets.length === 0 ? (
        <div className="py-16 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
          <Building2 className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-white">No Retail Outlets Available</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            You do not currently have access to any retail outlets. Check your scope assignments with your administrator.
          </p>
        </div>
      ) : shiftsList.length === 0 ? (
        <div className="py-16 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
          <Clock className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-white">No Operational Shifts</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            No operational shifts exist for this outlet. Open a shift in Shift Operations to record CNG dispensing and pressures.
          </p>
        </div>
      ) : !selectedShift ? (
        <div className="py-16 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
          <Clock className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-white">Select a Shift</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Choose an operational shift from the dropdown above to view and manage CNG operations.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section 1: CNG MFM & Grid Intake */}
          <CngMfmPanel
            shiftId={selectedShift.id}
            shiftStatus={selectedShift.status}
            log={cngLog}
            canWrite={canWrite}
            onLogSaved={(savedLog) => {
              setCngLog(savedLog);
              setDailySummaryRefreshCounter((c) => c + 1);
            }}
            onError={(msg) => setActionError(msg)}
            onSuccess={(msg) => setActionSuccess(msg)}
          />

          {/* Section 2: Compressor & Cascade Pressure Monitoring */}
          <CngPressurePanel
            shiftId={selectedShift.id}
            shiftStatus={selectedShift.status}
            readings={pressureReadings}
            canWrite={canWrite}
            onAddClick={handleAddPressure}
            onEditClick={handleEditPressure}
            onDeleteClick={handleDeletePressure}
            deletingId={deletingPressureId}
          />

          {/* Section 3: Daily CNG Summary */}
          {selectedOutletId && selectedShift && (
            <CngDailySummaryPanel
              outletId={selectedOutletId}
              defaultDate={selectedShift.businessDate}
              refreshTrigger={dailySummaryRefreshCounter}
            />
          )}

          {/* Add / Edit Pressure Modal */}
          <CngPressureModal
            isOpen={pressureModalOpen}
            shiftId={selectedShift.id}
            initialData={editingPressureReading}
            onClose={() => {
              setPressureModalOpen(false);
              setEditingPressureReading(null);
            }}
            onSaved={async () => {
              await reloadPressureReadings();
            }}
            onError={(msg) => setActionError(msg)}
            onSuccess={(msg) => setActionSuccess(msg)}
          />
        </div>
      )}
    </div>
  );
};
