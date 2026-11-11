import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import { PERMISSIONS, PermissionCode } from '../../shared/constants';
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
  ArrowUpRight,
  Fuel,
  ClipboardList,
  Wallet,
  Wrench,
  ChevronRight,
  BookOpen
} from 'lucide-react';

interface DashboardPageProps {
  onNavigate?: (tab: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { userCtx, hasPermission } = useAuth();
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

  // Permission-aware shortcuts use the same tab IDs and authorization gates as the sidebar.
  const tasks = [
    { id: 'daily-ops', label: 'Daily Operations', description: 'Open a shift, enter readings and view the DSR', icon: ClipboardList, permission: PERMISSIONS.SHIFTS_READ, featured: true },
    { id: 'stock-ops', label: 'Stock & Receipts', description: 'Tank dips, tanker receipts and reconciliation', icon: Fuel, permission: PERMISSIONS.TANK_STOCK_READ, featured: true },
    { id: 'financials', label: 'Collections & Finance', description: 'Cash, payments, deposits and settlement', icon: Wallet, permission: PERMISSIONS.FINANCIAL_RECONCILIATION_READ, featured: true },
    { id: 'reports', label: 'Monthly Reports', description: 'Find summaries and generate reports', icon: FileText, permission: PERMISSIONS.REPORTS_READ, featured: false },
    { id: 'outlets', label: 'Retail Outlets', description: 'Find outlets and manage assignments', icon: Building2, permission: PERMISSIONS.OUTLETS_READ, featured: false },
    { id: 'pump-infra', label: 'Pump Infrastructure', description: 'Tanks, nozzles, dispensers and setup', icon: Wrench, permission: PERMISSIONS.TANKS_READ, featured: false },
  ].filter(task => hasPermission(task.permission as PermissionCode));

  return (
    <div className="mx-auto max-w-[1440px] space-y-8 pb-10 text-[#172B4D]">
      <header className="relative overflow-hidden rounded-[24px] bg-[#17365D] px-6 py-7 text-white shadow-sm sm:px-8 sm:py-9">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full border border-white/15 pointer-events-none" />
        <div className="absolute -right-6 top-3 h-44 w-44 rounded-full bg-[#F47721]/15 blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-orange-200">Your workday, simplified</p>
            <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Welcome, {userCtx.user.name}</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-200">
              Choose what you need to do. Your access and existing records stay the same.
            </p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-slate-200">Working scope</p>
            <p className="mt-1 text-base font-bold text-white">{userCtx.primaryScope}</p>
          </div>
        </div>
      </header>

      <section aria-label="Quick actions">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-[#17365D]">What would you like to do?</h2>
            <p className="mt-1 text-sm text-[#64748B]">Go directly to a task instead of searching through menus.</p>
          </div>
          <span className="text-xs font-medium text-[#64748B]">Only permitted workspaces appear</span>
        </div>
        {tasks.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {tasks.map(task => {
              const Icon = task.icon;
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onNavigate?.(task.id)}
                  disabled={!onNavigate}
                  className={`group flex min-h-[138px] flex-col items-start rounded-2xl border p-5 text-left transition-all focus-visible:outline-2 focus-visible:outline-[#F47721] disabled:cursor-not-allowed ${
                    task.featured
                      ? 'border-[#CFDCE9] bg-white hover:-translate-y-0.5 hover:border-[#F47721] hover:shadow-md'
                      : 'border-[#E2E8F0] bg-white hover:border-[#B2C7DB] hover:shadow-sm'
                  }`}
                >
                  <span className="flex w-full items-center justify-between">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${task.featured ? 'bg-orange-50 text-[#C85A0D]' : 'bg-[#F1F5F9] text-[#17365D]'}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <ArrowUpRight className="h-5 w-5 text-[#94A3B8] transition-colors group-hover:text-[#F47721]" />
                  </span>
                  <span className="mt-4 block text-base font-bold text-[#17365D]">{task.label}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-[#64748B]">{task.description}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-2xl border border-[#E2E8F0] bg-white p-5 text-sm text-[#64748B]">No workspaces are assigned to your role.</p>
        )}
      </section>

      <section aria-label="At a glance" className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-[#17365D]">At a glance</h2>
          <p className="mt-1 text-sm text-[#64748B]">A quick view of the records available to your role.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            { label: 'Accessible Outlets', value: loading ? '…' : stats.outletsCount, icon: Building2 },
            { label: 'Scoped Users', value: loading ? '…' : stats.usersCount, icon: Users },
            { label: 'Permissions', value: userCtx.isGlobalAdmin ? 'ALL' : userCtx.permissions.length, icon: ShieldCheck },
            { label: 'Audit Records', value: loading ? '…' : stats.auditLogsCount, icon: Activity },
          ].map(metric => {
            const Icon = metric.icon;
            return (
              <div key={metric.label} className="rounded-2xl border border-[#E2E8F0] bg-white p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[#64748B]">{metric.label}</p>
                  <Icon className="h-4 w-4 text-[#D86514]" />
                </div>
                <p className="mt-3 text-2xl font-bold tabular-nums text-[#17365D] sm:text-3xl">{metric.value}</p>
              </div>
            );
          })}
        </div>
      </section>

      <details className="group rounded-2xl border border-[#E2E8F0] bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-5 focus-visible:outline-2 focus-visible:outline-[#17365D]">
          <span className="flex items-center gap-3">
            <span className="rounded-xl bg-[#F1F5F9] p-2.5 text-[#17365D]"><ShieldCheck className="h-5 w-5" /></span>
            <span>
              <span className="block text-sm font-bold text-[#17365D]">Access & security information</span>
              <span className="mt-0.5 block text-xs text-[#64748B]">Role, assigned scopes and system controls</span>
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-[#64748B] transition-transform group-open:rotate-90" />
        </summary>
        <div className="grid gap-5 border-t border-[#E2E8F0] p-5 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[#17365D]">Your scope assignments</h3>
            <p className="text-xs text-[#64748B]">Role: {userCtx.roles.join(', ')} · Employee code: {userCtx.user.empCode}</p>
            {userCtx.scopes.map((scope, i) => (
              <div key={scope.id || i} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-[#17365D]">{scope.scopeLevel}</span>
                  <span className="text-[#64748B]">Assigned by {scope.createdBy}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[#526477]">
                  {scope.stateName && <span>State: {scope.stateName}</span>}
                  {scope.divisionName && <span>Division: {scope.divisionName}</span>}
                  {scope.salesAreaName && <span>Sales area: {scope.salesAreaName}</span>}
                  {scope.outletName && <span>Outlet: {scope.outletName}</span>}
                  {scope.scopeLevel === 'GLOBAL' && <span>All-India IOCL facilities</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[#17365D]">System controls</h3>
            {[
              ['Secure authentication', 'Session credentials are handled through server-side security controls.'],
              ['Scope enforcement', 'Backend permissions and scope restrictions remain active.'],
              ['Audit trail', 'System mutations are recorded for review.'],
            ].map(([label, description]) => (
              <div key={label} className="flex items-start gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                <div><p className="text-xs font-bold text-[#17365D]">{label}</p><p className="mt-1 text-xs text-[#64748B]">{description}</p></div>
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
};
