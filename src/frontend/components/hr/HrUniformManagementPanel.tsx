import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Shirt,
  BarChart3,
  Package,
  FileText,
  Clock,
  History,
  RefreshCw,
} from 'lucide-react';
import type {
  HrStaff,
  HrUniformItem,
  HrUniformVariant,
  HrUniformStockSummary,
  HrUniformStockTransaction,
  HrUniformIssue,
  HrUniformReportSummary,
} from '../../../shared/types';
import { apiFetch } from '../../services/api';
import {
  buildUniformItemQueryParams,
  buildUniformTransactionQueryParams,
  buildUniformIssueQueryParams,
  buildUniformHistoryQueryParams,
  getUniformErrorMessage,
} from './hrUniformUi';
import { HrUniformOverview } from './HrUniformOverview';
import { HrUniformInventoryView } from './HrUniformInventoryView';
import { HrUniformLedgerView } from './HrUniformLedgerView';
import { HrUniformIssuesView } from './HrUniformIssuesView';
import { HrUniformHistoryView } from './HrUniformHistoryView';

export interface HrUniformManagementPanelProps {
  outletId: string;
  staffList: HrStaff[];
  canWriteInventory: boolean;
  canWriteIssue: boolean;
  showFeedback: (type: 'success' | 'error', message: string) => void;
  uniformRefreshKey?: number;
}

export type UniformSubTab = 'overview' | 'inventory' | 'ledger' | 'issues' | 'history';

