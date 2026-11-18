import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, RefreshCw, UploadCloud } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../../shared/constants';
import type { Division, RetailOutlet, SalesArea } from '../../../shared/types';
import { buildDealerImportPlan, parseDealerMasterRows, type DealerMasterRow, type ImportPlan } from '../../../shared/dealerMasterImport';

type Action = ImportPlan['action'];
type UploadResult = { roCode: string; status: 'SUCCESS' | 'FAILED'; message: string };

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

  async function preview(rows: DealerMasterRow[]) {
    const env = await loadEnvironment();
    const next = buildDealerImportPlan(rows, env.outlets, env.divisions, env.areas);
    setPlan(next); setReviewed(false); setResults([]);
    return next;
  }

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(''); setPlan([]); setSourceRows([]); setReviewed(false); setResults([]);
    if (!/\.(xlsx|xls)$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      setError('Choose an Excel .xlsx or .xls workbook smaller than 5 MB.'); return;
    }
    setBusy(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, {type:'array', cellDates:true});
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw Error('Workbook has no worksheet');
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {defval:'', raw:false});
      if (raw.length === 0 || raw.length > 1000) throw Error('Workbook must have 1 to 1000 outlet rows.');
      const rows = parseDealerMasterRows(raw);
      if (!rows.some(r => r.roCode && r.name)) throw Error('CUSTCODE and CUSTOMER NAME columns could not be detected. Please use the dealer master format.');
      setSourceRows(rows); setFileName(file.name);
      await preview(rows);
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
    if (busy || !reviewed || !authorized || !plan.length) return;
    setBusy(true);setError('');setResults([]);
    try {
      // Re-read DB and require a fresh identical preview to avoid importing against stale data.
      const env = await loadEnvironment();
      const fresh = buildDealerImportPlan(sourceRows, env.outlets, env.divisions, env.areas);
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
      setPlan(buildDealerImportPlan(sourceRows, current.outlets, current.divisions, current.areas));
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
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 flex flex-wrap items-center gap-3">
        <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-[#17365D] text-white px-4 py-2 text-sm font-semibold">
          <UploadCloud className="w-4 h-4"/>Choose Excel File
          <input aria-label="Choose dealer master Excel" type="file" accept=".xlsx,.xls" className="sr-only" disabled={busy} onChange={onFileChange}/>
        </label>
        <span className="text-xs text-slate-600">{fileName || 'Select the IOCL Dealer Master workbook (.xlsx)'}</span>
        {sourceRows.length > 0 && <button type="button" disabled={busy} onClick={refreshPreview} className="ml-auto flex items-center gap-1 border border-slate-300 px-3 py-2 rounded-lg text-xs font-semibold"><RefreshCw className="w-3.5 h-3.5"/>Refresh DB Preview</button>}
      </div>
      {error && <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs"><AlertTriangle className="inline h-4 w-4 mr-2"/>{error}</div>}
      {plan.length > 0 && <>
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
          <label className="text-xs text-slate-700 flex items-start gap-2 max-w-xl"><input type="checkbox" checked={reviewed} disabled={busy || totals.create+totals.update===0} onChange={e=>setReviewed(e.target.checked)}/>I reviewed the change list and authorize the proposed outlet creates/updates. Skipped rows remain unchanged.</label>
          <button type="button" disabled={busy||!reviewed||totals.create+totals.update===0} onClick={apply} className="px-4 py-2 rounded-lg bg-orange-600 disabled:opacity-40 text-white text-sm font-bold">{busy?'Processing…': 'Approve & Sync '+(totals.create+totals.update)+' Outlet(s)'}</button>
        </div>
      </>}
      {results.length>0 && <div className="p-3 border rounded-xl text-xs space-y-2" aria-live="polite"><div className="font-semibold">Last attempt: {results.filter(r=>r.status==='SUCCESS').length} successful, {results.filter(r=>r.status==='FAILED').length} failed.</div>
        {results.filter(r=>r.status==='FAILED').map(r=><div key={r.roCode} className="text-rose-700">{r.roCode}: {r.message}</div>)}
        <div className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-4 h-4"/>Successful changes were audited through the existing outlet API. Import is not transactional.</div>
      </div>}
    </section>
  );
}
