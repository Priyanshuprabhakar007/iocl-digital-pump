import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import type { DailyFuelSummary } from '../../shared/types';
import { formatMilliunits } from '../../shared/precision';
import { displayNozzleMeterMetric } from './dailyReadingPresentation';
import { dsrPeriodProducts, dsrProductColumns, dsrProductValues } from './dsrReport';

export interface DsrExport {
  outletName: string; roCode: string; days: DailyFuelSummary[];
  generatedAt: string; generatedBy: string; periodLabel: string;
}

const W = 841.89, H = 595.28, M = 32, TW = W - 2*M;
const navy = rgb(.08,.21,.36), muted = rgb(.32,.39,.46), line = rgb(.79,.83,.87), pale = rgb(.91,.94,.97);
const ink = rgb(.13,.18,.24), white = rgb(1,1,1);
const ascii = (s: unknown) => String(s ?? '').replace(/[–—]/g,'-').replace(/₹/g,'INR ').replace(/[^\x20-\x7e]/g,'?');
function fit(text: unknown, font: PDFFont, size: number, width: number): string {
  const s = ascii(text);
  if (font.widthOfTextAtSize(s,size) <= width) return s;
  let clipped = s;
  while (clipped.length && font.widthOfTextAtSize(clipped+'...',size)>width) clipped = clipped.slice(0,-1);
  return clipped+'...';
}
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = ascii(text).split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (font.widthOfTextAtSize((current ? current+' ' : '')+word,size) <= width) current = (current ? current+' ' : '')+word;
    else { if (current) lines.push(current); current=fit(word,font,size,width); }
  }
  if (current) lines.push(current);
  return lines;
}
const status = (d: DailyFuelSummary) => d.dayEntryStatus.replaceAll('_',' ') + (d.dayEntryStatus !== 'NO_ENTRY' ? ' / '+d.status.replaceAll('_',' ') : '');
const reading = (v: number | null) => v === null ? 'Not recorded' : formatMilliunits(v);

