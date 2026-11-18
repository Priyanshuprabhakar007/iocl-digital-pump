import type { DailyFuelSummary, DailyProductSummary } from '../../shared/types';
import { displayDsrProductMetric, isDsrMetricRecorded } from './dailyReadingPresentation';

export type DsrPeriod = 'DAY' | 'WEEK' | 'MONTH' | 'CUSTOM';
export const MAX_DSR_DAYS = 92;
const DAY_MS = 86400000;

function parseDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Select a valid business date.');
  const date = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== value) throw new Error('Select a valid business date.');
  return date;
}
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function dsrDates(mode: DsrPeriod, anchor: string, month: string, customFrom: string, customTo: string, today: string): string[] {
  const max = parseDate(today);
  let from: number;
  let to: number;
  if (mode === 'MONTH') {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Select a valid month.');
    from = parseDate(month + '-01');
    const end = new Date(from);
    end.setUTCMonth(end.getUTCMonth() + 1);
    to = Math.min(end.getTime() - DAY_MS, max);
  } else if (mode === 'CUSTOM') {
    from = parseDate(customFrom);
    to = parseDate(customTo);
  } else {
    from = parseDate(anchor);
    if (mode === 'WEEK') {
      const weekday = new Date(from).getUTCDay();
      from -= ((weekday + 6) % 7) * DAY_MS;
      to = Math.min(from + 6 * DAY_MS, max);
    } else {
      to = from;
    }
    if (parseDate(anchor) > max) throw new Error('Business date cannot be in the future.');
  }
  if (from > max || to > max) throw new Error('Business date cannot be in the future.');
  if (to < from) throw new Error('End date must be on or after start date.');
  const count = (to - from) / DAY_MS + 1;
  if (count > MAX_DSR_DAYS) throw new Error('Select up to 92 days per report.');
  return Array.from({ length: count }, (_, i) => iso(from + i * DAY_MS));
}

export const dsrProductColumns = ['Opening','Receipts','Available','Gross','Testing','Net sales','Book close','Physical','Variance'];
export function dsrProductValues(p: DailyProductSummary): string[] {
  return [
    displayDsrProductMetric(p,'opening',p.openingStockMilliunits),
    displayDsrProductMetric(p,'receipts',p.receiptsMilliunits),
    displayDsrProductMetric(p,'available',p.availableStockMilliunits),
    displayDsrProductMetric(p,'gross',p.grossSalesMilliunits),
    displayDsrProductMetric(p,'testing',p.testingMilliunits),
    displayDsrProductMetric(p,'net',p.netSalesMilliunits),
    displayDsrProductMetric(p,'theoretical',p.theoreticalClosingMilliunits),
    displayDsrProductMetric(p,'physical',p.physicalClosingMilliunits),
    displayDsrProductMetric(p,'variance',p.varianceMilliunits),
  ];
}

export interface DsrPeriodProduct {
  productId: string; productCode: string; productName: string; unit: string;
  recordedDays: number; completeDays: number; totalDays: number;
  recordedNetMilliunits: number | null; fullyRecorded: boolean;
}

// Never add daily opening/closing balances, never mix units or assume missing days are zero.
export function dsrPeriodProducts(days: DailyFuelSummary[]): DsrPeriodProduct[] {
  const products = new Map<string, DsrPeriodProduct>();
  for (const day of days) {
    for (const p of day.byProduct) {
      const key = p.productId + ':' + p.unit;
      let row = products.get(key);
      if (!row) {
        row = { productId: p.productId, productCode: p.productCode, productName: p.productName, unit: p.unit,
          recordedDays: 0, completeDays: 0, totalDays: days.length, recordedNetMilliunits: null, fullyRecorded: false };
        products.set(key, row);
      }
      if (isDsrMetricRecorded(p,'net')) {
        row.recordedDays++;
        row.recordedNetMilliunits = (row.recordedNetMilliunits ?? 0) + p.netSalesMilliunits;
      }
      if (p.status === 'COMPLETE' && day.dayEntryStatus === 'COMPLETE') row.completeDays++;
    }
  }
  for (const row of products.values()) row.fullyRecorded = row.recordedDays === row.totalDays && row.completeDays === row.totalDays;
  return [...products.values()].sort((a,b) => a.productCode.localeCompare(b.productCode));
}
