import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('Phase 3 enterprise-light Financial Operations and Monthly Reports', () => {
  const financial = fs.readFileSync('src/frontend/pages/FinancialOperationsPage.tsx', 'utf8');
  const reports = fs.readFileSync('src/frontend/pages/ReportsPage.tsx', 'utf8');
  const styles = fs.readFileSync('src/frontend/pages/financialReportsModern.css', 'utf8');

  it('scopes the new light theme without mutating workflow or form input behavior', () => {
    expect(financial).toContain("import './financialReportsModern.css'");
    expect(reports).toContain("import './financialReportsModern.css'");
    expect(financial).toContain('className="finance-modern space-y-6 pb-10"');
    expect(reports).toContain('className="reports-modern mx-auto max-w-7xl space-y-6 pb-10"');
    expect(styles).toContain('.finance-modern .phase3-data-table');
    expect(styles).toContain('.reports-modern .phase3-surface');
    expect(styles).toContain('color-scheme: light');
  });

  it('preserves all financial operations and role-gated tabs', () => {
    for (const action of [
      'handleCreateCollection', 'handleCreateHandover', 'handleCreateDeposit',
      'handleVerifyDeposit', 'handleUpdatePrice', 'refreshData',
      'setActiveTab', 'setSelectedShiftId', 'setSelectedOutletId',
      'hasPermission(PERMISSIONS.CREDIT_PARTIES_READ)',
      'hasPermission(PERMISSIONS.PRODUCT_PRICES_READ)',
      'hasPermission(PERMISSIONS.BANK_DEPOSITS_VERIFY)',
      '/financial-summary',
    ]) expect(financial).toContain(action);
  });

  it('uses existing financial API fields for the KPI strip', () => {
    expect(financial).toContain('aria-label="Financial shift overview"');
    for (const field of [
      'summary.salesRevenue.authoritativeTotalStr', 'summary.collections.totalStr',
      'summary.varianceStr', 'summary.cashDepositControl.pendingCashDepositStr',
    ]) expect(financial).toContain(field);
  });

  it('preserves monthly report filters, data fetches, PDF preview and download', () => {
    for (const required of [
      'canGeneratePdf', 'PERMISSIONS.REPORTS_GENERATE',
      'selectedOutletId', 'selectedMonth', 'cutoffMode', 'cutoffDate',
      'buildPdfUrl', 'fetchReport', 'handlePreviewPdf', 'handleDownloadPdf',
      'apiFetchBlob', 'MONTH_END', 'SELECTED_DATE', 'LATEST_DATA',
      'report.dgSummary', 'report.fuelSummary',
      'report.breakdownSummary', 'report.hrSummary'
    ]) expect(reports).toContain(required);
    expect(reports).toContain('aria-label="Report selection summary"');
  });

  it('provides keyboard-focusable horizontal financial tables', () => {
    expect((financial.match(/className="phase3-data-table/g) || []).length).toBe(2);
    expect((financial.match(/aria-label="Scrollable financial table"/g) || []).length).toBe(2);
    expect(styles).toContain('scrollbar-width: thin');
  });
});
