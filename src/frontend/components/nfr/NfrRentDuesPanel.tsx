import React from 'react';
import {
  CreditCard,
  Filter,
  FileText,
  Calendar,
  Building2,
  Users,
  Eye,
  PlusCircle,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import type {
  NfrRentDue,
  NfrLease,
  NfrSpace,
  NfrVendor,
  NfrRentPaymentStatus,
} from '../../../shared/types';
import {
  getNfrRentStatusDisplay,
  canRecordNfrRentPayment,
  validateNfrDateRange,
} from './nfrUi';
import { formatDisplayDate } from '../utilities/utilityUi';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../../shared/constants';

interface NfrRentDuesPanelProps {
  rentDues: NfrRentDue[];
  leases: NfrLease[];
  spaces: NfrSpace[];
  vendors: NfrVendor[];
  isLoading: boolean;
  filters: {
    leaseId: string;
    vendorId: string;
    spaceId: string;
    billingMonth: string;
    paymentStatus: string;
    overdueOnly: boolean;
    fromDate: string;
    toDate: string;
  };
  onFilterChange: (filters: Partial<{
    leaseId: string;
    vendorId: string;
    spaceId: string;
    billingMonth: string;
    paymentStatus: string;
    overdueOnly: boolean;
    fromDate: string;
    toDate: string;
  }>) => void;
  onResetFilters: () => void;
  onSelectDue: (due: NfrRentDue) => void;
  onRecordPayment: (due: NfrRentDue) => void;
}

export const NfrRentDuesPanel: React.FC<NfrRentDuesPanelProps> = ({
  rentDues,
  leases,
  spaces,
  vendors,
  isLoading,
  filters,
  onFilterChange,
  onResetFilters,
  onSelectDue,
  onRecordPayment,
}) => {
  const { hasPermission } = useAuth();

  const leaseMap = React.useMemo(() => {
    const map = new Map<string, NfrLease>();
    leases.forEach((l) => map.set(l.id, l));
    return map;
  }, [leases]);

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

  const dateValidation = validateNfrDateRange(filters.fromDate, filters.toDate);

  const hasActiveFilters = Boolean(
    filters.leaseId ||
    filters.vendorId ||
    filters.spaceId ||
    filters.billingMonth ||
    filters.paymentStatus ||
    filters.overdueOnly ||
    filters.fromDate ||
    filters.toDate
  );

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2">
          {/* Lease Filter */}
          <select
            value={filters.leaseId}
            onChange={(e) => onFilterChange({ leaseId: e.target.value })}
            className="px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          >
            <option value="">All Agreements</option>
            {leases.map((l) => (
              <option key={l.id} value={l.id}>
                {l.agreementNumber}
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

          {/* Billing Month */}
          <input
            type="month"
            value={filters.billingMonth}
            onChange={(e) => onFilterChange({ billingMonth: e.target.value })}
            className="px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            title="Filter by Billing Month"
          />

          {/* Payment Status */}
          <select
            value={filters.paymentStatus}
            onChange={(e) => onFilterChange({ paymentStatus: e.target.value })}
            className="px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          >
            <option value="">All Payment Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="PARTIAL">Partial</option>
            <option value="PAID">Paid</option>
          </select>

          {/* From Due Date */}
          <input
            type="date"
            value={filters.fromDate}
            onChange={(e) => onFilterChange({ fromDate: e.target.value })}
            placeholder="From Due Date"
            className="px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            title="From Due Date"
          />

          {/* To Due Date */}
          <input
            type="date"
            value={filters.toDate}
            onChange={(e) => onFilterChange({ toDate: e.target.value })}
            placeholder="To Due Date"
            className="px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            title="To Due Date"
          />
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-800/60">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filters.overdueOnly}
                onChange={(e) => onFilterChange({ overdueOnly: e.target.checked })}
                className="rounded bg-slate-900 border-slate-700 text-rose-500 focus:ring-rose-500/40"
              />
              <span className="text-rose-300 font-medium">Overdue Dues Only</span>
            </label>

            {!dateValidation.isValid && (
              <span className="text-xs text-rose-400 font-medium">
                {dateValidation.error}
              </span>
            )}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="px-3 py-1.5 bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs transition self-start sm:self-auto"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Rent Dues List */}
      {isLoading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 flex justify-center items-center text-slate-400 text-sm">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-amber-500 border-t-transparent mr-3" />
          Loading rent dues ledger...
        </div>
      ) : rentDues.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <CreditCard className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-slate-200 font-medium text-sm">No Rent Dues Found</h3>
          <p className="text-slate-400 text-xs mt-1">
            {hasActiveFilters
              ? 'No rent dues match the selected filters.'
              : 'No rent dues have been generated for this outlet yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Desktop Table */}
          <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/60 text-slate-400 font-medium border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Billing Month</th>
                    <th className="px-4 py-3">Agreement</th>
                    <th className="px-4 py-3">Vendor</th>
                    <th className="px-4 py-3">Space</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3">Rent Amount</th>
                    <th className="px-4 py-3">Total Paid</th>
                    <th className="px-4 py-3">Outstanding</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {rentDues.map((due) => {
                    const statusInfo = getNfrRentStatusDisplay(due.paymentStatus, due.isOverdue);
                    const lease = due.lease || leaseMap.get(due.leaseId);
                    const space = lease ? spaceMap.get(lease.spaceId) : null;
                    const vendor = lease ? vendorMap.get(lease.vendorId) : null;
                    const payable = canRecordNfrRentPayment(hasPermission, due);

                    return (
                      <tr
                        key={due.id}
                        className="hover:bg-slate-800/40 transition cursor-pointer"
                        onClick={() => onSelectDue(due)}
                      >
                        <td className="px-4 py-3 font-semibold text-slate-100">
                          {due.billingMonth}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-200">
                          {lease ? lease.agreementNumber : due.leaseId}
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {vendor ? vendor.vendorName : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {space ? `${space.spaceCode} - ${space.name}` : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-300">
                          {formatDisplayDate(due.dueDate)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-100 whitespace-nowrap">
                          ₹{due.monthlyRentStr}
                        </td>
                        <td className="px-4 py-3 text-emerald-400 font-semibold whitespace-nowrap">
                          ₹{due.totalPaidStr}
                        </td>
                        <td className="px-4 py-3 font-bold text-amber-300 whitespace-nowrap">
                          ₹{due.outstandingStr}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${statusInfo.badgeClass}`}
                          >
                            {statusInfo.label}
                          </span>
                        </td>
                        <td
                          className="px-4 py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => onSelectDue(due)}
                              title="View Ledger & Payments"
                              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {payable && (
                              <button
                                type="button"
                                onClick={() => onRecordPayment(due)}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded text-[11px] transition shadow-sm"
                              >
                                Pay
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
            {rentDues.map((due) => {
              const statusInfo = getNfrRentStatusDisplay(due.paymentStatus, due.isOverdue);
              const lease = due.lease || leaseMap.get(due.leaseId);
              const space = lease ? spaceMap.get(lease.spaceId) : null;
              const vendor = lease ? vendorMap.get(lease.vendorId) : null;
              const payable = canRecordNfrRentPayment(hasPermission, due);

              return (
                <div
                  key={due.id}
                  onClick={() => onSelectDue(due)}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 cursor-pointer hover:border-slate-700 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-sm text-slate-100">
                        {due.billingMonth}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {lease ? lease.agreementNumber : due.leaseId}
                        {vendor && ` • ${vendor.vendorName}`}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${statusInfo.badgeClass}`}
                    >
                      {statusInfo.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t border-slate-800/60 text-center">
                    <div className="p-2 bg-slate-800/50 rounded-lg">
                      <span className="text-slate-500 text-[10px] block">Rent Due</span>
                      <span className="text-slate-200 font-semibold">₹{due.monthlyRentStr}</span>
                    </div>
                    <div className="p-2 bg-slate-800/50 rounded-lg">
                      <span className="text-slate-500 text-[10px] block">Paid</span>
                      <span className="text-emerald-400 font-semibold">₹{due.totalPaidStr}</span>
                    </div>
                    <div className="p-2 bg-slate-800/50 rounded-lg border border-amber-500/20">
                      <span className="text-amber-400 text-[10px] block">Outstanding</span>
                      <span className="text-amber-300 font-bold">₹{due.outstandingStr}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                    <span>Due: {formatDisplayDate(due.dueDate)}</span>
                    <span>{due.paymentCount} payment(s)</span>
                  </div>

                  <div
                    className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/60"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectDue(due)}
                      className="px-3 py-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg text-xs font-medium transition"
                    >
                      View Details
                    </button>
                    {payable && (
                      <button
                        type="button"
                        onClick={() => onRecordPayment(due)}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded-lg text-xs transition shadow-sm"
                      >
                        Record Payment
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
