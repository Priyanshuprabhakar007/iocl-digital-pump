import { MonthlyOperationsReport } from '../../shared/types';
import { eq, and, gte, lte } from 'drizzle-orm';
import {
  retailOutlets,
  dgDailyLogs,
  operationalShifts,
  shiftFinancialReconciliations,
  equipmentBreakdownTickets,
  hrAttendanceRecords,
  hrStaff,
} from '../../db/schema';

export class MonthlyOperationsReportService {
  static async generateReport(db: any, outletId: string, month: string): Promise<MonthlyOperationsReport> {
    // 1. Verify outlet
    const outletRows = await db.select().from(retailOutlets).where(eq(retailOutlets.id, outletId)).limit(1);
    if (!outletRows || outletRows.length === 0) {
      throw new Error(`Retail outlet ${outletId} not found`);
    }
    const outlet = outletRows[0];

    // Compute month start and end dates YYYY-MM-01 to YYYY-MM-31
    const startDate = `${month}-01`;
    // Calculate last day of month
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const m = parseInt(monthStr, 10);
    const lastDay = new Date(year, m, 0).getDate();
    const endDate = `${month}-${lastDay.toString().padStart(2, '0')}`;

    // 2. Fetch DG Daily Logs for month
    const dgLogs = await db
      .select()
      .from(dgDailyLogs)
      .where(and(eq(dgDailyLogs.outletId, outletId), gte(dgDailyLogs.logDate, startDate), lte(dgDailyLogs.logDate, endDate)));

    let totalRunHours = 0;
    let totalDieselConsumed = 0;
    let totalUnitsGenerated = 0;
    let totalGridFailureMin = 0;
    let totalPowerCutEvents = 0;

    for (const log of dgLogs) {
      totalRunHours += log.totalRunHours || 0;
      totalDieselConsumed += log.dieselConsumedLitres || 0;
      totalUnitsGenerated += log.unitsGeneratedKwh || 0;
      totalGridFailureMin += log.gridFailureDurationMinutes || 0;
      totalPowerCutEvents += log.powerCutEventsCount || 0;
    }

    const totalLogs = dgLogs.length;
    const avgDailyRunHours = totalLogs > 0 ? totalRunHours / totalLogs : 0;

    // 3. Fetch Operational Shifts & Sales for month
    const shifts = await db
      .select()
      .from(operationalShifts)
      .where(and(eq(operationalShifts.outletId, outletId), gte(operationalShifts.businessDate, startDate), lte(operationalShifts.businessDate, endDate)));

    const shiftIds = shifts.map((s: any) => s.id);
    let totalSalesPaise = 0;

    if (shiftIds.length > 0) {
      const reconRows = await db
        .select()
        .from(shiftFinancialReconciliations)
        .where(and(eq(shiftFinancialReconciliations.outletId, outletId)));

      for (const recon of reconRows) {
        if (shiftIds.includes(recon.shiftId)) {
          totalSalesPaise += recon.authoritativeSalesRevenuePaise || 0;
        }
      }
    }

    // 4. Fetch Equipment Breakdown Tickets for month
    const tickets = await db
      .select()
      .from(equipmentBreakdownTickets)
      .where(and(eq(equipmentBreakdownTickets.outletId, outletId), gte(equipmentBreakdownTickets.createdAt, `${startDate}T00:00:00.000Z`)));

    let openTickets = 0;
    let resolvedTickets = 0;

    for (const ticket of tickets) {
      if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
        resolvedTickets++;
      } else {
        openTickets++;
      }
    }

    // 5. Fetch HR Staff & Attendance
    const staffList = await db.select().from(hrStaff).where(eq(hrStaff.outletId, outletId));
    const attendanceRecords = await db
      .select()
      .from(hrAttendanceRecords)
      .where(and(eq(hrAttendanceRecords.outletId, outletId), gte(hrAttendanceRecords.attendanceDate, startDate), lte(hrAttendanceRecords.attendanceDate, endDate)));

    let presentDays = 0;
    for (const att of attendanceRecords) {
      if (att.status === 'PRESENT') {
        presentDays++;
      }
    }

    return {
      outletId,
      outletName: outlet.name,
      month,
      dgSummary: {
        totalLogs,
        totalRunHours: Number(totalRunHours.toFixed(2)),
        totalDieselConsumedLitres: Number(totalDieselConsumed.toFixed(2)),
        totalUnitsGeneratedKwh: Number(totalUnitsGenerated.toFixed(2)),
        totalGridFailureMinutes: totalGridFailureMin,
        totalPowerCutEvents,
        averageDailyRunHours: Number(avgDailyRunHours.toFixed(2)),
      },
      fuelSummary: {
        totalShiftsCount: shifts.length,
        totalSalesPaise,
      },
      breakdownSummary: {
        totalTickets: tickets.length,
        openTickets,
        resolvedTickets,
      },
      hrSummary: {
        totalStaff: staffList.length,
        presentDaysCount: presentDays,
      },
    };
  }
}
