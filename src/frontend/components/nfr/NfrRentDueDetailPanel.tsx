import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  IndianRupee,
  CreditCard,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Users,
  Layers,
  FileCheck,
  PlusCircle,
  Hash,
} from 'lucide-react';
import type {
  NfrRentDue,
  NfrRentPayment,
  NfrLease,
  NfrSpace,
  NfrVendor,
  Document,
} from '../../../shared/types';
import {
  getNfrRentStatusDisplay,
  resolveNfrDocument,
  canRecordNfrRentPayment,
} from './nfrUi';
import {
  formatDisplayDate,
  formatDisplayDateTime,
  formatFileSize,
} from '../utilities/utilityUi';
import { apiFetch } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../../shared/constants';

export interface NfrRentDueDetailPanelProps {
  dueId: string | null;
  outletId: string;
  refreshKey: number;
  leases: NfrLease[];
  spaces: NfrSpace[];
  vendors: NfrVendor[];
  onClose: () => void;
  onRecordPayment: (due: NfrRentDue) => void;
}

export const NfrRentDueDetailPanel: React.FC<NfrRentDueDetailPanelProps> = ({
  dueId,
  outletId,
  refreshKey,
  leases,
  spaces,
  vendors,
  onClose,
  onRecordPayment,
}) => {
  const { hasPermission } = useAuth();
  const canReadDocs = hasPermission(PERMISSIONS.DOCUMENTS_READ);

  const [due, setDue] = useState<NfrRentDue | null>(null);
  const [payments, setPayments] = useState<NfrRentPayment[]>([]);
  const [vaultDocs, setVaultDocs] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leaseMap = React.useMemo(() => {
    const map = new Map<string, NfrLease>();
    leases.forEach((l) => map.set(l.id, l));
    return map;
  }, [leases]);

  const spaceMap = React.useMemo(() => {
    const map = new Map<string, NfrSpace>();
    spaces.forEach((s) => map.set(s.id, s));
    return map;
  }, [spaces]);

  const vendorMap = React.useMemo(() => {
    const map = new Map<string, NfrVendor>();
    vendors.forEach((v) => map.set(v.id, v));
    return map;
  }, [vendors]);

  useEffect(() => {
    if (!dueId) {
      setDue(null);
      setPayments([]);
      setError(null);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    const loadDueAndPayments = async () => {
      try {
        const [dueRes, payRes] = await Promise.all([
          apiFetch<NfrRentDue>(`/api/v1/nfr/rent-dues/${dueId}`),
          apiFetch<NfrRentPayment[]>(`/api/v1/nfr/rent-dues/${dueId}/payments`),
        ]);

        if (isCancelled) return;

        if (dueRes.success && dueRes.data) {
          setDue(dueRes.data);
        } else {
          setError('Failed to load rent due record.');
        }

        if (payRes.success && Array.isArray(payRes.data)) {
          setPayments(payRes.data);
        } else {
          setPayments([]);
        }

        // Resolve vault documents if user has permission
        if (canReadDocs) {
          try {
            const docRes = await apiFetch<Document[]>('/api/v1/documents');
            if (!isCancelled && docRes.success && Array.isArray(docRes.data)) {
              setVaultDocs(docRes.data.filter((d: Document) => d.outletId === outletId));
            }
          } catch {
            // Non-critical
          }
        }
      } catch (err: any) {
        if (!isCancelled) {
          setError(err.message || 'Failed to load rent due details.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadDueAndPayments();

    return () => {
      isCancelled = true;
    };
  }, [dueId, outletId, refreshKey, canReadDocs]);

  if (!dueId) return null;

  const lease = due ? (due.lease || leaseMap.get(due.leaseId)) : null;
  const space = lease ? spaceMap.get(lease.spaceId) : null;
  const vendor = lease ? vendorMap.get(lease.vendorId) : null;
  const statusInfo = due ? getNfrRentStatusDisplay(due.paymentStatus, due.isOverdue) : null;
  const payable = due ? canRecordNfrRentPayment(hasPermission, due) : false;

  // Sorted newest first
  const sortedPayments = [...payments].sort(
    (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()
  );

  return (
    <div className="fixed inset-0 z-40 overflow-hidden bg-slate-950/70 backdrop-blur-sm flex justify-end transition-opacity">
      <div className="w-full max-w-xl bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl overflow-hidden">
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2">
            <IndianRupee className="w-5 h-5 text-amber-500" />
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Rent Due & Payment Ledger
              </h2>
              <p className="text-xs text-slate-400">
                {due ? `Billing Month: ${due.billingMonth}` : 'Loading...'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isLoading ? (
            <div className="flex justify-center items-center py-12 text-slate-400 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-amber-500 border-t-transparent mr-3" />
              Loading authoritative rent due ledger...
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
              {error}
            </div>
          ) : due ? (
            <>
              {/* Financial Snapshot Card */}
              <div className="p-4 bg-slate-800/60 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-400 block mb-1">Status</span>
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold border ${statusInfo?.badgeClass}`}
                    >
                      {statusInfo?.label}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block mb-1">Due Date</span>
                    <span className="text-xs font-semibold text-slate-200">
                      {formatDisplayDate(due.dueDate)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-700/60 text-center">
                  <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-400 block">Rent Amount</span>
                    <span className="text-sm font-bold text-slate-100">
                      ₹{due.monthlyRentStr}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-400 block">Total Paid</span>
                    <span className="text-sm font-bold text-emerald-400">
                      ₹{due.totalPaidStr}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-900/80 rounded-lg border border-amber-500/20">
                    <span className="text-[11px] text-amber-400 block">Outstanding</span>
                    <span className="text-sm font-bold text-amber-300">
                      ₹{due.outstandingStr}
                    </span>
                  </div>
                </div>
              </div>

              {/* Contextual Lease / Vendor / Space Card */}
              <div className="p-4 bg-slate-800/40 border border-slate-800 rounded-xl space-y-2.5 text-xs">
                <h3 className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-amber-500" />
                  Agreement & Assignment Details
                </h3>

                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-700/60">
                  <div>
                    <span className="text-slate-500 block">Agreement</span>
                    <span className="text-slate-200 font-medium">
                      {lease ? lease.agreementNumber : due.leaseId}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Billing Period</span>
                    <span className="text-slate-200 font-medium">
                      {formatDisplayDate(due.rentPeriodStart)} - {formatDisplayDate(due.rentPeriodEnd)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Space</span>
                    <span className="text-slate-200 font-medium">
                      {space ? `${space.spaceCode} - ${space.name}` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Vendor</span>
                    <span className="text-slate-200 font-medium">
                      {vendor ? vendor.vendorName : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment History Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-amber-500" />
                    Payment Collections ({sortedPayments.length})
                  </h3>
                  {payable && (
                    <button
                      type="button"
                      onClick={() => onRecordPayment(due)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-semibold rounded-lg transition"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      Record Payment
                    </button>
                  )}
                </div>

                {sortedPayments.length === 0 ? (
                  <div className="p-6 bg-slate-800/30 border border-slate-800 rounded-xl text-center">
                    <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-300 font-medium">No Payments Recorded Yet</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Full outstanding balance of ₹{due.outstandingStr} is pending collection.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {sortedPayments.map((p, idx) => {
                      const docMeta = resolveNfrDocument(vaultDocs, p.receiptDocumentId, outletId);

                      return (
                        <div
                          key={p.id}
                          className="p-3.5 bg-slate-800/50 border border-slate-800 rounded-xl space-y-2 text-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-bold text-emerald-400">
                                ₹{p.amountStr}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                Paid on {formatDisplayDateTime(p.paidAt)}
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-medium">
                              Receipt #{idx + 1}
                            </span>
                          </div>

                          {p.paymentReference && (
                            <div className="text-[11px] text-slate-300 flex items-center gap-1.5">
                              <Hash className="w-3 h-3 text-slate-500" />
                              <span className="text-slate-500">Ref:</span>
                              <span className="font-mono">{p.paymentReference}</span>
                            </div>
                          )}

                          {/* Receipt Attachment Indicator */}
                          <div className="pt-2 border-t border-slate-700/60">
                            {docMeta ? (
                              <div className="p-2 bg-slate-900 border border-slate-700/70 rounded-lg flex items-center justify-between">
                                <div className="flex items-center gap-1.5 truncate">
                                  <FileCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                  <span className="text-slate-200 font-medium truncate">
                                    {docMeta.name}
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                                  {formatFileSize(docMeta.sizeBytes)}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                                <FileCheck className="w-3.5 h-3.5 text-sky-400" />
                                <span>Receipt Document Attached</span>
                              </div>
                            )}
                          </div>

                          {p.notes && (
                            <div className="text-[11px] text-slate-400 pt-1">
                              <span className="text-slate-500">Note: </span>
                              {p.notes}
                            </div>
                          )}

                          <div className="text-[10px] text-slate-500 pt-1">
                            Recorded: {formatDisplayDateTime(p.createdAt)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Due Created Timestamp */}
              <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-800">
                Generated: {formatDisplayDateTime(due.createdAt)}
              </div>
            </>
          ) : null}
        </div>

        {/* Drawer Footer */}
        {due && (
          <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition"
            >
              Close
            </button>

            {payable && (
              <button
                type="button"
                onClick={() => onRecordPayment(due)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-semibold rounded-lg transition inline-flex items-center gap-1.5 shadow-sm"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Record Rent Payment</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
