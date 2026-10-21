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
    if (!userCtx) {
      setAccessibleOutlets([]);
      setActiveOutletIdState(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const res = await apiFetch<RetailOutlet[]>('/api/v1/outlets');
    if (res.success && res.data) {
      const activeOnly = res.data.filter((o) => o.status === 'ACTIVE');
      setAccessibleOutlets(activeOnly);

      if (activeOnly.length === 0) {
        setActiveOutletIdState(null);
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(ACTIVE_OUTLET_STORAGE_KEY);
        }
      } else {
        const currentSaved =
          typeof window !== 'undefined'
            ? sessionStorage.getItem(ACTIVE_OUTLET_STORAGE_KEY)
            : null;
        const targetId = activeOutletIdState || currentSaved;
        const match = activeOnly.find((o) => o.id === targetId);

        if (match) {
          setActiveOutletId(match.id);
        } else {
          setActiveOutletId(activeOnly[0].id);
        }
      }
    } else {
      if (res.error?.code === 'OUTLET_ARCHIVED') {
        setAccessibleOutlets([]);
        setActiveOutletIdState(null);
      }
    }
    setLoading(false);
  }, [userCtx, activeOutletIdState, setActiveOutletId]);

  useEffect(() => {
    if (userCtx) {
      refreshAccessibleOutlets();
    } else {
      setAccessibleOutlets([]);
      setActiveOutletIdState(null);
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
  const { activeOutletId, accessibleOutlets, setActiveOutletId, loading } = useActiveOutlet();

  if (accessibleOutlets.length <= 1) {
    if (accessibleOutlets.length === 1) {
      return (
        <div className={`flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 border border-slate-700/80 rounded-lg text-xs font-semibold text-slate-200 ${className}`}>
          <Building2 className="w-3.5 h-3.5 text-orange-400 shrink-0" />
          <span className="truncate">{accessibleOutlets[0].name} ({accessibleOutlets[0].roCode})</span>
        </div>
      );
    }
    return null;
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Building2 className="w-3.5 h-3.5 text-orange-400 shrink-0" />
      <select
        value={activeOutletId || ''}
        onChange={(e) => setActiveOutletId(e.target.value)}
        disabled={loading}
        className="bg-slate-800/90 border border-slate-700 hover:border-orange-500/50 text-slate-200 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500 transition-all font-mono"
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
