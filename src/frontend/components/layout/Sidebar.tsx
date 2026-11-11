import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS, PermissionCode } from '../../../shared/constants';
import {
  LayoutDashboard,
  Building2,
  Building,
  Users,
  ShieldAlert,
  FileCheck2,
  FolderGit2,
  Layers,
  MapPin,
  X,
  Fuel,
  Gauge,
  Droplets,
  Flame,
  Banknote,
  Package,
  Wrench,
  Zap,
  Landmark,
  Store,
  FileText,
  ChevronDown,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  mobileOpen,
  onCloseMobile,
}) => {
  const { hasPermission, userCtx } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [navSearch, setNavSearch] = useState('');
  const navigationGroups = [
    { id: 'overview', label: 'Overview', ids: ['dashboard'] },
    { id: 'operations', label: 'Daily Operations', ids: ['daily-ops', 'stock-ops', 'cng-ops', 'lube-ops'] },
    { id: 'assets', label: 'Infrastructure & Assets', ids: ['outlets', 'products', 'pump-infra', 'equipment-ops', 'utilities-ops', 'hr-workforce', 'municipal-taxes', 'nfr-ops'] },
    { id: 'finance', label: 'Finance & Reports', ids: ['financials', 'reports'] },
    { id: 'admin', label: 'Administration', ids: ['users', 'scopes', 'hierarchy', 'org-masters', 'rbac', 'audit', 'documents'] },
  ];
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['overview', 'operations']);

  // Always reveal the current tab, including a direct URL or browser history navigation.
  useEffect(() => {
    const group = navigationGroups.find(item => item.ids.includes(activeTab));
    if (group) setExpandedGroups(previous => previous.includes(group.id) ? previous : [...previous, group.id]);
  }, [activeTab]);

  const navItems = [
    {
      id: 'dashboard',
      label: 'Executive Dashboard',
      icon: LayoutDashboard,
      perm: null,
    },
    {
      id: 'daily-ops',
      label: 'Daily Operations & DSR',
      icon: Fuel,
      perm: PERMISSIONS.SHIFTS_READ,
    },
    {
      id: 'outlets',
      label: 'Retail Outlets',
      icon: Building2,
      perm: PERMISSIONS.OUTLETS_READ,
    },
    {
      id: 'products',
      label: 'Product Catalog',
      icon: Fuel,
      perm: PERMISSIONS.PRODUCTS_READ,
    },
    {
      id: 'pump-infra',
      label: 'Pump Infrastructure',
      icon: Gauge,
      perm: PERMISSIONS.TANKS_READ,
    },
    {
      id: 'hr-workforce',
      label: 'Workforce & Roster',
      icon: Users,
      perm: PERMISSIONS.HR_READ,
    },
    {
      id: 'stock-ops',
      label: 'Stock & Decantation',
      icon: Droplets,
      perm: PERMISSIONS.TANK_STOCK_READ,
    },
    {
      id: 'cng-ops',
      label: 'CNG Operations',
      icon: Flame,
      perm: PERMISSIONS.CNG_OPERATIONS_READ,
    },
    {
      id: 'lube-ops',
      label: 'Lube Operations',
      icon: Package,
      perm: PERMISSIONS.LUBE_OPERATIONS_READ,
    },
    {
      id: 'equipment-ops',
      label: 'Equipment & Breakdowns',
      icon: Wrench,
      perm: PERMISSIONS.EQUIPMENT_READ,
    },
    {
      id: 'utilities-ops',
      label: 'Utilities & Sub-Meters',
      icon: Zap,
      perm: PERMISSIONS.UTILITIES_READ,
    },
    {
      id: 'municipal-taxes',
      label: 'Municipal Taxes',
      icon: Landmark,
      perm: PERMISSIONS.MUNICIPAL_TAXES_READ,
    },
    {
      id: 'nfr-ops',
      label: 'NFR & Lease Management',
      icon: Store,
      perm: PERMISSIONS.NFR_READ,
    },
    {
      id: 'financials',
      label: 'Financials',
      icon: Banknote,
      perm: PERMISSIONS.FINANCIAL_RECONCILIATION_READ,
    },
    {
      id: 'reports',
      label: 'Monthly Reports',
      icon: FileText,
      perm: PERMISSIONS.REPORTS_READ,
    },
    {
      id: 'users',
      label: 'User Directory',
      icon: Users,
      perm: PERMISSIONS.USERS_READ,
    },
    {
      id: 'scopes',
      label: 'Scope Assignments',
      icon: MapPin,
      perm: PERMISSIONS.SCOPES_READ,
    },
    {
      id: 'hierarchy',
      label: 'Org Hierarchy',
      icon: Layers,
      perm: PERMISSIONS.HIERARCHY_READ,
    },
    {
      id: 'org-masters',
      label: 'Organization Management',
      icon: Building,
      perm: PERMISSIONS.ORG_MASTERS_READ,
    },
    {
      id: 'rbac',
      label: 'Roles & Permissions',
      icon: ShieldAlert,
      perm: null,
    },
    {
      id: 'audit',
      label: 'Audit Trail',
      icon: FileCheck2,
      perm: PERMISSIONS.AUDIT_READ,
    },
    {
      id: 'documents',
      label: 'Document Vault (R2)',
      icon: FolderGit2,
      perm: PERMISSIONS.DOCUMENTS_READ,
    },
  ];

  const filteredNav = navItems.filter(item => item.perm === null || hasPermission(item.perm as PermissionCode));
  const searchedNav = filteredNav.filter(item => item.label.toLowerCase().includes(navSearch.trim().toLowerCase()));

  const content = (
    <div className={`flex h-full min-h-0 ${collapsed ? 'w-64 lg:w-[72px]' : 'w-64'} flex-col overflow-hidden border-r border-[#142842] bg-gradient-to-b from-[#112B49] via-[#142F51] to-[#0A1D35] p-3 text-white shadow-[8px_0_22px_rgba(11,30,52,0.09)] transition-[width] duration-200`}>
      {/* Mobile Close Button & Brand */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/15 pb-3 lg:hidden">
        <div className="flex items-center gap-2.5">
          <img src="/indianoil-logo.svg" alt="IndianOil" className="h-9 w-auto object-contain shrink-0" />
          <span className="font-bold text-white text-xs">IOCL Navigation</span>
        </div>
        <button type="button" onClick={onCloseMobile}
          aria-label="Close navigation" className="rounded-lg p-2 text-slate-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#F47721]">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Sidebar Brand Header (Desktop) */}
      <div className="hidden lg:flex shrink-0 items-center gap-3 border-b border-white/15 pb-3 mb-3">
        <img src="/indianoil-logo.svg" alt="IndianOil" className="h-10 w-auto object-contain shrink-0" />
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-xs font-bold text-white leading-tight">IndianOil</div>
            <div className="text-[10px] text-slate-300">Digital Outlet Manager</div>
          </div>
        )}
      </div>

      {/* Small, optional context instead of a large always-visible identity card. */}
      {userCtx && !collapsed && (
        <details className="mb-3 hidden shrink-0 rounded-xl border border-white/15 bg-white/10 lg:block">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-white focus-visible:outline-2 focus-visible:outline-[#F47721]">
            <span className="truncate">Scope: {userCtx.primaryScope}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-300" />
          </summary>
          <div className="border-t border-white/15 px-3 py-2 text-xs text-slate-300">
            <div className="truncate font-semibold text-white">{userCtx.user.name}</div>
            <div className="mt-0.5 truncate">Employee: {userCtx.user.empCode}</div>
          </div>
        </details>
      )}

      {/* Find a task without scrolling a long ERP menu. */}
      <div className={`mb-3 shrink-0 ${collapsed ? 'lg:hidden' : ''}`}>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
          <span className="sr-only">Find a page</span>
          <input
            type="search"
            aria-label="Find a page"
            value={navSearch}
            onChange={event => setNavSearch(event.target.value)}
            placeholder="Find a page…"
            className="h-10 w-full rounded-xl border border-white/20 bg-white/10 pl-9 pr-3 text-xs font-medium text-white placeholder:text-slate-300 focus:border-[#F47721] focus:outline-none focus:ring-2 focus:ring-[#F47721]/30"
          />
        </label>
      </div>

      {/* Nav Menu */}
      <nav aria-label="Main navigation" className="min-h-0 flex-1 space-y-1 overflow-y-scroll overscroll-contain pr-1 [scrollbar-width:thin] [scrollbar-color:#54708B_#112B49]">
        {navSearch.trim() && searchedNav.length === 0 && (
          <p className="rounded-lg bg-white/10 px-3 py-4 text-xs text-slate-200" role="status">
            No accessible pages match “{navSearch}”.
          </p>
        )}
        {navigationGroups.map(group => {
          const available = searchedNav.filter(item => group.ids.includes(item.id));
          if (!available.length) return null;
          const open = Boolean(navSearch.trim()) || expandedGroups.includes(group.id) || (collapsed && available.some(item => item.id === activeTab));
          return (
            <div key={group.id} className="mb-2">
              <button type="button"
                  aria-expanded={open}
                  onClick={() => setExpandedGroups(previous => previous.includes(group.id) ? previous.filter(id => id !== group.id) : [...previous, group.id])}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-[10px] font-bold uppercase tracking-[0.08em] text-slate-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#F47721] ${collapsed ? "lg:hidden" : ""}`}>
                  {group.label}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
              {(collapsed || open) && available.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button type="button" key={item.id} title={collapsed ? item.label : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => { setActiveTab(item.id); setNavSearch(''); onCloseMobile(); }}
                    className={`my-0.5 flex w-full min-h-10 items-center gap-3 rounded-lg border-l-[3px] px-2.5 py-2.5 text-left text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#F47721] ${isActive
                      ? 'border-l-[#F47721] bg-gradient-to-r from-[#F47721] to-[#E56315] text-white shadow-[0_4px_12px_rgba(244,119,33,0.23)]'
                      : 'border-l-transparent text-slate-200 hover:bg-white/10 hover:text-white'}`}>
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-[#AFC7DD]'}`} />
                    <span className={`min-w-0 truncate ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className="shrink-0 border-t border-white/15 pt-3 text-[10px] text-slate-300">
        <div className={collapsed ? 'lg:hidden' : ''}>
            <div>IOCL Digital Outlet Manager v1.0</div>
            <div>Cloudflare Worker + D1 Engine</div>
          </div>
        <button type="button" onClick={() => setCollapsed(previous => !previous)}
          className="hidden lg:flex mt-1 w-full items-center justify-center gap-2 rounded-lg p-2 text-slate-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#F47721]"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && <span>Collapse menu</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="sticky top-[64px] hidden h-[calc(100vh-64px)] shrink-0 overflow-hidden lg:block">
        {content}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onCloseMobile} />
          <div className="relative z-10 h-full min-h-0 w-64 overflow-hidden">
            {content}
          </div>
        </div>
      )}
    </>
  );
};
