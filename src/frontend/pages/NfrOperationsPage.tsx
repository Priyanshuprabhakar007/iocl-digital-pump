import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Building2,
  RefreshCw,
  Layers,
  Users,
  FileText,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import type {
  RetailOutlet,
  NfrSummary,
  NfrSpace,
  NfrVendor,
  NfrLease,
  NfrRentDue,
} from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS, PermissionCode } from '../../shared/constants';
import { apiFetch } from '../services/api';
import {
  NfrWorkspaceTab,
  NfrFilterState,
  getResetNfrFilters,
  buildNfrSpaceQueryParams,
  buildNfrVendorQueryParams,
  buildNfrLeaseQueryParams,
  buildNfrRentDueQueryParams,
} from '../components/nfr/nfrUi';
import { NfrSummaryPanel } from '../components/nfr/NfrSummaryPanel';
import { NfrSpacesPanel } from '../components/nfr/NfrSpacesPanel';
import { NfrSpaceModal } from '../components/nfr/NfrSpaceModal';
import { NfrVendorsPanel } from '../components/nfr/NfrVendorsPanel';
import { NfrVendorModal } from '../components/nfr/NfrVendorModal';
import { NfrLeasesPanel } from '../components/nfr/NfrLeasesPanel';
import { NfrLeaseModal } from '../components/nfr/NfrLeaseModal';
import { NfrLeaseDetailPanel } from '../components/nfr/NfrLeaseDetailPanel';
import { NfrLeaseTerminateModal } from '../components/nfr/NfrLeaseTerminateModal';
import { NfrRentDuesPanel } from '../components/nfr/NfrRentDuesPanel';
import { NfrRentDueGenerateModal } from '../components/nfr/NfrRentDueGenerateModal';
import { NfrRentDueDetailPanel } from '../components/nfr/NfrRentDueDetailPanel';
import { NfrRentPaymentModal } from '../components/nfr/NfrRentPaymentModal';

