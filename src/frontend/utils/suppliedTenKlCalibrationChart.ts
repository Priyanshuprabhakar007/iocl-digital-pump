import type {GlobalTankCalibrationTemplate} from '../../shared/types';

/** Selected literal checkpoints visually read from page 1 of the supplied
 * scanned 10 KL chart. The PDF itself remains private, not checked into GitHub.
 */
export const suppliedTenKlChart={
  title:'Calibration Chart — 10 KL Tank (supplied PDF page 1)',
  templateCode:'EXCEL_10KL_REFERENCE',
  nominalLitres:10000,
  diameterMm:1940,
  lengthMm:3750,
  maxDipMm:1940,
  maxLitres:11073.41,
  storedPoints:195, // 194 printed 1-cm rows plus an existing synthetic zero
  checkpoints:[
    {dipMm:0,litres:0,origin:'synthetic zero'},
    {dipMm:10,litres:6.90,origin:'printed 1 cm'},
    {dipMm:810,litres:4378.94,origin:'printed 81 cm'},
    {dipMm:1940,litres:11073.41,origin:'printed 194 cm'},
  ] as const,
} as const;
export interface TenKlCheck {field:string;expected:string;stored:string;pass:boolean}
export interface TenKlChartComparison {
  status:'MATCH'|'MISMATCH'|'NOT_LOADED';
  summary:string;
  checks:TenKlCheck[];
}
export function compareSuppliedTenKlChart(template:GlobalTankCalibrationTemplate|null):TenKlChartComparison{
  if(!template||!template.points?.length){
    return {status:'NOT_LOADED',summary:'Load the existing 10 KL master and stored points.',checks:[]};
  }
  const checks:TenKlCheck[]=[];
  const ref=suppliedTenKlChart;
  const check=(field:string,expected:string,stored:string,pass:boolean)=>
    checks.push({field,expected,stored,pass});
  check('Template code',ref.templateCode,template.code,template.code===ref.templateCode);
  check('Nominal capacity',String(ref.nominalLitres)+' L',String(template.nominalCapacityLitres)+' L',template.nominalCapacityLitres===ref.nominalLitres);
  check('Diameter',String(ref.diameterMm)+' mm',String(template.tankDiameterMm??'-')+' mm',template.tankDiameterMm===ref.diameterMm);
  check('Length',String(ref.lengthMm)+' mm',String(template.tankLengthMm??'-')+' mm',template.tankLengthMm===ref.lengthMm);
  check('Max dip',String(ref.maxDipMm)+' mm',String(template.maxDipMm??'-')+' mm',template.maxDipMm===ref.maxDipMm);
  check('Count with 0',String(ref.storedPoints),String(template.points.length),template.points.length===ref.storedPoints);
  for(const p of ref.checkpoints){
    const item=template.points.find(x=>Math.abs(x.dipMillimetres-p.dipMm)<0.0001);
    const stored=item?.volumeLitres;
    check('Dip '+String(p.dipMm)+' mm ('+p.origin+')',p.litres.toFixed(2)+' L',
      stored===undefined?'Missing':stored.toFixed(2)+' L',
      stored!==undefined&&Math.abs(stored-p.litres)<=0.02);
  }
  const match=checks.every(c=>c.pass);
  return {status:match?'MATCH':'MISMATCH',
    summary:match
      ?'Existing 10 KL master matches the supplied scan at geometry and sampled printed checkpoints. This does not independently certify the scanned signature or a particular physical tank.'
      :'Stored chart differs from the supplied scan; resolve before tank assignment.',
    checks};
}
