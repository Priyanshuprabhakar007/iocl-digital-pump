import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  Users,
  Calendar,
  IndianRupee,
  FileText,
  Zap,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileCheck,
  Edit2,
  PlusCircle,
} from 'lucide-react';
import type { NfrLease, NfrSpace, NfrVendor, Document, UtilitySubMeter } from '../../../shared/types';
import {
  formatNfrType,
  getNfrLeaseStatusDisplay,
  resolveNfrDocument,
  canEditNfrLease,
  canTerminateNfrLease,
  canGenerateNfrRentDue,
} from './nfrUi';
import { formatDisplayDate, formatDisplayDateTime, formatFileSize } from '../utilities/utilityUi';
import { apiFetch } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../../shared/constants';

export interface NfrLeaseDetailPanelProps {
  leaseId: string | null;
  outletId: string;
  refreshKey: number;
  spaces: NfrSpace[];
  vendors: NfrVendor[];
  onClose: () => void;
  onEditLease: (lease: NfrLease) => void;
  onTerminateLease: (lease: NfrLease) => void;
  onGenerateDue: (lease: NfrLease) => void;
}

export const NfrLeaseDetailPanel: React.FC<NfrLeaseDetailPanelProps> = ({
  leaseId,
  outletId,
  refreshKey,
  spaces,
  vendors,
  onClose,
  onEditLease,
  onTerminateLease,
  onGenerateDue,
}) => {
  const { hasPermission } = useAuth();
  const canReadDocs = hasPermission(PERMISSIONS.DOCUMENTS_READ);
  const canReadUtilities = hasPermission(PERMISSIONS.UTILITIES_READ);

  const [lease, setLease] = useState<NfrLease | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vaultDoc, setVaultDoc] = useState<Document | null>(null);
  const [subMeter, setSubMeter] = useState<UtilitySubMeter | null>(null);

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
    if (!leaseId) {
      setLease(null);
      setVaultDoc(null);
      setSubMeter(null);
      setError(null);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    const loadAuthoritativeLease = async () => {
      try {
        const leaseRes = await apiFetch<NfrLease>(
          `/api/v1/nfr/leases/${leaseId}`
        );

        if (isCancelled) return;

        if (leaseRes.success && leaseRes.data) {
          const currentLease = leaseRes.data;
          setLease(currentLease);

          // If agreement doc attached and user can read docs, fetch doc list to resolve metadata
          if (currentLease.agreementDocumentId && canReadDocs) {
            try {
              const docRes = await apiFetch<Document[]>(
                '/api/v1/documents'
              );
              if (!isCancelled && docRes.success && Array.isArray(docRes.data)) {
                const matched = resolveNfrDocument(
                  docRes.data,
                  currentLease.agreementDocumentId,
                  outletId
                );
                setVaultDoc(matched);
              }
            } catch {
              // Doc fetch is secondary
            }
          } else {
            setVaultDoc(null);
          }

          // If sub-meter linked and user can read utilities, fetch sub-meters to resolve label
          if (currentLease.subMeterId && canReadUtilities) {
            try {
              const smRes = await apiFetch<UtilitySubMeter[]>(
                `/api/v1/outlets/${outletId}/utilities/sub-meters`
              );
              if (!isCancelled && smRes.success && Array.isArray(smRes.data)) {
                const matchedSm = smRes.data.find((m) => m.id === currentLease.subMeterId);
                setSubMeter(matchedSm || null);
              }
            } catch {
              // Utility fetch is secondary
            }
          } else {
            setSubMeter(null);
          }
        } else {
          setError('Failed to load lease details.');
        }
      } catch (err: any) {
        if (!isCancelled) {
          setError(err.message || 'Failed to load authoritative lease details.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadAuthoritativeLease();

    return () => {
      isCancelled = true;
    };
  }, [leaseId, outletId, refreshKey, canReadDocs, canReadUtilities]);

  if (!leaseId) return null;

  const space = lease ? spaceMap.get(lease.spaceId) : null;
  const vendor = lease ? vendorMap.get(lease.vendorId) : null;
  const statusInfo = lease ? getNfrLeaseStatusDisplay(lease.status, lease.isExpired) : null;
  const editable = lease ? canEditNfrLease(hasPermission, lease) : false;
  const terminable = lease ? canTerminateNfrLease(hasPermission, lease) : false;
  const generable = canGenerateNfrRentDue(hasPermission);

  return (
    <div className="fixed inset-0 z-40 overflow-hidden bg-slate-950/70 backdrop-blur-sm flex justify-end transition-opacity">
      <div className="w-full max-w-lg bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl overflow-hidden">
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-amber-500" />
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Lease Agreement Details
              </h2>
              <p className="text-xs text-slate-400">
                {lease?.agreementNumber || 'Loading...'}
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
              Loading authoritative lease data...
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
              {error}
            </div>
          ) : lease ? (
            <>
              {/* Status Header Badge */}
              <div className="p-4 bg-slate-800/60 border border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block mb-1">Agreement Status</span>
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold border ${statusInfo?.badgeClass}`}
                  >
                    {statusInfo?.label}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block mb-1">Monthly Rent</span>
                  <span className="text-base font-bold text-slate-100">
                    ₹{lease.monthlyRentStr}
                  </span>
                </div>
              </div>

              {/* Space & Vendor Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-slate-800/40 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
                    <Building2 className="w-3.5 h-3.5" />
                    <span>NFR Space</span>
                  </div>
                  <div className="font-semibold text-slate-200 text-sm">
                    {space ? space.name : 'Unknown Space'}
                  </div>
                  <div className="text-xs text-slate-400">
                    Code: {space?.spaceCode || lease.spaceId}
                  </div>
                  {space?.nfrType && (
                    <div className="text-[11px] text-amber-300/90 font-medium pt-1">
                      {formatNfrType(space.nfrType)}
                    </div>
                  )}
                  {space?.locationDescription && (
                    <div className="text-[11px] text-slate-500">
                      {space.locationDescription}
                    </div>
                  )}
                </div>

                <div className="p-3.5 bg-slate-800/40 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-sky-400 font-medium">
                    <Users className="w-3.5 h-3.5" />
                    <span>Vendor</span>
                  </div>
                  <div className="font-semibold text-slate-200 text-sm">
                    {vendor ? vendor.vendorName : 'Unknown Vendor'}
                  </div>
                  {vendor?.ownerContactName && (
                    <div className="text-xs text-slate-400">
                      Contact: {vendor.ownerContactName}
                    </div>
                  )}
                  {vendor?.ownerContactPhone && (
                    <div className="text-[11px] text-slate-300">
                      {vendor.ownerContactPhone}
                    </div>
                  )}
                  {vendor?.ownerContactEmail && (
                    <div className="text-[11px] text-slate-400 truncate">
                      {vendor.ownerContactEmail}
                    </div>
                  )}
                </div>
              </div>

              {/* Lease Dates & Financial Terms */}
              <div className="p-4 bg-slate-800/40 border border-slate-800 rounded-xl space-y-3">
                <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-amber-500" />
                  Contractual Terms
                </h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block">Start Date</span>
                    <span className="text-slate-200 font-medium">
                      {formatDisplayDate(lease.leaseStartDate)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">End Date</span>
                    <span className="text-slate-200 font-medium">
                      {formatDisplayDate(lease.leaseEndDate)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Security Deposit</span>
                    <span className="text-slate-200 font-medium">
                      ₹{lease.securityDepositStr}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Monthly Due Day</span>
                    <span className="text-slate-200 font-medium">
                      Day {lease.monthlyDueDay} of each month
                    </span>
                  </div>
                </div>
              </div>

              {/* Optional Attachments / Linkages */}
              <div className="p-4 bg-slate-800/40 border border-slate-800 rounded-xl space-y-3">
                <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-amber-500" />
                  Linked Resources
                </h3>

                {/* Agreement Document */}
                <div className="text-xs space-y-1 pt-1 border-t border-slate-800">
                  <span className="text-slate-500 block">Agreement Document:</span>
                  {lease.agreementDocumentId ? (
                    vaultDoc ? (
                      <div className="p-2.5 bg-slate-900 border border-slate-700/80 rounded-lg space-y-1">
                        <div className="flex items-center justify-between text-slate-200 font-medium">
                          <span className="truncate">{vaultDoc.name}</span>
                          <span className="text-[10px] text-slate-400 ml-2">
                            {formatFileSize(vaultDoc.sizeBytes)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>Stored in Document Vault</span>
                          <span>{formatDisplayDate(vaultDoc.createdAt)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-300 flex items-center gap-1.5">
                        <FileCheck className="w-3.5 h-3.5 text-sky-400" />
                        <span>Document ID: {lease.agreementDocumentId}</span>
                      </div>
                    )
                  ) : (
                    <span className="text-slate-500 italic">No agreement document attached</span>
                  )}
                </div>

                {/* Sub-meter Linkage */}
                <div className="text-xs space-y-1 pt-2 border-t border-slate-800">
                  <span className="text-slate-500 block">NFR Sub-meter:</span>
                  {lease.subMeterId ? (
                    subMeter ? (
                      <div className="p-2.5 bg-slate-900 border border-slate-700/80 rounded-lg space-y-1">
                        <div className="text-slate-200 font-medium">
                          {subMeter.meterCode} - {subMeter.name}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Beneficiary: {subMeter.beneficiaryName || 'NFR Vendor'} ({subMeter.status})
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-300 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <span>Sub-meter ID: {lease.subMeterId}</span>
                      </div>
                    )
                  ) : (
                    <span className="text-slate-500 italic">No sub-meter linked</span>
                  )}
                </div>
              </div>

              {/* Notes */}
              {lease.notes && (
                <div className="p-4 bg-slate-800/40 border border-slate-800 rounded-xl space-y-1 text-xs">
                  <span className="text-slate-500 block">Notes</span>
                  <p className="text-slate-300 whitespace-pre-wrap">{lease.notes}</p>
                </div>
              )}

              {/* Termination Info if Terminated */}
              {lease.status === 'TERMINATED' && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 text-rose-400 font-semibold">
                    <XCircle className="w-4 h-4" />
                    <span>Lease Terminated</span>
                  </div>
                  {lease.terminatedAt && (
                    <div className="text-slate-400">
                      Terminated on {formatDisplayDateTime(lease.terminatedAt)}
                    </div>
                  )}
                  {lease.terminationReason && (
                    <div className="text-slate-300">
                      <span className="text-slate-500">Reason: </span>
                      {lease.terminationReason}
                    </div>
                  )}
                </div>
              )}

              {/* Metadata */}
              <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-800">
                Created: {formatDisplayDateTime(lease.createdAt)}
              </div>
            </>
          ) : null}
        </div>

        {/* Drawer Footer Actions */}
        {lease && (
          <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition"
            >
              Close
            </button>

            <div className="flex items-center gap-2">
              {generable && (
                <button
                  type="button"
                  onClick={() => onGenerateDue(lease)}
                  className="px-3.5 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/40 text-xs font-medium rounded-lg transition inline-flex items-center gap-1.5"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Generate Due</span>
                </button>
              )}
              {editable && (
                <button
                  type="button"
                  onClick={() => onEditLease(lease)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 text-xs font-medium rounded-lg transition inline-flex items-center gap-1.5"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
              )}
              {terminable && (
                <button
                  type="button"
                  onClick={() => onTerminateLease(lease)}
                  className="px-3.5 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/40 text-xs font-medium rounded-lg transition inline-flex items-center gap-1.5"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Terminate</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
