/**
 * Financial preview completeness does NOT replace the separate shift-close
 * validation of nozzle meter and unavailability evidence.
 * A recorded zero is complete; a missing or null net value is not.
 */
export function assessFuelRevenueReadingCoverage(
  nozzleSnapshots: ReadonlyArray<{ nozzleId: string; productCategory: string }>,
  readings: ReadonlyArray<{ nozzleId: string; netSalesQuantityMilliunits?: number | null }>,
  unavailabilityRecords: ReadonlyArray<{ nozzleId: string }>,
): {
  status: 'COMPLETE' | 'INCOMPLETE';
  expectedNozzles: number;
  recordedNozzles: number;
  unavailableNozzles: number;
  missingNozzleIds: string[];
} {
  const readingMap = new Map(readings.map(reading => [reading.nozzleId, reading]));
  const unavailable = new Set(unavailabilityRecords.map(record => record.nozzleId));
  const included = nozzleSnapshots.filter(nozzle => nozzle.productCategory !== 'CNG');
  const missingNozzleIds: string[] = [];
  let recordedNozzles = 0;
  let unavailableNozzles = 0;

  for (const nozzle of included) {
    const reading = readingMap.get(nozzle.nozzleId);
    if (reading && typeof reading.netSalesQuantityMilliunits === 'number' && Number.isSafeInteger(reading.netSalesQuantityMilliunits) && reading.netSalesQuantityMilliunits >= 0) {
      recordedNozzles++;
    } else if (unavailable.has(nozzle.nozzleId) && !reading) {
      unavailableNozzles++;
    } else {
      missingNozzleIds.push(nozzle.nozzleId);
    }
  }
  return {
    status: missingNozzleIds.length ? 'INCOMPLETE' : 'COMPLETE',
    expectedNozzles: included.length,
    recordedNozzles,
    unavailableNozzles,
    missingNozzleIds,
  };
}
