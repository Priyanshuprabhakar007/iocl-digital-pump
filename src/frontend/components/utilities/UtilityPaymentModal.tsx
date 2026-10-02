import React, { useState } from 'react';
import { UtilityElectricityBill } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { getUtilityErrorMessage } from './utilityUi';
import { UtilityDocumentPicker } from './UtilityDocumentPicker';
import { X, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

interface UtilityPaymentModalProps {
  bill: UtilityElectricityBill;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const UtilityPaymentModal: React.FC<UtilityPaymentModalProps> = ({
  bill,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [paymentReceiptDocumentId, setPaymentReceiptDocumentId] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paidAtLocal, setPaidAtLocal] = useState(() => {
    const now = new Date();
    // format as YYYY-MM-DDTHH:mm
    const tzOffset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
    return localISOTime;
  });

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!paymentReceiptDocumentId.trim()) {
      setErrorMsg('A payment receipt document is mandatory to record bill payment settlement.');
      return;
    }

    setSubmitting(true);
    try {
      const paidAtIso = paidAtLocal ? new Date(paidAtLocal).toISOString() : new Date().toISOString();

      const payload = {
        paymentReceiptDocumentId: paymentReceiptDocumentId.trim(),
        paymentReference: paymentReference.trim() || null,
        paidAt: paidAtIso,
      };

      const res = await apiFetch<UtilityElectricityBill>(
        `/api/v1/utilities/electricity-bills/${bill.id}/mark-paid`,
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
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Record Bill Payment
              </h2>
              <p className="text-xs text-slate-400">
                Settle electricity bill invoice of ₹{bill.billAmountStr}
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

          {/* Bill Summary Banner */}
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-1">
            <div className="flex justify-between items-center text-slate-400">
              <span>Billing Period:</span>
              <span className="font-mono text-white font-medium">
                {bill.billingPeriodStart} to {bill.billingPeriodEnd}
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Total Payable Amount:</span>
              <span className="text-emerald-400 font-bold font-mono text-sm">
                ₹{bill.billAmountStr}
              </span>
            </div>
          </div>

          {/* Payment Receipt Attachment */}
          <UtilityDocumentPicker
            outletId={bill.outletId}
            selectedDocId={paymentReceiptDocumentId}
            onSelectDocId={setPaymentReceiptDocumentId}
            label="Payment Receipt Copy"
            required
            helpText="Attach bank transaction receipt, NEFT/RTGS advice, or signed payment confirmation."
          />

          {/* Payment Reference */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Payment Reference / Transaction UTR
            </label>
            <input
              type="text"
              value={paymentReference}
              onChange={e => setPaymentReference(e.target.value)}
              disabled={submitting}
              placeholder="e.g. UTR-20261002-99887711 / Cheque No. 449012"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/60 transition-all font-mono"
            />
          </div>

          {/* Paid At Timestamp */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Payment Settlement Date & Time
            </label>
            <input
              type="datetime-local"
              value={paidAtLocal}
              onChange={e => setPaidAtLocal(e.target.value)}
              disabled={submitting}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500/60 transition-all font-mono"
            />
          </div>

          {/* Terminal Notice */}
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-300">
            Payment registration is a terminal lifecycle event. Once recorded, financial fields on this bill become immutable.
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
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-emerald-600/20"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Confirm Payment'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
