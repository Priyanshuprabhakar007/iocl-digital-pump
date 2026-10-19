import { PDFDocument, StandardFonts, rgb, RGB } from "pdf-lib";
import { MonthlyOperationsReport, ProductMonthlyReport, DailyProductRow, DailyDgRow } from "../../shared/types";

// Page dimensions for A4
const A4_PORTRAIT: [number, number] = [595.28, 841.89];
const A4_LANDSCAPE: [number, number] = [841.89, 595.28];

// Color palette
const COLOR_PRIMARY = rgb(0.08, 0.22, 0.45); // IOCL Navy
const COLOR_SECONDARY = rgb(0.2, 0.3, 0.4);
const COLOR_TEXT = rgb(0.15, 0.15, 0.15);
const COLOR_MUTED = rgb(0.45, 0.45, 0.45);
const COLOR_LIGHT_BG = rgb(0.96, 0.97, 0.98);
const COLOR_HEADER_BG = rgb(0.9, 0.93, 0.96);
const COLOR_LINE = rgb(0.82, 0.84, 0.86);
const COLOR_SUCCESS = rgb(0.12, 0.53, 0.22);
const COLOR_WARNING = rgb(0.72, 0.45, 0.05);

function sanitizeText(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/[₹]/g, "INR ")
    .replace(/[^\x20-\x7E]/g, ""); // Strip non-printable ASCII
}

export class MonthlyOperationsPdfService {
  static async generatePdf(report: MonthlyOperationsReport): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // 1. PAGE 1: REPORT SUMMARY (A4 Portrait)
    this.renderSummaryPage(pdfDoc, report, font, fontBold);

    // 2. PRODUCT REGISTER PAGES (A4 Landscape per product)
    if (report.productSections && report.productSections.length > 0) {
      for (const productSection of report.productSections) {
        this.renderProductSection(pdfDoc, report, productSection, font, fontBold);
      }
    }

    // 3. DG SET LOGBOOK PAGE (A4 Landscape)
    if (report.dgSection && report.dgSection.rows) {
      this.renderDgSection(pdfDoc, report, font, fontBold);
    }

