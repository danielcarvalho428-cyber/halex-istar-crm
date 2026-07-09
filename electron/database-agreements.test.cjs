const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { randomUUID } = require("node:crypto");
const { LocalDatabase } = require("./database.cjs");

async function withDatabase(run) {
  const file = path.join(os.tmpdir(), `halex-test-${randomUUID()}.sqlite`);
  const database = new LocalDatabase(file, { seedDemoData: true });
  await database.open();
  try {
    await run(database);
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

test("a production database starts without demonstration clients or purchases", async () => {
  const file = path.join(os.tmpdir(), `halex-empty-${randomUUID()}.sqlite`);
  const database = new LocalDatabase(file);
  await database.open();
  try {
    assert.deepEqual(database.listClients(), []);
    assert.deepEqual(database.listQuotations(), []);
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

test("seeds only shared reference data into an empty production database", async () => {
  const file = path.join(os.tmpdir(), `halex-defaults-${randomUUID()}.sqlite`);
  const referenceData = {
    products: [
      {
        code: "DEFAULT1",
        description: "Produto padrão",
        brand: "Halex Istar",
        unit: "CX",
        price: 10.5,
        pack_size: 24,
        active: true,
      },
    ],
    priceTable: {
      name: "Tabela padrão",
      importedAt: "2026-07-01T00:00:00.000Z",
      items: [
        {
          code: "DEFAULT1",
          description: "Produto padrão",
          brand: "Halex Istar",
          unit: "CX",
          price: 10.5,
          pack_size: 24,
        },
      ],
    },
    salesPriceTable: {
      name: "Preços padrão",
      products: [{ code: "DEFAULT1", description: "Produto padrão" }],
      regions: [{ value: "co", label: "Centro-Oeste" }],
      categories: [{ value: "hospital", label: "Hospital" }],
      prices: { co: { hospital: { DEFAULT1: 10.5 } } },
    },
  };
  const database = new LocalDatabase(file, { referenceData });
  await database.open();
  try {
    assert.deepEqual(database.listClients(), []);
    assert.deepEqual(database.listQuotations(), []);
    assert.equal(database.listProducts().length, 1);
    assert.equal(database.listProducts()[0].pack_size, 24);
    assert.equal(database.listPriceVersions().length, 1);
    assert.equal(database.getSalesPriceTable().prices.co.hospital.DEFAULT1, 10.5);
    assert.equal(database.getSetting("email_config"), null);
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

test("repairs false purchase dates created by the old manual-client form", async () => {
  await withDatabase((database) => {
    database.saveClient({
      id: "manual-123",
      code: "MANUAL1",
      name: "Cliente manual",
      last_purchase: "2026-07-02",
      created_at: "2026-07-02T13:55:39.217Z",
    });
    database.cleanupFalseManualPurchaseDates();
    assert.equal(database.getClient("manual-123").last_purchase, null);

    database.saveClient({
      id: "imported-123",
      code: "IMPORT1",
      name: "Cliente importado",
      last_purchase: "2026-07-02",
      created_at: "2026-07-02T13:55:39.217Z",
    });
    database.cleanupFalseManualPurchaseDates();
    assert.equal(database.getClient("imported-123").last_purchase, "2026-07-02");
  });
});

test("repairs known package quantity corrections on existing databases", async () => {
  const file = path.join(os.tmpdir(), `halex-product-repair-${randomUUID()}.sqlite`);
  const database = new LocalDatabase(file);
  await database.open();
  try {
    database.importPriceTable(
      [{ code: "40000389", description: "GLICOSE 5% SF 100 ML", price: 2.97, pack_size: 10 }],
      "wrong-pack.xlsx",
    );

    const reopened = new LocalDatabase(file);
    await reopened.open();
    assert.equal(reopened.listProducts().find((item) => item.code === "40000389").pack_size, 100);
    assert.equal(
      reopened.rows("SELECT pack_size FROM price_table_items WHERE code = '40000389'")[0].pack_size,
      100,
    );
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

test("imports a product catalog without prices", async () => {
  await withDatabase((database) => {
    const result = database.importPriceTable(
      [{ code: "P1", description: "Produto sem preço", price: 0 }],
      "catalogo.xlsx",
    );
    assert.equal(result.imported, 1);
    assert.equal(database.listProducts().find((item) => item.code === "P1").price, 0);
  });
});

test("preserves package quantities in global price table versions", async () => {
  await withDatabase((database) => {
    const first = database.importPriceTable([{ code: "PACK1", description: "Produto", price: 100, pack_size: 24 }], "pack.xlsx");
    assert.equal(database.listProducts().find((item) => item.code === "PACK1").pack_size, 24);
    database.importPriceTable([{ code: "PACK2", description: "Outro", price: 50, pack_size: 12 }], "other.xlsx");
    database.activatePriceVersion(first.versionId);
    assert.equal(database.listProducts().find((item) => item.code === "PACK1").pack_size, 24);
  });
});

test("stores an imported multi-region sales table and preserves product packaging", async () => {
  await withDatabase((database) => {
    database.saveProduct({ code: "REG1", description: "Produto antigo", price: 1, pack_size: 24 });
    const table = {
      name: "Tabela 08.2026.xlsx",
      period: "08.2026",
      importedAt: "2026-08-01T12:00:00.000Z",
      regions: [{ value: "co", label: "Centro-Oeste" }],
      categories: [{ value: "hospital", label: "Hospital" }],
      products: [{ code: "REG1", description: "Produto atualizado" }],
      prices: { co: { hospital: { REG1: 12.34 } } },
      invalidPrices: 0,
      fallbackPrices: 0,
    };
    const result = database.importSalesPriceTable(table);
    assert.equal(result.imported, 1);
    assert.equal(database.getSalesPriceTable().prices.co.hospital.REG1, 12.34);
    const product = database.listProducts().find((item) => item.code === "REG1");
    assert.equal(product.description, "Produto atualizado");
    assert.equal(product.pack_size, 24);
  });
});

test("moves a client between agreement groups and stores special prices", async () => {
  await withDatabase((database) => {
    const first = database.saveAgreementGroup({ name: "Rede A" });
    const second = database.saveAgreementGroup({ name: "Rede B" });
    database.assignAgreementClient(first, "c1");
    database.saveAgreementPrice(first, "100132", 99.9);
    database.assignAgreementClient(second, "c1");

    const groups = database.listAgreementGroups();
    assert.equal(groups.find((group) => group.id === first).clients.length, 0);
    assert.equal(groups.find((group) => group.id === first).prices[0].price, 99.9);
    assert.equal(groups.find((group) => group.id === second).clients[0].id, "c1");
  });
});

test("keeps imported price tables isolated by agreement group", async () => {
  await withDatabase((database) => {
    const first = database.saveAgreementGroup({ name: "Grupo Tabela A" });
    const second = database.saveAgreementGroup({ name: "Grupo Tabela B" });
    database.importAgreementPrices(first, [
      { code: "100132", price: 10 },
      { code: "200200", price: 20 },
    ], "grupo-a.xlsx");
    database.importAgreementPrices(second, [
      { code: "100132", price: 99 },
    ], "grupo-b.xlsx");

    let groups = database.listAgreementGroups();
    assert.equal(groups.find((group) => group.id === first).prices.find((price) => price.product_code === "100132").price, 10);
    assert.equal(groups.find((group) => group.id === second).prices.find((price) => price.product_code === "100132").price, 99);

    database.importAgreementPrices(first, [{ code: "300300", price: 30 }], "grupo-a-nova.csv");
    groups = database.listAgreementGroups();
    assert.deepEqual(groups.find((group) => group.id === first).prices.map((price) => price.product_code), ["300300"]);
    assert.equal(groups.find((group) => group.id === second).prices[0].price, 99);
  });
});

test("loads a saved quotation with its items and deletes it", async () => {
  await withDatabase((database) => {
    database.saveQuotation({
      id: "quote-edit-test",
      quote_number: "HI-EDIT-TEST",
      client_id: "c1",
      issued_at: "2026-07-02",
      valid_until: "2026-07-17",
      total_value: 250,
      items: [{
        product_id: null,
        code: "P1",
        description: "Produto de teste",
        unit: "UN",
        quantity: 2,
        unit_price: 125,
        total_value: 250,
      }],
    });

    const quotation = database.getQuotation("quote-edit-test");
    assert.equal(quotation.quote_number, "HI-EDIT-TEST");
    assert.equal(quotation.items.length, 1);
    assert.equal(quotation.items[0].quantity, 2);

    database.deleteQuotation("quote-edit-test");
    assert.equal(database.getQuotation("quote-edit-test"), null);
    assert.equal(database.listQuotations().some((item) => item.id === "quote-edit-test"), false);
  });
});

test("round-trips a quotation with unit-mode packaging fields", async () => {
  await withDatabase((database) => {
    database.saveQuotation({
      id: "q-units",
      quote_number: "HI-UNITS",
      client_id: "c1",
      issued_at: "2026-07-02",
      valid_until: "2026-07-17",
      total_value: 300,
      items: [{
        product_id: null,
        code: "P30",
        description: "Caixa com 30 unidades",
        unit: "UN",
        quantity: 2,
        unit_price: 5,
        total_value: 300,
        quantity_mode: "units",
        unit_quantity: 60,
      }],
    });
    const quotation = database.getQuotation("q-units");
    assert.equal(quotation.items[0].quantity_mode, "units");
    assert.equal(quotation.items[0].unit_quantity, 60);
    assert.equal(quotation.items[0].quantity, 2);
    assert.equal(quotation.items[0].unit_price, 5);
  });
});

test("deactivates products missing from a newly imported price table", async () => {
  await withDatabase((database) => {
    database.importPriceTable([{ code: "OLD1", description: "Antigo", price: 10 }], "v1.xlsx");
    assert.ok(database.listProducts().some((item) => item.code === "OLD1"));
    database.importPriceTable([{ code: "NEW1", description: "Novo", price: 20 }], "v2.xlsx");
    const codes = database.listProducts().map((item) => item.code);
    assert.ok(codes.includes("NEW1"));
    assert.ok(!codes.includes("OLD1"));
  });
});

test("saveClient persists notes and address", async () => {
  await withDatabase((database) => {
    database.saveClient({
      id: "cli-notes",
      code: "N1",
      name: "Cliente Com Notas",
      notes: "Observação importante",
      address: "Rua Um, 100",
    });
    const client = database.getClient("cli-notes");
    assert.equal(client.notes, "Observação importante");
    assert.equal(client.address, "Rua Um, 100");
  });
});

test("updates and deletes clients while protecting quotation history", async () => {
  await withDatabase((database) => {
    database.saveClient({ id: "client-edit-test", code: "EDIT1", name: "Cliente Original" });
    database.saveClient({ id: "client-edit-test", code: "EDIT1", name: "Cliente Atualizado", city: "Goiânia" });
    assert.equal(database.getClient("client-edit-test").name, "Cliente Atualizado");

    database.saveQuotation({
      id: "protected-quote",
      quote_number: "HI-PROTECTED",
      client_id: "client-edit-test",
      issued_at: "2026-07-02",
      valid_until: "2026-07-17",
      items: [],
    });
    assert.throws(() => database.deleteClient("client-edit-test"), /possui cotações salvas/);
    database.deleteQuotation("protected-quote");
    database.deleteClient("client-edit-test");
    assert.equal(database.getClient("client-edit-test"), null);
  });
});

test("client imports preserve group and client type assignments", async () => {
  await withDatabase((database) => {
    database.importClients([{
      code: "GROUP1",
      name: "Hospital do Grupo",
      carteira: "Equipe Daniel",
      client_type: "hospital",
    }], "clientes.xlsx");
    const client = database.listClients().find((item) => item.code === "GROUP1");
    assert.equal(client.carteira, "Equipe Daniel");
    assert.equal(client.client_type, "hospital");
  });
});
