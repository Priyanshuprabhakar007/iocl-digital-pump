import React from 'react';
import { EquipmentHealthSummary } from '../../../shared/types';
import {
  AlertTriangle,
  Siren,
  ClipboardCheck,
  Wrench,
  Activity,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import { formatEquipmentType, formatTicketStatus, getStatusBadgeClass } from './equipmentUi';

interface EquipmentHealthPanelProps {
  summary: EquipmentHealthSummary | null;
  loading: boolean;
}

export const EquipmentHealthPanel: React.FC<EquipmentHealthPanelProps> = ({
  summary,
  loading,
}) => {
  if (loading && !summary) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="h-28 rounded-2xl bg-slate-900/60 border border-slate-800/80 p-4 animate-pulse flex flex-col justify-between"
          >
            <div className="h-4 bg-slate-800 rounded w-1/2"></div>
            <div className="h-8 bg-slate-800 rounded w-1/3"></div>
          </div>
        ))}
      </div>
    );
  }

  const activeTickets = summary?.activeTicketCount ?? 0;
  const criticalTickets = summary?.criticalActiveCount ?? 0;
  const awaitingSignoff = summary?.resolvedAwaitingSignoffCount ?? 0;
  const currentlyDown = summary?.currentlyDownTargetCount ?? 0;

  const statusEntries = Object.entries(summary?.countsByStatus || {}).filter(([_, count]) => count > 0);
  const typeEntries = Object.entries(summary?.countsByEquipmentType || {}).filter(([_, count]) => count > 0);

  return (
    <div className="space-y-4 mb-6">
      {/* 4 Key KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Breakdowns */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-lg shadow-black/20 hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
              Active Breakdowns
            </span>
            <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white tracking-tight font-mono">
              {activeTickets}
            </span>
            <span className="text-xs text-slate-400">
              {activeTickets === 1 ? 'ticket pending' : 'tickets pending'}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-orange-400" />
            <span>Open, assigned, or in-repair</span>
          </div>
        </div>

        {/* Critical Active */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-900/80 border border-rose-950/60 p-5 shadow-lg shadow-black/20 hover:border-rose-900/60 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-300/80 font-mono">
              Critical Active
            </span>
            <div className={`p-2.5 rounded-xl ${criticalTickets > 0 ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse' : 'bg-slate-800/80 text-slate-400'}`}>
              <Siren className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold tracking-tight font-mono ${criticalTickets > 0 ? 'text-rose-400' : 'text-white'}`}>
              {criticalTickets}
            </span>
            <span className="text-xs text-slate-400">
              {criticalTickets === 1 ? 'emergency priority' : 'emergency priorities'}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${criticalTickets > 0 ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'}`} />
            <span>{criticalTickets > 0 ? 'Immediate field response required' : 'No critical emergencies active'}</span>
          </div>
        </div>

        {/* Awaiting Sign-off */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-900/80 border border-amber-950/60 p-5 shadow-lg shadow-black/20 hover:border-amber-900/60 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-300/80 font-mono">
              Awaiting Sign-off
            </span>
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ClipboardCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold tracking-tight font-mono ${awaitingSignoff > 0 ? 'text-amber-400' : 'text-white'}`}>
              {awaitingSignoff}
            </span>
            <span className="text-xs text-slate-400">
              resolved tickets
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
            <span>Pending officer sign-off & verification</span>
          </div>
        </div>

        {/* Equipment Currently Down */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-lg shadow-black/20 hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
              Equipment Down
            </span>
            <div className={`p-2.5 rounded-xl ${currentlyDown > 0 ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
              <Wrench className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold tracking-tight font-mono ${currentlyDown > 0 ? 'text-rose-300' : 'text-emerald-400'}`}>
              {currentlyDown}
            </span>
            <span className="text-xs text-slate-400">
              {currentlyDown === 1 ? 'target offline' : 'targets offline'}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>Dispensers / auxiliary assets out of order</span>
          </div>
        </div>
      </div>

      {/* Breakdown Badges by Status & Equipment Type */}
      {(statusEntries.length > 0 || typeEntries.length > 0) && (
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs">
          {/* Status breakdown */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px] font-mono mr-1">
              Status Breakdown:
            </span>
            {statusEntries.map(([status, count]) => (
              <span
                key={status}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${getStatusBadgeClass(status)}`}
              >
                <span>{formatTicketStatus(status)}</span>
                <span className="font-mono font-bold opacity-90">({count})</span>
              </span>
            ))}
          </div>

          {/* Type breakdown */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px] font-mono mr-1">
              Active Targets:
            </span>
            {typeEntries.map(([eqType, count]) => (
              <span
                key={eqType}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700"
              >
                <span>{formatEquipmentType(eqType)}</span>
                <span className="font-mono font-bold text-orange-400">({count})</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
