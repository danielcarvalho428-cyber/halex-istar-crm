const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron/main");
const { fork } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("xlsx");
const { LocalDatabase } = require("./database.cjs");

let mainWindow;
let nextServer;
let database;
const port = 3210;

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}
function field(row, aliases) {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const found = entries.find(([key]) => normalizeHeader(key) === alias);
    if (found && found[1] !== "") return found[1];
  }
  return null;
}
function numberValue(value) {
  if (typeof value === "number") return value;
  const text = String(value || "")
    .trim()
    .replace(/\s/g, "");
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}
function dateValue(value) {
  if (!value) return null;
  if (typeof value === "number") return XLSX.SSF.format("yyyy-mm-dd", value);
  const text = String(value).trim();
  const br = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (br)
    return `${br[3].length === 2 ? `20${br[3]}` : br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}
function spreadsheetRows(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  return workbook.SheetNames.flatMap((name) =>
    XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: "", raw: true }),
  );
}
function productRows(rows) {
  return rows.map((row) => ({
    code: String(
      field(row, [
        "codigo",
        "codigoproduto",
        "codproduto",
        "coderpproduto",
        "sku",
      ]) || "",
    ).trim(),
    description: String(
      field(row, ["descricao", "produto", "nomedoproduto", "nomeproduto"]) ||
        "",
    ).trim(),
    presentation: String(
      field(row, ["apresentacao", "apresentacao2", "embalagem"]) || "",
    ).trim(),
    brand: String(field(row, ["marca", "fabricante"]) || "Halex Istar").trim(),
    unit: String(field(row, ["unidade", "un", "unidademedida"]) || "UN").trim(),
    price: numberValue(
      field(row, [
        "preco",
        "precotabela",
        "valorunitario",
        "valor",
        "precodevenda",
      ]),
    ),
    minimum_price: numberValue(field(row, ["precominimo", "valorminimo"])),
  }));
}
function clientRows(rows) {
  return rows.map((row) => ({
    code: String(
      field(row, ["codigo", "codigocliente", "codcliente", "coderpcliente"]) ||
        "",
    ).trim(),
    name: String(
      field(row, ["cliente", "nome", "razaosocial", "nomecliente"]) || "",
    ).trim(),
    document: String(field(row, ["cnpj", "cpf", "documento"]) || "").trim(),
    city: String(field(row, ["cidade", "municipio"]) || "").trim(),
    state: String(field(row, ["uf", "estado"]) || "")
      .trim()
      .slice(0, 2)
      .toUpperCase(),
    contact: String(field(row, ["contato", "nomecontato"]) || "").trim(),
    phone: String(
      field(row, ["telefone", "celular", "whatsapp", "fone"]) || "",
    ).trim(),
    email: String(field(row, ["email", "emailcliente"]) || "").trim(),
    address: String(field(row, ["endereco", "logradouro"]) || "").trim(),
    last_purchase: dateValue(field(row, ["ultimacompra", "dataultimacompra"])),
    average_cycle_days: numberValue(
      field(row, ["ciclomedio", "ciclodias", "mediaciclo"]),
    ),
    next_purchase: dateValue(field(row, ["proximacompra", "previsaocompra"])),
    total_12m:
      numberValue(field(row, ["total12m", "compras12meses", "valor12m"])) || 0,
    notes: String(field(row, ["observacoes", "notas"]) || "").trim(),
  }));
}

function nextDirectory() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "next")
    : path.join(__dirname, "..");
}

function startNextServer() {
  if (!app.isPackaged)
    return Promise.resolve(
      process.env.ELECTRON_START_URL || "http://localhost:3001",
    );
  const directory = nextDirectory();
  nextServer = fork(path.join(directory, "server.js"), [], {
    cwd: directory,
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      ELECTRON_RUN_AS_NODE: "1",
      HALEX_DESKTOP: "1",
      NODE_PATH: app.isPackaged
        ? path.join(process.resourcesPath, "app.asar", "node_modules")
        : process.env.NODE_PATH,
    },
    stdio: "ignore",
  });
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 20000;
    const poll = () =>
      fetch(`http://127.0.0.1:${port}/dashboard`)
        .then(() => resolve(`http://127.0.0.1:${port}/dashboard`))
        .catch((error) =>
          Date.now() > deadline ? reject(error) : setTimeout(poll, 250),
        );
    poll();
  });
}

