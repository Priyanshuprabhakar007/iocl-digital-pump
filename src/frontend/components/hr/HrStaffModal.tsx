import React, { useState, useEffect } from 'react';
import {
  HrStaff,
  HrDesignation,
  HrEmploymentStatus,
} from '../../../shared/types';
import { apiFetch } from '../../services/api';
import {
  canSubmitHrStaff,
  getHrErrorMessage,
  getEligibleStaffDesignations,
  getLocalDateInputValue,
} from './hrUi';
import { HrDocumentPicker } from './HrDocumentPicker';
import { X, UserPlus, Edit, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';

export interface HrStaffModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  outletId: string;
  staff: HrStaff | null;
  designations: HrDesignation[];
  onClose: () => void;
  onSuccess: (savedStaff: HrStaff) => void;
}

export const HrStaffModal: React.FC<HrStaffModalProps> = ({
  isOpen,
  mode,
  outletId,
  staff,
  designations,
  onClose,
  onSuccess,
}) => {
  const isEdit = mode === 'edit' && !!staff;

  const [employeeCode, setEmployeeCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [designationId, setDesignationId] = useState('');
  const [aadhaarLast4, setAadhaarLast4] = useState('');
  const [aadhaarDocumentId, setAadhaarDocumentId] = useState<string | null>(null);
  const [photoDocumentId, setPhotoDocumentId] = useState<string | null>(null);
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState<HrEmploymentStatus>('ACTIVE');
  const [exitDate, setExitDate] = useState('');
  const [notes, setNotes] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Initialize or reset form fields
  useEffect(() => {
    if (isOpen) {
      setError(null);
      if (isEdit && staff) {
        setEmployeeCode(staff.employeeCode || '');
        setFullName(staff.fullName || '');
        setDesignationId(staff.designationId || '');
        setAadhaarLast4(staff.aadhaarLast4 || '');
        setAadhaarDocumentId(staff.aadhaarDocumentId || null);
        setPhotoDocumentId(staff.photoDocumentId || null);
        setEmergencyContactName(staff.emergencyContactName || '');
        setEmergencyContactPhone(staff.emergencyContactPhone || '');
        setJoiningDate(staff.joiningDate ? staff.joiningDate.slice(0, 10) : '');
        setEmploymentStatus(staff.employmentStatus || 'ACTIVE');
        setExitDate(staff.exitDate ? staff.exitDate.slice(0, 10) : '');
        setNotes(staff.notes || '');
      } else {
        setEmployeeCode('');
        setFullName('');
        setDesignationId('');
        setAadhaarLast4('');
        setAadhaarDocumentId(null);
        setPhotoDocumentId(null);
        setEmergencyContactName('');
        setEmergencyContactPhone('');
        setJoiningDate(getLocalDateInputValue());
        setEmploymentStatus('ACTIVE');
        setExitDate('');
        setNotes('');
      }
    }
  }, [isOpen, isEdit, staff]);

  if (!isOpen) return null;

  const eligibleDesignations = getEligibleStaffDesignations(
    designations,
    isEdit && staff ? staff.designationId : null,
    outletId
  );

  const handleStatusChange = (newStatus: HrEmploymentStatus) => {
    setEmploymentStatus(newStatus);
    if (newStatus !== 'EXITED') {
      setExitDate('');
    }
  };

  const handleAadhaarChange = (val: string) => {
    // Only allow up to 4 numeric digits
    const cleaned = val.replace(/\D/g, '').slice(0, 4);
    setAadhaarLast4(cleaned);
  };

  const formPayload = {
    employeeCode,
    fullName,
    designationId,
    aadhaarLast4,
    emergencyContactName,
    emergencyContactPhone,
    joiningDate,
    employmentStatus,
    exitDate: employmentStatus === 'EXITED' ? exitDate : null,
  };

  const canSubmit = canSubmitHrStaff(formPayload, isEdit);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      if (isEdit && staff) {
        // PUT /api/v1/hr/staff/:id
        const payload: any = {
          fullName: fullName.trim(),
          designationId,
          aadhaarLast4,
          aadhaarDocumentId: aadhaarDocumentId || null,
          photoDocumentId: photoDocumentId || null,
          emergencyContactName: emergencyContactName.trim(),
          emergencyContactPhone: emergencyContactPhone.trim(),
          joiningDate,
          employmentStatus,
          exitDate: employmentStatus === 'EXITED' ? exitDate || null : null,
          notes: notes.trim() ? notes.trim() : null,
        };

        const res = await apiFetch<HrStaff>(`/api/v1/hr/staff/${staff.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });

        if (res.success && res.data) {
          onSuccess(res.data);
          onClose();
        } else {
          setError(getHrErrorMessage(res.error));
        }
      } else {
        // POST /api/v1/outlets/:outletId/hr/staff
        const payload: any = {
          employeeCode: employeeCode.trim().toUpperCase(),
          fullName: fullName.trim(),
          designationId,
          aadhaarLast4,
          aadhaarDocumentId: aadhaarDocumentId || null,
          photoDocumentId: photoDocumentId || null,
          emergencyContactName: emergencyContactName.trim(),
          emergencyContactPhone: emergencyContactPhone.trim(),
          joiningDate,
          employmentStatus,
          exitDate: employmentStatus === 'EXITED' ? exitDate || null : null,
          notes: notes.trim() ? notes.trim() : null,
        };

        const res = await apiFetch<HrStaff>(`/api/v1/outlets/${outletId}/hr/staff`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        if (res.success && res.data) {
          onSuccess(res.data);
          onClose();
        } else {
          setError(getHrErrorMessage(res.error));
        }
      }
    } catch (err: any) {
      setError(getHrErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400">
              {isEdit ? <Edit className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isEdit ? 'Edit Staff Member' : 'Add Staff Member'}
              </h3>
              <p className="text-xs text-slate-400">
                {isEdit
                  ? `Update employee profile for ${staff?.fullName} (${staff?.employeeCode})`
                  : 'Enroll new staff member into retail outlet roster'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-xs text-rose-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Employee Code */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Employee Code <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={employeeCode}
                onChange={e => setEmployeeCode(e.target.value.toUpperCase())}
                disabled={isEdit}
                placeholder="e.g. EMP-101"
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 disabled:opacity-50 font-mono"
                required
              />
              {isEdit && (
                <p className="text-[10px] text-slate-500 mt-1">
                  Employee code is immutable after enrollment.
                </p>
              )}
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Full Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="e.g. Ramesh Kumar"
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Designation */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Designation <span className="text-rose-400">*</span>
              </label>
              <select
                value={designationId}
                onChange={e => setDesignationId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
                required
              >
                <option value="">-- Select Designation --</option>
                {eligibleDesignations.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code}) {d.status === 'INACTIVE' ? '[Inactive]' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Aadhaar Last 4 Digits — PRIVACY CRITICAL */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Aadhaar Last 4 Digits <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={4}
                  value={aadhaarLast4}
                  onChange={e => handleAadhaarChange(e.target.value)}
                  placeholder="1234"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 font-mono tracking-widest"
                  required
                />
                <ShieldCheck className="w-4 h-4 text-emerald-500 absolute right-3 top-2.5" />
              </div>
              <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                <span>Enter only the last 4 digits. Do not enter the full Aadhaar number.</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Emergency Contact Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Emergency Contact Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={emergencyContactName}
                onChange={e => setEmergencyContactName(e.target.value)}
                placeholder="e.g. Sunita Devi (Spouse)"
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
                required
              />
            </div>

            {/* Emergency Contact Phone */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Emergency Contact Phone <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={emergencyContactPhone}
                onChange={e => setEmergencyContactPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Joining Date */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Joining Date <span className="text-rose-400">*</span>
              </label>
              <input
                type="date"
                value={joiningDate}
                onChange={e => setJoiningDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
                required
              />
            </div>

            {/* Employment Status */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Employment Status <span className="text-rose-400">*</span>
              </label>
              <select
                value={employmentStatus}
                onChange={e => handleStatusChange(e.target.value as HrEmploymentStatus)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
                required
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="EXITED">Exited</option>
              </select>
            </div>

            {/* Exit Date (Conditional on EXITED) */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Exit Date {employmentStatus === 'EXITED' && <span className="text-rose-400">*</span>}
              </label>
              <input
                type="date"
                value={exitDate}
                onChange={e => setExitDate(e.target.value)}
                disabled={employmentStatus !== 'EXITED'}
                min={joiningDate || undefined}
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 disabled:opacity-30"
                required={employmentStatus === 'EXITED'}
              />
              {employmentStatus === 'EXITED' && (
                <p className="text-[10px] text-slate-400 mt-1">
                  Must be on or after joining date.
                </p>
              )}
            </div>
          </div>

          {/* Document Vault Attachments */}
          <div className="pt-2 border-t border-slate-800/80 space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Document Vault Attachments (Optional)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <HrDocumentPicker
                outletId={outletId}
                selectedDocumentId={aadhaarDocumentId}
                onSelectDocument={setAadhaarDocumentId}
                label="Aadhaar / Identity Proof Document"
                mode="document"
                helperText="Optional PDF/PNG/JPEG proof stored securely in Document Vault."
              />

              <HrDocumentPicker
                outletId={outletId}
                selectedDocumentId={photoDocumentId}
                onSelectDocument={setPhotoDocumentId}
                label="Staff Photo Document"
                mode="photo"
                helperText="Optional PNG/JPEG staff photo stored in Document Vault."
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Operational Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Previous experience at IOCL COCO outlet, uniform size L."
              className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isEdit ? 'Update Staff Member' : 'Save Staff Member'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