export const NfrOperationsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canReadNfr = hasPermission(PERMISSIONS.NFR_READ as PermissionCode);

  // Outlets
  const [outlets, setOutlets] = useState<RetailOutlet[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');
  const [isLoadingOutlets, setIsLoadingOutlets] = useState<boolean>(true);

  // Stale Request Protection Ref
  const activeOutletReqRef = useRef<string>('');

  // Active Tab
  const [activeTab, setActiveTab] = useState<NfrWorkspaceTab>('spaces');

  // Core Data
  const [summary, setSummary] = useState<NfrSummary | null>(null);
  const [spaces, setSpaces] = useState<NfrSpace[]>([]);
  const [vendors, setVendors] = useState<NfrVendor[]>([]);
  const [leases, setLeases] = useState<NfrLease[]>([]);
  const [rentDues, setRentDues] = useState<NfrRentDue[]>([]);

  // Loading States
  const [isLoadingSummary, setIsLoadingSummary] = useState<boolean>(false);
  const [isLoadingList, setIsLoadingList] = useState<boolean>(false);

  // Feedback Notification
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Filters
  const [filters, setFilters] = useState<NfrFilterState>(getResetNfrFilters());

  // Modals & Drawers State
  const [isSpaceModalOpen, setIsSpaceModalOpen] = useState(false);
  const [editingSpace, setEditingSpace] = useState<NfrSpace | null>(null);

  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<NfrVendor | null>(null);

  const [isLeaseModalOpen, setIsLeaseModalOpen] = useState(false);
  const [editingLease, setEditingLease] = useState<NfrLease | null>(null);

  const [selectedLeaseId, setSelectedLeaseId] = useState<string | null>(null);
  const [leaseDetailRefreshKey, setLeaseDetailRefreshKey] = useState<number>(0);

  const [terminatingLease, setTerminatingLease] = useState<NfrLease | null>(null);
  const [generatingDueLease, setGeneratingDueLease] = useState<NfrLease | null>(null);

  const [selectedDueId, setSelectedDueId] = useState<string | null>(null);
  const [rentDueDetailRefreshKey, setRentDueDetailRefreshKey] = useState<number>(0);
  const [payingDue, setPayingDue] = useState<NfrRentDue | null>(null);

  // Helper to show auto-dismissing notifications
  const showFeedback = useCallback((type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  }, []);

  // 1. Load accessible outlets on mount
  useEffect(() => {
    if (!canReadNfr) {
      setIsLoadingOutlets(false);
      return;
    }

    let isMounted = true;
    const fetchOutlets = async () => {
      try {
        const res = await apiFetch<RetailOutlet[]>('/api/v1/outlets');
        if (isMounted && res.success && Array.isArray(res.data) && res.data.length > 0) {
          setOutlets(res.data);
          const firstId = res.data[0].id;
          activeOutletReqRef.current = firstId;
          setSelectedOutletId(firstId);
        }
      } catch (err: any) {
        if (isMounted) {
          showFeedback('error', 'Failed to load accessible retail outlets.');
        }
      } finally {
        if (isMounted) {
          setIsLoadingOutlets(false);
        }
      }
    };

    fetchOutlets();

    return () => {
      isMounted = false;
    };
  }, [canReadNfr, showFeedback]);

  // Function to load all workspace data for current outlet and filters
  const loadWorkspaceData = useCallback(async (outletId: string, currentFilters: NfrFilterState) => {
    if (!outletId) return;

    setIsLoadingSummary(true);
    setIsLoadingList(true);

    try {
      const spaceQuery = buildNfrSpaceQueryParams(currentFilters.spaces);
      const vendorQuery = buildNfrVendorQueryParams(currentFilters.vendors);
      const leaseQuery = buildNfrLeaseQueryParams(currentFilters.leases);
      const dueQuery = buildNfrRentDueQueryParams(currentFilters.rentDues);

      const [summaryRes, spacesRes, vendorsRes, leasesRes, duesRes] = await Promise.allSettled([
        apiFetch<NfrSummary>(`/api/v1/outlets/${outletId}/nfr/summary`),
        apiFetch<NfrSpace[]>(`/api/v1/outlets/${outletId}/nfr/spaces${spaceQuery}`),
        apiFetch<NfrVendor[]>(`/api/v1/outlets/${outletId}/nfr/vendors${vendorQuery}`),
        apiFetch<NfrLease[]>(`/api/v1/outlets/${outletId}/nfr/leases${leaseQuery}`),
        apiFetch<NfrRentDue[]>(`/api/v1/outlets/${outletId}/nfr/rent-dues${dueQuery}`),
      ]);

      // Guard against stale response if user switched outlets during fetch
      if (activeOutletReqRef.current !== outletId) {
        return;
      }

      if (summaryRes.status === 'fulfilled' && summaryRes.value.success && summaryRes.value.data) {
        setSummary(summaryRes.value.data);
      }
      if (spacesRes.status === 'fulfilled' && spacesRes.value.success && Array.isArray(spacesRes.value.data)) {
        setSpaces(spacesRes.value.data);
      }
      if (vendorsRes.status === 'fulfilled' && vendorsRes.value.success && Array.isArray(vendorsRes.value.data)) {
        setVendors(vendorsRes.value.data);
      }
      if (leasesRes.status === 'fulfilled' && leasesRes.value.success && Array.isArray(leasesRes.value.data)) {
        setLeases(leasesRes.value.data);
      }
      if (duesRes.status === 'fulfilled' && duesRes.value.success && Array.isArray(duesRes.value.data)) {
        setRentDues(duesRes.value.data);
      }
    } catch (err: any) {
      if (activeOutletReqRef.current === outletId) {
        showFeedback('error', 'Error refreshing NFR workspace records.');
      }
    } finally {
      if (activeOutletReqRef.current === outletId) {
        setIsLoadingSummary(false);
        setIsLoadingList(false);
      }
    }
  }, [showFeedback]);

  // 2. Fetch data whenever selected outlet or relevant filter changes
  useEffect(() => {
    if (!selectedOutletId || !canReadNfr) return;
    loadWorkspaceData(selectedOutletId, filters);
  }, [selectedOutletId, filters, canReadNfr, loadWorkspaceData]);

  // Handle Outlet Change with Instant State Reset
  const handleOutletChange = (newOutletId: string) => {
    if (newOutletId === selectedOutletId) return;

    // Immediately set ref before updating state to drop any in-flight requests
    activeOutletReqRef.current = newOutletId;

    // Clear all panel data and open states immediately
    setSummary(null);
    setSpaces([]);
    setVendors([]);
    setLeases([]);
    setRentDues([]);

    setIsSpaceModalOpen(false);
    setEditingSpace(null);
    setIsVendorModalOpen(false);
    setEditingVendor(null);
    setIsLeaseModalOpen(false);
    setEditingLease(null);
    setSelectedLeaseId(null);
    setTerminatingLease(null);
    setGeneratingDueLease(null);
    setSelectedDueId(null);
    setPayingDue(null);
    setFeedback(null);

    // Reset filters
    setFilters(getResetNfrFilters());

    setSelectedOutletId(newOutletId);
  };

  // Refresh current workspace
  const handleRefresh = () => {
    if (selectedOutletId) {
      loadWorkspaceData(selectedOutletId, filters);
      setLeaseDetailRefreshKey((k) => k + 1);
      setRentDueDetailRefreshKey((k) => k + 1);
    }
  };

  // Access check
  if (!canReadNfr) {
    return (
      <div className="p-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-lg mx-auto">
          <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-100 mb-2">Access Restricted</h2>
          <p className="text-sm text-slate-400">
            You do not have permission to view Non-Fuel Revenue (NFR) and Lease Management operations. Contact your administrator if you require access.
          </p>
        </div>
      </div>
    );
  }

  const selectedPayingLease = payingDue ? leases.find((l) => l.id === payingDue.leaseId) : undefined;
  const selectedPayingSpace = selectedPayingLease
    ? spaces.find((s) => s.id === selectedPayingLease.spaceId)
    : undefined;
  const selectedPayingVendor = selectedPayingLease
    ? vendors.find((v) => v.id === selectedPayingLease.vendorId)
    : undefined;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Outlet Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-500">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-100">
                NFR & Lease Operations
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Manage commercial spaces, vendor agreements, and monthly rent ledger collections.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* Outlet Selector */}
            <div className="flex-1 md:w-64">
              <select
                value={selectedOutletId}
                onChange={(e) => handleOutletChange(e.target.value)}
                disabled={isLoadingOutlets || outlets.length === 0}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              >
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.roCode})
                  </option>
                ))}
              </select>
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isLoadingSummary || isLoadingList}
              title="Refresh NFR Workspace"
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl transition disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoadingSummary || isLoadingList ? 'animate-spin text-amber-400' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {feedback && (
          <div
            className={`mt-4 p-3 rounded-xl flex items-center gap-2.5 text-xs border ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}
      </div>

      {/* NFR Financial & Operational Summary */}
      <NfrSummaryPanel summary={summary} loading={isLoadingSummary} />

      {/* Tabs Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-1.5 shadow-sm">
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('spaces')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
              activeTab === 'spaces'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>NFR Spaces ({spaces.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('vendors')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
              activeTab === 'vendors'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Vendors ({vendors.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('leases')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
              activeTab === 'leases'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Lease Agreements ({leases.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rent-dues')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
              activeTab === 'rent-dues'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Rent Dues & Collections ({rentDues.length})</span>
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      <div>
        {activeTab === 'spaces' && (
          <NfrSpacesPanel
            spaces={spaces}
            loading={isLoadingList}
            filters={filters.spaces}
            onFilterChange={(newF: Partial<{ nfrType: string; status: string }>) =>
              setFilters((prev) => ({ ...prev, spaces: { ...prev.spaces, ...newF } }))
            }
            onResetFilters={() =>
              setFilters((prev) => ({
                ...prev,
                spaces: { nfrType: '', status: '' },
              }))
            }
            onCreateSpace={() => {
              setEditingSpace(null);
              setIsSpaceModalOpen(true);
            }}
            onEditSpace={(space: NfrSpace) => {
              setEditingSpace(space);
              setIsSpaceModalOpen(true);
            }}
          />
        )}

        {activeTab === 'vendors' && (
          <NfrVendorsPanel
            vendors={vendors}
            loading={isLoadingList}
            filters={filters.vendors}
            onFilterChange={(newF: Partial<{ search: string; status: string }>) =>
              setFilters((prev) => ({ ...prev, vendors: { ...prev.vendors, ...newF } }))
            }
            onResetFilters={() =>
              setFilters((prev) => ({
                ...prev,
                vendors: { search: '', status: '' },
              }))
            }
            onCreateVendor={() => {
              setEditingVendor(null);
              setIsVendorModalOpen(true);
            }}
            onEditVendor={(vendor: NfrVendor) => {
              setEditingVendor(vendor);
              setIsVendorModalOpen(true);
            }}
          />
        )}

        {activeTab === 'leases' && (
          <NfrLeasesPanel
            leases={leases}
            spaces={spaces}
            vendors={vendors}
            isLoading={isLoadingList}
            filters={filters.leases}
            onFilterChange={(newF) =>
              setFilters((prev) => ({ ...prev, leases: { ...prev.leases, ...newF } }))
            }
            onResetFilters={() =>
              setFilters((prev) => ({
                ...prev,
                leases: {
                  spaceId: '',
                  vendorId: '',
                  status: '',
                  nfrType: '',
                  expiredOnly: false,
                },
              }))
            }
            onCreateLease={() => {
              setEditingLease(null);
              setIsLeaseModalOpen(true);
            }}
            onEditLease={(lease) => {
              setEditingLease(lease);
              setIsLeaseModalOpen(true);
            }}
            onTerminateLease={(lease) => {
              setTerminatingLease(lease);
            }}
            onSelectLease={(lease) => {
              setSelectedLeaseId(lease.id);
            }}
            onGenerateDue={(lease) => {
              setGeneratingDueLease(lease);
            }}
          />
        )}

        {activeTab === 'rent-dues' && (
          <NfrRentDuesPanel
            rentDues={rentDues}
            leases={leases}
            spaces={spaces}
            vendors={vendors}
            isLoading={isLoadingList}
            filters={filters.rentDues}
            onFilterChange={(newF) =>
              setFilters((prev) => ({ ...prev, rentDues: { ...prev.rentDues, ...newF } }))
            }
            onResetFilters={() =>
              setFilters((prev) => ({
                ...prev,
                rentDues: {
                  leaseId: '',
                  vendorId: '',
                  spaceId: '',
                  billingMonth: '',
                  paymentStatus: '',
                  overdueOnly: false,
                  fromDate: '',
                  toDate: '',
                },
              }))
            }
            onSelectDue={(due) => {
              setSelectedDueId(due.id);
            }}
            onRecordPayment={(due) => {
              setPayingDue(due);
            }}
          />
        )}
      </div>

      {/* Space Modal (Create/Edit) */}
      <NfrSpaceModal
        isOpen={isSpaceModalOpen}
        spaceToEdit={editingSpace}
        outletId={selectedOutletId}
        onClose={() => {
          setIsSpaceModalOpen(false);
          setEditingSpace(null);
        }}
        onSuccess={(msg: string) => {
          setIsSpaceModalOpen(false);
          setEditingSpace(null);
          showFeedback('success', msg);
          loadWorkspaceData(selectedOutletId, filters);
        }}
      />

      {/* Vendor Modal (Create/Edit) */}
      <NfrVendorModal
        isOpen={isVendorModalOpen}
        vendorToEdit={editingVendor}
        outletId={selectedOutletId}
        onClose={() => {
          setIsVendorModalOpen(false);
          setEditingVendor(null);
        }}
        onSuccess={(msg: string) => {
          setIsVendorModalOpen(false);
          setEditingVendor(null);
          showFeedback('success', msg);
          loadWorkspaceData(selectedOutletId, filters);
        }}
      />

      {/* Lease Modal (Create/Edit) */}
      <NfrLeaseModal
        isOpen={isLeaseModalOpen}
        leaseToEdit={editingLease}
        outletId={selectedOutletId}
        spaces={spaces}
        vendors={vendors}
        onClose={() => {
          setIsLeaseModalOpen(false);
          setEditingLease(null);
        }}
        onSuccess={(msg: string) => {
          setIsLeaseModalOpen(false);
          setEditingLease(null);
          showFeedback('success', msg);
          loadWorkspaceData(selectedOutletId, filters);
          setLeaseDetailRefreshKey((k) => k + 1);
        }}
        onConflict={() => {
          setIsLeaseModalOpen(false);
          setEditingLease(null);
          loadWorkspaceData(selectedOutletId, filters);
        }}
      />

      {/* Lease Detail Drawer */}
      {selectedLeaseId && (
        <NfrLeaseDetailPanel
          leaseId={selectedLeaseId}
          outletId={selectedOutletId}
          refreshKey={leaseDetailRefreshKey}
          spaces={spaces}
          vendors={vendors}
          onClose={() => setSelectedLeaseId(null)}
          onEditLease={(lease) => {
            setEditingLease(lease);
            setIsLeaseModalOpen(true);
          }}
          onTerminateLease={(lease) => {
            setTerminatingLease(lease);
          }}
          onGenerateDue={(lease) => {
            setGeneratingDueLease(lease);
          }}
        />
      )}

      {/* Lease Terminate Modal */}
      {terminatingLease && (
        <NfrLeaseTerminateModal
          lease={terminatingLease}
          onClose={() => setTerminatingLease(null)}
          onSuccess={(msg) => {
            setTerminatingLease(null);
            showFeedback('success', msg);
            loadWorkspaceData(selectedOutletId, filters);
            setLeaseDetailRefreshKey((k) => k + 1);
          }}
          onConflict={() => {
            setTerminatingLease(null);
            loadWorkspaceData(selectedOutletId, filters);
            setLeaseDetailRefreshKey((k) => k + 1);
          }}
        />
      )}

      {/* Rent Due Generate Modal */}
      {generatingDueLease && (
        <NfrRentDueGenerateModal
          lease={generatingDueLease}
          spaces={spaces}
          vendors={vendors}
          onClose={() => setGeneratingDueLease(null)}
          onSuccess={(msg) => {
            setGeneratingDueLease(null);
            showFeedback('success', msg);
            loadWorkspaceData(selectedOutletId, filters);
          }}
        />
      )}

      {/* Rent Due Detail Drawer */}
      {selectedDueId && (
        <NfrRentDueDetailPanel
          dueId={selectedDueId}
          outletId={selectedOutletId}
          refreshKey={rentDueDetailRefreshKey}
          leases={leases}
          spaces={spaces}
          vendors={vendors}
          onClose={() => setSelectedDueId(null)}
          onRecordPayment={(due) => {
            setPayingDue(due);
          }}
        />
      )}

      {/* Rent Payment Modal */}
      {payingDue && (
        <NfrRentPaymentModal
          due={payingDue}
          outletId={selectedOutletId}
          lease={selectedPayingLease}
          space={selectedPayingSpace}
          vendor={selectedPayingVendor}
          onClose={() => setPayingDue(null)}
          onSuccess={(msg) => {
            setPayingDue(null);
            showFeedback('success', msg);
            loadWorkspaceData(selectedOutletId, filters);
            setRentDueDetailRefreshKey((k) => k + 1);
          }}
          onConflict={() => {
            setPayingDue(null);
            loadWorkspaceData(selectedOutletId, filters);
            setRentDueDetailRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
};
