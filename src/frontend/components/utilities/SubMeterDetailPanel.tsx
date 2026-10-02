import React, { useState, useEffect } from 'react';
import { UtilitySubMeter, UtilitySubMeterReading } from '../../../shared/types';
import { apiFetch } from '../../services/api';
import {
  formatBeneficiaryType,
  formatSubMeterStatus,
  formatDisplayDate,
  formatDisplayDateTime,
  canRecordReading,
  canEditSubMeter,
  getUtilityErrorMessage,
} from './utilityUi';
import { SubMeterReadingsTable } from './SubMeterReadingsTable';
import {
  X,
  Gauge,
  Plus,
  Edit2,
  Calendar,
  Layers,
  Building,
  Loader2,
  AlertCircle,
  Clock,
} from 'lucide-react';

interface SubMeterDetailPanelProps {
  subMeterId: string;
  canWriteSubMeters: boolean;
  canWriteReadings: boolean;
  onClose: () => void;
  onOpenEdit: (subMeter: UtilitySubMeter) => void;
  onOpenAddReading: (subMeter: UtilitySubMeter, latestReading: UtilitySubMeterReading | null) => void;
  onRefresh: () => void;
}

export const SubMeterDetailPanel: React.FC<SubMeterDetailPanelProps> = ({
  subMeterId,
  canWriteSubMeters,
  canWriteReadings,
  onClose,
  onOpenEdit,
  onOpenAddReading,
  onRefresh,
}) => {
  const [subMeter, setSubMeter] = useState<UtilitySubMeter | null>(null);
  const [readings, setReadings] = useState<UtilitySubMeterReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchSubMeterData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [smRes, readRes] = await Promise.all([
        apiFetch<UtilitySubMeter>(`/api/v1/utilities/sub-meters/${subMeterId}`),
        apiFetch<UtilitySubMeterReading[]>(`/api/v1/utilities/sub-meters/${subMeterId}/readings`),
      ]);

      if (smRes.success && smRes.data) {
        setSubMeter(smRes.data);
      } else {
        setErrorMsg(getUtilityErrorMessage(smRes.error));
      }

      if (readRes.success && readRes.data) {
        setReadings(readRes.data);
      }
    } catch (err: any) {
      setErrorMsg(getUtilityErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (subMeterId) {
      fetchSubMeterData();
    }
  }, [subMeterId]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <div className="p-8 bg-slate-900 border border-slate-800 rounded-2xl flex items-center gap-3 text-slate-300 text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
          Loading sub-meter ledger...
        </div>
      </div>
    );
  }

  if (!subMeter) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-3 max-w-sm">
          <div className="text-rose-400 text-sm font-semibold">{errorMsg || 'Sub-meter not found'}</div>
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

  const statusInfo = formatSubMeterStatus(subMeter.status);
  const allowRecord = canRecordReading(subMeter, canWriteReadings);
  const allowEdit = canEditSubMeter(canWriteSubMeters);

  // Latest reading is the last item in the chronological list
  const latestReading = readings.length > 0 ? readings[readings.length - 1] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-3xl h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  {subMeter.name}
                </h2>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusInfo.badgeClass}`}
                >
                  {statusInfo.label}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Code: {subMeter.meterCode} • Serial: {subMeter.serialNumber || 'N/A'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {allowEdit && (
              <button
                type="button"
                onClick={() => onOpenEdit(subMeter)}
                className="p-2 text-slate-400 hover:text-orange-400 hover:bg-slate-800 rounded-xl transition-colors"
                title="Edit Sub-Meter"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Master Details Highlight Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Beneficiary</span>
              <div className="font-bold text-white truncate">{subMeter.beneficiaryName}</div>
              <div className="text-[11px] text-slate-400">{formatBeneficiaryType(subMeter.beneficiaryType)}</div>
            </div>

            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Active Tariff Rate</span>
              <div className="font-mono font-bold text-orange-400 text-sm">
                ₹{subMeter.ratePerKwhStr} <span className="text-xs text-slate-500 font-normal">/ kWh</span>
              </div>
              <div className="text-[10px] text-slate-500">Historical charges snapshotted</div>
            </div>

            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Latest Reading</span>
              <div className="font-mono font-bold text-white">
                {latestReading ? `${latestReading.readingStr} kWh` : 'No readings'}
              </div>
              <div className="text-[10px] text-slate-500 font-mono truncate">
                {latestReading ? formatDisplayDate(latestReading.readingAt) : 'Pending baseline'}
              </div>
            </div>
          </div>

          {/* Reading Ledger Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Sub-Meter Reading History Ledger
                </h3>
                <span className="text-xs text-slate-500 font-mono">
                  ({readings.length} {readings.length === 1 ? 'record' : 'records'})
                </span>
              </div>

              {allowRecord && (
                <button
                  type="button"
                  onClick={() => onOpenAddReading(subMeter, latestReading)}
                  className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors shadow-sm shadow-orange-500/20"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Record Reading
                </button>
              )}
            </div>

            {/* Readings Ledger Table */}
            <SubMeterReadingsTable readings={readings} />
          </div>

          {/* Notes Card if present */}
          {subMeter.notes && (
            <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs space-y-1">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Operational Notes</span>
              <p className="text-slate-300">{subMeter.notes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
