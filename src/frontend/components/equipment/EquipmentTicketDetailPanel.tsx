import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Clock,
  Wrench,
  User,
  Phone,
  Calendar,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  XCircle,
  Play,
  UserCheck,
  UserCog,
  RefreshCw,
  Loader2,
  FileText,
  Layers,
  Activity,
} from 'lucide-react';
import {
  EquipmentBreakdownTicket,
  EquipmentBreakdownEvent,
} from '../../../shared/types';
import { apiFetch } from '../../services/api';
import {
  formatDowntime,
  formatEquipmentType,
  formatFailureCategory,
  formatPriority,
  formatTicketStatus,
  getPriorityBadgeClass,
  getStatusBadgeClass,
  getAvailableTicketActions,
  getEquipmentErrorMessage,
} from './equipmentUi';
import { EquipmentEventTimeline } from './EquipmentEventTimeline';
import {
  EquipmentTicketActionModal,
  TicketActionType,
} from './EquipmentTicketActionModal';

interface EquipmentTicketDetailPanelProps {
  isOpen: boolean;
  onClose: () => void;
  ticketId: string | null;
  canManage: boolean;
  canSignoff: boolean;
  onTicketUpdated: () => void;
}

export const EquipmentTicketDetailPanel: React.FC<EquipmentTicketDetailPanelProps> = ({
  isOpen,
  onClose,
  ticketId,
  canManage,
  canSignoff,
  onTicketUpdated,
}) => {
  const [ticket, setTicket] = useState<EquipmentBreakdownTicket | null>(null);
  const [events, setEvents] = useState<EquipmentBreakdownEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Action Modal State
  const [activeActionModal, setActiveActionModal] = useState<TicketActionType | null>(null);

  const fetchTicketDetails = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const [ticketRes, eventsRes] = await Promise.allSettled([
        apiFetch<EquipmentBreakdownTicket>(`/api/v1/equipment/tickets/${id}`),
        apiFetch<EquipmentBreakdownEvent[]>(`/api/v1/equipment/tickets/${id}/events`),
      ]);

      if (ticketRes.status === 'fulfilled' && ticketRes.value.success && ticketRes.value.data) {
        setTicket(ticketRes.value.data);
      } else if (ticketRes.status === 'fulfilled' && !ticketRes.value.success) {
        setError(getEquipmentErrorMessage(ticketRes.value.error?.code || ticketRes.value.error?.message));
      } else {
        setError('Failed to load breakdown ticket details.');
      }

      if (eventsRes.status === 'fulfilled' && eventsRes.value.success && eventsRes.value.data) {
        setEvents(eventsRes.value.data);
      } else {
        setEvents([]);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading breakdown ticket.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && ticketId) {
      fetchTicketDetails(ticketId);
    } else {
      setTicket(null);
      setEvents([]);
      setError(null);
    }
  }, [isOpen, ticketId, fetchTicketDetails]);

  if (!isOpen) return null;

  const handleStartWork = async () => {
    if (!ticket) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await apiFetch<EquipmentBreakdownTicket>(`/api/v1/equipment/tickets/${ticket.id}/start`, {
        method: 'POST',
      });
      if (res.success) {
        await fetchTicketDetails(ticket.id);
        onTicketUpdated();
      } else {
        if (
          res.error?.code === 'INVALID_EQUIPMENT_TICKET_TRANSITION' ||
          res.error?.code === 'EQUIPMENT_TICKET_STATE_CHANGED'
        ) {
          setError(getEquipmentErrorMessage(res.error.code));
          await fetchTicketDetails(ticket.id);
          onTicketUpdated();
        } else {
          setError(getEquipmentErrorMessage(res.error?.code || res.error?.message));
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start repair work.');
      await fetchTicketDetails(ticket.id);
      onTicketUpdated();
    } finally {
      setActionLoading(false);
    }
  };

  const handleActionModalSubmit = async (payload: any) => {
    if (!ticket || !activeActionModal) return;
    let endpoint = '';
    switch (activeActionModal) {
      case 'assign':
      case 'reassign':
        endpoint = `/api/v1/equipment/tickets/${ticket.id}/assign`;
        break;
      case 'resolve':
        endpoint = `/api/v1/equipment/tickets/${ticket.id}/resolve`;
        break;
      case 'signoff':
        endpoint = `/api/v1/equipment/tickets/${ticket.id}/signoff`;
        break;
      case 'cancel':
        endpoint = `/api/v1/equipment/tickets/${ticket.id}/cancel`;
        break;
    }

    const res = await apiFetch<EquipmentBreakdownTicket>(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (res.success) {
      await fetchTicketDetails(ticket.id);
      onTicketUpdated();
    } else {
      if (
        res.error?.code === 'INVALID_EQUIPMENT_TICKET_TRANSITION' ||
        res.error?.code === 'EQUIPMENT_TICKET_STATE_CHANGED'
      ) {
        await fetchTicketDetails(ticket.id);
        onTicketUpdated();
        throw new Error('EQUIPMENT_TICKET_STATE_CHANGED');
      }
      throw new Error(res.error?.code || res.error?.message || 'Operation failed');
    }
  };

  const actions = ticket
    ? getAvailableTicketActions(ticket.status, { canManage, canSignoff })
    : {
        canAssign: false,
        canReassign: false,
        canStart: false,
        canResolve: false,
        canSignoff: false,
        canCancel: false,
      };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border-l border-slate-800 h-full shadow-2xl flex flex-col text-slate-200">
        {/* Panel Header */}
        <div className="p-5 border-b border-slate-800 flex items-start justify-between bg-slate-900/95 sticky top-0 z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-orange-400 font-mono">
                Breakdown Ticket
              </span>
              {ticket && (
                <span className="text-xs font-mono text-slate-400">
                  #{ticket.id.slice(0, 8)}
                </span>
              )}
            </div>
            <h2 className="text-lg font-extrabold text-white mt-0.5 tracking-tight">
              {ticket ? ticket.equipmentLabelSnapshot : 'Loading Ticket...'}
            </h2>
            {ticket && (
              <p className="text-xs text-slate-400 mt-0.5">
                {formatEquipmentType(ticket.equipmentTypeSnapshot)} • {formatFailureCategory(ticket.failureCategory)}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => ticketId && fetchTicketDetails(ticketId)}
              disabled={loading || actionLoading}
              title="Refresh Ticket Data"
              className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action Error Banner */}
        {error && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">{error}</div>
          </div>
        )}

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {loading && !ticket ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500 mb-3" />
              <p className="text-xs font-mono">Fetching ticket details & audit history...</p>
            </div>
          ) : ticket ? (
            <>
              {/* Primary Status & Priority Header Card */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 font-mono">
                    Current Status
                  </div>
                  <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold font-mono ${getStatusBadgeClass(ticket.status)}`}>
                    {formatTicketStatus(ticket.status)}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 font-mono">
                    Priority Level
                  </div>
                  <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold font-mono ${getPriorityBadgeClass(ticket.priority)}`}>
                    {formatPriority(ticket.priority)}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 font-mono">
                    Reported Breakdown
                  </div>
                  <div className="text-xs text-white font-mono flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {new Date(ticket.breakdownAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                </div>

                {ticket.downtimeSeconds !== null && ticket.downtimeSeconds !== undefined && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 font-mono">
                      Total Downtime
                    </div>
                    <div className="text-xs font-bold text-amber-400 font-mono">
                      {formatDowntime(ticket.downtimeSeconds)}
                    </div>
                  </div>
                )}
              </div>

              {/* Lifecycle Actions Bar */}
              {(actions.canAssign ||
                actions.canReassign ||
                actions.canStart ||
                actions.canResolve ||
                actions.canSignoff ||
                actions.canCancel) && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700/80 space-y-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-orange-400 font-mono flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Available Lifecycle Actions</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {actions.canAssign && (
                      <button
                        onClick={() => setActiveActionModal('assign')}
                        disabled={actionLoading}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all"
                      >
                        <UserCheck className="w-4 h-4" />
                        <span>Assign Technician</span>
                      </button>
                    )}

                    {actions.canReassign && (
                      <button
                        onClick={() => setActiveActionModal('reassign')}
                        disabled={actionLoading}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/30 flex items-center gap-2 transition-all"
                      >
                        <UserCog className="w-4 h-4" />
                        <span>Reassign Technician</span>
                      </button>
                    )}

                    {actions.canStart && (
                      <button
                        onClick={handleStartWork}
                        disabled={actionLoading}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-all disabled:opacity-50"
                      >
                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        <span>Start Work</span>
                      </button>
                    )}

                    {actions.canResolve && (
                      <button
                        onClick={() => setActiveActionModal('resolve')}
                        disabled={actionLoading}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Resolve Breakdown</span>
                      </button>
                    )}

                    {actions.canSignoff && (
                      <button
                        onClick={() => setActiveActionModal('signoff')}
                        disabled={actionLoading}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>Sign Off & Close</span>
                      </button>
                    )}

                    {actions.canCancel && (
                      <button
                        onClick={() => setActiveActionModal('cancel')}
                        disabled={actionLoading}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 flex items-center gap-2 transition-all ml-auto"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Cancel Ticket</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Description Section */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                  Fault Description
                </h4>
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {ticket.description}
                </div>
              </div>

              {/* Technician & Assignment Section */}
              <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-white font-mono flex items-center gap-2">
                  <User className="w-4 h-4 text-indigo-400" />
                  <span>Technician & Assignment Details</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400">Assigned Technician:</span>
                    <p className="font-semibold text-white mt-0.5 font-mono">
                      {ticket.technicianName || '— Not assigned —'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Technician Phone:</span>
                    <p className="font-semibold text-white mt-0.5 font-mono flex items-center gap-1.5">
                      {ticket.technicianPhone ? (
                        <>
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{ticket.technicianPhone}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Assigned At:</span>
                    <p className="font-mono text-slate-300 mt-0.5">
                      {ticket.assignedAt ? new Date(ticket.assignedAt).toLocaleString() : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Assigned By:</span>
                    <p className="font-mono text-slate-300 mt-0.5">
                      {ticket.assignedByUserId || '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Resolution & Signoff Details (if available) */}
              {(ticket.resolutionNotes || ticket.signoffNotes || ticket.cancelReason) && (
                <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800 space-y-4">
                  {ticket.resolutionNotes && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-400 font-mono flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Resolution Notes</span>
                        </span>
                        {ticket.resolvedAt && (
                          <span className="text-[11px] text-slate-400 font-mono">
                            {new Date(ticket.resolvedAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                        {ticket.resolutionNotes}
                      </div>
                    </div>
                  )}

                  {ticket.signoffNotes && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-300 font-mono flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Officer Sign-off Remarks</span>
                        </span>
                        {ticket.signedOffAt && (
                          <span className="text-[11px] text-slate-400 font-mono">
                            {new Date(ticket.signedOffAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                        {ticket.signoffNotes}
                      </div>
                    </div>
                  )}

                  {ticket.cancelReason && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-400 font-mono flex items-center gap-1.5">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Cancellation Reason</span>
                        </span>
                        {ticket.cancelledAt && (
                          <span className="text-[11px] text-slate-400 font-mono">
                            {new Date(ticket.cancelledAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-900/40 text-xs text-rose-200 whitespace-pre-wrap leading-relaxed">
                        {ticket.cancelReason}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Audit Event Timeline */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-2">
                    <Activity className="w-4 h-4 text-orange-400" />
                    <span>Audit Event Ledger ({events.length})</span>
                  </h4>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Immutable Audit Trail
                  </span>
                </div>
                <EquipmentEventTimeline events={events} loading={loading} />
              </div>
            </>
          ) : null}
        </div>

        {/* Action Modal instance */}
        {ticket && activeActionModal && (
          <EquipmentTicketActionModal
            isOpen={!!activeActionModal}
            onClose={() => setActiveActionModal(null)}
            ticket={ticket}
            actionType={activeActionModal}
            onSubmit={handleActionModalSubmit}
          />
        )}
      </div>
    </div>
  );
};
