import React, { useState } from 'react';
import {
  EquipmentBreakdownTicket,
  EquipmentTarget,
  EquipmentTicketPriority,
  EquipmentTicketStatus,
  EquipmentType,
} from '../../../shared/types';
import {
  Plus,
  Filter,
  X,
  Clock,
  Wrench,
  User,
  Phone,
  AlertTriangle,
  Layers,
  Calendar,
  ChevronRight,
  Activity,
  CheckCircle2,
  Search,
} from 'lucide-react';
import {
  formatDowntime,
  formatEquipmentType,
  formatFailureCategory,
  formatPriority,
  formatTicketStatus,
  getPriorityBadgeClass,
  getStatusBadgeClass,
} from './equipmentUi';
import { EquipmentTicketCreateModal } from './EquipmentTicketCreateModal';
import { EquipmentTicketDetailPanel } from './EquipmentTicketDetailPanel';

interface EquipmentTicketsPanelProps {
  tickets: EquipmentBreakdownTicket[];
  loading: boolean;
  outletId: string;
  targets: EquipmentTarget[];
  canCreateTicket: boolean;
  canManage: boolean;
  canSignoff: boolean;
  // Filters state & triggers
  filterStatus: string;
  filterPriority: string;
  filterEquipmentType: string;
  onFilterStatusChange: (status: string) => void;
  onFilterPriorityChange: (priority: string) => void;
  onFilterEquipmentTypeChange: (type: string) => void;
  onClearFilters: () => void;
  onRefreshData: () => void;
}

