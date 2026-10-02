import React, { useState } from 'react';
import { UtilityElectricityAccount, UtilityElectricityAccountStatus } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { getUtilityErrorMessage } from './utilityUi';
import { X, Zap, Loader2, AlertCircle } from 'lucide-react';

interface ElectricityAccountModalProps {
  outletId: string;
  accountToEdit?: UtilityElectricityAccount | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ElectricityAccountModal: React.FC<ElectricityAccountModalProps> = ({
  outletId,
  accountToEdit,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const isEdit = !!accountToEdit;

  const [consumerNumber, setConsumerNumber] = useState(accountToEdit?.consumerNumber || '');
  const [providerName, setProviderName] = useState(accountToEdit?.providerName || '');
  const [billingCycle, setBillingCycle] = useState(accountToEdit?.billingCycle || 'MONTHLY');
  const [status, setStatus] = useState<UtilityElectricityAccountStatus>(accountToEdit?.status || 'ACTIVE');
  const [notes, setNotes] = useState(accountToEdit?.notes || '');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!isEdit && !consumerNumber.trim()) {
      setErrorMsg('Consumer Number is required.');
      return;
    }
    if (!billingCycle.trim()) {
      setErrorMsg('Billing Cycle is required.');
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && accountToEdit) {
        const payload = {
          providerName: providerName.trim() || null,
          billingCycle: billingCycle.trim(),
          status,
          notes: notes.trim() || null,
        };

        const res = await apiFetch<UtilityElectricityAccount>(
          `/api/v1/utilities/electricity-accounts/${accountToEdit.id}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload),
          }
        );

        if (res.success) {
          onSuccess();
          onClose();
        } else {
          setErrorMsg(getUtilityErrorMessage(res.error));
        }
      } else {
        const payload = {
          consumerNumber: consumerNumber.trim(),
          providerName: providerName.trim() || null,
          billingCycle: billingCycle.trim(),
          status,
          notes: notes.trim() || null,
        };

        const res = await apiFetch<UtilityElectricityAccount>(
          `/api/v1/outlets/${outletId}/utilities/electricity-accounts`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );

        if (res.success) {
          onSuccess();
          onClose();
        } else {
          setErrorMsg(getUtilityErrorMessage(res.error));
        }
      }
    } catch (err: any) {
      setErrorMsg(getUtilityErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                {isEdit ? 'Edit Electricity Account' : 'New Electricity Account'}
              </h2>
              <p className="text-xs text-slate-400">
                {isEdit ? 'Update billing cycle and provider details' : 'Register a main electricity consumer account'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Consumer Number */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Consumer / Account Number {!isEdit && <span className="text-orange-400">*</span>}
            </label>
            <input
              type="text"
              value={consumerNumber}
              onChange={e => setConsumerNumber(e.target.value)}
              disabled={isEdit || submitting}
              placeholder="e.g. CA-9928172635"
              className={`w-full px-3.5 py-2.5 rounded-xl text-sm border transition-all ${
                isEdit
                  ? 'bg-slate-800/60 border-slate-800 text-slate-400 cursor-not-allowed'
                  : 'bg-slate-950 border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/60'
              }`}
            />
            {isEdit && (
              <p className="text-[11px] text-slate-500">
                Consumer number is immutable after registration.
              </p>
            )}
          </div>

          {/* Electricity Provider */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Provider / DISCOM Name
            </label>
            <input
              type="text"
              value={providerName}
              onChange={e => setProviderName(e.target.value)}
              disabled={submitting}
              placeholder="e.g. CESC / WBSEDCL / BSES Rajdhani"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/60 transition-all"
            />
          </div>

          {/* Billing Cycle & Status Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Billing Cycle <span className="text-orange-400">*</span>
              </label>
              <select
                value={billingCycle}
                onChange={e => setBillingCycle(e.target.value)}
                disabled={submitting}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-orange-500/60 transition-all"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="BI_MONTHLY">Bi-Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Account Status <span className="text-orange-400">*</span>
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as UtilityElectricityAccountStatus)}
                disabled={submitting}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-orange-500/60 transition-all"
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Operational Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={submitting}
              rows={3}
              placeholder="Sanctioned load (kW), transformer/meter location notes..."
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/60 transition-all resize-none"
            />
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-xl text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-orange-500/20"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : isEdit ? (
                'Save Changes'
              ) : (
                'Create Account'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
