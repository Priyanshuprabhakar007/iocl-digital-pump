import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import {
  CocoOnePagerReport,
  CocoOnePagerRow,
  formatComplianceDateDisplay,
} from '../../shared/cocoComplianceUtils';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_X = 28;
const MARGIN_TOP = 28;
const MARGIN_BOTTOM = 32;
const CONTENT_WIDTH = A4_WIDTH - MARGIN_X * 2; // 539.28 pt

// Black-and-white friendly palette for crisp laser/inkjet printing
const COLOR_BLACK = rgb(0.05, 0.05, 0.05);
const COLOR_DARK_GRAY = rgb(0.22, 0.22, 0.22);
const COLOR_MUTED_GRAY = rgb(0.38, 0.38, 0.38);
const COLOR_BORDER = rgb(0.18, 0.18, 0.18);
const COLOR_INNER_GRID = rgb(0.55, 0.55, 0.55);
const COLOR_HEADER_FILL = rgb(0.9, 0.91, 0.93);
const COLOR_ZEBRA_FILL = rgb(0.97, 0.97, 0.98);
const COLOR_ALERT_FILL = rgb(0.94, 0.94, 0.94);

/**
 * Replaces non-WinAnsi characters (like ₹, •, —) with safe printable ASCII equivalents
 * so StandardFonts.Helvetica never throws an encoding error.
 */
export function sanitizePdfText(input: string | null | undefined): string {
  if (!input) return '';
  return String(input)
    .replace(/₹/g, 'Rs. ')
    .replace(/[•·]/g, '-')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, '');
}

/**
 * Word-wraps text to fit within maxWidth at fontSize.
 * Also splits single overly-long tokens so text never overflows horizontally.
 */
