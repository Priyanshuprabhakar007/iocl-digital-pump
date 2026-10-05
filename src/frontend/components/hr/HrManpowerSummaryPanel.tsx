import React from 'react';
import { HrManpowerSummary } from '../../../shared/types';
import { Users, UserCheck, UserMinus, UserPlus, AlertCircle } from 'lucide-react';

export interface HrManpowerSummaryPanelProps {
  summary: HrManpowerSummary | null;
  isLoading: boolean;
}

export const HrManpowerSummaryPanel: React.FC<HrManpowerSummaryPanelProps> = ({
  summary,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="h-24 bg-slate-900/60 rounded-2xl border border-slate-800/80 p-4 flex flex-col justify-between"
          >
            <div className="h-4 bg-slate-800 rounded w-1/2"></div>
            <div className="h-7 bg-slate-800 rounded w-1/3"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800 text-center text-xs text-slate-400">
        No manpower summary data available.
      </div>
    );
  }

  const { totalSanctionedCount, totalActualCount, totalShortageCount, totalExcessCount } =
    summary;

  const hasShortage = totalShortageCount > 0;
  const hasExcess = totalExcessCount > 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Total Sanctioned */}
      <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-4 shadow-sm relative overflow-hidden group hover:border-slate-700 transition">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Total Sanctioned
          </span>
          <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400">
            <Users className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-white">
            {totalSanctionedCount}
          </span>
          <span className="text-xs text-slate-400">approved posts</span>
        </div>
        <div className="mt-1 text-[11px] text-slate-500 font-medium">
          Authorized manpower target
        </div>
      </div>

      {/* 2. Active Actual */}
      <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-4 shadow-sm relative overflow-hidden group hover:border-slate-700 transition">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Active Actual
          </span>
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
            <UserCheck className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-emerald-400">
            {totalActualCount}
          </span>
          <span className="text-xs text-slate-400">on duty / active</span>
        </div>
        <div className="mt-1 text-[11px] text-slate-500 font-medium">
          Currently employed active staff
        </div>
      </div>

      {/* 3. Total Shortage */}
      <div
        className={`bg-slate-900/80 rounded-2xl border p-4 shadow-sm relative overflow-hidden group transition ${
          hasShortage
            ? 'border-rose-500/30 bg-rose-950/10 hover:border-rose-500/50'
            : 'border-slate-800 hover:border-slate-700'
        }`}
      >
        <div className="flex items-center justify-between">
          <span
            className={`text-xs font-semibold uppercase tracking-wider ${
              hasShortage ? 'text-rose-400' : 'text-slate-400'
            }`}
          >
            Total Shortage
          </span>
          <div
            className={`p-2 rounded-xl ${
              hasShortage
                ? 'bg-rose-500/20 text-rose-400'
                : 'bg-slate-800 text-slate-500'
            }`}
          >
            <UserMinus className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className={`text-2xl font-bold font-mono ${
              hasShortage ? 'text-rose-400' : 'text-slate-400'
            }`}
          >
            {totalShortageCount}
          </span>
          <span className="text-xs text-slate-400">staff deficit</span>
        </div>
        <div className="mt-1 text-[11px] text-slate-500 font-medium">
          {hasShortage ? 'Below sanctioned strength' : 'No manpower deficit'}
        </div>
      </div>

      {/* 4. Total Excess */}
      <div
        className={`bg-slate-900/80 rounded-2xl border p-4 shadow-sm relative overflow-hidden group transition ${
          hasExcess
            ? 'border-sky-500/30 bg-sky-950/10 hover:border-sky-500/50'
            : 'border-slate-800 hover:border-slate-700'
        }`}
      >
        <div className="flex items-center justify-between">
          <span
            className={`text-xs font-semibold uppercase tracking-wider ${
              hasExcess ? 'text-sky-400' : 'text-slate-400'
            }`}
          >
            Total Excess
          </span>
          <div
            className={`p-2 rounded-xl ${
              hasExcess
                ? 'bg-sky-500/20 text-sky-400'
                : 'bg-slate-800 text-slate-500'
            }`}
          >
            <UserPlus className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className={`text-2xl font-bold font-mono ${
              hasExcess ? 'text-sky-400' : 'text-slate-400'
            }`}
          >
            {totalExcessCount}
          </span>
          <span className="text-xs text-slate-400">above sanction</span>
        </div>
        <div className="mt-1 text-[11px] text-slate-500 font-medium">
          {hasExcess ? 'Operational staff surplus' : 'Within sanctioned count'}
        </div>
      </div>
    </div>
  );
};
