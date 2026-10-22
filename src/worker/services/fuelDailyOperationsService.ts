import { eq, and, inArray, asc } from 'drizzle-orm';
import { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../../db/schema';
import {
  operationalShifts,
  operationalShiftNozzles,
  operationalShiftTanks,
  operationalShiftProductPrices,
  nozzleMeterReadings,
  nozzleUnavailabilityRecords,
  tankStockReadings,
  tankCalibrationPoints,
  fuelReceipts,
  fuelReceiptTankLines,
  shiftStockReconciliations,
  retailOutlets,
} from '../../db/schema';
import {
  DailyFuelSummary,
  DailyOperationsBootstrapResponse,
  DailyOperationsStatus,
  DailyDispenserSummary,
  DailyProductSummary,
  DailyShiftSummaryItem,
  DailyTankReadingDetail,
  DailyNozzleReadingDetail,
  DayEntryStatus,
  DailyOperationsTankEntryRow,
  DailyOperationsNozzleEntryRow,
  DailyOperationsShiftWorkspace,
} from '../../shared/types';
import { formatMilliunits } from '../../shared/precision';
import { PumpRepository } from '../repositories/pumpRepository';

export interface ProductDailyComputationInput {
  businessDate: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  dayShifts: Array<{
    id: string;
    businessDate: string;
    startedAt: string;
    status: string;
    shiftNumber?: number | null;
  }>;
  productPrices: Array<{
    operationalShiftId: string;
    productId: string;
    pricePaisePerUnit: number;
  }>;
  nozzleSnapshots: Array<{
    operationalShiftId: string;
    nozzleId: string;
    dispenserId: string;
    dispenserNumber: number;
    dispenserName: string;
    nozzleNumber: number;
    productId: string;
    productCode: string;
    productName: string;
    tankId: string;
    tankNumber: number;
  }>;
  nozzleReadings: Array<{
    operationalShiftId: string;
    nozzleId: string;
    openingTotalizerMilliunits: number;
    closingTotalizerMilliunits: number;
    testingQuantityMilliunits: number;
    grossSalesQuantityMilliunits: number;
    netSalesQuantityMilliunits: number;
  }>;
  nozzleUnavailabilities?: Array<{
    operationalShiftId: string;
    nozzleId: string;
    reason: string;
  }>;
  tankSnapshots: Array<{
    operationalShiftId: string;
    tankId: string;
    tankNumber: number;
    tankName: string;
    productId: string;
    productCode: string;
    productName: string;
  }>;
  tankReadingsList: Array<{
    operationalShiftId: string;
    tankId: string;
    productId: string;
    readingType: string;
    productDipMmMilliunits: number;
    waterDipMmMilliunits: number;
    netProductVolumeMilliunits: number;
  }>;
  stockReconciliations: Array<{
    operationalShiftId: string;
    tankId: string;
    productId: string;
    openingStockMilliunits: number;
    receiptQuantityMilliunits: number;
    salesQuantityMilliunits: number;
    theoreticalClosingStockMilliunits: number;
    physicalClosingStockMilliunits: number;
    varianceMilliunits: number;
  }>;
  completedReceiptLines?: Array<{
    operationalShiftId: string;
    tankId: string;
    productId: string;
    invoiceQuantityMilliunits: number;
    measuredReceivedQuantityMilliunits: number | null;
  }>;
  allowLiveTankFallback?: boolean;
}

export class FuelDailyOperationsService {
  /**
   * Shared authoritative daily product calculation used by both:
   * - Daily Fuel Summary / DSR (`GET /api/v1/outlets/:outletId/fuel/daily-summary`)
   * - Monthly Operations Report (`GET /api/v1/outlets/:outletId/reports/monthly-operations`)
   */
  static computeProductDailySummary(input: ProductDailyComputationInput): DailyProductSummary {
    const {
      productId,
      productCode,
      productName,
      unit,
      dayShifts,
      productPrices,
      nozzleSnapshots,
      nozzleReadings,
      nozzleUnavailabilities = [],
      tankSnapshots,
      tankReadingsList,
      stockReconciliations,
      completedReceiptLines = [],
      allowLiveTankFallback = false,
    } = input;

    const applicableProductShifts = dayShifts.filter((shift) => {
      const shiftId = shift.id;
      return (
        productPrices.some((p) => p.operationalShiftId === shiftId && p.productId === productId) ||
        nozzleSnapshots.some((n) => n.operationalShiftId === shiftId && n.productId === productId) ||
        tankSnapshots.some((t) => t.operationalShiftId === shiftId && t.productId === productId) ||
        stockReconciliations.some((r) => r.operationalShiftId === shiftId && r.productId === productId) ||
        tankReadingsList.some((tr) => tr.operationalShiftId === shiftId && tr.productId === productId)
      );
    });

    const earliestApplicableShift =
      applicableProductShifts.length > 0 ? applicableProductShifts[0] : null;
    const latestApplicableShift =
      applicableProductShifts.length > 0
        ? applicableProductShifts[applicableProductShifts.length - 1]
        : null;

    const earliestShiftId = earliestApplicableShift?.id ?? null;
    const latestShiftId = latestApplicableShift?.id ?? null;

    let grossSalesQuantityMilliunits = 0;
    let netSalesQuantityMilliunits = 0;
    let testingQuantityMilliunits = 0;

    for (const shift of applicableProductShifts) {
      const nozzles = nozzleSnapshots.filter(
        (n) => n.operationalShiftId === shift.id && n.productId === productId
      );
      for (const nozzle of nozzles) {
        const reading = nozzleReadings.find(
          (r) => r.operationalShiftId === shift.id && r.nozzleId === nozzle.nozzleId
        );
        if (reading) {
          grossSalesQuantityMilliunits += reading.grossSalesQuantityMilliunits || 0;
          netSalesQuantityMilliunits += reading.netSalesQuantityMilliunits || 0;
          testingQuantityMilliunits += reading.testingQuantityMilliunits || 0;
        }
      }
    }

    const reconciliations = stockReconciliations.filter(
      (r) =>
        applicableProductShifts.some((s) => s.id === r.operationalShiftId) &&
        r.productId === productId
    );

    const openingRecon = reconciliations.filter(
      (r) => earliestShiftId !== null && r.operationalShiftId === earliestShiftId
    );
    const closingRecon = reconciliations.filter(
      (r) => latestShiftId !== null && r.operationalShiftId === latestShiftId
    );

    // Opening stock from earliest applicable shift
    let opening = 0;
    let hasOpening = false;
    if (openingRecon.length > 0) {
      opening = openingRecon.reduce((sum, r) => sum + r.openingStockMilliunits, 0);
      hasOpening = true;
    } else if (allowLiveTankFallback && earliestShiftId !== null) {
      const earliestTanks = tankSnapshots.filter(
        (t) => t.operationalShiftId === earliestShiftId && t.productId === productId
      );
      const openingReadings = tankReadingsList.filter(
        (r) =>
          r.operationalShiftId === earliestShiftId &&
          r.productId === productId &&
          r.readingType === 'OPENING'
      );
      if (
        openingReadings.length > 0 &&
        (earliestTanks.length === 0 ||
          earliestTanks.every((t) => openingReadings.some((r) => r.tankId === t.tankId)))
      ) {
        opening = openingReadings.reduce(
          (sum, r) => sum + (r.netProductVolumeMilliunits || 0),
          0
        );
        hasOpening = true;
      }
    }

    // Receipts summed across all applicable shifts on this day (never double-counted)
    let receipts = 0;
    for (const shift of applicableProductShifts) {
      const shiftRecons = reconciliations.filter((r) => r.operationalShiftId === shift.id);
      if (shiftRecons.length > 0) {
        receipts += shiftRecons.reduce((sum, r) => sum + r.receiptQuantityMilliunits, 0);
      } else if (allowLiveTankFallback) {
        const shiftLines = completedReceiptLines.filter(
          (l) => l.operationalShiftId === shift.id && l.productId === productId
        );
        receipts += shiftLines.reduce(
          (sum, l) =>
            sum + (l.measuredReceivedQuantityMilliunits ?? l.invoiceQuantityMilliunits ?? 0),
          0
        );
      }
    }

    // Closing stock from latest applicable shift
    let closing = 0;
    let theoreticalClosing = 0;
    let variance = 0;
    let hasClosing = false;

    if (closingRecon.length > 0) {
      closing = closingRecon.reduce((sum, r) => sum + r.physicalClosingStockMilliunits, 0);
      if (applicableProductShifts.length > 1 && netSalesQuantityMilliunits > 0 && hasOpening) {
        theoreticalClosing = opening + receipts - netSalesQuantityMilliunits;
        variance = closing - theoreticalClosing;
      } else {
        theoreticalClosing = closingRecon.reduce(
          (sum, r) => sum + r.theoreticalClosingStockMilliunits,
          0
        );
        variance = closingRecon.reduce((sum, r) => sum + r.varianceMilliunits, 0);
      }
      hasClosing = true;
    } else if (allowLiveTankFallback && latestShiftId !== null) {
      const latestTanks = tankSnapshots.filter(
        (t) => t.operationalShiftId === latestShiftId && t.productId === productId
      );
      const closingReadings = tankReadingsList.filter(
        (r) =>
          r.operationalShiftId === latestShiftId &&
          r.productId === productId &&
          r.readingType === 'CLOSING'
      );
      if (
        closingReadings.length > 0 &&
        (latestTanks.length === 0 ||
          latestTanks.every((t) => closingReadings.some((r) => r.tankId === t.tankId)))
      ) {
        closing = closingReadings.reduce(
          (sum, r) => sum + (r.netProductVolumeMilliunits || 0),
          0
        );
        hasClosing = true;
        if (hasOpening) {
          theoreticalClosing = opening + receipts - netSalesQuantityMilliunits;
          variance = closing - theoreticalClosing;
        }
      } else if (hasOpening) {
        theoreticalClosing = opening + receipts - netSalesQuantityMilliunits;
      }
    }

    const availableStockMilliunits = opening + receipts;

    const prices = productPrices.filter(
      (p) =>
        applicableProductShifts.some((s) => s.id === p.operationalShiftId) &&
        p.productId === productId
    );
    const uniquePrices = Array.from(new Set(prices.map((p) => p.pricePaisePerUnit)));

    const missingFields: string[] = [];
    if (applicableProductShifts.length > 0) {
      if (uniquePrices.length === 0) {
        missingFields.push('No RSP snapshot');
      }
      if (!hasOpening) {
        missingFields.push('No opening tank reading');
      }
      if (!hasClosing) {
        missingFields.push('No closing tank reading');
      }
      for (const shift of applicableProductShifts) {
        const expectedNozzles = nozzleSnapshots.filter(
          (n) => n.operationalShiftId === shift.id && n.productId === productId
        );
        for (const nozzle of expectedNozzles) {
          const reading = nozzleReadings.find(
            (r) => r.operationalShiftId === shift.id && r.nozzleId === nozzle.nozzleId
          );
          const unavail = nozzleUnavailabilities.find(
            (u) => u.operationalShiftId === shift.id && u.nozzleId === nozzle.nozzleId
          );
          if (!reading && !unavail) {
            const msg = `DU ${nozzle.dispenserNumber} / Nozzle ${nozzle.nozzleNumber} missing meter reading`;
            if (!missingFields.includes(msg)) {
              missingFields.push(msg);
            }
          }
        }
      }
    }

    const dayTankReadings: DailyTankReadingDetail[] = [];
    for (const shift of applicableProductShifts) {
      const shiftReadings = tankReadingsList.filter(
        (r) =>
          r.operationalShiftId === shift.id &&
          r.productId === productId &&
          (r.readingType === 'OPENING' || r.readingType === 'CLOSING')
      );

      shiftReadings.sort((a, b) => {
        const tankA =
          tankSnapshots.find((t) => t.operationalShiftId === shift.id && t.tankId === a.tankId)
            ?.tankNumber ?? 0;
        const tankB =
          tankSnapshots.find((t) => t.operationalShiftId === shift.id && t.tankId === b.tankId)
            ?.tankNumber ?? 0;
        if (tankA !== tankB) return tankA - tankB;
        if (a.readingType !== b.readingType) {
          return a.readingType === 'OPENING' ? -1 : 1;
        }
        return 0;
      });

      for (const r of shiftReadings) {
        const tankSnap = tankSnapshots.find(
          (t) => t.operationalShiftId === shift.id && t.tankId === r.tankId
        );
        dayTankReadings.push({
          tankId: r.tankId,
          tankNumber: String(tankSnap ? tankSnap.tankNumber : 0),
          readingType: r.readingType as 'OPENING' | 'CLOSING',
          productDipMmMilliunits: r.productDipMmMilliunits ?? 0,
          waterDipMmMilliunits: r.waterDipMmMilliunits ?? 0,
          netProductVolumeMilliunits: r.netProductVolumeMilliunits ?? 0,
        });
      }
    }

    const dayNozzleReadings: DailyNozzleReadingDetail[] = [];
    for (const shift of applicableProductShifts) {
      const shiftNozzles = nozzleSnapshots.filter(
        (n) => n.operationalShiftId === shift.id && n.productId === productId
      );

      shiftNozzles.sort((a, b) => {
        const dispA = Number(a.dispenserNumber) || 0;
        const dispB = Number(b.dispenserNumber) || 0;
        if (dispA !== dispB) return dispA - dispB;
        const nozzA = Number(a.nozzleNumber) || 0;
        const nozzB = Number(b.nozzleNumber) || 0;
        return nozzA - nozzB;
      });

      for (const nozzle of shiftNozzles) {
        const reading = nozzleReadings.find(
          (r) => r.operationalShiftId === shift.id && r.nozzleId === nozzle.nozzleId
        );
        dayNozzleReadings.push({
          operationalShiftId: shift.id,
          nozzleId: nozzle.nozzleId,
          dispenserId: nozzle.dispenserId,
          dispenserNumber: String(nozzle.dispenserNumber),
          nozzleNumber: String(nozzle.nozzleNumber),
          openingTotalizerMilliunits: reading ? reading.openingTotalizerMilliunits : null,
          closingTotalizerMilliunits: reading ? reading.closingTotalizerMilliunits : null,
          testingQuantityMilliunits: reading?.testingQuantityMilliunits ?? 0,
          grossSalesQuantityMilliunits: reading?.grossSalesQuantityMilliunits ?? 0,
          netSalesQuantityMilliunits: reading?.netSalesQuantityMilliunits ?? 0,
        });
      }
    }

    const status: DayEntryStatus =
      applicableProductShifts.length === 0
        ? 'NO_ENTRY'
        : missingFields.length > 0
          ? 'PARTIAL'
          : 'COMPLETE';

    return {
      productId,
      productCode,
      productName,
      unit,
      status,
      missingFields,
      shiftsCount: applicableProductShifts.length,
      rspPaise: uniquePrices,
      changedWithinDay: uniquePrices.length > 1,
      openingStockMilliunits: opening,
      closingStockMilliunits: closing,
      receiptsMilliunits: receipts,
      availableStockMilliunits,
      meterSalesMilliunits: netSalesQuantityMilliunits,
      grossSalesMilliunits: grossSalesQuantityMilliunits,
      testingMilliunits: testingQuantityMilliunits,
      netSalesMilliunits: netSalesQuantityMilliunits,
      theoreticalClosingMilliunits: theoreticalClosing,
      physicalClosingMilliunits: closing,
      varianceMilliunits: variance,
      openingStockL: opening / 1000,
      closingStockL: closing / 1000,
      receiptsL: receipts / 1000,
      availableStockL: availableStockMilliunits / 1000,
      meterSalesL: netSalesQuantityMilliunits / 1000,
      grossSalesL: grossSalesQuantityMilliunits / 1000,
      testingL: testingQuantityMilliunits / 1000,
      netSalesL: netSalesQuantityMilliunits / 1000,
      theoreticalClosingL: theoreticalClosing / 1000,
      physicalClosingL: closing / 1000,
      varianceL: variance / 1000,
      tankReadings: dayTankReadings,
      nozzleReadings: dayNozzleReadings,
    };
  }

  /**
   * Computes the authoritative DailyFuelSummary for a given outletId and businessDate.
   */
  static async getDailySummary(
    db: DrizzleD1Database<typeof schema>,
    outletId: string,
    businessDate: string
  ): Promise<DailyFuelSummary> {
    const [outlet] = await db
      .select()
      .from(retailOutlets)
      .where(eq(retailOutlets.id, outletId));
    if (!outlet) {
      throw new Error('Outlet not found');
    }

    const shiftsRaw = await db
      .select()
      .from(operationalShifts)
      .where(
        and(
          eq(operationalShifts.outletId, outletId),
          eq(operationalShifts.businessDate, businessDate)
        )
      )
      .orderBy(asc(operationalShifts.startedAt), asc(operationalShifts.id));

    const shifts = [...shiftsRaw].sort((a, b) => {
      const tA = new Date(a.startedAt).getTime();
      const tB = new Date(b.startedAt).getTime();
      if (tA !== tB) return tA - tB;
      return a.id.localeCompare(b.id);
    });

    if (shifts.length === 0) {
      return {
        outletId,
        outletName: outlet.name,
        businessDate,
        status: 'NOT_STARTED',
        dayEntryStatus: 'NO_ENTRY',
        shiftsCount: 0,
        shifts: [],
        tankReadings: [],
        nozzleReadings: [],
        completion: {
          expectedTanks: 0,
          openingTankReadings: 0,
          closingTankReadings: 0,
          expectedNozzles: 0,
          nozzleMeterReadings: 0,
          unavailableNozzles: 0,
          totalReceipts: 0,
          completedReceipts: 0,
          pendingReceipts: 0,
          reconciliationComplete: false,
          uncalibratedTanksCount: 0,
        },
        byDispenser: [],
        byProduct: [],
        totals: {
          openingStockMilliunits: 0,
          receiptsMilliunits: 0,
          availableStockMilliunits: 0,
          grossSalesMilliunits: 0,
          testingMilliunits: 0,
          netSalesMilliunits: 0,
          theoreticalClosingMilliunits: 0,
          physicalClosingMilliunits: 0,
          varianceMilliunits: 0,
          openingStockL: 0,
          receiptsL: 0,
          availableStockL: 0,
          grossSalesL: 0,
          testingL: 0,
          netSalesL: 0,
          theoreticalClosingL: 0,
          physicalClosingL: 0,
          varianceL: 0,
        },
        missingFields: [],
      };
    }

    const shiftIds = shifts.map((s) => s.id);

    const [
      productPrices,
      nozzleSnapshots,
      nozzleReadings,
      nozzleUnavailabilities,
      tankSnapshots,
      tankReadingsList,
      stockReconciliations,
      receiptsList,
      receiptLinesList,
    ] = await Promise.all([
      db
        .select()
        .from(operationalShiftProductPrices)
        .where(inArray(operationalShiftProductPrices.operationalShiftId, shiftIds)),
      db
        .select()
        .from(operationalShiftNozzles)
        .where(inArray(operationalShiftNozzles.operationalShiftId, shiftIds)),
      db
        .select()
        .from(nozzleMeterReadings)
        .where(inArray(nozzleMeterReadings.operationalShiftId, shiftIds)),
      db
        .select()
        .from(nozzleUnavailabilityRecords)
        .where(inArray(nozzleUnavailabilityRecords.operationalShiftId, shiftIds)),
      db
        .select()
        .from(operationalShiftTanks)
        .where(inArray(operationalShiftTanks.operationalShiftId, shiftIds)),
      db
        .select()
        .from(tankStockReadings)
        .where(inArray(tankStockReadings.operationalShiftId, shiftIds)),
      db
        .select()
        .from(shiftStockReconciliations)
        .where(inArray(shiftStockReconciliations.operationalShiftId, shiftIds)),
      db
        .select()
        .from(fuelReceipts)
        .where(inArray(fuelReceipts.operationalShiftId, shiftIds)),
      db
        .select({
          line: fuelReceiptTankLines,
          receipt: fuelReceipts,
        })
        .from(fuelReceiptTankLines)
        .innerJoin(fuelReceipts, eq(fuelReceiptTankLines.fuelReceiptId, fuelReceipts.id))
        .where(inArray(fuelReceipts.operationalShiftId, shiftIds)),
    ]);

    // Check calibration points for all unique tanks in snapshots
    const uniqueTankIds = Array.from(new Set(tankSnapshots.map((t) => t.tankId)));
    const calibrationRows =
      uniqueTankIds.length > 0
        ? await db
            .select()
            .from(tankCalibrationPoints)
            .where(inArray(tankCalibrationPoints.tankId, uniqueTankIds))
        : [];

    const calibrationCountByTankId = new Map<string, number>();
    for (const c of calibrationRows) {
      calibrationCountByTankId.set(c.tankId, (calibrationCountByTankId.get(c.tankId) || 0) + 1);
    }

    const completedReceiptLines = receiptLinesList
      .filter((r) => r.receipt.status === 'COMPLETED')
      .map((r) => ({
        operationalShiftId: r.receipt.operationalShiftId,
        tankId: r.line.tankId,
        productId: r.line.productId,
        invoiceQuantityMilliunits: r.line.invoiceQuantityMilliunits,
        measuredReceivedQuantityMilliunits: r.line.measuredReceivedQuantityMilliunits,
      }));

    // Discover products across prices, nozzle snapshots, tank snapshots, reconciliations, and tank readings
    const discoveredProducts = new Map<
      string,
      { productId: string; productCode: string; productName: string; unit: string }
    >();

    for (const p of productPrices) {
      if (p.productId && !discoveredProducts.has(p.productId)) {
        discoveredProducts.set(p.productId, {
          productId: p.productId,
          productCode: p.productCode || '',
          productName: p.productName || '',
          unit: p.unit || 'LITRE',
        });
      }
    }
    for (const n of nozzleSnapshots) {
      if (n.productId && !discoveredProducts.has(n.productId)) {
        discoveredProducts.set(n.productId, {
          productId: n.productId,
          productCode: n.productCode || '',
          productName: n.productName || '',
          unit: n.productUnit || 'LITRE',
        });
      }
    }
    for (const t of tankSnapshots) {
      if (t.productId && !discoveredProducts.has(t.productId)) {
        discoveredProducts.set(t.productId, {
          productId: t.productId,
          productCode: t.productCode || '',
          productName: t.productName || '',
          unit: t.productUnit || 'LITRE',
        });
      }
    }
    for (const r of stockReconciliations) {
      if (r.productId && !discoveredProducts.has(r.productId)) {
        discoveredProducts.set(r.productId, {
          productId: r.productId,
          productCode: r.productId,
          productName: r.productId,
          unit: 'LITRE',
        });
      }
    }

    const byProduct: DailyProductSummary[] = [];
    for (const prod of discoveredProducts.values()) {
      const prodSummary = this.computeProductDailySummary({
        businessDate,
        productId: prod.productId,
        productCode: prod.productCode,
        productName: prod.productName,
        unit: prod.unit,
        dayShifts: shifts,
        productPrices,
        nozzleSnapshots,
        nozzleReadings,
        nozzleUnavailabilities,
        tankSnapshots,
        tankReadingsList,
        stockReconciliations,
        completedReceiptLines,
        allowLiveTankFallback: true,
      });
      byProduct.push(prodSummary);
    }

    // Sort products deterministically by productCode
    byProduct.sort((a, b) => a.productCode.localeCompare(b.productCode));

    // Dispenser (DU / MPD) aggregation across all shifts of the day
    const dispenserMap = new Map<
      string,
      {
        dispenserId: string;
        dispenserNumber: number;
        dispenserName: string;
        grossSalesMilliunits: number;
        testingMilliunits: number;
        netSalesMilliunits: number;
        byProductMap: Map<
          string,
          {
            productId: string;
            productCode: string;
            productName: string;
            grossSalesMilliunits: number;
            testingMilliunits: number;
            netSalesMilliunits: number;
          }
        >;
        nozzles: DailyDispenserSummary['nozzles'];
      }
    >();

    // Process shifts in chronological order
    for (let sIdx = 0; sIdx < shifts.length; sIdx++) {
      const shift = shifts[sIdx];
      const shiftNumber = (shift as any).shiftNumber ?? sIdx + 1;
      const shiftNozzles = nozzleSnapshots
        .filter((n) => n.operationalShiftId === shift.id)
        .sort((a, b) => {
          if (a.dispenserNumber !== b.dispenserNumber) return a.dispenserNumber - b.dispenserNumber;
          return a.nozzleNumber - b.nozzleNumber;
        });

      for (const snap of shiftNozzles) {
        let disp = dispenserMap.get(snap.dispenserId);
        if (!disp) {
          disp = {
            dispenserId: snap.dispenserId,
            dispenserNumber: snap.dispenserNumber,
            dispenserName: snap.dispenserName,
            grossSalesMilliunits: 0,
            testingMilliunits: 0,
            netSalesMilliunits: 0,
            byProductMap: new Map(),
            nozzles: [],
          };
          dispenserMap.set(snap.dispenserId, disp);
        }

        const reading = nozzleReadings.find(
          (r) => r.operationalShiftId === shift.id && r.nozzleId === snap.nozzleId
        );
        const unavail = nozzleUnavailabilities.find(
          (u) => u.operationalShiftId === shift.id && u.nozzleId === snap.nozzleId
        );

        const grossMilli = reading?.grossSalesQuantityMilliunits ?? 0;
        const testMilli = reading?.testingQuantityMilliunits ?? 0;
        const netMilli = reading?.netSalesQuantityMilliunits ?? 0;

        disp.grossSalesMilliunits += grossMilli;
        disp.testingMilliunits += testMilli;
        disp.netSalesMilliunits += netMilli;

        let prodSub = disp.byProductMap.get(snap.productId);
        if (!prodSub) {
          prodSub = {
            productId: snap.productId,
            productCode: snap.productCode,
            productName: snap.productName,
            grossSalesMilliunits: 0,
            testingMilliunits: 0,
            netSalesMilliunits: 0,
          };
          disp.byProductMap.set(snap.productId, prodSub);
        }
        prodSub.grossSalesMilliunits += grossMilli;
        prodSub.testingMilliunits += testMilli;
        prodSub.netSalesMilliunits += netMilli;

        disp.nozzles.push({
          operationalShiftId: shift.id,
          shiftNumber,
          nozzleId: snap.nozzleId,
          nozzleNumber: snap.nozzleNumber,
          dispenserId: snap.dispenserId,
          dispenserNumber: snap.dispenserNumber,
          dispenserName: snap.dispenserName,
          productId: snap.productId,
          productCode: snap.productCode,
          productName: snap.productName,
          tankId: snap.tankId,
          tankNumber: snap.tankNumber,
          openingTotalizerMilliunits: reading ? reading.openingTotalizerMilliunits : null,
          closingTotalizerMilliunits: reading ? reading.closingTotalizerMilliunits : null,
          testingQuantityMilliunits: testMilli,
          grossSalesMilliunits: grossMilli,
          netSalesMilliunits: netMilli,
          grossSalesL: grossMilli / 1000,
          testingL: testMilli / 1000,
          netSalesL: netMilli / 1000,
          hasReading: Boolean(reading),
          isUnavailable: Boolean(unavail),
          unavailabilityReason: unavail?.reason || null,
        });
      }
    }

    const byDispenser: DailyDispenserSummary[] = Array.from(dispenserMap.values())
      .sort((a, b) => a.dispenserNumber - b.dispenserNumber)
      .map((d) => ({
        dispenserId: d.dispenserId,
        dispenserNumber: d.dispenserNumber,
        dispenserName: d.dispenserName,
        grossSalesMilliunits: d.grossSalesMilliunits,
        testingMilliunits: d.testingMilliunits,
        netSalesMilliunits: d.netSalesMilliunits,
        grossSalesL: d.grossSalesMilliunits / 1000,
        testingL: d.testingMilliunits / 1000,
        netSalesL: d.netSalesMilliunits / 1000,
        byProduct: Array.from(d.byProductMap.values())
          .sort((a, b) => a.productCode.localeCompare(b.productCode))
          .map((p) => ({
            ...p,
            grossSalesL: p.grossSalesMilliunits / 1000,
            testingL: p.testingMilliunits / 1000,
            netSalesL: p.netSalesMilliunits / 1000,
          })),
        nozzles: d.nozzles,
      }));

    // Completion and shift summaries
    let expectedTanksTotal = 0;
    let openingTankReadingsTotal = 0;
    let closingTankReadingsTotal = 0;
    let expectedNozzlesTotal = 0;
    let nozzleMeterReadingsTotal = 0;
    let unavailableNozzlesTotal = 0;
    let allShiftsReconciled = shifts.length > 0;

    const shiftSummaries: DailyShiftSummaryItem[] = [];
    const globalMissingFields: string[] = [];

    // Check uncalibrated tanks
    const uncalibratedTanks = new Set<string>();
    for (const ts of tankSnapshots) {
      const ptCount = calibrationCountByTankId.get(ts.tankId) || 0;
      if (ptCount < 2) {
        uncalibratedTanks.add(ts.tankId);
        const msg = `Tank #${ts.tankNumber} (${ts.productCode}): TANK CALIBRATION REQUIRED`;
        if (!globalMissingFields.includes(msg)) {
          globalMissingFields.push(msg);
        }
      }
    }

    for (let sIdx = 0; sIdx < shifts.length; sIdx++) {
      const shift = shifts[sIdx];
      const shiftNumber = (shift as any).shiftNumber ?? sIdx + 1;
      const sTanks = tankSnapshots.filter((t) => t.operationalShiftId === shift.id);
      const sNozzles = nozzleSnapshots.filter((n) => n.operationalShiftId === shift.id);
      const sTankReadings = tankReadingsList.filter((r) => r.operationalShiftId === shift.id);
      const sNozzleReadings = nozzleReadings.filter((r) => r.operationalShiftId === shift.id);
      const sUnavails = nozzleUnavailabilityRecords
        ? nozzleUnavailabilities.filter((u) => u.operationalShiftId === shift.id)
        : [];
      const sRecons = stockReconciliations.filter((r) => r.operationalShiftId === shift.id);

      let sOpeningTanks = 0;
      let sClosingTanks = 0;
      for (const t of sTanks) {
        if (sTankReadings.some((r) => r.tankId === t.tankId && r.readingType === 'OPENING')) {
          sOpeningTanks++;
        } else {
          const msg = `Shift #${shiftNumber} Tank #${t.tankNumber} (${t.productCode}) missing opening reading`;
          if (!globalMissingFields.includes(msg)) globalMissingFields.push(msg);
        }
        if (sTankReadings.some((r) => r.tankId === t.tankId && r.readingType === 'CLOSING')) {
          sClosingTanks++;
        } else {
          const msg = `Shift #${shiftNumber} Tank #${t.tankNumber} (${t.productCode}) missing closing reading`;
          if (!globalMissingFields.includes(msg)) globalMissingFields.push(msg);
        }
      }

      let sMeterReadings = 0;
      let sUnavailable = 0;
      let sGrossMilli = 0;
      let sTestMilli = 0;
      let sNetMilli = 0;

      for (const n of sNozzles) {
        const rd = sNozzleReadings.find((r) => r.nozzleId === n.nozzleId);
        const un = sUnavails.find((u) => u.nozzleId === n.nozzleId);
        if (rd) {
          sMeterReadings++;
          sGrossMilli += rd.grossSalesQuantityMilliunits || 0;
          sTestMilli += rd.testingQuantityMilliunits || 0;
          sNetMilli += rd.netSalesQuantityMilliunits || 0;
        } else if (un) {
          sUnavailable++;
        } else {
          const msg = `DU ${n.dispenserNumber} / Nozzle ${n.nozzleNumber} missing meter reading`;
          if (!globalMissingFields.includes(msg)) globalMissingFields.push(msg);
        }
      }

      // A shift's reconciliation is complete when all its snapshot tanks have saved reconciliation rows
      // OR when the shift is CLOSED/LOCKED and has reconciliation records
      const sReconComplete =
        sTanks.length > 0
          ? sTanks.every((t) => sRecons.some((r) => r.tankId === t.tankId))
          : sRecons.length > 0 || shift.status === 'CLOSED' || shift.status === 'LOCKED';

      if (!sReconComplete) {
        allShiftsReconciled = false;
        const msg = `Shift #${shiftNumber} stock reconciliation pending`;
        if (!globalMissingFields.includes(msg)) globalMissingFields.push(msg);
      }

      expectedTanksTotal += sTanks.length;
      openingTankReadingsTotal += sOpeningTanks;
      closingTankReadingsTotal += sClosingTanks;
      expectedNozzlesTotal += sNozzles.length;
      nozzleMeterReadingsTotal += sMeterReadings;
      unavailableNozzlesTotal += sUnavailable;

      shiftSummaries.push({
        id: shift.id,
        shiftTemplateId: shift.shiftTemplateId,
        shiftNumber,
        businessDate: shift.businessDate,
        status: shift.status as 'OPEN' | 'CLOSED' | 'LOCKED',
        startedAt: shift.startedAt,
        endedAt: shift.closedAt || null,
        expectedTanks: sTanks.length,
        openingTankReadings: sOpeningTanks,
        closingTankReadings: sClosingTanks,
        expectedNozzles: sNozzles.length,
        nozzleMeterReadings: sMeterReadings,
        unavailableNozzles: sUnavailable,
        reconciliationComplete: sReconComplete,
        grossSalesMilliunits: sGrossMilli,
        testingMilliunits: sTestMilli,
        netSalesMilliunits: sNetMilli,
      });
    }

    // Receipts completion check
    const activeReceipts = receiptsList.filter((r) => r.status !== 'CANCELLED');
    const completedReceiptsCount = activeReceipts.filter((r) => r.status === 'COMPLETED').length;
    const pendingReceiptsCount = activeReceipts.filter((r) => r.status !== 'COMPLETED').length;

    if (pendingReceiptsCount > 0) {
      for (const pr of activeReceipts.filter((r) => r.status !== 'COMPLETED')) {
        const msg = `Fuel receipt TT ${pr.ttNumber} (Inv ${pr.invoiceNumber}) is incomplete (${pr.status})`;
        if (!globalMissingFields.includes(msg)) {
          globalMissingFields.push(msg);
        }
      }
    }

    // Merge product-level missing fields
    for (const prod of byProduct) {
      for (const mf of prod.missingFields) {
        if (!globalMissingFields.includes(mf)) {
          globalMissingFields.push(mf);
        }
      }
    }

    // Aggregate day totals across products
    let totalOpeningMilli = 0;
    let totalReceiptsMilli = 0;
    let totalAvailableMilli = 0;
    let totalGrossMilli = 0;
    let totalTestingMilli = 0;
    let totalNetMilli = 0;
    let totalTheoreticalClosingMilli = 0;
    let totalPhysicalClosingMilli = 0;
    let totalVarianceMilli = 0;

    const allTankReadings: DailyTankReadingDetail[] = [];
    const allNozzleReadings: DailyNozzleReadingDetail[] = [];

    for (const prod of byProduct) {
      totalOpeningMilli += prod.openingStockMilliunits;
      totalReceiptsMilli += prod.receiptsMilliunits;
      totalAvailableMilli += prod.availableStockMilliunits;
      totalGrossMilli += prod.grossSalesMilliunits;
      totalTestingMilli += prod.testingMilliunits;
      totalNetMilli += prod.netSalesMilliunits;
      totalTheoreticalClosingMilli += prod.theoreticalClosingMilliunits;
      totalPhysicalClosingMilli += prod.physicalClosingMilliunits;
      totalVarianceMilli += prod.varianceMilliunits;
      allTankReadings.push(...prod.tankReadings);
      allNozzleReadings.push(...prod.nozzleReadings);
    }

    // Determine overall status
    const allNozzlesAccounted =
      expectedNozzlesTotal > 0 &&
      nozzleMeterReadingsTotal + unavailableNozzlesTotal >= expectedNozzlesTotal;
    const allTanksOpened =
      expectedTanksTotal === 0 || openingTankReadingsTotal >= expectedTanksTotal;
    const allTanksClosed =
      expectedTanksTotal === 0 || closingTankReadingsTotal >= expectedTanksTotal;

    let overallStatus: DailyOperationsStatus = 'IN_PROGRESS';
    if (uncalibratedTanks.size > 0) {
      overallStatus = 'BLOCKED';
    } else if (
      allNozzlesAccounted &&
      allTanksOpened &&
      allTanksClosed &&
      pendingReceiptsCount === 0 &&
      allShiftsReconciled &&
      globalMissingFields.length === 0
    ) {
      overallStatus = 'COMPLETE';
    } else {
      overallStatus = 'IN_PROGRESS';
    }

    const dayEntryStatus: DayEntryStatus =
      overallStatus === 'COMPLETE' ? 'COMPLETE' : 'PARTIAL';

    return {
      outletId,
      outletName: outlet.name,
      businessDate,
      status: overallStatus,
      dayEntryStatus,
      shiftsCount: shifts.length,
      shifts: shiftSummaries,
      tankReadings: allTankReadings,
      nozzleReadings: allNozzleReadings,
      completion: {
        expectedTanks: expectedTanksTotal,
        openingTankReadings: openingTankReadingsTotal,
        closingTankReadings: closingTankReadingsTotal,
        expectedNozzles: expectedNozzlesTotal,
        nozzleMeterReadings: nozzleMeterReadingsTotal,
        unavailableNozzles: unavailableNozzlesTotal,
        totalReceipts: activeReceipts.length,
        completedReceipts: completedReceiptsCount,
        pendingReceipts: pendingReceiptsCount,
        reconciliationComplete: allShiftsReconciled,
        uncalibratedTanksCount: uncalibratedTanks.size,
      },
      byDispenser,
      byProduct,
      totals: {
        openingStockMilliunits: totalOpeningMilli,
        receiptsMilliunits: totalReceiptsMilli,
        availableStockMilliunits: totalAvailableMilli,
        grossSalesMilliunits: totalGrossMilli,
        testingMilliunits: totalTestingMilli,
        netSalesMilliunits: totalNetMilli,
        theoreticalClosingMilliunits: totalTheoreticalClosingMilli,
        physicalClosingMilliunits: totalPhysicalClosingMilli,
        varianceMilliunits: totalVarianceMilli,
        openingStockL: totalOpeningMilli / 1000,
        receiptsL: totalReceiptsMilli / 1000,
        availableStockL: totalAvailableMilli / 1000,
        grossSalesL: totalGrossMilli / 1000,
        testingL: totalTestingMilli / 1000,
        netSalesL: totalNetMilli / 1000,
        theoreticalClosingL: totalTheoreticalClosingMilli / 1000,
        physicalClosingL: totalPhysicalClosingMilli / 1000,
        varianceL: totalVarianceMilli / 1000,
      },
      missingFields: globalMissingFields,
    };
  }

  /**
   * Single bootstrap query for the Daily Operations page (`/daily-operations`).
   * Avoids N+1 roundtrips by loading shift templates, shifts, tank grids, nozzle grids,
   * continuity suggestions, receipts, reconciliations, and daily summary in parallel.
   */
  static async getDailyOperationsBootstrap(
    db: DrizzleD1Database<typeof schema>,
    outletId: string,
    businessDate: string
  ): Promise<DailyOperationsBootstrapResponse> {
    const repo = new PumpRepository(db);
    const [outlet] = await db
      .select()
      .from(retailOutlets)
      .where(eq(retailOutlets.id, outletId));
    if (!outlet) {
      throw new Error('Outlet not found');
    }

    const [shiftTemplates, shifts, dailySummary] = await Promise.all([
      repo.listShiftTemplatesByOutlet(outletId),
      repo.listOperationalShiftsByOutletAndDate(outletId, businessDate),
      this.getDailySummary(db, outletId, businessDate),
    ]);

    if (shifts.length === 0) {
      return {
        outletId,
        outletName: outlet.name,
        businessDate,
        shiftTemplates,
        shifts: [],
        dailySummary,
      };
    }

    // Build shift workspaces in parallel
    const shiftWorkspaces: DailyOperationsShiftWorkspace[] = await Promise.all(
      shifts.map(async (shift) => {
        const [
          tankSnapshots,
          tankReadings,
          nozzleSnapshots,
          nozzleReadings,
          unavailabilities,
          receipts,
          reconciliations,
        ] = await Promise.all([
          repo.listShiftTankSnapshots(shift.id),
          repo.listShiftTankReadings(shift.id),
          repo.listShiftNozzleSnapshots(shift.id),
          repo.listReadingsForShift(shift.id),
          repo.listUnavailabilityForShift(shift.id),
          repo.listFuelReceiptsByShift(shift.id),
          repo.listShiftStockReconciliations(shift.id),
        ]);

        // Load calibration points and previous closing tank readings in parallel
        const tankRows: DailyOperationsTankEntryRow[] = await Promise.all(
          tankSnapshots.map(async (ts) => {
            const [calPoints, prevTankClosing] = await Promise.all([
              repo.listCalibrationPoints(ts.tankId),
              repo.findLatestClosedTankClosingReading(outletId, ts.tankId),
            ]);
            const hasCalibrationChart = calPoints.length >= 2;
            const openingReading =
              tankReadings.find((r) => r.tankId === ts.tankId && r.readingType === 'OPENING') ||
              null;
            const closingReading =
              tankReadings.find((r) => r.tankId === ts.tankId && r.readingType === 'CLOSING') ||
              null;

            return {
              tankId: ts.tankId,
              tankNumber: ts.tankNumber,
              tankName: ts.tankName,
              productId: ts.productId,
              productCode: ts.productCode,
              productName: ts.productName,
              productUnit: ts.productUnit,
              capacityMilliunits: ts.capacityMilliunits,
              safeFillCapacityMilliunits: ts.safeFillCapacityMilliunits,
              capacityLitres: formatMilliunits(ts.capacityMilliunits),
              safeFillCapacityLitres: formatMilliunits(ts.safeFillCapacityMilliunits),
              hasCalibrationChart,
              calibrationPointCount: calPoints.length,
              calibrationBlocker: hasCalibrationChart ? null : 'TANK CALIBRATION REQUIRED',
              suggestedOpeningDipMm: prevTankClosing ? prevTankClosing.productDipMmStr : null,
              suggestedOpeningVolumeLitres: prevTankClosing
                ? prevTankClosing.netProductVolumeStr
                : null,
              openingReading,
              closingReading,
            };
          })
        );

        // Load previous closed readings for all nozzles in parallel
        const readingByNozzleId = new Map(nozzleReadings.map((r) => [r.nozzleId, r]));
        const unavailByNozzleId = new Map(unavailabilities.map((u) => [u.nozzleId, u]));

        const nozzleRows: DailyOperationsNozzleEntryRow[] = await Promise.all(
          nozzleSnapshots.map(async (ns) => {
            const prevClosed = await repo.getLatestClosedReadingForNozzle(ns.nozzleId);
            return {
              nozzleId: ns.nozzleId,
              nozzleNumber: ns.nozzleNumber,
              dispenserId: ns.dispenserId,
              dispenserNumber: ns.dispenserNumber,
              dispenserName: ns.dispenserName,
              productId: ns.productId,
              productCode: ns.productCode,
              productName: ns.productName,
              productCategory: ns.productCategory,
              productUnit: ns.productUnit,
              tankId: ns.tankId,
              tankNumber: ns.tankNumber,
              snapshotStatus: ns.snapshotStatus,
              suggestedOpeningTotalizer: (prevClosed ? prevClosed.closingTotalizerStr : '0.000') || '0.000',
              suggestedOpeningTotalizerMilliunits:
                prevClosed?.closingTotalizerMilliunits ?? null,
              previousShiftId: prevClosed?.operationalShiftId ?? null,
              reading: readingByNozzleId.get(ns.nozzleId) || null,
              unavailability: unavailByNozzleId.get(ns.nozzleId) || null,
            };
          })
        );

        return {
          shift,
          shiftTemplateName: shift.shiftTemplateName || `Shift #${(shift as any).shiftNumber || 1}`,
          shiftTemplateCode: shift.shiftTemplateCode || 'SHIFT',
          tanks: tankRows,
          nozzles: nozzleRows,
          receipts,
          reconciliations,
        };
      })
    );

    return {
      outletId,
      outletName: outlet.name,
      businessDate,
      shiftTemplates,
      shifts: shiftWorkspaces,
      dailySummary,
    };
  }
}
