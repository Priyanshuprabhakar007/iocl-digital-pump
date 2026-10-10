import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { ServiceProvider, OrgStatus } from '../../../shared/types';
import { mapOrgErrorMessage } from './orgUi';

interface OrgServiceProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  providerToEdit?: ServiceProvider | null;
  onSave: (payload: {
    providerCode?: string;
    providerName: string;
    proprietorOrAuthorizedPerson?: string | null;
    contactPerson?: string | null;
    phone?: string | null;
    alternatePhone?: string | null;
    email?: string | null;
    gstin?: string | null;
    pan?: string | null;
    address?: string | null;
    city?: string | null;
    district?: string | null;
    stateText?: string | null;
    pincode?: string | null;
    status: OrgStatus;
    notes?: string | null;
  }) => Promise<{ success: boolean; error?: string }>;
}

export const OrgServiceProviderModal: React.FC<OrgServiceProviderModalProps> = ({
  isOpen,
  onClose,
  providerToEdit,
  onSave,
}) => {
  const isEditMode = Boolean(providerToEdit);

  const [providerCode, setProviderCode] = useState(providerToEdit?.providerCode || '');
  const [providerName, setProviderName] = useState(providerToEdit?.providerName || '');
  const [proprietorOrAuthorizedPerson, setProprietorOrAuthorizedPerson] = useState(
    providerToEdit?.proprietorOrAuthorizedPerson || ''
  );
  const [contactPerson, setContactPerson] = useState(providerToEdit?.contactPerson || '');
  const [phone, setPhone] = useState(providerToEdit?.phone || '');
  const [alternatePhone, setAlternatePhone] = useState(providerToEdit?.alternatePhone || '');
  const [email, setEmail] = useState(providerToEdit?.email || '');
  const [gstin, setGstin] = useState(providerToEdit?.gstin || '');
  const [pan, setPan] = useState(providerToEdit?.pan || '');
  const [address, setAddress] = useState(providerToEdit?.address || '');
  const [city, setCity] = useState(providerToEdit?.city || '');
  const [district, setDistrict] = useState(providerToEdit?.district || '');
  const [stateText, setStateText] = useState(providerToEdit?.stateText || '');
  const [pincode, setPincode] = useState(providerToEdit?.pincode || '');
  const [status, setStatus] = useState<OrgStatus>(providerToEdit?.status || 'ACTIVE');
  const [notes, setNotes] = useState(providerToEdit?.notes || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!isEditMode && !providerCode.trim()) {
      setErrorMessage('Provider code is required.');
      return;
    }
    if (!providerName.trim()) {
      setErrorMessage('Provider / Agency name is required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const payload: any = {
      providerName: providerName.trim(),
      proprietorOrAuthorizedPerson: proprietorOrAuthorizedPerson.trim() || null,
      contactPerson: contactPerson.trim() || null,
      phone: phone.trim() || null,
      alternatePhone: alternatePhone.trim() || null,
      email: email.trim() || null,
      gstin: gstin.trim().toUpperCase() || null,
      pan: pan.trim().toUpperCase() || null,
      address: address.trim() || null,
      city: city.trim() || null,
      district: district.trim() || null,
      stateText: stateText.trim() || null,
      pincode: pincode.trim() || null,
      status,
      notes: notes.trim() || null,
    };

    if (!isEditMode) {
      payload.providerCode = providerCode.trim().toUpperCase();
    }

    const res = await onSave(payload);
    setIsSubmitting(false);

    if (res.success) {
      onClose();
    } else {
      setErrorMessage(mapOrgErrorMessage(undefined, res.error));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div>
            <h3 className="text-base font-semibold text-white">
              {isEditMode ? 'Edit Service Provider' : 'Register Service Provider'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEditMode
                ? `Updating agency record for ${providerToEdit?.providerCode}`
                : 'Enlist manpower, housekeeping, security, or maintenance vendor'}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Identification Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Provider Code <span className="text-orange-500">*</span>
              </label>
              <input
                type="text"
                value={providerCode}
                onChange={(e) => setProviderCode(e.target.value.toUpperCase())}
                disabled={isEditMode || isSubmitting}
                placeholder="e.g. SP-SEC-001"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500 disabled:opacity-50 font-mono"
              />
              {isEditMode && (
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Provider code is an immutable system identifier
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Provider / Agency Name <span className="text-orange-500">*</span>
              </label>
              <input
                type="text"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. Bharat Security & Allied Services"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          {/* People Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Proprietor / Authorized Person
              </label>
              <input
                type="text"
                value={proprietorOrAuthorizedPerson}
                onChange={(e) => setProprietorOrAuthorizedPerson(e.target.value)}
                disabled={isSubmitting}
                placeholder="Name of owner / director"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Key Contact Person
              </label>
              <input
                type="text"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                disabled={isSubmitting}
                placeholder="Operational liaison name"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          {/* Communication Section */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Primary Phone / Mobile
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. +91 9876543210"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Alternate Phone
              </label>
              <input
                type="tel"
                value={alternatePhone}
                onChange={(e) => setAlternatePhone(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. 011-23456789"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                placeholder="contact@agency.com"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500 font-mono"
              />
            </div>
          </div>

          {/* Tax Identification Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                GSTIN Number
              </label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                disabled={isSubmitting}
                placeholder="15-character GSTIN"
                maxLength={15}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Permanent Account Number (PAN)
              </label>
              <input
                type="text"
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
                disabled={isSubmitting}
                placeholder="10-character PAN"
                maxLength={10}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500 font-mono"
              />
            </div>
          </div>

          {/* Postal Address */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Registered Office Address
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={isSubmitting}
              placeholder="Building, street, landmark..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={isSubmitting}
                placeholder="City"
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1">District</label>
              <input
                type="text"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                disabled={isSubmitting}
                placeholder="District"
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1">State</label>
              <input
                type="text"
                value={stateText}
                onChange={(e) => setStateText(e.target.value)}
                disabled={isSubmitting}
                placeholder="State"
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1">PIN Code</label>
              <input
                type="text"
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                disabled={isSubmitting}
                placeholder="6-digit PIN"
                maxLength={6}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500 font-mono"
              />
            </div>
          </div>

          {/* Status & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Vendor Status <span className="text-orange-500">*</span>
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as OrgStatus)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500"
              >
                <option value="ACTIVE">ACTIVE (Eligible for outlet deployment)</option>
                <option value="INACTIVE">INACTIVE (Disallowed from new deployments)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Internal Notes / Remarks
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. Empanelled under Tender 2026/SEC-04"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-50 rounded-lg transition shadow-md shadow-orange-600/20"
            >
              {isSubmitting ? 'Saving...' : isEditMode ? 'Update Provider' : 'Create Provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
