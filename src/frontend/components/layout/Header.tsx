import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Shield, User, LogOut, ChevronDown, Building2, MapPin, Menu, RefreshCw } from 'lucide-react';

import { GlobalOutletSelector } from '../../context/ActiveOutletContext';

interface HeaderProps {
  onToggleMobileSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileSidebar }) => {
  const { userCtx, logout, switchDemoUser } = useAuth();
  const [demoDropdownOpen, setDemoDropdownOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  if (!userCtx) return null;

  const demoAccounts = [
    { label: 'Admin (GLOBAL)', email: 'admin@iocl.in', badge: 'ADMIN' },
    { label: 'State Office (STATE)', email: 'wbso@iocl.in', badge: 'STATE_OFFICE' },
    { label: 'Divisional Office (DIVISION)', email: 'kolkatado@iocl.in', badge: 'DIVISIONAL_OFFICE' },
    { label: 'Field Officer (SALES_AREA)', email: 'fo.central@iocl.in', badge: 'FIELD_OFFICER' },
    { label: 'Dealer (OUTLET)', email: 'dealer.parkstreet@iocl.in', badge: 'DEALER' },
    { label: 'CSP (OUTLET)', email: 'csp.parkstreet@iocl.in', badge: 'CSP' },
  ];

  const handleSwitch = async (email: string) => {
    setSwitching(true);
    setDemoDropdownOpen(false);
    await switchDemoUser(email);
    setSwitching(false);
  };

  const getScopeBadgeColor = (scope: string) => {
    switch (scope) {
      case 'GLOBAL': return 'bg-violet-50 text-violet-800 border-violet-200';
      case 'STATE': return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'DIVISION': return 'bg-cyan-50 text-cyan-800 border-cyan-200';
      case 'SALES_AREA': return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'OUTLET': return 'bg-amber-50 text-amber-800 border-amber-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <header className="sticky top-0 z-30 min-h-[64px] bg-white/95 backdrop-blur-md border-b-2 border-[#F47721] px-4 sm:px-6 py-2 shadow-[0_6px_22px_rgba(17,43,73,0.08)]">
      <div className="flex items-center justify-between gap-4">
        {/* Left branding */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            onClick={onToggleMobileSidebar}
            className="p-2 text-[#526477] hover:text-[#17365D] rounded-lg hover:bg-[#F1F5F9] lg:hidden"
            aria-label="Toggle Navigation Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4">
            <img
              src="/indianoil-logo.svg"
              alt="IndianOil"
              className="h-9 sm:h-10 w-auto object-contain shrink-0"
            />
            <div>
              <div className="flex items-center gap-1.5 font-bold text-[#17365D] tracking-wide text-sm sm:text-base">
                IOCL <span className="text-[#D86514]">Digital Outlet Manager</span>
              </div>
              <div className="text-[11px] text-[#64748B] hidden sm:block">
                Indian Oil Corporation Limited • Enterprise Gateway
              </div>
            </div>
          </div>
        </div>

        {/* Center / Right Scope & User info */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {/* Global Active Outlet Selector */}
          <GlobalOutletSelector />

          {/* Active Scope Badge */}
          <div className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium border ${getScopeBadgeColor(userCtx.primaryScope)}`}>
            <MapPin className="w-3.5 h-3.5 opacity-70" />
            <span>SCOPE: {userCtx.primaryScope}</span>
          </div>

          {/* Demo User Switcher Dropdown (Development Only) */}
          {import.meta.env.DEV && (
            <div className="relative">
              <button
                onClick={() => setDemoDropdownOpen(!demoDropdownOpen)}
                disabled={switching}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] text-xs font-medium text-[#17365D] transition-colors"
                title="Quickly test different roles & scope boundaries"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-orange-400 ${switching ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Role Switcher</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {demoDropdownOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-xl bg-white border border-[#E2E8F0] shadow-xl py-1.5 z-50 text-xs">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-[#64748B] uppercase tracking-wider border-b border-[#E2E8F0] mb-1">
                    Test Role & Scope Switching
                  </div>
                  {demoAccounts.map(acc => (
                    <button
                      key={acc.email}
                      onClick={() => handleSwitch(acc.email)}
                      className={`w-full text-left px-3 py-2 hover:bg-slate-700/70 flex items-center justify-between transition-colors ${userCtx.user.email === acc.email ? 'bg-orange-50 text-[#B8530D] font-semibold' : 'text-[#17365D]'}`}
                    >
                      <div>
                        <div className="font-medium">{acc.label}</div>
                        <div className="text-[10px] text-[#64748B]">{acc.email}</div>
                      </div>
                      {userCtx.user.email === acc.email && (
                        <span className="w-2 h-2 rounded-full bg-orange-500" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Active User Badge & Logout */}
          <div className="flex items-center gap-2 pl-2 border-l border-[#E2E8F0]">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-semibold text-[#17365D]">{userCtx.user.name}</div>
              <div className="text-[10px] text-[#B8530D]">
                {userCtx.roles.join(', ')}
              </div>
            </div>

            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#17365D] to-[#275B84] border border-[#17365D] flex items-center justify-center text-white font-bold text-xs">
              {userCtx.user.name.charAt(0)}
            </div>

            <button
              onClick={logout}
              className="p-2 text-[#64748B] hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
