import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../services/api';
import { MunicipalTaxDue } from '../../../shared/types';
import { MunicipalTaxDocumentPicker } from './MunicipalTaxDocumentPicker';
import {
  formatTaxType,
  canSubmitMunicipalTaxPayment,
  getMunicipalTaxErrorMessage,
  formatDisplayDate,
} from './municipalTaxUi';
import { X, Loader2, CreditCard, Check, AlertCircle } from 'lucide-react';

interface MunicipalTaxPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  outletId: string;
  due: MunicipalTaxDue | null;
  onSuccess: (message?: string) => void;
}

export const MunicipalTaxPaymentModal: React.FC<MunicipalTaxPaymentModalProps> = ({
  isOpen,
  onClose,
  outletId,
  due,
  onSuccess,
}) => {
  const [paymentReceiptDocumentId, setPaymentReceiptDocumentId] = useState<string | null>(null);
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [paidAt, setPaidAt] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen) {
      setPaymentReceiptDocumentId(null);
      setPaymentReference('');
      // Default to current local datetime formatted as YYYY-MM-DDTHH:mm
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setPaidAt(`${year}-${month}-${day}T${hours}:${minutes}`);
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen || !due) return null;

  const isFormValid = canSubmitMunicipalTaxPayment(
    { paymentReceiptDocumentId: paymentReceiptDocumentId || '' },
    submitting
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!paymentReceiptDocumentId || paymentReceiptDocumentId.trim() === '') {
      setErrorMessage('Payment receipt document is mandatory to settle statutory dues.');
      return;
    }

    setSubmitting(true);

    try {
      const payload: {
        paymentReceiptDocumentId: string;
        paymentReference?: string;
        paidAt?: string;
      } = {
        paymentReceiptDocumentId: paymentReceiptDocumentId.trim(),
      };

      if (paymentReference.trim()) {
        payload.paymentReference = paymentReference.trim();
      }

      if (paidAt) {
        const d = new Date(paidAt);
        if (!isNaN(d.getTime())) {
          payload.paidAt = d.toISOString();
        }
      }

      const res = await apiFetch<MunicipalTaxDue>(`/api/v1/municipal-taxes/${due.id}/mark-paid`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res.success && res.data) {
        onSuccess('Statutory due marked as PAID successfully.');
        onClose();
      } else {
        if (res.error?.code === 'MUNICIPAL_TAX_ALREADY_PAID') {
          onSuccess(
            'This statutory due has already been marked as paid. The latest record has been reloaded.'
          );
          onClose();
        } else {
          setErrorMessage(getMunicipalTaxErrorMessage(res.error || res));
        }
      }
    } catch (err: any) {
      setErrorMessage(getMunicipalTaxErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Record Statutory Payment</h2>
              <p className="text-xs text-slate-400 font-mono">
                Settle municipal tax assessment with verifiable receipt
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 font-medium">
              {errorMessage}
            </div>
          )}

          {/* Due Info Card */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-sm">{formatTaxType(due.taxType)}</span>
              <span className="font-bold font-mono text-emerald-400 text-sm">
                ₹{due.amountStr || '0.00'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 font-mono">
              <div>
                <span className="text-slate-500 uppercase block text-[10px]">Authority</span>
                <span className="text-slate-300">{due.authorityName}</span>
              </div>
              <div>
                <span className="text-slate-500 uppercase block text-[10px]">Reference No</span>
                <span className="text-slate-300">{due.referenceNumber}</span>
              </div>
              <div>
                <span className="text-slate-500 uppercase block text-[10px]">Due Date</span>
                <span className="text-slate-300">{formatDisplayDate(due.dueDate)}</span>
              </div>
              <div>
                <span className="text-slate-500 uppercase block text-[10px]">Current Status</span>
                <span className="text-amber-400 font-semibold">{due.status}</span>
              </div>
            </div>
          </div>

          {/* Payment Receipt Document (Mandatory) */}
          <MunicipalTaxDocumentPicker
            outletId={outletId}
            selectedDocId={paymentReceiptDocumentId}
            onSelectDocId={setPaymentReceiptDocumentId}
            label="Payment Receipt / Challan Document"
            required={true}
            helpText="Upload or select the official paid challan or bank receipt document."
          />

          {/* Payment Reference Number */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1 uppercase tracking-wider text-[11px]">
              Payment Reference / Challan Number <span className="text-slate-500 font-normal normal-case">(Optional)</span>
            </label>
            <input
              type="text"
              value={paymentReference}
              onChange={e => setPaymentReference(e.target.value)}
              placeholder="e.g. UTR12345678 or CHLN/2026/9988"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Payment Date & Time */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1 uppercase tracking-wider text-[11px]">
              Payment Date & Time <span className="text-slate-500 font-normal normal-case">(Defaults to now)</span>
            </label>
            <input
              type="datetime-local"
              value={paidAt}
              onChange={e => setPaidAt(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !isFormValid}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-semibold shadow-lg shadow-emerald-500/20 transition-all"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              <span>{submitting ? 'Processing Payment...' : 'Confirm Payment'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
