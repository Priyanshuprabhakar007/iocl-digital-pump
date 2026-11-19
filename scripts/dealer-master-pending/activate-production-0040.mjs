/**
 * GitHub Actions-only: production D1 Pending Setup 0040 + Worker deployment.
 * All source customer data and the temporary export remain on the ephemeral runner.
 * No public GitHub artifact, PR comment or console log contains customer data.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const DB='iocl-pump-manager-d1';
const UUID='305f76c6-c940-443f-86a9-33c309a55578';
const ACCOUNT='93888554ef9d9e0b8c18b322683a9652';
const CONFIG='wrangler.jsonc';
const SQL='docs/dealer-master-pending-0040/0040_pending_setup.sql';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'iocl-pending-0040-'));
const token=process.env.CLOUDFLARE_API_TOKEN||'';
const accountId=process.env.CLOUDFLARE_ACCOUNT_ID||'';
const root='https://api.cloudflare.com/client/v4/accounts/'+accountId+'/d1/database/'+UUID;

function guard(condition,reason){
  if(!condition)throw Error('BLOCKED: '+reason);
}
function run(args){
  return execFileSync('./node_modules/.bin/wrangler',args,{
    encoding:'utf8',maxBuffer:64*1024*1024,env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'},
  });
}
function query(sql){
  const result=JSON.parse(run(['d1','execute',DB,'--remote','--config',CONFIG,
    '--command',sql,'--json']));
  guard(Array.isArray(result)&&Array.isArray(result[0]?.results),
    'D1 read-only query failed');
  return result[0].results;
}
function hashRows(rows){
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
async function cloudflare(route){
  const response=await fetch(root+route,{
    headers:{Authorization:'Bearer '+token,Accept:'application/json'},
    signal:AbortSignal.timeout(35000),
  });
  guard(response.ok,'Cloudflare metadata or recovery request failed (HTTP '+response.status+')');
  const data=await response.json();
  guard(data?.success===true,'Cloudflare API did not confirm success');
  return data.result;
}
const outletSql='SELECT id,ro_code,name,outlet_type,city,district,status,lifecycle_status,is_archived FROM retail_outlets ORDER BY id';
const agreementSql='SELECT id,outlet_id,agreement_type,agreement_number,customer_code,counterparty_name,start_date,end_date FROM coco_agreement_details ORDER BY id';
const draftsSql='SELECT id,created_by,content_sha256,source_row_count FROM dealer_master_draft_uploads ORDER BY id';

try{
  console.log('[1/7] Validate production target, isolated 0040 migration and D1 Time Travel.');
  guard(token.length>=12&&accountId===ACCOUNT,'Cloudflare GitHub secrets absent or account mismatch');
  const cfg=JSON.parse(fs.readFileSync(CONFIG,'utf8'));
  const only=cfg.d1_databases?.[0];
  guard(cfg.name==='iocl-digital-pump-manager'&&cfg.vars?.ENVIRONMENT==='production'&&
    cfg.d1_databases.length===1&&only.binding==='DB'&&
    only.database_id===UUID&&only.database_name===DB,
    'Worker or D1 production binding mismatch');
  const source=fs.readFileSync(SQL,'utf8').replace(/^--.*$/gm,'');
  guard(/CREATE TABLE IF NOT EXISTS dealer_master_pending_setups/i.test(source)&&
    !/\b(DROP|ALTER|TRUNCATE|INSERT|REPLACE)\b/i.test(source)&&
    !/\bUPDATE\s+\S+\s+SET\b/i.test(source)&&
    !/\bDELETE\s+FROM\b/i.test(source)&&
    !/\b(retail_outlets|coco_agreement_details|nfr_leases)\b/i.test(source),
    'Pending Setup migration must be additive and isolated');
  const metadata=await cloudflare('');
  guard(metadata?.uuid===UUID&&metadata?.name===DB&&metadata?.version==='production',
    'Hosted D1 identity or storage version mismatch');
  const bookmark=await cloudflare('/time_travel/bookmark');
  guard(typeof bookmark?.bookmark==='string'&&bookmark.bookmark.length>=20,
    'Cloudflare-managed recovery bookmark unavailable');
  console.log('Verified D1 Time Travel recovery at '+new Date().toISOString()+' (bookmark withheld).');

  console.log('[2/7] Take private fingerprints of operational RO/Agreement data.');
  const beforeOutlets=hashRows(query(outletSql));
  const beforeAgreements=hashRows(query(agreementSql));
  const beforeDrafts=hashRows(query(draftsSql));

  console.log('[3/7] Verify full remote D1 SQL export privately.');
  const exportPath=path.join(temp,'unpublished-prod-backup.sql');
  run(['d1','export',DB,'--remote','--config',CONFIG,'--output',exportPath,'--skip-confirmation']);
  const stats=fs.statSync(exportPath);
  guard(stats.size>1000,'Private D1 export empty');
  const backup=fs.readFileSync(exportPath,'utf8');
  guard(backup.includes('retail_outlets')&&backup.includes('coco_agreement_details'),
    'D1 backup missing expected schema');
  // This temporary export is NOT durable; durable recovery is Time Travel in Cloudflare.
  // The repository is PUBLIC: never upload SQL backups to GitHub Actions artifacts.
  console.log('Private temporary export verified. No customer rows published.');

  console.log('[4/7] Apply ONLY 0040 pending setup table; no operational writes.');
  run(['d1','execute',DB,'--remote','--config',CONFIG,'--file',SQL,'--yes']);
  const names=new Set(query(
    "SELECT name FROM sqlite_master WHERE name IN ("+
    "'dealer_master_pending_setups','idx_dealer_pending_creator') ORDER BY name"
  ).map(x=>x.name));
  guard(['dealer_master_pending_setups','idx_dealer_pending_creator']
    .every(x=>names.has(x)),'Pending-only table/index missing');
  const cols=new Set(query('PRAGMA table_info(dealer_master_pending_setups)').map(x=>x.name));
  guard(['draft_id','ro_code','created_by','setup_json','revision','updated_at']
    .every(x=>cols.has(x)),'Pending setup schema mismatch');
  const sourceTriggers=new Set(query(
    "SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ("+
    "'trg_dealer_draft_no_overwrite','trg_dealer_draft_no_delete') ORDER BY name"
  ).map(x=>x.name));
  guard(sourceTriggers.size===2,'Immutable Dealer Master source protection missing');

  console.log('[5/7] Verify existing records untouched by schema migration.');
  guard(hashRows(query(outletSql))===beforeOutlets&&
    hashRows(query(agreementSql))===beforeAgreements&&
    hashRows(query(draftsSql))===beforeDrafts,
    'Operational source tables changed during migration; release stopped');

  console.log('[6/7] Deploy the latest reviewed Cloudflare Worker.');
  run(['deploy','--config',CONFIG]);

  console.log('[7/7] Final read-only verification; operational full import remains locked.');
  guard(hashRows(query(outletSql))===beforeOutlets&&
    hashRows(query(agreementSql))===beforeAgreements&&
    hashRows(query(draftsSql))===beforeDrafts,
    'Operational source tables changed during release; investigate concurrent writes');
  console.log('SUCCESS: Pending Setup 0040 and Worker deployed. RO, agreements and source drafts unchanged.');
  console.log('On live site: Retail Outlets > Pending Setup > Save/Edit Pending.');
  console.log('The 131 Excel rows have NOT been automatically imported into operational tables.');
}catch(e){
  console.error('Release STOPPED: '+(e instanceof Error?e.message:'Unknown error'));
  process.exitCode=1;
}finally{
  fs.rmSync(temp,{recursive:true,force:true});
}
