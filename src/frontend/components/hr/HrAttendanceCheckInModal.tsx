import React, { useState } from 'react';
import { X, MapPin, Crosshair, AlertCircle, Clock, ShieldCheck } from 'lucide-react';
import { HrRosterAssignment, HrAttendanceRecord } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { formatGeolocationError, getHrErrorMessage } from './hrUi';

interface HrAttendanceCheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  outletId: string;
  mode: 'check-in' | 'check-out';
  attendanceRecord?: HrAttendanceRecord | null;
  scheduledRosters: HrRosterAssignment[];
  onSuccess: () => void;
  showFeedback: (type: 'success' | 'error', message: string) => void;
}

export const HrAttendanceCheckInModal: React.FC<HrAttendanceCheckInModalProps> = ({
  isOpen,
  onClose,
  outletId,
  mode,
  attendanceRecord,
  scheduledRosters,
  onSuccess,
  showFeedback,
}) => {
  const [selectedRosterId, setSelectedRosterId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isAcquiring, setIsAcquiring] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'check-in' && !selectedRosterId) {
      setError('Please select a scheduled roster assignment.');
      return;
    }

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    setIsAcquiring(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const accuracyMetres = position.coords.accuracy;

        try {
          let res: any;
          if (mode === 'check-in') {
            res = await apiFetch(`/api/v1/outlets/${outletId}/hr/attendance/check-in`, {
              method: 'POST',
              body: JSON.stringify({
                rosterAssignmentId: selectedRosterId,
                latitude,
                longitude,
                accuracyMetres,
                notes: notes.trim() || undefined,
              }),
            });
          } else if (attendanceRecord) {
            res = await apiFetch(`/api/v1/outlets/${outletId}/hr/attendance/${attendanceRecord.id}/check-out`, {
              method: 'POST',
              body: JSON.stringify({
                latitude,
                longitude,
                accuracyMetres,
                notes: notes.trim() || undefined,
              }),
            });
          }

          if (res && res.success) {
            showFeedback(
              'success',
              mode === 'check-in' ? 'Attendance checked in successfully.' : 'Attendance checked out successfully.'
            );
            onSuccess();
            onClose();
          } else {
            const errCode = res?.error?.code || res?.error;
            setError(getHrErrorMessage(errCode));
          }
        } catch (err: any) {
          setError(getHrErrorMessage(err));
        } finally {
          setIsAcquiring(false);
        }
      },
      (geoErr) => {
        setIsAcquiring(false);
        setError(formatGeolocationError(geoErr));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-500/15 text-orange-400">
              <Crosshair className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {mode === 'check-in' ? 'Staff Attendance Check-In' : 'Staff Attendance Check-Out'}
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                {mode === 'check-in' ? 'Capture GPS location and verify geofence' : 'Record check-out location & time'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'check-in' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Select Scheduled Roster Assignment *
              </label>
              {scheduledRosters.length === 0 ? (
                <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700 text-xs text-amber-400">
                  No SCHEDULED roster assignments available for check-in at this outlet.
                </div>
              ) : (
                <select
                  required
                  value={selectedRosterId}
                  onChange={(e) => setSelectedRosterId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-orange-500"
                >
                  <option value="">-- Select Staff Roster --</option>
                  {scheduledRosters.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.staffName || r.staffId} ({r.employeeCode || 'EMP'}) • {r.rosterDate} • {r.shiftTemplateName || r.shiftTemplateCode || 'Shift'}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {mode === 'check-out' && attendanceRecord && (
            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-xs space-y-1 font-mono">
              <div><strong className="text-white">Staff:</strong> {attendanceRecord.staffName || attendanceRecord.staffId}</div>
              <div><strong className="text-white">Date:</strong> {attendanceRecord.attendanceDate}</div>
              <div><strong className="text-white">Check-in Time:</strong> {new Date(attendanceRecord.checkInAt).toLocaleTimeString()}</div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any remarks or observations..."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-orange-500 resize-none"
            />
          </div>

          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-start gap-2.5">
            <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Clicking below will prompt your browser to acquire your precise GPS location for compliance verification.
            </span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isAcquiring}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAcquiring || (mode === 'check-in' && (!selectedRosterId || scheduledRosters.length === 0))}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold shadow-lg shadow-orange-500/20 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {isAcquiring ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Acquiring GPS location...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>{mode === 'check-in' ? 'Capture Location & Check In' : 'Capture Location & Check Out'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
