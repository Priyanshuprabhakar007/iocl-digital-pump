import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import {
  Building2,
  Users,
  ShieldCheck,
  MapPin,
  Layers,
  FileText,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { userCtx } = useAuth();
  const [stats, setStats] = useState({
    outletsCount: 0,
    usersCount: 0,
    scopesCount: 0,
    statesCount: 0,
    auditLogsCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      setLoading(true);

      const [outletsRes, usersRes, scopesRes, statesRes, auditRes] = await Promise.all([
        apiFetch<any[]>('/api/v1/outlets'),
        apiFetch<any[]>('/api/v1/users'),
        apiFetch<any[]>('/api/v1/scopes'),
        apiFetch<any[]>('/api/v1/hierarchy/states'),
        apiFetch<any[]>('/api/v1/audit-logs'),
      ]);

      setStats({
        outletsCount: outletsRes.data?.length || 0,
        usersCount: usersRes.data?.length || 0,
        scopesCount: scopesRes.data?.length || 0,
        statesCount: statesRes.data?.length || 0,
        auditLogsCount: auditRes.data?.length || 0,
      });

      setLoading(false);
    };

    loadStats();
  }, [userCtx]);

  if (!userCtx) return null;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-sm relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-[#F47721]/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#B8530D] uppercase tracking-wider mb-1">
              <Activity className="w-4 h-4" />
              <span>Phase 1A Infrastructure Operational</span>
            </div>
            <h1 className="text-2xl font-extrabold text-[#17365D]">
              Welcome, {userCtx.user.name}
            </h1>
            <p className="text-xs text-[#64748B] mt-1">
              Role: <span className="text-[#334155] font-semibold">{userCtx.roles.join(', ')}</span> • Employee Code: <span className="font-mono text-[#475569]">{userCtx.user.empCode}</span>
            </p>
          </div>

          <div className="flex items-center gap-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-2.5 shrink-0">
            <div className="p-2 rounded-lg bg-orange-500/10 text-[#B8530D]">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] text-[#64748B] font-mono uppercase tracking-wider">Active Scope Boundary</div>
              <div className="text-sm font-bold text-[#17365D] font-mono">{userCtx.primaryScope}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-[#64748B] mb-2">
            <span className="text-xs font-semibold">Accessible Outlets</span>
            <Building2 className="w-4 h-4 text-[#B8530D]" />
          </div>
          <div className="text-2xl font-extrabold text-[#17365D] font-mono">
            {loading ? '...' : stats.outletsCount}
          </div>
          <p className="text-[11px] text-[#64748B] mt-1 font-mono">
            Filtered by {userCtx.primaryScope} Scope
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-[#64748B] mb-2">
            <span className="text-xs font-semibold">Scoped Users</span>
            <Users className="w-4 h-4 text-blue-700" />
          </div>
          <div className="text-2xl font-extrabold text-[#17365D] font-mono">
            {loading ? '...' : stats.usersCount}
          </div>
          <p className="text-[11px] text-[#64748B] mt-1 font-mono">
            Accessible User Directory
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-[#64748B] mb-2">
            <span className="text-xs font-semibold">Granular Permissions</span>
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-2xl font-extrabold text-[#17365D] font-mono">
            {userCtx.isGlobalAdmin ? 'ALL (*)' : userCtx.permissions.length}
          </div>
          <p className="text-[11px] text-[#64748B] mt-1 font-mono">
            Assigned to Active Role
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-[#64748B] mb-2">
            <span className="text-xs font-semibold">Audit Records</span>
            <Activity className="w-4 h-4 text-violet-700" />
          </div>
          <div className="text-2xl font-extrabold text-[#17365D] font-mono">
            {loading ? '...' : stats.auditLogsCount}
          </div>
          <p className="text-[11px] text-[#64748B] mt-1 font-mono">
            System Mutation Trail
          </p>
        </div>
      </div>

      {/* Scope Details & Security Architecture Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Active Scope Assignments */}
        <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#17365D] tracking-wide">
              User Organizational Scope Assignments
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0]">
              {userCtx.scopes.length} Active Rules
            </span>
          </div>

          <div className="space-y-3">
            {userCtx.scopes.map((s, idx) => (
              <div key={s.id || idx} className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#B8530D] font-mono">LEVEL: {s.scopeLevel}</span>
                  <span className="text-[10px] text-[#64748B] font-mono">Assigned by {s.createdBy}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] font-mono text-[#475569] border-t border-[#E2E8F0]">
                  {s.stateName && <div>State: <span className="text-[#17365D] font-semibold">{s.stateName}</span></div>}
                  {s.divisionName && <div>Division: <span className="text-[#17365D] font-semibold">{s.divisionName}</span></div>}
                  {s.salesAreaName && <div>Sales Area: <span className="text-[#17365D] font-semibold">{s.salesAreaName}</span></div>}
                  {s.outletName && <div>Outlet: <span className="text-[#17365D] font-semibold">{s.outletName}</span></div>}
                  {s.scopeLevel === 'GLOBAL' && <div className="col-span-2 text-violet-700">Unrestricted access across all All-India IOCL facilities</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Security & System Status */}
        <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-bold text-[#17365D] tracking-wide">
            Security Enforcement Matrix
          </h2>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-[#17365D]">HttpOnly Cookie Auth</div>
                <p className="text-[11px] text-[#64748B]">Tokens stored server-side with SHA-256 hash. localStorage is not used.</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-[#17365D]">Backend Scope Middleware</div>
                <p className="text-[11px] text-[#64748B]">Scoped database repositories enforce row-level access control on every SQL query.</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-[#17365D]">Audit Trail Logging</div>
                <p className="text-[11px] text-[#64748B]">All data mutations recorded with IP address, timestamp, and entity diffs.</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
