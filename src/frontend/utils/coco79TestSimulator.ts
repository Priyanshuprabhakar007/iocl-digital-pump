/** COCO-79 isolated Daily Operations simulator. NO imports of production repositories,
 * write APIs, D1, R2 or shift services. All readings and prices are EXAMPLE UAT DATA.
 * Physical mapping is a provisional transcription of the supplied sketch.
 */
export type TestFuel='MS'|'HSD'|'XP95'|'XP100'|'XTRAGREEN';
export interface PhysicalTestTank {number:number;fuel:TestFuel;capacityL:number;provisional?:boolean}
export interface PhysicalTestNozzle {id:string;du:number;position:number;fuel:TestFuel;tank:number;provisional?:boolean}
export interface TankTestReading extends PhysicalTestTank {openingL:number;receiptL:number;closingL:number|null}
export interface NozzleTestReading extends PhysicalTestNozzle {opening:number;closing:number|null;testingL:number|null}
export interface TestCollections {cash:number|null;upi:number|null;pos:number|null;credit:number|null}
export interface TestShift {
  number:number;label:string;timing:string;status:'OPEN'|'CLOSED';
  tanks:TankTestReading[];nozzles:NozzleTestReading[];
  prices:Record<TestFuel,number|null>;collections:TestCollections;
}
export interface TestDay {outlet:'369460';shifts:TestShift[];selected:number}
export const COCO79_TANKS:readonly PhysicalTestTank[]=[
  {number:1,fuel:'MS',capacityL:20000},
  {number:2,fuel:'HSD',capacityL:20000},
  {number:3,fuel:'HSD',capacityL:20000,provisional:true},
  {number:4,fuel:'XP95',capacityL:20000},
  {number:5,fuel:'MS',capacityL:20000},
  {number:6,fuel:'XTRAGREEN',capacityL:10000},
  {number:7,fuel:'XP100',capacityL:10000},
];
const DU_SIDES: readonly [TestFuel,number,TestFuel,number,boolean?][]=[
  ['HSD',3,'XP95',4,true], // M/C-1 HSD supply inferred; must be checked physically
  ['MS',5,'HSD',2],
  ['XTRAGREEN',6,'MS',1],
  ['MS',5,'HSD',2],
  ['XP95',4,'XP100',7],
];
export const COCO79_NOZZLES:readonly PhysicalTestNozzle[]=DU_SIDES.flatMap(([leftFuel,leftTank,rightFuel,rightTank,uncertain],i)=>
  [1,2,3,4].map(position=>({
    id:'DU'+(i+1)+'-N'+position,du:i+1,position,
    fuel:position<=2?leftFuel:rightFuel,
    tank:position<=2?leftTank:rightTank,
    provisional:Boolean(uncertain&&position<=2),
  })));
