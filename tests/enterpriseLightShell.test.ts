import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('IndianOil enterprise theme — global shell invariants', () => {
  const sidebar = fs.readFileSync('src/frontend/components/layout/Sidebar.tsx', 'utf8');
  const header = fs.readFileSync('src/frontend/components/layout/Header.tsx', 'utf8');
  const shell = fs.readFileSync('src/frontend/components/layout/DashboardShell.tsx', 'utf8');
  const dashboard = fs.readFileSync('src/frontend/pages/DashboardPage.tsx', 'utf8');
  const app = fs.readFileSync('src/App.tsx', 'utf8');

  it('applies the branded warm shell without changing navigation mapping', () => {
    expect(shell).toContain('enterprise-shell');
    expect(shell).toContain('iocl-vibrant');
    expect(shell).toContain("import './vibrantTheme.css'");
    expect(header).toContain('bg-white/95');
    expect(sidebar).toContain('bg-gradient-to-b from-[#1646B1]');
    expect(app).toContain("'/daily-operations': 'daily-ops'");
    expect(app).toContain("'/shifts': 'daily-ops'");
  });

  it('preserves permission-filtered navigation with grouped, independently scrollable items', () => {
    expect(sidebar).toContain('filteredNav = navItems.filter');
    expect(sidebar).toContain('hasPermission(item.perm as PermissionCode)');
    expect(sidebar).toContain('navigationGroups.map');
    expect(sidebar).toContain('overflow-y-scroll');
    expect(sidebar).toContain("id: 'daily-ops'");
    expect(sidebar).toContain("perm: PERMISSIONS.REPORTS_READ");
  });

  it('keeps dashboard API endpoints and data bindings unchanged', () => {
    for (const endpoint of ['/api/v1/outlets', '/api/v1/users', '/api/v1/scopes', '/api/v1/hierarchy/states', '/api/v1/audit-logs']) {
      expect(dashboard).toContain(endpoint);
    }
    expect(dashboard).toContain('stats.outletsCount');
    expect(dashboard).toContain('stats.usersCount');
    expect(dashboard).toContain('stats.auditLogsCount');
  });
});
