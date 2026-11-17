import type { DailyProductSummary, DailyFuelSummary } from '../../shared/types';
import { formatMilliunits } from '../../shared/precision';

/**
 * Presentation only. Do not reinterpret stock, receipt or sales calculations.
 * A saved, measured zero is 0.000; an unknown aggregate is "Not recorded".
 */
export type DsrMetric =
  | 'opening' | 'receipts' | 'available' | 'gross' | 'testing'
  | 'net' | 'theoretical' | 'physical' | 'variance';

export function isDsrMetricRecorded(
  product: Pick<DailyProductSummary, 'status' | 'missingFields'>,
  metric: DsrMetric
): boolean {
  if (product.status === 'NO_ENTRY') return false;
  const missing = product.missingFields || [];
  const openingMissing = missing.includes('No opening tank reading');
  const closingMissing = missing.includes('No closing tank reading');
  const meterMissing = missing.some(m => m.includes('missing meter reading'));

  switch (metric) {
    case 'opening': return !openingMissing;
    case 'available': return !openingMissing;
    case 'gross':
    case 'testing':
    case 'net': return !meterMissing;
    case 'theoretical': return !openingMissing && !meterMissing;
    case 'physical': return !closingMissing;
    case 'variance': return !openingMissing && !closingMissing && !meterMissing;
    case 'receipts': return true; // saved completed receipt aggregate; may be invoiced fallback
  }
}

export function displayDsrProductMetric(
  product: Pick<DailyProductSummary, 'status' | 'missingFields'>,
  metric: DsrMetric,
  milliunits: number
): string {
  return isDsrMetricRecorded(product, metric) ? formatMilliunits(milliunits) : 'Not recorded';
}

export function displayDsrTotalMetric(
  summary: Pick<DailyFuelSummary, 'byProduct'>,
  metric: DsrMetric,
  milliunits: number
): string {
  return summary.byProduct.length > 0 && summary.byProduct.every(product => isDsrMetricRecorded(product, metric))
    ? formatMilliunits(milliunits)
    : 'Not recorded';
}

export function displayNozzleMeterMetric(
  openingTotalizer: number | null,
  closingTotalizer: number | null,
  milliunits: number
): string {
  return openingTotalizer !== null && closingTotalizer !== null
    ? formatMilliunits(milliunits)
    : 'Not recorded';
}

export function getTankSaveErrorGuidance(error?: { code?: string; message?: string } | null): string {
  const original = error?.message?.trim();
  if (error?.code === 'CALIBRATION_NOT_AVAILABLE') {
    return 'Existing tank calibration is unavailable. Ask an authorized supervisor to verify the current chart before entering this dip.';
  }
  if (error?.code === 'DIP_OUT_OF_RANGE') {
    return `Dip is outside the existing approved calibration range. Check the measurement in mm. ${original || ''}`.trim();
  }
  if (error?.code === 'BATCH_SAVE_UNVERIFIED') {
    return 'Save status could not be confirmed. Refresh the shift and check existing readings before retrying.';
  }
  return original || 'Could not save tank readings. Refresh and try again.';
}
