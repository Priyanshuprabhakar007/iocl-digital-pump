import { eq } from 'drizzle-orm';
import { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../../db/schema';
import { equipmentAssets, nfrLeases, nfrVendors, users, cocoAgreementDetails, cocoExpenseClaims, cocoClaimSettlements, cocoAssetInspections } from '../../db/schema';
import {
  CocoComplianceMergedItem,
  formatComplianceDateDisplay,
  formatIndianCurrencyFromPaise,
} from '../../shared/cocoComplianceUtils';
import { CocoComplianceService } from './cocoComplianceService';

export interface SectionWiseTable {
  title: string;
  source: string;
  headers: string[];
  widths: number[];
  rows: string[][];
}
export interface SectionWiseSection {
  title: string;
  subtitle: string;
  tables: SectionWiseTable[];
  noteTitle: string;
  note: string;
}
export interface CocoSectionWiseReport {
  outletId: string;
  outletName: string;
  roCode: string;
  reportDate: string;
  generatedAt: string;
  generatedBy: string;
  sections: SectionWiseSection[];
}
export interface SectionWiseLease {
  id?: string;
  agreementNumber: string;
  from: string;
  to: string;
  vendorName: string;
  status: string;
}
export interface SectionWiseAsset {
  id?: string;
  equipmentType: string;
  name: string;
  manufacturer: string | null;
  status: string;
}


export interface SectionWiseAgreement {
  id: string;
  agreementType: 'LAND_LEASE' | 'SERVICE_PROVIDER' | 'OTHER' | 'NFR_METADATA';
  agreementName: string;
  agreementNumber: string | null;
  linkedNfrLeaseId: string | null;
  counterpartyName: string | null;
  vendorCode: string | null;
  customerCode: string | null;
  siteClass: string | null;
  startDate: string | null;
  endDate: string | null;
  remarks: string | null;
}
export interface SectionWiseClaim {
  id: string;
  claimCategory: string;
  title: string;
  invoiceNumber: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
  amountPaise: number;
  approvalStatus: 'DRAFT' | 'APPROVED' | 'REJECTED';
  paidPaise: number;
  remarks: string | null;
}
export interface SectionWiseInspection {
  equipmentAssetId: string;
  inspectedOn: string;
  condition: 'WORKING' | 'NOT_WORKING' | 'SCRAPPED';
  remarks: string | null;
  nextServiceDate: string | null;
  createdAt: string;
}

const NR = 'Not Recorded';
const EMPTY = '-';
const printable = (value: string, maxLength = 180) =>
  value.length > maxLength ? value.slice(0, maxLength - 25) + '... See source record' : value;
const date = (v: string | null | undefined) => formatComplianceDateDisplay(v, NR);
const fromItem = (item?: CocoComplianceMergedItem): string =>
  item && item.complianceStatus !== 'NOT_RECORDED'
    ? item.complianceStatus.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : NR;
const money = (item?: CocoComplianceMergedItem): string => {
  if (!item) return NR;
  const amount = item.amountPaise == null
    ? NR
    : formatIndianCurrencyFromPaise(item.amountPaise, { asciiPrefix: true });
  const payment = item.paymentStatus === 'NOT_RECORDED'
    ? ''
    : ' (' + item.paymentStatus.replaceAll('_', ' ') + ')';
  return amount + payment;
};
const notes = (item?: CocoComplianceMergedItem): string => {
  if (!item || item.complianceStatus === 'NOT_RECORDED') return NR;
  const parts = [
    item.referenceNumber ? 'Ref: ' + item.referenceNumber : '',
    item.linkedModuleData?.summaryText || '',
    item.remarks || '',
    item.actionRequired ? 'Action: ' + item.actionRequired : '',
    item.hasDiscrepancy && item.discrepancyNote ? 'DISCREPANCY: ' + item.discrepancyNote : '',
  ].filter(Boolean);
  return parts.length ? printable(parts.join(' | ')) : EMPTY;
};
const years = (start: string | null | undefined, end: string | null | undefined) => {
  if (!start || !end) return EMPTY;
  const a = Date.parse(start.slice(0, 10) + 'T00:00:00Z');
  const b = Date.parse(end.slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return EMPTY;
  return String(Math.round((b - a + 86400000) / (365.2425 * 86400000) * 10) / 10);
};

/**
 * Pure reporting projection. Never writes back to operational modules. Unknown agreement
 * identifiers, payment evidence and equipment condition are intentionally NOT fabricated.
 */
export function buildSectionWiseSections(args: {
  items: CocoComplianceMergedItem[];
  leases: SectionWiseLease[];
  assets: SectionWiseAsset[];
  agreements?: SectionWiseAgreement[];
  claims?: SectionWiseClaim[];
  inspections?: SectionWiseInspection[];
  outletType: string;
  reportDate?: string;
}): SectionWiseSection[] {
  const { items, leases, assets, outletType } = args;
  const agreementMasters = args.agreements || [];
  const expenseClaims = args.claims || [];
  const assetInspections = args.inspections || [];
  const asOf = args.reportDate || new Date().toISOString().slice(0, 10);
  const renewalWindowEnd = new Date(Date.parse(asOf + 'T00:00:00Z') + 30 * 86400000).toISOString().slice(0, 10);
  const byCode = new Map(items.map((item) => [item.categoryCode, item]));
  const item = (code: string) => byCode.get(code);
  const allAgreements: Array<{
    label: string; status: string; from: string; to: string; with: string; duration: string; remarks: string;
    vendorCode?: string; customerCode?: string; siteClass?: string; outletType?: string;
  }> = [];
  const leaseLine = (label: string, i?: CocoComplianceMergedItem) => ({
    label, status: fromItem(i), from: i ? date(i.issueDate) : NR,
    to: i ? date(i.validityDueDate) : NR, with: NR,
    duration: years(i?.issueDate, i?.validityDueDate), remarks: notes(i),
  });
  const agreementStatus = (start: string | null, end: string | null): string =>
    !end ? NR : end < asOf ? 'Expired' : end <= renewalWindowEnd ? 'Expiring Soon'
      : start && start > asOf ? 'Upcoming' : 'Valid';
  const masterLine = (a: SectionWiseAgreement) => ({
    label: a.agreementName,
    status: agreementStatus(a.startDate, a.endDate),
    from: date(a.startDate), to: date(a.endDate),
    with: a.counterpartyName || NR, duration: years(a.startDate, a.endDate),
    vendorCode: a.vendorCode || NR, customerCode: a.customerCode || NR,
    siteClass: a.siteClass || NR, outletType,
    remarks: printable([a.agreementNumber ? 'Agreement: ' + a.agreementNumber : '', a.remarks || '']
      .filter(Boolean).join(' | ') || EMPTY),
  });
  const manuals = (type: string) => agreementMasters.filter((a) => a.agreementType === type);
  const land = manuals('LAND_LEASE');
  allAgreements.push(...(land.length ? land.map(masterLine) : [leaseLine('Land Lease', item('LAND_LEASE'))]));
  const service = manuals('SERVICE_PROVIDER');
  allAgreements.push(...(service.length ? service.map(masterLine) : [leaseLine('Service Provider Contract Agreement', item('SERVICE_PROVIDER_CONTRACT'))]));
  if (leases.length) {
    for (const lease of leases) {
      const meta = agreementMasters.find((a) => a.agreementType === 'NFR_METADATA' && a.linkedNfrLeaseId === lease.id);
      allAgreements.push({
        label: 'NFR Lease', status: lease.status !== 'ACTIVE' ? 'Terminated'
          : lease.to < asOf ? 'Expired'
          : lease.to <= renewalWindowEnd ? 'Expiring Soon' : 'Valid',
        from: date(lease.from), to: date(lease.to),
        with: lease.vendorName || NR, duration: years(lease.from, lease.to),
        vendorCode: meta?.vendorCode || NR, customerCode: meta?.customerCode || NR,
        siteClass: meta?.siteClass || NR, outletType,
        remarks: printable(['Agreement: ' + lease.agreementNumber, meta?.remarks || ''].filter(Boolean).join(' | ')),
      });
    }
  } else {
    allAgreements.push(leaseLine('NFR Lease'));
  }
  const others = manuals('OTHER');
  if (others.length) {
    allAgreements.push(...others.map(masterLine));
  } else {
    const extra = items.filter((i) => i.isCustomCategory && i.categoryCode !== 'LAND_LEASE'
      && /(agreement|lease|contract)/i.test(i.categoryName));
    allAgreements.push(...(extra.length
      ? extra.map((i) => leaseLine(i.categoryName, i))
      : [leaseLine('Other / Custom Agreement')]));
  }
  const agreementRows = allAgreements.map((r, index) => [
    String(index + 1), r.label, r.status, r.from, r.to, r.with, r.duration,
  ]);
  const classificationRows = allAgreements.map((r, index) => [
    String(index + 1), r.label, r.vendorCode || NR,
    r.customerCode || NR, r.siteClass || NR, r.outletType || outletType || NR, r.remarks,
  ]);

  const billDefs = [
    ['PROPERTY_TAX', 'Property Tax'],
    ['LEASE_RENT', 'Lease Rent'],
    ['ELECTRICITY_BILL', 'Electricity Bill'],
    ['WATER_BILL', 'Water Bill'],
    ['OTHER_STATUTORY_CHARGES', 'Other Statutory Charges'],
  ];
  const bills = billDefs.map(([code, label], index) => {
    const i = item(code);
    const payment = !i || i.paymentStatus === 'NOT_RECORDED' ? fromItem(i)
      : i.paymentStatus === 'PAID' ? 'Paid'
      : i.paymentStatus === 'OVERDUE' ? 'Overdue' : 'Pending';
    return [String(index + 1), label, payment, i ? date(i.validityDueDate) : NR,
      money(i), i?.frequency || EMPTY, i?.frequency || EMPTY, notes(i)];
  });

  const licenceDefs = [
    ['PESO_LICENCE', 'PESO Licence'],
    ['WEIGHTS_MEASURES_STAMPING', 'Weights & Measures Stamping (DU)'],
    ['FIRE_EXTINGUISHER_REFILLING', 'Fire Extinguisher Refill / Test Certificate'],
    ['OTHER_CERTIFICATE', 'Other / Custom Certificate'],
  ];
  const licences = licenceDefs.map(([code, label], index) => {
    const i = item(code);
    return [String(index + 1), label, fromItem(i), i ? date(i.issueDate) : NR,
      i ? date(i.validityDueDate) : NR, money(i), notes(i)];
  });

  const equipmentDefs: Array<[string, (a: SectionWiseAsset) => boolean]> = [
    ['Water Cooler', (a) => /water[\s-]*cooler/i.test(a.name)],
    ['POS / Automation', (a) => /\b(pos|automation|fcc)\b/i.test(a.name)],
    ['Generator / DG Set', (a) => a.equipmentType === 'DG_SET' || /\b(generator|dg set)\b/i.test(a.name)],
    ['CCTV', (a) => /\b(cctv|camera|dvr|nvr)\b/i.test(a.name)],
  ];
  const inspectionsByAsset = new Map<string, SectionWiseInspection>();
  for (const inspection of [...assetInspections]
    .filter((row) => row.inspectedOn <= asOf)
    .sort((a, b) => b.inspectedOn.localeCompare(a.inspectedOn) || b.createdAt.localeCompare(a.createdAt))) {
    if (!inspectionsByAsset.has(inspection.equipmentAssetId)) inspectionsByAsset.set(inspection.equipmentAssetId, inspection);
  }
  const assetRows = equipmentDefs.map(([label, match], index) => {
    const list = assets.filter(match);
    const manufacturers = Array.from(new Set(list.map((a) => a.manufacturer).filter((x): x is string => Boolean(x))));
    const inspected = list.map((a) => inspectionsByAsset.get(a.id || '')).filter((x): x is SectionWiseInspection => Boolean(x));
    const categories = Array.from(new Set(inspected.map((i) => i.condition)));
    const condition = !list.length || !inspected.length ? NR
      : inspected.length !== list.length ? 'Partially Inspected'
      : categories.length > 1 ? 'Mixed'
      : categories[0].replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
    const last = inspected.length
      ? inspected.reduce((a, b) => a.inspectedOn >= b.inspectedOn ? a : b).inspectedOn : null;
    const remarks = inspected.length
      ? printable(inspected.map((i) => [i.remarks || (i.condition === 'NOT_WORKING' ? 'Repair required' : i.condition === 'SCRAPPED' ? 'Replacement required' : 'Checked'), i.nextServiceDate ? 'Next Service: ' + date(i.nextServiceDate) : ''].filter(Boolean).join('; ')).join(' | '))
      : list.length ? 'Registered in Equipment; operational inspection required' : NR;
    return [String(index + 1), label, condition, list.length ? String(list.length) : NR,
      manufacturers.length ? manufacturers.join(', ') : NR, date(last), remarks];
  });
  const maintenanceDefs = [
    ['WATER_COOLER_MAINTENANCE', 'Water Cooler Maintenance'],
    ['POS_AUTOMATION', 'POS / Automation Maintenance'],
    ['GENERATOR_MAINTENANCE', 'Generator Maintenance'],
    ['CCTV_HEALTH_STATUS', 'CCTV Service / Inspection'],
    ['FIRE_EXTINGUISHER_REFILLING', 'Fire Extinguisher Refilling Service'],
  ];
  const maintenanceRows = maintenanceDefs.map(([code, label], index) => {
    const i = item(code);
    return [String(index + 1), label, fromItem(i),
      i ? date(i.lastServiceDate) : NR, i ? date(i.validityDueDate) : NR, notes(i)];
  });

  const claimDefs = [
    ['LEASE_RENT', 'NFR Rent'],
    ['WEIGHTS_MEASURES_STAMPING_CHARGES', 'Weights & Measures Stamping Charges'],
    ['FIRE_EXTINGUISHER_REFILLING_CHARGES', 'Fire Extinguisher Refilling Charges'],
    ['UNIFORM_CHARGES', 'Uniform Charges'],
    ['WAGES_INCENTIVES_MISC', 'Wages, Incentives & Miscellaneous Bills'],
  ];
  const claimRows: string[][] = [];
  for (const [code, label] of claimDefs) {
    if (code !== 'LEASE_RENT') {
      const records = expenseClaims.filter((i) => i.claimCategory === code);
      if (records.length) {
        for (const claim of records) {
          const settled = claim.approvalStatus !== 'APPROVED' ? NR
            : claim.paidPaise === claim.amountPaise ? 'Yes' : claim.paidPaise > 0 ? 'Partial' : 'No';
          const status = claim.approvalStatus === 'DRAFT' ? 'Pending Approval'
            : claim.approvalStatus === 'REJECTED' ? 'Rejected'
            : settled === 'Yes' ? 'Paid' : settled === 'Partial' ? 'Partially Paid'
            : claim.dueDate && claim.dueDate < asOf ? 'Overdue' : 'Pending';
          claimRows.push([
            String(claimRows.length + 1), claim.title || label, status,
            claim.periodStart && claim.periodEnd ? date(claim.periodStart) + ' - ' + date(claim.periodEnd)
              : date(claim.periodStart || claim.periodEnd),
            formatIndianCurrencyFromPaise(claim.amountPaise, { asciiPrefix: true })
              + ' | Paid: ' + formatIndianCurrencyFromPaise(claim.paidPaise, { asciiPrefix: true }),
            settled,
            [claim.invoiceNumber ? 'Invoice: ' + claim.invoiceNumber : '',
              claim.remarks || '', claim.dueDate ? 'Due: ' + date(claim.dueDate) : '']
              .filter(Boolean).join(' | ') || EMPTY,
          ]);
        }
        continue;
      }
    }
    let i = item(code);
    if (code === 'LEASE_RENT' && i?.authoritativeSource !== 'NFR_LEASE_RENT_MODULE') i = undefined;
    const status = !i || i.paymentStatus === 'NOT_RECORDED' ? NR
      : i.paymentStatus === 'PAID' ? 'Paid'
      : i.paymentStatus === 'OVERDUE' ? 'Overdue' : 'Pending';
    const settled = i?.paymentStatus === 'PAID' ? 'Yes'
      : i?.paymentStatus === 'PENDING' || i?.paymentStatus === 'OVERDUE' ? 'No' : NR;
    claimRows.push([String(claimRows.length + 1), label, status,
      i?.frequency || NR, money(i), settled, notes(i)]);
  }
  for (const claim of expenseClaims.filter((i) => i.claimCategory === 'OTHER_CLAIM')) {
    claimRows.push([String(claimRows.length + 1), claim.title,
      claim.approvalStatus === 'APPROVED'
        ? claim.paidPaise === claim.amountPaise ? 'Paid' : claim.paidPaise > 0 ? 'Partially Paid' : 'Pending'
        : claim.approvalStatus, date(claim.periodStart),
      formatIndianCurrencyFromPaise(claim.amountPaise, { asciiPrefix: true })
        + ' | Paid: ' + formatIndianCurrencyFromPaise(claim.paidPaise, { asciiPrefix: true }),
      claim.approvalStatus === 'APPROVED' ? claim.paidPaise === claim.amountPaise ? 'Yes' : 'No' : NR,
      printable(claim.remarks || EMPTY)]);
  }

  return [
    {
      title: 'Lease & Agreements',
      subtitle: 'Dedicated agreement register, including land, service-provider, NFR and other contracts.',
      tables: [
        { title: '1. Lease & Agreement Register', source: 'Agreements / NFR',
          headers: ['Sr.', 'Particular', 'Status', 'From', 'To', 'Agreement With', 'Lease Duration (Years)'],
          widths: [25, 147, 67, 59, 59, 92, 60], rows: agreementRows },
        { title: 'Agreement Identification & Classification', source: 'Outlet / Agreement register',
          headers: ['Sr.', 'Agreement / Lease Type', 'V Code', 'Customer Code', 'Site (A/B/C)', 'Outlet Type', 'Remarks'],
          widths: [25, 143, 66, 78, 59, 62, 76], rows: classificationRows },
      ],
      noteTitle: 'Source / Missing Data',
      note: 'NFR lease dates/vendor are sourced from NFR Management. Land, service-provider and other agreements use the Agreements register. Extra NFR identification is linked by source lease ID; missing fields are not invented.',
    },
    {
      title: 'Bills, Taxes & Charges',
      subtitle: 'Consolidated recurring bills, government dues and lease-related charges.',
      tables: [
        { title: '2. Bills, Taxes & Charges', source: 'Municipal Taxes / Utilities / NFR',
          headers: ['Sr.', 'Category / Particular', 'Status', 'Validity / Due', 'Amount & Payment', 'Duration', 'Frequency', 'Remarks / Action'],
          widths: [25, 105, 60, 72, 83, 47, 49, 68], rows: bills },
        { title: 'Payment and Due-Date Review', source: 'Reporting rules',
          headers: ['Status', 'Meaning in Final Report', 'Expected System Behaviour'],
          widths: [94, 164, 251], rows: [
            ['Not Recorded', 'No saved source record', 'Do not display an invented payment or zero due.'],
            ['Pending', 'Amount due recorded', 'Show outstanding amount, due date and source record.'],
            ['Paid', 'Payment recorded in source', 'Display paid date and available receipt.'],
            ['Overdue', 'Unpaid past due date', 'Flag for action without changing ledger transactions.'],
          ] },
      ],
      noteTitle: 'Source / Missing Data',
      note: 'Property Tax and Water Dues come from Municipal Taxes; Electricity Bills from Utilities; applicable Lease Rent from NFR. All values remain read-only in this report.',
    },
    {
      title: 'Licences & Certificates',
      subtitle: 'Licence validity, statutory certificates and expiry review.',
      tables: [
        { title: '3. Licences & Certificates', source: 'Compliance Register / Document Vault',
          headers: ['Sr.', 'Category / Particular', 'Status', 'Issue Date', 'Validity / Due', 'Amount / Payment', 'Remarks / Action'],
          widths: [25, 140, 69, 66, 74, 67, 68], rows: licences },
        { title: 'Certificate Renewal Indicators', source: 'Status rules',
          headers: ['Indicator', 'Rule in Final Report', 'Suggested Action'],
          widths: [98, 186, 225], rows: [
            ['Valid', 'Saved validity date is in future', 'Retain document and renewal owner.'],
            ['Expiring Soon', 'Approaching renewal window', 'Notify responsible person before expiry.'],
            ['Expired', 'Validity date has passed', 'Highlight renewal needed; never mark valid.'],
            ['Not Recorded', 'No available certificate record', 'Request upload or entry.'],
          ] },
      ],
      noteTitle: 'Source / Missing Data',
      note: 'Public Performance Licence (PPL) is intentionally excluded from this section-wise export. The existing 14-category compliance register remains unchanged.',
    },
    {
      title: 'Maintenance & Assets',
      subtitle: 'Equipment inventory, verified condition and maintenance follow-up.',
      tables: [
        { title: '4A. Assets & Operational Status', source: 'Equipment Management',
          headers: ['Sr.', 'Asset / Equipment', 'Condition', 'Quantity', 'Make / Operator', 'Last Checked', 'Remarks / Action'],
          widths: [25, 127, 77, 48, 84, 70, 78], rows: assetRows },
        { title: '4B. Preventive Maintenance & Services', source: 'Compliance Register',
          headers: ['Sr.', 'Maintenance Activity', 'Status', 'Last Service', 'Next Due', 'Remarks / Action'],
          widths: [25, 162, 78, 72, 73, 99], rows: maintenanceRows },
      ],
      noteTitle: 'Operational Condition',
      note: 'Operational condition is based only on recorded asset inspections as of the selected report date. Asset lifecycle status alone is never treated as proof of working condition.',
    },
    {
      title: 'Claims & Payments',
      subtitle: 'Claims and settlement evidence, separate from shift fuel-sales collections.',
      tables: [
        { title: '5. Claims & Payments Register', source: 'NFR / Compliance records',
          headers: ['Sr.', 'Category / Particular', 'Status', 'Duration / Period', 'Amount & Payment', 'Settled', 'Remarks / Action'],
          widths: [25, 144, 64, 68, 83, 57, 68], rows: claimRows },
        { title: 'Settlement Rules & Evidence', source: 'Reporting rules',
          headers: ['Display Field', 'Evidence Needed', 'Source of Truth'],
          widths: [123, 213, 173], rows: [
            ['Amount & Payment', 'Amount, method and payment date', 'NFR / approved claim record'],
            ['Payment Settled', 'Paid status and available receipt', 'Payment source record'],
            ['Action Required', 'Outstanding bill or missing proof', 'Source record'],
            ['Supporting Documents', 'Vendor invoice and payment receipt', 'Document Vault'],
          ] },
      ],
      noteTitle: 'No Duplication With Daily Operations',
      note: 'Audited claims and approved payments are sourced from the dedicated Claims register. Fuel sales, shift handovers and bank deposits remain separate and are never counted as expense settlements.',
    },
  ];
}

export class CocoSectionWiseReportService {
  constructor(private db: DrizzleD1Database<typeof schema>) {}

  async getReport(args: { outletId: string; reportDate?: string; actorUserId: string }): Promise<CocoSectionWiseReport> {
    const compliance = new CocoComplianceService(this.db);
    const register = await compliance.getOutletComplianceRegister({
      outletId: args.outletId,
      reportDate: args.reportDate,
    });
    // Optional additive schema: legacy environments continue serving existing compliance data
    // until the reviewed migration 0036 is applied. Do not mutate a hosted database on read.
    const legacySafe = async <T>(promise: Promise<T>, fallback: T): Promise<T> => {
      try { return await promise; } catch (err) {
        if (/no such table|SQLITE_ERROR.*no such table/i.test(String(err))) return fallback;
        throw err;
      }
    };
    const [leases, vendors, equipment, actor, agreementRecords, claimRecords, settlements, inspections] = await Promise.all([
      this.db.select().from(nfrLeases).where(eq(nfrLeases.outletId, args.outletId)).all(),
      this.db.select().from(nfrVendors).where(eq(nfrVendors.outletId, args.outletId)).all(),
      this.db.select().from(equipmentAssets).where(eq(equipmentAssets.outletId, args.outletId)).all(),
      this.db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, args.actorUserId)).get(),
      legacySafe(this.db.select().from(cocoAgreementDetails).where(eq(cocoAgreementDetails.outletId, args.outletId)).all(), []),
      legacySafe(this.db.select().from(cocoExpenseClaims).where(eq(cocoExpenseClaims.outletId, args.outletId)).all(), []),
      legacySafe(this.db.select().from(cocoClaimSettlements).where(eq(cocoClaimSettlements.outletId, args.outletId)).all(), []),
      legacySafe(this.db.select().from(cocoAssetInspections).where(eq(cocoAssetInspections.outletId, args.outletId)).all(), []),
    ]);
    const vendorById = new Map(vendors.map((v) => [v.id, v]));
    const leaseInfo: SectionWiseLease[] = leases.map((l) => ({
      id: l.id,
      agreementNumber: l.agreementNumber,
      from: l.leaseStartDate,
      to: l.leaseEndDate,
      vendorName: vendorById.get(l.vendorId)?.vendorName || NR,
      status: l.status,
    }));
    return {
      outletId: register.outlet.id,
      outletName: register.outlet.name,
      roCode: register.outlet.roCode,
      reportDate: register.reportDate,
      generatedAt: new Date().toISOString(),
      generatedBy: actor ? actor.name + ' (' + actor.email + ')' : args.actorUserId,
      sections: buildSectionWiseSections({
        items: register.items,
        leases: leaseInfo,
        agreements: agreementRecords.map((a) => ({
          id: a.id, agreementType: a.agreementType, agreementName: a.agreementName,
          agreementNumber: a.agreementNumber, linkedNfrLeaseId: a.linkedNfrLeaseId,
          counterpartyName: a.counterpartyName, vendorCode: a.vendorCode,
          customerCode: a.customerCode, siteClass: a.siteClass,
          startDate: a.startDate, endDate: a.endDate, remarks: a.remarks,
        })),
        claims: claimRecords.map((claim) => ({
          id: claim.id, claimCategory: claim.claimCategory, title: claim.title,
          invoiceNumber: claim.invoiceNumber,
          periodStart: claim.periodStart, periodEnd: claim.periodEnd, dueDate: claim.dueDate,
          amountPaise: claim.amountPaise, approvalStatus: claim.approvalStatus,
          paidPaise: settlements.filter((payment) => payment.claimId === claim.id &&
            payment.paymentDate <= register.reportDate)
            .reduce((sum, payment) => sum + payment.amountPaise, 0),
          remarks: claim.remarks,
        })),
        inspections: inspections.map((i) => ({
          equipmentAssetId: i.equipmentAssetId, inspectedOn: i.inspectedOn,
          condition: i.condition, nextServiceDate: i.nextServiceDate,
          remarks: i.remarks, createdAt: i.createdAt,
        })),
        assets: equipment.map((e) => ({
          id: e.id, equipmentType: e.equipmentType, name: e.name,
          manufacturer: e.manufacturer, status: e.status,
        })),
        outletType: register.outlet.outletType,
        reportDate: register.reportDate,
      }),
    };
  }
}
