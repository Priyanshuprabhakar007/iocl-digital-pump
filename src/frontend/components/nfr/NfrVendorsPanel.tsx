import React from 'react';
import { NfrVendor } from '../../../shared/types';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../../shared/constants';
import {
  Users,
  Plus,
  Filter,
  X,
  Edit2,
  Phone,
  Mail,
  MapPin,
  Search,
} from 'lucide-react';

export interface NfrVendorsPanelProps {
  vendors: NfrVendor[];
  loading?: boolean;
  isLoading?: boolean;
  canWrite?: boolean;
  filters?: { search: string; status: string };
  onFilterChange?: (filters: Partial<{ search: string; status: string }>) => void;
  onResetFilters?: () => void;
  onCreateVendor?: () => void;
  onEditVendor?: (vendor: NfrVendor) => void;
  onOpenCreateModal?: () => void;
  onOpenEditModal?: (vendor: NfrVendor) => void;
  searchFilter?: string;
  setSearchFilter?: (val: string) => void;
  statusFilter?: string;
  setStatusFilter?: (val: string) => void;
  onClearFilters?: () => void;
}

export const NfrVendorsPanel: React.FC<NfrVendorsPanelProps> = ({
  vendors,
  loading,
  isLoading,
  canWrite: canWriteProp,
  filters,
  onFilterChange,
  onResetFilters,
  onCreateVendor,
  onEditVendor,
  onOpenCreateModal,
  onOpenEditModal,
  searchFilter: searchFilterProp,
  setSearchFilter,
  statusFilter: statusFilterProp,
  setStatusFilter,
  onClearFilters,
}) => {
  const { hasPermission } = useAuth();
  const canWrite = canWriteProp !== undefined ? canWriteProp : hasPermission(PERMISSIONS.NFR_MASTER_WRITE);
  const isBusy = Boolean(loading || isLoading);

  const activeSearchFilter = filters ? filters.search : searchFilterProp || '';
  const activeStatusFilter = filters ? filters.status : statusFilterProp || '';

  const handleSearchChange = (val: string) => {
    if (onFilterChange) onFilterChange({ search: val });
    if (setSearchFilter) setSearchFilter(val);
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
    if (onCreateVendor) onCreateVendor();
    if (onOpenCreateModal) onOpenCreateModal();
  };

  const handleEdit = (vendor: NfrVendor) => {
    if (onEditVendor) onEditVendor(vendor);
    if (onOpenEditModal) onOpenEditModal(vendor);
  };

  const hasFilters = Boolean(activeSearchFilter || activeStatusFilter);

  return (
    <div className="space-y-4">
      {/* Action and Filter Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto flex-1">
          {/* Search Input */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={activeSearchFilter}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search vendor name..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs">
            <Filter className="w-3.5 h-3.5 text-orange-400" />
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

        {/* Create Vendor Button */}
        {canWrite && (
          <button
            onClick={handleCreate}
            className="w-full md:w-auto px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-slate-950 font-bold text-xs shadow-lg shadow-orange-500/20 transition flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Create Vendor</span>
          </button>
        )}
      </div>

      {/* Vendors Table / Cards */}
      {isBusy ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 text-xs">
          Loading commercial vendors...
        </div>
      ) : vendors.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h4 className="text-sm font-bold text-white mb-1">No Vendors Found</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {hasFilters
              ? 'No vendors match your active search or filter criteria.'
              : 'No commercial vendors registered at this outlet yet. Click "Create Vendor" to register one.'}
          </p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-5 py-3.5">Vendor Name</th>
                  <th className="px-5 py-3.5">Contact Person</th>
                  <th className="px-5 py-3.5">Contact Details</th>
                  <th className="px-5 py-3.5">Address</th>
                  <th className="px-5 py-3.5">Status</th>
                  {canWrite && <th className="px-5 py-3.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {vendors.map(vendor => (
                  <tr key={vendor.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-5 py-4 font-bold text-white">
                      {vendor.vendorName}
                    </td>
                    <td className="px-5 py-4 font-medium text-slate-200">
                      {vendor.ownerContactName}
                    </td>
                    <td className="px-5 py-4 space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Phone className="w-3 h-3 text-slate-500" />
                        <span>{vendor.ownerContactPhone}</span>
                      </div>
                      {vendor.ownerContactEmail && (
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <Mail className="w-3 h-3 text-slate-500" />
                          <span className="truncate max-w-xs">{vendor.ownerContactEmail}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-400">
                      {vendor.address ? (
                        <div className="flex items-center gap-1.5 max-w-xs truncate">
                          <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="truncate">{vendor.address}</span>
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                          vendor.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}
                      >
                        {vendor.status}
                      </span>
                    </td>
                    {canWrite && (
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => handleEdit(vendor)}
                          title="Edit Vendor"
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
            {vendors.map(vendor => (
              <div key={vendor.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">
                        {vendor.vendorName}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          vendor.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}
                      >
                        {vendor.status}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-slate-300 mt-1">
                      Contact: {vendor.ownerContactName}
                    </div>
                  </div>
                  {canWrite && (
                    <button
                      onClick={() => handleEdit(vendor)}
                      className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="space-y-1 text-xs text-slate-400 pt-1">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>{vendor.ownerContactPhone}</span>
                  </div>
                  {vendor.ownerContactEmail && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{vendor.ownerContactEmail}</span>
                    </div>
                  )}
                  {vendor.address && (
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{vendor.address}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
