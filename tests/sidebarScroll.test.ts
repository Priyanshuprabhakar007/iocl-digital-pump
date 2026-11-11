import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('Sidebar navigation scrolling', () => {
  const source = fs.readFileSync('src/frontend/components/layout/Sidebar.tsx', 'utf8');

  it('keeps the navigation independently scrollable with a visible scrollbar', () => {
    expect(source).toContain('aria-label="Main navigation"');
    expect(source).toContain('min-h-0 flex-1 space-y-1 overflow-y-scroll');
    expect(source).toContain('[scrollbar-width:thin]');
  });

  it('keeps the branding and user context outside the scrolling menu', () => {
    const nav = source.indexOf('<nav aria-label="Main navigation"');
    expect(source.indexOf('Active User Context')).toBeLessThan(nav);
    expect(source.indexOf('Sidebar Brand Header')).toBeLessThan(nav);
    expect(source.indexOf('Footer Info')).toBeGreaterThan(nav);
    expect(source).toContain('flex-col overflow-hidden border-r border-[#E2E8F0] bg-white');
  });

  it('works in both desktop and mobile layouts', () => {
    expect(source).toContain('h-[calc(100vh-64px)] shrink-0 overflow-hidden lg:block');
    expect(source).toContain('h-full min-h-0 w-64 overflow-hidden');
    expect(source).toContain('{content}');
  });
});
