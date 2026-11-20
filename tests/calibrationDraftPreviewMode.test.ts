import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

/**
 * UAT-only access to interpolation of draft 10/15 KL reference curves:
 * no engineering verification bypass, no ACTIVE tank revisions or DB writes.
 */
const code=readFileSync(resolve('src/frontend/components/pump/GlobalCalibrationMasterSection.tsx'),'utf8');

describe('10 KL / 15 KL calibration read-only test shortcut',()=>{
  it('offers separate test buttons only for imported draft reference curves',()=>{
    expect(code).toContain("readonly-test-10kl-btn");
    expect(code).toContain("readonly-test-15kl-btn");
    expect(code).toContain("Test {code === 'EXCEL_10KL_REFERENCE' ? '10 KL' : '15 KL'} (No Approval)");
    expect(code).toContain("t.pointsCount >= 2");
  });
  it('routes to existing read-only interpolation, never status approval or tank assignment',()=>{
    const s=code.indexOf('const startDraftReferencePreview');
    const e=code.indexOf('useEffect(',s);
    expect(s).toBeGreaterThan(-1);
    const handler=code.slice(s,e);
    expect(handler).toContain('setSelectedTemplateId(template.id)');
    expect(handler).not.toContain('APPROVED');
    expect(handler).not.toContain('/assign');
    expect(handler).not.toContain('/status');
    expect(code).toContain('/interpolate');
  });
  it('visibly distinguishes draft testing from production tank activation',()=>{
    expect(code).toContain('READ-ONLY TEST: This draft calibration chart can be interpolated without approval.');
    expect(code).toContain('not certified for live tank stock, shift close or financial reconciliation.');
  });
});
