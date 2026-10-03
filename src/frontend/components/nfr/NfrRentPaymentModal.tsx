import React, { useState } from 'react';
import { X, CreditCard, IndianRupee, AlertCircle, CheckCircle2, FileText, Calendar, Hash } from 'lucide-react';
import type { NfrRentDue, NfrRentPayment, NfrLease, NfrSpace, NfrVendor } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { getNfrErrorMessage, canSubmitNfrRentPayment } from './nfrUi';
import { NfrDocumentPicker } from './NfrDocumentPicker';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../../shared/constants';

export interface NfrRentPaymentModalProps {
  due: NfrRentDue | null;
  outletId: string;
  lease?: NfrLease;
  space?: NfrSpace;
  vendor?: NfrVendor;
  onClose: () => void;
  onSuccess: (message: string, payment: NfrRentPayment) => void;
  onConflict: () => void;
}

export const NfrRentPaymentModal: React.FC<NfrRentPaymentModalProps> = ({
  due,
  outletId,
  lease,
  space,
  vendor,
  onClose,
  onSuccess,
  onConflict,
}) => {
  const { hasPermission } = useAuth();
  const canReadDocs = hasPermission(PERMISSIONS.DOCUMENTS_READ);
  const canWriteDocs = hasPermission(PERMISSIONS.DOCUMENTS_WRITE);

  const [amount, setAmount] = useState<string>(due?.outstandingStr || '');
  const [receiptDocumentId, setReceiptDocumentId] = useState<string>('');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [paidAt, setPaidAt] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!due) return null;

  const hasVaultAccess = canReadDocs || canWriteDocs;
  const isFormValid = canSubmitNfrRentPayment({
    amount,
    receiptDocumentId,
    paymentReference,
    paidAt,
    notes,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) {
      setError('Please provide a valid payment amount and attach a receipt document.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      let isoPaidAt: string | undefined = undefined;
      if (paidAt) {
        const parsedDate = new Date(paidAt);
        if (!isNaN(parsedDate.getTime())) {
          isoPaidAt = parsedDate.toISOString();
        }
      }

      const payload: {
        amount: string;
        receiptDocumentId: string;
        paymentReference?: string;
        paidAt?: string;
        notes?: string;
      } = {
        amount: amount.trim(),
        receiptDocumentId: receiptDocumentId.trim(),
      };

      if (paymentReference.trim()) {
        payload.paymentReference = paymentReference.trim();
      }
      if (isoPaidAt) {
        payload.paidAt = isoPaidAt;
      }
      if (notes.trim()) {
        payload.notes = notes.trim();
      }

      const res = await apiFetch<{ payment: NfrRentPayment; due: NfrRentDue }>(
        `/api/v1/nfr/rent-dues/${due.id}/payments`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      if (res.success && res.data) {
        onSuccess(
          `Payment of ₹${res.data.payment.amountStr} recorded successfully.`,
          res.data.payment
        );
      } else {
        const errCode = typeof res.error === 'object' && res.error ? res.error.code : (typeof res.error === 'string' ? res.error : undefined);
        const errorMsg = getNfrErrorMessage(errCode || res.error || 'NFR_RENT_PAYMENT_FAILED');
        setError(errorMsg);
        if (
          errCode === 'NFR_RENT_OVERPAYMENT' ||
          errCode === 'NFR_RENT_ALREADY_PAID' ||
          errCode === 'NFR_RENT_DUE_NOT_FOUND'
        ) {
          setTimeout(() => {
            onConflict();
          }, 1500);
        }
      }
    } catch (err: any) {
      const errCode = typeof err === 'object' && err?.code ? err.code : err?.message;
      const errorMsg = getNfrErrorMessage(errCode || 'NFR_RENT_PAYMENT_FAILED');
      setError(errorMsg);
      if (
        errCode === 'NFR_RENT_OVERPAYMENT' ||
        errCode === 'NFR_RENT_ALREADY_PAID' ||
        errCode === 'NFR_RENT_DUE_NOT_FOUND'
      ) {
        setTimeout(() => {
          onConflict();
        }, 1500);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-2 text-amber-500">
            <CreditCard className="w-5 h-5" />
            <h2 className="text-base font-semibold text-slate-100">
              Record Rent Payment
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2.5 text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Ledger Summary Context Card */}
          <div className="p-4 bg-slate-800/60 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-400 block">Billing Month</span>
                <span className="font-semibold text-slate-100">{due.billingMonth}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block">Agreement</span>
                <span className="font-medium text-slate-200">
                  {lease ? lease.agreementNumber : due.leaseId}
                </span>
              </div>
            </div>

            {(space || vendor) && (
              <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-700/60">
                <div>
                  <span className="text-slate-500 block">Space</span>
                  <span className="text-slate-300 font-medium truncate block">
                    {space ? `${space.spaceCode} - ${space.name}` : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Vendor</span>
                  <span className="text-slate-300 font-medium truncate block">
                    {vendor ? vendor.vendorName : '—'}
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-slate-700/60 text-center">
              <div className="p-2 bg-slate-900/60 rounded-lg">
                <span className="text-slate-400 text-[11px] block">Rent Due</span>
                <span className="font-semibold text-slate-200">₹{due.monthlyRentStr}</span>
              </div>
              <div className="p-2 bg-slate-900/60 rounded-lg">
                <span className="text-slate-400 text-[11px] block">Total Paid</span>
                <span className="font-semibold text-emerald-400">₹{due.totalPaidStr}</span>
              </div>
              <div className="p-2 bg-slate-900/60 rounded-lg border border-amber-500/20">
                <span className="text-amber-400 text-[11px] block">Outstanding</span>
                <span className="font-bold text-amber-300">₹{due.outstandingStr}</span>
              </div>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Payment Amount (₹) <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <IndianRupee className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 35000 or 15000.50"
                required
                className="w-full pl-9 pr-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Supports partial or full collection up to the outstanding balance of ₹{due.outstandingStr}.
            </p>
          </div>

          {/* Required Receipt Document Picker */}
          <div>
            <NfrDocumentPicker
              selectedDocumentId={receiptDocumentId}
              outletId={outletId}
              label="Payment Receipt Attachment"
              onSelectDocument={(id: string | null) => setReceiptDocumentId(id || '')}
              required={true}
            />
            {!hasVaultAccess && (
              <div className="mt-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 text-xs">
                A receipt document is required to record this payment, but Document Vault access is not available for your current role.
              </div>
            )}
          </div>

          {/* Payment Reference */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Payment Reference / UTR <span className="text-slate-500">(Optional)</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Hash className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="e.g. UTR / NEFT / Cheque / Cash Receipt #"
                className="w-full pl-9 pr-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
          </div>

          {/* Paid At Timestamp */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Payment Date & Time <span className="text-slate-500">(Optional, defaults to now)</span>
            </label>
            <input
              type="datetime-local"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Notes <span className="text-slate-500">(Optional)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Operational notes regarding this collection..."
              className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isFormValid || !receiptDocumentId}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-semibold rounded-lg transition disabled:opacity-50 inline-flex items-center gap-2 shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-slate-950 border-t-transparent" />
                  <span>Recording...</span>
                </>
              ) : (
                <span>Confirm Payment</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
