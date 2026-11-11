import './adminModern.css';
import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import { AuditLog } from '../../shared/types';
import { Activity, Clock, ShieldAlert, Code } from 'lucide-react';

export const AuditPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    const res = await apiFetch<AuditLog[]>('/api/v1/audit-logs');
    if (res.data) setLogs(res.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="admin-modern space-y-6 pb-10">
      <div className="pb-4 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-2">
          <Activity className="w-6 h-6 text-purple-400" />
          <h1 className="text-xl font-extrabold text-[#17365D]">System Audit Trail</h1>
        </div>
        <p className="text-xs text-[#64748B] mt-1">
          Immutable system log capturing all mutations, user activities, IP addresses, and state changes.
        </p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-[#64748B] font-mono animate-pulse">
          Loading audit records...
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-sm">
          <div className="admin-table-scroll overflow-x-auto" role="region" aria-label="Scrollable administration table" tabIndex={0}>
            <table className="admin-data-table w-full text-left text-xs">
              <thead className="bg-[#F1F5F9]/80 text-[#64748B] font-mono uppercase text-[10px] tracking-wider border-b border-[#D7E0EA]/80">
                <tr>
                  <th className="p-4">Timestamp</th>
                  <th className="p-4">Action</th>
                  <th className="p-4">User</th>
                  <th className="p-4">Entity Type</th>
                  <th className="p-4">IP Address</th>
                  <th className="p-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-[#334155] font-mono">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#F1F5F9]/40 transition-colors">
                    <td className="p-4 text-[#64748B] text-[11px]">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>

                    <td className="p-4 font-bold text-[#B8530D]">
                      {log.action}
                    </td>

                    <td className="p-4 text-[#17365D] font-sans font-semibold">
                      {log.userName}
                    </td>

                    <td className="p-4 text-[#475569]">
                      {log.entityType} ({log.entityId.slice(0, 8)}...)
                    </td>

                    <td className="p-4 text-[#64748B]">
                      {log.ipAddress || '127.0.0.1'}
                    </td>

                    <td className="p-4 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="px-2.5 py-1 bg-[#F1F5F9] hover:bg-[#E8EEF5] text-[#475569] hover:text-[#17365D] rounded border border-[#D7E0EA] text-[11px] font-sans"
                      >
                        Inspect Payload
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inspect Drawer/Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#F8FAFC]/55 backdrop-blur-sm">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-[#17365D]">Audit Payload Details</h2>

            <div className="space-y-3 text-xs font-mono">
              <div className="p-3 rounded-lg bg-[#F1F5F9]/80 border border-[#D7E0EA]">
                <div className="text-[#64748B] text-[10px]">NEW VALUE STATE JSON:</div>
                <pre className="text-emerald-700 text-[11px] overflow-x-auto mt-1 p-2 bg-[#F8FAFC] rounded">
                  {selectedLog.newValueJson ? JSON.stringify(JSON.parse(selectedLog.newValueJson), null, 2) : 'None'}
                </pre>
              </div>

              {selectedLog.oldValueJson && (
                <div className="p-3 rounded-lg bg-[#F1F5F9]/80 border border-[#D7E0EA]">
                  <div className="text-[#64748B] text-[10px]">OLD VALUE STATE JSON:</div>
                  <pre className="text-red-700 text-[11px] overflow-x-auto mt-1 p-2 bg-[#F8FAFC] rounded">
                    {JSON.stringify(JSON.parse(selectedLog.oldValueJson), null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-[#F1F5F9] hover:bg-[#E8EEF5] text-[#334155] rounded-lg font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
