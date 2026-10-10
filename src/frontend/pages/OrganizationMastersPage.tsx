import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import {
  Department,
  Officer,
  ServiceProvider,
  RetailOutlet,
  State,
  Division,
  SalesArea,
  OutletServiceProviderAssignment,
} from '../../shared/types';
import { PERMISSIONS } from '../../shared/constants';
import {
  Building2,
  Users,
  Briefcase,
  Store,
  AlertCircle,
  CheckCircle2,
  Layers,
  ShieldAlert,
} from 'lucide-react';
import {
  OrgWorkspaceTab,
  HierarchyContext,
  canWriteGlobalOrgMasters,
  canWriteOfficerPostings,
  canWriteOutletAssignments,
  mapOrgErrorMessage,
} from '../components/org/orgUi';
import { OrgDepartmentsPanel } from '../components/org/OrgDepartmentsPanel';
import { OrgDepartmentModal } from '../components/org/OrgDepartmentModal';
import { OrgOfficersPanel } from '../components/org/OrgOfficersPanel';
import { OrgOfficerModal } from '../components/org/OrgOfficerModal';
import { OrgOfficerDetailPanel } from '../components/org/OrgOfficerDetailPanel';
import { OrgServiceProvidersPanel } from '../components/org/OrgServiceProvidersPanel';
import { OrgServiceProviderModal } from '../components/org/OrgServiceProviderModal';
import { OrgServiceProviderDetailPanel } from '../components/org/OrgServiceProviderDetailPanel';
import { OrgOutletAssignmentsPanel } from '../components/org/OrgOutletAssignmentsPanel';
import { OrgOutletAssignmentModal } from '../components/org/OrgOutletAssignmentModal';

