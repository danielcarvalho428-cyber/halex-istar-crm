// Planilha de reativação: uma aba por carteira, pronta para o vendedor marcar
// quem vale a pena reconquistar. A montagem fica separada do IPC para poder
// ser testada sem abrir janela nenhuma.

const COLUMNS = [
  { header: "Código", key: "codigo", width: 12 },
  { header: "Cliente", key: "cliente", width: 42 },
  { header: "CNPJ", key: "cnpj", width: 20 },
  { header: "Cidade", key: "cidade", width: 18 },
  { header: "UF", key: "uf", width: 6 },
  { header: "Contato", key: "contato", width: 20 },
  { header: "Telefone", key: "telefone", width: 16 },
  { header: "E-mail", key: "email", width: 30 },
  { header: "Situação", key: "situacao", width: 26 },
  { header: "Última compra", key: "ultimaCompra", width: 14 },
  { header: "Dias sem comprar", key: "diasSemComprar", width: 16 },
  { header: "Compras", key: "compras", width: 10 },
  { header: "Total no período", key: "totalPeriodo", width: 18 },
  { header: "Total 12 meses", key: "total12m", width: 16 },
  { header: "Ciclo médio (dias)", key: "cicloMedio", width: 16 },
  { header: "Fora do ciclo", key: "foraDoCiclo", width: 13 },
  { header: "CNPJ baixado", key: "cnpjBaixado", width: 13 },
  { header: "Reconquistar?", key: "reconquistar", width: 15 },
  { header: "Observações", key: "observacoes", width: 40 },
];

const RECONQUEST_COLUMN = COLUMNS.findIndex((column) => column.key === "reconquistar") + 1;
const CHOICES = ["SIM", "NÃO", "TALVEZ"];

function paintHeader(sheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92400E" } };
  header.alignment = { vertical: "middle", horizontal: "left" };
  header.height = 22;
}

/** Builds the workbook in memory; the caller decides where to write it. */
async function buildReactivationWorkbook(sheets, { generatedAt = new Date().toISOString() } = {}) {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Lumina Prisma";
  workbook.created = new Date(generatedAt);

  for (const group of sheets) {
    // Excel refuses sheet names with these characters, and the carteira is
    // free text on the cadastro.
    const name = String(group.carteira || "Sem carteira").replace(/[\\/*?:[\]]/g, "-").slice(0, 31);
    const sheet = workbook.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    sheet.columns = COLUMNS;
    paintHeader(sheet);

    for (const row of group.rows) sheet.addRow(row);

    const lastRow = sheet.rowCount;
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
    sheet.getColumn("totalPeriodo").numFmt = 'R$ #,##0.00';
    sheet.getColumn("total12m").numFmt = 'R$ #,##0.00';

    for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
      const cell = sheet.getRow(rowNumber).getCell(RECONQUEST_COLUMN);
      // A dropdown keeps the answers consistent when the planilha comes back.
      cell.dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`"${CHOICES.join(",")}"`],
      };
      const situacao = String(sheet.getRow(rowNumber).getCell(9).value || "");
      if (situacao.startsWith("Comprando")) {
        sheet.getRow(rowNumber).getCell(9).font = { color: { argb: "FF047857" } };
      } else if (situacao.startsWith("Mais de 2 anos") || situacao.startsWith("Sem compra")) {
        sheet.getRow(rowNumber).getCell(9).font = { color: { argb: "FF9A3412" } };
      }
      if (String(sheet.getRow(rowNumber).getCell(17).value || "") === "SIM") {
        sheet.getRow(rowNumber).getCell(2).font = { strike: true, color: { argb: "FFB91C1C" } };
      }
    }

    if (group.rows.length === 0) {
      sheet.addRow({ cliente: "Nenhum cliente nesta carteira." });
    }
  }

  return workbook;
}

module.exports = { buildReactivationWorkbook, COLUMNS, CHOICES };
