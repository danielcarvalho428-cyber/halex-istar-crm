import assert from "node:assert/strict";
import test from "node:test";
import { buildQuotationSheet, type QuotationExportInput } from "./quotation-export.ts";

const base: QuotationExportInput = {
  brand: "Halex Istar",
  quoteNumber: "HI-2607-1",
  client: { name: "Hospital Santa Casa", cnpj: "12.345.678/0001-90", city: "Goiânia", state: "GO" },
  issuedAt: "2026-07-30",
  validUntil: "2026-08-14",
  validDays: 15,
  payment: "30/45/60 Dias",
  delivery: "10 dias úteis",
  freight: "CIF",
  seller: "Paulo Roberto",
  representativePhone: "(62) 90000-0000",
  representativeEmail: "paulo@halexistar.com.br",
  items: [
    {
      code: "200",
      description: "Glicose 5%",
      packSize: 30,
      quantityMode: "boxes",
      quantity: 2,
      unitPrice: 10,
    },
    {
      code: "100",
      description: "Água para Injeção",
      packSize: 100,
      quantityMode: "units",
      quantity: 1,
      unitQuantity: 100,
      unitPrice: 1.5,
    },
  ],
};

function itemRows(sheet: ReturnType<typeof buildQuotationSheet>) {
  return sheet.rows.filter((row) => row.kind === "item");
}

test("item rows mirror the printed table: box price is per box, unit price per unit", () => {
  const sheet = buildQuotationSheet(base);
  const rows = itemRows(sheet);
  assert.equal(rows.length, 2);
  // Item, Código, Produto, Marca, Un./cx, Qtd. cx, Qtd. un, unit, total
  assert.deepEqual(rows[0].cells, [1, "200", "Glicose 5%", "Halex Istar", 30, 2, 60, 300, 600]);
  assert.deepEqual(rows[1].cells, [2, "100", "Água para Injeção", "Halex Istar", 100, 1, 100, 1.5, 150]);
  assert.equal(sheet.total, 750);
  assert.equal(sheet.itemCount, 2);
});

test("the total row matches the sum of the line totals", () => {
  const sheet = buildQuotationSheet(base);
  const total = sheet.rows.find((row) => row.kind === "total");
  assert.ok(total && total.kind === "total");
  assert.equal(total.value, 750);
});

test("hiding prices drops the money and quantity columns entirely", () => {
  const sheet = buildQuotationSheet({ ...base, hidePrices: true, minimumBilling: 5000 });
  assert.equal(sheet.withPrices, false);
  assert.equal(sheet.columnCount, 5);
  assert.equal(sheet.columnWidths.length, 5);
  assert.deepEqual(sheet.currencyColumns, []);
  assert.equal(itemRows(sheet)[0].cells.length, 5);
  assert.equal(sheet.rows.some((row) => row.kind === "total"), false);
  assert.equal(
    sheet.rows.some((row) => row.kind === "field" && row.label === "Faturamento mínimo"),
    false,
  );
  assert.match(sheet.fileName, /-sem-precos\.xlsx$/);
});

test("header block carries the client, dates and validity", () => {
  const sheet = buildQuotationSheet(base);
  const fields = new Map(
    sheet.rows.flatMap((row) => (row.kind === "field" ? [[row.label, row.value] as const] : [])),
  );
  assert.equal(fields.get("Cliente"), "Hospital Santa Casa");
  assert.equal(fields.get("CNPJ"), "12.345.678/0001-90");
  assert.equal(fields.get("Cidade"), "Goiânia/GO");
  assert.equal(fields.get("Data da proposta"), "30/07/2026");
  assert.equal(fields.get("Validade"), "Até 14/08/2026 · 15 dias");
  assert.equal(fields.get("Pagamento"), "30/45/60 Dias");
});

test("file and sheet names are safe and identify the cotação", () => {
  const sheet = buildQuotationSheet(base);
  assert.equal(sheet.fileName, "cotacao-hi-2607-1-hospital-santa-casa.xlsx");
  assert.equal(sheet.sheetName, "Cotação HI-2607-1");
  assert.ok(sheet.sheetName.length <= 31);
});

test("a Medicone quote keeps its own brand in the item rows", () => {
  const sheet = buildQuotationSheet({
    ...base,
    brand: "Medicone",
    quoteNumber: "MC-2607-1",
    items: [{ ...base.items[0], brand: undefined }],
  });
  assert.equal(itemRows(sheet)[0].cells[3], "Medicone");
});
