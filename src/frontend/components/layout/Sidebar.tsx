import React from 'react';
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

  const content = (
    <div className="flex h-full min-h-0 w-64 flex-col overflow-hidden border-r border-slate-800 bg-slate-900 p-4 text-slate-300">
      {/* Mobile Close Button & Brand */}
      <div className="flex shrink-0 items-center justify-between lg:hidden mb-4 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <img src="/indianoil-logo.svg" alt="IndianOil" className="h-9 w-auto object-contain shrink-0" />
          <span className="font-bold text-white text-xs">IOCL Navigation</span>
        </div>
        <button
          onClick={onCloseMobile}
          className="p-1 text-slate-400 hover:text-white rounded-md"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Sidebar Brand Header (Desktop) */}
      <div className="hidden lg:flex shrink-0 items-center gap-3 mb-4 pb-3 border-b border-slate-800">
        <img src="/indianoil-logo.svg" alt="IndianOil" className="h-10 w-auto object-contain shrink-0" />
        <div>
          <div className="text-xs font-bold text-white leading-tight">IndianOil</div>
          <div className="text-[10px] text-slate-400 font-mono">Digital Outlet Manager</div>
        </div>
      </div>

      {/* Scope Context Card */}
      {userCtx && (
        <div className="mb-4 shrink-0 rounded-xl border border-slate-700/60 bg-slate-800/80 p-3">
          <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase font-mono">
            Active User Context
          </div>
          <div className="text-sm font-bold text-white mt-0.5 truncate">
            {userCtx.user.name}
          </div>
          <div className="text-[11px] text-orange-400 font-mono mt-0.5 truncate">
            Emp Code: {userCtx.user.empCode}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-700/50 flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-mono">Scope:</span>
            <span className="font-bold text-slate-200 font-mono px-1.5 py-0.5 rounded bg-slate-700/80">
              {userCtx.primaryScope}
            </span>
          </div>
        </div>
      )}

      {/* Nav Menu */}
      <nav aria-label="Main navigation" className="min-h-0 flex-1 space-y-1 overflow-y-scroll overscroll-contain pr-1 [scrollbar-width:thin] [scrollbar-color:#64748b_#0f172a]">
        {filteredNav.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                onCloseMobile();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-500/15'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className="shrink-0 border-t border-slate-800 pt-3 text-[10px] font-mono text-slate-500">
        <div>IOCL Digital Outlet Manager v1.0</div>
        <div>Cloudflare Worker + D1 Engine</div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="sticky top-[57px] hidden h-[calc(100vh-57px)] shrink-0 overflow-hidden lg:block">
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
