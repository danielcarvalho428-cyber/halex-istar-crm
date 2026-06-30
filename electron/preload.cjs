const { contextBridge, ipcRenderer } = require("electron/renderer");

contextBridge.exposeInMainWorld("halexDesktop", {
  isDesktop: true,
  clients: {
    list: () => ipcRenderer.invoke("db:clients:list"),
    save: (value) => ipcRenderer.invoke("db:clients:save", value),
  },
  products: {
    list: () => ipcRenderer.invoke("db:products:list"),
    save: (value) => ipcRenderer.invoke("db:products:save", value),
  },
  quotations: {
    list: () => ipcRenderer.invoke("db:quotations:list"),
    save: (value) => ipcRenderer.invoke("db:quotations:save", value),
    pdf: (quoteNumber) => ipcRenderer.invoke("document:pdf", quoteNumber),
  },
  settings: {
    chooseLetterhead: () => ipcRenderer.invoke("settings:letterhead"),
    getLetterhead: () => ipcRenderer.invoke("settings:letterhead:get"),
  },
  imports: {
    products: () => ipcRenderer.invoke("import:products"),
    clients: () => ipcRenderer.invoke("import:clients"),
    priceVersions: () => ipcRenderer.invoke("prices:versions"),
    activatePriceVersion: (versionId) =>
      ipcRenderer.invoke("prices:activate", versionId),
  },
  backup: {
    create: () => ipcRenderer.invoke("backup:create"),
    restore: () => ipcRenderer.invoke("backup:restore"),
  },
});
