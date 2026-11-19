# Dealer Master upload: choose real data worksheet automatically

A user received "CUSTCODE and CUSTOMER NAME columns could not be detected" on the live site after selecting an Excel file. The importer had parsed only SheetNames[0]. Inspection of the two files from the user's earlier work shows:
- \`IOCL Dealer Master RO A Site.xlsx\`: data headers on the first sheet (A1:AA132), 131 RO data rows.
- \`IOCL_131_RO_Full_Import_Preflight.xlsx\`: first sheet is an "Import Readiness" summary; the actual 26-column dealer master data is on the *third* sheet, "All 26 Excel Fields" (A1:Z132).

This PR discovers a worksheet with CUSTCODE, CUSTOMER NAME and at least six matching dealer headers, prioritizing all 26 fields, including title rows before the header. It continues to extract source cell values and preserve actual physical Excel row indices. The original format-protection parser now reads the matching worksheet (rather than always first sheet) and excludes header rows.

On failure, the upload UI shows the selected filename and an error listing which worksheets were inspected, instead of a generic format rejection. On success, the selected data sheet and number of ROs are shown.

**Safety:** Read-only full Excel import mode remains locked for database writes. Review workbook exports may not preserve the original yellow styles; use the original workbook for the *previous yellow-protected audit* mode, or rely on the full import mode which includes yellow and non-yellow source fields without colour-based exclusion.

One consolidated GitHub PR to minimize Vercel Free preview builds. No D1 migration, Worker update or data mutation.