export async function generateDsrPdf(report: DsrExport): Promise<Uint8Array> {
  if (!report.days.length) throw new Error('Retrieve a report before exporting.');
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const first = report.days[0].businessDate, last = report.days[report.days.length-1].businessDate;
  pdf.setTitle('IOCL Daily Sales Report - '+first+' to '+last);
  let page: PDFPage;
  let y = 0;
  const draw = (t: unknown,x: number,at: number,size=9,font=normal,color=ink,max=TW) =>
    page.drawText(fit(t,font,size,max),{x,y:at,size,font,color});
  const start = (heading: string) => {
    page = pdf.addPage([W,H]);
    page.drawRectangle({x:M,y:H-77,width:TW,height:49,color:pale,borderColor:line,borderWidth:1});
    draw('INDIAN OIL CORPORATION LIMITED',M+10,H-42,10,bold,navy);
    draw('DAILY SALES REPORT (DSR)  |  '+heading,M+10,H-61,14,bold,navy,TW-20);
    draw(report.outletName+' | RO '+report.roCode,M,H-95,10,bold,navy);
    draw(report.periodLabel+'  |  '+first+(first===last?'':' to '+last),M,H-111,9,normal,muted);
    y=H-129;
  };
  const ensure = (height: number, heading: string) => { if (y-height < 46) start(heading+' (continued)'); };
  const note = (t: string,heading: string) => {
    for (const l of wrap(t,normal,8.5,TW)) { ensure(14,heading); draw(l,M,y,8.5,normal,muted); y-=13; }
    y-=5;
  };
  const table = (title: string, headers: string[], rows: string[][], weights: number[], heading: string) => {
    if (!rows.length) { note(title+': No recorded entries.',heading); return; }
    const sum = weights.reduce((a,b)=>a+b,0);
    const widths = weights.map(w=>TW*w/sum);
    const header = () => {
      ensure(46,heading);
      draw(title,M,y,11,bold,navy); y-=14;
      page.drawRectangle({x:M,y:y-21,width:TW,height:21,color:pale,borderColor:line,borderWidth:.7});
      let x=M;
      headers.forEach((h,i)=>{draw(h,x+4,y-13,7.5,bold,navy,widths[i]-8);x+=widths[i];});
      y-=21;
    };
    header();
    rows.forEach((row,index)=>{
      if(y-17<46){start(heading+' (continued)');header();}
      page.drawRectangle({x:M,y:y-17,width:TW,height:17,color:index%2?pale:white,borderColor:line,borderWidth:.4});
      let x=M;
      row.forEach((v,i)=>{draw(v,x+4,y-11,7.5,normal,ink,widths[i]-8);x+=widths[i];});
      y-=17;
    });
    y-=16;
  };
  if(report.days.length>1){
    start('Period overview');
    const complete=report.days.filter(d=>d.dayEntryStatus==='COMPLETE').length;
    const none=report.days.filter(d=>d.dayEntryStatus==='NO_ENTRY').length;
    note('Business dates: '+report.days.length+' | Complete: '+complete+' | Partial: '+(report.days.length-complete-none)+' | No entry: '+none,'Period overview');
    table('Product-wise net sales (recorded dates only)',['Product','Unit','Recorded days','Complete days','Recorded net sales','Coverage'],
      dsrPeriodProducts(report.days).map(p=>[p.productCode+' - '+p.productName,p.unit,p.recordedDays+'/'+p.totalDays,p.completeDays+'/'+p.totalDays,
        p.recordedNetMilliunits===null?'Not recorded':formatMilliunits(p.recordedNetMilliunits),p.fullyRecorded?'Complete':'Incomplete subtotal']),
      [2.3,0.7,1.0,1.0,1.4,1.5],'Period overview');
    note('Incomplete subtotals exclude missing readings or dates. Units are not combined. Opening and closing stocks are daily balances, not additive.','Period overview');
    table('Day-wise availability',['Business date','Status','Shifts','Products'],report.days.map(d=>[d.businessDate,status(d),String(d.shiftsCount),String(d.byProduct.length)]),[1,2,1,1],'Period overview');
  }
  for(const day of report.days){
    if(report.days.length>1 && day.dayEntryStatus==='NO_ENTRY') continue;
    const heading=day.businessDate;
    start(heading);
    note('Status: '+status(day)+' | Shifts included: '+day.shiftsCount+' | Completed receipts: '+day.completion.completedReceipts+'/'+day.completion.totalReceipts,heading);
    if(day.dayEntryStatus==='NO_ENTRY'){note('No shift or DSR entry recorded for this business date. No figures are inferred.',heading);continue;}
    table('1. Product-wise daily stock and sales',['Product','Unit','Status',...dsrProductColumns],
      day.byProduct.map(p=>[p.productCode,p.unit,p.status.replaceAll('_',' '),...dsrProductValues(p)]),
      [1.03,.66,.95,1,1,1,1,1,1,1,1,1],heading);
    note('Not recorded means a required reading is missing, not zero. Receipts may include invoiced quantities when measured receipt is unavailable.',heading);
    for(const p of day.byProduct) if(p.missingFields.length) note(p.productCode+': '+p.missingFields.join('; '),heading);
    table('2. Dispenser and nozzle-wise meter statement',['Shift','DU / MPD','Nozzle','Product','Opening totalizer','Closing totalizer','Gross','Testing','Net sales'],
      day.byDispenser.flatMap(d=>d.nozzles.map(n=>[String(n.shiftNumber),String(d.dispenserNumber),String(n.nozzleNumber),n.productCode,
        reading(n.openingTotalizerMilliunits),reading(n.closingTotalizerMilliunits),
        displayNozzleMeterMetric(n.openingTotalizerMilliunits,n.closingTotalizerMilliunits,n.grossSalesMilliunits),
        displayNozzleMeterMetric(n.openingTotalizerMilliunits,n.closingTotalizerMilliunits,n.testingQuantityMilliunits),
        displayNozzleMeterMetric(n.openingTotalizerMilliunits,n.closingTotalizerMilliunits,n.netSalesMilliunits)])),
      [.65,.8,.65,1,1.35,1.35,1,1,1],heading);
    if(day.missingFields.length) note('Day completeness: '+day.missingFields.join('; '),heading);
  }
  const pages=pdf.getPages();
  pages.forEach((p,i)=>{
    p.drawLine({start:{x:M,y:34},end:{x:W-M,y:34},thickness:.6,color:line});
    p.drawText(fit('Generated by '+report.generatedBy+' | '+report.generatedAt+' | Current saved data; not an immutable historical snapshot',normal,7,TW-75),{x:M,y:22,size:7,font:normal,color:muted});
    p.drawText('Page '+(i+1)+' / '+pages.length,{x:W-M-64,y:22,size:7,font:normal,color:muted});
  });
  return pdf.save();
}
