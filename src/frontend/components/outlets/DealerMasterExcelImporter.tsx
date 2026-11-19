import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, RefreshCw, UploadCloud } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../../shared/constants';
import type { Division, RetailOutlet, SalesArea } from '../../../shared/types';
import { buildDealerImportPlan, classifyDealerSite, dealerMappingKey, parseDealerMasterRows, type DealerImportMappings, type DealerMasterRow, type ImportPlan } from '../../../shared/dealerMasterImport';
import { dealerMasterFieldCatalog, normalizedDealerHeader, summarizeDealerFieldCoverage, type DealerFieldCoverage } from '../../../shared/dealerMasterFieldCoverage';
import {readYellowProtectionFromXlsx} from '../../../shared/dealerMasterXlsxColors';
import {DealerMasterStage4Panel} from './DealerMasterStage4Panel';

type Action = ImportPlan['action'];
type UploadResult = { roCode: string; status: 'SUCCESS' | 'FAILED'; message: string };

const DEALER_LIVE_READ_ONLY_TRIAL = true;

export function DealerMasterExcelImporter({ onCompleted }: { onCompleted: () => void }) {
  const { userCtx, hasPermission } = useAuth();
  const authorized = !!userCtx?.isGlobalScope
    && hasPermission(PERMISSIONS.OUTLETS_CREATE)
    && hasPermission(PERMISSIONS.OUTLETS_UPDATE);
  const [fileName, setFileName] = useState('');
  const [sourceRows, setSourceRows] = useState<DealerMasterRow[]>([]);
  const [plan, setPlan] = useState<ImportPlan[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [showOnlyProblems, setShowOnlyProblems] = useState(false);
  const [fieldCoverage,setFieldCoverage]=useState<DealerFieldCoverage[]>([]);
  const [fullMasterWorkbook,setFullMasterWorkbook]=useState(false);
  const [protectedFormatVerified,setProtectedFormatVerified]=useState(false);
  const [formatWarning,setFormatWarning]=useState('');
  const [protectedCells,setProtectedCells]=useState<Record<number,string[]>>({});
  const [yellowCellCount,setYellowCellCount]=useState(0);
  const [fileSha256,setFileSha256]=useState('');
  const [supplementSha256,setSupplementSha256]=useState('');
  const originalWorkbookRef=useRef<ArrayBuffer|null>(null);
  const [mappings, setMappings] = useState<DealerImportMappings>({});
  type Environment = {outlets:RetailOutlet[];divisions:Division[];areas:SalesArea[]};
  const environmentRef = useRef<Environment|null>(null);
  const [options, setOptions] = useState<Environment|null>(null);
  const sourceOffices = useMemo(()=>[...new Set(sourceRows.map(r=>dealerMappingKey(r.salesOffice)))].filter(Boolean),[sourceRows]);
  const sourceAreas = useMemo(()=>[...new Set(sourceRows.map(r=>dealerMappingKey(r.salesArea)))].filter(Boolean),[sourceRows]);
  const unknownSites = useMemo(()=>[...new Set(sourceRows.map(r=>dealerMappingKey(r.siteDescription)))].filter(site=>site && !classifyDealerSite(site)),[sourceRows]);

  function changeMapping(kind:keyof DealerImportMappings, key:string, value:string) {
    const next = {...mappings,[kind]:{...(mappings[kind]||{}),[key]:value}};
    setMappings(next);setReviewed(false);setResults([]);
    if(environmentRef.current) {
      const env=environmentRef.current;
      setPlan(buildDealerImportPlan(sourceRows,env.outlets,env.divisions,env.areas,next));
    }
  }
  function getDivisionId(office:string) {
    const key=dealerMappingKey(office);
    return mappings.divisionIdsByOffice?.[key] ||
      (options?.divisions.filter(d=>dealerMappingKey(d.name)===key).length===1
        ? options.divisions.find(d=>dealerMappingKey(d.name)===key)?.id : '') || '';
  }
  function exportCorrectionWorkbook() {
    if(!sourceRows.length)return;
    // A standalone supplement preserves the ORIGINAL workbook's yellow formatting.
    // Never re-export the master using community SheetJS: cell fills may be lost.
    const supplemental=sourceRows.map(r=>({CUSTCODE:r.roCode,CITY:r.city||'',PINCODE:r.pincode||''}));
    const workbook=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(supplemental),'City_PIN_Supplement');
    XLSX.writeFile(workbook,'IOCL_Dealer_City_PIN_Supplement.xlsx');
  }
  async function loadCityPinSupplement(event:React.ChangeEvent<HTMLInputElement>) {
    const file=event.target.files?.[0];event.target.value='';
    if(!file)return;
    setError('');
    try {
      if(!originalWorkbookRef.current)throw Error('Upload the original highlighted master workbook first.');
      if(!file.name.toLowerCase().endsWith('.xlsx')||file.size>2*1024*1024)
        throw Error('Select the completed City/PIN supplement (.xlsx, under 2 MB).');
      const supplementBytes=await file.arrayBuffer();
      const workbook=XLSX.read(supplementBytes,{type:'array'});
      const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(workbook.Sheets[workbook.SheetNames[0]],{defval:'',raw:false});
      const amended=new Map<string,{city:string;pincode:string}>();
      for(const item of rows){
        const code=String(item.CUSTCODE||'').trim();
        if(!code)continue;
        if(amended.has(code))throw Error('Duplicate RO code in City/PIN supplement: '+code);
        const city=String(item.CITY||'').trim(),pin=String(item.PINCODE||'').trim();
        if((city||pin)&&(!city||!/^\\d{6}$/.test(pin)))
          throw Error('Complete the verified City and six-digit PIN for RO '+code);
        if(city)amended.set(code,{city,pincode:pin});
      }
      const unknown=[...amended.keys()].filter(code=>!sourceRows.some(r=>r.roCode===code));
      if(unknown.length)throw Error('Supplement contains unknown RO codes: '+unknown.slice(0,5).join(', '));
      const combined=sourceRows.map(r=>{
        const matched=amended.get(r.roCode);
        return matched?{...r,city:matched.city,pincode:matched.pincode}:r;
      });
      const digest=await crypto.subtle.digest('SHA-256',supplementBytes);
      setSupplementSha256(Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join(''));
      setSourceRows(combined);
      await preview(combined,mappings);
    }catch(e){setError(e instanceof Error?e.message:'City/PIN supplement could not be read');}
  }

  const totals = useMemo(() => ({
    create: plan.filter(p => p.action === 'CREATE').length,
    update: plan.filter(p => p.action === 'UPDATE').length,
    unchanged: plan.filter(p => p.action === 'UNCHANGED').length,
    review: plan.filter(p => p.action === 'REVIEW').length,
  }), [plan]);

  async function loadEnvironment() {
    // Fetch fresh DB state for each preview, including archived outlets.
    const [outletRes, divisionRes, areaRes] = await Promise.all([
      apiFetch<RetailOutlet[]>('/api/v1/outlets?includeArchived=true'),
      apiFetch<Division[]>('/api/v1/hierarchy/divisions'),
      apiFetch<SalesArea[]>('/api/v1/hierarchy/sales-areas'),
    ]);
    if (!outletRes.success || !Array.isArray(outletRes.data)) throw Error(outletRes.error?.message || 'Failed to load current outlet records');
    if (!divisionRes.success || !Array.isArray(divisionRes.data)) throw Error(divisionRes.error?.message || 'Failed to load divisional hierarchy');
    if (!areaRes.success || !Array.isArray(areaRes.data)) throw Error(areaRes.error?.message || 'Failed to load sales-area hierarchy');
    return {outlets:outletRes.data, divisions:divisionRes.data, areas:areaRes.data};
  }

  async function preview(rows: DealerMasterRow[], currentMappings:DealerImportMappings=mappings) {
    const env = await loadEnvironment();
    environmentRef.current=env;setOptions(env);
    const next = buildDealerImportPlan(rows, env.outlets, env.divisions, env.areas,currentMappings);
    setPlan(next); setReviewed(false); setResults([]);
    return next;
  }

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(''); setPlan([]); setSourceRows([]); setReviewed(false); setResults([]);setMappings({});setOptions(null);environmentRef.current=null;setFieldCoverage([]);setFullMasterWorkbook(false);setProtectedFormatVerified(false);setFormatWarning('');setProtectedCells({});setYellowCellCount(0);setFileSha256('');setSupplementSha256('');originalWorkbookRef.current=null;
    if (!/\.(xlsx|xls)$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      setError('Choose an Excel .xlsx or .xls workbook smaller than 5 MB.'); return;
    }
    setBusy(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, {type:'array', cellDates:true, cellStyles:true, bookStyles:true} as XLSX.ParsingOptions);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw Error('Workbook has no worksheet');
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {defval:'', raw:false});
      const headers = (XLSX.utils.sheet_to_json<unknown[]>(sheet, {header:1,defval:'',raw:false})[0] || []).map(String);
      const detectedFullMaster=dealerMasterFieldCatalog.every(f=>headers.some(h=>normalizedDealerHeader(h)===normalizedDealerHeader(f.header)));
      const actualLastRow=sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']).e.r+1 : raw.length+1;
      // A blank Excel row must not shift subsequent yellow-cell protection.
      const scannedRowCount=Math.max(raw.length,actualLastRow-1);
      const protections=file.name.toLowerCase().endsWith('.xlsx')
        ? readYellowProtectionFromXlsx(data,headers,scannedRowCount)
        : {verified:false,protectedBySourceRow:{},protectedCellCount:0,
            reason:'Full Dealer Master import requires .xlsx with original formatting.'};
      setFullMasterWorkbook(detectedFullMaster);
      originalWorkbookRef.current=data;
      const digest=await crypto.subtle.digest('SHA-256',data);
      setFileSha256(Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join(''));
      setProtectedCells(protections.protectedBySourceRow);
      setYellowCellCount(protections.protectedCellCount);
      setProtectedFormatVerified(protections.verified);
      setFormatWarning(protections.reason||'');
      setFieldCoverage(summarizeDealerFieldCoverage(raw,protections.protectedBySourceRow));
      if (raw.length === 0 || raw.length > 1000) throw Error('Workbook must have 1 to 1000 outlet rows.');
      const rows = parseDealerMasterRows(raw);
      if (!rows.some(r => r.roCode && r.name)) throw Error('CUSTCODE and CUSTOMER NAME columns could not be detected. Please use the dealer master format.');
      setSourceRows(rows); setFileName(file.name);
      await preview(rows,{});
    } catch(e) {setError(e instanceof Error ? e.message:'Unable to read workbook');}
    finally {setBusy(false);}
  }

  async function refreshPreview() {
    if (!sourceRows.length || busy) return;
    setBusy(true); setError('');
    try {await preview(sourceRows);} catch(e) {setError(e instanceof Error?e.message:'Refresh failed');}
    finally {setBusy(false);}
  }

  function fingerprint(item: ImportPlan) {
    return JSON.stringify([item.action, item.row.roCode, item.existingId, item.payload, item.changes]);
  }

  async function apply() {
    if (DEALER_LIVE_READ_ONLY_TRIAL) return; // Production live preview must never write source records.
    if (busy || !reviewed || !authorized || !plan.length || fullMasterWorkbook || !protectedFormatVerified) return;
    setBusy(true);setError('');setResults([]);
    try {
      // Re-read DB and require a fresh identical preview to avoid importing against stale data.
      const env = await loadEnvironment();
      const fresh = buildDealerImportPlan(sourceRows, env.outlets, env.divisions, env.areas,mappings);
      if (fresh.length !== plan.length || fresh.some((item,i) => fingerprint(item) !== fingerprint(plan[i]))) {
        setPlan(fresh);setReviewed(false);
        throw Error('Outlet data changed since preview. Review the refreshed plan and approve again.');
      }
      const outcome: UploadResult[] = [];
      // Existing routes independently validate scope and audit every create/update.
      // A failed record stops the batch to reduce risk of partial invalid imports.
      for (const item of fresh) {
        if (item.action !== 'CREATE' && item.action !== 'UPDATE') continue;
        if (!item.payload) continue;
        const isCreate = item.action === 'CREATE';
        const payload = isCreate ? item.payload : {
          name:item.payload.name, address:item.payload.address, district:item.payload.district,
          stateId:item.payload.stateId, divisionId:item.payload.divisionId,
          salesAreaId:item.payload.salesAreaId
        };
        try {
          const response = await apiFetch(
            isCreate ? '/api/v1/outlets' : '/api/v1/outlets/' + encodeURIComponent(item.existingId || ''),
            {method:isCreate?'POST':'PATCH', body:JSON.stringify(payload)},
          );
          if (!response.success) {
            outcome.push({roCode:item.row.roCode,status:'FAILED',message:response.error?.message || 'Rejected by server'});
            break;
          }
          outcome.push({roCode:item.row.roCode,status:'SUCCESS',message:isCreate?'Created':'Updated'});
        } catch (e) {
          outcome.push({roCode:item.row.roCode,status:'FAILED',message:e instanceof Error?e.message:'Network error'});
          break;
        }
        setResults([...outcome]);
      }
      setResults(outcome);
      setReviewed(false);
      // Refresh to show which records were applied; complete records will become UNCHANGED.
      const current = await loadEnvironment();
      setPlan(buildDealerImportPlan(sourceRows, current.outlets, current.divisions, current.areas,mappings));
      if (outcome.some(r=>r.status==='SUCCESS')) onCompleted();
    } catch(e) {setError(e instanceof Error?e.message:'Import failed');}
    finally {setBusy(false);}
  }

  if (!authorized) return <div className="p-4 border rounded-xl text-sm text-amber-800 bg-amber-50">Global administrator access with Outlet Create and Update permissions is required for master synchronization.</div>;
  return (
    <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4" data-testid="dealer-master-excel-importer">
      <div>
        <h2 className="text-lg font-bold text-[#17365D] flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-orange-500"/>Excel Import & Master Synchronization</h2>
        <p className="text-xs text-slate-600 mt-1">First-time create + future updates. Preview is read-only. Only approved, supported fields are written.</p>
      </div>
      {DEALER_LIVE_READ_ONLY_TRIAL && <div role="status" className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs font-semibold text-indigo-900">
        LIVE WEBSITE TEST · READ ONLY. Upload Excel and inspect all 26 columns, original yellow-cell protection and matched RO codes. No outlet, owner or agreement will be changed. Approve & Sync is disabled for this release.
      </div>}
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 flex flex-wrap items-center gap-3">
        <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-[#17365D] text-white px-4 py-2 text-sm font-semibold">
          <UploadCloud className="w-4 h-4"/>Choose Excel File
          <input aria-label="Choose dealer master Excel" type="file" accept=".xlsx,.xls" className="sr-only" disabled={busy} onChange={onFileChange}/>
        </label>
        <span className="text-xs text-slate-600">{fileName || 'Select the IOCL Dealer Master workbook (.xlsx)'}</span>
        {sourceRows.length > 0 && <button type="button" disabled={busy} onClick={refreshPreview} className="ml-auto flex items-center gap-1 border border-slate-300 px-3 py-2 rounded-lg text-xs font-semibold"><RefreshCw className="w-3.5 h-3.5"/>Refresh DB Preview</button>}
      </div>
      {error && <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs"><AlertTriangle className="inline h-4 w-4 mr-2"/>{error}</div>}
      {fieldCoverage.length>0&&<section className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50" data-testid="dealer-master-26-field-audit">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[#17365D]">26-column field coverage: RO Master + Land Ownership + Lease</h3>
          <span className={'text-xs font-bold '+(fullMasterWorkbook?'text-green-700':'text-amber-800')}>{fullMasterWorkbook?'All 26 columns recognized':'Nonstandard workbook: review headings'}</span>
        </div>
        <p className="text-xs text-slate-600">This audit is read-only. Yellow cells are marked protected; non-yellow populated cells are candidates for import only after validating the correct destination and current database record. Blank source cells stay unknown.</p>
        {!protectedFormatVerified&&<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">{formatWarning||'Cell colour verification unavailable.'} All imports are blocked until the original formatting can be verified.</p>}
        <div className="overflow-auto max-h-[380px] rounded-lg border border-slate-200">
          <table className="min-w-[850px] w-full text-xs text-left bg-white">
            <thead className="sticky top-0 bg-slate-200"><tr>
              <th className="p-2">Excel field</th><th className="p-2">Destination</th><th className="p-2">Protected yellow</th><th className="p-2">Remaining values</th><th className="p-2">Blank</th><th className="p-2">Storage readiness</th>
            </tr></thead>
            <tbody>{fieldCoverage.map(f=><tr key={f.header} className="border-t border-slate-100">
              <td className="p-2 font-semibold">{f.header}</td>
              <td className="p-2">{f.destination} · {f.target}</td>
              <td className="p-2 bg-yellow-50 font-semibold">{protectedFormatVerified?f.protectedCount:'—'}</td>
              <td className="p-2">{f.remainingCount}</td>
              <td className="p-2 text-slate-500">{f.blankCount}</td>
              <td className="p-2 text-slate-600">{f.readiness==='EXISTING_FIELD'?'Existing field':f.readiness==='MIGRATION_0037_REQUIRED'?'Schema/units review required':'New structured field required'}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="text-xs font-semibold text-amber-800">For this full 26-column file, the old outlet-only Sync is disabled. Use Stage 4 below after verified storage migration 0038 and an administrator-reviewed dry run. Yellow protection is extracted from original XLSX XML, not assumed from formatting-free exports.</p>
      </section>}
      {plan.length > 0 && <>
        <details open className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-3" data-testid="dealer-master-mapping">
          <summary className="font-bold text-sm text-[#17365D] cursor-pointer">Resolve Excel hierarchy labels once for all outlets</summary>
          <p className="text-xs text-slate-600 my-2">Your Excel uses names such as Chandigarh DO / Chandigarh South RSA. Select the corresponding existing organizational units. These choices affect only the import preview until you explicitly approve a sync.</p>
          <div className="grid md:grid-cols-2 gap-3 my-3">
            {sourceOffices.map(office=><label key={office} className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
              Sales Office in Excel: {office}
              <select aria-label={'Map Sales Office '+office} className="border rounded-lg bg-white p-2" value={mappings.divisionIdsByOffice?.[office]||''} onChange={e=>changeMapping('divisionIdsByOffice',office,e.target.value)}>
                <option value="">Use exact name (or choose match)</option>
                {options?.divisions.filter(d=>d.status!=='INACTIVE').map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>)}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {sourceAreas.map(area=>{
              const corresponding=sourceRows.find(r=>dealerMappingKey(r.salesArea)===area);
              const divisionId=getDivisionId(corresponding?.salesOffice||'');
              return <label key={area} className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                Sales Area in Excel: {area}
                <select aria-label={'Map Sales Area '+area} disabled={!divisionId} className="border rounded-lg bg-white p-2 disabled:opacity-50" value={mappings.areaIdsByName?.[area]||''} onChange={e=>changeMapping('areaIdsByName',area,e.target.value)}>
                  <option value="">{divisionId?'Use exact name (or choose match)':'Select Sales Office mapping first'}</option>
                  {options?.areas.filter(a=>a.divisionId===divisionId&&a.status!=='INACTIVE').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>;
            })}
          </div>
          {unknownSites.length>0 && <>
            <p className="text-xs font-semibold text-slate-700 mt-3">Unrecognized site classifications — choose only after checking IOCL definitions:</p>
            <div className="grid md:grid-cols-2 gap-3">
              {unknownSites.map(site=><label key={site} className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                {site}
                <select aria-label={'Map site type '+site} className="border rounded-lg bg-white p-2" value={mappings.outletTypesBySite?.[site]||''} onChange={e=>changeMapping('outletTypesBySite',site,e.target.value)}>
                  <option value="">Needs review — do not guess</option>
                  <option value="A_SITE">A Site</option><option value="COCO">COCO</option><option value="CODO">CODO</option>
                </select>
              </label>)}
            </div>
          </>}
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <button type="button" onClick={exportCorrectionWorkbook} className="border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold bg-white">Download City/PIN Supplement</button>
            <label className="border border-slate-300 bg-white px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer">
              Upload completed City/PIN Supplement
              <input type="file" accept=".xlsx" className="sr-only" onChange={loadCityPinSupplement}/>
            </label>
            <p className="text-xs text-slate-600">Supplement adds verified City/PIN by RO Code without destroying the original workbook's protected yellow colours.</p>
          </div>
        </details>
        {fullMasterWorkbook&&<DealerMasterStage4Panel
          sourceRows={sourceRows} protectedBySourceRow={protectedCells}
          supplementSha256={supplementSha256}
          protectedCount={yellowCellCount} verified={protectedFormatVerified}
          fileName={fileName} fileSha256={fileSha256} outletPlans={plan}
          onCompleted={onCompleted}
        />}
        {!fullMasterWorkbook&&<>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {([['Create',totals.create],['Update',totals.update],['Unchanged',totals.unchanged],['Needs review',totals.review]] as const).map(([label,count])=>
            <div key={label} className="bg-slate-50 border border-slate-200 rounded-lg p-3"><div className="text-xs text-slate-500">{label}</div><div className="text-xl font-bold text-[#17365D]">{count}</div></div>
          )}
        </div>
        <p className="text-xs text-amber-800">Unmatched hierarchies, unknown outlet types and incomplete new-outlet addresses are never guessed. Rows marked Needs review are skipped. Land/lease, phone, email and other unsupported columns are not imported.</p>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-700"><input type="checkbox" checked={showOnlyProblems} onChange={e=>setShowOnlyProblems(e.target.checked)}/>Show only records needing review</label>
        <div className="max-h-80 overflow-auto border border-slate-200 rounded-xl">
          <table className="min-w-[740px] w-full text-xs text-left">
            <thead className="sticky top-0 bg-slate-100 text-slate-700"><tr><th className="p-2">Excel row</th><th className="p-2">RO Code</th><th className="p-2">Outlet</th><th className="p-2">Action</th><th className="p-2">Reason / Changed fields</th></tr></thead>
            <tbody>{plan.filter(r=>!showOnlyProblems || r.action==='REVIEW').map((r,i)=><tr key={r.row.sourceRow+'-'+i} className="border-t border-slate-100">
              <td className="p-2">{r.row.sourceRow}</td><td className="p-2 font-mono">{r.row.roCode}</td><td className="p-2">{r.row.name}</td>
              <td className="p-2 font-semibold">{r.action}</td>
              <td className="p-2 text-slate-600">{r.messages.join('; ') || r.changes.join(', ') || 'Already matches'}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="flex flex-col md:flex-row justify-between gap-3 items-start md:items-center">
          <label className="text-xs text-slate-700 flex items-start gap-2 max-w-xl"><input type="checkbox" checked={reviewed} disabled={DEALER_LIVE_READ_ONLY_TRIAL || busy || fullMasterWorkbook || !protectedFormatVerified || totals.create+totals.update===0} onChange={e=>setReviewed(e.target.checked)}/>I reviewed the change list and authorize the proposed outlet creates/updates. Skipped rows remain unchanged.</label>
          <button type="button" disabled={DEALER_LIVE_READ_ONLY_TRIAL||busy||!reviewed||fullMasterWorkbook||!protectedFormatVerified||totals.create+totals.update===0} onClick={apply} className="px-4 py-2 rounded-lg bg-orange-600 disabled:opacity-40 text-white text-sm font-bold">{busy?'Processing…': 'Approve & Sync '+(totals.create+totals.update)+' Outlet(s)'}</button>
        </div>
        </>}
      </>}
      {results.length>0 && <div className="p-3 border rounded-xl text-xs space-y-2" aria-live="polite"><div className="font-semibold">Last attempt: {results.filter(r=>r.status==='SUCCESS').length} successful, {results.filter(r=>r.status==='FAILED').length} failed.</div>
        {results.filter(r=>r.status==='FAILED').map(r=><div key={r.roCode} className="text-rose-700">{r.roCode}: {r.message}</div>)}
        <div className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-4 h-4"/>Successful changes were audited through the existing outlet API. Import is not transactional.</div>
      </div>}
    </section>
  );
}
