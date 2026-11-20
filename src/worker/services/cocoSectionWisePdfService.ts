import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import { formatComplianceDateDisplay } from '../../shared/cocoComplianceUtils';
import { sanitizePdfText, wrapPdfText } from './cocoCompliancePdfService';
import type { CocoSectionWiseReport, SectionWiseSection, SectionWiseTable } from './cocoSectionWiseReportService';
import {printableSectionTables} from './cocoSectionWisePdfProjection';

const A4_W = 595.28;
const A4_H = 841.89;
const LEFT = 43;
const WIDTH = A4_W - 2 * LEFT;
const FOOTER_TOP = 55;
const INK = rgb(0.13, 0.15, 0.18);
const BORDER = rgb(0.36, 0.37, 0.39);
const PALE = rgb(0.91, 0.92, 0.94);
const LIGHT = rgb(0.965, 0.97, 0.975);
const GREY = rgb(0.35, 0.39, 0.43);

function fitted(value: string, font: PDFFont, size: number, width: number): string {
  let s = sanitizePdfText(value);
  while (s.length && font.widthOfTextAtSize(s, size) > width) s = s.slice(0, -1);
  return s.length < sanitizePdfText(value).length ? s.slice(0, Math.max(0, s.length - 3)) + '...' : s;
}

export class CocoSectionWisePdfService {
  static async generatePdf(report: CocoSectionWiseReport): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    pdf.setTitle('IOCL - Section-wise Operations and Compliance Report');
    pdf.setAuthor('IOCL Digital Outlet Manager');
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const write = (page: PDFPage, value: string, x: number, y: number,
      size = 7.5, strong = false, color = INK) => {
      page.drawText(sanitizePdfText(value), {
        x, y, font: strong ? bold : font, size, color,
      });
    };
    const line = (page: PDFPage, x: number, y: number, x2: number, y2: number, weight = 0.6) =>
      page.drawLine({ start: { x, y }, end: { x: x2, y: y2 }, thickness: weight, color: BORDER });

    const startPage = (section: SectionWiseSection, continued: boolean, hasEntries: boolean): {
      page: PDFPage; y: number;
    } => {
      const page = pdf.addPage([A4_W, A4_H]);
      const headerTop = A4_H - 28;
      page.drawRectangle({
        x: LEFT, y: headerTop - 64, width: WIDTH, height: 64,
        color: PALE, borderColor: BORDER, borderWidth: 0.85,
      });
      write(page, 'INDIAN OIL CORPORATION LIMITED', LEFT + 10, headerTop - 13, 8.5, true);
      const outletText = report.outletName + ' - ' + report.roCode;
      write(page, fitted(outletText, bold, 12, WIDTH - 160),
        LEFT + 10, headerTop - 32, 12, true);
      write(page, 'COCO statutory documents, dues, maintenance and compliance status register',
        LEFT + 10, headerTop - 49, 7.7);
      const reportDate = formatComplianceDateDisplay(report.reportDate);
      const rightDate = 'Report Date: ' + reportDate;
      write(page, rightDate, LEFT + WIDTH - 10 - bold.widthOfTextAtSize(rightDate, 8.1),
        headerTop - 13, 8.1, true);
      const code = 'RO Code: ' + report.roCode;
      write(page, code, LEFT + WIDTH - 10 - bold.widthOfTextAtSize(code, 7.8),
        headerTop - 29, 7.8, true);

      const y = headerTop - 71;
      page.drawRectangle({
        x: LEFT, y: y - 23, width: WIDTH, height: 23,
        color: rgb(1, 1, 1), borderColor: BORDER, borderWidth: 0.8,
      });
      write(page, fitted(section.title.toUpperCase() + (continued ? ' - CONTINUED' : ''), bold, 8.6, WIDTH - 205),
        LEFT + 9, y - 14.5, 8.6, true);
      if (!continued && hasEntries) {
        const mainRows = printableSectionTables(section)[0]?.rows||[];
        // A clean total avoids repeating "Recorded / Not Recorded"
        // scorecards across the printed report.
        const count = 'Total: ' + mainRows.length;
        const label = fitted(count, font, 7.2, 196);
        write(page, label, LEFT + WIDTH - 8 - font.widthOfTextAtSize(label, 7.2),
          y - 14.5, 7.2);
      }
      // Always print the section page and heading. For sections without
      // saved rows, intentionally leave the content area entirely blank:
      // no totals, explanatory subtitle, empty-table grid or placeholder.
      if (hasEntries) {
        write(page, fitted(section.subtitle, font, 8, WIDTH - 3),
          LEFT + 1, y - 44, 8, false, GREY);
      }
      return { page, y: y - 61 };
    };

    const drawTableTitle = (page: PDFPage, y: number, table: SectionWiseTable, compact = false): number => {
      const height = compact ? 20 : 24;
      page.drawRectangle({
        x: LEFT, y: y - height, width: WIDTH, height,
        color: PALE, borderColor: BORDER, borderWidth: 0.65,
      });
      write(page, fitted(table.title, bold, 9.4, WIDTH - 205),
        LEFT + 9, y - 15.5, 9.4, true);
      const src = fitted('Source: ' + table.source, font, 7.1, 191);
      write(page, src, LEFT + WIDTH - 9 - font.widthOfTextAtSize(src, 7.1),
        y - 15, 7.1, false, GREY);
      return y - height - 3;
    };

    const tableWidths = (table: SectionWiseTable) => {
      const sum = table.widths.reduce((a, b) => a + b, 0);
      return table.widths.map((w) => w * WIDTH / sum);
    };

