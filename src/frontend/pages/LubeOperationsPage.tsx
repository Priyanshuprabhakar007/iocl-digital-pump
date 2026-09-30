import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../../shared/constants';
import {
  RetailOutlet,
  OperationalShift,
  LubeSku,
  LubeSkuPrice,
  LubeStockTransaction,
  LubeShiftSale,
  LubeStockSummaryItem,
  LubeShiftSummary,
} from '../../shared/types';
import {
  Package,
  Building2,
  Clock,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Lock,
  Unlock,
  ShieldAlert,
} from 'lucide-react';
import { LubeSkuPanel } from '../components/lube/LubeSkuPanel';
import { LubePricePanel } from '../components/lube/LubePricePanel';
import { LubeInventoryPanel } from '../components/lube/LubeInventoryPanel';
import { LubeTransactionsPanel } from '../components/lube/LubeTransactionsPanel';
import { LubeSalesPanel } from '../components/lube/LubeSalesPanel';
import { LubeDailySummaryPanel } from '../components/lube/LubeDailySummaryPanel';
import { LubeSummaryPanel } from '../components/lube/LubeSummaryPanel';

export const LubeOperationsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canRead = hasPermission(PERMISSIONS.LUBE_OPERATIONS_READ);

  const [outlets, setOutlets] = useState<RetailOutlet[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');
  const [loadingOutlets, setLoadingOutlets] = useState(true);

  const [shiftsList, setShiftsList] = useState<OperationalShift[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<OperationalShift | null>(null);
  const [loadingShifts, setLoadingShifts] = useState(false);

  // Lube state
  const [skus, setSkus] = useState<LubeSku[]>([]);
  const [prices, setPrices] = useState<LubeSkuPrice[]>([]);
  const [stockSummary, setStockSummary] = useState<LubeStockSummaryItem[]>([]);
  const [lowStockItems, setLowStockItems] = useState<LubeStockSummaryItem[]>([]);
  const [transactions, setTransactions] = useState<LubeStockTransaction[]>([]);
  const [sales, setSales] = useState<LubeShiftSale[]>([]);
  const [shiftSummary, setShiftSummary] = useState<LubeShiftSummary | null>(null);

  const [loadingData, setLoadingData] = useState(false);
  const [activeTab, setActiveTab] = useState<'sales' | 'summary' | 'inventory' | 'skus' | 'prices' | 'transactions' | 'daily'>('sales');

  // Action feedback
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Auto clear success message after 5 seconds
  useEffect(() => {
    if (actionSuccess) {
      const timer = setTimeout(() => setActionSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [actionSuccess]);

  // Load Outlets on Mount
  useEffect(() => {
    const loadOutlets = async () => {
      setLoadingOutlets(true);
      try {
        const res = await apiFetch<RetailOutlet[]>('/api/v1/outlets');
        if (res.success && res.data && res.data.length > 0) {
          setOutlets(res.data);
          setSelectedOutletId(res.data[0].id);
        } else {
          setOutlets([]);
        }
      } catch (err: any) {
        setActionError(err.message || 'Failed to load retail outlets');
      } finally {
        setLoadingOutlets(false);
      }
    };

    if (canRead) {
      loadOutlets();
    }
  }, [canRead]);

  // Load Shifts when Outlet Changes
  useEffect(() => {
    if (!selectedOutletId) {
      setShiftsList([]);
      setSelectedShiftId('');
      setSelectedShift(null);
      return;
    }

    const loadShifts = async () => {
      setLoadingShifts(true);
      setActionError(null);
      try {
        const res = await apiFetch<OperationalShift[]>(`/api/v1/outlets/${selectedOutletId}/shifts`);
        if (res.success && res.data) {
          setShiftsList(res.data);
          if (res.data.length > 0) {
            setSelectedShiftId(res.data[0].id);
          } else {
            setSelectedShiftId('');
            setSelectedShift(null);
            setSales([]);
            setShiftSummary(null);
          }
        }
      } catch (err: any) {
        setActionError(err.message || 'Failed to load operational shifts');
      } finally {
        setLoadingShifts(false);
      }
    };

    loadShifts();
  }, [selectedOutletId]);

  // Main data fetching function
  const loadOutletLubeData = async () => {
    if (!selectedOutletId) return;

    setLoadingData(true);
    setActionError(null);

    try {
      const promises: Promise<any>[] = [
        apiFetch<LubeSku[]>(`/api/v1/outlets/${selectedOutletId}/lube/skus`),
        apiFetch<LubeSkuPrice[]>(`/api/v1/outlets/${selectedOutletId}/lube/prices`),
        apiFetch<LubeStockSummaryItem[]>(`/api/v1/outlets/${selectedOutletId}/lube/stock-summary`),
        apiFetch<LubeStockSummaryItem[]>(`/api/v1/outlets/${selectedOutletId}/lube/low-stock`),
        apiFetch<LubeStockTransaction[]>(`/api/v1/outlets/${selectedOutletId}/lube/stock-transactions`),
      ];

      if (selectedShiftId) {
        promises.push(apiFetch<OperationalShift>(`/api/v1/shifts/${selectedShiftId}`));
        promises.push(apiFetch<LubeShiftSale[]>(`/api/v1/shifts/${selectedShiftId}/lube-sales`));
        promises.push(apiFetch<LubeShiftSummary>(`/api/v1/shifts/${selectedShiftId}/lube-summary`));
      }

      const results = await Promise.all(promises);

      if (results[0].success) setSkus(results[0].data);
      if (results[1].success) setPrices(results[1].data);
      if (results[2].success) setStockSummary(results[2].data);
      if (results[3].success) setLowStockItems(results[3].data);
      if (results[4].success) setTransactions(results[4].data);

      if (selectedShiftId && results[5]) {
        if (results[5].success) setSelectedShift(results[5].data);
        if (results[6].success) setSales(results[6].data);
        if (results[7].success) setShiftSummary(results[7].data);
      } else {
        setSelectedShift(null);
        setSales([]);
        setShiftSummary(null);
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to load outlet lube metrics');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadOutletLubeData();
  }, [selectedOutletId, selectedShiftId]);

  const handleRefresh = async () => {
    await loadOutletLubeData();
  };

  const selectedOutlet = outlets.find((o) => o.id === selectedOutletId);

  if (!canRead) {
    return (
      <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl max-w-xl mx-auto my-12 space-y-3">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-white">Access Restricted</h2>
        <p className="text-xs text-slate-400">
          You do not have permission (<code className="font-mono text-orange-400">lube_operations.read</code>) to view Lube Operations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Context Selectors */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 p-5 bg-slate-900 border border-slate-800 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500 shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Lube & Auxiliary Inventory</h2>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Lube Workspace</span>
              <span aria-hidden="true" className="text-slate-700">·</span>
              <span>Authoritative Shift Reconciliations</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Outlet Selector */}
          <div className="relative">
            <Building2 className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <select
              value={selectedOutletId}
              onChange={(e) => setSelectedOutletId(e.target.value)}
              disabled={loadingOutlets || loadingShifts || loadingData}
              className="pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 text-white rounded-lg text-xs font-semibold focus:outline-none focus:border-orange-500 w-52 disabled:opacity-50"
            >
              {loadingOutlets ? (
                <option>Loading outlets...</option>
              ) : outlets.length === 0 ? (
                <option>No outlets accessible</option>
              ) : (
                outlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Shift Selector */}
          <div className="relative">
            <Clock className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <select
              value={selectedShiftId}
              onChange={(e) => setSelectedShiftId(e.target.value)}
              disabled={loadingOutlets || loadingShifts || loadingData || shiftsList.length === 0}
              className="pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 text-white rounded-lg text-xs font-semibold focus:outline-none focus:border-orange-500 w-56 disabled:opacity-50 font-mono"
            >
              {loadingShifts ? (
                <option>Loading shifts...</option>
              ) : shiftsList.length === 0 ? (
                <option>No operational shifts</option>
              ) : (
                shiftsList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.businessDate} · Shift {s.shiftTemplateId.split('-').pop()?.toUpperCase()} ({s.status})
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            onClick={handleRefresh}
            disabled={loadingData}
            className="p-2 text-slate-400 hover:text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Global Status/Context Banner */}
      {selectedShift && (
        <div className={`p-4 rounded-xl flex items-center justify-between border text-xs ${
          selectedShift.status === 'OPEN'
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-slate-950 border-slate-800 text-slate-400'
        }`}>
          <div className="flex items-center gap-2.5">
            {selectedShift.status === 'OPEN' ? (
              <Unlock className="w-4 h-4 shrink-0 text-emerald-500" />
            ) : (
              <Lock className="w-4 h-4 shrink-0 text-slate-500" />
            )}
            <div>
              <span className="font-bold uppercase tracking-wider font-mono mr-1.5">{selectedShift.status}</span>
              <span>
                {selectedShift.status === 'OPEN'
                  ? 'Shift is fully active. You can record, edit or delete shift lube sales.'
                  : 'This shift is closed or in the process of closing. Sales records are locked/read-only.'}
              </span>
            </div>
          </div>
          <div className="hidden sm:block font-mono text-[10px] text-slate-500 uppercase tracking-wide">
            ID: {selectedShift.id}
          </div>
        </div>
      )}

      {/* Global Toast Alerts */}
      {actionError && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/25 rounded-2xl flex items-start gap-3 text-rose-500 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-bold tracking-tight">Operation Failed</h4>
            <p className="mt-0.5">{actionError}</p>
          </div>
          <button onClick={() => setActionError(null)} className="text-rose-500/60 hover:text-rose-500 font-bold font-mono">Dismiss</button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl flex items-start gap-3 text-emerald-400 text-xs">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-bold tracking-tight">Operation Successful</h4>
            <p className="mt-0.5">{actionSuccess}</p>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-400/60 hover:text-emerald-400 font-bold font-mono">Dismiss</button>
        </div>
      )}

      {/* Segmented Workspace Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-900 rounded-xl overflow-x-auto">
        <button
          onClick={() => setActiveTab('sales')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
            activeTab === 'sales'
              ? 'bg-slate-900 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Shift Sales Log
        </button>
        <button
          onClick={() => setActiveTab('summary')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
            activeTab === 'summary'
              ? 'bg-slate-900 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Shift Summary
        </button>
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
            activeTab === 'inventory'
              ? 'bg-slate-900 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Inventory Stock
        </button>
        <button
          onClick={() => setActiveTab('skus')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
            activeTab === 'skus'
              ? 'bg-slate-900 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          SKU Catalog
        </button>
        <button
          onClick={() => setActiveTab('prices')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
            activeTab === 'prices'
              ? 'bg-slate-900 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Selling Prices
        </button>
        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
            activeTab === 'transactions'
              ? 'bg-slate-900 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Transaction Ledger
        </button>
        <button
          onClick={() => setActiveTab('daily')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
            activeTab === 'daily'
              ? 'bg-slate-900 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Daily Summary
        </button>
      </div>

      {/* Main Tab Viewports */}
      <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl">
        {activeTab === 'sales' && (
          <LubeSalesPanel
            shift={selectedShift}
            skus={skus}
            sales={sales}
            loading={loadingData}
            onRefresh={handleRefresh}
            setError={setActionError}
            setSuccess={setActionSuccess}
          />
        )}
        {activeTab === 'summary' && (
          <LubeSummaryPanel
            shift={selectedShift}
            shiftSummary={shiftSummary}
            loading={loadingData}
            onRefresh={handleRefresh}
          />
        )}
        {activeTab === 'inventory' && (
          <LubeInventoryPanel
            stockSummary={stockSummary}
            lowStockItems={lowStockItems}
            loading={loadingData}
            onRefresh={handleRefresh}
          />
        )}
        {activeTab === 'skus' && (
          <LubeSkuPanel
            outletId={selectedOutletId}
            skus={skus}
            loading={loadingData}
            onRefresh={handleRefresh}
            setError={setActionError}
            setSuccess={setActionSuccess}
          />
        )}
        {activeTab === 'prices' && (
          <LubePricePanel
            outletId={selectedOutletId}
            skus={skus}
            prices={prices}
            loading={loadingData}
            onRefresh={handleRefresh}
            setError={setActionError}
            setSuccess={setActionSuccess}
          />
        )}
        {activeTab === 'transactions' && (
          <LubeTransactionsPanel
            outletId={selectedOutletId}
            skus={skus}
            transactions={transactions}
            loading={loadingData}
            onRefresh={handleRefresh}
            setError={setActionError}
            setSuccess={setActionSuccess}
          />
        )}
        {activeTab === 'daily' && (
          <LubeDailySummaryPanel
            outletId={selectedOutletId}
            defaultDate={selectedShift?.businessDate || new Date().toISOString().split('T')[0]}
          />
        )}
      </div>
    </div>
  );
};
export default LubeOperationsPage;