export const HrUniformManagementPanel: React.FC<HrUniformManagementPanelProps> = ({
  outletId,
  staffList,
  canWriteInventory,
  canWriteIssue,
  showFeedback,
  uniformRefreshKey = 0,
}) => {
  const [subTab, setSubTab] = useState<UniformSubTab>('overview');

  // Stale request tracking
  const activeOutletRef = useRef<string>(outletId);
  useEffect(() => {
    activeOutletRef.current = outletId;
  }, [outletId]);

  // Data States
  const [reportSummary, setReportSummary] = useState<HrUniformReportSummary | null>(null);
  const [stockSummary, setStockSummary] = useState<HrUniformStockSummary[]>([]);
  const [items, setItems] = useState<HrUniformItem[]>([]);
  const [variants, setVariants] = useState<HrUniformVariant[]>([]);
  const [transactions, setTransactions] = useState<HrUniformStockTransaction[]>([]);
  const [issues, setIssues] = useState<HrUniformIssue[]>([]);
  const [history, setHistory] = useState<HrUniformIssue[]>([]);

  // Loading States
  const [isLoadingSummary, setIsLoadingSummary] = useState<boolean>(false);
  const [isLoadingInventory, setIsLoadingInventory] = useState<boolean>(false);
  const [isLoadingLedger, setIsLoadingLedger] = useState<boolean>(false);
  const [isLoadingIssues, setIsLoadingIssues] = useState<boolean>(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Filter States
  const [inventoryFilters, setInventoryFilters] = useState({
    category: '',
    status: '',
    search: '',
    selectedItemId: '',
  });

  const [ledgerFilters, setLedgerFilters] = useState({
    variantId: '',
    transactionType: '',
    fromDate: '',
    toDate: '',
  });

  const [issueFilters, setIssueFilters] = useState({
    staffId: '',
    itemId: '',
    variantId: '',
    status: '',
    fromDate: '',
    toDate: '',
  });

  const [historyFilters, setHistoryFilters] = useState({
    staffId: '',
    fromDate: '',
    toDate: '',
  });

  // Fetch Report Summary & Stock Summary (Overview)
  const fetchSummaryData = useCallback(async (currentOutletId: string) => {
    if (!currentOutletId) return;
    setIsLoadingSummary(true);
    try {
      const [sumRes, stockRes] = await Promise.all([
        apiFetch<HrUniformReportSummary>(
          `/api/v1/outlets/${currentOutletId}/hr/uniform/reports/summary`
        ),
        apiFetch<HrUniformStockSummary[]>(
          `/api/v1/outlets/${currentOutletId}/hr/uniform/stock-summary`
        ),
      ]);

      if (activeOutletRef.current !== currentOutletId) return;

      if (sumRes.success && sumRes.data) {
        setReportSummary(sumRes.data);
      }
      if (stockRes.success && Array.isArray(stockRes.data)) {
        setStockSummary(stockRes.data);
      }
    } catch (err) {
      if (activeOutletRef.current === currentOutletId) {
        showFeedback('error', getUniformErrorMessage(err));
      }
    } finally {
      if (activeOutletRef.current === currentOutletId) {
        setIsLoadingSummary(false);
      }
    }
  }, [showFeedback]);

  // Fetch Inventory (Items, Variants, Stock Summary)
  const fetchInventoryData = useCallback(async (
    currentOutletId: string,
    filters: typeof inventoryFilters
  ) => {
    if (!currentOutletId) return;
    setIsLoadingInventory(true);
    try {
      const qs = buildUniformItemQueryParams({
        category: filters.category,
        status: filters.status,
        search: filters.search,
      });

      const [itemsRes, varRes, stockRes] = await Promise.all([
        apiFetch<HrUniformItem[]>(`/api/v1/outlets/${currentOutletId}/hr/uniform/items${qs}`),
        apiFetch<HrUniformVariant[]>(`/api/v1/outlets/${currentOutletId}/hr/uniform/variants`),
        apiFetch<HrUniformStockSummary[]>(
          `/api/v1/outlets/${currentOutletId}/hr/uniform/stock-summary`
        ),
      ]);

      if (activeOutletRef.current !== currentOutletId) return;

      if (itemsRes.success && Array.isArray(itemsRes.data)) {
        setItems(itemsRes.data);
      }
      if (varRes.success && Array.isArray(varRes.data)) {
        setVariants(varRes.data);
      }
      if (stockRes.success && Array.isArray(stockRes.data)) {
        setStockSummary(stockRes.data);
      }
    } catch (err) {
      if (activeOutletRef.current === currentOutletId) {
        showFeedback('error', getUniformErrorMessage(err));
      }
    } finally {
      if (activeOutletRef.current === currentOutletId) {
        setIsLoadingInventory(false);
      }
    }
  }, [showFeedback]);

  // Fetch Stock Transactions Ledger
  const fetchLedgerData = useCallback(async (
    currentOutletId: string,
    filters: typeof ledgerFilters
  ) => {
    if (!currentOutletId) return;
    setIsLoadingLedger(true);
    try {
      const qs = buildUniformTransactionQueryParams(filters);
      const res = await apiFetch<HrUniformStockTransaction[]>(
        `/api/v1/outlets/${currentOutletId}/hr/uniform/stock-transactions${qs}`
      );

      if (activeOutletRef.current !== currentOutletId) return;

      if (res.success && Array.isArray(res.data)) {
        setTransactions(res.data);
      }
    } catch (err) {
      if (activeOutletRef.current === currentOutletId) {
        showFeedback('error', getUniformErrorMessage(err));
      }
    } finally {
      if (activeOutletRef.current === currentOutletId) {
        setIsLoadingLedger(false);
      }
    }
  }, [showFeedback]);

  // Fetch Staff Issues
  const fetchIssuesData = useCallback(async (
    currentOutletId: string,
    filters: typeof issueFilters
  ) => {
    if (!currentOutletId) return;
    setIsLoadingIssues(true);
    try {
      const qs = buildUniformIssueQueryParams(filters);
      const res = await apiFetch<HrUniformIssue[]>(
        `/api/v1/outlets/${currentOutletId}/hr/uniform/issues${qs}`
      );

      if (activeOutletRef.current !== currentOutletId) return;

      if (res.success && Array.isArray(res.data)) {
        setIssues(res.data);
      }
    } catch (err) {
      if (activeOutletRef.current === currentOutletId) {
        showFeedback('error', getUniformErrorMessage(err));
      }
    } finally {
      if (activeOutletRef.current === currentOutletId) {
        setIsLoadingIssues(false);
      }
    }
  }, [showFeedback]);

  // Fetch Staff History
  const fetchHistoryData = useCallback(async (
    currentOutletId: string,
    filters: typeof historyFilters
  ) => {
    if (!currentOutletId) return;
    setIsLoadingHistory(true);
    try {
      const qs = buildUniformHistoryQueryParams(filters);
      const res = await apiFetch<HrUniformIssue[]>(
        `/api/v1/outlets/${currentOutletId}/hr/uniform/reports/staff-history${qs}`
      );

      if (activeOutletRef.current !== currentOutletId) return;

      if (res.success && Array.isArray(res.data)) {
        setHistory(res.data);
      }
    } catch (err) {
      if (activeOutletRef.current === currentOutletId) {
        showFeedback('error', getUniformErrorMessage(err));
      }
    } finally {
      if (activeOutletRef.current === currentOutletId) {
        setIsLoadingHistory(false);
      }
    }
  }, [showFeedback]);

  // Outlet Switching Cleanup (Instruction 15)
  useEffect(() => {
    if (!outletId) return;

    // Clear stale state immediately
    setReportSummary(null);
    setStockSummary([]);
    setItems([]);
    setVariants([]);
    setTransactions([]);
    setIssues([]);
    setHistory([]);

    setInventoryFilters({ category: '', status: '', search: '', selectedItemId: '' });
    setLedgerFilters({ variantId: '', transactionType: '', fromDate: '', toDate: '' });
    setIssueFilters({ staffId: '', itemId: '', variantId: '', status: '', fromDate: '', toDate: '' });
    setHistoryFilters({ staffId: '', fromDate: '', toDate: '' });

    // Initial load for overview
    fetchSummaryData(outletId);
  }, [outletId, fetchSummaryData]);

  // Load appropriate data when subTab changes or uniformRefreshKey triggers
  useEffect(() => {
    if (!outletId) return;

    if (subTab === 'overview') {
      fetchSummaryData(outletId);
    } else if (subTab === 'inventory') {
      fetchInventoryData(outletId, inventoryFilters);
    } else if (subTab === 'ledger') {
      fetchLedgerData(outletId, ledgerFilters);
      // Ensure variants & items are loaded for ledger labels
      if (variants.length === 0 || items.length === 0) {
        fetchInventoryData(outletId, { category: '', status: '', search: '', selectedItemId: '' });
      }
    } else if (subTab === 'issues') {
      fetchIssuesData(outletId, issueFilters);
      if (variants.length === 0 || items.length === 0) {
        fetchInventoryData(outletId, { category: '', status: '', search: '', selectedItemId: '' });
      }
    } else if (subTab === 'history') {
      fetchHistoryData(outletId, historyFilters);
    }
  }, [
    outletId,
    subTab,
    uniformRefreshKey,
    fetchSummaryData,
    fetchInventoryData,
    fetchLedgerData,
    fetchIssuesData,
    fetchHistoryData,
  ]);

  // Handle inventory filters change
  useEffect(() => {
    if (outletId && subTab === 'inventory') {
      fetchInventoryData(outletId, inventoryFilters);
    }
  }, [outletId, subTab, inventoryFilters, fetchInventoryData]);

  // Handle ledger filters change
  useEffect(() => {
    if (outletId && subTab === 'ledger') {
      fetchLedgerData(outletId, ledgerFilters);
    }
  }, [outletId, subTab, ledgerFilters, fetchLedgerData]);

  // Handle issues filters change
  useEffect(() => {
    if (outletId && subTab === 'issues') {
      fetchIssuesData(outletId, issueFilters);
    }
  }, [outletId, subTab, issueFilters, fetchIssuesData]);

  // Handle history filters change
  useEffect(() => {
    if (outletId && subTab === 'history') {
      fetchHistoryData(outletId, historyFilters);
    }
  }, [outletId, subTab, historyFilters, fetchHistoryData]);

  return (
    <div className="space-y-6">
      {/* Sub-Tabs Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setSubTab('overview')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              subTab === 'overview'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>

          <button
            onClick={() => setSubTab('inventory')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              subTab === 'inventory'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Inventory Master</span>
          </button>

          <button
            onClick={() => setSubTab('ledger')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              subTab === 'ledger'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Stock Ledger</span>
          </button>

          <button
            onClick={() => setSubTab('issues')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              subTab === 'issues'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Shirt className="w-3.5 h-3.5" />
            <span>Staff Issues</span>
          </button>

          <button
            onClick={() => setSubTab('history')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              subTab === 'history'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Staff History</span>
          </button>
        </div>

        {/* Quick Refresh Active Sub-Tab */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={() => {
              if (subTab === 'overview') fetchSummaryData(outletId);
              if (subTab === 'inventory') fetchInventoryData(outletId, inventoryFilters);
              if (subTab === 'ledger') fetchLedgerData(outletId, ledgerFilters);
              if (subTab === 'issues') fetchIssuesData(outletId, issueFilters);
              if (subTab === 'history') fetchHistoryData(outletId, historyFilters);
              showFeedback('success', 'Uniform data refreshed.');
            }}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition flex items-center gap-1.5 text-xs"
            title="Refresh active view"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px] font-medium">Refresh</span>
          </button>
        </div>
      </div>

      {/* Sub-View Content */}
      {subTab === 'overview' && (
        <HrUniformOverview
          summary={reportSummary}
          stockSummary={stockSummary}
          isLoading={isLoadingSummary}
        />
      )}

      {subTab === 'inventory' && (
        <HrUniformInventoryView
          items={items}
          variants={variants}
          stockSummary={stockSummary}
          isLoading={isLoadingInventory}
          filters={inventoryFilters}
          onFilterChange={(k, v) => setInventoryFilters(prev => ({ ...prev, [k]: v }))}
          onClearFilters={() =>
            setInventoryFilters({ category: '', status: '', search: '', selectedItemId: '' })
          }
        />
      )}

      {subTab === 'ledger' && (
        <HrUniformLedgerView
          transactions={transactions}
          variants={variants}
          items={items}
          isLoading={isLoadingLedger}
          filters={ledgerFilters}
          onFilterChange={(k, v) => setLedgerFilters(prev => ({ ...prev, [k]: v }))}
          onClearFilters={() =>
            setLedgerFilters({ variantId: '', transactionType: '', fromDate: '', toDate: '' })
          }
        />
      )}

      {subTab === 'issues' && (
        <HrUniformIssuesView
          issues={issues}
          staffList={staffList}
          items={items}
          variants={variants}
          isLoading={isLoadingIssues}
          filters={issueFilters}
          onFilterChange={(k, v) => setIssueFilters(prev => ({ ...prev, [k]: v }))}
          onClearFilters={() =>
            setIssueFilters({
              staffId: '',
              itemId: '',
              variantId: '',
              status: '',
              fromDate: '',
              toDate: '',
            })
          }
        />
      )}

      {subTab === 'history' && (
        <HrUniformHistoryView
          history={history}
          staffList={staffList}
          isLoading={isLoadingHistory}
          filters={historyFilters}
          onFilterChange={(k, v) => setHistoryFilters(prev => ({ ...prev, [k]: v }))}
          onClearFilters={() =>
            setHistoryFilters({ staffId: '', fromDate: '', toDate: '' })
          }
        />
      )}
    </div>
  );
};
