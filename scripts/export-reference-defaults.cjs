const fs = require("node:fs");
const path = require("node:path");
const initSqlJs = require("sql.js");

const root = path.join(__dirname, "..");
const source = process.env.HALEX_USER_DATA_DIR
  ? path.join(process.env.HALEX_USER_DATA_DIR, "halex-istar.sqlite")
  : path.join(process.env.APPDATA || "", "halex-istar-crm", "halex-istar.sqlite");
const output = path.join(root, "electron", "defaults", "reference-data.json");

function rows(db, sql, params = []) {
  const statement = db.prepare(sql);
  statement.bind(params);
  const result = [];
  while (statement.step()) result.push(statement.getAsObject());
  statement.free();
  return result;
}

function setting(db, key) {
  return rows(db, "SELECT value FROM settings WHERE key = ?", [key])[0]?.value || null;
}

function productFields(value) {
  return {
    code: String(value.code),
    description: String(value.description),
    presentation: value.presentation || null,
    brand: value.brand || "Halex Istar",
    unit: value.unit || "UN",
    price: Number(value.price) || 0,
    minimum_price: value.minimum_price == null ? null : Number(value.minimum_price),
    pack_size: Math.max(1, Math.trunc(Number(value.pack_size) || 1)),
    active: Number(value.active) !== 0,
  };
}

async function main() {
  if (!fs.existsSync(source)) {
    throw new Error(`Local CRM database not found: ${source}`);
  }
  const SQL = await initSqlJs({
    locateFile: (file) => require.resolve(`sql.js/dist/${file}`),
  });
  const db = new SQL.Database(fs.readFileSync(source));
  try {
    const products = rows(
      db,
      `SELECT code,description,presentation,brand,unit,price,minimum_price,pack_size,active
       FROM products ORDER BY code`,
    ).map(productFields);
    const activeVersion = rows(
      db,
      "SELECT id,name,imported_at FROM price_table_versions WHERE active = 1 ORDER BY imported_at DESC LIMIT 1",
    )[0];
    const priceItemsByCode = new Map();
    if (activeVersion) {
      for (const item of rows(
        db,
        `SELECT code,description,presentation,brand,unit,price,minimum_price,pack_size,1 AS active
         FROM price_table_items WHERE version_id = ? ORDER BY rowid`,
        [activeVersion.id],
      )) {
        priceItemsByCode.set(String(item.code), productFields(item));
      }
    }
    const salesValue = setting(db, "active_sales_price_table");
    const referenceData = {
      formatVersion: 1,
      generatedAt: new Date().toISOString(),
      products,
      priceTable: activeVersion
        ? {
            name: activeVersion.name,
            importedAt: activeVersion.imported_at,
            items: [...priceItemsByCode.values()],
          }
        : null,
      salesPriceTable: salesValue ? JSON.parse(salesValue) : null,
    };

    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(referenceData, null, 2)}\n`);
    process.stdout.write(
      `Exported ${products.length} products, ${priceItemsByCode.size} price-table items, `
      + `${referenceData.salesPriceTable?.products?.length || 0} sales-price products.\n`,
    );
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
