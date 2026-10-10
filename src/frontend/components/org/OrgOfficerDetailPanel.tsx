import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Edit2,
  Mail,
  Phone,
  Building,
  UserCheck,
  Calendar,
  FileText,
  Clock,
  AlertCircle,
  Plus,
} from 'lucide-react';
import {
  Officer,
  Department,
  OfficerPosting,
  State,
  Division,
  SalesArea,
  RetailOutlet,
} from '../../../shared/types';
import {
  getOfficerStatusBadgeClass,
  getOfficerStatusLabel,
  formatOrgDate,
  HierarchyContext,
} from './orgUi';
import { OrgOfficerPostingsPanel } from './OrgOfficerPostingsPanel';
import { OrgOfficerPostingModal } from './OrgOfficerPostingModal';
import { apiFetch } from '../../services/api';

interface OrgOfficerDetailPanelProps {
  officer: Officer;
  department?: Department | null;
  canWriteGlobal: boolean;
  canWritePostings: boolean;
  hierarchy: HierarchyContext;
  onBack: () => void;
  onEditOfficer: (officer: Officer) => void;
}

export const OrgOfficerDetailPanel: React.FC<OrgOfficerDetailPanelProps> = ({
  officer,
  department,
  canWriteGlobal,
  canWritePostings,
  hierarchy,
  onBack,
  onEditOfficer,
}) => {
  const [postings, setPostings] = useState<OfficerPosting[]>([]);
  const [isLoadingPostings, setIsLoadingPostings] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Stale request protection & mounted ref
  const postingsReqIdRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Modal states for posting
  const [postingModalOpen, setPostingModalOpen] = useState(false);
  const [postingToEdit, setPostingToEdit] = useState<OfficerPosting | null>(null);

  const fetchPostings = async () => {
    const currentReqId = ++postingsReqIdRef.current;
    setIsLoadingPostings(true);
    setErrorMsg(null);

    try {
      const res = await apiFetch<OfficerPosting[]>(`/api/v1/org/officers/${officer.id}/postings`);
      if (!isMountedRef.current || currentReqId !== postingsReqIdRef.current) return;

      if (res.success && res.data) {
        setPostings(res.data);
      } else {
        setErrorMsg(res.error?.message || 'Failed to load officer postings');
      }
    } catch (err: any) {
      if (!isMountedRef.current || currentReqId !== postingsReqIdRef.current) return;
      setErrorMsg(err.message || 'Error fetching postings');
    } finally {
      if (isMountedRef.current && currentReqId === postingsReqIdRef.current) {
        setIsLoadingPostings(false);
      }
    }
  };

  useEffect(() => {
    fetchPostings();
  }, [officer.id]);

  const handleOpenAddPosting = () => {
    setPostingToEdit(null);
    setPostingModalOpen(true);
  };

  const handleOpenEditPosting = (p: OfficerPosting) => {
    setPostingToEdit(p);
    setPostingModalOpen(true);
  };

  const handleSavePosting = async (payload: any) => {
    try {
      if (postingToEdit) {
        const res = await apiFetch(`/api/v1/org/officer-postings/${postingToEdit.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        if (res.success) {
          await fetchPostings();
          return { success: true };
        }
        return {
          success: false,
          errorCode: res.error?.code,
          error: res.error?.message || 'Failed to update posting',
        };
      } else {
        const res = await apiFetch(`/api/v1/org/officers/${officer.id}/postings`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (res.success) {
          await fetchPostings();
          return { success: true };
        }
        return {
          success: false,
          errorCode: res.error?.code,
          error: res.error?.message || 'Failed to create posting',
        };
      }
    } catch (err: any) {
      return { success: false, errorCode: 'NETWORK_ERROR', error: err.message || 'Network error occurred' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Top navigation */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Officer Directory</span>
        </button>

        {canWriteGlobal && (
          <button
            onClick={() => onEditOfficer(officer)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium border border-slate-700 transition"
          >
            <Edit2 className="w-3.5 h-3.5 text-orange-400" />
            <span>Edit Officer Profile</span>
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Officer Profile Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-800 to-slate-950 border border-slate-700 flex items-center justify-center text-orange-400 font-bold text-sm tracking-wider shadow-inner">
              {officer.employeeCode.slice(-3) || 'IOC'}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base font-bold text-white tracking-tight">
                  {officer.fullName}
                </h3>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${getOfficerStatusBadgeClass(
                    officer.status
                  )}`}
                >
                  {getOfficerStatusLabel(officer.status)}
                </span>
              </div>
              <p className="text-xs text-orange-400/90 font-medium mt-0.5">
                {officer.designationTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            <div className="text-right sm:block">
              <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider block">
                Employee Code
              </span>
              <span className="font-mono text-xs font-bold text-slate-200">
                {officer.employeeCode}
              </span>
            </div>
          </div>
        </div>

        {/* Detailed Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-5 text-xs">
          <div className="flex items-start gap-2.5">
            <Building className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
            <div>
              <span className="text-[11px] text-slate-500 block">Department</span>
              <span className="text-white font-medium">
                {department ? `${department.name} (${department.code})` : officer.departmentId}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Mail className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
            <div>
              <span className="text-[11px] text-slate-500 block">Official Email</span>
              <span className="text-slate-300 font-mono">
                {officer.email || <span className="text-slate-600 font-sans">Not registered</span>}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Phone className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
            <div>
              <span className="text-[11px] text-slate-500 block">Phone / Mobile</span>
              <span className="text-slate-300 font-mono">
                {officer.phone || <span className="text-slate-600 font-sans">Not registered</span>}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
            <div>
              <span className="text-[11px] text-slate-500 block">Record Registered</span>
              <span className="text-slate-300 font-mono">
                {formatOrgDate(officer.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {officer.notes && (
          <div className="mt-4 pt-3 border-t border-slate-800/60 text-xs">
            <span className="text-[11px] text-slate-500 block mb-0.5">Administrative Notes</span>
            <p className="text-slate-300 leading-relaxed bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/40">
              {officer.notes}
            </p>
          </div>
        )}
      </div>

      {/* Postings Workspace Panel */}
      <OrgOfficerPostingsPanel
        postings={postings}
        isLoading={isLoadingPostings}
        canWrite={canWritePostings}
        hierarchy={hierarchy}
        onAddPosting={handleOpenAddPosting}
        onEditPosting={handleOpenEditPosting}
      />

      {/* Modal for creating / editing posting */}
      <OrgOfficerPostingModal
        isOpen={postingModalOpen}
        onClose={() => setPostingModalOpen(false)}
        officerId={officer.id}
        officerName={officer.fullName}
        postingToEdit={postingToEdit}
        states={hierarchy.states}
        divisions={hierarchy.divisions}
        salesAreas={hierarchy.salesAreas}
        outlets={hierarchy.outlets}
        onSave={handleSavePosting}
      />
    </div>
  );
};
