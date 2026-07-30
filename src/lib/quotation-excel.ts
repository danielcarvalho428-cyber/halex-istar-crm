import type { QuotationSheet } from "./quotation-export";

// Per-brand accent so a Halex Istar and a Medicone proposta are distinguishable
// at a glance without needing any logo artwork in the file.
const BRAND_ACCENT: Record<string, string> = {
  "Halex Istar": "FF8C5A17",
  Medicone: "FF0F4C81",
};
const INK = "FF1C1917";
const MUTED = "FF57534E";
const RULE = "FFD6D3D1";
const ZEBRA = "FFF7F6F4";
const CURRENCY = '"R$" #,##0.00';
const INTEGER = "#,##0";

function accentFor(brand: string) {
  return BRAND_ACCENT[brand] ?? BRAND_ACCENT["Halex Istar"];
}

function thinBorder(color: string) {
  return {
    top: { style: "thin" as const, color: { argb: color } },
    left: { style: "thin" as const, color: { argb: color } },
    bottom: { style: "thin" as const, color: { argb: color } },
    right: { style: "thin" as const, color: { argb: color } },
  };
}

// Builds the styled worksheet for one cotação. Kept separate from the row model
// in quotation-export.ts so that file stays library-free and unit-testable.
export async function buildQuotationWorkbookBlob(sheet: QuotationSheet): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const accent = accentFor(sheet.brand);
  const lastColumn = String.fromCharCode(64 + sheet.columnCount);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = sheet.brand;
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheet.sheetName, {
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: sheet.withPrices ? "landscape" : "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    headerFooter: {
      oddFooter: `&L${sheet.brand} · Proposta comercial&RPágina &P de &N`,
    },
  });
  worksheet.columns = sheet.columnWidths.map((width) => ({ width }));

  let headerRowNumber = 0;
  let itemRowIndex = 0;
  let firstItemRow = 0;
  let lastItemRow = 0;

  for (const row of sheet.rows) {
    switch (row.kind) {
      case "title": {
        const excelRow = worksheet.addRow([row.text]);
        excelRow.height = 30;
        worksheet.mergeCells(`A${excelRow.number}:${lastColumn}${excelRow.number}`);
        const cell = excelRow.getCell(1);
        cell.font = { name: "Calibri", size: 18, bold: true, color: { argb: accent } };
        cell.alignment = { vertical: "middle" };
        break;
      }
      case "subtitle": {
        const excelRow = worksheet.addRow([row.text]);
        excelRow.height = 20;
        worksheet.mergeCells(`A${excelRow.number}:${lastColumn}${excelRow.number}`);
        const cell = excelRow.getCell(1);
        cell.font = { name: "Calibri", size: 11, color: { argb: MUTED } };
        cell.alignment = { vertical: "middle" };
        cell.border = { bottom: { style: "medium", color: { argb: accent } } };
        for (let column = 2; column <= sheet.columnCount; column += 1) {
          excelRow.getCell(column).border = { bottom: { style: "medium", color: { argb: accent } } };
        }
        break;
      }
      case "spacer": {
        worksheet.addRow([]).height = 8;
        break;
      }
      case "section": {
        const excelRow = worksheet.addRow([row.text.toUpperCase()]);
        excelRow.height = 20;
        worksheet.mergeCells(`A${excelRow.number}:${lastColumn}${excelRow.number}`);
        const cell = excelRow.getCell(1);
        cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: accent } };
        cell.alignment = { vertical: "middle" };
        break;
      }
      case "field": {
        const excelRow = worksheet.addRow([row.label, row.value]);
        excelRow.height = 17;
        if (sheet.columnCount > 2) {
          worksheet.mergeCells(`B${excelRow.number}:${lastColumn}${excelRow.number}`);
        }
        const label = excelRow.getCell(1);
        label.font = { name: "Calibri", size: 10, bold: true, color: { argb: MUTED } };
        label.alignment = { vertical: "top" };
        const value = excelRow.getCell(2);
        value.font = { name: "Calibri", size: 10, color: { argb: INK } };
        value.alignment = { vertical: "top", wrapText: true };
        break;
      }
      case "tableHeader": {
        const excelRow = worksheet.addRow(row.cells);
        excelRow.height = 26;
        headerRowNumber = excelRow.number;
        excelRow.eachCell((cell, columnNumber) => {
          cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: accent } };
          cell.alignment = {
            vertical: "middle",
            horizontal: columnNumber === 3 ? "left" : "center",
            wrapText: true,
          };
          cell.border = thinBorder(accent);
        });
        break;
      }
      case "item": {
        const excelRow = worksheet.addRow(row.cells);
        itemRowIndex += 1;
        if (!firstItemRow) firstItemRow = excelRow.number;
        lastItemRow = excelRow.number;
        const zebra = itemRowIndex % 2 === 0;
        excelRow.eachCell((cell, columnNumber) => {
          const zeroBased = columnNumber - 1;
          cell.font = { name: "Calibri", size: 10, color: { argb: INK } };
          cell.border = thinBorder(RULE);
          if (zebra) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
          }
          if (sheet.currencyColumns.includes(zeroBased)) {
            cell.numFmt = CURRENCY;
            cell.alignment = { vertical: "middle", horizontal: "right" };
            if (zeroBased === sheet.columnCount - 1) {
              cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: INK } };
            }
          } else if (typeof cell.value === "number") {
            cell.numFmt = INTEGER;
            cell.alignment = { vertical: "middle", horizontal: "center" };
          } else if (columnNumber === 3) {
            cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
          } else {
            cell.alignment = { vertical: "middle", horizontal: "center" };
          }
        });
        break;
      }
      case "total": {
        const excelRow = worksheet.addRow([]);
        excelRow.height = 24;
        const valueColumn = sheet.columnCount;
        const labelStart = Math.max(1, valueColumn - 3);
        excelRow.getCell(labelStart).value = row.label.toUpperCase();
        excelRow.getCell(valueColumn).value = row.value;
        if (valueColumn - 1 > labelStart) {
          worksheet.mergeCells(
            `${String.fromCharCode(64 + labelStart)}${excelRow.number}:${String.fromCharCode(63 + valueColumn)}${excelRow.number}`,
          );
        }
        for (let column = labelStart; column <= valueColumn; column += 1) {
          const cell = excelRow.getCell(column);
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: accent } };
          cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
          cell.border = thinBorder(accent);
          cell.alignment = {
            vertical: "middle",
            horizontal: column === valueColumn ? "right" : "right",
          };
        }
        excelRow.getCell(valueColumn).numFmt = CURRENCY;
        break;
      }
      case "note": {
        const excelRow = worksheet.addRow([row.text]);
        excelRow.height = 16;
        worksheet.mergeCells(`A${excelRow.number}:${lastColumn}${excelRow.number}`);
        const cell = excelRow.getCell(1);
        cell.font = { name: "Calibri", size: 9, italic: true, color: { argb: MUTED } };
        cell.alignment = { vertical: "middle" };
        break;
      }
    }
  }

  if (headerRowNumber) {
    // No frozen pane on purpose: freezing the header pins the whole title block
    // too, which leaves very little scrollable area. The header is still
    // filterable and is repeated at the top of every printed page.
    if (lastItemRow >= firstItemRow) {
      worksheet.autoFilter = {
        from: { row: headerRowNumber, column: 1 },
        to: { row: lastItemRow, column: sheet.columnCount },
      };
    }
    worksheet.pageSetup.printTitlesRow = `${headerRowNumber}:${headerRowNumber}`;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export async function downloadQuotationSheet(sheet: QuotationSheet) {
  const blob = await buildQuotationWorkbookBlob(sheet);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = sheet.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke late so the download has certainly started (Electron/Chromium).
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
