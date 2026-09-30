import React, { useState, useEffect } from 'react';
import { LubeShiftSummary, OperationalShift, ShiftFinancialSummary } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { AlertCircle, RefreshCw, BarChart3, Banknote, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../../shared/constants';

interface LubeSummaryPanelProps {
  shift: OperationalShift | null;
  shiftSummary: LubeShiftSummary | null;
  loading: boolean;
  onRefresh: () => void;
}

export const LubeSummaryPanel: React.FC<LubeSummaryPanelProps> = ({
  shift,
  shiftSummary,
  loading,
  onRefresh,
}) => {
  const { hasPermission } = useAuth();
  const hasFinRead = hasPermission(PERMISSIONS.FINANCIAL_RECONCILIATION_READ);

  const [finSummary, setFinSummary] = useState<ShiftFinancialSummary | null>(null);
  const [loadingFin, setLoadingFin] = useState(false);

  useEffect(() => {
    if (!shift || !hasFinRead) {
      setFinSummary(null);
      return;
    }

    const fetchFinSummary = async () => {
      setLoadingFin(true);
      try {
        const res = await apiFetch<ShiftFinancialSummary>(`/api/v1/shifts/${shift.id}/financial-summary`);
        if (res.success) {
          setFinSummary(res.data);
        } else {
          setFinSummary(null);
        }
      } catch {
        setFinSummary(null);
      } finally {
        setLoadingFin(false);
      }
    };

    fetchFinSummary();
  }, [shift, shiftSummary, hasFinRead]); // Re-fetch on shift or sales update to stay accurate

  if (!shift) {
    return (
      <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl space-y-2">
        <AlertCircle className="w-8 h-8 text-slate-500 mx-auto" />
        <h4 className="text-sm font-semibold text-white">No Shift Selected</h4>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Please select an operational shift from the header context to view the shift summary.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Shift Lube Summary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* KPI: Total Shift Revenue */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-4">
          <div className="space-y-1">
            <h4 className="text-[10px] text-slate-500 font-semibold tracking-wider font-mono uppercase">
              Shift Lube Sales Revenue
            </h4>
            <div className="text-2xl font-black font-mono text-orange-400 mt-1 tabular-nums">
              ₹{shiftSummary?.totalRevenueStr || '0.00'}
            </div>
          </div>
          <div className="text-[11px] text-slate-400">
            Authoritative backend summary total for {shiftSummary?.bySku?.length || 0} unique SKUs sold during this shift.
          </div>
        </div>

        {/* Litres Sold KPI */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-4">
          <div className="space-y-1">
            <h4 className="text-[10px] text-slate-500 font-semibold tracking-wider font-mono uppercase">
              Litre Volume Sold
            </h4>
            <div className="text-2xl font-black font-mono text-emerald-500 mt-1 tabular-nums">
              {shiftSummary?.quantitiesByUnit?.litre || '0.000'} <span className="text-[11px] text-slate-500 font-normal">L</span>
            </div>
          </div>
          <div className="text-[11px] text-slate-400">
            Sum of all LITRE unit products. Retains separation from packed quantities.
          </div>
        </div>

        {/* Packs Sold KPI */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-4">
          <div className="space-y-1">
            <h4 className="text-[10px] text-slate-500 font-semibold tracking-wider font-mono uppercase">
              Packed Units Sold
            </h4>
            <div className="text-2xl font-black font-mono text-amber-500 mt-1 tabular-nums">
              {shiftSummary?.quantitiesByUnit?.pack || '0'} <span className="text-[11px] text-slate-500 font-normal">Packs</span>
            </div>
          </div>
          <div className="text-[11px] text-slate-400">
            Sum of all physical discrete PACK units sold.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: SKU summary list */}
        <div className="lg:col-span-2 space-y-3">
          <h4 className="text-xs font-bold text-white tracking-wider uppercase font-mono">Shift SKU-wise sales break-up</h4>
          {shiftSummary?.bySku && shiftSummary.bySku.length > 0 ? (
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">SKU Code</th>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4 text-right">Transactions</th>
                    <th className="py-3 px-4 text-right">Quantity Sold</th>
                    <th className="py-3 px-4 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-xs">
                  {shiftSummary.bySku.map((item) => (
                    <tr key={item.lubeSkuId} className="hover:bg-slate-800/40 text-slate-300">
                      <td className="py-3 px-4 font-mono font-bold text-white">{item.skuCode}</td>
                      <td className="py-3 px-4 font-medium text-slate-100">{item.skuName}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">{item.saleCount}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-200 tabular-nums">
                        {item.quantity} <span className="text-[10px] text-slate-500 font-normal">{item.stockUnit}</span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-extrabold text-orange-400 tabular-nums">
                        ₹{item.revenueStr}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl text-center text-xs text-slate-400 italic">
              No sales logged for this operational shift yet.
            </div>
          )}
        </div>

        {/* Right: Authoritative Financial summary card */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-white tracking-wider uppercase font-mono">Financial Reconciliation Context</h4>
          {!hasFinRead ? (
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl text-center text-xs text-slate-400 leading-relaxed italic">
              Financial reconciliation details are not available for your role.
            </div>
          ) : loadingFin ? (
            <div className="p-8 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-orange-500 animate-spin" />
            </div>
          ) : finSummary ? (
            <div className="p-5 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl space-y-4">
              <div className="flex items-center gap-2.5 text-orange-500">
                <Banknote className="w-5 h-5 shrink-0" />
                <h5 className="text-xs font-bold font-mono uppercase tracking-wider">Shift Revenue Integration</h5>
              </div>

              <div className="space-y-3 text-xs border-b border-slate-800/50 pb-3">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Lube Sales:</span>
                  <span className="font-mono font-bold text-orange-400 tabular-nums">₹{finSummary.salesRevenue?.lubeTotalStr || '0.00'}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Fuel Sales:</span>
                  <span className="font-mono text-slate-200 tabular-nums">₹{finSummary.salesRevenue?.fuelTotalStr || '0.00'}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>CNG Sales:</span>
                  <span className="font-mono text-slate-200 tabular-nums">₹{finSummary.salesRevenue?.cngTotalStr || '0.00'}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">
                    Authoritative Total Sales
                  </div>
                  <div className="text-base font-extrabold font-mono text-white mt-1 tabular-nums">
                    ₹{finSummary.salesRevenue?.authoritativeTotalStr || '0.00'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">
                    Variance Status
                  </div>
                  <span className={`text-xs font-bold font-mono tracking-wider uppercase inline-block mt-1 ${
                    finSummary.varianceStatus === 'BALANCED' ? 'text-emerald-500' :
                    finSummary.varianceStatus === 'SHORTAGE' ? 'text-rose-500' :
                    finSummary.varianceStatus === 'EXCESS' ? 'text-amber-500' : 'text-slate-400'
                  }`}>
                    {finSummary.varianceStatus || 'Unreconciled'}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-900 rounded-xl flex items-start gap-2.5 text-[11px] text-slate-400 leading-normal">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>
                  This financial summary is integrated in real-time. Closing this shift locks this summary authoritatively.
                </span>
              </div>
            </div>
          ) : (
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl text-center text-xs text-slate-500 italic">
              Failed to load Shift Financial Summary.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
