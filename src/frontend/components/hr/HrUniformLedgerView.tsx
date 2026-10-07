import React from 'react';
import {
  FileText,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  AlertCircle,
  Hash,
} from 'lucide-react';
import type {
  HrUniformStockTransaction,
  HrUniformVariant,
  HrUniformItem,
} from '../../../shared/types';
import {
  formatUniformTransactionType,
  formatDisplayDateTime,
  validateUniformDateRange,
} from './hrUniformUi';

interface HrUniformLedgerViewProps {
  transactions: HrUniformStockTransaction[];
  variants: HrUniformVariant[];
  items: HrUniformItem[];
  isLoading: boolean;
  filters: {
    variantId: string;
    transactionType: string;
    fromDate: string;
    toDate: string;
  };
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
}

const TRANSACTION_TYPES = [
  'OPENING_BALANCE',
  'RECEIPT',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'ISSUE_OUT',
  'RETURN_IN',
];

export const HrUniformLedgerView: React.FC<HrUniformLedgerViewProps> = ({
  transactions,
  variants,
  items,
  isLoading,
  filters,
  onFilterChange,
  onClearFilters,
}) => {
  const dateValidation = validateUniformDateRange(filters.fromDate, filters.toDate);

  // Variant helper mapping
  const variantMap = new Map<string, HrUniformVariant>();
  variants.forEach(v => variantMap.set(v.id, v));

  const itemMap = new Map<string, HrUniformItem>();
  items.forEach(i => itemMap.set(i.id, i));

  return (
    <div className="space-y-6">
      {/* Filters Toolbar */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Variant Selector */}
          <div>
            <select
              value={filters.variantId}
              onChange={e => onFilterChange('variantId', e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
            >
              <option value="">All Sizes / Variants</option>
              {variants.map(v => {
                const item = itemMap.get(v.uniformItemId);
                return (
                  <option key={v.id} value={v.id}>
                    {item ? `${item.itemName} - ` : ''}Size {v.sizeLabel}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Transaction Type */}
          <div>
            <select
              value={filters.transactionType}
              onChange={e => onFilterChange('transactionType', e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
            >
              <option value="">All Transaction Types</option>
              {TRANSACTION_TYPES.map(type => (
                <option key={type} value={type}>
                  {formatUniformTransactionType(type).label}
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

        {(filters.variantId || filters.transactionType || filters.fromDate || filters.toDate) && (
          <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-xs">
            <span className="text-slate-400 text-[11px]">Ledger filters active</span>
            <button
              onClick={onClearFilters}
              className="text-orange-400 hover:text-orange-300 font-semibold text-[11px] transition"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Transactions Table Section */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Stock Movement Ledger</h3>
              <p className="text-[11px] text-slate-400">
                Audited stock receipts, issues, adjustments and restock logs
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
            {transactions.length} Records
          </span>
        </div>

        {isLoading ? (
          <div className="h-48 bg-slate-950/40 rounded-xl border border-slate-800/60 animate-pulse" />
        ) : transactions.length === 0 ? (
          <div className="py-10 text-center rounded-xl bg-slate-950/30 border border-slate-800/60">
            <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-300">No stock transactions found</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              No inventory movements have occurred matching your filter criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3.5">Date / Time</th>
                  <th className="py-2.5 px-3.5">Item</th>
                  <th className="py-2.5 px-3.5">Size</th>
                  <th className="py-2.5 px-3.5">Transaction Type</th>
                  <th className="py-2.5 px-3.5 text-right">Quantity</th>
                  <th className="py-2.5 px-3.5">Reference</th>
                  <th className="py-2.5 px-3.5">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {transactions.map(tx => {
                  const txType = formatUniformTransactionType(tx.transactionType);
                  const variant = variantMap.get(tx.variantId);
                  const item = variant ? itemMap.get(variant.uniformItemId) : null;
                  const itemName = tx.itemName || item?.itemName || '—';
                  const sizeLabel = tx.sizeLabel || variant?.sizeLabel || '—';

                  return (
                    <tr
                      key={tx.id}
                      className="hover:bg-slate-800/40 transition bg-slate-950/20"
                    >
                      <td className="py-2.5 px-3.5 text-slate-300 whitespace-nowrap">
                        {formatDisplayDateTime(tx.occurredAt)}
                      </td>
                      <td className="py-2.5 px-3.5 font-sans font-medium text-white">
                        {itemName}
                      </td>
                      <td className="py-2.5 px-3.5 font-bold text-amber-300">
                        {sizeLabel}
                      </td>
                      <td className="py-2.5 px-3.5 font-sans">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${txType.badgeClass}`}
                        >
                          {txType.isInflow ? (
                            <ArrowDownLeft className="w-3 h-3 shrink-0" />
                          ) : (
                            <ArrowUpRight className="w-3 h-3 shrink-0" />
                          )}
                          {txType.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-black">
                        <span
                          className={
                            txType.isInflow ? 'text-emerald-400' : 'text-amber-400'
                          }
                        >
                          {txType.isInflow ? `+${tx.quantity}` : `-${tx.quantity}`}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-400 font-sans text-[11px]">
                        {tx.referenceType ? (
                          <span className="font-mono text-slate-300 text-[10px]">
                            {tx.referenceType}
                            {tx.referenceId && ` #${tx.referenceId.slice(-6)}`}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 font-sans text-slate-400 max-w-xs truncate">
                        {tx.notes || '—'}
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
