/**
 * Intentionally READ-ONLY hosted D1 staging preflight. No data rows are fetched.
 * Needs a D1 Read token. Never invoke with a production credential or database.
 *
 * After checkout, an authorized operator may run (with private env credentials):
 * STAGE6_APPROVED_READONLY=confirm-staging-readonly bun scripts/dealer-master-stage6/hosted-readonly.ts
 */
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {assessStage6Staging,assertStage6ReadOnlyQuery,STAGE6_READ_ONLY_QUERIES} from '../../src/shared/dealerMasterStage6Readiness';

type Dict=Record<string,unknown>;
const parseConfig=(file:string)=>JSON.parse(readFileSync(file,'utf8')) as Dict;
const expectedAccount='93888554ef9d9e0b8c18b322683a9652';
const stage=parseConfig('scripts/stage01x/wrangler.phase1-staging.jsonc');
const production=parseConfig('wrangler.jsonc');
const stageDb=(stage.d1_databases as Dict[])?.[0];
const prodDb=(production.d1_databases as Dict[])?.[0];

function requiredTarget(){
  if(process.env.STAGE6_APPROVED_READONLY!=='confirm-staging-readonly')
    throw Error('EXPLICIT_STAGING_READONLY_ACKNOWLEDGMENT_REQUIRED');
  const account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
  const dbId=process.env.CLOUDFLARE_STAGING_D1_ID||'';
  const token=process.env.CLOUDFLARE_API_TOKEN||'';
  if(!/^[a-f0-9]{32}$/.test(account)||account!==expectedAccount)
    throw Error('STAGING_ACCOUNT_MISMATCH_OR_NOT_CONFIGURED');
  if(!/^[a-f0-9-]{36}$/i.test(dbId)||dbId!==stageDb?.database_id
    ||dbId===prodDb?.database_id||dbId==='9025eb32-4ea8-4bb9-a6e1-ab8ba55bf782')
    throw Error('STAGING_DATABASE_UUID_MISMATCH_OR_PRODUCTION_TARGET');
  if(stageDb?.database_name!=='iocl-phase1-full-staging'
    ||stage.vars===undefined||(stage.vars as Dict).ENVIRONMENT!=='staging'
    ||(stage.r2_buckets as unknown[]|undefined)?.length)
    throw Error('STAGING_CONFIG_NOT_ISOLATED');
  if(!token||token.length<12)throw Error('D1_READ_TOKEN_NOT_CONFIGURED');
  return {account,dbId,token};
}

async function cloudflare(path:string,token:string,method:'GET'|'POST',sql?:string) {
  const response=await fetch('https://api.cloudflare.com/client/v4'+path,{
    method,headers:{Authorization:'Bearer '+token,Accept:'application/json',
      ...(method==='POST'?{'Content-Type':'application/json'}:{})},
    ...(method==='POST'?{body:JSON.stringify({sql:assertStage6ReadOnlyQuery(sql||''),params:[]})}:{}),
    signal:AbortSignal.timeout(20000),
  });
  if(!response.ok)throw Error('CLOUDFLARE_READ_REQUEST_FAILED_HTTP_'+response.status);
  const parsed=await response.json() as {success:boolean;result:unknown};
  if(!parsed.success)throw Error('CLOUDFLARE_READ_REQUEST_NOT_SUCCESSFUL');
  if(method==='GET')return parsed.result as Dict;
  const queries=parsed.result as {success:boolean;results:Dict[];meta?:{changes?:number;rows_written?:number}}[];
  if(!Array.isArray(queries)||queries.length!==1||!queries[0]?.success||!Array.isArray(queries[0].results))
    throw Error('CLOUDFLARE_SQL_READ_RESULT_NOT_VERIFIED');
  const {meta}=queries[0];
  if((meta?.changes??0)!==0||(meta?.rows_written??0)!==0)
    throw Error('STAGING_READ_UNEXPECTEDLY_WROTE_ROWS');
  return queries[0].results;
}

async function main(){
  const {account,dbId,token}=requiredTarget();
  const prefix='/accounts/'+account+'/d1/database/'+dbId;
  const metadata=await cloudflare(prefix,token,'GET') as Dict;
  if(metadata.uuid!==dbId||metadata.name!==stageDb?.database_name)
    throw Error('CLOUDFLARE_HOSTED_DATABASE_IDENTITY_MISMATCH');

  const objects=await cloudflare(prefix+'/query',token,'POST',STAGE6_READ_ONLY_QUERIES.schema) as Dict[];
  if(objects.some(o=>typeof o.name!=='string'||typeof o.type!=='string'))
    throw Error('SCHEMA_METADATA_FORMAT_INVALID');
  const hasLedger=objects.some(o=>o.type==='table'&&o.name==='d1_migrations');
  const migrations=hasLedger?await cloudflare(prefix+'/query',token,'POST',STAGE6_READ_ONLY_QUERIES.migrations) as Dict[]:null;
  const fk=await cloudflare(prefix+'/query',token,'POST',STAGE6_READ_ONLY_QUERIES.foreignKeys) as Dict[];

  const expected=readdirSync('migrations').filter(f=>/^\d{4}_.+\.sql$/.test(f)).sort();
  if(expected.length!==35)throw Error('FROZEN_BASELINE_35_FILES_NOT_VERIFIED');
  const report=assessStage6Staging(
    objects as {name:string;type:string}[],
    migrations?.map(m=>String(m.name||''))??null,
    expected,fk.length,
  );
  const evidence={
    workflow:'stage6-staging-d1-readonly',checkedAtUtc:new Date().toISOString(),
    targetMetadataVerified:true,stagingDatabaseName:'iocl-phase1-full-staging',
    d1Version:String(metadata.version||'unspecified'),...report,
    sqlReadOnlyAllowlistEnforced:true,databaseWrites:0,
    hostedWorkerVerified:false,productionMigrationAuthorized:false,
    productionExcelImportAuthorized:false,
  };
  mkdirSync('.stage6-readonly',{recursive:true});
  writeFileSync('.stage6-readonly/evidence.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
  if(!report.stagingSchemaReady)console.log('::warning::Stage 6 staging schema is NOT READY; no hosted changes allowed.');
  else console.log('::notice::Staging schema objects present; Worker, data isolation and legal import UAT still require independent verification.');
}

main().catch((err:unknown)=>{
  const code=err instanceof Error?err.message:'STAGE6_UNKNOWN_FAILURE';
  // Never log HTTP response bodies, token, metadata records or user data.
  console.error('::error::Stage 6 read-only preflight stopped: '+code);
  process.exitCode=1;
});
