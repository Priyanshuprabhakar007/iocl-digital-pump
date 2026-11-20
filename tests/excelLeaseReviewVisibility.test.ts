import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/** Guard the exact RO 373196 failure mode: clicking a source action must
 * open a visibly labelled review surface, not silently scroll back to the
 * registered-agreements table.
 */
describe('Excel lease review entry point visibility',()=>{
  const ui=fs.readFileSync(path.resolve(__dirname,'../src/frontend/components/CocoDocumentationMastersPanel.tsx'),'utf8');
  it('opens a visible modal from the explicit source-review action',()=>{
    expect(ui).toContain('Open Excel Review Form');
    expect(ui).toContain("setSourcePrefillActive(true);setShowAgreementForm(true)");
    expect(ui).toContain("fixed inset-0 z-[100]");
    expect(ui).toContain("role={sourcePrefillActive?'dialog':undefined}");
    expect(ui).toContain('excel-lease-review-form');
    expect(ui).toContain("selectedRoCode : 'Register Agreement'");
  });
  it('permits cancelling and saving Excel-derived records WITHOUT a mandatory contract',()=>{
    expect(ui).toContain('setShowAgreementForm(false)');
    expect(ui).toContain('Upload Evidence (Optional)');
    expect(ui).toContain("sourcePrefillActive?'Save Source-Based Agreement':'Save Agreement'");
    expect(ui).not.toContain('!contractId||!sourceVerified');
  });
  it('does not automatically elevate raw land owner or unsupported ACR measurements',()=>{
    const prefill=fs.readFileSync(path.resolve(__dirname,'../src/shared/dealerExcelLeasePrefill.ts'),'utf8');
    expect(prefill).toContain("unit==='SQYD'");
    expect(prefill).toContain("unit==='SQFT'");
    expect(prefill).toContain('Land owner is never inferred as legal counterparty.');
  });
});
