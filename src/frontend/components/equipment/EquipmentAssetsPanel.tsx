import React, { useState, useMemo } from 'react';
import { Plus, Filter, RotateCcw, Cpu, Edit2, Info, Search } from 'lucide-react';
import { EquipmentAsset, EquipmentAssetType, EquipmentAssetStatus } from '../../../shared/types';
import { formatEquipmentType, getAssetStatusBadgeClass } from './equipmentUi';
import { EquipmentAssetModal } from './EquipmentAssetModal';

interface EquipmentAssetsPanelProps {
  outletId: string;
  assets: EquipmentAsset[];
  isLoading: boolean;
  canWriteAssets: boolean;
  onRefresh: () => void;
  onAssetSaved: (asset: EquipmentAsset) => void;
}

export const EquipmentAssetsPanel: React.FC<EquipmentAssetsPanelProps> = ({
  outletId,
  assets,
  isLoading,
  canWriteAssets,
  onRefresh,
  onAssetSaved
}) => {
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [assetToEdit, setAssetToEdit] = useState<EquipmentAsset | null>(null);

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      if (selectedType && asset.equipmentType !== selectedType) {
        return false;
      }
      if (selectedStatus && asset.status !== selectedStatus) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesCode = asset.assetCode.toLowerCase().includes(q);
        const matchesName = asset.name.toLowerCase().includes(q);
        const matchesSerial = asset.serialNumber?.toLowerCase().includes(q) || false;
        const matchesMfg = asset.manufacturer?.toLowerCase().includes(q) || false;
        if (!matchesCode && !matchesName && !matchesSerial && !matchesMfg) {
          return false;
        }
      }
      return true;
    });
  }, [assets, selectedType, selectedStatus, searchQuery]);

  const handleOpenCreate = () => {
    setAssetToEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (asset: EquipmentAsset) => {
    setAssetToEdit(asset);
    setIsModalOpen(true);
  };

  const handleClearFilters = () => {
    setSelectedType('');
    setSelectedStatus('');
    setSearchQuery('');
  };

  const hasActiveFilters = Boolean(selectedType || selectedStatus || searchQuery);

  return (
    <div className="space-y-4">
      {/* Control Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-900/60 p-4 border border-slate-800 rounded-2xl">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search Box */}
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search code, name, serial..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          {/* Equipment Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-amber-500 transition-colors"
          >
            <option value="">All Asset Types</option>
            <option value="ATG">Automatic Tank Gauge (ATG)</option>
            <option value="AIR_COMPRESSOR">Air Compressor</option>
            <option value="CNG_COMPRESSOR">CNG Compressor</option>
            <option value="DG_SET">DG Set</option>
            <option value="OTHER">Other</option>
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-amber-500 transition-colors"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="INACTIVE">Inactive</option>
            <option value="DECOMMISSIONED">Decommissioned</option>
          </select>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-xs flex items-center gap-1 transition-colors"
              title="Clear Filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {canWriteAssets && (
            <button
              onClick={handleOpenCreate}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors shadow-lg shadow-amber-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>Add Auxiliary Asset</span>
            </button>
          )}
        </div>
      </div>

      {/* Main List / Table */}
      {isLoading ? (
        <div className="p-12 flex flex-col items-center justify-center bg-slate-900/40 border border-slate-800 rounded-2xl">
          <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mb-3" />
          <p className="text-xs text-slate-400">Loading equipment assets...</p>
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl">
          <Cpu className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-300 mb-1">
            {hasActiveFilters ? 'No Matching Equipment Assets' : 'No Auxiliary Assets Registered'}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
            {hasActiveFilters
              ? 'Try changing or clearing the active filters to see available assets.'
              : 'Auxiliary equipment (ATG, Air Compressor, DG Set, CNG Compressor) at this outlet will appear here.'}
          </p>
          {canWriteAssets && !hasActiveFilters && (
            <button
              onClick={handleOpenCreate}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-medium inline-flex items-center gap-1.5 transition-colors shadow-lg shadow-amber-600/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register First Asset</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-hidden bg-slate-900/60 border border-slate-800 rounded-2xl shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/40 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="px-4 py-3">Asset Code</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Asset Name</th>
                    <th className="px-4 py-3">Mfg / Model</th>
                    <th className="px-4 py-3">Serial No</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Commissioned</th>
                    {canWriteAssets && <th className="px-4 py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {filteredAssets.map((asset) => {
                    const statusClass = getAssetStatusBadgeClass(asset.status);
                    return (
                      <tr
                        key={asset.id}
                        className="hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono font-medium text-amber-400">
                          {asset.assetCode}
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {formatEquipmentType(asset.equipmentType)}
                        </td>
                        <td className="px-4 py-3 font-medium text-white max-w-xs truncate" title={asset.name}>
                          {asset.name}
                          {asset.notes && (
                            <p className="text-[11px] text-slate-500 truncate" title={asset.notes}>
                              {asset.notes}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {asset.manufacturer || asset.model ? (
                            <span>
                              {asset.manufacturer || '—'} {asset.model ? `(${asset.model})` : ''}
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-300">
                          {asset.serialNumber || <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusClass}`}
                          >
                            {asset.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {asset.commissionedAt ? (
                            new Date(asset.commissionedAt).toLocaleDateString()
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        {canWriteAssets && (
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleOpenEdit(asset)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors border border-slate-700/60"
                              title="Edit Asset"
                            >
                              <Edit2 className="w-3 h-3 text-slate-400" />
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
          </div>

          {/* Mobile Stacked Card View */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredAssets.map((asset) => {
              const statusClass = getAssetStatusBadgeClass(asset.status);
              return (
                <div
                  key={asset.id}
                  className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-amber-400">
                          {asset.assetCode}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusClass}`}
                        >
                          {asset.status}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-white mt-1">{asset.name}</h4>
                    </div>

                    {canWriteAssets && (
                      <button
                        onClick={() => handleOpenEdit(asset)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs border border-slate-700"
                        title="Edit Asset"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/80">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Type</span>
                      <span className="text-slate-300 font-medium">
                        {formatEquipmentType(asset.equipmentType)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Serial No</span>
                      <span className="font-mono text-slate-300">
                        {asset.serialNumber || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Manufacturer</span>
                      <span className="text-slate-400">{asset.manufacturer || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Commissioned</span>
                      <span className="text-slate-400">
                        {asset.commissionedAt ? new Date(asset.commissionedAt).toLocaleDateString() : '—'}
                      </span>
                    </div>
                  </div>

                  {asset.notes && (
                    <p className="text-[11px] text-slate-400 bg-slate-800/40 p-2 rounded border border-slate-800">
                      {asset.notes}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Asset Modal */}
      {isModalOpen && (
        <EquipmentAssetModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          outletId={outletId}
          assetToEdit={assetToEdit}
          onAssetSaved={(savedAsset) => {
            onAssetSaved(savedAsset);
            onRefresh();
          }}
        />
      )}
    </div>
  );
};
