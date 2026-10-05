import React, { useState, useEffect } from 'react';
import { HrStaff, Document } from '../../../shared/types';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../services/api';
import { PERMISSIONS } from '../../../shared/constants';
import {
  formatDisplayDate,
  formatDisplayDateTime,
  formatFileSize,
  formatHrEmploymentStatus,
  getHrErrorMessage,
  getInitials,
  resolveHrDocument,
} from './hrUi';
import {
  X,
  Edit,
  User,
  Phone,
  Calendar,
  Shield,
  FileText,
  Image as ImageIcon,
  Clock,
  Loader2,
  AlertCircle,
  Briefcase,
  StickyNote,
} from 'lucide-react';

export interface HrStaffDetailPanelProps {
  staffId: string;
  outletId: string;
  refreshKey: number;
  onClose: () => void;
  onEdit?: (staff: HrStaff) => void;
  canEditStaff: boolean;
}

export const HrStaffDetailPanel: React.FC<HrStaffDetailPanelProps> = ({
  staffId,
  outletId,
  refreshKey,
  onClose,
  onEdit,
  canEditStaff,
}) => {
  const { hasPermission } = useAuth();
  const canReadDocs = hasPermission(PERMISSIONS.DOCUMENTS_READ);

  const [staff, setStaff] = useState<HrStaff | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    const fetchDetail = async () => {
      try {
        const staffPromise = apiFetch<HrStaff>(`/api/v1/hr/staff/${staffId}`);
        const docsPromise = canReadDocs
          ? apiFetch<Document[]>('/api/v1/documents')
          : Promise.resolve({ success: false, data: [] });

        const [staffRes, docsRes] = await Promise.allSettled([staffPromise, docsPromise]);

        if (isCancelled) return;

        if (staffRes.status === 'fulfilled' && staffRes.value.success && staffRes.value.data) {
          // Stale outlet verification: ensure staff belongs to current outlet
          if (staffRes.value.data.outletId !== outletId) {
            setError('Staff member does not belong to the selected outlet.');
            setStaff(null);
          } else {
            setStaff(staffRes.value.data);
          }
        } else {
          const err =
            staffRes.status === 'fulfilled' ? staffRes.value.error : (staffRes as any).reason;
          setError(getHrErrorMessage(err));
          setStaff(null);
        }

        if (docsRes.status === 'fulfilled' && docsRes.value.success && Array.isArray(docsRes.value.data)) {
          setDocuments(docsRes.value.data.filter((d: Document) => d.outletId === outletId));
        } else {
          setDocuments([]);
        }
      } catch (err: any) {
        if (!isCancelled) {
          setError(getHrErrorMessage(err));
          setStaff(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchDetail();

    return () => {
      isCancelled = true;
    };
  }, [staffId, outletId, refreshKey, canReadDocs]);

  if (isLoading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 animate-pulse">
            <div className="w-12 h-12 rounded-2xl bg-slate-800"></div>
            <div className="space-y-1.5">
              <div className="h-4 bg-slate-800 rounded w-32"></div>
              <div className="h-3 bg-slate-800 rounded w-20"></div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="h-40 bg-slate-800/40 rounded-xl animate-pulse"></div>
      </div>
    );
  }

  if (error || !staff) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Staff Member Details</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error || 'Unable to load staff details.'}</span>
        </div>
      </div>
    );
  }

  const statusDisplay = formatHrEmploymentStatus(staff.employmentStatus);
  const aadhaarDoc = resolveHrDocument(documents, staff.aadhaarDocumentId, outletId);
  const photoDoc = resolveHrDocument(documents, staff.photoDocumentId, outletId);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
      {/* Header Banner */}
      <div className="p-5 border-b border-slate-800 flex items-start justify-between bg-slate-900/60">
        <div className="flex items-center gap-3.5">
          {/* Avatar / Initials */}
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-extrabold text-lg shadow-lg shadow-orange-500/20 shrink-0">
            {getInitials(staff.fullName)}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-white">{staff.fullName}</h3>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusDisplay.badgeClass}`}
              >
                {statusDisplay.label}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 font-mono">
              <span>{staff.employeeCode}</span>
              <span>•</span>
              <span className="text-slate-300 font-sans">
                {staff.designationName || 'Staff Member'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {canEditStaff && onEdit && (
            <button
              onClick={() => onEdit(staff)}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1 text-xs font-semibold px-2.5"
            >
              <Edit className="w-3.5 h-3.5 text-orange-400" />
              <span>Edit</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4 text-xs">
        {/* Identity & Employment Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Masked Aadhaar — PRIVACY PRESERVED */}
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Identity (Aadhaar)</span>
            </div>
            <div className="font-mono text-xs font-bold text-slate-200 tracking-wider">
              {staff.maskedAadhaar || `XXXX XXXX ${staff.aadhaarLast4}`}
            </div>
            <div className="text-[10px] text-slate-500">
              Masked privacy-safe view
            </div>
          </div>

          {/* Designation */}
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold">
              <Briefcase className="w-3.5 h-3.5 text-orange-400" />
              <span>Designation</span>
            </div>
            <div className="text-xs font-bold text-slate-200">
              {staff.designationName || '—'}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              Code: {staff.designationCode || '—'}
            </div>
          </div>

          {/* Joining Date */}
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold">
              <Calendar className="w-3.5 h-3.5 text-sky-400" />
              <span>Joining Date</span>
            </div>
            <div className="text-xs font-bold text-slate-200">
              {formatDisplayDate(staff.joiningDate)}
            </div>
          </div>

          {/* Exit Date (if EXITED) */}
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold">
              <Clock className="w-3.5 h-3.5 text-rose-400" />
              <span>Exit Date</span>
            </div>
            <div className="text-xs font-bold text-slate-200">
              {staff.exitDate ? formatDisplayDate(staff.exitDate) : 'N/A (Active in service)'}
            </div>
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 space-y-1.5">
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold">
            <Phone className="w-3.5 h-3.5 text-emerald-400" />
            <span>Emergency Contact</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-slate-200">
              {staff.emergencyContactName}
            </span>
            <span className="font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700">
              {staff.emergencyContactPhone}
            </span>
          </div>
        </div>

        {/* Notes */}
        {staff.notes && (
          <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 space-y-1.5">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold">
              <StickyNote className="w-3.5 h-3.5 text-amber-400" />
              <span>Operational Notes</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
              {staff.notes}
            </p>
          </div>
        )}

        {/* Document Vault Attachments */}
        <div className="pt-2 border-t border-slate-800 space-y-2.5">
          <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Document Vault Attachments
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Identity Proof Document Card */}
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 flex items-start gap-2.5">
              <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400 shrink-0 mt-0.5">
                <FileText className="w-4 h-4" />
              </div>
              <div className="truncate">
                <div className="font-semibold text-slate-200 text-xs truncate">
                  Identity Proof Attachment
                </div>
                {staff.aadhaarDocumentId ? (
                  canReadDocs && aadhaarDoc ? (
                    <div className="text-[10px] text-slate-400 space-y-0.5 mt-0.5">
                      <div className="font-medium text-slate-300 truncate">
                        {aadhaarDoc.name}
                      </div>
                      <div>
                        {formatFileSize(aadhaarDoc.sizeBytes)} • {aadhaarDoc.mimeType || 'Document'}
                      </div>
                      <div className="text-emerald-400 font-semibold">
                        Stored in Document Vault
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                      Stored in Document Vault
                    </div>
                  )
                ) : (
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    No document attached
                  </div>
                )}
              </div>
            </div>

            {/* Photo Attachment Card */}
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 flex items-start gap-2.5">
              <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 shrink-0 mt-0.5">
                <ImageIcon className="w-4 h-4" />
              </div>
              <div className="truncate">
                <div className="font-semibold text-slate-200 text-xs truncate">
                  Staff Photo Attachment
                </div>
                {staff.photoDocumentId ? (
                  canReadDocs && photoDoc ? (
                    <div className="text-[10px] text-slate-400 space-y-0.5 mt-0.5">
                      <div className="font-medium text-slate-300 truncate">
                        {photoDoc.name}
                      </div>
                      <div>
                        {formatFileSize(photoDoc.sizeBytes)} • {photoDoc.mimeType || 'Image'}
                      </div>
                      <div className="text-sky-400 font-semibold">
                        Photo attachment stored in Document Vault
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-sky-400 font-semibold mt-0.5">
                      Photo attachment stored in Document Vault
                    </div>
                  )
                ) : (
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    No photo attached
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Audit Meta */}
        <div className="pt-2 text-[10px] text-slate-500 flex items-center justify-between">
          <span>Enrolled: {formatDisplayDateTime(staff.createdAt)}</span>
          <span>Last Updated: {formatDisplayDateTime(staff.updatedAt)}</span>
        </div>
      </div>
    </div>
  );
};
