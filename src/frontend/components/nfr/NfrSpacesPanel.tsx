import React from 'react';
import { NfrSpace, NfrType } from '../../../shared/types';
import { formatNfrType } from './nfrUi';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../../shared/constants';
import {
  Building,
  Plus,
  Filter,
  X,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Tag,
  MapPin,
} from 'lucide-react';

export interface NfrSpacesPanelProps {
  spaces: NfrSpace[];
  loading?: boolean;
  isLoading?: boolean;
  canWrite?: boolean;
  filters?: { nfrType: string; status: string };
  onFilterChange?: (filters: Partial<{ nfrType: string; status: string }>) => void;
  onResetFilters?: () => void;
  onCreateSpace?: () => void;
  onEditSpace?: (space: NfrSpace) => void;
  onOpenCreateModal?: () => void;
  onOpenEditModal?: (space: NfrSpace) => void;
  typeFilter?: string;
  setTypeFilter?: (val: string) => void;
  statusFilter?: string;
  setStatusFilter?: (val: string) => void;
  onClearFilters?: () => void;
}

const NFR_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All NFR Types' },
  { value: 'ATM', label: 'ATM' },
  { value: 'CONVENIENCE_STORE', label: 'Convenience Store' },
  { value: 'QSR', label: 'QSR' },
  { value: 'CAR_WASH', label: 'Car Wash' },
  { value: 'EV_CHARGING', label: 'EV Charging' },
  { value: 'CANOPY_ADVERTISING', label: 'Canopy Advertising' },
];

export const NfrSpacesPanel: React.FC<NfrSpacesPanelProps> = ({
  spaces,
  loading,
  isLoading,
  canWrite: canWriteProp,
  filters,
  onFilterChange,
  onResetFilters,
  onCreateSpace,
  onEditSpace,
  onOpenCreateModal,
  onOpenEditModal,
  typeFilter: typeFilterProp,
  setTypeFilter,
  statusFilter: statusFilterProp,
  setStatusFilter,
  onClearFilters,
}) => {
  const { hasPermission } = useAuth();
  const canWrite = canWriteProp !== undefined ? canWriteProp : hasPermission(PERMISSIONS.NFR_MASTER_WRITE);
  const isBusy = Boolean(loading || isLoading);

  const activeTypeFilter = filters ? filters.nfrType : typeFilterProp || '';
  const activeStatusFilter = filters ? filters.status : statusFilterProp || '';

  const handleTypeChange = (val: string) => {
    if (onFilterChange) onFilterChange({ nfrType: val });
    if (setTypeFilter) setTypeFilter(val);
  };

  const handleStatusChange = (val: string) => {
    if (onFilterChange) onFilterChange({ status: val });
    if (setStatusFilter) setStatusFilter(val);
  };

  const handleClear = () => {
    if (onResetFilters) onResetFilters();
    if (onClearFilters) onClearFilters();
  };

  const handleCreate = () => {
    if (onCreateSpace) onCreateSpace();
    if (onOpenCreateModal) onOpenCreateModal();
  };

  const handleEdit = (space: NfrSpace) => {
    if (onEditSpace) onEditSpace(space);
    if (onOpenEditModal) onOpenEditModal(space);
  };

  const hasFilters = Boolean(activeTypeFilter || activeStatusFilter);

  return (
    <div className="space-y-4">
      {/* Action and Filter Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs">
            <Filter className="w-3.5 h-3.5 text-orange-400" />
            <select
              value={activeTypeFilter}
              onChange={e => handleTypeChange(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
            >
              {NFR_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value} className="bg-slate-900 text-white">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs">
            <select
              value={activeStatusFilter}
              onChange={e => handleStatusChange(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="" className="bg-slate-900 text-white">All Statuses</option>
              <option value="ACTIVE" className="bg-slate-900 text-white">Active</option>
              <option value="INACTIVE" className="bg-slate-900 text-white">Inactive</option>
            </select>
          </div>

          {hasFilters && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Create Space Button */}
        {canWrite && (
          <button
            onClick={handleCreate}
            className="w-full md:w-auto px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-slate-950 font-bold text-xs shadow-lg shadow-orange-500/20 transition flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Create Space</span>
          </button>
        )}
      </div>

      {/* Spaces Table / Cards */}
      {isBusy ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 text-xs">
          Loading commercial spaces...
        </div>
      ) : spaces.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <Building className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h4 className="text-sm font-bold text-white mb-1">No NFR Spaces Found</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {hasFilters
              ? 'No spaces match your active filter criteria. Try resetting filters.'
              : 'No commercial spaces configured for this outlet yet. Click "Create Space" to add one.'}
          </p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-5 py-3.5">Space Code</th>
                  <th className="px-5 py-3.5">Name</th>
                  <th className="px-5 py-3.5">NFR Type</th>
                  <th className="px-5 py-3.5">Location</th>
                  <th className="px-5 py-3.5">Lease Status</th>
                  <th className="px-5 py-3.5">Status</th>
                  {canWrite && <th className="px-5 py-3.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {spaces.map(space => (
                  <tr key={space.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-5 py-4 font-mono font-bold text-white">
                      {space.spaceCode}
                    </td>
                    <td className="px-5 py-4 font-medium text-slate-200">
                      {space.name}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-orange-400 text-[11px] font-medium">
                        <Tag className="w-3 h-3" />
                        {formatNfrType(space.nfrType)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-400">
                      {space.locationDescription ? (
                        <div className="flex items-center gap-1.5 max-w-xs truncate">
                          <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="truncate">{space.locationDescription}</span>
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {space.isCurrentlyLeased ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          Leased
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                          Vacant
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                          space.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}
                      >
                        {space.status}
                      </span>
                    </td>
                    {canWrite && (
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => handleEdit(space)}
                          title="Edit Space"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Cards */}
          <div className="grid grid-cols-1 divide-y divide-slate-800 md:hidden">
            {spaces.map(space => (
              <div key={space.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white text-sm">
                        {space.spaceCode}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          space.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}
                      >
                        {space.status}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-slate-200 mt-1">
                      {space.name}
                    </div>
                  </div>
                  {canWrite && (
                    <button
                      onClick={() => handleEdit(space)}
                      className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/80 text-orange-400 text-[11px]">
                    <Tag className="w-3 h-3" />
                    {formatNfrType(space.nfrType)}
                  </span>
                  {space.isCurrentlyLeased ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3" />
                      Leased
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                      Vacant
                    </span>
                  )}
                </div>

                {space.locationDescription && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 pt-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">{space.locationDescription}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
