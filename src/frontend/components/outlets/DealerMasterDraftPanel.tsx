import React,{useCallback,useEffect,useState} from 'react';
import {FileClock,Save,RotateCcw,ShieldCheck} from 'lucide-react';
import {apiFetch} from '../../services/api';
import type {DealerMasterRow} from '../../../shared/dealerMasterImport';
import type {
  DealerDraftContents,DealerDraftMeta,DealerDraftResponse,DealerDraftStatus,
} from '../../../shared/dealerMasterDraft';

type SavedDraft={
  draftId:string;status:'DRAFT';fileName:string;fileSha256:string;
  sourceSheetName:string;createdAt:string;contents:DealerDraftContents;
};
type Props={
  sourceRows:DealerMasterRow[];
  fileName:string;fileSha256:string;sourceSheetName:string;
  yellowByRow:Record<number,string[]>;
  adminAuthorized:boolean;
  onResumeDraft:(draft:SavedDraft)=>Promise<void>;
};
const BASE='/api/v1/outlets/dealer-master/drafts';

export function DealerMasterDraftPanel({
  sourceRows,fileName,fileSha256,sourceSheetName,yellowByRow,
  adminAuthorized,onResumeDraft,
}:Props){
  const [available,setAvailable]=useState(false);
  const [checking,setChecking]=useState(true);
  const [notice,setNotice]=useState('');
  const [history,setHistory]=useState<DealerDraftMeta[]>([]);
  const [busy,setBusy]=useState(false);
  const [lastSaved,setLastSaved]=useState<DealerDraftResponse|null>(null);

  const inspect=useCallback(async()=>{
    setChecking(true);
    try{
      const result=await apiFetch<DealerDraftStatus>(BASE+'/status',{cache:'no-store'});
      const ready=Boolean(result.success&&result.data?.storageReady&&result.data?.canSaveDraft);
      setAvailable(ready);
      setNotice(result.success?(result.data?.message||''):
        'Draft backend or independent D1 storage not yet deployed. No draft was saved.');
      if(ready){
        const saved=await apiFetch<DealerDraftMeta[]>(BASE,{cache:'no-store'});
        if(saved.success&&Array.isArray(saved.data))setHistory(saved.data);
      }
    }catch{setAvailable(false);setNotice('Draft storage cannot be reached; your Excel remains in browser only.');}
    finally{setChecking(false);}
  },[]);

  useEffect(()=>{void inspect();},[inspect]);

  async function save(){
    if(!available||!adminAuthorized||!sourceRows.length||!fileSha256||busy)return;
    setBusy(true);setNotice('');setLastSaved(null);
    try{
      const payload={
        sourceFileName:fileName,sourceFileSha256:fileSha256,
        sourceSheetName:sourceSheetName,importPolicy:'FULL_INCLUDING_YELLOW',
        confirmedDraftOnly:true,
        rows:sourceRows.map(row=>({
          sourceRow:row.sourceRow,roCode:row.roCode,sourceDetails:row.sourceDetails,
          city:row.city||'',pincode:row.pincode||'',
          yellowHeaders:yellowByRow[row.sourceRow]||[],
        })),
      };
      const saved=await apiFetch<DealerDraftResponse>(BASE,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload),
      });
      if(!saved.success||!saved.data)throw Error(saved.error?.message||'Draft save failed');
      setLastSaved(saved.data);
      setNotice(saved.data.action==='ALREADY_SAVED'
        ? 'This exact source draft is already saved. No duplicate created.'
        : 'Draft saved to D1 successfully. Operational outlets and agreements remain unchanged.');
      const result=await apiFetch<DealerDraftMeta[]>(BASE,{cache:'no-store'});
      if(result.success&&Array.isArray(result.data))setHistory(result.data);
    }catch(e){setNotice(e instanceof Error?e.message:'Could not save draft.');}
    finally{setBusy(false);}
  }

  async function resume(id:string){
    if(!available||busy)return;
    setBusy(true);setNotice('');setLastSaved(null);
    try{
      const response=await apiFetch<SavedDraft>(BASE+'/'+encodeURIComponent(id),{cache:'no-store'});
      if(!response.success||!response.data)throw Error(response.error?.message||'Draft not available');
      await onResumeDraft(response.data);
      setNotice('Saved Draft resumed. New RO matching was refreshed from the live directory. Final Sync remains locked.');
    }catch(e){setNotice(e instanceof Error?e.message:'Unable to resume draft.');}
    finally{setBusy(false);}
  }

  return <section className="rounded-xl border border-slate-200 bg-white p-3 space-y-3"
    data-testid="dealer-master-draft-panel">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <FileClock className="w-4 h-4 text-[#17365D]"/>
        <h3 className="text-sm font-bold text-[#17365D]">Save Draft / Resume Draft</h3>
      </div>
      <button type="button" disabled={checking||busy} onClick={()=>void inspect()}
        className="text-xs border rounded-lg px-3 py-1.5">
        <RotateCcw className="inline w-3.5 h-3.5 mr-1"/>Check Draft Storage
      </button>
    </div>
    <p className="text-xs text-slate-600">
      Save all 26 Excel source fields now—even if City/PIN or organizational mapping is missing.
      This creates a separate immutable draft, NOT an outlet, rent transaction or legal agreement.
    </p>
    <div className="flex flex-wrap gap-2 items-center">
      <button type="button" onClick={()=>void save()}
        disabled={!available||!adminAuthorized||checking||busy||sourceRows.length===0||!fileSha256}
        className={'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold '+
        (available&&adminAuthorized&&sourceRows.length&&!busy?'bg-[#17365D] text-white':'bg-slate-200 text-slate-500 cursor-not-allowed')}>
        <Save className="w-4 h-4"/>{busy?'Working…':'Save 26-Column Draft'}
      </button>
      <span className="text-xs text-slate-600">{checking?'Checking backend…':
        available?'Independent draft storage ready':'Draft storage not ready'}</span>
      {lastSaved&&<span className="text-xs text-emerald-800 font-semibold">
        <ShieldCheck className="inline w-4 h-4 mr-1"/>
        {lastSaved.rowCount} rows saved · {lastSaved.matchedExisting} RO Code matches at save
      </span>}
    </div>
    {notice&&<p role="status" className="text-xs rounded-lg bg-slate-50 border p-2">{notice}</p>}
    {history.length>0&&<details>
      <summary className="cursor-pointer text-xs font-semibold">Saved drafts ({history.length}) — resume without uploading Excel again</summary>
      <div className="max-h-40 overflow-y-auto divide-y mt-2 rounded-lg border">
        {history.map(d=><div key={d.id} className="flex items-center justify-between gap-3 p-2 text-xs">
          <div>
            <strong>{d.fileName}</strong> · {d.rowCount} rows · {new Date(d.createdAt).toLocaleString()}
          </div>
          <button type="button" disabled={busy} onClick={()=>void resume(d.id)}
            className="border rounded-md px-2 py-1 font-semibold">Resume</button>
        </div>)}
      </div>
    </details>}
  </section>;
}
