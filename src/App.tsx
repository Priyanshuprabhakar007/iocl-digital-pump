import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './frontend/context/AuthContext';
import { ActiveOutletProvider } from './frontend/context/ActiveOutletContext';
import { LoginPage } from './frontend/pages/LoginPage';
import { DashboardShell } from './frontend/components/layout/DashboardShell';
import { DashboardPage } from './frontend/pages/DashboardPage';
import { OutletsPage } from './frontend/pages/OutletsPage';
import { UsersPage } from './frontend/pages/UsersPage';
import { ScopesPage } from './frontend/pages/ScopesPage';
import { HierarchyPage } from './frontend/pages/HierarchyPage';
import { RbacPage } from './frontend/pages/RbacPage';
import { AuditPage } from './frontend/pages/AuditPage';
import { DocumentsPage } from './frontend/pages/DocumentsPage';
import { ProductsPage } from './frontend/pages/ProductsPage';
import { PumpInfrastructurePage } from './frontend/pages/PumpInfrastructurePage';
import { ShiftOperationsPage } from './frontend/pages/ShiftOperationsPage';
import { StockOperationsPage } from './frontend/pages/StockOperationsPage';
import { CngOperationsPage } from './frontend/pages/CngOperationsPage';
import { FinancialOperationsPage } from './frontend/pages/FinancialOperationsPage';
import { LubeOperationsPage } from './frontend/pages/LubeOperationsPage';
import { EquipmentOperationsPage } from './frontend/pages/EquipmentOperationsPage';
import { UtilitiesOperationsPage } from './frontend/pages/UtilitiesOperationsPage';
import { MunicipalTaxesPage } from './frontend/pages/MunicipalTaxesPage';
import { NfrOperationsPage } from './frontend/pages/NfrOperationsPage';
import { WorkforceOperationsPage } from './frontend/pages/WorkforceOperationsPage';
import { OrganizationMastersPage } from './frontend/pages/OrganizationMastersPage';
import { ReportsPage } from './frontend/pages/ReportsPage';
import { DailyOperationsPage } from './frontend/pages/DailyOperationsPage';
import { PERMISSIONS } from './shared/constants';

const ROUTE_TAB_MAP: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/daily-operations': 'daily-ops',
  '/outlets': 'outlets',
  '/products': 'products',
  '/pump-infrastructure': 'pump-infra',
  '/shifts': 'shift-ops',
  '/workforce': 'hr-workforce',
  '/stock': 'stock-ops',
  '/cng': 'cng-ops',
  '/lube': 'lube-ops',
  '/equipment': 'equipment-ops',
  '/utilities': 'utilities-ops',
  '/municipal-taxes': 'municipal-taxes',
  '/nfr': 'nfr-ops',
  '/financials': 'financials',
  '/reports': 'reports',
  '/users': 'users',
  '/scopes': 'scopes',
  '/hierarchy': 'hierarchy',
  '/organization': 'org-masters',
  '/rbac': 'rbac',
  '/audit': 'audit',
  '/documents': 'documents',
};

const TAB_ROUTE_MAP: Record<string, string> = Object.entries(ROUTE_TAB_MAP).reduce(
  (acc, [path, tab]) => {
    acc[tab] = path;
    return acc;
  },
  {} as Record<string, string>
);

function getTabFromLocation(): string {
  if (typeof window === 'undefined') return 'dashboard';
  const path = window.location.pathname;
  return ROUTE_TAB_MAP[path] || 'dashboard';
}

