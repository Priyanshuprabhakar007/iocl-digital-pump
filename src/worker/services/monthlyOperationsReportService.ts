import {
  MonthlyOperationsReport,
  CutoffMode,
  DailyDgRow,
  DgRunInterval,
  ProductMonthlyReport,
  DailyTankReadingDetail,
  DailyNozzleReadingDetail,
} from '../../shared/types';
import { eq, and, gte, lte, asc, inArray, desc } from 'drizzle-orm';
import {
  retailOutlets,
  dgDailyLogs,
  dgRunIntervals,
  operationalShifts,
  shiftFinancialReconciliations,
  equipmentBreakdownTickets,
  hrAttendanceRecords,
  hrStaff,
  equipmentAssets,
  operationalShiftProductPrices,
  operationalShiftNozzles,
  operationalShiftTanks,
  tankStockReadings,
  shiftStockReconciliations,
  nozzleMeterReadings,
} from '../../db/schema';

export class MonthlyOperationsReportService {
  static async generateReport(
    db: any,
    outletId: string,
    month: string,
    cutoffMode: 'MONTH_END' | 'SELECTED_DATE' | 'LATEST_DATA' = 'MONTH_END',
    cutoffDate?: string
  ): Promise<MonthlyOperationsReport> {
    // 1. Verify outlet
    const outletRows = await db
      .select()
      .from(retailOutlets)
      .where(eq(retailOutlets.id, outletId))
      .limit(1);
    if (!outletRows || outletRows.length === 0) {
      throw new Error(`Retail outlet ${outletId} not found`);
    }
    const outlet = outletRows[0];

    // Compute month start
    const startDate = `${month}-01`;
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const m = parseInt(monthStr, 10);
    const lastDayNum = new Date(year, m, 0).getDate();
    
    // Default endDate to end of month for initial latest data lookup
    let endDate = `${month}-${lastDayNum.toString().padStart(2, '0')}`;
    let resolvedCutoffDate: string;

    if (cutoffMode === 'SELECTED_DATE') {
      if (!cutoffDate) throw new Error('cutoffDate required for SELECTED_DATE');
      resolvedCutoffDate = cutoffDate;
    } else if (cutoffMode === 'LATEST_DATA') {
      const latestShift = await db
        .select({ date: operationalShifts.businessDate })
        .from(operationalShifts)
        .where(
          and(
            eq(operationalShifts.outletId, outletId),
            gte(operationalShifts.businessDate, startDate),
            lte(operationalShifts.businessDate, endDate)
          )
        )
        .orderBy(desc(operationalShifts.businessDate))
        .limit(1);
      const latestShiftDate = latestShift[0]?.date || null;
      
      const latestDg = await db
        .select({ date: dgDailyLogs.businessDate })
        .from(dgDailyLogs)
        .where(
          and(
            eq(dgDailyLogs.outletId, outletId),
            gte(dgDailyLogs.businessDate, startDate),
            lte(dgDailyLogs.businessDate, endDate)
          )
        )
        .orderBy(desc(dgDailyLogs.businessDate))
        .limit(1);
      const latestDgDate = latestDg[0]?.date || null;
      
      const latest = [latestShiftDate, latestDgDate].filter(Boolean).sort().pop();
      if (!latest) {
          return this.getEmptyReport(outletId, outlet.name, month, cutoffMode, null);
      }
      resolvedCutoffDate = latest;
    } else { // MONTH_END
      resolvedCutoffDate = `${month}-${lastDayNum.toString().padStart(2, '0')}`;
    }
    
    endDate = resolvedCutoffDate;

    // 2. Fetch DG Daily Logs for month
    // 2. Fetch DG Daily Logs for month
    const logRows = await db
      .select({
        id: dgDailyLogs.id,
        outletId: dgDailyLogs.outletId,
        equipmentAssetId: dgDailyLogs.equipmentAssetId,
        businessDate: dgDailyLogs.businessDate,
        meterReadingFromMilliunits: dgDailyLogs.meterReadingFromMilliunits,
        meterReadingToMilliunits: dgDailyLogs.meterReadingToMilliunits,
        hsdConsumedMilliunits: dgDailyLogs.hsdConsumedMilliunits,
        hsdRatePaisePerLitre: dgDailyLogs.hsdRatePaisePerLitre,
        amountPaise: dgDailyLogs.amountPaise,
        remarks: dgDailyLogs.remarks,
        status: dgDailyLogs.status,
        equipmentName: equipmentAssets.name,
      })
      .from(dgDailyLogs)
      .leftJoin(equipmentAssets, eq(dgDailyLogs.equipmentAssetId, equipmentAssets.id))
      .where(
        and(
          eq(dgDailyLogs.outletId, outletId),
          gte(dgDailyLogs.businessDate, startDate),
          lte(dgDailyLogs.businessDate, endDate)
        )
      )
      .orderBy(asc(dgDailyLogs.businessDate));

    const logIds = logRows.map((r: any) => r.id);
    let allIntervals: any[] = [];
    if (logIds.length > 0) {
      allIntervals = await db
        .select()
        .from(dgRunIntervals)
        .where(inArray(dgRunIntervals.dgDailyLogId, logIds))
        .orderBy(asc(dgRunIntervals.sequenceNo));
    }

    const intervalMap = new Map<string, DgRunInterval[]>();
    for (const iv of allIntervals) {
      const list = intervalMap.get(iv.dgDailyLogId) || [];
      list.push(iv);
      intervalMap.set(iv.dgDailyLogId, list);
    }

    let totalRunningMinutes = 0;
    let totalHsdConsumedMilliunits = 0;
    let totalAmountPaise = 0;

    const logByDate = new Map<string, any>();
    for (const log of logRows) {
      logByDate.set(log.businessDate, log);
      const ivs = intervalMap.get(log.id) || [];
      const logMins = ivs.reduce((sum: number, i: any) => sum + (i.durationMinutes || 0), 0);
      totalRunningMinutes += logMins;
      totalHsdConsumedMilliunits += log.hsdConsumedMilliunits || 0;
      totalAmountPaise += log.amountPaise || 0;
    }

    const totalLogs = logRows.length;
    const totalRunHours = Math.round((totalRunningMinutes / 60) * 100) / 100;
    const averageDailyRunHours = totalLogs > 0 ? Math.round((totalRunHours / totalLogs) * 100) / 100 : 0;
    const totalDieselConsumedLitres = totalHsdConsumedMilliunits / 1000;
    const runH = Math.floor(totalRunningMinutes / 60);
    const runM = totalRunningMinutes % 60;
    const totalRunningHoursStr = `${runH}:${runM.toString().padStart(2, '0')}`;
    const totalHsdConsumedStr = totalDieselConsumedLitres.toFixed(3);
    const totalAmountStr = (totalAmountPaise / 100).toFixed(2);

    // Build daily rows for each calendar day up to cutoff
    const dailyDgRows: DailyDgRow[] = [];
    const cutoffDay = parseInt(endDate.split('-')[2], 10);
    for (let day = 1; day <= cutoffDay; day++) {
      const dateStr = `${month}-${day.toString().padStart(2, '0')}`;
      const log = logByDate.get(dateStr);
      if (log) {
        const ivs = intervalMap.get(log.id) || [];
        const dayMinutes = ivs.reduce((sum: number, i: any) => sum + (i.durationMinutes || 0), 0);
        const dayH = Math.floor(dayMinutes / 60);
        const dayM = dayMinutes % 60;
        dailyDgRows.push({
          businessDate: dateStr,
          status: log.status === 'FINAL' ? 'COMPLETE' : 'PARTIAL',
          equipmentAssetId: log.equipmentAssetId,
          equipmentName: log.equipmentName || null,
          meterReadingFromMilliunits: log.meterReadingFromMilliunits ?? null,
          meterReadingToMilliunits: log.meterReadingToMilliunits ?? null,
          meterReadingFromStr: log.meterReadingFromMilliunits != null ? (log.meterReadingFromMilliunits / 1000).toFixed(3) : null,
          meterReadingToStr: log.meterReadingToMilliunits != null ? (log.meterReadingToMilliunits / 1000).toFixed(3) : null,
          intervals: ivs,
          totalRunningMinutes: dayMinutes,
          totalRunningHoursStr: `${dayH}:${dayM.toString().padStart(2, '0')}`,
          hsdConsumedMilliunits: log.hsdConsumedMilliunits || 0,
          hsdConsumedStr: ((log.hsdConsumedMilliunits || 0) / 1000).toFixed(3),
          hsdRatePaisePerLitre: log.hsdRatePaisePerLitre ?? null,
          hsdRateStr: log.hsdRatePaisePerLitre != null ? (log.hsdRatePaisePerLitre / 100).toFixed(2) : null,
          amountPaise: log.amountPaise ?? null,
          amountStr: log.amountPaise != null ? (log.amountPaise / 100).toFixed(2) : null,
          remarks: log.remarks ?? null,
        });
      } else {
        dailyDgRows.push({
          businessDate: dateStr,
          status: 'NO_ENTRY',
          equipmentAssetId: null,
          equipmentName: null,
          meterReadingFromMilliunits: null,
          meterReadingToMilliunits: null,
          meterReadingFromStr: null,
          meterReadingToStr: null,
          intervals: [],
          totalRunningMinutes: 0,
          totalRunningHoursStr: '0:00',
          hsdConsumedMilliunits: 0,
          hsdConsumedStr: '0.000',
          hsdRatePaisePerLitre: null,
          hsdRateStr: null,
          amountPaise: null,
          amountStr: null,
          remarks: null,
        });
      }
    }

    // 3. Aggregate Product Data
    const shifts = await db.select().from(operationalShifts).where(
        and(
            eq(operationalShifts.outletId, outletId),
            gte(operationalShifts.businessDate, startDate),
            lte(operationalShifts.businessDate, endDate)
        )
    );
    const shiftIds = shifts.map((s: any) => s.id);
    const productSections = await this.aggregateProductData(db, outletId, shifts, startDate, endDate);
    
    // 4. Operational Shifts & Sales Summary
    
    // 4. Operational Shifts & Sales Summary
    let totalSalesPaise = 0;
    if (shiftIds.length > 0) {
      const reconRows = await db
        .select()
        .from(shiftFinancialReconciliations)
        .where(eq(shiftFinancialReconciliations.outletId, outletId));

      for (const recon of reconRows) {
        if (shiftIds.includes(recon.shiftId)) {
          totalSalesPaise += recon.authoritativeSalesRevenuePaise || 0;
        }
      }
    }

    // 5. Equipment Breakdown Tickets
    const tickets = await db
      .select()
      .from(equipmentBreakdownTickets)
      .where(
        and(
          eq(equipmentBreakdownTickets.outletId, outletId),
          gte(equipmentBreakdownTickets.createdAt, `${startDate}T00:00:00.000Z`)
        )
      );

    let openTickets = 0;
    let resolvedTickets = 0;
    for (const ticket of tickets) {
      if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
        resolvedTickets++;
      } else {
        openTickets++;
      }
    }

