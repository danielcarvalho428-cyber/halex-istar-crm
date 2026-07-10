const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  shell,
} = require("electron");
const { fork } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const crypto = require("node:crypto");

// Heavy, on-demand modules (spreadsheet parsing, email, PDF/OCR). Loading these
// at startup added multiple megabytes (tesseract.js ships WASM + language data)
// to the boot path even though they're only touched by import/email/DANFE
// actions. Load them lazily — Node caches the module, so repeat calls are free.
let _xlsx = null;
const loadXlsx = () => (_xlsx ??= require("xlsx"));
const { LocalDatabase } = require("./database.cjs");
const defaultReferenceData = require("./defaults/reference-data.json");
const { normalizeHeader, field, numberValue, productRows, salesPriceTableFromSheets } = require("./product-import.cjs");
const { parseNfePdfIdentity } = require("./nfe-document.cjs");

let mainWindow;
let nextServer;
let database;
const billingAttachments = new Map();
const preferredPort = 3210;
let updateCheckTimer;

// --- Visible data folder --------------------------------------------------
// The live SQLite database stays in userData (protected from accidental
// deletion). This browsable folder — on the Desktop by default — holds copies
// the user may want to open directly: generated quotation PDFs, an up-to-date
// clients spreadsheet, and automatic dated backups. Deleting this folder never
// costs data; the database and its backups remain intact.
function documentsRoot() {
  const custom = database.getSetting("documents_folder");
  return custom && custom.trim()
    ? custom
    : path.join(app.getPath("desktop"), "Halex Istar CRM");
}
function documentsSub(name) {
  return path.join(documentsRoot(), name);
}
function ensureDocumentsFolders() {
  for (const sub of ["Cotações", "Clientes", "Backups"]) {
    fs.mkdirSync(documentsSub(sub), { recursive: true });
  }
}
function sanitizeFileName(value) {
  // Drop characters Windows forbids in filenames; keep spaces and hyphens.
  return String(value || "")
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function exportClientsSpreadsheet() {
  try {
    ensureDocumentsFolders();
    const XLSX = loadXlsx();
    const rows = database.listClients().map((c) => ({
      "Código": c.code || "",
      "Cliente": c.name || "",
      "CNPJ/CPF": c.document || "",
      "Cidade": c.city || "",
      "UF": c.state || "",
      "Contato": c.contact || "",
      "Telefone": c.phone || "",
      "E-mail": c.email || "",
      "Última compra": c.last_purchase || "",
      "Ciclo (dias)": c.average_cycle_days || "",
      "Próxima compra": c.next_purchase || "",
      "Total 12 meses": Number(c.total_12m || 0),
      "Carteira": c.carteira || "",
      "Tipo": c.client_type || "",
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Clientes");
    XLSX.writeFile(book, path.join(documentsSub("Clientes"), "Clientes.xlsx"));
  } catch (error) {
    console.error("Falha ao exportar planilha de clientes:", error);
  }
}
function runDailyBackup() {
  try {
    ensureDocumentsFolders();
    const dir = documentsSub("Backups");
    const today = new Date().toISOString().slice(0, 10);
    const target = path.join(dir, `halex-istar-${today}.sqlite`);
    if (!fs.existsSync(target)) fs.copyFileSync(database.filePath, target);
    // Keep the 14 most recent daily backups.
    const backups = fs
      .readdirSync(dir)
      .filter((f) => /^halex-istar-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f))
      .sort();
    for (const old of backups.slice(0, Math.max(0, backups.length - 14))) {
      fs.rmSync(path.join(dir, old), { force: true });
    }
  } catch (error) {
    console.error("Falha ao criar backup automático:", error);
  }
}

function installDefaultLetterhead() {
  if (database.getSetting("letterhead_path")) return;
  const source = path.join(__dirname, "defaults", "letterhead.png");
  if (!fs.existsSync(source)) return;
  const target = path.join(app.getPath("userData"), "letterhead.png");
  fs.copyFileSync(source, target);
  database.setSetting("letterhead_path", target);
}

function configureAutoUpdates() {
  // Electron's macOS updater requires a code-signed application. Until the
  // Mac build is signed, users install new DMGs manually.
  if (!app.isPackaged || process.platform === "darwin") return;
  // Loaded lazily (and only in a packaged build): requiring electron-updater
  // eagerly at module load instantiates the updater before the app is ready.
  const { autoUpdater } = require("electron-updater");
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", async (info) => {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Atualização disponível",
      message: `A versão ${info.version} do Halex Istar CRM está disponível.`,
      detail: "Seus dados locais serão preservados durante a atualização.",
      buttons: ["Baixar atualização", "Depois"],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice.response === 0) await autoUpdater.downloadUpdate();
  });

  autoUpdater.on("update-downloaded", async (info) => {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Atualização pronta",
      message: `A versão ${info.version} foi baixada.`,
      detail: "O aplicativo será fechado, atualizado e aberto novamente.",
      buttons: ["Instalar agora", "Ao fechar o aplicativo"],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice.response === 0) autoUpdater.quitAndInstall(false, true);
  });

  autoUpdater.on("error", (error) => console.error("Auto-update error:", error));
  const check = () => autoUpdater.checkForUpdates().catch((error) => console.error("Update check failed:", error));
  setTimeout(check, 8000);
  updateCheckTimer = setInterval(check, 6 * 60 * 60 * 1000);
}

