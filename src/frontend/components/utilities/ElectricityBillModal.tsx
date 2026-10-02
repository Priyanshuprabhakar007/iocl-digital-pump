import React, { useState } from 'react';
import { UtilityElectricityBill, UtilityElectricityAccount } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { getUtilityErrorMessage, validateDateRange } from './utilityUi';
import { UtilityDocumentPicker } from './UtilityDocumentPicker';
import { X, FileText, Loader2, AlertCircle, Calendar } from 'lucide-react';

interface ElectricityBillModalProps {
  outletId: string;
  accounts: UtilityElectricityAccount[];
  billToEdit?: UtilityElectricityBill | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ElectricityBillModal: React.FC<ElectricityBillModalProps> = ({
  outletId,
  accounts,
  billToEdit,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const isEdit = !!billToEdit;

  const activeAccounts = accounts.filter(a => a.status === 'ACTIVE');
  const defaultAccountId = billToEdit?.electricityAccountId || (activeAccounts[0]?.id || accounts[0]?.id || '');

  const [electricityAccountId, setElectricityAccountId] = useState(defaultAccountId);
  const [billingPeriodStart, setBillingPeriodStart] = useState(billToEdit?.billingPeriodStart || '');
  const [billingPeriodEnd, setBillingPeriodEnd] = useState(billToEdit?.billingPeriodEnd || '');
  const [billAmount, setBillAmount] = useState(billToEdit?.billAmountStr || '');
  const [dueDate, setDueDate] = useState(billToEdit?.dueDate || '');
  const [billDocumentId, setBillDocumentId] = useState(billToEdit?.billDocumentId || '');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!isEdit && !electricityAccountId) {
      setErrorMsg('Please select an electricity consumer account.');
      return;
    }
    if (!billingPeriodStart || !billingPeriodEnd) {
      setErrorMsg('Billing period start and end dates are required.');
      return;
    }
    const rangeCheck = validateDateRange(billingPeriodStart, billingPeriodEnd);
    if (!rangeCheck.valid) {
      setErrorMsg(rangeCheck.error || 'billingPeriodEnd must be on or after billingPeriodStart.');
      return;
    }
    if (!billAmount.trim() || !/^\d+(\.\d{1,2})?$/.test(billAmount.trim())) {
      setErrorMsg('Please enter a valid bill amount with up to 2 decimal places (e.g. 84500.50).');
      return;
    }
    if (!dueDate) {
      setErrorMsg('Due date is required.');
      return;
    }
    if (!billDocumentId.trim()) {
      setErrorMsg('A bill document reference is mandatory. Please select or upload a bill copy.');
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && billToEdit) {
        const payload = {
          billingPeriodStart,
          billingPeriodEnd,
          billAmount: billAmount.trim(),
          dueDate,
          billDocumentId: billDocumentId.trim(),
        };

        const res = await apiFetch<UtilityElectricityBill>(
          `/api/v1/utilities/electricity-bills/${billToEdit.id}`,
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
          electricityAccountId,
          billingPeriodStart,
          billingPeriodEnd,
          billAmount: billAmount.trim(),
          dueDate,
          billDocumentId: billDocumentId.trim(),
        };

        const res = await apiFetch<UtilityElectricityBill>(
          `/api/v1/outlets/${outletId}/utilities/electricity-bills`,
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

  const selectedAccount = accounts.find(a => a.id === (isEdit ? billToEdit?.electricityAccountId : electricityAccountId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                {isEdit ? 'Edit Pending Electricity Bill' : 'New Electricity Bill'}
              </h2>
              <p className="text-xs text-slate-400">
                {isEdit ? 'Modify billing period, amount or attached document copy' : 'Register a new electricity bill invoice'}
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

          {/* Account Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Consumer Account <span className="text-orange-400">*</span>
            </label>
            {isEdit ? (
              <div className="p-3 bg-slate-800/60 border border-slate-800 rounded-xl text-xs text-slate-300 flex justify-between items-center">
                <div>
                  <span className="font-bold font-mono text-white">
                    {selectedAccount?.consumerNumber || billToEdit?.electricityAccountId}
                  </span>
                  <span className="text-slate-400 ml-2">
                    ({selectedAccount?.providerName || 'Provider'})
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">Immutable</span>
              </div>
            ) : accounts.length === 0 ? (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300">
                No electricity accounts registered for this outlet. Please create an account first.
              </div>
            ) : (
              <select
                value={electricityAccountId}
                onChange={e => setElectricityAccountId(e.target.value)}
                disabled={submitting}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-orange-500/60 transition-all"
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.consumerNumber} — {acc.providerName || 'DISCOM'} ({acc.billingCycle}) {acc.status !== 'ACTIVE' ? `[${acc.status}]` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Billing Period Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Period Start <span className="text-orange-400">*</span>
              </label>
              <input
                type="date"
                value={billingPeriodStart}
                onChange={e => setBillingPeriodStart(e.target.value)}
                disabled={submitting}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-orange-500/60 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Period End <span className="text-orange-400">*</span>
              </label>
              <input
                type="date"
                value={billingPeriodEnd}
                onChange={e => setBillingPeriodEnd(e.target.value)}
                disabled={submitting}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-orange-500/60 transition-all"
              />
            </div>
          </div>

          {/* Bill Amount & Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Bill Amount (₹) <span className="text-orange-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-semibold">
                  ₹
                </span>
                <input
                  type="text"
                  value={billAmount}
                  onChange={e => setBillAmount(e.target.value)}
                  disabled={submitting}
                  placeholder="84500.50"
                  className="w-full pl-8 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white font-mono placeholder-slate-600 focus:outline-none focus:border-orange-500/60 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Payment Due Date <span className="text-orange-400">*</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                disabled={submitting}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-orange-500/60 transition-all"
              />
            </div>
          </div>

          {/* Bill Document Attachment */}
          <div className="pt-2 border-t border-slate-800">
            <UtilityDocumentPicker
              outletId={outletId}
              selectedDocId={billDocumentId}
              onSelectDocId={setBillDocumentId}
              label="Bill Invoice Copy"
              required
              helpText="Attach a scanned copy or PDF of the utility electricity bill from Document Vault."
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
              disabled={submitting || accounts.length === 0 || !billDocumentId.trim()}
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
                'Create Bill'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
