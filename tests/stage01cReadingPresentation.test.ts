import { describe, expect, it } from 'vitest';
import {
  displayDsrProductMetric,
  displayDsrTotalMetric,
  displayNozzleMeterMetric,
  getTankSaveErrorGuidance,
  isDsrMetricRecorded,
} from '../src/frontend/utils/dailyReadingPresentation';
import type { DailyFuelSummary } from '../src/shared/types';

const product = (
  missingFields: string[] = [],
  status: 'COMPLETE' | 'PARTIAL' | 'NO_ENTRY' = 'COMPLETE',
) => ({ status, missingFields });

describe('Stage 01C: source-aware Daily Operations display (no calculation changes)', () => {
  it('shows a recorded zero as 0.000, never as a missing value', () => {
    expect(displayDsrProductMetric(product(), 'opening', 0)).toBe('0.000');
    expect(displayDsrProductMetric(product(), 'net', 0)).toBe('0.000');
    expect(displayDsrProductMetric(product(), 'physical', 0)).toBe('0.000');
  });

  it('does not mislabel absent opening stock as zero', () => {
    const p = product(['No opening tank reading'], 'PARTIAL');
    for (const metric of ['opening', 'available', 'theoretical', 'variance'] as const) {
      expect(displayDsrProductMetric(p, metric, 0)).toBe('Not recorded');
    }
    expect(displayDsrProductMetric(p, 'receipts', 1000)).toBe('1.000');
  });

  it('does not mislabel absent closing stock as zero', () => {
    const p = product(['No closing tank reading'], 'PARTIAL');
    expect(displayDsrProductMetric(p, 'physical', 0)).toBe('Not recorded');
    expect(displayDsrProductMetric(p, 'variance', 0)).toBe('Not recorded');
    expect(displayDsrProductMetric(p, 'opening', 1000)).toBe('1.000');
  });

  it('does not present partial meter sums as confirmed sales', () => {
    const p = product(['DU 1 / Nozzle 2 missing meter reading'], 'PARTIAL');
    for (const metric of ['gross', 'testing', 'net', 'theoretical', 'variance'] as const) {
      expect(isDsrMetricRecorded(p, metric)).toBe(false);
      expect(displayDsrProductMetric(p, metric, 0)).toBe('Not recorded');
    }
    expect(displayDsrProductMetric(p, 'physical', 1000000)).toBe('1000.000');
  });

  it('distinguishes NO_ENTRY from a completed zero-activity shift', () => {
    expect(displayDsrProductMetric(product([], 'NO_ENTRY'), 'receipts', 0)).toBe('Not recorded');
    expect(displayDsrProductMetric(product([], 'COMPLETE'), 'receipts', 0)).toBe('0.000');
  });

  it('hides day totals if any included product lacks required source data', () => {
    const p = [
      product([], 'COMPLETE'),
      product(['No closing tank reading'], 'PARTIAL'),
    ] as unknown as DailyFuelSummary['byProduct'];
    expect(displayDsrTotalMetric({ byProduct: p }, 'physical', 0)).toBe('Not recorded');
    expect(displayDsrTotalMetric({ byProduct: p }, 'opening', 0)).toBe('0.000');
    expect(displayDsrTotalMetric({ byProduct: [] }, 'net', 0)).toBe('Not recorded');
  });

  it('shows nozzle totals only when both saved totalizers exist, including actual saved zeros', () => {
    expect(displayNozzleMeterMetric(null, null, 0)).toBe('Not recorded');
    expect(displayNozzleMeterMetric(0, null, 0)).toBe('Not recorded');
    expect(displayNozzleMeterMetric(0, 0, 0)).toBe('0.000');
  });

  it('provides safe operator messages for calibration errors and uncertain batches', () => {
    expect(getTankSaveErrorGuidance({
      code: 'CALIBRATION_NOT_AVAILABLE',
      message: 'minimum points missing',
    })).toContain('existing chart');
    expect(getTankSaveErrorGuidance({
      code: 'DIP_OUT_OF_RANGE',
      message: 'Dip measurement 1500 mm out of range',
    })).toContain('1500 mm');
    expect(getTankSaveErrorGuidance({ code: 'BATCH_SAVE_UNVERIFIED' })).toContain('Refresh');
    expect(getTankSaveErrorGuidance({ code: 'CUSTOM_VALIDATION', message: 'Invalid dip' })).toBe('Invalid dip');
  });
});
