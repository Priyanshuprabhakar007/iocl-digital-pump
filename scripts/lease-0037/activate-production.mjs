/**
 * Additive-only production migration 0037 for Coco Agreement Lease Terms.
 * Runs in an authorized GitHub Actions environment with Cloudflare D1 credentials.
 * No source Excel data, signed agreement, rent ledger or document rows are inserted.
 * The backup stays on this private ephemeral runner and is deleted at the end;
 * durable recovery comes from verified D1 Time Travel.
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
const SQL='docs/lease-migration-0037/0037_coco_agreement_lease_terms.sql';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'iocl-lease-0037-'));
const token=process.env.CLOUDFLARE_API_TOKEN||'';
const accountId=process.env.CLOUDFLARE_ACCOUNT_ID||'';
const root='https://api.cloudflare.com/client/v4/accounts/'+accountId+'/d1/database/'+UUID;
function guard(ok,message){if(!ok)throw Error('BLOCKED: '+message);}
function run(args){return execFileSync('./node_modules/.bin/wrangler',args,{
  encoding:'utf8',maxBuffer:64*1024*1024,
  env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'},
});}
function query(sql){
  const parsed=JSON.parse(run(['d1','execute',DB,'--remote','--config',CONFIG,'--command',sql,'--json']));
  guard(Array.isArray(parsed)&&Array.isArray(parsed[0]?.results),'Remote read-only D1 query failed');
  return parsed[0].results;
}
const fingerprint=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
async function cloudflare(route){
  const response=await fetch(root+route,{
    headers:{Authorization:'Bearer '+token,Accept:'application/json'},
    signal:AbortSignal.timeout(35000),
  });
  guard(response.ok,'Cloudflare metadata/recovery HTTP '+response.status);
  const data=await response.json();
  guard(data?.success===true,'Cloudflare did not confirm identity/recovery');
  return data.result;
}
const outletSql='SELECT id,ro_code,name,outlet_type,city,district,status,lifecycle_status,is_archived FROM retail_outlets ORDER BY id';
const agreementSql='SELECT id,outlet_id,agreement_type,agreement_number,customer_code,counterparty_name,start_date,end_date,agreement_document_id FROM coco_agreement_details ORDER BY id';
const draftsSql='SELECT id,created_by,content_sha256,source_row_count FROM dealer_master_draft_uploads ORDER BY id';
const nfrSql='SELECT id,outlet_id,agreement_number,monthly_rent_paise FROM nfr_leases ORDER BY id';
const docsSql='SELECT id,outlet_id,r2_key,size_bytes FROM documents ORDER BY id';
const sources=[outletSql,agreementSql,draftsSql,nfrSql,docsSql];
const sqlText=fs.readFileSync(SQL,'utf8');
const norm=sqlText.replace(/^\s*--.*$/gm,'').trim();
function tableExists(name){
  return query("SELECT name FROM sqlite_master WHERE type='table' AND name='"+name+"'").length===1;
}
function verify0037(){
  guard(tableExists('coco_agreement_lease_terms'),'Missing 0037 lease terms table');
  const cols=new Set(query('PRAGMA table_info(coco_agreement_lease_terms)').map(x=>x.name));
  guard(['agreement_id','dimension_unit','area_milli','length_milli_ft',
    'width_milli_ft','monthly_lease_value_paise'].every(x=>cols.has(x)),
    '0037 columns differ from reviewed schema');
  const triggers=new Set(query("SELECT name FROM sqlite_master WHERE type='trigger' AND "+
    "name IN ('trg_coco_lease_terms_insert','trg_coco_lease_terms_update')").map(x=>x.name));
  guard(triggers.size===2,'0037 type-validation triggers missing');
}
try{
  console.log('[1/7] Validate exact production target and approved ADDITIVE 0037 SQL.');
  guard(token.length>12&&accountId===ACCOUNT,'Cloudflare secrets or account mismatch');
  const cfg=JSON.parse(fs.readFileSync(CONFIG,'utf8'));
  const db=cfg.d1_databases?.[0];
  guard(cfg.name==='iocl-digital-pump-manager'&&cfg.vars?.ENVIRONMENT==='production'&&
    cfg.d1_databases?.length===1&&db?.binding==='DB'&&db?.database_id===UUID&&
    db?.database_name===DB,'Hosted D1 binding mismatch');
  guard((norm.match(/CREATE TABLE IF NOT EXISTS\b/gi)||[]).length===1&&
    (norm.match(/CREATE TRIGGER IF NOT EXISTS\b/gi)||[]).length===2&&
    /CREATE TABLE IF NOT EXISTS coco_agreement_lease_terms/i.test(norm)&&
    /CREATE TRIGGER IF NOT EXISTS trg_coco_lease_terms_insert/i.test(norm)&&
    /CREATE TRIGGER IF NOT EXISTS trg_coco_lease_terms_update/i.test(norm)&&
    !/^\s*(?:DROP|ALTER|INSERT|UPDATE|DELETE|REPLACE|ATTACH|DETACH|VACUUM)\b/im.test(norm),
    '0037 must contain ONLY the reviewed additive table + two validation triggers');
  const metadata=await cloudflare('');
  guard(metadata?.uuid===UUID&&metadata?.name===DB&&metadata?.version==='production',
    'Not the reviewed hosted D1 production database');
  const bookmark=await cloudflare('/time_travel/bookmark');
  guard(typeof bookmark?.bookmark==='string'&&bookmark.bookmark.length>=20,
    'D1 Time Travel recovery bookmark missing');
  console.log('Production D1 identity and Time Travel bookmark confirmed (bookmark withheld).');
  console.log('[2/7] Confirm 0036 operational agreement schema and capture read-only fingerprints.');
  guard(tableExists('coco_agreement_details')&&tableExists('dealer_master_draft_uploads'),
    '0036 or 0039 prerequisites missing');
  const already=tableExists('coco_agreement_lease_terms');
  if(already)verify0037();
  else{
    const existing=query("SELECT name FROM sqlite_master WHERE type='trigger' AND "+
      "name IN ('trg_coco_lease_terms_insert','trg_coco_lease_terms_update')");
    guard(existing.length===0,'Unexpected partial 0037 trigger state');
  }
  const before=sources.map(sql=>fingerprint(query(sql)));
  const foreignKeysBefore=fingerprint(query('PRAGMA foreign_key_check'));
  console.log('[3/7] Take private full remote D1 export. No database rows are published.');
  const exportFile=path.join(temp,'private-d1-backup.sql');
  run(['d1','export',DB,'--remote','--config',CONFIG,'--output',exportFile,'--skip-confirmation']);
  guard(fs.statSync(exportFile).size>1000,'Private D1 export missing or empty');
  const b=fs.readFileSync(exportFile,'utf8');
  guard(b.includes('coco_agreement_details')&&b.includes('dealer_master_draft_uploads')&&
    b.includes('retail_outlets'),'Backup does not contain required operational tables');
  console.log('Private backup verified; no SQL content exposed to GitHub artifacts/logs.');
  if(!already){
    console.log('[4/7] Apply only reviewed 0037 lease terms table and triggers.');
    run(['d1','execute',DB,'--remote','--config',CONFIG,'--file',SQL,'--yes']);
  }else console.log('[4/7] 0037 already present and verified; skipping migration.');
  verify0037();
  guard(fingerprint(query('PRAGMA foreign_key_check'))===foreignKeysBefore,
    'Foreign-key integrity changed during the release');
  console.log('[5/7] Verify original operational tables and immutable Excel drafts unchanged.');
  guard(sources.every((sql,i)=>fingerprint(query(sql))===before[i]),
    'Existing outlet, NFR, document, agreement or draft table changed; investigate before continuation');
  console.log('[6/7] Deploy matching Worker with optional evidence and source status metadata.');
  run(['deploy','--config',CONFIG]);
  console.log('[7/7] Verify release did not modify canonical data.');
  guard(sources.every((sql,i)=>fingerprint(query(sql))===before[i]),
    'Source data changed during deployment; investigate before further writes');
  console.log('SUCCESS: reviewed 0037 is active and Worker deployed. Existing source/lease/rent/document rows unchanged.');
  console.log('Actual agreement creation remains an explicit authenticated user action. Files are optional evidence.');
}catch(e){
  console.error('STOPPED: '+(e instanceof Error?e.message:'unknown release error'));
  process.exitCode=1;
}finally{
  fs.rmSync(temp,{recursive:true,force:true});
}
