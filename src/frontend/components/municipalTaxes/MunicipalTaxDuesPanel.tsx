import React from 'react';
import { MunicipalTaxDue } from '../../../shared/types';
import {
  formatTaxType,
  formatTaxFrequency,
  getMunicipalTaxStatusDisplay,
  canEditMunicipalTaxDue,
  canMarkMunicipalTaxPaid,
  formatDisplayDate,
} from './municipalTaxUi';
import {
  FileText,
  CreditCard,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Landmark,
  Eye,
  Check,
} from 'lucide-react';

interface MunicipalTaxDuesPanelProps {
  dues: MunicipalTaxDue[];
  loading: boolean;
  canWrite: boolean;
  canPay: boolean;
  onSelectDue: (due: MunicipalTaxDue) => void;
  onEditDue: (due: MunicipalTaxDue) => void;
  onMarkPaid: (due: MunicipalTaxDue) => void;
}

export const MunicipalTaxDuesPanel: React.FC<MunicipalTaxDuesPanelProps> = ({
  dues,
  loading,
  canWrite,
  canPay,
  onSelectDue,
  onEditDue,
  onMarkPaid,
}) => {
  if (loading && dues.length === 0) {
    return (
      <div className="p-8 bg-slate-900/60 border border-slate-800 rounded-2xl text-center">
        <div className="inline-block p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 mb-3 animate-pulse">
          <Landmark className="w-6 h-6" />
        </div>
        <div className="text-sm font-semibold text-slate-200">Loading statutory dues...</div>
        <div className="text-xs text-slate-400 mt-1 font-mono">Fetching latest municipal tax assessments</div>
      </div>
    );
  }

  if (dues.length === 0) {
    return (
      <div className="p-12 bg-slate-900/40 border border-slate-800/80 rounded-2xl text-center">
        <div className="inline-block p-3 rounded-2xl bg-slate-800/80 border border-slate-700/60 text-slate-400 mb-3">
          <Landmark className="w-8 h-8 text-slate-400" />
        </div>
        <div className="text-base font-bold text-white">No Statutory Dues Found</div>
        <div className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          No municipal tax or local authority dues recorded for this outlet matching the selected filters.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Desktop / Tablet Table View */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 border-b border-slate-800 font-mono text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Tax Type / Authority</th>
                <th className="py-3.5 px-4 font-semibold">Reference</th>
                <th className="py-3.5 px-4 font-semibold">Assessment Period</th>
                <th className="py-3.5 px-4 font-semibold text-right">Amount</th>
                <th className="py-3.5 px-4 font-semibold">Due Date</th>
                <th className="py-3.5 px-4 font-semibold">Status</th>
                <th className="py-3.5 px-4 font-semibold text-center">Docs</th>
                <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {dues.map(due => {
                const statusInfo = getMunicipalTaxStatusDisplay(due);
                const isEditable = canEditMunicipalTaxDue(due, canWrite);
                const isPayable = canMarkMunicipalTaxPaid(due, canPay);

                return (
                  <tr
                    key={due.id}
                    onClick={() => onSelectDue(due)}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                  >
                    {/* Tax Type / Authority */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white flex items-center gap-1.5">
                        <span>{formatTaxType(due.taxType)}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-xs font-mono">
                        {due.authorityName}
                      </div>
                    </td>

                    {/* Reference */}
                    <td className="py-3.5 px-4 font-mono text-slate-200">
                      <div>{due.referenceNumber}</div>
                      <div className="text-[10px] text-slate-500 uppercase">{formatTaxFrequency(due.assessmentFrequency)}</div>
                    </td>

                    {/* Assessment Period */}
                    <td className="py-3.5 px-4 font-mono text-slate-300 text-[11px]">
                      <div>{formatDisplayDate(due.assessmentPeriodStart)}</div>
                      <div className="text-slate-500">to {formatDisplayDate(due.assessmentPeriodEnd)}</div>
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                      ₹{due.amountStr || '0.00'}
                    </td>

                    {/* Due Date */}
                    <td className="py-3.5 px-4 font-mono text-slate-300">
                      {formatDisplayDate(due.dueDate)}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${statusInfo.badgeClass}`}
                      >
                        {statusInfo.label}
                      </span>
                    </td>

                    {/* Documents Indicator */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-slate-400">
                        {due.assessmentDocumentId ? (
                          <span title="Assessment document attached">
                            <FileText className="w-4 h-4 text-orange-400" />
                          </span>
                        ) : (
                          <span className="w-4 h-4 block text-slate-600">-</span>
                        )}
                        {due.paymentReceiptDocumentId && (
                          <span title="Payment receipt attached">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        {isPayable && (
                          <button
                            type="button"
                            onClick={() => onMarkPaid(due)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold transition-colors"
                            title="Mark as Paid"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>Mark Paid</span>
                          </button>
                        )}
                        {isEditable && (
                          <button
                            type="button"
                            onClick={() => onEditDue(due)}
                            className="p-1.5 text-slate-400 hover:text-orange-400 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Edit Statutory Due"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onSelectDue(due)}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Stacked Card View */}
      <div className="md:hidden space-y-3">
        {dues.map(due => {
          const statusInfo = getMunicipalTaxStatusDisplay(due);
          const isEditable = canEditMunicipalTaxDue(due, canWrite);
          const isPayable = canMarkMunicipalTaxPaid(due, canPay);

          return (
            <div
              key={due.id}
              onClick={() => onSelectDue(due)}
              className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3 active:bg-slate-800/60 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-white text-sm">{formatTaxType(due.taxType)}</div>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">{due.authorityName}</div>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${statusInfo.badgeClass}`}
                >
                  {statusInfo.label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-2 border-t border-slate-800/60">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Reference</span>
                  <span className="text-slate-200">{due.referenceNumber}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Frequency</span>
                  <span className="text-slate-200">{formatTaxFrequency(due.assessmentFrequency)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Amount</span>
                  <span className="text-white font-bold">₹{due.amountStr || '0.00'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Due Date</span>
                  <span className="text-slate-200">{formatDisplayDate(due.dueDate)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
                <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                  {due.assessmentDocumentId && (
                    <span className="flex items-center gap-1 text-orange-400">
                      <FileText className="w-3.5 h-3.5" /> Assessment
                    </span>
                  )}
                  {due.paymentReceiptDocumentId && (
                    <span className="flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Receipt
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  {isPayable && (
                    <button
                      type="button"
                      onClick={() => onMarkPaid(due)}
                      className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Mark Paid</span>
                    </button>
                  )}
                  {isEditable && (
                    <button
                      type="button"
                      onClick={() => onEditDue(due)}
                      className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg text-xs"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
