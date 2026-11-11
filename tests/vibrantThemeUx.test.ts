import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('IndianOil vibrant theme and UX preservation', () => {
  const shell = fs.readFileSync('src/frontend/components/layout/DashboardShell.tsx','utf8');
  const css = fs.readFileSync('src/frontend/components/layout/vibrantTheme.css','utf8');
  const sidebar = fs.readFileSync('src/frontend/components/layout/Sidebar.tsx','utf8');
  const dashboard = fs.readFileSync('src/frontend/pages/DashboardPage.tsx','utf8');
  const header = fs.readFileSync('src/frontend/components/layout/Header.tsx','utf8');

  it('uses warm canvas, deep navy sidebar and vibrant active task states', () => {
    expect(shell).toContain('iocl-vibrant');
    expect(shell).toContain("import './vibrantTheme.css'");
    expect(sidebar).toContain('bg-gradient-to-b from-[#1646B1]');
    expect(sidebar).toContain('bg-[#FFF1E6] text-[#14285D]');
    expect(header).toContain('border-b-2 border-[#F47721]');
    expect(css).toContain('background: #f7f5f1');
  });

  it('preserves task-first launcher, permission filtering and sidebar search', () => {
    expect(dashboard).toContain('What would you like to do?');
    expect(dashboard).toContain('hasPermission(task.permission as PermissionCode)');
    expect(sidebar).toContain('searchedNav = filteredNav.filter');
    expect(sidebar).toContain('aria-label="Find a page"');
  });

  it('adds readable operational table and form contrast without changing data', () => {
    expect(css).toContain('thead th');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('Daily operations progress');
    expect(css).not.toContain('fetch(');
    expect(css).not.toContain('apiFetch');
  });
});
