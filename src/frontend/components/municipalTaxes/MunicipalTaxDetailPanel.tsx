import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../../shared/constants';
import { MunicipalTaxDue, Document } from '../../../shared/types';
import {
  formatTaxType,
  formatTaxFrequency,
  getMunicipalTaxStatusDisplay,
  canEditMunicipalTaxDue,
  canMarkMunicipalTaxPaid,
  formatDisplayDate,
  formatDisplayDateTime,
  formatFileSize,
  getMunicipalTaxErrorMessage,
  resolveMunicipalTaxAttachments,
} from './municipalTaxUi';
import {
  X,
  Loader2,
  Landmark,
  FileText,
  CreditCard,
  Edit2,
  CheckCircle2,
  Calendar,
  IndianRupee,
  Paperclip,
  AlertCircle,
} from 'lucide-react';

interface MunicipalTaxDetailPanelProps {
  dueId: string | null;
  outletId: string;
  onClose: () => void;
  refreshKey: number;
  canWrite: boolean;
  canPay: boolean;
  onEditDue: (due: MunicipalTaxDue) => void;
  onMarkPaid: (due: MunicipalTaxDue) => void;
}

export const MunicipalTaxDetailPanel: React.FC<MunicipalTaxDetailPanelProps> = ({
  dueId,
  outletId,
  onClose,
  refreshKey,
  canWrite,
  canPay,
  onEditDue,
  onMarkPaid,
}) => {
  const { hasPermission } = useAuth();
  const canReadDocuments = hasPermission(PERMISSIONS.DOCUMENTS_READ);

  const [due, setDue] = useState<MunicipalTaxDue | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [assessmentDoc, setAssessmentDoc] = useState<Document | null>(null);
  const [receiptDoc, setReceiptDoc] = useState<Document | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!dueId) {
      setDue(null);
      setAssessmentDoc(null);
      setReceiptDoc(null);
      setLoading(false);
      setErrorMessage(null);
      return;
    }

    // Clear old document metadata immediately before fetching to prevent Due A metadata under Due B
    setAssessmentDoc(null);
    setReceiptDoc(null);
    setLoading(true);
    setErrorMessage(null);

    const fetchDetail = async () => {
      try {
        const res = await apiFetch<MunicipalTaxDue>(`/api/v1/municipal-taxes/${dueId}`);
        if (cancelled) return;

        if (res.success && res.data) {
          const loadedDue = res.data;
          setDue(loadedDue);

          // Fetch attached document details through single list call if user has permission and doc IDs exist
          if (
            canReadDocuments &&
            outletId &&
            (loadedDue.assessmentDocumentId || loadedDue.paymentReceiptDocumentId)
          ) {
            try {
              const docRes = await apiFetch<Document[]>('/api/v1/documents');
              if (cancelled) return;

              if (docRes.success && docRes.data) {
                const { assessmentDoc: resolvedAssessment, receiptDoc: resolvedReceipt } =
                  resolveMunicipalTaxAttachments(
                    docRes.data,
                    outletId,
                    loadedDue.assessmentDocumentId,
                    loadedDue.paymentReceiptDocumentId
                  );
                if (cancelled) return;
                setAssessmentDoc(resolvedAssessment);
                setReceiptDoc(resolvedReceipt);
              }
            } catch {
              // Document list failure must not break statutory due detail
            }
          }
        } else {
          setErrorMessage(getMunicipalTaxErrorMessage(res.error || res));
        }
      } catch (err: any) {
        if (cancelled) return;
        setErrorMessage(getMunicipalTaxErrorMessage(err));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchDetail();

    return () => {
      cancelled = true;
    };
  }, [dueId, outletId, refreshKey, canReadDocuments]);

  if (!dueId) return null;

  const statusInfo = due ? getMunicipalTaxStatusDisplay(due) : null;
  const isEditable = due ? canEditMunicipalTaxDue(due, canWrite) : false;
  const isPayable = due ? canMarkMunicipalTaxPaid(due, canPay) : false;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Statutory Due Details</h2>
              <p className="text-xs text-slate-400 font-mono">
                {due ? due.referenceNumber : 'Loading...'}
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          {loading && !due && (
            <div className="p-8 text-center space-y-3">
              <Loader2 className="w-6 h-6 animate-spin text-orange-400 mx-auto" />
              <p className="text-slate-400">Loading statutory due details...</p>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 font-medium">
              {errorMessage}
            </div>
          )}

          {due && (
            <>
              {/* Primary Summary Card */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-white text-base">{formatTaxType(due.taxType)}</div>
                    <div className="text-slate-400 font-mono text-xs mt-0.5">{due.authorityName}</div>
                  </div>
                  {statusInfo && (
                    <span
                      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border ${statusInfo.badgeClass}`}
                    >
                      {statusInfo.label}
                    </span>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-slate-400 text-xs uppercase font-mono">Amount Payable</span>
                  <span className="text-xl font-bold font-mono text-white">
                    ₹{due.amountStr || '0.00'}
                  </span>
                </div>
              </div>

              {/* Assessment Specifications */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                  Assessment Information
                </h3>
                <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-slate-950/50 border border-slate-800 font-mono text-xs">
                  <div>
                    <span className="text-slate-500 uppercase block text-[10px]">Reference Number</span>
                    <span className="text-slate-200">{due.referenceNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 uppercase block text-[10px]">Frequency</span>
                    <span className="text-slate-200">{formatTaxFrequency(due.assessmentFrequency)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 uppercase block text-[10px]">Period Start</span>
                    <span className="text-slate-200">{formatDisplayDate(due.assessmentPeriodStart)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 uppercase block text-[10px]">Period End</span>
                    <span className="text-slate-200">{formatDisplayDate(due.assessmentPeriodEnd)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 uppercase block text-[10px]">Due Date</span>
                    <span className="text-slate-200">{formatDisplayDate(due.dueDate)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 uppercase block text-[10px]">Created Date</span>
                    <span className="text-slate-400">{formatDisplayDate(due.createdAt)}</span>
                  </div>
                </div>
              </div>

              {/* Assessment Demand Document */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                  Assessment Document
                </h3>
                {due.assessmentDocumentId ? (
                  canReadDocuments ? (
                    <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 truncate">
                        <FileText className="w-4 h-4 text-orange-400 shrink-0" />
                        <div className="truncate">
                          <div className="font-medium text-slate-200 truncate">
                            {assessmentDoc ? assessmentDoc.name : `Document #${due.assessmentDocumentId}`}
                          </div>
                          {assessmentDoc ? (
                            <div className="text-[10px] text-slate-400 font-mono">
                              {formatFileSize(assessmentDoc.sizeBytes)} • {formatDisplayDate(assessmentDoc.createdAt)}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400 font-mono">
                              Assessment document attached
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2 py-1 rounded-lg shrink-0">
                        Stored in Document Vault
                      </span>
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center gap-2.5 text-slate-300">
                      <Paperclip className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="font-medium text-xs">Assessment document attached</span>
                    </div>
                  )
                ) : (
                  <div className="p-3 bg-slate-950/30 border border-slate-800/60 rounded-xl text-slate-500 font-mono text-center">
                    No assessment document attached.
                  </div>
                )}
              </div>

              {/* Settlement & Payment Information (if PAID) */}
              {due.status === 'PAID' && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-mono flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Payment Settlement Details
                  </h3>
                  <div className="p-4 rounded-xl bg-emerald-950/10 border border-emerald-500/20 space-y-3 font-mono text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-500 uppercase block text-[10px]">Paid At</span>
                        <span className="text-slate-200">{formatDisplayDateTime(due.paidAt)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 uppercase block text-[10px]">Payment Reference</span>
                        <span className="text-slate-200">{due.paymentReference || 'N/A'}</span>
                      </div>
                      {due.paidByUserId && (
                        <div className="col-span-2">
                          <span className="text-slate-500 uppercase block text-[10px]">Recorded By User ID</span>
                          <span className="text-slate-400 text-[11px] truncate block">{due.paidByUserId}</span>
                        </div>
                      )}
                    </div>

                    {due.paymentReceiptDocumentId && (
                      <div className="pt-2 border-t border-emerald-500/20">
                        {canReadDocuments ? (
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 truncate">
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                              <div className="truncate">
                                <span className="font-semibold text-slate-200 truncate block">
                                  {receiptDoc ? receiptDoc.name : `Receipt #${due.paymentReceiptDocumentId}`}
                                </span>
                                {receiptDoc ? (
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    {formatFileSize(receiptDoc.sizeBytes)} • {formatDisplayDate(receiptDoc.createdAt)}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    Payment receipt attached
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="text-[10px] font-mono text-emerald-400/80 bg-emerald-950/40 border border-emerald-500/20 px-2 py-1 rounded-lg shrink-0">
                              Stored in Document Vault
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-slate-300">
                            <Paperclip className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="font-medium text-xs">Payment receipt attached</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Notes */}
              {due.notes && (
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                    Notes & Remarks
                  </h3>
                  <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-300 whitespace-pre-wrap">
                    {due.notes}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        {due && (
          <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-3">
            {isPayable && (
              <button
                type="button"
                onClick={() => onMarkPaid(due)}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-500/20 transition-all"
              >
                <CreditCard className="w-4 h-4" />
                <span>Record Payment</span>
              </button>
            )}
            {isEditable && (
              <button
                type="button"
                onClick={() => onEditDue(due)}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                <span>Edit Due</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
