import React, { useState } from 'react';
import { LubeSku, LubeStockUnit } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { PERMISSIONS } from '../../../shared/constants';
import { useAuth } from '../../context/AuthContext';
import { Plus, Edit2, AlertCircle, RefreshCw, X } from 'lucide-react';

interface LubeSkuPanelProps {
  outletId: string;
  skus: LubeSku[];
  loading: boolean;
  onRefresh: () => void;
  setError: (msg: string | null) => void;
  setSuccess: (msg: string | null) => void;
}

export const LubeSkuPanel: React.FC<LubeSkuPanelProps> = ({
  outletId,
  skus,
  loading,
  onRefresh,
  setError,
  setSuccess,
}) => {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission(PERMISSIONS.LUBE_INVENTORY_WRITE);

  const [showModal, setShowModal] = useState(false);
  const [editingSku, setEditingSku] = useState<LubeSku | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [skuCode, setSkuCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('ENGINE_OIL');
  const [stockUnit, setStockUnit] = useState<LubeStockUnit>('PACK');
  const [reorderThreshold, setReorderThreshold] = useState('10');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [localFormError, setLocalFormError] = useState<string | null>(null);

  const openCreateModal = () => {
    setEditingSku(null);
    setSkuCode('');
    setName('');
    setCategory('ENGINE_OIL');
    setStockUnit('PACK');
    setReorderThreshold('10');
    setStatus('ACTIVE');
    setLocalFormError(null);
    setShowModal(true);
  };

  const openEditModal = (sku: LubeSku) => {
    setEditingSku(sku);
    setSkuCode(sku.skuCode);
    setName(sku.name);
    setCategory(sku.category);
    setStockUnit(sku.stockUnit);
    setReorderThreshold(sku.reorderThreshold);
    setStatus(sku.status);
    setLocalFormError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setLocalFormError('Name is required');
    if (!editingSku && !skuCode.trim()) return setLocalFormError('SKU Code is required');
    if (!reorderThreshold.trim()) return setLocalFormError('Reorder Threshold is required');

    setSubmitting(true);
    setLocalFormError(null);

    try {
      if (editingSku) {
        // PUT /api/v1/lube/skus/:id
        const res = await apiFetch(`/api/v1/lube/skus/${editingSku.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: name.trim(),
            category: category.trim(),
            reorderThreshold: reorderThreshold.trim(),
            status,
          }),
        });

        if (res.success) {
          setSuccess(`SKU "${name}" updated successfully.`);
          setShowModal(false);
          onRefresh();
        } else {
          setLocalFormError(res.error?.message || 'Failed to update SKU');
        }
      } else {
        // POST /api/v1/outlets/:outletId/lube/skus
        const res = await apiFetch(`/api/v1/outlets/${outletId}/lube/skus`, {
          method: 'POST',
          body: JSON.stringify({
            skuCode: skuCode.trim().toUpperCase(),
            name: name.trim(),
            category: category.trim(),
            stockUnit,
            reorderThreshold: reorderThreshold.trim(),
            status,
          }),
        });

        if (res.success) {
          setSuccess(`SKU "${name}" created successfully.`);
          setShowModal(false);
          onRefresh();
        } else {
          setLocalFormError(res.error?.message || 'Failed to create SKU');
        }
      }
    } catch (err: any) {
      setLocalFormError(err.message || 'An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">SKU Catalog</h3>
          <p className="text-xs text-slate-400 mt-0.5">Manage the list of lube and auxiliary stock keeping units</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canWrite && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-600 rounded-lg hover:from-orange-600 hover:to-amber-700 transition-all shadow-md shadow-orange-500/10"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create SKU</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
        </div>
      ) : skus.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl space-y-3">
          <AlertCircle className="w-8 h-8 text-slate-500 mx-auto" />
          <h4 className="text-sm font-semibold text-white">No SKUs Configured</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Get started by adding lube stock keeping units to this retail outlet catalog.
          </p>
          {canWrite && (
            <button
              onClick={openCreateModal}
              className="px-4 py-2 text-xs font-bold text-white bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-lg transition-all mt-2"
            >
              Add First SKU
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">SKU Code</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Stock Unit</th>
                <th className="py-3 px-4 text-right">Reorder Threshold</th>
                <th className="py-3 px-4 text-center">Status</th>
                {canWrite && <th className="py-3 px-4 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-xs">
              {skus.map((sku) => (
                <tr key={sku.id} className="hover:bg-slate-800/40 text-slate-300">
                  <td className="py-3 px-4 font-mono font-bold text-white">{sku.skuCode}</td>
                  <td className="py-3 px-4 font-medium text-slate-100">{sku.name}</td>
                  <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">{sku.category}</td>
                  <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">{sku.stockUnit}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">{sku.reorderThreshold}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`text-[11px] font-medium ${sku.status === 'ACTIVE' ? 'text-emerald-500' : 'text-slate-500'}`}>
                      {sku.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canWrite && (
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => openEditModal(sku)}
                        className="p-1 text-slate-400 hover:text-orange-500 hover:bg-slate-800 rounded-md transition-all inline-flex items-center"
                        title="Edit SKU"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                {editingSku ? 'Edit Lube SKU' : 'Register New Lube SKU'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {localFormError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-lg flex items-start gap-2.5 text-rose-500 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{localFormError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block text-slate-400 font-medium">SKU Code</label>
                <input
                  type="text"
                  value={skuCode}
                  onChange={(e) => setSkuCode(e.target.value)}
                  disabled={!!editingSku || submitting}
                  placeholder="e.g. SERVO-FUT-5W30"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-white rounded-lg focus:outline-none focus:border-orange-500 disabled:opacity-50 font-mono uppercase"
                  required
                />
                {!editingSku && (
                  <p className="text-[10px] text-slate-500 font-mono">Unique identifier. Cannot be changed later.</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 font-medium">SKU Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                  placeholder="e.g. SERVO Futura Synth 5W-30"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-white rounded-lg focus:outline-none focus:border-orange-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-slate-400 font-medium">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={submitting}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-white rounded-lg focus:outline-none focus:border-orange-500"
                  >
                    <option value="ENGINE_OIL">Engine Oil</option>
                    <option value="GREASE">Grease</option>
                    <option value="COOLANT">Coolant</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-400 font-medium">Stock Unit</label>
                  <select
                    value={stockUnit}
                    onChange={(e) => setStockUnit(e.target.value as LubeStockUnit)}
                    disabled={!!editingSku || submitting}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-white rounded-lg focus:outline-none focus:border-orange-500 disabled:opacity-50"
                  >
                    <option value="PACK">Pack (Integer)</option>
                    <option value="LITRE">Litre (Decimal)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-slate-400 font-medium">Reorder Threshold</label>
                  <input
                    type="text"
                    value={reorderThreshold}
                    onChange={(e) => setReorderThreshold(e.target.value)}
                    disabled={submitting}
                    placeholder={stockUnit === 'PACK' ? 'e.g. 10' : 'e.g. 25.500'}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-white rounded-lg focus:outline-none focus:border-orange-500 font-mono"
                    required
                  />
                  <p className="text-[10px] text-slate-500 font-mono">
                    {stockUnit === 'PACK' ? 'Integer values only' : 'Up to 3 decimal places'}
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-400 font-medium">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                    disabled={submitting}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-white rounded-lg focus:outline-none focus:border-orange-500"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                  className="px-4 py-2 font-bold text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-4 py-2 font-bold text-white bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 rounded-lg transition-all shadow-md shadow-orange-500/10"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save SKU</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
