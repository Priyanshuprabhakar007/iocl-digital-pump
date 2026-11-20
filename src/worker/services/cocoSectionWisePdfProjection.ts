import type {SectionWiseSection,SectionWiseTable} from './cocoSectionWiseReportService';

/** PDF-only presentation filter. Never alters canonical records or status in D1. */
const absent=(v:string|undefined)=>!v||['Not Recorded','N/A','-'].includes(v.trim());
// Missing individual values are shown as a neutral dash in print, while
// their actual Not Recorded state remains unchanged in the API/UI.
const printCells=(table:SectionWiseTable):SectionWiseTable=>({
  ...table,rows:table.rows.map(row=>row.map(cell=>cell==='Not Recorded'?'-':cell)),
});
export function printableSectionTables(section:SectionWiseSection):SectionWiseTable[]{
  if(section.title==='Lease & Agreements'){
    const indices=(section.tables[0]?.rows||[])
      .map((row,index)=>({row,index}))
      .filter(({row})=>!absent(row[2])||row.slice(3).some(v=>!absent(v)))
      .map(({index})=>index);
    const registered=section.tables.slice(0,3).map(table=>({
      ...table,rows:table.rows.filter((_,index)=>indices.includes(index)),
    }));
    // A missing size/monthly value/contract is not a completed lease-terms
    // record. The separate Excel source remains fully visible below.
    return [
      ...registered.filter((table,index)=>table.rows.length>0 &&
        (index!==2||table.rows.some(row=>[row[2],row[3],row[5]].some(v=>!absent(v))))),
      ...section.tables.slice(3).filter(table=>table.rows.length>0),
    ].map(printCells);
  }
  return section.tables
    .filter(table=>table.source!=='Reporting rules'&&table.source!=='Status rules')
    .map(table=>({...table,rows:table.rows.filter(row=>row.slice(2).some(v=>!absent(v)))}))
    .filter(table=>table.rows.length>0)
    .map(printCells);
}
