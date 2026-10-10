import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import {
  OutletServiceProviderAssignment,
  ServiceProvider,
  RetailOutlet,
  ServiceType,
  OrgStatus,
} from '../../../shared/types';
import {
  getServiceTypeLabel,
  getActiveServiceProvidersForNewAssignment,
  validateEffectiveDates,
  mapOrgErrorMessage,
} from './orgUi';

interface OrgOutletAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignmentToEdit?: OutletServiceProviderAssignment | null;
  outlets: RetailOutlet[];
  serviceProviders: ServiceProvider[];
  selectedOutletId?: string;
  onSave: (payload: {
    outletId?: string;
    serviceProviderId?: string;
    serviceType?: ServiceType;
    contractNumber?: string | null;
    effectiveFrom?: string;
    effectiveTo?: string | null;
    status: OrgStatus;
    notes?: string | null;
  }) => Promise<{ success: boolean; error?: string }>;
}

export const OrgOutletAssignmentModal: React.FC<OrgOutletAssignmentModalProps> = ({
  isOpen,
  onClose,
  assignmentToEdit,
  outlets,
  serviceProviders,
  selectedOutletId,
  onSave,
}) => {
  const isEditMode = Boolean(assignmentToEdit);

  // Form states
  const [outletId, setOutletId] = useState(
    assignmentToEdit?.outletId || selectedOutletId || outlets[0]?.id || ''
  );

  // For new assignment, only active providers should be displayed
  const activeProviders = getActiveServiceProvidersForNewAssignment(serviceProviders);

  const [serviceProviderId, setServiceProviderId] = useState(
    assignmentToEdit?.serviceProviderId || activeProviders[0]?.id || ''
  );
  const [serviceType, setServiceType] = useState<ServiceType>(
    assignmentToEdit?.serviceType || 'MANPOWER'
  );
  const [contractNumber, setContractNumber] = useState(assignmentToEdit?.contractNumber || '');
  const [effectiveFrom, setEffectiveFrom] = useState(
    assignmentToEdit?.effectiveFrom || new Date().toISOString().split('T')[0]
  );
  const [effectiveTo, setEffectiveTo] = useState(assignmentToEdit?.effectiveTo || '');
  const [status, setStatus] = useState<OrgStatus>(assignmentToEdit?.status || 'ACTIVE');
  const [notes, setNotes] = useState(assignmentToEdit?.notes || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!isEditMode) {
      if (!outletId) {
        setErrorMessage('Retail outlet selection is required.');
        return;
      }
      if (!serviceProviderId) {
        setErrorMessage('Active service provider selection is required.');
        return;
      }
      // Ensure selected provider is ACTIVE
      const chosen = serviceProviders.find((p) => p.id === serviceProviderId);
      if (chosen && chosen.status !== 'ACTIVE') {
        setErrorMessage(
          'Selected service provider is INACTIVE. New assignments require an active service provider.'
        );
        return;
      }
    }

    const dateErr = validateEffectiveDates(effectiveFrom, effectiveTo || null);
    if (dateErr) {
      setErrorMessage(dateErr);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const payload: any = {
      effectiveTo: effectiveTo || null,
      status,
      notes: notes.trim() || null,
    };

    if (!isEditMode) {
      payload.outletId = outletId;
      payload.serviceProviderId = serviceProviderId;
      payload.serviceType = serviceType;
      payload.contractNumber = contractNumber.trim() || null;
      payload.effectiveFrom = effectiveFrom;
    }

    const res = await onSave(payload);
    setIsSubmitting(false);

    if (res.success) {
      onClose();
    } else {
      setErrorMessage(mapOrgErrorMessage(undefined, res.error));
    }
  };

  const currentOutlet = outlets.find((o) => o.id === (assignmentToEdit?.outletId || outletId));
  const currentProvider = serviceProviders.find(
    (p) => p.id === (assignmentToEdit?.serviceProviderId || serviceProviderId)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div>
            <h3 className="text-base font-semibold text-white">
              {isEditMode ? 'Edit Provider Assignment' : 'Assign Service Provider to Outlet'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEditMode
                ? `Contract tenure for ${currentProvider?.providerName || 'Service Provider'}`
                : 'Deploy an empanelled service provider agency to a retail outlet'}
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Outlet Selection */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Retail Outlet <span className="text-orange-500">*</span>
            </label>
            {isEditMode ? (
              <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300">
                {currentOutlet ? `${currentOutlet.name} (${currentOutlet.roCode})` : outletId}
              </div>
            ) : (
              <select
                value={outletId}
                onChange={(e) => setOutletId(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500"
              >
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.roCode}) - {o.city || 'IOCL RO'}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Service Provider Selection */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Empanelled Service Provider <span className="text-orange-500">*</span>
            </label>
            {isEditMode ? (
              <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300">
                {currentProvider
                  ? `${currentProvider.providerName} (${currentProvider.providerCode})`
                  : serviceProviderId}
              </div>
            ) : (
              <select
                value={serviceProviderId}
                onChange={(e) => setServiceProviderId(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500"
              >
                {activeProviders.length === 0 ? (
                  <option value="">No ACTIVE service providers available</option>
                ) : (
                  activeProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.providerName} ({p.providerCode})
                    </option>
                  ))
                )}
              </select>
            )}
            {!isEditMode && activeProviders.length === 0 && (
              <p className="text-[11px] text-amber-400 mt-1">
                Notice: All service providers are currently INACTIVE. You must activate a provider in
                the Service Providers tab before assigning them.
              </p>
            )}
          </div>

          {/* Service Type & Contract */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Service Domain <span className="text-orange-500">*</span>
              </label>
              {isEditMode ? (
                <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300">
                  {getServiceTypeLabel(serviceType)}
                </div>
              ) : (
                <select
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value as ServiceType)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="MANPOWER">Manpower Deployment</option>
                  <option value="HOUSEKEEPING">Housekeeping & Sanitation</option>
                  <option value="SECURITY">Security Agency</option>
                  <option value="MAINTENANCE">Equipment & Facility Maintenance</option>
                  <option value="OTHER">Other Services</option>
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Contract Reference Number
              </label>
              <input
                type="text"
                value={contractNumber}
                onChange={(e) => setContractNumber(e.target.value)}
                disabled={isEditMode || isSubmitting}
                placeholder="e.g. CNT/2026/RO-1001"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500 font-mono disabled:opacity-50"
              />
            </div>
          </div>

          {/* Effective Tenure */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Effective From <span className="text-orange-500">*</span>
              </label>
              <input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                disabled={isEditMode || isSubmitting}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500 font-mono disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Effective To (Optional)
              </label>
              <input
                type="date"
                value={effectiveTo}
                onChange={(e) => setEffectiveTo(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500 font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Leave blank for ongoing engagement
              </span>
            </div>
          </div>

          {/* Status & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Assignment Status <span className="text-orange-500">*</span>
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as OrgStatus)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500"
              >
                <option value="ACTIVE">ACTIVE (Contract In Force)</option>
                <option value="INACTIVE">INACTIVE (Terminated / Expired)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Assignment Notes
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. 3 guards night shift"
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
              disabled={isSubmitting || (!isEditMode && activeProviders.length === 0)}
              className="px-4 py-2 text-xs font-medium text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-50 rounded-lg transition shadow-md shadow-orange-600/20"
            >
              {isSubmitting ? 'Saving...' : isEditMode ? 'Update Assignment' : 'Assign Provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
