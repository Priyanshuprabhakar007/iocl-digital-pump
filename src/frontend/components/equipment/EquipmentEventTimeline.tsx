import React from 'react';
import { EquipmentBreakdownEvent } from '../../../shared/types';
import {
  FilePlus,
  UserCheck,
  UserCog,
  Wrench,
  CheckCircle2,
  ShieldCheck,
  XCircle,
  Clock,
  ArrowRight,
  User,
  Activity,
} from 'lucide-react';
import { formatEventType, formatTicketStatus, getStatusBadgeClass } from './equipmentUi';

interface EquipmentEventTimelineProps {
  events: EquipmentBreakdownEvent[];
  loading?: boolean;
}

export const EquipmentEventTimeline: React.FC<EquipmentEventTimelineProps> = ({
  events,
  loading,
}) => {
  if (loading) {
    return (
      <div className="space-y-4 py-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex gap-4 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-slate-800 shrink-0"></div>
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 bg-slate-800 rounded w-1/3"></div>
              <div className="h-3 bg-slate-800/60 rounded w-1/2"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="p-6 text-center rounded-xl bg-slate-950/40 border border-slate-800/60 text-slate-400">
        <Activity className="w-6 h-6 mx-auto mb-2 text-slate-500 opacity-60" />
        <p className="text-xs">No audit events recorded for this ticket yet.</p>
      </div>
    );
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'CREATED':
        return <FilePlus className="w-4 h-4 text-orange-400" />;
      case 'ASSIGNED':
        return <UserCheck className="w-4 h-4 text-indigo-400" />;
      case 'REASSIGNED':
        return <UserCog className="w-4 h-4 text-amber-400" />;
      case 'WORK_STARTED':
        return <Wrench className="w-4 h-4 text-blue-400" />;
      case 'RESOLVED':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'SIGNED_OFF':
        return <ShieldCheck className="w-4 h-4 text-emerald-300" />;
      case 'CANCELLED':
        return <XCircle className="w-4 h-4 text-rose-400" />;
      default:
        return <Activity className="w-4 h-4 text-slate-400" />;
    }
  };

  const getIconContainerClass = (type: string) => {
    switch (type) {
      case 'CREATED':
        return 'bg-orange-950/70 border-orange-800/50 text-orange-300';
      case 'ASSIGNED':
        return 'bg-indigo-950/70 border-indigo-800/50 text-indigo-300';
      case 'REASSIGNED':
        return 'bg-amber-950/70 border-amber-800/50 text-amber-300';
      case 'WORK_STARTED':
        return 'bg-blue-950/70 border-blue-800/50 text-blue-300';
      case 'RESOLVED':
        return 'bg-emerald-950/70 border-emerald-800/50 text-emerald-300';
      case 'SIGNED_OFF':
        return 'bg-emerald-900/80 border-emerald-700/60 text-emerald-200';
      case 'CANCELLED':
        return 'bg-rose-950/70 border-rose-800/50 text-rose-300';
      default:
        return 'bg-slate-800 border-slate-700 text-slate-300';
    }
  };

  return (
    <div className="relative pl-6 space-y-6 before:absolute before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
      {events.map((ev, index) => {
        const formattedDate = new Date(ev.createdAt).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        });

        return (
          <div key={ev.id || index} className="relative group">
            {/* Timeline Dot / Icon */}
            <div
              className={`absolute -left-6 top-0 w-6 h-6 rounded-full border flex items-center justify-center -translate-x-1/2 ring-4 ring-slate-900 ${getIconContainerClass(
                ev.eventType
              )}`}
            >
              {getEventIcon(ev.eventType)}
            </div>

            {/* Event Content Card */}
            <div className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3.5 hover:border-slate-700 transition-colors">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white font-mono">
                    {formatEventType(ev.eventType)}
                  </span>
                  {ev.fromStatus && ev.toStatus && (
                    <div className="inline-flex items-center gap-1.5 text-[11px]">
                      <span className={`px-1.5 py-0.5 rounded ${getStatusBadgeClass(ev.fromStatus)}`}>
                        {formatTicketStatus(ev.fromStatus)}
                      </span>
                      <ArrowRight className="w-3 h-3 text-slate-500" />
                      <span className={`px-1.5 py-0.5 rounded ${getStatusBadgeClass(ev.toStatus)}`}>
                        {formatTicketStatus(ev.toStatus)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>{formattedDate}</span>
                </div>
              </div>

              {/* Notes if provided */}
              {ev.notes && (
                <div className="mt-2 p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {ev.notes}
                </div>
              )}

              {/* Actor User Details */}
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                <User className="w-3 h-3 text-slate-400" />
                <span>Actor ID: {ev.actorUserId}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
