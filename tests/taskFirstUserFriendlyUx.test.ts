import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const file = (path: string) => fs.readFileSync(path, 'utf8');

describe('Task-first user-friendly workspace redesign', () => {
  const dashboard = file('src/frontend/pages/DashboardPage.tsx');
  const sidebar = file('src/frontend/components/layout/Sidebar.tsx');
  const daily = file('src/frontend/pages/DailyOperationsPage.tsx');
  const app = file('src/App.tsx');

  it('offers permission-gated task shortcuts connected to existing navigation', () => {
    expect(dashboard).toContain('What would you like to do');
    expect(dashboard).toContain('tasks.map(task =>');
    expect(dashboard).toContain('hasPermission(task.permission as PermissionCode)');
    expect(dashboard).toContain('onNavigate?.(task.id)');
    expect(app).toContain('<DashboardPage onNavigate={handleSetActiveTab} />');
    for (const route of ['daily-ops', 'stock-ops', 'financials', 'reports', 'outlets', 'pump-infra']) {
      expect(dashboard).toContain(`id: '${route}'`);
    }
    expect(dashboard).toContain('Access & security information');
    expect(dashboard).toContain('<details className="option4-panel group');
  });

  it('allows users to find an authorized page without scanning all menu groups', () => {
    expect(sidebar).toContain('aria-label="Find a page"');
    expect(sidebar).toContain('const searchedNav = filteredNav.filter');
    expect(sidebar).toContain('searchedNav.filter(item => group.ids.includes(item.id))');
    expect(sidebar).toContain("setNavSearch('')");
    expect(sidebar).toContain('aria-current={isActive ? \'page\' : undefined}');
  });

  it('provides direct access to daily tasks while preserving save and shift operations', () => {
    for (const section of ['daily-tank-readings', 'daily-nozzle-readings', 'daily-sales-summary']) {
      expect(daily).toContain(section);
    }
    expect(daily).toContain('aria-label="Jump to daily entry task"');
    expect(daily).toContain("setViewMode('DSR')");
    for (const handler of ['handleOpenShift', 'handleCloseShift', 'handleSaveAllTanks', 'handleSaveAllNozzles', 'handleComputeReconciliation']) {
      expect(daily).toContain(handler);
    }
    expect(daily).toContain('TankCalibrationService');
  });

  it('preserves dashboard data queries and sidebar permission restrictions', () => {
    for (const resource of ['/api/v1/outlets', '/api/v1/users', '/api/v1/scopes', '/api/v1/hierarchy/states', '/api/v1/audit-logs']) {
      expect(dashboard).toContain(resource);
    }
    expect(sidebar).toContain('item.perm === null || hasPermission(item.perm as PermissionCode)');
    expect(app).toContain("const requiredPerm = tabToPermMap[activeTab]");
  });
});
