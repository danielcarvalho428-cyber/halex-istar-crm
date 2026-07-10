const { contextBridge, ipcRenderer } = require("electron/renderer");

contextBridge.exposeInMainWorld("halexDesktop", {
  isDesktop: true,
  clients: {
    list: () => ipcRenderer.invoke("db:clients:list"),
    get: (id) => ipcRenderer.invoke("db:clients:get", id),
    delete: (id) => ipcRenderer.invoke("db:clients:delete", id),
    save: (value) => ipcRenderer.invoke("db:clients:save", value),
  },
  products: {
    list: () => ipcRenderer.invoke("db:products:list"),
    save: (value) => ipcRenderer.invoke("db:products:save", value),
  },
  quotations: {
    list: () => ipcRenderer.invoke("db:quotations:list"),
    get: (id) => ipcRenderer.invoke("db:quotations:get", id),
    delete: (id) => ipcRenderer.invoke("db:quotations:delete", id),
    save: (value) => ipcRenderer.invoke("db:quotations:save", value),
    pdf: (quoteNumber, clientName) =>
      ipcRenderer.invoke("document:pdf", quoteNumber, clientName),
  },
  agreements: {
    list: () => ipcRenderer.invoke("agreements:list"),
    save: (value) => ipcRenderer.invoke("agreements:save", value),
    delete: (groupId) => ipcRenderer.invoke("agreements:delete", groupId),
    addClient: (groupId, clientId) =>
      ipcRenderer.invoke("agreements:client:add", groupId, clientId),
    removeClient: (groupId, clientId) =>
      ipcRenderer.invoke("agreements:client:remove", groupId, clientId),
    savePrice: (groupId, productCode, price) =>
      ipcRenderer.invoke("agreements:price:save", groupId, productCode, price),
    deletePrice: (groupId, productCode) =>
      ipcRenderer.invoke("agreements:price:delete", groupId, productCode),
    importPrices: (groupId) =>
      ipcRenderer.invoke("agreements:prices:import", groupId),
  },
  settings: {
    chooseLetterhead: () => ipcRenderer.invoke("settings:letterhead"),
    getLetterhead: () => ipcRenderer.invoke("settings:letterhead:get"),
    getEmail: () => ipcRenderer.invoke("settings:email:get"),
    saveEmail: (value) => ipcRenderer.invoke("settings:email:save", value),
    chooseEmailLogos: () => ipcRenderer.invoke("settings:email:logos"),
    testEmail: () => ipcRenderer.invoke("settings:email:test"),
    getDataFolder: () => ipcRenderer.invoke("settings:documents:get"),
    openDataFolder: () => ipcRenderer.invoke("settings:documents:open"),
    chooseDataFolder: () => ipcRenderer.invoke("settings:documents:choose"),
  },
  billing: {
    parseReportPdf: (data) => ipcRenderer.invoke("billing:report:pdf", data),
    chooseDanfes: () => ipcRenderer.invoke("billing:danfes:choose"),
    sendEmail: (value) => ipcRenderer.invoke("billing:email:send", value),
    emailHistory: () => ipcRenderer.invoke("billing:email:history"),
  },
  imports: {
    products: () => ipcRenderer.invoke("import:products"),
    clients: () => ipcRenderer.invoke("import:clients"),
    priceVersions: () => ipcRenderer.invoke("prices:versions"),
    activatePriceVersion: (versionId) =>
      ipcRenderer.invoke("prices:activate", versionId),
    deletePriceVersion: (versionId) =>
      ipcRenderer.invoke("prices:delete", versionId),
    activeSalesPriceTable: () => ipcRenderer.invoke("sales-prices:active"),
  },
  updates: {
    check: () => ipcRenderer.invoke("updates:check"),
  },
  backup: {
    create: () => ipcRenderer.invoke("backup:create"),
    restore: () => ipcRenderer.invoke("backup:restore"),
  },
});
