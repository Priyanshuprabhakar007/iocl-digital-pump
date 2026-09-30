import React, { useState } from 'react';
import { LubeSku, LubeShiftSale, OperationalShift } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { PERMISSIONS } from '../../../shared/constants';
import { useAuth } from '../../context/AuthContext';
import { Plus, Edit2, Trash2, AlertCircle, RefreshCw, X, Lock, ShoppingBag } from 'lucide-react';

interface LubeSalesPanelProps {
  shift: OperationalShift | null;
  skus: LubeSku[];
  sales: LubeShiftSale[];
  loading: boolean;
  onRefresh: () => void;
  setError: (msg: string | null) => void;
  setSuccess: (msg: string | null) => void;
}

export const LubeSalesPanel: React.FC<LubeSalesPanelProps> = ({
  shift,
  skus,
  sales,
  loading,
  onRefresh,
  setError,
  setSuccess,
}) => {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission(PERMISSIONS.LUBE_SALES_WRITE);
  const isShiftOpen = shift?.status === 'OPEN';

  const activeSkus = skus.filter(s => s.status === 'ACTIVE');

  const [showModal, setShowModal] = useState(false);
  const [editingSale, setEditingSale] = useState<LubeShiftSale | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null);

  // Form states
  const [lubeSkuId, setLubeSkuId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [localFormError, setLocalFormError] = useState<string | null>(null);

  const openCreateModal = () => {
    if (!shift || !isShiftOpen || activeSkus.length === 0) return;
    setEditingSale(null);
    setLubeSkuId(activeSkus[0]?.id || '');
    setQuantity('');
    setNotes('');
    setLocalFormError(null);
    setShowModal(true);
  };

  const openEditModal = (sale: LubeShiftSale) => {
    if (!isShiftOpen) return;
    setEditingSale(sale);
    setLubeSkuId(sale.lubeSkuId);
    setQuantity(sale.quantity);
    setNotes(sale.notes || '');
    setLocalFormError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shift) return setLocalFormError('No active operational shift selected');
    if (!lubeSkuId) return setLocalFormError('SKU is required');
    if (!quantity.trim() || isNaN(Number(quantity))) return setLocalFormError('Quantity must be a valid number');

    setSubmitting(true);
    setLocalFormError(null);

    try {
      if (editingSale) {
        // PUT /api/v1/lube-sales/:id
        const res = await apiFetch(`/api/v1/lube-sales/${editingSale.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            quantity: quantity.trim(),
            notes: notes.trim() || null,
          }),
        });

        if (res.success) {
          setSuccess('Lube shift sale updated successfully.');
          setShowModal(false);
          onRefresh();
        } else {
          setLocalFormError(res.error?.message || 'Failed to update sale record');
        }
      } else {
        // POST /api/v1/shifts/:shiftId/lube-sales
        const res = await apiFetch(`/api/v1/shifts/${shift.id}/lube-sales`, {
          method: 'POST',
          body: JSON.stringify({
            lubeSkuId,
            quantity: quantity.trim(),
            soldAt: new Date().toISOString(),
            notes: notes.trim() || null,
          }),
        });

        if (res.success) {
          setSuccess('Lube shift sale recorded successfully.');
          setShowModal(false);
          onRefresh();
        } else {
          setLocalFormError(res.error?.message || 'Failed to record shift sale');
        }
      }
    } catch (err: any) {
      setLocalFormError(err.message || 'An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (saleId: string) => {
    if (!isShiftOpen) return;
    if (!window.confirm('Are you sure you want to delete this recorded lube shift sale? This will restore the stock immediately.')) {
      return;
    }

    setDeletingSaleId(saleId);
    setError(null);

    try {
      // DELETE /api/v1/lube-sales/:id
      const res = await apiFetch(`/api/v1/lube-sales/${saleId}`, {
        method: 'DELETE',
      });

      if (res.success) {
        setSuccess('Lube shift sale deleted and stock restored successfully.');
        onRefresh();
      } else {
        setError(res.error?.message || 'Failed to delete sale record');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setDeletingSaleId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">Shift Sales Records</h3>
          <p className="text-xs text-slate-400 mt-0.5">Recorded lube sales during the active operational shift</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canWrite && shift && isShiftOpen && (
            activeSkus.length > 0 ? (
              <button
                onClick={openCreateModal}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-600 rounded-lg hover:from-orange-600 hover:to-amber-700 transition-all shadow-md shadow-orange-500/10"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Record Sale</span>
              </button>
            ) : skus.length > 0 ? (
              <span className="text-xs text-amber-500 font-medium bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg">
                No active Lube SKUs available
              </span>
            ) : null
          )}
        </div>
      </div>

      {!shift ? (
        <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl space-y-2">
          <Lock className="w-8 h-8 text-slate-500 mx-auto" />
          <h4 className="text-sm font-semibold text-white">No Shift Selected</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Please select an operational shift from the header context to view or record sales.
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
        </div>
      ) : sales.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl space-y-3">
          <ShoppingBag className="w-8 h-8 text-slate-500 mx-auto" />
          <h4 className="text-sm font-semibold text-white">No Sales Logged</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            No lube sales have been recorded for this operational shift yet.
          </p>
          {canWrite && isShiftOpen && (
            activeSkus.length > 0 ? (
              <button
                onClick={openCreateModal}
                className="px-4 py-2 text-xs font-bold text-white bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-lg transition-all mt-2"
              >
                Record First Sale
              </button>
            ) : skus.length > 0 ? (
              <p className="text-xs text-amber-500 font-semibold mt-2">
                No active Lube SKUs are available for sale.
              </p>
            ) : null
          )}
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">SKU Code</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4 text-right">Qty</th>
                <th className="py-3 px-4 text-right">Unit Price</th>
                <th className="py-3 px-4 text-right">Revenue</th>
                <th className="py-3 px-4">Timestamp</th>
                {canWrite && isShiftOpen && <th className="py-3 px-4 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-xs">
              {sales.map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-800/40 text-slate-300">
                  <td className="py-3 px-4 font-mono font-bold text-white">{sale.skuCode}</td>
                  <td className="py-3 px-4 font-medium text-slate-100">{sale.skuName}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-100 tabular-nums">
                    {sale.quantity} <span className="text-[10px] text-slate-500 font-normal">{sale.stockUnit}</span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-300 tabular-nums">
                    ₹{sale.unitPriceStr}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-extrabold text-orange-400 tabular-nums">
                    ₹{sale.revenueStr}
                  </td>
                  <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                    {new Date(sale.soldAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  {canWrite && isShiftOpen && (
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => openEditModal(sale)}
                          className="p-1 text-slate-400 hover:text-orange-500 hover:bg-slate-800 rounded-md transition-all inline-flex items-center"
                          title="Edit Sale"
                          disabled={deletingSaleId === sale.id}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(sale.id)}
                          className="p-1 text-slate-400 hover:text-rose-500 hover:bg-slate-800 rounded-md transition-all inline-flex items-center"
                          title="Delete Sale / Restore Stock"
                          disabled={deletingSaleId === sale.id}
                        >
                          {deletingSaleId === sale.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
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
                {editingSale ? 'Edit Lube Sale Record' : 'Record Shift Lube Sale'}
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
                <label className="block text-slate-400 font-medium">Select Lube SKU</label>
                <select
                  value={lubeSkuId}
                  onChange={(e) => setLubeSkuId(e.target.value)}
                  disabled={!!editingSale || submitting}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-white rounded-lg focus:outline-none focus:border-orange-500 disabled:opacity-50"
                  required
                >
                  {(editingSale ? skus : activeSkus).map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.skuCode}) [{s.stockUnit}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 font-medium">Quantity to Sell</label>
                <input
                  type="text"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  disabled={submitting}
                  placeholder="e.g. 2 or 1.500"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-white rounded-lg focus:outline-none focus:border-orange-500 font-mono"
                  required
                />
                <p className="text-[10px] text-slate-500 font-mono">
                  Selling unit must match the SKU stock unit. Unit price is snapshots of current active selling price automatically.
                </p>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 font-medium">Customer Notes (optional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={submitting}
                  placeholder="e.g. Customer vehicle number / credit receipt reference"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-white rounded-lg focus:outline-none focus:border-orange-500"
                />
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
                      <span>Recording...</span>
                    </>
                  ) : (
                    <span>Record Sale</span>
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
