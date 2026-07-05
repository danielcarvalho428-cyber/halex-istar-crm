const assert = require("node:assert/strict");
const test = require("node:test");
const { productRows, salesPriceTableFromSheets } = require("./product-import.cjs");

test("imports the abbreviated headers from the real price workbook", () => {
  const [product] = productRows([
    { CÓD: 40000133, PRODUTO: "AGUA P/ INJECAO 5ML", "preço ": 5 },
  ]);
  assert.equal(product.code, "40000133");
  assert.equal(product.description, "AGUA P/ INJECAO 5ML");
  assert.equal(product.price, 5);
});

test("parses Brazilian decimal prices", () => {
  const [product] = productRows([
    { Código: "4124", Produto: "Produto", Preço: "1.234,56" },
  ]);
  assert.equal(product.price, 1234.56);
});

test("accepts product catalogs without a price column", () => {
  const [product] = productRows([{ CÓD: "5000", PRODUTO: "Novo produto" }]);
  assert.equal(product.code, "5000");
  assert.equal(product.description, "Novo produto");
  assert.equal(product.price, 0);
});

test("recognizes brand values from product imports", () => {
  const [product] = productRows([{ Código: "7001", Produto: "Produto teste", Brand: "Eurofarma" }]);
  assert.equal(product.brand, "Eurofarma");
});

test("imports the Caixa com quantity", () => {
  const [product] = productRows([{ Código: "8001", Produto: "Produto caixa", "Caixa com": 24 }]);
  assert.equal(product.pack_size, 24);
});

test("recognizes the standard multi-region monthly sales workbook", () => {
  const header = [
    ["", "TABELA DE PREÇOS | JULHO 2026", "Distribuidores e Revendedores", "", "Hospital AA e A / Contratos Redes", "", "Hospital B e C", "Hospital D"],
    ["CÓD", "Produto", "Dedicado", "Fracionado", "Dedicado", "Fracionado", "Fracionado", "Fracionado"],
  ];
  const table = salesPriceTableFromSheets([
    { name: "07.2026 - CO-TO-BA-SP-RJ-ES-MG", rows: [...header, ["4130", "CLOR. SODIO", 3.55, 3.73, 3.60, 3.78, 3.91, 4.32]] },
    { name: "07.2026 - N-NE-SUL", rows: [...header, ["4130", "CLOR. SODIO", 3.64, 3.82, 3.69, 3.88, 4.01, 4.43]] },
  ], "Tabela HI Equipes - 07.2026.xlsx");
  assert.equal(table.period, "07.2026");
  assert.equal(table.products.length, 1);
  assert.equal(table.regions.length, 2);
  assert.equal(table.categories.length, 6);
  assert.equal(table.prices["n-ne-sul"]["hospital-ab-fractionated"]["4130"], 4.01);
});

test("fills broken regional formulas from the first valid regional sheet", () => {
  const header = [
    ["", "TABELA", "Hospital D"],
    ["CÓD", "Produto", "Fracionado"],
  ];
  const table = salesPriceTableFromSheets([
    { name: "07.2026 - CO", rows: [...header, ["40000416", "MIXISTAR", 13.32]] },
    { name: "07.2026 - N-NE-SUL", rows: [...header, ["40000416", "MIXISTAR", "#REF!"]] },
  ], "07.2026.xlsx");
  assert.equal(table.prices["n-ne-sul"]["hospital-cd-fractionated"]["40000416"], 13.32);
  assert.equal(table.fallbackPrices, 1);
});
