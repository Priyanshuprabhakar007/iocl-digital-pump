import React from 'react';
import { UtilitySubMeterReading } from '../../../shared/types';
import { formatDisplayDateTime } from './utilityUi';
import { Gauge, Check, Info } from 'lucide-react';

interface SubMeterReadingsTableProps {
  readings: UtilitySubMeterReading[];
  loading?: boolean;
}

export const SubMeterReadingsTable: React.FC<SubMeterReadingsTableProps> = ({
  readings,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="p-8 bg-slate-950/60 border border-slate-800 rounded-2xl animate-pulse space-y-3">
        <div className="h-5 w-40 bg-slate-800 rounded" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-slate-800/40 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (readings.length === 0) {
    return (
      <div className="p-8 bg-slate-950/60 border border-slate-800 rounded-2xl text-center space-y-2">
        <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500 mx-auto">
          <Gauge className="w-5 h-5" />
        </div>
        <div className="text-xs font-semibold text-slate-300">No Meter Readings Recorded</div>
        <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
          Record the initial baseline reading to start tracking electricity consumption for this sub-meter.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Desktop Table View */}
      <div className="hidden md:block bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
            <tr>
              <th className="py-2.5 px-3.5">Reading Date & Time</th>
              <th className="py-2.5 px-3.5">Meter Reading</th>
              <th className="py-2.5 px-3.5">Previous Reading</th>
              <th className="py-2.5 px-3.5">Consumption</th>
              <th className="py-2.5 px-3.5">Tariff Snapshot</th>
              <th className="py-2.5 px-3.5 text-right">Calculated Charge</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300 font-medium">
            {readings.map((r, idx) => {
              const isBaseline = r.previousReadingId === null;

              return (
                <tr
                  key={r.id}
                  className={`hover:bg-slate-900/50 transition-colors ${
                    isBaseline ? 'bg-orange-500/[0.02]' : ''
                  }`}
                >
                  <td className="py-2.5 px-3.5 font-mono text-[11px] text-slate-300">
                    <div className="flex items-center gap-2">
                      <span>{formatDisplayDateTime(r.readingAt)}</span>
                      {isBaseline && (
                        <span className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-bold uppercase tracking-wider rounded-md">
                          Baseline
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3.5 font-mono font-bold text-white">
                    {r.readingStr} kWh
                  </td>
                  <td className="py-2.5 px-3.5 font-mono text-slate-400">
                    {r.previousReadingStr ? `${r.previousReadingStr} kWh` : '-'}
                  </td>
                  <td className="py-2.5 px-3.5 font-mono">
                    {isBaseline ? (
                      <span className="text-slate-500 font-normal">0.000 kWh</span>
                    ) : (
                      <span className="font-bold text-amber-400">+{r.consumptionStr} kWh</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3.5 font-mono text-slate-400">
                    ₹{r.ratePerKwhStr} / kWh
                  </td>
                  <td className="py-2.5 px-3.5 text-right font-mono font-bold">
                    {isBaseline ? (
                      <span className="text-slate-500 font-normal">₹0.00</span>
                    ) : (
                      <span className="text-emerald-400 text-sm">₹{r.chargeStr}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Stacked View */}
      <div className="md:hidden space-y-2.5">
        {readings.map((r, idx) => {
          const isBaseline = r.previousReadingId === null;

          return (
            <div
              key={r.id}
              className={`p-3.5 bg-slate-950 border rounded-xl space-y-2 text-xs ${
                isBaseline ? 'border-orange-500/20' : 'border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-mono text-[11px] text-slate-400">
                  {formatDisplayDateTime(r.readingAt)}
                </div>
                {isBaseline ? (
                  <span className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-bold uppercase tracking-wider rounded-md">
                    Baseline Reading
                  </span>
                ) : (
                  <span className="font-mono font-bold text-emerald-400 text-sm">
                    ₹{r.chargeStr}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-800/80 font-mono">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Meter Reading</span>
                  <span className="font-bold text-white">{r.readingStr} kWh</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Consumption</span>
                  <span className={isBaseline ? 'text-slate-500' : 'text-amber-400 font-bold'}>
                    {isBaseline ? '0.000 kWh' : `+${r.consumptionStr} kWh`}
                  </span>
                </div>
              </div>

              {r.notes && (
                <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded-lg">
                  {r.notes}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
