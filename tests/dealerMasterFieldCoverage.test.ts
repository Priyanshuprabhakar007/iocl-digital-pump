import {describe,expect,it} from 'vitest';
import {dealerMasterFieldCatalog, normalizedDealerHeader, readYellowCellProtection, summarizeDealerFieldCoverage} from '../src/shared/dealerMasterFieldCoverage';

describe('IOCL 26-column source mapping and yellow protection',()=>{
  it('covers exactly all 26 business columns across 4 destinations with no duplicate headings',()=>{
    expect(dealerMasterFieldCatalog).toHaveLength(26);
    expect(new Set(dealerMasterFieldCatalog.map(f=>normalizedDealerHeader(f.header))).size).toBe(26);
    expect(new Set(dealerMasterFieldCatalog.map(f=>f.destination))).toEqual(new Set(['ORGANIZATION','OUTLET','LAND','LEASE']));
    for(const name of ['EMAIL','CONTACT NO','COMMISSION DATE','LAND OWNER','GST CHARGES','ESCALATION TIME(YR)','AREA','measuring unit','Remarks'])
      expect(dealerMasterFieldCatalog.some(f=>normalizedDealerHeader(f.header)===normalizedDealerHeader(name))).toBe(true);
  });
  it('recognizes yellow styles per-cell rather than protecting entire outlet rows',()=>{
    const workbook={Styles:{CellXf:[{fillId:0},{fillId:1}],Fills:[
      {patternType:'none'}, {patternType:'solid',fgColor:{rgb:'FFFFFF00'}}
    ]}};
    const sheet={'A2':{s:0},'B2':{s:1},'C2':{s:0},'A3':{s:0},'B3':{s:0},'C3':{s:1}};
    const yellow=readYellowCellProtection(workbook,sheet,['CUSTCODE','ADDRESS','EMAIL'],2);
    expect(yellow.verified).toBe(true);
    expect(yellow.protectedBySourceRow).toEqual({2:['ADDRESS'],3:['EMAIL']});
    const rows=[{CUSTCODE:'369460',ADDRESS:'Mohali',EMAIL:'a@example.com'},{CUSTCODE:'111095',ADDRESS:'Ropar',EMAIL:'b@example.com'}];
    const coverage=summarizeDealerFieldCoverage(rows,yellow.protectedBySourceRow);
    expect(coverage.find(f=>f.header==='ADDRESS')?.protectedCount).toBe(1);
    expect(coverage.find(f=>f.header==='ADDRESS')?.remainingCount).toBe(1);
    expect(coverage.find(f=>f.header==='EMAIL')?.protectedCount).toBe(1);
    expect(coverage.find(f=>f.header==='EMAIL')?.remainingCount).toBe(1);
  });
  it('does not assume that unparsed formatting means no protected cells',()=>{
    const output=readYellowCellProtection({}, {'A2':{s:2}}, ['CUSTCODE'],1);
    expect(output.verified).toBe(false);
    expect(output.reason).toContain('unavailable');
  });
  it('keeps empty source cells distinct from remaining non-highlighted cells',()=>{
    const rows=[{EMAIL:'',ADDRESS:'Mohali'},{EMAIL:'a@example.com',ADDRESS:null}];
    const c=summarizeDealerFieldCoverage(rows,{});
    expect(c.find(f=>f.header==='EMAIL')?.blankCount).toBe(1);
    expect(c.find(f=>f.header==='EMAIL')?.remainingCount).toBe(1);
    expect(c.find(f=>f.header==='ADDRESS')?.blankCount).toBe(1);
  });
});