function MainAppContent() {
  const { userCtx, loading, hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<string>(getTabFromLocation);

  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getTabFromLocation());
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
    }
  }, []);

  const handleSetActiveTab = (tab: string) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const targetPath = TAB_ROUTE_MAP[tab] || '/dashboard';
      if (window.location.pathname !== targetPath) {
        window.history.pushState({}, '', targetPath);
      }
    }
  };

  // Enforce RBAC navigation check for direct deep links
  useEffect(() => {
    if (!userCtx) return;
    const tabToPermMap: Record<string, any> = {
      'daily-ops': PERMISSIONS.SHIFTS_READ,
      outlets: PERMISSIONS.OUTLETS_READ,
      products: PERMISSIONS.PRODUCTS_READ,
      'pump-infra': PERMISSIONS.TANKS_READ,
      'shift-ops': PERMISSIONS.SHIFTS_READ,
      'hr-workforce': PERMISSIONS.HR_READ,
      'stock-ops': PERMISSIONS.TANK_STOCK_READ,
      'cng-ops': PERMISSIONS.CNG_OPERATIONS_READ,
      'lube-ops': PERMISSIONS.LUBE_OPERATIONS_READ,
      'equipment-ops': PERMISSIONS.EQUIPMENT_READ,
      'utilities-ops': PERMISSIONS.UTILITIES_READ,
      'municipal-taxes': PERMISSIONS.MUNICIPAL_TAXES_READ,
      'nfr-ops': PERMISSIONS.NFR_READ,
      financials: PERMISSIONS.FINANCIAL_RECONCILIATION_READ,
      reports: PERMISSIONS.REPORTS_READ,
      users: PERMISSIONS.USERS_READ,
      scopes: PERMISSIONS.SCOPES_READ,
      hierarchy: PERMISSIONS.HIERARCHY_READ,
      'org-masters': PERMISSIONS.ORG_MASTERS_READ,
      audit: PERMISSIONS.AUDIT_READ,
      documents: PERMISSIONS.DOCUMENTS_READ,
    };

    const requiredPerm = tabToPermMap[activeTab];
    if (requiredPerm && !hasPermission(requiredPerm)) {
      handleSetActiveTab('dashboard');
    }
  }, [activeTab, userCtx, hasPermission]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-extrabold text-2xl shadow-xl shadow-orange-500/20 animate-pulse mb-4">
          IOC
        </div>
        <div className="text-sm font-bold text-white tracking-wide">
          IOCL <span className="text-orange-500">Digital Outlet Manager</span>
        </div>
        <div className="text-xs text-slate-400 font-mono mt-1">
          Authenticating Worker Session...
        </div>
      </div>
    );
  }

  if (!userCtx) {
    return <LoginPage />;
  }

  return (
    <ActiveOutletProvider>
      <DashboardShell activeTab={activeTab} setActiveTab={handleSetActiveTab}>
        {activeTab === 'dashboard' && <DashboardPage />}
        {activeTab === 'daily-ops' && <DailyOperationsPage />}
        {activeTab === 'outlets' && <OutletsPage />}
        {activeTab === 'products' && <ProductsPage />}
        {activeTab === 'pump-infra' && <PumpInfrastructurePage />}
        {activeTab === 'shift-ops' && <ShiftOperationsPage />}
        {activeTab === 'hr-workforce' && <WorkforceOperationsPage />}
        {activeTab === 'stock-ops' && <StockOperationsPage />}
        {activeTab === 'cng-ops' && <CngOperationsPage />}
        {activeTab === 'lube-ops' && <LubeOperationsPage />}
        {activeTab === 'equipment-ops' && <EquipmentOperationsPage />}
        {activeTab === 'utilities-ops' && <UtilitiesOperationsPage />}
        {activeTab === 'municipal-taxes' && <MunicipalTaxesPage />}
        {activeTab === 'nfr-ops' && <NfrOperationsPage />}
        {activeTab === 'financials' && <FinancialOperationsPage />}
        {activeTab === 'reports' && <ReportsPage />}
        {activeTab === 'users' && <UsersPage />}
        {activeTab === 'scopes' && <ScopesPage />}
        {activeTab === 'hierarchy' && <HierarchyPage />}
        {activeTab === 'org-masters' && <OrganizationMastersPage />}
        {activeTab === 'rbac' && <RbacPage />}
        {activeTab === 'audit' && <AuditPage />}
        {activeTab === 'documents' && <DocumentsPage />}
      </DashboardShell>
    </ActiveOutletProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}
