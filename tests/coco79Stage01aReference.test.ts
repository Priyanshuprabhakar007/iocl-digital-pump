import { describe, expect, it } from 'vitest';
import { TankCalibrationService } from '../src/worker/services/tankCalibrationService';
import { FuelDailyOperationsService, type ProductDailyComputationInput } from '../src/worker/services/fuelDailyOperationsService';

// Synthetic calibration points and operational records only.
// These are NOT transcriptions of COCO 79's scanned charts and are never saved.
const points = [
  { dipMillimetresMilliunits: 0, volumeMilliunits: 0 },
  { dipMillimetresMilliunits: 1_000_000, volumeMilliunits: 5_000_000 },
  { dipMillimetresMilliunits: 2_000_000, volumeMilliunits: 10_000_000 },
];

const partialDayInput = (): ProductDailyComputationInput => ({
  businessDate: '2026-11-09',
  productId: 'test-ms',
  productCode: 'MS',
  productName: 'Motor Spirit',
  unit: 'LITRE',
  dayShifts: [
    { id: 'reference-shift', businessDate: '2026-11-09', startedAt: '2026-11-09T06:00:00Z', status: 'OPEN' },
  ],
  productPrices: [
    { operationalShiftId: 'reference-shift', productId: 'test-ms', pricePaisePerUnit: 10_000 },
  ],
  nozzleSnapshots: [
    {
      operationalShiftId: 'reference-shift',
      nozzleId: 'reference-nozzle',
      dispenserId: 'reference-dispenser',
      dispenserNumber: 1,
      dispenserName: 'Test DU',
      nozzleNumber: 1,
      productId: 'test-ms',
      productCode: 'MS',
      productName: 'Motor Spirit',
      tankId: 'reference-tank',
      tankNumber: 1,
    },
  ],
  nozzleReadings: [],
  tankSnapshots: [
    {
      operationalShiftId: 'reference-shift',
      tankId: 'reference-tank',
      tankNumber: 1,
      tankName: 'Test tank',
      productId: 'test-ms',
      productCode: 'MS',
      productName: 'Motor Spirit',
    },
  ],
  tankReadingsList: [],
  stockReconciliations: [],
  completedReceiptLines: [],
  allowLiveTankFallback: true,
});

describe('COCO 79 Stage 01A — reference-only daily operations checks', () => {
  it('converts a synthetic dip exactly without applying a scanned chart to live tanks', () => {
    const result = TankCalibrationService.convertDipFromPoints(points, 1_000_000, {
      chartId: 'synthetic-chart',
      revisionNumber: 2,
    });
    expect(result.calculatedVolumeMilliunits).toBe(5_000_000);
    expect(result.volumeLitreStr).toBe('5000.000');
    expect(result.interpolated).toBe(false);
    expect(result.calibrationChartId).toBe('synthetic-chart');
    expect(result.calibrationRevision).toBe(2);
  });

  it('interpolates with integer milliunits and rounds half-up at the final milliunit', () => {
    const interpolated = TankCalibrationService.convertDipFromPoints(points, 750_000);
    expect(interpolated.calculatedVolumeMilliunits).toBe(3_750_000);
    expect(interpolated.volumeLitreStr).toBe('3750.000');
    expect(interpolated.interpolated).toBe(true);

    const fractional = TankCalibrationService.convertDipFromPoints(
      [
        { dipMillimetresMilliunits: 0, volumeMilliunits: 0 },
        { dipMillimetresMilliunits: 2_000, volumeMilliunits: 1_001 },
      ],
      1_000,
    );
    expect(fractional.calculatedVolumeMilliunits).toBe(501);
    expect(fractional.volumeLitreStr).toBe('0.501');
  });

  it('reports missing and out-of-range calibration rather than manufacturing a stock value', () => {
    expect(() => TankCalibrationService.convertDipFromPoints([], 500_000))
      .toThrow('minimum 2 calibration points');
    expect(() => TankCalibrationService.convertDipFromPoints(points, -1))
      .toThrow('cannot be negative');
    expect(() => TankCalibrationService.convertDipFromPoints(points, 2_001_000))
      .toThrow('out of range');
  });

  it('marks a day PARTIAL if readings are missing; zero aggregate figures alone do not mean no sales', () => {
    const summary = FuelDailyOperationsService.computeProductDailySummary(partialDayInput());
    expect(summary.status).toBe('PARTIAL');
    expect(summary.missingFields).toContain('No opening tank reading');
    expect(summary.missingFields).toContain('No closing tank reading');
    expect(summary.missingFields.some(message => message.includes('Nozzle 1 missing meter reading'))).toBe(true);
    expect(summary.shiftsCount).toBe(1);
    expect(summary.openingStockMilliunits).toBe(0);
    expect(summary.netSalesMilliunits).toBe(0);
    // Consumers must check status/missingFields before describing the zeros as confirmed values.
  });

  it('does not invent a measured receipt when no completed receipt lines exist', () => {
    const summary = FuelDailyOperationsService.computeProductDailySummary(partialDayInput());
    expect(summary.receiptsMilliunits).toBe(0);
    expect(summary.status).toBe('PARTIAL');
    // COCO 79's invoice quantities are reference data, not inputs to this synthetic test.
  });
});
