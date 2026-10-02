import React from 'react';
import { UtilityElectricityAccount } from '../../../shared/types';
import { formatAccountStatus, formatDisplayDate } from './utilityUi';
import { Zap, Plus, Edit2, AlertCircle, Building2 } from 'lucide-react';

interface ElectricityAccountsPanelProps {
  accounts: UtilityElectricityAccount[];
  loading?: boolean;
  canWriteAccounts: boolean;
  onOpenCreate: () => void;
  onOpenEdit: (account: UtilityElectricityAccount) => void;
}

export const ElectricityAccountsPanel: React.FC<ElectricityAccountsPanelProps> = ({
  accounts,
  loading = false,
  canWriteAccounts,
  onOpenCreate,
  onOpenEdit,
}) => {
  if (loading) {
    return (
      <div className="p-8 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse space-y-4">
        <div className="h-6 w-48 bg-slate-800 rounded" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-slate-800/60 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Panel Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Electricity Consumer Accounts
            </h3>
            <p className="text-xs text-slate-400">
              {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'} registered for this retail outlet
            </p>
          </div>
        </div>

        {canWriteAccounts && (
          <button
            type="button"
            onClick={onOpenCreate}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors shadow-lg shadow-orange-500/20 shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            New Account
          </button>
        )}
      </div>

      {/* Content */}
      {accounts.length === 0 ? (
        <div className="p-12 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500 mx-auto">
            <Zap className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-white">No Electricity Accounts Found</h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            No main consumer meter accounts have been registered for this retail outlet yet.
          </p>
          {canWriteAccounts && (
            <button
              type="button"
              onClick={onOpenCreate}
              className="mt-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-orange-400 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors border border-slate-700"
            >
              <Plus className="w-3.5 h-3.5" />
              Register Electricity Account
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Desktop Table View */}
          <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Consumer Number</th>
                  <th className="py-3 px-4">Provider / DISCOM</th>
                  <th className="py-3 px-4">Billing Cycle</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Notes</th>
                  <th className="py-3 px-4 text-right">Registered</th>
                  {canWriteAccounts && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300 font-medium">
                {accounts.map(acc => {
                  const statusInfo = formatAccountStatus(acc.status);
                  return (
                    <tr key={acc.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-white font-mono">{acc.consumerNumber}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        {acc.providerName || <span className="text-slate-500 italic">Not Specified</span>}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-md text-[11px] font-semibold text-slate-300">
                          {acc.billingCycle}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusInfo.badgeClass}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 max-w-xs truncate text-[11px]">
                        {acc.notes || '-'}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-400 font-mono text-[11px]">
                        {formatDisplayDate(acc.createdAt)}
                      </td>
                      {canWriteAccounts && (
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => onOpenEdit(acc)}
                            className="p-1.5 text-slate-400 hover:text-orange-400 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Edit Account Details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Card View */}
          <div className="md:hidden space-y-3">
            {accounts.map(acc => {
              const statusInfo = formatAccountStatus(acc.status);
              return (
                <div
                  key={acc.id}
                  className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-white font-mono text-sm">
                        {acc.consumerNumber}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {acc.providerName || 'Provider Unspecified'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusInfo.badgeClass}`}
                      >
                        {statusInfo.label}
                      </span>
                      {canWriteAccounts && (
                        <button
                          type="button"
                          onClick={() => onOpenEdit(acc)}
                          className="p-1 text-slate-400 hover:text-orange-400 rounded-lg"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-800/80">
                    <div>
                      <span className="text-[11px] text-slate-500 block uppercase">Cycle</span>
                      <span className="text-slate-300 font-medium">{acc.billingCycle}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 block uppercase">Registered</span>
                      <span className="text-slate-300 font-medium font-mono">
                        {formatDisplayDate(acc.createdAt)}
                      </span>
                    </div>
                  </div>

                  {acc.notes && (
                    <div className="text-[11px] text-slate-400 bg-slate-950 p-2 rounded-lg">
                      {acc.notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
