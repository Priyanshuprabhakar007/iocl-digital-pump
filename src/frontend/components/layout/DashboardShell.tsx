import React, { useState } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

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
      <Header onToggleMobileSidebar={() => setMobileOpen(!mobileOpen)} />

      <div className="flex min-w-0 flex-1 items-stretch">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />

        <main className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-7 xl:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};
