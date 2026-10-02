import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../services/api';
import {
  MunicipalTaxDue,
  MunicipalTaxType,
  MunicipalTaxFrequency,
} from '../../../shared/types';
import { MunicipalTaxDocumentPicker } from './MunicipalTaxDocumentPicker';
import {
  canSubmitMunicipalTaxDue,
  getMunicipalTaxErrorMessage,
} from './municipalTaxUi';
import { X, Loader2, Landmark, Check } from 'lucide-react';

interface MunicipalTaxDueModalProps {
  isOpen: boolean;
  onClose: () => void;
  outletId: string;
  dueToEdit: MunicipalTaxDue | null;
  onSuccess: (message?: string) => void;
}

export const MunicipalTaxDueModal: React.FC<MunicipalTaxDueModalProps> = ({
  isOpen,
  onClose,
  outletId,
  dueToEdit,
  onSuccess,
}) => {
  const isEditMode = Boolean(dueToEdit);

  // Form State
  const [taxType, setTaxType] = useState<MunicipalTaxType>('PROPERTY_TAX');
  const [authorityName, setAuthorityName] = useState<string>('');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [assessmentFrequency, setAssessmentFrequency] = useState<MunicipalTaxFrequency>('ANNUAL');
  const [assessmentPeriodStart, setAssessmentPeriodStart] = useState<string>('');
  const [assessmentPeriodEnd, setAssessmentPeriodEnd] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [assessmentDocumentId, setAssessmentDocumentId] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>('');

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize or reset form when modal opens or dueToEdit changes
  useEffect(() => {
    if (isOpen) {
      if (dueToEdit) {
        setTaxType(dueToEdit.taxType);
        setAuthorityName(dueToEdit.authorityName || '');
        setReferenceNumber(dueToEdit.referenceNumber || '');
        setAssessmentFrequency(dueToEdit.assessmentFrequency);
        setAssessmentPeriodStart(dueToEdit.assessmentPeriodStart ? dueToEdit.assessmentPeriodStart.slice(0, 10) : '');
        setAssessmentPeriodEnd(dueToEdit.assessmentPeriodEnd ? dueToEdit.assessmentPeriodEnd.slice(0, 10) : '');
        setAmount(dueToEdit.amountStr || (dueToEdit.amountPaise ? (dueToEdit.amountPaise / 100).toFixed(2) : ''));
        setDueDate(dueToEdit.dueDate ? dueToEdit.dueDate.slice(0, 10) : '');
        setAssessmentDocumentId(dueToEdit.assessmentDocumentId || null);
        setNotes(dueToEdit.notes || '');
      } else {
        setTaxType('PROPERTY_TAX');
        setAuthorityName('');
        setReferenceNumber('');
        setAssessmentFrequency('ANNUAL');
        setAssessmentPeriodStart('');
        setAssessmentPeriodEnd('');
        setAmount('');
        setDueDate('');
        setAssessmentDocumentId(null);
        setNotes('');
      }
      setErrorMessage(null);
    }
  }, [isOpen, dueToEdit]);

  if (!isOpen) return null;

  const isFormValid = canSubmitMunicipalTaxDue(
    {
      taxType,
      authorityName,
      referenceNumber,
      assessmentFrequency,
      assessmentPeriodStart,
      assessmentPeriodEnd,
      amount,
      dueDate,
    },
    submitting
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Guard: assessmentPeriodEnd < assessmentPeriodStart
    if (assessmentPeriodStart && assessmentPeriodEnd && assessmentPeriodEnd < assessmentPeriodStart) {
      setErrorMessage('Assessment period end date cannot be earlier than start date.');
      return;
    }

    if (!isFormValid) {
      setErrorMessage('Please fill in all required fields correctly.');
      return;
    }

    setSubmitting(true);

    try {
      if (isEditMode && dueToEdit) {
        const payload = {
          taxType,
          authorityName: authorityName.trim(),
          referenceNumber: referenceNumber.trim(),
          assessmentFrequency,
          assessmentPeriodStart,
          assessmentPeriodEnd,
          amount: amount.trim(),
          dueDate,
          assessmentDocumentId: assessmentDocumentId || null,
          notes: notes.trim() || null,
        };

        const res = await apiFetch<MunicipalTaxDue>(`/api/v1/municipal-taxes/${dueToEdit.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });

        if (res.success && res.data) {
          onSuccess('Statutory due updated successfully.');
          onClose();
        } else {
          if (res.error?.code === 'MUNICIPAL_TAX_STATE_CHANGED') {
            onSuccess(
              'The statutory due changed while you were viewing it. The latest record has been reloaded.'
            );
            onClose();
          } else {
            setErrorMessage(getMunicipalTaxErrorMessage(res.error || res));
          }
        }
      } else {
        const payload = {
          taxType,
          authorityName: authorityName.trim(),
          referenceNumber: referenceNumber.trim(),
          assessmentFrequency,
          assessmentPeriodStart,
          assessmentPeriodEnd,
          amount: amount.trim(),
          dueDate,
          assessmentDocumentId: assessmentDocumentId || undefined,
          notes: notes.trim() || undefined,
        };

        const res = await apiFetch<MunicipalTaxDue>(`/api/v1/outlets/${outletId}/municipal-taxes`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        if (res.success && res.data) {
          onSuccess('Statutory due created successfully.');
          onClose();
        } else {
          setErrorMessage(getMunicipalTaxErrorMessage(res.error || res));
        }
      }
    } catch (err: any) {
      setErrorMessage(getMunicipalTaxErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {isEditMode ? 'Edit Statutory Due' : 'Create Statutory Due'}
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                {isEditMode ? 'Modify pending assessment details' : 'Record new municipal tax assessment'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 font-medium">
              {errorMessage}
            </div>
          )}

          {/* Tax Type & Assessment Frequency */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1 uppercase tracking-wider text-[11px]">
                Tax Type <span className="text-orange-400">*</span>
              </label>
              <select
                value={taxType}
                onChange={e => setTaxType(e.target.value as MunicipalTaxType)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-orange-500"
              >
                <option value="PROPERTY_TAX">Property Tax</option>
                <option value="TRADE_LICENSE_FEE">Trade License Fee</option>
                <option value="SIGNAGE_CHARGE">Signage Charge</option>
                <option value="LOCAL_AUTHORITY_DUE">Local Authority Due</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1 uppercase tracking-wider text-[11px]">
                Assessment Frequency <span className="text-orange-400">*</span>
              </label>
              <select
                value={assessmentFrequency}
                onChange={e => setAssessmentFrequency(e.target.value as MunicipalTaxFrequency)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-orange-500"
              >
                <option value="ANNUAL">Annual</option>
                <option value="QUARTERLY">Quarterly</option>
              </select>
            </div>
          </div>

          {/* Authority Name & Reference Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1 uppercase tracking-wider text-[11px]">
                Authority Name <span className="text-orange-400">*</span>
              </label>
              <input
                type="text"
                value={authorityName}
                onChange={e => setAuthorityName(e.target.value)}
                placeholder="e.g. Municipal Corporation of Delhi"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-orange-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1 uppercase tracking-wider text-[11px]">
                Reference Number <span className="text-orange-400">*</span>
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={e => setReferenceNumber(e.target.value)}
                placeholder="e.g. MCD/PT/2026/001"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-orange-500"
                required
              />
            </div>
          </div>

          {/* Assessment Period Start & End */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1 uppercase tracking-wider text-[11px]">
                Assessment Period Start <span className="text-orange-400">*</span>
              </label>
              <input
                type="date"
                value={assessmentPeriodStart}
                onChange={e => setAssessmentPeriodStart(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-orange-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1 uppercase tracking-wider text-[11px]">
                Assessment Period End <span className="text-orange-400">*</span>
              </label>
              <input
                type="date"
                value={assessmentPeriodEnd}
                onChange={e => setAssessmentPeriodEnd(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-orange-500"
                required
              />
            </div>
          </div>

          {/* Amount & Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1 uppercase tracking-wider text-[11px]">
                Amount Payable (₹) <span className="text-orange-400">*</span>
              </label>
              <input
                type="text"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="e.g. 25000.00"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-orange-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1 uppercase tracking-wider text-[11px]">
                Due Date <span className="text-orange-400">*</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-orange-500"
                required
              />
            </div>
          </div>

          {/* Assessment Document Attachment (Optional) */}
          <div className="pt-2 border-t border-slate-800/80">
            <MunicipalTaxDocumentPicker
              outletId={outletId}
              selectedDocId={assessmentDocumentId}
              onSelectDocId={setAssessmentDocumentId}
              label="Assessment / Demand Document"
              required={false}
              helpText="Optional statutory demand notice or tax assessment document."
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1 uppercase tracking-wider text-[11px]">
              Notes / Remarks <span className="text-slate-500 font-normal normal-case">(Optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Additional assessment remarks or authority instructions"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-orange-500"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !isFormValid}
              className="flex items-center gap-2 px-5 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl font-semibold shadow-lg shadow-orange-500/20 transition-all"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              <span>{submitting ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Due'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