function registerIpc() {
  ipcMain.handle("db:clients:list", () => database.listClients());
  ipcMain.handle("db:clients:save", (_event, value) =>
    database.saveClient(value),
  );
  ipcMain.handle("db:products:list", () => database.listProducts());
  ipcMain.handle("db:products:save", (_event, value) =>
    database.saveProduct(value),
  );
  ipcMain.handle("db:quotations:list", () => database.listQuotations());
  ipcMain.handle("db:quotations:save", (_event, value) =>
    database.saveQuotation(value),
  );
  ipcMain.handle("import:products", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [{ name: "Planilha", extensions: ["xlsx", "xls", "csv"] }],
    });
    if (result.canceled) return null;
    const filePath = result.filePaths[0];
    return {
      fileName: path.basename(filePath),
      ...database.importPriceTable(
        productRows(spreadsheetRows(filePath)),
        path.basename(filePath),
      ),
    };
  });
  ipcMain.handle("import:clients", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [{ name: "Planilha", extensions: ["xlsx", "xls", "csv"] }],
    });
    if (result.canceled) return null;
    const filePath = result.filePaths[0];
    return {
      fileName: path.basename(filePath),
      ...database.importClients(
        clientRows(spreadsheetRows(filePath)),
        path.basename(filePath),
      ),
    };
  });
  ipcMain.handle("prices:versions", () => database.listPriceVersions());
  ipcMain.handle("prices:activate", (_event, versionId) =>
    database.activatePriceVersion(versionId),
  );
  ipcMain.handle("settings:letterhead", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [
        { name: "Papel timbrado", extensions: ["pdf", "png", "jpg", "jpeg"] },
      ],
    });
    if (result.canceled) return null;
    const source = result.filePaths[0];
    const target = path.join(
      app.getPath("userData"),
      `letterhead${path.extname(source).toLowerCase()}`,
    );
    fs.copyFileSync(source, target);
    database.setSetting("letterhead_path", target);
    return target;
  });
  ipcMain.handle("settings:letterhead:get", () => {
    const filePath = database.getSetting("letterhead_path");
    if (!filePath || !fs.existsSync(filePath)) return null;
    const extension = path.extname(filePath).slice(1).toLowerCase();
    const mime =
      extension === "png"
        ? "image/png"
        : ["jpg", "jpeg"].includes(extension)
          ? "image/jpeg"
          : "application/pdf";
    return {
      fileName: path.basename(filePath),
      mime,
      dataUrl: mime.startsWith("image/")
        ? `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`
        : null,
    };
  });
  ipcMain.handle("backup:create", async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `halex-istar-backup-${new Date().toISOString().slice(0, 10)}.sqlite`,
      filters: [{ name: "Backup Halex Istar", extensions: ["sqlite"] }],
    });
    if (result.canceled || !result.filePath) return null;
    fs.copyFileSync(database.filePath, result.filePath);
    return result.filePath;
  });
  ipcMain.handle("backup:restore", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [{ name: "Backup Halex Istar", extensions: ["sqlite"] }],
    });
    if (result.canceled) return false;
    fs.copyFileSync(result.filePaths[0], database.filePath);
    await database.open();
    return true;
  });
  ipcMain.handle("document:pdf", async (_event, quoteNumber) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${String(quoteNumber).replace(/[^a-z0-9-]/gi, "_")}.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (result.canceled || !result.filePath) return null;
    const data = await mainWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: { top: 0.35, bottom: 0.35, left: 0.35, right: 0.35 },
    });
    fs.writeFileSync(result.filePath, data);
    return result.filePath;
  });
}

async function createWindow() {
  const url = await startNextServer();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: "#f4f6f8",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) shell.openExternal(target);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event) => {
    const target = new URL(event.url);
    const allowed = new URL(url);
    if (target.origin !== allowed.origin) event.preventDefault();
  });
  await mainWindow.loadURL(
    url.includes("/dashboard") ? url : `${url}/dashboard`,
  );
  mainWindow.show();
}

app.whenReady().then(async () => {
  database = new LocalDatabase(
    path.join(app.getPath("userData"), "halex-istar.sqlite"),
  );
  await database.open();
  registerIpc();
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  if (nextServer) nextServer.kill();
});
