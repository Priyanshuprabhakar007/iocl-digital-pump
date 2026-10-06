import React, { useState, useEffect, useCallback } from 'react';
import {
  MapPin,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Edit3,
  CheckCircle2,
  XCircle,
  Save,
  X,
} from 'lucide-react';
import { HrGeofencePolicy, RetailOutlet } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import { getHrErrorMessage } from './hrUi';

interface HrGeofencePanelProps {
  outletId: string;
  canWriteGeofence: boolean;
  selectedOutlet?: RetailOutlet | null;
  showFeedback: (type: 'success' | 'error', message: string) => void;
  geofenceRefreshKey?: number;
}

export const HrGeofencePanel: React.FC<HrGeofencePanelProps> = ({
  outletId,
  canWriteGeofence,
  selectedOutlet,
  showFeedback,
  geofenceRefreshKey,
}) => {
  const [policy, setPolicy] = useState<HrGeofencePolicy | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Form state
  const [radiusMetres, setRadiusMetres] = useState<number>(100);
  const [maxAccuracyMetres, setMaxAccuracyMetres] = useState<number>(50);
  const [attendanceGeofenceRequired, setAttendanceGeofenceRequired] = useState<boolean>(true);
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Outlet switch reset
  useEffect(() => {
    setIsEditing(false);
    setError(null);
    setPolicy(null);
    setRadiusMetres(100);
    setMaxAccuracyMetres(50);
    setAttendanceGeofenceRequired(true);
    setStatus('ACTIVE');
  }, [outletId]);

  const fetchPolicy = useCallback(async (isRefresh = false) => {
    if (!outletId) return;
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const res = await apiFetch<HrGeofencePolicy>(`/api/v1/outlets/${outletId}/hr/geofence-policy`);
      if (res.success && res.data) {
        setPolicy(res.data);
        setRadiusMetres(res.data.radiusMetres);
        setMaxAccuracyMetres(res.data.maxAccuracyMetres);
        setAttendanceGeofenceRequired(res.data.attendanceGeofenceRequired === 1);
        setStatus(res.data.status);
      } else {
        setPolicy(null);
        const code = res.error?.code || res.error;
        if (code === 'HR_GEOFENCE_POLICY_NOT_FOUND') {
          // Policy not configured - normal
        } else {
          showFeedback('error', getHrErrorMessage(res.error));
        }
      }
    } catch (err: any) {
      setPolicy(null);
      showFeedback('error', getHrErrorMessage(err));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [outletId, showFeedback]);

  useEffect(() => {
    fetchPolicy();
  }, [fetchPolicy]);

  // Refresh key effect
  useEffect(() => {
    if (geofenceRefreshKey && geofenceRefreshKey > 0 && outletId) {
      fetchPolicy(true);
    }
  }, [geofenceRefreshKey, outletId, fetchPolicy]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const radius = Number(radiusMetres);
    const accuracy = Number(maxAccuracyMetres);

    if (isNaN(radius) || radius < 10 || radius > 10000) {
      setError('Radius must be between 10 and 10,000 metres.');
      return;
    }
    if (isNaN(accuracy) || accuracy < 1 || accuracy > 1000) {
      setError('Max accuracy must be between 1 and 1,000 metres.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetch<HrGeofencePolicy>(`/api/v1/outlets/${outletId}/hr/geofence-policy`, {
        method: 'PUT',
        body: JSON.stringify({
          radiusMetres: radius,
          maxAccuracyMetres: accuracy,
          attendanceGeofenceRequired,
          status,
        }),
      });

      if (res.success && res.data) {
        setPolicy(res.data);
        setIsEditing(false);
        showFeedback('success', 'Geofence policy updated successfully.');
      } else {
        setError(getHrErrorMessage(res.error));
      }
    } catch (err: any) {
      setError(getHrErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasCoordinates = selectedOutlet?.latitude != null && selectedOutlet?.longitude != null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-orange-500" />
            <span>Outlet Geofence Policy</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure attendance radius boundary and GPS accuracy enforcement rules for this outlet.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchPolicy(true)}
            disabled={isRefreshing}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 flex items-center gap-2 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-orange-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {canWriteGeofence && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-orange-500/20 flex items-center gap-2 transition-all"
            >
              <Edit3 className="w-4 h-4" />
              <span>{policy ? 'Edit Geofence Policy' : 'Configure Geofence Policy'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Outlet Coordinate Warning */}
      {!hasCoordinates && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
          <div className="space-y-1">
            <div className="font-bold">Outlet GPS Coordinates Not Configured</div>
            <p className="text-amber-300/80">
              Outlet location coordinates (latitude & longitude) are not configured for this retail outlet. Attendance geofence enforcement cannot operate until the outlet location is configured in master data.
            </p>
          </div>
        </div>
      )}

      {/* Policy Card / Form */}
      {isEditing ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white">
              {policy ? 'Edit Geofence Policy' : 'Create Outlet Geofence Policy'}
            </h3>
            <button
              onClick={() => setIsEditing(false)}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
              {error}
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4 max-w-xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Geofence Radius (metres) [10 - 10000] *
                </label>
                <input
                  type="number"
                  required
                  min={10}
                  max={10000}
                  value={radiusMetres}
                  onChange={(e) => setRadiusMetres(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-orange-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Max GPS Accuracy (metres) [1 - 1000] *
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={1000}
                  value={maxAccuracyMetres}
                  onChange={(e) => setMaxAccuracyMetres(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-orange-500 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Policy Status *
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-orange-500"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>

              <div className="flex items-center pt-6">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={attendanceGeofenceRequired}
                    onChange={(e) => setAttendanceGeofenceRequired(e.target.checked)}
                    className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-orange-500 focus:ring-orange-500"
                  />
                  <span className="text-xs font-semibold text-slate-300">
                    Strict Geofence Enforcement Required
                  </span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-orange-500/20 flex items-center gap-2 transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSubmitting ? 'Saving...' : 'Save Policy'}</span>
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1">
              <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Outlet Coordinates</div>
              <div className="text-sm font-mono font-bold text-white">
                {hasCoordinates ? `${selectedOutlet?.latitude}, ${selectedOutlet?.longitude}` : 'Not Configured'}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1">
              <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Geofence Radius</div>
              <div className="text-sm font-mono font-bold text-orange-400">
                {policy ? `${policy.radiusMetres} metres` : '—'}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1">
              <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Max GPS Accuracy</div>
              <div className="text-sm font-mono font-bold text-white">
                {policy ? `${policy.maxAccuracyMetres} metres` : '—'}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1">
              <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Policy Status</div>
              <div>
                {policy ? (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-medium border ${policy.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                    {policy.status}
                  </span>
                ) : (
                  <span className="text-slate-500 text-xs">Not Configured</span>
                )}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs">
            <div className="text-slate-400">
              <strong className="text-white">Strict Enforcement:</strong> {policy?.attendanceGeofenceRequired === 1 ? 'Enabled (Outside check-ins blocked)' : 'Disabled (Advisory only)'}
            </div>
            {policy && (
              <div className="text-slate-500 font-mono">
                Last Updated: {new Date(policy.updatedAt).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