    const rowHeight = (cells: string[][], header: boolean, compact = false): number => {
      const maxLines = Math.max(...cells.map((x) => x.length), 1);
      return compact
        ? Math.max(header ? 20 : 23, maxLines * (header ? 8.2 : 9.0) + (header ? 9 : 10))
        : Math.max(header ? 24 : 29, maxLines * (header ? 8.2 : 9.0) + (header ? 12 : 18));
    };

    const drawTableRow = (page: PDFPage, y: number, table: SectionWiseTable,
      values: string[], header: boolean, alternate = false, compact = false): number => {
      const widths = tableWidths(table);
      const f = header ? bold : font;
      const size = header ? 6.9 : 7.35;
      const parsed = values.map((value, i) => wrapPdfText(value, i === 1 || header ? bold : f, size, widths[i] - 9));
      const height = rowHeight(parsed, header, compact);
      page.drawRectangle({
        x: LEFT, y: y - height, width: WIDTH, height,
        borderColor: BORDER, borderWidth: 0.55,
        ...(header ? { color: PALE } : alternate ? { color: LIGHT } : {}),
      });
      let x = LEFT;
      for (let i = 0; i < widths.length; i++) {
        if (i) line(page, x, y, x, y - height, 0.4);
        const cellFont = header || i === 1 ? bold : font;
        const cellLines = parsed[i] || [EMPTY_CELL];
        let textY = y - (height - cellLines.length * (header ? 8.2 : 9)) / 2 - 7.3;
        for (const text of cellLines) {
          const centerFirst = i === 0;
          const posX = centerFirst
            ? x + (widths[i] - cellFont.widthOfTextAtSize(text, size)) / 2
            : x + 4.5;
          write(page, text, Math.max(x + 2, posX), textY, size, header || i === 1);
          textY -= header ? 8.2 : 9;
        }
        x += widths[i];
      }
      return y - height;
    };

    const noteBlock = (page: PDFPage, y: number, section: SectionWiseSection): number => {
      const lines = wrapPdfText(section.note, font, 8, WIDTH - 20);
      const height = Math.max(56, 34 + lines.length * 11.5);
      page.drawRectangle({
        x: LEFT, y: y - height, width: WIDTH, height,
        color: LIGHT, borderColor: BORDER, borderWidth: 0.65,
      });
      write(page, section.noteTitle, LEFT + 9, y - 17, 8.5, true);
      lines.forEach((part, i) => write(page, part, LEFT + 9, y - 33 - i * 11.5, 8));
      return y - height;
    };

    for (const section of report.sections) {
      const printableTables=printableSectionTables(section);
      // The agreement section has three linked tables; tighten vertical padding only.
      // Keep font sizes and wrapping unchanged, and allow continuation for larger registers.
      const compact = section.title === 'Lease & Agreements';
      // A new page is retained for every section, including completely empty
      // ones. Blank sections show only the standard report header/section
      // heading and the page footer; populated sections print their records.
      const hasEntries = printableTables.length > 0;
      let { page, y } = startPage(section, false, hasEntries);
      if (!hasEntries) continue;
      for (const table of printableTables) {
        let index = 0;
        const widths = tableWidths(table);
        const headerHeight = rowHeight(table.headers.map((value, i) =>
          wrapPdfText(value, bold, 6.9, widths[i] - 9)), true, compact);
        const firstRowHeight = table.rows.length ? rowHeight(table.rows[0].map((value, i) =>
          wrapPdfText(value, i === 1 ? bold : font, 7.35, widths[i] - 9)), false, compact) : 0;
        if (y - (compact ? 23 : 27) - headerHeight - firstRowHeight < FOOTER_TOP + 35)
          ({ page, y } = startPage(section, true, true));
        y = drawTableTitle(page, y, table, compact);
        y = drawTableRow(page, y, table, table.headers, true, false, compact);
        while (index < table.rows.length) {
          const row = table.rows[index];
          const cellLines = row.map((value, i) =>
            wrapPdfText(value, i === 1 ? bold : font, 7.35, widths[i] - 9));
          const height = rowHeight(cellLines, false, compact);
          if (y - height < FOOTER_TOP + 35) {
            ({ page, y } = startPage(section, true, true));
            y = drawTableTitle(page, y, table, compact);
            y = drawTableRow(page, y, table, table.headers, true, false, compact);
          }
          y = drawTableRow(page, y, table, row, false, index % 2 === 1, compact);
          index++;
        }
        y -= compact ? 8 : 16;
      }
      // The full policy/source notes stay in the on-screen preview, not the concise PDF.
    }

    const pages = pdf.getPages();
    pages.forEach((page, i) => {
      line(page, LEFT, FOOTER_TOP, LEFT + WIDTH, FOOTER_TOP, 0.8);
      write(page, fitted('Generated by: ' + report.generatedBy + '  |  IOCL Digital Outlet Manager',
          font, 7, WIDTH - 80), LEFT, FOOTER_TOP - 10, 7, false, GREY);
      // Keep footer minimal; the report tables themselves retain meaningful
      // operational record statuses, but no repeated missing-data legend.
      const count = 'Page ' + (i + 1) + ' of ' + pages.length;
      write(page, count, LEFT + WIDTH - bold.widthOfTextAtSize(count, 7.5),
        FOOTER_TOP - 10, 7.5, true);
    });
    return pdf.save();
  }
}
const EMPTY_CELL = '-';
