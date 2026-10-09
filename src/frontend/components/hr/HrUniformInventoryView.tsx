import React from 'react';
import {
  Package,
  Layers,
  Search,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Edit2,
  PlusCircle,
} from 'lucide-react';
import type {
  HrUniformItem,
  HrUniformVariant,
  HrUniformStockSummary,
} from '../../../shared/types';
import { formatUniformCategory, formatUniformItemStatus } from './hrUniformUi';

export interface HrUniformInventoryViewProps {
  items: HrUniformItem[];
  variants: HrUniformVariant[];
  stockSummary: HrUniformStockSummary[];
  isLoading: boolean;
  filters: {
    category: string;
    status: string;
    search: string;
    selectedItemId: string;
  };
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
  canWriteInventory: boolean;
  onAddItem?: () => void;
  onEditItem?: (item: HrUniformItem) => void;
  onAddVariant?: (initialItemId?: string) => void;
  onEditVariant?: (variant: HrUniformVariant) => void;
  onRecordStock?: (variantId?: string) => void;
}

const CATEGORIES = [
  'SHIRT',
  'TROUSER',
  'JACKET',
  'T_SHIRT',
  'CAP',
  'SHOES',
  'BELT',
  'OTHER',
];

export const HrUniformInventoryView: React.FC<HrUniformInventoryViewProps> = ({
  items,
  variants,
  stockSummary,
  isLoading,
  filters,
  onFilterChange,
  onClearFilters,
  canWriteInventory,
  onAddItem,
  onEditItem,
  onAddVariant,
  onEditVariant,
  onRecordStock,
}) => {
  // Map stock by variantId for fast lookups
  const stockMap = new Map<string, HrUniformStockSummary>();
  stockSummary.forEach(s => stockMap.set(s.variantId, s));

  // Count variants per item (using authoritative stockSummary so counts remain stable across item filter)
  const variantCountMap = new Map<string, number>();
  stockSummary.forEach(s => {
    variantCountMap.set(s.itemId, (variantCountMap.get(s.itemId) || 0) + 1);
  });

  // Backend already filters variants by selectedItemId when provided
  const displayVariants = variants;

  return (
    <div className="space-y-6">
      {/* Search & Filter Toolbar */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search code or name..."
              value={filters.search}
              onChange={e => onFilterChange('search', e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          {/* Category */}
          <div>
            <select
              value={filters.category}
              onChange={e => onFilterChange('category', e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
            >
              <option value="">All Categories</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>
                  {formatUniformCategory(cat)}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <select
              value={filters.status}
              onChange={e => onFilterChange('status', e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>

          {/* Item Selector for Variants Filter */}
          <div>
            <select
              value={filters.selectedItemId}
              onChange={e => onFilterChange('selectedItemId', e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
            >
              <option value="">All Uniform Items</option>
              {items.map(item => (
                <option key={item.id} value={item.id}>
                  {item.itemName} ({item.itemCode})
                </option>
              ))}
            </select>
          </div>
        </div>

        {(filters.search || filters.category || filters.status || filters.selectedItemId) && (
          <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-xs">
            <span className="text-slate-400 text-[11px]">Filters active</span>
            <button
              onClick={onClearFilters}
              className="text-orange-400 hover:text-orange-300 font-semibold text-[11px] transition"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Item Master Section */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Uniform Master Items</h3>
              <p className="text-[11px] text-slate-400">
                Primary uniform catalog definitions for this retail outlet
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
              {items.length} Items
            </span>
            {canWriteInventory && onAddItem && (
              <button
                onClick={onAddItem}
                className="px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-orange-500/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="h-40 bg-slate-950/40 rounded-xl border border-slate-800/60 animate-pulse" />
        ) : items.length === 0 ? (
          <div className="py-10 text-center rounded-xl bg-slate-950/30 border border-slate-800/60">
            <Package className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-300">No uniform items found</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              No items match your active filter criteria or none are registered.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3.5">Item Code</th>
                  <th className="py-2.5 px-3.5">Item Name</th>
                  <th className="py-2.5 px-3.5">Category</th>
                  <th className="py-2.5 px-3.5">Description</th>
                  <th className="py-2.5 px-3.5 text-center">Variants</th>
                  <th className="py-2.5 px-3.5 text-center">Status</th>
                  {canWriteInventory && <th className="py-2.5 px-3.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-[11px]">
                {items.map(item => {
                  const statusStyle = formatUniformItemStatus(item.status);
                  const count = variantCountMap.get(item.id) || 0;
                  const isSelected = filters.selectedItemId === item.id;
                  return (
                    <tr
                      key={item.id}
                      onClick={() =>
                        onFilterChange('selectedItemId', isSelected ? '' : item.id)
                      }
                      className={`hover:bg-slate-800/40 cursor-pointer transition ${
                        isSelected ? 'bg-orange-950/20 border-l-2 border-l-orange-500' : 'bg-slate-950/20'
                      }`}
                    >
                      <td className="py-2.5 px-3.5 font-mono font-bold text-orange-400">
                        {item.itemCode}
                      </td>
                      <td className="py-2.5 px-3.5 font-medium text-white">{item.itemName}</td>
                      <td className="py-2.5 px-3.5 text-slate-400">
                        {formatUniformCategory(item.category)}
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-400 truncate max-w-xs">
                        {item.description || '—'}
                      </td>
                      <td className="py-2.5 px-3.5 text-center font-mono font-bold text-slate-300">
                        {count}
                      </td>
                      <td className="py-2.5 px-3.5 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusStyle.bgClass} ${statusStyle.textClass} ${statusStyle.borderClass}`}
                        >
                          {statusStyle.label}
                        </span>
                      </td>
                      {canWriteInventory && (
                        <td
                          className="py-2.5 px-3.5 text-right"
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            onClick={() => onEditItem?.(item)}
                            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition inline-flex items-center gap-1 text-[10px] font-semibold"
                            title="Edit Item"
                          >
                            <Edit2 className="w-3 h-3 text-orange-400" />
                            <span>Edit</span>
                          </button>
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

      {/* Variant & Stock Section */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Size Variants & Available Stock</h3>
              <p className="text-[11px] text-slate-400">
                Sizes, live stock balance and minimum reorder thresholds
                {filters.selectedItemId && ' (Filtered by selected item)'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
              {displayVariants.length} Sizes
            </span>
            {canWriteInventory && onAddVariant && (
              <button
                onClick={() => onAddVariant(filters.selectedItemId || undefined)}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-amber-500/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Variant</span>
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="h-40 bg-slate-950/40 rounded-xl border border-slate-800/60 animate-pulse" />
        ) : displayVariants.length === 0 ? (
          <div className="py-10 text-center rounded-xl bg-slate-950/30 border border-slate-800/60">
            <Layers className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-300">No size variants found</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              No variants registered under this uniform item yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3.5">Item</th>
                  <th className="py-2.5 px-3.5">Item Code</th>
                  <th className="py-2.5 px-3.5">Size</th>
                  <th className="py-2.5 px-3.5 text-right">Current Stock</th>
                  <th className="py-2.5 px-3.5 text-right">Reorder Level</th>
                  <th className="py-2.5 px-3.5 text-center">Stock Alert</th>
                  <th className="py-2.5 px-3.5 text-center">Status</th>
                  {canWriteInventory && <th className="py-2.5 px-3.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-[11px]">
                {displayVariants.map(variant => {
                  const stock = stockMap.get(variant.id);
                  const currentStock = stock?.currentStock ?? 0;
                  const isLow = stock?.isLowStock ?? (currentStock <= variant.reorderLevel);
                  const statusStyle = formatUniformItemStatus(variant.status);
                  const item = items.find(i => i.id === variant.uniformItemId);

                  return (
                    <tr
                      key={variant.id}
                      className="hover:bg-slate-800/40 transition bg-slate-950/20"
                    >
                      <td className="py-2.5 px-3.5 font-medium text-white">
                        {item?.itemName || variant.itemName || '—'}
                      </td>
                      <td className="py-2.5 px-3.5 font-mono text-slate-400">
                        {item?.itemCode || variant.itemCode || '—'}
                      </td>
                      <td className="py-2.5 px-3.5 font-mono font-bold text-amber-300">
                        {variant.sizeLabel}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-black text-sm">
                        <span className={isLow ? 'text-rose-400' : 'text-emerald-400'}>
                          {currentStock}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono text-slate-400">
                        {variant.reorderLevel}
                      </td>
                      <td className="py-2.5 px-3.5 text-center">
                        {isLow ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <AlertTriangle className="w-3 h-3" />
                            Low Stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            Adequate
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusStyle.bgClass} ${statusStyle.textClass} ${statusStyle.borderClass}`}
                        >
                          {statusStyle.label}
                        </span>
                      </td>
                      {canWriteInventory && (
                        <td className="py-2.5 px-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => onRecordStock?.(variant.id)}
                              className="px-2 py-1 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/20 transition inline-flex items-center gap-1 text-[10px] font-semibold"
                              title="Record Stock Movement"
                            >
                              <PlusCircle className="w-3 h-3" />
                              <span>Stock</span>
                            </button>
                            <button
                              onClick={() => onEditVariant?.(variant)}
                              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition inline-flex items-center gap-1 text-[10px] font-semibold"
                              title="Edit Variant"
                            >
                              <Edit2 className="w-3 h-3 text-amber-400" />
                              <span>Edit</span>
                            </button>
                          </div>
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
