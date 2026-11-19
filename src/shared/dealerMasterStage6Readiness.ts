/**
 * Hosted D1 staging schema interpretation only. This module never connects to a DB.
 * A "schema ready" verdict does NOT authorize migration, Worker deployment or import.
 */
export type SchemaObject = {name:string;type:string};
export type Stage6ReadinessCode =
  | 'EMPTY_STAGING'
  | 'BASELINE_MISSING'
  | 'BASELINE_LEDGER_MISMATCH'
  | 'FOREIGN_KEY_VIOLATIONS'
  | 'DOCUMENTATION_0036_MISSING'
  | 'LEASE_TERMS_0037_MISSING'
  | 'DEALER_MASTER_0038_MISSING'
  | 'SCHEMA_PRESENT_APP_UAT_PENDING';

export type Stage6Readiness = {
  status:Stage6ReadinessCode;
  stagingSchemaReady:boolean;
  productionReady:false;
  appliedBaselineCount:number;
  tableCount:number;
  triggerCount:number;
  foreignKeyViolations:number;
  missingObjects:string[];
};

const doc0036=['coco_agreement_details'];
const lease0037=['coco_agreement_lease_terms','trg_coco_lease_terms_insert','trg_coco_lease_terms_update'];
const dealer0038=[
  'dealer_ro_master_details','dealer_land_master_details','dealer_lease_source_records',
  'trg_dealer_lease_same_outlet_insert','trg_dealer_lease_same_outlet_update',
  'trg_dealer_ro_master_details_protect_existing','trg_dealer_land_master_details_protect_existing',
  'trg_dealer_lease_source_records_protect_existing','uq_dealer_lease_sources_one_per_agreement',
];
function equalSets(a:string[],b:string[]) {
  return a.length===b.length&&new Set(a).size===a.length&&a.every(x=>b.includes(x));
}

export function assessStage6Staging(
  objects:SchemaObject[],
  appliedMigrations:string[]|null,
  expectedBaselineMigrations:string[],
  foreignKeyViolations:number,
):Stage6Readiness {
  const names=new Set(objects.map(o=>o.name));
  const missing=(list:string[])=>list.filter(n=>!names.has(n));
  const applicationTables=objects.filter(o=>
    o.type==='table'&&!o.name.startsWith('sqlite_')
    &&o.name!=='_cf_KV'&&o.name!=='d1_migrations',
  );
  const result=(status:Stage6ReadinessCode,missingObjects:string[]=[])=>({
    status,stagingSchemaReady:status==='SCHEMA_PRESENT_APP_UAT_PENDING',
    productionReady:false as const,
    appliedBaselineCount:appliedMigrations?.length??0,
    tableCount:applicationTables.length,
    triggerCount:objects.filter(o=>o.type==='trigger').length,
    foreignKeyViolations,missingObjects,
  });
  if(foreignKeyViolations!==0)return result('FOREIGN_KEY_VIOLATIONS');
  if(applicationTables.length===0)return result('EMPTY_STAGING');
  if(!appliedMigrations)return result('BASELINE_MISSING',['d1_migrations']);
  if(!equalSets(appliedMigrations,expectedBaselineMigrations))return result('BASELINE_LEDGER_MISMATCH');
  if(!names.has('retail_outlets'))return result('BASELINE_MISSING',['retail_outlets']);
  if(missing(doc0036).length)return result('DOCUMENTATION_0036_MISSING',missing(doc0036));
  if(missing(lease0037).length)return result('LEASE_TERMS_0037_MISSING',missing(lease0037));
  if(missing(dealer0038).length)return result('DEALER_MASTER_0038_MISSING',missing(dealer0038));
  return result('SCHEMA_PRESENT_APP_UAT_PENDING');
}

/** No caller-supplied SQL may reach Cloudflare. These are the entire request allowlist. */
export const STAGE6_READ_ONLY_QUERIES={
  schema:"SELECT name, type FROM sqlite_master WHERE type IN ('table','trigger','index') AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 500",
  migrations:"SELECT name FROM d1_migrations ORDER BY id LIMIT 100",
  foreignKeys:"PRAGMA foreign_key_check",
} as const;

export function assertStage6ReadOnlyQuery(sql:string) {
  if(!Object.values(STAGE6_READ_ONLY_QUERIES).includes(sql as typeof STAGE6_READ_ONLY_QUERIES[keyof typeof STAGE6_READ_ONLY_QUERIES]))
    throw Error('STAGE6_SQL_NOT_IN_READ_ONLY_ALLOWLIST');
  return sql;
}
