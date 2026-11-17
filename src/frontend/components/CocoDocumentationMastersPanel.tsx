import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../../shared/constants';
import { CheckCircle2, ClipboardList, FileText, RefreshCw, Save, ShieldCheck } from 'lucide-react';

interface Agreement {
  id: string; outletId: string; agreementType: string; agreementName: string; agreementNumber: string | null;
  linkedNfrLeaseId: string | null; counterpartyName: string | null; vendorCode: string | null;
  customerCode: string | null; siteClass: string | null; startDate: string | null; endDate: string | null;
  agreementDocumentId: string | null; remarks: string | null;
}
interface Claim {
  id: string; title: string; outletId: string; claimCategory: string;
  invoiceNumber: string | null; periodStart: string | null; periodEnd: string | null;
  dueDate: string | null; amountPaise: number; approvalStatus: string;
  invoiceDocumentId: string | null; remarks: string | null; createdBy: string;
  paidPaise: number; outstandingPaise: number; settlementStatus: string;
}
interface Asset {
  id: string; name: string; assetCode: string; equipmentType: string; manufacturer: string | null;
}
interface Inspection {
  id: string; equipmentAssetId: string; condition: string; inspectedOn: string;
  nextServiceDate: string | null; remarks: string | null;
}
interface NfrLease { id: string; agreementNumber: string; leaseStartDate: string; leaseEndDate: string; }
interface VaultDocument { id: string; name: string; outletId: string | null; }
interface MasterResponse {
  agreements: Agreement[]; claims: Claim[]; inspections: Inspection[]; assets: Asset[];
  nfrLeases: NfrLease[];
}
const categories = [
  ['WEIGHTS_MEASURES_STAMPING_CHARGES', 'Weights & Measures Stamping Charges'],
  ['FIRE_EXTINGUISHER_REFILLING_CHARGES', 'Fire Extinguisher Refilling Charges'],
  ['UNIFORM_CHARGES', 'Uniform Charges'],
  ['WAGES_INCENTIVES_MISC', 'Wages, Incentives & Miscellaneous Bills'],
  ['OTHER_CLAIM', 'Other Claim / Expense'],
];
const agreementTypes = [
  ['LAND_LEASE', 'Land Lease'], ['SERVICE_PROVIDER', 'Service Provider Contract Agreement'],
  ['OTHER', 'Other Agreement'], ['NFR_METADATA', 'Additional NFR Lease Details'],
];
const money = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function toPaise(value: string): number {
  const clean = value.trim();
  if (!/^\d{1,14}(\.\d{1,2})?$/.test(clean)) throw new Error('Enter a valid positive amount with at most 2 decimals.');
  const [rupees, fraction = ''] = clean.split('.');
  const paise = BigInt(rupees) * 100n + BigInt((fraction + '00').slice(0, 2));
  if (paise <= 0n || paise > 9000000000000000n) throw new Error('Amount must be greater than zero and within the allowed limit.');
  return Number(paise);
}
const col = 'bg-white border border-[#E2E8F0] rounded-xl p-4 sm:p-5 space-y-3';
const inputStyle = 'w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#17365D] focus:border-orange-500 focus:outline-none';
const labelStyle = 'block text-xs font-semibold text-[#475569] mb-1';
const buttonStyle = 'inline-flex items-center justify-center gap-2 rounded-lg bg-[#17365D] text-white text-sm font-semibold px-4 py-2.5 disabled:opacity-40';
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) =>
  <label className="block min-w-0"><span className={labelStyle}>{label}</span>{children}</label>;
const dateValue = (value?: string | null) => value || '';

