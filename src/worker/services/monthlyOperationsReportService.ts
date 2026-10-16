import {
  MonthlyOperationsReport,
  CutoffMode,
  DailyDgRow,
  DgRunInterval,
  ProductMonthlyReport,
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
          return this.getEmptyReport(outletId, month, cutoffMode, null);
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
          status: 'COMPLETE',
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
    const shiftIds: string[] = shifts.map((s: any) => s.id);
    if (shiftIds.length === 0) {
        return this.getEmptyReport(outletId, month, cutoffMode, null);
    }
    
    // Discover products from historical shifts
    const productSnapshots = await db
      .select({ 
        productId: operationalShiftProductPrices.productId, 
        productCode: operationalShiftProductPrices.productCode, 
        productName: operationalShiftProductPrices.productName 
      })
      .from(operationalShiftProductPrices)
      .where(inArray(operationalShiftProductPrices.operationalShiftId, shiftIds))
      .groupBy(operationalShiftProductPrices.productId);
      
    const productSections: ProductMonthlyReport[] = productSnapshots.map((p: any) => ({
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
        }
    }));
    
    // ... logic to populate dailyRows for each product ...
    // This is too big for a single replacement, I will implement it in sections
    
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

    return {
      outletId,
      outletName: outlet.name,
      month,
      cutoffMode,
      cutoffDate: endDate,
      latestDataDate: logRows.length > 0 ? logRows[logRows.length - 1].businessDate : null,
      productSections: [
        {
          productId: 'placeholder-product-id',
          productCode: 'MS',
          productName: 'Motor Spirit',
          rows: [],
          totals: {
            totalMeterSalesL: 0,
            totalTestingL: 0,
            totalNetSalesL: 0,
            totalReceiptsL: 0,
            totalVarianceL: 0,
          }
        }
      ],
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

  static getEmptyReport(
    outletId: string,
    month: string,
    cutoffMode: 'MONTH_END' | 'SELECTED_DATE' | 'LATEST_DATA',
    latestDataDate: string | null
  ): MonthlyOperationsReport {
    return {
      outletId,
      outletName: 'Unknown',
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
