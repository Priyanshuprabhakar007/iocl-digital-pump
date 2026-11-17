import { describe, expect, it } from 'vitest';
import { getShiftCloseErrorGuidance } from '../src/frontend/utils/shiftCloseFeedback';

describe('Stage 01D: safe operator feedback after a close attempt', () => {
  it('warns to refresh when the network outcome is unknown', () => {
    const message = getShiftCloseErrorGuidance({
      code: 'NETWORK_ERROR',
      message: 'Request timed out',
    });
    expect(message).toContain('Request timed out');
    expect(message).toContain('Refresh');
    expect(message).toContain('may be uncertain');
  });

  it('warns to refresh when a shift is already closing or closed', () => {
    const message = getShiftCloseErrorGuidance({
      code: 'SHIFT_CLOSED_OR_CLOSING',
      message: 'Shift is already closing, closed, or locked',
    });
    expect(message).toContain('Refresh');
    expect(message).toContain('CLOSED');
  });

  it('warns to verify an internal server error that may have occurred after finalization', () => {
    const message = getShiftCloseErrorGuidance({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
    expect(message).toContain('may be uncertain');
  });

  it('preserves concrete missing-data validation feedback without implying closure', () => {
    const message = getShiftCloseErrorGuidance({
      code: 'INCOMPLETE_TANK_STOCK_DATA',
      message: 'Missing closing tank reading',
    });
    expect(message).toBe('Missing closing tank reading');
    expect(message).not.toContain('may be uncertain');
  });

  it('preserves the required variance reason response', () => {
    expect(getShiftCloseErrorGuidance({
      code: 'VARIANCE_REASON_REQUIRED',
      message: 'Non-zero variance requires a reason',
    })).toBe('Non-zero variance requires a reason');
  });

  it('treats a missing or malformed error response as unverified', () => {
    expect(getShiftCloseErrorGuidance(null)).toContain('Refresh');
    expect(getShiftCloseErrorGuidance({ message: 'Unexpected response.' })).toContain('Refresh');
  });
});
