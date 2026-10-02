import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Wrench,
  Building2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Layers,
  Plus,
  ActivitySquare,
  Cpu
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import { PERMISSIONS } from '../../shared/constants';
import {
  RetailOutlet,
  EquipmentHealthSummary,
  EquipmentAsset,
  EquipmentTarget,
  EquipmentBreakdownTicket
} from '../../shared/types';
import { EquipmentHealthPanel } from '../components/equipment/EquipmentHealthPanel';
import { EquipmentTicketsPanel } from '../components/equipment/EquipmentTicketsPanel';
import { EquipmentAssetsPanel } from '../components/equipment/EquipmentAssetsPanel';
import { EquipmentTicketCreateModal } from '../components/equipment/EquipmentTicketCreateModal';
import { getEquipmentErrorMessage } from '../components/equipment/equipmentUi';

export const EquipmentOperationsPage: React.FC = () => {
  const { hasPermission } = useAuth();

  // Explicit permissions using exact constants
  const canRead = hasPermission(PERMISSIONS.EQUIPMENT_READ);
  const canWriteAssets = hasPermission(PERMISSIONS.EQUIPMENT_ASSETS_WRITE);
  const canCreateTicket = hasPermission(PERMISSIONS.EQUIPMENT_TICKETS_CREATE);
  const canManageTicket = hasPermission(PERMISSIONS.EQUIPMENT_TICKETS_MANAGE);
  const canSignoffTicket = hasPermission(PERMISSIONS.EQUIPMENT_TICKETS_SIGNOFF);
  const hasOutletsRead = hasPermission(PERMISSIONS.OUTLETS_READ);

  // Outlet State
  const [outlets, setOutlets] = useState<RetailOutlet[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');
  const [loadingOutlets, setLoadingOutlets] = useState<boolean>(true);

  // Equipment Workspace State
  const [healthSummary, setHealthSummary] = useState<EquipmentHealthSummary | null>(null);
  const [assets, setAssets] = useState<EquipmentAsset[]>([]);
  const [targets, setTargets] = useState<EquipmentTarget[]>([]);
  const [tickets, setTickets] = useState<EquipmentBreakdownTicket[]>([]);

  // Filter State
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [filterEquipmentType, setFilterEquipmentType] = useState<string>('');

  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'tickets' | 'assets'>('tickets');

  // Create Modal
  const [isCreateTicketOpen, setIsCreateTicketOpen] = useState<boolean>(false);

  // Feedback notifications
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Request guard to prevent stale responses from race conditions
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

  // Build query string for tickets without empty parameters
  const buildTicketQuery = (status: string, priority: string, eqType: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (priority) params.append('priority', priority);
    if (eqType) params.append('equipmentType', eqType);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  };

  // Fetch all equipment data for the selected outlet
  const loadOutletEquipmentData = useCallback(async (
    outletId: string,
    curStatus = filterStatus,
    curPriority = filterPriority,
    curEqType = filterEquipmentType,
    isSilent = false
  ) => {
    if (!outletId || !canRead) return;

    activeOutletReqRef.current = outletId;
    if (!isSilent) {
      setLoadingData(true);
    }

    try {
      const ticketQs = buildTicketQuery(curStatus, curPriority, curEqType);
      const [healthRes, assetsRes, targetsRes, ticketsRes] = await Promise.allSettled([
        apiFetch<EquipmentHealthSummary>(`/api/v1/outlets/${outletId}/equipment/health-summary`),
        apiFetch<EquipmentAsset[]>(`/api/v1/outlets/${outletId}/equipment/assets`),
        apiFetch<EquipmentTarget[]>(`/api/v1/outlets/${outletId}/equipment/targets`),
        apiFetch<EquipmentBreakdownTicket[]>(`/api/v1/outlets/${outletId}/equipment/tickets${ticketQs}`)
      ]);

      // If active outlet changed while fetching, discard stale response
      if (activeOutletReqRef.current !== outletId) {
        return;
      }

      if (healthRes.status === 'fulfilled' && healthRes.value.success && healthRes.value.data) {
        setHealthSummary(healthRes.value.data);
      } else if (healthRes.status === 'fulfilled' && !healthRes.value.success) {
        console.warn('Health summary fetch returned error:', healthRes.value.error);
      }

      if (assetsRes.status === 'fulfilled' && assetsRes.value.success && assetsRes.value.data) {
        setAssets(assetsRes.value.data);
      }

      if (targetsRes.status === 'fulfilled' && targetsRes.value.success && targetsRes.value.data) {
        setTargets(targetsRes.value.data);
      }

      if (ticketsRes.status === 'fulfilled' && ticketsRes.value.success && ticketsRes.value.data) {
        setTickets(ticketsRes.value.data);
      }
    } catch (err: any) {
      if (activeOutletReqRef.current === outletId) {
        console.error('Failed to load equipment data:', err);
        setErrorMessage(getEquipmentErrorMessage(err));
      }
    } finally {
      if (activeOutletReqRef.current === outletId) {
        setLoadingData(false);
      }
    }
  }, [canRead, filterStatus, filterPriority, filterEquipmentType]);

  // Handle Outlet Selection Change
  const handleOutletChange = (outletId: string) => {
    // Immediately clear stale datasets and modal states
    setSelectedOutletId(outletId);
    setHealthSummary(null);
    setAssets([]);
    setTargets([]);
    setTickets([]);
    setFilterStatus('');
    setFilterPriority('');
    setFilterEquipmentType('');
    setIsCreateTicketOpen(false);
    setErrorMessage(null);
  };

  // Trigger data load when selectedOutletId changes
  useEffect(() => {
    if (selectedOutletId && canRead) {
      loadOutletEquipmentData(selectedOutletId);
    }
  }, [selectedOutletId, canRead, loadOutletEquipmentData]);

  // Refresh tickets and health with current filters
  const handleRefreshTicketsAndHealth = async () => {
    if (!selectedOutletId) return;
    try {
      const ticketQs = buildTicketQuery(filterStatus, filterPriority, filterEquipmentType);
      const [healthRes, ticketsRes] = await Promise.allSettled([
        apiFetch<EquipmentHealthSummary>(`/api/v1/outlets/${selectedOutletId}/equipment/health-summary`),
        apiFetch<EquipmentBreakdownTicket[]>(`/api/v1/outlets/${selectedOutletId}/equipment/tickets${ticketQs}`)
      ]);
      if (healthRes.status === 'fulfilled' && healthRes.value.success && healthRes.value.data) {
        setHealthSummary(healthRes.value.data);
      }
      if (ticketsRes.status === 'fulfilled' && ticketsRes.value.success && ticketsRes.value.data) {
        setTickets(ticketsRes.value.data);
      }
    } catch (err) {
      console.error('Error refreshing tickets:', err);
    }
  };

  const handleRefreshAssetsAndTargets = async () => {
    if (!selectedOutletId) return;
    try {
      const [assetsRes, targetsRes, healthRes] = await Promise.allSettled([
        apiFetch<EquipmentAsset[]>(`/api/v1/outlets/${selectedOutletId}/equipment/assets`),
        apiFetch<EquipmentTarget[]>(`/api/v1/outlets/${selectedOutletId}/equipment/targets`),
        apiFetch<EquipmentHealthSummary>(`/api/v1/outlets/${selectedOutletId}/equipment/health-summary`)
      ]);
      if (assetsRes.status === 'fulfilled' && assetsRes.value.success && assetsRes.value.data) {
        setAssets(assetsRes.value.data);
      }
      if (targetsRes.status === 'fulfilled' && targetsRes.value.success && targetsRes.value.data) {
        setTargets(targetsRes.value.data);
      }
      if (healthRes.status === 'fulfilled' && healthRes.value.success && healthRes.value.data) {
        setHealthSummary(healthRes.value.data);
      }
    } catch (err) {
      console.error('Error refreshing assets and targets:', err);
    }
  };

  // Filter change handlers
  const handleFilterStatusChange = (newStatus: string) => {
    setFilterStatus(newStatus);
    if (selectedOutletId) {
      loadOutletEquipmentData(selectedOutletId, newStatus, filterPriority, filterEquipmentType, true);
    }
  };

  const handleFilterPriorityChange = (newPriority: string) => {
    setFilterPriority(newPriority);
    if (selectedOutletId) {
      loadOutletEquipmentData(selectedOutletId, filterStatus, newPriority, filterEquipmentType, true);
    }
  };

  const handleFilterEquipmentTypeChange = (newType: string) => {
    setFilterEquipmentType(newType);
    if (selectedOutletId) {
      loadOutletEquipmentData(selectedOutletId, filterStatus, filterPriority, newType, true);
    }
  };

  const handleClearFilters = () => {
    setFilterStatus('');
    setFilterPriority('');
    setFilterEquipmentType('');
    if (selectedOutletId) {
      loadOutletEquipmentData(selectedOutletId, '', '', '', true);
    }
  };

  // If user lacks EQUIPMENT_READ permission, render restricted access banner
  if (!canRead) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center max-w-2xl mx-auto shadow-2xl">
          <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-center mx-auto mb-4 text-rose-500">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Access Restricted</h2>
          <p className="text-sm text-slate-400 mb-6">
            You do not have permission (<code className="text-amber-400 font-mono text-xs">equipment.read</code>) to view equipment assets and breakdown operations. Please contact your system administrator.
          </p>
        </div>
      </div>
    );
  }

  const selectedOutlet = outlets.find((o) => o.id === selectedOutletId);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header & Context Selection */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 p-5 rounded-2xl border border-slate-800 backdrop-blur-md shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center text-amber-500 shrink-0 shadow-inner">
            <Wrench className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              Equipment & Breakdowns
              <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Phase 3C
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Forecourt equipment health, breakdown tickets, technician assignments & resolution ledger
            </p>
          </div>
        </div>

        {/* Outlet Selector & Refresh Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedOutletId}
              onChange={(e) => handleOutletChange(e.target.value)}
              disabled={loadingOutlets || outlets.length === 0}
              className="bg-transparent text-xs font-medium text-white focus:outline-none cursor-pointer max-w-[200px] truncate"
            >
              {loadingOutlets ? (
                <option value="">Loading Outlets...</option>
              ) : outlets.length === 0 ? (
                <option value="">No Accessible Outlets</option>
              ) : (
                outlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id} className="bg-slate-900 text-white">
                    {outlet.name} ({outlet.roCode})
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            onClick={() => selectedOutletId && loadOutletEquipmentData(selectedOutletId)}
            disabled={loadingData || !selectedOutletId}
            className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors"
            title="Refresh All Equipment Data"
          >
            <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin text-amber-400' : ''}`} />
          </button>

          {canCreateTicket && selectedOutletId && (
            <button
              onClick={() => setIsCreateTicketOpen(true)}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors shadow-lg shadow-rose-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>Report Breakdown</span>
            </button>
          )}
        </div>
      </div>

      {/* Global Notifications */}
      {errorMessage && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-400 flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-white text-xs font-semibold px-2 py-0.5 rounded bg-rose-500/20"
          >
            Dismiss
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-xs text-emerald-400 flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-400 hover:text-white text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/20"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* No Outlets Empty State */}
      {!loadingOutlets && outlets.length === 0 && (
        <div className="p-12 text-center bg-slate-900/60 border border-slate-800 rounded-2xl">
          <Building2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-300 mb-1">No Accessible Outlets</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            You do not currently have access to any retail outlets. Please check your role assignments and scope configuration.
          </p>
        </div>
      )}

      {selectedOutletId && (
        <>
          {/* Equipment Health KPI Summary */}
          <EquipmentHealthPanel
            summary={healthSummary}
            loading={loadingData && !healthSummary}
          />

          {/* Navigation Workspace Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-800 pb-1">
            <button
              onClick={() => setActiveTab('tickets')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'tickets'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <ActivitySquare className="w-4 h-4" />
              <span>Breakdowns & Tickets</span>
              {tickets.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300 font-mono">
                  {tickets.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('assets')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'assets'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>Auxiliary Assets</span>
              {assets.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300 font-mono">
                  {assets.length}
                </span>
              )}
            </button>
          </div>

          {/* Tab Content */}
          <div className="mt-4">
            {activeTab === 'tickets' && (
              <EquipmentTicketsPanel
                tickets={tickets}
                loading={loadingData}
                outletId={selectedOutletId}
                targets={targets}
                canCreateTicket={canCreateTicket}
                canManage={canManageTicket}
                canSignoff={canSignoffTicket}
                filterStatus={filterStatus}
                filterPriority={filterPriority}
                filterEquipmentType={filterEquipmentType}
                onFilterStatusChange={handleFilterStatusChange}
                onFilterPriorityChange={handleFilterPriorityChange}
                onFilterEquipmentTypeChange={handleFilterEquipmentTypeChange}
                onClearFilters={handleClearFilters}
                onRefreshData={handleRefreshTicketsAndHealth}
              />
            )}

            {activeTab === 'assets' && (
              <EquipmentAssetsPanel
                outletId={selectedOutletId}
                assets={assets}
                isLoading={loadingData}
                canWriteAssets={canWriteAssets}
                onRefresh={handleRefreshAssetsAndTargets}
                onAssetSaved={() => {
                  setSuccessMessage('Equipment asset saved successfully.');
                  handleRefreshAssetsAndTargets();
                }}
              />
            )}
          </div>
        </>
      )}

      {/* Ticket Create Modal */}
      {isCreateTicketOpen && selectedOutletId && (
        <EquipmentTicketCreateModal
          isOpen={isCreateTicketOpen}
          onClose={() => setIsCreateTicketOpen(false)}
          outletId={selectedOutletId}
          targets={targets}
          onTicketCreated={(createdTicket) => {
            setSuccessMessage(
              createdTicket
                ? `Breakdown ticket #${createdTicket.id.slice(0, 8)} reported successfully.`
                : 'Breakdown ticket reported successfully.'
            );
            handleRefreshTicketsAndHealth();
          }}
        />
      )}
    </div>
  );
};
