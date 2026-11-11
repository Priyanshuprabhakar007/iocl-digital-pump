import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const get = (path: string) => fs.readFileSync(path, 'utf8');
const dashboard = get('src/frontend/pages/DashboardPage.tsx');
const daily = get('src/frontend/pages/DailyOperationsPage.tsx');
const stock = get('src/frontend/pages/StockOperationsPage.tsx');
const outlets = get('src/frontend/pages/OutletsPage.tsx');
const css = get('src/frontend/components/layout/option4Saas.css');
const shell = get('src/frontend/components/layout/DashboardShell.tsx');

describe('Option 4 — Vibrant Modern SaaS actual UI implementation', () => {
  it('applies the chosen cobalt and coral visual system to the real app', () => {
    expect(shell).toContain("import './option4Saas.css'");
    expect(css).toContain('#2354c6');
    expect(css).toContain('#ff7139');
    expect(css).toContain('.option4-hero');
    expect(css).toContain('.option4-action');
    expect(get('public/option4-fuel-station.svg')).toContain('<svg');
  });

  it('renders a modern task launcher, real KPI counts, and separately accessible work areas', () => {
    expect(dashboard).toContain('What would you like to do');
    expect(dashboard).toContain('aria-label="Quick actions"');
    expect(dashboard).toContain('aria-label="Work areas"');
    expect(dashboard).toContain('data-tone={metric.tone}');
    for (const field of ['stats.outletsCount','stats.usersCount','stats.auditLogsCount']) {
      expect(dashboard).toContain(field);
    }
    expect(dashboard).toContain('hasPermission(task.permission as PermissionCode)');
    expect(dashboard).toContain('onNavigate?.(task.id)');
  });

  it('preserves the shift entry controls and displays existing progress data only', () => {
    expect(daily).toContain('option4-hero');
    expect(daily).toContain('option4-progress');
    expect(daily).toContain('option4-step');
    expect(daily).toContain('summary.completion.reconciliationComplete');
    for (const operation of ['handleOpenShift', 'handleCloseShift', 'handleSaveAllTanks', 'handleSaveAllNozzles']) {
      expect(daily).toContain(operation);
    }
  });

  it('keeps stock tab handlers and existing receipts while surfacing actual counts', () => {
    expect(stock).toContain('aria-label="Stock operations sections"');
    expect(stock).toContain('setActiveTab(tab.id as any)');
    expect(stock).toContain('tankSnapshots.length');
    expect(stock).toContain('tankReadings.length');
    expect(stock).toContain('shiftReceiptSummary.pendingReceipts.length');
    expect(stock).toContain('handleComputeReconciliation');
  });

  it('retains outlet directory permission gates, card/list selection, and edit actions', () => {
    expect(outlets).toContain('option4-outlet-icon');
    expect(outlets).toContain("useState<'GRID' | 'LIST'>('GRID')");
    expect(outlets).toContain('displayedOutlets.map((ro)');
    expect(outlets).toContain('onClick={openCreateModal}');
    expect(outlets).toContain('hasPermission(PERMISSIONS.OUTLETS_CREATE)');
  });
});
