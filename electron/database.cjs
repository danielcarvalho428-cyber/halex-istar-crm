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
  notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
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
  description TEXT NOT NULL, presentation TEXT, unit TEXT NOT NULL,
  quantity REAL NOT NULL, unit_price REAL NOT NULL, total_value REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_clients_next_purchase ON clients(next_purchase, status);
CREATE INDEX IF NOT EXISTS idx_contacts_client ON contacts(client_id, contacted_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_client ON quotations(client_id, issued_at DESC);
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
  constructor(filePath) {
    this.filePath = filePath;
    this.db = null;
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
    this.seed();
    this.persist();
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

  saveClient(value) {
    const now = new Date().toISOString();
    const id = value.id || crypto.randomUUID();
    this.run(
      `INSERT INTO clients (id,code,name,document,city,state,contact,phone,email,address,status,last_purchase,average_cycle_days,next_purchase,total_12m,notes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET code=excluded.code,name=excluded.name,document=excluded.document,city=excluded.city,state=excluded.state,contact=excluded.contact,phone=excluded.phone,email=excluded.email,address=excluded.address,status=excluded.status,last_purchase=excluded.last_purchase,average_cycle_days=excluded.average_cycle_days,next_purchase=excluded.next_purchase,total_12m=excluded.total_12m,notes=excluded.notes,updated_at=excluded.updated_at`,
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
      `INSERT INTO products (id,code,description,presentation,brand,unit,price,minimum_price,active,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code,description=excluded.description,presentation=excluded.presentation,brand=excluded.brand,unit=excluded.unit,price=excluded.price,minimum_price=excluded.minimum_price,active=excluded.active,updated_at=excluded.updated_at`,
      [
        id,
        value.code,
        value.description,
        value.presentation || null,
        value.brand || "Halex Istar",
        value.unit || "UN",
        Number(value.price) || 0,
        value.minimum_price || null,
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
        `INSERT INTO quotations (id,quote_number,client_id,issued_at,valid_until,status,seller,payment_terms,delivery_terms,freight_terms,notes,total_value,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET quote_number=excluded.quote_number,client_id=excluded.client_id,issued_at=excluded.issued_at,valid_until=excluded.valid_until,status=excluded.status,seller=excluded.seller,payment_terms=excluded.payment_terms,delivery_terms=excluded.delivery_terms,freight_terms=excluded.freight_terms,notes=excluded.notes,total_value=excluded.total_value,updated_at=excluded.updated_at`,
        [
          id,
          value.quote_number,
          value.client_id,
          value.issued_at,
          value.valid_until,
          value.status || "draft",
          value.seller || null,
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
        `INSERT INTO quotation_items (id,quotation_id,product_id,position,code,description,presentation,unit,quantity,unit_price,total_value) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
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
          line.unit || "UN",
          Number(line.quantity),
          Number(line.unit_price),
          Number(line.total_value),
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
