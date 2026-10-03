import React, { useState, useEffect } from 'react';
import { NfrVendor, NfrVendorStatus } from '../../../shared/types';
import { canSubmitNfrVendor, getNfrErrorMessage } from './nfrUi';
import { apiFetch } from '../../services/api';
import { X, Users, AlertCircle, Loader2 } from 'lucide-react';

export interface NfrVendorModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendorToEdit?: NfrVendor | null;
  outletId: string;
  onSuccess: (message: string) => void;
}

export const NfrVendorModal: React.FC<NfrVendorModalProps> = ({
  isOpen,
  onClose,
  vendorToEdit,
  outletId,
  onSuccess,
}) => {
  const isEdit = Boolean(vendorToEdit);

  const [vendorName, setVendorName] = useState('');
  const [ownerContactName, setOwnerContactName] = useState('');
  const [ownerContactPhone, setOwnerContactPhone] = useState('');
  const [ownerContactEmail, setOwnerContactEmail] = useState('');
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState<NfrVendorStatus>('ACTIVE');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (vendorToEdit) {
      setVendorName(vendorToEdit.vendorName);
      setOwnerContactName(vendorToEdit.ownerContactName);
      setOwnerContactPhone(vendorToEdit.ownerContactPhone);
      setOwnerContactEmail(vendorToEdit.ownerContactEmail || '');
      setAddress(vendorToEdit.address || '');
      setStatus(vendorToEdit.status);
      setNotes(vendorToEdit.notes || '');
    } else {
      setVendorName('');
      setOwnerContactName('');
      setOwnerContactPhone('');
      setOwnerContactEmail('');
      setAddress('');
      setStatus('ACTIVE');
      setNotes('');
    }
    setErrorMessage(null);
    setIsSubmitting(false);
  }, [vendorToEdit, isOpen]);

  if (!isOpen) return null;

  const isValid = canSubmitNfrVendor(
    { vendorName, ownerContactName, ownerContactPhone },
    isSubmitting
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = {
        vendorName: vendorName.trim(),
        ownerContactName: ownerContactName.trim(),
        ownerContactPhone: ownerContactPhone.trim(),
        ownerContactEmail: ownerContactEmail.trim() || undefined,
        address: address.trim() || undefined,
        status,
        notes: notes.trim() || undefined,
      };

      if (isEdit && vendorToEdit) {
        const res = await apiFetch<NfrVendor>(
          `/api/v1/nfr/vendors/${vendorToEdit.id}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload),
          }
        );
        if (res.success) {
          onSuccess('Vendor updated successfully.');
          onClose();
        } else {
          const errCode = typeof res.error === 'object' && res.error ? res.error.code : (typeof res.error === 'string' ? res.error : undefined);
          setErrorMessage(getNfrErrorMessage(errCode || res.error || 'NFR_VENDOR_UPDATE_FAILED'));
        }
      } else {
        const res = await apiFetch<NfrVendor>(
          `/api/v1/outlets/${outletId}/nfr/vendors`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );
        if (res.success) {
          onSuccess('Vendor created successfully.');
          onClose();
        } else {
          const errCode = typeof res.error === 'object' && res.error ? res.error.code : (typeof res.error === 'string' ? res.error : undefined);
          setErrorMessage(getNfrErrorMessage(errCode || res.error || 'NFR_VENDOR_CREATE_FAILED'));
        }
      }
    } catch (err: any) {
      const errCode = typeof err === 'object' && err?.code ? err.code : err?.message;
      setErrorMessage(getNfrErrorMessage(errCode || 'NFR_VENDOR_OPERATION_FAILED'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isEdit ? 'Edit NFR Vendor' : 'Create NFR Vendor'}
              </h3>
              <p className="text-xs text-slate-400">
                {isEdit
                  ? `Update contact and commercial details for ${vendorToEdit?.vendorName}`
                  : 'Register a commercial vendor or brand partner for leasing'}
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

          {/* Vendor Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Vendor / Entity Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={vendorName}
              onChange={e => setVendorName(e.target.value)}
              placeholder="e.g. State Bank of India, Cafe Coffee Day"
              className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
              required
            />
          </div>

          {/* Owner / Contact Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Owner / Contact Person <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={ownerContactName}
              onChange={e => setOwnerContactName(e.target.value)}
              placeholder="e.g. Rajesh Sharma"
              className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
              required
            />
          </div>

          {/* Contact Phone & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Phone Number <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={ownerContactPhone}
                onChange={e => setOwnerContactPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={ownerContactEmail}
                onChange={e => setOwnerContactEmail(e.target.value)}
                placeholder="e.g. contact@vendor.com"
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Registered / Billing Address
            </label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="e.g. Corporate Office, Nariman Point, Mumbai"
              className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Vendor Status
            </label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as NfrVendorStatus)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
            >
              <option value="ACTIVE">ACTIVE (Eligible for new leases)</option>
              <option value="INACTIVE">INACTIVE (Not eligible for new leases)</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Operational Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add details on commercial terms or parent company..."
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
              <span>{isEdit ? 'Save Changes' : 'Create Vendor'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
