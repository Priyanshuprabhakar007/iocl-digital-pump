import React, { useState } from 'react';
import { Search, Plus, Edit2, Building2, Calendar, FileText, Filter, CheckCircle2 } from 'lucide-react';
import {
  OutletServiceProviderAssignment,
  ServiceProvider,
  RetailOutlet,
  ServiceType,
} from '../../../shared/types';
import {
  getOrgStatusBadgeClass,
  getOrgStatusLabel,
  getServiceTypeBadgeClass,
  getServiceTypeLabel,
  formatOrgDate,
  formatAssignmentPeriod,
} from './orgUi';

interface OrgOutletAssignmentsPanelProps {
  assignments: OutletServiceProviderAssignment[];
  outlets: RetailOutlet[];
  selectedOutletId: string;
  onSelectOutlet: (outletId: string) => void;
  isLoading: boolean;
  canWrite: boolean;
  onAddClick: () => void;
  onEditClick: (assignment: OutletServiceProviderAssignment) => void;
}

export const OrgOutletAssignmentsPanel: React.FC<OrgOutletAssignmentsPanelProps> = ({
  assignments,
  outlets,
  selectedOutletId,
  onSelectOutlet,
  isLoading,
  canWrite,
  onAddClick,
  onEditClick,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filtered = assignments.filter((a) => {
    if (serviceTypeFilter !== 'ALL' && a.serviceType !== serviceTypeFilter) {
      return false;
    }
    if (statusFilter !== 'ALL' && a.status !== statusFilter) {
      return false;
    }
    if (!searchQuery.trim()) return true;

    const q = searchQuery.toLowerCase();
    const nameMatch = a.serviceProviderName?.toLowerCase().includes(q);
    const codeMatch = a.providerCode?.toLowerCase().includes(q);
    const contractMatch = a.contractNumber?.toLowerCase().includes(q);
    const notesMatch = a.notes?.toLowerCase().includes(q);
    return nameMatch || codeMatch || contractMatch || notesMatch;
  });

  const selectedOutlet = outlets.find((o) => o.id === selectedOutletId);

  return (
    <div className="space-y-4">
      {/* Primary Selector & Filter Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          {/* Outlet Picker */}
          <div className="flex items-center gap-2 min-w-[260px]">
            <Building2 className="w-4 h-4 text-orange-400 shrink-0" />
            <select
              value={selectedOutletId}
              onChange={(e) => onSelectOutlet(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500 transition font-medium"
            >
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.roCode})
                </option>
              ))}
            </select>
          </div>

          {/* Search Query */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search provider, contract..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition"
            />
          </div>

          {/* Service Domain Filter */}
          <select
            value={serviceTypeFilter}
            onChange={(e) => setServiceTypeFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-orange-500 transition"
          >
            <option value="ALL">All Services</option>
            <option value="MANPOWER">Manpower</option>
            <option value="HOUSEKEEPING">Housekeeping</option>
            <option value="SECURITY">Security</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="OTHER">Other</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-orange-500 transition"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active Contracts</option>
            <option value="INACTIVE">Historical / Expired</option>
          </select>
        </div>

        {canWrite && (
          <button
            onClick={onAddClick}
            disabled={!selectedOutletId}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition shadow-md shadow-orange-600/20 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Deploy Provider</span>
          </button>
        )}
      </div>

      {/* Outlet Details Banner */}
      {selectedOutlet && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 bg-slate-900/40 border border-slate-800/80 rounded-xl text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">{selectedOutlet.name}</span>
            <span className="font-mono text-orange-400">({selectedOutlet.roCode})</span>
            {selectedOutlet.city && <span>· {selectedOutlet.city}</span>}
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            Total Deployed Providers: {filtered.length}
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <div className="w-8 h-8 border-2 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-400">Loading outlet provider assignments...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-12 text-center">
          <Building2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h4 className="text-sm font-semibold text-slate-300 mb-1">
            {assignments.length === 0
              ? 'No service providers deployed to this outlet'
              : 'No matching assignments'}
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {assignments.length === 0
              ? 'Deploy active empanelled agencies for security, housekeeping, or manpower operations.'
              : 'Try adjusting your filters or search terms.'}
          </p>
          {assignments.length === 0 && canWrite && (
            <button
              onClick={onAddClick}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-medium transition"
            >
              <Plus className="w-4 h-4" />
              <span>Deploy First Provider</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold text-slate-400 tracking-wider uppercase">
                  <th className="py-3 px-4">Service Provider Agency</th>
                  <th className="py-3 px-4">Service Domain</th>
                  <th className="py-3 px-4">Contract Reference</th>
                  <th className="py-3 px-4">Tenure Period</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Notes</th>
                  {canWrite && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">
                        {a.serviceProviderName || 'Agency Provider'}
                      </div>
                      {a.providerCode && (
                        <div className="text-[11px] font-mono text-orange-400">
                          {a.providerCode}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${getServiceTypeBadgeClass(
                          a.serviceType
                        )}`}
                      >
                        {getServiceTypeLabel(a.serviceType)}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono text-slate-300 text-[11px] whitespace-nowrap">
                      {a.contractNumber || '—'}
                    </td>

                    <td className="py-3 px-4 font-mono text-slate-300 text-[11px] whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>{formatAssignmentPeriod(a.effectiveFrom, a.effectiveTo)}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${getOrgStatusBadgeClass(
                          a.status
                        )}`}
                      >
                        {getOrgStatusLabel(a.status)}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-slate-400 text-[11px] max-w-xs truncate">
                      {a.notes || '—'}
                    </td>

                    {canWrite && (
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => onEditClick(a)}
                          className="p-1.5 text-slate-400 hover:text-orange-400 hover:bg-slate-800 rounded-lg transition"
                          title="Update tenure and status"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
