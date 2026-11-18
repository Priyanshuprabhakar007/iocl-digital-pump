import React, { createContext, useCallback, useContext, useState } from 'react';
import { useActiveOutlet } from './ActiveOutletContext';
import type { WorkbenchSelection, WorkbenchPage } from '../utils/shiftWorkbench';

type WorkbenchContext = {
  selection: WorkbenchSelection | null;
  remember: (selection: WorkbenchSelection) => void;
  navigate: (page: WorkbenchPage) => void;
};
const Context = createContext<WorkbenchContext | null>(null);
export const ShiftWorkbenchProvider: React.FC<{children:React.ReactNode; onNavigate:(page:string)=>void}> = ({children,onNavigate}) => {
  const {activeOutletId} = useActiveOutlet();
  const [saved,setSaved] = useState<Record<string,WorkbenchSelection>>({});
  const remember = useCallback((next:WorkbenchSelection) => {
    if (next.outletId !== activeOutletId) return;
    setSaved(prev=>{
      const old=prev[next.outletId];
      if(old?.businessDate===next.businessDate && old?.shiftId===next.shiftId)return prev;
      return {...prev,[next.outletId]:next};
    });
  },[activeOutletId]);
  return <Context.Provider value={{selection:activeOutletId?saved[activeOutletId]||null:null,remember,navigate:onNavigate}}>{children}</Context.Provider>;
};
export function useShiftWorkbench() {
  const value=useContext(Context);
  if(!value)throw new Error('ShiftWorkbenchProvider is required');
  return value;
}
