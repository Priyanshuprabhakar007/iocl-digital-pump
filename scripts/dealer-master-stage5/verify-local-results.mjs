import fs from 'node:fs';
import path from 'node:path';

const destination=process.argv[2];
if(destination!=='.stage5-local')throw Error('Only disposable .stage5-local evidence directory is permitted');
const parse=(name)=>{
  const file=path.join(destination,name);
  const json=JSON.parse(fs.readFileSync(file,'utf8'));
  function rows(input){
    if(Array.isArray(input))return input.flatMap(rows);
    if(input&&typeof input==='object'){
      if(Array.isArray(input.results))return input.results;
      if(Array.isArray(input.result))return rows(input.result);
    }
    return [];
  }
  return rows(json);
};
const objects=parse('objects.json');
const names=new Set(objects.map(obj=>String(obj.name)));
const required=[
  'coco_agreement_details',
  'coco_agreement_lease_terms',
  'dealer_ro_master_details',
  'dealer_land_master_details',
  'dealer_lease_source_records',
  'trg_coco_lease_terms_insert',
  'trg_coco_lease_terms_update',
  'trg_dealer_lease_same_outlet_insert',
  'trg_dealer_lease_same_outlet_update',
  'trg_dealer_ro_master_details_protect_existing',
  'trg_dealer_land_master_details_protect_existing',
  'trg_dealer_lease_source_records_protect_existing',
  'uq_dealer_lease_sources_one_per_agreement',
];
const missing=required.filter(name=>!names.has(name));
if(missing.length)throw Error('Expected migration objects missing: '+missing.join(', '));
const fk=parse('foreign-keys.json');
if(fk.length)throw Error('Foreign key violation(s): '+fk.length);
const integrity=parse('integrity.json');
if(integrity.length!==1||String(Object.values(integrity[0])[0]).toLowerCase()!=='ok')
  throw Error('SQLite integrity_check did not return exactly ok');
const evidence={
  result:'PASS_LOCAL_ONLY',baselineMigrations:35,
  rehearsedProposedMigrations:['0036','0037','0038'],
  checkedObjects:required.length,foreignKeyViolations:0,integrity:'ok',
  hostedStagingVerified:false,productionChanges:false,
};
fs.writeFileSync(path.join(destination,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
