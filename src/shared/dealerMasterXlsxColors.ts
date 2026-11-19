import * as XLSX from 'xlsx';
import { normalizedDealerHeader } from './dealerMasterFieldCoverage';

export type YellowFormatAudit = {
  verified: boolean;
  protectedBySourceRow: Record<number,string[]>;
  protectedCellCount: number;
  protectedRowCount: number;
  reason?: string;
};

/**
 * Read actual SpreadsheetML style references, not SheetJS cell.s (which varies by
 * SheetJS release and may omit fills). The existing xlsx dependency bundles CFB,
 * which can read the XLSX ZIP without adding another package.
 *
 * Fail closed if ZIP styles, sheet relations or workbook headers are not readable.
 * "No styles found" must NEVER be treated as "no yellow cells".
 */
export function readYellowProtectionFromXlsx(
  bytes:ArrayBuffer | Uint8Array, headers:string[], rowCount:number, firstSheetIndex=0, headerRowNumber=1,
):YellowFormatAudit {
  const blocked=(reason:string):YellowFormatAudit=>({
    verified:false,protectedBySourceRow:{},protectedCellCount:0,protectedRowCount:0,reason,
  });
  try {
    if(rowCount<1||rowCount>1000||headers.length<20||headers.length>150)
      return blocked('Unexpected Excel worksheet dimensions. Import blocked.');
    const input=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    const cfb=XLSX.CFB.read(input,{type:'array'});
    const text=(path:string):string|null=>{
      // ZIP readers may prefix files with Root Entry/; resolve paths by exact suffix.
      const normalized=path.toLowerCase().replace(/^\//,'');
      let entry=XLSX.CFB.find(cfb,path)||XLSX.CFB.find(cfb,'/'+path);
      if(!entry?.content){
        const index=cfb.FullPaths.findIndex((full:string)=>full.toLowerCase().endsWith('/'+normalized));
        if(index>=0)entry=cfb.FileIndex[index];
      }
      return entry?.content?new TextDecoder('utf-8').decode(entry.content as Uint8Array):null;
    };
    const wb=text('xl/workbook.xml');
    const rels=text('xl/_rels/workbook.xml.rels');
    const styles=text('xl/styles.xml');
    if(!wb||!rels||!styles)return blocked('XLSX XML entries unavailable (workbook='+Boolean(wb)+',rels='+Boolean(rels)+',styles='+Boolean(styles)+').');
    const attribute=(fragment:string,key:string)=>
      new RegExp('(?:^|\\s)'+key.replace(':','\\:')+'="([^"]*)"').exec(fragment)?.[1]||'';
    const sheets=[...wb.matchAll(/<sheet\b([^>]*?)\/?\s*>/g)];
    const sheet=sheets[firstSheetIndex];
    if(!sheet)return blocked('Could not resolve the selected Excel worksheet.');
    const relId=attribute(sheet[1],'r:id');
    if(!relId)return blocked('Worksheet relationship ID missing.');
    const relationship=[...rels.matchAll(/<Relationship\b([^>]*?)\/?\s*>/g)]
      .find(m=>attribute(m[1],'Id')===relId);
    if(!relationship)return blocked('Worksheet relationship was not found.');
    let target=attribute(relationship[1],'Target').replace(/^\//,'');
    if(!target.startsWith('xl/'))target='xl/'+target.replace(/^\.\//,'');
    if(target.includes('..')||!/^xl\/worksheets\/[^/]+\.xml$/.test(target))
      return blocked('Unexpected worksheet path in Excel archive.');
    const worksheet=text(target);
    if(!worksheet)return blocked('Original worksheet XML could not be extracted.');
    const fillsSection=/<fills\b[^>]*>([\s\S]*?)<\/fills>/i.exec(styles)?.[1];
    const xfsSection=/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/i.exec(styles)?.[1];
    if(!fillsSection||!xfsSection)return blocked('Original Excel cell fill styles cannot be inspected.');
    const fills=[...fillsSection.matchAll(/<fill(?:\s[^>]*)?>([\s\S]*?)<\/fill>/gi)].map(m=>m[1]);
    const xfAttrs=[...xfsSection.matchAll(/<xf\b([^>]*?)(?:\/?>)/gi)].map(m=>m[1]);
    if(!fills.length||!xfAttrs.length)return blocked('Style IDs are missing from Excel.');
    const yellowFills=new Set<number>();
    for(let idx=0;idx<fills.length;idx++){
      const pattern=/<patternFill\b([^>]*)>/i.exec(fills[idx])?.[1]||'';
      const fg=/<fgColor\b([^>]*?)\/?\s*>/i.exec(fills[idx])?.[1]||'';
      const rgb=attribute(fg,'rgb').toUpperCase().replace(/^#/,'');
      if(attribute(pattern,'patternType').toLowerCase()==='solid'&&
        ['FFFFFF00','FFFFEB9C','FFFFFFCC','FFFF00','FFFEF08A'].includes(rgb))
        yellowFills.add(idx);
    }
    if(!yellowFills.size)return blocked('No recognized yellow fill styles found. Protecting cells cannot be verified.');
    const yellowStyleIds=new Set<number>();
    xfAttrs.forEach((fragment,idx)=>{
      const fillId=Number(attribute(fragment,'fillId')||0);
      if(yellowFills.has(fillId))yellowStyleIds.add(idx);
    });
    if(!yellowStyleIds.size)return blocked('Yellow fill styles were not linked to cell styles.');
    const protectedBySourceRow:Record<number,string[]>={};
    const limit=rowCount+1;
    for(const cell of worksheet.matchAll(/<c\b([^>]*?)(?:\/?>)/gi)){
      const address=attribute(cell[1],'r').toUpperCase();
      const match=/^([A-Z]{1,3})([1-9]\d*)$/.exec(address);
      if(!match)continue;
      const row=Number(match[2]); if(row<=headerRowNumber||row>limit)continue;
      const style=Number(attribute(cell[1],'s')||0);
      if(!yellowStyleIds.has(style))continue;
      let index=0;
      for(const char of match[1])index=index*26+(char.charCodeAt(0)-64);
      const header=normalizedDealerHeader(headers[index-1]||'');
      if(!header)continue;
      const list=protectedBySourceRow[row]??=[];
      if(!list.includes(header))list.push(header);
    }
    const protectedCellCount=Object.values(protectedBySourceRow).reduce((n,rows)=>n+rows.length,0);
    if(protectedCellCount===0)return blocked('Yellow cells were not located in the selected data rows. Import blocked.');
    return {verified:true,protectedBySourceRow,protectedCellCount,protectedRowCount:Object.keys(protectedBySourceRow).length};
  }catch(error){
    return blocked('Cannot verify yellow cell formatting from original XLSX ZIP: '+(error instanceof Error?error.message:'parse error'));
  }
}
