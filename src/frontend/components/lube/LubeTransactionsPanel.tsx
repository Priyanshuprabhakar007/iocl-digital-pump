import React, { useState } from 'react';
import { LubeSku, LubeStockTransaction, LubeStockTransactionType } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { PERMISSIONS } from '../../../shared/constants';
import { useAuth } from '../../context/AuthContext';
import { Plus, AlertCircle, RefreshCw, X, Calendar, Clipboard } from 'lucide-react';

interface LubeTransactionsPanelProps {
  outletId: string;
  skus: LubeSku[];
  transactions: LubeStockTransaction[];
  loading: boolean;
  onRefresh: () => void;
  setError: (msg: string | null) => void;
  setSuccess: (msg: string | null) => void;
}

export const LubeTransactionsPanel: React.FC<LubeTransactionsPanelProps> = ({
  outletId,
  skus,
  transactions,
  loading,
  onRefresh,
  setError,
  setSuccess,
}) => {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission(PERMISSIONS.LUBE_INVENTORY_WRITE);

  const activeSkus = skus.filter(s => s.status === 'ACTIVE');

  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [lubeSkuId, setLubeSkuId] = useState('');
  const [transactionType, setTransactionType] = useState<LubeStockTransactionType>('RECEIPT');
  const [quantity, setQuantity] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [localFormError, setLocalFormError] = useState<string | null>(null);

  const openCreateModal = () => {
    if (activeSkus.length === 0) return;
    setLubeSkuId(activeSkus[0]?.id || '');
    setTransactionType('RECEIPT');
    setQuantity('');
    setReferenceNumber('');
    setNotes('');
    setLocalFormError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lubeSkuId) return setLocalFormError('Lube SKU is required');
    if (!quantity.trim() || isNaN(Number(quantity))) return setLocalFormError('Quantity must be a valid number');
    if ((transactionType === 'ADJUSTMENT_IN' || transactionType === 'ADJUSTMENT_OUT') && !notes.trim()) {
      return setLocalFormError('Notes/reason are required for stock adjustments');
    }

    setSubmitting(true);
    setLocalFormError(null);

    try {
      // POST /api/v1/outlets/:outletId/lube/stock-transactions
      const res = await apiFetch(`/api/v1/outlets/${outletId}/lube/stock-transactions`, {
        method: 'POST',
        body: JSON.stringify({
          lubeSkuId,
          transactionType,
          quantity: quantity.trim(),
          occurredAt: new Date().toISOString(),
          referenceNumber: referenceNumber.trim() || null,
          notes: notes.trim() || null,
        }),
      });

      if (res.success) {
        setSuccess('Stock transaction recorded successfully.');
        setShowModal(false);
        onRefresh();
      } else {
        setLocalFormError(res.error?.message || 'Failed to record transaction');
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

  const formatTxType = (type: LubeStockTransactionType) => {
    switch (type) {
      case 'OPENING_BALANCE': return 'Opening Balance';
      case 'RECEIPT': return 'Stock Receipt';
      case 'ADJUSTMENT_IN': return 'Adjustment In';
      case 'ADJUSTMENT_OUT': return 'Adjustment Out';
      default: return type;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">Stock Transactions Ledger</h3>
          <p className="text-xs text-slate-400 mt-0.5">Historical ledger of all receipts, opening balances, and manual inventory adjustments</p>
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
            activeSkus.length > 0 ? (
              <button
                onClick={openCreateModal}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-600 rounded-lg hover:from-orange-600 hover:to-amber-700 transition-all shadow-md shadow-orange-500/10"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Record Transaction</span>
              </button>
            ) : skus.length > 0 ? (
              <span className="text-xs text-amber-500 font-medium bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg">
                No active Lube SKUs available for transactions
              </span>
            ) : null
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl space-y-3">
          <Clipboard className="w-8 h-8 text-slate-500 mx-auto" />
          <h4 className="text-sm font-semibold text-white">No Transactions Recorded</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Log receipts or adjustments to populate the inventory transaction ledger.
          </p>
          {canWrite && (
            activeSkus.length > 0 ? (
              <button
                onClick={openCreateModal}
                className="px-4 py-2 text-xs font-bold text-white bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-lg transition-all mt-2"
              >
                Record First Transaction
              </button>
            ) : skus.length > 0 ? (
              <p className="text-xs text-amber-500 font-semibold mt-2">
                No active Lube SKUs are available for transactions.
              </p>
            ) : null
          )}
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-right">Quantity</th>
                <th className="py-3 px-4">Reference No.</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Notes / Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-xs">
              {transactions.map((tx) => {
                const sku = skus.find(s => s.id === tx.lubeSkuId);
                const unit = sku ? sku.stockUnit : '';
                return (
                  <tr key={tx.id} className="hover:bg-slate-800/40 text-slate-300">
                    <td className="py-3 px-4 font-medium text-slate-100">{getSkuNameAndCode(tx.lubeSkuId)}</td>
                    <td className="py-3 px-4">
                      <span className={`text-[11px] font-medium font-mono uppercase ${
                        tx.transactionType === 'RECEIPT' || tx.transactionType === 'ADJUSTMENT_IN' ? 'text-emerald-500' :
                        tx.transactionType === 'ADJUSTMENT_OUT' ? 'text-rose-500' : 'text-slate-400'
                      }`}>
                        {formatTxType(tx.transactionType)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-white tabular-nums">
                      {tx.transactionType === 'ADJUSTMENT_OUT' ? '-' : '+'}{tx.quantity} <span className="text-[10px] text-slate-500 font-normal">{unit}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">{tx.referenceNumber || <span className="text-slate-600 italic">none</span>}</td>
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                      {new Date(tx.occurredAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="py-3 px-4 text-slate-400 font-medium truncate max-w-xs" title={tx.notes || ''}>
                      {tx.notes || <span className="text-slate-600 italic">none</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Record Inventory Transaction</h3>
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
                  disabled={submitting}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-white rounded-lg focus:outline-none focus:border-orange-500"
                  required
                >
                  {activeSkus.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.skuCode}) [{s.stockUnit}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-slate-400 font-medium">Transaction Type</label>
                  <select
                    value={transactionType}
                    onChange={(e) => setTransactionType(e.target.value as LubeStockTransactionType)}
                    disabled={submitting}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-white rounded-lg focus:outline-none focus:border-orange-500"
                  >
                    <option value="RECEIPT">Stock Receipt (Purchase)</option>
                    <option value="OPENING_BALANCE">Opening Balance</option>
                    <option value="ADJUSTMENT_IN">Manual Adjustment In (+)</option>
                    <option value="ADJUSTMENT_OUT">Manual Adjustment Out (-)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-400 font-medium">Quantity</label>
                  <input
                    type="text"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    disabled={submitting}
                    placeholder="e.g. 50 or 15.500"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-white rounded-lg focus:outline-none focus:border-orange-500 font-mono"
                    required
                  />
                  <p className="text-[10px] text-slate-500 font-mono">
                    Must align with selected SKU stock unit.
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 font-medium">Reference Number (optional)</label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  disabled={submitting}
                  placeholder="e.g. Invoice # / Delivery Challan ID"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-white rounded-lg focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 font-medium">
                  Notes / Reason
                  {(transactionType === 'ADJUSTMENT_IN' || transactionType === 'ADJUSTMENT_OUT') && <span className="text-rose-500 ml-0.5">*</span>}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={submitting}
                  placeholder="Notes, reasons or extra details..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-white rounded-lg focus:outline-none focus:border-orange-500 h-20 resize-none"
                  required={transactionType === 'ADJUSTMENT_IN' || transactionType === 'ADJUSTMENT_OUT'}
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
                    <span>Record Stock Movement</span>
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
