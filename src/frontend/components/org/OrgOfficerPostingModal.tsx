import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import {
  OfficerPosting,
  OfficerPostingScopeLevel,
  OrgStatus,
  State,
  Division,
  SalesArea,
  RetailOutlet,
} from '../../../shared/types';
import {
  getFilteredDivisions,
  getFilteredSalesAreas,
  getFilteredOutlets,
  validateEffectiveDates,
  mapOrgErrorMessage,
} from './orgUi';

interface OrgOfficerPostingModalProps {
  isOpen: boolean;
  onClose: () => void;
  officerId: string;
  officerName: string;
  postingToEdit?: OfficerPosting | null;
  states: State[];
  divisions: Division[];
  salesAreas: SalesArea[];
  outlets: RetailOutlet[];
  onSave: (payload: {
    scopeLevel?: OfficerPostingScopeLevel;
    stateId?: string | null;
    divisionId?: string | null;
    salesAreaId?: string | null;
    outletId?: string | null;
    effectiveFrom?: string;
    effectiveTo?: string | null;
    isPrimary?: boolean;
    status: OrgStatus;
    notes?: string | null;
  }) => Promise<{ success: boolean; error?: string }>;
}

export const OrgOfficerPostingModal: React.FC<OrgOfficerPostingModalProps> = ({
  isOpen,
  onClose,
  officerId,
  officerName,
  postingToEdit,
  states,
  divisions,
  salesAreas,
  outlets,
  onSave,
}) => {
  const isEditMode = Boolean(postingToEdit);

  // Form State
  const [scopeLevel, setScopeLevel] = useState<OfficerPostingScopeLevel>(postingToEdit?.scopeLevel || 'GLOBAL');
  const [selectedStateId, setSelectedStateId] = useState(postingToEdit?.stateId || '');
  const [selectedDivisionId, setSelectedDivisionId] = useState(postingToEdit?.divisionId || '');
  const [selectedSalesAreaId, setSelectedSalesAreaId] = useState(postingToEdit?.salesAreaId || '');
  const [selectedOutletId, setSelectedOutletId] = useState(postingToEdit?.outletId || '');

  const [effectiveFrom, setEffectiveFrom] = useState(postingToEdit?.effectiveFrom || new Date().toISOString().split('T')[0]);
  const [effectiveTo, setEffectiveTo] = useState(postingToEdit?.effectiveTo || '');
  const [isPrimary, setIsPrimary] = useState(postingToEdit?.isPrimary ?? false);
  const [status, setStatus] = useState<OrgStatus>(postingToEdit?.status || 'ACTIVE');
  const [notes, setNotes] = useState(postingToEdit?.notes || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Cascading lists
  const availableDivisions = getFilteredDivisions(divisions, selectedStateId);
  const availableSalesAreas = getFilteredSalesAreas(salesAreas, selectedDivisionId);
  const availableOutlets = getFilteredOutlets(outlets, selectedSalesAreaId, selectedDivisionId);

  const handleStateChange = (stId: string) => {
    setSelectedStateId(stId);
    setSelectedDivisionId('');
    setSelectedSalesAreaId('');
    setSelectedOutletId('');
  };

  const handleDivisionChange = (divId: string) => {
    setSelectedDivisionId(divId);
    setSelectedSalesAreaId('');
    setSelectedOutletId('');
  };

  const handleSalesAreaChange = (saId: string) => {
    setSelectedSalesAreaId(saId);
    setSelectedOutletId('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Validate dates
    const dateErr = validateEffectiveDates(effectiveFrom, effectiveTo || null);
    if (dateErr) {
      setErrorMessage(dateErr);
      return;
    }

    // Validate location presence for scope
    if (!isEditMode) {
      if (scopeLevel === 'STATE' && !selectedStateId) {
        setErrorMessage('Please select a State Office.');
        return;
      }
      if (scopeLevel === 'DIVISION' && (!selectedStateId || !selectedDivisionId)) {
        setErrorMessage('Please select a State and Divisional Office.');
        return;
      }
      if (scopeLevel === 'SALES_AREA' && (!selectedStateId || !selectedDivisionId || !selectedSalesAreaId)) {
        setErrorMessage('Please select a State, Division, and Sales Area.');
        return;
      }
      if (scopeLevel === 'OUTLET' && (!selectedOutletId)) {
        setErrorMessage('Please select a Retail Outlet.');
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const payload: any = {
      effectiveTo: effectiveTo || null,
      isPrimary,
      status,
      notes: notes.trim() || null,
    };

    if (!isEditMode) {
      payload.scopeLevel = scopeLevel;
      payload.effectiveFrom = effectiveFrom;
      payload.stateId = scopeLevel === 'GLOBAL' ? null : (selectedStateId || null);
      payload.divisionId = ['GLOBAL', 'STATE'].includes(scopeLevel) ? null : (selectedDivisionId || null);
      payload.salesAreaId = ['GLOBAL', 'STATE', 'DIVISION'].includes(scopeLevel) ? null : (selectedSalesAreaId || null);
      payload.outletId = scopeLevel === 'OUTLET' ? (selectedOutletId || null) : null;
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
              {isEditMode ? 'Edit Officer Posting' : 'Add Officer Posting'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Officer: <span className="text-orange-400 font-medium">{officerName}</span>
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

          {/* Scope Level (Immutable on Edit) */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Posting Scope Level <span className="text-orange-400">*</span>
            </label>
            <select
              value={scopeLevel}
              onChange={(e) => {
                setScopeLevel(e.target.value as OfficerPostingScopeLevel);
                setSelectedStateId('');
                setSelectedDivisionId('');
                setSelectedSalesAreaId('');
                setSelectedOutletId('');
              }}
              disabled={isEditMode || isSubmitting}
              className={`w-full px-3 py-2 bg-slate-950 border rounded-lg text-sm transition ${
                isEditMode
                  ? 'border-slate-800 text-slate-500 cursor-not-allowed'
                  : 'border-slate-700 text-white focus:outline-none focus:border-orange-500'
              }`}
            >
              <option value="GLOBAL">GLOBAL (Head Office / All Operations)</option>
              <option value="STATE">STATE (State Office)</option>
              <option value="DIVISION">DIVISION (Divisional Office)</option>
              <option value="SALES_AREA">SALES_AREA (Sales Area)</option>
              <option value="OUTLET">OUTLET (Retail Outlet)</option>
            </select>
            {isEditMode && (
              <p className="text-[11px] text-slate-500 mt-1">Scope level and location hierarchy cannot be altered after creation.</p>
            )}
          </div>

          {/* Cascading Location Hierarchy (Only shown if NOT GLOBAL and on create) */}
          {!isEditMode && scopeLevel !== 'GLOBAL' && (
            <div className="space-y-3 p-3.5 rounded-lg bg-slate-950/60 border border-slate-800">
              {/* State */}
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  State Office <span className="text-orange-400">*</span>
                </label>
                <select
                  value={selectedStateId}
                  onChange={(e) => handleStateChange(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500 transition"
                >
                  <option value="">-- Select State Office --</option>
                  {states.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>

              {/* Division */}
              {['DIVISION', 'SALES_AREA', 'OUTLET'].includes(scopeLevel) && (
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Divisional Office <span className="text-orange-400">*</span>
                  </label>
                  <select
                    value={selectedDivisionId}
                    onChange={(e) => handleDivisionChange(e.target.value)}
                    disabled={isSubmitting || !selectedStateId}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500 transition disabled:opacity-50"
                  >
                    <option value="">-- Select Divisional Office --</option>
                    {availableDivisions.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Sales Area */}
              {['SALES_AREA', 'OUTLET'].includes(scopeLevel) && (
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Sales Area <span className="text-orange-400">*</span>
                  </label>
                  <select
                    value={selectedSalesAreaId}
                    onChange={(e) => handleSalesAreaChange(e.target.value)}
                    disabled={isSubmitting || !selectedDivisionId}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500 transition disabled:opacity-50"
                  >
                    <option value="">-- Select Sales Area --</option>
                    {availableSalesAreas.map(sa => (
                      <option key={sa.id} value={sa.id}>{sa.name} ({sa.code})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Outlet */}
              {scopeLevel === 'OUTLET' && (
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Retail Outlet <span className="text-orange-400">*</span>
                  </label>
                  <select
                    value={selectedOutletId}
                    onChange={(e) => setSelectedOutletId(e.target.value)}
                    disabled={isSubmitting || (!selectedSalesAreaId && !selectedDivisionId)}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500 transition disabled:opacity-50"
                  >
                    <option value="">-- Select Retail Outlet --</option>
                    {availableOutlets.map(ro => (
                      <option key={ro.id} value={ro.id}>{ro.name} ({ro.roCode})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Effective From <span className="text-orange-400">*</span>
              </label>
              <input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                disabled={isEditMode || isSubmitting}
                className={`w-full px-3 py-2 bg-slate-950 border rounded-lg text-sm transition ${
                  isEditMode
                    ? 'border-slate-800 text-slate-500 cursor-not-allowed'
                    : 'border-slate-700 text-white focus:outline-none focus:border-orange-500'
                }`}
              />
              {isEditMode && (
                <p className="text-[11px] text-slate-500 mt-1">Start date is immutable.</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Effective To <span className="text-slate-500 font-normal">(Optional)</span>
              </label>
              <input
                type="date"
                value={effectiveTo}
                onChange={(e) => setEffectiveTo(e.target.value)}
                disabled={isSubmitting}
                min={effectiveFrom}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-orange-500 transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
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

            <div className="pt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                  disabled={isSubmitting}
                  className="rounded border-slate-700 bg-slate-950 text-orange-600 focus:ring-orange-500 w-4 h-4"
                />
                <span className="text-xs font-medium text-slate-300">
                  Primary Posting
                </span>
              </label>
              <p className="text-[11px] text-slate-500 mt-0.5">Designates officer's principal operational role</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Notes <span className="text-slate-500 font-normal">(Optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
              rows={2}
              placeholder="Internal remarks or posting transfer order reference..."
              maxLength={300}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition"
            />
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
              <span>{isEditMode ? 'Update Posting' : 'Assign Posting'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
