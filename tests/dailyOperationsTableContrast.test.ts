import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('Daily Operations light table contrast', () => {
  const source = fs.readFileSync('src/frontend/pages/DailyOperationsPage.tsx', 'utf8');

  it('displays all product stock and reconciliation values in dark text', () => {
    expect(source).toContain('<tbody className="divide-y divide-slate-200 text-xs font-mono text-slate-900">\n                      {summary.byProduct.map');
  });

  it('displays full DSR product and nozzle numeric values in dark text', () => {
    expect(source).toContain('<tbody className="divide-y divide-slate-200 text-sm font-mono text-slate-900">\n                  {summary.byProduct.map');
    expect(source).toContain('<tbody className="divide-y divide-slate-200 text-xs font-mono text-slate-900">\n                  {summary.byDispenser.flatMap');
  });
});
