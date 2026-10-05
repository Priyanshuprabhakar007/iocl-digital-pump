import React from 'react';
import { HrStaff, HrDesignation } from '../../../shared/types';
import {
  formatDisplayDate,
  formatHrEmploymentStatus,
  getInitials,
} from './hrUi';
import {
  UserPlus,
  Search,
  Filter,
  X,
  Eye,
  Edit,
  FileText,
  Image as ImageIcon,
  Users,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

export interface HrStaffPanelProps {
  staffList: HrStaff[];
  designations: HrDesignation[];
  isLoading: boolean;
  canWriteStaff: boolean;
  filters: {
    designationId: string;
    employmentStatus: string;
    search: string;
    joinedFrom: string;
    joinedTo: string;
  };
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
  dateRangeError?: string | null;
  onAddStaff: () => void;
  onViewStaff: (staff: HrStaff) => void;
  onEditStaff: (staff: HrStaff) => void;
  selectedStaffId?: string | null;
}

export const HrStaffPanel: React.FC<HrStaffPanelProps> = ({
  staffList,
  designations,
  isLoading,
  canWriteStaff,
  filters,
  onFilterChange,
  onClearFilters,
  dateRangeError,
  onAddStaff,
  onViewStaff,
  onEditStaff,
  selectedStaffId,
}) => {
  const hasActiveFilters = Boolean(
    filters.search ||
      filters.designationId ||
      filters.employmentStatus ||
      filters.joinedFrom ||
      filters.joinedTo
  );

  return (
    <div className="space-y-4">
      {/* Control Bar: Search, Filters & Add Staff */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Staff Directory</h3>
              <p className="text-xs text-slate-400">
                Manage retail outlet workforce profiles and records ({staffList.length} staff)
              </p>
            </div>
          </div>

          {canWriteStaff && (
            <button
              onClick={onAddStaff}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold shadow-lg shadow-orange-500/20 transition flex items-center justify-center gap-1.5 shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Staff Member</span>
            </button>
          )}
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-2 border-t border-slate-800/80">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search code, name..."
              value={filters.search}
              onChange={e => onFilterChange('search', e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
            />
          </div>

          {/* Designation Dropdown */}
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

          {/* Employment Status */}
          <div>
            <select
              value={filters.employmentStatus}
              onChange={e => onFilterChange('employmentStatus', e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="EXITED">Exited</option>
            </select>
          </div>

          {/* Joined Date Range */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              title="Joined From"
              value={filters.joinedFrom}
              onChange={e => onFilterChange('joinedFrom', e.target.value)}
              className="w-full px-2.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
            />
            <span className="text-slate-500 text-xs">to</span>
            <input
              type="date"
              title="Joined To"
              value={filters.joinedTo}
              onChange={e => onFilterChange('joinedTo', e.target.value)}
              className="w-full px-2.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
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

      {/* Staff List Table / Mobile Cards */}
      {isLoading ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
          <span className="text-xs text-slate-400">Loading staff directory...</span>
        </div>
      ) : staffList.length === 0 ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-500 mx-auto">
            <Users className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-200">
            {hasActiveFilters ? 'No matching staff found' : 'No staff members enrolled yet'}
          </h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {hasActiveFilters
              ? 'Try adjusting your search criteria or date filters.'
              : 'Add employees and pump attendants to begin shift rostering and manpower tracking.'}
          </p>
          {canWriteStaff && !hasActiveFilters && (
            <button
              onClick={onAddStaff}
              className="mt-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition"
            >
              Add First Staff Member
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
                  <th className="py-3.5 px-4">Employee</th>
                  <th className="py-3.5 px-4">Designation</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Joining Date</th>
                  <th className="py-3.5 px-4">Emergency Contact</th>
                  <th className="py-3.5 px-4 text-center">Docs</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {staffList.map(staff => {
                  const isSelected = staff.id === selectedStaffId;
                  const statusDisplay = formatHrEmploymentStatus(staff.employmentStatus);
                  return (
                    <tr
                      key={staff.id}
                      className={`hover:bg-slate-800/30 transition ${
                        isSelected ? 'bg-orange-500/5 border-l-2 border-orange-500' : ''
                      }`}
                    >
                      {/* Employee Info */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm">
                            {getInitials(staff.fullName)}
                          </div>
                          <div>
                            <div className="font-semibold text-white">{staff.fullName}</div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              {staff.employeeCode}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Designation */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-200">
                          {staff.designationName || '—'}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {staff.designationCode || '—'}
                        </div>
                      </td>

                      {/* Employment Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusDisplay.badgeClass}`}
                        >
                          {statusDisplay.label}
                        </span>
                      </td>

                      {/* Joining Date */}
                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {formatDisplayDate(staff.joiningDate)}
                      </td>

                      {/* Emergency Contact */}
                      <td className="py-3.5 px-4">
                        <div className="text-slate-200">{staff.emergencyContactName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {staff.emergencyContactPhone}
                        </div>
                      </td>

                      {/* Document Indicators */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {staff.aadhaarDocumentId ? (
                            <span
                              title="Identity proof attached"
                              className="p-1 rounded bg-orange-500/10 text-orange-400"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </span>
                          ) : (
                            <span className="text-slate-600 text-[10px]">—</span>
                          )}
                          {staff.photoDocumentId ? (
                            <span
                              title="Photo attached"
                              className="p-1 rounded bg-sky-500/10 text-sky-400"
                            >
                              <ImageIcon className="w-3.5 h-3.5" />
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onViewStaff(staff)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                            title="View Staff Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {canWriteStaff && (
                            <button
                              onClick={() => onEditStaff(staff)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-orange-400 transition"
                              title="Edit Staff Member"
                            >
                              <Edit className="w-3.5 h-3.5" />
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
            {staffList.map(staff => {
              const statusDisplay = formatHrEmploymentStatus(staff.employmentStatus);
              return (
                <div key={staff.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                        {getInitials(staff.fullName)}
                      </div>
                      <div>
                        <div className="font-bold text-white text-sm">{staff.fullName}</div>
                        <div className="text-xs text-slate-400 font-mono">
                          {staff.employeeCode} • {staff.designationName || '—'}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusDisplay.badgeClass}`}
                    >
                      {statusDisplay.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Joining Date</span>
                      <span className="font-mono text-slate-300">
                        {formatDisplayDate(staff.joiningDate)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Emergency</span>
                      <span className="text-slate-300 truncate block">
                        {staff.emergencyContactName}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      {staff.aadhaarDocumentId && (
                        <span className="flex items-center gap-1 text-orange-400">
                          <FileText className="w-3.5 h-3.5" /> ID Attached
                        </span>
                      )}
                      {staff.photoDocumentId && (
                        <span className="flex items-center gap-1 text-sky-400">
                          <ImageIcon className="w-3.5 h-3.5" /> Photo
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onViewStaff(staff)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>
                      {canWriteStaff && (
                        <button
                          onClick={() => onEditStaff(staff)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-orange-400 text-xs font-semibold flex items-center gap-1"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                      )}
                    </div>
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
