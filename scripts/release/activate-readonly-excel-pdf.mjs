/**
 * GitHub Actions only: deploy read-only section-wise Excel/PDF Worker code.
 * No migrations, INSERT/UPDATE/DELETE, D1/R2 data writes or exported customer data.
 */
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const DB='iocl-pump-manager-d1';
const UUID='305f76c6-c940-443f-86a9-33c309a55578';
const ACCOUNT='93888554ef9d9e0b8c18b322683a9652';
const token=process.env.CLOUDFLARE_API_TOKEN||'';
const accountId=process.env.CLOUDFLARE_ACCOUNT_ID||'';
const root='https://api.cloudflare.com/client/v4/accounts/'+accountId+'/d1/database/'+UUID;
function guard(ok,msg){if(!ok)throw Error('RELEASE BLOCKED: '+msg);}
function run(args){return execFileSync('./node_modules/.bin/wrangler',args,{
  encoding:'utf8',maxBuffer:50*1024*1024,
  env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'},
});}
function query(sql){
  const r=JSON.parse(run(['d1','execute',DB,'--remote','--config','wrangler.jsonc',
    '--command',sql,'--json']));
  guard(Array.isArray(r)&&Array.isArray(r[0]?.results),'D1 read-only query failed');
  return r[0].results;
}
function hash(v){return createHash('sha256').update(JSON.stringify(v)).digest('hex');}
async function cf(route){
  const response=await fetch(root+route,{
    headers:{Authorization:'Bearer '+token,Accept:'application/json'},
    signal:AbortSignal.timeout(35000),
  });
  guard(response.ok,'Cloudflare metadata request failed: HTTP '+response.status);
  const json=await response.json();
  guard(json?.success===true,'Cloudflare identity/recovery unavailable');
  return json.result;
}

try{
  console.log('[1/5] Validate authorized Cloudflare production target; no database migration.');
  guard(token.length>=12&&accountId===ACCOUNT,'Cloudflare production token or account mismatch');
  const config=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));
  guard(config.name==='iocl-digital-pump-manager'&&
    config.vars?.ENVIRONMENT==='production'&&
    config.d1_databases?.length===1&&
    config.d1_databases[0].binding==='DB'&&
    config.d1_databases[0].database_name===DB&&
    config.d1_databases[0].database_id===UUID,
    'Worker or database binding mismatch');
  const metadata=await cf('');
  guard(metadata?.uuid===UUID&&metadata?.name===DB&&metadata?.version==='production',
    'Production D1 identity mismatch');
  const bookmark=await cf('/time_travel/bookmark');
  guard(typeof bookmark?.bookmark==='string'&&bookmark.bookmark.length>=20,
    'D1 Time Travel recovery bookmark unavailable');
  console.log('Production D1 identity and recovery point verified; bookmark withheld.');

  console.log('[2/5] Verify existing 0039 draft storage and capture private metadata fingerprints.');
  const tabs=query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ("+
    "'retail_outlets','coco_agreement_details','dealer_master_draft_uploads') ORDER BY name"
  );
  guard(tabs.length===3,'Read-only Excel source or required operational tables missing');
  const outletSql='SELECT id,ro_code,name,status,city,pincode FROM retail_outlets ORDER BY id';
  const agreementSql='SELECT id,outlet_id,agreement_type,agreement_number,start_date,end_date FROM coco_agreement_details ORDER BY id';
  const draftSql='SELECT id,created_by,content_sha256,source_row_count FROM dealer_master_draft_uploads ORDER BY id';
  const before=[hash(query(outletSql)),hash(query(agreementSql)),hash(query(draftSql))];

  console.log('[3/5] Deploy reviewed Worker source only; do NOT execute migrations.');
  run(['deploy','--config','wrangler.jsonc']);

  console.log('[4/5] Check no outlet, agreement or Excel-draft metadata changed during deployment.');
  const after=[hash(query(outletSql)),hash(query(agreementSql)),hash(query(draftSql))];
  guard(before.every((v,i)=>v===after[i]),'Data changed concurrently; investigate before further rollout');

  console.log('[5/5] SUCCESS: read-only Excel source appendix available in Worker.');
  console.log('No D1 schema or record changes; signed agreement and rent records untouched.');
}catch(e){
  console.error('STOPPED: '+(e instanceof Error?e.message:'Unknown failure'));
  process.exitCode=1;
}