export const OrganizationMastersPage: React.FC = () => {
  const { hasPermission, userCtx } = useAuth();

  // Permission checks
  const canRead = hasPermission(PERMISSIONS.ORG_MASTERS_READ);
  const canWriteGlobal = canWriteGlobalOrgMasters(hasPermission, userCtx);
  const canWritePostings = canWriteOfficerPostings(hasPermission);
  const canWriteAssignments = canWriteOutletAssignments(hasPermission);

  // Active workspace tab
  const [activeTab, setActiveTab] = useState<OrgWorkspaceTab>('departments');

  // Master lists
  const [departments, setDepartments] = useState<Department[]>([]);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [serviceProviders, setServiceProviders] = useState<ServiceProvider[]>([]);
  const [outlets, setOutlets] = useState<RetailOutlet[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [salesAreas, setSalesAreas] = useState<SalesArea[]>([]);

  // Selected outlet for assignments tab
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');
  const [outletAssignments, setOutletAssignments] = useState<OutletServiceProviderAssignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  // Detail Drilldown selections
  const [selectedOfficer, setSelectedOfficer] = useState<Officer | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ServiceProvider | null>(null);

  // Loading & Feedback
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Modal Open states
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [deptToEdit, setDeptToEdit] = useState<Department | null>(null);

  const [officerModalOpen, setOfficerModalOpen] = useState(false);
  const [officerToEdit, setOfficerToEdit] = useState<Officer | null>(null);

  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [providerToEdit, setProviderToEdit] = useState<ServiceProvider | null>(null);

  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [assignmentToEdit, setAssignmentToEdit] = useState<OutletServiceProviderAssignment | null>(
    null
  );

  const hierarchyContext: HierarchyContext = {
    states,
    divisions,
    salesAreas,
    outlets,
  };

  // 1. Initial Load of Reference Data
  const loadInitialData = async () => {
    setLoadingInitial(true);
    try {
      const [deptRes, offRes, provRes, outRes, stRes, divRes, saRes] = await Promise.all([
        apiFetch<Department[]>('/api/v1/org/departments'),
        apiFetch<Officer[]>('/api/v1/org/officers'),
        apiFetch<ServiceProvider[]>('/api/v1/org/service-providers'),
        apiFetch<RetailOutlet[]>('/api/v1/outlets'),
        apiFetch<State[]>('/api/v1/hierarchy/states'),
        apiFetch<Division[]>('/api/v1/hierarchy/divisions'),
        apiFetch<SalesArea[]>('/api/v1/hierarchy/sales-areas'),
      ]);

      if (deptRes.data) setDepartments(deptRes.data);
      if (offRes.data) setOfficers(offRes.data);
      if (provRes.data) setServiceProviders(provRes.data);

      if (outRes.data) {
        setOutlets(outRes.data);
        if (outRes.data.length > 0 && !selectedOutletId) {
          setSelectedOutletId(outRes.data[0].id);
        }
      }

      if (stRes.data) setStates(stRes.data);
      if (divRes.data) setDivisions(divRes.data);
      if (saRes.data) setSalesAreas(saRes.data);
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: 'Failed to synchronize organization records from backend.',
      });
    } finally {
      setLoadingInitial(false);
    }
  };

  useEffect(() => {
    if (canRead) {
      loadInitialData();
    }
  }, [canRead]);

  // 2. Fetch assignments whenever selectedOutletId changes or on demand
  const fetchOutletAssignments = async (outletId: string) => {
    if (!outletId) {
      setOutletAssignments([]);
      return;
    }
    setLoadingAssignments(true);
    try {
      const res = await apiFetch<OutletServiceProviderAssignment[]>(
        `/api/v1/org/outlets/${outletId}/service-providers`
      );
      if (res.success && res.data) {
        setOutletAssignments(res.data);
      } else {
        setOutletAssignments([]);
      }
    } catch {
      setOutletAssignments([]);
    } finally {
      setLoadingAssignments(false);
    }
  };

  useEffect(() => {
    if (selectedOutletId && activeTab === 'outlet-assignments') {
      fetchOutletAssignments(selectedOutletId);
    }
  }, [selectedOutletId, activeTab]);

  // Refresh helper for departments
  const refreshDepartments = async () => {
    const res = await apiFetch<Department[]>('/api/v1/org/departments');
    if (res.success && res.data) setDepartments(res.data);
  };

  // Refresh helper for officers
  const refreshOfficers = async () => {
    const res = await apiFetch<Officer[]>('/api/v1/org/officers');
    if (res.success && res.data) {
      setOfficers(res.data);
      if (selectedOfficer) {
        const updated = res.data.find((o) => o.id === selectedOfficer.id);
        if (updated) setSelectedOfficer(updated);
      }
    }
  };

  // Refresh helper for service providers
  const refreshServiceProviders = async () => {
    const res = await apiFetch<ServiceProvider[]>('/api/v1/org/service-providers');
    if (res.success && res.data) {
      setServiceProviders(res.data);
      if (selectedProvider) {
        const updated = res.data.find((p) => p.id === selectedProvider.id);
        if (updated) setSelectedProvider(updated);
      }
    }
  };

  // Handler: Save Department
  const handleSaveDepartment = async (payload: any) => {
    try {
      if (deptToEdit) {
        const res = await apiFetch(`/api/v1/org/departments/${deptToEdit.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        if (res.success) {
          await refreshDepartments();
          setFeedbackMsg({ type: 'success', text: 'Department successfully updated.' });
          return { success: true };
        }
        return { success: false, error: res.error?.message };
      } else {
        const res = await apiFetch('/api/v1/org/departments', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (res.success) {
          await refreshDepartments();
          setFeedbackMsg({ type: 'success', text: 'Department registered successfully.' });
          return { success: true };
        }
        return { success: false, error: res.error?.message };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  // Handler: Save Officer
  const handleSaveOfficer = async (payload: any) => {
    try {
      if (officerToEdit) {
        const res = await apiFetch(`/api/v1/org/officers/${officerToEdit.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        if (res.success) {
          await refreshOfficers();
          setFeedbackMsg({ type: 'success', text: 'Officer profile updated successfully.' });
          return { success: true };
        }
        return { success: false, error: res.error?.message };
      } else {
        const res = await apiFetch('/api/v1/org/officers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (res.success) {
          await refreshOfficers();
          setFeedbackMsg({ type: 'success', text: 'Officer enpanelled successfully.' });
          return { success: true };
        }
        return { success: false, error: res.error?.message };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  // Handler: Save Service Provider
  const handleSaveServiceProvider = async (payload: any) => {
    try {
      if (providerToEdit) {
        const res = await apiFetch(`/api/v1/org/service-providers/${providerToEdit.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        if (res.success) {
          await refreshServiceProviders();
          setFeedbackMsg({ type: 'success', text: 'Service provider updated successfully.' });
          return { success: true };
        }
        return { success: false, error: res.error?.message };
      } else {
        const res = await apiFetch('/api/v1/org/service-providers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (res.success) {
          await refreshServiceProviders();
          setFeedbackMsg({ type: 'success', text: 'Service provider enrolled successfully.' });
          return { success: true };
        }
        return { success: false, error: res.error?.message };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  // Handler: Save Outlet Assignment
  const handleSaveOutletAssignment = async (payload: any) => {
    try {
      if (assignmentToEdit) {
        const res = await apiFetch(
          `/api/v1/org/outlet-service-provider-assignments/${assignmentToEdit.id}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload),
          }
        );
        if (res.success) {
          if (selectedOutletId) await fetchOutletAssignments(selectedOutletId);
          setFeedbackMsg({ type: 'success', text: 'Outlet deployment updated successfully.' });
          return { success: true };
        }
        return { success: false, error: res.error?.message };
      } else {
        const res = await apiFetch(`/api/v1/org/outlets/${payload.outletId}/service-providers`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (res.success) {
          setSelectedOutletId(payload.outletId);
          await fetchOutletAssignments(payload.outletId);
          setFeedbackMsg({ type: 'success', text: 'Service provider deployed to outlet.' });
          return { success: true };
        }
        return { success: false, error: res.error?.message };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  // Permission Guard
  if (!canRead) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center max-w-lg mx-auto mt-12">
        <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h3 className="text-base font-bold text-white mb-2">Access Denied</h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          You do not have permission (<span className="font-mono text-orange-400">org.masters.read</span>)
          to access Organization Management records. Please contact your system administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <Layers className="w-6 h-6 text-orange-500" />
            <h1 className="text-xl font-extrabold text-white tracking-tight">
              Organization Management
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Departments, IOCL officers, hierarchy postings and outlet service providers
          </p>
        </div>

        {/* Global Scope Notice if scoped user */}
        {!userCtx?.isGlobalScope && (
          <div className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-[11px] text-slate-400 self-start sm:self-auto flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span>Scoped Authority Mode</span>
          </div>
        )}
      </div>

      {/* Feedback banner */}
      {feedbackMsg && (
        <div
          className={`flex items-center justify-between gap-3 p-3 rounded-xl border text-xs ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="text-[11px] hover:underline font-medium text-slate-400 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs navigation - Only show when not in detail drilldown */}
      {!selectedOfficer && !selectedProvider && (
        <div className="flex items-center gap-1 border-b border-slate-800 pb-px overflow-x-auto">
          <button
            onClick={() => setActiveTab('departments')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition whitespace-nowrap border-b-2 ${
              activeTab === 'departments'
                ? 'border-orange-500 text-orange-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Departments</span>
            <span className="font-mono text-[10px] px-1.5 py-0.2 bg-slate-800 rounded-md text-slate-300">
              {departments.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('officers')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition whitespace-nowrap border-b-2 ${
              activeTab === 'officers'
                ? 'border-orange-500 text-orange-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Officers</span>
            <span className="font-mono text-[10px] px-1.5 py-0.2 bg-slate-800 rounded-md text-slate-300">
              {officers.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('service-providers')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition whitespace-nowrap border-b-2 ${
              activeTab === 'service-providers'
                ? 'border-orange-500 text-orange-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span>Service Providers</span>
            <span className="font-mono text-[10px] px-1.5 py-0.2 bg-slate-800 rounded-md text-slate-300">
              {serviceProviders.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('outlet-assignments')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition whitespace-nowrap border-b-2 ${
              activeTab === 'outlet-assignments'
                ? 'border-orange-500 text-orange-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Outlet Assignments</span>
          </button>
        </div>
      )}

      {/* Main Workspace Content */}
      {selectedOfficer ? (
        <OrgOfficerDetailPanel
          officer={selectedOfficer}
          department={departments.find((d) => d.id === selectedOfficer.departmentId)}
          canWriteGlobal={canWriteGlobal}
          canWritePostings={canWritePostings}
          hierarchy={hierarchyContext}
          onBack={() => setSelectedOfficer(null)}
          onEditOfficer={(off) => {
            setOfficerToEdit(off);
            setOfficerModalOpen(true);
          }}
        />
      ) : selectedProvider ? (
        <OrgServiceProviderDetailPanel
          provider={selectedProvider}
          assignments={outletAssignments.filter(
            (a) => a.serviceProviderId === selectedProvider.id
          )}
          canWriteGlobal={canWriteGlobal}
          onBack={() => setSelectedProvider(null)}
          onEdit={(prov) => {
            setProviderToEdit(prov);
            setProviderModalOpen(true);
          }}
        />
      ) : (
        <>
          {activeTab === 'departments' && (
            <OrgDepartmentsPanel
              departments={departments}
              isLoading={loadingInitial}
              canWriteGlobal={canWriteGlobal}
              onAddClick={() => {
                setDeptToEdit(null);
                setDeptModalOpen(true);
              }}
              onEditClick={(dept) => {
                setDeptToEdit(dept);
                setDeptModalOpen(true);
              }}
            />
          )}

          {activeTab === 'officers' && (
            <OrgOfficersPanel
              officers={officers}
              departments={departments}
              isLoading={loadingInitial}
              canWriteGlobal={canWriteGlobal}
              onAddClick={() => {
                setOfficerToEdit(null);
                setOfficerModalOpen(true);
              }}
              onEditClick={(off) => {
                setOfficerToEdit(off);
                setOfficerModalOpen(true);
              }}
              onViewDetails={(off) => {
                setSelectedOfficer(off);
              }}
            />
          )}

          {activeTab === 'service-providers' && (
            <OrgServiceProvidersPanel
              providers={serviceProviders}
              isLoading={loadingInitial}
              canWriteGlobal={canWriteGlobal}
              onAddClick={() => {
                setProviderToEdit(null);
                setProviderModalOpen(true);
              }}
              onEditClick={(prov) => {
                setProviderToEdit(prov);
                setProviderModalOpen(true);
              }}
              onViewDetails={(prov) => {
                setSelectedProvider(prov);
              }}
            />
          )}

          {activeTab === 'outlet-assignments' && (
            <OrgOutletAssignmentsPanel
              assignments={outletAssignments}
              outlets={outlets}
              selectedOutletId={selectedOutletId}
              onSelectOutlet={(oid) => setSelectedOutletId(oid)}
              isLoading={loadingAssignments}
              canWrite={canWriteAssignments}
              onAddClick={() => {
                setAssignmentToEdit(null);
                setAssignmentModalOpen(true);
              }}
              onEditClick={(a) => {
                setAssignmentToEdit(a);
                setAssignmentModalOpen(true);
              }}
            />
          )}
        </>
      )}

      {/* Modal Dialogs */}
      <OrgDepartmentModal
        isOpen={deptModalOpen}
        onClose={() => setDeptModalOpen(false)}
        departmentToEdit={deptToEdit}
        onSave={handleSaveDepartment}
      />

      <OrgOfficerModal
        isOpen={officerModalOpen}
        onClose={() => setOfficerModalOpen(false)}
        officerToEdit={officerToEdit}
        departments={departments}
        onSave={handleSaveOfficer}
      />

      <OrgServiceProviderModal
        isOpen={providerModalOpen}
        onClose={() => setProviderModalOpen(false)}
        providerToEdit={providerToEdit}
        onSave={handleSaveServiceProvider}
      />

      <OrgOutletAssignmentModal
        isOpen={assignmentModalOpen}
        onClose={() => setAssignmentModalOpen(false)}
        assignmentToEdit={assignmentToEdit}
        outlets={outlets}
        serviceProviders={serviceProviders}
        selectedOutletId={selectedOutletId}
        onSave={handleSaveOutletAssignment}
      />
    </div>
  );
};
