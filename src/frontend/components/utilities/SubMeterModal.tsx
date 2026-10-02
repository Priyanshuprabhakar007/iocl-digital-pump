import React, { useState } from 'react';
import {
  UtilitySubMeter,
  UtilitySubMeterBeneficiaryType,
  UtilitySubMeterStatus,
} from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { getUtilityErrorMessage } from './utilityUi';
import { X, Gauge, Loader2, AlertCircle } from 'lucide-react';

interface SubMeterModalProps {
  outletId: string;
  subMeterToEdit?: UtilitySubMeter | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const SubMeterModal: React.FC<SubMeterModalProps> = ({
  outletId,
  subMeterToEdit,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const isEdit = !!subMeterToEdit;

  const [meterCode, setMeterCode] = useState(subMeterToEdit?.meterCode || '');
  const [name, setName] = useState(subMeterToEdit?.name || '');
  const [beneficiaryType, setBeneficiaryType] = useState<UtilitySubMeterBeneficiaryType>(
    subMeterToEdit?.beneficiaryType || 'NFR_VENDOR'
  );
  const [beneficiaryName, setBeneficiaryName] = useState(subMeterToEdit?.beneficiaryName || '');
  const [serialNumber, setSerialNumber] = useState(subMeterToEdit?.serialNumber || '');
  const [ratePerKwh, setRatePerKwh] = useState(subMeterToEdit?.ratePerKwhStr || '12.00');
  const [status, setStatus] = useState<UtilitySubMeterStatus>(subMeterToEdit?.status || 'ACTIVE');
  const [commissionedAtLocal, setCommissionedAtLocal] = useState(() => {
    if (subMeterToEdit?.commissionedAt) {
      try {
        const d = new Date(subMeterToEdit.commissionedAt);
        const tzOffset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
      } catch {
        return '';
      }
    }
    return '';
  });
  const [notes, setNotes] = useState(subMeterToEdit?.notes || '');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!isEdit && !meterCode.trim()) {
      setErrorMsg('Meter code is required.');
      return;
    }
    if (!name.trim()) {
      setErrorMsg('Sub-meter name is required.');
      return;
    }
    if (!beneficiaryName.trim()) {
      setErrorMsg('Beneficiary name is required.');
      return;
    }
    if (!ratePerKwh.trim() || !/^\d+(\.\d{1,2})?$/.test(ratePerKwh.trim())) {
      setErrorMsg('Tariff rate per kWh must be a valid decimal string (e.g. 12.50).');
      return;
    }

    setSubmitting(true);
    try {
      const commissionedAtIso = commissionedAtLocal
        ? new Date(commissionedAtLocal).toISOString()
        : null;

      if (isEdit && subMeterToEdit) {
        const payload = {
          name: name.trim(),
          beneficiaryType,
          beneficiaryName: beneficiaryName.trim(),
          serialNumber: serialNumber.trim() || null,
          ratePerKwh: ratePerKwh.trim(),
          status,
          commissionedAt: commissionedAtIso,
          notes: notes.trim() || null,
        };

        const res = await apiFetch<UtilitySubMeter>(
          `/api/v1/utilities/sub-meters/${subMeterToEdit.id}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload),
          }
        );

        if (res.success) {
          onSuccess();
          onClose();
        } else {
          setErrorMsg(getUtilityErrorMessage(res.error));
        }
      } else {
        const payload = {
          meterCode: meterCode.trim(),
          name: name.trim(),
          beneficiaryType,
          beneficiaryName: beneficiaryName.trim(),
          serialNumber: serialNumber.trim() || null,
          ratePerKwh: ratePerKwh.trim(),
          status,
          commissionedAt: commissionedAtIso,
          notes: notes.trim() || null,
        };

        const res = await apiFetch<UtilitySubMeter>(
          `/api/v1/outlets/${outletId}/utilities/sub-meters`,
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
      }
    } catch (err: any) {
      setErrorMsg(getUtilityErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                {isEdit ? 'Edit Sub-Meter Master' : 'New Electricity Sub-Meter'}
              </h2>
              <p className="text-xs text-slate-400">
                {isEdit ? 'Update beneficiary details, tariff rate or status' : 'Register a sub-meter for NFR vendor or CNG facility'}
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

          {/* Meter Code & Name Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Meter Code {!isEdit && <span className="text-orange-400">*</span>}
              </label>
              <input
                type="text"
                value={meterCode}
                onChange={e => setMeterCode(e.target.value)}
                disabled={isEdit || submitting}
                placeholder="e.g. SM-NFR-01"
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm border font-mono transition-all ${
                  isEdit
                    ? 'bg-slate-800/60 border-slate-800 text-slate-400 cursor-not-allowed'
                    : 'bg-slate-950 border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/60'
                }`}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Meter Name <span className="text-orange-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={submitting}
                placeholder="e.g. Cafe Sub-Meter"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/60 transition-all"
              />
            </div>
          </div>

          {/* Beneficiary Type & Beneficiary Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Beneficiary Type <span className="text-orange-400">*</span>
              </label>
              <select
                value={beneficiaryType}
                onChange={e => setBeneficiaryType(e.target.value as UtilitySubMeterBeneficiaryType)}
                disabled={submitting}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-orange-500/60 transition-all"
              >
                <option value="NFR_VENDOR">NFR Vendor</option>
                <option value="CNG_FACILITY">CNG Facility</option>
                <option value="OTHER">Other Facility</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Beneficiary Name <span className="text-orange-400">*</span>
              </label>
              <input
                type="text"
                value={beneficiaryName}
                onChange={e => setBeneficiaryName(e.target.value)}
                disabled={submitting}
                placeholder="e.g. Chai Point / CNG Compression Unit"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/60 transition-all"
              />
            </div>
          </div>

          {/* Serial Number & Tariff Rate Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Serial Number
              </label>
              <input
                type="text"
                value={serialNumber}
                onChange={e => setSerialNumber(e.target.value)}
                disabled={submitting}
                placeholder="e.g. L&T-EM-998812"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white font-mono placeholder-slate-600 focus:outline-none focus:border-orange-500/60 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Tariff Rate (₹ / kWh) <span className="text-orange-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-semibold">
                  ₹
                </span>
                <input
                  type="text"
                  value={ratePerKwh}
                  onChange={e => setRatePerKwh(e.target.value)}
                  disabled={submitting}
                  placeholder="12.50"
                  className="w-full pl-8 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white font-mono placeholder-slate-600 focus:outline-none focus:border-orange-500/60 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Status & Commissioned Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Sub-Meter Status <span className="text-orange-400">*</span>
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as UtilitySubMeterStatus)}
                disabled={submitting}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-orange-500/60 transition-all"
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="DECOMMISSIONED">Decommissioned</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Commissioned Date
              </label>
              <input
                type="datetime-local"
                value={commissionedAtLocal}
                onChange={e => setCommissionedAtLocal(e.target.value)}
                disabled={submitting}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-orange-500/60 transition-all font-mono"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Operational / Location Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={submitting}
              rows={3}
              placeholder="Physical location, CT ratio, feeder details..."
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/60 transition-all resize-none"
            />
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
              className="px-5 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-orange-500/20"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : isEdit ? (
                'Save Changes'
              ) : (
                'Create Sub-Meter'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
