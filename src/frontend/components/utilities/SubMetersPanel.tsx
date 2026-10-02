import React from 'react';
import { UtilitySubMeter } from '../../../shared/types';
import {
  formatBeneficiaryType,
  formatSubMeterStatus,
  formatDisplayDate,
  canEditSubMeter,
} from './utilityUi';
import {
  Gauge,
  Plus,
  Filter,
  RotateCcw,
  Edit2,
  ChevronRight,
  Zap,
} from 'lucide-react';

interface SubMetersPanelProps {
  subMeters: UtilitySubMeter[];
  loading?: boolean;
  canWriteSubMeters: boolean;
  canWriteReadings: boolean;
  filterBeneficiaryType: string;
  filterStatus: string;
  onFilterChange: (filters: { beneficiaryType: string; status: string }) => void;
  onOpenCreate: () => void;
  onSelectSubMeter: (subMeter: UtilitySubMeter) => void;
  onOpenEdit: (subMeter: UtilitySubMeter) => void;
}

export const SubMetersPanel: React.FC<SubMetersPanelProps> = ({
  subMeters,
  loading = false,
  canWriteSubMeters,
  canWriteReadings,
  filterBeneficiaryType,
  filterStatus,
  onFilterChange,
  onOpenCreate,
  onSelectSubMeter,
  onOpenEdit,
}) => {
  const hasActiveFilters = filterBeneficiaryType !== '' || filterStatus !== '';

  const handleClearFilters = () => {
    onFilterChange({ beneficiaryType: '', status: '' });
  };

  return (
    <div className="space-y-4">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Electricity Sub-Meter Masters
            </h3>
            <p className="text-xs text-slate-400">
              {subMeters.length} {subMeters.length === 1 ? 'sub-meter' : 'sub-meters'} configured at this outlet
            </p>
          </div>
        </div>

        {canWriteSubMeters && (
          <button
            type="button"
            onClick={onOpenCreate}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors shadow-lg shadow-orange-500/20 shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            New Sub-Meter
          </button>
        )}
      </div>

      {/* Filter Toolbar */}
      <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5 text-slate-400 font-semibold uppercase tracking-wider text-[11px] mr-1">
          <Filter className="w-3.5 h-3.5 text-orange-400" />
          Filter:
        </div>

        {/* Beneficiary Type Filter */}
        <select
          value={filterBeneficiaryType}
          onChange={e =>
            onFilterChange({ beneficiaryType: e.target.value, status: filterStatus })
          }
          className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-orange-500/60"
        >
          <option value="">All Beneficiary Types</option>
          <option value="NFR_VENDOR">NFR Vendor</option>
          <option value="CNG_FACILITY">CNG Facility</option>
          <option value="OTHER">Other Facility</option>
        </select>

        {/* Status Filter */}
        <select
          value={filterStatus}
          onChange={e =>
            onFilterChange({ beneficiaryType: filterBeneficiaryType, status: e.target.value })
          }
          className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-orange-500/60"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="DECOMMISSIONED">Decommissioned</option>
        </select>

        {/* Clear */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl flex items-center gap-1 transition-colors text-[11px] font-medium"
          >
            <RotateCcw className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-8 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse space-y-3">
          <div className="h-6 w-40 bg-slate-800 rounded" />
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-slate-800/60 rounded-xl" />
            ))}
          </div>
        </div>
      ) : subMeters.length === 0 ? (
        <div className="p-12 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500 mx-auto">
            <Gauge className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-white">
            {hasActiveFilters ? 'No Matching Sub-Meters Found' : 'No Sub-Meters Configured'}
          </h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {hasActiveFilters
              ? 'Try adjusting your beneficiary type or status filters.'
              : 'Add sub-meters to track individual electricity consumption for NFR vendors and retail facilities.'}
          </p>
          {canWriteSubMeters && !hasActiveFilters && (
            <button
              type="button"
              onClick={onOpenCreate}
              className="mt-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-orange-400 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors border border-slate-700"
            >
              <Plus className="w-3.5 h-3.5" />
              Configure First Sub-Meter
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Desktop Table View */}
          <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Meter Code</th>
                  <th className="py-3 px-4">Sub-Meter Name</th>
                  <th className="py-3 px-4">Beneficiary</th>
                  <th className="py-3 px-4">Active Tariff</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Serial No.</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300 font-medium">
                {subMeters.map(sm => {
                  const statusInfo = formatSubMeterStatus(sm.status);

                  return (
                    <tr
                      key={sm.id}
                      onClick={() => onSelectSubMeter(sm)}
                      className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-4">
                        <div className="font-mono text-white font-bold">{sm.meterCode}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-white font-semibold">{sm.name}</div>
                        {sm.notes && (
                          <div className="text-[11px] text-slate-500 truncate max-w-xs">{sm.notes}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-200">{sm.beneficiaryName}</div>
                        <div className="text-[11px] text-slate-500 font-medium">
                          {formatBeneficiaryType(sm.beneficiaryType)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-orange-400">
                          ₹{sm.ratePerKwhStr} <span className="text-[11px] text-slate-500 font-normal">/ kWh</span>
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${statusInfo.badgeClass}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {sm.serialNumber || '-'}
                      </td>
                      <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {canWriteSubMeters && (
                            <button
                              type="button"
                              onClick={() => onOpenEdit(sm)}
                              className="p-1.5 text-slate-400 hover:text-orange-400 hover:bg-slate-800 rounded-lg transition-colors"
                              title="Edit Sub-Meter"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onSelectSubMeter(sm)}
                            className="p-1.5 text-slate-400 group-hover:text-orange-400 transition-colors"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked View */}
          <div className="md:hidden space-y-3">
            {subMeters.map(sm => {
              const statusInfo = formatSubMeterStatus(sm.status);

              return (
                <div
                  key={sm.id}
                  onClick={() => onSelectSubMeter(sm)}
                  className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 cursor-pointer hover:border-slate-700 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-white text-sm">{sm.name}</div>
                      <div className="text-xs font-mono text-slate-400 mt-0.5">{sm.meterCode}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${statusInfo.badgeClass}`}
                      >
                        {statusInfo.label}
                      </span>
                      {canWriteSubMeters && (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            onOpenEdit(sm);
                          }}
                          className="p-1 text-slate-400 hover:text-orange-400 rounded-lg"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-800/80">
                    <div>
                      <span className="text-[11px] text-slate-500 block uppercase">Beneficiary</span>
                      <span className="text-slate-300 font-medium truncate block">
                        {sm.beneficiaryName}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 block uppercase">Tariff Rate</span>
                      <span className="text-orange-400 font-mono font-bold block">
                        ₹{sm.ratePerKwhStr} / kWh
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
