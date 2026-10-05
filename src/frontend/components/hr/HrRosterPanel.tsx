import React from 'react';
import {
  HrRosterAssignment,
  HrStaff,
  HrDesignation,
  ShiftTemplate,
} from '../../../shared/types';
import {
  formatDisplayDate,
  formatHrRosterStatus,
  getInitials,
} from './hrUi';
import {
  Calendar,
  Plus,
  Search,
  Filter,
  X,
  Eye,
  Edit,
  AlertTriangle,
  Clock,
  Users,
  Loader2,
} from 'lucide-react';

export interface HrRosterPanelProps {
  rosterList: HrRosterAssignment[];
  staffList: HrStaff[];
  designations: HrDesignation[];
  shiftTemplates: ShiftTemplate[];
  isLoading: boolean;
  canWriteRoster: boolean;
  canReadShiftTemplates: boolean;
  filters: {
    staffId: string;
    designationId: string;
    shiftTemplateId: string;
    status: string;
    fromDate: string;
    toDate: string;
  };
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
  dateRangeError?: string | null;
  onAddRoster: () => void;
  onViewRoster: (roster: HrRosterAssignment) => void;
  onEditRoster: (roster: HrRosterAssignment) => void;
  onCancelRoster: (roster: HrRosterAssignment) => void;
  selectedRosterId?: string | null;
}

