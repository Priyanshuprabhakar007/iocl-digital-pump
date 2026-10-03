import React, { useState, useEffect } from 'react';
import { NfrSpace, NfrType, NfrSpaceStatus } from '../../../shared/types';
import { formatNfrType, canSubmitNfrSpace, getNfrErrorMessage } from './nfrUi';
import { apiFetch } from '../../services/api';
import { X, Building, AlertCircle, Loader2 } from 'lucide-react';

export interface NfrSpaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceToEdit?: NfrSpace | null;
  outletId: string;
  onSuccess: (message: string) => void;
}

const NFR_TYPES: { value: NfrType; label: string }[] = [
  { value: 'ATM', label: 'ATM' },
  { value: 'CONVENIENCE_STORE', label: 'Convenience Store' },
  { value: 'QSR', label: 'QSR' },
  { value: 'CAR_WASH', label: 'Car Wash' },
  { value: 'EV_CHARGING', label: 'EV Charging' },
  { value: 'CANOPY_ADVERTISING', label: 'Canopy Advertising' },
];

export const NfrSpaceModal: React.FC<NfrSpaceModalProps> = ({
  isOpen,
  onClose,
  spaceToEdit,
  outletId,
  onSuccess,
}) => {
  const isEdit = Boolean(spaceToEdit);

  const [spaceCode, setSpaceCode] = useState('');
  const [name, setName] = useState('');
  const [nfrType, setNfrType] = useState<NfrType>('ATM');
  const [locationDescription, setLocationDescription] = useState('');
  const [status, setStatus] = useState<NfrSpaceStatus>('ACTIVE');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (spaceToEdit) {
      setSpaceCode(spaceToEdit.spaceCode);
      setName(spaceToEdit.name);
      setNfrType(spaceToEdit.nfrType);
      setLocationDescription(spaceToEdit.locationDescription || '');
      setStatus(spaceToEdit.status);
      setNotes(spaceToEdit.notes || '');
    } else {
      setSpaceCode('');
      setName('');
      setNfrType('ATM');
      setLocationDescription('');
      setStatus('ACTIVE');
      setNotes('');
    }
    setErrorMessage(null);
    setIsSubmitting(false);
  }, [spaceToEdit, isOpen]);

  if (!isOpen) return null;

  const isValid = canSubmitNfrSpace(
    { spaceCode, name, nfrType },
    isEdit,
    isSubmitting
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (isEdit && spaceToEdit) {
        // Only send editable fields for update
        const payload = {
          name: name.trim(),
          nfrType,
          locationDescription: locationDescription.trim() || undefined,
          status,
          notes: notes.trim() || undefined,
        };
        const res = await apiFetch<NfrSpace>(
          `/api/v1/nfr/spaces/${spaceToEdit.id}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload),
          }
        );
        if (res.success) {
          onSuccess('NFR space updated successfully.');
          onClose();
        } else {
          const errCode = typeof res.error === 'object' && res.error ? res.error.code : (typeof res.error === 'string' ? res.error : undefined);
          setErrorMessage(getNfrErrorMessage(errCode || res.error || 'NFR_SPACE_UPDATE_FAILED'));
        }
      } else {
        const payload = {
          spaceCode: spaceCode.trim(),
          name: name.trim(),
          nfrType,
          locationDescription: locationDescription.trim() || undefined,
          status,
          notes: notes.trim() || undefined,
        };
        const res = await apiFetch<NfrSpace>(
          `/api/v1/outlets/${outletId}/nfr/spaces`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );
        if (res.success) {
          onSuccess('NFR space created successfully.');
          onClose();
        } else {
          const errCode = typeof res.error === 'object' && res.error ? res.error.code : (typeof res.error === 'string' ? res.error : undefined);
          setErrorMessage(getNfrErrorMessage(errCode || res.error || 'NFR_SPACE_CREATE_FAILED'));
        }
      }
    } catch (err: any) {
      const errCode = typeof err === 'object' && err?.code ? err.code : err?.message;
      setErrorMessage(getNfrErrorMessage(errCode || 'NFR_SPACE_OPERATION_FAILED'));
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
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isEdit ? 'Edit NFR Space' : 'Create NFR Space'}
              </h3>
              <p className="text-xs text-slate-400">
                {isEdit
                  ? `Update space details for ${spaceToEdit?.spaceCode}`
                  : 'Define a new commercial space for lease at this outlet'}
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

          {/* Space Code */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Space Code <span className="text-rose-400">*</span>
            </label>
            {isEdit ? (
              <div className="px-3 py-2 rounded-xl bg-slate-800/50 border border-slate-700/60 text-xs font-mono text-slate-300">
                {spaceCode}
                <span className="text-[10px] text-slate-500 ml-2 font-sans">(Immutable)</span>
              </div>
            ) : (
              <input
                type="text"
                value={spaceCode}
                onChange={e => setSpaceCode(e.target.value.toUpperCase())}
                placeholder="e.g. ATM-01, QSR-NORTH"
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
                required
              />
            )}
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Space Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Forecourt ATM Booth #1"
              className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
              required
            />
          </div>

          {/* NFR Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              NFR Commercial Type <span className="text-rose-400">*</span>
            </label>
            <select
              value={nfrType}
              onChange={e => setNfrType(e.target.value as NfrType)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
            >
              {NFR_TYPES.map(t => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Location Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Location Description
            </label>
            <input
              type="text"
              value={locationDescription}
              onChange={e => setLocationDescription(e.target.value)}
              placeholder="e.g. Near entry gate beside sales building"
              className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Space Status
            </label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as NfrSpaceStatus)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
            >
              <option value="ACTIVE">ACTIVE (Available for leasing)</option>
              <option value="INACTIVE">INACTIVE (Decommissioned / unavailable)</option>
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
              placeholder="Add any space specifications or dimensions..."
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
              <span>{isEdit ? 'Save Changes' : 'Create Space'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
