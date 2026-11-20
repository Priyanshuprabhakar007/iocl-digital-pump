import {describe,it,expect} from 'vitest';
import {compareSuppliedTenKlChart,suppliedTenKlChart} from '../src/frontend/utils/suppliedTenKlCalibrationChart';
import type {GlobalTankCalibrationTemplate} from '../src/shared/types';
function sourceChart(overrides:Partial<GlobalTankCalibrationTemplate>={}):GlobalTankCalibrationTemplate{
 const expected=suppliedTenKlChart;
 const points=Array.from({length:195},(_,i)=>({
   id:String(i),templateId:'gtct-excel-10kl-ref',dipMillimetresMilliunits:i*10000,
   volumeMilliunits:0,dipMillimetres:i*10,volumeLitres:0,dipMmStr:String(i*10),volumeLitreStr:'0',
   createdAt:'',createdBy:'',
 }));
 for(const v of expected.checkpoints){
   const p=points.find(item=>item.dipMillimetres===v.dipMm)!;
   p.volumeLitres=v.litres;p.volumeMilliunits=Math.round(v.litres*1000);
   p.volumeLitreStr=v.litres.toFixed(2);
 }
 return {
   id:'gtct-excel-10kl-ref',code:expected.templateCode,name:'Existing 10 KL master',
   nominalCapacityLitres:10000,chartUnitDip:'MM',chartUnitVolume:'LITRES',
   tankDiameterMmMilliunits:1940000,tankLengthMmMilliunits:3750000,maxDipMmMilliunits:1940000,
   tankDiameterMm:1940,tankLengthMm:3750,maxDipMm:1940,
   tankDiameterMmStr:'1940',tankLengthMmStr:'3750',maxDipMmStr:'1940',
   revisionNumber:1,status:'DRAFT',sourceFileName:'source.xlsx',referenceDocument:null,notes:null,
   approvedBy:null,approvedAt:null,createdBy:'test',createdAt:'',updatedAt:'',pointsCount:195,points,
   ...overrides,
 };
}
describe('existing 10 KL master comparison against supplied scanned chart',()=>{
 it('matches geometry and selected printed checkpoints',()=>{
   const result=compareSuppliedTenKlChart(sourceChart());
   expect(result.status).toBe('MATCH');
   expect(result.checks).toHaveLength(10);
   expect(result.checks.every(c=>c.pass)).toBe(true);
 });
 it('rejects altered points even when labeled approved',()=>{
   const src=sourceChart();
   const points=src.points!.map(p=>p.dipMillimetres===810?{...p,volumeLitres:p.volumeLitres+1}:p);
   expect(compareSuppliedTenKlChart({...src,points,status:'APPROVED'}).status).toBe('MISMATCH');
 });
 it('does not turn missing points into zero',()=>{
   expect(compareSuppliedTenKlChart(sourceChart({points:[]})).status).toBe('NOT_LOADED');
 });
 it('uses 1940mm diameter, 3750mm length, 11073.41L maximum',()=>{
   expect(suppliedTenKlChart.diameterMm).toBe(1940);
   expect(suppliedTenKlChart.lengthMm).toBe(3750);
   expect(suppliedTenKlChart.maxDipMm).toBe(1940);
   expect(suppliedTenKlChart.maxLitres).toBe(11073.41);
 });
});
