import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../services/api';
import { PERMISSIONS } from '../../../shared/constants';
import {
  NfrLease,
  NfrSpace,
  NfrVendor,
  UtilitySubMeter,
} from '../../../shared/types';
import { NfrDocumentPicker } from './NfrDocumentPicker';
import {
  canSubmitNfrLease,
  getNfrErrorMessage,
  formatNfrType,
} from './nfrUi';
import {
  X,
  FileText,
  AlertCircle,
  Loader2,
  Calendar,
  IndianRupee,
  Zap,
} from 'lucide-react';

export interface NfrLeaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  leaseToEdit?: NfrLease | null;
  outletId: string;
  spaces: NfrSpace[];
  vendors: NfrVendor[];
  onSuccess: (message: string) => void;
  onConflict?: () => void;
}

export const NfrLeaseModal: React.FC<NfrLeaseModalProps> = ({
  isOpen,
  onClose,
  leaseToEdit,
  outletId,
  spaces,
  vendors,
  onSuccess,
  onConflict,
}) => {
  const isEdit = Boolean(leaseToEdit);
  const { hasPermission } = useAuth();
  const canReadUtilities = hasPermission(PERMISSIONS.UTILITIES_READ);

  // Form Fields
  const [spaceId, setSpaceId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [agreementNumber, setAgreementNumber] = useState('');
  const [leaseStartDate, setLeaseStartDate] = useState('');
  const [leaseEndDate, setLeaseEndDate] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [securityDeposit, setSecurityDeposit] = useState('');
  const [monthlyDueDay, setMonthlyDueDay] = useState<number | string>(1);
  const [agreementDocumentId, setAgreementDocumentId] = useState<string | null>(null);
  const [subMeterId, setSubMeterId] = useState<string>('');
  const [notes, setNotes] = useState('');

  // Sub-meters list
  const [subMeters, setSubMeters] = useState<UtilitySubMeter[]>([]);
  const [loadingSubMeters, setLoadingSubMeters] = useState(false);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load Sub-meters if user has permissions
  useEffect(() => {
    if (!isOpen || !outletId || !canReadUtilities) {
      setSubMeters([]);
      return;
    }

    let isMounted = true;
    setLoadingSubMeters(true);

    apiFetch<{ success: boolean; data: UtilitySubMeter[] }>(
      `/api/v1/outlets/${outletId}/utilities/sub-meters`
    )
      .then(res => {
        if (isMounted && res.success && Array.isArray(res.data)) {
          // Filter to NFR_VENDOR only and matching outlet
          const nfrMeters = res.data.filter(
            m => m.outletId === outletId && m.beneficiaryType === 'NFR_VENDOR'
          );
          setSubMeters(nfrMeters);
        }
      })
      .catch(() => {
        if (isMounted) setSubMeters([]);
      })
      .finally(() => {
        if (isMounted) setLoadingSubMeters(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, outletId, canReadUtilities]);

  // Initialize or Reset Form
  useEffect(() => {
    if (leaseToEdit) {
      setSpaceId(leaseToEdit.spaceId);
      setVendorId(leaseToEdit.vendorId);
      setAgreementNumber(leaseToEdit.agreementNumber);
      setLeaseStartDate(leaseToEdit.leaseStartDate);
      setLeaseEndDate(leaseToEdit.leaseEndDate);
      setMonthlyRent(leaseToEdit.monthlyRentStr || '');
      setSecurityDeposit(leaseToEdit.securityDepositStr || '0');
      setMonthlyDueDay(leaseToEdit.monthlyDueDay || 1);
      setAgreementDocumentId(leaseToEdit.agreementDocumentId || null);
      setSubMeterId(leaseToEdit.subMeterId || '');
      setNotes(leaseToEdit.notes || '');
    } else {
      setSpaceId('');
      setVendorId('');
      setAgreementNumber('');
      setLeaseStartDate('');
      setLeaseEndDate('');
      setMonthlyRent('');
      setSecurityDeposit('0');
      setMonthlyDueDay(1);
      setAgreementDocumentId(null);
      setSubMeterId('');
      setNotes('');
    }
    setErrorMessage(null);
    setIsSubmitting(false);
  }, [leaseToEdit, isOpen]);

  if (!isOpen) return null;

  // Space options: on create, show ACTIVE; on edit, ensure currently selected space remains visible even if inactive
  const spaceOptions = spaces.filter(
    s => s.status === 'ACTIVE' || (isEdit && s.id === leaseToEdit?.spaceId)
  );

  // Vendor options: on create, show ACTIVE; on edit, ensure currently selected vendor remains visible even if inactive
  const vendorOptions = vendors.filter(
    v => v.status === 'ACTIVE' || (isEdit && v.id === leaseToEdit?.vendorId)
  );

  // Client-side date check
  const isDateOrderValid = !leaseStartDate || !leaseEndDate || leaseEndDate >= leaseStartDate;

  const isValid =
    canSubmitNfrLease(
      {
        spaceId,
        vendorId,
        agreementNumber,
        leaseStartDate,
        leaseEndDate,
        monthlyRent,
        securityDeposit,
        monthlyDueDay,
      },
      isSubmitting
    ) && isDateOrderValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDateOrderValid) {
      setErrorMessage('Lease end date cannot be before lease start date.');
      return;
    }
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload: any = {
        spaceId,
        vendorId,
        agreementNumber: agreementNumber.trim(),
        leaseStartDate,
        leaseEndDate,
        monthlyRent: monthlyRent.trim(),
        securityDeposit: securityDeposit.trim() || '0',
        monthlyDueDay: typeof monthlyDueDay === 'number' ? monthlyDueDay : parseInt(String(monthlyDueDay), 10),
        agreementDocumentId: agreementDocumentId || undefined,
        subMeterId: subMeterId || undefined,
        notes: notes.trim() || undefined,
      };

      if (isEdit && leaseToEdit) {
        const res = await apiFetch<NfrLease>(
          `/api/v1/nfr/leases/${leaseToEdit.id}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload),
          }
        );
        if (res.success) {
          onSuccess('Lease agreement updated successfully.');
          onClose();
        } else {
          const errCode = typeof res.error === 'object' && res.error ? res.error.code : (typeof res.error === 'string' ? res.error : undefined);
          const errText = getNfrErrorMessage(errCode || res.error || 'NFR_LEASE_UPDATE_FAILED');
          setErrorMessage(errText);
          if (errCode === 'NFR_LEASE_STATE_CHANGED' || errCode === 'NFR_LEASE_ALREADY_TERMINATED') {
            setTimeout(() => {
              if (onConflict) onConflict();
            }, 1500);
          }
        }
      } else {
        const res = await apiFetch<NfrLease>(
          `/api/v1/outlets/${outletId}/nfr/leases`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );
        if (res.success) {
          onSuccess('Lease agreement created successfully.');
          onClose();
        } else {
          const errCode = typeof res.error === 'object' && res.error ? res.error.code : (typeof res.error === 'string' ? res.error : undefined);
          setErrorMessage(getNfrErrorMessage(errCode || res.error || 'NFR_LEASE_CREATE_FAILED'));
        }
      }
    } catch (err: any) {
      const errCode = typeof err === 'object' && err?.code ? err.code : err?.message;
      const errText = getNfrErrorMessage(errCode || 'NFR_LEASE_OPERATION_FAILED');
      setErrorMessage(errText);
      if (errCode === 'NFR_LEASE_STATE_CHANGED' || errCode === 'NFR_LEASE_ALREADY_TERMINATED') {
        setTimeout(() => {
          if (onConflict) onConflict();
        }, 1500);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isEdit ? 'Edit Lease Agreement' : 'Create Lease Agreement'}
              </h3>
              <p className="text-xs text-slate-400">
                {isEdit
                  ? `Update terms for agreement ${leaseToEdit?.agreementNumber}`
                  : 'Link a commercial space to a vendor with contractual rent terms'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2 text-xs text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Space & Vendor Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Commercial Space <span className="text-rose-400">*</span>
              </label>
              <select
                value={spaceId}
                onChange={e => setSpaceId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
                required
              >
                <option value="">Select NFR Space</option>
                {spaceOptions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.spaceCode} - {s.name} ({formatNfrType(s.nfrType)})
                    {s.isCurrentlyLeased ? ' [Currently leased]' : ''}
                    {s.status === 'INACTIVE' ? ' (Inactive)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Vendor / Brand Partner <span className="text-rose-400">*</span>
              </label>
              <select
                value={vendorId}
                onChange={e => setVendorId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
                required
              >
                <option value="">Select Vendor</option>
                {vendorOptions.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.vendorName} ({v.ownerContactName})
                    {v.status === 'INACTIVE' ? ' (Inactive)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Agreement Number */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Agreement Number <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={agreementNumber}
              onChange={e => setAgreementNumber(e.target.value.toUpperCase())}
              placeholder="e.g. AGR-2026-NFR-001"
              className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
              required
            />
          </div>

          {/* Lease Period: Start and End Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-orange-400" />
                <span>Lease Start Date</span> <span className="text-rose-400">*</span>
              </label>
              <input
                type="date"
                value={leaseStartDate}
                onChange={e => setLeaseStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-orange-400" />
                <span>Lease End Date</span> <span className="text-rose-400">*</span>
              </label>
              <input
                type="date"
                value={leaseEndDate}
                onChange={e => setLeaseEndDate(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl bg-slate-800/80 border text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 ${
                  !isDateOrderValid ? 'border-rose-500' : 'border-slate-700 focus:border-orange-500'
                }`}
                required
              />
              {!isDateOrderValid && (
                <p className="text-[11px] text-rose-400 mt-1">
                  Lease end date cannot be before lease start date.
                </p>
              )}
            </div>
          </div>

          {/* Commercial Terms: Monthly Rent, Security Deposit, Monthly Due Day */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-800/30 border border-slate-700/60">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <IndianRupee className="w-3.5 h-3.5 text-orange-400" />
                <span>Monthly Rent (₹)</span> <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={monthlyRent}
                onChange={e => setMonthlyRent(e.target.value)}
                placeholder="e.g. 35000 or 35000.00"
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <IndianRupee className="w-3.5 h-3.5 text-slate-400" />
                <span>Security Deposit (₹)</span>
              </label>
              <input
                type="text"
                value={securityDeposit}
                onChange={e => setSecurityDeposit(e.target.value)}
                placeholder="e.g. 70000"
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Monthly Due Day <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={31}
                step={1}
                value={monthlyDueDay}
                onChange={e => setMonthlyDueDay(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
                required
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">Day 1 to 31</span>
            </div>
          </div>

          {/* Optional NFR Sub-Meter Linkage */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Optional Linked NFR Sub-Meter</span>
            </label>
            {canReadUtilities ? (
              <select
                value={subMeterId}
                onChange={e => setSubMeterId(e.target.value)}
                disabled={loadingSubMeters}
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 disabled:opacity-50"
              >
                <option value="">No sub-meter linked</option>
                {subMeters.map(sm => (
                  <option key={sm.id} value={sm.id}>
                    {sm.meterCode} - {sm.name} ({sm.status})
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/50 text-xs text-slate-400">
                No sub-meter selection available for your current permissions.
              </div>
            )}
          </div>

          {/* Optional Agreement Document Picker */}
          <div className="pt-1">
            <NfrDocumentPicker
              outletId={outletId}
              selectedDocumentId={agreementDocumentId}
              onSelectDocument={setAgreementDocumentId}
              label="Optional Agreement Document"
              required={false}
              helperText="Upload or link the signed vendor lease agreement from Document Vault (PDF/PNG/JPEG, max 5MB)."
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Contract Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Commercial stipulations, renewal options, or special operational notes..."
              rows={2}
              className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-slate-950 font-bold text-xs shadow-lg shadow-orange-500/20 transition flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isEdit ? 'Save Changes' : 'Create Lease'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
