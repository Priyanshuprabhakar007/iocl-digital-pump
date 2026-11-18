import React from 'react';
import {
  Package,
  Layers,
  Boxes,
  AlertTriangle,
  Shirt,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import type { HrUniformReportSummary, HrUniformStockSummary } from '../../../shared/types';
import { formatUniformCategory, formatUniformItemStatus } from './hrUniformUi';

interface HrUniformOverviewProps {
  summary: HrUniformReportSummary | null;
  stockSummary: HrUniformStockSummary[];
  isLoading: boolean;
}

export const HrUniformOverview: React.FC<HrUniformOverviewProps> = ({
  summary,
  stockSummary,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-24 bg-white rounded-xl border border-slate-200" />
          ))}
        </div>
        <div className="h-48 bg-white rounded-2xl border border-slate-200" />
      </div>
    );
  }

  if (!summary) return <div role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Uniform inventory summary unavailable. Refresh to retrieve saved records.</div>;

  const lowStockVariants = stockSummary
    .filter(s => s.isLowStock)
    .sort((a, b) => {
      if (a.currentStock !== b.currentStock) {
        return a.currentStock - b.currentStock;
      }
      return a.itemCode.localeCompare(b.itemCode);
    });

  const lowStockCount = summary?.lowStockVariantCount ?? lowStockVariants.length;

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3.5">
        {/* Active Items */}
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-600 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Items</span>
            <Package className="w-4 h-4 text-orange-700" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-[#17365D]">
              {summary?.totalActiveItems ?? 0}
            </div>
            <div className="text-[10px] text-slate-500 font-medium">Active master items</div>
          </div>
        </div>

        {/* Active Variants */}
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-600 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Variants</span>
            <Layers className="w-4 h-4 text-amber-700" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-[#17365D]">
              {summary?.totalActiveVariants ?? 0}
            </div>
            <div className="text-[10px] text-slate-500 font-medium">Active sizes/SKUs</div>
          </div>
        </div>

        {/* Available Stock */}
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-600 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Available</span>
            <Boxes className="w-4 h-4 text-emerald-700" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-emerald-700">
              {summary?.totalAvailableStock ?? 0}
            </div>
            <div className="text-[10px] text-slate-500 font-medium">Units in inventory</div>
          </div>
        </div>

        {/* Low Stock Variants Alert Card */}
        <div
          className={`rounded-xl p-3.5 flex flex-col justify-between transition border ${
            lowStockCount > 0
              ? 'bg-rose-50 border-rose-200 text-rose-700'
              : 'bg-white border-slate-200 text-slate-600'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Low Stock</span>
            <AlertTriangle
              className={`w-4 h-4 ${lowStockCount > 0 ? 'text-rose-700 animate-pulse' : 'text-slate-500'}`}
            />
          </div>
          <div>
            <div
              className={`text-xl sm:text-2xl font-black ${
                lowStockCount > 0 ? 'text-rose-700' : 'text-slate-600'
              }`}
            >
              {lowStockCount}
            </div>
            <div className="text-[10px] text-slate-500 font-medium">Variants below reorder</div>
          </div>
        </div>

        {/* Currently Issued */}
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-600 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Issued</span>
            <Shirt className="w-4 h-4 text-sky-700" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-sky-700">
              {summary?.totalIssued ?? 0}
            </div>
            <div className="text-[10px] text-slate-500 font-medium">Active with staff</div>
          </div>
        </div>

        {/* Returned */}
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-600 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Returned</span>
            <RotateCcw className="w-4 h-4 text-teal-700" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-teal-700">
              {summary?.totalReturned ?? 0}
            </div>
            <div className="text-[10px] text-slate-500 font-medium">Returned uniforms</div>
          </div>
        </div>

        {/* Replaced */}
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-600 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Replaced</span>
            <RefreshCw className="w-4 h-4 text-purple-700" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-purple-700">
              {summary?.totalReplaced ?? 0}
            </div>
            <div className="text-[10px] text-slate-500 font-medium">Exchanged uniforms</div>
          </div>
        </div>
      </div>

      {/* Low Stock Attention Section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-700">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#17365D]">Low Stock Attention</h3>
              <p className="text-[11px] text-slate-600">
                Variants currently at or below configured reorder threshold
              </p>
            </div>
          </div>
          {lowStockVariants.length > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-700 border border-rose-500/30">
              {lowStockVariants.length} Attention Required
            </span>
          )}
        </div>

        {lowStockVariants.length === 0 ? (
          <div className="py-8 px-4 text-center rounded-xl bg-white border border-slate-200 flex flex-col items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 flex items-center justify-center mb-2.5">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-slate-600">{stockSummary.length===0?'No uniform inventory configured':'No low-stock variants recorded'}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {stockSummary.length===0?'Add uniform items and variants in Inventory Master before reviewing levels.':'No saved variant is flagged below its configured reorder threshold.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-white text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3.5">Item</th>
                  <th className="py-2.5 px-3.5">Item Code</th>
                  <th className="py-2.5 px-3.5">Category</th>
                  <th className="py-2.5 px-3.5">Size</th>
                  <th className="py-2.5 px-3.5 text-right">Current Stock</th>
                  <th className="py-2.5 px-3.5 text-right">Reorder Level</th>
                  <th className="py-2.5 px-3.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                {lowStockVariants.map(variant => {
                  const statusStyle = formatUniformItemStatus(variant.status);
                  return (
                    <tr
                      key={variant.variantId}
                      className="hover:bg-slate-100 transition bg-white"
                    >
                      <td className="py-2.5 px-3.5 font-sans font-medium text-[#17365D]">
                        {variant.itemName}
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-600 font-semibold">
                        {variant.itemCode}
                      </td>
                      <td className="py-2.5 px-3.5 font-sans text-slate-600">
                        {formatUniformCategory(variant.category)}
                      </td>
                      <td className="py-2.5 px-3.5 font-bold text-amber-700">
                        {variant.sizeLabel}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-black text-rose-700">
                        {variant.currentStock}
                      </td>
                      <td className="py-2.5 px-3.5 text-right text-slate-600 font-medium">
                        {variant.reorderLevel}
                      </td>
                      <td className="py-2.5 px-3.5 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-sans font-semibold border ${statusStyle.bgClass} ${statusStyle.textClass} ${statusStyle.borderClass}`}
                        >
                          {statusStyle.label}
                        </span>
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
