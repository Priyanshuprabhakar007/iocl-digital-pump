import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import { PERMISSIONS, PermissionCode } from '../../shared/constants';
import { useActiveOutlet } from '../context/ActiveOutletContext';
import type { DailyFuelSummary } from '../../shared/types';
import { getLocalDateInputValue } from '../../shared/utils/dateUtils';
import { getWorkDeskIndicators } from '../utils/workDesk';
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
  const { activeOutlet, activeOutletId, loading: outletLoading } = useActiveOutlet();
  const businessDate = getLocalDateInputValue();
  const canViewDaily = hasPermission(PERMISSIONS.SHIFTS_READ);
  const [dailyStatus, setDailyStatus] = useState<{ outletId: string; date: string; summary: DailyFuelSummary | null; error: string } | null>(null);
  const [revision, setRevision] = useState(0);
  const [governanceOpen, setGovernanceOpen] = useState(false);
  useEffect(() => {
    if (!activeOutletId || !canViewDaily || !userCtx) return;
    let cancelled = false;
    setDailyStatus(null);
    apiFetch<DailyFuelSummary>('/api/v1/outlets/' + encodeURIComponent(activeOutletId) + '/fuel/daily-summary?businessDate=' + encodeURIComponent(businessDate), { cache: 'no-store' })
      .then(res => { if (!cancelled) setDailyStatus({outletId: activeOutletId, date: businessDate, summary: res.success && res.data?.outletId === activeOutletId && res.data?.businessDate === businessDate ? res.data : null, error: res.success && res.data?.outletId === activeOutletId && res.data?.businessDate === businessDate ? '' : res.error?.message || 'Could not load today’s operational status.'}); })
      .catch(() => { if (!cancelled) setDailyStatus({outletId: activeOutletId, date: businessDate, summary: null, error: 'Could not load today’s operational status.'}); });
    return () => { cancelled = true; };
  }, [activeOutletId, businessDate, canViewDaily, userCtx, revision]);
  const currentStatus = dailyStatus?.outletId === activeOutletId && dailyStatus?.date === businessDate ? dailyStatus : null;
  const summary = currentStatus?.summary;
  const indicators = summary ? getWorkDeskIndicators(summary) : [];
  const [stats, setStats] = useState({
    outletsCount: 0,
    usersCount: 0,
    scopesCount: 0,
    statesCount: 0,
    auditLogsCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!governanceOpen || !userCtx) return;
    let cancelled = false;
    const loadStats = async () => {
      setLoading(true);

      const [outletsRes, usersRes, scopesRes, statesRes, auditRes] = await Promise.all([
        hasPermission(PERMISSIONS.OUTLETS_READ) ? apiFetch<any[]>('/api/v1/outlets') : Promise.resolve({data: null}),
        hasPermission(PERMISSIONS.USERS_READ) ? apiFetch<any[]>('/api/v1/users') : Promise.resolve({data: null}),
        hasPermission(PERMISSIONS.SCOPES_READ) ? apiFetch<any[]>('/api/v1/scopes') : Promise.resolve({data: null}),
        hasPermission(PERMISSIONS.HIERARCHY_READ) ? apiFetch<any[]>('/api/v1/hierarchy/states') : Promise.resolve({data: null}),
        hasPermission(PERMISSIONS.AUDIT_READ) ? apiFetch<any[]>('/api/v1/audit-logs') : Promise.resolve({data: null}),
      ]);

      if (cancelled) return;
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
    return () => { cancelled = true; };
  }, [userCtx, governanceOpen, hasPermission]);

  if (!userCtx) return null;

  // Permission-aware shortcuts use the same tab IDs and authorization gates as the sidebar.
  const tasks = [
    { id: 'daily-ops', label: 'Shift & Readings', description: 'Open shifts, enter tank dips and nozzle meters, review stock and close shifts.', icon: ClipboardList, permission: PERMISSIONS.SHIFTS_READ, group: 'daily' },
    { id: 'stock-ops', label: 'Fuel Receipts', description: 'Receive tankers, record decantation and verify stock.', icon: Fuel, permission: PERMISSIONS.TANK_STOCK_READ, group: 'daily' },
    { id: 'financials', label: 'Collections & Finance', description: 'Record collections, handovers, deposits and reconciliation.', icon: Wallet, permission: PERMISSIONS.FINANCIAL_RECONCILIATION_READ, group: 'daily' },
    { id: 'cng-ops', label: 'CNG Operations', description: 'Manage CNG logs and readings.', icon: Fuel, permission: PERMISSIONS.CNG_OPERATIONS_READ, group: 'daily' },
    { id: 'lube-ops', label: 'Lube Operations', description: 'Manage lubricant inventory and sales.', icon: Layers, permission: PERMISSIONS.LUBE_OPERATIONS_READ, group: 'daily' },
    { id: 'dsr-reports', label: 'DSR Reports', description: 'Retrieve daily, weekly, monthly or custom PDF reports.', icon: FileText, permission: PERMISSIONS.REPORTS_READ, group: 'reports' },
    { id: 'reports', label: 'Monthly Reports', description: 'Review integrated monthly performance and PDF reports.', icon: FileText, permission: PERMISSIONS.REPORTS_READ, group: 'reports' },
    { id: 'documents', label: 'Documentation & Compliance', description: 'Licences, agreements, claims, evidence and compliance PDFs.', icon: ShieldCheck, permission: PERMISSIONS.DOCUMENTS_READ, group: 'reports' },
    { id: 'equipment-ops', label: 'Equipment & Maintenance', description: 'Equipment condition, breakdowns and maintenance.', icon: Wrench, permission: PERMISSIONS.EQUIPMENT_READ, group: 'support' },
    { id: 'utilities-ops', label: 'Utilities & Bills', description: 'Utility records and sub-meter readings.', icon: Activity, permission: PERMISSIONS.UTILITIES_READ, group: 'support' },
    { id: 'hr-workforce', label: 'Workforce & Roster', description: 'Staff, attendance and rosters.', icon: Users, permission: PERMISSIONS.HR_READ, group: 'support' },
    { id: 'municipal-taxes', label: 'Municipal Taxes', description: 'Manage tax records.', icon: FileText, permission: PERMISSIONS.MUNICIPAL_TAXES_READ, group: 'support' },
    { id: 'nfr-ops', label: 'NFR & Lease Management', description: 'Manage non-fuel leases.', icon: Building2, permission: PERMISSIONS.NFR_READ, group: 'support' },
    { id: 'outlets', label: 'Retail Outlets', description: 'Find outlets and manage assignments.', icon: Building2, permission: PERMISSIONS.OUTLETS_READ, group: 'setup' },
    { id: 'pump-infra', label: 'Pump Infrastructure', description: 'Tanks, nozzles, dispensers and calibration.', icon: Wrench, permission: PERMISSIONS.TANKS_READ, group: 'setup' },
    { id: 'products', label: 'Product Catalog', description: 'Maintain product masters.', icon: Layers, permission: PERMISSIONS.PRODUCTS_READ, group: 'setup' },
  ].filter(task => hasPermission(task.permission as PermissionCode) && (task.id !== 'dsr-reports' || canViewDaily));
  const taskCard = (task: typeof tasks[number]) => {
    const Icon = task.icon;
    return <button key={task.id} type="button" disabled={!onNavigate}
      onClick={() => onNavigate?.(task.id)}
      className="group flex min-h-[84px] w-full items-center gap-3 rounded-xl border border-[#D7E0EA] bg-white px-4 py-3 text-left hover:border-[#F47721] focus-visible:outline-2 focus-visible:outline-[#2354C6] disabled:opacity-50">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F1F5F9] text-[#17365D]"><Icon className="h-5 w-5"/></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[#17365D]">{task.label}</span><span className="mt-1 block text-xs leading-relaxed text-[#64748B]">{task.description}</span></span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#64748B] group-hover:text-[#F47721]"/>
    </button>;
  };


  return (
    <div className="option4-dashboard mx-auto max-w-[1500px] space-y-5 pb-10 text-[#172B4D]">
      <header className="rounded-2xl border border-[#D7E0EA] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-wider text-[#B8530D]">Outlet work desk</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-[#17365D]">What would you like to do?</h1><p className="mt-1 text-sm text-[#64748B]">Start with today's outlet tasks or find saved reports and compliance records.</p></div>
          <div className="rounded-xl bg-[#F1F5F9] px-4 py-3 text-sm"><div className="font-bold text-[#17365D]">{activeOutlet ? activeOutlet.name + ' (' + activeOutlet.roCode + ')' : outletLoading ? 'Loading outlet…' : 'No active outlet selected'}</div><div className="mt-1 text-xs text-[#64748B]">Business date: {businessDate} · Change outlet in the top bar</div></div>
        </div>
      </header>
      {canViewDaily && activeOutletId && <section aria-label="Today's operational status" className="option4-panel p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold text-[#17365D]">Today's operations</h2><p className="text-xs text-[#64748B]">Saved progress across all shifts for this outlet and business date.</p></div><button type="button" className="rounded-lg border border-[#D7E0EA] px-3 py-2 text-xs font-semibold text-[#17365D]" onClick={() => setRevision(v => v+1)}>Refresh status</button></div>
        {!currentStatus ? <p role="status" className="text-sm text-[#64748B]">Loading saved status…</p> : currentStatus.error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{currentStatus.error}</p> : summary && <>
          <div className="flex flex-wrap items-center gap-3 text-sm"><span className="font-bold text-[#17365D]">{summary.dayEntryStatus === 'NO_ENTRY' ? 'No recorded shifts' : summary.status.replaceAll('_', ' ')}</span><span className="text-[#64748B]">{summary.shiftsCount} recorded · {summary.shifts.filter(x=>x.status==='OPEN').length} open</span>{summary.missingFields.length>0 && <span className="text-amber-800">{summary.missingFields.length} completion warnings</span>}</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">{indicators.map(item=><div key={item.label} className="flex items-center justify-between gap-3 rounded-lg border border-[#E2E8F0] p-3"><div><p className="text-xs font-semibold text-[#17365D]">{item.label}</p><p className="mt-1 text-xs text-[#64748B]">{item.detail}</p></div><span className={'text-xs font-semibold '+(item.state==='complete'?'text-emerald-700':item.state==='pending'?'text-amber-800':'text-slate-500')}>{item.state==='complete'?'Complete':item.state==='pending'?'Pending':'Not recorded'}</span></div>)}</div>
          {summary.missingFields.length>0&&<details className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><summary className="cursor-pointer font-semibold">Show completion warnings</summary><ul className="mt-2 list-disc pl-5">{summary.missingFields.map((m,i)=><li key={i}>{m}</li>)}</ul></details>}
          <button type="button" onClick={()=>onNavigate?.('daily-ops')} className="rounded-lg bg-[#17365D] px-4 py-2.5 text-sm font-semibold text-white">{summary.shiftsCount===0?'Start daily operations':'Open shift workspace'}</button>
          <p className="text-xs text-[#64748B]">These are recorded indicators, not a mandatory sequence or a readiness-to-close decision. No data is changed here.</p>
        </>}
      </section>}
      <section aria-label="Quick actions" className="option4-panel p-5 space-y-3">
        <div><h2 className="text-lg font-bold text-[#17365D]">Daily work</h2><p className="text-xs text-[#64748B]">Open the appropriate task once. Use the same outlet and verify the selected shift before entering data.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{tasks.filter(task=>task.group==='daily').map(taskCard)}</div>
        {!tasks.some(task=>task.group==='daily')&&<p className="text-sm text-[#64748B]">No daily workspaces assigned to your role.</p>}
      </section>
      <section aria-label="Work areas" className="space-y-4">
        {tasks.some(task=>task.group==='reports')&&<div className="option4-panel p-5 space-y-3"><div><h2 className="text-lg font-bold text-[#17365D]">Reports &amp; compliance</h2><p className="text-xs text-[#64748B]">Find existing records, due dates and downloadable reports.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{tasks.filter(task=>task.group==='reports').map(taskCard)}</div></div>}
        {(['support','setup'] as const).map(group=>tasks.some(task=>task.group===group)&&<details key={group} className="option4-panel group"><summary className="cursor-pointer list-none flex items-center justify-between p-5"><div><span className="block font-bold text-[#17365D]">{group==='support'?'Outlet support & maintenance':'Outlet setup & masters'}</span><span className="block mt-1 text-xs text-[#64748B]">{group==='support'?'Staff, bills, equipment and leases':'Products, tanks, calibration and outlet configuration'}</span></div><ChevronRight className="h-5 w-5 text-[#64748B] group-open:rotate-90"/></summary><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 border-t border-[#E2E8F0] p-5">{tasks.filter(task=>task.group===group).map(taskCard)}</div></details>)}
      </section>

      <details className="option4-panel group" onToggle={e=>setGovernanceOpen(e.currentTarget.open)}>
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
        <div aria-label="At a glance" className="grid grid-cols-2 gap-3 border-t border-[#E2E8F0] p-5 xl:grid-cols-4">
          {[
            {label:'Accessible outlets',value:loading?'…':stats.outletsCount,icon:Building2,tone:'orange',visible:hasPermission(PERMISSIONS.OUTLETS_READ)},
            {label:'Scoped users',value:loading?'…':stats.usersCount,icon:Users,tone:'blue',visible:hasPermission(PERMISSIONS.USERS_READ)},
            {label:'Permissions',value:userCtx.isGlobalAdmin?'ALL':userCtx.permissions.length,icon:ShieldCheck,tone:'purple',visible:true},
            {label:'Audit records',value:loading?'…':stats.auditLogsCount,icon:Activity,tone:'green',visible:hasPermission(PERMISSIONS.AUDIT_READ)}
          ].filter(metric=>metric.visible).map(metric=><div key={metric.label} data-tone={metric.tone} className="option4-stat p-4"><p className="text-xs text-[#64748B]">{metric.label}</p><p className="mt-2 text-xl font-bold text-[#17365D]">{metric.value}</p></div>)}
        </div>
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
