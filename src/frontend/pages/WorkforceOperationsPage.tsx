import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Users,
  Building2,
  RefreshCw,
  Tag,
  Layers,
  Calendar,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  ClipboardCheck,
  Fuel,
  MapPin,
} from 'lucide-react';
import type {
  RetailOutlet,
  HrManpowerSummary,
  HrStaff,
  HrDesignation,
  HrManpowerSanction,
  HrRosterAssignment,
  ShiftTemplate,
} from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS, PermissionCode } from '../../shared/constants';
import { apiFetch } from '../services/api';
import {
  HrWorkspaceTab,
  HrFilterState,
  getResetHrFilters,
  getHrTabResetTargets,
  buildHrDesignationQueryParams,
  buildHrStaffQueryParams,
  buildHrRosterQueryParams,
  validateHrJoinedDateRange,
  validateHrRosterDateRange,
  canRequestHrStaffList,
  canRequestHrRosterList,
  getHrErrorMessage,
} from '../components/hr/hrUi';
import { HrManpowerSummaryPanel } from '../components/hr/HrManpowerSummaryPanel';
import { HrStaffPanel } from '../components/hr/HrStaffPanel';
import { HrStaffModal } from '../components/hr/HrStaffModal';
import { HrStaffDetailPanel } from '../components/hr/HrStaffDetailPanel';
import { HrDesignationsPanel } from '../components/hr/HrDesignationsPanel';
import { HrDesignationModal } from '../components/hr/HrDesignationModal';
import { HrManpowerPanel } from '../components/hr/HrManpowerPanel';
import { HrManpowerSanctionModal } from '../components/hr/HrManpowerSanctionModal';
import { HrRosterPanel } from '../components/hr/HrRosterPanel';
import { HrRosterModal } from '../components/hr/HrRosterModal';
import { HrRosterDetailPanel } from '../components/hr/HrRosterDetailPanel';
import { HrRosterCancelModal } from '../components/hr/HrRosterCancelModal';
import { HrAttendancePanel } from '../components/hr/HrAttendancePanel';
import { HrGeofencePanel } from '../components/hr/HrGeofencePanel';
import { HrNozzleAssignmentsPanel } from '../components/hr/HrNozzleAssignmentsPanel';

