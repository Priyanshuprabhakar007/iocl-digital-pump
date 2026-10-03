import React, { useState } from 'react';
import { X, Calendar, AlertCircle, PlusCircle, Building2, Users } from 'lucide-react';
import type { NfrLease, NfrRentDue, NfrSpace, NfrVendor } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { getNfrErrorMessage } from './nfrUi';

export interface NfrRentDueGenerateModalProps {
  lease: NfrLease | null;
  spaces: NfrSpace[];
  vendors: NfrVendor[];
  onClose: () => void;
  onSuccess: (message: string, due: NfrRentDue) => void;
}

export const NfrRentDueGenerateModal: React.FC<NfrRentDueGenerateModalProps> = ({
  lease,
  spaces,
  vendors,
  onClose,
  onSuccess,
}) => {
  const currentMonthStr = new Date().toISOString().substring(0, 7);
  const [billingMonth, setBillingMonth] = useState<string>(currentMonthStr);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!lease) return null;

  const space = spaces.find((s) => s.id === lease.spaceId);
  const vendor = vendors.find((v) => v.id === lease.vendorId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billingMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth)) {
      setError('Please select a valid billing month (YYYY-MM).');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await apiFetch<NfrRentDue>(
        `/api/v1/nfr/leases/${lease.id}/rent-dues`,
        {
          method: 'POST',
          body: JSON.stringify({ billingMonth }),
        }
      );

      if (res.success && res.data) {
        onSuccess(`Rent due generated successfully for ${billingMonth}.`, res.data);
      } else {
        const errCode = typeof res.error === 'object' && res.error ? res.error.code : (typeof res.error === 'string' ? res.error : undefined);
        setError(getNfrErrorMessage(errCode || res.error || 'NFR_RENT_DUE_CREATE_FAILED'));
      }
    } catch (err: any) {
      const errCode = typeof err === 'object' && err?.code ? err.code : err?.message;
      setError(getNfrErrorMessage(errCode || 'NFR_RENT_DUE_CREATE_FAILED'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-2 text-amber-500">
            <PlusCircle className="w-5 h-5" />
            <h2 className="text-base font-semibold text-slate-100">
              Generate Monthly Rent Due
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

          {/* Lease Context Card */}
          <div className="p-3.5 bg-slate-800/60 border border-slate-800 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Agreement Number</span>
              <span className="font-semibold text-slate-100">{lease.agreementNumber}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Space</span>
              <span className="font-medium text-slate-200">
                {space ? `${space.spaceCode} - ${space.name}` : lease.spaceId}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Vendor</span>
              <span className="font-medium text-slate-200">
                {vendor ? vendor.vendorName : lease.vendorId}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-700/60">
              <span className="text-slate-400">Monthly Rent</span>
              <span className="font-bold text-amber-400">₹{lease.monthlyRentStr}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Billing Month <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <input
                type="month"
                value={billingMonth}
                onChange={(e) => setBillingMonth(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              The backend will snapshot the monthly rent, calculate period dates, and compute the due date automatically.
            </p>
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
              disabled={isSubmitting}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-semibold rounded-lg transition disabled:opacity-50 inline-flex items-center gap-2 shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-slate-950 border-t-transparent" />
                  <span>Generating...</span>
                </>
              ) : (
                <span>Generate Rent Due</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
