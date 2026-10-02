import React, { useState, useEffect } from 'react';
import { UtilityElectricityBill, UtilityElectricityAccount } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import {
  getBillStatusDisplay,
  formatDisplayDate,
  formatDisplayDateTime,
  canEditBill,
  canMarkBillPaid,
  getUtilityErrorMessage,
} from './utilityUi';
import {
  X,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  CreditCard,
  Edit2,
  ExternalLink,
  Loader2,
  Zap,
} from 'lucide-react';

interface ElectricityBillDetailPanelProps {
  billId: string;
  accounts: UtilityElectricityAccount[];
  canWriteBills: boolean;
  canWritePayments: boolean;
  onClose: () => void;
  onOpenEdit: (bill: UtilityElectricityBill) => void;
  onOpenMarkPaid: (bill: UtilityElectricityBill) => void;
  onRefresh: () => void;
}

export const ElectricityBillDetailPanel: React.FC<ElectricityBillDetailPanelProps> = ({
  billId,
  accounts,
  canWriteBills,
  canWritePayments,
  onClose,
  onOpenEdit,
  onOpenMarkPaid,
  onRefresh,
}) => {
  const [bill, setBill] = useState<UtilityElectricityBill | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const fetchBill = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await apiFetch<UtilityElectricityBill>(`/api/v1/utilities/electricity-bills/${billId}`);
        if (res.success && res.data) {
          setBill(res.data);
        } else {
          setErrorMsg(getUtilityErrorMessage(res.error));
        }
      } catch (err: any) {
        setErrorMsg(getUtilityErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };
    if (billId) {
      fetchBill();
    }
  }, [billId]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <div className="p-8 bg-slate-900 border border-slate-800 rounded-2xl flex items-center gap-3 text-slate-300 text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
          Loading bill details...
        </div>
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-3 max-w-sm">
          <div className="text-rose-400 text-sm font-semibold">{errorMsg || 'Bill not found'}</div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const account = accounts.find(a => a.id === bill.electricityAccountId);
  const statusInfo = getBillStatusDisplay(bill);
  const allowEdit = canEditBill(bill, canWriteBills);
  const allowPay = canMarkBillPaid(bill, canWritePayments);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-xl h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Electricity Bill Invoice
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                {bill.billingPeriodStart} to {bill.billingPeriodEnd}
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

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status & Amount Highlight Card */}
          <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                Bill Payable Amount
              </span>
              <span className="text-3xl font-black text-white font-mono tracking-tight mt-1 block">
                ₹{bill.billAmountStr}
              </span>
            </div>
            <div className="text-right space-y-1">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${statusInfo.badgeClass}`}
              >
                {statusInfo.label}
              </span>
              {statusInfo.isOverdue && (
                <span className="text-[11px] text-rose-400 font-medium block">
                  Past Due Date
                </span>
              )}
            </div>
          </div>

          {/* Account Details */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Zap className="w-4 h-4 text-orange-400" />
              Consumer Account
            </h3>
            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Consumer Number:</span>
                <span className="font-bold text-white font-mono">
                  {account?.consumerNumber || bill.electricityAccountId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Provider:</span>
                <span className="text-slate-200">{account?.providerName || 'DISCOM'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Billing Cycle:</span>
                <span className="text-slate-200 font-semibold">{account?.billingCycle || 'MONTHLY'}</span>
              </div>
            </div>
          </div>

          {/* Billing Period & Dates */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-orange-400" />
              Invoice Timeline
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl">
                <span className="text-slate-500 block uppercase text-[10px]">Period Start</span>
                <span className="text-white font-medium font-mono text-sm mt-0.5 block">
                  {formatDisplayDate(bill.billingPeriodStart)}
                </span>
              </div>
              <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl">
                <span className="text-slate-500 block uppercase text-[10px]">Period End</span>
                <span className="text-white font-medium font-mono text-sm mt-0.5 block">
                  {formatDisplayDate(bill.billingPeriodEnd)}
                </span>
              </div>
              <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl col-span-2 flex justify-between items-center">
                <div>
                  <span className="text-slate-500 block uppercase text-[10px]">Payment Due Date</span>
                  <span className={`font-mono text-sm font-semibold mt-0.5 block ${statusInfo.isOverdue ? 'text-rose-400' : 'text-white'}`}>
                    {formatDisplayDate(bill.dueDate)}
                  </span>
                </div>
                {statusInfo.isOverdue && (
                  <span className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] font-semibold rounded-md">
                    OVERDUE
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Document References */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <FileText className="w-4 h-4 text-orange-400" />
              Attached Documents
            </h3>
            <div className="space-y-2 text-xs">
              {/* Bill Copy */}
              <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2.5 truncate">
                  <FileText className="w-4 h-4 text-orange-400 shrink-0" />
                  <div>
                    <span className="text-white font-medium block">Electricity Bill Copy</span>
                    <span className="text-[11px] text-slate-500 font-mono truncate block">
                      Doc ID: {bill.billDocumentId}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Receipt if Paid */}
              {bill.status === 'PAID' && bill.paymentReceiptDocumentId && (
                <div className="p-3.5 bg-emerald-950/20 border border-emerald-500/20 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2.5 truncate">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <span className="text-emerald-300 font-medium block">Payment Receipt</span>
                      <span className="text-[11px] text-slate-500 font-mono truncate block">
                        Doc ID: {bill.paymentReceiptDocumentId}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Payment Details (If Paid) */}
          {bill.status === 'PAID' && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                Payment Settlement Record
              </h3>
              <div className="p-4 bg-emerald-950/10 border border-emerald-500/20 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Payment Reference:</span>
                  <span className="font-mono text-emerald-300 font-semibold">
                    {bill.paymentReference || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Settled Date & Time:</span>
                  <span className="text-slate-200 font-mono">
                    {formatDisplayDateTime(bill.paidAt)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Recorded By User:</span>
                  <span className="text-slate-400 font-mono">{bill.paidByUserId || '-'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-slate-800 bg-slate-900/90 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
          >
            Close
          </button>

          {allowEdit && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenEdit(bill);
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-orange-400 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Edit Pending Bill
            </button>
          )}

          {allowPay && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenMarkPaid(bill);
              }}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors shadow-lg shadow-emerald-600/20"
            >
              <CheckCircle2 className="w-4 h-4" />
              Mark Bill Paid
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
