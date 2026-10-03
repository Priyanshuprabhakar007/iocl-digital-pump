import React from 'react';
import {
  Plus,
  Filter,
  FileText,
  Building2,
  Users,
  Calendar,
  Zap,
  Eye,
  Edit2,
  XCircle,
  Clock,
  CheckCircle2,
  Layers,
  ArrowUpDown,
} from 'lucide-react';
import type { NfrLease, NfrSpace, NfrVendor, NfrType, NfrLeaseStatus } from '../../../shared/types';
import {
  formatNfrType,
  getNfrLeaseStatusDisplay,
  canEditNfrLease,
  canTerminateNfrLease,
  canGenerateNfrRentDue,
} from './nfrUi';
import { formatDisplayDate } from '../utilities/utilityUi';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../../shared/constants';

interface NfrLeasesPanelProps {
  leases: NfrLease[];
  spaces: NfrSpace[];
  vendors: NfrVendor[];
  isLoading: boolean;
  filters: {
    spaceId: string;
    vendorId: string;
    status: string;
    nfrType: string;
    expiredOnly: boolean;
  };
  onFilterChange: (filters: Partial<{
    spaceId: string;
    vendorId: string;
    status: string;
    nfrType: string;
    expiredOnly: boolean;
  }>) => void;
  onResetFilters: () => void;
  onCreateLease: () => void;
  onEditLease: (lease: NfrLease) => void;
  onTerminateLease: (lease: NfrLease) => void;
  onSelectLease: (lease: NfrLease) => void;
  onGenerateDue: (lease: NfrLease) => void;
}

