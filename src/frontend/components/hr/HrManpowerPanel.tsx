import React from 'react';
import {
  HrManpowerSummary,
  HrManpowerSanction,
  HrDesignation,
} from '../../../shared/types';
import { formatDisplayDate } from './hrUi';
import {
  Layers,
  Plus,
  Edit,
  Loader2,
  TrendingDown,
  TrendingUp,
  Minus,
  CheckCircle2,
} from 'lucide-react';

export interface HrManpowerPanelProps {
  summary: HrManpowerSummary | null;
  sanctions: HrManpowerSanction[];
  designations: HrDesignation[];
  isLoading: boolean;
  canWriteManpower: boolean;
  onAddSanction: () => void;
  onEditSanction: (sanction: HrManpowerSanction) => void;
  onSetSanctionForDesignation: (designationId: string) => void;
}

export const HrManpowerPanel: React.FC<HrManpowerPanelProps> = ({
  summary,
  sanctions,
  designations,
  isLoading,
  canWriteManpower,
  onAddSanction,
  onEditSanction,
  onSetSanctionForDesignation,
}) => {
  const designationSummaries = summary?.byDesignation || [];

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Manpower Allocation Matrix</h3>
            <p className="text-xs text-slate-400">
              Sanctioned headcount vs active actual staff deployment by designation
            </p>
          </div>
        </div>

        {canWriteManpower && (
          <button
            onClick={onAddSanction}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold shadow-lg shadow-orange-500/20 transition flex items-center justify-center gap-1.5 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Set Sanction</span>
          </button>
        )}
      </div>

      {/* Designation Headcount Table */}
      {isLoading ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
          <span className="text-xs text-slate-400">Loading manpower data...</span>
        </div>
      ) : designationSummaries.length === 0 ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-500 mx-auto">
            <Layers className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-200">No designation summaries found</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Create designations and set approved manpower sanctions to track staffing variance.
          </p>
          {canWriteManpower && (
            <button
              onClick={onAddSanction}
              className="mt-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition"
            >
              Set First Sanction
            </button>
          )}
        </div>
      ) : (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/50 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Designation</th>
                  <th className="py-3.5 px-4 text-center">Sanctioned</th>
                  <th className="py-3.5 px-4 text-center">Actual Active</th>
                  <th className="py-3.5 px-4 text-center">Variance</th>
                  <th className="py-3.5 px-4 text-center">Shortage</th>
                  <th className="py-3.5 px-4 text-center">Excess</th>
                  <th className="py-3.5 px-4">Effective Date</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {designationSummaries.map(item => {
                  const sanction = sanctions.find(s => s.designationId === item.designationId);
                  const isShortage = item.shortageCount > 0;
                  const isExcess = item.excessCount > 0;
                  const isBalanced = item.sanctionedCount === item.actualCount && item.sanctionedCount > 0;

                  return (
                    <tr key={item.designationId} className="hover:bg-slate-800/30 transition">
                      {/* Designation */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">{item.designationName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {item.designationCode}
                        </div>
                      </td>

                      {/* Sanctioned */}
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-200">
                        {item.sanctionedCount}
                      </td>

                      {/* Actual */}
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-emerald-400">
                        {item.actualCount}
                      </td>

                      {/* Variance */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                            item.varianceCount < 0
                              ? 'bg-rose-500/10 text-rose-400'
                              : item.varianceCount > 0
                              ? 'bg-sky-500/10 text-sky-400'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {item.varianceCount > 0 ? `+${item.varianceCount}` : item.varianceCount}
                        </span>
                      </td>

                      {/* Shortage */}
                      <td className="py-3.5 px-4 text-center">
                        {item.shortageCount > 0 ? (
                          <span className="font-mono font-bold text-rose-400 flex items-center justify-center gap-1">
                            <TrendingDown className="w-3.5 h-3.5" />
                            <span>{item.shortageCount}</span>
                          </span>
                        ) : (
                          <span className="text-slate-600 font-mono">0</span>
                        )}
                      </td>

                      {/* Excess */}
                      <td className="py-3.5 px-4 text-center">
                        {item.excessCount > 0 ? (
                          <span className="font-mono font-bold text-sky-400 flex items-center justify-center gap-1">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>{item.excessCount}</span>
                          </span>
                        ) : (
                          <span className="text-slate-600 font-mono">0</span>
                        )}
                      </td>

                      {/* Effective From */}
                      <td className="py-3.5 px-4 font-mono text-slate-400">
                        {sanction?.effectiveFrom ? formatDisplayDate(sanction.effectiveFrom) : '—'}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        {canWriteManpower && (
                          sanction ? (
                            <button
                              onClick={() => onEditSanction(sanction)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-orange-400 text-xs font-semibold inline-flex items-center gap-1"
                              title="Edit Sanction"
                            >
                              <Edit className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => onSetSanctionForDesignation(item.designationId)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold inline-flex items-center gap-1"
                              title="Set Sanction"
                            >
                              <Plus className="w-3.5 h-3.5 text-orange-400" />
                              <span>Set</span>
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-slate-800">
            {designationSummaries.map(item => {
              const sanction = sanctions.find(s => s.designationId === item.designationId);
              return (
                <div key={item.designationId} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-white text-sm">{item.designationName}</div>
                      <div className="text-xs text-slate-400 font-mono">
                        {item.designationCode}
                      </div>
                    </div>
                    {sanction?.effectiveFrom && (
                      <span className="text-[10px] text-slate-400 font-mono bg-slate-800 px-2 py-0.5 rounded">
                        Eff: {formatDisplayDate(sanction.effectiveFrom)}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-slate-800/40 p-2.5 rounded-xl border border-slate-800 text-center">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Sanctioned</div>
                      <div className="font-mono font-bold text-white text-sm">
                        {item.sanctionedCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Actual</div>
                      <div className="font-mono font-bold text-emerald-400 text-sm">
                        {item.actualCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Variance</div>
                      <div
                        className={`font-mono font-bold text-sm ${
                          item.varianceCount < 0
                            ? 'text-rose-400'
                            : item.varianceCount > 0
                            ? 'text-sky-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {item.varianceCount > 0 ? `+${item.varianceCount}` : item.varianceCount}
                      </div>
                    </div>
                  </div>

                  {canWriteManpower && (
                    <div className="flex items-center justify-end pt-1">
                      {sanction ? (
                        <button
                          onClick={() => onEditSanction(sanction)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 text-orange-400 text-xs font-semibold flex items-center gap-1"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>Edit Sanction</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => onSetSanctionForDesignation(item.designationId)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5 text-orange-400" />
                          <span>Set Sanction</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
