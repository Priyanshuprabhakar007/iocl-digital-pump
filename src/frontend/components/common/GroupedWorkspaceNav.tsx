import React from 'react';

export type WorkspaceItem<T extends string> = { id:T; label:string; icon?:React.ComponentType<{className?:string}>; testId?:string };
export type WorkspaceGroup<T extends string> = { id:string; label:string; items:WorkspaceItem<T>[] };

/** Grouping is presentation only: callers retain their existing permission gates and tab handlers. */
export function GroupedWorkspaceNav<T extends string>({label, groups, active, onChange, disabled=false}:{
  label:string; groups:WorkspaceGroup<T>[]; active:T; onChange:(id:T)=>void; disabled?:boolean;
}) {
  const visible=groups.filter(group=>group.items.length>0);
  const selected=visible.find(group=>group.items.some(item=>item.id===active));
  return <nav aria-label={label} className="rounded-xl border border-[#D7E0EA] bg-white overflow-hidden">
    <div role="group" aria-label="Work areas" className="flex flex-wrap gap-1.5 p-2 bg-[#F1F5F9] border-b border-[#D7E0EA]">
      {visible.map(group=><button key={group.id} type="button" aria-pressed={selected?.id===group.id} disabled={disabled}
        onClick={()=>{if(selected?.id!==group.id)onChange(group.items[0].id);}}
        className={'rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[#2354C6] disabled:opacity-50 '+(selected?.id===group.id?'bg-[#17365D] text-white':'text-[#334155] hover:bg-white')}>
        {group.label}
      </button>)}
    </div>
    {selected&&<div role="group" aria-label={selected.label+' tasks'} className="flex flex-wrap items-center gap-1.5 px-2 py-2">
      {selected.items.map(item=>{const Icon=item.icon;return <button key={item.id} type="button" data-testid={item.testId} aria-pressed={active===item.id}
        disabled={disabled} onClick={()=>{if(active!==item.id)onChange(item.id);}}
        className={'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs sm:text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[#2354C6] disabled:opacity-50 '+(active===item.id?'bg-[#FFF4E8] border-[#F47721] text-[#9A4310]':'border-transparent text-[#475569] hover:bg-[#F1F5F9]')}>
        {Icon&&<Icon className="h-4 w-4 shrink-0"/>}{item.label}
      </button>;})}
    </div>}
  </nav>;
}
