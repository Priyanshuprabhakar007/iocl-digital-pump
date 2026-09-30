import React, { useState } from 'react';
import { LubeSku, LubeSkuPrice } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { PERMISSIONS } from '../../../shared/constants';
import { useAuth } from '../../context/AuthContext';
import { Plus, Edit2, AlertCircle, RefreshCw, X } from 'lucide-react';
import { formatPaiseToMoney } from '../../../shared/financialUtils';

interface LubePricePanelProps {
  outletId: string;
  skus: LubeSku[];
  prices: LubeSkuPrice[];
  loading: boolean;
  onRefresh: () => void;
  setError: (msg: string | null) => void;
  setSuccess: (msg: string | null) => void;
}

export const LubePricePanel: React.FC<LubePricePanelProps> = ({
  outletId,
  skus,
  prices,
  loading,
  onRefresh,
  setError,
  setSuccess,
}) => {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission(PERMISSIONS.LUBE_PRICES_WRITE);

  const [showModal, setShowModal] = useState(false);
  const [editingPrice, setEditingPrice] = useState<LubeSkuPrice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [lubeSkuId, setLubeSkuId] = useState('');
  const [pricePaisePerUnit, setPricePaisePerUnit] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [localFormError, setLocalFormError] = useState<string | null>(null);

  const openCreateModal = () => {
    setEditingPrice(null);
    setLubeSkuId(skus[0]?.id || '');
    setPricePaisePerUnit('');
    // Default effectiveFrom to current date
    const today = new Date().toISOString().split('T')[0];
    setEffectiveFrom(today);
    setEffectiveTo('');
    setStatus('ACTIVE');
    setLocalFormError(null);
    setShowModal(true);
  };

  const openEditModal = (price: LubeSkuPrice) => {
    setEditingPrice(price);
    setLubeSkuId(price.lubeSkuId);
    setPricePaisePerUnit(price.pricePerUnitStr || (price.pricePaisePerUnit / 100).toFixed(2));
    setEffectiveFrom(price.effectiveFrom);
    setEffectiveTo(price.effectiveTo || '');
    setStatus(price.status);
    setLocalFormError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lubeSkuId) return setLocalFormError('SKU is required');
    if (!pricePaisePerUnit.trim() || isNaN(Number(pricePaisePerUnit))) return setLocalFormError('Price must be a valid number');
    if (!effectiveFrom) return setLocalFormError('Effective from date is required');

    setSubmitting(true);
    setLocalFormError(null);

    const payload: any = {
      effectiveTo: effectiveTo ? effectiveTo : null,
      status,
    };

    if (!editingPrice) {
      payload.lubeSkuId = lubeSkuId;
      payload.pricePaisePerUnit = pricePaisePerUnit.trim();
      payload.effectiveFrom = effectiveFrom;
    }

    try {
      if (editingPrice) {
        // PUT /api/v1/lube/prices/:id
        const res = await apiFetch(`/api/v1/lube/prices/${editingPrice.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });

        if (res.success) {
          setSuccess('Selling price updated successfully.');
          setShowModal(false);
          onRefresh();
        } else {
          setLocalFormError(res.error?.message || 'Failed to update price');
        }
      } else {
        // POST /api/v1/outlets/:outletId/lube/prices
        const res = await apiFetch(`/api/v1/outlets/${outletId}/lube/prices`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        if (res.success) {
          setSuccess('Selling price configured successfully.');
          setShowModal(false);
          onRefresh();
        } else {
          setLocalFormError(res.error?.message || 'Failed to configure price');
        }
      }
    } catch (err: any) {
      setLocalFormError(err.message || 'An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const getSkuNameAndCode = (skuId: string) => {
    const sku = skus.find(s => s.id === skuId);
    return sku ? `${sku.name} (${sku.skuCode})` : 'Unknown SKU';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">Selling Prices</h3>
          <p className="text-xs text-slate-400 mt-0.5">Configure and audit active or historical SKU unit prices</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canWrite && skus.length > 0 && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-600 rounded-lg hover:from-orange-600 hover:to-amber-700 transition-all shadow-md shadow-orange-500/10"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Price</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
        </div>
      ) : prices.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl space-y-3">
          <AlertCircle className="w-8 h-8 text-slate-500 mx-auto" />
          <h4 className="text-sm font-semibold text-white">No Prices Configured</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            You must configure selling prices for your catalog SKUs before sales can be recorded.
          </p>
          {canWrite && skus.length > 0 && (
            <button
              onClick={openCreateModal}
              className="px-4 py-2 text-xs font-bold text-white bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-lg transition-all mt-2"
            >
              Configure First Price
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4 text-right">Selling Price</th>
                <th className="py-3 px-4">Effective From</th>
                <th className="py-3 px-4">Effective To</th>
                <th className="py-3 px-4 text-center">Status</th>
                {canWrite && <th className="py-3 px-4 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-xs">
              {prices.map((price) => (
                <tr key={price.id} className="hover:bg-slate-800/40 text-slate-300">
                  <td className="py-3 px-4 font-medium text-slate-100">{getSkuNameAndCode(price.lubeSkuId)}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-white tabular-nums">
                    ₹{price.pricePerUnitStr || (price.pricePaisePerUnit / 100).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">{price.effectiveFrom}</td>
                  <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                    {price.effectiveTo || <span className="text-slate-600 font-normal italic">ongoing</span>}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`text-[11px] font-medium ${price.status === 'ACTIVE' ? 'text-emerald-500' : 'text-slate-500'}`}>
                      {price.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canWrite && (
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => openEditModal(price)}
                        className="p-1 text-slate-400 hover:text-orange-500 hover:bg-slate-800 rounded-md transition-all inline-flex items-center"
                        title="Edit Price Scope"
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
                {editingPrice ? 'Edit Price Configuration' : 'Add Lube Selling Price'}
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
                <label className="block text-slate-400 font-medium">Target Lube SKU</label>
                <select
                  value={lubeSkuId}
                  onChange={(e) => setLubeSkuId(e.target.value)}
                  disabled={!!editingPrice || submitting}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-white rounded-lg focus:outline-none focus:border-orange-500 disabled:opacity-50"
                  required
                >
                  {skus.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.skuCode}) [{s.stockUnit}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-slate-400 font-medium">Price (₹ per unit)</label>
                  <input
                    type="text"
                    value={pricePaisePerUnit}
                    onChange={(e) => setPricePaisePerUnit(e.target.value)}
                    disabled={!!editingPrice || submitting}
                    placeholder="e.g. 450.50"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-white rounded-lg focus:outline-none focus:border-orange-500 disabled:opacity-50 font-mono"
                    required
                  />
                  {!editingPrice && (
                    <p className="text-[10px] text-slate-500 font-mono">Will be converted to paise internally.</p>
                  )}
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-slate-400 font-medium">Effective From</label>
                  <input
                    type="date"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    disabled={!!editingPrice || submitting}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-white rounded-lg focus:outline-none focus:border-orange-500 disabled:opacity-50 font-mono"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-400 font-medium">Effective To</label>
                  <input
                    type="date"
                    value={effectiveTo}
                    onChange={(e) => setEffectiveTo(e.target.value)}
                    disabled={submitting}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-white rounded-lg focus:outline-none focus:border-orange-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-500 font-mono">Optional. Leave blank for ongoing prices.</p>
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
                    <span>Save Price</span>
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
