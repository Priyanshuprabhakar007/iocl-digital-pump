import React, { useState } from 'react';
import { X, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { NfrLease } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { getNfrErrorMessage } from './nfrUi';

export interface NfrLeaseTerminateModalProps {
  lease: NfrLease | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onConflict: () => void;
}

export const NfrLeaseTerminateModal: React.FC<NfrLeaseTerminateModalProps> = ({
  lease,
  onClose,
  onSuccess,
  onConflict,
}) => {
  const [terminationReason, setTerminationReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!lease) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const trimmedReason = terminationReason.trim();
      const payload: { terminationReason?: string } = {};
      if (trimmedReason) {
        payload.terminationReason = trimmedReason;
      }

      const res = await apiFetch<any>(
        `/api/v1/nfr/leases/${lease.id}/terminate`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      if (res.success) {
        onSuccess('Lease terminated successfully.');
      } else {
        const errCode = typeof res.error === 'object' && res.error ? res.error.code : (typeof res.error === 'string' ? res.error : undefined);
        const errorMsg = getNfrErrorMessage(errCode || res.error || 'NFR_LEASE_TERMINATE_FAILED');
        setError(errorMsg);
        if (errCode === 'NFR_LEASE_ALREADY_TERMINATED' || errCode === 'NFR_LEASE_STATE_CHANGED') {
          setTimeout(() => {
            onConflict();
          }, 1500);
        }
      }
    } catch (err: any) {
      const errCode = typeof err === 'object' && err?.code ? err.code : err?.message;
      const errorMsg = getNfrErrorMessage(errCode || 'NFR_LEASE_TERMINATE_FAILED');
      setError(errorMsg);
      if (errCode === 'NFR_LEASE_ALREADY_TERMINATED' || errCode === 'NFR_LEASE_STATE_CHANGED') {
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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-2 text-rose-400">
            <AlertTriangle className="w-5 h-5" />
            <h2 className="text-base font-semibold text-slate-100">
              Terminate Lease Agreement
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

          <div className="p-3.5 bg-rose-500/5 border border-rose-500/20 rounded-xl text-xs space-y-1.5">
            <p className="text-slate-200 font-medium">
              Are you sure you want to terminate agreement{' '}
              <span className="text-rose-400 font-semibold">{lease.agreementNumber}</span>?
            </p>
            <p className="text-slate-400">
              This action is permanent and cannot be undone. No further rent dues will be eligible for future dates, though existing rent dues remain.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Termination Reason <span className="text-slate-500">(Optional)</span>
            </label>
            <textarea
              rows={3}
              value={terminationReason}
              onChange={(e) => setTerminationReason(e.target.value)}
              placeholder="Provide context or operational reason for early termination..."
              className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
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
              disabled={isSubmitting}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 inline-flex items-center gap-2 shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                  <span>Terminating...</span>
                </>
              ) : (
                <span>Confirm Termination</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
