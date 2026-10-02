import React from 'react';
import { UtilityElectricityBill, UtilityElectricityAccount } from '../../../shared/types';
import { getBillStatusDisplay, formatDisplayDate, canEditBill, canMarkBillPaid } from './utilityUi';
import {
  FileText,
  Plus,
  Filter,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Zap,
} from 'lucide-react';

interface ElectricityBillsPanelProps {
  bills: UtilityElectricityBill[];
  accounts: UtilityElectricityAccount[];
  loading?: boolean;
  canWriteBills: boolean;
  canWritePayments: boolean;
  filterStatus: string;
  filterFromDate: string;
  filterToDate: string;
  onFilterChange: (filters: { status: string; fromDate: string; toDate: string }) => void;
  onOpenCreate: () => void;
  onSelectBill: (bill: UtilityElectricityBill) => void;
  onOpenEdit: (bill: UtilityElectricityBill) => void;
  onOpenMarkPaid: (bill: UtilityElectricityBill) => void;
}

export const ElectricityBillsPanel: React.FC<ElectricityBillsPanelProps> = ({
  bills,
  accounts,
  loading = false,
  canWriteBills,
  canWritePayments,
  filterStatus,
  filterFromDate,
  filterToDate,
  onFilterChange,
  onOpenCreate,
  onSelectBill,
  onOpenEdit,
  onOpenMarkPaid,
}) => {
  const accountMap = new Map<string, UtilityElectricityAccount>();
  accounts.forEach(a => accountMap.set(a.id, a));

  const hasActiveFilters = filterStatus !== '' || filterFromDate !== '' || filterToDate !== '';

  const handleClearFilters = () => {
    onFilterChange({ status: '', fromDate: '', toDate: '' });
  };

  return (
    <div className="space-y-4">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Electricity Bills & Invoices
            </h3>
            <p className="text-xs text-slate-400">
              {bills.length} {bills.length === 1 ? 'invoice' : 'invoices'} found for this outlet
            </p>
          </div>
        </div>

        {canWriteBills && (
          <button
            type="button"
            onClick={onOpenCreate}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors shadow-lg shadow-orange-500/20 shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            New Bill
          </button>
        )}
      </div>

      {/* Filter Toolbar */}
      <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5 text-slate-400 font-semibold uppercase tracking-wider text-[11px] mr-1">
          <Filter className="w-3.5 h-3.5 text-orange-400" />
          Filter:
        </div>

        {/* Status Filter */}
        <select
          value={filterStatus}
          onChange={e => onFilterChange({ status: e.target.value, fromDate: filterFromDate, toDate: filterToDate })}
          className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-orange-500/60"
        >
          <option value="">All Statuses</option>
          <option value="PENDING">Pending (Unpaid)</option>
          <option value="PAID">Paid (Settled)</option>
        </select>

        {/* From Date */}
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 text-[11px]">From:</span>
          <input
            type="date"
            value={filterFromDate}
            onChange={e => onFilterChange({ status: filterStatus, fromDate: e.target.value, toDate: filterToDate })}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-orange-500/60"
          />
        </div>

        {/* To Date */}
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 text-[11px]">To:</span>
          <input
            type="date"
            value={filterToDate}
            onChange={e => onFilterChange({ status: filterStatus, fromDate: filterFromDate, toDate: e.target.value })}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-orange-500/60"
          />
        </div>

        {/* Clear Button */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl flex items-center gap-1 transition-colors text-[11px] font-medium"
          >
            <RotateCcw className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-8 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse space-y-3">
          <div className="h-6 w-40 bg-slate-800 rounded" />
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-16 bg-slate-800/60 rounded-xl" />
            ))}
          </div>
        </div>
      ) : bills.length === 0 ? (
        <div className="p-12 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500 mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-white">
            {hasActiveFilters ? 'No Matching Bills Found' : 'No Electricity Bills Recorded'}
          </h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {hasActiveFilters
              ? 'Try adjusting your status or date range filters to find the bills you are looking for.'
              : 'Register an invoice for electricity consumption to track payment schedules and settlement.'}
          </p>
          {canWriteBills && !hasActiveFilters && (
            <button
              type="button"
              onClick={onOpenCreate}
              className="mt-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-orange-400 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors border border-slate-700"
            >
              <Plus className="w-3.5 h-3.5" />
              Register First Bill
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Desktop Table View */}
          <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Billing Period</th>
                  <th className="py-3 px-4">Consumer Account</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Settlement Reference</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300 font-medium">
                {bills.map(bill => {
                  const account = accountMap.get(bill.electricityAccountId);
                  const statusInfo = getBillStatusDisplay(bill);
                  const allowPay = canMarkBillPaid(bill, canWritePayments);

                  return (
                    <tr
                      key={bill.id}
                      onClick={() => onSelectBill(bill)}
                      className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-4">
                        <div className="font-mono text-white font-semibold">
                          {bill.billingPeriodStart} to {bill.billingPeriodEnd}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono text-slate-200">
                          {account?.consumerNumber || bill.electricityAccountId}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {account?.providerName || 'DISCOM'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-white font-mono text-sm">
                          ₹{bill.billAmountStr}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div
                          className={`font-mono ${
                            statusInfo.isOverdue ? 'text-rose-400 font-bold' : 'text-slate-300'
                          }`}
                        >
                          {formatDisplayDate(bill.dueDate)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${statusInfo.badgeClass}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {bill.paymentReference ? (
                          <span className="text-emerald-400/90">{bill.paymentReference}</span>
                        ) : bill.status === 'PAID' ? (
                          <span className="text-slate-500 italic">Receipt Attached</span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {allowPay && (
                            <button
                              type="button"
                              onClick={() => onOpenMarkPaid(bill)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm transition-colors"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Pay
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onSelectBill(bill)}
                            className="p-1.5 text-slate-400 group-hover:text-orange-400 transition-colors"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Card View */}
          <div className="md:hidden space-y-3">
            {bills.map(bill => {
              const account = accountMap.get(bill.electricityAccountId);
              const statusInfo = getBillStatusDisplay(bill);
              const allowPay = canMarkBillPaid(bill, canWritePayments);

              return (
                <div
                  key={bill.id}
                  onClick={() => onSelectBill(bill)}
                  className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 cursor-pointer hover:border-slate-700 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-white font-mono text-sm">
                        ₹{bill.billAmountStr}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {bill.billingPeriodStart} to {bill.billingPeriodEnd}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${statusInfo.badgeClass}`}
                    >
                      {statusInfo.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-800/80">
                    <div>
                      <span className="text-[11px] text-slate-500 block uppercase">Account</span>
                      <span className="text-slate-300 font-mono font-medium truncate block">
                        {account?.consumerNumber || bill.electricityAccountId}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 block uppercase">Due Date</span>
                      <span
                        className={`font-mono font-medium ${
                          statusInfo.isOverdue ? 'text-rose-400 font-bold' : 'text-slate-300'
                        }`}
                      >
                        {formatDisplayDate(bill.dueDate)}
                      </span>
                    </div>
                  </div>

                  {allowPay && (
                    <div className="pt-2 border-t border-slate-800 flex justify-end" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => onOpenMarkPaid(bill)}
                        className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Record Bill Payment
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
