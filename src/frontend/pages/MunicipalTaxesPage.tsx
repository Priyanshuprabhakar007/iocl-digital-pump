import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import { PERMISSIONS } from '../../shared/constants';
import {
  RetailOutlet,
  MunicipalTaxDue,
  MunicipalTaxSummary,
  MunicipalTaxType,
  MunicipalTaxFrequency,
  MunicipalTaxStatus,
} from '../../shared/types';
import { MunicipalTaxSummaryPanel } from '../components/municipalTaxes/MunicipalTaxSummaryPanel';
import { MunicipalTaxDuesPanel } from '../components/municipalTaxes/MunicipalTaxDuesPanel';
import { MunicipalTaxDueModal } from '../components/municipalTaxes/MunicipalTaxDueModal';
import { MunicipalTaxPaymentModal } from '../components/municipalTaxes/MunicipalTaxPaymentModal';
import { MunicipalTaxDetailPanel } from '../components/municipalTaxes/MunicipalTaxDetailPanel';
import {
  buildMunicipalTaxQueryParams,
  getResetMunicipalTaxFilters,
  validateMunicipalTaxDateRange,
  getMunicipalTaxErrorMessage,
  MunicipalTaxFilterState,
} from '../components/municipalTaxes/municipalTaxUi';
import {
  Landmark,
  Building2,
  RefreshCw,
  Plus,
  Filter,
  X,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

export const MunicipalTaxesPage: React.FC = () => {
  const { hasPermission } = useAuth();

  // Permission Checks
  const canRead = hasPermission(PERMISSIONS.MUNICIPAL_TAXES_READ);
  const canWrite = hasPermission(PERMISSIONS.MUNICIPAL_TAXES_WRITE);
  const canPay = hasPermission(PERMISSIONS.MUNICIPAL_TAX_PAYMENTS_WRITE);
  const hasOutletsRead = hasPermission(PERMISSIONS.OUTLETS_READ);

  // Outlet State
  const [outlets, setOutlets] = useState<RetailOutlet[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');
  const [loadingOutlets, setLoadingOutlets] = useState<boolean>(true);

  // Workspace Data State
  const [summary, setSummary] = useState<MunicipalTaxSummary | null>(null);
  const [dues, setDues] = useState<MunicipalTaxDue[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(false);

  // Filters State
  const [filters, setFilters] = useState<MunicipalTaxFilterState>(getResetMunicipalTaxFilters());

  // Modal / Drawer Selection States
  const [isDueModalOpen, setIsDueModalOpen] = useState<boolean>(false);
  const [dueToEdit, setDueToEdit] = useState<MunicipalTaxDue | null>(null);
  const [dueForPayment, setDueForPayment] = useState<MunicipalTaxDue | null>(null);
  const [selectedDueId, setSelectedDueId] = useState<string | null>(null);

  // Detail Refresh Key
  const [detailRefreshKey, setDetailRefreshKey] = useState<number>(0);

  // Feedback Notifications
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Stale request guard
  const activeOutletReqRef = useRef<string>('');

  // Auto clear success message
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Load Outlets on Mount
  useEffect(() => {
    const loadOutlets = async () => {
      setLoadingOutlets(true);
      try {
        if (!hasOutletsRead && !canRead) {
          setOutlets([]);
          return;
        }
        const res = await apiFetch<RetailOutlet[]>('/api/v1/outlets');
        if (res.success && res.data && res.data.length > 0) {
          setOutlets(res.data);
          setSelectedOutletId(res.data[0].id);
        } else {
          setOutlets([]);
          if (res.success === false) {
            setErrorMessage(res.error?.message || 'Failed to load retail outlets');
          }
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to load retail outlets');
      } finally {
        setLoadingOutlets(false);
      }
    };

    if (canRead) {
      loadOutlets();
    } else {
      setLoadingOutlets(false);
    }
  }, [canRead, hasOutletsRead]);

  // Fetch Workspace Data for Selected Outlet
  const fetchWorkspaceData = useCallback(async (outletId: string) => {
    if (!outletId) return;

    // Date range guard
    const dateRangeValidation = validateMunicipalTaxDateRange(filters.fromDate, filters.toDate);
    if (!dateRangeValidation.isValid) {
      setErrorMessage(dateRangeValidation.error || 'Invalid date range.');
      return;
    }

    activeOutletReqRef.current = outletId;
    setLoadingData(true);
    setErrorMessage(null);

    const query = buildMunicipalTaxQueryParams(filters);

    try {
      const [summaryRes, duesRes] = await Promise.allSettled([
        apiFetch<MunicipalTaxSummary>(`/api/v1/outlets/${outletId}/municipal-tax-summary`),
        apiFetch<MunicipalTaxDue[]>(`/api/v1/outlets/${outletId}/municipal-taxes${query}`),
      ]);

      // Guard against stale responses from previous outlet
      if (activeOutletReqRef.current !== outletId) return;

      if (summaryRes.status === 'fulfilled' && summaryRes.value.success && summaryRes.value.data) {
        setSummary(summaryRes.value.data);
      }
      if (duesRes.status === 'fulfilled' && duesRes.value.success && duesRes.value.data) {
        setDues(duesRes.value.data);
      }
    } catch (err: any) {
      if (activeOutletReqRef.current === outletId) {
        setErrorMessage(getMunicipalTaxErrorMessage(err));
      }
    } finally {
      if (activeOutletReqRef.current === outletId) {
        setLoadingData(false);
      }
    }
  }, [filters]);

  // Re-fetch when selected outlet or filters change
  useEffect(() => {
    if (selectedOutletId && canRead) {
      fetchWorkspaceData(selectedOutletId);
    }
  }, [selectedOutletId, canRead, fetchWorkspaceData]);

  // Handle Outlet Change
  const handleOutletChange = (newOutletId: string) => {
    activeOutletReqRef.current = newOutletId;
    setSelectedOutletId(newOutletId);

    // Clear all outlet-specific state immediately
    setSummary(null);
    setDues([]);
    setSelectedDueId(null);
    setDueToEdit(null);
    setIsDueModalOpen(false);
    setDueForPayment(null);
    setFilters(getResetMunicipalTaxFilters());
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // Actions
  const handleOpenCreateModal = () => {
    setDueToEdit(null);
    setIsDueModalOpen(true);
  };

  const handleOpenEditModal = (due: MunicipalTaxDue) => {
    setDueToEdit(due);
    setIsDueModalOpen(true);
  };

  const handleOpenPaymentModal = (due: MunicipalTaxDue) => {
    setDueForPayment(due);
  };

  const handleSelectDue = (due: MunicipalTaxDue) => {
    setSelectedDueId(due.id);
  };

  const handleMutationSuccess = (message?: string) => {
    if (message) setSuccessMessage(message);
    setDetailRefreshKey(prev => prev + 1);
    if (selectedOutletId) {
      fetchWorkspaceData(selectedOutletId);
    }
  };

  const handleClearFilters = () => {
    setFilters(getResetMunicipalTaxFilters());
  };

  // Access Restricted State
  if (!canRead) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <div className="p-12 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-4">
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl inline-block">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-white">Access Restricted</h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            You do not have permission to view Municipal Taxes & Statutory Dues ({PERMISSIONS.MUNICIPAL_TAXES_READ}). Please contact your system administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header & Outlet Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400">
              <Landmark className="w-6 h-6" />
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              Municipal Taxes & Statutory Dues
            </h1>
          </div>
          <p className="text-xs text-slate-400 font-mono">
            Track, assess, and settle statutory dues, property taxes, and local license fees
          </p>
        </div>

        {/* Outlet Switcher & Actions */}
        <div className="flex items-center gap-3">
          {loadingOutlets ? (
            <div className="h-10 w-48 bg-slate-800/60 rounded-xl animate-pulse" />
          ) : outlets.length > 0 ? (
            <div className="relative min-w-[200px]">
              <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={selectedOutletId}
                onChange={e => handleOutletChange(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-8 py-2.5 font-medium focus:outline-none focus:border-orange-500 transition-colors"
              >
                {outlets.map(outlet => (
                  <option key={outlet.id} value={outlet.id}>
                    {outlet.name} ({outlet.roCode})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <span className="text-xs text-slate-500 font-mono">No accessible outlets</span>
          )}

          <button
            type="button"
            onClick={() => selectedOutletId && fetchWorkspaceData(selectedOutletId)}
            disabled={loadingData || !selectedOutletId}
            className="p-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-300 border border-slate-800 rounded-xl text-xs transition-colors"
            title="Refresh workspace data"
          >
            <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin text-orange-400' : ''}`} />
          </button>

          {canWrite && (
            <button
              type="button"
              onClick={handleOpenCreateModal}
              disabled={!selectedOutletId}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-orange-500/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Create Due</span>
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-between text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="p-1 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-between text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="p-1 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Financial Summary Cards */}
      <MunicipalTaxSummaryPanel summary={summary} loading={loadingData} />

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
            <Filter className="w-3.5 h-3.5 text-orange-400" />
            <span>Filter Statutory Dues</span>
          </div>
          {(filters.taxType || filters.status || filters.assessmentFrequency || filters.fromDate || filters.toDate) && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="text-[11px] text-orange-400 hover:text-orange-300 font-mono transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* Tax Type */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase font-mono mb-1">
              Tax Type
            </label>
            <select
              value={filters.taxType}
              onChange={e => setFilters(prev => ({ ...prev, taxType: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-orange-500"
            >
              <option value="">All Tax Types</option>
              <option value="PROPERTY_TAX">Property Tax</option>
              <option value="TRADE_LICENSE_FEE">Trade License Fee</option>
              <option value="SIGNAGE_CHARGE">Signage Charge</option>
              <option value="LOCAL_AUTHORITY_DUE">Local Authority Due</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase font-mono mb-1">
              Status
            </label>
            <select
              value={filters.status}
              onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-orange-500"
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="PAID">Paid</option>
            </select>
          </div>

          {/* Assessment Frequency */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase font-mono mb-1">
              Frequency
            </label>
            <select
              value={filters.assessmentFrequency}
              onChange={e => setFilters(prev => ({ ...prev, assessmentFrequency: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-orange-500"
            >
              <option value="">All Frequencies</option>
              <option value="ANNUAL">Annual</option>
              <option value="QUARTERLY">Quarterly</option>
            </select>
          </div>

          {/* From Date */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase font-mono mb-1">
              From Due Date
            </label>
            <input
              type="date"
              value={filters.fromDate}
              onChange={e => setFilters(prev => ({ ...prev, fromDate: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-orange-500"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase font-mono mb-1">
              To Due Date
            </label>
            <input
              type="date"
              value={filters.toDate}
              onChange={e => setFilters(prev => ({ ...prev, toDate: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>
      </div>

      {/* Main Dues List */}
      <MunicipalTaxDuesPanel
        dues={dues}
        loading={loadingData}
        canWrite={canWrite}
        canPay={canPay}
        onSelectDue={handleSelectDue}
        onEditDue={handleOpenEditModal}
        onMarkPaid={handleOpenPaymentModal}
      />

      {/* Modals & Slide-over Drawers */}
      {isDueModalOpen && (
        <MunicipalTaxDueModal
          isOpen={isDueModalOpen}
          onClose={() => setIsDueModalOpen(false)}
          outletId={selectedOutletId}
          dueToEdit={dueToEdit}
          onSuccess={handleMutationSuccess}
        />
      )}

      {dueForPayment && (
        <MunicipalTaxPaymentModal
          isOpen={Boolean(dueForPayment)}
          onClose={() => setDueForPayment(null)}
          outletId={selectedOutletId}
          due={dueForPayment}
          onSuccess={handleMutationSuccess}
        />
      )}

      {selectedDueId && (
        <MunicipalTaxDetailPanel
          dueId={selectedDueId}
          outletId={selectedOutletId}
          onClose={() => setSelectedDueId(null)}
          refreshKey={detailRefreshKey}
          canWrite={canWrite}
          canPay={canPay}
          onEditDue={due => {
            setSelectedDueId(null);
            handleOpenEditModal(due);
          }}
          onMarkPaid={due => {
            setSelectedDueId(null);
            handleOpenPaymentModal(due);
          }}
        />
      )}
    </div>
  );
};
