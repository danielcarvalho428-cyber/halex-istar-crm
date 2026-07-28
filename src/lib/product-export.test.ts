import assert from "node:assert/strict";
import test from "node:test";
import type { CrmProduct } from "./crm-preview.ts";
import { buildProductSheet, buildProductSheets, groupProductsByBrand } from "./product-export.ts";

const products: CrmProduct[] = [
  { id: "1", code: "200", description: "Glicose 5%", presentation: "Bolsa 500 ml", brand: "Halex Istar", unit: "CX", price: 286.5, priceHospital: 286.5, priceDistribuidor: 250, packSize: 30 },
  { id: "2", code: "100", description: "Água para Injeção", presentation: "Frasco 10 ml", brand: "halex istar", unit: "CX", price: 159.8, packSize: 200 },
  { id: "3", code: "M1", description: "Seringa 10 ml", presentation: "Pacote", brand: "Medicone", unit: "CX", price: 90, priceHospital: 90, priceDistribuidor: 80, packSize: 100 },
];

test("splits products by brand, defaulting unknown brands to Halex Istar", () => {
  const groups = groupProductsByBrand([...products, { ...products[0], id: "4", brand: undefined }]);
  assert.equal(groups.get("Halex Istar")!.length, 3);
  assert.equal(groups.get("Medicone")!.length, 1);
});

test("price columns appear only when requested", () => {
  const issuedAt = new Date("2026-07-28T12:00:00Z");
  const withPrices = buildProductSheet("Medicone", [products[2]], { withPrices: true, issuedAt });
  const withoutPrices = buildProductSheet("Medicone", [products[2]], { withPrices: false, issuedAt });

  assert.deepEqual(withPrices.rows[5].slice(5), ["Preço Hospital (R$)", "Preço Distribuidor (R$)"]);
  assert.deepEqual(withPrices.rows[6], ["M1", "Seringa 10 ml", "Pacote", "CX", "Caixa com 100 unidade(s)", 90, 80]);
  assert.equal(withoutPrices.rows[5].length, 5);
  assert.equal(withoutPrices.rows[6].length, 5);
  assert.ok(withPrices.fileName.includes("com-precos"));
  assert.ok(withoutPrices.fileName.includes("sem-precos"));
});

test("falls back to the base price when tier prices are missing", () => {
  const sheet = buildProductSheet("Halex Istar", [products[1]], { withPrices: true });
  assert.deepEqual(sheet.rows[6].slice(5), [159.8, 159.8]);
});

test("rows are sorted by product description", () => {
  const sheet = buildProductSheet("Halex Istar", products.slice(0, 2), { withPrices: false });
  assert.deepEqual([sheet.rows[6][1], sheet.rows[7][1]], ["Água para Injeção", "Glicose 5%"]);
});

test("only brands with items produce a sheet", () => {
  const sheets = buildProductSheets(products.slice(0, 2), { withPrices: true });
  assert.deepEqual(sheets.map((sheet) => sheet.brand), ["Halex Istar"]);
  assert.equal(buildProductSheets(products, { withPrices: true }).length, 2);
  assert.equal(buildProductSheets([], { withPrices: true }).length, 0);
});
