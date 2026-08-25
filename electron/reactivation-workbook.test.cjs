const assert = require("node:assert/strict");
const test = require("node:test");
const { buildReactivationWorkbook, CHOICES, COLUMNS } = require("./reactivation-workbook.cjs");

const sheets = [
  {
    carteira: "4104",
    total: 51000,
    rows: [
      {
        codigo: "500024",
        cliente: "HOSPITAL GRANDE",
        cnpj: "06.134.926/0001-56",
        situacao: "Comprando (até 3 meses)",
        ultimaCompra: "2026-06-01",
        diasSemComprar: 85,
        compras: 4,
        totalPeriodo: 50000,
        total12m: 50000,
        cicloMedio: 60,
        foraDoCiclo: "",
        cnpjBaixado: "",
      },
      {
        codigo: "500082",
        cliente: "HOSPITAL FECHADO",
        situacao: "Mais de 2 anos sem comprar",
        ultimaCompra: "2023-01-02",
        diasSemComprar: 1300,
        compras: 1,
        totalPeriodo: 1000,
        total12m: 0,
        cicloMedio: "",
        foraDoCiclo: "",
        cnpjBaixado: "SIM",
      },
    ],
  },
  { carteira: "4648", total: 0, rows: [] },
];

test("cria uma aba por carteira com cabeçalho congelado e filtro", async () => {
  const workbook = await buildReactivationWorkbook(sheets);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["4104", "4648"]);

  const sheet = workbook.getWorksheet("4104");
  assert.equal(sheet.rowCount, 3); // cabeçalho + dois clientes
  assert.deepEqual(sheet.views[0], { state: "frozen", ySplit: 1 });
  assert.equal(sheet.autoFilter.to.column, COLUMNS.length);
  assert.equal(sheet.getRow(1).getCell(1).value, "Código");
  assert.equal(sheet.getRow(2).getCell(2).value, "HOSPITAL GRANDE");
});

test("põe lista suspensa na coluna Reconquistar de cada cliente", async () => {
  const sheet = (await buildReactivationWorkbook(sheets)).getWorksheet("4104");
  const validation = sheet.getRow(2).getCell(18).dataValidation;

  assert.equal(validation.type, "list");
  assert.equal(validation.allowBlank, true);
  assert.deepEqual(validation.formulae, [`"${CHOICES.join(",")}"`]);
  assert.equal(sheet.getRow(1).getCell(18).value, "Reconquistar?");
});

test("risca o cliente com CNPJ baixado e formata os valores em reais", async () => {
  const sheet = (await buildReactivationWorkbook(sheets)).getWorksheet("4104");

  assert.equal(sheet.getRow(3).getCell(2).font.strike, true);
  assert.ok(!sheet.getRow(2).getCell(2).font?.strike);
  assert.equal(sheet.getColumn("totalPeriodo").numFmt, "R$ #,##0.00");
});

test("a carteira sem clientes vira uma aba com aviso, não uma aba vazia", async () => {
  const sheet = (await buildReactivationWorkbook(sheets)).getWorksheet("4648");
  assert.equal(sheet.getRow(2).getCell(2).value, "Nenhum cliente nesta carteira.");
});

test("nome de aba inválido para o Excel é saneado", async () => {
  const workbook = await buildReactivationWorkbook([
    { carteira: "Centro/Oeste [novo]", total: 0, rows: [] },
  ]);
  assert.equal(workbook.worksheets[0].name, "Centro-Oeste -novo-");
});
