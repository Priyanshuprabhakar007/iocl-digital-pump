import React from 'react';
import {
  UtilitySubMeterChargeSummary,
  UtilitySubMeter,
} from '../../../shared/types';
import { formatBeneficiaryType } from './utilityUi';
import {
  Zap,
  Filter,
  RotateCcw,
  Gauge,
  CreditCard,
  Layers,
  Clock,
  Building2,
} from 'lucide-react';

interface UtilityChargeSummaryProps {
  outletId: string;
  subMeters: UtilitySubMeter[];
  summary: UtilitySubMeterChargeSummary | null;
  loading?: boolean;
  filterFromDate: string;
  filterToDate: string;
  filterSubMeterId: string;
  onFilterChange: (filters: { fromDate: string; toDate: string; subMeterId: string }) => void;
}

export const UtilityChargeSummary: React.FC<UtilityChargeSummaryProps> = ({
  outletId,
  subMeters,
  summary,
  loading = false,
  filterFromDate,
  filterToDate,
  filterSubMeterId,
  onFilterChange,
}) => {
  const hasActiveFilters = filterFromDate !== '' || filterToDate !== '' || filterSubMeterId !== '';

  const handleClear = () => {
    onFilterChange({ fromDate: '', toDate: '', subMeterId: '' });
  };

  return (
    <div className="space-y-4">
      {/* Header & Filter Toolbar */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white tracking-tight">
                Sub-Meter Electricity Consumption & Charges
              </h4>
              <p className="text-[11px] text-slate-400">
                Aggregated electricity charge calculations based on tariff snapshots
              </p>
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/80 text-xs">
          <div className="flex items-center gap-1.5 text-slate-400 font-semibold uppercase tracking-wider text-[11px] mr-1">
            <Filter className="w-3.5 h-3.5 text-orange-400" />
            Filter Period:
          </div>

          {/* Sub-Meter Filter */}
          <select
            value={filterSubMeterId}
            onChange={e =>
              onFilterChange({
                fromDate: filterFromDate,
                toDate: filterToDate,
                subMeterId: e.target.value,
              })
            }
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-orange-500/60 text-xs"
          >
            <option value="">All Sub-Meters</option>
            {subMeters.map(sm => (
              <option key={sm.id} value={sm.id}>
                {sm.meterCode} — {sm.name} ({formatBeneficiaryType(sm.beneficiaryType)})
              </option>
            ))}
          </select>

          {/* From Date */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 text-[11px]">From:</span>
            <input
              type="date"
              value={filterFromDate}
              onChange={e =>
                onFilterChange({
                  fromDate: e.target.value,
                  toDate: filterToDate,
                  subMeterId: filterSubMeterId,
                })
              }
              className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-orange-500/60 text-xs"
            />
          </div>

          {/* To Date */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 text-[11px]">To:</span>
            <input
              type="date"
              value={filterToDate}
              onChange={e =>
                onFilterChange({
                  fromDate: filterFromDate,
                  toDate: e.target.value,
                  subMeterId: filterSubMeterId,
                })
              }
              className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-orange-500/60 text-xs"
            />
          </div>

          {/* Clear */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClear}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl flex items-center gap-1 transition-colors text-[11px] font-medium"
            >
              <RotateCcw className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-slate-900 border border-slate-800 rounded-2xl" />
          ))}
        </div>
      ) : summary ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Consumption */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
                Total Consumption
              </span>
              <div className="mt-2 text-2xl font-black text-amber-400 font-mono tracking-tight">
                {summary.totalConsumptionStr} <span className="text-sm font-normal text-slate-400">kWh</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Sum of non-baseline reading deltas
              </div>
            </div>

            {/* Total Charge */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
                Total Electricity Charges
              </span>
              <div className="mt-2 text-2xl font-black text-emerald-400 font-mono tracking-tight">
                ₹{summary.totalChargeStr}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Calculated with snapshotted tariffs
              </div>
            </div>

            {/* Total Readings */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
                Readings Count
              </span>
              <div className="mt-2 text-2xl font-black text-white tracking-tight">
                {summary.readingCount}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Recorded reading entries in range
              </div>
            </div>

            {/* Meters Represented */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
                Sub-Meters Filtered
              </span>
              <div className="mt-2 text-2xl font-black text-white tracking-tight">
                {summary.bySubMeter.length}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Sub-meters active in selected range
              </div>
            </div>
          </div>

          {/* Breakdown Table */}
          {summary.bySubMeter.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm space-y-0">
              <div className="p-3.5 bg-slate-950/80 border-b border-slate-800 text-xs font-bold uppercase tracking-wider text-slate-300">
                Consumption & Charges by Sub-Meter
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/40 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="py-2.5 px-4">Sub-Meter</th>
                      <th className="py-2.5 px-4">Beneficiary</th>
                      <th className="py-2.5 px-4">Readings</th>
                      <th className="py-2.5 px-4">Total Consumption</th>
                      <th className="py-2.5 px-4 text-right">Calculated Charge</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300 font-medium">
                    {summary.bySubMeter.map(item => (
                      <tr key={item.subMeterId} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-white">{item.name}</div>
                          <div className="font-mono text-[11px] text-slate-500">{item.meterCode}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-200">{item.beneficiaryName}</div>
                          <div className="text-[11px] text-slate-500">
                            {formatBeneficiaryType(item.beneficiaryType)}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400">
                          {item.readingCount} {item.readingCount === 1 ? 'entry' : 'entries'}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-amber-400">
                          {item.consumptionStr} kWh
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400 text-sm">
                          ₹{item.chargeStr}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
