const fs = require("node:fs");
const path = require("node:path");
const initSqlJs = require("sql.js");

const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY, code TEXT UNIQUE, name TEXT NOT NULL, document TEXT,
  city TEXT, state TEXT, contact TEXT, phone TEXT, email TEXT, address TEXT,
  status TEXT NOT NULL DEFAULT 'active', last_purchase TEXT,
  average_cycle_days INTEGER, next_purchase TEXT, total_12m REAL NOT NULL DEFAULT 0,
  notes TEXT, client_type TEXT, carteira TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, description TEXT NOT NULL,
  presentation TEXT, brand TEXT, unit TEXT NOT NULL, price REAL NOT NULL DEFAULT 0,
  minimum_price REAL, active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contacted_at TEXT NOT NULL, channel TEXT NOT NULL, outcome TEXT NOT NULL,
  notes TEXT, next_contact TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  purchased_at TEXT NOT NULL, document_number TEXT, total_value REAL NOT NULL DEFAULT 0,
  notes TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quotations (
  id TEXT PRIMARY KEY, quote_number TEXT UNIQUE NOT NULL,
  client_id TEXT NOT NULL REFERENCES clients(id), issued_at TEXT NOT NULL,
  valid_until TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', seller TEXT,
  payment_terms TEXT, delivery_terms TEXT, freight_terms TEXT, notes TEXT,
  total_value REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quotation_items (
  id TEXT PRIMARY KEY, quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id), position INTEGER NOT NULL, code TEXT,
  description TEXT NOT NULL, presentation TEXT, brand TEXT, unit TEXT NOT NULL,
  quantity REAL NOT NULL, unit_price REAL NOT NULL, total_value REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS price_table_versions (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, imported_at TEXT NOT NULL,
  row_count INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS price_table_items (
  id TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES price_table_versions(id) ON DELETE CASCADE,
  code TEXT NOT NULL, description TEXT NOT NULL, presentation TEXT, brand TEXT,
  unit TEXT NOT NULL, price REAL NOT NULL, minimum_price REAL
);
CREATE TABLE IF NOT EXISTS agreement_groups (
  id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agreement_group_clients (
  group_id TEXT NOT NULL REFERENCES agreement_groups(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL, PRIMARY KEY(group_id, client_id)
);
CREATE TABLE IF NOT EXISTS agreement_prices (
  group_id TEXT NOT NULL REFERENCES agreement_groups(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL, price REAL NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY(group_id, product_code)
);
CREATE INDEX IF NOT EXISTS idx_clients_next_purchase ON clients(next_purchase, status);
CREATE INDEX IF NOT EXISTS idx_contacts_client ON contacts(client_id, contacted_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_client ON quotations(client_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_items_version ON price_table_items(version_id, code);
CREATE INDEX IF NOT EXISTS idx_agreement_clients_group ON agreement_group_clients(group_id);
CREATE INDEX IF NOT EXISTS idx_agreement_prices_group ON agreement_prices(group_id);
`;

const seedClients = [
  [
    "c1",
    "10428",
    "Hospital Santa Clara",
    "Goiânia",
    "GO",
    "Mariana Souza",
    "(62) 99999-1010",
    "compras@santaclara.com.br",
    "2026-04-08",
    75,
    "2026-06-22",
    184500,
  ],
  [
    "c2",
    "21874",
    "Clínica Vida Plena",
    "Uberlândia",
    "MG",
    "Rafael Lima",
    "(34) 98888-2030",
    "rafael@vidaplena.com.br",
    "2026-05-12",
    60,
    "2026-07-11",
    98240,
  ],
  [
    "c3",
    "30551",
    "Centro Médico Horizonte",
    "Cuiabá",
    "MT",
    "Ana Ribeiro",
    "(65) 97777-4050",
    "suprimentos@horizonte.med.br",
    "2026-06-02",
    90,
    "2026-08-31",
    247800,
  ],
];
const seedProducts = [
  [
    "p1",
    "100132",
    "Cloreto de Sódio 0,9%",
    "Bolsa 500 ml, sistema fechado",
    "CX",
    248.9,
  ],
  [
    "p2",
    "100208",
    "Glicose 5%",
    "Bolsa 500 ml, caixa com 30 unidades",
    "CX",
    286.5,
  ],
  [
    "p3",
    "100341",
    "Ringer com Lactato",
    "Bolsa 500 ml, caixa com 24 unidades",
    "CX",
    271.2,
  ],
  [
    "p4",
    "100455",
    "Água para Injeção",
    "Frasco 10 ml, caixa com 200 unidades",
    "CX",
    159.8,
  ],
];

class LocalDatabase {
  constructor(filePath, { seedDemoData = false, referenceData = null } = {}) {
    this.filePath = filePath;
    this.db = null;
    this.seedDemoData = seedDemoData;
    this.referenceData = referenceData;
  }

  async open() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const SQL = await initSqlJs({
      locateFile: (file) => require.resolve(`sql.js/dist/${file}`),
    });
    this.db = fs.existsSync(this.filePath)
      ? new SQL.Database(fs.readFileSync(this.filePath))
      : new SQL.Database();
    this.db.run(schema);
    this.ensureColumn("clients", "client_type", "TEXT");
    this.ensureColumn("clients", "carteira", "TEXT");
    this.ensureColumn("quotation_items", "brand", "TEXT");
    this.ensureColumn("products", "pack_size", "INTEGER");
    this.ensureColumn("price_table_items", "pack_size", "INTEGER");
    this.ensureColumn("quotation_items", "quantity_mode", "TEXT");
    this.ensureColumn("quotation_items", "unit_quantity", "REAL");
    this.ensureColumn("quotations", "representative_role", "TEXT");
    this.ensureColumn("quotations", "representative_phone", "TEXT");
    this.ensureColumn("quotations", "representative_email", "TEXT");
    this.ensureColumn("quotations", "sales_price_table", "TEXT");
    this.ensureColumn("quotations", "sales_price_region", "TEXT");
    this.ensureColumn("agreement_groups", "price_table_name", "TEXT");
    this.ensureColumn("agreement_groups", "price_table_imported_at", "TEXT");
    this.cleanupFalseManualPurchaseDates();
    this.reconcileActiveTable();
    if (this.seedDemoData) this.seed();
    if (this.referenceData) this.seedReferenceData(this.referenceData);
    this.persist();
  }

  // When a commercial (sales) table is active it is the single price source, so
  // no catalog version should still be flagged active. This repairs databases
  // created before the two systems were made mutually exclusive.
  reconcileActiveTable() {
    const raw = this.getSetting("active_sales_price_table");
    if (!raw) return;
    this.db.run("UPDATE price_table_versions SET active = 0");
    // Retire products left over from older imports so the quote picker shows only
    // the current commercial table (no duplicates / price-less leftovers).
    let codes = [];
    try {
      const table = JSON.parse(raw);
      codes = Array.isArray(table?.products)
        ? table.products.map((product) => String(product.code)).filter(Boolean)
        : [];
    } catch {
      return;
    }
    if (!codes.length) return;
    const placeholders = codes.map(() => "?").join(",");
    this.db.run(
      `UPDATE products SET active = 0 WHERE code NOT IN (${placeholders})`,
      codes,
    );
  }

  seedReferenceData(referenceData) {
    const existingProducts =
      this.db.exec("SELECT count(*) AS total FROM products")[0]
        ?.values[0]?.[0] || 0;
    if (existingProducts) return false;

    const products = Array.isArray(referenceData?.products)
      ? referenceData.products.filter((value) => value?.code && value?.description)
      : [];
    if (!products.length) return false;

    const priceItems = Array.isArray(referenceData?.priceTable?.items)
      ? referenceData.priceTable.items.filter((value) => value?.code && value?.description)
      : [];
    const now = new Date().toISOString();
    this.db.run("BEGIN");
    try {
      const productStatement = this.db.prepare(
        `INSERT INTO products
          (id,code,description,presentation,brand,unit,price,minimum_price,pack_size,active,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      );
      for (const value of products) {
        productStatement.run([
          crypto.randomUUID(),
          String(value.code),
          String(value.description),
          value.presentation || null,
          value.brand || "Halex Istar",
          value.unit || "UN",
          Number(value.price) || 0,
          value.minimum_price == null ? null : Number(value.minimum_price),
          Math.max(1, Math.trunc(Number(value.pack_size) || 1)),
          value.active === false || Number(value.active) === 0 ? 0 : 1,
          now,
        ]);
      }
      productStatement.free();

      if (priceItems.length) {
        const versionId = crypto.randomUUID();
        this.db.run(
          "INSERT INTO price_table_versions(id,name,imported_at,row_count,active) VALUES(?,?,?,?,1)",
          [
            versionId,
            referenceData.priceTable.name || "Tabela de produtos Halex Istar",
            referenceData.priceTable.importedAt || now,
            priceItems.length,
          ],
        );
        const itemStatement = this.db.prepare(
          `INSERT INTO price_table_items
            (id,version_id,code,description,presentation,brand,unit,price,minimum_price,pack_size)
           VALUES(?,?,?,?,?,?,?,?,?,?)`,
        );
        for (const value of priceItems) {
          itemStatement.run([
            crypto.randomUUID(),
            versionId,
            String(value.code),
            String(value.description),
            value.presentation || null,
            value.brand || "Halex Istar",
            value.unit || "UN",
            Number(value.price) || 0,
            value.minimum_price == null ? null : Number(value.minimum_price),
            Math.max(1, Math.trunc(Number(value.pack_size) || 1)),
          ]);
        }
        itemStatement.free();
      }

      if (referenceData.salesPriceTable) {
        this.db.run(
          "INSERT INTO settings(key,value) VALUES('active_sales_price_table',?)",
          [
            JSON.stringify({
              ...referenceData.salesPriceTable,
              importedAt: referenceData.salesPriceTable.importedAt || now,
            }),
          ],
        );
      }

      this.db.run("COMMIT");
      this.persist();
      return true;
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
  }

  seed() {
    const count =
      this.db.exec("SELECT count(*) AS total FROM clients")[0]
        ?.values[0]?.[0] || 0;
    if (count) return;
    const now = new Date().toISOString();
    const client = this.db.prepare(`INSERT INTO clients
      (id,code,name,city,state,contact,phone,email,last_purchase,average_cycle_days,next_purchase,total_12m,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'active',?,?)`);
    for (const row of seedClients) client.run([...row, now, now]);
    client.free();
    const product = this.db.prepare(`INSERT INTO products
      (id,code,description,presentation,brand,unit,price,active,updated_at)
      VALUES (?,?,?,?,'Halex Istar',?,?,1,?)`);
    for (const row of seedProducts)
      product.run([...row.slice(0, 4), row[4], row[5], now]);
    product.free();
  }

  rows(sql, params = []) {
    const statement = this.db.prepare(sql);
    statement.bind(params);
    const result = [];
    while (statement.step()) result.push(statement.getAsObject());
    statement.free();
    return result;
  }

  ensureColumn(table, column, type) {
    const columns = this.rows(`PRAGMA table_info(${table})`);
    if (!columns.some((value) => value.name === column)) {
      this.db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }

  cleanupFalseManualPurchaseDates() {
    // Versions through 0.2.12 stamped every manually registered client with
    // its creation day as a purchase. Only clear that exact generated pattern;
    // imported and explicitly recorded purchase history remains untouched.
    this.db.run(`UPDATE clients
      SET last_purchase = NULL, updated_at = updated_at
      WHERE id LIKE 'manual-%'
        AND last_purchase = substr(created_at, 1, 10)
        AND NOT EXISTS (
          SELECT 1 FROM purchases WHERE purchases.client_id = clients.id
        )`);
  }

  run(sql, params = []) {
    this.db.run(sql, params);
    this.persist();
  }
  persist() {
    fs.writeFileSync(this.filePath, Buffer.from(this.db.export()));
  }
  listClients() {
    return this.rows("SELECT * FROM clients ORDER BY next_purchase, name");
  }
  getClient(id) {
    return this.rows("SELECT * FROM clients WHERE id = ?", [id])[0] || null;
  }
  deleteClient(id) {
    const quotationCount = Number(
      this.rows("SELECT COUNT(*) AS total FROM quotations WHERE client_id = ?", [id])[0]?.total || 0,
    );
    if (quotationCount > 0) {
      throw new Error("Este cliente possui cotações salvas. Exclua as cotações antes de excluir o cliente.");
    }
    this.db.run("DELETE FROM clients WHERE id = ?", [id]);
    this.persist();
    return true;
  }
  listProducts() {
    return this.rows(
      "SELECT * FROM products WHERE active = 1 ORDER BY description",
    );
  }
  listQuotations() {
    return this.rows(
      `SELECT q.*, c.name AS client_name FROM quotations q JOIN clients c ON c.id=q.client_id ORDER BY q.issued_at DESC, q.created_at DESC`,
    );
  }
  getQuotation(id) {
    const quotation = this.rows(
      `SELECT q.*, c.name AS client_name FROM quotations q JOIN clients c ON c.id=q.client_id WHERE q.id = ?`,
      [id],
    )[0];
    if (!quotation) return null;
    quotation.items = this.rows(
      "SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY position",
      [id],
    );
    return quotation;
  }
  deleteQuotation(id) {
    this.db.run("DELETE FROM quotations WHERE id = ?", [id]);
    this.persist();
    return true;
  }
  listPriceVersions() {
    return this.rows(
      "SELECT * FROM price_table_versions ORDER BY imported_at DESC",
    );
  }
  getSetting(key) {
    return (
      this.rows("SELECT value FROM settings WHERE key = ?", [key])[0]?.value ||
      null
    );
  }
  setSetting(key, value) {
    this.run(
      "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [key, String(value)],
    );
  }

  importClients(rows, sourceName) {
    const now = new Date().toISOString();
    let added = 0,
      updated = 0,
      ignored = 0;
    this.db.run("BEGIN");
    try {
      this.db.run("UPDATE clients SET status = 'inactive', updated_at = ?", [
        now,
      ]);
      for (const value of rows) {
        if (!value.name || !value.code) {
          ignored += 1;
          continue;
        }
        const existing = this.rows("SELECT id FROM clients WHERE code = ?", [
          value.code,
        ])[0];
        const id = existing?.id || crypto.randomUUID();
        this.db.run(
          `INSERT INTO clients (id,code,name,document,city,state,contact,phone,email,address,status,last_purchase,average_cycle_days,next_purchase,total_12m,notes,client_type,carteira,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET name=excluded.name,document=excluded.document,city=excluded.city,state=excluded.state,contact=excluded.contact,phone=excluded.phone,email=excluded.email,address=excluded.address,status='active',last_purchase=excluded.last_purchase,average_cycle_days=excluded.average_cycle_days,next_purchase=excluded.next_purchase,total_12m=excluded.total_12m,notes=excluded.notes,client_type=COALESCE(excluded.client_type,clients.client_type),carteira=COALESCE(NULLIF(excluded.carteira,''),clients.carteira),updated_at=excluded.updated_at`,
          [
            id,
            value.code,
            value.name,
            value.document || null,
            value.city || null,
            value.state || null,
            value.contact || null,
            value.phone || null,
            value.email || null,
            value.address || null,
            "active",
            value.last_purchase || null,
            value.average_cycle_days || null,
            value.next_purchase || null,
            Number(value.total_12m) || 0,
            value.notes || null,
            value.client_type || null,
            value.carteira || null,
            now,
            now,
          ],
        );
        if (existing) updated += 1;
        else added += 1;
      }
      this.db.run(
        "INSERT INTO settings(key,value) VALUES('last_client_import',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [
          JSON.stringify({
            sourceName,
            importedAt: now,
            added,
            updated,
            ignored,
          }),
        ],
      );
      this.db.run("COMMIT");
      this.persist();
      return { added, updated, ignored, total: rows.length };
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
  }

  importPriceTable(rows, name) {
    const validRows = rows.filter((value) => value.code && value.description);
    if (validRows.length === 0) {
      throw new Error(
        "Nenhum produto válido foi encontrado. Verifique as colunas de código e produto.",
      );
    }
    const now = new Date().toISOString();
    const versionId = crypto.randomUUID();
    let imported = 0;
    const ignored = rows.length - validRows.length;
    this.db.run("BEGIN");
    try {
      // A newly imported catalog becomes the single active source, replacing any
      // commercial (sales) table so the two systems never both claim "active".
      this.db.run("DELETE FROM settings WHERE key = 'active_sales_price_table'");
      this.db.run("UPDATE price_table_versions SET active = 0");
      this.db.run(
        "INSERT INTO price_table_versions(id,name,imported_at,row_count,active) VALUES(?,?,?,?,1)",
        [versionId, name, now, rows.length],
      );
      this.db.run("UPDATE products SET active = 0, updated_at = ?", [now]);
      const snapshot = this.db.prepare(
        "INSERT INTO price_table_items(id,version_id,code,description,presentation,brand,unit,price,minimum_price,pack_size) VALUES(?,?,?,?,?,?,?,?,?,?)",
      );
      for (const value of validRows) {
        snapshot.run([
          crypto.randomUUID(),
          versionId,
          value.code,
          value.description,
          value.presentation || null,
          value.brand || "Halex Istar",
          value.unit || "UN",
          Number(value.price) || 0,
          value.minimum_price == null ? null : Number(value.minimum_price),
          Math.max(1, Math.trunc(Number(value.pack_size) || 1)),
        ]);
        const existing = this.rows("SELECT id FROM products WHERE code = ?", [
          value.code,
        ])[0];
        this.db.run(
          `INSERT INTO products(id,code,description,presentation,brand,unit,price,minimum_price,pack_size,active,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?)
          ON CONFLICT(code) DO UPDATE SET description=excluded.description,presentation=excluded.presentation,brand=excluded.brand,unit=excluded.unit,price=excluded.price,minimum_price=excluded.minimum_price,pack_size=excluded.pack_size,active=1,updated_at=excluded.updated_at`,
          [
            existing?.id || crypto.randomUUID(),
            value.code,
            value.description,
            value.presentation || null,
            value.brand || "Halex Istar",
            value.unit || "UN",
            Number(value.price) || 0,
            value.minimum_price == null ? null : Number(value.minimum_price),
            Math.max(1, Math.trunc(Number(value.pack_size) || 1)),
            now,
          ],
        );
        imported += 1;
      }
      snapshot.free();
      this.db.run(
        "UPDATE price_table_versions SET row_count = ? WHERE id = ?",
        [imported, versionId],
      );
      this.db.run("COMMIT");
      this.persist();
      return { versionId, imported, ignored, total: rows.length };
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
  }

  importSalesPriceTable(table) {
    const now = new Date().toISOString();
    this.db.run("BEGIN");
    try {
      // The commercial table becomes the single active price source: retire any
      // catalog version still flagged active and deactivate leftover products so
      // the "Histórico de tabelas" list and quotations reflect only this table.
      this.db.run("UPDATE price_table_versions SET active = 0");
      this.db.run("UPDATE products SET active = 0, updated_at = ?", [now]);
      for (const product of table.products) {
        const existing = this.rows(
          "SELECT id,pack_size,brand,unit FROM products WHERE code = ?",
          [product.code],
        )[0];
        const firstPrice = table.regions
          .flatMap((region) => table.categories.map((category) =>
            table.prices?.[region.value]?.[category.value]?.[product.code],
          ))
          .find((price) => Number.isFinite(Number(price)));
        this.db.run(
          `INSERT INTO products(id,code,description,presentation,brand,unit,price,pack_size,active,updated_at)
           VALUES(?,?,?,?,?,?,?,?,1,?)
           ON CONFLICT(code) DO UPDATE SET description=excluded.description,price=excluded.price,active=1,updated_at=excluded.updated_at`,
          [
            existing?.id || crypto.randomUUID(),
            product.code,
            product.description,
            null,
            existing?.brand || "Halex Istar",
            existing?.unit || "UN",
            Number(firstPrice) || 0,
            Math.max(1, Number(existing?.pack_size) || 1),
            now,
          ],
        );
      }
      const storedTable = { ...table, importedAt: now };
      this.db.run(
        "INSERT INTO settings(key,value) VALUES('active_sales_price_table',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [JSON.stringify(storedTable)],
      );
      this.db.run("COMMIT");
      this.persist();
      return {
        imported: table.products.length,
        ignored: table.invalidPrices,
        total: table.products.length,
        regions: table.regions.length,
        categories: table.categories.length,
        fallbackPrices: table.fallbackPrices,
        period: table.period,
      };
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
  }

  getSalesPriceTable() {
    const value = this.getSetting("active_sales_price_table");
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  activatePriceVersion(versionId) {
    const rows = this.rows(
      "SELECT * FROM price_table_items WHERE version_id = ?",
      [versionId],
    );
    if (!rows.length) throw new Error("Tabela de preços sem itens.");
    const now = new Date().toISOString();
    this.db.run("BEGIN");
    try {
      // Choosing a catalog version clears the commercial table so only one price
      // source is ever active at a time.
      this.db.run("DELETE FROM settings WHERE key = 'active_sales_price_table'");
      this.db.run(
        "UPDATE price_table_versions SET active = CASE WHEN id = ? THEN 1 ELSE 0 END",
        [versionId],
      );
      this.db.run("UPDATE products SET active = 0, updated_at = ?", [now]);
      for (const value of rows) {
        const existing = this.rows("SELECT id FROM products WHERE code = ?", [
          value.code,
        ])[0];
        this.db.run(
          `INSERT INTO products(id,code,description,presentation,brand,unit,price,minimum_price,pack_size,active,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?)
          ON CONFLICT(code) DO UPDATE SET description=excluded.description,presentation=excluded.presentation,brand=excluded.brand,unit=excluded.unit,price=excluded.price,minimum_price=excluded.minimum_price,pack_size=excluded.pack_size,active=1,updated_at=excluded.updated_at`,
          [
            existing?.id || crypto.randomUUID(),
            value.code,
            value.description,
            value.presentation,
            value.brand,
            value.unit,
            value.price,
            value.minimum_price,
            Math.max(1, Math.trunc(Number(value.pack_size) || 1)),
            now,
          ],
        );
      }
      this.db.run("COMMIT");
      this.persist();
      return rows.length;
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
  }

  deletePriceVersion(versionId) {
    const version = this.rows(
      "SELECT * FROM price_table_versions WHERE id = ?",
      [versionId],
    )[0];
    if (!version) throw new Error("Tabela de preços não encontrada.");

    let activatedVersionId = null;
    if (Number(version.active)) {
      const replacement = this.rows(
        "SELECT id FROM price_table_versions WHERE id <> ? AND row_count > 0 ORDER BY imported_at DESC LIMIT 1",
        [versionId],
      )[0];
      if (!replacement) {
        throw new Error(
          "Não é possível excluir a única tabela ativa. Importe outra tabela primeiro.",
        );
      }
      this.activatePriceVersion(replacement.id);
      activatedVersionId = replacement.id;
    }

    this.run("DELETE FROM price_table_versions WHERE id = ?", [versionId]);
    return { deleted: true, activatedVersionId };
  }

  listAgreementGroups() {
    return this.rows(
      "SELECT * FROM agreement_groups ORDER BY name COLLATE NOCASE",
    ).map((group) => ({
      ...group,
      clients: this.rows(
        `SELECT c.id, c.code, c.name, c.city, c.state
         FROM agreement_group_clients membership
         JOIN clients c ON c.id = membership.client_id
         WHERE membership.group_id = ? ORDER BY c.name COLLATE NOCASE`,
        [group.id],
      ),
      prices: this.rows(
        `SELECT price.product_code, price.price, product.description
         FROM agreement_prices price
         LEFT JOIN products product ON product.code = price.product_code
         WHERE price.group_id = ? ORDER BY COALESCE(product.description, price.product_code) COLLATE NOCASE`,
        [group.id],
      ),
    }));
  }

  saveAgreementGroup(value) {
    const name = String(value.name || "").trim();
    if (!name) throw new Error("Informe o nome do acordo.");
    const now = new Date().toISOString();
    const id = value.id || crypto.randomUUID();
    this.run(
      `INSERT INTO agreement_groups(id,name,description,active,created_at,updated_at)
       VALUES(?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,active=excluded.active,updated_at=excluded.updated_at`,
      [
        id,
        name,
        String(value.description || "").trim() || null,
        value.active === false ? 0 : 1,
        value.created_at || now,
        now,
      ],
    );
    return id;
  }

  deleteAgreementGroup(groupId) {
    const group = this.rows("SELECT id FROM agreement_groups WHERE id = ?", [
      groupId,
    ])[0];
    if (!group) throw new Error("Acordo não encontrado.");
    this.run("DELETE FROM agreement_groups WHERE id = ?", [groupId]);
    return true;
  }

  assignAgreementClient(groupId, clientId) {
    const now = new Date().toISOString();
    this.run(
      `INSERT INTO agreement_group_clients(group_id,client_id,added_at) VALUES(?,?,?)
       ON CONFLICT(client_id) DO UPDATE SET group_id=excluded.group_id,added_at=excluded.added_at`,
      [groupId, clientId, now],
    );
    return true;
  }

  removeAgreementClient(groupId, clientId) {
    this.run(
      "DELETE FROM agreement_group_clients WHERE group_id = ? AND client_id = ?",
      [groupId, clientId],
    );
    return true;
  }

  saveAgreementPrice(groupId, productCode, price) {
    const normalizedCode = String(productCode || "").trim();
    const numericPrice = Number(price);
    if (!normalizedCode || !Number.isFinite(numericPrice) || numericPrice <= 0) {
      throw new Error("Informe um produto e um preço válido.");
    }
    this.run(
      `INSERT INTO agreement_prices(group_id,product_code,price,updated_at) VALUES(?,?,?,?)
       ON CONFLICT(group_id,product_code) DO UPDATE SET price=excluded.price,updated_at=excluded.updated_at`,
      [groupId, normalizedCode, numericPrice, new Date().toISOString()],
    );
    return true;
  }

  deleteAgreementPrice(groupId, productCode) {
    this.run(
      "DELETE FROM agreement_prices WHERE group_id = ? AND product_code = ?",
      [groupId, productCode],
    );
    return true;
  }

  importAgreementPrices(groupId, rows, fileName) {
    const group = this.rows("SELECT id FROM agreement_groups WHERE id = ?", [groupId])[0];
    if (!group) throw new Error("Acordo não encontrado.");
    const normalized = new Map();
    let ignored = 0;
    for (const row of rows) {
      const code = String(row.code || "").trim();
      const price = Number(row.price);
      if (!code || !Number.isFinite(price) || price <= 0) { ignored += 1; continue; }
      normalized.set(code, price);
    }
    if (normalized.size === 0) throw new Error("A planilha não contém códigos e preços válidos.");

    const now = new Date().toISOString();
    this.db.run("BEGIN");
    try {
      this.db.run("DELETE FROM agreement_prices WHERE group_id = ?", [groupId]);
      const statement = this.db.prepare(
        "INSERT INTO agreement_prices(group_id,product_code,price,updated_at) VALUES(?,?,?,?)",
      );
      for (const [code, price] of normalized) statement.run([groupId, code, price, now]);
      statement.free();
      this.db.run(
        "UPDATE agreement_groups SET price_table_name = ?, price_table_imported_at = ?, updated_at = ? WHERE id = ?",
        [String(fileName || "Planilha"), now, now, groupId],
      );
      this.db.run("COMMIT");
      this.persist();
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
    const known = Number(this.rows(
      `SELECT COUNT(*) AS total FROM agreement_prices price JOIN products product ON product.code=price.product_code WHERE price.group_id=?`,
      [groupId],
    )[0]?.total || 0);
    return { imported: normalized.size, ignored, matchedProducts: known };
  }

  saveClient(value) {
    const now = new Date().toISOString();
    const id = value.id || crypto.randomUUID();
    this.run(
      `INSERT INTO clients (id,code,name,document,city,state,contact,phone,email,address,status,last_purchase,average_cycle_days,next_purchase,total_12m,notes,client_type,carteira,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET code=excluded.code,name=excluded.name,document=excluded.document,city=excluded.city,state=excluded.state,contact=excluded.contact,phone=excluded.phone,email=excluded.email,address=excluded.address,status=excluded.status,last_purchase=excluded.last_purchase,average_cycle_days=excluded.average_cycle_days,next_purchase=excluded.next_purchase,total_12m=excluded.total_12m,notes=excluded.notes,client_type=excluded.client_type,carteira=excluded.carteira,updated_at=excluded.updated_at`,
      [
        id,
        value.code || null,
        value.name,
        value.document || null,
        value.city || null,
        value.state || null,
        value.contact || null,
        value.phone || null,
        value.email || null,
        value.address || null,
        value.status || "active",
        value.last_purchase || null,
        value.average_cycle_days || null,
        value.next_purchase || null,
        Number(value.total_12m) || 0,
        value.notes || null,
        value.client_type || null,
        value.carteira || null,
        value.created_at || now,
        now,
      ],
    );
    return id;
  }

  saveProduct(value) {
    const now = new Date().toISOString();
    const id = value.id || crypto.randomUUID();
    this.run(
      `INSERT INTO products (id,code,description,presentation,brand,unit,price,minimum_price,pack_size,active,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code,description=excluded.description,presentation=excluded.presentation,brand=excluded.brand,unit=excluded.unit,price=excluded.price,minimum_price=excluded.minimum_price,pack_size=excluded.pack_size,active=excluded.active,updated_at=excluded.updated_at`,
      [
        id,
        value.code,
        value.description,
        value.presentation || null,
        value.brand || "Halex Istar",
        value.unit || "UN",
        Number(value.price) || 0,
        value.minimum_price || null,
        Math.max(1, Math.trunc(Number(value.pack_size) || 1)),
        value.active === false ? 0 : 1,
        now,
      ],
    );
    return id;
  }

  saveQuotation(value) {
    const now = new Date().toISOString();
    const id = value.id || crypto.randomUUID();
    this.db.run("BEGIN");
    try {
      this.db.run(
        `INSERT INTO quotations (id,quote_number,client_id,issued_at,valid_until,status,seller,representative_role,representative_phone,representative_email,sales_price_table,sales_price_region,payment_terms,delivery_terms,freight_terms,notes,total_value,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET quote_number=excluded.quote_number,client_id=excluded.client_id,issued_at=excluded.issued_at,valid_until=excluded.valid_until,status=excluded.status,seller=excluded.seller,representative_role=excluded.representative_role,representative_phone=excluded.representative_phone,representative_email=excluded.representative_email,sales_price_table=excluded.sales_price_table,sales_price_region=excluded.sales_price_region,payment_terms=excluded.payment_terms,delivery_terms=excluded.delivery_terms,freight_terms=excluded.freight_terms,notes=excluded.notes,total_value=excluded.total_value,updated_at=excluded.updated_at`,
        [
          id,
          value.quote_number,
          value.client_id,
          value.issued_at,
          value.valid_until,
          value.status || "draft",
          value.seller || null,
          value.representative_role || null,
          value.representative_phone || null,
          value.representative_email || null,
          value.sales_price_table || null,
          value.sales_price_region || null,
          value.payment_terms || null,
          value.delivery_terms || null,
          value.freight_terms || null,
          value.notes || null,
          Number(value.total_value) || 0,
          value.created_at || now,
          now,
        ],
      );
      this.db.run("DELETE FROM quotation_items WHERE quotation_id = ?", [id]);
      const item = this.db.prepare(
        `INSERT INTO quotation_items (id,quotation_id,product_id,position,code,description,presentation,brand,unit,quantity,unit_price,total_value,quantity_mode,unit_quantity) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      );
      value.items.forEach((line, index) =>
        item.run([
          crypto.randomUUID(),
          id,
          line.product_id || null,
          index + 1,
          line.code || null,
          line.description,
          line.presentation || null,
          line.brand || null,
          line.unit || "UN",
          Number(line.quantity),
          Number(line.unit_price),
          Number(line.total_value),
          line.quantity_mode === "units" ? "units" : "boxes",
          Number(line.unit_quantity) || null,
        ]),
      );
      item.free();
      this.db.run("COMMIT");
      this.persist();
      return id;
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
  }
}

module.exports = { LocalDatabase };
