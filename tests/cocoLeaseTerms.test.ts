import { describe, expect,it } from 'vitest';
import { formatLeaseDimension,leaseTermsSchema,parseLeaseMeasure,parseMonthlyLeaseValue } from '../src/shared/leaseTerms';
import { buildSectionWiseSections } from '../src/worker/services/cocoSectionWiseReportService';
import fs from 'node:fs';
describe('Lease terms and contract evidence',()=>{
  it('validates exact dimensions and monthly amounts without floating point input rounding',()=>{
    expect(parseLeaseMeasure('1250.505')).toBe(1250505);
    expect(parseMonthlyLeaseValue('85000.25')).toBe(8500025);
    expect(parseMonthlyLeaseValue('0')).toBe(0);
    for(const bad of ['0','-1','1.0001','1e3',''])expect(()=>parseLeaseMeasure(bad)).toThrow();
    expect(()=>parseMonthlyLeaseValue('1.001')).toThrow();
    expect(formatLeaseDimension({dimensionUnit:'SQFT',areaMilli:2500500,lengthMilliFt:null,widthMilliFt:null,monthlyLeaseValuePaise:null})).toBe('2500.5 sq ft');
    expect(formatLeaseDimension({dimensionUnit:'FT_LXW',areaMilli:null,lengthMilliFt:40000,widthMilliFt:25000,monthlyLeaseValuePaise:null})).toBe('40 ft x 25 ft');
    expect(leaseTermsSchema.safeParse({dimensionUnit:'FT_LXW',areaMilli:null,lengthMilliFt:1000,widthMilliFt:null,monthlyLeaseValuePaise:null}).success).toBe(false);
  });
  it('uses the actual NFR monthly rent and preserves the land and NFR contract names in the report',()=>{
    const common={agreementNumber:'TEST',counterpartyName:null,vendorCode:null,customerCode:null,siteClass:null,startDate:null,endDate:null,remarks:null};
    const sections=buildSectionWiseSections({items:[],assets:[],outletType:'COCO',reportDate:'2026-11-18',
      leases:[{id:'nfr-1',agreementNumber:'N-1',from:'2026-01-01',to:'2028-01-01',vendorName:'Fixture vendor',status:'ACTIVE',monthlyRentPaise:1200000,contractName:'nfr-contract.pdf'}],
      agreements:[
        {...common,id:'land',agreementType:'LAND_LEASE',agreementName:'Land Lease',linkedNfrLeaseId:null,leaseTerms:{dimensionUnit:'SQYD',areaMilli:500000,lengthMilliFt:null,widthMilliFt:null,monthlyLeaseValuePaise:3000000},contractName:'land-contract.pdf'},
        {...common,id:'nfr-meta',agreementType:'NFR_METADATA',agreementName:'NFR Lease',linkedNfrLeaseId:'nfr-1',leaseTerms:{dimensionUnit:'FT_LXW',areaMilli:null,lengthMilliFt:20000,widthMilliFt:10000,monthlyLeaseValuePaise:null},contractName:null},
        {...common,id:'service',agreementType:'SERVICE_PROVIDER',agreementName:'Service Contract',linkedNfrLeaseId:null,contractName:'service.pdf'}
      ]});
    expect(sections).toHaveLength(5);
    const rows=sections[0].tables[2].rows;
    expect(rows[0]).toEqual(expect.arrayContaining(['500 sq yd','Monthly','land-contract.pdf']));
    expect(rows[0][3]).toContain('30,000');
    expect(rows[1].slice(2,5)).toEqual(['N/A','N/A','N/A']);
    expect(rows[1][5]).toBe('service.pdf');
    expect(rows[2][2]).toBe('20 ft x 10 ft');
    expect(rows[2][3]).toContain('12,000');
    expect(rows[2][5]).toBe('nfr-contract.pdf');
  });
  it('keeps the feature additive and direct upload linked to existing vault API',()=>{
    const sql=fs.readFileSync('docs/lease-migration-0037/0037_coco_agreement_lease_terms.sql','utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS coco_agreement_lease_terms');
    expect(sql).not.toMatch(/(^|\n)\s*(ALTER|DROP|DELETE|UPDATE|INSERT)\b/im);
    const form=fs.readFileSync('src/frontend/components/CocoDocumentationMastersPanel.tsx','utf8');
    expect(form).toContain('isLeaseAgreement(agreementType)');
    expect(form).toContain('Upload Evidence (Optional)');
    expect(form).toContain('contractLock.current');
    expect(form).toContain("agreementDocumentId: contractId || null");
    expect(form).toContain("'/api/v1/documents'");
  });
});
