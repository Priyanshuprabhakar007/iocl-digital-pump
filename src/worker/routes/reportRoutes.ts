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

const handleMonthlyOperations = async (c: any) => {
  const db = getDb(c.env.DB);
  const userCtx = c.var.user;
  const outletId = c.req.query("outletId") || c.req.param("outletId");
  const month = c.req.query("month");
  const cutoffMode = c.req.query("cutoffMode");
  const cutoffDate = c.req.query("cutoffDate");

  const parseResult = MonthlyOperationsReportQuerySchema.safeParse({ outletId, month, cutoffMode, cutoffDate });
  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid report parameters.",
        details: parseResult.error.format(),
      },
    }, 400);
  }

  const outletRepo = new OutletRepository(db);
  if (!await ScopeService.canAccessOutlet(userCtx, parseResult.data.outletId, outletRepo)) {
    return c.json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "You do not have access to this outlet" },
    }, 403);
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
    return c.json({
      success: false,
      data: null,
      error: {
        code: "OPERATION_FAILED",
        message: err.message || "Failed to generate monthly operations report",
      },
    }, 400);
  }
};

const handleMonthlyOperationsPdf = async (c: any) => {
  const db = getDb(c.env.DB);
  const userCtx = c.var.user;
  const outletId = c.req.param("outletId");

  const outletRepo = new OutletRepository(db);
  if (!outletId || !(await ScopeService.canAccessOutlet(userCtx, outletId, outletRepo))) {
    return c.json(
      {
        success: false,
        data: null,
        error: { code: "FORBIDDEN", message: "You do not have access to this outlet" },
      },
      403
    );
  }

  const month = c.req.query("month");
  const cutoffMode = c.req.query("cutoffMode");
  const cutoffDate = c.req.query("cutoffDate");

  const parseResult = MonthlyOperationsReportQuerySchema.safeParse({
    outletId,
    month,
    cutoffMode,
    cutoffDate,
  });
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

// GET /api/v1/reports/monthly-operations?outletId=...&month=...
reportRoutes.get("/reports/monthly-operations", requirePermission(PERMISSIONS.REPORTS_READ), handleMonthlyOperations);

// GET /api/v1/outlets/:outletId/reports/monthly-operations?month=...
reportRoutes.get("/outlets/:outletId/reports/monthly-operations", requirePermission(PERMISSIONS.REPORTS_READ), handleMonthlyOperations);

// GET /api/v1/outlets/:outletId/reports/monthly-operations/pdf
reportRoutes.get(
  "/outlets/:outletId/reports/monthly-operations/pdf",
  requirePermission(PERMISSIONS.REPORTS_GENERATE),
  handleMonthlyOperationsPdf
);
