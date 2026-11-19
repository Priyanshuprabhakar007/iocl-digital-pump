import React, {useEffect,useMemo,useState} from 'react';
import * as XLSX from 'xlsx';
import {CheckCircle2,FileCheck2,RefreshCcw,ShieldAlert} from 'lucide-react';
import {apiFetch} from '../../services/api';
import {useAuth} from '../../context/AuthContext';
import {PERMISSIONS} from '../../../shared/constants';
import type {DealerMasterRow,ImportPlan} from '../../../shared/dealerMasterImport';
import {
  buildDealerStage4Plan,type Stage4Module,type Stage4Status,type Stage4Snapshot,type Stage4Plan,
} from '../../../shared/dealerMasterStage4';

type RunResult={sourceRow:number;roCode:string;status:'SUCCESS'|'PARTIAL'|'FAILED';actions:string[];message:string};
type AuditEvent={batchId:string;action:string;createdAt:string;details:Record<string,unknown>};
type Props={
  sourceRows:DealerMasterRow[];
  protectedBySourceRow:Record<number,string[]>;
  protectedCount:number;
  verified:boolean;
  fileName:string;
  fileSha256:string;
  outletPlans:ImportPlan[];
  onCompleted:()=>void;
};

const destinationLabels:Record<Stage4Module,string>={
  OUTLET:'Retail Outlet',RO_DETAILS:'RO Master fields',
  LAND:'Land ownership details',LEASE_SOURCE:'Lease source (not legal agreement)',
};
const actionColors:Record<Stage4Status,string>={
  CREATE:'text-blue-700',FILL_MISSING:'text-emerald-700',
  PROTECTED:'text-amber-700',UNCHANGED:'text-slate-500',
  CONFLICT:'text-rose-700',REVIEW:'text-orange-800',
};
function rowHasWrites(row:Stage4Plan['rows'][number]){
  return !!row.createOutletPayload||Object.keys(row.roDetailsPayload).length>0||
    Object.keys(row.landPayload).length>0||Object.keys(row.leasePayload).length>0;
}
function rowIsSafe(row:Stage4Plan['rows'][number]){
  return !row.review.length; // Conflicting modules have been independently stripped from payload.
}
function fingerprint(plan:Stage4Plan){
  return JSON.stringify(plan.rows.map(r=>({
    sourceRow:r.sourceRow,outletId:r.outletId,create:r.createOutletPayload,
    ro:r.roDetailsPayload,land:r.landPayload,lease:r.leasePayload,
    key:r.leaseSourceKey,existingLeaseSourceId:r.existingLeaseSourceId,review:r.review,
    decisions:r.fields.map(f=>[f.header,f.status,f.stored,f.source]),
  })));
}
export function DealerMasterStage4Panel({
  sourceRows,protectedBySourceRow,protectedCount,verified,fileName,fileSha256,
  outletPlans,onCompleted,
}:Props){
  const {userCtx,hasPermission}=useAuth();
  const permitted=!!userCtx?.isGlobalScope&&
    hasPermission(PERMISSIONS.OUTLETS_CREATE)&&
    hasPermission(PERMISSIONS.OUTLETS_UPDATE)&&
    hasPermission(PERMISSIONS.DOCUMENTS_READ)&&
    hasPermission(PERMISSIONS.DOCUMENTS_WRITE);
  const [snapshot,setSnapshot]=useState<Stage4Snapshot|null>(null);
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [approved,setApproved]=useState(false);
  const [module,setModule]=useState<Stage4Module|'ALL'>('ALL');
  const [status,setStatus]=useState<Stage4Status|'ALL'>('ALL');
  const [results,setResults]=useState<RunResult[]>([]);
  const [history,setHistory]=useState<AuditEvent[]>([]);
  const [batchId,setBatchId]=useState('');
  const plan=useMemo(()=>snapshot?buildDealerStage4Plan(
    sourceRows,protectedBySourceRow,outletPlans,snapshot):null,
    [snapshot,sourceRows,protectedBySourceRow,outletPlans]);
  const safeRows=useMemo(()=>plan?.rows.filter(r=>rowIsSafe(r)&&rowHasWrites(r))||[],[plan]);
  const visible=useMemo(()=>plan?.rows.flatMap(r=>r.fields).filter(f=>
    (module==='ALL'||module===f.module)&&(status==='ALL'||status===f.status)
  ).slice(0,220)||[],[plan,module,status]);

  async function loadSnapshot(){
    if(!permitted)return;
    setLoading(true);setError('');setApproved(false);
    try{
      const response=await apiFetch<Stage4Snapshot>('/api/v1/outlets/dealer-master/batch-snapshot');
      if(!response.success||!response.data)throw Error(response.error?.message||
        'Complete RO/Land/Lease snapshot is unavailable. Do not import.');
      setSnapshot(response.data);
    }catch(e){setSnapshot(null);setError(e instanceof Error?e.message:'Snapshot failed');}
    finally{setLoading(false);}
  }
  async function loadHistory(){
    if(!permitted)return;
    const response=await apiFetch<AuditEvent[]>('/api/v1/outlets/dealer-master/batches');
    if(response.success&&Array.isArray(response.data))setHistory(response.data);
  }
  useEffect(()=>{
    void loadSnapshot();void loadHistory();
    // Each uploaded file and hierarchy change requires fresh data and new approval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[sourceRows,outletPlans,permitted]);

  async function write<T>(url:string,method:'POST'|'PATCH',payload:unknown):Promise<T>{
    const response=await apiFetch<T>(url,{method,body:JSON.stringify(payload)});
    if(!response.success||!response.data)
      throw Error(response.error?.message||'The server rejected a protected write');
    return response.data;
  }
  async function approveAndSync(){
    if(!plan||!verified||protectedCount<1||!fileSha256||!approved||busy||loading||!permitted||safeRows.length===0)return;
    setBusy(true);setError('');setResults([]);setBatchId('');
    let activeBatch='';
    const outcomes:RunResult[]=[];
    try{
      // Compare complete destination-by-destination preview again immediately before any writes.
      const check=await apiFetch<Stage4Snapshot>('/api/v1/outlets/dealer-master/batch-snapshot');
      if(!check.success||!check.data)throw Error('Unable to verify fresh database snapshot. Nothing was imported.');
      const fresh=buildDealerStage4Plan(sourceRows,protectedBySourceRow,outletPlans,check.data);
      if(fingerprint(plan)!==fingerprint(fresh)){
        setSnapshot(check.data);setApproved(false);
        throw Error('Database changed after preview. Results refreshed; review and approve again.');
      }
      const start=await write<{batchId:string}>('/api/v1/outlets/dealer-master/batches','POST',{
        fileName,sha256:fileSha256,totalRows:sourceRows.length,
        protectedCells:protectedCount,eligibleRows:safeRows.length,confirmed:true,
      });
      activeBatch=start.batchId;setBatchId(activeBatch);
      for(const row of safeRows){
        const actions:string[]=[];
        let outletId=row.outletId;
        try{
          if(!outletId){
            if(!row.createOutletPayload)throw Error('New outlet has no validated creation payload');
            const created=await write<{id:string}>('/api/v1/outlets','POST',row.createOutletPayload);
            if(!created.id)throw Error('Outlet creation succeeded but server did not return an outlet ID');
            outletId=created.id;actions.push('RO Master created');
          }
          const root='/api/v1/outlets/'+encodeURIComponent(outletId)+'/dealer-master-extension';
          if(Object.keys(row.roDetailsPayload).length){
            await write(root+'/ro','PATCH',row.roDetailsPayload);
            actions.push('RO missing fields filled');
          }
          if(Object.keys(row.landPayload).length){
            await write(root+'/land','PATCH',row.landPayload);
            actions.push('Land missing fields filled');
          }
          if(Object.keys(row.leasePayload).length){
            if(!row.leaseSourceKey)throw Error('Lease source identity is missing');
            if(row.existingLeaseSourceId){
              await write(root+'/lease-sources/'+encodeURIComponent(row.existingLeaseSourceId),'PATCH',row.leasePayload);
              actions.push('Lease source missing fields filled');
            }else{
              await write(root+'/lease-sources','POST',{sourceKey:row.leaseSourceKey,...row.leasePayload});
              actions.push('Lease source recorded for legal agreement review');
            }
          }
          outcomes.push({sourceRow:row.sourceRow,roCode:row.roCode,status:'SUCCESS',actions,message:'Imported allowed fields only'});
        }catch(e){
          outcomes.push({sourceRow:row.sourceRow,roCode:row.roCode,status:actions.length?'PARTIAL':'FAILED',actions,
            message:e instanceof Error?e.message:'Unknown server rejection'});
          setResults([...outcomes]);
          break; // Stop on first error; successful earlier actions remain audited.
        }
        setResults([...outcomes]);
      }
      const failures=outcomes.filter(x=>x.status!=='SUCCESS').length;
      const applied=outcomes.filter(x=>x.status==='SUCCESS').length;
      const partlyApplied=outcomes.some(x=>x.status==='PARTIAL');
      const batchState=failures?(applied||partlyApplied?'PARTIAL':'FAILED'):'COMPLETE';
      const finish=await apiFetch('/api/v1/outlets/dealer-master/batches/'+encodeURIComponent(activeBatch)+'/complete',{
        method:'POST',body:JSON.stringify({
          status:batchState,appliedRows:applied,failedRows:failures,
          skippedRows:sourceRows.length-applied-failures,
        }),
      });
      if(!finish.success)setError('Writes completed but batch completion audit could not be confirmed. Check audit history before retrying.');
      setApproved(false);setResults(outcomes);
      if(applied||partlyApplied)onCompleted();
      await loadHistory();
      await loadSnapshot();
    }catch(e){
      setError(e instanceof Error?e.message:'Import approval failed');
      setApproved(false);
    }finally{setBusy(false);}
  }
  function exportResult(){
    if(!plan)return;
    const report=plan.rows.flatMap(r=>r.fields.map(f=>({
      ExcelRow:f.row,ROCode:f.roCode,Module:destinationLabels[f.module],
      ExcelField:f.header,StoredValue:f.stored,ExcelValue:f.source,Decision:f.status,
      Note:f.note,RowReview:r.review.join('; '),LeaseMatch:r.legalAgreementCheck,
    })));
    const workbook=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(report),'Field Review');
    if(results.length)XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(results.map(r=>({
      ExcelRow:r.sourceRow,ROCode:r.roCode,Status:r.status,Actions:r.actions.join('; '),Message:r.message,BatchId:batchId,
    }))),'Sync Results');
    XLSX.writeFile(workbook,'IOCL_Dealer_Master_Stage4_Review.xlsx');
  }

  return <section data-testid="dealer-master-stage4" className="rounded-xl border border-[#B5C8E6] bg-[#F8FAFF] p-4 space-y-4">
    <div className="flex flex-wrap gap-3 items-start justify-between">
      <div>
        <h3 className="text-base font-bold text-[#17365D] flex gap-2 items-center"><FileCheck2 className="w-5 h-5"/>Stage 4 — Module-wise Import Preview</h3>
        <p className="text-xs text-slate-600 mt-1">Protect yellow cells, fill only blank saved fields, and hold conflicts/uncertain lease matches for review.</p>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={loading||busy} onClick={()=>void loadSnapshot()} className="border border-slate-300 rounded-lg bg-white p-2 text-xs flex items-center gap-1"><RefreshCcw className="w-4 h-4"/>Refresh</button>
        <button type="button" disabled={!plan} onClick={exportResult} className="border border-slate-300 rounded-lg bg-white p-2 text-xs">Export field review</button>
      </div>
    </div>
    {!permitted&&<p role="alert" className="text-sm text-rose-800">Global admin role with Outlet Create/Update and Documents Read/Write permissions is required.</p>}
    {(!verified||protectedCount<1)&&<p role="alert" className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-700">Excel yellow-cell styles could not be confirmed. No import is permitted.</p>}
    {error&&<p role="alert" className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800"><ShieldAlert className="w-4 h-4 inline mr-1"/>{error}</p>}
    {loading&&<p className="text-xs text-slate-600">Checking current RO, land and lease-source master records…</p>}
    {plan&&<>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
        {(['CREATE','FILL_MISSING','PROTECTED','UNCHANGED','CONFLICT','REVIEW'] as const).map(k=>
          <div key={k} className="bg-white border border-slate-200 p-2 rounded-lg">
            <div className="text-xs text-slate-600">{k.replace('_',' ')}</div>
            <div className={'font-bold text-xl '+actionColors[k]}>{plan.counts[k]}</div>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-700"><strong>{safeRows.length} outlet row(s) eligible</strong> for approved writes; {sourceRows.length-safeRows.length} rows need review, are already complete, or have no pending unprotected values. Yellow cells: {protectedCount} protected.</p>
      {plan.rows.some(r=>r.review.length>0)&&<details className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
        <summary className="cursor-pointer font-semibold text-amber-900">Outlet-level blocks ({plan.rows.filter(r=>r.review.length).length})</summary>
        <div className="mt-2 space-y-1">{plan.rows.filter(r=>r.review.length).slice(0,25).map(r=>
          <p key={r.sourceRow} className="border-t border-amber-200 pt-1"><strong>{r.roCode} · Excel row {r.sourceRow}:</strong> {r.review.join('; ')}</p>
        )}</div>
        <p className="mt-2 text-amber-800">Export full field review for all blocked outlets.</p>
      </details>}
      <div className="flex flex-wrap gap-2">
        <select aria-label="Filter by module" value={module} onChange={e=>setModule(e.target.value as Stage4Module|'ALL')} className="bg-white border rounded-lg p-2 text-xs">
          <option value="ALL">All modules</option>
          {Object.entries(destinationLabels).map(([key,value])=><option key={key} value={key}>{value}</option>)}
        </select>
        <select aria-label="Filter by action" value={status} onChange={e=>setStatus(e.target.value as Stage4Status|'ALL')} className="bg-white border rounded-lg p-2 text-xs">
          <option value="ALL">All decisions</option>
          {(['CREATE','FILL_MISSING','PROTECTED','UNCHANGED','CONFLICT','REVIEW'] as const).map(k=><option key={k} value={k}>{k.replace('_',' ')}</option>)}
        </select>
        <span className="text-xs text-slate-500 self-center">Showing up to 220 field decisions. Export for complete audit.</span>
      </div>
      <div className="max-h-[420px] overflow-auto border border-slate-200 rounded-lg bg-white">
        <table className="min-w-[950px] w-full text-xs text-left">
          <thead className="sticky top-0 bg-slate-200">
            <tr><th className="p-2">Row / RO</th><th className="p-2">Module</th><th className="p-2">Excel Field</th><th className="p-2">Source Value</th><th className="p-2">Saved Value</th><th className="p-2">Decision</th><th className="p-2">Reason</th></tr>
          </thead>
          <tbody>{visible.map((f,i)=><tr key={f.row+'-'+f.module+'-'+f.field+'-'+i} className="border-t">
            <td className="p-2 font-mono">{f.row} · {f.roCode}</td><td className="p-2">{destinationLabels[f.module]}</td>
            <td className="p-2">{f.header}</td><td className="p-2 max-w-[190px] break-words">{f.source}</td>
            <td className="p-2 max-w-[190px] break-words">{f.stored||'—'}</td>
            <td className={'p-2 font-semibold '+actionColors[f.status]}>{f.status.replace('_',' ')}</td><td className="p-2">{f.note||'—'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="text-xs text-amber-800">Lease-source records are only supporting data. They do not create signed legal leases, update canonical rent, or link agreements automatically. Missing/mismatched signed agreements require separate document verification.</p>
      <div className="flex flex-col md:flex-row gap-3 md:justify-between md:items-center border-t pt-3">
        <label className="flex gap-2 items-start text-xs max-w-2xl">
          <input type="checkbox" checked={approved} disabled={busy||loading||safeRows.length===0||!permitted||!verified||!fileSha256} onChange={e=>setApproved(e.target.checked)}/>
          I reviewed the exported field decisions. I authorize only safe, non-yellow missing-field writes to the currently selected database. Only missing fields are written. Conflicting or review-required modules are skipped; blocked outlets are skipped entirely.
        </label>
        <button type="button" disabled={!approved||busy||loading||safeRows.length===0||!verified||protectedCount<1||!permitted||!fileSha256} onClick={()=>void approveAndSync()}
          className="bg-[#E66B13] disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap">
          {busy?'Writing verified records…':'Approve '+safeRows.length+' Safe Outlet Row(s)'}
        </button>
      </div>
    </>}
    {results.length>0&&<div className="bg-white border rounded-lg p-3 space-y-2 text-xs" aria-live="polite">
      <div className="font-bold">Batch {batchId||'unknown'} — {results.filter(r=>r.status==='SUCCESS').length} successful, {results.filter(r=>r.status==='FAILED').length} failed, {results.filter(r=>r.status==='PARTIAL').length} partially saved</div>
      {results.filter(r=>r.status!=='SUCCESS').map(r=><p key={r.sourceRow} className="text-rose-700">RO {r.roCode}: {r.message} ({r.actions.join(', ')||'no actions'})</p>)}
      <p>Import is not all-or-nothing. A failed operation stops the batch; previously successful changes stay audited and can be reviewed on the next upload.</p>
      <button type="button" onClick={exportResult} className="border p-2 rounded-lg">Export results and field decisions</button>
    </div>}
    {history.length>0&&<details className="text-xs bg-white border rounded-lg p-3">
      <summary className="font-semibold cursor-pointer flex items-center gap-1"><CheckCircle2 className="w-4 h-4"/>Recent Import Audit History</summary>
      <div className="mt-2 space-y-1">{history.slice(0,16).map((event,i)=>
        <p key={event.batchId+'-'+event.action+'-'+i} className="border-t pt-1">{event.createdAt} · {event.action} · Batch {event.batchId.slice(0,8)}</p>
      )}</div>
    </details>}
  </section>;
}
