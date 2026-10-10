import React from 'react';
import { Plus, Edit2, ShieldAlert, CheckCircle, Calendar, MapPin, Award } from 'lucide-react';
import { OfficerPosting, State, Division, SalesArea, RetailOutlet } from '../../../shared/types';
import {
  getScopeBadgeClass,
  getScopeLevelLabel,
  getOrgStatusBadgeClass,
  getOrgStatusLabel,
  formatOrgDate,
  formatAssignmentPeriod,
  buildPostingLocationLabel,
  HierarchyContext,
} from './orgUi';

interface OrgOfficerPostingsPanelProps {
  postings: OfficerPosting[];
  isLoading: boolean;
  canWrite: boolean;
  hierarchy: HierarchyContext;
  onAddPosting: () => void;
  onEditPosting: (posting: OfficerPosting) => void;
}

export const OrgOfficerPostingsPanel: React.FC<OrgOfficerPostingsPanelProps> = ({
  postings,
  isLoading,
  canWrite,
  hierarchy,
  onAddPosting,
  onEditPosting,
}) => {
  return (
    <div className="space-y-4">
      {/* Header / Action bar */}
      <div className="flex items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
        <div>
          <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
            Operational Postings & Jurisdictions
          </h4>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Hierarchy scopes, operational appointments and jurisdiction assignments
          </p>
        </div>

        {canWrite && (
          <button
            onClick={onAddPosting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-medium transition shadow-md shadow-orange-600/20 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Posting</span>
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <div className="w-8 h-8 border-2 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-400">Loading officer postings...</p>
        </div>
      ) : postings.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-8 text-center">
          <MapPin className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <h5 className="text-xs font-semibold text-slate-300 mb-1">No postings assigned</h5>
          <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
            This officer currently has no active or historical jurisdictional postings.
          </p>
          {canWrite && (
            <button
              onClick={onAddPosting}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-medium transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Assign First Posting</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold text-slate-400 tracking-wider uppercase">
                  <th className="py-3 px-4">Scope Level</th>
                  <th className="py-3 px-4">Jurisdiction / Location</th>
                  <th className="py-3 px-4">Tenure Period</th>
                  <th className="py-3 px-4">Primary</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Notes</th>
                  {canWrite && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {postings.map((p) => {
                  const locationLabel = buildPostingLocationLabel(p, hierarchy);
                  const period = formatAssignmentPeriod(p.effectiveFrom, p.effectiveTo);

                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${getScopeBadgeClass(
                            p.scopeLevel
                          )}`}
                        >
                          {getScopeLevelLabel(p.scopeLevel)}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-white font-medium max-w-xs truncate">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span title={locationLabel}>{locationLabel}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-300 font-mono text-[11px] whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>{period}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {p.isPrimary ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400">
                            <Award className="w-3.5 h-3.5" />
                            <span>Primary</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">Secondary</span>
                        )}
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

                      <td className="py-3 px-4 text-slate-400 text-[11px] max-w-xs truncate">
                        {p.notes || '—'}
                      </td>

                      {canWrite && (
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => onEditPosting(p)}
                            className="p-1.5 text-slate-400 hover:text-orange-400 hover:bg-slate-800 rounded-lg transition"
                            title="Edit posting tenure and notes"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
