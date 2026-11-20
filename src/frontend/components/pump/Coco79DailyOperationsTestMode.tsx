import React, {useEffect,useMemo,useState} from 'react';
import {apiFetch} from '../../services/api';
import type {GlobalTankCalibrationTemplate} from '../../../shared/types';
import {
 COCO79_TANKS,COCO79_NOZZLES,TEST_FUELS,
 newTestDay,generateExampleDay,fillExampleReadings,closeTestShift,openNextTestShift,
 evaluateTestShift,summarizeTestDay,
 type TestDay,type TestFuel,type TestShift,
} from '../../utils/coco79TestSimulator';

const fmt=(v:number,digits=2)=>v.toLocaleString('en-IN',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const toNullable=(raw:string)=>raw.trim()===''?null:Number(raw);
const input='w-full min-w-[75px] rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:outline-blue-500 disabled:bg-slate-100';
const TH:React.FC<{children:React.ReactNode}>=({children})=><th className="px-2 py-2 text-left text-[11px] font-bold uppercase text-slate-600">{children}</th>;
const TD:React.FC<{children:React.ReactNode}>=({children})=><td className="px-2 py-1.5 text-xs text-slate-800">{children}</td>;
const badge='rounded-lg border border-orange-300 bg-orange-50 px-2 py-1 text-[11px] font-bold text-orange-900';
type Phase='SETUP'|'READINGS'|'RECONCILIATION'|'DSR';

function interpolate(points:NonNullable<GlobalTankCalibrationTemplate['points']>,dipMm:number):number|null {
 const sorted=[...points].sort((a,b)=>a.dipMillimetres-b.dipMillimetres);
 if(!Number.isFinite(dipMm)||sorted.length<2||dipMm<sorted[0].dipMillimetres||dipMm>sorted[sorted.length-1].dipMillimetres)return null;
 const upper=sorted.findIndex(p=>p.dipMillimetres>=dipMm);
 if(upper===0)return sorted[0].volumeLitres;
 if(upper<0)return null;
 const a=sorted[upper-1],b=sorted[upper];
 const d=b.dipMillimetres-a.dipMillimetres;
 if(d<=0)return null;
 return Math.round((a.volumeLitres+(b.volumeLitres-a.volumeLitres)*(dipMm-a.dipMillimetres)/d)*1000)/1000;
}

export const Coco79DailyOperationsTestMode:React.FC = ()=>{
 const [day,setDay]=useState<TestDay>(()=>newTestDay());
 const [phase,setPhase]=useState<Phase>('SETUP');
 const [message,setMessage]=useState<string>('');
 const [chart,setChart]=useState<GlobalTankCalibrationTemplate|null>(null);
 const [chartGrade,setChartGrade]=useState<'10'|'15'>('10');
 const [dipMm,setDipMm]=useState('955');
 const [chartBusy,setChartBusy]=useState(false);
 const [chartError,setChartError]=useState('');
 const shift=day.shifts[day.selected];
 const result=useMemo(()=>evaluateTestShift(shift),[shift]);
 const dsr=useMemo(()=>summarizeTestDay(day),[day]);
 const canEdit=shift.status==='OPEN';
 const change=(fn:(s:TestShift)=>TestShift)=>{
   setDay(old=>({...old,shifts:old.shifts.map((s,i)=>i===old.selected&&s.status==='OPEN'?fn(s):s)}));
   setMessage('');
 };
 const changeTank=(tank:number,field:'openingL'|'receiptL'|'closingL',value:number|null)=>
   change(s=>({...s,tanks:s.tanks.map(t=>t.number===tank?{...t,[field]:value}:t)}));
 const changeNozzle=(id:string,field:'opening'|'closing'|'testingL',value:number|null)=>
   change(s=>({...s,nozzles:s.nozzles.map(n=>n.id===id?{...n,[field]:value}:n)}));
 const sample=()=>{setDay(generateExampleDay());setPhase('DSR');setMessage('Three independent sample shifts closed successfully. All inputs are simulated; production records remain unchanged.');};
 const reset=()=>{setDay(newTestDay());setPhase('SETUP');setMessage('Local test workspace reset. No production rows were touched.');};
 const finish=()=>{
   try{
     setDay(old=>closeTestShift(old));
     setPhase('RECONCILIATION');
     setMessage('Test shift closed in memory. Check DSR or open the next test shift.');
   }catch(e){setMessage(e instanceof Error?e.message:'Shift validation failed');setPhase('RECONCILIATION');}
 };
 const next=()=>{
   try{setDay(old=>openNextTestShift(old));setPhase('READINGS');setMessage('New simulated shift opened from the previous closing readings.');}
   catch(e){setMessage(e instanceof Error?e.message:'Cannot open next shift');}
 };
 const loadChart=async()=>{
   setChartBusy(true);setChartError('');setChart(null);
   try{
     // Only GET requests. No approval, assignment, activation or stock write.
     const list=await apiFetch<GlobalTankCalibrationTemplate[]>('/api/v1/calibration-templates',{cache:'no-store'});
     const ref=list.data?.find(t=>t.code==='EXCEL_'+chartGrade+'KL_REFERENCE');
     if(!list.success||!ref)throw Error(chartGrade+' KL draft reference is unavailable.');
     const detail=await apiFetch<GlobalTankCalibrationTemplate>(
       '/api/v1/calibration-templates/'+encodeURIComponent(ref.id),{cache:'no-store'});
     if(!detail.success||!detail.data?.points?.length)throw Error('Reference points unavailable. Approval was not changed.');
     setChart(detail.data);
   }catch(e){setChartError(e instanceof Error?e.message:'Could not load read-only chart');}
   finally{setChartBusy(false);}
 };
 useEffect(()=>{setChart(null);setChartError('');},[chartGrade]);
 const volume=chart?.points?interpolate(chart.points,Number(dipMm)):null;
 const exportDsr=()=>{
   const esc=(v:string|number)=>'"'+String(v).replace(/"/g,'""')+'"';
   const rows:(string|number)[][]=[
     ['COCO-79 UAT TEST ONLY — NOT AN OFFICIAL DSR'],
     ['RO Code','369460'],['Shifts closed',dsr.shiftsClosed],['Gross litres',dsr.grossL],
     ['Testing litres',dsr.testingL],['Net litres',dsr.netL],
     ['Receipt litres',dsr.receiptsL],['Fuel sales INR',dsr.revenue],
     ['Collections INR',dsr.collected],[],
     ['Product','Net litres','Sales INR'],
     ...dsr.products.map(p=>[p.fuel,p.netL,p.revenue]),
     [],['Shift','Status','Net litres','Sales INR','Collections INR'],
     ...day.shifts.map(s=>{const v=evaluateTestShift(s);return [s.label,s.status,v.netL,v.revenue,v.collected??''];}),
   ];
   const file=new Blob([rows.map(row=>row.map(esc).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
   const url=URL.createObjectURL(file),a=document.createElement('a');
   a.href=url;a.download='COCO79_369460_SIMULATED_DSR.csv';a.click();URL.revokeObjectURL(url);
 };
 return <section data-testid="coco79-full-daily-test-mode" className="space-y-4 rounded-2xl bg-[#F6F8FC] p-3 sm:p-5">
   <div className="rounded-xl bg-[#142E52] p-4 text-white space-y-2">
     <div className="flex flex-wrap items-center justify-between gap-3">
       <div>
         <h2 className="text-xl font-extrabold">COCO-79 · Full Daily Operations Test Workspace</h2>
         <p className="mt-1 text-sm text-slate-200">RO 369460 · 3 test shifts · 7 tanks · 5 dispensers · 20 nozzles</p>
       </div>
       <span className="rounded-md bg-amber-300 px-3 py-1.5 text-xs font-extrabold text-amber-950">SIMULATION ONLY — NO LIVE WRITES</span>
     </div>
     <p className="text-xs text-slate-200">All prices, meter readings, opening stock, receipts and collections are sample values. Shift close and DSR here are calculated only in browser memory. Production tank/shift/financial data and engineering approval remain unchanged. Refreshing the page resets this test.</p>
   </div>
   <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3">
     <button type="button" onClick={sample} data-testid="run-coco79-full-sample-day" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">Run Full 3-Shift Sample Day</button>
     <button type="button" onClick={reset} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">Reset / Manual Test</button>
     <div className="flex items-center gap-2 text-sm">
       <label htmlFor="coco79-test-shift-picker" className="text-slate-600">Test shift</label>
       <select id="coco79-test-shift-picker" className="rounded-lg border p-2" value={day.selected} onChange={e=>{setDay(d=>({...d,selected:Number(e.target.value)}));setMessage('');}}>
         {day.shifts.map((s,i)=><option value={i} key={s.number}>{s.number}: {s.label} — {s.status}</option>)}
       </select>
     </div>
     {day.shifts.length<3&&shift.status==='CLOSED'&&day.selected===day.shifts.length-1&&
       <button type="button" onClick={next} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white">Open Next TEST Shift</button>}
   </div>
   {message&&<div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{message}</div>}
   <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
     {[{n:'7 / 7',t:'Test Tanks'},{n:'5 / 5',t:'Test Tokheim DUs'},{n:'20 / 20',t:'Test Nozzles'},{n:dsr.shiftsClosed+' / 3',t:'Sample Shifts Closed'}].map(p=>
       <div key={p.t} className="rounded-lg border bg-white p-3 text-center"><p className="text-lg font-extrabold text-[#17365D]">{p.n}</p><p className="text-xs text-slate-500">{p.t}</p></div>)}
   </div>
   <div className="flex flex-wrap gap-2 border-b pb-2" role="tablist" aria-label="Test workflow">
     {(['SETUP','READINGS','RECONCILIATION','DSR'] as const).map(p=><button type="button" role="tab" aria-selected={phase===p} key={p}
       onClick={()=>setPhase(p)} className={'rounded-lg px-3 py-2 text-xs font-bold '+(phase===p?'bg-[#17365D] text-white':'bg-white border text-slate-700')}>
       {p==='SETUP'?'1. Infrastructure & Calibration':p==='READINGS'?'2. Shift Entry':p==='RECONCILIATION'?'3. Reconciliation & Close':'4. DSR'}
     </button>)}
   </div>
   {phase==='SETUP'&&<div className="space-y-4">
     <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
       <strong>Physical topology source:</strong> COCO-79 handwritten sketch. Tank #3 HSD and M/C-1 HSD supply remain provisional, not physically verified. 20 KL and 10 KL nominal capacities are test-only; 15 KL has no physical COCO-79 tank in the drawing.
     </div>
     <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
       <div className="rounded-xl border bg-white p-3"><h3 className="font-bold text-[#17365D]">Tank master — 120 KL nominal</h3>
         <div className="mt-2 overflow-x-auto"><table className="w-full"><thead><tr className="bg-slate-100"><TH>Tank</TH><TH>Fuel</TH><TH>Capacity</TH></tr></thead><tbody>
           {COCO79_TANKS.map(t=><tr key={t.number} className="border-b"><TD>#{t.number}{t.provisional?' *':''}</TD><TD>{t.fuel}</TD><TD>{fmt(t.capacityL,0)} L</TD></tr>)}
         </tbody></table></div></div>
       <div className="rounded-xl border bg-white p-3"><h3 className="font-bold text-[#17365D]">DU → Nozzle → Tank map</h3>
         <div className="mt-2 overflow-x-auto max-h-72 overflow-y-auto"><table className="w-full"><thead><tr className="bg-slate-100"><TH>DU</TH><TH>Nozzle</TH><TH>Fuel</TH><TH>Tank</TH></tr></thead><tbody>
           {COCO79_NOZZLES.map(n=><tr key={n.id} className="border-b"><TD>M/C-{n.du}</TD><TD>{n.position}</TD><TD>{n.fuel}</TD><TD>#{n.tank}{n.provisional?' *':''}</TD></tr>)}
         </tbody></table></div></div>
     </div>
     <div className="rounded-xl border bg-white p-4 space-y-3">
       <h3 className="font-bold text-[#17365D]">10 KL / 15 KL draft curve interpolation — read-only</h3>
       <p className="text-xs text-slate-600">Loads existing imported reference points by GET request only. The resulting litres are a draft preview; simulated tank stock below is entered in litres independently and does not claim certified dip conversion.</p>
       <div className="flex flex-wrap gap-2 items-end">
         <label className="text-xs">Chart <select value={chartGrade} onChange={e=>setChartGrade(e.target.value as '10'|'15')} className={input}><option value="10">10 KL</option><option value="15">15 KL</option></select></label>
         <button type="button" onClick={()=>void loadChart()} disabled={chartBusy} className="rounded-lg bg-[#17365D] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{chartBusy?'Loading…':'Load Draft Chart (Read Only)'}</button>
         <label className="text-xs">Dip (mm) <input className={input} type="number" min="0" value={dipMm} onChange={e=>setDipMm(e.target.value)}/></label>
       </div>
       {chartError&&<p role="alert" className="text-sm text-rose-700">{chartError}</p>}
       {chart&&<div className="rounded-lg bg-cyan-50 p-3 text-sm text-cyan-900">Chart: <strong>{chart.code}</strong> ({chart.pointsCount} points, status {chart.status}) · Draft interpolation: <strong>{volume===null?'Out of chart range':fmt(volume,3)+' L'}</strong></div>}
     </div>
   </div>}
   {phase==='READINGS'&&<div className="space-y-4">
     <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900"><strong>{shift.label} ({shift.timing})</strong> · {shift.status}. Opening volumes and totalizers carry forward from the previous closed test shift. Enter actual **test numbers** to work through all entries.</div>
     <div className="rounded-xl border bg-white p-3">
       <h3 className="mb-2 font-bold text-[#17365D]">Tank opening / receipt / closing in litres (SIMULATED)</h3>
       <div className="overflow-x-auto"><table className="w-full"><thead className="bg-slate-100"><tr><TH>Tank / Product</TH><TH>Opening L</TH><TH>Receipt L</TH><TH>Closing L</TH></tr></thead><tbody>
         {shift.tanks.map(t=><tr key={t.number} className="border-b"><TD>#{t.number} · {t.fuel}</TD>
           <TD><input aria-label={'Tank '+t.number+' opening'} className={input} type="number" min="0" disabled={!canEdit} value={t.openingL} onChange={e=>changeTank(t.number,'openingL',Number(e.target.value))}/></TD>
           <TD><input aria-label={'Tank '+t.number+' receipt'} className={input} type="number" min="0" disabled={!canEdit} value={t.receiptL} onChange={e=>changeTank(t.number,'receiptL',Number(e.target.value))}/></TD>
           <TD><input aria-label={'Tank '+t.number+' closing'} className={input} type="number" min="0" disabled={!canEdit} placeholder="Required" value={t.closingL??''} onChange={e=>changeTank(t.number,'closingL',toNullable(e.target.value))}/></TD>
         </tr>)}</tbody></table></div>
     </div>
     <div className="rounded-xl border bg-white p-3">
       <h3 className="mb-2 font-bold text-[#17365D]">20 Nozzle totalizer readings &amp; testing (SIMULATED)</h3>
       <div className="max-h-96 overflow-auto"><table className="w-full min-w-[610px]"><thead className="sticky top-0 bg-slate-100"><tr><TH>DU / Nozzle</TH><TH>Product / Tank</TH><TH>Opening</TH><TH>Closing</TH><TH>Testing L</TH></tr></thead><tbody>
         {shift.nozzles.map(n=><tr key={n.id} className="border-b">
           <TD>M/C-{n.du} / {n.position}</TD><TD>{n.fuel} · T{n.tank}</TD>
           <TD><input aria-label={n.id+' opening'} className={input} type="number" min="0" disabled={!canEdit} value={n.opening} onChange={e=>changeNozzle(n.id,'opening',Number(e.target.value))}/></TD>
           <TD><input aria-label={n.id+' closing'} className={input} type="number" min="0" disabled={!canEdit} placeholder="Required" value={n.closing??''} onChange={e=>changeNozzle(n.id,'closing',toNullable(e.target.value))}/></TD>
           <TD><input aria-label={n.id+' testing'} className={input} type="number" min="0" disabled={!canEdit} placeholder="Enter 0 if none" value={n.testingL??''} onChange={e=>changeNozzle(n.id,'testingL',toNullable(e.target.value))}/></TD>
         </tr>)}</tbody></table></div>
       <p className="mt-2 text-xs text-slate-600">Net litres = closing meter − opening meter − testing. Enter 0 explicitly where no nozzle testing was done in the simulation.</p>
     </div>
     <div className="rounded-xl border bg-white p-3 space-y-3">
       <h3 className="font-bold text-[#17365D]">Fuel prices (₹/L) and simulated collection entries</h3>
       <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
         {TEST_FUELS.map(f=><label className="text-xs font-bold text-slate-700" key={f}>{f}<input aria-label={f+' test price'} className={input} type="number" min="0" disabled={!canEdit} value={shift.prices[f]??''} onChange={e=>change(s=>({...s,prices:{...s.prices,[f]:toNullable(e.target.value)}}))}/></label>)}
       </div>
       <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
         {(['cash','upi','pos','credit'] as const).map(k=><label className="text-xs font-bold text-slate-700" key={k}>{k.toUpperCase()} (₹)<input aria-label={k+' test collection'} className={input} type="number" min="0" disabled={!canEdit} placeholder="Required" value={shift.collections[k]??''} onChange={e=>change(s=>({...s,collections:{...s.collections,[k]:toNullable(e.target.value)}}))}/></label>)}
       </div>
     </div>
     {canEdit&&<div className="flex flex-wrap gap-2"><button type="button" onClick={()=>change(s=>fillExampleReadings(s))} className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-900">Populate This Shift with Example Numbers</button>
       <button type="button" onClick={()=>setPhase('RECONCILIATION')} className="rounded-lg bg-[#17365D] px-4 py-2 text-sm font-bold text-white">Review Reconciliation</button></div>}
   </div>}
   {phase==='RECONCILIATION'&&<div className="space-y-4">
     <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
       {[['Gross Sale',fmt(result.grossL,3)+' L'],['Testing',fmt(result.testingL,3)+' L'],['Net Sale',fmt(result.netL,3)+' L'],['Sales Value','₹ '+fmt(result.revenue)]].map(([key,value])=>
         <div key={key} className="rounded-xl border bg-white p-3"><p className="text-xs text-slate-500">{key}</p><p className="text-lg font-bold text-[#17365D]">{value}</p></div>)}
     </div>
     <div className="rounded-xl border bg-white p-3">
       <h3 className="font-bold text-[#17365D]">Tank book stock against test physical closing</h3>
       <div className="overflow-x-auto"><table className="w-full"><thead className="bg-slate-100"><tr><TH>Tank</TH><TH>Book Closing (L)</TH><TH>Physical (L)</TH><TH>Variance (L)</TH></tr></thead><tbody>
         {result.tanks.map(t=><tr key={t.tank} className="border-b"><TD>T{t.tank} · {t.fuel}</TD><TD>{fmt(t.expectedClosingL,3)}</TD><TD>{t.physicalClosingL===null?'Missing':fmt(t.physicalClosingL,3)}</TD><TD>{t.varianceL===null?'—':fmt(t.varianceL,3)}</TD></tr>)}
       </tbody></table></div>
     </div>
     <div className="rounded-xl border bg-white p-3">
       <h3 className="font-bold text-[#17365D]">Financial reconciliation</h3>
       <p className="mt-2 text-sm">Expected test sales: <strong>₹{fmt(result.revenue)}</strong> · Collections: <strong>{result.collected===null?'Missing':'₹'+fmt(result.collected)}</strong> · Difference: <strong>{result.paymentVariance===null?'—':'₹'+fmt(result.paymentVariance)}</strong></p>
       <p className={'mt-2 text-xs font-bold '+(result.ready?'text-emerald-700':'text-rose-700')}>{result.ready?'PASS: All 7 tanks, 20 nozzles and payment totals balanced.':'BLOCKED: '+result.errors.length+' validation issue(s)'}</p>
       {result.errors.length>0&&<ul className="mt-2 max-h-48 overflow-auto rounded-lg bg-rose-50 p-3 text-xs text-rose-900">{result.errors.slice(0,12).map((v,i)=><li key={i} className="py-1">• {v}</li>)}{result.errors.length>12&&<li>+{result.errors.length-12} more</li>}</ul>}
     </div>
     {canEdit&&<button type="button" data-testid="close-coco79-test-shift" onClick={finish} disabled={!result.ready} className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Finalize TEST Shift (No Production Write)</button>}
     {shift.status==='CLOSED'&&<p className="rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-900">Test Shift #{shift.number} closed in isolated memory. No real shift was closed.</p>}
   </div>}
   {phase==='DSR'&&<div className="space-y-4" data-testid="coco79-test-dsr">
     <div className="rounded-xl border border-amber-300 bg-amber-50 p-3"><h3 className="font-extrabold text-amber-950">COCO-79 · SIMULATED Daily Sales Report</h3><p className="mt-1 text-xs text-amber-900">Test report only. Not an official DSR, real sales ledger or verified stock reconciliation.</p></div>
     <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
       {[['Shifts closed',dsr.shiftsClosed+'/3'],['Net Sales',fmt(dsr.netL,3)+' L'],['Tanker Receipts',fmt(dsr.receiptsL,3)+' L'],['Test Revenue','₹ '+fmt(dsr.revenue)]].map(([label,v])=>
         <div key={label} className="rounded-lg border bg-white p-3"><p className="text-xs text-slate-500">{label}</p><p className="text-lg font-bold text-[#17365D]">{v}</p></div>)}
     </div>
     <div className="rounded-xl border bg-white p-3"><h4 className="mb-2 font-bold">Product-wise test sales</h4><div className="overflow-x-auto"><table className="w-full"><thead className="bg-slate-100"><tr><TH>Fuel</TH><TH>Net litres</TH><TH>Sales ₹</TH></tr></thead><tbody>
       {dsr.products.map(p=><tr key={p.fuel} className="border-b"><TD>{p.fuel}</TD><TD>{fmt(p.netL,3)}</TD><TD>{fmt(p.revenue)}</TD></tr>)}
     </tbody></table></div></div>
     <div className="rounded-xl border bg-white p-3"><h4 className="mb-2 font-bold">Shift history</h4><div className="overflow-x-auto"><table className="w-full"><thead className="bg-slate-100"><tr><TH>Shift</TH><TH>Status</TH><TH>Net litres</TH><TH>Value</TH></tr></thead><tbody>
       {day.shifts.map(s=>{const v=evaluateTestShift(s);return <tr key={s.number} className="border-b"><TD>{s.label}</TD><TD>{s.status}</TD><TD>{fmt(v.netL,3)}</TD><TD>₹{fmt(v.revenue)}</TD></tr>;})}
     </tbody></table></div></div>
     {dsr.completed&&<p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">PASS: Three example shifts completed, 7 tanks and 20 nozzles reconciled for each shift, payments balanced. Test-only DSR generated.</p>}
     <button type="button" onClick={exportDsr} className="rounded-lg bg-[#17365D] px-4 py-2 text-sm font-bold text-white">Export SIMULATED DSR (CSV)</button>
   </div>}
   <p className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">TEST ISOLATION: This workspace has no mutation API calls, does not create outlet equipment or assign draft calibration charts, and never writes D1 transactions. Use authorised engineering approval and verified dimensions before converting dip readings to live stock.</p>
 </section>;
};