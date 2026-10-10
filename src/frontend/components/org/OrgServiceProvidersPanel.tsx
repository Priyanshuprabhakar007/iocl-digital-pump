import React, { useState } from 'react';
import { Search, Plus, Edit2, Eye, Building2, Phone, Mail, FileText, CheckCircle2 } from 'lucide-react';
import { ServiceProvider } from '../../../shared/types';
import {
  filterServiceProviders,
  getOrgStatusBadgeClass,
  getOrgStatusLabel,
} from './orgUi';

interface OrgServiceProvidersPanelProps {
  providers: ServiceProvider[];
  isLoading: boolean;
  canWriteGlobal: boolean;
  onAddClick: () => void;
  onEditClick: (provider: ServiceProvider) => void;
  onViewDetails: (provider: ServiceProvider) => void;
}

export const OrgServiceProvidersPanel: React.FC<OrgServiceProvidersPanelProps> = ({
  providers,
  isLoading,
  canWriteGlobal,
  onAddClick,
  onEditClick,
  onViewDetails,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filtered = filterServiceProviders(providers, searchQuery, statusFilter);

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
        <div className="flex flex-1 items-center gap-2.5">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search code, provider name, contact, GSTIN, PAN..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-orange-500 transition"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active (Deployable)</option>
            <option value="INACTIVE">Inactive (Restricted)</option>
          </select>
        </div>

        {canWriteGlobal && (
          <button
            onClick={onAddClick}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-medium transition shadow-md shadow-orange-600/20 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Service Provider</span>
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <div className="w-8 h-8 border-2 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-400">Loading service providers directory...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-12 text-center">
          <Building2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h4 className="text-sm font-semibold text-slate-300 mb-1">
            {providers.length === 0 ? 'No service providers registered' : 'No matching service providers'}
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {providers.length === 0
              ? 'External manpower, security, housekeeping, and maintenance agencies have not been configured.'
              : 'Try adjusting your search criteria or status filter.'}
          </p>
          {providers.length === 0 && canWriteGlobal && (
            <button
              onClick={onAddClick}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-medium transition"
            >
              <Plus className="w-4 h-4" />
              <span>Enlist First Service Provider</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold text-slate-400 tracking-wider uppercase">
                  <th className="py-3 px-4">Provider Code</th>
                  <th className="py-3 px-4">Agency / Vendor Name</th>
                  <th className="py-3 px-4">Contact Person</th>
                  <th className="py-3 px-4">Phone / Email</th>
                  <th className="py-3 px-4">Tax IDs (GSTIN/PAN)</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-mono font-medium text-orange-400 whitespace-nowrap">
                      {p.providerCode}
                    </td>

                    <td className="py-3 px-4 font-semibold text-white max-w-xs truncate">
                      <div className="flex items-center gap-2">
                        <span title={p.providerName}>{p.providerName}</span>
                      </div>
                      {p.proprietorOrAuthorizedPerson && (
                        <div className="text-[11px] font-normal text-slate-500 truncate">
                          Prop: {p.proprietorOrAuthorizedPerson}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-slate-300">
                      {p.contactPerson || '—'}
                    </td>

                    <td className="py-3 px-4 text-slate-300 font-mono text-[11px] whitespace-nowrap">
                      <div>{p.phone || '—'}</div>
                      {p.email && (
                        <div className="text-[10px] text-slate-500 font-sans truncate max-w-[140px]">
                          {p.email}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-slate-300 font-mono text-[11px] whitespace-nowrap">
                      <div>{p.gstin || '—'}</div>
                      {p.pan && (
                        <div className="text-[10px] text-slate-500">PAN: {p.pan}</div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                      {p.city ? `${p.city}${p.stateText ? `, ${p.stateText}` : ''}` : '—'}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${getOrgStatusBadgeClass(
                          p.status
                        )}`}
                      >
                        {getOrgStatusLabel(p.status)}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onViewDetails(p)}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                          title="View agency profile and assignments"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {canWriteGlobal && (
                          <button
                            onClick={() => onEditClick(p)}
                            className="p-1.5 text-slate-400 hover:text-orange-400 hover:bg-slate-800 rounded-lg transition"
                            title="Edit service provider"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
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
