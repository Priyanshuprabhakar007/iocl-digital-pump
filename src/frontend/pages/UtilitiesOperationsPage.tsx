import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Zap,
  Building2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  FileText,
  Gauge,
  Plus,
  CreditCard,
  Layers,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import { PERMISSIONS } from '../../shared/constants';
import {
  RetailOutlet,
  UtilityElectricityAccount,
  UtilityElectricityBill,
  UtilitySubMeter,
  UtilityElectricitySummary,
  UtilitySubMeterChargeSummary,
  UtilitySubMeterReading,
} from '../../shared/types';
import { UtilitySummaryPanel } from '../components/utilities/UtilitySummaryPanel';
import { ElectricityBillsPanel } from '../components/utilities/ElectricityBillsPanel';
import { ElectricityBillModal } from '../components/utilities/ElectricityBillModal';
import { ElectricityBillDetailPanel } from '../components/utilities/ElectricityBillDetailPanel';
import { UtilityPaymentModal } from '../components/utilities/UtilityPaymentModal';
import { ElectricityAccountsPanel } from '../components/utilities/ElectricityAccountsPanel';
import { ElectricityAccountModal } from '../components/utilities/ElectricityAccountModal';
import { SubMetersPanel } from '../components/utilities/SubMetersPanel';
import { SubMeterModal } from '../components/utilities/SubMeterModal';
import { SubMeterDetailPanel } from '../components/utilities/SubMeterDetailPanel';
import { SubMeterReadingModal } from '../components/utilities/SubMeterReadingModal';
import { UtilityChargeSummary } from '../components/utilities/UtilityChargeSummary';
import {
  getUtilityErrorMessage,
  buildBillQueryParams,
  buildSubMeterQueryParams,
  buildChargeSummaryQueryParams,
} from '../components/utilities/utilityUi';

