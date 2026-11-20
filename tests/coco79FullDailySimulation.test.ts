import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
 COCO79_TANKS,COCO79_NOZZLES,TEST_FUELS,newTestDay,generateExampleDay,
 createTestShift,fillExampleReadings,evaluateTestShift,closeTestShift,openNextTestShift,
 summarizeTestDay,
} from '../src/frontend/utils/coco79TestSimulator';
describe('COCO79 (369460) fully isolated daily operations simulator',()=>{
 it('transcribes physical drawing without duplicate equipment or made-up certification',()=>{
   expect(COCO79_TANKS).toHaveLength(7);
   expect(COCO79_NOZZLES).toHaveLength(20);
   expect(new Set(COCO79_NOZZLES.map(n=>n.id)).size).toBe(20);
   expect(new Set(COCO79_TANKS.map(t=>t.number)).size).toBe(7);
   expect(new Set(COCO79_NOZZLES.map(n=>n.du)).size).toBe(5);
   expect(new Set(COCO79_TANKS.map(t=>t.fuel)).size).toBe(5);
   expect(COCO79_TANKS.reduce((v,t)=>v+t.capacityL,0)).toBe(120000);
   expect(COCO79_TANKS.filter(t=>t.capacityL===10000)).toHaveLength(2);
   expect(COCO79_NOZZLES.every(n=>COCO79_TANKS.find(t=>t.number===n.tank)?.fuel===n.fuel)).toBe(true);
   expect(COCO79_NOZZLES.filter(n=>n.provisional)).toHaveLength(2);
   expect(TEST_FUELS).toContain('XP100');
 });
 it('blocks an incomplete shift rather than converting absent readings to zero',()=>{
   const s=newTestDay();
   const check=evaluateTestShift(s.shifts[0]);
   expect(check.ready).toBe(false);
   expect(check.errors.some(e=>e.includes('closing'))).toBe(true);
   expect(()=>closeTestShift(s)).toThrow();
 });
 it('runs full three-shift dry-run including receipt, tank and nozzle sales, finance and DSR',()=>{
   const day=generateExampleDay();
   expect(day.shifts).toHaveLength(3);
   expect(day.shifts.map(s=>s.status)).toEqual(['CLOSED','CLOSED','CLOSED']);
   for(const shift of day.shifts){
     const output=evaluateTestShift(shift);
     expect(output.ready).toBe(true);
     expect(output.errors).toEqual([]);
     expect(output.stockBalanced).toBe(true);
     expect(output.financeBalanced).toBe(true);
     expect(shift.nozzles).toHaveLength(20);
     expect(output.products.reduce((v,p)=>v+p.netL,0)).toBeGreaterThan(0);
     expect(output.collected).toBe(output.revenue);
     expect(output.tanks.every(t=>t.varianceL===0)).toBe(true);
   }
   const summary=summarizeTestDay(day);
   expect(summary.completed).toBe(true);
   expect(summary.shiftsClosed).toBe(3);
   expect(summary.products).toHaveLength(5);
   expect(summary.receiptsL).toBe(1000);
   expect(summary.revenue).toBe(summary.collected);
   expect(summary.netL).toBeGreaterThan(0);
 });
 it('carries tank stock and nozzle meter totals between shift close/reopen',()=>{
   let day=newTestDay();
   day={...day,shifts:[fillExampleReadings(day.shifts[0])]};
   day=closeTestShift(day);
   day=openNextTestShift(day);
   expect(day.shifts[1].status).toBe('OPEN');
   for(const prevTank of day.shifts[0].tanks)
     expect(day.shifts[1].tanks.find(t=>t.number===prevTank.number)?.openingL).toBe(prevTank.closingL);
   for(const prevNozzle of day.shifts[0].nozzles)
     expect(day.shifts[1].nozzles.find(n=>n.id===prevNozzle.id)?.opening).toBe(prevNozzle.closing);
   expect(()=>openNextTestShift(day)).toThrow();
 });
 it('blocks shift close on tank mismatch, invalid meter and missing collections',()=>{
   const start=newTestDay();
   const filled=fillExampleReadings(start.shifts[0]);
   const variance={...filled,tanks:filled.tanks.map((t,i)=>i===0?{...t,closingL:(t.closingL||0)+10}:t)};
   expect(evaluateTestShift(variance).ready).toBe(false);
   const invalid={...filled,nozzles:filled.nozzles.map((n,i)=>i===0?{...n,closing:n.opening-1}:n)};
   expect(evaluateTestShift(invalid).errors.some(v=>v.includes('invalid closing totalizer'))).toBe(true);
   const noCash={...filled,collections:{...filled.collections,cash:null}};
   expect(evaluateTestShift(noCash).financeBalanced).toBe(false);
 });
 it('does not contain production write API calls and restricts entry point to COCO79',()=>{
   const component=readFileSync(resolve('src/frontend/components/pump/Coco79DailyOperationsTestMode.tsx'),'utf8');
   const page=readFileSync(resolve('src/frontend/pages/DailyOperationsPage.tsx'),'utf8');
   expect(page).toContain("selectedOutlet?.roCode==='369460'");
   expect(page).toContain('coco79-isolated-test-dialog');
   expect(component).toContain('run-coco79-full-sample-day');
   expect(component).toContain('coco79-test-dsr');
   expect(component).toContain('SIMULATION ONLY — NO LIVE WRITES');
   expect(component).toContain("cache:'no-store'");
   expect(component).not.toMatch(/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
   expect(component).not.toContain('saveMeterReadingsBatch');
   expect(component).not.toContain('saveTankReadingsBatch');
   expect(component).not.toContain('handleCloseShift');
 });
});
