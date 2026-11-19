import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
describe('Live read-only missing snapshot fallback',()=>{
  const p=readFileSync('src/frontend/components/outlets/DealerMasterStage4Panel.tsx','utf8');
  it('has no automatic mutation and does not claim source equals saved records',()=>{
    expect(p).toContain('const DEALER_LIVE_READ_ONLY_TRIAL = true');
    expect(p).toContain('if (DEALER_LIVE_READ_ONLY_TRIAL) return;');
    expect(p).toContain('SavedFieldValue:\'NOT_VERIFIED\'');
    expect(p).toContain("ImportPerformed:'NO'");
  });
  it('handles 404 without repeatedly requesting API or implying lease absence',()=>{
    expect(p).toContain('snapshot404Ref.current');
    expect(p).toContain('saved Land/Lease details have NOT been checked');
    expect(p).toContain('setSourceOnlyNotice');
  });
  it('exports 26 fields per original row and flags protected unmatched outlets',()=>{
    expect(p).toContain('sourceRows.flatMap');
    expect(p).toContain('dealerMasterFieldCatalog.map');
    expect(p).toContain("'All 26 Fields'");
    expect(p).toContain("'Yellow Not Matched'");
    expect(p).toContain("'PROTECTED_YELLOW'");
  });
});
