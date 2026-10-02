import React from 'react';
import { UtilityElectricitySummary } from '../../../shared/types';
import { formatDisplayDate } from './utilityUi';
import { FileText, AlertTriangle, CheckCircle2, Zap, Calendar, Loader2 } from 'lucide-react';

interface UtilitySummaryPanelProps {
  summary: UtilityElectricitySummary | null;
  loading?: boolean;
}

export const UtilitySummaryPanel: React.FC<UtilitySummaryPanelProps> = ({
  summary,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl animate-pulse flex items-center justify-between"
          >
            <div className="space-y-2">
              <div className="h-3 w-20 bg-slate-800 rounded" />
              <div className="h-6 w-28 bg-slate-800 rounded" />
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-800" />
          </div>
        ))}
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pending Bills */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm relative overflow-hidden group hover:border-amber-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Pending Bills
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white tracking-tight">
              {summary.pendingBillCount}
            </span>
            <span className="text-xs text-amber-400 font-semibold">
              ₹{summary.pendingAmountStr || '0.00'}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Total unpaid bills across active accounts
          </div>
        </div>

        {/* Overdue Bills */}
        <div
          className={`p-4 rounded-2xl shadow-sm relative overflow-hidden transition-all ${
            summary.overdueBillCount > 0
              ? 'bg-rose-950/20 border border-rose-500/30 hover:border-rose-500/50'
              : 'bg-slate-900 border border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Overdue Bills
            </span>
            <div
              className={`w-9 h-9 rounded-xl border flex items-center justify-center ${
                summary.overdueBillCount > 0
                  ? 'bg-rose-500/20 border-rose-500/30 text-rose-400'
                  : 'bg-slate-800/60 border-slate-700 text-slate-400'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={`text-2xl font-black tracking-tight ${
                summary.overdueBillCount > 0 ? 'text-rose-400' : 'text-white'
              }`}
            >
              {summary.overdueBillCount}
            </span>
            <span
              className={`text-xs font-semibold ${
                summary.overdueBillCount > 0 ? 'text-rose-400' : 'text-slate-500'
              }`}
            >
              ₹{summary.overdueAmountStr || '0.00'}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Past due date requiring immediate settlement
          </div>
        </div>

        {/* Active Accounts */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm relative overflow-hidden group hover:border-orange-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Consumer Accounts
            </span>
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <Zap className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white tracking-tight">
              {summary.activeAccountCount}
            </span>
            <span className="text-xs text-slate-400 font-normal">
              / {summary.accountCount} total
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Active electricity meters at this outlet
          </div>
        </div>

        {/* Paid Bills & Latest Due */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm relative overflow-hidden group hover:border-emerald-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Settled Bills
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-400 tracking-tight">
              {summary.paidBillCount}
            </span>
            {summary.latestBillDueDate && (
              <span className="text-[11px] text-slate-400 font-medium truncate flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-500" />
                Due: {formatDisplayDate(summary.latestBillDueDate)}
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Historical settled bills with attached receipts
          </div>
        </div>
      </div>
    </div>
  );
};
