import React, { useState, useEffect, useCallback } from 'react';
import {
  Fuel,
  Search,
  Filter,
  RefreshCw,
  Plus,
  XCircle,
  CheckCircle2,
  Calendar,
  Ban,
} from 'lucide-react';
import { HrNozzleAssignment, HrRosterAssignment, Nozzle, ShiftTemplate, HrStaff } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import {
  buildHrNozzleAssignmentQueryParams,
  formatHrNozzleStatus,
  getHrErrorMessage,
  validateHrNozzleDateRange,
} from './hrUi';
import { HrNozzleAssignmentModal } from './HrNozzleAssignmentModal';

interface HrNozzleAssignmentsPanelProps {
  outletId: string;
  canWriteNozzleAssignment: boolean;
  staffList: HrStaff[];
  shiftTemplates: ShiftTemplate[];
  showFeedback: (type: 'success' | 'error', message: string) => void;
  nozzleAssignmentRefreshKey?: number;
}

export const HrNozzleAssignmentsPanel: React.FC<HrNozzleAssignmentsPanelProps> = ({
  outletId,
  canWriteNozzleAssignment,
  staffList,
  shiftTemplates,
  showFeedback,
  nozzleAssignmentRefreshKey,
}) => {
  const [assignments, setAssignments] = useState<HrNozzleAssignment[]>([]);
  const [scheduledRosters, setScheduledRosters] = useState<HrRosterAssignment[]>([]);
  const [nozzles, setNozzles] = useState<Nozzle[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Filters
  const [dateFilter, setDateFilter] = useState<string>('');
  const [fromDateFilter, setFromDateFilter] = useState<string>('');
  const [toDateFilter, setToDateFilter] = useState<string>('');
  const [staffFilter, setStaffFilter] = useState<string>('');
  const [nozzleFilter, setNozzleFilter] = useState<string>('');
  const [shiftFilter, setShiftFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Modal
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Outlet switch reset
  useEffect(() => {
    setIsModalOpen(false);
    setDateFilter('');
    setFromDateFilter('');
    setToDateFilter('');
    setStaffFilter('');
    setNozzleFilter('');
    setShiftFilter('');
    setStatusFilter('');
    setAssignments([]);
    setScheduledRosters([]);
    setNozzles([]);
  }, [outletId]);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!outletId) return;

    const dateVal = validateHrNozzleDateRange(fromDateFilter, toDateFilter);
    if (!dateVal.valid) {
      showFeedback('error', dateVal.error || 'Invalid date range.');
      return;
    }

    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const queryParams = buildHrNozzleAssignmentQueryParams({
        date: dateFilter,
        fromDate: fromDateFilter,
        toDate: toDateFilter,
        staffId: staffFilter,
        nozzleId: nozzleFilter,
        shiftTemplateId: shiftFilter,
        status: statusFilter,
      });

      const [assignRes, rosterRes, nozzleRes] = await Promise.all([
        apiFetch<HrNozzleAssignment[]>(`/api/v1/outlets/${outletId}/hr/nozzle-assignments${queryParams}`),
        apiFetch<HrRosterAssignment[]>(`/api/v1/outlets/${outletId}/hr/roster?status=SCHEDULED`),
        apiFetch<Nozzle[]>(`/api/v1/outlets/${outletId}/nozzles`),
      ]);

      if (assignRes.success && Array.isArray(assignRes.data)) {
        setAssignments(assignRes.data);
      } else {
        setAssignments([]);
        if (assignRes.error) {
          showFeedback('error', getHrErrorMessage(assignRes.error));
        }
      }

      if (rosterRes.success && Array.isArray(rosterRes.data)) {
        setScheduledRosters(rosterRes.data);
      } else {
        setScheduledRosters([]);
        if (rosterRes.error && !assignRes.error) {
          showFeedback('error', getHrErrorMessage(rosterRes.error));
        }
      }

      if (nozzleRes.success && Array.isArray(nozzleRes.data)) {
        setNozzles(nozzleRes.data);
      } else {
        setNozzles([]);
        if (nozzleRes.error && !assignRes.error && !rosterRes.error) {
          showFeedback('error', getHrErrorMessage(nozzleRes.error));
        }
      }
    } catch (err: any) {
      showFeedback('error', getHrErrorMessage(err));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [outletId, dateFilter, fromDateFilter, toDateFilter, staffFilter, nozzleFilter, shiftFilter, statusFilter, showFeedback]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh key effect
  useEffect(() => {
    if (nozzleAssignmentRefreshKey && nozzleAssignmentRefreshKey > 0 && outletId) {
      fetchData(true);
    }
  }, [nozzleAssignmentRefreshKey, outletId, fetchData]);

  const handleCancelAssignment = async (assignmentId: string) => {
    if (!confirm('Are you sure you want to cancel this nozzle assignment?')) return;

    try {
      const res = await apiFetch(`/api/v1/outlets/${outletId}/hr/nozzle-assignments/${assignmentId}/cancel`, {
        method: 'PATCH',
      });

      if (res.success) {
        showFeedback('success', 'Nozzle assignment cancelled successfully.');
        fetchData(true);
      } else {
        showFeedback('error', getHrErrorMessage(res.error));
      }
    } catch (err: any) {
      showFeedback('error', getHrErrorMessage(err));
    }
  };

  const handleClearFilters = () => {
    setDateFilter('');
    setFromDateFilter('');
    setToDateFilter('');
    setStaffFilter('');
    setNozzleFilter('');
    setShiftFilter('');
    setStatusFilter('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Fuel className="w-5 h-5 text-orange-500" />
            <span>Nozzle Workforce Assignments</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage operational nozzle allocations and staff shift assignments.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 flex items-center gap-2 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-orange-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {canWriteNozzleAssignment && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-orange-500/20 flex items-center gap-2 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Assign Nozzle</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider font-mono">
            <Filter className="w-3.5 h-3.5 text-orange-400" />
            <span>Assignment Filters</span>
          </span>
          {(dateFilter || fromDateFilter || toDateFilter || staffFilter || nozzleFilter || shiftFilter || statusFilter) && (
            <button
              onClick={handleClearFilters}
              className="text-xs text-orange-400 hover:text-orange-300 font-medium underline"
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Exact Date</label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-orange-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">From Date</label>
            <input
              type="date"
              value={fromDateFilter}
              onChange={(e) => setFromDateFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-orange-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">To Date</label>
            <input
              type="date"
              value={toDateFilter}
              onChange={(e) => setToDateFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-orange-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Staff Member</label>
            <select
              value={staffFilter}
              onChange={(e) => setStaffFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-orange-500"
            >
              <option value="">All Staff</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>{s.fullName} ({s.employeeCode})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Nozzle</label>
            <select
              value={nozzleFilter}
              onChange={(e) => setNozzleFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-orange-500 font-mono"
            >
              <option value="">All Nozzles</option>
              {nozzles.map((n) => (
                <option key={n.id} value={n.id}>Nozzle {n.nozzleNumber} ({n.productCode || 'Fuel'})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Shift</label>
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-orange-500"
            >
              <option value="">All Shifts</option>
              {shiftTemplates.map((t) => (
                <option key={t.id} value={t.id}>{t.name || t.code}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-orange-500"
            >
              <option value="">All Statuses</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Assignments Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Staff Member</th>
                <th className="py-3 px-4">Date & Shift</th>
                <th className="py-3 px-4">Nozzle / Dispenser</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Notes</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 font-mono">
                    Loading nozzle assignments...
                  </td>
                </tr>
              ) : assignments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 font-mono">
                    No nozzle assignments found matching criteria.
                  </td>
                </tr>
              ) : (
                assignments.map((assn) => {
                  const statusInfo = formatHrNozzleStatus(assn.status);

                  return (
                    <tr key={assn.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">{assn.staffName || 'Staff Member'}</div>
                        <div className="text-[11px] text-orange-400 font-mono">{assn.employeeCode || '—'}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <div className="text-white">{assn.assignmentDate}</div>
                        <div className="text-[11px] text-slate-400">{assn.shiftTemplateName || 'Shift'}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <div className="text-white font-bold">Nozzle #{assn.nozzleNumber || '—'}</div>
                        <div className="text-[11px] text-orange-400">{assn.productName || 'Fuel'} • {assn.dispenserName || 'Dispenser'}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-medium border ${statusInfo.badgeClass}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-300 max-w-xs truncate">
                        {assn.notes || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {assn.status === 'ASSIGNED' && canWriteNozzleAssignment && (
                          <button
                            onClick={() => handleCancelAssignment(assn.id)}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-red-500/10 text-red-400 hover:text-red-300 font-medium rounded-lg border border-slate-700 hover:border-red-500/30 text-xs inline-flex items-center gap-1.5 transition-colors"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>Cancel</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assignment Modal */}
      <HrNozzleAssignmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        outletId={outletId}
        scheduledRosters={scheduledRosters}
        nozzles={nozzles}
        onSuccess={() => fetchData(true)}
        showFeedback={showFeedback}
      />
    </div>
  );
};
