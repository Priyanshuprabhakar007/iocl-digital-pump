import { describe, expect, it } from 'vitest';
import { buildSectionWiseSections } from '../src/worker/services/cocoSectionWiseReportService';

describe('Section-wise report: authoritative new records', () => {
  it('prints real agreement metadata, claim payment totals and latest asset inspections', () => {
    const sections = buildSectionWiseSections({
      items: [], outletType: 'COCO', reportDate: '2026-11-17',
      leases: [], assets: [{
        id: 'asset-dg', equipmentType: 'DG_SET', name: 'Backup DG Set',
        manufacturer: 'Kirloskar', status: 'ACTIVE',
      }],
      agreements: [{
        id: 'agreement-land', agreementType: 'LAND_LEASE',
        agreementName: 'Land Lease', agreementNumber: 'LAND-01',
        linkedNfrLeaseId: null, counterpartyName: 'Owner Example',
        vendorCode: 'V-100', customerCode: 'C-100', siteClass: 'A',
        startDate: '2025-01-01', endDate: '2027-01-01', remarks: 'Site document uploaded',
      }],
      claims: [{
        id: 'claim-1', claimCategory: 'UNIFORM_CHARGES', title: 'Uniform Charges',
        invoiceNumber: 'INV-01', periodStart: '2026-11-01', periodEnd: '2026-11-30',
        dueDate: '2026-11-20', amountPaise: 10000, approvalStatus: 'APPROVED',
        paidPaise: 10000, remarks: 'Receipt verified',
      }],
      inspections: [{
        equipmentAssetId: 'asset-dg', inspectedOn: '2026-11-17',
        condition: 'NOT_WORKING', nextServiceDate: '2026-11-18',
        createdAt: '2026-11-17T05:00:00Z', remarks: 'Repair scheduled',
      }],
    });
    expect(sections).toHaveLength(5);
    expect(sections[0].tables[0].rows[0][5]).toBe('Owner Example');
    expect(sections[0].tables[1].rows[0][2]).toBe('V-100');
    expect(sections[0].tables[1].rows[0][3]).toBe('C-100');
    expect(sections[3].tables[0].rows[2][2]).toBe('Not Working');
    const claim = sections[4].tables[0].rows.find((r) => r[1] === 'Uniform Charges');
    expect(claim?.[2]).toBe('Paid');
    expect(claim?.[5]).toBe('Yes');
    expect(sections[2].tables[0].rows.map((r) => r[1]).join(' ')).not.toMatch(/PPL|Public Performance/i);
  });

  it('does not count unapproved or partially-paid expenses as settled', () => {
    const template = {
      items: [], outletType: 'COCO', reportDate: '2026-11-17', leases: [], assets: [],
    };
    const items = [
      { id: 'pending', claimCategory: 'OTHER_CLAIM', title: 'Pending', invoiceNumber: null,
        periodStart: null, periodEnd: null, dueDate: null,
        amountPaise: 1000, approvalStatus: 'DRAFT' as const, paidPaise: 0, remarks: null },
      { id: 'partial', claimCategory: 'UNIFORM_CHARGES', title: 'Partial', invoiceNumber: null,
        periodStart: null, periodEnd: null, dueDate: null,
        amountPaise: 1000, approvalStatus: 'APPROVED' as const, paidPaise: 200, remarks: null },
    ];
    const sections = buildSectionWiseSections({ ...template, claims: items });
    expect(sections[4].tables[0].rows.find((r) => r[1] === 'Partial')?.[5]).toBe('Partial');
    expect(sections[4].tables[0].rows.find((r) => r[1] === 'Pending')?.[5]).toBe('Not Recorded');
  });
});
