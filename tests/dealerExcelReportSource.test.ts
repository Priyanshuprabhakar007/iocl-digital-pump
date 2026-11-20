import {describe,expect,it} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import {buildDealerExcelSourceTables,findDealerExcelReportSource} from '../src/shared/dealerExcelReportSource';
import {dealerMasterFieldCatalog} from '../src/shared/dealerMasterFieldCoverage';
import {buildSectionWiseSections} from '../src/worker/services/cocoSectionWiseReportService';
import {CocoSectionWisePdfService} from '../src/worker/services/cocoSectionWisePdfService';

const fields=Object.fromEntries(dealerMasterFieldCatalog.map(x=>[x.header,'']));
fields.CUSTCODE='373196';
fields['CUSTOMER  NAME (NAME OF  RO)']='COCO IT PARK NEHA HALDWANI SERVICE';
fields['CUST LAND DESC (LAND STATUS)']='Leased Land';
fields['DURATION (YEARS)']='33';
fields['RENT (monthly)']='';
fields['ORDER NO.']='ORD-1234';
const source={roCode:'373196',fields};

describe('Immutable Excel sources in Section-wise report and PDF',()=>{
  it('retains all 26 fields under explicitly unverified source tables',()=>{
    const groups=buildDealerExcelSourceTables(source,'373196');
    expect(groups).toHaveLength(4);
    const flatten=groups.flatMap(t=>t.rows);
    expect(flatten).toHaveLength(26);
    expect(flatten).toContainEqual(['DURATION (YEARS)','33']);
    expect(flatten).toContainEqual(['RENT (monthly)','Blank in original Excel']);
    expect(groups.every(t=>t.title.includes('UNVERIFIED SOURCE'))).toBe(true);
  });
  it('rejects mismatched RO Code and malformed draft, without leaking other outlet values',()=>{
    expect(buildDealerExcelSourceTables(source,'396187')).toEqual([]);
    const draft=JSON.stringify({schemaVersion:1,
      businessColumns:dealerMasterFieldCatalog.map(x=>x.header),
      rows:[{...source,sourceRow:2,city:'',pincode:'',yellowHeaders:[]}]});
    expect(findDealerExcelReportSource(['bad-json',draft],'373196')).toEqual(source);
    expect(findDealerExcelReportSource([draft],'396187')).toBeNull();
    expect(findDealerExcelReportSource([draft],'BAD')).toBeNull();
  });
  it('keeps canonical land-lease status Not Recorded even with an Excel source',async()=>{
    const sections=buildSectionWiseSections({
      items:[],leases:[],assets:[],outletType:'COCO',dealerExcelSource:source,
    });
    expect(sections).toHaveLength(5);
    expect(sections[0].tables[0].rows[0][2]).toBe('Not Recorded');
    expect(sections[0].tables[2].rows[0][3]).toBe('Not Recorded');
    expect(sections[0].tables.some(t=>t.title.includes('Excel Lease'))).toBe(true);
    const pdf=await CocoSectionWisePdfService.generatePdf({
      outletId:'test-id',outletName:'Test Outlet',roCode:'373196',
      reportDate:'2026-11-20',generatedAt:'2026-11-20T12:00:00Z',
      generatedBy:'Test Admin',sections,
    });
    const parsed=await PDFDocument.load(pdf);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(5);
  });
  it('never adds an unverified appendix for ordinary canonical-only reports',()=>{
    const sections=buildSectionWiseSections({
      items:[],leases:[],assets:[],outletType:'COCO',
    });
    expect(sections[0].tables).toHaveLength(3);
  });
});
