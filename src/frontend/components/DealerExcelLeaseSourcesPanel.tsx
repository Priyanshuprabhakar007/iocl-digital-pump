import React,{useEffect,useMemo,useState} from 'react';
import {useAuth} from '../context/AuthContext';
import {apiFetch} from '../services/api';
import type {DealerDraftContents,DealerDraftMeta,DealerDraftRow} from '../../shared/dealerMasterDraft';
import {dealerMasterFieldCatalog} from '../../shared/dealerMasterFieldCoverage';
import {PERMISSIONS} from '../../shared/constants';
import type {RetailOutlet} from '../../shared/types';

type Props={
  outlets:RetailOutlet[];activeOutletId:string;
  onChooseOutlet:(outletId:string)=>void;
  onSourceLoaded:(rows:DealerDraftRow[])=>void;
};

/** Read-only link by immutable RO Code. Does not create legal agreements or rent transactions. */
export function DealerExcelLeaseSourcesPanel({outlets,activeOutletId,onChooseOutlet,onSourceLoaded}:Props){
  const {userCtx,hasPermission}=useAuth();
  const allowed=Boolean(userCtx?.isGlobalScope&&hasPermission(PERMISSIONS.OUTLETS_READ)&&
    hasPermission(PERMISSIONS.DOCUMENTS_READ));
  const [history,setHistory]=useState<DealerDraftMeta[]>([]);
  const [draftId,setDraftId]=useState('');
  const [rows,setRows]=useState<DealerDraftRow[]>([]);
  const [query,setQuery]=useState('');
  const [selectedCode,setSelectedCode]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  const liveByCode=useMemo(()=>new Map(outlets.map(o=>[o.roCode.trim(),o])),[outlets]);
  const current=rows.find(row=>row.roCode===selectedCode)||rows.find(row=>
    row.roCode===outlets.find(o=>o.id===activeOutletId)?.roCode)||rows[0]||null;
  const matches=rows.filter(row=>!query.trim()||
    [row.roCode,row.fields['CUSTOMER  NAME (NAME OF  RO)'],row.fields['ORDER NO.'],row.fields.DISTRICT]
    .some(value=>(value||'').toLowerCase().includes(query.trim().toLowerCase())));
  const linked=current?liveByCode.get(current.roCode):undefined;

  async function loadDraft(id:string){
    setLoading(true);setError('');
    try{
      const response=await apiFetch<{contents:DealerDraftContents}>(
        '/api/v1/outlets/dealer-master/drafts/'+encodeURIComponent(id),{cache:'no-store'});
      if(!response.success||!response.data||
        response.data.contents.schemaVersion!==1||
        response.data.contents.businessColumns.length!==26||
        !Array.isArray(response.data.contents.rows))
        throw Error(response.error?.message||'The source file could not be verified.');
      const source=response.data.contents.rows;
      setDraftId(id);setRows(source);onSourceLoaded(source);
      setSelectedCode(prev=>source.some(row=>row.roCode===prev)?prev:source[0]?.roCode||'');
    }catch(e){
      setRows([]);onSourceLoaded([]);
      setError(e instanceof Error?e.message:'Could not retrieve the saved Excel source.');
    }finally{setLoading(false);}
  }
  async function refresh(){
    if(!allowed)return;
    setLoading(true);setError('');
    try{
      const response=await apiFetch<DealerDraftMeta[]>(
        '/api/v1/outlets/dealer-master/drafts',{cache:'no-store'});
      if(!response.success||!Array.isArray(response.data))
        throw Error(response.error?.message||'Saved Excel drafts are unavailable.');
      setHistory(response.data);
      const id=response.data.find(d=>d.id===draftId)?.id||response.data[0]?.id;
      if(id)await loadDraft(id);
      else{setRows([]);onSourceLoaded([]);}
    }catch(e){
      setError(e instanceof Error?e.message:'Could not retrieve the source list.');
      setRows([]);onSourceLoaded([]);
    }finally{setLoading(false);}
  }
  useEffect(()=>{if(allowed)void refresh();},[allowed]);

  if(!allowed)return null;
  const sections=[
    ['OUTLET','Retail Outlet Master'],
    ['ORGANIZATION','Organizational Source'],
    ['LAND','Land Details from Excel'],
    ['LEASE','Lease & Agreement Source from Excel'],
  ] as const;
  return <section className="bg-white rounded-xl p-5 border border-[#D7E0EA] space-y-4"
    data-testid="dealer-excel-lease-sources" aria-label="Excel source linked to lease and agreement">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-lg font-bold text-[#17365D]">Imported Excel · Outlet, Land &amp; Lease Details</h3>
        <p className="text-xs text-slate-600 mt-1">Automatic RO Code linkage to the saved 26-column Dealer Master.
          All source values remain available, even where City/PIN and hierarchy are pending.</p>
      </div>
      <button type="button" disabled={loading} onClick={()=>void refresh()}
        className="text-xs border px-3 py-2 rounded-lg bg-white font-semibold disabled:opacity-50">Refresh Excel Source</button>
    </div>
    <p className="text-xs border border-amber-200 rounded-lg bg-amber-50 p-3 text-amber-900">
      Source evidence only: these are not signed agreements, approved land titles, active leases or rent transactions.
      An outlet becomes operational only through verified registration. Existing signed agreements are never overwritten.
    </p>
    {error&&<p className="text-xs text-red-700" role="alert">{error}</p>}
    {history.length>0&&<div className="flex flex-wrap items-center gap-2 text-xs">
      <label htmlFor="dealer-lease-draft">Saved Excel</label>
      <select id="dealer-lease-draft" value={draftId} disabled={loading}
        onChange={e=>void loadDraft(e.target.value)} className="max-w-full border rounded-lg px-2 py-2 bg-white">
        {history.map(d=><option value={d.id} key={d.id}>{d.fileName} · {d.rowCount} rows</option>)}
      </select>
      <span className="text-slate-500">{rows.length} source ROs</span>
    </div>}
    {rows.length>0&&<>
      <label className="block text-xs text-slate-700 font-semibold">
        Search any RO Code, outlet name, district or order reference
        <input value={query} onChange={e=>setQuery(e.target.value)}
          className="block mt-1 border px-3 py-2 rounded-lg w-full" placeholder="Search imported ROs"/>
      </label>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(210px,1fr)_minmax(0,2fr)] gap-4">
        <div className="border rounded-lg max-h-[390px] overflow-auto">
          {matches.map(row=><button key={row.roCode} type="button"
            onClick={()=>setSelectedCode(row.roCode)}
            className={'w-full text-left p-3 text-xs border-b hover:bg-blue-50 '+
              (current?.roCode===row.roCode?'bg-blue-50 text-blue-900':'text-slate-700')}>
            <span className="font-bold">{row.roCode}</span>
            <span className="block truncate">{row.fields['CUSTOMER  NAME (NAME OF  RO)']}</span>
            <span className="text-[11px] text-slate-500">{liveByCode.has(row.roCode)?'Registered RO':'Pending Setup'}</span>
          </button>)}
          {!matches.length&&<p className="p-3 text-xs text-slate-500">No matching source RO.</p>}
        </div>
        <div className="space-y-3 min-w-0">
          {current&&<>
            <div className="flex justify-between flex-wrap gap-2 items-center">
              <div className="text-xs">
                <strong>{current.roCode}</strong> · {current.fields['CUSTOMER  NAME (NAME OF  RO)']}
                <p className="text-slate-500 mt-1">{linked?'Linked to registered outlet':'Pending Setup · Not an operational outlet yet'}</p>
              </div>
              {linked&&<button type="button" className="px-3 py-2 text-xs bg-[#17365D] text-white rounded-lg"
                onClick={()=>onChooseOutlet(linked.id)}
                aria-label={'View registered agreements for RO '+linked.roCode}>
                View Registered Agreements</button>}
            </div>
            {sections.map(([type,title])=><div key={type} className="border rounded-xl overflow-hidden">
              <h4 className="font-semibold text-xs text-[#17365D] bg-slate-100 px-3 py-2">{title}</h4>
              <dl className="divide-y text-xs">
                {dealerMasterFieldCatalog.filter(f=>f.destination===type).map(field=><div key={field.header}
                  className="grid grid-cols-[minmax(110px,1fr)_minmax(0,1.3fr)] gap-2 px-3 py-2">
                  <dt className="font-semibold text-slate-600 break-words">{field.header}</dt>
                  <dd className="text-slate-900 break-words">{current.fields[field.header]||'—'}</dd>
                </div>)}
              </dl>
            </div>)}
          </>}
        </div>
      </div>
    </>}
    {!loading&&!error&&!history.length&&<p className="text-xs text-slate-500">
      No saved source found for this global admin. Save the original 26-column file in Retail Outlets first.
    </p>}
  </section>;
}
