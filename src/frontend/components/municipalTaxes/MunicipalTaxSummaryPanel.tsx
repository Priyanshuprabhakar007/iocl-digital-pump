import React from 'react';
import { MunicipalTaxSummary } from '../../../shared/types';
import { formatDisplayDate } from './municipalTaxUi';
import { AlertCircle, Clock, CheckCircle2, IndianRupee, Calendar, FileText } from 'lucide-react';

interface MunicipalTaxSummaryPanelProps {
  summary: MunicipalTaxSummary | null;
  loading: boolean;
}

export const MunicipalTaxSummaryPanel: React.FC<MunicipalTaxSummaryPanelProps> = ({
  summary,
  loading,
}) => {
  if (loading && !summary) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 animate-pulse h-28 flex flex-col justify-between"
          >
            <div className="h-4 bg-slate-800 rounded w-1/2"></div>
            <div className="h-7 bg-slate-800 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    );
  }

  const pendingAmount = summary ? `₹${summary.pendingAmountStr}` : '₹0.00';
  const overdueAmount = summary ? `₹${summary.overdueAmountStr}` : '₹0.00';
  const paidAmount = summary ? `₹${summary.paidAmountStr}` : '₹0.00';
  const pendingCount = summary?.pendingCount ?? 0;
  const overdueCount = summary?.overdueCount ?? 0;
  const paidCount = summary?.paidCount ?? 0;
  const totalCount = summary?.totalCount ?? 0;
  const nextDueDate = summary?.nextDueDate ? formatDisplayDate(summary.nextDueDate) : 'None';

  return (
    <div className="space-y-4">
      {/* Primary 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pending Amount */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-800/40 border border-amber-500/20 shadow-lg shadow-black/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all pointer-events-none" />
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider font-mono">Pending Amount</span>
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white font-mono tracking-tight">{pendingAmount}</div>
          <div className="text-[11px] text-amber-400/80 font-mono mt-1">
            {pendingCount} pending {pendingCount === 1 ? 'due' : 'dues'}
          </div>
        </div>

        {/* Overdue Amount */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-800/40 border border-rose-500/20 shadow-lg shadow-black/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl group-hover:bg-rose-500/10 transition-all pointer-events-none" />
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider font-mono">Overdue Amount</span>
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-300 font-mono tracking-tight">{overdueAmount}</div>
          <div className="text-[11px] text-rose-400 font-mono mt-1">
            {overdueCount} {overdueCount === 1 ? 'due' : 'dues'} requiring urgent settlement
          </div>
        </div>

        {/* Pending Count */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-800/40 border border-slate-800 shadow-lg shadow-black/20 relative overflow-hidden group">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider font-mono">Pending Dues</span>
            <div className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-orange-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white font-mono tracking-tight">{pendingCount}</div>
          <div className="text-[11px] text-slate-400 font-mono mt-1">
            Across active statutory assessments
          </div>
        </div>

        {/* Overdue Count */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-800/40 border border-slate-800 shadow-lg shadow-black/20 relative overflow-hidden group">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider font-mono">Overdue Dues</span>
            <div className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-rose-400">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white font-mono tracking-tight">{overdueCount}</div>
          <div className="text-[11px] text-slate-400 font-mono mt-1">
            Past statutory deadline
          </div>
        </div>
      </div>

      {/* Secondary Contextual Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-900/40 border border-slate-800/60 text-xs">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="truncate">
            <div className="text-slate-400 text-[10px] font-mono uppercase">Paid Dues</div>
            <div className="font-semibold text-slate-200 font-mono">
              {paidCount} <span className="text-slate-500">({paidAmount})</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
          <div className="truncate">
            <div className="text-slate-400 text-[10px] font-mono uppercase">Total Dues</div>
            <div className="font-semibold text-slate-200 font-mono">{totalCount} assessments</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 col-span-2 sm:col-span-2">
          <Calendar className="w-4 h-4 text-orange-400 shrink-0" />
          <div className="truncate">
            <div className="text-slate-400 text-[10px] font-mono uppercase">Next Due Date</div>
            <div className="font-semibold text-slate-200 font-mono">{nextDueDate}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
