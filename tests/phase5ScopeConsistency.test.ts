import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
const read=(path:string)=>fs.readFileSync(path,'utf8');
describe('Phase 5 scope and UI consistency',()=>{
  it('documentation derives the outlet from the global context, not a default COCO outlet',()=>{
    const page=read('src/frontend/pages/DocumentsPage.tsx');
    expect(page).toContain('activeOutletId, activeOutlet: selectedOutlet');
    expect(page).toContain('setActiveOutletId: setSelectedOutletId');
    expect(page).not.toContain('cocoDefault');
    expect(page).not.toContain("apiFetch<OutletOption[]>");
    expect(page).toContain('requestRef.current===request');
    expect(page).toContain("activeTab === 'DUE_DATES' && registerReady");
  });
  it('resets outlet-specific page trees and avoids choosing a historical shift by default',()=>{
    const app=read('src/App.tsx');
    for(const page of ['DocumentsPage','CngOperationsPage','LubeOperationsPage'])expect(app).toContain('<OutletScopedPage><'+page+' /></OutletScopedPage>');
    for(const page of ['CngOperationsPage','LubeOperationsPage']){
      const source=read('src/frontend/pages/'+page+'.tsx');
      expect(source).toContain('resolveWorkbenchShift(available,selectedOutletId,requested');
      expect(source).not.toContain('setSelectedShiftId(res.data[0].id)');
      expect(source).toContain('Select operational shift');
    }
  });
  it('does not assert operational health when the inventory or ticket register is empty',()=>{
    const uniform=read('src/frontend/components/hr/HrUniformOverview.tsx');
    const equipment=read('src/frontend/components/equipment/EquipmentTicketsPanel.tsx');
    expect(uniform).toContain('No uniform inventory configured');
    expect(uniform).not.toContain('Healthy Inventory Levels');
    expect(equipment).toContain('Equipment condition must be verified separately.');
    expect(equipment).not.toContain('All dispensers and equipment at this outlet are running');
  });
  it('keeps compact main-page styles and corrected light panels',()=>{
    const css=read('src/frontend/components/layout/premiumIndigoTheme.css');
    expect(css).toContain('max-width: 1500px');
    expect(css).toContain('padding: 18px 20px');
    expect(read('src/frontend/components/municipalTaxes/MunicipalTaxSummaryPanel.tsx')).not.toContain('from-slate-900');
    expect(read('src/frontend/components/hr/HrUniformOverview.tsx')).not.toContain('bg-slate-900/70');
    expect(read('src/frontend/components/org/OrgDepartmentsPanel.tsx')).not.toContain('bg-slate-950');
  });
});