export const WorkforceOperationsPage: React.FC = () => {
  const { hasPermission } = useAuth();

  // Permission flags
  const canReadHr = hasPermission(PERMISSIONS.HR_READ as PermissionCode);
  const canWriteStaff = hasPermission(PERMISSIONS.HR_STAFF_WRITE as PermissionCode);
  const canWriteManpower = hasPermission(PERMISSIONS.HR_MANPOWER_WRITE as PermissionCode);
  const canWriteRoster = hasPermission(PERMISSIONS.HR_ROSTER_WRITE as PermissionCode);
  const canReadShiftTemplates = hasPermission(PERMISSIONS.SHIFT_TEMPLATES_READ as PermissionCode);
  const canReadAttendance = hasPermission(PERMISSIONS.HR_ATTENDANCE_READ as PermissionCode);
  const canWriteAttendance = hasPermission(PERMISSIONS.HR_ATTENDANCE_WRITE as PermissionCode);
  const canWriteGeofence = hasPermission(PERMISSIONS.HR_GEOFENCE_WRITE as PermissionCode);
  const canWriteNozzleAssignment = hasPermission(PERMISSIONS.HR_NOZZLE_ASSIGNMENT_WRITE as PermissionCode);
  const canReadNozzles = hasPermission(PERMISSIONS.NOZZLES_READ as PermissionCode);

  // Outlets
  const [outlets, setOutlets] = useState<RetailOutlet[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');
  const [isLoadingOutlets, setIsLoadingOutlets] = useState<boolean>(true);

  // Stale Request Protection Ref
  const activeOutletReqRef = useRef<string>('');

  // Active Tab
  const [activeTab, setActiveTab] = useState<HrWorkspaceTab>('staff');

  // Master Reference Data (Unfiltered)
  const [staffReferenceList, setStaffReferenceList] = useState<HrStaff[]>([]);
  const [designationReferenceList, setDesignationReferenceList] = useState<HrDesignation[]>([]);

  // Filtered Display Data
  const [staffList, setStaffList] = useState<HrStaff[]>([]);
  const [designationList, setDesignationList] = useState<HrDesignation[]>([]);
  const [rosterList, setRosterList] = useState<HrRosterAssignment[]>([]);

  // Core Data
  const [summary, setSummary] = useState<HrManpowerSummary | null>(null);
  const [sanctions, setSanctions] = useState<HrManpowerSanction[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);

  // Loading States
  const [isLoadingCore, setIsLoadingCore] = useState<boolean>(false);
  const [isLoadingStaff, setIsLoadingStaff] = useState<boolean>(false);
  const [isLoadingDesignations, setIsLoadingDesignations] = useState<boolean>(false);
  const [isLoadingRoster, setIsLoadingRoster] = useState<boolean>(false);
  const [isRefreshingAll, setIsRefreshingAll] = useState<boolean>(false);

  // Feedback Notification
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Filters
  const [filters, setFilters] = useState<HrFilterState>(getResetHrFilters());

  // Modals & Detail Drawers State
  // Staff
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [staffModalMode, setStaffModalMode] = useState<'create' | 'edit'>('create');
  const [editingStaff, setEditingStaff] = useState<HrStaff | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [staffDetailRefreshKey, setStaffDetailRefreshKey] = useState<number>(0);

  // Designation
  const [isDesignationModalOpen, setIsDesignationModalOpen] = useState(false);
  const [designationModalMode, setDesignationModalMode] = useState<'create' | 'edit'>('create');
  const [editingDesignation, setEditingDesignation] = useState<HrDesignation | null>(null);

  // Manpower Sanctions
  const [isSanctionModalOpen, setIsSanctionModalOpen] = useState(false);
  const [sanctionModalMode, setSanctionModalMode] = useState<'create' | 'edit'>('create');
  const [editingSanction, setEditingSanction] = useState<HrManpowerSanction | null>(null);
  const [initialSanctionDesignationId, setInitialSanctionDesignationId] = useState<string | null>(null);

  // Roster
  const [isRosterModalOpen, setIsRosterModalOpen] = useState(false);
  const [rosterModalMode, setRosterModalMode] = useState<'create' | 'edit'>('create');
  const [editingRoster, setEditingRoster] = useState<HrRosterAssignment | null>(null);
  const [selectedRosterId, setSelectedRosterId] = useState<string | null>(null);
  const [rosterDetailRefreshKey, setRosterDetailRefreshKey] = useState<number>(0);
  const [cancellingRoster, setCancellingRoster] = useState<HrRosterAssignment | null>(null);

  // Helper to show auto-dismissing notifications
  const showFeedback = useCallback((type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback(prev => (prev?.message === message ? null : prev));
    }, 4500);
  }, []);

  // Internal tab switch handler with state isolation
  const handleTabChange = (nextTab: HrWorkspaceTab) => {
    const targets = getHrTabResetTargets(nextTab);
    if (targets.closeStaffUi) {
      setSelectedStaffId(null);
      setEditingStaff(null);
      setIsStaffModalOpen(false);
    }
    if (targets.closeDesignationUi) {
      setEditingDesignation(null);
      setIsDesignationModalOpen(false);
    }
    if (targets.closeManpowerUi) {
      setEditingSanction(null);
      setInitialSanctionDesignationId(null);
      setIsSanctionModalOpen(false);
    }
    if (targets.closeRosterUi) {
      setSelectedRosterId(null);
      setEditingRoster(null);
      setIsRosterModalOpen(false);
      setCancellingRoster(null);
    }
    setActiveTab(nextTab);
  };

  // 1. Load accessible outlets on mount
  useEffect(() => {
    if (!canReadHr) {
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
          showFeedback('error', getHrErrorMessage(err));
        }
      } finally {
        if (isMounted) setIsLoadingOutlets(false);
      }
    };

    fetchOutlets();

    return () => {
      isMounted = false;
    };
  }, [canReadHr, showFeedback]);

  // 2. Focused Loaders (Instruction 11 & 12)
  const loadHrCoreData = useCallback(
    async (outletId: string) => {
      if (!outletId || !canReadHr) return;

      activeOutletReqRef.current = outletId;
      setIsLoadingCore(true);

      const summaryPromise = apiFetch<HrManpowerSummary>(
        `/api/v1/outlets/${outletId}/hr/manpower-summary`
      );
      const staffRefPromise = apiFetch<HrStaff[]>(`/api/v1/outlets/${outletId}/hr/staff`);
      const desigRefPromise = apiFetch<HrDesignation[]>(`/api/v1/outlets/${outletId}/hr/designations`);
      const sanctionsPromise = apiFetch<HrManpowerSanction[]>(
        `/api/v1/outlets/${outletId}/hr/manpower-sanctions`
      );
      const shiftTemplatesPromise = canReadShiftTemplates
        ? apiFetch<ShiftTemplate[]>(`/api/v1/outlets/${outletId}/shift-templates`)
        : Promise.resolve({ success: false, data: [] });

      try {
        const [
          summaryRes,
          staffRefRes,
          desigRefRes,
          sanctionsRes,
          shiftTemplatesRes,
        ] = await Promise.allSettled([
          summaryPromise,
          staffRefPromise,
          desigRefPromise,
          sanctionsPromise,
          shiftTemplatesPromise,
        ]);

        if (activeOutletReqRef.current !== outletId) return;

        if (summaryRes.status === 'fulfilled' && summaryRes.value.success && summaryRes.value.data) {
          setSummary(summaryRes.value.data);
        } else {
          setSummary(null);
        }

        if (
          staffRefRes.status === 'fulfilled' &&
          staffRefRes.value.success &&
          Array.isArray(staffRefRes.value.data)
        ) {
          setStaffReferenceList(staffRefRes.value.data);
        } else {
          setStaffReferenceList([]);
        }

        if (
          desigRefRes.status === 'fulfilled' &&
          desigRefRes.value.success &&
          Array.isArray(desigRefRes.value.data)
        ) {
          setDesignationReferenceList(desigRefRes.value.data);
        } else {
          setDesignationReferenceList([]);
        }

        if (
          sanctionsRes.status === 'fulfilled' &&
          sanctionsRes.value.success &&
          Array.isArray(sanctionsRes.value.data)
        ) {
          setSanctions(sanctionsRes.value.data);
        } else {
          setSanctions([]);
        }

        if (
          shiftTemplatesRes.status === 'fulfilled' &&
          shiftTemplatesRes.value.success &&
          Array.isArray(shiftTemplatesRes.value.data)
        ) {
          setShiftTemplates(shiftTemplatesRes.value.data);
        } else {
          setShiftTemplates([]);
        }
      } catch (err: any) {
        if (activeOutletReqRef.current === outletId) {
          showFeedback('error', getHrErrorMessage(err));
        }
      } finally {
        if (activeOutletReqRef.current === outletId) {
          setIsLoadingCore(false);
        }
      }
    },
    [canReadHr, canReadShiftTemplates, showFeedback]
  );

  const loadFilteredStaff = useCallback(
    async (outletId: string, staffFilters: HrFilterState['staff']) => {
      if (!outletId || !canReadHr) return;

      if (!canRequestHrStaffList(staffFilters)) {
        showFeedback('error', 'Joined From date cannot be after Joined To date.');
        return;
      }

      activeOutletReqRef.current = outletId;
      setIsLoadingStaff(true);
      const query = buildHrStaffQueryParams(staffFilters);

      try {
        const res = await apiFetch<HrStaff[]>(`/api/v1/outlets/${outletId}/hr/staff${query}`);
        if (activeOutletReqRef.current !== outletId) return;
        if (res.success && Array.isArray(res.data)) {
          setStaffList(res.data);
        } else {
          setStaffList([]);
        }
      } catch (err: any) {
        if (activeOutletReqRef.current === outletId) {
          showFeedback('error', getHrErrorMessage(err));
        }
      } finally {
        if (activeOutletReqRef.current === outletId) {
          setIsLoadingStaff(false);
        }
      }
    },
    [canReadHr, showFeedback]
  );

  const loadFilteredDesignations = useCallback(
    async (outletId: string, desigFilters: HrFilterState['designations']) => {
      if (!outletId || !canReadHr) return;

      activeOutletReqRef.current = outletId;
      setIsLoadingDesignations(true);
      const query = buildHrDesignationQueryParams(desigFilters);

      try {
        const res = await apiFetch<HrDesignation[]>(
          `/api/v1/outlets/${outletId}/hr/designations${query}`
        );
        if (activeOutletReqRef.current !== outletId) return;
        if (res.success && Array.isArray(res.data)) {
          setDesignationList(res.data);
        } else {
          setDesignationList([]);
        }
      } catch (err: any) {
        if (activeOutletReqRef.current === outletId) {
          showFeedback('error', getHrErrorMessage(err));
        }
      } finally {
        if (activeOutletReqRef.current === outletId) {
          setIsLoadingDesignations(false);
        }
      }
    },
    [canReadHr, showFeedback]
  );

  const loadFilteredRoster = useCallback(
    async (outletId: string, rosterFilters: HrFilterState['roster']) => {
      if (!outletId || !canReadHr) return;

      if (!canRequestHrRosterList(rosterFilters)) {
        showFeedback('error', 'From date cannot be after To date.');
        return;
      }

      activeOutletReqRef.current = outletId;
      setIsLoadingRoster(true);
      const query = buildHrRosterQueryParams(rosterFilters);

      try {
        const res = await apiFetch<HrRosterAssignment[]>(
          `/api/v1/outlets/${outletId}/hr/roster${query}`
        );
        if (activeOutletReqRef.current !== outletId) return;
        if (res.success && Array.isArray(res.data)) {
          setRosterList(res.data);
        } else {
          setRosterList([]);
        }
      } catch (err: any) {
        if (activeOutletReqRef.current === outletId) {
          showFeedback('error', getHrErrorMessage(err));
        }
      } finally {
        if (activeOutletReqRef.current === outletId) {
          setIsLoadingRoster(false);
        }
      }
    },
    [canReadHr, showFeedback]
  );

  // 3. Trigger initial core and filtered data load on outlet change
  useEffect(() => {
    if (selectedOutletId) {
      loadHrCoreData(selectedOutletId);
      loadFilteredStaff(selectedOutletId, filters.staff);
      loadFilteredDesignations(selectedOutletId, filters.designations);
      loadFilteredRoster(selectedOutletId, filters.roster);
    }
  }, [selectedOutletId, loadHrCoreData, loadFilteredStaff, loadFilteredDesignations, loadFilteredRoster]);

  // Effect for staff filter changes
  useEffect(() => {
    if (selectedOutletId) {
      loadFilteredStaff(selectedOutletId, filters.staff);
    }
  }, [selectedOutletId, filters.staff, loadFilteredStaff]);

  // Effect for designation filter changes
  useEffect(() => {
    if (selectedOutletId) {
      loadFilteredDesignations(selectedOutletId, filters.designations);
    }
  }, [selectedOutletId, filters.designations, loadFilteredDesignations]);

  // Effect for roster filter changes
  useEffect(() => {
    if (selectedOutletId) {
      loadFilteredRoster(selectedOutletId, filters.roster);
    }
  }, [selectedOutletId, filters.roster, loadFilteredRoster]);

  // Handle Outlet Change with complete state reset (Instruction 17)
  const handleOutletChange = (newOutletId: string) => {
    if (newOutletId === selectedOutletId) return;

    activeOutletReqRef.current = newOutletId;

    setSummary(null);
    setStaffReferenceList([]);
    setStaffList([]);
    setDesignationReferenceList([]);
    setDesignationList([]);
    setSanctions([]);
    setRosterList([]);
    setShiftTemplates([]);

    setSelectedStaffId(null);
    setEditingStaff(null);
    setIsStaffModalOpen(false);

    setEditingDesignation(null);
    setIsDesignationModalOpen(false);

    setEditingSanction(null);
    setInitialSanctionDesignationId(null);
    setIsSanctionModalOpen(false);

    setSelectedRosterId(null);
    setEditingRoster(null);
    setIsRosterModalOpen(false);
    setCancellingRoster(null);

    setFeedback(null);
    setFilters(getResetHrFilters());
    setStaffDetailRefreshKey(0);
    setRosterDetailRefreshKey(0);

    setSelectedOutletId(newOutletId);
  };

  // Filter change handlers
  const handleStaffFilterChange = (key: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      staff: {
        ...prev.staff,
        [key]: value,
      },
    }));
  };

  const handleDesignationFilterChange = (key: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      designations: {
        ...prev.designations,
        [key]: value,
      },
    }));
  };

  const handleRosterFilterChange = (key: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      roster: {
        ...prev.roster,
        [key]: value,
      },
    }));
  };

  // Date range validations
  const staffDateValidation = validateHrJoinedDateRange(
    filters.staff.joinedFrom,
    filters.staff.joinedTo
  );
  const rosterDateValidation = validateHrRosterDateRange(
    filters.roster.fromDate,
    filters.roster.toDate
  );

  // Mutation success handlers
  const handleStaffSaved = (saved: HrStaff) => {
    showFeedback(
      'success',
      `Staff member ${saved.fullName} (${saved.employeeCode}) saved successfully.`
    );
    setStaffDetailRefreshKey(k => k + 1);
    if (selectedOutletId) {
      loadHrCoreData(selectedOutletId);
      loadFilteredStaff(selectedOutletId, filters.staff);
    }
  };

  const handleDesignationSaved = (saved: HrDesignation) => {
    showFeedback(
      'success',
      `Designation ${saved.name} (${saved.code}) saved successfully.`
    );
    if (selectedOutletId) {
      loadHrCoreData(selectedOutletId);
      loadFilteredDesignations(selectedOutletId, filters.designations);
    }
  };

  const handleSanctionSaved = (saved: HrManpowerSanction) => {
    showFeedback('success', 'Manpower sanction saved successfully.');
    setInitialSanctionDesignationId(null);
    if (selectedOutletId) {
      loadHrCoreData(selectedOutletId);
    }
  };

  const handleRosterSaved = (saved: HrRosterAssignment) => {
    showFeedback('success', 'Shift roster assignment saved successfully.');
    setRosterDetailRefreshKey(k => k + 1);
    if (selectedOutletId) {
      loadFilteredRoster(selectedOutletId, filters.roster);
    }
  };

  const handleRosterCancelled = (cancelled: HrRosterAssignment) => {
    showFeedback('success', 'Shift roster assignment cancelled.');
    setRosterDetailRefreshKey(k => k + 1);
    if (selectedOutletId) {
      loadFilteredRoster(selectedOutletId, filters.roster);
    }
  };

  // Access restricted guard
  if (!canReadHr) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4 shadow-xl">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Access Restricted</h2>
        <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
          You do not have the required permissions (<code>hr.read</code>) to access the Workforce & Shift Roster management workspace.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Workspace Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-orange-500/20 shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Workforce & Shift Roster
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20">
                Phase 5A-2
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Staff enrollment, designations, sanctioned vs actual headcount & daily shift scheduling
            </p>
          </div>
        </div>

        {/* Outlet Selector & Refresh Button */}
        <div className="flex items-center gap-3">
          <div className="relative min-w-[220px] sm:min-w-[280px]">
            <Building2 className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <select
              value={selectedOutletId}
              onChange={e => handleOutletChange(e.target.value)}
              disabled={isLoadingOutlets || outlets.length === 0}
              className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 disabled:opacity-50 appearance-none shadow-sm cursor-pointer"
            >
              {outlets.map(o => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.roCode})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              if (selectedOutletId) {
                loadHrCoreData(selectedOutletId);
                loadFilteredStaff(selectedOutletId, filters.staff);
                loadFilteredDesignations(selectedOutletId, filters.designations);
                loadFilteredRoster(selectedOutletId, filters.roster);
              }
            }}
            disabled={isRefreshingAll || !selectedOutletId}
            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition disabled:opacity-50 shadow-sm"
            title="Refresh Workspace Data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshingAll ? 'animate-spin text-orange-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Auto-Dismiss Feedback Alert */}
      {feedback && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center gap-2.5 text-xs font-medium transition shadow-lg ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Authoritative Manpower Summary Panel */}
      <HrManpowerSummaryPanel summary={summary} isLoading={isLoadingCore} />

      {/* Internal Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => handleTabChange('staff')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
            activeTab === 'staff'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
              : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Staff Directory</span>
          {staffList.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'staff' ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {staffList.length}
            </span>
          )}
        </button>

        <button
          onClick={() => handleTabChange('designations')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
            activeTab === 'designations'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
              : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>Designations</span>
          {designationList.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'designations'
                  ? 'bg-orange-600 text-white'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {designationList.length}
            </span>
          )}
        </button>

        <button
          onClick={() => handleTabChange('manpower')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
            activeTab === 'manpower'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
              : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Manpower Allocation</span>
        </button>

        <button
          onClick={() => handleTabChange('roster')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
            activeTab === 'roster'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
              : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Shift Roster</span>
          {rosterList.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'roster' ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {rosterList.length}
            </span>
          )}
        </button>

        {canReadAttendance && (
          <>
            <button
              onClick={() => handleTabChange('attendance')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
                activeTab === 'attendance'
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>Attendance</span>
            </button>

            <button
              onClick={() => handleTabChange('geofence')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
                activeTab === 'geofence'
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <MapPin className="w-4 h-4" />
              <span>Geofence</span>
            </button>

            <button
              onClick={() => handleTabChange('nozzle-assignment')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
                activeTab === 'nozzle-assignment'
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Fuel className="w-4 h-4" />
              <span>Nozzle Assignment</span>
            </button>
          </>
        )}
      </div>

      {/* Main Tab Panels Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div
          className={
            (activeTab === 'staff' && selectedStaffId) || (activeTab === 'roster' && selectedRosterId)
              ? 'lg:col-span-7 xl:col-span-8 space-y-6'
              : 'lg:col-span-12 space-y-6'
          }
        >
          {/* TAB 1: STAFF DIRECTORY */}
          {activeTab === 'staff' && (
            <HrStaffPanel
              staffList={staffList}
              designations={designationReferenceList}
              isLoading={isLoadingStaff}
              canWriteStaff={canWriteStaff}
              filters={filters.staff}
              onFilterChange={handleStaffFilterChange}
              onClearFilters={() =>
                setFilters(prev => ({ ...prev, staff: getResetHrFilters().staff }))
              }
              dateRangeError={staffDateValidation.error}
              onAddStaff={() => {
                setStaffModalMode('create');
                setEditingStaff(null);
                setIsStaffModalOpen(true);
              }}
              onViewStaff={staff => setSelectedStaffId(staff.id)}
              onEditStaff={staff => {
                setStaffModalMode('edit');
                setEditingStaff(staff);
                setIsStaffModalOpen(true);
              }}
              selectedStaffId={selectedStaffId}
            />
          )}

          {/* TAB 2: DESIGNATIONS */}
          {activeTab === 'designations' && (
            <HrDesignationsPanel
              designations={designationList}
              isLoading={isLoadingDesignations}
              canWriteDesignation={canWriteStaff}
              filters={filters.designations}
              onFilterChange={handleDesignationFilterChange}
              onClearFilters={() =>
                setFilters(prev => ({
                  ...prev,
                  designations: getResetHrFilters().designations,
                }))
              }
              onAddDesignation={() => {
                setDesignationModalMode('create');
                setEditingDesignation(null);
                setIsDesignationModalOpen(true);
              }}
              onEditDesignation={d => {
                setDesignationModalMode('edit');
                setEditingDesignation(d);
                setIsDesignationModalOpen(true);
              }}
            />
          )}

          {/* TAB 3: MANPOWER ALLOCATION */}
          {activeTab === 'manpower' && (
            <HrManpowerPanel
              summary={summary}
              sanctions={sanctions}
              designations={designationReferenceList}
              isLoading={isLoadingCore}
              canWriteManpower={canWriteManpower}
              onAddSanction={() => {
                setSanctionModalMode('create');
                setEditingSanction(null);
                setInitialSanctionDesignationId(null);
                setIsSanctionModalOpen(true);
              }}
              onEditSanction={s => {
                setSanctionModalMode('edit');
                setEditingSanction(s);
                setInitialSanctionDesignationId(null);
                setIsSanctionModalOpen(true);
              }}
              onSetSanctionForDesignation={designationId => {
                setSanctionModalMode('create');
                setEditingSanction(null);
                setInitialSanctionDesignationId(designationId);
                setIsSanctionModalOpen(true);
              }}
            />
          )}

          {/* TAB 4: SHIFT ROSTER */}
          {activeTab === 'roster' && (
            <HrRosterPanel
              rosterList={rosterList}
              staffList={staffReferenceList}
              designations={designationReferenceList}
              shiftTemplates={shiftTemplates}
              isLoading={isLoadingRoster}
              canWriteRoster={canWriteRoster}
              canReadShiftTemplates={canReadShiftTemplates}
              filters={filters.roster}
              onFilterChange={handleRosterFilterChange}
              onClearFilters={() =>
                setFilters(prev => ({ ...prev, roster: getResetHrFilters().roster }))
              }
              dateRangeError={rosterDateValidation.error}
              onAddRoster={() => {
                setRosterModalMode('create');
                setEditingRoster(null);
                setIsRosterModalOpen(true);
              }}
              onViewRoster={r => setSelectedRosterId(r.id)}
              onEditRoster={r => {
                setRosterModalMode('edit');
                setEditingRoster(r);
                setIsRosterModalOpen(true);
              }}
              onCancelRoster={r => setCancellingRoster(r)}
              selectedRosterId={selectedRosterId}
            />
          )}

          {activeTab === 'attendance' && canReadAttendance && (
            <HrAttendancePanel
              outletId={selectedOutletId}
              canWriteAttendance={canWriteAttendance}
              staffList={staffReferenceList}
              shiftTemplates={shiftTemplates}
              showFeedback={showFeedback}
            />
          )}

          {activeTab === 'geofence' && canReadAttendance && (
            <HrGeofencePanel
              outletId={selectedOutletId}
              canWriteGeofence={canWriteGeofence}
              selectedOutlet={outlets.find(o => o.id === selectedOutletId)}
              showFeedback={showFeedback}
            />
          )}

          {activeTab === 'nozzle-assignment' && canReadAttendance && (
            <HrNozzleAssignmentsPanel
              outletId={selectedOutletId}
              canWriteNozzleAssignment={canWriteNozzleAssignment}
              staffList={staffReferenceList}
              shiftTemplates={shiftTemplates}
              showFeedback={showFeedback}
            />
          )}
        </div>

        {/* Right Side / Drawer Detail Panels */}
        {activeTab === 'staff' && selectedStaffId && (
          <div className="lg:col-span-5 xl:col-span-4 sticky top-6">
            <HrStaffDetailPanel
              staffId={selectedStaffId}
              outletId={selectedOutletId}
              refreshKey={staffDetailRefreshKey}
              onClose={() => setSelectedStaffId(null)}
              onEdit={staff => {
                setStaffModalMode('edit');
                setEditingStaff(staff);
                setIsStaffModalOpen(true);
              }}
              canEditStaff={canWriteStaff}
            />
          </div>
        )}

        {activeTab === 'roster' && selectedRosterId && (
          <div className="lg:col-span-5 xl:col-span-4 sticky top-6">
            <HrRosterDetailPanel
              rosterId={selectedRosterId}
              outletId={selectedOutletId}
              refreshKey={rosterDetailRefreshKey}
              onClose={() => setSelectedRosterId(null)}
              onEdit={r => {
                setRosterModalMode('edit');
                setEditingRoster(r);
                setIsRosterModalOpen(true);
              }}
              onCancelAssignment={r => setCancellingRoster(r)}
              canEditRoster={canWriteRoster}
            />
          </div>
        )}
      </div>

      {/* Modals */}
      <HrStaffModal
        isOpen={isStaffModalOpen}
        mode={staffModalMode}
        outletId={selectedOutletId}
        staff={editingStaff}
        designations={designationReferenceList}
        onClose={() => setIsStaffModalOpen(false)}
        onSuccess={handleStaffSaved}
      />

      <HrDesignationModal
        isOpen={isDesignationModalOpen}
        mode={designationModalMode}
        outletId={selectedOutletId}
        designation={editingDesignation}
        onClose={() => setIsDesignationModalOpen(false)}
        onSuccess={handleDesignationSaved}
      />

      <HrManpowerSanctionModal
        isOpen={isSanctionModalOpen}
        mode={sanctionModalMode}
        outletId={selectedOutletId}
        sanction={editingSanction}
        designations={designationReferenceList}
        existingSanctions={sanctions}
        initialDesignationId={initialSanctionDesignationId}
        onClose={() => {
          setIsSanctionModalOpen(false);
          setInitialSanctionDesignationId(null);
        }}
        onSuccess={handleSanctionSaved}
      />

      <HrRosterModal
        isOpen={isRosterModalOpen}
        mode={rosterModalMode}
        outletId={selectedOutletId}
        roster={editingRoster}
        staffList={staffReferenceList}
        shiftTemplates={shiftTemplates}
        canReadShiftTemplates={canReadShiftTemplates}
        existingRosterList={rosterList}
        onClose={() => setIsRosterModalOpen(false)}
        onSuccess={handleRosterSaved}
      />

      <HrRosterCancelModal
        isOpen={!!cancellingRoster}
        roster={cancellingRoster}
        onClose={() => setCancellingRoster(null)}
        onSuccess={handleRosterCancelled}
      />
    </div>
  );
};