export const NfrLeasesPanel: React.FC<NfrLeasesPanelProps> = ({
  leases,
  spaces,
  vendors,
  isLoading,
  filters,
  onFilterChange,
  onResetFilters,
  onCreateLease,
  onEditLease,
  onTerminateLease,
  onSelectLease,
  onGenerateDue,
}) => {
  const { hasPermission } = useAuth();
  const canWriteLeases = hasPermission(PERMISSIONS.NFR_LEASES_WRITE);
  const canWriteRentDues = hasPermission(PERMISSIONS.NFR_RENT_DUES_WRITE);

  const spaceMap = React.useMemo(() => {
    const map = new Map<string, NfrSpace>();
    spaces.forEach((s) => map.set(s.id, s));
    return map;
  }, [spaces]);

  const vendorMap = React.useMemo(() => {
    const map = new Map<string, NfrVendor>();
    vendors.forEach((v) => map.set(v.id, v));
    return map;
  }, [vendors]);

  const hasActiveFilters = Boolean(
    filters.spaceId ||
    filters.vendorId ||
    filters.status ||
    filters.nfrType ||
    filters.expiredOnly
  );

  return (
    <div className="space-y-4">
      {/* Controls / Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 flex-1">
            {/* Space Filter */}
            <select
              value={filters.spaceId}
              onChange={(e) => onFilterChange({ spaceId: e.target.value })}
              className="px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              <option value="">All Spaces</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.spaceCode} - {s.name}
                </option>
              ))}
            </select>

            {/* Vendor Filter */}
            <select
              value={filters.vendorId}
              onChange={(e) => onFilterChange({ vendorId: e.target.value })}
              className="px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              <option value="">All Vendors</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.vendorName}
                </option>
              ))}
            </select>

            {/* NFR Type Filter */}
            <select
              value={filters.nfrType}
              onChange={(e) => onFilterChange({ nfrType: e.target.value })}
              className="px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              <option value="">All NFR Types</option>
              <option value="ATM">ATM</option>
              <option value="CONVENIENCE_STORE">Convenience Store</option>
              <option value="QSR">QSR</option>
              <option value="CAR_WASH">Car Wash</option>
              <option value="EV_CHARGING">EV Charging</option>
              <option value="CANOPY_ADVERTISING">Canopy Advertising</option>
            </select>

            {/* Status Filter */}
            <select
              value={filters.status}
              onChange={(e) => onFilterChange({ status: e.target.value })}
              className="px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="TERMINATED">Terminated</option>
            </select>

            {/* Expired Toggle & Reset */}
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-300 cursor-pointer flex-1 select-none">
                <input
                  type="checkbox"
                  checked={filters.expiredOnly}
                  onChange={(e) => onFilterChange({ expiredOnly: e.target.checked })}
                  className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-amber-500/40"
                />
                <span className="truncate">Expired Only</span>
              </label>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={onResetFilters}
                  className="px-3 py-2 bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs transition"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {canWriteLeases && (
            <button
              type="button"
              onClick={onCreateLease}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs rounded-lg transition shadow-sm shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Create Lease</span>
            </button>
          )}
        </div>
      </div>

      {/* Leases List */}
      {isLoading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 flex justify-center items-center text-slate-400 text-sm">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-amber-500 border-t-transparent mr-3" />
          Loading lease agreements...
        </div>
      ) : leases.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <FileText className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-slate-200 font-medium text-sm">No Lease Agreements Found</h3>
          <p className="text-slate-400 text-xs mt-1">
            {hasActiveFilters
              ? 'No lease agreements match the selected filters.'
              : 'No leases have been created for this outlet yet.'}
          </p>
          {canWriteLeases && !hasActiveFilters && (
            <button
              type="button"
              onClick={onCreateLease}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-medium rounded-lg transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Create First Lease
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Desktop Table */}
          <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/60 text-slate-400 font-medium border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Agreement No.</th>
                    <th className="px-4 py-3">Space & Type</th>
                    <th className="px-4 py-3">Vendor</th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Rent / Deposit</th>
                    <th className="px-4 py-3">Due Day</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Links</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {leases.map((lease) => {
                    const statusInfo = getNfrLeaseStatusDisplay(lease.status, lease.isExpired);
                    const space = spaceMap.get(lease.spaceId);
                    const vendor = vendorMap.get(lease.vendorId);
                    const editable = canEditNfrLease(hasPermission, lease);
                    const terminable = canTerminateNfrLease(hasPermission, lease);
                    const generable = canGenerateNfrRentDue(hasPermission);

                    return (
                      <tr
                        key={lease.id}
                        className="hover:bg-slate-800/40 transition cursor-pointer"
                        onClick={() => onSelectLease(lease)}
                      >
                        <td className="px-4 py-3 font-semibold text-slate-100">
                          {lease.agreementNumber}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-200">
                            {space ? `${space.spaceCode} - ${space.name}` : lease.spaceId}
                          </div>
                          {space && (
                            <div className="text-[11px] text-amber-400/90 font-medium">
                              {formatNfrType(space.nfrType)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-200">
                            {vendor ? vendor.vendorName : lease.vendorId}
                          </div>
                          {vendor?.ownerContactPhone && (
                            <div className="text-[11px] text-slate-400">
                              {vendor.ownerContactPhone}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-300">
                          <div>{formatDisplayDate(lease.leaseStartDate)}</div>
                          <div className="text-[11px] text-slate-500">
                            to {formatDisplayDate(lease.leaseEndDate)}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-semibold text-slate-100">
                            ₹{lease.monthlyRentStr} <span className="text-[10px] text-slate-400 font-normal">/mo</span>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Dep: ₹{lease.securityDepositStr}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          Day {lease.monthlyDueDay}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${statusInfo.badgeClass}`}
                          >
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-slate-400">
                            {lease.agreementDocumentId && (
                              <span
                                title="Agreement document attached"
                                className="p-1 rounded bg-slate-800 text-sky-400 border border-slate-700 inline-flex"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </span>
                            )}
                            {lease.subMeterId && (
                              <span
                                title="Linked NFR Sub-meter"
                                className="p-1 rounded bg-slate-800 text-amber-400 border border-slate-700 inline-flex"
                              >
                                <Zap className="w-3.5 h-3.5" />
                              </span>
                            )}
                            {!lease.agreementDocumentId && !lease.subMeterId && (
                              <span className="text-slate-600 text-xs">—</span>
                            )}
                          </div>
                        </td>
                        <td
                          className="px-4 py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => onSelectLease(lease)}
                              title="View Lease Details"
                              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {generable && (
                              <button
                                type="button"
                                onClick={() => onGenerateDue(lease)}
                                title="Generate Monthly Rent Due"
                                className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[11px] font-medium transition"
                              >
                                Gen Due
                              </button>
                            )}
                            {editable && (
                              <button
                                type="button"
                                onClick={() => onEditLease(lease)}
                                title="Edit Lease"
                                className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded transition"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {terminable && (
                              <button
                                type="button"
                                onClick={() => onTerminateLease(lease)}
                                title="Terminate Lease"
                                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition"
                              >
                                <XCircle className="w-3.5 h-3.5" />
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
          </div>

          {/* Mobile Stacked Cards */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {leases.map((lease) => {
              const statusInfo = getNfrLeaseStatusDisplay(lease.status, lease.isExpired);
              const space = spaceMap.get(lease.spaceId);
              const vendor = vendorMap.get(lease.vendorId);
              const editable = canEditNfrLease(hasPermission, lease);
              const terminable = canTerminateNfrLease(hasPermission, lease);
              const generable = canGenerateNfrRentDue(hasPermission);

              return (
                <div
                  key={lease.id}
                  onClick={() => onSelectLease(lease)}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 cursor-pointer hover:border-slate-700 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-sm text-slate-100">
                        {lease.agreementNumber}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {space ? `${space.spaceCode} - ${space.name}` : lease.spaceId}
                        {space && (
                          <span className="text-amber-400 font-medium ml-1.5">
                            ({formatNfrType(space.nfrType)})
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${statusInfo.badgeClass}`}
                    >
                      {statusInfo.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800/60">
                    <div>
                      <span className="text-slate-500">Vendor:</span>
                      <div className="text-slate-200 font-medium truncate">
                        {vendor ? vendor.vendorName : lease.vendorId}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">Monthly Rent:</span>
                      <div className="text-slate-200 font-semibold">
                        ₹{lease.monthlyRentStr}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">Period:</span>
                      <div className="text-slate-300">
                        {formatDisplayDate(lease.leaseStartDate)} - {formatDisplayDate(lease.leaseEndDate)}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">Due Day / Dep:</span>
                      <div className="text-slate-300">
                        Day {lease.monthlyDueDay} • ₹{lease.securityDepositStr}
                      </div>
                    </div>
                  </div>

                  <div
                    className="flex items-center justify-between pt-2 border-t border-slate-800/60"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1.5">
                      {lease.agreementDocumentId && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-sky-400 text-[10px] border border-slate-700 flex items-center gap-1">
                          <FileText className="w-3 h-3" /> Doc
                        </span>
                      )}
                      {lease.subMeterId && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-400 text-[10px] border border-slate-700 flex items-center gap-1">
                          <Zap className="w-3 h-3" /> Sub-meter
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {generable && (
                        <button
                          type="button"
                          onClick={() => onGenerateDue(lease)}
                          className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[11px] font-medium transition"
                        >
                          Gen Due
                        </button>
                      )}
                      {editable && (
                        <button
                          type="button"
                          onClick={() => onEditLease(lease)}
                          className="p-1.5 text-slate-400 hover:text-amber-400 bg-slate-800 rounded border border-slate-700"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {terminable && (
                        <button
                          type="button"
                          onClick={() => onTerminateLease(lease)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-800 rounded border border-slate-700"
                        >
                          <XCircle className="w-3.5 h-3.5" />
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
