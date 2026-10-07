import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Shirt,
  BarChart3,
  Package,
  FileText,
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
  buildUniformVariantQueryParams,
  buildUniformTransactionQueryParams,
  buildUniformIssueQueryParams,
  buildUniformHistoryQueryParams,
  validateUniformDateRange,
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

  // Stale request tracking (Outlet ref & Monotonically increasing request sequence numbers)
  const activeOutletRef = useRef<string>(outletId);
  const summaryReqSeqRef = useRef<number>(0);
  const inventoryReqSeqRef = useRef<number>(0);
  const ledgerReqSeqRef = useRef<number>(0);
  const issuesReqSeqRef = useRef<number>(0);
  const historyReqSeqRef = useRef<number>(0);

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
  const [isRefreshingActiveTab, setIsRefreshingActiveTab] = useState<boolean>(false);

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

  // 1. Fetch Report Summary & Stock Summary (Overview) -> Promise<boolean>
  const fetchSummaryData = useCallback(
    async (currentOutletId: string): Promise<boolean> => {
      if (!currentOutletId) return false;
      const seq = ++summaryReqSeqRef.current;
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

        // Same-outlet and race condition check
        if (activeOutletRef.current !== currentOutletId || summaryReqSeqRef.current !== seq) {
          return false;
        }

        let hasError = false;
        let errorMessage = '';

        if (sumRes.success && sumRes.data) {
          setReportSummary(sumRes.data);
        } else {
          hasError = true;
          setReportSummary(null);
          errorMessage = getUniformErrorMessage(sumRes.error);
        }

        if (stockRes.success && Array.isArray(stockRes.data)) {
          setStockSummary(stockRes.data);
        } else {
          hasError = true;
          setStockSummary([]);
          if (!errorMessage) {
            errorMessage = getUniformErrorMessage(stockRes.error);
          }
        }

        if (hasError && errorMessage) {
          showFeedback('error', errorMessage);
          return false;
        }

        return true;
      } catch (err) {
        if (activeOutletRef.current === currentOutletId && summaryReqSeqRef.current === seq) {
          setReportSummary(null);
          setStockSummary([]);
          showFeedback('error', getUniformErrorMessage(err));
        }
        return false;
      } finally {
        if (activeOutletRef.current === currentOutletId && summaryReqSeqRef.current === seq) {
          setIsLoadingSummary(false);
        }
      }
    },
    [showFeedback]
  );

  // 2. Fetch Inventory (Items, Variants using backend filter, Stock Summary) -> Promise<boolean>
  const fetchInventoryData = useCallback(
    async (
      currentOutletId: string,
      filters: typeof inventoryFilters
    ): Promise<boolean> => {
      if (!currentOutletId) return false;
      const seq = ++inventoryReqSeqRef.current;
      setIsLoadingInventory(true);

      try {
        const itemQs = buildUniformItemQueryParams({
          category: filters.category,
          status: filters.status,
          search: filters.search,
        });

        // Backend variant filtering with itemId contract
        const varQs = buildUniformVariantQueryParams({
          itemId: filters.selectedItemId,
        });

        const [itemsRes, varRes, stockRes] = await Promise.all([
          apiFetch<HrUniformItem[]>(
            `/api/v1/outlets/${currentOutletId}/hr/uniform/items${itemQs}`
          ),
          apiFetch<HrUniformVariant[]>(
            `/api/v1/outlets/${currentOutletId}/hr/uniform/variants${varQs}`
          ),
          apiFetch<HrUniformStockSummary[]>(
            `/api/v1/outlets/${currentOutletId}/hr/uniform/stock-summary`
          ),
        ]);

        if (activeOutletRef.current !== currentOutletId || inventoryReqSeqRef.current !== seq) {
          return false;
        }

        let hasError = false;
        let errorMessage = '';

        if (itemsRes.success && Array.isArray(itemsRes.data)) {
          setItems(itemsRes.data);
        } else {
          hasError = true;
          setItems([]);
          errorMessage = getUniformErrorMessage(itemsRes.error);
        }

        if (varRes.success && Array.isArray(varRes.data)) {
          setVariants(varRes.data);
        } else {
          hasError = true;
          setVariants([]);
          if (!errorMessage) {
            errorMessage = getUniformErrorMessage(varRes.error);
          }
        }

        if (stockRes.success && Array.isArray(stockRes.data)) {
          setStockSummary(stockRes.data);
        } else {
          hasError = true;
          setStockSummary([]);
          if (!errorMessage) {
            errorMessage = getUniformErrorMessage(stockRes.error);
          }
        }

        if (hasError && errorMessage) {
          showFeedback('error', errorMessage);
          return false;
        }

        return true;
      } catch (err) {
        if (activeOutletRef.current === currentOutletId && inventoryReqSeqRef.current === seq) {
          setItems([]);
          setVariants([]);
          setStockSummary([]);
          showFeedback('error', getUniformErrorMessage(err));
        }
        return false;
      } finally {
        if (activeOutletRef.current === currentOutletId && inventoryReqSeqRef.current === seq) {
          setIsLoadingInventory(false);
        }
      }
    },
    [showFeedback]
  );

  // 3. Fetch Stock Transactions Ledger -> Promise<boolean>
  const fetchLedgerData = useCallback(
    async (
      currentOutletId: string,
      filters: typeof ledgerFilters
    ): Promise<boolean> => {
      if (!currentOutletId) return false;

      // Block invalid date range before calling API
      const dateCheck = validateUniformDateRange(filters.fromDate, filters.toDate);
      if (!dateCheck.isValid) {
        setIsLoadingLedger(false);
        return false;
      }

      const seq = ++ledgerReqSeqRef.current;
      setIsLoadingLedger(true);

      try {
        const qs = buildUniformTransactionQueryParams(filters);
        const res = await apiFetch<HrUniformStockTransaction[]>(
          `/api/v1/outlets/${currentOutletId}/hr/uniform/stock-transactions${qs}`
        );

        if (activeOutletRef.current !== currentOutletId || ledgerReqSeqRef.current !== seq) {
          return false;
        }

        if (!res.success) {
          setTransactions([]);
          showFeedback('error', getUniformErrorMessage(res.error));
          return false;
        }

        setTransactions(Array.isArray(res.data) ? res.data : []);
        return true;
      } catch (err) {
        if (activeOutletRef.current === currentOutletId && ledgerReqSeqRef.current === seq) {
          setTransactions([]);
          showFeedback('error', getUniformErrorMessage(err));
        }
        return false;
      } finally {
        if (activeOutletRef.current === currentOutletId && ledgerReqSeqRef.current === seq) {
          setIsLoadingLedger(false);
        }
      }
    },
    [showFeedback]
  );

  // 4. Fetch Staff Issues -> Promise<boolean>
  const fetchIssuesData = useCallback(
    async (
      currentOutletId: string,
      filters: typeof issueFilters
    ): Promise<boolean> => {
      if (!currentOutletId) return false;

      // Block invalid date range before calling API
      const dateCheck = validateUniformDateRange(filters.fromDate, filters.toDate);
      if (!dateCheck.isValid) {
        setIsLoadingIssues(false);
        return false;
      }

      const seq = ++issuesReqSeqRef.current;
      setIsLoadingIssues(true);

      try {
        const qs = buildUniformIssueQueryParams(filters);
        const res = await apiFetch<HrUniformIssue[]>(
          `/api/v1/outlets/${currentOutletId}/hr/uniform/issues${qs}`
        );

        if (activeOutletRef.current !== currentOutletId || issuesReqSeqRef.current !== seq) {
          return false;
        }

        if (!res.success) {
          setIssues([]);
          showFeedback('error', getUniformErrorMessage(res.error));
          return false;
        }

        setIssues(Array.isArray(res.data) ? res.data : []);
        return true;
      } catch (err) {
        if (activeOutletRef.current === currentOutletId && issuesReqSeqRef.current === seq) {
          setIssues([]);
          showFeedback('error', getUniformErrorMessage(err));
        }
        return false;
      } finally {
        if (activeOutletRef.current === currentOutletId && issuesReqSeqRef.current === seq) {
          setIsLoadingIssues(false);
        }
      }
    },
    [showFeedback]
  );

  // 5. Fetch Staff History -> Promise<boolean>
  const fetchHistoryData = useCallback(
    async (
      currentOutletId: string,
      filters: typeof historyFilters
    ): Promise<boolean> => {
      if (!currentOutletId) return false;

      // Block invalid date range before calling API
      const dateCheck = validateUniformDateRange(filters.fromDate, filters.toDate);
      if (!dateCheck.isValid) {
        setIsLoadingHistory(false);
        return false;
      }

      const seq = ++historyReqSeqRef.current;
      setIsLoadingHistory(true);

      try {
        const qs = buildUniformHistoryQueryParams(filters);
        const res = await apiFetch<HrUniformIssue[]>(
          `/api/v1/outlets/${currentOutletId}/hr/uniform/reports/staff-history${qs}`
        );

        if (activeOutletRef.current !== currentOutletId || historyReqSeqRef.current !== seq) {
          return false;
        }

        if (!res.success) {
          setHistory([]);
          showFeedback('error', getUniformErrorMessage(res.error));
          return false;
        }

        setHistory(Array.isArray(res.data) ? res.data : []);
        return true;
      } catch (err) {
        if (activeOutletRef.current === currentOutletId && historyReqSeqRef.current === seq) {
          setHistory([]);
          showFeedback('error', getUniformErrorMessage(err));
        }
        return false;
      } finally {
        if (activeOutletRef.current === currentOutletId && historyReqSeqRef.current === seq) {
          setIsLoadingHistory(false);
        }
      }
    },
    [showFeedback]
  );

  // 6. Outlet Switching Cleanup
  useEffect(() => {
    if (!outletId) return;

    // Invalidate all active in-flight requests from previous outlet
    summaryReqSeqRef.current++;
    inventoryReqSeqRef.current++;
    ledgerReqSeqRef.current++;
    issuesReqSeqRef.current++;
    historyReqSeqRef.current++;

    // Clear stale state immediately
    setReportSummary(null);
    setStockSummary([]);
    setItems([]);
    setVariants([]);
    setTransactions([]);
    setIssues([]);
    setHistory([]);

    // Reset filters
    setInventoryFilters({ category: '', status: '', search: '', selectedItemId: '' });
    setLedgerFilters({ variantId: '', transactionType: '', fromDate: '', toDate: '' });
    setIssueFilters({ staffId: '', itemId: '', variantId: '', status: '', fromDate: '', toDate: '' });
    setHistoryFilters({ staffId: '', fromDate: '', toDate: '' });
  }, [outletId]);

  // 7. Non-overlapping Single Effect Per Sub-View (Eliminates Duplicate Fetches)
  // Overview
  useEffect(() => {
    if (outletId && subTab === 'overview') {
      fetchSummaryData(outletId);
    }
  }, [outletId, subTab, uniformRefreshKey, fetchSummaryData]);

  // Inventory
  useEffect(() => {
    if (outletId && subTab === 'inventory') {
      fetchInventoryData(outletId, inventoryFilters);
    }
  }, [outletId, subTab, inventoryFilters, uniformRefreshKey, fetchInventoryData]);

  // Stock Ledger
  useEffect(() => {
    if (outletId && subTab === 'ledger') {
      fetchLedgerData(outletId, ledgerFilters);
      // Pre-load items & variants for ledger labels if not loaded
      if (items.length === 0 || variants.length === 0) {
        fetchInventoryData(outletId, { category: '', status: '', search: '', selectedItemId: '' });
      }
    }
  }, [outletId, subTab, ledgerFilters, uniformRefreshKey, fetchLedgerData, fetchInventoryData, items.length, variants.length]);

  // Staff Issues
  useEffect(() => {
    if (outletId && subTab === 'issues') {
      fetchIssuesData(outletId, issueFilters);
      if (items.length === 0 || variants.length === 0) {
        fetchInventoryData(outletId, { category: '', status: '', search: '', selectedItemId: '' });
      }
    }
  }, [outletId, subTab, issueFilters, uniformRefreshKey, fetchIssuesData, fetchInventoryData, items.length, variants.length]);

  // Staff History
  useEffect(() => {
    if (outletId && subTab === 'history') {
      fetchHistoryData(outletId, historyFilters);
    }
  }, [outletId, subTab, historyFilters, uniformRefreshKey, fetchHistoryData]);

  // Asynchronous Refresh Handler (Only shows success on actual completion)
  const handleRefreshClick = async () => {
    if (!outletId || isRefreshingActiveTab) return;
    setIsRefreshingActiveTab(true);

    let success = false;
    if (subTab === 'overview') {
      success = await fetchSummaryData(outletId);
    } else if (subTab === 'inventory') {
      success = await fetchInventoryData(outletId, inventoryFilters);
    } else if (subTab === 'ledger') {
      success = await fetchLedgerData(outletId, ledgerFilters);
    } else if (subTab === 'issues') {
      success = await fetchIssuesData(outletId, issueFilters);
    } else if (subTab === 'history') {
      success = await fetchHistoryData(outletId, historyFilters);
    }

    setIsRefreshingActiveTab(false);
    if (success) {
      showFeedback('success', 'Uniform data refreshed.');
    }
  };

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
            onClick={handleRefreshClick}
            disabled={isRefreshingActiveTab || !outletId}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition flex items-center gap-1.5 text-xs disabled:opacity-50"
            title="Refresh active view"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshingActiveTab ? 'animate-spin text-orange-400' : ''}`}
            />
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
