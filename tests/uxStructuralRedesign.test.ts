import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (page: string) => fs.readFileSync(`src/frontend/pages/${page}.tsx`, 'utf8');

describe('Structural UX redesign from production screenshot review', () => {
  it('provides deliberate dashboard sections without stretching sparse panels', () => {
    const source = read('DashboardPage');
    expect(source).toContain('At a glance');
    expect(source).toContain('Access & governance');
    expect(source).toContain('gap-5 items-start');
    expect(source).toContain("apiFetch<any[]>('/api/v1/outlets')");
  });
  it('shows one operational progress area rather than redundant completion grids', () => {
    const source = read('DailyOperationsPage');
    expect(source).toContain('aria-label="Daily operations progress"');
    expect(source).not.toContain('{/* Completion Summary Grid */}');
    expect(source).toContain('Choose a shift below');
    expect(source).toContain('onClick={handleOpenShift}');
    expect(source).toContain('onClick={handleCloseShift}');
  });
  it('adds a distinct stock navigation card experience while preserving tab values', () => {
    const source = read('StockOperationsPage');
    expect(source).toContain('aria-label="Stock operations sections"');
    for (const id of ['OPENING', 'RECEIPTS', 'CLOSING', 'RECONCILIATION']) {
      expect(source).toContain(`id: '${id}'`);
    }
    expect(source).toContain('setActiveTab(tab.id as any)');
    expect(source).toContain('handleRecordDip');
  });
  it('supports real Cards/List outlet layout choices without changing record actions', () => {
    const source = read('OutletsPage');
    expect(source).toContain("useState<'GRID' | 'LIST'>('GRID')");
    expect(source).toContain('aria-label="Directory layout"');
    expect(source).toContain('outlets-directory-list');
    expect(source).toContain('displayedOutlets.map((ro)');
    expect(source).toContain('onClick={openCreateModal}');
    expect(source).toContain('canManageArchive');
    const css = fs.readFileSync('src/frontend/pages/adminModern.css', 'utf8');
    expect(css).toContain('.outlets-directory-list .outlet-directory-card');
  });
});
