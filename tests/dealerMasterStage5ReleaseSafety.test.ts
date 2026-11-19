import {describe,expect,it} from 'vitest';
import fs from 'node:fs';

describe('Stage 5 Cloudflare D1 isolation and Vercel Free budget',()=>{
  const local=fs.readFileSync('scripts/dealer-master-stage5/rehearse-local.sh','utf8');
  const workflow=fs.readFileSync('.github/workflows/dealer-master-stage5-local-d1.yml','utf8');
  const live=fs.readFileSync('wrangler.jsonc','utf8');
  const baseline=fs.readdirSync('migrations').filter(x=>/^\d{4}_.*\.sql$/.test(x)).sort();
  it('uses exactly 35 frozen baseline migration files, without modifying them',()=>{
    expect(baseline).toHaveLength(35);
    expect(baseline[0]).toMatch(/^0001_/);
    expect(baseline.at(-1)).toMatch(/^0035_/);
  });
  it('does not reference live D1 database UUID or production DB name',()=>{
    const liveConfig=JSON.parse(live);
    const prodName=liveConfig.d1_databases[0].database_name;
    const prodId=liveConfig.d1_databases[0].database_id;
    expect(local).not.toContain(prodName);
    expect(local).not.toContain(prodId);
    expect(local).toContain('00000000-0000-4000-8000-000000000038');
    expect(local).toContain('unset CLOUDFLARE_API_TOKEN');
  });
  it('all Wrangler D1 actions are local and pinned to unique config/state',()=>{
    const lines=local.split('\n').filter(l=>/^bunx wrangler d1 /.test(l));
    expect(lines).toHaveLength(7);
    for(const line of lines){
      expect(line).toContain('--config "$CFG"');
      expect(line).toContain('--local');
      expect(line).toContain('--persist-to "$STATE"');
      expect(line).not.toContain('--remote');
    }
  });
  it('Stage 5 workflow cannot deploy Worker, touch R2 or trigger Vercel previews',()=>{
    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('rehearse-local.sh');
    expect(workflow).not.toContain('wrangler deploy');
    expect(workflow).not.toContain('vercel deploy');
    expect(workflow).not.toContain('--remote');
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(local).not.toContain('wrangler deploy');
    // D1 sandbox denies PRAGMA integrity_check (SQLITE_AUTH); use supported checks.
    expect(local).not.toContain('PRAGMA integrity_check');
    expect(local).toContain('SELECT COUNT(*) AS applied FROM d1_migrations;');
  });
  it('documentation and scripts never invoke a hosted database implicitly',()=>{
    expect(local).toContain('rm -rf "$DEST"');
    expect(local).toContain('ENVIRONMENT": "local-test"');
    expect(local).not.toContain('staging.jsonc');
    expect(local).not.toContain('wrangler.jsonc"');
  });
});
