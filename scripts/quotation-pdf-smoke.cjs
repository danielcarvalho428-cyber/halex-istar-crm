const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const targetUrl = process.env.QUOTATION_SMOKE_URL || "http://127.0.0.1:3007/dashboard/cotacoes/nova";

function pdfPageCount(data) {
  return (data.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
}

async function waitFor(webContents, expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await webContents.executeJavaScript(expression, true);
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const snapshot = await webContents.executeJavaScript(
    "({ url: location.href, title: document.title, readyState: document.readyState, html: document.documentElement?.outerHTML?.slice(0, 1600) || '', text: document.body?.innerText?.slice(0, 1200) || '' })",
    true,
  ).catch(() => null);
  throw new Error(`Timed out waiting for ${expression}\n${JSON.stringify(snapshot, null, 2)}`);
}

async function run() {
  const window = new BrowserWindow({
    show: false,
    width: 1440,
    height: 920,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error(`renderer load failed ${code} ${description}: ${url}`);
  });

  await window.loadURL(targetUrl);
  await waitFor(window.webContents, "document.querySelectorAll('button[title=\"Adicionar produto\"]').length");
  await window.webContents.executeJavaScript(
    "document.querySelector('button[title=\"Adicionar produto\"]').click()",
    true,
  );
  await waitFor(window.webContents, "document.querySelectorAll('.print-document .quotation-page').length === 1");

  const rendered = await window.webContents.executeJavaScript(
    `(() => {
      const root = document.querySelector('.print-document');
      const text = root?.innerText || '';
      return {
        pages: document.querySelectorAll('.print-document .quotation-page').length,
        sellerCount: (text.match(/Paulo Roberto/g) || []).length,
        hasPackColumn: [...document.querySelectorAll('.print-document th')].some((item) => item.textContent?.trim() === 'Un./cx')
      };
    })()`,
    true,
  );
  if (rendered.pages !== 1) throw new Error(`Expected 1 rendered quotation page, got ${rendered.pages}`);
  if (rendered.sellerCount !== 1) throw new Error(`Expected representative name once, got ${rendered.sellerCount}`);
  if (!rendered.hasPackColumn) throw new Error("Missing Un./cx column in quotation PDF table");

  const data = await window.webContents.printToPDF({
    printBackground: true,
    pageSize: "A4",
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    pageRanges: "1",
  });
  const output = path.join(os.tmpdir(), "halex-quotation-smoke.pdf");
  fs.writeFileSync(output, data);

  const pages = pdfPageCount(data);
  if (pages !== 1) throw new Error(`Expected generated PDF to have 1 page, got ${pages}. File: ${output}`);
  console.log(`Quotation PDF smoke passed: ${pages} page, ${output}`);
}

app.whenReady()
  .then(run)
  .then(() => app.quit())
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
