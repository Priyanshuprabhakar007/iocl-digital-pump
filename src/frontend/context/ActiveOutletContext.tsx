import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { RetailOutlet } from '../../shared/types';
import { apiFetch } from '../services/api';
import { useAuth } from './AuthContext';
import { Building2 } from 'lucide-react';

const ACTIVE_OUTLET_STORAGE_KEY = 'iocl_active_outlet_id';

interface ActiveOutletContextType {
  activeOutletId: string | null;
  activeOutlet: RetailOutlet | null;
  accessibleOutlets: RetailOutlet[];
  setActiveOutletId: (outletId: string) => void;
  refreshAccessibleOutlets: () => Promise<void>;
  loading: boolean;
  outletLoadError: string | null;
  archivedNotice: string | null;
  clearArchivedNotice: () => void;
}

const ActiveOutletContext = createContext<ActiveOutletContextType | undefined>(undefined);

export const ActiveOutletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userCtx, logout } = useAuth();
  const [accessibleOutlets, setAccessibleOutlets] = useState<RetailOutlet[]>([]);
  const [activeOutletIdState, setActiveOutletIdState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        return sessionStorage.getItem(ACTIVE_OUTLET_STORAGE_KEY);
      } catch {}
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
  const [outletLoadError, setOutletLoadError] = useState<string | null>(null);
  const [archivedNotice, setArchivedNotice] = useState<string | null>(null);

  const setActiveOutletId = useCallback((id: string) => {
    setActiveOutletIdState(id);
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(ACTIVE_OUTLET_STORAGE_KEY, id);
      } catch {}
    }
  }, []);

  const refreshAccessibleOutlets = useCallback(async () => {
    setOutletLoadError(null);
    if (!userCtx) {
      setAccessibleOutlets([]);
      setActiveOutletIdState(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch<RetailOutlet[]>('/api/v1/outlets');
      if (!res.success || !Array.isArray(res.data)) {
        setAccessibleOutlets([]);
        setActiveOutletIdState(null);
        setOutletLoadError(res.error?.message || 'Unable to retrieve accessible outlets.');
        return;
      }
      const activeOnly = res.data.filter((o) => o.status === 'ACTIVE');
      setAccessibleOutlets(activeOnly);
      if (activeOnly.length === 0) {
        setActiveOutletIdState(null);
        try { sessionStorage.removeItem(ACTIVE_OUTLET_STORAGE_KEY); } catch {}
      } else {
        let currentSaved: string | null = null;
        try { currentSaved = sessionStorage.getItem(ACTIVE_OUTLET_STORAGE_KEY); } catch {}
        const targetId = currentSaved || activeOutletIdState;
        const match = activeOnly.find((o) => o.id === targetId);
        setActiveOutletId((match || activeOnly[0]).id);
      }
    } catch {
      setAccessibleOutlets([]);
      setActiveOutletIdState(null);
      setOutletLoadError('Unable to retrieve accessible outlets. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [userCtx, activeOutletIdState, setActiveOutletId]);

  useEffect(() => {
    if (userCtx) {
      refreshAccessibleOutlets();
    } else {
      setAccessibleOutlets([]);
      setActiveOutletIdState(null);
      setOutletLoadError(null);
      setLoading(false);
    }
  }, [userCtx]);

  useEffect(() => {
    const handleOutletArchivedEvent = async (e: Event) => {
      const res = await apiFetch<RetailOutlet[]>('/api/v1/outlets');
      if (res.success && res.data) {
        const remainingActive = res.data.filter((o) => o.status === 'ACTIVE');
        if (remainingActive.length === 0) {
          logout();
        } else {
          setAccessibleOutlets(remainingActive);
          const nextOutlet = remainingActive[0];
          setActiveOutletId(nextOutlet.id);
          setArchivedNotice(
            `Selected outlet was archived. Switched to active outlet ${nextOutlet.name} (${nextOutlet.roCode}).`
          );
        }
      } else {
        logout();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('iocl:outlet-archived', handleOutletArchivedEvent);
      return () => window.removeEventListener('iocl:outlet-archived', handleOutletArchivedEvent);
    }
  }, [logout, setActiveOutletId]);

  const activeOutlet =
    accessibleOutlets.find((o) => o.id === activeOutletIdState) || null;

  return (
    <ActiveOutletContext.Provider
      value={{
        activeOutletId: activeOutletIdState,
        activeOutlet,
        accessibleOutlets,
        setActiveOutletId,
        refreshAccessibleOutlets,
        loading,
        outletLoadError,
        archivedNotice,
        clearArchivedNotice: () => setArchivedNotice(null),
      }}
    >
      {children}
    </ActiveOutletContext.Provider>
  );
};

export const useActiveOutlet = () => {
  const context = useContext(ActiveOutletContext);
  if (!context) {
    throw new Error('useActiveOutlet must be used within an ActiveOutletProvider');
  }
  return context;
};

export const GlobalOutletSelector: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { activeOutletId, accessibleOutlets, setActiveOutletId, loading, outletLoadError } = useActiveOutlet();
  if(loading)return <span role="status" className="text-xs text-slate-600">Loading outlets…</span>;
  if(outletLoadError)return <span role="status" className="text-xs text-red-800">Outlet selection unavailable</span>;

  if (accessibleOutlets.length <= 1) {
    if (accessibleOutlets.length === 1) {
      return (
        <div className={`flex items-center gap-2 px-3 py-1.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs font-semibold text-[#17365D] ${className}`}>
          <Building2 className="w-3.5 h-3.5 text-[#D86514] shrink-0" />
          <span className="truncate">{accessibleOutlets[0].name} ({accessibleOutlets[0].roCode})</span>
        </div>
      );
    }
    return null;
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Building2 className="w-3.5 h-3.5 text-[#D86514] shrink-0" />
      <select
        aria-label="Active retail outlet"
        value={activeOutletId || ''}
        onChange={(e) => setActiveOutletId(e.target.value)}
        disabled={loading}
        className="min-w-0 w-full bg-[#F8FAFC] border border-[#D7E0EA] hover:border-[#F47721] text-[#17365D] text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500 transition-all font-mono"
      >
        {accessibleOutlets.map((outlet) => (
          <option key={outlet.id} value={outlet.id}>
            {outlet.name} ({outlet.roCode})
          </option>
        ))}
      </select>
    </div>
  );
};
