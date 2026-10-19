import { Hono } from "hono";
import { getDb } from "../../db";
import { EnvBindings, requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import { MonthlyOperationsReportQuerySchema } from "../../shared/validators";
import { MonthlyOperationsReportService } from "../services/monthlyOperationsReportService";
import { MonthlyOperationsPdfService } from "../services/monthlyOperationsPdfService";
import { ScopeService } from "../services/scopeService";
import { OutletRepository } from "../repositories/outletRepository";
import { PERMISSIONS } from "../../shared/constants";

export const reportRoutes = new Hono<{ Bindings: EnvBindings }>();

reportRoutes.use("*", requireAuth);

async function extractReportParams(c: any, outletRepo: OutletRepository) {
  let rawOutletId = c.req.param("outletId") || c.req.query("outletId");
  let month = c.req.query("month");
  const year = c.req.query("year");
  let cutoffMode = c.req.query("cutoffMode") || c.req.query("period");
  const cutoffDate = c.req.query("cutoffDate") || c.req.query("date");

  // Normalize month if year and month are supplied separately
  if (year && month && !month.includes("-")) {
    const mNum = parseInt(month, 10);
    if (!isNaN(mNum) && mNum >= 1 && mNum <= 12) {
      month = `${year}-${String(mNum).padStart(2, "0")}`;
    }
  } else if (month && !month.includes("-") && /^\d{1,2}$/.test(month)) {
    const currentYear = year || new Date().getFullYear().toString();
    const mNum = parseInt(month, 10);
    if (!isNaN(mNum) && mNum >= 1 && mNum <= 12) {
      month = `${currentYear}-${String(mNum).padStart(2, "0")}`;
    }
  }

  // Normalize cutoffMode / period
  if (cutoffMode === "complete-month") cutoffMode = "MONTH_END";
  if (cutoffMode === "selected-date") cutoffMode = "SELECTED_DATE";
  if (cutoffMode === "latest-data") cutoffMode = "LATEST_DATA";
  if (!cutoffMode) cutoffMode = "MONTH_END";

  // Resolve outlet ID or roCode if needed
  if (rawOutletId) {
    const outletObj = await outletRepo.findByIdOrCode(rawOutletId);
    if (outletObj) {
      rawOutletId = outletObj.id;
    }
  }

  return {
    outletId: rawOutletId,
    month,
    cutoffMode,
    cutoffDate,
  };
}

const handleMonthlyOperations = async (c: any) => {
  const db = getDb(c.env.DB);
  const userCtx = c.var.user;
  const outletRepo = new OutletRepository(db);

  const rawParams = await extractReportParams(c, outletRepo);

  const parseResult = MonthlyOperationsReportQuerySchema.safeParse(rawParams);
  if (!parseResult.success) {
    return c.json(
      {
        success: false,
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid report parameters.",
          details: parseResult.error.format(),
        },
      },
      400
    );
  }

  if (!(await ScopeService.canAccessOutlet(userCtx, parseResult.data.outletId, outletRepo))) {
    return c.json(
      {
        success: false,
        data: null,
        error: { code: "FORBIDDEN", message: "You do not have access to this outlet" },
      },
      403
    );
  }

  try {
    const report = await MonthlyOperationsReportService.generateReport(
      db,
      parseResult.data.outletId,
      parseResult.data.month,
      parseResult.data.cutoffMode,
      parseResult.data.cutoffDate
    );

    return c.json({
      success: true,
      data: report,
      error: null,
    });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        data: null,
        error: {
          code: "OPERATION_FAILED",
          message: err.message || "Failed to generate monthly operations report",
        },
      },
      400
    );
  }
};

const handleMonthlyOperationsPdf = async (c: any) => {
  const db = getDb(c.env.DB);
  const userCtx = c.var.user;
  const outletRepo = new OutletRepository(db);

  const rawParams = await extractReportParams(c, outletRepo);

  const parseResult = MonthlyOperationsReportQuerySchema.safeParse(rawParams);
  if (!parseResult.success) {
    return c.json(
      {
        success: false,
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid report parameters.",
          details: parseResult.error.format(),
        },
      },
      400
    );
  }

  if (!(await ScopeService.canAccessOutlet(userCtx, parseResult.data.outletId, outletRepo))) {
    return c.json(
      {
        success: false,
        data: null,
        error: { code: "FORBIDDEN", message: "You do not have access to this outlet" },
      },
      403
    );
  }

  try {
    const report = await MonthlyOperationsReportService.generateReport(
      db,
      parseResult.data.outletId,
      parseResult.data.month,
      parseResult.data.cutoffMode,
      parseResult.data.cutoffDate
    );

    const pdfBytes = await MonthlyOperationsPdfService.generatePdf(report);

    return new Response(pdfBytes.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="monthly-operations-${parseResult.data.outletId}-${parseResult.data.month}.pdf"`,
      },
    });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        data: null,
        error: {
          code: "OPERATION_FAILED",
          message: err.message || "Failed to generate monthly operations report PDF",
        },
      },
      400
    );
  }
};

// GET /api/v1/reports/monthly-operations
reportRoutes.get(
  "/reports/monthly-operations",
  requirePermission(PERMISSIONS.REPORTS_READ),
  handleMonthlyOperations
);

// GET /api/v1/outlets/:outletId/reports/monthly-operations
reportRoutes.get(
  "/outlets/:outletId/reports/monthly-operations",
  requirePermission(PERMISSIONS.REPORTS_READ),
  handleMonthlyOperations
);
reportRoutes.get(
  "/:outletId/reports/monthly-operations",
  requirePermission(PERMISSIONS.REPORTS_READ),
  handleMonthlyOperations
);

// GET /api/v1/outlets/:outletId/reports/monthly-operations/pdf
reportRoutes.get(
  "/outlets/:outletId/reports/monthly-operations/pdf",
  requirePermission(PERMISSIONS.REPORTS_GENERATE),
  handleMonthlyOperationsPdf
);
reportRoutes.get(
  "/:outletId/reports/monthly-operations/pdf",
  requirePermission(PERMISSIONS.REPORTS_GENERATE),
  handleMonthlyOperationsPdf
);