    return await pdfDoc.save();
  }

  // ---------------------------------------------------------------------------
  // 1. SUMMARY PAGE
  // ---------------------------------------------------------------------------
  private static renderSummaryPage(
    pdfDoc: PDFDocument,
    report: MonthlyOperationsReport,
    font: any,
    fontBold: any
  ) {
    const page = pdfDoc.addPage(A4_PORTRAIT);
    const { width, height } = page.getSize();
    let y = height - 50;
    const margin = 50;
    const contentWidth = width - margin * 2;

    // Header Title
    page.drawText("INDIAN OIL CORPORATION LIMITED", {
      x: margin,
      y,
      size: 11,
      font: fontBold,
      color: COLOR_MUTED,
    });
    y -= 18;

    page.drawText("MONTHLY OPERATIONS REGISTER", {
      x: margin,
      y,
      size: 18,
      font: fontBold,
      color: COLOR_PRIMARY,
    });
    y -= 8;

    // Divider Line
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 1.5,
      color: COLOR_PRIMARY,
    });
    y -= 25;

    // Metadata Block (2 Columns)
    const drawMetaRow = (label1: string, val1: string, label2: string, val2: string) => {
      const col2X = margin + contentWidth / 2;
      page.drawText(label1, { x: margin, y, size: 9, font: fontBold, color: COLOR_MUTED });
      page.drawText(sanitizeText(val1), { x: margin + 90, y, size: 9, font, color: COLOR_TEXT });

      if (label2) {
        page.drawText(label2, { x: col2X, y, size: 9, font: fontBold, color: COLOR_MUTED });
        page.drawText(sanitizeText(val2), { x: col2X + 90, y, size: 9, font, color: COLOR_TEXT });
      }
      y -= 16;
    };

    drawMetaRow("Outlet:", report.outletName, "Period (Month):", report.month);
    drawMetaRow("Outlet ID:", report.outletId, "Cutoff Mode:", report.cutoffMode);
    drawMetaRow("Cutoff Date:", report.cutoffDate || "-", "Latest Data Date:", report.latestDataDate || "No Data");

    y -= 15;

    // Helper for summary cards
    const drawCard = (title: string, metrics: Array<[string, string]>) => {
      const cardHeight = 28 + metrics.length * 18;
      page.drawRectangle({
        x: margin,
        y: y - cardHeight,
        width: contentWidth,
        height: cardHeight,
        color: COLOR_LIGHT_BG,
        borderColor: COLOR_LINE,
        borderWidth: 1,
      });

      page.drawText(title.toUpperCase(), {
        x: margin + 12,
        y: y - 18,
        size: 10,
        font: fontBold,
        color: COLOR_PRIMARY,
      });

      let metricY = y - 36;
      for (const [mLabel, mVal] of metrics) {
        page.drawText(mLabel, { x: margin + 12, y: metricY, size: 9, font, color: COLOR_MUTED });
        page.drawText(sanitizeText(mVal), {
          x: margin + contentWidth - 160,
          y: metricY,
          size: 9,
          font: fontBold,
          color: COLOR_TEXT,
        });
        metricY -= 18;
      }

      y -= cardHeight + 15;
    };

    // Fuel Summary Card
    drawCard("Fuel Operations Summary", [
      ["Total Operational Shifts", String(report.fuelSummary?.totalShiftsCount ?? 0)],
      ["Discovered Products Count", String(report.productSections?.length ?? 0)],
    ]);

    // DG Summary Card
    const dgHours = report.dgSummary?.totalRunningHoursStr || "0:00";
    const dgFuel = (report.dgSummary?.totalDieselConsumedLitres ?? 0).toFixed(3) + " L";
    const dgAmount = "INR " + ((report.dgSection?.totals?.totalAmountPaise ?? 0) / 100).toFixed(2);
    drawCard("Diesel Generator (DG) Summary", [
      ["Total Operational DG Logs", String(report.dgSummary?.totalLogs ?? 0)],
      ["Total DG Running Hours", dgHours],
      ["Total Diesel (HSD) Consumed", dgFuel],
      ["Total DG Fuel Expenditure", dgAmount],
    ]);

    // Breakdown Tickets Card
    drawCard("Equipment Breakdown Summary", [
      ["Total Recorded Tickets", String(report.breakdownSummary?.totalTickets ?? 0)],
      ["Open / In-Progress Tickets", String(report.breakdownSummary?.openTickets ?? 0)],
      ["Resolved / Closed Tickets", String(report.breakdownSummary?.resolvedTickets ?? 0)],
    ]);

    // HR Summary Card
    drawCard("Human Resources & Attendance Summary", [
      ["Total Active Outlet Staff", String(report.hrSummary?.totalStaff ?? 0)],
      ["Total Present Man-Days Recorded", String(report.hrSummary?.presentDaysCount ?? 0)],
    ]);

    // Footer
    page.drawText("Generated by IOCL Digital Outlet Manager - Confidential Operations Record", {
      x: margin,
      y: 25,
      size: 8,
      font,
      color: COLOR_MUTED,
    });
  }

  // ---------------------------------------------------------------------------
  // 2. PRODUCT REGISTER SECTION (A4 Landscape)
  // ---------------------------------------------------------------------------
  private static renderProductSection(
    pdfDoc: PDFDocument,
    report: MonthlyOperationsReport,
    product: ProductMonthlyReport,
    font: any,
    fontBold: any
  ) {
    let page = pdfDoc.addPage(A4_LANDSCAPE);
    let { width, height } = page.getSize();
    const margin = 35;
    let y = height - 40;

    // Table Column Definitions
    const cols = [
      { header: "Date", width: 55, align: "left" },
      { header: "Status", width: 55, align: "left" },
      { header: "RSP (INR)", width: 75, align: "right" },
      { header: "Opening (L)", width: 68, align: "right" },
      { header: "Receipts (L)", width: 62, align: "right" },
      { header: "Avail Stock (L)", width: 72, align: "right" },
      { header: "Testing (L)", width: 55, align: "right" },
      { header: "Net Sales (L)", width: 65, align: "right" },
      { header: "Cumulative (L)", width: 75, align: "right" },
      { header: "Closing (L)", width: 68, align: "right" },
      { header: "Variance (L)", width: 60, align: "right" },
    ];

    const drawHeader = (currentPage: any) => {
      currentPage.drawText("MONTHLY PRODUCT REGISTER", {
        x: margin,
        y: height - 28,
        size: 13,
        font: fontBold,
        color: COLOR_PRIMARY,
      });

      const subTitle = `Outlet: ${report.outletName} | Month: ${report.month} | Product: ${product.productCode} - ${product.productName} | Cutoff: ${report.cutoffDate || "-"}`;
      currentPage.drawText(sanitizeText(subTitle), {
        x: margin,
        y: height - 42,
        size: 8.5,
        font,
        color: COLOR_MUTED,
      });

      // Table Header Row
      let headerY = height - 60;
      currentPage.drawRectangle({
        x: margin,
        y: headerY - 14,
        width: width - margin * 2,
        height: 18,
        color: COLOR_HEADER_BG,
      });

      let colX = margin;
      for (const col of cols) {
        currentPage.drawText(col.header, {
          x: col.align === "right" ? colX + col.width - 4 - fontBold.widthOfTextAtSize(col.header, 7.5) : colX + 4,
          y: headerY - 10,
          size: 7.5,
          font: fontBold,
          color: COLOR_SECONDARY,
        });
        colX += col.width;
      }

      return height - 76;
    };

    y = drawHeader(page);

    // Render Daily Product Rows
    for (const row of product.rows) {
      // Calculate row height (increase if there are missing fields notes)
      const hasMissingNotes = row.status === "PARTIAL" && row.missingFields && row.missingFields.length > 0;
      const rowHeight = hasMissingNotes ? 24 : 14;

      if (y - rowHeight < 40) {
        page = pdfDoc.addPage(A4_LANDSCAPE);
        y = drawHeader(page);
      }

      // Alternate background
      page.drawRectangle({
        x: margin,
        y: y - rowHeight + 2,
        width: width - margin * 2,
        height: rowHeight,
        color: row.status === "NO_ENTRY" ? rgb(0.98, 0.98, 0.98) : rgb(1, 1, 1),
        borderColor: COLOR_LINE,
        borderWidth: 0.5,
      });

      // Values
      let rspText = "-";
      if (row.rspPaise && row.rspPaise.length > 0) {
        rspText = row.rspPaise.map((p) => (p / 100).toFixed(2)).join(" / ");
      }

      const isNoEntry = row.status === "NO_ENTRY";
      const rowValues = [
        row.businessDate,
        row.status === "NO_ENTRY" ? "NO ENTRY" : row.status,
        isNoEntry ? "-" : rspText,
        isNoEntry ? "-" : row.tankOpeningStockL.toFixed(3),
        isNoEntry ? "-" : row.receiptsL.toFixed(3),
        isNoEntry ? "-" : row.availableStockL.toFixed(3),
        isNoEntry ? "-" : row.testingL.toFixed(3),
        isNoEntry ? "-" : row.netSalesL.toFixed(3),
        isNoEntry ? "-" : row.cumulativeSalesL.toFixed(3),
        isNoEntry ? "-" : row.physicalClosingL.toFixed(3),
        isNoEntry ? "-" : row.varianceL.toFixed(3),
      ];

      let cellX = margin;
      for (let i = 0; i < cols.length; i++) {
        const col = cols[i];
        const val = rowValues[i];
        const valX =
          col.align === "right"
            ? cellX + col.width - 4 - font.widthOfTextAtSize(val, 7)
            : cellX + 4;

        let textColor = COLOR_TEXT;
        if (i === 1) {
          if (row.status === "COMPLETE") textColor = COLOR_SUCCESS;
          else if (row.status === "PARTIAL") textColor = COLOR_WARNING;
          else textColor = COLOR_MUTED;
        }

        page.drawText(sanitizeText(val), {
          x: valX,
          y: y - 8,
          size: 7,
          font: i === 1 ? fontBold : font,
          color: textColor,
        });

        cellX += col.width;
      }

      if (hasMissingNotes) {
        const noteText = "Missing: " + row.missingFields.join("; ");
        page.drawText(sanitizeText(noteText), {
          x: margin + 120,
          y: y - 19,
          size: 6.5,
          font,
          color: COLOR_WARNING,
        });
      }

      y -= rowHeight;
    }

    // Totals Row
    if (y - 18 < 40) {
      page = pdfDoc.addPage(A4_LANDSCAPE);
      y = drawHeader(page);
    }

    page.drawRectangle({
      x: margin,
      y: y - 16,
      width: width - margin * 2,
      height: 16,
      color: COLOR_HEADER_BG,
      borderColor: COLOR_SECONDARY,
      borderWidth: 0.8,
    });

    page.drawText("PRODUCT TOTALS", {
      x: margin + 6,
      y: y - 11,
      size: 7.5,
      font: fontBold,
      color: COLOR_PRIMARY,
    });

    const totalsValues = [
      { colIdx: 4, val: product.totals.totalReceiptsL.toFixed(3) },
      { colIdx: 6, val: product.totals.totalTestingL.toFixed(3) },
      { colIdx: 7, val: product.totals.totalNetSalesL.toFixed(3) },
      { colIdx: 10, val: product.totals.totalVarianceL.toFixed(3) },
    ];

    for (const t of totalsValues) {
      let offset = 0;
      for (let i = 0; i < t.colIdx; i++) offset += cols[i].width;
      const targetCol = cols[t.colIdx];
      const valX = margin + offset + targetCol.width - 4 - fontBold.widthOfTextAtSize(t.val, 7.5);
      page.drawText(t.val, {
        x: valX,
        y: y - 11,
        size: 7.5,
        font: fontBold,
        color: COLOR_PRIMARY,
      });
    }

    y -= 30;

    // -------------------------------------------------------------------------
    // 3. PRODUCT DETAIL (Tanks & Nozzles readings per active day)
    // -------------------------------------------------------------------------
    const activeRows = product.rows.filter(
      (r) => (r.tankReadings && r.tankReadings.length > 0) || (r.nozzleReadings && r.nozzleReadings.length > 0)
    );

    if (activeRows.length > 0) {
      // Start a fresh page for details to ensure clean spacing
      page = pdfDoc.addPage(A4_LANDSCAPE);
      const detailWidth = width - margin * 2;
      let detailY = height - 40;

      const drawDetailHeader = (currPage: any) => {
        currPage.drawText(`PRODUCT DETAIL: TANK & NOZZLE READINGS (${product.productCode} - ${product.productName})`, {
          x: margin,
          y: height - 28,
          size: 11,
          font: fontBold,
          color: COLOR_PRIMARY,
        });

        currPage.drawText(`Outlet: ${report.outletName} | Month: ${report.month} | Historical Shift Readings`, {
          x: margin,
          y: height - 40,
          size: 8,
          font,
          color: COLOR_MUTED,
        });

        return height - 55;
      };

      detailY = drawDetailHeader(page);

      for (const row of activeRows) {
        // Estimate height needed for this date block
        const tankLines = row.tankReadings?.length || 0;
        const nozzleLines = row.nozzleReadings?.length || 0;
        const blockHeight = 20 + Math.max(tankLines, nozzleLines) * 12 + 10;

        if (detailY - blockHeight < 40) {
          page = pdfDoc.addPage(A4_LANDSCAPE);
          detailY = drawDetailHeader(page);
        }

        // Date Header
        page.drawText(`Business Date: ${row.businessDate}  (Status: ${row.status})`, {
          x: margin,
          y: detailY - 10,
          size: 8.5,
          font: fontBold,
          color: COLOR_SECONDARY,
        });

        let tankY = detailY - 24;
        let nozzY = detailY - 24;

        // Left Column: Tank Readings
        if (row.tankReadings && row.tankReadings.length > 0) {
          page.drawText("Tank Dips & Stock Volume:", {
            x: margin,
            y: tankY,
            size: 7.5,
            font: fontBold,
            color: COLOR_MUTED,
          });
          tankY -= 12;

          for (const t of row.tankReadings) {
            const tText = `Tank ${t.tankNumber} [${t.readingType}]: Dip ${(t.productDipMmMilliunits / 1000).toFixed(1)} mm | Water ${(t.waterDipMmMilliunits / 1000).toFixed(1)} mm | Vol ${(t.netProductVolumeMilliunits / 1000).toFixed(3)} L`;
            page.drawText(sanitizeText(tText), {
              x: margin + 8,
              y: tankY,
              size: 7,
              font,
              color: COLOR_TEXT,
            });
            tankY -= 11;
          }
        }

        // Right Column: Nozzle Readings
        if (row.nozzleReadings && row.nozzleReadings.length > 0) {
          const colRightX = margin + detailWidth / 2;
          page.drawText("Nozzle Meter Readings:", {
            x: colRightX,
            y: nozzY,
            size: 7.5,
            font: fontBold,
            color: COLOR_MUTED,
          });
          nozzY -= 12;

          for (const n of row.nozzleReadings) {
            const openStr = n.openingTotalizerMilliunits != null ? (n.openingTotalizerMilliunits / 1000).toFixed(3) : "NULL";
            const closeStr = n.closingTotalizerMilliunits != null ? (n.closingTotalizerMilliunits / 1000).toFixed(3) : "NULL";
            const netStr = (n.netSalesQuantityMilliunits / 1000).toFixed(3);
            const nText = `DU ${n.dispenserNumber}/N${n.nozzleNumber}: Start ${openStr} -> End ${closeStr} | Net: ${netStr} L`;
            page.drawText(sanitizeText(nText), {
              x: colRightX + 8,
              y: nozzY,
              size: 7,
              font,
              color: COLOR_TEXT,
            });
            nozzY -= 11;
          }
        }

        detailY -= blockHeight;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3. DG SET LOGBOOK (A4 Landscape)
  // ---------------------------------------------------------------------------
  private static renderDgSection(
    pdfDoc: PDFDocument,
    report: MonthlyOperationsReport,
    font: any,
    fontBold: any
  ) {
    let page = pdfDoc.addPage(A4_LANDSCAPE);
    let { width, height } = page.getSize();
    const margin = 35;

    const dgCols = [
      { header: "Date", width: 60, align: "left" },
      { header: "Status", width: 60, align: "left" },
      { header: "Meter From", width: 75, align: "right" },
      { header: "Meter To", width: 75, align: "right" },
      { header: "Running Time", width: 75, align: "right" },
      { header: "HSD Consumed (L)", width: 85, align: "right" },
      { header: "HSD Rate (INR)", width: 75, align: "right" },
      { header: "Amount (INR)", width: 80, align: "right" },
      { header: "Remarks / Intervals", width: 175, align: "left" },
    ];

    const drawDgHeader = (currPage: any) => {
      currPage.drawText("DIESEL GENERATOR (DG) SET LOGBOOK", {
        x: margin,
        y: height - 28,
        size: 13,
        font: fontBold,
        color: COLOR_PRIMARY,
      });

      const subTitle = `Outlet: ${report.outletName} | Month: ${report.month} | Total Run: ${report.dgSummary.totalRunningHoursStr} | Diesel: ${report.dgSummary.totalDieselConsumedLitres.toFixed(3)} L | Cutoff: ${report.cutoffDate || "-"}`;
      currPage.drawText(sanitizeText(subTitle), {
        x: margin,
        y: height - 42,
        size: 8.5,
        font,
        color: COLOR_MUTED,
      });

      let headerY = height - 60;
      currPage.drawRectangle({
        x: margin,
        y: headerY - 14,
        width: width - margin * 2,
        height: 18,
        color: COLOR_HEADER_BG,
      });

      let colX = margin;
      for (const col of dgCols) {
        currPage.drawText(col.header, {
          x: col.align === "right" ? colX + col.width - 4 - fontBold.widthOfTextAtSize(col.header, 7.5) : colX + 4,
          y: headerY - 10,
          size: 7.5,
          font: fontBold,
          color: COLOR_SECONDARY,
        });
        colX += col.width;
      }

      return height - 76;
    };

    let y = drawDgHeader(page);

    for (const row of report.dgSection.rows) {
      // Build intervals string if present
      let intervalStr = "";
      if (row.intervals && row.intervals.length > 0) {
        intervalStr = row.intervals.map((i) => `${i.startTime}-${i.endTime}`).join(", ");
      }
      if (row.remarks) {
        intervalStr = intervalStr ? `${intervalStr} (${row.remarks})` : row.remarks;
      }

      const rowHeight = 14;
      if (y - rowHeight < 40) {
        page = pdfDoc.addPage(A4_LANDSCAPE);
        y = drawDgHeader(page);
      }

      page.drawRectangle({
        x: margin,
        y: y - rowHeight + 2,
        width: width - margin * 2,
        height: rowHeight,
        color: row.status === "NO_ENTRY" ? rgb(0.98, 0.98, 0.98) : rgb(1, 1, 1),
        borderColor: COLOR_LINE,
        borderWidth: 0.5,
      });

      const isNoEntry = row.status === "NO_ENTRY";
      const rowValues = [
        row.businessDate,
        row.status === "NO_ENTRY" ? "NO ENTRY" : row.status,
        isNoEntry || !row.meterReadingFromStr ? "-" : row.meterReadingFromStr,
        isNoEntry || !row.meterReadingToStr ? "-" : row.meterReadingToStr,
        isNoEntry ? "-" : row.totalRunningHoursStr,
        isNoEntry ? "-" : row.hsdConsumedStr,
        isNoEntry || !row.hsdRateStr ? "-" : row.hsdRateStr,
        isNoEntry || !row.amountStr ? "-" : row.amountStr,
        sanitizeText(intervalStr) || "-",
      ];

      let cellX = margin;
      for (let i = 0; i < dgCols.length; i++) {
        const col = dgCols[i];
        const val = rowValues[i];
        const valX =
          col.align === "right"
            ? cellX + col.width - 4 - font.widthOfTextAtSize(val, 7)
            : cellX + 4;

        let textColor = COLOR_TEXT;
        if (i === 1) {
          if (row.status === "COMPLETE") textColor = COLOR_SUCCESS;
          else if (row.status === "PARTIAL") textColor = COLOR_WARNING;
          else textColor = COLOR_MUTED;
        }

        page.drawText(val, {
          x: valX,
          y: y - 8,
          size: 7,
          font: i === 1 ? fontBold : font,
          color: textColor,
        });

        cellX += col.width;
      }

      y -= rowHeight;
    }

    // DG Totals Row
    if (y - 18 < 40) {
      page = pdfDoc.addPage(A4_LANDSCAPE);
      y = drawDgHeader(page);
    }

    page.drawRectangle({
      x: margin,
      y: y - 16,
      width: width - margin * 2,
      height: 16,
      color: COLOR_HEADER_BG,
      borderColor: COLOR_SECONDARY,
      borderWidth: 0.8,
    });

    page.drawText("DG TOTALS", {
      x: margin + 6,
      y: y - 11,
      size: 7.5,
      font: fontBold,
      color: COLOR_PRIMARY,
    });

    // Running Time: colIdx 4
    // HSD Consumed: colIdx 5
    // Amount: colIdx 7
    const dgTotals = [
      { colIdx: 4, val: report.dgSection.totals.totalRunningHoursStr },
      { colIdx: 5, val: report.dgSection.totals.totalHsdConsumedStr },
      { colIdx: 7, val: report.dgSection.totals.totalAmountStr },
    ];

    for (const t of dgTotals) {
      let offset = 0;
      for (let i = 0; i < t.colIdx; i++) offset += dgCols[i].width;
      const targetCol = dgCols[t.colIdx];
      const valX = margin + offset + targetCol.width - 4 - fontBold.widthOfTextAtSize(t.val, 7.5);
      page.drawText(t.val, {
        x: valX,
        y: y - 11,
        size: 7.5,
        font: fontBold,
        color: COLOR_PRIMARY,
      });
    }
  }
}