export function wrapPdfText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const clean = sanitizePdfText(text).trim();
  if (!clean) return ['-'];

  const breakLongWord = (word: string): string[] => {
    if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
      return [word];
    }
    const chunks: string[] = [];
    let current = '';
    for (const ch of word) {
      const candidate = current + ch;
      if (font.widthOfTextAtSize(candidate, fontSize) > maxWidth && current.length > 0) {
        chunks.push(current);
        current = ch;
      } else {
        current = candidate;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  };

  const rawWords = clean.split(/\s+/);
  const words = rawWords.flatMap(breakLongWord);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (font.widthOfTextAtSize(testLine, fontSize) <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : ['-'];
}

interface ColumnSpec {
  key: string;
  header: string;
  width: number;
  align: 'left' | 'center' | 'right';
}

const ONE_PAGER_COLUMNS: readonly ColumnSpec[] = [
  { key: 'srNo', header: 'Sr. No.', width: 32, align: 'center' },
  { key: 'particular', header: 'Particular', width: 118, align: 'left' },
  { key: 'statusYesNo', header: 'Status (Yes/No)', width: 58, align: 'center' },
  { key: 'validityDueDate', header: 'Validity / Due Date', width: 78, align: 'center' },
  { key: 'amountInr', header: 'Amount (Rs.)', width: 66, align: 'right' },
  { key: 'frequency', header: 'Frequency', width: 58, align: 'center' },
  { key: 'remarks', header: 'Remarks / Action Required', width: 129.28, align: 'left' },
];

export class CocoCompliancePdfService {
  static async generateOnePagerPdf(report: CocoOnePagerReport): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page1 = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    let cursorY = A4_HEIGHT - MARGIN_TOP;

    // =========================================================================
    // 1. HEADER BLOCK (Print-friendly B&W with double border)
    // =========================================================================
    const headerBoxHeight = 56;
    page1.drawRectangle({
      x: MARGIN_X,
      y: cursorY - headerBoxHeight,
      width: CONTENT_WIDTH,
      height: headerBoxHeight,
      color: COLOR_HEADER_FILL,
      borderColor: COLOR_BORDER,
      borderWidth: 1.2,
    });

    page1.drawText('INDIAN OIL CORPORATION LIMITED', {
      x: MARGIN_X + 10,
      y: cursorY - 15,
      size: 9,
      font: fontBold,
      color: COLOR_DARK_GRAY,
    });

    const reportDateFormatted = formatComplianceDateDisplay(report.reportDate, report.reportDate);
    const rightHeaderLabel = sanitizePdfText(`Report Date: ${reportDateFormatted}`);
    const rightHeaderWidth = fontBold.widthOfTextAtSize(rightHeaderLabel, 9.5);
    page1.drawText(rightHeaderLabel, {
      x: MARGIN_X + CONTENT_WIDTH - rightHeaderWidth - 10,
      y: cursorY - 15,
      size: 9.5,
      font: fontBold,
      color: COLOR_BLACK,
    });

    const outletTitle = sanitizePdfText(`${report.outletName} - ${report.roCode}`);
    page1.drawText(outletTitle, {
      x: MARGIN_X + 10,
      y: cursorY - 32,
      size: 13.5,
      font: fontBold,
      color: COLOR_BLACK,
    });

    page1.drawText('COCO statutory documents, utility dues, maintenance & compliance status register', {
      x: MARGIN_X + 10,
      y: cursorY - 47,
      size: 8.2,
      font: fontRegular,
      color: COLOR_DARK_GRAY,
    });

    const roBadgeText = sanitizePdfText(`RO Code: ${report.roCode}`);
    const roBadgeW = fontBold.widthOfTextAtSize(roBadgeText, 8.5);
    page1.drawText(roBadgeText, {
      x: MARGIN_X + CONTENT_WIDTH - roBadgeW - 10,
      y: cursorY - 32,
      size: 8.5,
      font: fontBold,
      color: COLOR_DARK_GRAY,
    });

    cursorY -= headerBoxHeight + 6;

    // =========================================================================
    // 2. COMPLIANCE SUMMARY STRIP
    // =========================================================================
    const summaryHeight = 20;
    page1.drawRectangle({
      x: MARGIN_X,
      y: cursorY - summaryHeight,
      width: CONTENT_WIDTH,
      height: summaryHeight,
      borderColor: COLOR_BORDER,
      borderWidth: 0.8,
    });

    const s = report.summary;
    const summaryLine = sanitizePdfText(
      `Summary (As of ${reportDateFormatted}):   Valid: ${s.validCount}   |   Expiring Soon: ${s.expiringSoonCount}   |   Expired: ${s.expiredCount}   |   Payment Pending: ${s.paymentPendingCount}   |   Action Required: ${s.actionRequiredCount}   |   Not Recorded: ${s.notRecordedCount}`
    );
    page1.drawText(summaryLine, {
      x: MARGIN_X + 8,
      y: cursorY - 13,
      size: 7.8,
      font: fontBold,
      color: COLOR_BLACK,
    });

    cursorY -= summaryHeight + 6;

    // =========================================================================
    // 3. 14-CATEGORY TABLE HEADER
    // =========================================================================
    const drawTableHeader = (page: PDFPage, topY: number): number => {
      const thHeight = 24;
      page.drawRectangle({
        x: MARGIN_X,
        y: topY - thHeight,
        width: CONTENT_WIDTH,
        height: thHeight,
        color: COLOR_HEADER_FILL,
        borderColor: COLOR_BORDER,
        borderWidth: 1,
      });

      let colX = MARGIN_X;
      for (let i = 0; i < ONE_PAGER_COLUMNS.length; i++) {
        const col = ONE_PAGER_COLUMNS[i];
        if (i > 0) {
          page.drawLine({
            start: { x: colX, y: topY },
            end: { x: colX, y: topY - thHeight },
            thickness: 0.7,
            color: COLOR_BORDER,
          });
        }

        const headerLines = wrapPdfText(col.header, fontBold, 7.8, col.width - 6);
        const lineSpacing = 9;
        const blockHeight = headerLines.length * lineSpacing;
        let lineY = topY - (thHeight - blockHeight) / 2 - 7;

        for (const hl of headerLines) {
          const tw = fontBold.widthOfTextAtSize(hl, 7.8);
          let tx = colX + 4;
          if (col.align === 'center') {
            tx = colX + (col.width - tw) / 2;
          } else if (col.align === 'right') {
            tx = colX + col.width - tw - 4;
          }
          page.drawText(hl, {
            x: tx,
            y: lineY,
            size: 7.8,
            font: fontBold,
            color: COLOR_BLACK,
          });
          lineY -= lineSpacing;
        }

        colX += col.width;
      }

      return topY - thHeight;
    };

    cursorY = drawTableHeader(page1, cursorY);

    // =========================================================================
    // 4. 14 STANDARD ROWS (Guaranteed to fit on Page 1 without clipping)
    // =========================================================================
    const footerReserveHeight = 42;
    const availableTableHeight = cursorY - (MARGIN_BOTTOM + footerReserveHeight);
    const fontSizeCell = 7.6;
    const lineHeight = 9.2;
    const cellPaddingY = 4.5;

    // Pre-wrap all 14 rows; if total height exceeds availableTableHeight, cap remarks on Page 1 to 3 lines
    // and place full extended remarks in an Annex page so no text is ever clipped!
    const annexItems: Array<{ srNo: number; particular: string; fullRemarks: string }> = [];

    const prepareWrappedRow = (row: CocoOnePagerRow, maxRemarkLines: number) => {
      const srLines = [String(row.srNo)];
      const particularLines = wrapPdfText(row.particular, fontBold, fontSizeCell, ONE_PAGER_COLUMNS[1].width - 8);
      const statusLines = wrapPdfText(row.statusYesNoDisplay, fontBold, fontSizeCell, ONE_PAGER_COLUMNS[2].width - 6);
      const validityLines = wrapPdfText(row.validityDueDateDisplay, fontRegular, fontSizeCell, ONE_PAGER_COLUMNS[3].width - 6);
      const amountLines = wrapPdfText(row.amountInrDisplay, fontRegular, fontSizeCell, ONE_PAGER_COLUMNS[4].width - 8);
      const freqLines = wrapPdfText(row.frequencyDisplay, fontRegular, fontSizeCell, ONE_PAGER_COLUMNS[5].width - 6);
      let remarkLines = wrapPdfText(row.remarksActionRequiredDisplay, fontRegular, fontSizeCell, ONE_PAGER_COLUMNS[6].width - 8);

      let truncatedToAnnex = false;
      if (remarkLines.length > maxRemarkLines) {
        truncatedToAnnex = true;
        const kept = remarkLines.slice(0, Math.max(1, maxRemarkLines - 1));
        kept.push('[See Annex Page 2]');
        remarkLines = kept;
      }

      const maxLines = Math.max(
        srLines.length,
        particularLines.length,
        statusLines.length,
        validityLines.length,
        amountLines.length,
        freqLines.length,
        remarkLines.length,
        1
      );

      const rowHeight = Math.max(22, maxLines * lineHeight + cellPaddingY * 2);

      return {
        row,
        cells: [srLines, particularLines, statusLines, validityLines, amountLines, freqLines, remarkLines],
        rowHeight,
        truncatedToAnnex,
      };
    };

    // First try up to 4 lines per cell on Page 1; if total > availableTableHeight, tighten to 3 or 2 lines
    let maxRemarkLinesAllowed = 4;
    let preparedRows = report.rows.map((r) => prepareWrappedRow(r, maxRemarkLinesAllowed));
    let totalHeight = preparedRows.reduce((acc, r) => acc + r.rowHeight, 0);

    while (totalHeight > availableTableHeight && maxRemarkLinesAllowed > 2) {
      maxRemarkLinesAllowed--;
      preparedRows = report.rows.map((r) => prepareWrappedRow(r, maxRemarkLinesAllowed));
      totalHeight = preparedRows.reduce((acc, r) => acc + r.rowHeight, 0);
    }

    // If totalHeight is well below availableTableHeight, distribute extra vertical breathing room evenly
    const extraPerRow =
      preparedRows.length > 0 && totalHeight < availableTableHeight - 28
        ? Math.min(8, Math.floor((availableTableHeight - totalHeight) / preparedRows.length))
        : 0;

    for (let idx = 0; idx < preparedRows.length; idx++) {
      const pr = preparedRows[idx];
      const rowH = pr.rowHeight + extraPerRow;

      if (pr.truncatedToAnnex) {
        annexItems.push({
          srNo: pr.row.srNo,
          particular: pr.row.particular,
          fullRemarks: pr.row.remarksActionRequiredDisplay,
        });
      }

      const isAttentionRow =
        pr.row.complianceStatus === 'EXPIRED' ||
        pr.row.complianceStatus === 'PAYMENT_PENDING' ||
        pr.row.complianceStatus === 'ACTION_REQUIRED';

      const bgFill = isAttentionRow
        ? COLOR_ALERT_FILL
        : idx % 2 === 1
        ? COLOR_ZEBRA_FILL
        : undefined;

      page1.drawRectangle({
        x: MARGIN_X,
        y: cursorY - rowH,
        width: CONTENT_WIDTH,
        height: rowH,
        color: bgFill,
        borderColor: COLOR_INNER_GRID,
        borderWidth: 0.6,
      });

      let colX = MARGIN_X;
      for (let cIdx = 0; cIdx < ONE_PAGER_COLUMNS.length; cIdx++) {
        const col = ONE_PAGER_COLUMNS[cIdx];
        if (cIdx > 0) {
          page1.drawLine({
            start: { x: colX, y: cursorY },
            end: { x: colX, y: cursorY - rowH },
            thickness: 0.5,
            color: COLOR_INNER_GRID,
          });
        }

        const cellLines = pr.cells[cIdx];
        const cellFont = cIdx === 1 || cIdx === 2 ? fontBold : fontRegular;
        const blockH = cellLines.length * lineHeight;
        let textY = cursorY - (rowH - blockH) / 2 - (fontSizeCell - 0.5);

        for (const cl of cellLines) {
          const cleanLine = sanitizePdfText(cl);
          const tw = cellFont.widthOfTextAtSize(cleanLine, fontSizeCell);
          let tx = colX + 4;
          if (col.align === 'center') {
            tx = colX + (col.width - tw) / 2;
          } else if (col.align === 'right') {
            tx = colX + col.width - tw - 4;
          }
          page1.drawText(cleanLine, {
            x: Math.max(colX + 2, tx),
            y: textY,
            size: fontSizeCell,
            font: cellFont,
            color: COLOR_BLACK,
          });
          textY -= lineHeight;
        }

        colX += col.width;
      }

      cursorY -= rowH;
    }

    // Outer table border for crisp print look
    page1.drawRectangle({
      x: MARGIN_X,
      y: cursorY,
      width: CONTENT_WIDTH,
      height: A4_HEIGHT - MARGIN_TOP - headerBoxHeight - 6 - summaryHeight - 6 - cursorY,
      borderColor: COLOR_BORDER,
      borderWidth: 1.1,
    });

    // =========================================================================
    // 5. OPTIONAL ANNEX PAGE (Only when extended remarks or custom categories exist)
    // =========================================================================
    if (annexItems.length > 0 || report.customRows.length > 0) {
      const annexPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
      let annexY = A4_HEIGHT - MARGIN_TOP;

      annexPage.drawText(
        sanitizePdfText(`ANNEXURE - EXTENDED COMPLIANCE REMARKS & CUSTOM CATEGORIES (${report.outletName} - ${report.roCode})`),
        {
          x: MARGIN_X,
          y: annexY - 14,
          size: 11,
          font: fontBold,
          color: COLOR_BLACK,
        }
      );
      annexY -= 26;

      if (annexItems.length > 0) {
        annexPage.drawText('Extended Remarks for Standard Categories:', {
          x: MARGIN_X,
          y: annexY,
          size: 9.5,
          font: fontBold,
          color: COLOR_DARK_GRAY,
        });
        annexY -= 14;

        for (const item of annexItems) {
          const lines = wrapPdfText(
            `#${item.srNo} ${item.particular}: ${item.fullRemarks}`,
            fontRegular,
            8.2,
            CONTENT_WIDTH - 12
          );
          for (const ln of lines) {
            if (annexY < MARGIN_BOTTOM + 40) break;
            annexPage.drawText(ln, {
              x: MARGIN_X + 6,
              y: annexY,
              size: 8.2,
              font: fontRegular,
              color: COLOR_BLACK,
            });
            annexY -= 11;
          }
          annexY -= 4;
        }
      }

      if (report.customRows.length > 0 && annexY > MARGIN_BOTTOM + 80) {
        annexY -= 8;
        annexPage.drawText('Additional Outlet-Specific Custom Categories:', {
          x: MARGIN_X,
          y: annexY,
          size: 9.5,
          font: fontBold,
          color: COLOR_DARK_GRAY,
        });
        annexY -= 8;
        annexY = drawTableHeader(annexPage, annexY);

        for (const cRow of report.customRows) {
          const pr = prepareWrappedRow(cRow, 6);
          if (annexY - pr.rowHeight < MARGIN_BOTTOM + 36) break;

          annexPage.drawRectangle({
            x: MARGIN_X,
            y: annexY - pr.rowHeight,
            width: CONTENT_WIDTH,
            height: pr.rowHeight,
            borderColor: COLOR_INNER_GRID,
            borderWidth: 0.6,
          });

          let colX = MARGIN_X;
          for (let cIdx = 0; cIdx < ONE_PAGER_COLUMNS.length; cIdx++) {
            const col = ONE_PAGER_COLUMNS[cIdx];
            const cellLines = pr.cells[cIdx];
            const cellFont = cIdx === 1 || cIdx === 2 ? fontBold : fontRegular;
            let textY = annexY - 11;
            for (const cl of cellLines) {
              const cleanLine = sanitizePdfText(cl);
              const tw = cellFont.widthOfTextAtSize(cleanLine, fontSizeCell);
              let tx = colX + 4;
              if (col.align === 'center') tx = colX + (col.width - tw) / 2;
              else if (col.align === 'right') tx = colX + col.width - tw - 4;
              annexPage.drawText(cleanLine, {
                x: Math.max(colX + 2, tx),
                y: textY,
                size: fontSizeCell,
                font: cellFont,
                color: COLOR_BLACK,
              });
              textY -= lineHeight;
            }
            colX += col.width;
          }
          annexY -= pr.rowHeight;
        }
      }
    }

    // =========================================================================
    // 6. FOOTER METADATA ON ALL PAGES
    // =========================================================================
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;
    const generatedAtClean = sanitizePdfText(
      report.generatedAt.replace('T', ' ').slice(0, 19) + ' UTC'
    );
    const generatedByClean = sanitizePdfText(report.generatedBy);

    for (let i = 0; i < totalPages; i++) {
      const p = pages[i];
      const footerTopY = MARGIN_BOTTOM + 22;

      p.drawLine({
        start: { x: MARGIN_X, y: footerTopY },
        end: { x: MARGIN_X + CONTENT_WIDTH, y: footerTopY },
        thickness: 0.7,
        color: COLOR_BORDER,
      });

      p.drawText(
        `Generated by: ${generatedByClean}   |   Generated at: ${generatedAtClean}`,
        {
          x: MARGIN_X,
          y: footerTopY - 11,
          size: 7.5,
          font: fontRegular,
          color: COLOR_DARK_GRAY,
        }
      );

      p.drawText(
        'Generated by IOCL Digital Outlet Manager - Confidential COCO Compliance Record (Missing entries are marked "Not Recorded")',
        {
          x: MARGIN_X,
          y: footerTopY - 21,
          size: 7,
          font: fontRegular,
          color: COLOR_MUTED_GRAY,
        }
      );

      const pageBadge = `Page ${i + 1} of ${totalPages}`;
      const pbWidth = fontBold.widthOfTextAtSize(pageBadge, 7.8);
      p.drawText(pageBadge, {
        x: MARGIN_X + CONTENT_WIDTH - pbWidth,
        y: footerTopY - 11,
        size: 7.8,
        font: fontBold,
        color: COLOR_BLACK,
      });
    }

    return await pdfDoc.save();
  }
}
