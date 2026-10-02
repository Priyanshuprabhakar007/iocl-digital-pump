import React, { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { EquipmentAsset, EquipmentAssetType, EquipmentAssetStatus } from '../../../shared/types';
import { getEquipmentErrorMessage } from './equipmentUi';

interface EquipmentAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  outletId: string;
  assetToEdit?: EquipmentAsset | null;
  onAssetSaved: (asset: EquipmentAsset) => void;
}

const ASSET_TYPES: { value: EquipmentAssetType; label: string }[] = [
  { value: 'ATG', label: 'Automatic Tank Gauge (ATG)' },
  { value: 'AIR_COMPRESSOR', label: 'Air Compressor' },
  { value: 'CNG_COMPRESSOR', label: 'CNG Compressor' },
  { value: 'DG_SET', label: 'Diesel Generator Set (DG Set)' },
  { value: 'OTHER', label: 'Other Equipment' }
];

const ASSET_STATUSES: { value: EquipmentAssetStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'DECOMMISSIONED', label: 'Decommissioned' }
];

export const EquipmentAssetModal: React.FC<EquipmentAssetModalProps> = ({
  isOpen,
  onClose,
  outletId,
  assetToEdit,
  onAssetSaved
}) => {
  const isEditing = !!assetToEdit;

  const [assetCode, setAssetCode] = useState('');
  const [equipmentType, setEquipmentType] = useState<EquipmentAssetType>('ATG');
  const [name, setName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerial] = useState('');
  const [status, setStatus] = useState<EquipmentAssetStatus>('ACTIVE');
  const [commissionedDate, setCommissionedDate] = useState('');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      return;
    }

    if (assetToEdit) {
      setAssetCode(assetToEdit.assetCode);
      setEquipmentType(assetToEdit.equipmentType as EquipmentAssetType);
      setName(assetToEdit.name);
      setManufacturer(assetToEdit.manufacturer || '');
      setModel(assetToEdit.model || '');
      setSerial(assetToEdit.serialNumber || '');
      setStatus(assetToEdit.status);
      if (assetToEdit.commissionedAt) {
        // format YYYY-MM-DD for date input
        const d = new Date(assetToEdit.commissionedAt);
        if (!isNaN(d.getTime())) {
          setCommissionedDate(d.toISOString().slice(0, 10));
        } else {
          setCommissionedDate('');
        }
      } else {
        setCommissionedDate('');
      }
      setNotes(assetToEdit.notes || '');
    } else {
      setAssetCode('');
      setEquipmentType('ATG');
      setName('');
      setManufacturer('');
      setModel('');
      setSerial('');
      setStatus('ACTIVE');
      setCommissionedDate('');
      setNotes('');
    }
    setError(null);
  }, [isOpen, assetToEdit]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isEditing && !assetCode.trim()) {
      setError('Asset code is required.');
      return;
    }
    if (!name.trim()) {
      setError('Asset name is required.');
      return;
    }

    let commissionedAtIso: string | undefined = undefined;
    if (commissionedDate) {
      const parsed = new Date(commissionedDate + 'T00:00:00Z');
      if (isNaN(parsed.getTime())) {
        setError('Invalid commissioned date.');
        return;
      }
      commissionedAtIso = parsed.toISOString();
    }

    setIsSubmitting(true);

    try {
      if (isEditing && assetToEdit) {
        // PUT /api/v1/equipment/assets/:id
        // Allowed fields ONLY: name, manufacturer, model, serialNumber, status, commissionedAt, notes
        const payload: Record<string, any> = {
          name: name.trim(),
          manufacturer: manufacturer.trim() || undefined,
          model: model.trim() || undefined,
          serialNumber: serialNumber.trim() || undefined,
          status,
          commissionedAt: commissionedAtIso,
          notes: notes.trim() || undefined
        };

        const res = await apiFetch<EquipmentAsset>(`/api/v1/equipment/assets/${assetToEdit.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });

        if (res.data) {
          onAssetSaved(res.data);
          onClose();
        }
      } else {
        // POST /api/v1/outlets/:outletId/equipment/assets
        const payload: Record<string, any> = {
          assetCode: assetCode.trim().toUpperCase(),
          equipmentType,
          name: name.trim(),
          manufacturer: manufacturer.trim() || undefined,
          model: model.trim() || undefined,
          serialNumber: serialNumber.trim() || undefined,
          status,
          commissionedAt: commissionedAtIso,
          notes: notes.trim() || undefined
        };

        const res = await apiFetch<EquipmentAsset>(`/api/v1/outlets/${outletId}/equipment/assets`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (res.data) {
          onAssetSaved(res.data);
          onClose();
        }
      }
    } catch (err: any) {
      console.error('Failed to save equipment asset:', err);
      const msg = getEquipmentErrorMessage(err);
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {isEditing ? 'Edit Auxiliary Asset' : 'Register Auxiliary Equipment Asset'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEditing
                ? `Updating equipment asset ${assetToEdit?.assetCode}`
                : 'Add ATG, Compressor, DG Set or auxiliary equipment asset'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Asset Code */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Asset Code <span className="text-amber-500">*</span>
              </label>
              <input
                type="text"
                required
                disabled={isEditing}
                value={assetCode}
                onChange={(e) => setAssetCode(e.target.value.toUpperCase())}
                placeholder="e.g. EQ-ATG-01"
                className={`w-full px-3 py-2 bg-slate-800 border ${
                  isEditing ? 'border-slate-800 text-slate-400 cursor-not-allowed' : 'border-slate-700 text-white focus:border-amber-500'
                } rounded-xl text-sm font-mono focus:outline-none transition-colors`}
              />
              {isEditing && (
                <p className="text-[11px] text-slate-400 mt-1">Asset code cannot be modified once created.</p>
              )}
            </div>

            {/* Equipment Type */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Equipment Type <span className="text-amber-500">*</span>
              </label>
              <select
                disabled={isEditing}
                value={equipmentType}
                onChange={(e) => setEquipmentType(e.target.value as EquipmentAssetType)}
                className={`w-full px-3 py-2 bg-slate-800 border ${
                  isEditing ? 'border-slate-800 text-slate-400 cursor-not-allowed' : 'border-slate-700 text-white focus:border-amber-500'
                } rounded-xl text-sm focus:outline-none transition-colors`}
              >
                {ASSET_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              {isEditing && (
                <p className="text-[11px] text-slate-400 mt-1">Equipment type is immutable.</p>
              )}
            </div>

            {/* Name */}
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Asset Name / Description <span className="text-amber-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Forecourt Veeder-Root ATG Console"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            {/* Manufacturer */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Manufacturer
              </label>
              <input
                type="text"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="e.g. Veeder-Root / Kirloskar"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            {/* Model */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Model
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. TLS-450 Plus"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            {/* Serial Number */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Serial Number
              </label>
              <input
                type="text"
                value={serialNumber}
                onChange={(e) => setSerial(e.target.value)}
                placeholder="e.g. VR-88921-X"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Operational Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as EquipmentAssetStatus)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              >
                {ASSET_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Commissioned Date */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Commissioned Date
              </label>
              <input
                type="date"
                value={commissionedDate}
                onChange={(e) => setCommissionedDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Notes / Location Information
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Located inside Manager Cabin electrical rack."
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 transition-colors resize-none"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors shadow-lg shadow-amber-600/20 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isEditing ? 'Update Asset' : 'Register Asset'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
