import React, { useEffect, useRef, useState } from 'react';
import { Calendar, Download, Eye, FileText, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useActiveOutlet } from '../context/ActiveOutletContext';
import { useShiftWorkbench } from '../context/ShiftWorkbenchContext';
import { apiFetch } from '../services/api';
import { PERMISSIONS } from '../../shared/constants';
import type { DailyFuelSummary } from '../../shared/types';
import { getLocalDateInputValue, getLocalMonthInputValue } from '../../shared/utils/dateUtils';
import { formatMilliunits } from '../../shared/precision';
import { dsrDates, dsrPeriodProducts, dsrProductColumns, dsrProductValues, type DsrPeriod } from '../utils/dsrReport';

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#17365D]';
const primary = 'inline-flex items-center justify-center gap-2 rounded-lg bg-[#17365D] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50';
const secondary = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-[#17365D] disabled:opacity-50';
const labels: Record<DsrPeriod,string> = { DAY:'Daily', WEEK:'Weekly', MONTH:'Monthly', CUSTOM:'Custom range' };
const today = () => getLocalDateInputValue();

function RetrievedReport({outletId, outletName, roCode, dates, period, canExport, generatedBy}: {
  outletId:string; outletName:string; roCode:string; dates:string[]; period:DsrPeriod; canExport:boolean; generatedBy:string;
}) {
  const [days,setDays] = useState<DailyFuelSummary[] | null>(null);
  const [busy,setBusy] = useState(false);
  const [progress,setProgress] = useState(0);
  const [error,setError] = useState('');
  const [exporting,setExporting] = useState(false);
  const [pdfUrl,setPdfUrl] = useState('');
  const [retrievedAt,setRetrievedAt] = useState('');
  const alive = useRef(true);
  const run = useRef(0);
  const urlRef = useRef('');
  const clearPdf = () => {
    if(urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current=''; setPdfUrl('');
  };
  useEffect(()=>{
    alive.current=true;
    return ()=>{alive.current=false;run.current++;if(urlRef.current)URL.revokeObjectURL(urlRef.current);};
  },[]);
  const retrieve = async () => {
    const token = ++run.current;
    setBusy(true);setProgress(0);setError('');setDays(null);clearPdf();
    const result: DailyFuelSummary[]=[];
    try{
      // Bound concurrent requests. Each date uses the existing outlet-scoped DSR endpoint.
      for(let i=0;i<dates.length;i+=3){
        if(!alive.current || token!==run.current)return;
        const batch=dates.slice(i,i+3);
        const values=await Promise.all(batch.map(async date=>{
          const res=await apiFetch<DailyFuelSummary>('/api/v1/outlets/'+encodeURIComponent(outletId)+'/fuel/daily-summary?businessDate='+encodeURIComponent(date),{cache:'no-store'});
          if(!res.success || !res.data)throw new Error(date+': '+(res.error?.message || 'Could not retrieve DSR.'));
          if(res.data.outletId!==outletId || res.data.businessDate!==date)throw new Error('Unexpected outlet/date in DSR response.');
          return res.data;
        }));
        result.push(...values);
        if(alive.current && token===run.current)setProgress(result.length);
      }
      if(alive.current && token===run.current){setDays(result);setRetrievedAt(new Date().toISOString());}
    }catch(e){if(alive.current && token===run.current)setError(e instanceof Error?e.message:'Unable to retrieve report.');}
    finally{if(alive.current && token===run.current)setBusy(false);}
  };
  const exportPdf = async (preview:boolean) => {
    if(!days || !canExport || exporting || busy)return;
    const token=run.current;
    setExporting(true);setError('');
    try{
      const {generateDsrPdf}=await import('../utils/dsrReportPdf');
      const bytes=await generateDsrPdf({outletName,roCode,days,generatedAt:new Date().toISOString(),generatedBy,periodLabel:labels[period]+' | Data retrieved '+retrievedAt});
      if(!alive.current || token!==run.current)return;
      const url=URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer],{type:'application/pdf'}));
      if(preview){clearPdf();urlRef.current=url;setPdfUrl(url);}
      else {
        const a=document.createElement('a');a.href=url;
        a.download='DSR-'+roCode.replace(/[^a-zA-Z0-9_-]/g,'_')+'-'+dates[0]+(dates.length>1?'--'+dates[dates.length-1]:'')+'.pdf';
        document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      }
    }catch(e){if(alive.current && token===run.current)setError(e instanceof Error?e.message:'PDF generation failed.');}
    finally{if(alive.current && token===run.current)setExporting(false);}
  };
  const totals=days?dsrPeriodProducts(days):[];
  const complete=days?.filter(d=>d.dayEntryStatus==='COMPLETE').length??0;
  const none=days?.filter(d=>d.dayEntryStatus==='NO_ENTRY').length??0;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div><div className="font-semibold text-[#17365D]">{dates[0]}{dates.length>1?' to '+dates[dates.length-1]:''}</div><div className="text-xs text-slate-500">{dates.length} business date(s) · {outletName} ({roCode})</div></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy||exporting} className={primary} onClick={retrieve}><RefreshCw className="h-4 w-4"/>{busy?'Retrieving '+progress+'/'+dates.length:days?'Refresh report':'Retrieve DSR'}</button>
        {canExport && <><button className={secondary} type="button" disabled={!days||busy||exporting} onClick={()=>exportPdf(true)}><Eye className="h-4 w-4"/>Preview PDF</button><button className={secondary} type="button" disabled={!days||busy||exporting} onClick={()=>exportPdf(false)}><Download className="h-4 w-4"/>{exporting?'Generating…':'Download PDF'}</button></>}
      </div>
      {busy&&<progress aria-label="DSR retrieval progress" className="w-full" max={dates.length} value={progress}/>}
    </div>
    {error&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error} {days?'':'No incomplete retrieval will be exported.'}</div>}
    {!canExport&&<p className="text-xs text-slate-600">Report viewing is available; PDF export requires Reports Generate permission.</p>}
    {pdfUrl&&<div className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex justify-between items-center mb-3"><h3 className="font-semibold text-[#17365D]">PDF preview</h3><button type="button" className={secondary} onClick={clearPdf}>Close preview</button></div><iframe title="DSR PDF preview" src={pdfUrl} className="w-full h-[650px] border-0"/><p className="text-xs text-slate-500 mt-2">If your browser cannot display the preview, use Download PDF.</p></div>}
    {days&&<>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[[String(days.length),'Business dates'],[String(complete),'Complete'],[String(days.length-complete-none),'Partial'],[String(none),'No entry']].map(([n,label])=><div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-medium text-slate-500">{label}</p><p className="text-2xl font-bold text-[#17365D]">{n}</p></div>)}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <h3 className="font-semibold text-[#17365D]">Product-wise net sales</h3>
        <p className="text-xs text-slate-600">Recorded-date subtotals only. Incomplete coverage is not treated as zero. Quantities of different units are never combined.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-[#17365D]"><tr>{['Product','Unit','Recorded days','Complete days','Recorded net sales','Coverage'].map(x=><th key={x} className="px-3 py-2">{x}</th>)}</tr></thead>
          <tbody>{totals.map(p=><tr key={p.productId+':'+p.unit} className="border-b border-slate-100"><td className="p-3">{p.productCode} — {p.productName}</td><td className="p-3">{p.unit}</td><td className="p-3">{p.recordedDays}/{p.totalDays}</td><td className="p-3">{p.completeDays}/{p.totalDays}</td><td className="p-3 font-mono">{p.recordedNetMilliunits===null?'Not recorded':formatMilliunits(p.recordedNetMilliunits)}</td><td className="p-3">{p.fullyRecorded?'Complete':'Incomplete subtotal'}</td></tr>)}</tbody>
        </table></div>
        {!totals.length&&<p className="py-3 text-sm text-slate-500">No recorded product data for the selected dates.</p>}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <h3 className="p-4 font-semibold text-[#17365D]">Day-wise DSR records</h3>
        {days.map(d=><details key={d.businessDate} className="border-t border-slate-200" open={days.length===1?true:undefined}>
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[#17365D]">{d.businessDate} · {d.dayEntryStatus.replaceAll('_',' ')} · {d.shiftsCount} shift(s)</summary>
          {d.dayEntryStatus==='NO_ENTRY'?<p className="px-4 pb-4 text-sm text-slate-500">No saved DSR data for this date.</p>:<div className="p-4 overflow-x-auto"><table className="min-w-[1040px] w-full text-xs text-left"><thead className="bg-slate-100"><tr>{['Product','Unit','Status',...dsrProductColumns].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{d.byProduct.map(p=><tr key={p.productId} className="border-b border-slate-100">{[p.productCode,p.unit,p.status,...dsrProductValues(p)].map((v,i)=><td key={i} className="p-2 whitespace-nowrap">{v}</td>)}</tr>)}</tbody></table>{d.missingFields.length>0&&<p className="mt-2 text-xs text-amber-800">{d.missingFields.join('; ')}</p>}<p className="mt-2 text-xs text-slate-500">Full dispenser and nozzle meter statement is included in the PDF.</p></div>}
        </details>)}
      </div>
      <p className="text-xs text-slate-500">Retrieved {retrievedAt}. This report reflects currently saved operational data, not an immutable historical snapshot. No data is written.</p>
    </>}
  </div>;
}

export const DsrReportsPage: React.FC = () => {
  const {hasPermission,userCtx}=useAuth();
  const {activeOutletId,activeOutlet,accessibleOutlets,setActiveOutletId}=useActiveOutlet();
  const {selection, navigate}=useShiftWorkbench();
  const [mode,setMode]=useState<DsrPeriod>('DAY');
  const [anchor,setAnchor]=useState(() => selection?.businessDate || today());
  const [month,setMonth]=useState(getLocalMonthInputValue);
  const [from,setFrom]=useState(today);
  const [to,setTo]=useState(today);
  let dates:string[]=[];let validation='';
  try{dates=dsrDates(mode,anchor,month,from,to,today());}catch(e){validation=e instanceof Error?e.message:'Invalid dates.';}
  const canRead=hasPermission(PERMISSIONS.REPORTS_READ)&&hasPermission(PERMISSIONS.SHIFTS_READ);
  if(!canRead)return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm">DSR Reports requires Reports Read and Shifts Read permissions.</div>;
  return <div className="space-y-5 pb-8">
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h1 className="flex items-center gap-2 text-xl font-bold text-[#17365D]"><FileText className="w-5 h-5 text-orange-500"/>Daily Sales Reports (DSR)</h1>
      <p className="mt-1 text-sm text-slate-500">Retrieve historical daily operations, stock and nozzle sales by date. Preview or download one combined PDF.</p>
      {selection && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600"><span>Workbench business date: {selection.businessDate}. DSR includes all shifts for the selected business dates.</span><button type="button" onClick={()=>navigate('daily-ops')} className="font-semibold text-[#17365D] underline">Return to shift workbench</button></div>}
    </div>
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Report period">{(Object.keys(labels) as DsrPeriod[]).map(p=><button key={p} type="button" aria-pressed={mode===p} onClick={()=>setMode(p)} className={mode===p?primary:secondary}>{labels[p]}</button>)}</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="text-xs font-semibold text-slate-600 md:col-span-1">Retail Outlet<select className={input+' mt-1'} value={activeOutletId||''} onChange={e=>setActiveOutletId(e.target.value)}><option value="" disabled>Select outlet</option>{accessibleOutlets.map(o=><option key={o.id} value={o.id}>{o.name} ({o.roCode})</option>)}</select></label>
        {(mode==='DAY'||mode==='WEEK')&&<label className="text-xs font-semibold text-slate-600">{mode==='DAY'?'Business date':'Any date in selected week (Mon–Sun)'}<input type="date" max={today()} className={input+' mt-1'} value={anchor} onChange={e=>setAnchor(e.target.value)}/></label>}
        {mode==='MONTH'&&<label className="text-xs font-semibold text-slate-600">Month<input type="month" max={today().slice(0,7)} className={input+' mt-1'} value={month} onChange={e=>setMonth(e.target.value)}/></label>}
        {mode==='CUSTOM'&&<><label className="text-xs font-semibold text-slate-600">From date<input type="date" max={today()} className={input+' mt-1'} value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="text-xs font-semibold text-slate-600">To date<input type="date" max={today()} className={input+' mt-1'} value={to} onChange={e=>setTo(e.target.value)}/></label></>}
      </div>
      <p className="flex items-center gap-2 text-xs text-slate-500"><Calendar className="h-4 w-4"/>Current week/month ends at today; custom ranges support up to 92 days per PDF.</p>
      {validation&&<p role="alert" className="text-sm text-red-700">{validation}</p>}
    </div>
    {activeOutlet&&dates.length>0&&!validation?<RetrievedReport key={activeOutlet.id+':'+mode+':'+dates.join(',')} outletId={activeOutlet.id} outletName={activeOutlet.name} roCode={activeOutlet.roCode} dates={dates} period={mode} canExport={hasPermission(PERMISSIONS.REPORTS_GENERATE)} generatedBy={userCtx?.user.name||'Authorized user'}/>:<p className="text-sm text-slate-500">Select an accessible outlet and valid reporting period.</p>}
  </div>;
};
