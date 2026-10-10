import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { Officer, Department, OfficerStatus } from '../../../shared/types';
import { mapOrgErrorMessage } from './orgUi';

interface OrgOfficerModalProps {
  isOpen: boolean;
  onClose: () => void;
  officerToEdit?: Officer | null;
  departments: Department[];
  onSave: (payload: {
    employeeCode?: string;
    fullName: string;
    designationTitle: string;
    departmentId: string;
    email?: string | null;
    phone?: string | null;
    status: OfficerStatus;
    notes?: string | null;
  }) => Promise<{ success: boolean; errorCode?: string; error?: string }>;
}

export const OrgOfficerModal: React.FC<OrgOfficerModalProps> = ({
  isOpen,
  onClose,
  officerToEdit,
  departments,
  onSave,
}) => {
  const isEditMode = Boolean(officerToEdit);

  const [employeeCode, setEmployeeCode] = useState(officerToEdit?.employeeCode || '');
  const [fullName, setFullName] = useState(officerToEdit?.fullName || '');
  const [designationTitle, setDesignationTitle] = useState(officerToEdit?.designationTitle || '');
  const [departmentId, setDepartmentId] = useState(officerToEdit?.departmentId || departments[0]?.id || '');
  const [email, setEmail] = useState(officerToEdit?.email || '');
  const [phone, setPhone] = useState(officerToEdit?.phone || '');
  const [status, setStatus] = useState<OfficerStatus>(officerToEdit?.status || 'ACTIVE');
  const [notes, setNotes] = useState(officerToEdit?.notes || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!isEditMode && !employeeCode.trim()) {
      setErrorMessage('Employee Code is required.');
      return;
    }
    if (!fullName.trim()) {
      setErrorMessage('Full Name is required.');
      return;
    }
    if (!designationTitle.trim()) {
      setErrorMessage('Designation Title is required.');
      return;
    }
    if (!departmentId) {
      setErrorMessage('Please select a Department.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const payload: any = {
      fullName: fullName.trim(),
      designationTitle: designationTitle.trim(),
      departmentId,
      email: email.trim() || null,
      phone: phone.trim() || null,
      status,
      notes: notes.trim() || null,
    };

    if (!isEditMode) {
      payload.employeeCode = employeeCode.trim().toUpperCase();
    }

    const res = await onSave(payload);
    setIsSubmitting(false);

    if (res.success) {
      onClose();
    } else {
      setErrorMessage(mapOrgErrorMessage(res.errorCode, res.error));
    }
  };

  const activeDepartments = departments.filter(d => isEditMode || d.status === 'ACTIVE');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div>
            <h3 className="text-base font-semibold text-white">
              {isEditMode ? 'Edit Officer Record' : 'Register New Officer'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEditMode ? `Updating ${officerToEdit?.employeeCode}` : 'Create an IOCL officer profile'}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Employee Code <span className="text-orange-400">*</span>
              </label>
              <input
                type="text"
                value={isEditMode ? officerToEdit?.employeeCode : employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                disabled={isEditMode || isSubmitting}
                placeholder="e.g. EMP-10492"
                maxLength={30}
                className={`w-full px-3 py-2 bg-slate-950 border rounded-lg text-sm transition font-mono ${
                  isEditMode
                    ? 'border-slate-800 text-slate-500 cursor-not-allowed'
                    : 'border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500'
                }`}
              />
              {isEditMode && (
                <p className="text-[11px] text-slate-500 mt-1">Employee code is immutable.</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Full Name <span className="text-orange-400">*</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. Ramesh Chandra Sharma"
                maxLength={100}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Designation Title <span className="text-orange-400">*</span>
              </label>
              <input
                type="text"
                value={designationTitle}
                onChange={(e) => setDesignationTitle(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. Chief Manager (Retail)"
                maxLength={100}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Department <span className="text-orange-400">*</span>
              </label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-orange-500 transition"
              >
                {activeDepartments.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Official Email <span className="text-slate-500 font-normal">(Optional)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. ramesh.sharma@iocl.in"
                maxLength={100}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Phone Number <span className="text-slate-500 font-normal">(Optional)</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. 9830012345"
                maxLength={20}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Officer Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as OfficerStatus)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-orange-500 transition"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="TRANSFERRED">TRANSFERRED</option>
              <option value="RETIRED">RETIRED</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Notes <span className="text-slate-500 font-normal">(Optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
              rows={2}
              placeholder="Internal remarks or service record notes..."
              maxLength={300}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800 mt-6">
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
              className="px-4 py-2 text-xs font-medium text-white bg-orange-600 hover:bg-orange-500 rounded-lg transition shadow-md shadow-orange-600/20 disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSubmitting && <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
              <span>{isEditMode ? 'Update Officer' : 'Register Officer'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
