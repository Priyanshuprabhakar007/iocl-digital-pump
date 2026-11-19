import React,{useEffect,useState} from 'react';
import {apiFetch} from '../../services/api';
import type {State,Division,SalesArea} from '../../../shared/types';
import type {DealerDraftRow} from '../../../shared/dealerMasterDraft';
import {classifyDealerSite} from '../../../shared/dealerMasterImport';
import type {PendingSetupRecord,PendingSetupValues} from '../../../shared/dealerMasterPendingSetup';

type Props={
  draftId:string;row:DealerDraftRow;saved?:PendingSetupRecord;
  onSaved:(value:PendingSetupRecord)=>void;onClose:()=>void;
};
export function DealerPendingSetupEditor({draftId,row,saved,onSaved,onClose}:Props){
  const source=row.fields;
  const [form,setForm]=useState<PendingSetupValues>(()=>saved?.values||{
    name:source['CUSTOMER  NAME (NAME OF  RO)']||'',
    outletType:classifyDealerSite(source['PRICE GROUP DESCRIPTION(SITE)']||'')||'',
    address:source.ADDRESS||'',district:source.DISTRICT||'',
    stateId:'',divisionId:'',salesAreaId:'',
    city:row.city||'',pincode:row.pincode||'',
  });
  const [states,setStates]=useState<State[]>([]);
  const [divisions,setDivisions]=useState<Division[]>([]);
  const [areas,setAreas]=useState<SalesArea[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [loadingHierarchy,setLoadingHierarchy]=useState(false);

  useEffect(()=>{
    let alive=true;
    void apiFetch<State[]>('/api/v1/hierarchy/states').then(res=>{
      if(alive&&res.success&&res.data)setStates(res.data.filter(x=>x.status==='ACTIVE'));
    }).catch(()=>{if(alive)setError('State Office list could not be loaded. You may save other fields without it.');});
    return ()=>{alive=false;};
  },[]);
  useEffect(()=>{
    if(!form.stateId){setDivisions([]);return;}
    let alive=true;setLoadingHierarchy(true);
    void apiFetch<Division[]>('/api/v1/hierarchy/divisions?stateId='+encodeURIComponent(form.stateId))
      .then(res=>{if(alive)setDivisions(res.success&&res.data?res.data.filter(x=>x.status==='ACTIVE'):[]);})
      .finally(()=>{if(alive)setLoadingHierarchy(false);});
    return ()=>{alive=false;};
  },[form.stateId]);
  useEffect(()=>{
    if(!form.divisionId){setAreas([]);return;}
    let alive=true;setLoadingHierarchy(true);
    void apiFetch<SalesArea[]>('/api/v1/hierarchy/sales-areas?divisionId='+encodeURIComponent(form.divisionId))
      .then(res=>{if(alive)setAreas(res.success&&res.data?res.data.filter(x=>x.status==='ACTIVE'):[]);})
      .finally(()=>{if(alive)setLoadingHierarchy(false);});
    return ()=>{alive=false;};
  },[form.divisionId]);

  function update<K extends keyof PendingSetupValues>(key:K,value:PendingSetupValues[K]){
    setForm(prev=>({...prev,[key]:value}));
  }
  async function save(){
    if(busy)return;
    setBusy(true);setError('');
    try{
      if(!form.name.trim()||!form.address.trim()||!form.district.trim())
        throw Error('Outlet name, address and district are required. City/PIN may remain blank.');
      if(form.pincode.trim()&&!/^\d{6}$/.test(form.pincode.trim()))
        throw Error('If entered, PIN must contain exactly six digits.');
      const response=await apiFetch<PendingSetupRecord>(
        '/api/v1/outlets/dealer-master/drafts/'+encodeURIComponent(draftId)+
        '/pending-setup/'+encodeURIComponent(row.roCode),{
          method:'PUT',body:JSON.stringify({values:form,expectedRevision:saved?.revision||0}),
        });
      if(!response.success||!response.data)
        throw Error(response.error?.message||'Unable to save pending setup.');
      onSaved(response.data);
    }catch(e){setError(e instanceof Error?e.message:'Unable to save pending setup.');}
    finally{setBusy(false);}
  }
  const fieldClass='w-full bg-white rounded-lg border border-slate-300 px-3 py-2 text-xs text-[#17365D]';
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60" role="presentation">
    <section role="dialog" aria-modal="true" aria-label="Edit Pending Setup"
      className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl space-y-4">
      <div className="flex justify-between items-start gap-2">
        <div>
          <h2 className="text-lg font-bold text-[#17365D]">Edit Pending Setup</h2>
          <p className="text-xs text-slate-600 mt-1">RO Code {row.roCode} · Saved source has 26 original fields</p>
        </div>
        <button type="button" onClick={onClose} disabled={busy}
          className="px-2 py-1 text-xs rounded-md border">Close</button>
      </div>
      <p className="text-xs text-slate-600 border rounded-lg bg-slate-50 p-3">
        Save what you know now. City and PIN are optional and can be updated whenever required.
        Missing organizational hierarchy may also remain pending.
        This is a separate editable setup record, not an active outlet or signed lease.
      </p>
      {error&&<p role="alert" className="text-xs text-red-700 border border-red-200 p-2 rounded-lg">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <label className="sm:col-span-2">Outlet Name *
          <input className={fieldClass} value={form.name} onChange={e=>update('name',e.target.value)}/>
        </label>
        <label>Outlet Type
          <select className={fieldClass} value={form.outletType} onChange={e=>update('outletType',e.target.value as PendingSetupValues['outletType'])}>
            <option value="">Pending verification</option>
            <option value="COCO">COCO</option><option value="CODO">CODO</option><option value="A_SITE">A-Site</option>
          </select>
        </label>
        <label>District *
          <input className={fieldClass} value={form.district} onChange={e=>update('district',e.target.value)}/>
        </label>
        <label className="sm:col-span-2">Address *
          <input className={fieldClass} value={form.address} onChange={e=>update('address',e.target.value)}/>
        </label>
        <label>State Office (optional until setup)
          <select className={fieldClass} value={form.stateId} onChange={e=>setForm(prev=>({...prev,stateId:e.target.value,divisionId:'',salesAreaId:''}))}>
            <option value="">Choose later</option>
            {states.map(x=><option key={x.id} value={x.id}>{x.name} ({x.code})</option>)}
          </select>
        </label>
        <label>Division Office (optional)
          <select className={fieldClass} value={form.divisionId} disabled={!form.stateId||loadingHierarchy}
            onChange={e=>setForm(prev=>({...prev,divisionId:e.target.value,salesAreaId:''}))}>
            <option value="">Choose later</option>
            {divisions.map(x=><option key={x.id} value={x.id}>{x.name} ({x.code})</option>)}
          </select>
        </label>
        <label>Sales Area (optional)
          <select className={fieldClass} value={form.salesAreaId} disabled={!form.divisionId||loadingHierarchy}
            onChange={e=>update('salesAreaId',e.target.value)}>
            <option value="">Choose later</option>
            {areas.map(x=><option key={x.id} value={x.id}>{x.name} ({x.code})</option>)}
          </select>
        </label>
        <div className="text-xs rounded-lg bg-amber-50 border border-amber-200 p-2 text-amber-900">
          If Division or Sales Area is unavailable, leave it blank. No fake hierarchy IDs will be saved.
        </div>
        <label>City (can add later)
          <input className={fieldClass} placeholder="Leave blank for now" value={form.city}
            onChange={e=>update('city',e.target.value)}/>
        </label>
        <label>PIN Code (can add later)
          <input className={fieldClass} inputMode="numeric" maxLength={6} placeholder="Leave blank for now"
            value={form.pincode} onChange={e=>update('pincode',e.target.value)}/>
        </label>
      </div>
      <details className="text-xs border rounded-lg p-3">
        <summary className="cursor-pointer font-semibold text-[#17365D]">View all 26 original Excel fields (read only)</summary>
        <dl className="grid grid-cols-1 gap-2 mt-3">
          {Object.entries(source).map(([key,value])=><div key={key} className="grid grid-cols-2 gap-2 border-b pb-1">
            <dt className="font-semibold">{key}</dt><dd className="break-words">{value||'—'}</dd>
          </div>)}
        </dl>
      </details>
      <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
        <button type="button" disabled={busy} onClick={onClose}
          className="px-4 py-2 text-xs font-semibold border rounded-lg">Cancel</button>
        <button type="button" disabled={busy} onClick={()=>void save()}
          className="px-4 py-2 bg-[#17365D] text-white text-xs font-bold rounded-lg disabled:opacity-50">
          {busy?'Saving…':'Save Pending Setup'}
        </button>
      </div>
    </section>
  </div>;
}
