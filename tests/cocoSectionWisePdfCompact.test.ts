import {describe,expect,it} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import {printableSectionTables} from '../src/worker/services/cocoSectionWisePdfProjection';
import {buildSectionWiseSections} from '../src/worker/services/cocoSectionWiseReportService';
import {CocoSectionWisePdfService} from '../src/worker/services/cocoSectionWisePdfService';

describe('compact RO 373196 section-wise PDF',()=>{
 const sections=buildSectionWiseSections({
   items:[],leases:[],assets:[],outletType:'COCO',reportDate:'2026-11-20',
   agreements:[{
     id:'a',agreementType:'LAND_LEASE',agreementName:'Land Lease',
     agreementNumber:null,linkedNfrLeaseId:null,startDate:'2018-01-30',endDate:'2051-01-29',
     counterpartyName:null,vendorCode:null,customerCode:'373196',siteClass:null,
     remarks:'EXCEL_SOURCE_UNVERIFIED | Imported from saved Dealer Master. Supporting evidence may be attached later. LAND OWNER: CANDIGARH HOUSING BOARD CUST LAND DESC: Leased Land.',
     leaseTerms:null,contractName:null,
   }],
 });
 it('retains canonical missing categories and status in API output',()=>{
   expect(sections).toHaveLength(5);
   expect(sections[0].tables[0].rows).toHaveLength(4);
   expect(sections[1].tables[0].rows).toHaveLength(5);
   expect(sections[0].tables[0].rows[0][2]).toBe('Recorded');
 });
 it('renders only recorded agreements without huge generated remarks or empty terms',()=>{
   const printable=printableSectionTables(sections[0]);
   expect(printable).toHaveLength(2);
   expect(printable[0].rows).toHaveLength(1);
   expect(printable[0].rows[0][1]).toBe('Land Lease');
   expect(printable[0].rows[0][5]).toBe('-');
   expect(sections[0].tables[0].rows[0][5]).toBe('Not Recorded');
   expect(printable[1].rows[0].join(' ')).not.toContain('LAND OWNER:');
   expect(printable[1].rows[0].join(' ')).not.toContain('EXCEL_SOURCE_UNVERIFIED');
 });
 it('retains empty sections as blank pages without filler table rows',()=>{
   for(const section of sections.slice(1))expect(printableSectionTables(section)).toEqual([]);
   expect(sections[1].tables[0].rows[0][2]).toBe('Not Recorded');
 });
 it('generates 5 intact section pages for only one recorded lease',async()=>{
   const bytes=await CocoSectionWisePdfService.generatePdf({
     outletId:'test',outletName:'COCO IT PARK NEHA HALDWANI SERVICE',
     roCode:'373196',reportDate:'2026-11-20',generatedAt:'2026-11-20T10:00:00Z',
     generatedBy:'Tester',sections,
   });
   const doc=await PDFDocument.load(bytes);
   expect(doc.getPageCount()).toBe(5);
   // Each category retains its own page even if there are no saved records.
   // No body content is rendered on empty section pages (implemented by
   // startPage(..., hasEntries=false) and the early continue above).
   const source=await import('node:fs/promises');
   const ts=await source.readFile(
     new URL('../src/worker/services/cocoSectionWisePdfService.ts',import.meta.url),'utf8');
   expect(ts).toContain('if (!hasEntries) continue;');
   expect(ts).not.toContain('No saved records for this section.');
 });
});
