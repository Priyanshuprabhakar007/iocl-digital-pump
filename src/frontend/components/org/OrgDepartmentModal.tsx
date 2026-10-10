import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { Department, OrgStatus } from '../../../shared/types';
import { mapOrgErrorMessage } from './orgUi';

interface OrgDepartmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  departmentToEdit?: Department | null;
  onSave: (payload: { code?: string; name: string; description?: string | null; status: OrgStatus }) => Promise<{ success: boolean; error?: string }>;
}

export const OrgDepartmentModal: React.FC<OrgDepartmentModalProps> = ({
  isOpen,
  onClose,
  departmentToEdit,
  onSave,
}) => {
  const isEditMode = Boolean(departmentToEdit);

  const [code, setCode] = useState(departmentToEdit?.code || '');
  const [name, setName] = useState(departmentToEdit?.name || '');
  const [description, setDescription] = useState(departmentToEdit?.description || '');
  const [status, setStatus] = useState<OrgStatus>(departmentToEdit?.status || 'ACTIVE');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!isEditMode && !code.trim()) {
      setErrorMessage('Department code is required.');
      return;
    }

    if (!name.trim()) {
      setErrorMessage('Department name is required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const payload: { code?: string; name: string; description?: string | null; status: OrgStatus } = {
      name: name.trim(),
      description: description.trim() || null,
      status,
    };

    if (!isEditMode) {
      payload.code = code.trim().toUpperCase();
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
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div>
            <h3 className="text-base font-semibold text-white">
              {isEditMode ? 'Edit Department' : 'Create New Department'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEditMode ? `Updating ${departmentToEdit?.code}` : 'Register an organization department'}
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

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Department Code <span className="text-orange-400">*</span>
            </label>
            <input
              type="text"
              value={isEditMode ? departmentToEdit?.code : code}
              onChange={(e) => setCode(e.target.value)}
              disabled={isEditMode || isSubmitting}
              placeholder="e.g. ENG, HRM, FIN, MKT"
              maxLength={20}
              className={`w-full px-3 py-2 bg-slate-950 border rounded-lg text-sm transition font-mono ${
                isEditMode
                  ? 'border-slate-800 text-slate-500 cursor-not-allowed'
                  : 'border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500'
              }`}
            />
            {isEditMode && (
              <p className="text-[11px] text-slate-500 mt-1">Department code is permanently immutable.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Department Name <span className="text-orange-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              placeholder="e.g. Engineering & Maintenance"
              maxLength={100}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Description <span className="text-slate-500 font-normal">(Optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              rows={3}
              placeholder="Enter brief department scope and responsibility..."
              maxLength={300}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as OrgStatus)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-orange-500 transition"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
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
              <span>{isEditMode ? 'Update Department' : 'Create Department'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
