import React from 'react';
import { NfrSummary } from '../../../shared/types';
import { formatDisplayDate } from './nfrUi';
import {
  IndianRupee,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building,
  Users,
  FileText,
  Calendar,
  Layers,
  ArrowUpRight,
} from 'lucide-react';

export interface NfrSummaryPanelProps {
  summary: NfrSummary | null;
  loading?: boolean;
  isLoading?: boolean;
}

export const NfrSummaryPanel: React.FC<NfrSummaryPanelProps> = ({ summary, loading, isLoading }) => {
  const isBusy = Boolean(loading || isLoading);

  if (isBusy && !summary) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 animate-pulse">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-28 bg-slate-900/60 rounded-2xl border border-slate-800/80 p-4" />
        ))}
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="space-y-3 md:space-y-4">
      {/* Top Row: Primary Financial Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {/* Total Outstanding */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total Outstanding</span>
            <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <span className="text-xl md:text-2xl font-black text-white tracking-tight">
              ₹{summary.totalOutstandingStr}
            </span>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400">
              <span>{summary.pendingDueCount + summary.partialDueCount} pending/partial dues</span>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-orange-500/10 transition" />
        </div>

        {/* Overdue Outstanding */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Overdue Amount</span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <span className="text-xl md:text-2xl font-black text-rose-400 tracking-tight">
              ₹{summary.overdueOutstandingStr}
            </span>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-rose-400/80">
              <span>{summary.overdueDueCount} overdue billings</span>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-rose-500/10 transition" />
        </div>

        {/* Total Collected */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total Collected</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <span className="text-xl md:text-2xl font-black text-emerald-400 tracking-tight">
              ₹{summary.totalCollectedStr}
            </span>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400">
              <span>{summary.paidDueCount} fully paid dues</span>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-emerald-500/10 transition" />
        </div>

        {/* Total Rent Due Generated */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total Rent Due</span>
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <span className="text-xl md:text-2xl font-black text-white tracking-tight">
              ₹{summary.totalRentDueStr}
            </span>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400">
              <span>{summary.rentDueCount} total rent billings</span>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-sky-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-sky-500/10 transition" />
        </div>
      </div>

      {/* Bottom Row: Secondary Operational Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {/* Active Spaces */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-800 text-orange-400 shrink-0">
            <Building className="w-4 h-4" />
          </div>
          <div className="truncate">
            <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 truncate">Spaces</div>
            <div className="text-sm font-bold text-white">
              {summary.activeSpaceCount} <span className="text-xs font-normal text-slate-500">/ {summary.spaceCount}</span>
            </div>
          </div>
        </div>

        {/* Active Vendors */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-800 text-blue-400 shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div className="truncate">
            <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 truncate">Vendors</div>
            <div className="text-sm font-bold text-white">
              {summary.activeVendorCount} <span className="text-xs font-normal text-slate-500">/ {summary.vendorCount}</span>
            </div>
          </div>
        </div>

        {/* Active Leases */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-800 text-emerald-400 shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="truncate">
            <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 truncate">Active Leases</div>
            <div className="text-sm font-bold text-white">
              {summary.activeLeaseCount} <span className="text-xs font-normal text-slate-500">/ {summary.leaseCount}</span>
            </div>
          </div>
        </div>

        {/* Expired / Terminated Leases */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-800 text-amber-400 shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div className="truncate">
            <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 truncate">Inactive Leases</div>
            <div className="text-xs font-semibold text-slate-300">
              <span className="text-amber-400">{summary.expiredLeaseCount} exp</span> • <span className="text-slate-400">{summary.terminatedLeaseCount} term</span>
            </div>
          </div>
        </div>

        {/* Pending & Partial Dues */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-800 text-orange-400 shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div className="truncate">
            <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 truncate">Unpaid Dues</div>
            <div className="text-xs font-semibold text-slate-300">
              <span className="text-orange-400">{summary.pendingDueCount} pend</span> • <span className="text-sky-400">{summary.partialDueCount} part</span>
            </div>
          </div>
        </div>

        {/* Next Due Date */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-800 text-purple-400 shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <div className="truncate">
            <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 truncate">Next Due Date</div>
            <div className="text-xs font-bold text-white truncate">
              {summary.nextDueDate ? formatDisplayDate(summary.nextDueDate) : 'None'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
