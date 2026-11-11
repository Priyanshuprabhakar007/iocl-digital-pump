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
    <div className="option4-dashboard mx-auto max-w-[1500px] space-y-5 pb-10 text-[#172B4D]">
      <header className="option4-hero p-6 sm:p-8 lg:p-9">
        <img className="option4-station-art" src="/option4-fuel-station.svg" alt="" aria-hidden="true" />
        <div className="relative z-10 max-w-3xl">
          <span className="option4-eyebrow">IOCL • Operations workspace</span>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-[#12265C] sm:text-4xl">
            What would you like to do <span className="text-[#FF7139]">today?</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#53698F] sm:text-base">
            Welcome, {userCtx.user.name}. Manage outlet operations, stock, finance and reports from one place.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[#D6E2FF] bg-white/90 px-3 py-2 text-xs font-semibold text-[#2354C6] shadow-sm">
            <MapPin className="h-4 w-4" /> Active scope: {userCtx.primaryScope}
          </div>
        </div>
      </header>

      <section aria-label="Quick actions" className="option4-panel p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-[#17365D]">What would you like to do?</h2>
            <p className="mt-1 text-sm text-[#64748B]">Go directly to a task instead of searching through menus.</p>
          </div>
          <span className="text-xs font-medium text-[#64748B]">Only permitted workspaces appear</span>
        </div>
        {tasks.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {tasks.filter(task => ['daily-ops', 'stock-ops', 'outlets', 'reports'].includes(task.id)).map(task => {
              const Icon = task.icon;
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onNavigate?.(task.id)}
                  disabled={!onNavigate}
                  data-tone={task.id === 'daily-ops' || task.id === 'stock-ops' ? 'orange' : task.id === 'financials' ? 'green' : task.id === 'reports' ? 'purple' : 'blue'}
                  className={`option4-action group flex min-h-[108px] flex-col items-start p-4 text-left transition-all focus-visible:outline-2 focus-visible:outline-[#2354C6] disabled:cursor-not-allowed ${
                    task.featured
                      ? 'border-orange-200 bg-gradient-to-br from-white to-[#FFF6ED] hover:-translate-y-0.5 hover:border-[#F47721] hover:shadow-[0_14px_28px_rgba(244,119,33,0.15)]'
                      : 'border-[#D5E1EC] bg-gradient-to-br from-white to-[#F0F6FC] hover:border-[#4A85AE] hover:shadow-[0_12px_26px_rgba(23,54,93,0.10)]'
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

      <section aria-label="At a glance" className="option4-panel space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="text-xl font-bold text-[#17365D]">Operational overview</h2>
          <p className="mt-1 text-sm text-[#64748B]">A quick view of the records available to your role.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            { label: 'Accessible Outlets', value: loading ? '…' : stats.outletsCount, icon: Building2, tone: 'orange' },
            { label: 'Scoped Users', value: loading ? '…' : stats.usersCount, icon: Users, tone: 'blue' },
            { label: 'Permissions', value: userCtx.isGlobalAdmin ? 'ALL' : userCtx.permissions.length, icon: ShieldCheck, tone: 'purple' },
            { label: 'Audit Records', value: loading ? '…' : stats.auditLogsCount, icon: Activity, tone: 'green' },
          ].map(metric => {
            const Icon = metric.icon;
            return (
              <div key={metric.label} data-tone={metric.tone} className="option4-stat p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[#53698F]">{metric.label}</p>
                  <Icon className="h-6 w-6 text-[#2354C6]" />
                </div>
                <p className="mt-3 text-2xl font-bold tabular-nums text-[#17365D] sm:text-3xl">{metric.value}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-label="Work areas" className="option4-panel p-5 sm:p-6">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-[#17365D]">Work areas</h2>
          <p className="mt-1 text-sm text-[#64748B]">Explore the tools available to your role.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {tasks.filter(task => ['daily-ops','stock-ops','financials','reports','pump-infra'].includes(task.id)).map((task, index) => {
            const Icon = task.icon;
            const tone = ['blue','orange','green','purple','blue'][index % 5];
            return (
              <button key={task.id} type="button" data-tone={tone}
                onClick={() => onNavigate?.(task.id)} disabled={!onNavigate}
                className="option4-action group flex min-h-[168px] flex-col items-start p-5 text-left transition-all focus-visible:outline-2 focus-visible:outline-[#2354C6] disabled:cursor-not-allowed">
                <Icon className="h-7 w-7 text-[#2354C6]" />
                <span className="mt-4 block text-base font-bold text-[#17365D]">{task.label}</span>
                <span className="mt-1 flex-1 text-xs leading-relaxed text-[#64748B]">{task.description}</span>
                <span className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-[#2354C6]">
                  Open workspace <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <details className="option4-panel group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-5 focus-visible:outline-2 focus-visible:outline-[#17365D]">
          <span className="flex items-center gap-3">
            <span className="rounded-xl bg-[#F1F5F9] p-2.5 text-[#17365D]"><ShieldCheck className="h-5 w-5" /></span>
            <span>
              <span className="block text-sm font-bold text-[#17365D]">Access & governance</span>
              <span className="mt-0.5 block text-xs text-[#64748B]">Access & security information: role, assigned scopes and system controls</span>
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-[#64748B] transition-transform group-open:rotate-90" />
        </summary>
        <div className="grid gap-5 items-start border-t border-[#E2E8F0] p-5 lg:grid-cols-2">
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
