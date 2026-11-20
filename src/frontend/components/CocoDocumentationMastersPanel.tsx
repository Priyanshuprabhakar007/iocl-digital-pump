import React, { useCallback, useEffect, useState, useRef } from 'react';
import { apiFetch, apiFetchBlob } from '../services/api';
import { type LeaseTerms, formatLeaseDimension, displayMeasure, parseLeaseMeasure, parseMonthlyLeaseValue, isLeaseAgreement } from '../../shared/leaseTerms';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../../shared/constants';
import { DealerLeaseSourceReviewPanel } from './DealerLeaseSourceReviewPanel';
import type {DealerDraftRow} from '../../shared/dealerMasterDraft';
import {dealerLeaseFormSuggestions} from '../../shared/dealerExcelLeasePrefill';
import { CheckCircle2, ClipboardList, Save, ShieldCheck, Upload, Download } from 'lucide-react';

interface Agreement {
  id: string; outletId: string; agreementType: string; agreementName: string; agreementNumber: string | null;
  linkedNfrLeaseId: string | null; counterpartyName: string | null; vendorCode: string | null;
  customerCode: string | null; siteClass: string | null; startDate: string | null; endDate: string | null;
  agreementDocumentId: string | null; remarks: string | null;
  leaseTerms?: LeaseTerms | null;
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
interface NfrLease { id: string; agreementNumber: string; leaseStartDate: string; leaseEndDate: string; monthlyRentPaise: number; agreementDocumentId: string | null; }
interface VaultDocument { id: string; name: string; outletId: string | null; }
interface MasterResponse {
  agreements: Agreement[]; claims: Claim[]; inspections: Inspection[]; assets: Asset[];
  nfrLeases: NfrLease[];
  leaseTermsAvailable?: boolean;
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
  ['OTHER', 'Other Agreement'], ['NFR_METADATA', 'NFR Lease Details (linked)'],
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
  selectedRoCode?: string;
  registeredAgreementNavigation?: number;
  vaultDocs: VaultDocument[];
  dealerSourceRow?: DealerDraftRow | null;
  onSaved?: () => void;
  initialEditor?: 'agreements' | 'claims' | 'inspections';
  initialAgreementType?: 'LAND_LEASE' | 'SERVICE_PROVIDER';
  initialClaimCategory?: string;
  initialCreate?: boolean;
  refreshRevision?: number;
}> = ({ outletId, selectedRoCode = '', registeredAgreementNavigation = 0, vaultDocs, dealerSourceRow, onSaved, initialEditor = 'agreements', initialAgreementType = 'LAND_LEASE', initialClaimCategory, initialCreate = false, refreshRevision = 0 }) => {
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
  const [activeEditor, setActiveEditor] = useState<'agreements'|'claims'|'inspections'>(initialEditor);
  const registeredAgreementsRef = useRef<HTMLDivElement>(null);
  // Unlike changing the outlet selector alone, explicit navigation must also
  // reveal the agreement table and work when the same RO was already active.
  useEffect(() => {
    if (registeredAgreementNavigation <= 0) return;
    setActiveEditor('agreements');
    setShowAgreementForm(false);
  }, [registeredAgreementNavigation]);
  useEffect(() => {
    if (registeredAgreementNavigation <= 0 || activeEditor !== 'agreements') return;
    const target = registeredAgreementsRef.current;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target?.focus({ preventScroll: true });
  }, [registeredAgreementNavigation, activeEditor, outletId]);
  const [agreementEdit, setAgreementEdit] = useState<Agreement | null>(null);
  const [sourcePrefillActive,setSourcePrefillActive]=useState(false);
  const [sourceVerified,setSourceVerified]=useState(false);
  const sourceSuggestions=dealerSourceRow?dealerLeaseFormSuggestions(dealerSourceRow):null;
  const [claimEdit, setClaimEdit] = useState<Claim | null>(null);
  const [settleClaim, setSettleClaim] = useState<Claim | null>(null);
  const [agreementType, setAgreementType] = useState<string>(initialAgreementType);
  const [showAgreementForm, setShowAgreementForm] = useState(initialCreate && initialEditor === 'agreements');
  const [dimensionUnit,setDimensionUnit]=useState<LeaseTerms['dimensionUnit']>(null);
  const [linkedLeaseId,setLinkedLeaseId]=useState('');
  const [contractId,setContractId]=useState('');
  const [uploadedContracts,setUploadedContracts]=useState<VaultDocument[]>([]);
  const [uploadingContract,setUploadingContract]=useState(false);
  const contractLock=useRef(false);
  const agreementSaveLock=useRef(false);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{setUploadedContracts([]);},[outletId]);
  useEffect(()=>{
    if(!showAgreementForm)return;
    setDimensionUnit(agreementEdit?.leaseTerms?.dimensionUnit||(sourcePrefillActive?sourceSuggestions?.dimensionUnit:null)||null);
    setLinkedLeaseId(agreementEdit?.linkedNfrLeaseId||'');
    setContractId(agreementEdit?.agreementDocumentId||'');
  },[showAgreementForm,agreementEdit,outletId,sourcePrefillActive,dealerSourceRow]);
  const [showClaimForm, setShowClaimForm] = useState(initialCreate && initialEditor === 'claims');
  const [showInspectionForm, setShowInspectionForm] = useState(initialCreate && initialEditor === 'inspections');

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
  }, [outletId, rev, refreshRevision]);
  useEffect(() => {
    setAgreementEdit(null);setSourcePrefillActive(false);setSourceVerified(false);setClaimEdit(null);setSettleClaim(null);setAgreementType(initialAgreementType);
    setShowAgreementForm(initialCreate && initialEditor === 'agreements');
    setShowClaimForm(initialCreate && initialEditor === 'claims');
    setShowInspectionForm(initialCreate && initialEditor === 'inspections');
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
    if(!canWrite||saving||contractLock.current||agreementSaveLock.current)return;
    if(sourcePrefillActive&&(!contractId||!sourceVerified)){
      setError('Excel source cannot become a legal agreement until the signed contract is linked and all terms verified.');
      return;
    }
    const f = new FormData(e.currentTarget);
    let leaseTerms:LeaseTerms|null|undefined;
    try {
      if(data?.leaseTermsAvailable&&isLeaseAgreement(agreementType)){
        const monthly=String(f.get('monthlyLeaseValue')||'').trim();
        const terms:LeaseTerms={dimensionUnit,areaMilli:null,lengthMilliFt:null,widthMilliFt:null,monthlyLeaseValuePaise:agreementType==='LAND_LEASE'&&monthly?parseMonthlyLeaseValue(monthly):null};
        if(dimensionUnit==='FT_LXW'){terms.lengthMilliFt=parseLeaseMeasure(String(f.get('lengthFt')||''));terms.widthMilliFt=parseLeaseMeasure(String(f.get('widthFt')||''));}
        else if(dimensionUnit)terms.areaMilli=parseLeaseMeasure(String(f.get('area')||''));
        leaseTerms=dimensionUnit||terms.monthlyLeaseValuePaise!==null?terms:null;
      }
    }catch(err){setError(err instanceof Error?err.message:'Invalid lease terms.');return;}
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
      agreementDocumentId: contractId || null,
      ...(leaseTerms!==undefined?{leaseTerms}:{}),
      remarks: f.get('remarks') || null,
    };
    agreementSaveLock.current=true;
    try {
      if (await submit(
        agreementEdit ? base + '/agreements/' + agreementEdit.id : base + '/agreements',
        agreementEdit ? 'PUT' : 'POST', payload, 'Agreement saved and available to section-wise PDF.'
      )) {setAgreementEdit(null); setShowAgreementForm(false);}
    } finally {agreementSaveLock.current=false;}
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
    )) { setClaimEdit(null); setShowClaimForm(false); }
  };
  const onInspectionSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload = {
      outletId, equipmentAssetId: f.get('equipmentAssetId'), inspectedOn: f.get('inspectedOn'),
      condition: f.get('condition'), nextServiceDate: f.get('nextServiceDate') || null,
      evidenceDocumentId: f.get('evidenceDocumentId') || null, remarks: f.get('remarks') || null,
    };
    if (await submit(base + '/inspections', 'POST', payload, 'Equipment inspection saved and linked to the report.')) setShowInspectionForm(false);
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
  const docs = Array.from(new Map([...vaultDocs,...uploadedContracts].filter(d=>d.outletId===outletId).map(d=>[d.id,d])).values());
  const linkedNfr=data?.nfrLeases.find(l=>l.id===linkedLeaseId);
  const currentTerms=agreementEdit?.agreementType===agreementType&&(agreementType!=='NFR_METADATA'||agreementEdit.linkedNfrLeaseId===linkedLeaseId)?agreementEdit.leaseTerms:null;
  const uploadContract=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];e.target.value='';
    if(!file||!canWrite||saving||contractLock.current||agreementSaveLock.current)return;
    if(!['application/pdf','image/png','image/jpeg','image/jpg'].includes(file.type)||file.size===0||file.size>5*1024*1024){setError('Select a non-empty PDF, JPG or PNG file up to 5 MB.');return;}
    contractLock.current=true;setUploadingContract(true);setError('');setSuccess('');
    try{
      const body=new FormData();body.append('file',file);body.append('outletId',outletId);
      const res=await apiFetch<VaultDocument>('/api/v1/documents',{method:'POST',body});
      if(!mounted.current)return;
      if(res.success&&res.data?.id&&res.data.outletId===outletId){const doc=res.data;setUploadedContracts(prev=>[doc,...prev]);setContractId(doc.id);setSuccess('Contract uploaded. Save Agreement to link it to this record.');}
      else setError(res.error?.message||'Contract upload failed or could not be verified.');
    }catch(err){if(mounted.current)setError(err instanceof Error?err.message:'Contract upload failed.');}
    finally{contractLock.current=false;if(mounted.current)setUploadingContract(false);}
  };
  const downloadContract=async(id:string)=>{
    try{const res=await apiFetchBlob('/api/v1/documents/'+encodeURIComponent(id)+'/download');if(!res.success||!res.blob)throw Error(res.error?.message||'Contract download failed.');const url=URL.createObjectURL(res.blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=res.filename||docs.find(d=>d.id===id)?.name||'contract';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    catch(err){setError(err instanceof Error?err.message:'Contract download failed.');}
  };
  const docOptions = (name: string, required = false, selectedId = '') => (
    <select name={name} required={required} className={inputStyle} defaultValue={selectedId}>
      <option value="">{required ? 'Select uploaded receipt' : 'No document linked'}</option>
      {docs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
    </select>
  );

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm text-[#64748B]">Maintain source records here. Uploaded evidence and the section-wise PDF use these saved records.</p>
        {error && <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
        {success && <div role="status" className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm">{success}</div>}
        {loading && <div className="text-sm text-[#64748B]">Loading source records…</div>}
        {!canWrite && <div className="text-sm text-[#64748B]">You have read-only access; contact an authorized manager to update records.</div>}
      </div>
      <div className="flex flex-wrap gap-2">
        {([['agreements', 'Lease & Agreements'], ['claims', 'Claims & Settlements'], ['inspections', 'Asset Inspections']] as const)
          .map(([id, label]) => (
          <button key={id} type="button" disabled={saving||uploadingContract} onClick={() => setActiveEditor(id)}
            className={'px-4 py-2 text-sm font-medium rounded-lg border ' +
              (activeEditor === id ? 'bg-[#17365D] border-[#17365D] text-white' : 'bg-white text-[#17365D] border-[#CBD5E1]')}>
            {label}
          </button>
        ))}
      </div>

      {activeEditor === 'agreements' && (
        <div className="space-y-4">
          {canWrite&&data&&!showAgreementForm&&<div className="flex flex-wrap gap-2">
            <button type="button" disabled={saving||uploadingContract} className={buttonStyle}
              onClick={()=>{setSourcePrefillActive(false);setSourceVerified(false);setAgreementEdit(null);setAgreementType('LAND_LEASE');setShowAgreementForm(true);}}>
              + Add Agreement
            </button>
            {dealerSourceRow&&<button type="button" disabled={saving||uploadingContract} className={buttonStyle}
              onClick={()=>{setSourceVerified(false);setSourcePrefillActive(true);setAgreementEdit(null);setAgreementType('LAND_LEASE');setShowAgreementForm(true);}}>
              Use Excel Details (Review &amp; Save)
            </button>}
          </div>}
          {canWrite && data && showAgreementForm && (
            <form key={agreementEdit?.id||(sourcePrefillActive?'excel-suggestions':'new-agreement')} onSubmit={onAgreementSubmit} className={col}>
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-[#17365D]">{agreementEdit ? 'Edit Agreement' : 'Register Agreement'}</h4>
                <button type="button" disabled={saving||uploadingContract} onClick={() => { setAgreementEdit(null);setSourcePrefillActive(false);setSourceVerified(false); setShowAgreementForm(false); }} className="text-sm underline text-[#64748B]">Cancel</button>
              </div>
              {sourcePrefillActive&&sourceSuggestions&&<div className="text-xs border border-amber-200 bg-amber-50 rounded-lg p-3 text-amber-900 space-y-1">
                <strong>Excel source suggestions — NOT a signed agreement</strong>
                <p>Land owner is not assumed to be a legal counterparty. Ambiguous dates and unsupported units are not converted.
                  Verify all terms against the signed contract before saving.</p>
                <pre className="whitespace-pre-wrap break-words max-h-32 overflow-y-auto">{sourceSuggestions.reviewNotes}</pre>
              </div>}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <Field label="Agreement Type">
                  <select name="agreementType" className={inputStyle} value={agreementType}
                    disabled={saving||uploadingContract} onChange={(e) => {setAgreementType(e.target.value);setDimensionUnit(null);setLinkedLeaseId('');}}>
                    {agreementTypes.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Agreement Title">
                  <input name="agreementName" required maxLength={180} className={inputStyle}
                    defaultValue={agreementEdit?.agreementName || (agreementType === 'LAND_LEASE' ? 'Land Lease' : agreementType === 'SERVICE_PROVIDER' ? 'Service Provider Contract Agreement' : '')} />
                </Field>
                <Field label="Agreement Number">
                  <input name="agreementNumber" maxLength={100} className={inputStyle} defaultValue={agreementEdit?.agreementNumber||(sourcePrefillActive?sourceSuggestions?.agreementNumber:'')||''}/>
                </Field>
                {agreementType === 'NFR_METADATA' ? (
                  <Field label="Existing NFR Lease">
                    <select name="linkedNfrLeaseId" required className={inputStyle} value={linkedLeaseId} disabled={saving||uploadingContract} onChange={e=>{setLinkedLeaseId(e.target.value);setDimensionUnit(null);}}>
                      <option value="">Select NFR agreement</option>
                      {data?.nfrLeases.map((l) => <option key={l.id} value={l.id}>{l.agreementNumber}</option>)}
                    </select>
                  </Field>
                ) : (
                  <>
                    <Field label="Agreement Start Date"><input name="startDate" type="date" className={inputStyle} defaultValue={dateValue(agreementEdit?.startDate)||(sourcePrefillActive?sourceSuggestions?.startDate:'')||''}/></Field>
                    <Field label="Agreement End Date"><input name="endDate" type="date" className={inputStyle} defaultValue={dateValue(agreementEdit?.endDate)||(sourcePrefillActive?sourceSuggestions?.endDate:'')||''}/></Field>
                  </>
                )}
                <Field label="Agreement With / Counterparty">
                  <input name="counterpartyName" className={inputStyle} defaultValue={agreementEdit?.counterpartyName || ''}/>
                </Field>
                <Field label="V Code"><input name="vendorCode" maxLength={64} className={inputStyle} defaultValue={agreementEdit?.vendorCode || ''}/></Field>
                <Field label="Customer Code"><input name="customerCode" maxLength={64} className={inputStyle} defaultValue={agreementEdit?.customerCode||(sourcePrefillActive?sourceSuggestions?.customerCode:'')||''}/></Field>
                <Field label="Site Category">
                  <select name="siteClass" className={inputStyle} defaultValue={agreementEdit?.siteClass||(sourcePrefillActive?sourceSuggestions?.siteClass:'')||''}>
                    <option value="">Not Recorded</option><option value="A">A Site</option><option value="B">B Site</option><option value="C">C Site</option>
                  </select>
                </Field>
              </div>
              {isLeaseAgreement(agreementType)&&<section className="rounded-xl border border-[#D7E0EA] bg-[#F8FAFC] p-3 space-y-3">
                <h5 className="font-semibold text-[#17365D]">Lease Dimensions &amp; Monthly Value</h5>
                {!data.leaseTermsAvailable&&<p role="status" className="text-xs text-amber-800">New lease fields require storage migration 0037. Existing agreement entries remain available.</p>}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" key={agreementType+':'+linkedLeaseId+':'+dimensionUnit}>
                  <Field label="Dimension / Area Unit">
                    <select className={inputStyle} disabled={!data.leaseTermsAvailable||saving} value={dimensionUnit||''} onChange={e=>setDimensionUnit((e.target.value||null) as LeaseTerms['dimensionUnit'])}>
                      <option value="">Not Recorded</option><option value="SQYD">Square yards (sq yd)</option><option value="SQFT">Square feet (sq ft)</option><option value="FT_LXW">Length x Width (feet)</option>
                    </select>
                  </Field>
                  {dimensionUnit==='FT_LXW'?<>
                    <Field label="Length (ft)"><input name="lengthFt" required inputMode="decimal" className={inputStyle} defaultValue={displayMeasure(currentTerms?.lengthMilliFt)}/></Field>
                    <Field label="Width (ft)"><input name="widthFt" required inputMode="decimal" className={inputStyle} defaultValue={displayMeasure(currentTerms?.widthMilliFt)}/></Field>
                  </>:dimensionUnit&&<Field label={dimensionUnit==='SQYD'?'Area (sq yd)':'Area (sq ft)'}><input name="area" required inputMode="decimal" className={inputStyle} defaultValue={currentTerms?.dimensionUnit===dimensionUnit?displayMeasure(currentTerms.areaMilli):(sourcePrefillActive?sourceSuggestions?.area:'')||''}/></Field>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3" key={agreementType+':'+linkedLeaseId}>
                  {agreementType==='LAND_LEASE'?<Field label="Lease Value (₹ per month)"><input name="monthlyLeaseValue" inputMode="decimal" disabled={!data.leaseTermsAvailable||saving} className={inputStyle} defaultValue={currentTerms?.monthlyLeaseValuePaise!=null?(currentTerms.monthlyLeaseValuePaise/100).toFixed(2):(sourcePrefillActive?sourceSuggestions?.rentMonthly:'')||''} placeholder="Enter monthly rent"/></Field>:
                    <Field label="Lease Value (₹ per month) — NFR source"><input className={inputStyle} readOnly value={linkedNfr?.monthlyRentPaise!=null?money(linkedNfr.monthlyRentPaise):'Select NFR lease'}/></Field>}
                  <Field label="Lease Basis"><input className={inputStyle} readOnly value="Monthly"/></Field>
                </div>
                {agreementType==='NFR_METADATA'&&<p className="text-xs text-slate-600">Monthly rent is read from NFR &amp; Lease Management. Edit it there so the rent ledger remains consistent.</p>}
              </section>}
              <section className="rounded-xl border border-[#D7E0EA] p-3 space-y-2">
                <h5 className="font-semibold text-[#17365D]">Signed Contract / Agreement</h5>
                {agreementType==='NFR_METADATA'&&linkedNfr?.agreementDocumentId&&<div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">Existing NFR contract: {docs.find(d=>d.id===linkedNfr.agreementDocumentId)?.name||'Linked source document'} <button type="button" onClick={()=>void downloadContract(linkedNfr.agreementDocumentId!)} className="text-[#17365D] underline">Download</button></div>}
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[180px]"><Field label="Link existing contract"><select name="agreementDocumentId" value={contractId} disabled={uploadingContract||saving} onChange={e=>setContractId(e.target.value)} className={inputStyle}>
                    <option value="">No document linked</option>{contractId&&!docs.some(d=>d.id===contractId)&&<option value={contractId}>Existing linked document</option>}{docs.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                  </select></Field></div>
                  <label className={'inline-flex items-center gap-2 rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-sm font-semibold text-[#17365D] '+(uploadingContract||saving?'opacity-50':'cursor-pointer')}>
                    <Upload className="w-4 h-4"/>{uploadingContract?'Uploading…':'Upload Contract'}
                    <input aria-label="Upload signed contract" type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={uploadingContract||saving} className="sr-only" onChange={uploadContract}/>
                  </label>
                  {contractId&&<button type="button" onClick={()=>void downloadContract(contractId)} className="inline-flex items-center gap-1 px-2 py-2 text-sm font-semibold text-[#17365D]"><Download className="w-4 h-4"/> Download</button>}
                </div>
                <p className="text-xs text-slate-600">PDF, JPG or PNG · Max 5 MB. A new upload is saved securely in the vault; Save Agreement links it to this record. For linked NFR, this attachment is supplementary to the source lease contract.</p>
              </section>
              <Field label="Remarks"><textarea name="remarks" className={inputStyle} rows={2}
                defaultValue={agreementEdit?.remarks||(sourcePrefillActive?'Excel Dealer Master evidence reviewed; original 26 fields retained in saved source.':'')}/></Field>
              {sourcePrefillActive&&<label className="flex items-start gap-2 text-xs p-3 border border-amber-200 bg-amber-50 rounded-lg">
                <input type="checkbox" checked={sourceVerified} onChange={e=>setSourceVerified(e.target.checked)}/>
                I verified the RO Code, legal counterparty, dates, dimensions, rent and other terms against the linked signed contract.
              </label>}
              <button type="submit" className={buttonStyle}
                disabled={saving||uploadingContract||(sourcePrefillActive&&(!contractId||!sourceVerified))}><Save className="w-4 h-4"/> Save Agreement</button>
            </form>
          )}
          <div ref={registeredAgreementsRef} tabIndex={-1} className={col+' scroll-mt-24'}
            data-testid="registered-agreements-target" aria-label="Registered agreements for the selected outlet">
            <h4 className="font-bold text-[#17365D]">Registered Agreements{selectedRoCode?' — RO '+selectedRoCode:''}</h4>
            <p className="text-xs text-slate-500">These are saved agreement records for the selected registered outlet. The Excel land/lease source above is separate and does not create a signed agreement.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#F1F5F9] text-[#17365D]">
                  <tr>{['Type','Agreement','Counterparty','V Code','Customer Code','Valid Until','Dimensions','Lease Value / Month','Contract','Action'].map(t=><th key={t} className="p-2 text-left">{t}</th>)}</tr>
                </thead><tbody>
                  {data?.agreements.map(a=>(
                    <tr key={a.id} className="border-b border-[#E2E8F0]">
                      <td className="p-2">{a.agreementType.replaceAll('_', ' ')}</td>
                      <td className="p-2">{a.agreementName}</td>
                      <td className="p-2">{a.counterpartyName || 'Not Recorded'}</td>
                      <td className="p-2">{a.vendorCode || '—'}</td>
                      <td className="p-2">{a.customerCode || '—'}</td>
                      <td className="p-2">{a.endDate || (a.agreementType==='NFR_METADATA'?data?.nfrLeases.find(l=>l.id===a.linkedNfrLeaseId)?.leaseEndDate:'Not Recorded')}</td>
                      <td className="p-2">{isLeaseAgreement(a.agreementType)?formatLeaseDimension(a.leaseTerms):'—'}</td>
                      <td className="p-2">{a.agreementType==='LAND_LEASE'?(a.leaseTerms?.monthlyLeaseValuePaise!=null?money(a.leaseTerms.monthlyLeaseValuePaise):'Not Recorded'):a.agreementType==='NFR_METADATA'?(data?.nfrLeases.find(l=>l.id===a.linkedNfrLeaseId)?.monthlyRentPaise!=null?money(data.nfrLeases.find(l=>l.id===a.linkedNfrLeaseId)!.monthlyRentPaise):'Not Recorded'):'—'}</td>
                      <td className="p-2">{(()=>{const id=a.agreementDocumentId||data?.nfrLeases.find(l=>l.id===a.linkedNfrLeaseId)?.agreementDocumentId;return id?<button type="button" className="text-[#17365D] underline" onClick={()=>void downloadContract(id)}>{docs.find(d=>d.id===id)?.name||'Download contract'}</button>:'Not linked';})()}</td>
                      <td className="p-2">{canWrite && <button disabled={saving||uploadingContract||showAgreementForm} className="text-[#B8530D] font-semibold" onClick={()=>{setAgreementEdit(a);setAgreementType(a.agreementType);setShowAgreementForm(true);}}>Edit</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data && !data.agreements.length && <p className="p-3 text-sm text-[#64748B]">No dedicated agreement entries yet. Existing NFR leases remain available in the section-wise report.</p>}
            </div>
          </div>
          <DealerLeaseSourceReviewPanel outletId={outletId} revision={rev}/>
        </div>
      )}

      {activeEditor === 'claims' && (
        <div className="space-y-4">
          {canWrite && data && !showClaimForm && <button type="button" className={buttonStyle} onClick={() => { setClaimEdit(null); setShowClaimForm(true); }}>+ Add Expense Claim</button>}
          {canWrite && data && showClaimForm && (
            <form key={claimEdit?.id || 'new-claim'} onSubmit={onClaimSubmit} className={col}>
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-[#17365D]">{claimEdit ? 'Edit Draft Claim' : 'Create Expense Claim'}</h4>
                <button type="button" disabled={saving} onClick={()=>{setClaimEdit(null);setShowClaimForm(false);}} className="underline text-sm text-[#64748B]">Cancel</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <Field label="Claim Category">
                  <select className={inputStyle} name="claimCategory" defaultValue={claimEdit?.claimCategory || initialClaimCategory || categories[0][0]}>
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
                <Field label="Invoice Attachment">{docOptions('invoiceDocumentId', false, claimEdit?.invoiceDocumentId || '')}</Field>
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
                    {canWrite && c.approvalStatus === 'DRAFT' && <button className="text-[#B8530D]" onClick={()=>{setClaimEdit(c);setShowClaimForm(true);}}>Edit</button>}
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
            {data && !data.claims.length && <p className="text-sm text-[#64748B]">No expense claims recorded yet.</p>}
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
          {canInspect && data && !showInspectionForm && <button type="button" className={buttonStyle} onClick={() => setShowInspectionForm(true)}>+ Record Inspection</button>}
          {canInspect && data && showInspectionForm && (
            <form onSubmit={onInspectionSubmit} className={col}>
              <div className="flex items-center justify-between"><h4 className="font-bold text-[#17365D]">Record Equipment Condition</h4><button type="button" disabled={saving} onClick={() => setShowInspectionForm(false)} className="text-sm underline text-[#64748B]">Cancel</button></div>
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
          )}
          {!canInspect && <div className={col}><p className="text-sm text-[#64748B]">Recording equipment inspections requires both Documents Write and Equipment Assets Write permissions.</p></div>}
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
            {data && !data.inspections.length && <p className="text-sm text-[#64748B]">No operational condition inspections recorded yet.</p>}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-[#64748B]">
        <ShieldCheck className="w-4 h-4"/> Entries are outlet-scoped, audited and reflected in the section-wise report after refresh.
      </div>
    </div>
  );
};