export const UtilitiesOperationsPage: React.FC = () => {
  const { hasPermission } = useAuth();

  // Exact Permissions
  const canRead = hasPermission(PERMISSIONS.UTILITIES_READ);
  const canWriteAccounts = hasPermission(PERMISSIONS.UTILITY_ACCOUNTS_WRITE);
  const canWriteBills = hasPermission(PERMISSIONS.UTILITY_BILLS_WRITE);
  const canWritePayments = hasPermission(PERMISSIONS.UTILITY_PAYMENTS_WRITE);
  const canWriteSubMeters = hasPermission(PERMISSIONS.UTILITY_SUB_METERS_WRITE);
  const canWriteReadings = hasPermission(PERMISSIONS.UTILITY_SUB_METER_READINGS_WRITE);
  const hasOutletsRead = hasPermission(PERMISSIONS.OUTLETS_READ);

  // Outlet State
  const [outlets, setOutlets] = useState<RetailOutlet[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');
  const [loadingOutlets, setLoadingOutlets] = useState<boolean>(true);

  // Workspace Data State
  const [electricitySummary, setElectricitySummary] = useState<UtilityElectricitySummary | null>(null);
  const [accounts, setAccounts] = useState<UtilityElectricityAccount[]>([]);
  const [bills, setBills] = useState<UtilityElectricityBill[]>([]);
  const [subMeters, setSubMeters] = useState<UtilitySubMeter[]>([]);
  const [chargeSummary, setChargeSummary] = useState<UtilitySubMeterChargeSummary | null>(null);

  // Active Workspace Tab
  const [activeTab, setActiveTab] = useState<'bills' | 'accounts' | 'submeters' | 'charges'>('bills');
  const [loadingData, setLoadingData] = useState<boolean>(false);

  // Bill Filter State
  const [billFilterStatus, setBillFilterStatus] = useState<string>('');
  const [billFilterFromDate, setBillFilterFromDate] = useState<string>('');
  const [billFilterToDate, setBillFilterToDate] = useState<string>('');

  // Sub-Meter Filter State
  const [smFilterBeneficiaryType, setSmFilterBeneficiaryType] = useState<string>('');
  const [smFilterStatus, setSmFilterStatus] = useState<string>('');

  // Charge Summary Filter State
  const [chargeFilterFromDate, setChargeFilterFromDate] = useState<string>('');
  const [chargeFilterToDate, setChargeFilterToDate] = useState<string>('');
  const [chargeFilterSubMeterId, setChargeFilterSubMeterId] = useState<string>('');

  // Modal / Drawer Selection States
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);
  const [accountToEdit, setAccountToEdit] = useState<UtilityElectricityAccount | null>(null);

  const [isBillModalOpen, setIsBillModalOpen] = useState<boolean>(false);
  const [billToEdit, setBillToEdit] = useState<UtilityElectricityBill | null>(null);

  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [billForPayment, setBillForPayment] = useState<UtilityElectricityBill | null>(null);

  const [isSubMeterModalOpen, setIsSubMeterModalOpen] = useState<boolean>(false);
  const [subMeterToEdit, setSubMeterToEdit] = useState<UtilitySubMeter | null>(null);

  const [selectedSubMeterId, setSelectedSubMeterId] = useState<string | null>(null);
  const [subMeterForReading, setSubMeterForReading] = useState<{
    subMeter: UtilitySubMeter;
    latestReading: UtilitySubMeterReading | null;
  } | null>(null);

  // Feedback Notifications
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Stale request guard
  const activeOutletReqRef = useRef<string>('');

  // Auto clear success message
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Load Outlets on Mount
  useEffect(() => {
    const loadOutlets = async () => {
      setLoadingOutlets(true);
      try {
        if (!hasOutletsRead && !canRead) {
          setOutlets([]);
          return;
        }
        const res = await apiFetch<RetailOutlet[]>('/api/v1/outlets');
        if (res.success && res.data && res.data.length > 0) {
          setOutlets(res.data);
          setSelectedOutletId(res.data[0].id);
        } else {
          setOutlets([]);
          if (res.success === false) {
            setErrorMessage(res.error?.message || 'Failed to load retail outlets');
          }
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to load retail outlets');
      } finally {
        setLoadingOutlets(false);
      }
    };

    if (canRead) {
      loadOutlets();
    } else {
      setLoadingOutlets(false);
    }
  }, [canRead, hasOutletsRead]);

  // Main data loader for selected outlet
  const fetchWorkspaceData = useCallback(async (outletId: string) => {
    if (!outletId) return;

    activeOutletReqRef.current = outletId;
    setLoadingData(true);
    setErrorMessage(null);

    const billQuery = buildBillQueryParams({
      status: billFilterStatus,
      fromDate: billFilterFromDate,
      toDate: billFilterToDate,
    });

    const smQuery = buildSubMeterQueryParams({
      beneficiaryType: smFilterBeneficiaryType,
      status: smFilterStatus,
    });

    const chargeQuery = buildChargeSummaryQueryParams({
      fromDate: chargeFilterFromDate,
      toDate: chargeFilterToDate,
      subMeterId: chargeFilterSubMeterId,
    });

    try {
      const [summaryRes, accountsRes, billsRes, smRes, chargeRes] = await Promise.allSettled([
        apiFetch<UtilityElectricitySummary>(`/api/v1/outlets/${outletId}/utilities/electricity-summary`),
        apiFetch<UtilityElectricityAccount[]>(`/api/v1/outlets/${outletId}/utilities/electricity-accounts`),
        apiFetch<UtilityElectricityBill[]>(`/api/v1/outlets/${outletId}/utilities/electricity-bills${billQuery}`),
        apiFetch<UtilitySubMeter[]>(`/api/v1/outlets/${outletId}/utilities/sub-meters${smQuery}`),
        apiFetch<UtilitySubMeterChargeSummary>(`/api/v1/outlets/${outletId}/utilities/sub-meter-charge-summary${chargeQuery}`),
      ]);

      // Guard against stale response
      if (activeOutletReqRef.current !== outletId) return;

      if (summaryRes.status === 'fulfilled' && summaryRes.value.success && summaryRes.value.data) {
        setElectricitySummary(summaryRes.value.data);
      }
      if (accountsRes.status === 'fulfilled' && accountsRes.value.success && accountsRes.value.data) {
        setAccounts(accountsRes.value.data);
      }
      if (billsRes.status === 'fulfilled' && billsRes.value.success && billsRes.value.data) {
        setBills(billsRes.value.data);
      }
      if (smRes.status === 'fulfilled' && smRes.value.success && smRes.value.data) {
        setSubMeters(smRes.value.data);
      }
      if (chargeRes.status === 'fulfilled' && chargeRes.value.success && chargeRes.value.data) {
        setChargeSummary(chargeRes.value.data);
      }
    } catch (err: any) {
      if (activeOutletReqRef.current === outletId) {
        setErrorMessage(getUtilityErrorMessage(err));
      }
    } finally {
      if (activeOutletReqRef.current === outletId) {
        setLoadingData(false);
      }
    }
  }, [
    billFilterStatus,
    billFilterFromDate,
    billFilterToDate,
    smFilterBeneficiaryType,
    smFilterStatus,
    chargeFilterFromDate,
    chargeFilterToDate,
    chargeFilterSubMeterId,
  ]);

  // Re-fetch when selected outlet or filters change
  useEffect(() => {
    if (selectedOutletId && canRead) {
      fetchWorkspaceData(selectedOutletId);
    }
  }, [selectedOutletId, canRead, fetchWorkspaceData]);

  // Handle Outlet Switch - immediately clear stale states
  const handleOutletChange = (newOutletId: string) => {
    setSelectedOutletId(newOutletId);
    setElectricitySummary(null);
    setAccounts([]);
    setBills([]);
    setSubMeters([]);
    setChargeSummary(null);
    setSelectedBillId(null);
    setSelectedSubMeterId(null);
    setBillToEdit(null);
    setAccountToEdit(null);
    setSubMeterToEdit(null);
    setBillForPayment(null);
    setSubMeterForReading(null);
  };

  // Specific refresh helpers
  const refreshAccounts = async () => {
    if (!selectedOutletId) return;
    const res = await apiFetch<UtilityElectricityAccount[]>(
      `/api/v1/outlets/${selectedOutletId}/utilities/electricity-accounts`
    );
    if (res.success && res.data) setAccounts(res.data);
  };

  const refreshBillsAndSummary = async () => {
    if (!selectedOutletId) return;
    const billQuery = buildBillQueryParams({
      status: billFilterStatus,
      fromDate: billFilterFromDate,
      toDate: billFilterToDate,
    });
    const [billsRes, summaryRes] = await Promise.all([
      apiFetch<UtilityElectricityBill[]>(`/api/v1/outlets/${selectedOutletId}/utilities/electricity-bills${billQuery}`),
      apiFetch<UtilityElectricitySummary>(`/api/v1/outlets/${selectedOutletId}/utilities/electricity-summary`),
    ]);
    if (billsRes.success && billsRes.data) setBills(billsRes.data);
    if (summaryRes.success && summaryRes.data) setElectricitySummary(summaryRes.data);
  };

  const refreshSubMetersAndCharges = async () => {
    if (!selectedOutletId) return;
    const smQuery = buildSubMeterQueryParams({
      beneficiaryType: smFilterBeneficiaryType,
      status: smFilterStatus,
    });
    const chargeQuery = buildChargeSummaryQueryParams({
      fromDate: chargeFilterFromDate,
      toDate: chargeFilterToDate,
      subMeterId: chargeFilterSubMeterId,
    });
    const [smRes, chargeRes] = await Promise.all([
      apiFetch<UtilitySubMeter[]>(`/api/v1/outlets/${selectedOutletId}/utilities/sub-meters${smQuery}`),
      apiFetch<UtilitySubMeterChargeSummary>(`/api/v1/outlets/${selectedOutletId}/utilities/sub-meter-charge-summary${chargeQuery}`),
    ]);
    if (smRes.success && smRes.data) setSubMeters(smRes.data);
    if (chargeRes.success && chargeRes.data) setChargeSummary(chargeRes.data);
  };

  // Access Restricted View
  if (!canRead && !loadingOutlets) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="p-12 bg-slate-900 border border-slate-800 rounded-3xl text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Access Restricted</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            You do not possess the required permissions (<span className="font-mono text-xs text-orange-400">{PERMISSIONS.UTILITIES_READ}</span>) to view utilities and sub-meter records.
          </p>
        </div>
      </div>
    );
  }

  const selectedOutlet = outlets.find(o => o.id === selectedOutletId);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header & Outlet Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white shadow-lg shadow-orange-500/20 shrink-0">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight">
                Utilities & Sub-Meters
              </h1>
              <span className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-bold uppercase tracking-wider rounded-md">
                Phase 4A
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Main electricity invoices, settlement workflows, and sub-meter consumption ledgers
            </p>
          </div>
        </div>

        {/* Outlet Selector & Refresh */}
        <div className="flex items-center gap-3 self-stretch sm:self-auto">
          <div className="relative flex-1 sm:w-72">
            <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedOutletId}
              onChange={e => handleOutletChange(e.target.value)}
              disabled={loadingOutlets || outlets.length === 0}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-xs font-semibold text-white focus:outline-none focus:border-orange-500/60 transition-all appearance-none cursor-pointer"
            >
              {loadingOutlets ? (
                <option value="">Loading accessible outlets...</option>
              ) : outlets.length === 0 ? (
                <option value="">No authorized outlets available</option>
              ) : (
                outlets.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.roCode})
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            type="button"
            onClick={() => fetchWorkspaceData(selectedOutletId)}
            disabled={loadingData || !selectedOutletId}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-2xl transition-colors shrink-0"
            title="Refresh Workspace"
          >
            <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin text-orange-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Feedback Alerts */}
      {errorMessage && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs text-rose-400 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">{errorMessage}</div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-400/80 hover:text-rose-400"
          >
            Dismiss
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-xs text-emerald-400 flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1">{successMessage}</div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-400/80 hover:text-emerald-400"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Electricity Summary Cards */}
      <UtilitySummaryPanel summary={electricitySummary} loading={loadingData} />

      {/* Workspace Navigation Tabs */}
      <div className="flex border-b border-slate-800 text-xs font-bold gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('bills')}
          className={`pb-3 px-3 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'bills'
              ? 'border-orange-500 text-orange-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          Electricity Bills ({bills.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('accounts')}
          className={`pb-3 px-3 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'accounts'
              ? 'border-orange-500 text-orange-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Zap className="w-4 h-4" />
          Consumer Accounts ({accounts.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('submeters')}
          className={`pb-3 px-3 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'submeters'
              ? 'border-orange-500 text-orange-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Gauge className="w-4 h-4" />
          Sub-Meters ({subMeters.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('charges')}
          className={`pb-3 px-3 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'charges'
              ? 'border-orange-500 text-orange-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          Sub-Meter Charges
        </button>
      </div>

      {/* Active Tab Views */}
      {activeTab === 'bills' && (
        <ElectricityBillsPanel
          bills={bills}
          accounts={accounts}
          loading={loadingData}
          canWriteBills={canWriteBills}
          canWritePayments={canWritePayments}
          filterStatus={billFilterStatus}
          filterFromDate={billFilterFromDate}
          filterToDate={billFilterToDate}
          onFilterChange={({ status, fromDate, toDate }) => {
            setBillFilterStatus(status);
            setBillFilterFromDate(fromDate);
            setBillFilterToDate(toDate);
          }}
          onOpenCreate={() => setIsBillModalOpen(true)}
          onSelectBill={b => setSelectedBillId(b.id)}
          onOpenEdit={b => {
            setBillToEdit(b);
            setIsBillModalOpen(true);
          }}
          onOpenMarkPaid={b => setBillForPayment(b)}
        />
      )}

      {activeTab === 'accounts' && (
        <ElectricityAccountsPanel
          accounts={accounts}
          loading={loadingData}
          canWriteAccounts={canWriteAccounts}
          onOpenCreate={() => {
            setAccountToEdit(null);
            setIsAccountModalOpen(true);
          }}
          onOpenEdit={acc => {
            setAccountToEdit(acc);
            setIsAccountModalOpen(true);
          }}
        />
      )}

      {activeTab === 'submeters' && (
        <SubMetersPanel
          subMeters={subMeters}
          loading={loadingData}
          canWriteSubMeters={canWriteSubMeters}
          canWriteReadings={canWriteReadings}
          filterBeneficiaryType={smFilterBeneficiaryType}
          filterStatus={smFilterStatus}
          onFilterChange={({ beneficiaryType, status }) => {
            setSmFilterBeneficiaryType(beneficiaryType);
            setSmFilterStatus(status);
          }}
          onOpenCreate={() => {
            setSubMeterToEdit(null);
            setIsSubMeterModalOpen(true);
          }}
          onSelectSubMeter={sm => setSelectedSubMeterId(sm.id)}
          onOpenEdit={sm => {
            setSubMeterToEdit(sm);
            setIsSubMeterModalOpen(true);
          }}
        />
      )}

      {activeTab === 'charges' && (
        <UtilityChargeSummary
          outletId={selectedOutletId}
          subMeters={subMeters}
          summary={chargeSummary}
          loading={loadingData}
          filterFromDate={chargeFilterFromDate}
          filterToDate={chargeFilterToDate}
          filterSubMeterId={chargeFilterSubMeterId}
          onFilterChange={({ fromDate, toDate, subMeterId }) => {
            setChargeFilterFromDate(fromDate);
            setChargeFilterToDate(toDate);
            setChargeFilterSubMeterId(subMeterId);
          }}
        />
      )}

      {/* Account Create / Edit Modal */}
      {isAccountModalOpen && (
        <ElectricityAccountModal
          outletId={selectedOutletId}
          accountToEdit={accountToEdit}
          isOpen={isAccountModalOpen}
          onClose={() => {
            setIsAccountModalOpen(false);
            setAccountToEdit(null);
          }}
          onSuccess={() => {
            setSuccessMessage(
              accountToEdit ? 'Electricity account updated successfully.' : 'Electricity account registered successfully.'
            );
            refreshAccounts();
          }}
        />
      )}

      {/* Bill Create / Edit Modal */}
      {isBillModalOpen && (
        <ElectricityBillModal
          outletId={selectedOutletId}
          accounts={accounts}
          billToEdit={billToEdit}
          isOpen={isBillModalOpen}
          onClose={() => {
            setIsBillModalOpen(false);
            setBillToEdit(null);
          }}
          onSuccess={() => {
            setSuccessMessage(
              billToEdit ? 'Electricity bill modified successfully.' : 'New electricity bill registered successfully.'
            );
            refreshBillsAndSummary();
          }}
        />
      )}

      {/* Bill Detail Panel */}
      {selectedBillId && (
        <ElectricityBillDetailPanel
          billId={selectedBillId}
          accounts={accounts}
          canWriteBills={canWriteBills}
          canWritePayments={canWritePayments}
          onClose={() => setSelectedBillId(null)}
          onOpenEdit={b => {
            setBillToEdit(b);
            setIsBillModalOpen(true);
          }}
          onOpenMarkPaid={b => setBillForPayment(b)}
          onRefresh={refreshBillsAndSummary}
        />
      )}

      {/* Mark Bill Paid Modal */}
      {billForPayment && (
        <UtilityPaymentModal
          bill={billForPayment}
          isOpen={!!billForPayment}
          onClose={() => setBillForPayment(null)}
          onSuccess={() => {
            setSuccessMessage(`Payment recorded successfully for bill.`);
            refreshBillsAndSummary();
          }}
        />
      )}

      {/* Sub-Meter Create / Edit Modal */}
      {isSubMeterModalOpen && (
        <SubMeterModal
          outletId={selectedOutletId}
          subMeterToEdit={subMeterToEdit}
          isOpen={isSubMeterModalOpen}
          onClose={() => {
            setIsSubMeterModalOpen(false);
            setSubMeterToEdit(null);
          }}
          onSuccess={() => {
            setSuccessMessage(
              subMeterToEdit ? 'Sub-meter master updated successfully.' : 'Sub-meter created successfully.'
            );
            refreshSubMetersAndCharges();
          }}
        />
      )}

      {/* Sub-Meter Detail Panel */}
      {selectedSubMeterId && (
        <SubMeterDetailPanel
          subMeterId={selectedSubMeterId}
          canWriteSubMeters={canWriteSubMeters}
          canWriteReadings={canWriteReadings}
          onClose={() => setSelectedSubMeterId(null)}
          onOpenEdit={sm => {
            setSubMeterToEdit(sm);
            setIsSubMeterModalOpen(true);
          }}
          onOpenAddReading={(sm, latest) => {
            setSubMeterForReading({ subMeter: sm, latestReading: latest });
          }}
          onRefresh={refreshSubMetersAndCharges}
        />
      )}

      {/* Sub-Meter Reading Modal */}
      {subMeterForReading && (
        <SubMeterReadingModal
          subMeter={subMeterForReading.subMeter}
          latestReading={subMeterForReading.latestReading}
          isOpen={!!subMeterForReading}
          onClose={() => setSubMeterForReading(null)}
          onSuccess={() => {
            setSuccessMessage('Sub-meter reading recorded successfully.');
            refreshSubMetersAndCharges();
          }}
          onConflict={() => {
            refreshSubMetersAndCharges();
          }}
        />
      )}
    </div>
  );
};
