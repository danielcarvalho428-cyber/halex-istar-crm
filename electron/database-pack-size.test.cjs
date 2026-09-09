const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { randomUUID } = require("node:crypto");
const { LocalDatabase } = require("./database.cjs");

async function withDatabase(run) {
  const file = path.join(os.tmpdir(), `halex-pack-${randomUUID()}.sqlite`);
  const database = new LocalDatabase(file);
  await database.open();
  try {
    await run(database, file);
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

const sheetRows = (packSize) => [
  {
    code: "900001",
    description: "Produto de teste",
    presentation: "Frasco 10 ml",
    unit: "CX",
    price: 100,
    pack_size: packSize,
  },
];

function productByCode(database, code) {
  return database.listProducts().find((row) => row.code === code);
}

test("corrige a quantidade da caixa de um produto", async () => {
  await withDatabase(async (database) => {
    const version = database.importPriceTable(sheetRows(20), "tabela.xlsx");
    database.activatePriceVersion(version.versionId);
    assert.equal(productByCode(database, "900001").pack_size, 20);

    database.setProductPackSize("900001", 50);
    assert.equal(productByCode(database, "900001").pack_size, 50);
  });
});

test("a correção sobrevive a uma nova importação da mesma planilha", async () => {
  await withDatabase(async (database) => {
    const first = database.importPriceTable(sheetRows(20), "tabela.xlsx");
    database.activatePriceVersion(first.versionId);
    database.setProductPackSize("900001", 50);

    const second = database.importPriceTable(sheetRows(20), "tabela.xlsx");
    database.activatePriceVersion(second.versionId);

    assert.equal(productByCode(database, "900001").pack_size, 50);
  });
});

test("a correção continua valendo depois de reabrir o banco", async () => {
  const file = path.join(os.tmpdir(), `halex-pack-${randomUUID()}.sqlite`);
  const database = new LocalDatabase(file);
  await database.open();
  try {
    const version = database.importPriceTable(sheetRows(20), "tabela.xlsx");
    database.activatePriceVersion(version.versionId);
    database.setProductPackSize("900001", 50);

    const reopened = new LocalDatabase(file);
    await reopened.open();
    assert.equal(productByCode(reopened, "900001").pack_size, 50);
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

test("recusa uma quantidade de caixa inválida", async () => {
  await withDatabase(async (database) => {
    assert.throws(() => database.setProductPackSize("900001", 0));
    assert.throws(() => database.setProductPackSize("", 10));
  });
});
