import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
const read=(path:string)=>fs.readFileSync(path,'utf8');
describe('Phase 5C responsive shell and safe loading states',()=>{
  it('keeps exactly one outlet selector and uses native dialog navigation with focus restoration',()=>{
    const header=read('src/frontend/components/layout/Header.tsx');
    const sidebar=read('src/frontend/components/layout/Sidebar.tsx');
    const shell=read('src/frontend/components/layout/DashboardShell.tsx');
    expect(header.match(/<GlobalOutletSelector\b/g)).toHaveLength(1);
    expect(header).toContain('aria-expanded={mobileOpen}');
    expect(sidebar).toContain('dialog.showModal()');
    expect(sidebar).toContain('onCancel={event=>{event.preventDefault();onCloseMobile();}}');
    expect(shell).toContain("toggle.focus()");
    expect(shell).toContain('id="main-workspace"');
  });
  it('contains scrollable forms and explicit small-screen layout rather than resizing data values',()=>{
    const css=read('src/frontend/components/layout/premiumIndigoTheme.css');
    expect(css).toContain('grid-template-columns:minmax(0,1fr) auto');
    expect(css).toContain('max-height:calc(100dvh - 2rem)');
    expect(css).toContain('overscroll-behavior-x:contain');
    for(const p of ['DailyOperationsPage','StockOperationsPage','FinancialOperationsPage','PumpInfrastructurePage','DocumentsPage']){
      expect(read('src/frontend/pages/'+p+'.tsx')).toContain('iocl-scroll-panel');
    }
  });
  it('keeps loading markup outside the CNG outlet select and requires verified shift data before entry',()=>{
    const cng=read('src/frontend/pages/CngOperationsPage.tsx');
    const start=cng.indexOf('aria-label="CNG retail outlet"');
    const end=cng.indexOf('</select>',start);
    expect(start).toBeGreaterThan(0);
    expect(cng.slice(start,end)).not.toContain('<div');
    expect(cng).toContain('Loading saved CNG records…');
    expect(cng).toContain('shiftListRevision');
    expect(cng).toContain('shiftRes.data.outletId===selectedOutletId');
    const lube=read('src/frontend/pages/LubeOperationsPage.tsx');
    expect(lube).toContain('Shift records could not be fully verified. Refresh before recording sales.');
    expect(lube).toContain('setShiftRecordsReady(false)');
    expect(lube).toContain('shiftResult.value.data.outletId===reqOutletId');
  });
});
