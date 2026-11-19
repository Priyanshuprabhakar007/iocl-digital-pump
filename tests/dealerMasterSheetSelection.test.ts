import {describe,it,expect} from 'vitest';
import * as XLSX from 'xlsx';
import {selectDealerMasterDataSheet} from '../src/shared/dealerMasterSheetSelection';
import {dealerMasterFieldCatalog} from '../src/shared/dealerMasterFieldCoverage';
import {parseDealerMasterRows} from '../src/shared/dealerMasterImport';

const headers=dealerMasterFieldCatalog.map(f=>f.header);
function businessRow(){
  return headers.map(h=>h==='CUSTCODE'?'373196':
    h==='CUSTOMER  NAME (NAME OF  RO)'?'COCO IT PARK NEHA HALDWANI SERVICE':
    h==='SALESOFFICE'?'Chandigarh DO':
    h==='SALES AREA NAME'?'Chandigarh North RSA':
    h==='ADDRESS'?'Chandigarh':'Test data');
}
function book(){
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
    ['IOCL | Full Excel Import Readiness'],[],['Source rows',131]
  ]),'Import Readiness');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
    ['RO Code','Excel RO Name','Proposed Action'],
    ['373196','COCO IT PARK','NEW CANDIDATE'],
  ]),'RO Code Reconciliation');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
    headers,businessRow(),
  ]),'All 26 Excel Fields');
  return wb;
}
describe('Select a dealer data sheet instead of cover sheet',()=>{
  it('automatically selects all 26 columns after a summary cover',()=>{
    const chosen=selectDealerMasterDataSheet(book());
    expect(chosen.name).toBe('All 26 Excel Fields');
    expect(chosen.sheetIndex).toBe(2);
    expect(chosen.headerRowNumber).toBe(1);
    expect(chosen.fullMaster).toBe(true);
    const rows=parseDealerMasterRows(chosen.raw);
    expect(rows).toHaveLength(1);
    expect(rows[0].roCode).toBe('373196');
    expect(rows[0].name).toContain('COCO IT PARK');
  });
  it('detects a header after title and blank rows without shifting physical Excel rows',()=>{
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
      ['Dealer Master 2026'],[],headers,businessRow(),
    ]),'Data');
    const selected=selectDealerMasterDataSheet(wb);
    expect(selected.headerRowNumber).toBe(3);
    expect(parseDealerMasterRows(selected.raw)[0].sourceRow).toBe(4);
  });
  it('keeps simple, original first-sheet workbooks working',()=>{
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([headers,businessRow()]),'Dealer Master');
    expect(selectDealerMasterDataSheet(wb).name).toBe('Dealer Master');
    expect(selectDealerMasterDataSheet(wb).fullMaster).toBe(true);
  });
  it('rejects a workbook without dealer master data, with a helpful error',()=>{
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Import Readiness'],['Count',131]]),'Readiness');
    expect(()=>selectDealerMasterDataSheet(wb)).toThrow(/No dealer-master data sheet found/);
  });
});
