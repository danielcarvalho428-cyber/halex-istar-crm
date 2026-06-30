const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron/main");
const { fork } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { LocalDatabase } = require("./database.cjs");

let mainWindow;
let nextServer;
let database;
const port = 3210;

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
    return target;
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
