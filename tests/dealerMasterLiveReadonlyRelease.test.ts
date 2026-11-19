import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
describe('Live website dealer master trial must never write existing records',()=>{
  const importer=readFileSync('src/frontend/components/outlets/DealerMasterExcelImporter.tsx','utf8');
  const panel=readFileSync('src/frontend/components/outlets/DealerMasterStage4Panel.tsx','utf8');
  const sourceRoutes=readFileSync('src/worker/routes/dealerMasterRoutes.ts','utf8');
  const batchRoutes=readFileSync('src/worker/routes/dealerMasterStage4Routes.ts','utf8');
  it('disables legacy outlet-only and full 26-field sync UI',()=>{
    expect(importer).toContain('const DEALER_LIVE_READ_ONLY_TRIAL = true');
    expect(panel).toContain('const DEALER_LIVE_READ_ONLY_TRIAL = true');
    expect(importer).toContain('if (DEALER_LIVE_READ_ONLY_TRIAL) return;');
    expect(panel).toContain('if (DEALER_LIVE_READ_ONLY_TRIAL) return;');
    expect(panel).toContain('RO-only validation. Land and lease storage not verified');
  });
  it('blocks all dealer extension mutation endpoints on production',()=>{
    expect((sourceRoutes.match(/if\(productionImportBlocked\(c\)\)/g)||[])).toHaveLength(5);
    expect(sourceRoutes).toContain("c.env.ENVIRONMENT==='production'");
    expect((batchRoutes.match(/if\(c.env.ENVIRONMENT==='production'\)/g)||[])).toHaveLength(2);
  });
  it('preserves existing ordinary outlet registration outside the bulk importer',()=>{
    const outletRoutes=readFileSync('src/worker/routes/outlets.ts','utf8');
    expect(outletRoutes).not.toContain('LIVE_READ_ONLY_TRIAL');
  });
});
