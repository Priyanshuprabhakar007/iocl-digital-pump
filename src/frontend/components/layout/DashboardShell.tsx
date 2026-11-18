import React, { useState } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import './vibrantTheme.css';
import './option4Saas.css';
import './premiumIndigoTheme.css';

interface DashboardShellProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  children: React.ReactNode;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
  activeTab,
  setActiveTab,
  children,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="enterprise-shell iocl-vibrant min-h-screen bg-[#F7F5F1] text-[#172B4D] flex flex-col font-sans">
      <a href="#main-workspace" className="iocl-skip-link">Skip to workspace</a>
      <Header mobileOpen={mobileOpen} onToggleMobileSidebar={() => setMobileOpen(previous=>!previous)} />

      <div className="flex min-w-0 flex-1 items-stretch">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />

        <main id="main-workspace" tabIndex={-1} className="min-w-0 flex-1 overflow-x-hidden p-3 sm:p-5 lg:p-6 xl:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};