function dateValue(value) {
  if (!value) return null;
  if (typeof value === "number") return loadXlsx().SSF.format("yyyy-mm-dd", value);
  const text = String(value).trim();
  const br = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (br)
    return `${br[3].length === 2 ? `20${br[3]}` : br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}
function spreadsheetRows(filePath) {
  const workbook = loadXlsx().readFile(filePath, { cellDates: false });
  return workbook.SheetNames.flatMap((name) =>
    loadXlsx().utils.sheet_to_json(workbook.Sheets[name], { defval: "", raw: true }),
  );
}
function spreadsheetSheets(filePath) {
  const workbook = loadXlsx().readFile(filePath, { cellDates: false });
  return workbook.SheetNames.map((name) => ({
    name,
    rows: loadXlsx().utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      defval: "",
      raw: true,
    }),
  }));
}
function clientRows(rows) {
  return rows.map((row) => {
    const rawClientType = normalizeHeader(
      field(row, ["tipocliente", "tipo", "categoria"]) || "",
    );
    const clientType = rawClientType.includes("distrib")
      ? "distribuidor"
      : rawClientType.includes("hospital")
        ? "hospital"
        : rawClientType.includes("particular")
          ? "particular"
          : null;
    return {
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
    carteira: String(
      field(row, ["carteira", "grupo", "equipe", "regional", "regiao"]) || "",
    ).trim(),
    client_type: clientType,
  };
  });
}

function nextDirectory() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "next")
    : path.join(__dirname, "..");
}

function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const tryPort = (candidate) => {
      const server = net.createServer();
      server.once("error", (error) => {
        if (error.code === "EADDRINUSE") {
          tryPort(candidate + 1);
          return;
        }
        reject(error);
      });
      server.once("listening", () => {
        server.close(() => resolve(candidate));
      });
      server.listen(candidate, "127.0.0.1");
    };
    tryPort(startPort);
  });
}

async function startNextServer() {
  if (!app.isPackaged)
    return Promise.resolve(
      process.env.ELECTRON_START_URL || "http://localhost:3001",
    );
  const directory = nextDirectory();
  const port = await findAvailablePort(preferredPort);
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

function readEmailConfig() {
  const value = JSON.parse(database.getSetting("email_config") || "{}");
  if (!value.email || !value.encryptedAppPassword) {
    throw new Error("Configure a conta Gmail e a senha de aplicativo.");
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("A criptografia segura do sistema não está disponível.");
  }
  return {
    ...value,
    appPassword: safeStorage.decryptString(
      Buffer.from(value.encryptedAppPassword, "base64"),
    ),
  };
}

function gmailTransport() {
  const nodemailer = require("nodemailer");
  const config = readEmailConfig();
  return {
    config,
    transport: nodemailer.createTransport({
      service: "gmail",
      auth: { user: config.email, pass: config.appPassword },
      disableFileAccess: true,
      disableUrlAccess: true,
    }),
  };
}

function html(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function emailHistory() {
  try {
    const history = JSON.parse(database.getSetting("billing_email_history") || "[]");
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function registerIpc() {
  ipcMain.handle("db:clients:list", () => database.listClients());
  ipcMain.handle("db:clients:get", (_event, id) => database.getClient(id));
  ipcMain.handle("db:clients:delete", (_event, id) => {
    const result = database.deleteClient(id);
    exportClientsSpreadsheet();
    return result;
  });
  ipcMain.handle("db:clients:save", (_event, value) => {
    const result = database.saveClient(value);
    exportClientsSpreadsheet();
    return result;
  });
  ipcMain.handle("db:products:list", () => database.listProducts());
  ipcMain.handle("db:products:save", (_event, value) =>
    database.saveProduct(value),
  );
  ipcMain.handle("db:quotations:list", () => database.listQuotations());
  ipcMain.handle("db:quotations:get", (_event, id) => database.getQuotation(id));
  ipcMain.handle("db:quotations:delete", (_event, id) => database.deleteQuotation(id));
  ipcMain.handle("db:quotations:save", (_event, value) =>
    database.saveQuotation(value),
  );
  ipcMain.handle("agreements:list", () => database.listAgreementGroups());
  ipcMain.handle("agreements:save", (_event, value) =>
    database.saveAgreementGroup(value),
  );
  ipcMain.handle("agreements:delete", (_event, groupId) =>
    database.deleteAgreementGroup(groupId),
  );
  ipcMain.handle("agreements:client:add", (_event, groupId, clientId) =>
    database.assignAgreementClient(groupId, clientId),
  );
  ipcMain.handle("agreements:client:remove", (_event, groupId, clientId) =>
    database.removeAgreementClient(groupId, clientId),
  );
  ipcMain.handle("agreements:price:save", (_event, groupId, productCode, price) =>
    database.saveAgreementPrice(groupId, productCode, price),
  );
  ipcMain.handle("agreements:price:delete", (_event, groupId, productCode) =>
    database.deleteAgreementPrice(groupId, productCode),
  );
  ipcMain.handle("agreements:prices:import", async (_event, groupId) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [{ name: "Planilha de preços", extensions: ["xlsx", "xls", "csv"] }],
    });
    if (result.canceled) return null;
    const filePath = result.filePaths[0];
    return {
      fileName: path.basename(filePath),
      ...database.importAgreementPrices(
        groupId,
        productRows(spreadsheetRows(filePath)),
        path.basename(filePath),
      ),
    };
  });
  ipcMain.handle("import:products", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [{ name: "Planilha", extensions: ["xlsx", "xls", "csv"] }],
    });
    if (result.canceled) return null;
    const filePath = result.filePaths[0];
    const fileName = path.basename(filePath);
    const salesTable = salesPriceTableFromSheets(
      spreadsheetSheets(filePath),
      fileName,
    );
    if (salesTable) {
      return {
        fileName,
        kind: "sales-price-table",
        ...database.importSalesPriceTable(salesTable),
      };
    }
    return {
      fileName,
      kind: "catalog",
      ...database.importPriceTable(
        productRows(spreadsheetRows(filePath)),
        fileName,
      ),
    };
  });
  ipcMain.handle("sales-prices:active", () => database.getSalesPriceTable());
  ipcMain.handle("updates:check", async () => {
    const currentVersion = app.getVersion();
    if (!app.isPackaged || process.platform === "darwin") {
      return { currentVersion, latestVersion: currentVersion, available: false };
    }
    const { autoUpdater } = require("electron-updater");
    const result = await autoUpdater.checkForUpdates();
    const latestVersion = result?.updateInfo?.version || currentVersion;
    return {
      currentVersion,
      latestVersion,
      available: latestVersion !== currentVersion,
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
  ipcMain.handle("prices:delete", (_event, versionId) =>
    database.deletePriceVersion(versionId),
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
  ipcMain.handle("settings:email:get", () => {
    const stored = database.getSetting("email_config");
    if (!stored) return null;
    const value = JSON.parse(stored);
    return {
      email: value.email || "",
      senderName: value.senderName || "",
      signatureName: value.signatureName || "",
      signatureRole: value.signatureRole || "",
      phone: value.phone || "",
      logoFiles: Array.isArray(value.logoFiles) ? value.logoFiles : [],
      hasAppPassword: Boolean(value.encryptedAppPassword),
    };
  });
  ipcMain.handle("settings:email:save", (_event, input) => {
    const email = String(input?.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@gmail\.com$/i.test(email)) {
      throw new Error("Informe uma conta Gmail válida.");
    }
    const current = JSON.parse(database.getSetting("email_config") || "{}");
    const password = String(input?.appPassword || "").replace(/\s/g, "");
    let encryptedAppPassword = current.encryptedAppPassword || "";
    if (password) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("A criptografia segura do sistema não está disponível.");
      }
      encryptedAppPassword = safeStorage
        .encryptString(password)
        .toString("base64");
    }
    database.setSetting(
      "email_config",
      JSON.stringify({
        email,
        senderName: String(input?.senderName || "").trim(),
        signatureName: String(input?.signatureName || "").trim(),
        signatureRole: String(input?.signatureRole || "").trim(),
        phone: String(input?.phone || "").trim(),
        logoFiles: Array.isArray(current.logoFiles) ? current.logoFiles : [],
        encryptedAppPassword,
      }),
    );
    return true;
  });
  ipcMain.handle("settings:email:logos", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Logotipos PNG", extensions: ["png"] }],
    });
    if (result.canceled) return null;
    const directory = path.join(app.getPath("userData"), "email-signature");
    fs.mkdirSync(directory, { recursive: true });
    const logoFiles = result.filePaths.slice(0, 3).map((source, index) => {
      const target = path.join(directory, `logo-${index + 1}.png`);
      fs.copyFileSync(source, target);
      return { fileName: path.basename(source), path: target };
    });
    const current = JSON.parse(database.getSetting("email_config") || "{}");
    database.setSetting(
      "email_config",
      JSON.stringify({ ...current, logoFiles }),
    );
    return logoFiles.map((logo) => logo.fileName);
  });
  ipcMain.handle("settings:email:test", async () => {
    const { transport } = gmailTransport();
    await transport.verify();
    transport.close();
    return true;
  });
  ipcMain.handle("billing:danfes:choose", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "DANFE em PDF", extensions: ["pdf"] }],
    });
    if (result.canceled) return [];
    const documents = [];
    for (const filePath of result.filePaths.slice(0, 100)) {
      const fileName = path.basename(filePath);
      const size = fs.statSync(filePath).size;
      try {
        const { PDFParse } = require("pdf-parse");
        const parser = new PDFParse({ data: fs.readFileSync(filePath) });
        const parsed = await parser.getText();
        await parser.destroy();
        const resultIdentity = parseNfePdfIdentity(fileName, parsed.text);
        const token = crypto.randomUUID();
        billingAttachments.set(token, { filePath, fileName, size });
        documents.push({
          token,
          fileName,
          size,
          invoiceNumber: resultIdentity.identity?.invoiceNumber || "",
          customerOrderNumber: resultIdentity.identity?.customerOrderNumber || "",
          accessKey: resultIdentity.identity?.accessKey || "",
          issues: resultIdentity.issues,
        });
      } catch (error) {
        documents.push({
          token: "",
          fileName,
          size,
          invoiceNumber: "",
          customerOrderNumber: "",
          accessKey: "",
          issues: [error instanceof Error ? error.message : "Não foi possível ler o PDF."],
        });
      }
    }
    return documents;
  });
  ipcMain.handle("billing:report:pdf", async (_event, input) => {
    const data = Buffer.from(input || []);
    if (!data.length || data.length > 30 * 1024 * 1024) {
      throw new Error("O relatório PDF deve ter no máximo 30 MB.");
    }
    const { PDFParse } = require("pdf-parse");
    const parser = new PDFParse({ data });
    let worker;
    try {
      const extracted = await parser.getText();
      if (/Ordem de venda\s+\d+/i.test(extracted.text)) return extracted.text;
      const screenshots = await parser.getScreenshot({
        desiredWidth: 1800,
        imageBuffer: true,
        imageDataUrl: false,
      });
      if (screenshots.pages.length > 20) throw new Error("O relatório possui mais de 20 páginas.");
      const { createWorker } = require("tesseract.js");
      const portugueseOcr = require("@tesseract.js-data/por");
      worker = await createWorker("por", 1, {
        langPath: portugueseOcr.langPath,
        gzip: portugueseOcr.gzip,
      });
      const pages = [];
      for (const page of screenshots.pages) {
        const recognized = await worker.recognize(page.data);
        pages.push(recognized.data.text);
      }
      return pages.join("\n");
    } finally {
      if (worker) await worker.terminate();
      await parser.destroy();
    }
  });
  ipcMain.handle("billing:email:history", () => emailHistory());
  ipcMain.handle("billing:email:send", async (_event, input) => {
    const to = String(input?.to || "").trim().toLowerCase();
    const subject = String(input?.subject || "").trim();
    const body = String(input?.body || "").trim();
    const tokens = Array.isArray(input?.attachmentTokens)
      ? [...new Set(input.attachmentTokens.map(String))].slice(0, 10)
      : [];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("Informe um e-mail de destino válido.");
    if (!subject || subject.length > 180) throw new Error("Revise o assunto do e-mail.");
    if (!body || body.length > 20_000) throw new Error("Revise a mensagem do e-mail.");
    const files = tokens.map((token) => billingAttachments.get(token)).filter(Boolean);
    if (files.length === 0) throw new Error("Anexe ao menos um DANFE válido.");
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > 22 * 1024 * 1024) throw new Error("Os anexos excedem 22 MB. Divida o envio.");

    const { config, transport } = gmailTransport();
    const logoAttachments = (Array.isArray(config.logoFiles) ? config.logoFiles : [])
      .filter((logo) => logo?.path && fs.existsSync(logo.path))
      .slice(0, 3)
      .map((logo, index) => ({ filename: logo.fileName, path: logo.path, cid: `signature-logo-${index}@halex` }));
    const signature = [
      config.signatureName && `<strong>${html(config.signatureName)}</strong>`,
      config.signatureRole && html(config.signatureRole),
      config.phone && html(config.phone),
    ].filter(Boolean).join("<br>");
    const logos = logoAttachments.map((logo) => `<img src="cid:${logo.cid}" alt="" style="max-height:42px;margin:10px 12px 0 0">`).join("");
    try {
      const info = await transport.sendMail({
        from: { name: config.senderName || config.signatureName || config.email, address: config.email },
        to,
        subject,
        text: `${body}\n\n${[config.signatureName, config.signatureRole, config.phone].filter(Boolean).join("\n")}`,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#1f2937">${html(body).replace(/\n/g, "<br>")}<br><br>${signature}${logos ? `<div>${logos}</div>` : ""}</div>`,
        attachments: [
          ...files.map((file) => ({ filename: file.fileName, path: file.filePath })),
          ...logoAttachments,
        ],
      });
      const record = {
        id: crypto.randomUUID(),
        sentAt: new Date().toISOString(),
        to,
        subject,
        invoiceNumbers: Array.isArray(input?.invoiceNumbers) ? input.invoiceNumbers.map(String).slice(0, 20) : [],
        attachments: files.map((file) => file.fileName),
        messageId: info.messageId || "",
        status: "sent",
      };
      database.setSetting("billing_email_history", JSON.stringify([record, ...emailHistory()].slice(0, 200)));
      return record;
    } finally {
      transport.close();
    }
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
  ipcMain.handle("document:pdf", async (_event, quoteNumber, clientName) => {
    const renderedPageCount = await mainWindow.webContents
      .executeJavaScript(
        "document.querySelectorAll('.print-document .quotation-page').length",
        true,
      )
      .catch(() => 0);
    const pageCount = Number.isFinite(Number(renderedPageCount))
      ? Math.max(1, Number(renderedPageCount))
      : 1;
    const data = await mainWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      pageRanges: pageCount === 1 ? "1" : `1-${pageCount}`,
    });
    // Auto-file the PDF into the visible Cotações folder, named by quote + client.
    ensureDocumentsFolders();
    const base =
      [sanitizeFileName(quoteNumber), sanitizeFileName(clientName)]
        .filter(Boolean)
        .join(" - ") || "cotacao";
    const target = path.join(documentsSub("Cotações"), `${base}.pdf`);
    fs.writeFileSync(target, data);
    shell.openPath(target).catch(() => {});
    return target;
  });

  ipcMain.handle("settings:documents:get", () => documentsRoot());
  ipcMain.handle("settings:documents:open", async () => {
    ensureDocumentsFolders();
    await shell.openPath(documentsRoot());
    return documentsRoot();
  });
  ipcMain.handle("settings:documents:choose", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
      title: "Escolha onde guardar a pasta Halex Istar CRM",
    });
    if (result.canceled || !result.filePaths[0]) return documentsRoot();
    const chosen = path.join(result.filePaths[0], "Halex Istar CRM");
    database.setSetting("documents_folder", chosen);
    ensureDocumentsFolders();
    runDailyBackup();
    exportClientsSpreadsheet();
    return documentsRoot();
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
    try {
      const target = new URL(event.url);
      const allowed = new URL(url);
      if (target.origin !== allowed.origin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });

  const startUrl = new URL(url);
  const targetUrl = startUrl.pathname === "/"
    ? new URL("/dashboard", startUrl).toString()
    : startUrl.toString();
  try {
    await mainWindow.loadURL(targetUrl);
    mainWindow.show();
  } catch (err) {
    console.error("Failed to load URL:", err);
    // Don't leave a permanently blank window — show a readable error instead.
    const detail = (err instanceof Error ? err.message : String(err)).replace(/</g, "&lt;");
    const errorPage = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Halex Istar CRM</title></head>`
      + `<body style="font-family:system-ui,'Segoe UI',sans-serif;background:#f4f6f8;color:#1c1917;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">`
      + `<div style="max-width:520px;padding:32px;text-align:center">`
      + `<h1 style="font-size:20px;margin:0 0 12px">Não foi possível iniciar o aplicativo</h1>`
      + `<p style="font-size:14px;color:#57534e;line-height:1.6">O servidor interno não respondeu. Feche outras instâncias do Halex Istar CRM e abra novamente. Se o problema persistir, reinicie o computador.</p>`
      + `<p style="font-size:12px;color:#a8a29e;margin-top:16px">Detalhe técnico: ${detail}</p>`
      + `</div></body></html>`;
    try {
      await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorPage)}`);
      mainWindow.show();
    } catch (fallbackErr) {
      console.error("Failed to show error page:", fallbackErr);
      mainWindow.show();
    }
  }
}

app.whenReady().then(async () => {
  database = new LocalDatabase(
    path.join(app.getPath("userData"), "halex-istar.sqlite"),
    { referenceData: defaultReferenceData },
  );
  await database.open();
  installDefaultLetterhead();
  try {
    ensureDocumentsFolders();
    runDailyBackup();
    exportClientsSpreadsheet();
  } catch (error) {
    console.error("Falha ao preparar a pasta de documentos:", error);
  }
  registerIpc();
  await createWindow();
  configureAutoUpdates();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  if (nextServer) nextServer.kill();
});
