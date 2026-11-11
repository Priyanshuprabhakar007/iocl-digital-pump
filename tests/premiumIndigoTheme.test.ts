import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('Premium Indigo × Coral theme refinement', () => {
  const shell = read('src/frontend/components/layout/DashboardShell.tsx');
  const css = read('src/frontend/components/layout/premiumIndigoTheme.css');

  it('loads the premium palette last so it overrides previous visual tokens', () => {
    const base = shell.indexOf("import './vibrantTheme.css'");
    const option4 = shell.indexOf("import './option4Saas.css'");
    const premium = shell.indexOf("import './premiumIndigoTheme.css'");
    expect(base).toBeGreaterThan(-1);
    expect(option4).toBeGreaterThan(base);
    expect(premium).toBeGreaterThan(option4);
  });

  it('provides strong sidebar/hero contrast and distinct task card tones', () => {
    expect(css).toContain('linear-gradient(167deg,#1b2755');
    expect(css).toContain('linear-gradient(113deg,#18285b');
    expect(css).toContain('.option4-hero h1');
    for (const tone of ['orange', 'blue', 'purple', 'green']) {
      expect(css).toContain(`.option4-action[data-tone="${tone}"]`);
      expect(css).toContain(`.option4-stat[data-tone="${tone}"]`);
    }
  });

  it('remains an appearance-only change and retains original task operations', () => {
    expect(css).not.toContain('apiFetch');
    expect(css).not.toContain('fetch(');
    const dashboard = read('src/frontend/pages/DashboardPage.tsx');
    const daily = read('src/frontend/pages/DailyOperationsPage.tsx');
    expect(dashboard).toContain('hasPermission(task.permission as PermissionCode)');
    expect(dashboard).toContain('onNavigate?.(task.id)');
    expect(daily).toContain('handleOpenShift');
    expect(daily).toContain('handleCloseShift');
  });
});