export const HrRosterPanel: React.FC<HrRosterPanelProps> = ({
  rosterList,
  staffList,
  designations,
  shiftTemplates,
  isLoading,
  canWriteRoster,
  canReadShiftTemplates,
  filters,
  onFilterChange,
  onClearFilters,
  dateRangeError,
  onAddRoster,
  onViewRoster,
  onEditRoster,
  onCancelRoster,
  selectedRosterId,
}) => {
  const hasActiveFilters = Boolean(
    filters.staffId ||
      filters.designationId ||
      filters.shiftTemplateId ||
      filters.status ||
      filters.fromDate ||
      filters.toDate
  );

  return (
    <div className="space-y-4">
      {/* Control Bar: Filters & Assign Shift */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Shift Roster Schedule</h3>
              <p className="text-xs text-slate-400">
                Plan and track operational shift assignments for outlet personnel ({rosterList.length} assignments)
              </p>
            </div>
          </div>

          {canWriteRoster && (
            <button
              onClick={onAddRoster}
              disabled={!canReadShiftTemplates}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-1.5 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Assign Shift</span>
            </button>
          )}
        </div>

        {/* Warning if no shift template read access */}
        {!canReadShiftTemplates && canWriteRoster && (
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Shift template access is required to assign or change roster shifts.</span>
          </div>
        )}

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 pt-2 border-t border-slate-800/80">
          {/* Staff Filter */}
          <div>
            <select
              value={filters.staffId}
              onChange={e => onFilterChange('staffId', e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
            >
              <option value="">All Staff Members</option>
              {staffList.map(s => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.employeeCode})
                </option>
              ))}
            </select>
          </div>

          {/* Designation Filter */}
          <div>
            <select
              value={filters.designationId}
              onChange={e => onFilterChange('designationId', e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
            >
              <option value="">All Designations</option>
              {designations.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>

          {/* Shift Template Filter */}
          <div>
            <select
              value={filters.shiftTemplateId}
              onChange={e => onFilterChange('shiftTemplateId', e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
            >
              <option value="">All Shifts</option>
              {shiftTemplates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.code})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={filters.status}
              onChange={e => onFilterChange('status', e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
            >
              <option value="">All Statuses</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {/* Date Range: From / To */}
          <div className="flex items-center gap-1">
            <input
              type="date"
              title="From Date"
              value={filters.fromDate}
              onChange={e => onFilterChange('fromDate', e.target.value)}
              className="w-full px-2 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
            />
            <span className="text-slate-500 text-xs">to</span>
            <input
              type="date"
              title="To Date"
              value={filters.toDate}
              onChange={e => onFilterChange('toDate', e.target.value)}
              className="w-full px-2 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
            />
          </div>

          {/* Clear Filters Button */}
          <div className="flex items-center">
            {hasActiveFilters && (
              <button
                onClick={onClearFilters}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition flex items-center justify-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear Filters</span>
              </button>
            )}
          </div>
        </div>

        {/* Date range warning */}
        {dateRangeError && (
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-xs text-rose-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{dateRangeError}</span>
          </div>
        )}
      </div>

      {/* Roster List Table / Mobile Cards */}
      {isLoading ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
          <span className="text-xs text-slate-400">Loading roster schedule...</span>
        </div>
      ) : rosterList.length === 0 ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-500 mx-auto">
            <Calendar className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-200">
            {hasActiveFilters ? 'No matching roster assignments' : 'No shift roster scheduled yet'}
          </h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {hasActiveFilters
              ? 'Try modifying your filter selections or date range.'
              : 'Assign staff members to active shift templates for daily pump operations.'}
          </p>
          {canWriteRoster && canReadShiftTemplates && !hasActiveFilters && (
            <button
              onClick={onAddRoster}
              className="mt-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition"
            >
              Assign First Shift
            </button>
          )}
        </div>
      ) : (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/50 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Staff Member</th>
                  <th className="py-3.5 px-4">Designation</th>
                  <th className="py-3.5 px-4">Shift</th>
                  <th className="py-3.5 px-4">Shift Timings</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {rosterList.map(r => {
                  const isSelected = r.id === selectedRosterId;
                  const statusDisplay = formatHrRosterStatus(r.status);
                  const isScheduled = r.status === 'SCHEDULED';

                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-slate-800/30 transition ${
                        isSelected ? 'bg-orange-500/5 border-l-2 border-orange-500' : ''
                      }`}
                    >
                      {/* Date */}
                      <td className="py-3.5 px-4 font-mono font-bold text-white">
                        {formatDisplayDate(r.rosterDate)}
                      </td>

                      {/* Staff */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-bold text-[10px] shrink-0">
                            {getInitials(r.staffName)}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-200">
                              {r.staffName || '—'}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {r.employeeCode || '—'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Designation */}
                      <td className="py-3.5 px-4 text-slate-300">
                        {r.designationName || '—'}
                      </td>

                      {/* Shift */}
                      <td className="py-3.5 px-4 font-semibold text-white">
                        {r.shiftTemplateName || r.shiftTemplateCode || 'Shift'}
                      </td>

                      {/* Shift Timings */}
                      <td className="py-3.5 px-4 font-mono text-slate-400">
                        {r.shiftStartTime && r.shiftEndTime
                          ? `${r.shiftStartTime} – ${r.shiftEndTime}`
                          : '—'}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusDisplay.badgeClass}`}
                        >
                          {statusDisplay.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onViewRoster(r)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                            title="View Roster Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {canWriteRoster && (
                            <button
                              onClick={() => onEditRoster(r)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-orange-400 transition"
                              title="Edit Shift Assignment"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canWriteRoster && isScheduled && (
                            <button
                              onClick={() => onCancelRoster(r)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
                              title="Cancel Shift Assignment"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Cards View */}
          <div className="md:hidden divide-y divide-slate-800">
            {rosterList.map(r => {
              const statusDisplay = formatHrRosterStatus(r.status);
              const isScheduled = r.status === 'SCHEDULED';
              return (
                <div key={r.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                        {getInitials(r.staffName)}
                      </div>
                      <div>
                        <div className="font-bold text-white text-sm">
                          {r.staffName || 'Staff Member'}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          {r.employeeCode || '—'} • {r.designationName || '—'}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusDisplay.badgeClass} shrink-0`}
                    >
                      {statusDisplay.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Date</span>
                      <span className="font-mono font-bold text-white">
                        {formatDisplayDate(r.rosterDate)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Shift</span>
                      <span className="text-slate-200 font-semibold truncate block">
                        {r.shiftTemplateName || r.shiftTemplateCode} (
                        {r.shiftStartTime}–{r.shiftEndTime})
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => onViewRoster(r)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View</span>
                    </button>
                    {canWriteRoster && (
                      <button
                        onClick={() => onEditRoster(r)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-orange-400 text-xs font-semibold flex items-center gap-1"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                    )}
                    {canWriteRoster && isScheduled && (
                      <button
                        onClick={() => onCancelRoster(r)}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-semibold flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Cancel</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