export const EquipmentTicketsPanel: React.FC<EquipmentTicketsPanelProps> = ({
  tickets,
  loading,
  outletId,
  targets,
  canCreateTicket,
  canManage,
  canSignoff,
  filterStatus,
  filterPriority,
  filterEquipmentType,
  onFilterStatusChange,
  onFilterPriorityChange,
  onFilterEquipmentTypeChange,
  onClearFilters,
  onRefreshData,
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const hasActiveFilters = filterStatus !== '' || filterPriority !== '' || filterEquipmentType !== '';

  const statusOptions: EquipmentTicketStatus[] = [
    'OPEN',
    'ASSIGNED',
    'IN_PROGRESS',
    'RESOLVED',
    'CLOSED',
    'CANCELLED',
  ];

  const priorityOptions: EquipmentTicketPriority[] = [
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL',
  ];

  const equipmentTypeOptions: EquipmentType[] = [
    'DISPENSER',
    'ATG',
    'AIR_COMPRESSOR',
    'CNG_COMPRESSOR',
    'DG_SET',
    'OTHER',
  ];

  return (
    <div className="space-y-4">
      {/* Action & Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md flex flex-wrap items-center justify-between gap-3">
        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 font-mono mr-1">
            <Filter className="w-3.5 h-3.5 text-orange-400" />
            <span>Filters:</span>
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={e => onFilterStatusChange(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-orange-500 font-mono transition-colors"
          >
            <option value="">All Statuses</option>
            {statusOptions.map(st => (
              <option key={st} value={st}>
                {formatTicketStatus(st)}
              </option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={filterPriority}
            onChange={e => onFilterPriorityChange(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-orange-500 font-mono transition-colors"
          >
            <option value="">All Priorities</option>
            {priorityOptions.map(pr => (
              <option key={pr} value={pr}>
                {formatPriority(pr)}
              </option>
            ))}
          </select>

          {/* Equipment Type Filter */}
          <select
            value={filterEquipmentType}
            onChange={e => onFilterEquipmentTypeChange(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-orange-500 font-mono transition-colors"
          >
            <option value="">All Equipment Types</option>
            {equipmentTypeOptions.map(tp => (
              <option key={tp} value={tp}>
                {formatEquipmentType(tp)}
              </option>
            ))}
          </select>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={onClearFilters}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-semibold flex items-center gap-1 border border-slate-700 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Create Ticket Button (permission-checked) */}
        {canCreateTicket && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 shadow-lg shadow-orange-500/20 flex items-center gap-2 transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Report Breakdown</span>
          </button>
        )}
      </div>

      {/* Tickets List Area */}
      {loading ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800/80">
          <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-400 font-mono">Loading breakdown tickets...</p>
        </div>
      ) : tickets.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800/80">
          <Wrench className="w-10 h-10 mx-auto mb-3 text-slate-600 opacity-60" />
          <h4 className="text-sm font-bold text-white mb-1">
            {hasActiveFilters ? 'No Matching Breakdown Tickets' : 'No Breakdown Tickets Found'}
          </h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {hasActiveFilters
              ? 'Try clearing active status, priority, or equipment type filters.'
              : 'All dispensers and equipment at this outlet are running without active breakdown reports.'}
          </p>
          {canCreateTicket && !hasActiveFilters && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4 text-orange-400" />
              <span>Report First Breakdown</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Responsive Table View */}
          <div className="hidden md:block rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 font-mono uppercase tracking-wider text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">Equipment / Target</th>
                    <th className="py-3.5 px-4 font-semibold">Priority</th>
                    <th className="py-3.5 px-4 font-semibold">Category</th>
                    <th className="py-3.5 px-4 font-semibold">Status</th>
                    <th className="py-3.5 px-4 font-semibold">Breakdown Time</th>
                    <th className="py-3.5 px-4 font-semibold">Technician</th>
                    <th className="py-3.5 px-4 font-semibold">Downtime</th>
                    <th className="py-3.5 px-4 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {tickets.map(t => (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedTicketId(t.id)}
                      className="hover:bg-slate-800/50 cursor-pointer transition-colors group"
                    >
                      {/* Equipment Snapshot Label */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-white group-hover:text-orange-400 transition-colors">
                          {t.equipmentLabelSnapshot}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {formatEquipmentType(t.equipmentTypeSnapshot)}
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-[11px] font-bold font-mono ${getPriorityBadgeClass(t.priority)}`}>
                          {t.priority}
                        </span>
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4 text-slate-300">
                        {formatFailureCategory(t.failureCategory)}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold font-mono ${getStatusBadgeClass(t.status)}`}>
                          {formatTicketStatus(t.status)}
                        </span>
                      </td>

                      {/* Breakdown Time */}
                      <td className="py-3 px-4 font-mono text-slate-300">
                        {new Date(t.breakdownAt).toLocaleString(undefined, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>

                      {/* Technician */}
                      <td className="py-3 px-4">
                        {t.technicianName ? (
                          <div className="font-medium text-slate-200">{t.technicianName}</div>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>

                      {/* Downtime */}
                      <td className="py-3 px-4 font-mono font-bold text-amber-400">
                        {formatDowntime(t.downtimeSeconds)}
                      </td>

                      {/* Action Arrow */}
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex p-1.5 rounded-lg text-slate-400 group-hover:text-white group-hover:bg-slate-700 transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Stacked Card View */}
          <div className="md:hidden space-y-3">
            {tickets.map(t => (
              <div
                key={t.id}
                onClick={() => setSelectedTicketId(t.id)}
                className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md active:bg-slate-800 cursor-pointer transition-colors space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-white text-sm">
                      {t.equipmentLabelSnapshot}
                    </h4>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      {formatEquipmentType(t.equipmentTypeSnapshot)}
                    </p>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-[11px] font-bold font-mono ${getStatusBadgeClass(t.status)}`}>
                    {formatTicketStatus(t.status)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-md font-bold font-mono text-[10px] ${getPriorityBadgeClass(t.priority)}`}>
                    {t.priority}
                  </span>
                  <span className="text-slate-400 text-xs">
                    {formatFailureCategory(t.failureCategory)}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-1.5 font-mono">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {new Date(t.breakdownAt).toLocaleString(undefined, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                  {t.downtimeSeconds !== null && (
                    <span className="font-mono font-bold text-amber-400">
                      DT: {formatDowntime(t.downtimeSeconds)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Ticket Create Modal */}
      {isCreateModalOpen && (
        <EquipmentTicketCreateModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          outletId={outletId}
          targets={targets}
          onTicketCreated={onRefreshData}
        />
      )}

      {/* Ticket Detail Drawer */}
      {selectedTicketId && (
        <EquipmentTicketDetailPanel
          isOpen={!!selectedTicketId}
          onClose={() => setSelectedTicketId(null)}
          ticketId={selectedTicketId}
          canManage={canManage}
          canSignoff={canSignoff}
          onTicketUpdated={onRefreshData}
        />
      )}
    </div>
  );
};
