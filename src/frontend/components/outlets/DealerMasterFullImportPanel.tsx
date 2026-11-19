import React,{useMemo,useState} from 'react';
import * as XLSX from 'xlsx';
import {FileSpreadsheet,Download,LockKeyhole,CheckCircle2} from 'lucide-react';
import type {RetailOutlet} from '../../../shared/types';
import type {DealerMasterRow} from '../../../shared/dealerMasterImport';
import {reconcileFullDealerExcel} from '../../../shared/dealerMasterFullReconcile';

type Props={
  sourceRows:DealerMasterRow[];existingOutlets:RetailOutlet[];
  protectedBySourceRow:Record<number,string[]>;
  fileName:string;fileSha256:string;
  onDownloadCityPin:()=>void;
  onUploadCityPin:(event:React.ChangeEvent<HTMLInputElement>)=>void;
};

export function DealerMasterFullImportPanel({
  sourceRows,existingOutlets,protectedBySourceRow,fileName,fileSha256,
  onDownloadCityPin,onUploadCityPin,
}:Props){
  const [onlyDifferences,setOnlyDifferences]=useState(false);
  const review=useMemo(()=>reconcileFullDealerExcel(sourceRows,existingOutlets,protectedBySourceRow),
    [sourceRows,existingOutlets,protectedBySourceRow]);
  const toShow=onlyDifferences?review.rows.filter(row=>row.updatedFields.length||row.status.includes('REVIEW')):review.rows;

  function downloadReview(){
    const book=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
      ['IOCL FULL EXCEL IMPORT — READ-ONLY COMPARISON'],
      ['Uploaded file',fileName],['Source SHA-256',fileSha256],
      ['Policy','ALL Excel populated cells included (yellow AND non-yellow)'],
      ['Deduplication','Match on CUSTCODE / RO Code; do not create duplicates'],
      ['Existing rows','Changed fields marked UPDATE_PROPOSED, not overwritten'],
      ['Blank source','Never delete existing database values'],
      ['Land/Lease module','Stored values NOT VERIFIED until live Worker + migration preflight'],
      ['Import execution','LOCKED — ZERO DATABASE WRITES'],
      ['All Excel outlets',sourceRows.length],
      ['New RO Code candidates',review.newCandidates],
      ['Existing RO Code matches',review.matched],
      ['Existing ROs with proposed field updates',review.proposedUpdates],
      ['New ROs missing City/PIN',review.missingCityPin],
    ]),'Read First');
    XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(review.rows),'RO Review');
    XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(review.fields),'All 26 Fields');
    XLSX.writeFile(book,'IOCL_Full_Excel_Duplicate_Review.xlsx');
  }
  return <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-4" data-testid="dealer-master-full-excel-mode">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="text-base font-bold text-[#17365D] flex items-center gap-2"><FileSpreadsheet className="w-4 h-4"/>Full Excel Import — simple 3-step review</h3>
        <p className="text-xs text-slate-600">Yellow and non-yellow values are both included. Your original Excel is not edited.</p>
      </div>
      <span className="text-xs font-bold text-emerald-700"><CheckCircle2 className="inline w-3.5 h-3.5 mr-1"/>26/26 source fields included</span>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
      {([
        ['Excel outlets',sourceRows.length],
        ['New RO candidates',review.newCandidates],
        ['Existing matches',review.matched],
        ['Potential updates',review.proposedUpdates],
      ] as const).map(([title,value])=>
        <div key={title} className="bg-white border border-blue-100 rounded-lg p-3">
          <div className="text-xl font-bold text-[#17365D]">{value}</div>
          <p className="text-xs text-slate-600">{title}</p>
        </div>
      )}
    </div>
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs space-y-1">
      <p><strong>Step 1 — Uploaded:</strong> {sourceRows.length} Excel rows, all 26 columns, no colour exclusions.</p>
      <p><strong>Step 2 — Compare:</strong> RO Code matching identifies existing outlets; yellow cells are included. Different saved names/addresses/districts are proposed updates, not automatic replacements.</p>
      <p><strong>Step 3 — Confirm:</strong> Locked until verified City/PIN, hierarchy mapping, backend schema, database recovery point and source/lease review are complete.</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={downloadReview}
        className="inline-flex items-center gap-1 rounded-lg bg-[#17365D] text-white px-3 py-2 text-xs font-semibold">
        <Download className="w-3.5 h-3.5"/>Download duplicate & 26-field review
      </button>
      <button type="button" onClick={onDownloadCityPin}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold">City/PIN correction Excel</button>
      <label className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold cursor-pointer">
        Upload completed City/PIN
        <input aria-label="Upload City PIN supplement" type="file" accept=".xlsx" className="sr-only" onChange={onUploadCityPin}/>
      </label>
    </div>
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      <strong>Import readiness:</strong> {review.missingCityPin} new RO candidate(s) still lack verified City/PIN;
      {' '}{review.duplicateRows} duplicate Excel row(s); {review.archivedRows} archived/hidden RO match(es).
      Live production Land/Lease storage and the full snapshot API have not been verified.
      The legacy 131-row hierarchy REVIEW count is not a duplicate count.
    </div>
    <label className="inline-flex items-center gap-2 text-xs text-slate-700">
      <input type="checkbox" checked={onlyDifferences} onChange={e=>setOnlyDifferences(e.target.checked)}/>
      Show only proposed updates and blocked duplicates
    </label>
    <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-[740px] w-full text-xs text-left">
        <thead className="sticky top-0 bg-slate-100">
          <tr>{['Excel Row','RO Code','Excel Name','Saved Name','Result','Proposed fields / review'].map(h=><th key={h} className="p-2">{h}</th>)}</tr>
        </thead>
        <tbody>{toShow.map(row=>
          <tr key={row.excelRow} className="border-t border-slate-100">
            <td className="p-2">{row.excelRow}</td>
            <td className="p-2 font-mono">{row.roCode}</td>
            <td className="p-2">{row.excelOutletName}</td>
            <td className="p-2">{row.existingOutletName||'—'}</td>
            <td className="p-2 font-semibold">{row.status==='NEW_CANDIDATE'?'NEW CANDIDATE':row.status==='EXISTING_MATCH'?'RO CODE MATCH':'REVIEW'}</td>
            <td className="p-2">{row.updatedFields.join(', ')||row.issues.slice(0,2).join('; ')||'No core-field changes detected'}</td>
          </tr>
        )}</tbody>
      </table>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
      <p className="text-xs text-slate-600">Full Excel upload, D1 directory comparison and export work now; no RO, owner or lease data is written.</p>
      <button type="button" disabled className="inline-flex items-center gap-2 rounded-lg bg-slate-300 text-slate-600 px-4 py-2 font-bold text-xs cursor-not-allowed">
        <LockKeyhole className="w-4 h-4"/>Confirm Full Import — Locked
      </button>
    </div>
  </section>;
}
