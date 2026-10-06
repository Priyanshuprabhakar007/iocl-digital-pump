import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  Filter,
  RefreshCw,
  Plus,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Calendar,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { HrAttendanceRecord, HrRosterAssignment, ShiftTemplate, HrStaff } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import {
  buildHrAttendanceQueryParams,
  formatHrAttendanceStatus,
  getHrErrorMessage,
} from './hrUi';
import { HrAttendanceCheckInModal } from './HrAttendanceCheckInModal';

interface HrAttendancePanelProps {
  outletId: string;
  canWriteAttendance: boolean;
  staffList: HrStaff[];
  shiftTemplates: ShiftTemplate[];
  showFeedback: (type: 'success' | 'error', message: string) => void;
}

export const HrAttendancePanel: React.FC<HrAttendancePanelProps> = ({
  outletId,
  canWriteAttendance,
  staffList,
  shiftTemplates,
  showFeedback,
}) => {
  const [attendanceRecords, setAttendanceRecords] = useState<HrAttendanceRecord[]>([]);
  const [scheduledRosters, setScheduledRosters] = useState<HrRosterAssignment[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Filters
  const [dateFilter, setDateFilter] = useState<string>('');
  const [fromDateFilter, setFromDateFilter] = useState<string>('');
  const [toDateFilter, setToDateFilter] = useState<string>('');
  const [staffFilter, setStaffFilter] = useState<string>('');
  const [shiftFilter, setShiftFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Modals
  const [checkInModalOpen, setCheckInModalOpen] = useState<boolean>(false);
  const [checkOutModalOpen, setCheckOutModalOpen] = useState<boolean>(false);
  const [selectedRecordForCheckout, setSelectedRecordForCheckout] = useState<HrAttendanceRecord | null>(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!outletId) return;
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const queryParams = buildHrAttendanceQueryParams({
        date: dateFilter,
        fromDate: fromDateFilter,
        toDate: toDateFilter,
        staffId: staffFilter,
        shiftTemplateId: shiftFilter,
        status: statusFilter,
      });

      const [attRes, rosterRes] = await Promise.all([
        apiFetch<HrAttendanceRecord[]>(`/api/v1/outlets/${outletId}/hr/attendance${queryParams}`),
        apiFetch<HrRosterAssignment[]>(`/api/v1/outlets/${outletId}/hr/roster?status=SCHEDULED`),
      ]);

      if (attRes.success && Array.isArray(attRes.data)) {
        setAttendanceRecords(attRes.data);
      } else {
        setAttendanceRecords([]);
      }

      if (rosterRes.success && Array.isArray(rosterRes.data)) {
        setScheduledRosters(rosterRes.data);
      } else {
        setScheduledRosters([]);
      }
    } catch (err: any) {
      showFeedback('error', getHrErrorMessage(err));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [outletId, dateFilter, fromDateFilter, toDateFilter, staffFilter, shiftFilter, statusFilter, showFeedback]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleClearFilters = () => {
    setDateFilter('');
    setFromDateFilter('');
    setToDateFilter('');
    setStaffFilter('');
    setShiftFilter('');
    setStatusFilter('');
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-orange-500" />
            <span>Staff Attendance & Geofencing</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Monitor staff attendance, geofence compliance verification, and shift check-ins.
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

          {canWriteAttendance && (
            <button
              onClick={() => setCheckInModalOpen(true)}
              className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-orange-500/20 flex items-center gap-2 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Check In Staff</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider font-mono">
            <Filter className="w-3.5 h-3.5 text-orange-400" />
            <span>Attendance Filters</span>
          </span>
          {(dateFilter || fromDateFilter || toDateFilter || staffFilter || shiftFilter || statusFilter) && (
            <button
              onClick={handleClearFilters}
              className="text-xs text-orange-400 hover:text-orange-300 font-medium underline"
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
              <option value="CHECKED_IN">Checked In</option>
              <option value="CHECKED_OUT">Checked Out</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Staff Member</th>
                <th className="py-3 px-4">Date & Shift</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Check-In</th>
                <th className="py-3 px-4">Check-Out</th>
                <th className="py-3 px-4">Geofence Compliance</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-mono">
                    Loading attendance records...
                  </td>
                </tr>
              ) : attendanceRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-mono">
                    No attendance records found matching criteria.
                  </td>
                </tr>
              ) : (
                attendanceRecords.map((rec) => {
                  const statusInfo = formatHrAttendanceStatus(rec.status);
                  const isInside = rec.checkInInsideGeofence === 1;

                  return (
                    <tr key={rec.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">{rec.staffName || 'Staff Member'}</div>
                        <div className="text-[11px] text-orange-400 font-mono">{rec.employeeCode || '—'} • {rec.designationName || 'Staff'}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <div className="text-white">{rec.attendanceDate}</div>
                        <div className="text-[11px] text-slate-400">{rec.shiftTemplateName || rec.shiftTemplateCode || 'Shift'}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-medium border ${statusInfo.badgeClass}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <div className="text-slate-200">{new Date(rec.checkInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        <div className="text-[10px] text-slate-500">Acc: {Math.round(rec.checkInAccuracyMetres)}m</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        {rec.checkOutAt ? (
                          <>
                            <div className="text-slate-200">{new Date(rec.checkOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            <div className="text-[10px] text-slate-500">Acc: {rec.checkOutAccuracyMetres ? `${Math.round(rec.checkOutAccuracyMetres)}m` : '—'}</div>
                          </>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <div className="flex items-center gap-1.5">
                          {isInside ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Inside ({Math.round(rec.checkInDistanceMetres)}m)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-400 text-[11px]">
                              <AlertCircle className="w-3.5 h-3.5" /> Outside ({Math.round(rec.checkInDistanceMetres)}m)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {rec.status === 'CHECKED_IN' && canWriteAttendance && (
                          <button
                            onClick={() => {
                              setSelectedRecordForCheckout(rec);
                              setCheckOutModalOpen(true);
                            }}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-orange-400 hover:text-orange-300 font-medium rounded-lg border border-slate-700 text-xs inline-flex items-center gap-1.5 transition-colors"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Check Out</span>
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

      {/* Check-In Modal */}
      <HrAttendanceCheckInModal
        isOpen={checkInModalOpen}
        onClose={() => setCheckInModalOpen(false)}
        outletId={outletId}
        mode="check-in"
        scheduledRosters={scheduledRosters}
        onSuccess={() => fetchData(true)}
        showFeedback={showFeedback}
      />

      {/* Check-Out Modal */}
      <HrAttendanceCheckInModal
        isOpen={checkOutModalOpen}
        onClose={() => {
          setCheckOutModalOpen(false);
          setSelectedRecordForCheckout(null);
        }}
        outletId={outletId}
        mode="check-out"
        attendanceRecord={selectedRecordForCheckout}
        scheduledRosters={[]}
        onSuccess={() => fetchData(true)}
        showFeedback={showFeedback}
      />
    </div>
  );
};
