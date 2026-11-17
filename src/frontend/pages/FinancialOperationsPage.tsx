import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  RetailOutlet,
  OperationalShift,
  ProductPrice,
  CreditParty,
  ShiftCollection,
  CashHandover,
  BankDeposit,
  ShiftFinancialSummary,
  Product,
  OutletProduct,
  CollectionType
} from '../../shared/types';
import {
  Banknote,
  Building2,
  Clock,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Wallet,
  Landmark,
  ShieldCheck,
  AlertTriangle,
  ArrowUpRight,
  TrendingUp,
  FileText,
  UserPlus,
  History,
  Lock,
  ChevronRight,
  Trash2,
  CheckCircle,
  XCircle,
  Camera,
  Info
} from 'lucide-react';
import { formatPaiseToMoney } from '../../shared/financialUtils';
import { PERMISSIONS } from '../../shared/constants';

import { useActiveOutlet } from '../context/ActiveOutletContext';
import { getLocalDateInputValue } from '../../shared/utils/dateUtils';
import './financialReportsModern.css';

export const FinancialOperationsPage: React.FC = () => {
  const { userCtx, hasPermission } = useAuth();
  const { activeOutletId, accessibleOutlets: outlets, loading: loadingOutlets, setActiveOutletId } = useActiveOutlet();
  const selectedOutletId = activeOutletId || '';
  const setSelectedOutletId = setActiveOutletId;

  const [shiftsList, setShiftsList] = useState<OperationalShift[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<OperationalShift | null>(null);

  const [activeTab, setActiveTab] = useState<'collections' | 'credit-parties' | 'handovers' | 'deposits' | 'prices' | 'reconciliation'>('collections');

  const [products, setProducts] = useState<Product[]>([]);
  const [outletProducts, setOutletProducts] = useState<OutletProduct[]>([]);
  const [prices, setPrices] = useState<ProductPrice[]>([]);
  const [creditParties, setCreditParties] = useState<CreditParty[]>([]);
  const [collections, setCollections] = useState<ShiftCollection[]>([]);
  const [handovers, setHandovers] = useState<CashHandover[]>([]);
  const [deposits, setDeposits] = useState<BankDeposit[]>([]);
  const [summary, setSummary] = useState<ShiftFinancialSummary | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modals
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [showEditPriceModal, setShowEditPriceModal] = useState(false);
  const [editingPrice, setEditingPrice] = useState<ProductPrice | null>(null);
  const [showPartyModal, setShowPartyModal] = useState(false);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [varianceReason, setVarianceReason] = useState('');

  // Load shifts for selected outlet
  useEffect(() => {
    if (!selectedOutletId) return;
    const loadShifts = async () => {
      const res = await apiFetch<OperationalShift[]>(`/api/v1/outlets/${selectedOutletId}/shifts`);
      if (res.success && res.data) {
        setShiftsList(res.data);
        if (res.data.length > 0 && !selectedShiftId) {
          setSelectedShiftId(res.data[0].id);
        }
      }
    };
    loadShifts();
  }, [selectedOutletId]);

  const refreshData = async () => {
    if (!selectedOutletId) return;
    setLoadingData(true);
    setActionError(null);

    const promises: Promise<any>[] = [];
    
    // Master data
    promises.push(apiFetch<ProductPrice[]>(`/api/v1/outlets/${selectedOutletId}/product-prices`));
    promises.push(apiFetch<CreditParty[]>(`/api/v1/outlets/${selectedOutletId}/credit-parties`));
    promises.push(apiFetch<OutletProduct[]>(`/api/v1/outlets/${selectedOutletId}/products`));

    if (selectedShiftId) {
      promises.push(apiFetch<OperationalShift>(`/api/v1/shifts/${selectedShiftId}`));
      promises.push(apiFetch<ShiftCollection[]>(`/api/v1/shifts/${selectedShiftId}/collections`));
      promises.push(apiFetch<CashHandover[]>(`/api/v1/shifts/${selectedShiftId}/cash-handovers`));
      promises.push(apiFetch<BankDeposit[]>(`/api/v1/shifts/${selectedShiftId}/bank-deposits`));
      promises.push(apiFetch<ShiftFinancialSummary>(`/api/v1/shifts/${selectedShiftId}/financial-summary`));
    }

    const results = await Promise.all(promises);
    
    if (results[0].success) setPrices(results[0].data);
    if (results[1].success) setCreditParties(results[1].data);
    if (results[2].success && results[2].data) {
      setOutletProducts(results[2].data);
      const activeMapped = results[2].data
        .filter((op: OutletProduct) => op.status === 'ACTIVE' && op.product && op.product.status === 'ACTIVE')
        .map((op: OutletProduct) => op.product)
        .filter((p: Product) => p && ((p.unit === 'LITRE' && p.category !== 'CNG') || (p.category === 'CNG' && p.unit === 'KG')));
      setProducts(activeMapped);
    }

    if (selectedShiftId && results[3]) {
      if (results[3].success) setSelectedShift(results[3].data);
      if (results[4].success) setCollections(results[4].data);
      if (results[5].success) setHandovers(results[5].data);
      if (results[6].success) setDeposits(results[6].data);
      if (results[7].success) setSummary(results[7].data);
    }

    setLoadingData(false);
  };

  const handleUpdatePrice = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingPrice) return;
    const formData = new FormData(e.currentTarget);
    const res = await apiFetch(`/api/v1/product-prices/${editingPrice.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        productId: editingPrice.productId,
        pricePaisePerUnit: formData.get('price'),
        effectiveFrom: formData.get('effectiveFrom'),
        effectiveTo: formData.get('effectiveTo') || null,
      }),
    });
    if (res.success) {
      setActionSuccess('Product price updated successfully');
      setShowEditPriceModal(false);
      setEditingPrice(null);
      refreshData();
    } else {
      setActionError(res.error?.message || 'Failed to update product price');
    }
  };

  useEffect(() => {
    refreshData();
  }, [selectedOutletId, selectedShiftId]);

  const handleCreateCollection = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      collectionType: formData.get('collectionType'),
      amount: formData.get('amount'),
      creditPartyId: formData.get('creditPartyId') || null,
      provider: formData.get('provider') || null,
      referenceNumber: formData.get('referenceNumber') || null,
      collectedAt: new Date().toISOString(),
      notes: formData.get('notes') || null,
    };

    const res = await apiFetch(`/api/v1/shifts/${selectedShiftId}/collections`, {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (res.success) {
      setActionSuccess('Collection recorded');
      setShowCollectionModal(false);
      refreshData();
    } else {
      setActionError(res.error?.message || 'Failed to record collection');
    }
  };

  const handleCreateHandover = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      amount: formData.get('amount'),
      handedOverAt: new Date().toISOString(),
      notes: formData.get('notes') || null,
    };

    const res = await apiFetch(`/api/v1/shifts/${selectedShiftId}/cash-handovers`, {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (res.success) {
      setActionSuccess('Handover recorded');
      setShowHandoverModal(false);
      refreshData();
    } else {
      setActionError(res.error?.message || 'Failed to record handover');
    }
  };

  const handleCreateDeposit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      depositChannel: formData.get('depositChannel'),
      amount: formData.get('amount'),
      depositDate: formData.get('depositDate'),
      referenceNumber: formData.get('referenceNumber') || null,
      documentId: formData.get('documentId') || null,
    };

    const res = await apiFetch(`/api/v1/shifts/${selectedShiftId}/bank-deposits`, {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (res.success) {
      setActionSuccess('Deposit submitted');
      setShowDepositModal(false);
      refreshData();
    } else {
      setActionError(res.error?.message || 'Failed to submit deposit');
    }
  };

  const handleAcknowledgeHandover = async (id: string, status: 'ACKNOWLEDGED' | 'DISPUTED') => {
    const res = await apiFetch(`/api/v1/cash-handovers/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });

    if (res.success) {
      setActionSuccess(`Handover ${status.toLowerCase()}`);
      refreshData();
    } else {
      setActionError(res.error?.message || 'Failed to update handover status');
    }
  };

  const handleVerifyDeposit = async (id: string, status: 'VERIFIED' | 'REJECTED', reason?: string) => {
    const res = await apiFetch(`/api/v1/bank-deposits/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, rejectionReason: reason }),
    });

    if (res.success) {
      setActionSuccess(`Deposit ${status.toLowerCase()}`);
      refreshData();
    } else {
      setActionError(res.error?.message || 'Failed to update deposit status');
    }
  };

  return (
    <div className="finance-modern space-y-6 pb-10">
      {/* Header & Selectors */}
      <div className="phase3-surface p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-500/10 rounded-xl border border-orange-500/20">
              <Banknote className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#17365D] tracking-tight">Financial Operations</h1>
              <p className="text-xs text-[#64748B]">Revenue, collections, handovers and reconciliation</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedOutletId}
              onChange={(e) => setSelectedOutletId(e.target.value)}
              className="bg-[#F1F5F9] border border-[#D7E0EA] text-[#17365D] rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none"
            >
              {outlets.map(o => (
                <option key={o.id} value={o.id}>{o.roCode} — {o.name}</option>
              ))}
            </select>

            <select
              value={selectedShiftId}
              onChange={(e) => setSelectedShiftId(e.target.value)}
              className="bg-[#F1F5F9] border border-[#D7E0EA] text-[#17365D] rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none"
            >
              <option value="">Select Shift...</option>
              {shiftsList.map(s => (
                <option key={s.id} value={s.id}>{s.businessDate} ({s.shiftTemplateCode})</option>
              ))}
            </select>

            <button
              onClick={refreshData}
              aria-label="Refresh financial data"
              className="p-2 bg-[#F1F5F9] text-[#64748B] hover:text-[#17365D] rounded-xl border border-[#D7E0EA] transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${loadingData ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="mt-6 flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar border-t border-[#E2E8F0] pt-4">
          <button
            onClick={() => setActiveTab('collections')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'collections' ? 'bg-[#17365D] text-white shadow-sm' : 'text-[#64748B] hover:text-[#17365D] hover:bg-[#F1F5F9]'
            }`}
          >
            Collections
          </button>
          <button
            onClick={() => setActiveTab('reconciliation')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'reconciliation' ? 'bg-[#17365D] text-white shadow-sm' : 'text-[#64748B] hover:text-[#17365D] hover:bg-[#F1F5F9]'
            }`}
          >
            Reconciliation
          </button>
          <button
            onClick={() => setActiveTab('handovers')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'handovers' ? 'bg-[#17365D] text-white shadow-sm' : 'text-[#64748B] hover:text-[#17365D] hover:bg-[#F1F5F9]'
            }`}
          >
            Cash Handover
          </button>
          <button
            onClick={() => setActiveTab('deposits')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'deposits' ? 'bg-[#17365D] text-white shadow-sm' : 'text-[#64748B] hover:text-[#17365D] hover:bg-[#F1F5F9]'
            }`}
          >
            Bank Deposits
          </button>
          {hasPermission(PERMISSIONS.CREDIT_PARTIES_READ) && (
            <button
              onClick={() => setActiveTab('credit-parties')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'credit-parties' ? 'bg-[#17365D] text-white shadow-sm' : 'text-[#64748B] hover:text-[#17365D] hover:bg-[#F1F5F9]'
              }`}
            >
              Credit Parties
            </button>
          )}
          {hasPermission(PERMISSIONS.PRODUCT_PRICES_READ) && (
            <button
              onClick={() => setActiveTab('prices')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'prices' ? 'bg-[#17365D] text-white shadow-sm' : 'text-[#64748B] hover:text-[#17365D] hover:bg-[#F1F5F9]'
              }`}
            >
              Price Master
            </button>
          )}
        </div>
      </div>

      {/* Read-only shift overview: all values come from the existing financial-summary response. */}
      {summary && (
        <section aria-label="Financial shift overview" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Authoritative Sales', value: summary.salesRevenue.authoritativeTotalStr, tone: 'text-[#17365D]' },
            { label: 'Total Collections', value: summary.collections.totalStr, tone: 'text-[#17365D]' },
            { label: 'Sales vs Collections Variance', value: summary.varianceStr,
              tone: summary.variancePaise === 0 ? 'text-emerald-700' : 'text-amber-800' },
            { label: 'Pending Cash Deposit', value: summary.cashDepositControl.pendingCashDepositStr,
              tone: summary.cashDepositControl.pendingCashDepositPaise > 0 ? 'text-amber-800' : 'text-emerald-700' },
          ].map(metric => (
            <div key={metric.label} className="phase3-surface p-4">
              <div className="text-xs font-semibold text-[#526477]">{metric.label}</div>
              <div className={`mt-2 text-xl font-bold tabular-nums ${metric.tone}`}>₹ {metric.value}</div>
            </div>
          ))}
        </section>
      )}

      {/* A financial preview can be provisional while nozzle evidence is incomplete. */}
      {summary?.salesRevenue.readingCoverage?.status === 'INCOMPLETE' && (
        <div role="status" aria-label="Incomplete fuel readings" className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>Fuel readings incomplete.</strong>{' '}
            {summary.salesRevenue.readingCoverage.missingNozzleIds.length} nozzle(s) are missing a valid net reading or an unavailability record.
            Financial totals shown are provisional; do not treat them as final reconciliation.
          </span>
        </div>
      )}

      {/* Notifications */}
      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> <span>{actionError}</span>
        </div>
      )}

      {/* Main Content */}
      <div className="space-y-6">
        {activeTab === 'collections' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#17365D]">Shift Collections</h2>
              {selectedShift?.status === 'OPEN' && (
                <button
                  onClick={() => setShowCollectionModal(true)}
                  className="px-3 py-1.5 bg-[#17365D] text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Add Collection
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {collections.map(c => (
                <div key={c.id} className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-2 relative group">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#F1F5F9] text-[#B8530D] border border-[#D7E0EA] uppercase">
                      {c.collectionType.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-[#64748B] font-mono">
                      {new Date(c.collectedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-xl font-bold text-[#17365D] font-mono">
                    ₹ {c.amountStr}
                  </div>
                  {c.creditPartyNameSnapshot && (
                    <div className="text-xs text-[#64748B] flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-blue-400" />
                      {c.creditPartyNameSnapshot} ({c.creditPartyCodeSnapshot})
                    </div>
                  )}
                  {c.provider && (
                    <div className="text-[10px] text-[#64748B]">
                      {c.provider} {c.referenceNumber && `• ${c.referenceNumber}`}
                    </div>
                  )}
                  {selectedShift?.status === 'OPEN' && (
                    <button
                      onClick={async () => {
                        if (confirm('Delete this collection?')) {
                          await apiFetch(`/api/v1/collections/${c.id}`, { method: 'DELETE' });
                          refreshData();
                        }
                      }}
                      className="absolute top-2 right-2 p-1.5 text-slate-600 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {collections.length === 0 && (
                <div className="md:col-span-2 lg:col-span-3 py-12 text-center text-[#64748B] italic bg-[#F8FAFC] border border-dashed border-[#CBD5E1] rounded-2xl">
                  No collections recorded for this shift
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'reconciliation' && summary && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Sales Revenue */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#17365D] uppercase tracking-wider font-mono">Authoritative Sales Revenue</h3>
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="space-y-3">
                  {summary.salesRevenue.byProduct.map(p => (
                    <div key={p.productId} className="flex items-center justify-between text-xs border-b border-[#E2E8F0] pb-2">
                      <div className="font-mono">
                        <div className="text-[#17365D] font-bold">{p.productName}</div>
                        <div className="text-[#64748B]">{p.quantityStr} {p.unit} @ ₹{p.pricePerUnitStr}</div>
                      </div>
                      <div className="text-[#17365D] font-bold font-mono text-sm">₹{p.revenueStr}</div>
                    </div>
                  ))}

                  {/* CNG Row / Card if applicable */}
                  {summary.salesRevenue.cngApplicable && (
                    summary.salesRevenue.cngComplete ? (
                      <div className="flex items-center justify-between text-xs border-b border-[#E2E8F0] pb-2 bg-orange-500/5 -mx-2 px-2 py-1.5 rounded-lg border border-orange-500/20">
                        <div className="font-mono">
                          <div className="text-[#B8530D] font-bold flex items-center gap-1.5">
                            <span>CNG</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-[#B8530D] font-normal">Gas</span>
                          </div>
                          <div className="text-[#64748B]">
                            {summary.salesRevenue.cngProduct
                              ? `${summary.salesRevenue.cngProduct.quantityStr} ${summary.salesRevenue.cngProduct.unit} × ₹${summary.salesRevenue.cngProduct.pricePerUnitStr}/${summary.salesRevenue.cngProduct.unit}`
                              : 'CNG Dispensed'}
                          </div>
                        </div>
                        <div className="text-[#B8530D] font-bold font-mono text-sm">
                          ₹{summary.salesRevenue.cngTotalStr}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-700">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>CNG operational data is incomplete.</span>
                      </div>
                    )
                  )}

                  {/* Revenue Summary Totals */}
                  <div className="pt-2 space-y-1.5 border-t border-[#E2E8F0] font-mono text-xs">
                    <div className="flex justify-between text-[#64748B]">
                      <span>Fuel Revenue:</span>
                      <span className="text-[#17365D] font-bold">₹{summary.salesRevenue.fuelTotalStr}</span>
                    </div>
                    {summary.salesRevenue.cngApplicable && summary.salesRevenue.cngComplete && (
                      <div className="flex justify-between text-[#B8530D]">
                        <span>CNG Revenue:</span>
                        <span className="font-bold">₹{summary.salesRevenue.cngTotalStr}</span>
                      </div>
                    )}
                    {summary.salesRevenue.lubeTotalStr != null && (
                      <div className="flex justify-between text-indigo-700">
                        <span>Lube Revenue:</span>
                        <span className="font-bold">₹{summary.salesRevenue.lubeTotalStr}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between font-bold text-[#17365D] text-base pt-1.5 border-t border-[#E2E8F0]">
                      <span>Authoritative Sales Total:</span>
                      <span className="text-emerald-700">₹{summary.salesRevenue.authoritativeTotalStr}</span>
                    </div>
                  </div>

                  {/* Component Completeness Visibility */}
                  <div className="pt-3 border-t border-[#E2E8F0]">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[#64748B] mb-2">
                      Component Completeness
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-mono">
                      <div className="p-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                        <div className="text-[#64748B] text-[10px]">Fuel</div>
                        <div className="text-emerald-700 font-bold mt-0.5">
                          {summary.salesRevenue.includedComponents?.includes('FUEL') ? 'Included' : 'Pending'}
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                        <div className="text-[#64748B] text-[10px]">CNG</div>
                        <div className={`font-bold mt-0.5 ${
                          !summary.salesRevenue.cngApplicable
                            ? 'text-[#64748B]'
                            : summary.salesRevenue.cngComplete
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                        }`}>
                          {!summary.salesRevenue.cngApplicable
                            ? 'Not Applicable'
                            : summary.salesRevenue.cngComplete
                            ? 'Included'
                            : 'Pending'}
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                        <div className="text-[#64748B] text-[10px]">Lube</div>
                        <div className="text-emerald-700 font-bold mt-0.5">
                          {summary.salesRevenue.includedComponents?.includes('LUBE') ? 'Included' : 'Pending'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Collections Summary */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#17365D] uppercase tracking-wider font-mono">Collections Breakdown</h3>
                  <Wallet className="w-4 h-4 text-orange-500" />
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-[#64748B]">Cash:</span>
                    <span className="text-[#17365D]">₹{summary.collections.cashStr}</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-[#64748B]">POS Cards:</span>
                    <span className="text-[#17365D]">₹{summary.collections.posCardStr}</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-[#64748B]">UPI Payments:</span>
                    <span className="text-[#17365D]">₹{summary.collections.upiStr}</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-[#64748B]">Fleet Cards:</span>
                    <span className="text-[#17365D]">₹{summary.collections.fleetCardStr}</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-[#64748B]">Credit Sales:</span>
                    <span className="text-[#17365D]">₹{summary.collections.creditSalesStr}</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-[#64748B]">Direct Bank Drops:</span>
                    <span className="text-[#17365D]">₹{summary.collections.directBankDropStr}</span>
                  </div>
                  <div className="pt-2 flex items-center justify-between font-bold text-[#17365D] text-lg font-mono border-t border-[#E2E8F0]">
                    <span>TOTAL</span>
                    <span className="text-emerald-700">₹{summary.collections.totalStr}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Variance & Status */}
            <div className={`p-6 rounded-2xl border-2 flex flex-col md:flex-row items-center justify-between gap-6 ${
              summary.variancePaise === 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 
              summary.variancePaise > 0 ? 'bg-rose-500/5 border-rose-500/20' : 'bg-amber-500/5 border-amber-200'
            }`}>
              <div className="flex items-center gap-4">
                <div className={`p-4 rounded-2xl ${
                  summary.variancePaise === 0 ? 'bg-emerald-500/20 text-emerald-700' :
                  summary.variancePaise > 0 ? 'bg-rose-500/20 text-rose-700' : 'bg-amber-500/20 text-amber-700'
                }`}>
                  {summary.variancePaise === 0 ? <CheckCircle2 className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#64748B] font-mono">Sales vs Collections Variance</div>
                  <div className={`text-3xl font-bold font-mono ${
                    summary.variancePaise === 0 ? 'text-emerald-700' :
                    summary.variancePaise > 0 ? 'text-rose-700' : 'text-amber-700'
                  }`}>
                    ₹ {summary.varianceStr}
                  </div>
                  <div className="text-xs font-bold text-[#64748B] uppercase tracking-widest mt-1">
                    Status: {summary.varianceStatus || 'PENDING'}
                  </div>
                </div>
              </div>

              <div className="max-w-xs text-xs text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3">
                <div className="font-semibold text-[#475569] flex items-center gap-1.5 mb-1">
                  <Info className="w-3.5 h-3.5 text-[#B8530D]" />
                  <span>Authoritative Finalization</span>
                </div>
                <p className="text-[11px] leading-relaxed text-[#64748B]">
                  Authoritative financial reconciliation is finalized during Shift Close. If this shift is open, complete operational entries and finalize in Shift Operations.
                </p>
              </div>
            </div>

            {summary.varianceReason && (
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-4 rounded-xl">
                 <div className="text-[10px] font-bold text-[#64748B] uppercase font-mono mb-1">Variance Reason</div>
                 <div className="text-sm text-[#475569] italic">"{summary.varianceReason}"</div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'handovers' && (
          <div className="space-y-4">
             <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#17365D]">Cash Handovers</h2>
              {selectedShift?.status === 'OPEN' && (
                <button
                  onClick={() => setShowHandoverModal(true)}
                  className="px-3 py-1.5 bg-[#17365D] text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Record Handover
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {handovers.map(h => (
                <div key={h.id} className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold text-[#17365D] font-mono">₹ {h.amountStr}</div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                      h.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-500/30' :
                      h.status === 'ACKNOWLEDGED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {h.status}
                    </span>
                  </div>
                  <div className="text-xs text-[#64748B] space-y-1">
                    <div>Handed over at: {new Date(h.handedOverAt).toLocaleString()}</div>
                    {h.receivedAt && <div>Acknowledged at: {new Date(h.receivedAt).toLocaleString()}</div>}
                  </div>
                  {h.status === 'PENDING' && hasPermission(PERMISSIONS.CASH_HANDOVER_ACKNOWLEDGE) && (
                    <div className="flex gap-2 pt-2 border-t border-[#E2E8F0]">
                      <button
                        onClick={() => handleAcknowledgeHandover(h.id, 'ACKNOWLEDGED')}
                        className="flex-1 px-3 py-2 bg-emerald-600/20 text-emerald-700 rounded-lg text-[10px] font-bold border border-emerald-600/30 hover:bg-emerald-700 hover:text-white transition-all"
                      >
                        Acknowledge Receipt
                      </button>
                      <button
                         onClick={() => handleAcknowledgeHandover(h.id, 'DISPUTED')}
                        className="flex-1 px-3 py-2 bg-rose-600/20 text-rose-700 rounded-lg text-[10px] font-bold border border-rose-600/30 hover:bg-rose-700 hover:text-white transition-all"
                      >
                        Dispute Amount
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'deposits' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#17365D]">Bank Deposits</h2>
              <button
                onClick={() => setShowDepositModal(true)}
                className="px-3 py-1.5 bg-[#17365D] text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> New Deposit
              </button>
            </div>

            {summary && (
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-6 mb-6">
                <div>
                  <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest font-mono">Cash Collected (Sales)</div>
                  <div className="text-2xl font-bold text-[#17365D] font-mono">₹ {summary.cashDepositControl.cashCollectedStr}</div>
                </div>
                <div className="w-px h-10 bg-[#F1F5F9] hidden md:block" />
                <div>
                  <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest font-mono">Verified in Bank</div>
                  <div className="text-2xl font-bold text-emerald-700 font-mono">₹ {summary.cashDepositControl.verifiedCashDepositedStr}</div>
                </div>
                <div className="w-px h-10 bg-[#F1F5F9] hidden md:block" />
                <div>
                  <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest font-mono">Pending Deposit</div>
                  <div className={`text-2xl font-bold font-mono ${summary.cashDepositControl.pendingCashDepositPaise > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                    ₹ {summary.cashDepositControl.pendingCashDepositStr}
                  </div>
                </div>
              </div>
            )}

            <div className="phase3-table-scroll overflow-x-auto bg-white border border-[#E2E8F0] rounded-2xl" role="region" aria-label="Scrollable financial table" tabIndex={0}>
              <table className="phase3-data-table w-full text-left text-xs">
                <thead className="bg-[#F1F5F9] text-[#64748B] font-mono uppercase text-[10px] border-b border-[#E2E8F0]">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Channel</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Reference</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {deposits.map(d => (
                    <tr key={d.id} className="hover:bg-[#F1F5F9]/30">
                      <td className="py-3 px-4 font-mono">{d.depositDate}</td>
                      <td className="py-3 px-4">
                        <span className="text-[10px] font-bold text-[#64748B] uppercase">{d.depositChannel.replace('_', ' ')}</span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-[#17365D] font-mono">₹ {d.amountStr}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          d.status === 'SUBMITTED' ? 'bg-amber-50 text-amber-700' :
                          d.status === 'VERIFIED' ? 'bg-emerald-50 text-emerald-700' :
                          'bg-rose-50 text-rose-700'
                        }`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[#64748B] font-mono truncate max-w-[120px]">{d.referenceNumber || '—'}</td>
                      <td className="py-3 px-4">
                        {d.status === 'SUBMITTED' && hasPermission(PERMISSIONS.BANK_DEPOSITS_VERIFY) && (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleVerifyDeposit(d.id, 'VERIFIED')}
                              className="p-1.5 bg-emerald-600/20 text-emerald-700 rounded-lg hover:bg-emerald-700 hover:text-white transition-all"
                              title="Verify"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                const reason = prompt('Rejection Reason:');
                                if (reason) handleVerifyDeposit(d.id, 'REJECTED', reason);
                              }}
                              className="p-1.5 bg-rose-600/20 text-rose-700 rounded-lg hover:bg-rose-700 hover:text-white transition-all"
                              title="Reject"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'credit-parties' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#17365D]">Credit Customers / Parties</h2>
              <button
                onClick={() => setShowPartyModal(true)}
                className="px-3 py-1.5 bg-[#17365D] text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Add Party
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {creditParties.map(p => (
                <div key={p.id} className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-[#17365D]">{p.partyName}</div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      p.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-[#F1F5F9] text-[#64748B]'
                    }`}>
                      {p.status}
                    </span>
                  </div>
                  <div className="text-xs text-[#64748B] font-mono">Code: {p.partyCode}</div>
                  <div className="text-xs text-[#64748B]">Contact: {p.contactName || 'N/A'} • {p.phone || 'N/A'}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'prices' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#17365D]">Product Price Master</h2>
              {hasPermission(PERMISSIONS.PRODUCT_PRICES_WRITE) && (
                <button
                  onClick={() => setShowPriceModal(true)}
                  className="px-3 py-1.5 bg-[#17365D] text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Set New Price
                </button>
              )}
            </div>

            {/* Price Coverage Summary */}
            {(() => {
              const todayStr = getLocalDateInputValue();
              const pricedProductIdsToday = new Set(
                prices
                  .filter(p => p.status === 'ACTIVE' && p.effectiveFrom <= todayStr && (!p.effectiveTo || p.effectiveTo >= todayStr))
                  .map(p => p.productId)
              );
              const unpricedMappedProducts = products.filter(p => !pricedProductIdsToday.has(p.id));
              const priceCoveragePct = products.length > 0 ? Math.round((pricedProductIdsToday.size / products.length) * 100) : 100;
              return (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl border ${priceCoveragePct === 100 ? 'bg-emerald-50 border-emerald-500/20 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                      {priceCoveragePct === 100 ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#17365D]">Price Coverage Status (Outlet Mapped Active Products)</div>
                      <div className="text-[11px] text-[#64748B]">
                        {pricedProductIdsToday.size} of {products.length} products have active price configured for today ({priceCoveragePct}%)
                      </div>
                    </div>
                  </div>
                  {unpricedMappedProducts.length > 0 && (
                    <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5">
                      <span className="font-bold">Missing today:</span> {unpricedMappedProducts.map(p => p.name).join(', ')}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="phase3-table-scroll overflow-x-auto bg-white border border-[#E2E8F0] rounded-2xl" role="region" aria-label="Scrollable financial table" tabIndex={0}>
              <table className="phase3-data-table w-full text-left text-xs">
                <thead className="bg-[#F1F5F9] text-[#64748B] font-mono uppercase text-[10px] border-b border-[#E2E8F0]">
                  <tr>
                    <th className="py-3 px-4">Product</th>
                    <th className="py-3 px-4">Price / Unit</th>
                    <th className="py-3 px-4">Effective From</th>
                    <th className="py-3 px-4">Effective To</th>
                    <th className="py-3 px-4">Status</th>
                    {hasPermission(PERMISSIONS.PRODUCT_PRICES_WRITE) && <th className="py-3 px-4 text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {prices.map(p => {
                    const matchedProduct = products.find(prod => prod.id === p.productId);
                    const unit = matchedProduct?.unit || 'Unit';
                    const name = matchedProduct?.name || p.productId;
                    return (
                      <tr key={p.id} className="hover:bg-[#F1F5F9]/30">
                        <td className="py-3 px-4 text-[#17365D] font-bold">{name}</td>
                        <td className="py-3 px-4 font-mono font-bold text-sm text-[#B8530D]">
                          ₹ {formatPaiseToMoney(p.pricePaisePerUnit)}{' '}
                          <span className="text-[10px] text-[#64748B] font-normal">/ {unit}</span>
                        </td>
                        <td className="py-3 px-4 font-mono">{p.effectiveFrom}</td>
                        <td className="py-3 px-4 font-mono">{p.effectiveTo || 'Active Indefinitely'}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            p.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-[#F1F5F9] text-[#64748B]'
                          }`}>
                            {p.status}
                          </span>
                        </td>
                        {hasPermission(PERMISSIONS.PRODUCT_PRICES_WRITE) && (
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => { setEditingPrice(p); setShowEditPriceModal(true); }}
                              className="px-2.5 py-1 bg-[#F1F5F9] hover:bg-[#17365D] hover:text-white text-[#475569] rounded-lg text-[10px] font-bold transition-all"
                            >
                              Edit
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
        )}
      </div>

      {/* MODALS */}
      
      {showCollectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setShowCollectionModal(false)} />
          <form onSubmit={handleCreateCollection} className="relative z-10 w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-[#17365D]">Record Shift Collection</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#64748B] mb-1">Collection Type</label>
                <select name="collectionType" required className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-[#17365D]">
                  <option value="CASH">Physical Cash</option>
                  <option value="POS_CARD">POS Card Swipe</option>
                  <option value="UPI">UPI / QR Code</option>
                  <option value="FLEET_CARD">Fleet Card</option>
                  <option value="CREDIT_SALE">Credit Sale (Authorized Party)</option>
                  <option value="DIRECT_BANK_DROP">Direct Bank Drop</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#64748B] mb-1">Amount (₹)</label>
                <input type="text" name="amount" inputMode="decimal" required placeholder="0.00" className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-[#17365D] font-mono" />
              </div>
              <div>
                <label className="block text-xs text-[#64748B] mb-1">Credit Party (If Credit Sale)</label>
                <select name="creditPartyId" className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-[#17365D]">
                  <option value="">N/A</option>
                  {creditParties.filter(p => p.status === 'ACTIVE').map(p => (
                    <option key={p.id} value={p.id}>{p.partyName} ({p.partyCode})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#64748B] mb-1">Provider (e.g. HDFC)</label>
                  <input type="text" name="provider" className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-[#17365D]" />
                </div>
                <div>
                  <label className="block text-xs text-[#64748B] mb-1">Ref / Auth Code</label>
                  <input type="text" name="referenceNumber" className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-[#17365D]" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#64748B] mb-1">Notes</label>
                <textarea name="notes" rows={2} className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-[#17365D]" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowCollectionModal(false)} className="px-4 py-2 bg-[#F1F5F9] rounded-xl text-xs text-[#475569]">Cancel</button>
              <button type="submit" className="px-5 py-2 bg-[#17365D] text-white rounded-xl text-xs font-bold shadow-sm">Record Collection</button>
            </div>
          </form>
        </div>
      )}

      {showHandoverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setShowHandoverModal(false)} />
          <form onSubmit={handleCreateHandover} className="relative z-10 w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-[#17365D]">Log Cash Handover</h2>
            <p className="text-xs text-[#64748B]">Record physical custody transfer of cash to supervisor or next staff.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#64748B] mb-1">Amount (₹)</label>
                <input type="text" name="amount" inputMode="decimal" required placeholder="0.00" className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-[#17365D] font-mono" />
              </div>
              <div>
                <label className="block text-xs text-[#64748B] mb-1">Notes</label>
                <textarea name="notes" rows={2} placeholder="Handed over to Supervisor..." className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-[#17365D]" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowHandoverModal(false)} className="px-4 py-2 bg-[#F1F5F9] rounded-xl text-xs text-[#475569]">Cancel</button>
              <button type="submit" className="px-5 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20">Confirm Handover</button>
            </div>
          </form>
        </div>
      )}

      {showDepositModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setShowDepositModal(false)} />
          <form onSubmit={handleCreateDeposit} className="relative z-10 w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-[#17365D]">New Bank Deposit Submission</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#64748B] mb-1">Deposit Channel</label>
                <select name="depositChannel" required className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-[#17365D]">
                  <option value="BANK_BRANCH">Bank Branch (Manual)</option>
                  <option value="CASH_DROP_BOX">Cash Drop Box / CMS</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                 <div>
                  <label className="block text-xs text-[#64748B] mb-1">Amount (₹)</label>
                  <input type="text" name="amount" inputMode="decimal" required placeholder="0.00" className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-[#17365D] font-mono" />
                </div>
                <div>
                  <label className="block text-xs text-[#64748B] mb-1">Deposit Date</label>
                  <input type="date" name="depositDate" required defaultValue={getLocalDateInputValue()} className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-[#17365D] font-mono" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#64748B] mb-1">Reference / Acknowledgement #</label>
                <input type="text" name="referenceNumber" className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-[#17365D]" />
              </div>
              <div className="p-4 border border-dashed border-[#D7E0EA] rounded-xl flex flex-col items-center gap-2 text-[#64748B]">
                <Camera className="w-6 h-6" />
                <span className="text-[10px]">Attach Bank Slip / Proof (via Document Vault)</span>
                <input type="text" name="documentId" placeholder="Document ID (Optional)" className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2 py-1 text-[10px]" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowDepositModal(false)} className="px-4 py-2 bg-[#F1F5F9] rounded-xl text-xs text-[#475569]">Cancel</button>
              <button type="submit" className="px-5 py-2 bg-blue-600 text-[#17365D] rounded-xl text-xs font-bold">Submit Deposit</button>
            </div>
          </form>
        </div>
      )}

      {showPartyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setShowPartyModal(false)} />
          <form 
            onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const res = await apiFetch(`/api/v1/outlets/${selectedOutletId}/credit-parties`, {
                method: 'POST',
                body: JSON.stringify({
                  partyCode: formData.get('partyCode'),
                  partyName: formData.get('partyName'),
                  contactName: formData.get('contactName'),
                  phone: formData.get('phone'),
                  status: 'ACTIVE'
                })
              });
              if (res.success) { setShowPartyModal(false); refreshData(); }
            }}
            className="relative z-10 w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <h2 className="text-lg font-bold text-[#17365D]">Register Credit Party</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#64748B] mb-1">Party Code</label>
                  <input name="partyCode" required className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-[#17365D]" />
                </div>
                <div>
                  <label className="block text-xs text-[#64748B] mb-1">Party Name</label>
                  <input name="partyName" required className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-[#17365D]" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#64748B] mb-1">Contact Person</label>
                <input name="contactName" className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-[#17365D]" />
              </div>
              <div>
                <label className="block text-xs text-[#64748B] mb-1">Phone Number</label>
                <input name="phone" className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-[#17365D]" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowPartyModal(false)} className="px-4 py-2 bg-[#F1F5F9] rounded-xl text-xs text-[#475569]">Cancel</button>
              <button type="submit" className="px-5 py-2 bg-[#17365D] text-white rounded-xl text-xs font-bold">Register Party</button>
            </div>
          </form>
        </div>
      )}

      {showPriceModal && hasPermission(PERMISSIONS.PRODUCT_PRICES_WRITE) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setShowPriceModal(false)} />
          <form 
            onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const res = await apiFetch(`/api/v1/outlets/${selectedOutletId}/product-prices`, {
                method: 'POST',
                body: JSON.stringify({
                  productId: formData.get('productId'),
                  pricePaisePerUnit: formData.get('price'),
                  effectiveFrom: formData.get('effectiveFrom'),
                  effectiveTo: formData.get('effectiveTo') || null
                })
              });
              if (res.success) { setShowPriceModal(false); refreshData(); } else { setActionError(res.error?.message || 'Failed to configure price'); }
            }}
            className="relative z-10 w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <h2 className="text-lg font-bold text-[#17365D]">Configure Product Price</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#64748B] mb-1">Product</label>
                <select name="productId" required className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-[#17365D]">
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.code}) — ₹ / {p.unit}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#64748B] mb-1">Selling Price (₹ / Unit)</label>
                <input name="price" type="text" inputMode="decimal" required placeholder="0.00" className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-[#17365D] font-mono" />
                <span className="text-[10px] text-[#64748B] mt-1 block">Specify ₹/LITRE for liquid fuels or ₹/KG for CNG</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#64748B] mb-1">Effective From</label>
                  <input name="effectiveFrom" type="date" required defaultValue={getLocalDateInputValue()} className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]" />
                </div>
                <div>
                  <label className="block text-xs text-[#64748B] mb-1">Effective To (Optional)</label>
                  <input name="effectiveTo" type="date" className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowPriceModal(false)} className="px-4 py-2 bg-[#F1F5F9] rounded-xl text-xs text-[#475569]">Cancel</button>
              <button type="submit" className="px-5 py-2 bg-[#17365D] text-white rounded-xl text-xs font-bold">Set Price</button>
            </div>
          </form>
        </div>
      )}

      {showEditPriceModal && editingPrice && hasPermission(PERMISSIONS.PRODUCT_PRICES_WRITE) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => { setShowEditPriceModal(false); setEditingPrice(null); }} />
          <form onSubmit={handleUpdatePrice} className="relative z-10 w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-[#17365D]">Edit Product Price</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#64748B] mb-1">Product</label>
                <input
                  type="text"
                  disabled
                  value={products.find(p => p.id === editingPrice.productId)?.name || editingPrice.productId}
                  className="w-full bg-[#F1F5F9]/50 border border-[#D7E0EA]/50 rounded-xl px-3 py-2 text-[#475569] text-xs"
                />
              </div>
              <div>
                <label className="block text-xs text-[#64748B] mb-1">Selling Price (₹ / Unit)</label>
                <input
                  name="price"
                  type="text"
                  inputMode="decimal"
                  required
                  defaultValue={formatPaiseToMoney(editingPrice.pricePaisePerUnit)}
                  className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-[#17365D] font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#64748B] mb-1">Effective From</label>
                  <input
                    name="effectiveFrom"
                    type="date"
                    required
                    defaultValue={editingPrice.effectiveFrom}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#64748B] mb-1">Effective To (Optional)</label>
                  <input
                    name="effectiveTo"
                    type="date"
                    defaultValue={editingPrice.effectiveTo || ''}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => { setShowEditPriceModal(false); setEditingPrice(null); }} className="px-4 py-2 bg-[#F1F5F9] rounded-xl text-xs text-[#475569]">Cancel</button>
              <button type="submit" className="px-5 py-2 bg-[#17365D] text-white rounded-xl text-xs font-bold shadow-sm">Save Changes</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