    // 6. HR Staff & Attendance
    const staffList = await db.select().from(hrStaff).where(eq(hrStaff.outletId, outletId));
    const attendanceRecords = await db
      .select()
      .from(hrAttendanceRecords)
      .where(
        and(
          eq(hrAttendanceRecords.outletId, outletId),
          gte(hrAttendanceRecords.attendanceDate, startDate),
          lte(hrAttendanceRecords.attendanceDate, endDate)
        )
      );

    let presentDays = 0;
    for (const record of attendanceRecords) {
      if (record.status === 'PRESENT' || record.status === 'LATE') {
        presentDays++;
      }
    }

    const latestDgDataDate =
      logRows.length > 0
        ? logRows[logRows.length - 1].businessDate
        : null;

    const latestShiftDataDate =
      shifts.length > 0
        ? shifts.map((s: any) => s.businessDate).sort().pop() ?? null
        : null;

    const actualLatestDataDate =
      [latestDgDataDate, latestShiftDataDate]
        .filter((date): date is string => Boolean(date))
        .sort()
        .pop() ?? null;

    return {
      outletId,
      outletName: outlet.name,
      month,
      cutoffMode,
      cutoffDate: endDate,
      latestDataDate: actualLatestDataDate,
      productSections,
      dgSection: {
        rows: dailyDgRows,
        totals: {
          totalRunningMinutes,
          totalRunningHoursStr,
          totalHsdConsumedMilliunits,
          totalHsdConsumedStr,
          totalAmountPaise,
          totalAmountStr,
        },
      },
      dgSummary: {
        totalLogs,
        totalRunHours,
        totalDieselConsumedLitres,
        averageDailyRunHours,
        totalGridFailureMinutes: 0,
        totalRunningMinutes,
        totalRunningHoursStr,
      },
      fuelSummary: {
        totalShiftsCount: shifts.filter((s: any) => s.status === 'CLOSED').length,
        totalSalesPaise,
      },
      breakdownSummary: {
        totalTickets: tickets.length,
        openTickets,
        resolvedTickets,
      },
      hrSummary: {
        totalStaff: staffList.filter((s: any) => s.status === 'ACTIVE').length,
        presentDaysCount: presentDays,
      },
    };
  }

  private static async aggregateProductData(
    db: any,
    outletId: string,
    shifts: any[],
    startDate: string,
    endDate: string
  ): Promise<ProductMonthlyReport[]> {
    const shiftIds = shifts.map(s => s.id);
    if (shiftIds.length === 0) return [];

    // Discover products from historical shifts (UNION of prices, nozzles, and tanks)
    const discoveredProducts = new Map<string, { productId: string; productCode: string; productName: string }>();

    // 1. From operationalShiftProductPrices
    const priceProducts = await db
      .select({
        productId: operationalShiftProductPrices.productId,
        productCode: operationalShiftProductPrices.productCode,
        productName: operationalShiftProductPrices.productName,
      })
      .from(operationalShiftProductPrices)
      .where(inArray(operationalShiftProductPrices.operationalShiftId, shiftIds));

    for (const p of priceProducts) {
      if (p.productId && !discoveredProducts.has(p.productId)) {
        discoveredProducts.set(p.productId, {
          productId: p.productId,
          productCode: p.productCode || "",
          productName: p.productName || "",
        });
      }
    }

    // 2. From operationalShiftNozzles
    const nozzleProducts = await db
      .select({
        productId: operationalShiftNozzles.productId,
        productCode: operationalShiftNozzles.productCode,
        productName: operationalShiftNozzles.productName,
      })
      .from(operationalShiftNozzles)
      .where(inArray(operationalShiftNozzles.operationalShiftId, shiftIds));

    for (const p of nozzleProducts) {
      if (p.productId && !discoveredProducts.has(p.productId)) {
        discoveredProducts.set(p.productId, {
          productId: p.productId,
          productCode: p.productCode || "",
          productName: p.productName || "",
        });
      }
    }

    // 3. From operationalShiftTanks
    const tankProducts = await db
      .select({
        productId: operationalShiftTanks.productId,
        productCode: operationalShiftTanks.productCode,
        productName: operationalShiftTanks.productName,
      })
      .from(operationalShiftTanks)
      .where(inArray(operationalShiftTanks.operationalShiftId, shiftIds));

    for (const p of tankProducts) {
      if (p.productId && !discoveredProducts.has(p.productId)) {
        discoveredProducts.set(p.productId, {
          productId: p.productId,
          productCode: p.productCode || "",
          productName: p.productName || "",
        });
      }
    }

    // Create a map to hold the report structure
    const productMap = new Map<string, ProductMonthlyReport>();

    for (const p of discoveredProducts.values()) {
      productMap.set(p.productId, {
        productId: p.productId,
        productCode: p.productCode,
        productName: p.productName,
        rows: [],
        totals: {
          totalMeterSalesL: 0,
          totalTestingL: 0,
          totalNetSalesL: 0,
          totalReceiptsL: 0,
          totalVarianceL: 0,
        },
      });
    }

    // Sort shifts and group by businessDate
    const shiftsByDate = new Map<string, any[]>();
    for (const shift of shifts) {
      const list = shiftsByDate.get(shift.businessDate) || [];
      list.push(shift);
      list.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
      shiftsByDate.set(shift.businessDate, list);
    }
    
    // Fetch all necessary historical data
    const stockReconciliations = await db.select().from(shiftStockReconciliations).where(inArray(shiftStockReconciliations.operationalShiftId, shiftIds));
    const productPrices = await db.select().from(operationalShiftProductPrices).where(inArray(operationalShiftProductPrices.operationalShiftId, shiftIds));
    const nozzleSnapshots = await db.select().from(operationalShiftNozzles).where(inArray(operationalShiftNozzles.operationalShiftId, shiftIds));
    const nozzleReadings = await db.select().from(nozzleMeterReadings).where(inArray(nozzleMeterReadings.operationalShiftId, shiftIds));
    const tankSnapshots = await db
      .select()
      .from(operationalShiftTanks)
      .where(inArray(operationalShiftTanks.operationalShiftId, shiftIds));
    const tankReadingsList = await db
      .select()
      .from(tankStockReadings)
      .where(inArray(tankStockReadings.operationalShiftId, shiftIds));

    const cumulativeByProduct = new Map<string, number>();
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    for (let d = new Date(startDateObj); d <= endDateObj; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const dayShifts = shiftsByDate.get(dateStr) || [];
        
        for (const [productId, report] of productMap.entries()) {
          const applicableProductShifts = dayShifts.filter((shift: any) => {
            const shiftId = shift.id;

            return (
              productPrices.some(
                (p: any) =>
                  p.operationalShiftId === shiftId &&
                  p.productId === productId
              ) ||
              nozzleSnapshots.some(
                (n: any) =>
                  n.operationalShiftId === shiftId &&
                  n.productId === productId
              ) ||
              tankSnapshots.some(
                (t: any) =>
                  t.operationalShiftId === shiftId &&
                  t.productId === productId
              ) ||
              stockReconciliations.some(
                (r: any) =>
                  r.operationalShiftId === shiftId &&
                  r.productId === productId
              )
            );
          });

          const earliestApplicableShift =
            applicableProductShifts.length > 0
              ? applicableProductShifts[0]
              : null;

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
              const nozzles = nozzleSnapshots.filter((n: any) => n.operationalShiftId === shift.id && n.productId === productId);
              for (const nozzle of nozzles) {
                  const reading = nozzleReadings.find((r: any) => r.operationalShiftId === shift.id && r.nozzleId === nozzle.nozzleId);
                  if (reading) {
                      grossSalesQuantityMilliunits += reading.grossSalesQuantityMilliunits || 0;
                      netSalesQuantityMilliunits += reading.netSalesQuantityMilliunits || 0;
                      testingQuantityMilliunits += reading.testingQuantityMilliunits || 0;
                  }
              }
          }

          const reconciliations = stockReconciliations.filter((r: any) => applicableProductShifts.some((s: any) => s.id === r.operationalShiftId) && r.productId === productId);

          const openingRecon = reconciliations.filter(
            (r: any) => earliestShiftId !== null && r.operationalShiftId === earliestShiftId
          );

          const closingRecon = reconciliations.filter(
            (r: any) => latestShiftId !== null && r.operationalShiftId === latestShiftId
          );

          const opening = openingRecon.reduce((sum: number, r: any) => sum + r.openingStockMilliunits, 0);

          const closing = closingRecon.reduce((sum: number, r: any) => sum + r.physicalClosingStockMilliunits, 0);

          const receipts = reconciliations.reduce((sum: number, r: any) => sum + r.receiptQuantityMilliunits, 0);

          const theoreticalClosing = closingRecon.reduce((sum: number, r: any) => sum + r.theoreticalClosingStockMilliunits, 0);

          const variance = closingRecon.reduce((sum: number, r: any) => sum + r.varianceMilliunits, 0);

          const previousCumulative = cumulativeByProduct.get(productId) ?? 0;
          const currentCumulative = previousCumulative + netSalesQuantityMilliunits;
          cumulativeByProduct.set(productId, currentCumulative);

          const prices = productPrices.filter((p: any) => applicableProductShifts.some((s: any) => s.id === p.operationalShiftId) && p.productId === productId);
          const uniquePrices = Array.from(new Set(prices.map((p: any) => p.pricePaisePerUnit)));

          const missingFields: string[] = [];
          if (applicableProductShifts.length > 0) {
              if (uniquePrices.length === 0) {
                  missingFields.push("No RSP snapshot");
              }
              if (openingRecon.length === 0) {
                  missingFields.push("No opening tank reading");
              }
              if (closingRecon.length === 0) {
                  missingFields.push("No closing tank reading");
              }
              for (const shift of applicableProductShifts) {
                  const expectedNozzles = nozzleSnapshots.filter(
                    (n: any) =>
                      n.operationalShiftId === shift.id &&
                      n.productId === productId
                  );
                  for (const nozzle of expectedNozzles) {
                      const reading = nozzleReadings.find(
                        (r: any) =>
                          r.operationalShiftId === shift.id &&
                          r.nozzleId === nozzle.nozzleId
                      );
                      if (!reading) {
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
              (r: any) =>
                r.operationalShiftId === shift.id &&
                r.productId === productId &&
                (r.readingType === 'OPENING' || r.readingType === 'CLOSING')
            );

            shiftReadings.sort((a: any, b: any) => {
              const tankA = tankSnapshots.find(
                (t: any) => t.operationalShiftId === shift.id && t.tankId === a.tankId
              )?.tankNumber ?? 0;
              const tankB = tankSnapshots.find(
                (t: any) => t.operationalShiftId === shift.id && t.tankId === b.tankId
              )?.tankNumber ?? 0;
              if (tankA !== tankB) return tankA - tankB;
              if (a.readingType !== b.readingType) {
                return a.readingType === 'OPENING' ? -1 : 1;
              }
              return 0;
            });

            for (const r of shiftReadings) {
              const tankSnap = tankSnapshots.find(
                (t: any) => t.operationalShiftId === shift.id && t.tankId === r.tankId
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
              (n: any) => n.operationalShiftId === shift.id && n.productId === productId
            );

            shiftNozzles.sort((a: any, b: any) => {
              const dispA = Number(a.dispenserNumber) || 0;
              const dispB = Number(b.dispenserNumber) || 0;
              if (dispA !== dispB) return dispA - dispB;
              const nozzA = Number(a.nozzleNumber) || 0;
              const nozzB = Number(b.nozzleNumber) || 0;
              return nozzA - nozzB;
            });

            for (const nozzle of shiftNozzles) {
              const reading = nozzleReadings.find(
                (r: any) =>
                  r.operationalShiftId === shift.id &&
                  r.nozzleId === nozzle.nozzleId
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

          const status =
            applicableProductShifts.length === 0
              ? "NO_ENTRY"
              : missingFields.length > 0
                ? "PARTIAL"
                : "COMPLETE";

          report.rows.push({
              businessDate: dateStr,
              status,
              missingFields,
              shiftsCount: applicableProductShifts.length,
              rspPaise: uniquePrices as number[],
              changedWithinDay: uniquePrices.length > 1,
              tankOpeningStockL: opening / 1000,
              tankClosingStockL: closing / 1000,
              receiptsL: receipts / 1000,
              availableStockL: (opening + receipts) / 1000,
              meterSalesL: netSalesQuantityMilliunits / 1000,
              testingL: testingQuantityMilliunits / 1000,
              grossSalesL: grossSalesQuantityMilliunits / 1000,
              netSalesL: netSalesQuantityMilliunits / 1000,
              dailySalesL: netSalesQuantityMilliunits / 1000,
              cumulativeSalesL: currentCumulative / 1000,
              theoreticalClosingL: theoreticalClosing / 1000,
              physicalClosingL: closing / 1000,
              varianceL: variance / 1000,
              tankReadings: dayTankReadings,
              nozzleReadings: dayNozzleReadings,
          });
        }
    }
    
    for (const report of productMap.values()) {
      let totalMeterSalesL = 0;
      let totalTestingL = 0;
      let totalNetSalesL = 0;
      let totalReceiptsL = 0;
      let totalVarianceL = 0;

      for (const row of report.rows) {
        totalMeterSalesL += row.meterSalesL;
        totalTestingL += row.testingL;
        totalNetSalesL += row.netSalesL;
        totalReceiptsL += row.receiptsL;
      }

      const nonNoEntryRows = report.rows.filter((r: any) => r.status !== "NO_ENTRY");
      if (nonNoEntryRows.length > 0) {
        const latestRow = nonNoEntryRows[nonNoEntryRows.length - 1];
        totalVarianceL = latestRow.varianceL;
      }

      report.totals = {
        totalMeterSalesL,
        totalTestingL,
        totalNetSalesL,
        totalReceiptsL,
        totalVarianceL,
      };
    }

    return Array.from(productMap.values());
  }

  static getEmptyReport(
    outletId: string,
    outletName: string,
    month: string,
    cutoffMode: 'MONTH_END' | 'SELECTED_DATE' | 'LATEST_DATA',
    latestDataDate: string | null
  ): MonthlyOperationsReport {
    return {
      outletId,
      outletName,
      month,
      cutoffMode,
      cutoffDate: '',
      latestDataDate,
      productSections: [],
      dgSection: { rows: [], totals: { totalRunningMinutes: 0, totalRunningHoursStr: '0:00', totalHsdConsumedMilliunits: 0, totalHsdConsumedStr: '0.000', totalAmountPaise: 0, totalAmountStr: '0.00' } },
      dgSummary: { totalLogs: 0, totalRunHours: 0, totalDieselConsumedLitres: 0, averageDailyRunHours: 0, totalGridFailureMinutes: 0, totalRunningMinutes: 0, totalRunningHoursStr: '0:00' },
      fuelSummary: { totalShiftsCount: 0, totalSalesPaise: 0 },
      breakdownSummary: { totalTickets: 0, openTickets: 0, resolvedTickets: 0 },
      hrSummary: { totalStaff: 0, presentDaysCount: 0 },
    };
  }
}
