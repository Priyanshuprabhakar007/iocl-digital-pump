import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import type { HrUniformIssue, HrUniformCondition } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import {
  canSubmitUniformReturn,
  getUniformErrorMessage,
  formatUniformCondition,
  formatDisplayDate,
} from './hrUniformUi';

interface HrUniformReturnModalProps {
  isOpen: boolean;
  outletId: string;
  issue: HrUniformIssue | null;
  onClose: () => void;
  onSuccess: (updatedIssue: HrUniformIssue) => void;
}

const CONDITIONS: HrUniformCondition[] = ['NEW', 'GOOD', 'FAIR', 'DAMAGED', 'LOST'];

export const HrUniformReturnModal: React.FC<HrUniformReturnModalProps> = ({
  isOpen,
  outletId,
  issue,
  onClose,
  onSuccess,
}) => {
  const [condition, setCondition] = useState<HrUniformCondition>('GOOD');
  const [returnToStock, setReturnToStock] = useState<boolean>(true);
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen && issue) {
      setCondition('GOOD');
      setReturnToStock(true);
      setNotes('');
      setFormError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, issue, outletId]);

  if (!isOpen || !issue) return null;

  // Handle condition change and enforce return-to-stock constraint
  const handleConditionChange = (newCondition: HrUniformCondition) => {
    setCondition(newCondition);
    if (newCondition === 'DAMAGED' || newCondition === 'LOST') {
      setReturnToStock(false);
    }
    setFormError(null);
  };

  const isRestockProhibited = condition === 'DAMAGED' || condition === 'LOST';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const validation = canSubmitUniformReturn({
      condition,
      returnToStock,
    });

    if (!validation.isValid) {
      setFormError(validation.error);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        condition,
        returnToStock,
        notes: notes.trim() ? notes.trim() : null,
      };

      const res = await apiFetch<HrUniformIssue>(
        `/api/v1/outlets/${outletId}/hr/uniform/issues/${issue.id}/return`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (!res.success || !res.data) {
        setFormError(getUniformErrorMessage(res.error));
        setIsSubmitting(false);
        return;
      }

      onSuccess(res.data);
    } catch (err) {
      setFormError(getUniformErrorMessage(err));
      setIsSubmitting(false);
    }
  };

  const issueConditionStyle = formatUniformCondition(issue.conditionAtIssue);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Process Uniform Return</h3>
              <p className="text-[11px] text-slate-400">
                Receive returned uniform and close active issue record
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {formError && (
            <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Original Issue Summary (Read-Only) */}
          <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2 text-xs">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
              Original Issue Information
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-500">Staff:</span>{' '}
                <span className="text-white font-medium">{issue.staffName || 'Staff Member'}</span>
                <span className="text-slate-400 font-mono text-[10px] ml-1">
                  ({issue.employeeCode || '—'})
                </span>
              </div>
              <div>
                <span className="text-slate-500">Item:</span>{' '}
                <span className="text-white font-medium">
                  {issue.itemName || issue.itemCode || 'Uniform Item'}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Size:</span>{' '}
                <span className="text-amber-300 font-mono font-bold">
                  {issue.sizeLabel || '—'}
                </span>{' '}
                <span className="text-slate-500 font-mono">({issue.quantity} unit)</span>
              </div>
              <div>
                <span className="text-slate-500">Issued Date:</span>{' '}
                <span className="text-slate-300 font-mono">
                  {formatDisplayDate(issue.issuedAt)}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Issued Condition:</span>{' '}
                <span
                  className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold border ${issueConditionStyle.bgClass} ${issueConditionStyle.textClass} ${issueConditionStyle.borderClass}`}
                >
                  {issueConditionStyle.label}
                </span>
              </div>
            </div>
          </div>

          {/* Condition on Return */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Condition on Return <span className="text-orange-400">*</span>
            </label>
            <select
              value={condition}
              onChange={e => handleConditionChange(e.target.value as HrUniformCondition)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60 cursor-pointer"
            >
              {CONDITIONS.map(c => (
                <option key={c} value={c}>
                  {formatUniformCondition(c).label}
                </option>
              ))}
            </select>
          </div>

          {/* Return to Usable Stock Checkbox */}
          <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-xl space-y-1.5">
            <label
              className={`flex items-start gap-2.5 text-xs ${
                isRestockProhibited ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                checked={returnToStock}
                onChange={e => setReturnToStock(e.target.checked)}
                disabled={isSubmitting || isRestockProhibited}
                className="mt-0.5 rounded border-slate-700 bg-slate-900 text-orange-500 focus:ring-orange-500 focus:ring-offset-slate-950 disabled:opacity-50"
              />
              <div>
                <span className="font-semibold text-white">Return to Usable Stock</span>
                <p className="text-[11px] text-slate-400">
                  Automatically credit {issue.quantity} unit back into outlet available inventory.
                </p>
              </div>
            </label>

            {isRestockProhibited && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-400 pt-1 border-t border-slate-800/60">
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>Damaged or lost uniforms cannot be returned to usable stock.</span>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Return Notes <span className="text-slate-500 lowercase">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={isSubmitting}
              placeholder="e.g. Employee separation return, size upgrade turnover"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Processing Return...</span>
                </>
              ) : (
                <span>Confirm Return</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
