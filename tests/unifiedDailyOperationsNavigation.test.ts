import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('Unified Daily Operations navigation', () => {
  const sidebar = fs.readFileSync('src/frontend/components/layout/Sidebar.tsx', 'utf8');
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  const daily = fs.readFileSync('src/frontend/pages/DailyOperationsPage.tsx', 'utf8');

  it('uses one daily operations navigation item and retains old bookmarks', () => {
    expect(sidebar).toContain("id: 'daily-ops'");
    expect(sidebar).not.toContain("id: 'shift-ops'");
    expect(app).toContain("'/shifts': 'daily-ops'");
    expect(app).toContain("'/daily-operations': 'daily-ops'");
    expect(app).not.toContain("<ShiftOperationsPage />");
  });

  it('keeps the normal shift lifecycle and DSR on the unified page', () => {
    expect(daily).toContain('handleOpenShift');
    expect(daily).toContain('handleCloseShift');
    expect(daily).toContain('handleComputeReconciliation');
    expect(daily).toContain('DSR Summary');
  });

  it('preserves nozzle unavailability and optional shift notes', () => {
    expect(daily).toContain('handleRecordUnavailability');
    expect(daily).toContain("hasPermission(PERMISSIONS.METER_READINGS_WRITE)");
    expect(daily).toContain('Mark Unavailable');
    expect(daily).toContain('notes: newShiftNotes.trim() || null');
  });

  it('keeps exceptional empty shift closing global-admin only', () => {
    expect(daily).toContain("userCtx?.roles?.includes('ADMIN') && userCtx?.isGlobalScope");
    expect(daily).toContain('isGlobalAdmin && activeWorkspace.shift.status');
    expect(daily).toContain('/close-empty');
    expect(daily).toContain('adminEmptyCloseConfirmed');
  });

  it('does not change backend contracts or database schema', () => {
    expect(app).toContain('<DailyOperationsPage />');
    expect(daily).toContain('/nozzle-unavailability');
    expect(daily).toContain('/shifts/open');
  });
});