export const CocoDocumentationMastersPanel: React.FC<{
  outletId: string;
  vaultDocs: VaultDocument[];
  onSaved?: () => void;
}> = ({ outletId, vaultDocs, onSaved }) => {
  const { userCtx, hasPermission } = useAuth();
  const canWrite = hasPermission(PERMISSIONS.DOCUMENTS_WRITE);
  const canInspect = canWrite && hasPermission(PERMISSIONS.EQUIPMENT_ASSETS_WRITE);
  const canApprove = Boolean(userCtx?.isGlobalAdmin);
  const [data, setData] = useState<MasterResponse | null>(null);
  const [rev, setRev] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeEditor, setActiveEditor] = useState<'agreements'|'claims'|'inspections'>('agreements');
  const [agreementEdit, setAgreementEdit] = useState<Agreement | null>(null);
  const [claimEdit, setClaimEdit] = useState<Claim | null>(null);
  const [settleClaim, setSettleClaim] = useState<Claim | null>(null);
  const [agreementType, setAgreementType] = useState('LAND_LEASE');

  const refresh = useCallback(() => setRev((v) => v + 1), []);
  useEffect(() => {
    if (!outletId) { setData(null); return; }
    let alive = true;
    setLoading(true); setData(null); setError('');
    apiFetch<MasterResponse>('/api/v1/documents/compliance/masters?outletId=' + encodeURIComponent(outletId))
      .then((res) => {
        if (!alive) return;
        if (res.success && res.data) setData(res.data);
        else setError(res.error?.message || 'Could not retrieve documentation master records.');
      }).catch((e) => { if (alive) setError(e?.message || 'Network error.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [outletId, rev]);
  useEffect(() => {
    setAgreementEdit(null); setClaimEdit(null); setSettleClaim(null); setAgreementType('LAND_LEASE');
  }, [outletId]);

  const submit = async (endpoint: string, method: 'POST' | 'PUT', payload: unknown, done: string) => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await apiFetch(endpoint, { method, body: JSON.stringify(payload) });
      if (!res.success) { setError(res.error?.message || 'Could not save record.'); return false; }
      setSuccess(done); refresh(); onSaved?.();
      return true;
    } catch (e: any) { setError(e?.message || 'Network error while saving.'); return false; }
    finally { setSaving(false); }
  };
  const base = '/api/v1/documents/compliance/masters';
  const onAgreementSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload = {
      outletId, agreementType: f.get('agreementType'),
      agreementName: f.get('agreementName'),
      agreementNumber: f.get('agreementNumber') || null,
      linkedNfrLeaseId: f.get('linkedNfrLeaseId') || null,
      counterpartyName: f.get('counterpartyName') || null,
      vendorCode: f.get('vendorCode') || null,
      customerCode: f.get('customerCode') || null,
      siteClass: f.get('siteClass') || null,
      startDate: f.get('startDate') || null,
      endDate: f.get('endDate') || null,
      agreementDocumentId: f.get('agreementDocumentId') || null,
      remarks: f.get('remarks') || null,
    };
    if (await submit(
      agreementEdit ? base + '/agreements/' + agreementEdit.id : base + '/agreements',
      agreementEdit ? 'PUT' : 'POST', payload, 'Agreement saved and available to section-wise PDF.'
    )) {
      setAgreementEdit(null);
    }
  };
  const onClaimSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    let amountPaise = 0;
    try { amountPaise = toPaise(String(f.get('amount') || '')); }
    catch (e: any) { setError(e?.message || 'Invalid amount.'); return; }
    const payload = {
      outletId, claimCategory: f.get('claimCategory'),
      title: f.get('title'), invoiceNumber: f.get('invoiceNumber') || null,
      periodStart: f.get('periodStart') || null,
      periodEnd: f.get('periodEnd') || null, dueDate: f.get('dueDate') || null,
      amountPaise, invoiceDocumentId: f.get('invoiceDocumentId') || null,
      remarks: f.get('remarks') || null,
    };
    if (await submit(
      claimEdit ? base + '/claims/' + claimEdit.id : base + '/claims',
      claimEdit ? 'PUT' : 'POST', payload, 'Draft claim saved. Approval is required before settlement.'
    )) setClaimEdit(null);
  };
  const onInspectionSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload = {
      outletId, equipmentAssetId: f.get('equipmentAssetId'), inspectedOn: f.get('inspectedOn'),
      condition: f.get('condition'), nextServiceDate: f.get('nextServiceDate') || null,
      evidenceDocumentId: f.get('evidenceDocumentId') || null, remarks: f.get('remarks') || null,
    };
    await submit(base + '/inspections', 'POST', payload, 'Equipment inspection saved and linked to the report.');
  };
  const onSettlementSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!settleClaim) return;
    const f = new FormData(e.currentTarget);
    let amountPaise = 0;
    try { amountPaise = toPaise(String(f.get('amount') || '')); }
    catch (e: any) { setError(e?.message || 'Invalid amount.'); return; }
    if (await submit(base + '/claims/' + settleClaim.id + '/settlements', 'POST', {
      amountPaise, paymentDate: f.get('paymentDate'),
      paymentMethod: f.get('paymentMethod'),
      referenceNumber: f.get('referenceNumber'),
      receiptDocumentId: f.get('receiptDocumentId'), remarks: f.get('remarks') || null,
    }, 'Payment evidence saved; outstanding claim balance recalculated.')) setSettleClaim(null);
  };
  const onDecision = async (claim: Claim, decision: 'APPROVED'|'REJECTED') => {
    if (!window.confirm(decision === 'APPROVED'
      ? 'Approve this expense claim for settlement?'
      : 'Reject this draft expense claim?')) return;
    await submit(base + '/claims/' + claim.id + '/decision', 'POST', { decision },
      decision === 'APPROVED' ? 'Claim approved.' : 'Claim rejected.');
  };
  const docs = vaultDocs.filter((d) => d.outletId === outletId);
  const docOptions = (name: string, required = false) => (
    <select name={name} required={required} className={inputStyle}>
      <option value="">{required ? 'Select uploaded receipt' : 'No document linked'}</option>
      {docs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
    </select>
  );

  return (
    <div className="space-y-5">
      <div className={col}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-[#17365D]">Documentation Masters &amp; Evidence</h3>
            <p className="text-sm text-[#64748B]">Save agreement details, verified expense payments and equipment inspections for the five-page PDF.</p>
          </div>
          <button className="inline-flex items-center gap-2 px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg" onClick={refresh} disabled={loading}>
            <RefreshCw className="w-4 h-4"/> Refresh
          </button>
        </div>
        {error && <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
        {success && <div role="status" className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm">{success}</div>}
        {loading && <div className="text-sm text-[#64748B]">Loading source records…</div>}
        {!canWrite && <div className="text-sm text-[#64748B]">You have read-only access; contact an authorized manager to update records.</div>}
      </div>
      <div className="flex flex-wrap gap-2">
        {([['agreements', 'Lease & Agreements'], ['claims', 'Claims & Settlements'], ['inspections', 'Asset Inspections']] as const)
          .map(([id, label]) => (
          <button key={id} type="button" onClick={() => setActiveEditor(id)}
            className={'px-4 py-2 text-sm font-medium rounded-lg border ' +
              (activeEditor === id ? 'bg-[#17365D] border-[#17365D] text-white' : 'bg-white text-[#17365D] border-[#CBD5E1]')}>
            {label}
          </button>
        ))}
      </div>

      {activeEditor === 'agreements' && (
        <div className="space-y-4">
          {canWrite && (
            <form key={agreementEdit?.id || 'new-agreement'} onSubmit={onAgreementSubmit} className={col}>
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-[#17365D]">{agreementEdit ? 'Edit Agreement' : 'Register Agreement'}</h4>
                {agreementEdit && <button type="button" onClick={() => { setAgreementEdit(null); setAgreementType('LAND_LEASE'); }} className="text-sm underline text-[#64748B]">New agreement</button>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <Field label="Agreement Type">
                  <select name="agreementType" className={inputStyle} value={agreementType}
                    onChange={(e) => setAgreementType(e.target.value)}>
                    {agreementTypes.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Agreement Title">
                  <input name="agreementName" required maxLength={180} className={inputStyle}
                    defaultValue={agreementEdit?.agreementName || (agreementType === 'LAND_LEASE' ? 'Land Lease' : '')} />
                </Field>
                <Field label="Agreement Number">
                  <input name="agreementNumber" maxLength={100} className={inputStyle} defaultValue={agreementEdit?.agreementNumber || ''}/>
                </Field>
                {agreementType === 'NFR_METADATA' ? (
                  <Field label="Existing NFR Lease">
                    <select name="linkedNfrLeaseId" required className={inputStyle} defaultValue={agreementEdit?.linkedNfrLeaseId || ''}>
                      <option value="">Select NFR agreement</option>
                      {data?.nfrLeases.map((l) => <option key={l.id} value={l.id}>{l.agreementNumber}</option>)}
                    </select>
                  </Field>
                ) : (
                  <>
                    <Field label="Agreement Start Date"><input name="startDate" type="date" className={inputStyle} defaultValue={dateValue(agreementEdit?.startDate)}/></Field>
                    <Field label="Agreement End Date"><input name="endDate" type="date" className={inputStyle} defaultValue={dateValue(agreementEdit?.endDate)}/></Field>
                  </>
                )}
                <Field label="Agreement With / Counterparty">
                  <input name="counterpartyName" className={inputStyle} defaultValue={agreementEdit?.counterpartyName || ''}/>
                </Field>
                <Field label="V Code"><input name="vendorCode" maxLength={64} className={inputStyle} defaultValue={agreementEdit?.vendorCode || ''}/></Field>
                <Field label="Customer Code"><input name="customerCode" maxLength={64} className={inputStyle} defaultValue={agreementEdit?.customerCode || ''}/></Field>
                <Field label="Site Category">
                  <select name="siteClass" className={inputStyle} defaultValue={agreementEdit?.siteClass || ''}>
                    <option value="">Not Recorded</option><option value="A">A Site</option><option value="B">B Site</option><option value="C">C Site</option>
                  </select>
                </Field>
                <Field label="Agreement File (Document Vault)">
                  <select name="agreementDocumentId" className={inputStyle} defaultValue={agreementEdit?.agreementDocumentId || ''}>
                    <option value="">No document linked</option>{docs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Remarks"><textarea name="remarks" className={inputStyle} rows={2} defaultValue={agreementEdit?.remarks || ''} /></Field>
              <button type="submit" className={buttonStyle} disabled={saving}><Save className="w-4 h-4"/> Save Agreement</button>
            </form>
          )}
          <div className={col}>
            <h4 className="font-bold text-[#17365D]">Registered Agreements</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#F1F5F9] text-[#17365D]">
                  <tr>{['Type','Agreement','Counterparty','V Code','Customer Code','Valid Until','Action'].map(t=><th key={t} className="p-2 text-left">{t}</th>)}</tr>
                </thead><tbody>
                  {data?.agreements.map(a=>(
                    <tr key={a.id} className="border-b border-[#E2E8F0]">
                      <td className="p-2">{a.agreementType.replaceAll('_', ' ')}</td>
                      <td className="p-2">{a.agreementName}</td>
                      <td className="p-2">{a.counterpartyName || 'Not Recorded'}</td>
                      <td className="p-2">{a.vendorCode || '—'}</td>
                      <td className="p-2">{a.customerCode || '—'}</td>
                      <td className="p-2">{a.endDate || 'NFR source'}</td>
                      <td className="p-2">{canWrite && <button className="text-[#B8530D] font-semibold" onClick={()=>{setAgreementEdit(a);setAgreementType(a.agreementType);}}>Edit</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data?.agreements.length && <p className="p-3 text-sm text-[#64748B]">No dedicated agreement entries yet. Existing NFR leases remain available in the section-wise report.</p>}
            </div>
          </div>
        </div>
      )}

      {activeEditor === 'claims' && (
        <div className="space-y-4">
          {canWrite && (
            <form key={claimEdit?.id || 'new-claim'} onSubmit={onClaimSubmit} className={col}>
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-[#17365D]">{claimEdit ? 'Edit Draft Claim' : 'Create Expense Claim'}</h4>
                {claimEdit && <button type="button" onClick={()=>setClaimEdit(null)} className="underline text-sm text-[#64748B]">New claim</button>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <Field label="Claim Category">
                  <select className={inputStyle} name="claimCategory" defaultValue={claimEdit?.claimCategory || categories[0][0]}>
                    {categories.map(([id, name])=><option key={id} value={id}>{name}</option>)}
                  </select>
                </Field>
                <Field label="Claim Title"><input required name="title" className={inputStyle} maxLength={180} defaultValue={claimEdit?.title || ''}/></Field>
                <Field label="Amount (₹)"><input required name="amount" type="text" inputMode="decimal" className={inputStyle}
                  defaultValue={claimEdit ? (claimEdit.amountPaise / 100).toFixed(2) : ''} placeholder="1250.00"/></Field>
                <Field label="Invoice Reference"><input name="invoiceNumber" className={inputStyle} defaultValue={claimEdit?.invoiceNumber || ''}/></Field>
                <Field label="Period From"><input name="periodStart" type="date" className={inputStyle} defaultValue={dateValue(claimEdit?.periodStart)}/></Field>
                <Field label="Period To"><input name="periodEnd" type="date" className={inputStyle} defaultValue={dateValue(claimEdit?.periodEnd)}/></Field>
                <Field label="Due Date"><input name="dueDate" type="date" className={inputStyle} defaultValue={dateValue(claimEdit?.dueDate)}/></Field>
                <Field label="Invoice Attachment">{docOptions('invoiceDocumentId')}</Field>
              </div>
              <Field label="Remarks"><textarea name="remarks" className={inputStyle} defaultValue={claimEdit?.remarks || ''} rows={2}/></Field>
              <p className="text-xs text-[#64748B]">Every new claim starts as Draft. A different global administrator must approve it before recording payment.</p>
              <button type="submit" className={buttonStyle} disabled={saving}><Save className="w-4 h-4"/> Save Draft Claim</button>
            </form>
          )}
          <div className={col}>
            <h4 className="font-bold text-[#17365D]">Expense Claims &amp; Settlement Status</h4>
            <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-xs">
              <thead className="bg-[#F1F5F9] text-[#17365D]"><tr>
                {['Claim','Amount','Paid','Balance','Approval','Settlement','Action'].map(x=><th key={x} className="p-2 text-left">{x}</th>)}
              </tr></thead>
              <tbody>{data?.claims.map((c)=>(
                <tr key={c.id} className="border-b border-[#E2E8F0]">
                  <td className="p-2">{c.title}</td><td className="p-2 whitespace-nowrap">{money(c.amountPaise)}</td>
                  <td className="p-2 whitespace-nowrap">{money(c.paidPaise)}</td>
                  <td className="p-2 whitespace-nowrap">{money(c.outstandingPaise)}</td>
                  <td className="p-2">{c.approvalStatus}</td><td className="p-2">{c.settlementStatus}</td>
                  <td className="p-2"><div className="flex items-center gap-3">
                    {canWrite && c.approvalStatus === 'DRAFT' && <button className="text-[#B8530D]" onClick={()=>setClaimEdit(c)}>Edit</button>}
                    {canApprove && c.approvalStatus === 'DRAFT' && c.createdBy !== userCtx?.user.id && (
                      <>
                        <button className="text-emerald-700 font-semibold" onClick={()=>onDecision(c,'APPROVED')}>Approve</button>
                        <button className="text-rose-700" onClick={()=>onDecision(c,'REJECTED')}>Reject</button>
                      </>
                    )}
                    {canWrite && c.approvalStatus === 'APPROVED' && c.outstandingPaise > 0 && (
                      <button className="text-[#17365D] font-semibold" onClick={()=>setSettleClaim(c)}>Record Payment</button>
                    )}
                  </div></td>
                </tr>
              ))}</tbody>
            </table></div>
            {!data?.claims.length && <p className="text-sm text-[#64748B]">No expense claims recorded yet.</p>}
          </div>
          {canWrite && settleClaim && (
            <form key={settleClaim.id} onSubmit={onSettlementSubmit} className={col}>
              <h4 className="font-bold text-[#17365D]">Record Payment for: {settleClaim.title}</h4>
              <p className="text-xs text-[#64748B]">Outstanding: {money(settleClaim.outstandingPaise)}. Settlement requires a receipt linked to this outlet.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <Field label="Amount (₹)"><input required name="amount" inputMode="decimal" className={inputStyle} defaultValue={(settleClaim.outstandingPaise / 100).toFixed(2)}/></Field>
                <Field label="Payment Date"><input required name="paymentDate" type="date" className={inputStyle} defaultValue={new Date().toISOString().slice(0,10)}/></Field>
                <Field label="Payment Method"><select className={inputStyle} name="paymentMethod">
                  {['BANK_TRANSFER','UPI','CHEQUE','CASH','OTHER'].map(x=><option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}
                </select></Field>
                <Field label="UTR / Cheque / Reference Number"><input name="referenceNumber" required className={inputStyle}/></Field>
                <Field label="Payment Receipt">{docOptions('receiptDocumentId', true)}</Field>
              </div>
              <Field label="Payment Remarks"><textarea name="remarks" rows={2} className={inputStyle}/></Field>
              <div className="flex gap-2">
                <button disabled={saving} className={buttonStyle} type="submit"><CheckCircle2 className="w-4 h-4"/> Save Payment Evidence</button>
                <button type="button" onClick={()=>setSettleClaim(null)} className="text-[#64748B] text-sm underline">Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}

      {activeEditor === 'inspections' && (
        <div className="space-y-4">
          {canInspect ? (
            <form onSubmit={onInspectionSubmit} className={col}>
              <h4 className="font-bold text-[#17365D]">Record Equipment Condition</h4>
              <p className="text-xs text-[#64748B]">Choose a registered asset. Its lifecycle status alone does not prove Working / Not Working / Scrapped.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <Field label="Registered Equipment Asset"><select name="equipmentAssetId" required className={inputStyle}>
                  <option value="">Select asset</option>{data?.assets.map(a=><option key={a.id} value={a.id}>{a.assetCode} — {a.name}</option>)}
                </select></Field>
                <Field label="Inspected On"><input name="inspectedOn" type="date" required className={inputStyle} defaultValue={new Date().toISOString().slice(0, 10)}/></Field>
                <Field label="Condition"><select name="condition" required className={inputStyle}>
                  <option value="WORKING">Working</option><option value="NOT_WORKING">Not Working</option><option value="SCRAPPED">Scrapped</option>
                </select></Field>
                <Field label="Next Service Due"><input name="nextServiceDate" type="date" className={inputStyle}/></Field>
                <Field label="Evidence / Photo">{docOptions('evidenceDocumentId')}</Field>
              </div>
              <Field label="Inspection Notes"><textarea name="remarks" className={inputStyle} rows={2}/></Field>
              <button className={buttonStyle} disabled={saving || !data?.assets.length} type="submit"><ClipboardList className="w-4 h-4"/> Save Inspection</button>
            </form>
          ) : <div className={col}><p className="text-sm text-[#64748B]">Recording equipment inspections requires both Documents Write and Equipment Assets Write permissions.</p></div>}
          <div className={col}>
            <h4 className="font-bold text-[#17365D]">Recorded Equipment Inspections</h4>
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead className="bg-[#F1F5F9]"><tr>{['Equipment','Inspected','Condition','Next Due','Remarks'].map(x=><th key={x} className="text-left p-2">{x}</th>)}</tr></thead>
              <tbody>{data?.inspections.map(i=><tr key={i.id} className="border-b border-[#E2E8F0]">
                <td className="p-2">{data.assets.find(a=>a.id===i.equipmentAssetId)?.name || i.equipmentAssetId}</td>
                <td className="p-2">{i.inspectedOn}</td><td className="p-2">{i.condition.replaceAll('_',' ')}</td>
                <td className="p-2">{i.nextServiceDate || '—'}</td><td className="p-2">{i.remarks || '—'}</td>
              </tr>)}</tbody>
            </table></div>
            {!data?.inspections.length && <p className="text-sm text-[#64748B]">No operational condition inspections recorded yet.</p>}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-[#64748B]">
        <ShieldCheck className="w-4 h-4"/> Entries are outlet-scoped, audited and reflected in the section-wise report after refresh.
      </div>
    </div>
  );
};
