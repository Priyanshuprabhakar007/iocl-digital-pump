import React, {useCallback,useEffect,useState} from 'react';
import {apiFetch} from '../services/api';
import {useAuth} from '../context/AuthContext';
import {PERMISSIONS} from '../../shared/constants';

type Source={
  id:string;outletId:string;sourceKey:string;orderNumber:string|null;
  startDate:string|null;endDate:string|null;rentMonthlySource:string|null;
  gstChargesSource:string|null;durationYearsSource:string|null;durationMonthsSource:string|null;
  escalationSource:string|null;escalationIntervalYearsSource:string|null;
  remarksSource:string|null;linkedAgreementId:string|null;
};
type ExistingAgreement={id:string;agreementName:string;agreementNumber:string|null;
  startDate:string|null;endDate:string|null;agreementDocumentId:string|null};
type Extension={
  land?:{landStatus?:string|null;landOwner?:string|null;sourceArea?:string|null;sourceAreaUnit?:string|null}|null;
  leaseSources:Source[];existingLandLeaseAgreements:ExistingAgreement[];
};
const normalized=(x:string|null|undefined)=>(x||'').trim().toUpperCase();
function candidatesFor(source:Source,agreements:ExistingAgreement[]){
  return agreements.filter(a=>Boolean(a.agreementDocumentId)&&(
    Boolean(source.orderNumber&&a.agreementNumber&&normalized(source.orderNumber)===normalized(a.agreementNumber)) ||
    Boolean(source.startDate&&source.endDate&&a.startDate===source.startDate&&a.endDate===source.endDate)
  )&&(!source.orderNumber||!a.agreementNumber||normalized(source.orderNumber)===normalized(a.agreementNumber))
    &&(!source.startDate||!a.startDate||source.startDate===a.startDate)
    &&(!source.endDate||!a.endDate||source.endDate===a.endDate));
}
export function DealerLeaseSourceReviewPanel({outletId,revision=0}:{outletId:string;revision?:number}){
  const {userCtx,hasPermission}=useAuth();
  const [data,setData]=useState<Extension|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [selected,setSelected]=useState<Record<string,string>>({});
  const [confirmed,setConfirmed]=useState<Record<string,boolean>>({});
  const [busy,setBusy]=useState(false);
  const canLink=Boolean(userCtx?.isGlobalScope&&hasPermission(PERMISSIONS.DOCUMENTS_WRITE));
  const refresh=useCallback(async()=>{
    if(!outletId)return;
    setLoading(true);setError('');
    try{
      const response=await apiFetch<Extension>('/api/v1/outlets/'+encodeURIComponent(outletId)+'/dealer-master-extension');
      if(!response.success||!response.data)throw Error(response.error?.message||'Lease source records unavailable');
      setData(response.data);
    }catch(e){setData(null);setError(e instanceof Error?e.message:'Could not retrieve lease source records');}
    finally{setLoading(false);}
  },[outletId]);
  useEffect(()=>{void refresh();},[refresh,revision]);
  async function linkSource(sourceId:string){
    const agreementId=selected[sourceId];
    if(!agreementId||!confirmed[sourceId]||busy||!canLink)return;
    setBusy(true);setError('');setNotice('');
    try{
      const url='/api/v1/outlets/'+encodeURIComponent(outletId)+'/dealer-master-extension/lease-sources/'+encodeURIComponent(sourceId)+'/link';
      const response=await apiFetch(url,{method:'POST',body:JSON.stringify({agreementId,confirmedSourceAndDocument:true})});
      if(!response.success)throw Error(response.error?.message||'Signed-agreement linkage rejected');
      setNotice('Existing signed agreement linked after verification; canonical lease/rent values were not modified.');
      setConfirmed({});setSelected({});await refresh();
    }catch(e){setError(e instanceof Error?e.message:'Lease verification failed');}
    finally{setBusy(false);}
  }
  return <section className='rounded-xl border border-[#D7E0EA] bg-white p-4 space-y-3' data-testid='dealer-lease-source-review'>
    <div className='flex flex-wrap items-center justify-between gap-2'>
      <div><h4 className='font-bold text-[#17365D]'>Dealer Master Land / Lease Source Review</h4>
      <p className='text-xs text-slate-600 mt-1'>Evidence copied from the Excel import. These are NOT signed legal agreements or rent-ledger entries.</p></div>
      <button type='button' onClick={()=>void refresh()} disabled={busy||loading} className='text-xs border rounded-lg px-3 py-2'>Refresh</button>
    </div>
    {loading&&<p className='text-xs text-slate-500'>Loading outlet-linked sources…</p>}
    {error&&<p role='alert' className='text-xs p-2 rounded-lg bg-amber-50 text-amber-900'>{error}</p>}
    {notice&&<p role='status' className='text-xs p-2 rounded-lg bg-green-50 text-green-800'>{notice}</p>}
    {data?.land&&<div className='bg-slate-50 rounded-lg p-3 text-xs text-slate-700'>
      <strong>Source land record:</strong> {data.land.landStatus||'Status not recorded'} ·
      <strong> Owner (unverified):</strong> {data.land.landOwner||'Not recorded'} ·
      <strong> Area:</strong> {[data.land.sourceArea,data.land.sourceAreaUnit].filter(Boolean).join(' ')||'Not recorded'}
    </div>}
    {data&&data.leaseSources.length===0&&<p className='text-xs text-slate-500'>No dealer-master lease source candidates recorded for this outlet.</p>}
    {data?.leaseSources.map(source=>{
      const matches=candidatesFor(source,data.existingLandLeaseAgreements);
      const linked=data.existingLandLeaseAgreements.find(a=>a.id===source.linkedAgreementId);
      return <div key={source.id} className='border border-slate-200 rounded-xl p-3 space-y-2'>
        <div className='flex flex-wrap items-start justify-between gap-2'>
          <div className='text-xs space-y-1'>
            <p><strong>Order:</strong> {source.orderNumber||'Not recorded'} · <strong>Period:</strong> {source.startDate||'Unknown'} to {source.endDate||'Unknown'}</p>
            <p><strong>Monthly rent (source):</strong> {source.rentMonthlySource||'Unknown'} · <strong>GST:</strong> {source.gstChargesSource||'Unknown'}</p>
            <p><strong>Duration:</strong> {source.durationYearsSource||'—'} yr / {source.durationMonthsSource||'—'} mo · <strong>Escalation:</strong> {source.escalationSource||'—'} every {source.escalationIntervalYearsSource||'—'} years</p>
            {source.remarksSource&&<p><strong>Excel remarks:</strong> {source.remarksSource}</p>}
          </div>
          <span className={'text-xs font-semibold '+(linked?'text-green-700':'text-amber-700')}>
            {linked?'Linked: '+(linked.agreementNumber||linked.agreementName):'Needs agreement verification'}
          </span>
        </div>
        {!source.linkedAgreementId&&canLink&&<div className='border-t pt-2 space-y-2'>
          <label className='text-xs block'>Select existing signed same-outlet agreement
            <select className='mt-1 w-full border rounded-lg p-2' value={selected[source.id]||''}
              onChange={e=>{setSelected(x=>({...x,[source.id]:e.target.value}));setConfirmed(x=>({...x,[source.id]:false}));}}>
              <option value=''>Choose matching signed agreement</option>
              {matches.map(a=><option key={a.id} value={a.id}>{a.agreementNumber||a.agreementName} ({a.startDate||'?'} – {a.endDate||'?'})</option>)}
            </select>
          </label>
          {matches.length===0&&<p className='text-xs text-amber-800'>No matching signed document found. Register and verify the Land Lease agreement and its contract upload first.</p>}
          {selected[source.id]&&<label className='text-xs flex items-start gap-2'>
            <input type='checkbox' checked={Boolean(confirmed[source.id])} onChange={e=>setConfirmed(x=>({...x,[source.id]:e.target.checked}))}/>
            I inspected the linked signed agreement, reference, dates and outlet. Link this source as evidence only.
          </label>}
          <button type='button' onClick={()=>void linkSource(source.id)} disabled={!selected[source.id]||!confirmed[source.id]||busy}
            className='rounded-lg bg-[#17365D] px-3 py-2 text-white text-xs font-semibold disabled:opacity-40'>
            Verify & Link Existing Agreement
          </button>
        </div>}
        {!source.linkedAgreementId&&!canLink&&<p className='text-xs text-slate-500'>Only global administrators with Documents Write permission can verify and link.</p>}
      </div>;
    })}
  </section>;
}