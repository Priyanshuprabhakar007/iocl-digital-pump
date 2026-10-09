import React from 'react';
import {
  Shirt,
  User,
  Filter,
  Calendar,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Clock,
  Plus,
} from 'lucide-react';
import type {
  HrUniformIssue,
  HrStaff,
  HrUniformItem,
  HrUniformVariant,
} from '../../../shared/types';
import {
  formatUniformIssueStatus,
  formatUniformCondition,
  formatUniformReplacementReason,
  formatDisplayDate,
  formatDisplayDateTime,
  validateUniformDateRange,
} from './hrUniformUi';

interface HrUniformIssuesViewProps {
  issues: HrUniformIssue[];
  staffList: HrStaff[];
  items: HrUniformItem[];
  variants: HrUniformVariant[];
  isLoading: boolean;
  filters: {
    staffId: string;
    itemId: string;
    variantId: string;
    status: string;
    fromDate: string;
    toDate: string;
  };
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
  canWriteIssue?: boolean;
  onIssueUniform?: () => void;
  onReturnUniform?: (issue: HrUniformIssue) => void;
  onReplaceUniform?: (issue: HrUniformIssue) => void;
}

const ISSUE_STATUSES = ['ISSUED', 'RETURNED', 'REPLACED'];

export const HrUniformIssuesView: React.FC<HrUniformIssuesViewProps> = ({
  issues,
  staffList,
  items,
  variants,
  isLoading,
  filters,
  onFilterChange,
  onClearFilters,
  canWriteIssue = false,
  onIssueUniform,
  onReturnUniform,
  onReplaceUniform,
}) => {
  const dateValidation = validateUniformDateRange(filters.fromDate, filters.toDate);

  const staffMap = new Map<string, HrStaff>();
  staffList.forEach(s => staffMap.set(s.id, s));

  const filteredVariants = filters.itemId
    ? variants.filter(v => v.uniformItemId === filters.itemId)
    : variants;

  return (
    <div className="space-y-6">
      {/* Filters Toolbar */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {/* Staff Filter */}
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

          {/* Item Filter */}
          <div>
            <select
              value={filters.itemId}
              onChange={e => {
                onFilterChange('itemId', e.target.value);
                // Reset variantId if it doesn't belong to selected item
                if (e.target.value && filters.variantId) {
                  const matches = variants.some(
                    v => v.id === filters.variantId && v.uniformItemId === e.target.value
                  );
                  if (!matches) onFilterChange('variantId', '');
                }
              }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
            >
              <option value="">All Items</option>
              {items.map(item => (
                <option key={item.id} value={item.id}>
                  {item.itemName} ({item.itemCode})
                </option>
              ))}
            </select>
          </div>

          {/* Variant Filter */}
          <div>
            <select
              value={filters.variantId}
              onChange={e => onFilterChange('variantId', e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
            >
              <option value="">All Sizes</option>
              {filteredVariants.map(v => (
                <option key={v.id} value={v.id}>
                  Size {v.sizeLabel}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={filters.status}
              onChange={e => onFilterChange('status', e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
            >
              <option value="">All Statuses</option>
              {ISSUE_STATUSES.map(s => (
                <option key={s} value={s}>
                  {formatUniformIssueStatus(s).label}
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

        {(filters.staffId ||
          filters.itemId ||
          filters.variantId ||
          filters.status ||
          filters.fromDate ||
          filters.toDate) && (
          <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-xs">
            <span className="text-slate-400 text-[11px]">Issue filters active</span>
            <button
              onClick={onClearFilters}
              className="text-orange-400 hover:text-orange-300 font-semibold text-[11px] transition"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Issues Table Section */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Shirt className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Staff Uniform Issues</h3>
              <p className="text-[11px] text-slate-400">
                Active issues, return processing and replacement records
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
              {issues.length} Records
            </span>
            {canWriteIssue && onIssueUniform && (
              <button
                onClick={onIssueUniform}
                className="px-3.5 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-orange-500/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Issue Uniform</span>
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="h-48 bg-slate-950/40 rounded-xl border border-slate-800/60 animate-pulse" />
        ) : issues.length === 0 ? (
          <div className="py-10 text-center rounded-xl bg-slate-950/30 border border-slate-800/60">
            <Shirt className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-300">No staff uniform issues found</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              No issuance records match your active filter criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3.5">Staff Member</th>
                  <th className="py-2.5 px-3.5">Item & Size</th>
                  <th className="py-2.5 px-3.5 text-center">Qty</th>
                  <th className="py-2.5 px-3.5">Issued Date</th>
                  <th className="py-2.5 px-3.5 text-center">Condition</th>
                  <th className="py-2.5 px-3.5 text-center">Status</th>
                  <th className="py-2.5 px-3.5">Closed / Notes</th>
                  {canWriteIssue && (
                    <th className="py-2.5 px-3.5 text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-[11px]">
                {issues.map(issue => {
                  const statusStyle = formatUniformIssueStatus(issue.status);
                  const issueConditionStyle = formatUniformCondition(issue.conditionAtIssue);
                  const staff = staffMap.get(issue.staffId);
                  const staffName = issue.staffName || staff?.fullName || 'Staff Member';
                  const empCode = issue.employeeCode || staff?.employeeCode || '—';

                  return (
                    <tr
                      key={issue.id}
                      className="hover:bg-slate-800/40 transition bg-slate-950/20"
                    >
                      {/* Staff Member */}
                      <td className="py-2.5 px-3.5">
                        <div className="font-medium text-white">{staffName}</div>
                        <div className="font-mono text-[10px] text-slate-400">{empCode}</div>
                      </td>

                      {/* Item & Size */}
                      <td className="py-2.5 px-3.5">
                        <div className="text-slate-200 font-medium">
                          {issue.itemName || 'Uniform Item'}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono font-bold text-amber-300 text-[10px]">
                            Size {issue.sizeLabel || '—'}
                          </span>
                          {issue.replacesIssueId && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              <RefreshCw className="w-2.5 h-2.5" />
                              Replacement
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Quantity */}
                      <td className="py-2.5 px-3.5 text-center font-mono font-black text-white">
                        {issue.quantity}
                      </td>

                      {/* Issued Date */}
                      <td className="py-2.5 px-3.5 font-mono text-slate-300 whitespace-nowrap">
                        {formatDisplayDate(issue.issuedAt)}
                      </td>

                      {/* Issue Condition */}
                      <td className="py-2.5 px-3.5 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${issueConditionStyle.bgClass} ${issueConditionStyle.textClass} ${issueConditionStyle.borderClass}`}
                        >
                          {issueConditionStyle.label}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${statusStyle.bgClass} ${statusStyle.textClass} ${statusStyle.borderClass}`}
                        >
                          {issue.status === 'ISSUED' && <Clock className="w-3 h-3" />}
                          {issue.status === 'RETURNED' && <CheckCircle2 className="w-3 h-3" />}
                          {issue.status === 'REPLACED' && <RefreshCw className="w-3 h-3" />}
                          {statusStyle.label}
                        </span>
                      </td>

                      {/* Closed Info & Notes */}
                      <td className="py-2.5 px-3.5 text-slate-400">
                        {issue.closedAt ? (
                          <div className="space-y-0.5 text-[10px]">
                            <div className="font-mono text-slate-300">
                              Closed: {formatDisplayDate(issue.closedAt)}
                            </div>
                            {issue.conditionOnClose && (
                              <div>
                                Return state:{' '}
                                <span className="font-semibold text-slate-300">
                                  {formatUniformCondition(issue.conditionOnClose).label}
                                </span>
                              </div>
                            )}
                            {issue.replacementReason && (
                              <div className="text-purple-300">
                                Reason:{' '}
                                {formatUniformReplacementReason(issue.replacementReason).label}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic text-[10px]">Active issue</span>
                        )}
                        {issue.notes && (
                          <div className="text-[10px] text-slate-400 mt-1 truncate max-w-xs">
                            {issue.notes}
                          </div>
                        )}
                      </td>

                      {/* Actions (Gated by canWriteIssue) */}
                      {canWriteIssue && (
                        <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                          {issue.status === 'ISSUED' ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => onReturnUniform?.(issue)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold transition flex items-center gap-1"
                                title="Process return"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Return</span>
                              </button>
                              <button
                                onClick={() => onReplaceUniform?.(issue)}
                                className="px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 text-[10px] font-semibold transition flex items-center gap-1"
                                title="Process replacement"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Replace</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-600">—</span>
                          )}
                        </td>
                      )}
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
