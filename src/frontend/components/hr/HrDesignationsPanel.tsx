import React from 'react';
import { HrDesignation } from '../../../shared/types';
import { formatHrDesignationStatus } from './hrUi';
import {
  Tag,
  Search,
  X,
  Edit,
  Plus,
  Loader2,
} from 'lucide-react';

export interface HrDesignationsPanelProps {
  designations: HrDesignation[];
  isLoading: boolean;
  canWriteDesignation: boolean;
  filters: {
    search: string;
    status: string;
  };
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
  onAddDesignation: () => void;
  onEditDesignation: (designation: HrDesignation) => void;
}

export const HrDesignationsPanel: React.FC<HrDesignationsPanelProps> = ({
  designations,
  isLoading,
  canWriteDesignation,
  filters,
  onFilterChange,
  onClearFilters,
  onAddDesignation,
  onEditDesignation,
}) => {
  const hasActiveFilters = Boolean(filters.search || filters.status);

  return (
    <div className="space-y-4">
      {/* Control Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Designations Master</h3>
              <p className="text-xs text-slate-400">
                Job roles and workforce designations configured for this outlet ({designations.length} roles)
              </p>
            </div>
          </div>

          {canWriteDesignation && (
            <button
              onClick={onAddDesignation}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold shadow-lg shadow-orange-500/20 transition flex items-center justify-center gap-1.5 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Create Designation</span>
            </button>
          )}
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-800/80">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search code or name..."
              value={filters.search}
              onChange={e => onFilterChange('search', e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
            />
          </div>

          {/* Status Dropdown */}
          <div>
            <select
              value={filters.status}
              onChange={e => onFilterChange('status', e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
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
      </div>

      {/* Designation List */}
      {isLoading ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
          <span className="text-xs text-slate-400">Loading designations...</span>
        </div>
      ) : designations.length === 0 ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-500 mx-auto">
            <Tag className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-200">
            {hasActiveFilters ? 'No matching designations found' : 'No designations created yet'}
          </h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {hasActiveFilters
              ? 'Try changing your search terms or status filter.'
              : 'Create designations like DSM, Cashier, Manager to assign to your workforce.'}
          </p>
          {canWriteDesignation && !hasActiveFilters && (
            <button
              onClick={onAddDesignation}
              className="mt-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition"
            >
              Create First Designation
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
                  <th className="py-3.5 px-4 w-28">Code</th>
                  <th className="py-3.5 px-4">Designation Name</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Notes</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {designations.map(d => {
                  const statusDisplay = formatHrDesignationStatus(d.status);
                  return (
                    <tr key={d.id} className="hover:bg-slate-800/30 transition">
                      {/* Code */}
                      <td className="py-3.5 px-4 font-mono font-bold text-orange-400">
                        {d.code}
                      </td>

                      {/* Name */}
                      <td className="py-3.5 px-4 font-semibold text-white">
                        {d.name}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusDisplay.badgeClass}`}
                        >
                          {statusDisplay.label}
                        </span>
                      </td>

                      {/* Notes */}
                      <td className="py-3.5 px-4 text-slate-400 max-w-xs truncate">
                        {d.notes || '—'}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        {canWriteDesignation && (
                          <button
                            onClick={() => onEditDesignation(d)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-orange-400 transition"
                            title="Edit Designation"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Cards View */}
          <div className="md:hidden divide-y divide-slate-800">
            {designations.map(d => {
              const statusDisplay = formatHrDesignationStatus(d.status);
              return (
                <div key={d.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-orange-400 text-xs">
                          {d.code}
                        </span>
                        <span className="text-white font-bold text-sm">{d.name}</span>
                      </div>
                      {d.notes && (
                        <p className="text-xs text-slate-400 mt-1">{d.notes}</p>
                      )}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusDisplay.badgeClass} shrink-0`}
                    >
                      {statusDisplay.label}
                    </span>
                  </div>

                  {canWriteDesignation && (
                    <div className="flex items-center justify-end pt-1">
                      <button
                        onClick={() => onEditDesignation(d)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-orange-400 text-xs font-semibold flex items-center gap-1"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