export const TEST_SHIFT_TIMES=[
  {label:'Shift 1 — Morning',timing:'06:00–14:00'},
  {label:'Shift 2 — Evening',timing:'14:00–22:00'},
  {label:'Shift 3 — Overnight',timing:'22:00–06:00 (+1 day)'},
] as const;
export const TEST_FUELS:readonly TestFuel[]=['MS','HSD','XP95','XP100','XTRAGREEN'];
export const EXAMPLE_ONLY_PRICES:Readonly<Record<TestFuel,number>>={MS:103,HSD:91,XP95:115,XP100:150,XTRAGREEN:95};
const r3=(n:number)=>Math.round(n*1000)/1000;
const r2=(n:number)=>Math.round(n*100)/100;
function money(c:TestCollections):number|null{
 const vals=[c.cash,c.upi,c.pos,c.credit];
 return vals.every(v=>v!==null&&Number.isFinite(v)&&v>=0)?r2(vals.reduce<number>((s,v)=>s+(v??0),0)):null;
}
export function createTestShift(index:number,previous?:TestShift):TestShift {
  if(index<0||index>2)throw Error('Only three shift slots are defined');
  const tpl=TEST_SHIFT_TIMES[index];
  return {
    number:index+1,label:tpl.label,timing:tpl.timing,status:'OPEN',
    tanks:COCO79_TANKS.map(t=>({...t,openingL:previous?.tanks.find(p=>p.number===t.number)?.closingL??r3(t.capacityL*.6),receiptL:0,closingL:null})),
    nozzles:COCO79_NOZZLES.map((n,i)=>({...n,
      opening:previous?.nozzles.find(p=>p.id===n.id)?.closing??(10000+i*1000),
      closing:null,testingL:null})),
    prices:{...EXAMPLE_ONLY_PRICES},collections:{cash:null,upi:null,pos:null,credit:null},
  };
}
export function newTestDay():TestDay{return {outlet:'369460',shifts:[createTestShift(0)],selected:0};}
export interface TestProductResult {fuel:TestFuel;grossL:number;testingL:number;netL:number;receiptL:number;revenue:number}
export interface TestTankResult {tank:number;fuel:TestFuel;openingL:number;receiptL:number;netL:number;expectedClosingL:number;physicalClosingL:number|null;varianceL:number|null}
export interface TestShiftResult {
  errors:string[];products:TestProductResult[];tanks:TestTankResult[];
  grossL:number;testingL:number;netL:number;revenue:number;
  collected:number|null;paymentVariance:number|null;stockBalanced:boolean;financeBalanced:boolean;ready:boolean;
}
export function evaluateTestShift(shift:TestShift):TestShiftResult{
 const errors:string[]=[];
 const byFuel=new Map<TestFuel,TestProductResult>(TEST_FUELS.map(fuel=>[fuel,{fuel,grossL:0,testingL:0,netL:0,receiptL:0,revenue:0}]));
 const tankSales=new Map<number,number>();
 for(const nozzle of shift.nozzles){
   const {opening,closing,testingL}=nozzle;
   if(closing===null||testingL===null||![opening,closing,testingL].every(Number.isFinite)){
     errors.push(nozzle.id+': meter closing and testing quantity are required');continue;
   }
   const gross=r3(closing-opening);
   if(gross<0||testingL<0||testingL>gross){
     errors.push(nozzle.id+': invalid closing totalizer or testing quantity');continue;
   }
   const net=r3(gross-testingL);
   const item=byFuel.get(nozzle.fuel)!;
   item.grossL=r3(item.grossL+gross);
   item.testingL=r3(item.testingL+testingL);
   item.netL=r3(item.netL+net);
   tankSales.set(nozzle.tank,r3((tankSales.get(nozzle.tank)||0)+net));
 }
 const tanks=shift.tanks.map(t=>{
   if(![t.openingL,t.receiptL].every(Number.isFinite)||t.openingL<0||t.receiptL<0||t.openingL>t.capacityL){
     errors.push('Tank '+t.number+': invalid opening volume or receipt');
   }
   const p=byFuel.get(t.fuel)!;p.receiptL=r3(p.receiptL+t.receiptL);
   const netL=tankSales.get(t.number)||0;
   const expectedClosingL=r3(t.openingL+t.receiptL-netL);
   if(expectedClosingL<0||expectedClosingL>t.capacityL)errors.push('Tank '+t.number+': book stock exceeds capacity bounds');
   if(t.closingL===null||!Number.isFinite(t.closingL)) errors.push('Tank '+t.number+': physical closing volume is required');
   else if(t.closingL<0||t.closingL>t.capacityL)errors.push('Tank '+t.number+': physical stock outside tank capacity');
   const varianceL=t.closingL===null?null:r3(t.closingL-expectedClosingL);
   if(varianceL!==null&&Math.abs(varianceL)>0.01)errors.push('Tank '+t.number+': stock variance '+varianceL.toFixed(3)+' L');
   return {tank:t.number,fuel:t.fuel,openingL:t.openingL,receiptL:t.receiptL,netL,expectedClosingL,physicalClosingL:t.closingL,varianceL};
 });
 const products=[...byFuel.values()].map(p=>{
   const unitPrice=shift.prices[p.fuel];
   if(unitPrice===null||!Number.isFinite(unitPrice)||unitPrice<0)errors.push(p.fuel+': valid test selling price required');
   return {...p,revenue:r2(p.netL*(unitPrice??0))};
 });
 const revenue=r2(products.reduce((total,p)=>total+p.revenue,0));
 const collected=money(shift.collections);
 if(collected===null)errors.push('Cash, UPI, POS and Credit test collections are required');
 const paymentVariance=collected===null?null:r2(collected-revenue);
 if(paymentVariance!==null&&Math.abs(paymentVariance)>0.01)errors.push('Collections differ from calculated fuel sales by Rs '+paymentVariance.toFixed(2));
 const grossL=r3(products.reduce((n,p)=>n+p.grossL,0));
 const testingL=r3(products.reduce((n,p)=>n+p.testingL,0));
 const netL=r3(products.reduce((n,p)=>n+p.netL,0));
 return {
   errors,products,tanks,grossL,testingL,netL,revenue,collected,paymentVariance,
   stockBalanced:tanks.every(t=>t.varianceL!==null&&Math.abs(t.varianceL)<=0.01),
   financeBalanced:paymentVariance!==null&&Math.abs(paymentVariance)<=0.01,
   ready:errors.length===0,
 };
}
export function closeTestShift(day:TestDay):TestDay{
 const shift=day.shifts[day.selected];
 if(!shift||shift.status==='CLOSED')throw Error('Test shift is already closed or missing');
 const result=evaluateTestShift(shift);
 if(!result.ready)throw Error(result.errors.slice(0,4).join('; '));
 return {...day,shifts:day.shifts.map((s,i)=>i===day.selected?{...s,status:'CLOSED'}:s)};
}
export function openNextTestShift(day:TestDay):TestDay{
 const last=day.shifts[day.shifts.length-1];
 if(last.status!=='CLOSED'||last.number===3)throw Error('Close the current test shift before opening the next');
 return {...day,shifts:[...day.shifts,createTestShift(day.shifts.length,last)],selected:day.shifts.length};
}
export function fillExampleReadings(shift:TestShift):TestShift{
 const nozzles=shift.nozzles.map((n,i)=>({...n,testingL:2,
   closing:r3(n.opening+55+shift.number*9+i*1.5)}));
 const tankNet=new Map<number,number>();
 for(const n of nozzles)tankNet.set(n.tank,r3((tankNet.get(n.tank)||0)+(n.closing!-n.opening-n.testingL!)));
 const tanks=shift.tanks.map(t=>{
   const receiptL=shift.number===1&&t.number===2?1000:0;
   return {...t,receiptL,closingL:r3(t.openingL+receiptL-(tankNet.get(t.number)||0))};
 });
 const interim={...shift,nozzles,tanks};
 const revenue=evaluateTestShift(interim).revenue;
 const cash=r2(revenue*.3),upi=r2(revenue*.4),pos=r2(revenue*.2);
 return {...interim,collections:{cash,upi,pos,credit:r2(revenue-cash-upi-pos)}};
}
export function generateExampleDay():TestDay{
 let day=newTestDay();
 for(let i=0;i<3;i++){
   day={...day,shifts:day.shifts.map((s,j)=>j===day.selected?fillExampleReadings(s):s)};
   day=closeTestShift(day);
   if(i<2)day=openNextTestShift(day);
 }
 return day;
}
export function summarizeTestDay(day:TestDay){
 const closed=day.shifts.filter(s=>s.status==='CLOSED');
 const results=closed.map(evaluateTestShift);
 return {
   completed:closed.length===3,
   shiftsClosed:closed.length,
   grossL:r3(results.reduce((s,r)=>s+r.grossL,0)),
   testingL:r3(results.reduce((s,r)=>s+r.testingL,0)),
   netL:r3(results.reduce((s,r)=>s+r.netL,0)),
   revenue:r2(results.reduce((s,r)=>s+r.revenue,0)),
   receiptsL:r3(results.flatMap(r=>r.tanks).reduce((s,t)=>s+t.receiptL,0)),
   collected:r2(results.reduce((s,r)=>s+(r.collected||0),0)),
   products:TEST_FUELS.map(fuel=>({fuel,
     netL:r3(results.reduce((s,r)=>s+(r.products.find(p=>p.fuel===fuel)?.netL||0),0)),
     revenue:r2(results.reduce((s,r)=>s+(r.products.find(p=>p.fuel===fuel)?.revenue||0),0)),
   })),
 };
}