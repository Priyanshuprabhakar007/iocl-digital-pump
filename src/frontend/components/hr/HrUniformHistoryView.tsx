import React from 'react';
import {
  History,
  User,
  Filter,
  Calendar,
  AlertCircle,
  Shirt,
  RefreshCw,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import type { HrUniformIssue, HrStaff } from '../../../shared/types';
import {
  formatUniformIssueStatus,
  formatUniformCondition,
  formatUniformReplacementReason,
  formatDisplayDate,
  validateUniformDateRange,
} from './hrUniformUi';

interface HrUniformHistoryViewProps {
  history: HrUniformIssue[];
  staffList: HrStaff[];
  isLoading: boolean;
  filters: {
    staffId: string;
    fromDate: string;
    toDate: string;
  };
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
}

export const HrUniformHistoryView: React.FC<HrUniformHistoryViewProps> = ({
  history,
  staffList,
  isLoading,
  filters,
  onFilterChange,
  onClearFilters,
}) => {
  const dateValidation = validateUniformDateRange(filters.fromDate, filters.toDate);

  const staffMap = new Map<string, HrStaff>();
  staffList.forEach(s => staffMap.set(s.id, s));

  // Sort chronological descending by issuedAt
  const sortedHistory = [...history].sort(
    (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime()
  );

  return (
    <div className="space-y-6">
      {/* Filters Toolbar */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Staff Member */}
          <div>
            <select
              value={filters.staffId}
              onChange={e => onFilterChange('staffId', e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
            >
              <option value="">All Staff Members</option>
              {staffList.map(s => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.employeeCode})
                </option>
              ))}
            </select>
          </div>

          {/* From Date */}
          <div>
            <input
              type="date"
              value={filters.fromDate}
              onChange={e => onFilterChange('fromDate', e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
            />
          </div>

          {/* To Date */}
          <div>
            <input
              type="date"
              value={filters.toDate}
              onChange={e => onFilterChange('toDate', e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
            />
          </div>
        </div>

        {dateValidation.error && (
          <div className="flex items-center gap-2 text-rose-400 text-xs py-1">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{dateValidation.error}</span>
          </div>
        )}

        {(filters.staffId || filters.fromDate || filters.toDate) && (
          <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-xs">
            <span className="text-slate-400 text-[11px]">History filters active</span>
            <button
              onClick={onClearFilters}
              className="text-orange-400 hover:text-orange-300 font-semibold text-[11px] transition"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* History Table Section */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Staff Issuance Chronology</h3>
              <p className="text-[11px] text-slate-400">
                Complete uniform allocation, usage and return track record
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
            {sortedHistory.length} Logged Events
          </span>
        </div>

        {isLoading ? (
          <div className="h-48 bg-slate-950/40 rounded-xl border border-slate-800/60 animate-pulse" />
        ) : sortedHistory.length === 0 ? (
          <div className="py-10 text-center rounded-xl bg-slate-950/30 border border-slate-800/60">
            <History className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-300">No uniform history recorded</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              No staff uniform issue history found for the selected criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3.5">Staff Member</th>
                  <th className="py-2.5 px-3.5">Uniform Item</th>
                  <th className="py-2.5 px-3.5">Size</th>
                  <th className="py-2.5 px-3.5 text-center">Qty</th>
                  <th className="py-2.5 px-3.5">Issued Date</th>
                  <th className="py-2.5 px-3.5 text-center">Status</th>
                  <th className="py-2.5 px-3.5 text-center">Issue State</th>
                  <th className="py-2.5 px-3.5 text-center">Close State</th>
                  <th className="py-2.5 px-3.5">Replacement Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-[11px]">
                {sortedHistory.map(record => {
                  const statusStyle = formatUniformIssueStatus(record.status);
                  const issueConditionStyle = formatUniformCondition(record.conditionAtIssue);
                  const closeConditionStyle = record.conditionOnClose
                    ? formatUniformCondition(record.conditionOnClose)
                    : null;
                  const staff = staffMap.get(record.staffId);
                  const staffName = record.staffName || staff?.fullName || 'Staff Member';
                  const empCode = record.employeeCode || staff?.employeeCode || '—';

                  return (
                    <tr
                      key={record.id}
                      className="hover:bg-slate-800/40 transition bg-slate-950/20"
                    >
                      <td className="py-2.5 px-3.5">
                        <div className="font-medium text-white">{staffName}</div>
                        <div className="font-mono text-[10px] text-slate-400">{empCode}</div>
                      </td>
                      <td className="py-2.5 px-3.5 font-medium text-slate-200">
                        {record.itemName || 'Uniform Item'}
                      </td>
                      <td className="py-2.5 px-3.5 font-mono font-bold text-amber-300">
                        {record.sizeLabel || '—'}
                      </td>
                      <td className="py-2.5 px-3.5 text-center font-mono font-black text-white">
                        {record.quantity}
                      </td>
                      <td className="py-2.5 px-3.5 font-mono text-slate-300 whitespace-nowrap">
                        {formatDisplayDate(record.issuedAt)}
                      </td>
                      <td className="py-2.5 px-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${statusStyle.bgClass} ${statusStyle.textClass} ${statusStyle.borderClass}`}
                        >
                          {record.status === 'ISSUED' && <Clock className="w-3 h-3" />}
                          {record.status === 'RETURNED' && <CheckCircle2 className="w-3 h-3" />}
                          {record.status === 'REPLACED' && <RefreshCw className="w-3 h-3" />}
                          {statusStyle.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${issueConditionStyle.bgClass} ${issueConditionStyle.textClass} ${issueConditionStyle.borderClass}`}
                        >
                          {issueConditionStyle.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-center">
                        {closeConditionStyle ? (
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${closeConditionStyle.bgClass} ${closeConditionStyle.textClass} ${closeConditionStyle.borderClass}`}
                          >
                            {closeConditionStyle.label}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic text-[10px]">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 font-sans text-slate-300">
                        {record.replacementReason ? (
                          <span className="font-semibold text-purple-300 text-[10px]">
                            {formatUniformReplacementReason(record.replacementReason).label}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
