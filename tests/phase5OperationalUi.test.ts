import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const modules = [
  'StockOperationsPage',
  'CngOperationsPage',
  'LubeOperationsPage',
  'EquipmentOperationsPage',
  'UtilitiesOperationsPage',
  'WorkforceOperationsPage',
  'MunicipalTaxesPage',
  'NfrOperationsPage',
] as const;

const readPage = (module: string) =>
  fs.readFileSync(`src/frontend/pages/${module}.tsx`, 'utf8');

describe('Phase 5 — operational modules Modern Enterprise Light', () => {
  it('styles all eight remaining operational modules with the scoped stylesheet', () => {
    for (const module of modules) {
      const source = readPage(module);
      expect(source).toContain("import './operationsModern.css'");
      expect(source).toContain('operations-modern ');
      expect(source).toContain('apiFetch');
    }
    const css = fs.readFileSync('src/frontend/pages/operationsModern.css', 'utf8');
    expect(css).toContain('.operations-modern');
    expect(css).toContain('min-height: 40px');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('overflow-x: auto');
    expect(css).toContain('color-scheme: light');
  });

  it('preserves permission-aware module gates and outlet selection', () => {
    for (const module of modules.filter(m => m !== 'StockOperationsPage')) {
      const source = readPage(module);
      expect(source).toContain('hasPermission');
      expect(source).toContain('selectedOutletId');
    }
    expect(readPage('StockOperationsPage')).toContain('selectedOutletId');
  });

  it('keeps stock receipt and reconciliation operations wired to the same page', () => {
    const stock = readPage('StockOperationsPage');
    expect(stock).toContain('evaluateReceiptCompletionReadiness');
    expect(stock).toContain('FuelReceipt');
    expect(stock).toContain('ShiftStockSummary');
    expect(stock).toContain('apiFetch');
  });

  it('retains all downstream operation modules and their existing UI panels', () => {
    const expected = {
      CngOperationsPage: ['CngMfmPanel', 'CngPressurePanel', 'CngDailySummaryPanel'],
      LubeOperationsPage: ['LubeInventoryPanel', 'LubeSalesPanel', 'LubeDailySummaryPanel'],
      EquipmentOperationsPage: ['EquipmentTicketsPanel', 'EquipmentAssetsPanel', 'DgDailyLogPanel'],
      UtilitiesOperationsPage: ['UtilitySummaryPanel', 'ElectricityBillsPanel', 'SubMetersPanel'],
      WorkforceOperationsPage: ['HrStaffPanel', 'HrRosterPanel', 'HrAttendancePanel'],
      MunicipalTaxesPage: ['MunicipalTaxDuesPanel', 'MunicipalTaxPaymentModal'],
      NfrOperationsPage: ['NfrLeasesPanel', 'NfrRentDuesPanel', 'NfrRentPaymentModal'],
    } as const;
    for (const [module, panels] of Object.entries(expected)) {
      const source = readPage(module);
      for (const panel of panels) expect(source).toContain(panel);
    }
  });

  it('keeps existing workflow handlers and page API endpoint references', () => {
    const stock = readPage('StockOperationsPage');
    expect(stock).toContain('handleRecordDip');
    for (const module of modules) {
      const source = readPage(module);
      expect(source).toContain('/api/v1/');
    }
  });
});
